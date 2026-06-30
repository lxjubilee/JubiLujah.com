import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query } from '../db.js';
import { isUuid } from '../ids.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

// §10 editorial comments, backed by production.comments (threaded one level,
// soft delete). Never serialized to the public CDN.
const router = Router();
const RATEABLE = new Set(['song', 'album', 'artist', 'playlist', 'program']);

function rowToDto(c) {
  return {
    id: c.id,
    author_user_id: c.author_user_id,
    author_name: c.author_name || null,
    body: c.body,
    parent_id: c.parent_id || null,
    lyric_line: c.lyric_line ?? null,
    mentions: c.mentions || [],
    created_at: c.created_at,
    edited: c.updated_at && c.created_at && c.updated_at > c.created_at,
  };
}

// GET comments for an object (active only), newest-anchored.
router.get('/:type/:id', ah(async (req, res) => {
  const { type, id } = req.params;
  if (!RATEABLE.has(type) || !isUuid(id)) throw new HttpError(400, 'invalid target');
  const r = await query(
    `SELECT c.*, u.display_name AS author_name
       FROM production.comments c
       JOIN identity.users u ON u.id = c.author_user_id
      WHERE c.rateable_type = $1 AND c.rateable_id = $2 AND c.deleted_at IS NULL
      ORDER BY c.created_at ASC`,
    [type, id]
  );
  res.json(r.rows.map(rowToDto));
}));

// POST a new comment / reply.
const postSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  parent_id: z.string().uuid().optional(),
  lyric_line: z.number().int().positive().optional(),
  mentions: z.array(z.string().uuid()).optional(),
});
router.post('/:type/:id', requireRole('content_editor'), validate(postSchema), ah(async (req, res) => {
  const { type, id } = req.params;
  if (!RATEABLE.has(type) || !isUuid(id)) throw new HttpError(400, 'invalid target');
  const { body, parent_id, lyric_line, mentions } = req.body;
  const r = await query(
    `INSERT INTO production.comments
       (rateable_type, rateable_id, author_user_id, parent_id, body, lyric_line, mentions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [type, id, req.auth.user.id, parent_id ?? null, body, lyric_line ?? null, mentions ?? []]
  );
  res.status(201).json(rowToDto({ ...r.rows[0], author_name: req.auth.user.displayName }));
}));

// PATCH edit own comment.
const patchSchema = z.object({ body: z.string().trim().min(1).max(8000) });
router.patch('/:commentId', requireRole('content_editor'), validate(patchSchema), ah(async (req, res) => {
  const { commentId } = req.params;
  if (!isUuid(commentId)) throw new HttpError(400, 'invalid comment id');
  const existing = await query('SELECT author_user_id FROM production.comments WHERE id = $1 AND deleted_at IS NULL', [commentId]);
  if (!existing.rowCount) throw new HttpError(404, 'comment not found');
  if (existing.rows[0].author_user_id !== req.auth.user.id) throw new HttpError(403, 'not the author');
  const r = await query(
    'UPDATE production.comments SET body = $1 WHERE id = $2 RETURNING *',
    [req.body.body, commentId]
  );
  res.json(rowToDto({ ...r.rows[0], author_name: req.auth.user.displayName }));
}));

// DELETE (soft) own comment.
router.delete('/:commentId', requireRole('content_editor'), ah(async (req, res) => {
  const { commentId } = req.params;
  if (!isUuid(commentId)) throw new HttpError(400, 'invalid comment id');
  const existing = await query('SELECT author_user_id FROM production.comments WHERE id = $1 AND deleted_at IS NULL', [commentId]);
  if (!existing.rowCount) throw new HttpError(404, 'comment not found');
  if (existing.rows[0].author_user_id !== req.auth.user.id) throw new HttpError(403, 'not the author');
  await query('UPDATE production.comments SET deleted_at = NOW() WHERE id = $1', [commentId]);
  res.json({ id: commentId, deleted: true });
}));

export default router;
