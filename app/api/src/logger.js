import pino from 'pino';
import { config } from './config.js';

// Structured JSON logs (pino). Each request gets a correlation id via pino-http
// in index.js. Kept transport-free so no extra dev dependency is required.
export const logger = pino({
  level: process.env.LOG_LEVEL || (config.env === 'production' ? 'info' : 'debug'),
  base: { service: 'jubilujah-api' },
  // Keep secrets out of request/response logs: bearer service tokens and session
  // cookies must never be written to disk.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
});
