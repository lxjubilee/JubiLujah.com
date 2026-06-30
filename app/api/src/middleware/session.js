import { verifyAccessToken } from '../auth/session.js';

// Attaches req.auth = { user, roles } from a stateless access JWT presented as
// `Authorization: Bearer <jwt>`. Verification is signature + iss/aud/exp only —
// no cookie, no DB hit (see auth/session.js#verifyAccessToken). Non-fatal:
// unauthenticated / invalid-token requests get req.auth = null.
export async function attachSession(req, res, next) {
  req.auth = null;
  const authz = req.get('authorization');
  const bearer = authz?.startsWith('Bearer ') ? authz.slice(7).trim() : null;
  if (!bearer) return next();
  req.auth = await verifyAccessToken(bearer);
  next();
}
