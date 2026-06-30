// ============================================================================
// "Music Type" = an album's PRIMARY music genre (album-genres.json[code][0],
// with the persona/theme fallback in lib/genres.ts). The MUSIC TYPE category
// surfaces a curated set of types as sub-categories:
//
//   1. A fixed required set (always shown), and
//   2. Any OTHER primary genre with MORE THAN 12 albums in the catalog.
//
// Counts are computed from the manifest at build/request time so the list stays
// correct as the catalog grows. Server-only (reads the manifest via lib/manifest).
// ============================================================================
import { personaRows, type AlbumTile } from './manifest';
import { topGenres } from './genres';

// Required music types — always present regardless of count (BRD).
const REQUIRED = ['Contemporary', 'Praise & Worship', 'Country', 'Gospel', 'Pentecostal Shout'];

// "more than 12" => strictly greater than 12.
const THRESHOLD = 12;

// Children's Music is its own destination (the Children Music category) and is
// excluded from Music Type entirely.
const CHILDREN_CATEGORIES = new Set(['party-giggles', 'tiny-tiggles']);

// Personas excluded from Music Type (e.g. Melody's albums are surfaced elsewhere).
const EXCLUDED_ARTISTS = new Set(['melody-inspire']);

export const typeSlug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// DISPLAY-ONLY relabeling for the Music Type page. These map a sub-category's
// genre value to a friendlier label shown on the page; the underlying genre,
// slug, grouping, and album metadata are unchanged (album genres are NOT
// affected). Keys must match the primary-genre value exactly.
const DISPLAY_LABELS: Record<string, string> = {
  Contemporary: 'Contemporary Christian Music',
  Country: 'Christian Country',
  Gospel: 'Gospel Music',
};
export const musicTypeLabel = (type: string): string => DISPLAY_LABELS[type] || type;

export interface TypedAlbum extends AlbumTile {
  artistName: string;
  primary: string;
}

// Every album in the catalog (minus Children's Music), tagged with its primary
// genre. Christmas albums are already excluded by personaRows.
function allAlbumsWithPrimary(): TypedAlbum[] {
  const out: TypedAlbum[] = [];
  for (const r of personaRows()) {
    if (CHILDREN_CATEGORIES.has(r.category) || EXCLUDED_ARTISTS.has(r.slug)) continue;
    for (const al of r.albums) {
      const primary = topGenres(al.code, r.name, al.title)[0] || 'Worship';
      out.push({ ...al, artistName: r.name, primary });
    }
  }
  return out;
}

export interface MusicType {
  type: string;
  slug: string;
  count: number;       // total albums with this primary genre
  readyCount: number;  // playable (READY) albums — what guests can see
  cover: string | null;
}

// The ordered list of music-type sub-categories: the required set first (in the
// specified order), then any other primary genre with >12 albums, by count desc.
export function musicTypes(): MusicType[] {
  const albums = allAlbumsWithPrimary();
  const counts = new Map<string, number>();
  const ready = new Map<string, number>();
  const covers = new Map<string, string>();
  for (const a of albums) {
    counts.set(a.primary, (counts.get(a.primary) || 0) + 1);
    if (a.status === 'ready') ready.set(a.primary, (ready.get(a.primary) || 0) + 1);
    // Prefer a READY album's cover for the card; fall back to any cover.
    if (a.cover && (a.status === 'ready' || !covers.has(a.primary))) covers.set(a.primary, a.cover);
  }

  const chosen: string[] = [];
  for (const t of REQUIRED) if (!chosen.includes(t)) chosen.push(t);
  const others = [...counts.entries()]
    .filter(([t, n]) => n > THRESHOLD && !REQUIRED.includes(t))
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  for (const t of others) chosen.push(t);

  return chosen.map((type) => ({
    type,
    slug: typeSlug(type),
    count: counts.get(type) || 0,
    readyCount: ready.get(type) || 0,
    cover: covers.get(type) || null,
  }));
}

export function musicTypeBySlug(slug: string): MusicType | null {
  return musicTypes().find((m) => m.slug === slug) || null;
}

// One section per music type, each carrying its albums — for the home-style
// Music Type page (a row per type). Computed in a single catalog pass.
export function musicTypeSections(): { type: string; slug: string; albums: TypedAlbum[] }[] {
  const types = musicTypes();
  const all = allAlbumsWithPrimary();
  const byType = new Map<string, TypedAlbum[]>();
  for (const a of all) {
    if (!byType.has(a.primary)) byType.set(a.primary, []);
    byType.get(a.primary)!.push(a);
  }
  return types.map((t) => ({ type: t.type, slug: t.slug, albums: byType.get(t.type) || [] }));
}

// Albums that share the given album's PRIMARY genre ("same Music Type"), used by
// the album page's "Similar Music" rail. Excludes the album itself; seasonal
// (Christmas) albums are already excluded via personaRows.
export function similarAlbums(code: string, limit = 14): { primary: string; albums: TypedAlbum[] } {
  const all = allAlbumsWithPrimary();
  const self = all.find((a) => a.code.toUpperCase() === String(code).toUpperCase());
  const primary = self?.primary || '';
  if (!primary) return { primary, albums: [] };
  const albums = all
    .filter((a) => a.primary === primary && a.code !== self?.code)
    .sort((a, b) => a.artistName.localeCompare(b.artistName) || a.code.localeCompare(b.code))
    .slice(0, limit);
  return { primary, albums };
}

// Albums whose PRIMARY genre is the given type (by slug), newest-code first.
export function albumsForType(slug: string): { type: string; albums: TypedAlbum[] } | null {
  const mt = musicTypeBySlug(slug);
  if (!mt) return null;
  const albums = allAlbumsWithPrimary()
    .filter((a) => a.primary === mt.type)
    .sort((a, b) => a.artistName.localeCompare(b.artistName) || a.code.localeCompare(b.code));
  return { type: mt.type, albums };
}
