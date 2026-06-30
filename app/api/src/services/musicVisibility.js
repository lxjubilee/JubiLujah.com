// ============================================================================
// Manage Music — public visibility enforcement.
//
// The public catalog endpoints are manifest-backed and synchronous, but an
// admin can HIDE an album/song in the Manage Music module. This module exposes
// the set of explicitly-HIDDEN album_codes / song_ids so the public catalog
// routes can suppress them. Only `visibility = 'hidden'` is suppressed here —
// 'draft'/studio albums are governed by the separate reviewer/studio gating in
// the web layer, so we deliberately do NOT touch them.
//
// Loaded lazily and cached for a short TTL; the admin routes call
// invalidateVisibilityCache() right after a visibility change so the public
// site reflects it immediately. Fails OPEN (hides nothing) on any DB error so
// the catalog never goes dark because of a transient DB blip.
// ============================================================================
import { query } from '../db.js';
import { logger } from '../logger.js';

const TTL_MS = 30 * 1000;
let cache = null;       // { albumCodes:Set, songIds:Set }
let loadedAt = 0;
let inflight = null;

async function load() {
  try {
    const albums = await query(
      `SELECT album_code FROM production.music_album_state WHERE visibility = 'hidden'`);
    const songs = await query(
      `SELECT song_id FROM production.music_song_state WHERE visibility = 'hidden'`);
    cache = {
      albumCodes: new Set(albums.rows.map((r) => String(r.album_code).toUpperCase())),
      songIds: new Set(songs.rows.map((r) => r.song_id)),
    };
    loadedAt = Date.now();
  } catch (err) {
    logger.warn({ err }, 'music visibility load failed — failing open');
    cache = { albumCodes: new Set(), songIds: new Set() };
    loadedAt = Date.now();
  }
  return cache;
}

async function getSets() {
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  if (!inflight) inflight = load().finally(() => { inflight = null; });
  return inflight;
}

export function invalidateVisibilityCache() {
  cache = null;
  loadedAt = 0;
}

// True when an album is hidden/draft (admin-suppressed) — should NOT show publicly.
export async function isAlbumHidden(code) {
  const sets = await getSets();
  return sets.albumCodes.has(String(code).toUpperCase());
}

export async function isSongHidden(songId) {
  const sets = await getSets();
  return sets.songIds.has(songId);
}

// Return the hidden sets for bulk filtering in a list endpoint.
export async function hiddenSets() {
  return getSets();
}
