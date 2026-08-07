// ============================================================================
// Composition + sequencing engine (SERVER-ONLY) — spec §2.3, §5.3, §8, §10,
// §11, §14.1. Pure and deterministic: same inputs (including `seed`) → same
// output, but different listeners/sessions pass different seeds, so order is
// per-session and never stored globally (§16).
//
//   Pipeline:  eligible pool  →  rotation split (§14.1)  →  selection with
//   album/persona caps (§2.3)  →  arc ordering (§11) + §5.3 sequencing +
//   adjacency rules  →  duration-fit truncation (§10)  →  testimony interlude
//   injection (§8).
// ============================================================================
import type { CatalogTrack } from './catalogTracks';
import { eligiblePool, type EligibilityContext } from './eligibility';
import type { ThemeRecord } from './playlistThemes';

export type Arc = 'steady' | 'build' | 'worship_set';

export interface Interlude {
  id: string;
  kind: 'testimony';
  category: string;
  title: string;
  url: string;
  durationSeconds: number;
  image?: string | null;
}

export type PlaylistEntry =
  | { type: 'track'; track: CatalogTrack }
  | { type: 'interlude'; interlude: Interlude };

export interface ComposeOptions {
  theme: ThemeRecord;
  lang: string;
  /** Listener-selected personas (subset of the theme's eligible personas). */
  personas: string[];
  arc: Arc;
  /** Per-session seed → deterministic-but-varied ordering (§16). */
  seed: string;
  /** Target runtime in seconds for duration-fit (§10); null/undefined = full set. */
  durationSeconds?: number | null;
  /** Song ids already served to this listener (§14.1 full-rotation memory). */
  served?: Set<string>;
  /** Energy bias from the mood check-in (§9): −0.2 (gentler) … +0.2 (higher). */
  energyBias?: number;
  /** Testimony interlude pool + toggle (§8). */
  interludes?: Interlude[];
  testimonyOn?: boolean;
}

export interface ComposedPlaylist {
  entries: PlaylistEntry[];
  trackCount: number;
  distinctAlbums: number;
  runtimeSeconds: number;
  poolSize: number;
  warnings: string[];
  underfilled: boolean;
  rotationReset: boolean;
}

// ── deterministic RNG ────────────────────────────────────────────────────────
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ── arc target curve (0..1 across N positions) ───────────────────────────────
function arcCurve(arc: Arc, n: number, i: number): number {
  const p = n <= 1 ? 0 : i / (n - 1);
  switch (arc) {
    case 'build':
      return 0.15 + 0.8 * p;
    case 'worship_set': {
      // gather → rise → crest → land (four movements)
      if (p < 0.25) return 0.4 + (p / 0.25) * 0.15;          // 0.40 → 0.55
      if (p < 0.55) return 0.55 + ((p - 0.25) / 0.3) * 0.3;  // 0.55 → 0.85
      if (p < 0.8) return 0.85 + ((p - 0.55) / 0.25) * 0.13; // 0.85 → 0.98 (crest)
      return 0.98 - ((p - 0.8) / 0.2) * 0.85;                // 0.98 → 0.13 (land)
    }
    case 'steady':
    default:
      return 0.55 + 0.08 * Math.sin(p * Math.PI * 3); // held band, gentle undulation
  }
}

// ── §2.3 selection: cap per album, maximise distinct albums, prefer unheard ──
// When `preferEnergyAtLeast` is set (high-energy themes with a §5.3 floor), the
// selection is drawn from the more energetic albums first, so the 120 chosen are
// predominantly at/above that floor — this is what lets §5.3 ("distribute the
// highest-energy tracks across the full run") actually hold. Still eligible
// tracks, still ≥min distinct albums, still ≤max per album.
function selectTracks(
  pool: CatalogTrack[], target: number, maxPerAlbum: number, rng: () => number, preferEnergyAtLeast = 0,
): CatalogTrack[] {
  const byAlbum = new Map<string, CatalogTrack[]>();
  for (const t of pool) {
    const arr = byAlbum.get(t.albumCode) || [];
    arr.push(t);
    byAlbum.set(t.albumCode, arr);
  }
  // Within an album, higher-energy tracks represent it first.
  for (const arr of byAlbum.values()) arr.sort((a, b) => b.meta.energy - a.meta.energy);
  // Album traversal order: energetic albums first (shuffled within each tier for
  // variety + per-session rotation), else a plain shuffle when no preference.
  const codes = [...byAlbum.keys()];
  let order: string[];
  if (preferEnergyAtLeast > 0) {
    const hi: string[] = [], lo: string[] = [];
    for (const c of codes) (byAlbum.get(c)![0].meta.energy >= preferEnergyAtLeast ? hi : lo).push(c);
    order = [...shuffle(hi, rng), ...shuffle(lo, rng)];
  } else {
    order = shuffle(codes, rng);
  }
  const picked: CatalogTrack[] = [];
  const takenPerAlbum = new Map<string, number>();
  for (let round = 0; round < maxPerAlbum && picked.length < target; round++) {
    for (const code of order) {
      if (picked.length >= target) break;
      const taken = takenPerAlbum.get(code) || 0;
      if (taken >= maxPerAlbum) continue;
      const arr = byAlbum.get(code)!;
      if (taken < arr.length) { picked.push(arr[taken]); takenPerAlbum.set(code, taken + 1); }
    }
  }
  return picked;
}

