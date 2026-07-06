import fs from 'node:fs';
import { config } from './config.js';
import { logger } from './logger.js';
import { albumUuid, songUuid } from './ids.js';
import { coverVersion } from './util/coverVersions.js';

// Append the cache-bust ?v=<version> to a cover url when the cover has been
// admin-replaced (so clients past the immutable CDN cache get the new image).
function withCoverVersion(url, code) {
  const v = coverVersion(code);
  return v && url ? `${url}${url.includes('?') ? '&' : '?'}v=${v}` : url;
}

// ============================================================================
// Catalog manifest loader. The manifest is the authoritative browse source
// (per the ops doc). Loaded once and indexed for O(1) lookups by category key,
// artist slug, and album code. Hot-reloads if the file's mtime changes.
// ============================================================================
let cache = null;
let mtimeMs = 0;
let fullCache = null;    // unsanitized manifest, for the admin CMS (getFullManifest)
let fullMtimeMs = 0;

// Artists retired from the public catalog at the API layer. The manifest is
// folder-scan-generated from J:, so a plain rebuild would re-add these — filtering
// here drops them from EVERY catalog endpoint (artists, albums, songs, counts)
// durably. (Their source data on disk is NOT deleted — only hidden from the API.)
// Scope (2026-06-27): the mobile app shows ONLY the 12 Inspire Family personas as
// artists; every non-family artist is excluded here, EXCEPT party-giggles/tiny-tiggles
// whose albums are kept and re-grouped into a single "Children Music" category below.
const EXCLUDED_ARTISTS = new Set([
  'gabriel-inspire',
  // collaborative projects listed under inspire (not individual personas)
  'kingdom-pulse', 'radiant-stones',
  // faith-based "Other Artists"
  'children-evangelism', 'gospel-by-music', 'judah-boone', 'mercy-belle-hayes',
  'mihaiela-norica', 'ron-tank',
  // general "Family Friendly" non-family artists
  'allan-hassan', 'animals-blue-symbols', 'cornell-kay', 'daisy-wylder', 'gage-darron',
  'happy-rumbles', 'my-tiny-tumbles', 'ruthie-bolton', 'wolf-ladybug-butterfly',
  // nations / romanian
  'veselia-copiilor', 'zburdalnicii',
]);

// The 12 Inspire Family personas (the only artists shown on the mobile app). Their
// avatar art is uploaded to the CDN at /personas/<FirstName>.png.
const PERSONA_SLUGS = new Set([
  'amir-inspire', 'caleb-inspire', 'eliana-inspire', 'elias-inspire', 'imani-inspire',
  'jubilee-inspire', 'melody-inspire', 'nova-inspire', 'santiago-inspire',
  'tahoma-inspire', 'zariah-inspire', 'zev-inspire',
]);

// Absolute CDN url for a persona avatar (null for non-personas / Children Music).
function personaImage(slug) {
  if (!PERSONA_SLUGS.has(slug)) return null;
  const f = String(slug).split('-')[0];
  return `${config.cdnBase}/personas/${f.charAt(0).toUpperCase()}${f.slice(1)}.png`;
}

// The two children's labels are merged into ONE "Children Music" category so the
// mobile categories match the website (which groups them under "Children Music").
const CHILD_CATEGORY_KEYS = new Set(['party-giggles', 'tiny-tiggles']);

function sanitize(raw) {
  const cats = raw.categories || [];
  // 1. Drop excluded artists from every category.
  for (const c of cats) {
    if (Array.isArray(c.artists)) c.artists = c.artists.filter((a) => !EXCLUDED_ARTISTS.has(a.slug));
  }
  // 2. Collect all children's albums (party-giggles + tiny-tiggles) for the merge.
  const childAlbums = [];
  for (const c of cats) {
    if (!CHILD_CATEGORY_KEYS.has(c.key)) continue;
    for (const a of c.artists || []) for (const al of a.albums || []) childAlbums.push(al);
  }
  // 3. Rebuild the category list: keep non-children categories that still have artists
  //    (drops faith-based/general/nations/christmas once their artists are excluded),
  //    then append the single merged "Children Music" category.
  const out = [];
  for (const c of cats) {
    if (CHILD_CATEGORY_KEYS.has(c.key)) continue;
    if ((c.artists || []).length === 0) continue;
    out.push(c);
  }
  if (childAlbums.length) {
    out.push({
      key: 'children',
      label: 'Children Music',
      artists: [{ slug: 'children-music', name: 'Children Music', role: 'Children Music', albums: childAlbums }],
    });
  }
  raw.categories = out;
  return raw;
}

