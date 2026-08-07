'use strict';
// ============================================================================
// Redirector token & alias generation / validation — software/redirector.md §3.
//
// Tokens are 12 chars from the Base58 alphabet — mixed UPPER+lower letters and
// digits, excluding the look-alikes 0/O, I/l — generated with a CSPRNG (never
// Random()), opaque (no embedded metadata), screened against a profanity/reserved
// blocklist, and unique per domain with retry on collision.
//
// OPERATOR OVERRIDE of §3.2: the spec mandates UPPERCASE-only tokens so the QR
// payload stays in dense alphanumeric mode. Per product decision these tokens are
// mixed-case, which means (a) the QR encodes in byte mode (slightly denser code —
// mitigated by the branded/dotted style + ECC), and (b) token matching is now
// CASE-SENSITIVE. Scanning preserves case exactly, so scans are unaffected; only
// a human hand-typing a mixed-case short link must match case. ALIASES remain
// uppercase (§3.5) precisely because they are the spoken/printed, hand-typed path.
// ============================================================================
import crypto from 'node:crypto';

// Base58 — 58 chars: digits + upper + lower, minus 0 O I l. Mixed case.
export const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const TOKEN_LENGTH = 12;
// Built from ALPHABET so the two can never drift. Base58 has no regex-special chars.
const TOKEN_RE = new RegExp(`^[${ALPHABET}]{${TOKEN_LENGTH}}$`);
// §3.5 — aliases stay UPPERCASE: 4-20 of A-Z/0-9/hyphen, no leading/trailing hyphen.
const ALIAS_RE = /^[A-Z0-9](?:[A-Z0-9-]{2,18}[A-Z0-9])$/;

// §3.4 — reserved paths never issued as tokens/aliases, plus a profanity/reserved
// blocklist (EN + RO), checked as a case-insensitive SUBSTRING match. Extend as
// needed; this is deliberately conservative rather than exhaustive.
const RESERVED = ['ADMIN', 'LOGIN', 'HEALTH', 'ROBOTS', 'SITEMAP', 'API', 'QR', 'RP'];
const PROFANITY = [
  // English
  'FUCK', 'SHIT', 'CUNT', 'BITCH', 'ASSHOLE', 'BASTARD', 'DICK', 'PISS', 'SLUT', 'WHORE', 'NIGG', 'RAPE', 'PORN', 'SEX', 'NAZI',
  // Romanian
  'PULA', 'PIZDA', 'MUIE', 'CACAT', 'FUTU', 'CUR', 'PISAT', 'BULAN', 'CURVA', 'JEGOS',
];
const BLOCKLIST = [...RESERVED, ...PROFANITY];

/** True when a candidate string contains a blocked substring (case-insensitive). */
export function isBlocked(candidate) {
  const up = String(candidate).toUpperCase();
  return BLOCKLIST.some((bad) => up.includes(bad));
}

/** Normalize a TOKEN path segment: strip whitespace only — case is significant
 *  (Base58, case-sensitive matching). Never uppercase a token. */
export function normalizeToken(input) {
  return String(input || '').trim();
}

/** Normalize an ALIAS: strip whitespace + uppercase. Aliases are case-insensitive
 *  and stored uppercase (§3.5). Kept as `normalize` for the alias code paths. */
export function normalize(input) {
  return String(input || '').trim().toUpperCase();
}

/** True when `token` is exactly the canonical 12-char Base58 shape (case-sensitive). */
export function isValidTokenShape(token) {
  return TOKEN_RE.test(normalizeToken(token));
}

/** True when `alias` is a syntactically valid alias (before namespace/blocklist checks). */
export function isValidAliasShape(alias) {
  const a = normalize(alias);
  return a.length >= 4 && a.length <= 20 && ALIAS_RE.test(a);
}

/** One cryptographically-secure 12-char candidate. crypto.randomInt is a CSPRNG
 *  with unbiased bounded sampling — never Math.random / Random(). */
export function randomToken() {
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

// A generated token is accepted only if it is not blocked.
function nextAcceptable(maxTries = 20) {
  for (let i = 0; i < maxTries; i++) {
    const t = randomToken();
    if (!isBlocked(t)) return t;
  }
  throw new Error('token generation: could not produce a non-blocked candidate');
}

/**
 * Generate a token unique per domain. `exists(token) => Promise<boolean>` checks
 * BOTH the tokens table and the aliases table (shared namespace, §3.5). Retries
 * on collision up to 5 attempts, then throws (§3.3).
 */
export async function generateUniqueToken(exists) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = nextAcceptable();
    // eslint-disable-next-line no-await-in-loop
    if (!(await exists(token))) return token;
  }
  throw new Error('token generation: exhausted 5 attempts without a free token');
}
