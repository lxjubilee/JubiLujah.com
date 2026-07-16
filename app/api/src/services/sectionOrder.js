// ============================================================================
// Auto order — a deterministic daily shuffle for album sections.
//
// When an albums section has auto_order (migration 0028), the public
// /api/mobile/config presents its albums in an order that reshuffles every 24h.
// The shuffle is a PURE PERMUTATION (every album stays, only the order changes),
// deterministic by UTC day so it's stable all day and identical across servers,
// and seeded per-section so two sections don't share the same daily order.
//
//   Day N   -> order X       Day N   (same section) -> order X   (stable)
//   Day N+1 -> order Y != X                                       (advances 00:00 UTC)
//
// No stored state and no Math.random: the day number + section id fully determine
// the permutation. Mirrors the day-index approach in heroRotation.js.
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// The UTC day number — advances by one each 24h boundary (00:00 UTC).
function dayIndex(now) {
  return Math.floor(now / DAY_MS);
}

// Small 32-bit string hash (xfnv-1a style) — turns a section id into a stable seed
// so each section gets its own independent daily order.
function hashStr(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Tiny deterministic PRNG (mulberry32) → a function returning floats in [0, 1).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A NEW array holding the same items in a deterministic daily order. Seeded by the
// UTC day XOR the section's hash, so: same day+section => identical permutation;
// next day => different; different section same day => different. Never drops or
// duplicates an item (seeded Fisher–Yates). Returns the input untouched (copy) when
// there's nothing to shuffle.
export function dailyShuffle(items, sectionKey, now = Date.now()) {
  const out = items.slice();
  if (out.length <= 1) return out;
  const seed = (dayIndex(now) ^ hashStr(sectionKey)) >>> 0;
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
