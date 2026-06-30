import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query } from '../db.js';
import { isUuid } from '../ids.js';
import { HttpError, requireRole } from '../middleware/rbac.js';

// §11 awards & nominations, backed by production.* tables.
const router = Router();

router.get('/categories', ah(async (req, res) => {
  const onlyActive = req.query.active === 'true';
  const r = await query(
    `SELECT id, name, description, rateable_type, active
       FROM production.award_categories
      ${onlyActive ? 'WHERE active = TRUE' : ''}
      ORDER BY name`
  );
  res.json(r.rows);
}));

router.get('/periods/:year', ah(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year)) throw new HttpError(400, 'year must be an integer');
  const r = await query(
    `SELECT p.id, p.category_id, c.name AS category_name, c.description AS category_description,
            c.rateable_type, p.year, p.opens_at, p.closes_at, p.status
       FROM production.award_periods p
       JOIN production.award_categories c ON c.id = p.category_id
      WHERE p.year = $1
      ORDER BY c.name`,
    [year]
  );
  res.json(r.rows);
}));

// POST a nomination. The 250-char justification rule is enforced here AND by a
// Postgres CHECK constraint (reason_min_length) — defense in depth.
router.post('/nominations', requireRole('content_editor'), ah(async (req, res) => {
  const periodId = req.body.period_id;
  const type = req.body.rateable_type || req.body.type;
  const id = req.body.rateable_id || req.body.id;
  const reason = typeof req.body.reason === 'string' ? req.body.reason : '';

  if (!isUuid(periodId)) throw new HttpError(400, 'period_id required (uuid)');
  if (!['song', 'album'].includes(type)) throw new HttpError(400, 'rateable_type must be song or album');
  if (!isUuid(id)) throw new HttpError(400, 'rateable_id required (uuid)');

  const trimmed = reason.trim().length;
  if (trimmed < 250) {
    throw new HttpError(422, 'Justification too short', {
      message: `Justification must be at least 250 characters (after trim). Current: ${trimmed}. Add ${250 - trimmed} more.`,
      current_length: trimmed,
      required_length: 250,
    });
  }

  const period = await query('SELECT id FROM production.award_periods WHERE id = $1', [periodId]);
  if (!period.rowCount) throw new HttpError(404, 'period not found');

  try {
    const r = await query(
      `INSERT INTO production.nominations (period_id, rateable_type, rateable_id, nominator_id, reason)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [periodId, type, id, req.auth.user.id, reason]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'You already nominated this object for this period');
    throw err;
  }
}));

router.get('/nominations', ah(async (req, res) => {
  const { period: yearQ, category, type, id } = req.query;
  const where = [];
  const params = [];
  let join = 'JOIN production.award_periods p ON p.id = n.period_id';
  if (yearQ) { params.push(Number(yearQ)); where.push(`p.year = $${params.length}`); }
  if (category) { params.push(category); where.push(`p.category_id = $${params.length}`); }
  if (type) { params.push(type); where.push(`n.rateable_type = $${params.length}`); }
  if (id) { params.push(id); where.push(`n.rateable_id = $${params.length}`); }
  const r = await query(
    `SELECT n.id, n.period_id, p.category_id, n.rateable_type, n.rateable_id,
            n.nominator_id, u.display_name AS nominator_name, n.reason, n.created_at
       FROM production.nominations n
       ${join}
       JOIN identity.users u ON u.id = n.nominator_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY n.created_at DESC`,
    params
  );
  res.json(r.rows);
}));

export default router;
