// ============================================================================
// Auto hero rotation — one slide PER persona, a new album for each every day.
//
// When a mobile category has hero_enabled AND hero_autorotate (migration 0027),
// the public /api/mobile/config returns a hero CAROUSEL of 12 slides — one per
// Inspire Persona, in the fixed sequence below. Every 24 hours EACH persona's slide
// advances to a different album of THAT persona, so the whole carousel refreshes
// daily. Each persona independently cycles through its own eligible albums.
//
//   Day 1: Melody-A, Amir-A, Jubilee-A, …   (each persona's album #1)
//   Day 2: Melody-B, Amir-B, Jubilee-B, …   (each persona's album #2)
//   … wrapping per-persona (a persona with N albums repeats every N days).
//
//   • Eligible album = has a published cover AND >= 1 playable track (status 'ready').
//   • Slide order = the persona sequence below (Melody … Zev), fixed.
//   • A persona with no eligible album is skipped (carousel shrinks below 12).
//
// The persona ORDER is the product-specified sequence and intentionally differs
// from web/lib/personas.ts INSPIRE_ORDER (birth order) — do not swap it.
// ============================================================================
import { getManifest } from '../manifest.js';
import { hasCover } from '../util/albumCovers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Product-specified hero rotation order (Melody → … → Zev), as manifest artist slugs.
export const HERO_PERSONA_ORDER = [
  'melody-inspire', 'amir-inspire', 'jubilee-inspire', 'elias-inspire',
  'santiago-inspire', 'tahoma-inspire', 'imani-inspire', 'caleb-inspire',
  'nova-inspire', 'eliana-inspire', 'zariah-inspire', 'zev-inspire',
];

// An album is hero-eligible when it has real audio and a published cover.
function isEligible(album) {
  return album && (album.playable || 0) > 0 && hasCover(album.code);
}

// All hero-eligible album codes for one persona, in manifest order. This is the
// per-persona ring the daily index walks. Empty when the persona has none.
export function personaEligibleAlbums(slug) {
  const artist = getManifest().byArtist.get(slug);
  if (!artist) return [];
  return (artist.albums || []).filter(isEligible).map((al) => al.code);
}

// The UTC day number — every persona's slide advances by one each 24h boundary.
function dayIndex(now) {
  return Math.floor(now / DAY_MS);
}

// The hero carousel for TODAY: one album per persona (in HERO_PERSONA_ORDER), each
// being that persona's album-of-the-day. Deterministic by UTC day; each persona
// cycles through its own eligible albums independently. Length <= 12 (personas with
// no eligible album are skipped). Recomputed per call — cheap over the cached manifest.
export function dailyHeroAlbums(now = Date.now()) {
  const d = dayIndex(now);
  const out = [];
  for (const slug of HERO_PERSONA_ORDER) {
    const albums = personaEligibleAlbums(slug);
    if (!albums.length) continue;
    out.push(albums[((d % albums.length) + albums.length) % albums.length]);
  }
  return out;
}
