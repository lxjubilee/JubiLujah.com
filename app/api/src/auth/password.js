import crypto from 'node:crypto';

// Scrypt password hashing (built-in, no native deps). Format:
//   scrypt:<saltHex>:<derivedKeyHex>
const KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, KEYLEN);
  return `scrypt:${salt.toString('hex')}:${dk.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const dk = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
}
