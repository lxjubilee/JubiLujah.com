import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query } from '../db.js';
import { isUuid } from '../ids.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

// §9 polymorphic 5-star ratings, backed by production.ratings.
const router = Router();
const RATEABLE = new Set(['song', 'album', 'artist', 'playlist', 'program']);

function checkTarget(type, id) {
  if (!RATEABLE.has(type)) throw new HttpError(400, 'invalid rateable_type');
  if (!isUuid(id)) throw new HttpError(400, 'rateable_id must be a UUID');
}

async function aggregate(type, id, userId) {
  const agg = await query(
    `SELECT COUNT(*)::int AS count, ROUND(AVG(stars)::numeric, 2) AS average
       FROM production.ratings WHERE rateable_type = $1 AND rateable_id = $2`,
    [type, id]
  );
  const dist = await query(
    `SELECT stars, COUNT(*)::int AS n FROM production.ratings
      WHERE rateable_type = $1 AND rateable_id = $2 GROUP BY stars`,
    [type, id]
  );
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of dist.rows) distribution[r.stars] = r.n;

  let mine = null;
  if (userId) {
    const m = await query(
      `SELECT stars, note FROM production.ratings
        WHERE rateable_type = $1 AND rateable_id = $2 AND rater_user_id = $3`,
      [type, id, userId]
    );
    if (m.rowCount) mine = m.rows[0];
  }
  return {
    rateable_type: type,
    rateable_id: id,
    count: agg.rows[0].count,
    average: agg.rows[0].average ? Number(agg.rows[0].average) : null,
    distribution,
    mine,
  };
}

// GET aggregate + distribution (+ caller's own rating if authed).
router.get('/:type/:id', ah(async (req, res) => {
  const { type, id } = req.params;
  checkTarget(type, id);
  res.json(await aggregate(type, id, req.auth?.user?.id));
}));

// PUT upsert the caller's rating.
const putSchema = z.object({ stars: z.number().int().min(1).max(5), note: z.string().max(2000).optional() });
router.put('/:type/:id', requireRole('content_editor'), validate(putSchema), ah(async (req, res) => {
  const { type, id } = req.params;
  checkTarget(type, id);
  const { stars, note } = req.body;
  await query(
    `INSERT INTO production.ratings (rateable_type, rateable_id, rater_user_id, stars, note)
       VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (rateable_type, rateable_id, rater_user_id)
       DO UPDATE SET stars = EXCLUDED.stars, note = EXCLUDED.note`,
    [type, id, req.auth.user.id, stars, note ?? null]
  );
  res.json(await aggregate(type, id, req.auth.user.id));
}));

// DELETE the caller's rating.
router.delete('/:type/:id', requireRole('content_editor'), ah(async (req, res) => {
  const { type, id } = req.params;
  checkTarget(type, id);
  await query(
    'DELETE FROM production.ratings WHERE rateable_type = $1 AND rateable_id = $2 AND rater_user_id = $3',
    [type, id, req.auth.user.id]
  );
  res.json(await aggregate(type, id, req.auth.user.id));
}));

export default router;
