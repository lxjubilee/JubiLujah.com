import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { isUuid } from '../ids.js';
import { HttpError, requireAuth } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { getSongById, getAlbumById } from '../manifest.js';

// Personal, user-owned playlists. Any authenticated user can create named
// collections of songs and save them. Backed by production.user_playlists /
// production.user_playlist_items. Distinct from the radio.* producer playlists
// in routes/radio.js (which require the radio_producer role).
const router = Router();

// Every route here requires a logged-in user.
router.use(requireAuth);

// Resolve a playlist that belongs to the caller, or throw the right HTTP error.
async function ownedPlaylist(id, userId) {
  if (!isUuid(id)) throw new HttpError(400, 'invalid playlist id');
  const r = await query('SELECT * FROM production.user_playlists WHERE id = $1', [id]);
  if (!r.rowCount) throw new HttpError(404, 'playlist not found');
  if (r.rows[0].owner_user_id !== userId) throw new HttpError(403, 'not your playlist');
  return r.rows[0];
}

// The default playlist every user gets. Auto-provisioned on first listing, and
// always returned FIRST so it is the default entry in the Add-to-Playlist menu
// and the top sub-category on the Playlists page.
const DEFAULT_PLAYLIST_NAME = 'My Favorites';

// ---- List the caller's playlists (with item counts) ------------------------
router.get('/playlists', ah(async (req, res) => {
  const userId = req.auth.user.id;

  // Ensure the default "My Favorites" playlist exists for this user (idempotent).
  await query(
    `INSERT INTO production.user_playlists (owner_user_id, name, description)
       SELECT $1, $2, 'Your go-to mix of saved songs.'
        WHERE NOT EXISTS (
          SELECT 1 FROM production.user_playlists
           WHERE owner_user_id = $1 AND name = $2
        )`,
    [userId, DEFAULT_PLAYLIST_NAME]
  );

  const r = await query(
    `SELECT pl.id, pl.name, pl.description, pl.is_public, pl.created_at, pl.updated_at,
            COUNT(pi.id)::int AS item_count,
            (SELECT pi2.song_id FROM production.user_playlist_items pi2
              WHERE pi2.playlist_id = pl.id ORDER BY pi2.position ASC LIMIT 1) AS first_song_id
       FROM production.user_playlists pl
       LEFT JOIN production.user_playlist_items pi ON pi.playlist_id = pl.id
      WHERE pl.owner_user_id = $1
      GROUP BY pl.id
      ORDER BY (pl.name = $2) DESC, pl.created_at DESC`,
    [userId, DEFAULT_PLAYLIST_NAME]
  );
  // Cover = the album cover of the playlist's first track (resolved from the manifest).
  const rows = r.rows.map(({ first_song_id, ...pl }) => ({
    ...pl,
    is_default: pl.name === DEFAULT_PLAYLIST_NAME,
    cover: first_song_id ? (getSongById(first_song_id)?.cover || null) : null,
  }));
  res.json(rows);
}));

