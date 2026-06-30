import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query } from '../db.js';
import { isUuid } from '../ids.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

// §12 radio programming, backed by radio.* tables.
const router = Router();

router.get('/stations', ah(async (req, res) => {
  const r = await query(
    `SELECT id, call_sign, display_name, description, frequency, genre_anchors, is_active
       FROM radio.stations ORDER BY frequency`
  );
  res.json(r.rows);
}));

router.get('/programs', ah(async (req, res) => {
  const r = await query(
    `SELECT p.id, p.name, p.description, p.station_id, s.call_sign, p.schedule_cron,
            p.duration_min, p.is_active
       FROM radio.programs p
       LEFT JOIN radio.stations s ON s.id = p.station_id
      ORDER BY p.name`
  );
  res.json(r.rows);
}));

router.get('/playlists', ah(async (req, res) => {
  const r = await query(
    `SELECT pl.id, pl.name, pl.description, pl.program_id, pl.created_by, pl.created_at,
            COUNT(pi.id)::int AS item_count
       FROM radio.playlists pl
       LEFT JOIN radio.playlist_items pi ON pi.playlist_id = pl.id
      GROUP BY pl.id
      ORDER BY pl.created_at DESC`
  );
  res.json(r.rows);
}));

router.get('/playlists/:id', ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid playlist id');
  const pl = await query('SELECT * FROM radio.playlists WHERE id = $1', [id]);
  if (!pl.rowCount) throw new HttpError(404, 'playlist not found');
  const items = await query(
    `SELECT pi.id, pi.song_id, pi.position, pi.transition, s.title AS song_title
       FROM radio.playlist_items pi
       JOIN catalog.songs s ON s.id = pi.song_id
      WHERE pi.playlist_id = $1 ORDER BY pi.position`,
    [id]
  );
  res.json({ ...pl.rows[0], items: items.rows });
}));

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  program_id: z.string().uuid().optional(),
});
router.post('/playlists', requireRole('executive'), validate(createSchema), ah(async (req, res) => {
  const { name, description, program_id } = req.body;
  const r = await query(
    `INSERT INTO radio.playlists (name, description, program_id, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, description ?? null, program_id ?? null, req.auth.user.id]
  );
  res.status(201).json(r.rows[0]);
}));

// Replace the ordered item list for a playlist.
const itemsSchema = z.object({
  items: z.array(z.object({
    song_id: z.string().uuid(),
    transition: z.enum(['crossfade', 'hard_cut', 'sweeper']).optional(),
  })).max(500),
});
router.patch('/playlists/:id/items', requireRole('executive'), validate(itemsSchema), ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid playlist id');
  const { items } = req.body;
  await query('DELETE FROM radio.playlist_items WHERE playlist_id = $1', [id]);
  let pos = 0;
  for (const it of items) {
    await query(
      `INSERT INTO radio.playlist_items (playlist_id, song_id, position, transition)
         VALUES ($1, $2, $3, $4)`,
      [id, it.song_id, pos++, it.transition ?? null]
    );
  }
  res.json({ playlist_id: id, item_count: items.length });
}));

export default router;
