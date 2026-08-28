/**
 * The "angels" music catalog — the real album tree under J:\music\angels,
 * scanned at build time into `src/content/angels-catalog.ts`.
 *
 * Books are grouped into the six canonical divisions shown on the home page
 * (Torah · Prophets · Writings · Gospels · Letters · Revelation). Albums whose
 * `tracks` array is non-empty have rendered audio; those mp3s are streamed from
 * the drive by the `/media/[...]` route handler and played through the footer.
 */

import type { PlayableTrack } from '@/components/torahsings/audio/AudioProvider';

export interface CatalogTrack {
  n: number;
  title: string;
  /** Path relative to the angels music root, forward-slashed. */
  rel: string;
  /** Length in whole seconds, read from the mp3 at scan time. Absent when the
   *  file's header could not be parsed — the tracklist then shows "--:--". */
  secs?: number;
}

export interface CatalogAlbum {
  /** Album code, e.g. "ANSMX1001EN" — also the tile/queue id prefix. */
  code: string;
  title: string;
  /** Source book, e.g. "Genesis". */
  book: string;
  /** 1–66. */
  bookNum: number;
  /** 0–360, seeds the celestial art hue. */
  hue: number;
  /** A Hebrew watermark letter for the art. */
  glyph?: string;
  /** Path to the album's cover under `artwork/`, relative to the angels music
   *  root — same shape as a track's `rel`. Null when the album has no artwork,
   *  which is most of them; the tile falls back to celestial art. Resolve with
   *  `artUrl()`, never render it raw: the base differs by environment. */
  art?: string | null;
  /** Rendered songs, in order. Empty when no audio has landed yet. */
  tracks: CatalogTrack[];
}

export interface CatalogCategory {
  id: string;
  title: string;
  blurb: string;
  albums: CatalogAlbum[];
}

/**
 * Base for streamed media. In production this is set to the R2 CDN prefix
 * (e.g. `https://cdn.jubileeverse.com/torahsings`), so audio is served straight
 * from object storage. Left empty in local dev, where the `/media/[...]` route
 * streams the masters off the `J:\music\angels` drive instead. Trailing slashes
 * are trimmed so we control the join.
 */
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE || '').replace(/\/+$/, '');

const encodePath = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');

/** Turn a drive-relative path into a media URL: the R2 CDN in production, the
 *  local `/media` route handler in dev. */
export function mediaUrl(rel: string): string {
  const encoded = encodePath(rel);
  return MEDIA_BASE ? `${MEDIA_BASE}/${encoded}` : `/media/${encoded}`;
}

/**
 * Cover art is just another file in the album folder, so it resolves exactly
 * like the audio: the R2 CDN in production, the `/media` route off the drive in
 * dev. Nothing extra to upload — the covers ride the same rclone sync as the
 * mp3s, and the scan picks each album's webp over its png (~6× lighter).
 *
 * Only albums that actually have artwork carry a value; the rest are null and
 * render <CelestialArt> instead.
 */
export const artUrl = mediaUrl;

/** Every rendered song of an album, as a queue the audio engine can play. */
export function albumPlayables(album: CatalogAlbum): PlayableTrack[] {
  return album.tracks.map((t) => ({
    id: `${album.code}:${t.n}`,
    title: t.title,
    subtitle: album.title,
    src: mediaUrl(t.rel),
    seed: `${album.code}:${t.n}`,
    // Where the player's title / maximize button navigates: the album details page.
    href: `/album/${album.code}`,
  }));
}

export const hasAudio = (album: CatalogAlbum): boolean => album.tracks.length > 0;
