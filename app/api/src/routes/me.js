import crypto from 'node:crypto';
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

// Flat set of liked targets — drives the ✓/♥ state in the UI. A like is
// "type:id" (unchanged, so older clients keep working); a favorite (0034) is
// "type:id:favorite".
router.get('/likes/ids', ah(async (req, res) => {
  const r = await query(
    'SELECT target_type, target_id, kind FROM production.user_likes WHERE user_id = $1',
    [req.auth.user.id]
  );
  res.json({ ids: r.rows.map((x) => (x.kind === 'favorite'
    ? `${x.target_type}:${x.target_id}:favorite`
    : `${x.target_type}:${x.target_id}`)) });
}));

// Resolved list for the "Liked" page, newest first.
router.get('/likes', ah(async (req, res) => {
  const r = await query(
    // Likes only: a favorite (0034) lives in the "My Favorites" playlist, and
    // listing both kinds here would show a liked-and-favorited song twice.
    `SELECT target_type, target_id, created_at FROM production.user_likes
      WHERE user_id = $1 AND kind = 'like' ORDER BY created_at DESC`,
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
  kind: z.enum(['like', 'favorite']).optional(),
});

// THE FIRST PLAYLIST BUILDS ITSELF (owner, 2026-09-16): "the first 36 likes and
// favorites that they select will automatically generate their first default
// playlist." Every song a listener likes or favorites is appended to their
// "My Favorites" playlist while it holds fewer than 36 songs. Past 36 the
// playlist is theirs to curate; nothing is ever removed from it on an unlike.
const FIRST_PLAYLIST_SIZE = 36;
async function addToFirstPlaylist(userId, songId) {
  await query(
    `INSERT INTO production.user_playlists (owner_user_id, name, description)
       SELECT $1, $2, 'Your go-to mix of saved songs.'
        WHERE NOT EXISTS (SELECT 1 FROM production.user_playlists WHERE owner_user_id = $1 AND name = $2)`,
    [userId, DEFAULT_PLAYLIST_NAME]
  );
  const pl = await query(
    `SELECT pl.id, COUNT(pi.id)::int AS n
       FROM production.user_playlists pl
       LEFT JOIN production.user_playlist_items pi ON pi.playlist_id = pl.id
      WHERE pl.owner_user_id = $1 AND pl.name = $2
      GROUP BY pl.id ORDER BY pl.created_at ASC LIMIT 1`,
    [userId, DEFAULT_PLAYLIST_NAME]
  );
  if (!pl.rowCount || pl.rows[0].n >= FIRST_PLAYLIST_SIZE) return false;
  const exists = await query('SELECT 1 FROM catalog.songs WHERE id = $1', [songId]);
  if (!exists.rowCount) return false;
  const r = await query(
    `INSERT INTO production.user_playlist_items (playlist_id, song_id, position)
       SELECT $1, $2, COALESCE(MAX(position) + 1, 0)
         FROM production.user_playlist_items WHERE playlist_id = $1
     ON CONFLICT (playlist_id, song_id) DO NOTHING
     RETURNING id`,
    [pl.rows[0].id, songId]
  );
  if (r.rowCount) await query('UPDATE production.user_playlists SET updated_at = NOW() WHERE id = $1', [pl.rows[0].id]);
  return r.rowCount > 0;
}

router.post('/likes', validate(likeSchema), ah(async (req, res) => {
  const { target_type, target_id } = req.body;
  const kind = req.body.kind || 'like';
  await query(
    `INSERT INTO production.user_likes (user_id, target_type, target_id, kind)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [req.auth.user.id, target_type, target_id, kind]
  );
  let addedToPlaylist = false;
  if (target_type === 'song') {
    // Best-effort: a like must never fail because the playlist could not grow.
    try { addedToPlaylist = await addToFirstPlaylist(req.auth.user.id, target_id); } catch { /* ignore */ }
  }
  res.status(201).json({ liked: true, target_type, target_id, kind, added_to_playlist: addedToPlaylist });
}));

router.delete('/likes/:type/:id', ah(async (req, res) => {
  const { type, id } = req.params;
  const kind = req.query.kind === 'favorite' ? 'favorite' : 'like';
  if (!['album', 'song'].includes(type) || !isUuid(id)) throw new HttpError(400, 'invalid target');
  await query(
    'DELETE FROM production.user_likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3 AND kind = $4',
    [req.auth.user.id, type, id, kind]
  );
  res.json({ liked: false, target_type: type, target_id: id, kind });
}));

// ===========================================================================
// Theme-playlist persistence. Per-(user, theme) saved settings, a served-track
// rotation log (repeat-avoidance), and shareable tokened snapshots. Backed by
// production.playlist_preferences / playlist_rotation / playlist_sends
// (migration 0029). See routes/playlistShare.js for the PUBLIC share read.
// ===========================================================================

// Shape a preferences row (or nulls) into the fixed API response.
function prefsResponse(themeId, row) {
  return {
    themeId,
    personas: row?.personas ?? null,
    language: row?.language ?? null,
    arc: row?.arc ?? null,
    durationSeconds: row?.duration_seconds ?? null,
    testimonyOn: row ? row.testimony_on : true,
    introsOn: row ? row.intros_on : false,
    mood: row?.mood ?? null,
    moodAt: row?.mood_at ? new Date(row.mood_at).toISOString() : null,
  };
}

// ---- Read saved theme-playlist preferences (defaults when no row) ----------
router.get('/playlist-prefs/:themeId', ah(async (req, res) => {
  const r = await query(
    'SELECT * FROM production.playlist_preferences WHERE user_id = $1 AND theme_id = $2',
    [req.auth.user.id, req.params.themeId]
  );
  res.json(prefsResponse(req.params.themeId, r.rows[0] || null));
}));

// ---- Upsert theme-playlist preferences -------------------------------------
const prefsSchema = z.object({
  personas: z.array(z.string()).optional(),
  language: z.string().min(1).max(32).optional(),
  arc: z.enum(['steady', 'build', 'worship_set']).optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  testimonyOn: z.boolean().optional(),
  introsOn: z.boolean().optional(),
  mood: z.string().max(200).nullable().optional(),
});
router.put('/playlist-prefs/:themeId', validate(prefsSchema), ah(async (req, res) => {
  const { personas, language, arc, durationSeconds, testimonyOn, introsOn, mood } = req.body;
  const moodProvided = Object.prototype.hasOwnProperty.call(req.body, 'mood');
  const r = await query(
    `INSERT INTO production.playlist_preferences
        (user_id, theme_id, personas, language, arc, duration_seconds,
         testimony_on, intros_on, mood, mood_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6,
              COALESCE($7, TRUE), COALESCE($8, FALSE), $9,
              CASE WHEN $10 THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (user_id, theme_id) DO UPDATE SET
        personas         = COALESCE(EXCLUDED.personas, production.playlist_preferences.personas),
        language         = COALESCE(EXCLUDED.language, production.playlist_preferences.language),
        arc              = COALESCE(EXCLUDED.arc, production.playlist_preferences.arc),
        duration_seconds = CASE WHEN $11 THEN EXCLUDED.duration_seconds ELSE production.playlist_preferences.duration_seconds END,
        testimony_on     = COALESCE($7, production.playlist_preferences.testimony_on),
        intros_on        = COALESCE($8, production.playlist_preferences.intros_on),
        mood             = CASE WHEN $10 THEN EXCLUDED.mood ELSE production.playlist_preferences.mood END,
        mood_at          = CASE WHEN $10 THEN NOW() ELSE production.playlist_preferences.mood_at END,
        updated_at       = NOW()
     RETURNING *`,
    [
      req.auth.user.id,
      req.params.themeId,
      personas ?? null,
      language ?? null,
      arc ?? null,
      durationSeconds ?? null,
      testimonyOn ?? null,
      introsOn ?? null,
      mood ?? null,
      moodProvided,
      Object.prototype.hasOwnProperty.call(req.body, 'durationSeconds'),
    ]
  );
  res.json(prefsResponse(req.params.themeId, r.rows[0]));
}));

// ---- Read the served-track rotation for a (theme, language) ----------------
const rotationQuery = z.object({ lang: z.string().min(1).max(32).optional() });
router.get('/playlist-rotation/:themeId', validate(rotationQuery, 'query'), ah(async (req, res) => {
  const lang = req.query.lang ?? null;
  const r = await query(
    `SELECT song_id FROM production.playlist_rotation
      WHERE user_id = $1 AND theme_id = $2 AND language IS NOT DISTINCT FROM $3
      ORDER BY served_at DESC`,
    [req.auth.user.id, req.params.themeId, lang]
  );
  res.json({ themeId: req.params.themeId, language: lang, served: r.rows.map((x) => x.song_id) });
}));

// ---- Append served tracks to the rotation (dedupe) -------------------------
const rotationAppendSchema = z.object({
  language: z.string().min(1).max(32),
  songIds: z.array(z.string().uuid()).max(1000),
});
router.post('/playlist-rotation/:themeId', validate(rotationAppendSchema), ah(async (req, res) => {
  const { language, songIds } = req.body;
  const userId = req.auth.user.id;
  const themeId = req.params.themeId;
  await withTransaction(async (client) => {
    for (const sid of songIds) {
      await client.query(
        `INSERT INTO production.playlist_rotation (user_id, theme_id, language, song_id)
           SELECT $1, $2, $3, $4
            WHERE NOT EXISTS (
              SELECT 1 FROM production.playlist_rotation
               WHERE user_id = $1 AND theme_id = $2
                 AND language IS NOT DISTINCT FROM $3 AND song_id = $4
            )`,
        [userId, themeId, language, sid]
      );
    }
  });
  const total = await query(
    `SELECT COUNT(*)::int AS n FROM production.playlist_rotation
      WHERE user_id = $1 AND theme_id = $2 AND language IS NOT DISTINCT FROM $3`,
    [userId, themeId, language]
  );
  res.json({ ok: true, served: total.rows[0].n });
}));

// ---- Reset the rotation for a (theme, language) ----------------------------
router.delete('/playlist-rotation/:themeId', validate(rotationQuery, 'query'), ah(async (req, res) => {
  const lang = req.query.lang ?? null;
  const r = await query(
    `DELETE FROM production.playlist_rotation
      WHERE user_id = $1 AND theme_id = $2 AND language IS NOT DISTINCT FROM $3`,
    [req.auth.user.id, req.params.themeId, lang]
  );
  res.json({ ok: true, cleared: r.rowCount });
}));

// ---- Create a shareable tokened snapshot of a themed mix -------------------
const sendSchema = z.object({
  themeId: z.string().min(1).max(200),
  language: z.string().min(1).max(32).optional(),
  personas: z.array(z.string()).optional(),
  arc: z.enum(['steady', 'build', 'worship_set']).optional(),
  note: z.string().max(2000).optional(),
});
router.post('/playlist-sends', validate(sendSchema), ah(async (req, res) => {
  const { themeId, language, personas, arc, note } = req.body;
  const token = crypto.randomBytes(16).toString('base64url'); // ~22 url-safe chars
  const r = await query(
    `INSERT INTO production.playlist_sends
        (token, sender_id, sender_name, theme_id, language, personas, arc, note)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, token`,
    [
      token,
      req.auth.user.id,
      req.auth.user.displayName ?? null,
      themeId,
      language ?? null,
      personas ?? null,
      arc ?? null,
      note ?? null,
    ]
  );
  res.status(201).json({ id: r.rows[0].id, token: r.rows[0].token, url: '/playlist/share/' + r.rows[0].token });
}));

export default router;
