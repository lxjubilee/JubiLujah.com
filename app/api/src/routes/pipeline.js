import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { isUuid } from '../ids.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

// §8 production pipeline. Reads require content_editor; transitions require
// production_manager. Every transition appends to the append-only history.
const router = Router();

const STAGES = [
  'concept', 'lyrics_drafting', 'lyrics_approved', 'song_generation', 'qa_review',
  'engineering', 'sunil_approval', 'final_approval', 'published', 'distributed',
];

router.get('/', requireRole('content_editor'), ah(async (req, res) => {
  const { stage } = req.query;
  const params = [];
  let where = '';
  if (stage) {
    if (!STAGES.includes(stage)) throw new HttpError(400, 'invalid stage');
    params.push(stage);
    where = 'WHERE ps.current_stage = $1';
  }
  const r = await query(
    `SELECT ps.rateable_type, ps.rateable_id, ps.current_stage, ps.assignee_user_id,
            ps.entered_stage_at, ps.updated_at
       FROM production.pipeline_state ps
       ${where}
       ORDER BY ps.updated_at DESC
       LIMIT 1000`,
    params
  );
  // Stage counts summary for dashboards.
  const counts = await query(
    `SELECT current_stage, COUNT(*)::int AS n FROM production.pipeline_state GROUP BY current_stage`
  );
  res.json({ items: r.rows, counts: Object.fromEntries(counts.rows.map((c) => [c.current_stage, c.n])) });
}));

const transitionSchema = z.object({
  to_stage: z.enum(STAGES),
  note: z.string().max(2000).optional(),
});
router.post('/:type/:id/transition', requireRole('executive'), validate(transitionSchema), ah(async (req, res) => {
  const { type, id } = req.params;
  if (!['song', 'album'].includes(type)) throw new HttpError(400, 'type must be song or album');
  if (!isUuid(id)) throw new HttpError(400, 'id must be a UUID');
  const { to_stage, note } = req.body;

  const result = await withTransaction(async (client) => {
    const cur = await client.query(
      'SELECT current_stage FROM production.pipeline_state WHERE rateable_type = $1 AND rateable_id = $2',
      [type, id]
    );
    const fromStage = cur.rowCount ? cur.rows[0].current_stage : null;

    if (cur.rowCount) {
      await client.query(
        `UPDATE production.pipeline_state
            SET current_stage = $1, entered_stage_at = NOW()
          WHERE rateable_type = $2 AND rateable_id = $3`,
        [to_stage, type, id]
      );
    } else {
      await client.query(
        `INSERT INTO production.pipeline_state (rateable_type, rateable_id, current_stage)
           VALUES ($1, $2, $3)`,
        [type, id, to_stage]
      );
    }
    await client.query(
      `INSERT INTO production.pipeline_history
         (rateable_type, rateable_id, from_stage, to_stage, actor_user_id, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, id, fromStage, to_stage, req.auth.user.id, note ?? null]
    );
    return { from_stage: fromStage, to_stage };
  });

  res.json({ rateable_type: type, rateable_id: id, ...result });
}));

// History for one object.
router.get('/:type/:id/history', requireRole('content_editor'), ah(async (req, res) => {
  const { type, id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'id must be a UUID');
  const r = await query(
    `SELECT h.from_stage, h.to_stage, h.note, h.occurred_at, u.display_name AS actor
       FROM production.pipeline_history h
       JOIN identity.users u ON u.id = h.actor_user_id
      WHERE h.rateable_type = $1 AND h.rateable_id = $2
      ORDER BY h.occurred_at DESC`,
    [type, id]
  );
  res.json(r.rows);
}));

export default router;
