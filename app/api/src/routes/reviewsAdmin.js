import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { isUuid } from '../ids.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

// ============================================================================
// Review moderation dashboard + analytics (§11, §19). Admin-only.
//
// Mounted at /api/admin/reviews. Every moderation action is logged to
// production.review_moderation_log (append-only) and notifies the author (§14).
// Names for albums/songs are resolved via LEFT JOIN to catalog.* when the
// catalog has been imported (db/import-catalog.js); otherwise the UUID is
// returned and the UI falls back to it.
// ============================================================================
const router = Router();
router.use(requireRole('admin'));

// Resolve display title for a polymorphic target via the imported catalog.
const TARGET_TITLE_SQL = `
  CASE ur.target_type
    WHEN 'album' THEN (SELECT title FROM catalog.albums WHERE id = ur.target_id)
    WHEN 'song'  THEN (SELECT title FROM catalog.songs  WHERE id = ur.target_id)
  END`;

// Each moderation action maps to a target status + an author notification kind.
const ACTIONS = {
  approve: { status: 'published', notify: 'review_approved', resolve: 'dismissed', clearDeleted: false },
  restore: { status: 'published', notify: 'review_approved', resolve: 'dismissed', clearDeleted: true },
  reject:  { status: 'rejected',  notify: 'review_rejected', resolve: 'actioned',  clearDeleted: false },
  hide:    { status: 'hidden',    notify: 'review_removed',  resolve: 'actioned',  clearDeleted: false },
  delete:  { status: null,        notify: 'review_removed',  resolve: 'actioned',  clearDeleted: false, softDelete: true },
};

// ---- List / search reviews (§11) ------------------------------------------
router.get('/', ah(async (req, res) => {
  const status = typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status : null;
  const targetType = req.query.target_type === 'album' || req.query.target_type === 'song' ? req.query.target_type : null;
  const reported = req.query.reported === 'true';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  const conds = ['ur.deleted_at IS NULL OR $1::boolean']; // include soft-deleted only when ?include_deleted
  const params = [req.query.include_deleted === 'true'];
  let p = params.length;
  if (status) { params.push(status); conds.push(`ur.status = $${++p}`); }
  if (targetType) { params.push(targetType); conds.push(`ur.target_type = $${++p}`); }
  if (q) { params.push(`%${q}%`); conds.push(`(ur.title ILIKE $${++p} OR ur.body ILIKE $${p} OR u.display_name ILIKE $${p})`); }

  const reportJoin = reported
    ? `JOIN (SELECT review_id, COUNT(*) n FROM production.review_reports WHERE status = 'open' GROUP BY review_id) rep ON rep.review_id = ur.id`
    : `LEFT JOIN (SELECT review_id, COUNT(*) n FROM production.review_reports WHERE status = 'open' GROUP BY review_id) rep ON rep.review_id = ur.id`;

  const where = conds.map((c, i) => (i === 0 ? `(${c})` : c)).join(' AND ');

  const totalR = await query(
    `SELECT COUNT(*)::int AS n
       FROM production.user_reviews ur
       JOIN identity.users u ON u.id = ur.reviewer_user_id
       ${reportJoin}
      WHERE ${where}`,
    params
  );

  params.push(limit); const limP = ++p;
  params.push(offset); const offP = ++p;
  const rows = await query(
    `SELECT ur.id, ur.target_type, ur.target_id, ur.stars, ur.title, ur.body, ur.status,
            ur.helpful_count, ur.created_at, ur.updated_at, ur.deleted_at,
            u.id AS author_id, u.display_name AS author_name, u.email AS author_email,
            COALESCE(rep.n, 0)::int AS open_reports,
            (${TARGET_TITLE_SQL}) AS target_title
       FROM production.user_reviews ur
       JOIN identity.users u ON u.id = ur.reviewer_user_id
       ${reportJoin}
      WHERE ${where}
      ORDER BY COALESCE(rep.n, 0) DESC, ur.created_at DESC
      LIMIT $${limP} OFFSET $${offP}`,
    params
  );
  res.json({
    items: rows.rows,
    page, limit, total: totalR.rows[0].n,
    has_more: offset + rows.rows.length < totalR.rows[0].n,
  });
}));

