// ============================================================================
// Backstage Access — the article library (interviews / testimonies / stories),
// each piece built on one specific song. See core/backstage/README.md.
//
// Content is compiled from core/backstage/**.md into
// public/backstage/backstage.json by scripts/gen-backstage.mjs; this module is
// the read side. Server-only (reads the generated file via fs) — import from
// Server Components.
//
// Card artwork: a piece uses its own 16:9 image when one has been produced
// (public/images/backstage/<slug>.<ext>), and otherwise falls back to the cover
// of the album the song belongs to, resolved through the catalog exactly like
// every other page. A piece whose album carries no cover renders the card with
// its title on a plain panel rather than a broken image.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { getAlbumByCode } from './manifest';
import { coverFor, hasCover } from './covers';

export type BackstageFormat = 'Interview' | 'Testimony' | 'Story' | 'Article';

export interface BackstageBlock {
  type: 'p' | 'quote' | 'h2' | 'h3' | 'hr';
  text?: string;
}

interface RawPiece {
  slug: string;
  format: BackstageFormat;
  title: string;
  song: string;
  albumCode: string;
  albumTitle: string;
  artist: string;
  principle: string;
  representative: boolean;
  banner: string | null;
  hasAudio: boolean;
  image: string | null;
  excerpt: string;
  body: BackstageBlock[];
}

export interface BackstagePiece extends RawPiece {
  /** Card artwork: dedicated image, else the album cover, else ''. */
  cover: string;
  /** Album page for the song, when the catalog carries the album. */
  albumHref: string | null;
  /** Hero image vertical framing — object-position Y %, 0=top…100=bottom (default 50).
   *  Admin-set via the reposition control; see BackstageHeroImage + hero-position route. */
  heroY: number;
}

const FILE = path.join(process.cwd(), 'public', 'backstage', 'backstage.json');
const HERO_POS_FILE = path.join(process.cwd(), 'public', 'backstage', 'hero-positions.json');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

// Re-read backstage.json whenever it changes (its mtime moves). gen-backstage.mjs
// rewrites it after every Image Studio regeneration, so this lets a regenerated
// card show on the next request without a rebuild — while still caching between
// unchanged reads. (The Backstage pages are `force-dynamic` so they call this per
// request; see app/backstage/**/page.tsx.)
let cached: RawPiece[] | null = null;
let cachedMtime = -1;
function load(): RawPiece[] {
  try {
    const mtime = fs.statSync(FILE).mtimeMs;
    if (cached && mtime === cachedMtime) return cached;
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cached = Array.isArray(data.pieces) ? data.pieces : [];
    cachedMtime = mtime;
  } catch {
    if (!cached) cached = [];
  }
  return cached!;
}

// On-disk mtime (ms) of a rooted public image URL, or 0 if it can't be read.
// Used as a ?v cache-buster so a regenerated file (same URL) reloads fresh.
function imageMtime(url: string): number {
  if (!url || !url.startsWith('/')) return 0;
  try {
    return Math.floor(fs.statSync(path.join(PUBLIC_DIR, url.replace(/^\/+/, '').split('?')[0])).mtimeMs);
  } catch {
    return 0;
  }
}

// The card/hero image URL. Backstage images are served through the dynamic
// /backstage/img/<slug> route (NOT the static public path) because `next start`
// won't serve files added to public/ after build — e.g. a just-regenerated
// image. The ?v=<mtime> makes a regenerated file reload past the browser cache.
export function backstageImageUrl(slug: string, rawImage: string): string {
  const v = imageMtime(rawImage);
  return `/backstage/img/${slug}${v ? `?v=${v}` : ''}`;
}

// Admin-set hero framing: slug → object-position Y %. Re-read on file change so
// a saved reposition shows on the next request (pages are force-dynamic).
let heroCache: Record<string, number> | null = null;
let heroCacheMtime = -1;
function heroPositions(): Record<string, number> {
  try {
    const mtime = fs.statSync(HERO_POS_FILE).mtimeMs;
    if (heroCache && mtime === heroCacheMtime) return heroCache;
    const data = JSON.parse(fs.readFileSync(HERO_POS_FILE, 'utf8'));
    heroCache = data && typeof data === 'object' ? data : {};
    heroCacheMtime = mtime;
  } catch {
    if (!heroCache) heroCache = {};
  }
  return heroCache!;
}