// ---- Create a playlist -----------------------------------------------------
const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  is_public: z.boolean().optional(),
});
router.post('/playlists', validate(createSchema), ah(async (req, res) => {
  const { name, description, is_public } = req.body;
  const r = await query(
    `INSERT INTO production.user_playlists (owner_user_id, name, description, is_public)
       VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.auth.user.id, name, description ?? null, is_public ?? false]
  );
  res.status(201).json(r.rows[0]);
}));

// ---- Playlist detail (ordered items) ---------------------------------------
router.get('/playlists/:id', ah(async (req, res) => {
  const pl = await ownedPlaylist(req.params.id, req.auth.user.id);
  const items = await query(
    `SELECT pi.id, pi.song_id, pi.position, pi.added_at,
            s.title AS song_title,
            al.title AS album_title,
            ar.display_name AS artist_name,
            aud.storage_url AS url
       FROM production.user_playlist_items pi
       JOIN catalog.songs   s   ON s.id   = pi.song_id
       JOIN catalog.albums  al  ON al.id  = s.album_id
       JOIN catalog.artists ar  ON ar.id  = al.artist_id
       LEFT JOIN catalog.assets aud ON aud.id = s.audio_asset_id
      WHERE pi.playlist_id = $1
      ORDER BY pi.position`,
    [pl.id]
  );
  // Resolve playable CDN url + cover from the authoritative manifest (the DB has
  // no audio asset rows, so pi-side url is null). Manifest values win; DB titles
  // are the fallback when a song isn't in the manifest.
  const resolved = items.rows.map((it) => {
    const m = getSongById(it.song_id);
    return {
      ...it,
      song_title: it.song_title || m?.title || 'Unknown track',
      album_title: it.album_title || m?.album || null,
      artist_name: it.artist_name || m?.artist || null,
      cover: m?.cover || null,
      url: m?.url ?? it.url ?? null,
    };
  });
  res.json({ ...pl, items: resolved });
}));

// ---- Distinct song ids (with per-song count) across the caller's playlists --
// Drives the "already added → check" indicator in the track lists.
router.get('/playlist-song-ids', ah(async (req, res) => {
  const r = await query(
    `SELECT pi.song_id, COUNT(*)::int AS count
       FROM production.user_playlist_items pi
       JOIN production.user_playlists pl ON pl.id = pi.playlist_id
      WHERE pl.owner_user_id = $1
      GROUP BY pi.song_id`,
    [req.auth.user.id]
  );
  const counts = {};
  for (const row of r.rows) counts[row.song_id] = row.count;
  res.json({ counts });
}));

// ---- Rename / edit description / visibility --------------------------------
const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  is_public: z.boolean().optional(),
});
router.patch('/playlists/:id', validate(updateSchema), ah(async (req, res) => {
  const pl = await ownedPlaylist(req.params.id, req.auth.user.id);
  const { name, description, is_public } = req.body;
  const r = await query(
    `UPDATE production.user_playlists
        SET name        = COALESCE($2, name),
            description  = CASE WHEN $3::text IS NULL THEN description ELSE NULLIF($3, '') END,
            is_public    = COALESCE($4, is_public)
      WHERE id = $1
      RETURNING *`,
    [pl.id, name ?? null, description === undefined ? null : description, is_public ?? null]
  );
  res.json(r.rows[0]);
}));

// ---- Delete a playlist -----------------------------------------------------
router.delete('/playlists/:id', ah(async (req, res) => {
  const pl = await ownedPlaylist(req.params.id, req.auth.user.id);
  await query('DELETE FROM production.user_playlists WHERE id = $1', [pl.id]);
  res.status(204).end();
}));

// ---- Add a song to the end of a playlist (no-op if already present) --------
const addItemSchema = z.object({ song_id: z.string().uuid() });
router.post('/playlists/:id/items', validate(addItemSchema), ah(async (req, res) => {
  const pl = await ownedPlaylist(req.params.id, req.auth.user.id);
  const { song_id } = req.body;
  const exists = await query('SELECT 1 FROM catalog.songs WHERE id = $1', [song_id]);
  if (!exists.rowCount) throw new HttpError(404, 'song not found');
  const r = await query(
    `INSERT INTO production.user_playlist_items (playlist_id, song_id, position)
       SELECT $1, $2, COALESCE(MAX(position) + 1, 0)
         FROM production.user_playlist_items WHERE playlist_id = $1
     ON CONFLICT (playlist_id, song_id) DO NOTHING
     RETURNING *`,
    [pl.id, song_id]
  );
  await query('UPDATE production.user_playlists SET updated_at = NOW() WHERE id = $1', [pl.id]);
  if (!r.rowCount) return res.status(200).json({ playlist_id: pl.id, song_id, duplicate: true });
  res.status(201).json(r.rows[0]);
}));

// ---- Bulk add (e.g. a whole album) — appends each not-already-present song --
const bulkAddSchema = z.object({ song_ids: z.array(z.string().uuid()).min(1).max(100) });
router.post('/playlists/:id/items/bulk', validate(bulkAddSchema), ah(async (req, res) => {
  const pl = await ownedPlaylist(req.params.id, req.auth.user.id);
  const { song_ids } = req.body;
  let added = 0;
  await withTransaction(async (client) => {
    for (const sid of song_ids) {
      const exists = await client.query('SELECT 1 FROM catalog.songs WHERE id = $1', [sid]);
      if (!exists.rowCount) continue;
      const r = await client.query(
        `INSERT INTO production.user_playlist_items (playlist_id, song_id, position)
           SELECT $1, $2, COALESCE(MAX(position) + 1, 0)
             FROM production.user_playlist_items WHERE playlist_id = $1
         ON CONFLICT (playlist_id, song_id) DO NOTHING
         RETURNING id`,
        [pl.id, sid]
      );
      if (r.rowCount) added += 1;
    }
    await client.query('UPDATE production.user_playlists SET updated_at = NOW() WHERE id = $1', [pl.id]);
  });
  res.json({ playlist_id: pl.id, added, total: song_ids.length });
}));

// ---- Remove a single item --------------------------------------------------
router.delete('/playlists/:id/items/:itemId', ah(async (req, res) => {
  const pl = await ownedPlaylist(req.params.id, req.auth.user.id);
  if (!isUuid(req.params.itemId)) throw new HttpError(400, 'invalid item id');
  await query(
    'DELETE FROM production.user_playlist_items WHERE id = $1 AND playlist_id = $2',
    [req.params.itemId, pl.id]
  );
  await query('UPDATE production.user_playlists SET updated_at = NOW() WHERE id = $1', [pl.id]);
  res.status(204).end();
}));

// ---- Replace the whole ordered item list (reorder / bulk set) --------------
const reorderSchema = z.object({
  items: z.array(z.object({ song_id: z.string().uuid() })).max(1000),
});
router.patch('/playlists/:id/items', validate(reorderSchema), ah(async (req, res) => {
  const pl = await ownedPlaylist(req.params.id, req.auth.user.id);
  const { items } = req.body;
  await withTransaction(async (client) => {
    await client.query('DELETE FROM production.user_playlist_items WHERE playlist_id = $1', [pl.id]);
    let pos = 0;
    for (const it of items) {
      await client.query(
        `INSERT INTO production.user_playlist_items (playlist_id, song_id, position)
           VALUES ($1, $2, $3)
         ON CONFLICT (playlist_id, song_id) DO NOTHING`,
        [pl.id, it.song_id, pos++]
      );
    }
    await client.query('UPDATE production.user_playlists SET updated_at = NOW() WHERE id = $1', [pl.id]);
  });
  res.json({ playlist_id: pl.id, item_count: items.length });
}));

// ===========================================================================
// Likes (account-backed favorites). Targets albums or songs; the hover-tile
// like uses albums. Resolved to titles/covers via the manifest for the page.
// ===========================================================================

// Flat set of liked targets ("type:id") — drives the ✓/♥ state in the UI.
router.get('/likes/ids', ah(async (req, res) => {
  const r = await query(
    'SELECT target_type, target_id FROM production.user_likes WHERE user_id = $1',
    [req.auth.user.id]
  );
  res.json({ ids: r.rows.map((x) => `${x.target_type}:${x.target_id}`) });
}));

// Resolved list for the "Liked" page, newest first.
router.get('/likes', ah(async (req, res) => {
  const r = await query(
    `SELECT target_type, target_id, created_at FROM production.user_likes
      WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.auth.user.id]
  );
  const items = r.rows.map((row) => {
    const m = row.target_type === 'album' ? getAlbumById(row.target_id) : getSongById(row.target_id);
    if (!m) return null;
    return { target_type: row.target_type, target_id: row.target_id, liked_at: row.created_at, ...m };
  }).filter(Boolean);
  res.json({ items });
}));

const likeSchema = z.object({
  target_type: z.enum(['album', 'song']),
  target_id: z.string().uuid(),
});
router.post('/likes', validate(likeSchema), ah(async (req, res) => {
  const { target_type, target_id } = req.body;
  await query(
    `INSERT INTO production.user_likes (user_id, target_type, target_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [req.auth.user.id, target_type, target_id]
  );
  res.status(201).json({ liked: true, target_type, target_id });
}));

router.delete('/likes/:type/:id', ah(async (req, res) => {
  const { type, id } = req.params;
  if (!['album', 'song'].includes(type) || !isUuid(id)) throw new HttpError(400, 'invalid target');
  await query(
    'DELETE FROM production.user_likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
    [req.auth.user.id, type, id]
  );
  res.json({ liked: false, target_type: type, target_id: id });
}));

export default router;
