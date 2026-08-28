/**
 * Deterministic pseudo-randomness.
 *
 * The celestial art scatters star dots. Those positions must be identical on
 * the server and on the client or React will complain about a hydration
 * mismatch — so they are derived from the album slug, never from Math.random.
 */

/** FNV-1a. Small, fast, good enough to scatter stars. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32. Returns a function producing floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Star {
  /** Percentages. */
  x: number;
  y: number;
  /** px */
  size: number;
  opacity: number;
}

/** Three to five tiny star dots, scattered the same way every time. */
export function starsFor(seed: string, count = 4): Star[] {
  const rand = seededRandom(hashString(seed));
  const n = 3 + Math.floor(rand() * Math.min(3, count));
  return Array.from({ length: n }, () => ({
    x: Math.round(8 + rand() * 84),
    y: Math.round(8 + rand() * 70),
    size: Math.round((1 + rand() * 1.6) * 10) / 10,
    opacity: Math.round((0.35 + rand() * 0.5) * 100) / 100,
  }));
}

/** Bars for the waveform. Varied, stable, one peak. */
export function waveformBars(seed: string, count = 28): number[] {
  const rand = seededRandom(hashString(seed));
  return Array.from({ length: count }, () => 0.22 + rand() * 0.78);
}
