// ============================================================================
// Theme-playlist share — PUBLIC read API.
//
// Mounted at /api/playlist-share. GET /:token returns the shareable snapshot a
// sender created via POST /api/me/playlist-sends (production.playlist_sends).
// No auth: a recipient without an account can open a shared mix by its token.
// The catalog manifest stays the source of track data; this only carries the
// themed-mix parameters (theme, language, personas, arc) + the sender's note.
// ============================================================================
import { Router } from 'express';
import { ah } from '../util/async.js';
import { query } from '../db.js';
import { HttpError } from '../middleware/rbac.js';

const router = Router();

router.get('/:token', ah(async (req, res) => {
  const r = await query(
    `SELECT theme_id, language, personas, arc, note, sender_name, created_at
       FROM production.playlist_sends WHERE token = $1`,
    [req.params.token]
  );
  if (!r.rowCount) throw new HttpError(404, 'share not found');
  const row = r.rows[0];
  res.json({
    themeId: row.theme_id,
    language: row.language,
    personas: row.personas,
    arc: row.arc,
    note: row.note,
    senderName: row.sender_name,
    createdAt: new Date(row.created_at).toISOString(),
  });
}));

export default router;