function decorate(p: RawPiece): BackstagePiece {
  const album = p.albumCode ? getAlbumByCode(p.albumCode) : null;
  // Gate on hasCover() rather than calling coverFor() unconditionally: for an
  // album with no published art, coverFor() hands back the /cover/<code>.png
  // route, which 404s when there is no local fallback either — a broken image
  // in the card. An empty string routes to the plain title panel instead.
  const albumCover = album && hasCover(album.code) ? coverFor(album.code, album.path) : '';
  const hy = heroPositions()[p.slug];
  return {
    ...p,
    cover: p.image ? backstageImageUrl(p.slug, p.image) : albumCover,
    albumHref: album ? `/album?c=${album.code}` : null,
    heroY: typeof hy === 'number' && hy >= 0 && hy <= 100 ? hy : 50,
  };
}

/** Section order on /backstage. */
export const BACKSTAGE_SECTIONS: { format: BackstageFormat; label: string; blurb: string }[] = [
  {
    // The song-based Interview/Testimony/Story pieces were removed from the site;
    // Backstage now carries only the Inspire Family article library. Header left
    // blank so the page renders the article cards directly under the hero.
    format: 'Article',
    label: '',
    blurb: '',
  },
];

export function listBackstage(format?: BackstageFormat): BackstagePiece[] {
  const all = load().map(decorate);
  return format ? all.filter((p) => p.format === format) : all;
}

export function getBackstagePiece(slug: string): BackstagePiece | null {
  const found = load().find((p) => p.slug === slug);
  return found ? decorate(found) : null;
}

/**
 * Sidebar / footer "More from Backstage" list for a given piece. Same-artist
 * pieces come first (a reader on a Jubilee Inspire interview most wants her
 * other pieces), then the rest of the library fills up to `limit`. The piece
 * itself is always excluded.
 */
export function relatedBackstage(slug: string, limit = 4): BackstagePiece[] {
  const all = load().map(decorate);
  const current = all.find((p) => p.slug === slug);
  const rest = all.filter((p) => p.slug !== slug);
  if (!current) return rest.slice(0, limit);
  const sameArtist = rest.filter((p) => p.artist === current.artist);
  const others = rest.filter((p) => p.artist !== current.artist);
  return [...sameArtist, ...others].slice(0, limit);
}

export function backstageSlugs(): string[] {
  return load().map((p) => p.slug);
}

/**
 * The Backstage piece built on a specific song (playlist §6 "Story" affordance),
 * matched by album code + song title. Returns null when no piece exists for that
 * track — the affordance is then simply not rendered (never a disabled state).
 * Today's backstage.json carries only the article library, so this returns null
 * for catalog tracks until song-level pieces are published; the wiring is ready.
 */
export function backstageForSong(albumCode: string, songTitle: string): BackstagePiece | null {
  const up = String(albumCode || '').toUpperCase();
  const st = String(songTitle || '').toLowerCase().trim();
  const found = load().find(
    (p) => String(p.albumCode || '').toUpperCase() === up && String(p.song || '').toLowerCase().trim() === st,
  );
  return found ? decorate(found) : null;
}

/** Map of albumCode(UPPER) → (song title lower → piece slug), for cheap
 *  per-track lookups when composing a whole playlist (§6 Story affordance). */
export function backstageSlugIndex(): Map<string, Map<string, string>> {
  const idx = new Map<string, Map<string, string>>();
  for (const p of load()) {
    if (!p.albumCode || !p.song) continue;
    const key = p.albumCode.toUpperCase();
    const inner = idx.get(key) || new Map<string, string>();
    inner.set(p.song.toLowerCase().trim(), p.slug);
    idx.set(key, inner);
  }
  return idx;
}
