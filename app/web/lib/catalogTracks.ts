// ============================================================================
// Flattened catalog track source (SERVER-ONLY).
//
// Joins the manifest (playable tracks) with the Phase-0 enrichment metadata
// (energy/tempo/moods/lang), album genres, and cover art into one typed
// CatalogTrack[]. This is the single input the eligibility (§2.2) and
// composition (§2.3, §5.3) engines read. Cached for the server process.
//
// Christmas albums are seasonal and excluded from playlist pools, matching the
// rest of the site's browse convention (see lib/manifest.ts personaRows).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { songUuid, albumUuid } from './ids';
import { musicUrl } from './cdn';
import { coverFor } from './covers';
import { getTrackMeta, type TrackMeta } from './trackMeta';
import genreData from '@/public/music/album-genres.json';

export interface CatalogTrack {
  songId: string;
  n: number;
  title: string;
  albumCode: string;
  albumTitle: string;
  albumId: string;
  personaSlug: string;
  personaName: string;
  category: string;
  url: string;            // resolvable CDN audio URL (rule 7 is always satisfied here)
  cover: string;
  genres: string[];
  meta: TrackMeta;        // energy / tempo / moods / lang / dur
}

interface RawTrack { n: number; title: string; url?: string; audio?: boolean }
interface RawAlbum { code: string; title: string; path?: string; tracks?: RawTrack[]; genres?: string[]; christmas?: boolean }
interface RawArtist { slug: string; name: string; albums?: RawAlbum[] }
interface RawCategory { key: string; artists?: RawArtist[] }

const ALBUM_GENRES: Record<string, string[]> = (genreData as { genres?: Record<string, string[]> }).genres || {};
const MANIFEST_FILE = path.join(process.cwd(), 'public', 'music', 'catalog-manifest.json');

let cache: CatalogTrack[] | null = null;

/** Every playable, enriched, non-seasonal track in the catalog. Cached. */
export function allCatalogTracks(): CatalogTrack[] {
  if (cache) return cache;
  let categories: RawCategory[] = [];
  try {
    categories = (JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).categories as RawCategory[]) || [];
  } catch {
    categories = [];
  }

  const out: CatalogTrack[] = [];
  for (const c of categories) {
    for (const a of c.artists || []) {
      for (const al of a.albums || []) {
        if (al.christmas) continue; // seasonal — excluded from playlists
        const genres = ALBUM_GENRES[String(al.code).toUpperCase()] || al.genres || [];
        const cover = coverFor(al.code, al.path);
        for (const t of al.tracks || []) {
          if (t.audio !== true || !t.url) continue; // rule 7: must have audio + URL
          const songId = songUuid(al.code, t.n);
          const meta = getTrackMeta(songId);
          if (!meta) continue; // not yet enriched → cannot be evaluated (§15)
          out.push({
            songId,
            n: t.n,
            title: t.title,
            albumCode: al.code,
            albumTitle: al.title,
            albumId: albumUuid(al.code),
            personaSlug: a.slug,
            personaName: a.name,
            category: c.key,
            url: musicUrl(t.url),
            cover,
            genres,
            meta,
          });
        }
      }
    }
  }
  cache = out;
  return out;
}