// ---- Reported reviews queue (§10, §11) ------------------------------------
router.get('/reports', ah(async (req, res) => {
  const r = await query(
    `SELECT rr.id, rr.review_id, rr.reason, rr.detail, rr.status, rr.created_at,
            reporter.display_name AS reporter_name,
            ur.target_type, ur.target_id, ur.stars, ur.title, ur.body, ur.status AS review_status,
            author.display_name AS author_name
       FROM production.review_reports rr
       JOIN identity.users reporter ON reporter.id = rr.reporter_user_id
       JOIN production.user_reviews ur ON ur.id = rr.review_id
       JOIN identity.users author ON author.id = ur.reviewer_user_id
      WHERE rr.status = 'open'
      ORDER BY rr.created_at DESC
      LIMIT 200`
  );
  res.json({ items: r.rows });
}));

// ---- Review moderation history (§11) --------------------------------------
router.get('/:id/history', ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid review id');
  const r = await query(
    `SELECT ml.id, ml.action, ml.reason, ml.prev_status, ml.new_status, ml.created_at,
            m.display_name AS moderator_name
       FROM production.review_moderation_log ml
       LEFT JOIN identity.users m ON m.id = ml.moderator_user_id
      WHERE ml.review_id = $1
      ORDER BY ml.created_at DESC`,
    [id]
  );
  res.json({ items: r.rows });
}));

