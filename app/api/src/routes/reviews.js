import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { isUuid, albumUuid } from '../ids.js';
import { getArtist } from '../manifest.js';
import { HttpError, requireAuth } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { sanitizeText } from '../util/sanitize.js';

// ============================================================================
// Public Rating & Review API.
//
// Unlike /api/ratings and /api/comments (editorial, content_editor-gated), this
// surface is for the PUBLIC: any authenticated user (viewer+) may rate, review,
// vote, and report. Guests can read summaries and published reviews. Backed by
// the production.user_reviews family (migration 0010).
//
// A rating and a review are one row: stars (required) + optional title/body.
// "rating_count" counts all rows; "review_count" counts rows with a body.
// ============================================================================
const router = Router();
const TARGET = new Set(['album', 'song']);
const SORTS = {
  recent:  'created_at DESC',
  highest: 'stars DESC, created_at DESC',
  lowest:  'stars ASC, created_at DESC',
  helpful: 'helpful_count DESC, created_at DESC',
};

function checkTarget(type, id) {
  if (!TARGET.has(type)) throw new HttpError(400, 'target type must be album or song');
  if (!isUuid(id)) throw new HttpError(400, 'target id must be a UUID');
}

const EMPTY_SUMMARY = (type, id) => ({
  target_type: type, target_id: id, average: null,
  rating_count: 0, review_count: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
});

function summaryRowToDto(r) {
  return {
    target_type: r.target_type,
    target_id: r.target_id,
    average: r.avg_stars != null ? Number(r.avg_stars) : null,
    rating_count: r.rating_count,
    review_count: r.review_count,
    distribution: { 1: r.dist_1, 2: r.dist_2, 3: r.dist_3, 4: r.dist_4, 5: r.dist_5 },
  };
}

// Fetch the cached summaries for a set of [type,id] targets in one query.
async function summariesFor(targets) {
  if (!targets.length) return new Map();
  const types = targets.map((t) => t.type);
  const ids = targets.map((t) => t.id);
  const r = await query(
    `SELECT s.* FROM production.review_summaries s
       JOIN unnest($1::text[], $2::uuid[]) AS t(tt, ti)
         ON s.target_type = t.tt::production.rateable_type AND s.target_id = t.ti`,
    [types, ids]
  );
  const map = new Map();
  for (const row of r.rows) map.set(`${row.target_type}:${row.target_id}`, summaryRowToDto(row));
  return map;
}

