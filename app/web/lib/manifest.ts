import fs from 'node:fs';
import path from 'node:path';
import { albumUuid, songUuid } from './ids';
import { coverFor } from './covers';
import type { Album, Artist, CategorySummary, StatusCounts, Track } from './types';

// ============================================================================
// Server-side catalog loader. Reads the authoritative manifest from
// public/music/catalog-manifest.json. Used by Server Components for SSG/ISR.
// ============================================================================
const CDN_BASE = process.env.NEXT_PUBLIC_CDN_BASE || 'https://cdn.jubileeverse.com';
const MANIFEST_FILE = path.join(process.cwd(), 'public', 'music', 'catalog-manifest.json');

interface RawTrack { n: number; title: string; file?: string; url?: string; audio?: boolean }
interface RawAlbum { code: string; title: string; folder?: string; path?: string; playable?: number; trackCount?: number; tracks?: RawTrack[] }
interface RawArtist { slug: string; name: string; role?: string; albums?: RawAlbum[] }
interface RawCategory { key: string; label: string; artists?: RawArtist[] }
interface RawManifest { generated?: string; totalAlbums?: number; categories?: RawCategory[] }

let cached: RawManifest | null = null;
function load(): RawManifest {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch {
    cached = { categories: [] };
  }
  return cached!;
}

export function manifestMeta() {
  const m = load();
  return { generated: m.generated, totalAlbums: m.totalAlbums || 0 };
}

export function listCategories(): CategorySummary[] {
  return (load().categories || []).map((c) => ({
    key: c.key,
    label: c.label,
    artistCount: (c.artists || []).length,
    albumCount: (c.artists || []).reduce((n, a) => n + (a.albums || []).length, 0),
  }));
}

export function listArtists(categoryKey?: string): Artist[] {
  const out: Artist[] = [];
  for (const c of load().categories || []) {
    if (categoryKey && c.key !== categoryKey) continue;
    for (const a of c.artists || []) {
      out.push({
        slug: a.slug,
        name: a.name,
        role: a.role || null,
        category: c.key,
        categoryLabel: c.label,
        albumCount: (a.albums || []).length,
        playableAlbums: (a.albums || []).filter((al) => (al.playable || 0) > 0).length,
      });
    }
  }
  return out;
}

export function getArtist(slug: string): Artist | null {
  for (const c of load().categories || []) {
    for (const a of c.artists || []) {
      if (a.slug !== slug) continue;
      return {
        slug: a.slug,
        name: a.name,
        role: a.role || null,
        category: c.key,
        categoryLabel: c.label,
        albums: (a.albums || [])
          // Seasonal Christmas albums live only on the Christmas page.
          .filter((al) => !(al as { christmas?: boolean }).christmas)
          .map((al) => ({
            id: albumUuid(al.code),
            code: al.code,
            title: al.title,
            playable: al.playable || 0,
            trackCount: al.trackCount || 0,
            status: (al.playable || 0) > 0 ? 'ready' : 'studio',
          })),
      };
    }
  }
  return null;
}

function decorate(al: RawAlbum, ctx: { artistSlug: string; artistName: string; categoryKey: string; categoryLabel: string }): Album {
  const tracks: Track[] = (al.tracks || []).map((t) => ({
    id: songUuid(al.code, t.n),
    n: t.n,
    title: t.title,
    file: t.file,
    audio: !!t.audio,
    url: t.url ? `${CDN_BASE}/music/${t.url}` : null,
  }));
  return {
    id: albumUuid(al.code),
    code: al.code,
    title: al.title,
    folder: al.folder,
    path: al.path,
    playable: al.playable || 0,
    trackCount: al.trackCount || tracks.length,
    status: (al.playable || 0) > 0 ? 'ready' : 'studio',
    artistSlug: ctx.artistSlug,
    artistName: ctx.artistName,
    category: ctx.categoryKey,
    categoryLabel: ctx.categoryLabel,
    tracks,
  };
}

export function getAlbumByCode(code: string): Album | null {
  const upper = String(code).toUpperCase();
  for (const c of load().categories || []) {
    for (const a of c.artists || []) {
      for (const al of a.albums || []) {
        if (String(al.code).toUpperCase() === upper) {
          return decorate(al, { artistSlug: a.slug, artistName: a.name, categoryKey: c.key, categoryLabel: c.label });
        }
      }
    }
  }
  return null;
}

export function allAlbumCodes(limit?: number): string[] {
  const codes: string[] = [];
  for (const c of load().categories || []) {
    for (const a of c.artists || []) {
      for (const al of a.albums || []) {
        codes.push(al.code);
        if (limit && codes.length >= limit) return codes;
      }
    }
  }
  return codes;
}