// ---- Moderate a review (§11) ----------------------------------------------
const moderateSchema = z.object({
  action: z.enum(['approve', 'reject', 'hide', 'restore', 'delete']),
  reason: z.string().max(1000).optional(),
});
router.post('/:id/moderate', validate(moderateSchema), ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid review id');
  const { action, reason } = req.body;
  const spec = ACTIONS[action];
  const modId = req.auth.user.id;

  const result = await withTransaction(async (client) => {
    const cur = await client.query(
      'SELECT id, reviewer_user_id, status, deleted_at FROM production.user_reviews WHERE id = $1',
      [id]
    );
    if (!cur.rowCount) throw new HttpError(404, 'review not found');
    const prevStatus = cur.rows[0].status;

    // Apply the state change.
    const sets = [];
    const params = [id];
    let p = 1;
    if (spec.status) { params.push(spec.status); sets.push(`status = $${++p}`); }
    if (spec.softDelete) sets.push('deleted_at = NOW()');
    if (spec.clearDeleted) sets.push('deleted_at = NULL');
    if (sets.length) {
      await client.query(`UPDATE production.user_reviews SET ${sets.join(', ')} WHERE id = $1`, params);
    }
    const newStatus = spec.status || prevStatus;

    // Resolve any open reports on this review.
    await client.query(
      `UPDATE production.review_reports
          SET status = $2, resolved_at = NOW(), resolved_by = $3
        WHERE review_id = $1 AND status = 'open'`,
      [id, spec.resolve, modId]
    );

    // Append to the append-only moderation log.
    await client.query(
      `INSERT INTO production.review_moderation_log
         (review_id, moderator_user_id, action, reason, prev_status, new_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, modId, action, reason ?? null, prevStatus, newStatus]
    );

    // Mirror into the global identity audit log (§17 — log all moderation).
    await client.query(
      `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
         VALUES ($1, $2, 'review', $3, $4)`,
      [modId, `review.${action}`, id, JSON.stringify({ reason: reason ?? null, prevStatus, newStatus })]
    );

    // Notify the author (§14).
    await client.query(
      `INSERT INTO production.review_notifications (user_id, kind, review_id, data)
         VALUES ($1, $2, $3, $4)`,
      [cur.rows[0].reviewer_user_id, spec.notify, id, JSON.stringify({ action, reason: reason ?? null })]
    );

    return { id, action, status: newStatus };
  });
  res.json(result);
}));

// ---- Analytics dashboard (§19) --------------------------------------------
router.get('/analytics', ah(async (req, res) => {
  const topAlbums = await query(
    `SELECT s.target_id, s.avg_stars, s.rating_count, s.review_count,
            (SELECT title FROM catalog.albums WHERE id = s.target_id) AS title
       FROM production.review_summaries s
      WHERE s.target_type = 'album' AND s.rating_count > 0
      ORDER BY s.avg_stars DESC NULLS LAST, s.rating_count DESC
      LIMIT 10`
  );
  const topSongs = await query(
    `SELECT s.target_id, s.avg_stars, s.rating_count, s.review_count,
            (SELECT title FROM catalog.songs WHERE id = s.target_id) AS title
       FROM production.review_summaries s
      WHERE s.target_type = 'song' AND s.rating_count > 0
      ORDER BY s.avg_stars DESC NULLS LAST, s.rating_count DESC
      LIMIT 10`
  );
  const mostReviewedAlbums = await query(
    `SELECT s.target_id, s.review_count, s.rating_count, s.avg_stars,
            (SELECT title FROM catalog.albums WHERE id = s.target_id) AS title
       FROM production.review_summaries s
      WHERE s.target_type = 'album' AND s.review_count > 0
      ORDER BY s.review_count DESC LIMIT 10`
  );
  const mostReviewedSongs = await query(
    `SELECT s.target_id, s.review_count, s.rating_count, s.avg_stars,
            (SELECT title FROM catalog.songs WHERE id = s.target_id) AS title
       FROM production.review_summaries s
      WHERE s.target_type = 'song' AND s.review_count > 0
      ORDER BY s.review_count DESC LIMIT 10`
  );
  const activeReviewers = await query(
    `SELECT u.id, u.display_name,
            COUNT(*)::int AS contributions,
            COUNT(*) FILTER (WHERE ur.body IS NOT NULL AND char_length(trim(ur.body)) > 0)::int AS reviews
       FROM production.user_reviews ur
       JOIN identity.users u ON u.id = ur.reviewer_user_id
      WHERE ur.deleted_at IS NULL
      GROUP BY u.id, u.display_name
      ORDER BY contributions DESC LIMIT 10`
  );
  const platform = await query(
    `SELECT ROUND(AVG(stars)::numeric, 2) AS average,
            COUNT(*)::int AS total_ratings,
            COUNT(*) FILTER (WHERE body IS NOT NULL AND char_length(trim(body)) > 0)::int AS total_reviews
       FROM production.user_reviews
      WHERE deleted_at IS NULL AND status = 'published'`
  );
  const overTime = await query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS ratings,
            COUNT(*) FILTER (WHERE body IS NOT NULL AND char_length(trim(body)) > 0)::int AS reviews
       FROM production.user_reviews
      WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY 1 ORDER BY 1`
  );
  const mostHelpful = await query(
    `SELECT ur.id, ur.target_type, ur.target_id, ur.stars, ur.title, ur.helpful_count,
            u.display_name AS author_name,
            (${TARGET_TITLE_SQL}) AS target_title
       FROM production.user_reviews ur
       JOIN identity.users u ON u.id = ur.reviewer_user_id
      WHERE ur.deleted_at IS NULL AND ur.status = 'published' AND ur.helpful_count > 0
      ORDER BY ur.helpful_count DESC LIMIT 10`
  );

  res.json({
    highest_rated_albums: topAlbums.rows,
    highest_rated_songs: topSongs.rows,
    most_reviewed_albums: mostReviewedAlbums.rows,
    most_reviewed_songs: mostReviewedSongs.rows,
    most_active_reviewers: activeReviewers.rows,
    platform: {
      average: platform.rows[0].average != null ? Number(platform.rows[0].average) : null,
      total_ratings: platform.rows[0].total_ratings,
      total_reviews: platform.rows[0].total_reviews,
    },
    over_time: overTime.rows,
    most_helpful_reviews: mostHelpful.rows,
  });
}));

export default router;