// ── arc ordering with adjacency rules (§2.3) + §5.3 sequencing ───────────────
function orderByArc(sel: CatalogTrack[], opts: ComposeOptions): CatalogTrack[] {
  const { theme, arc } = opts;
  const n = sel.length;
  if (n <= 1) return sel;
  const lo = theme.energy_range.min, hi = theme.energy_range.max;
  const bias = (opts.energyBias || 0) * (hi - lo);
  const enforcePersona = new Set(opts.personas).size >= 3; // §2.3 persona adjacency only when ≥3 active
  const seq = theme.sequencing || {};
  const belowThresh = seq.max_consecutive_below_energy ?? 0;
  const maxBelowRun = seq.max_consecutive_below_count ?? Infinity;

  const remaining = [...sel];
  const out: CatalogTrack[] = [];
  let belowRun = 0;

  // Greedy nearest-to-target with STRONG penalties (never a hard skip, so a
  // position is always fillable): adjacency (§2.3) and the §5.3 below-run rule
  // are respected whenever the pool allows and only bent when unavoidable.
  for (let i = 0; i < n; i++) {
    const targetEnergy = Math.max(lo, Math.min(hi, lo + arcCurve(arc, n, i) * (hi - lo) + bias));
    const prev = out[out.length - 1];
    const runBlocked = belowThresh > 0 && belowRun >= maxBelowRun;

    let bestIdx = 0, bestScore = Infinity;
    for (let k = 0; k < remaining.length; k++) {
      const c = remaining[k];
      let score = Math.abs(c.meta.energy - targetEnergy);
      if (prev && c.albumCode === prev.albumCode) score += 1000;                     // §2.3 no same album back-to-back
      if (prev && enforcePersona && c.personaSlug === prev.personaSlug) score += 1000; // §2.3 no same persona back-to-back (≥3 active)
      if (runBlocked && c.meta.energy < belowThresh) score += 600;                     // §5.3 don't extend a below-threshold run
      if (score < bestScore) { bestScore = score; bestIdx = k; }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    out.push(chosen);
    belowRun = belowThresh > 0 && chosen.meta.energy < belowThresh ? belowRun + 1 : 0;
  }

  // §5.3 opening: open at/above open_min_energy when the pool allows — except for
  // the 'build' arc, whose whole design is to start low and climb (§11).
  const openMin = seq.open_min_energy;
  if (openMin && arc !== 'build' && out.length && out[0].meta.energy < openMin) {
    const idx = out.findIndex((t, ix) =>
      ix > 0 && t.meta.energy >= openMin &&
      t.albumCode !== out[1]?.albumCode &&
      (!enforcePersona || t.personaSlug !== out[1]?.personaSlug));
    if (idx > 0) { const [t] = out.splice(idx, 1); out.unshift(t); }
  }
  return out;
}

// ── §8 testimony interlude injection ─────────────────────────────────────────
function injectInterludes(tracks: CatalogTrack[], opts: ComposeOptions, rng: () => number): PlaylistEntry[] {
  const entries: PlaylistEntry[] = tracks.map((track) => ({ type: 'track', track }));
  const pool = (opts.testimonyOn ? opts.interludes || [] : []).filter(
    (i) => opts.theme.testimony_categories.includes(i.category),
  );
  if (!pool.length || tracks.length < 10) return entries;

  const shuffledPool = shuffle(pool, rng);
  let poolIdx = 0;
  const out: PlaylistEntry[] = [];
  let sinceLast = 0;
  // Randomized cadence of one every 8–10 tracks; never first/last; never adjacent.
  let nextGap = 8 + Math.floor(rng() * 3);
  for (let i = 0; i < entries.length; i++) {
    out.push(entries[i]);
    sinceLast++;
    const isLastFew = i >= entries.length - 2; // never as (or just before) the last item
    if (!isLastFew && sinceLast >= nextGap && poolIdx < shuffledPool.length) {
      out.push({ type: 'interlude', interlude: shuffledPool[poolIdx++] });
      sinceLast = 0;
      nextGap = 8 + Math.floor(rng() * 3);
    }
  }
  return out;
}

const trackDur = (t: CatalogTrack) => t.meta.dur || 210;

// ── main entry ────────────────────────────────────────────────────────────────
export function compose(opts: ComposeOptions): ComposedPlaylist {
  const rng = mulberry32(hashSeed(`${opts.seed}|${opts.theme.theme_id}|${opts.lang}|${opts.arc}|${[...opts.personas].sort().join(',')}`));
  const warnings: string[] = [];

  // 1. eligible pool (§2.2) filtered to the listener's selected personas (§3).
  const selectedSet = new Set(opts.personas);
  const fullPool = eligiblePool(opts.theme, opts.lang).filter((t) => selectedSet.has(t.personaSlug));
  const poolSize = fullPool.length;

  // 2. rotation split (§14.1): prefer unheard; reset when the pool is exhausted.
  const served = opts.served || new Set<string>();
  let unheard = fullPool.filter((t) => !served.has(t.songId));
  let heard = fullPool.filter((t) => served.has(t.songId));
  let rotationReset = false;
  if (unheard.length === 0 && fullPool.length > 0) { unheard = fullPool; heard = []; rotationReset = true; }

  // 3. how many tracks: full target, or an estimate for duration-fit (§10).
  const target = opts.theme.target_track_count;
  let want = target;
  if (opts.durationSeconds && opts.durationSeconds > 0) {
    const avg = fullPool.length ? fullPool.reduce((s, t) => s + trackDur(t), 0) / fullPool.length : 210;
    want = Math.max(1, Math.round(opts.durationSeconds / avg) + 2); // +2 headroom to trim precisely
  }

  // 4. select with album cap, unheard first then top up from heard. High-energy
  // themes (a §5.3 below-energy floor) bias selection toward energetic albums.
  const maxPer = opts.theme.max_tracks_per_album;
  const preferEnergy = opts.theme.sequencing?.max_consecutive_below_energy || 0;
  let selected = selectTracks(unheard, want, maxPer, rng, preferEnergy);
  if (selected.length < want && heard.length) {
    const chosen = new Set(selected.map((t) => t.songId));
    const perAlbum = new Map<string, number>();
    selected.forEach((t) => perAlbum.set(t.albumCode, (perAlbum.get(t.albumCode) || 0) + 1));
    const topUp = selectTracks(heard.filter((t) => !chosen.has(t.songId)), want - selected.length, maxPer, rng, preferEnergy)
      .filter((t) => (perAlbum.get(t.albumCode) || 0) < maxPer);
    selected = selected.concat(topUp);
  }

  // §2.3 underfill: ship short rather than relax the rules; log it.
  const distinctAlbums = new Set(selected.map((t) => t.albumCode)).size;
  if (!opts.durationSeconds && selected.length < target) {
    warnings.push(`pool_underfill: theme=${opts.theme.theme_id} lang=${opts.lang} personas=${opts.personas.length} shortfall=${target - selected.length} (have ${selected.length}/${target}, ${distinctAlbums} albums)`);
  }
  if (selected.length < 30) warnings.push('sparse_selection: fewer than 30 tracks — invite the listener to add an artist (§3.3).');

  // 5. arc ordering + §5.3 sequencing + adjacency rules.
  let ordered = orderByArc(selected, opts);

  // 6. duration-fit truncation (§10): trim to land within 60s of the target.
  if (opts.durationSeconds && opts.durationSeconds > 0) {
    const budget = opts.durationSeconds;
    const kept: CatalogTrack[] = [];
    let acc = 0;
    for (const t of ordered) {
      const d = trackDur(t);
      if (acc + d > budget + 60 && kept.length) break;
      kept.push(t); acc += d;
      if (acc >= budget - 60 && acc <= budget + 60) { /* within window */ }
    }
    ordered = orderByArc(kept, opts); // re-shape the arc across the fitted window
  }

  // 7. testimony interlude injection (§8).
  const entries = injectInterludes(ordered, opts, rng);

  const runtimeSeconds = entries.reduce(
    (s, e) => s + (e.type === 'track' ? trackDur(e.track) : e.interlude.durationSeconds), 0,
  );

  return {
    entries,
    trackCount: ordered.length,
    distinctAlbums: new Set(ordered.map((t) => t.albumCode)).size,
    runtimeSeconds,
    poolSize,
    warnings,
    underfilled: !opts.durationSeconds && ordered.length < target,
    rotationReset,
  };
}

// A convenience type for callers that only want track entries.
export type { EligibilityContext };