export interface AlbumTile {
  code: string;
  title: string;
  cover: string;   // cover-art URL (local /cover/<CODE>.png)
  href: string;
  status: 'ready' | 'studio';
  trackCount: number;
  christmas: boolean;  // tagged Christmas album (surfaces on the Christmas page)
}
export interface PersonaRow {
  slug: string;
  name: string;
  role: string | null;
  category: string;
  albums: AlbumTile[];
}

// One row per artist/persona, each carrying its albums as square cover tiles.
// Cover URL follows the catalog convention: <path>/artwork/<CODE>.png on the CDN.
//
// Christmas albums are SEASONAL and isolated: they are excluded from every
// regular browse surface (home, Inspire, categories, Music Type, …) and appear
// ONLY on the Christmas page, which opts in via { includeChristmas: true }.
export function personaRows(opts: { includeChristmas?: boolean } = {}): PersonaRow[] {
  const includeChristmas = opts.includeChristmas ?? false;
  const rows: PersonaRow[] = [];
  for (const c of load().categories || []) {
    for (const a of c.artists || []) {
      const albums: AlbumTile[] = (a.albums || [])
        .filter((al) => includeChristmas || !(al as { christmas?: boolean }).christmas)
        .map((al) => ({
        code: al.code,
        title: al.title,
        // Direct CDN cover when published there; CDN-first /cover route otherwise.
        cover: coverFor(al.code, al.path),
        href: `/album?c=${al.code}`,
        status: (al.playable || 0) > 0 ? 'ready' : 'studio',
        trackCount: al.trackCount || (al.tracks || []).length,
        christmas: !!(al as { christmas?: boolean }).christmas,
      }));
      rows.push({ slug: a.slug, name: a.name, role: a.role || null, category: c.key, albums });
    }
  }
  return rows;
}

export interface SearchResults {
  query: string;
  artists: { slug: string; name: string; role: string | null }[];
  albums: { code: string; title: string; artistSlug: string; artistName: string; status: 'ready' | 'studio'; cover: string }[];
  songs: { id: string; n: number; title: string; albumCode: string; albumTitle: string; artistSlug: string; artistName: string; status: 'ready' | 'studio'; url: string | null; cover: string }[];
}

// Case-insensitive catalog search over artist names, album titles + codes, and
// SONG titles. Albums/songs carry a cover URL so the results page can render
// thumbnails; songs carry a playable url (null for studio drafts with no audio).
export function searchCatalog(q: string, limit = 60): SearchResults {
  const term = q.trim().toLowerCase();
  const artists: SearchResults['artists'] = [];
  const albums: SearchResults['albums'] = [];
  const songs: SearchResults['songs'] = [];
  if (!term) return { query: q, artists, albums, songs };

  for (const c of load().categories || []) {
    for (const a of c.artists || []) {
      if (a.name.toLowerCase().includes(term) || a.slug.includes(term)) {
        artists.push({ slug: a.slug, name: a.name, role: a.role || null });
      }
      for (const al of a.albums || []) {
        const status: 'ready' | 'studio' = (al.playable || 0) > 0 ? 'ready' : 'studio';
        if (albums.length < limit && (al.title.toLowerCase().includes(term) || String(al.code).toLowerCase().includes(term))) {
          albums.push({
            code: al.code, title: al.title, artistSlug: a.slug, artistName: a.name,
            status, cover: coverFor(al.code, al.path),
          });
        }
        for (const t of al.tracks || []) {
          if (songs.length >= limit) break;
          if (t.title && t.title.toLowerCase().includes(term)) {
            songs.push({
              id: songUuid(al.code, t.n), n: t.n, title: t.title,
              albumCode: al.code, albumTitle: al.title, artistSlug: a.slug, artistName: a.name,
              status, url: t.url ? `${CDN_BASE}/music/${t.url}` : null, cover: coverFor(al.code, al.path),
            });
          }
        }
      }
    }
  }
  return { query: q, artists: artists.slice(0, limit), albums, songs };
}

export function statusCounts(scope = 'all'): StatusCounts {
  let ra = 0, rs = 0, sa = 0, ss = 0;
  for (const c of load().categories || []) {
    const inScope =
      scope === 'all' ||
      (scope === 'family' && c.key === 'inspire') ||
      (scope === 'children' && (c.key === 'party-giggles' || c.key === 'tiny-tiggles')) ||
      (scope.startsWith('category:') && c.key === scope.slice('category:'.length));
    for (const a of c.artists || []) {
      const artistInScope = inScope || (scope.startsWith('artist:') && a.slug === scope.slice('artist:'.length));
      if (!artistInScope) continue;
      for (const al of a.albums || []) {
        if ((al.playable || 0) > 0) { ra++; rs += al.playable || 0; }
        else { sa++; ss += al.trackCount || 0; }
      }
    }
  }
  return { scope, ready: { albums: ra, songs: rs }, studio: { albums: sa, songs: ss } };
}