// The caller's own ratings for a set of targets (any status, not deleted).
async function mineFor(userId, targets) {
  if (!userId || !targets.length) return new Map();
  const types = targets.map((t) => t.type);
  const ids = targets.map((t) => t.id);
  const r = await query(
    `SELECT ur.target_type, ur.target_id, ur.id, ur.stars, ur.title, ur.body, ur.status,
            ur.created_at, ur.updated_at, ur.helpful_count
       FROM production.user_reviews ur
       JOIN unnest($1::text[], $2::uuid[]) AS t(tt, ti)
         ON ur.target_type = t.tt::production.rateable_type AND ur.target_id = t.ti
      WHERE ur.reviewer_user_id = $3 AND ur.deleted_at IS NULL`,
    [types, ids, userId]
  );
  const map = new Map();
  for (const row of r.rows) {
    map.set(`${row.target_type}:${row.target_id}`, {
      id: row.id, stars: row.stars, title: row.title, body: row.body,
      status: row.status, helpful_count: row.helpful_count,
      created_at: row.created_at,
      edited: row.updated_at && row.created_at && row.updated_at > row.created_at,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Notifications helper (§14) — created inside the caller's transaction.
// ---------------------------------------------------------------------------
async function notify(client, userId, kind, reviewId, data) {
  await client.query(
    `INSERT INTO production.review_notifications (user_id, kind, review_id, data)
       VALUES ($1, $2, $3, $4)`,
    [userId, kind, reviewId ?? null, JSON.stringify(data || {})]
  );
}

// ===========================================================================
// SPECIFIC ROUTES FIRST (so they win over the generic /:type/:id below).
// ===========================================================================

// ---- Batch summaries (§6 song listing) ------------------------------------
// One round-trip for an album + all its songs. Returns a map keyed "type:id".
const batchSchema = z.object({
  targets: z.array(z.object({
    type: z.enum(['album', 'song']),
    id: z.string().uuid(),
  })).min(1).max(200),
});
router.post('/summaries', validate(batchSchema), ah(async (req, res) => {
  const targets = req.body.targets;
  const userId = req.auth?.user?.id;
  const [sums, mine] = await Promise.all([summariesFor(targets), mineFor(userId, targets)]);
  const out = {};
  for (const t of targets) {
    const key = `${t.type}:${t.id}`;
    out[key] = {
      ...(sums.get(key) || EMPTY_SUMMARY(t.type, t.id)),
      mine: mine.get(key) || null,
    };
  }
  res.json({ summaries: out });
}));

// ---- Merged review list across many targets (§7 "All / Album / Song") -----
// The Reviews page passes [album] for "Album Reviews", [song] for one song, or
// [album + every song] for "All Reviews". Single paginated, sorted query.
const listSchema = z.object({
  targets: z.array(z.object({
    type: z.enum(['album', 'song']),
    id: z.string().uuid(),
  })).min(1).max(200),
  sort: z.enum(['recent', 'highest', 'lowest', 'helpful']).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
router.post('/list', validate(listSchema), ah(async (req, res) => {
  const { targets } = req.body;
  const sort = SORTS[req.body.sort] ? req.body.sort : 'recent';
  const page = req.body.page || 1;
  const limit = req.body.limit || 10;
  const offset = (page - 1) * limit;
  const userId = req.auth?.user?.id || null;
  const types = targets.map((t) => t.type);
  const ids = targets.map((t) => t.id);

  // Only published, non-deleted rows that actually carry a written review.
  const whereTargets = `JOIN unnest($1::text[], $2::uuid[]) AS t(tt, ti)
      ON ur.target_type = t.tt::production.rateable_type AND ur.target_id = t.ti`;
  const baseWhere = `ur.deleted_at IS NULL AND ur.status = 'published'
      AND ur.body IS NOT NULL AND char_length(trim(ur.body)) > 0`;

  const totalR = await query(
    `SELECT COUNT(*)::int AS n FROM production.user_reviews ur ${whereTargets} WHERE ${baseWhere}`,
    [types, ids]
  );
  const total = totalR.rows[0].n;

  const rows = await query(
    `SELECT ur.id, ur.target_type, ur.target_id, ur.stars, ur.title, ur.body,
            ur.helpful_count, ur.created_at, ur.updated_at,
            u.display_name AS author_name, u.avatar_url AS author_avatar,
            (ur.reviewer_user_id = $5) AS mine,
            ($5 IS NOT NULL AND EXISTS (
               SELECT 1 FROM production.review_helpful_votes v
                WHERE v.review_id = ur.id AND v.user_id = $5)) AS voted
       FROM production.user_reviews ur
       ${whereTargets}
       JOIN identity.users u ON u.id = ur.reviewer_user_id
      WHERE ${baseWhere}
      ORDER BY ${SORTS[sort]}
      LIMIT $3 OFFSET $4`,
    [types, ids, limit, offset, userId]
  );

  res.json({
    items: rows.rows.map(reviewRowToDto),
    page, limit, total, has_more: offset + rows.rows.length < total, sort,
  });
}));

// ---- Artist aggregate (§12) -----------------------------------------------
router.get('/artist/:slug/summary', ah(async (req, res) => {
  const artist = getArtist(req.params.slug);
  if (!artist) throw new HttpError(404, 'artist not found');
  const albumIds = (artist.albums || []).map((a) => a.id);
  if (!albumIds.length) {
    return res.json({ slug: artist.slug, average: null, rating_count: 0, review_count: 0, album_count: 0 });
  }
  // Average across all of the artist's albums, weighted by each album's ratings.
  const r = await query(
    `SELECT ROUND((SUM(avg_stars * rating_count) / NULLIF(SUM(rating_count), 0))::numeric, 2) AS average,
            COALESCE(SUM(rating_count), 0)::int AS rating_count,
            COALESCE(SUM(review_count), 0)::int AS review_count,
            COUNT(*) FILTER (WHERE rating_count > 0)::int AS rated_albums
       FROM production.review_summaries
      WHERE target_type = 'album' AND target_id = ANY($1::uuid[])`,
    [albumIds]
  );
  const row = r.rows[0];
  res.json({
    slug: artist.slug,
    average: row.average != null ? Number(row.average) : null,
    rating_count: row.rating_count,
    review_count: row.review_count,
    album_count: row.rated_albums,
  });
}));

// ---- My contributions (§13) -----------------------------------------------
router.get('/me/contributions', requireAuth, ah(async (req, res) => {
  const uid = req.auth.user.id;
  const r = await query(
    `SELECT
        COUNT(*) FILTER (WHERE target_type = 'album')::int AS albums_rated,
        COUNT(*) FILTER (WHERE target_type = 'song')::int  AS songs_rated,
        COUNT(*) FILTER (WHERE body IS NOT NULL AND char_length(trim(body)) > 0)::int AS reviews_written,
        COUNT(*)::int AS total_contributions,
        COALESCE(SUM(helpful_count), 0)::int AS helpful_received
       FROM production.user_reviews
      WHERE reviewer_user_id = $1 AND deleted_at IS NULL`,
    [uid]
  );
  res.json(r.rows[0]);
}));

// ---- My reviews (§13 profile listing) -------------------------------------
router.get('/me/reviews', requireAuth, ah(async (req, res) => {
  const uid = req.auth.user.id;
  const r = await query(
    `SELECT id, target_type, target_id, stars, title, body, status,
            helpful_count, created_at, updated_at
       FROM production.user_reviews
      WHERE reviewer_user_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 200`,
    [uid]
  );
  res.json(r.rows.map((row) => ({
    id: row.id, target_type: row.target_type, target_id: row.target_id,
    stars: row.stars, title: row.title, body: row.body, status: row.status,
    helpful_count: row.helpful_count, created_at: row.created_at,
    edited: row.updated_at > row.created_at,
  })));
}));

// ---- Notifications (§14) --------------------------------------------------
router.get('/notifications', requireAuth, ah(async (req, res) => {
  const uid = req.auth.user.id;
  const r = await query(
    `SELECT id, kind, review_id, data, read_at, created_at
       FROM production.review_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 100`,
    [uid]
  );
  const unread = r.rows.filter((n) => !n.read_at).length;
  res.json({ items: r.rows, unread });
}));

const readSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });
router.post('/notifications/read', requireAuth, validate(readSchema), ah(async (req, res) => {
  const uid = req.auth.user.id;
  if (req.body.ids && req.body.ids.length) {
    await query(
      `UPDATE production.review_notifications SET read_at = NOW()
        WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
      [uid, req.body.ids]
    );
  } else {
    await query(
      'UPDATE production.review_notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
      [uid]
    );
  }
  res.json({ ok: true });
}));

// ---- Helpful vote toggle (§9) ---------------------------------------------
router.post('/review/:reviewId/helpful', requireAuth, ah(async (req, res) => {
  const { reviewId } = req.params;
  if (!isUuid(reviewId)) throw new HttpError(400, 'invalid review id');
  const uid = req.auth.user.id;

  const result = await withTransaction(async (client) => {
    const rev = await client.query(
      `SELECT id, reviewer_user_id, status, deleted_at FROM production.user_reviews WHERE id = $1`,
      [reviewId]
    );
    if (!rev.rowCount || rev.rows[0].deleted_at || rev.rows[0].status !== 'published') {
      throw new HttpError(404, 'review not found');
    }
    const existing = await client.query(
      'SELECT 1 FROM production.review_helpful_votes WHERE review_id = $1 AND user_id = $2',
      [reviewId, uid]
    );
    let voted;
    if (existing.rowCount) {
      await client.query(
        'DELETE FROM production.review_helpful_votes WHERE review_id = $1 AND user_id = $2',
        [reviewId, uid]
      );
      voted = false;
    } else {
      await client.query(
        'INSERT INTO production.review_helpful_votes (review_id, user_id) VALUES ($1, $2)',
        [reviewId, uid]
      );
      voted = true;
      // Notify the author of the new helpful vote (not for self-votes).
      if (rev.rows[0].reviewer_user_id !== uid) {
        await notify(client, rev.rows[0].reviewer_user_id, 'helpful_vote', reviewId,
          { by: req.auth.user.displayName });
      }
    }
    const cnt = await client.query(
      'SELECT COUNT(*)::int AS n FROM production.review_helpful_votes WHERE review_id = $1',
      [reviewId]
    );
    return { voted, helpful_count: cnt.rows[0].n };
  });
  res.json(result);
}));

// ---- Report a review (§10) ------------------------------------------------
const reportSchema = z.object({
  reason: z.enum(['spam', 'offensive_language', 'hate_speech', 'fake_review', 'other']),
  detail: z.string().max(1000).optional(),
});
router.post('/review/:reviewId/report', requireAuth, validate(reportSchema), ah(async (req, res) => {
  const { reviewId } = req.params;
  if (!isUuid(reviewId)) throw new HttpError(400, 'invalid review id');
  const uid = req.auth.user.id;
  const rev = await query('SELECT 1 FROM production.user_reviews WHERE id = $1 AND deleted_at IS NULL', [reviewId]);
  if (!rev.rowCount) throw new HttpError(404, 'review not found');
  // Idempotent: re-reporting updates the reason/detail rather than erroring.
  await query(
    `INSERT INTO production.review_reports (review_id, reporter_user_id, reason, detail)
       VALUES ($1, $2, $3, $4)
     ON CONFLICT (review_id, reporter_user_id)
       DO UPDATE SET reason = EXCLUDED.reason, detail = EXCLUDED.detail,
                     status = 'open', created_at = NOW(), resolved_at = NULL, resolved_by = NULL`,
    [reviewId, uid, req.body.reason, sanitizeText(req.body.detail)]
  );
  res.status(201).json({ reported: true });
}));

// ===========================================================================
// GENERIC SINGLE-TARGET ROUTES (must be registered last).
// ===========================================================================

function reviewRowToDto(r) {
  return {
    id: r.id,
    target_type: r.target_type,
    target_id: r.target_id,
    stars: r.stars,
    title: r.title || null,
    body: r.body || null,
    helpful_count: r.helpful_count,
    created_at: r.created_at,
    edited: r.updated_at ? r.updated_at > r.created_at : false,
    author: { display_name: r.author_name || 'Anonymous', avatar_url: r.author_avatar || null },
    mine: r.mine || false,
    voted: r.voted || false,
  };
}

// ---- Single-target summary (public) ---------------------------------------
router.get('/:type/:id/summary', ah(async (req, res) => {
  const { type, id } = req.params;
  checkTarget(type, id);
  const userId = req.auth?.user?.id;
  const [sums, mine] = await Promise.all([
    summariesFor([{ type, id }]),
    mineFor(userId, [{ type, id }]),
  ]);
  res.json({
    ...(sums.get(`${type}:${id}`) || EMPTY_SUMMARY(type, id)),
    mine: mine.get(`${type}:${id}`) || null,
  });
}));

// ---- Single-target review list (public) -----------------------------------
router.get('/:type/:id', ah(async (req, res) => {
  const { type, id } = req.params;
  checkTarget(type, id);
  const sort = SORTS[req.query.sort] ? String(req.query.sort) : 'recent';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;
  const userId = req.auth?.user?.id || null;

  const baseWhere = `ur.target_type = $1 AND ur.target_id = $2 AND ur.deleted_at IS NULL
      AND ur.status = 'published' AND ur.body IS NOT NULL AND char_length(trim(ur.body)) > 0`;

  const totalR = await query(
    `SELECT COUNT(*)::int AS n FROM production.user_reviews ur WHERE ${baseWhere}`,
    [type, id]
  );
  const total = totalR.rows[0].n;

  const rows = await query(
    `SELECT ur.id, ur.target_type, ur.target_id, ur.stars, ur.title, ur.body,
            ur.helpful_count, ur.created_at, ur.updated_at,
            u.display_name AS author_name, u.avatar_url AS author_avatar,
            (ur.reviewer_user_id = $5) AS mine,
            ($5 IS NOT NULL AND EXISTS (
               SELECT 1 FROM production.review_helpful_votes v
                WHERE v.review_id = ur.id AND v.user_id = $5)) AS voted
       FROM production.user_reviews ur
       JOIN identity.users u ON u.id = ur.reviewer_user_id
      WHERE ${baseWhere}
      ORDER BY ${SORTS[sort]}
      LIMIT $3 OFFSET $4`,
    [type, id, limit, offset, userId]
  );
  res.json({
    items: rows.rows.map(reviewRowToDto),
    page, limit, total, has_more: offset + rows.rows.length < total, sort,
  });
}));

// ---- Upsert the caller's rating/review (§2, §3, §4, §5) -------------------
const putSchema = z.object({
  stars: z.number().int().min(1).max(5),
  title: z.string().max(150).optional().nullable(),
  body: z.string().max(5000).optional().nullable(),
});
router.put('/:type/:id', requireAuth, validate(putSchema), ah(async (req, res) => {
  const { type, id } = req.params;
  checkTarget(type, id);
  const uid = req.auth.user.id;
  const title = sanitizeText(req.body.title);
  const body = sanitizeText(req.body.body);

  const row = await query(
    `INSERT INTO production.user_reviews (target_type, target_id, reviewer_user_id, stars, title, body)
       VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (target_type, target_id, reviewer_user_id)
       DO UPDATE SET stars = EXCLUDED.stars, title = EXCLUDED.title, body = EXCLUDED.body,
                     updated_at = NOW(), deleted_at = NULL
     RETURNING id, stars, title, body, status, helpful_count, created_at, updated_at`,
    [type, id, uid, req.body.stars, title, body]
  );
  const sums = await summariesFor([{ type, id }]);
  const r = row.rows[0];
  res.json({
    review: {
      id: r.id, stars: r.stars, title: r.title, body: r.body, status: r.status,
      helpful_count: r.helpful_count, created_at: r.created_at,
      edited: r.updated_at > r.created_at,
    },
    summary: sums.get(`${type}:${id}`) || EMPTY_SUMMARY(type, id),
  });
}));

// ---- Delete the caller's review (§15) -------------------------------------
router.delete('/:type/:id', requireAuth, ah(async (req, res) => {
  const { type, id } = req.params;
  checkTarget(type, id);
  const uid = req.auth.user.id;
  await query(
    `UPDATE production.user_reviews SET deleted_at = NOW()
      WHERE target_type = $1 AND target_id = $2 AND reviewer_user_id = $3 AND deleted_at IS NULL`,
    [type, id, uid]
  );
  const sums = await summariesFor([{ type, id }]);
  res.json({ deleted: true, summary: sums.get(`${type}:${id}`) || EMPTY_SUMMARY(type, id) });
}));

export default router;