function build(raw) {
  const byCategory = new Map();
  const byArtist = new Map();
  const byAlbumCode = new Map();
  const byAlbumId = new Map();   // albumUuid -> resolved album summary (for likes etc.)
  const bySongId = new Map();    // songUuid -> resolved, playable song (CDN url + cover)

  for (const category of raw.categories || []) {
    byCategory.set(category.key, category);
    for (const artist of category.artists || []) {
      byArtist.set(artist.slug, { ...artist, categoryKey: category.key, categoryLabel: category.label });
      for (const album of artist.albums || []) {
        byAlbumCode.set(String(album.code).toUpperCase(), {
          ...album,
          artistSlug: artist.slug,
          artistName: artist.name,
          categoryKey: category.key,
          categoryLabel: category.label,
        });
        byAlbumId.set(albumUuid(album.code), {
          id: albumUuid(album.code),
          code: album.code,
          title: album.title,
          artist: artist.name,
          artistSlug: artist.slug,
          cover: `/cover/${album.code}.png`,
          status: (album.playable || 0) > 0 ? 'ready' : 'studio',
          trackCount: album.trackCount || (album.tracks || []).length,
        });
        for (const t of album.tracks || []) {
          const id = songUuid(album.code, t.n);
          bySongId.set(id, {
            id,
            code: album.code,
            n: t.n,
            title: t.title,
            album: album.title,
            artist: artist.name,
            artistSlug: artist.slug,
            cover: `/cover/${album.code}.png`,
            url: t.url ? `${config.cdnBase}/music/${t.url}` : null,
          });
        }
      }
    }
  }
  return { raw, byCategory, byArtist, byAlbumCode, byAlbumId, bySongId };
}

// Resolve a catalog song by its deterministic UUID, from the authoritative
// manifest (same source the album pages use, so the CDN url is always correct
// even when the DB has no audio asset row yet).
export function getSongById(id) {
  const s = getManifest().bySongId.get(id);
  if (!s) return null;
  return { ...s, cover: withCoverVersion(s.cover, s.code) };
}

// Resolve an album summary by its deterministic UUID (for likes / favorites).
export function getAlbumById(id) {
  const a = getManifest().byAlbumId.get(id);
  if (!a) return null;
  return { ...a, cover: withCoverVersion(a.cover, a.code) };
}

export function getManifest() {
  try {
    const stat = fs.statSync(config.manifestPath);
    if (!cache || stat.mtimeMs !== mtimeMs) {
      const raw = sanitize(JSON.parse(fs.readFileSync(config.manifestPath, 'utf8')));
      cache = build(raw);
      mtimeMs = stat.mtimeMs;
      logger.info({ albums: raw.totalAlbums, generated: raw.generated }, 'Catalog manifest loaded');
    }
  } catch (err) {
    logger.error({ err, path: config.manifestPath }, 'Failed to load catalog manifest');
    if (!cache) cache = build({ categories: [], totalAlbums: 0 });
  }
  return cache;
}

// Full (UNSANITIZED) manifest: every artist and album exactly as generated from
// the catalog — no artist exclusions, no children-category merge. The admin CMS
// uses this so an operator can curate from the ENTIRE catalog and decide what the
// mobile app shows; the public/mobile-facing getManifest() above stays sanitized.
export function getFullManifest() {
  try {
    const stat = fs.statSync(config.manifestPath);
    if (!fullCache || stat.mtimeMs !== fullMtimeMs) {
      const raw = JSON.parse(fs.readFileSync(config.manifestPath, 'utf8'));
      fullCache = build(raw);
      fullMtimeMs = stat.mtimeMs;
      logger.info({ albums: raw.totalAlbums, generated: raw.generated }, 'Full catalog manifest loaded (admin)');
    }
  } catch (err) {
    logger.error({ err, path: config.manifestPath }, 'Failed to load full catalog manifest');
    if (!fullCache) fullCache = build({ categories: [], totalAlbums: 0 });
  }
  return fullCache;
}

