import { HttpError } from './rbac.js';
import { logger } from '../logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}

// Centralized error handler. Express invokes this for thrown/next(err) errors.
// Must keep the 4-arg signature for Express to recognize it.
// eslint-disable-next-line no-unused-vars
// Map HTTP status -> stable `error` code string in the JSON body.
const ERROR_CODE = {
  400: 'error', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found',
  409: 'conflict', 422: 'unprocessable', 429: 'error', 503: 'unavailable',
};

export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: ERROR_CODE[err.status] || 'error',
      message: err.message,
      ...(err.extra || {}),
    });
  }
  // Postgres CHECK / unique violations surface as 4xx where meaningful.
  if (err.code === '23505') {
    return res.status(409).json({ error: 'conflict', message: 'Duplicate resource' });
  }
  if (err.code === '23514') {
    return res.status(422).json({ error: 'unprocessable', message: 'Constraint violation', detail: err.constraint });
  }
  logger.error({ err, reqId: req.id }, 'Unhandled error');
  res.status(500).json({ error: 'internal', message: 'Internal server error' });
}
