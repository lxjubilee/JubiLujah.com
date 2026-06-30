import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

// ============================================================================
// Service-to-service JWTs (HS256). Replaces the old static shared bearer token.
// A trusted partner exchanges client_id+client_secret at /api/auth/service/token
// for a short-lived signed JWT, then presents it as `Authorization: Bearer <jwt>`
// on /api/auth/admin/*. The same symmetric secret signs (issuance) and verifies
// (admin routes), so issuance and verification must run with the same config.
// ============================================================================

// jose wants the HMAC key as bytes. Derived per-call so a hot-reloaded secret
// (config is read from the module-level object) is always honored.
function secretKey() {
  return new TextEncoder().encode(config.service.jwtSecret);
}

// Constant-time secret compare that never leaks length: both sides are SHA-256'd
// to a fixed 32 bytes before timingSafeEqual (mirrors the old matchToken).
function secretsEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Resolve + authenticate a client by credentials. Returns the client record
// ({ id, secret, scopes }) or null. Always runs a hash compare — even for an
// unknown client_id — so timing doesn't reveal whether the id exists.
export function authenticateClient(clientId, clientSecret) {
  if (!clientId || !clientSecret) return null;
  const client = config.service.clients.find((c) => c.id === clientId);
  if (!client) {
    secretsEqual(clientSecret, 'unknown-client-dummy-secret');
    return null;
  }
  return secretsEqual(clientSecret, client.secret) ? client : null;
}

// Mint a short-lived HS256 access token for an authenticated client. `scopes` is
// the (already authorized) scope array to embed. Throws if signing is unconfigured.
export async function issueServiceToken({ clientId, scopes }) {
  if (!config.service.jwtSecret) {
    const err = new Error('service token signing is not configured');
    err.code = 'SERVICE_JWT_UNCONFIGURED';
    throw err;
  }
  const ttl = config.service.tokenTtlSec;
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ scope: (scopes || []).join(' ') })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(clientId)
    .setIssuer(config.service.issuer)
    .setAudience(config.service.audience)
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(`${ttl}s`)
    .sign(secretKey());
  return { token, expiresIn: ttl, jti };
}

// Verify a presented Bearer JWT. Enforces HS256, issuer, audience and (via jose)
// exp/nbf. Throws on any failure — callers map that to 401. Fails closed when no
// secret is configured.
export async function verifyServiceToken(token) {
  if (!config.service.jwtSecret) {
    const err = new Error('service token verification is not configured');
    err.code = 'SERVICE_JWT_UNCONFIGURED';
    throw err;
  }
  const { payload } = await jwtVerify(token, secretKey(), {
    algorithms: ['HS256'],
    issuer: config.service.issuer,
    audience: config.service.audience,
  });
  return payload;
}
