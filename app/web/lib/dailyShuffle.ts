// ============================================================================
// Daily shuffle — a deterministic 24h reordering for album rows.
//
// This is the SAME algorithm the mobile API applies to auto-ordered sections
// (app/api/src/services/sectionOrder.js). Kept byte-identical here — same day
// index, same fnv-1a seed, same mulberry32 PRNG, same seeded Fisher–Yates — so
// the website homepage reshuffles on exactly the same 24h boundary (00:00 UTC)
// and by exactly the same mechanism as the app. Any change here MUST be mirrored
// in sectionOrder.js (and vice-versa) or the two will drift.
//
//   Day N   -> order X       Day N   (same key) -> order X   (stable all day)
//   Day N+1 -> order Y != X                                  (advances 00:00 UTC)
//
// Stateless and pure: the UTC day number + the row key fully determine the
// permutation. No stored state, no Math.random — identical across servers.
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// The UTC day number — advances by one each 24h boundary (00:00 UTC).
function dayIndex(now: number): number {
  return Math.floor(now / DAY_MS);
}

// Small 32-bit string hash (fnv-1a) — turns a row key into a stable seed so each
// row gets its own independent daily order.
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Tiny deterministic PRNG (mulberry32) → a function returning floats in [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A NEW array holding the same items in a deterministic daily order. Seeded by
// the UTC day XOR the key's hash, so: same day+key => identical permutation;
// next day => different; different key same day => different. Never drops or
// duplicates an item (seeded Fisher–Yates). Returns a copy untouched when there's
// nothing to shuffle (0 or 1 items).
export function dailyShuffle<T>(items: T[], key: string, now: number = Date.now()): T[] {
  const out = items.slice();
  if (out.length <= 1) return out;
  const seed = (dayIndex(now) ^ hashStr(key)) >>> 0;
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
