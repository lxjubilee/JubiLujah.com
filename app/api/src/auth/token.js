import crypto from 'node:crypto';
import { config } from '../config.js';

// ============================================================================
// User access/refresh tokens — byte-for-byte compatible with JubileeInspire's
// scheme (JI api/services/crypto.js). A token is:
//
//     base64url(JSON.stringify(payload)) + "." + base64url(HMAC_SHA256(b64, secret))
//
// i.e. a TWO-part hand-rolled token, NOT a standard 3-part JWT. The payload
// carries `type` ('access' | 'refresh'), millisecond `exp`/`iat`, and a random
// `jti`. Signed with config.token.secret (JI's shared JWT_SECRET) so the same
// token format/secret is used across the SSO ecosystem.
// ============================================================================

const secret = () => config.token.secret;
const randHex = (bytes) => crypto.randomBytes(bytes).toString('hex');

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sign(payload, type, ttlMs) {
  const expiresAt = new Date(Date.now() + ttlMs);
  const data = { ...payload, type, exp: expiresAt.getTime(), iat: Date.now(), jti: randHex(16) };
  const b64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  const token = `${b64}.${signature}`;
  return { token, hash: hashToken(token), expiresAt };
}

// Mint an access token. TTL = config.token.accessTtlMs (1h, matching JI).
export function generateAccessToken(payload) {
  return sign(payload, 'access', config.token.accessTtlMs);
}

// Mint a refresh token. `extended` selects the 1-year "keep me signed in" TTL.
export function generateRefreshToken(payload, { extended = false } = {}) {
  const ttl = extended ? config.token.extendedRefreshTtlMs : config.token.refreshTtlMs;
  return sign(payload, 'refresh', ttl);
}

// Verify a presented token: recompute the HMAC over the payload segment
// (timing-safe compare), decode, and reject once `exp` (ms) is in the past.
// Returns the decoded payload, or null on any failure. `expectedType` (when
// given) additionally requires payload.type to match.
export function verifyToken(token, expectedType) {
  try {
    if (typeof token !== 'string') return null;
    const [b64, signature] = token.split('.');
    if (!b64 || !signature) return null;
    const expected = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    if (expectedType && payload.type !== expectedType) return null;
    return payload;
  } catch {
    return null;
  }
}
