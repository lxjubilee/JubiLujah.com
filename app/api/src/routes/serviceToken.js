import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { HttpError } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { authenticateClient, issueServiceToken } from '../auth/serviceToken.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

// ============================================================================
// OAuth2-style client-credentials token endpoint (mounted at
// /api/auth/service/token). A trusted partner exchanges client_id + client_secret
// for a short-lived HS256 JWT, then uses it as a Bearer token on /api/auth/admin/*.
// No cookie/user session. See AUTH_API.md.
// ============================================================================

const router = Router();

// Accept JSON. `grant_type` is optional but, if present, must be the only one we
// support. `scope` (optional, space-delimited) narrows the issued token to a
// subset of what the client is granted.
const tokenSchema = z.object({
  grant_type: z.literal('client_credentials').optional(),
  client_id: z.string().trim().min(1).max(128),
  client_secret: z.string().min(1).max(512),
  scope: z.string().trim().max(512).optional(),
});

// POST /api/auth/service/token
router.post('/token', validate(tokenSchema), ah(async (req, res) => {
  if (!config.service.jwtSecret) {
    // Signing not configured -> issuance unavailable (fail closed, but a clear 503
    // distinct from a bad-credential 401).
    throw new HttpError(503, 'Service token issuance is not configured.');
  }

  const { client_id, client_secret, scope } = req.body;
  const client = authenticateClient(client_id, client_secret);
  if (!client) {
    logger.warn({ clientId: client_id, ip: req.ip }, 'service token denied: invalid_client');
    // OAuth2-style error body; 401 with WWW-Authenticate per RFC 6749 §5.2.
    res.set('WWW-Authenticate', 'Bearer');
    throw new HttpError(401, 'invalid_client', { error: 'invalid_client' });
  }

  // Narrow to requested scopes if asked; they must be a subset of what's granted.
  let scopes = client.scopes;
  if (scope) {
    const requested = scope.split(/\s+/).filter(Boolean);
    const ok = client.scopes.includes('*') || requested.every((s) => client.scopes.includes(s));
    if (!ok) throw new HttpError(403, 'invalid_scope', { error: 'invalid_scope' });
    scopes = requested;
  }

  const { token, expiresIn, jti } = await issueServiceToken({ clientId: client.id, scopes });
  logger.info({ clientId: client.id, jti, scopes, ip: req.ip }, 'service token issued');

  res.status(200).json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: scopes.join(' '),
  });
}));

export default router;