export function listCategories() {
  const m = getManifest();
  return (m.raw.categories || []).map((c) => ({
    key: c.key,
    label: c.label,
    artistCount: (c.artists || []).length,
    albumCount: (c.artists || []).reduce((n, a) => n + (a.albums || []).length, 0),
  }));
}

export function listArtists(categoryKey, { full = false } = {}) {
  const m = full ? getFullManifest() : getManifest();
  const out = [];
  for (const c of m.raw.categories || []) {
    if (categoryKey && c.key !== categoryKey) continue;
    for (const a of c.artists || []) {
      out.push({
        slug: a.slug,
        name: a.name,
        role: a.role || null,
        category: c.key,
        image: personaImage(a.slug),
        albumCount: (a.albums || []).length,
        playableAlbums: (a.albums || []).filter((al) => (al.playable || 0) > 0).length,
      });
    }
  }
  return out;
}

// Decorate an album with its deterministic UUID + audio/track URLs.
export function decorateAlbum(album) {
  if (!album) return null;
  const id = albumUuid(album.code);
  const tracks = (album.tracks || []).map((t) => ({
    id: songUuid(album.code, t.n),
    n: t.n,
    title: t.title,
    file: t.file,
    audio: !!t.audio,
    url: t.url ? `${config.cdnBase}/music/${t.url}` : null,
  }));
  return {
    id,
    code: album.code,
    title: album.title,
    folder: album.folder,
    path: album.path,
    artistSlug: album.artistSlug,
    artistName: album.artistName,
    category: album.categoryKey,
    categoryLabel: album.categoryLabel,
    playable: album.playable || 0,
    trackCount: album.trackCount || (album.tracks || []).length,
    status: (album.playable || 0) > 0 ? 'ready' : 'studio',
    tracks,
  };
}

export function getAlbumByCode(code) {
  const m = getManifest();
  return decorateAlbum(m.byAlbumCode.get(String(code).toUpperCase()));
}

export function getArtist(slug) {
  const m = getManifest();
  const a = m.byArtist.get(slug);
  if (!a) return null;
  return {
    slug: a.slug,
    name: a.name,
    role: a.role || null,
    category: a.categoryKey,
    categoryLabel: a.categoryLabel,
    image: personaImage(a.slug),
    albums: (a.albums || []).map((al) => ({
      id: albumUuid(al.code),
      code: al.code,
      title: al.title,
      playable: al.playable || 0,
      trackCount: al.trackCount || 0,
      status: (al.playable || 0) > 0 ? 'ready' : 'studio',
    })),
  };
}

// Ready/Studio rollup counts for a scope (matches album-status.js semantics).
export function statusCounts(scope = 'all') {
  const m = getManifest();
  let readyAlbums = 0, readySongs = 0, studioAlbums = 0, studioSongs = 0;
  for (const c of m.raw.categories || []) {
    const inScope =
      scope === 'all' ||
      (scope === 'family' && c.key === 'inspire') ||
      (scope === 'children' && (c.key === 'party-giggles' || c.key === 'tiny-tiggles')) ||
      (scope.startsWith('category:') && c.key === scope.slice('category:'.length));
    for (const a of c.artists || []) {
      const artistInScope = inScope || (scope.startsWith('artist:') && a.slug === scope.slice('artist:'.length));
      if (!artistInScope) continue;
      for (const al of a.albums || []) {
        if ((al.playable || 0) > 0) { readyAlbums++; readySongs += al.playable; }
        else { studioAlbums++; studioSongs += (al.trackCount || 0); }
      }
    }
  }
  return { scope, ready: { albums: readyAlbums, songs: readySongs }, studio: { albums: studioAlbums, songs: studioSongs } };
}
