import crypto from 'node:crypto';
import { decodeJwt } from 'jose';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { HttpError } from './rbac.js';
import { verifyServiceToken } from '../auth/serviceToken.js';

// ============================================================================
// Auth gate for server-to-server routes. Callers present a short-lived **HS256
// JWT** (obtained from /api/auth/service/token via client-credentials, signed
// with SERVICE_JWT_SECRET) as `Authorization: Bearer`. Used by /api/auth/admin/*
// (e.g. cross-platform password sync from JubileeInspire). This is a separate
// secret/audience from the user access JWTs, but the same Bearer model — there
// are no cookies anywhere in the API.
// ============================================================================

// Order mirrors the set-password contract: HTTPS -> token (401) -> IP (403).
// Fails closed: when no signing secret is configured, verifyServiceToken throws
// and every call is 401. Async because JWT verification is async; we always
// resolve via next()/next(err) so Express handles errors uniformly.
export async function requireServiceAuth(req, res, next) {
  try {
    // (1) TLS. Reject only if a trusted proxy explicitly marked this plaintext
    //     http. An absent header (direct loopback) is allowed so health/local
    //     testing works; real traffic always carries x-forwarded-proto=https.
    const xfp = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    if (xfp && xfp !== 'https') {
      return next(new HttpError(403, 'HTTPS is required for this endpoint.'));
    }

    // (2) Bearer JWT (signature + iss + aud + exp).
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!m) return next(new HttpError(401, 'Invalid or missing service token.'));
    let payload;
    try {
      payload = await verifyServiceToken(m[1].trim());
    } catch (err) {
      logger.warn({ reason: err.code || err.message }, 'service JWT rejected');
      return next(new HttpError(401, 'Invalid or missing service token.'));
    }
    req.serviceCaller = {
      clientId: payload.sub || null,
      jti: payload.jti || null,
      scope: payload.scope || '',
    };

    // (3) Optional IP allow-list (defense in depth). Empty list => token-only.
    const allow = config.service.allowIps;
    if (allow.length && !allow.includes(req.ip)) {
      return next(new HttpError(403, 'Caller IP is not allow-listed.'));
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Per-route scope enforcement. Pass when the token carries the wildcard "*" or
// the exact required scope; otherwise 403. Use after requireServiceAuth.
export function requireServiceScope(required) {
  return (req, res, next) => {
    const granted = String(req.serviceCaller?.scope || '').split(/\s+/).filter(Boolean);
    if (granted.includes('*') || granted.includes(required)) return next();
    next(new HttpError(403, `Token is missing required scope: ${required}`));
  };
}

// Rate-limit key for service routes. req.ip is unreliable behind a CDN/proxy
// chain, so we bucket by stable client identity instead:
//   - admin calls (Bearer JWT): the token's `sub` (client id), decoded WITHOUT
//     verifying — a bucket key need not be trusted; a forged sub just shares a
//     bucket. Falls back to a hash of the raw token if it can't be decoded.
//   - token-issue calls (client_id in body): that client_id.
//   - otherwise: the ip.
export function serviceRateKey(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (m) {
    try {
      const { sub } = decodeJwt(m[1].trim());
      if (sub) return 'svc:' + sub;
    } catch { /* not a decodable JWT — fall through to a hash bucket */ }
    return 'svc:' + crypto.createHash('sha256').update(m[1]).digest('hex').slice(0, 16);
  }
  const cid = req.body && typeof req.body.client_id === 'string' ? req.body.client_id.trim() : '';
  return cid ? 'svc-token:' + cid : req.ip;
}
