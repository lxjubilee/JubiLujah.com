// ============================================================================
// "FOR YOUR SEASON" — the twelve default Emotional State playlists.
//
// The read side of scripts/gen-season-playlists.mjs, which writes one JSON file
// per playlist into content/playlists/ (setup/playlist-functionality.md §6.3).
// This module loads those files and resolves every slot against the live
// catalogue, so what reaches the page is only ever songs that can actually play.
//
// 🔴 A SLOT IS RESOLVED BY `code` + `n`, NEVER BY TITLE. The spec's slot carries
// album / track / artist names for a human reading the file; the generator adds
// the album code and track number, which is what every other part of this system
// keys on. A retitled song keeps its place.
//
// 🔴 A SLOT THAT NO LONGER PLAYS IS DROPPED, NOT SHOWN BROKEN. getAlbumByCode is
// tenant-scoped and the manifest is the source of truth for audio, so a track
// whose file was pulled — or a tenant that cannot see Inspire albums at all —
// simply yields fewer songs. A playlist left with nothing is left off the page.
//
// Server-only (node:fs). Import from Server Components and route handlers.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { getAlbumByCode } from './manifest';
import { coverFor } from './covers';
import { heroPool } from './heroes';

const DIR = path.join(process.cwd(), 'content', 'playlists');

interface RawSlot { slot: number; album: string; track: string; artist: string; description?: string; code: string; n: number }
interface RawPlaylist {
  id: string; title: string; type: string; order?: number; description: string;
  accent?: string; linkedImage?: string; songCount?: number; songs: RawSlot[];
}

export interface SeasonSong {
  /** The catalogue song UUID — what play counting, likes and playlists key on. */
  songId: string;
  title: string;
  artist: string;
  album: string;
  albumHref: string;
  url: string;
  cover: string | null;
}

export interface SeasonPlaylist {
  id: string;
  title: string;
  description: string;
  accent: string;
  /** A 16:9 picture for the card and banner, or null for the accent gradient. */
  image: string | null;
  songCount: number;
  artistCount: number;
}

let rawCache: RawPlaylist[] | null = null;

function loadRaw(): RawPlaylist[] {
  if (rawCache) return rawCache;
  let files: string[] = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch { files = []; }
  const out: RawPlaylist[] = [];
  for (const f of files) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as RawPlaylist;
      if (doc?.type === 'Emotional State' && Array.isArray(doc.songs)) out.push(doc);
    } catch { /* a malformed file costs one playlist, not the page */ }
  }
  out.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title));
  rawCache = out;
  return rawCache;
}

function resolveSongs(p: RawPlaylist): SeasonSong[] {
  const songs: SeasonSong[] = [];
  for (const s of p.songs) {
    const album = getAlbumByCode(s.code);
    const track = album?.tracks.find((t) => t.n === s.n);
    if (!album || !track || !track.audio || !track.url) continue;
    songs.push({
      songId: track.id,
      title: track.title,
      artist: album.artistName,
      album: album.title,
      albumHref: `/album?c=${album.code}`,
      url: track.url,
      cover: coverFor(album.code, album.path),
    });
  }
  return songs;
}

/**
 * The picture for a playlist: its own generated image once one exists (§6.4),
 * otherwise the hero banner of the first album in it that has one — real,
 * people-centred 16:9 photography from the same catalogue the songs come from,
 * which is what the spec asks the generated image to be.
 */
// ONE PICTURE PER PLAYLIST, NEVER SHARED (2026-09-16): two playlists that open on
// the same album used to show the same photograph side by side on the page. The
// pictures are assigned together, in display order, each taking the first hero
// among its songs that no earlier playlist has already taken.
let pictureCache: Map<string, string | null> | null = null;
function pictureFor(p: RawPlaylist): string | null {
  if (!pictureCache) {
    pictureCache = new Map();
    const heroes = new Map(heroPool().map((h) => [h.code, h.image]));
    const used = new Set<string>();
    for (const pl of loadRaw()) {
      if (pl.linkedImage) { pictureCache.set(pl.id, `/images/playlists/${encodeURIComponent(pl.linkedImage)}`); continue; }
      let pick: string | null = null;
      for (const s of pl.songs) {
        const img = heroes.get(s.code);
        if (img && !used.has(img)) { pick = img; break; }
      }
      if (pick) used.add(pick);
      pictureCache.set(pl.id, pick);
    }
  }
  return pictureCache.get(p.id) ?? null;
}

function toCard(p: RawPlaylist, songs: SeasonSong[]): SeasonPlaylist {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    accent: p.accent || '#3DA5FF',
    image: pictureFor(p),
    songCount: songs.length,
    artistCount: new Set(songs.map((s) => s.artist)).size,
  };
}

/** Every playlist this tenant can play, in display order. */
export function listSeasonPlaylists(): SeasonPlaylist[] {
  return loadRaw()
    .map((p) => ({ p, songs: resolveSongs(p) }))
    .filter(({ songs }) => songs.length > 0)
    .map(({ p, songs }) => toCard(p, songs));
}

/** One playlist with its resolved songs, or null. */
export function getSeasonPlaylist(id: string): (SeasonPlaylist & { songs: SeasonSong[] }) | null {
  const p = loadRaw().find((x) => x.id === id);
  if (!p) return null;
  const songs = resolveSongs(p);
  if (!songs.length) return null;
  return { ...toCard(p, songs), songs };
}

export function seasonPlaylistIds(): string[] {
  return loadRaw().map((p) => p.id);
}
