// ============================================================================
// Mobile App Settings — admin write API (BRD: Mobile App Settings).
//
// Mounted at /api/admin/mobile. EVERY route requires the `admin` role. Manages
// the production.mobile_* tables (migration 0021) that the public
// GET /api/mobile/config endpoint reads. Lets admins control, independently of
// the website: which categories show in the app, their order/visibility, the
// albums/artists/collections inside each, and the Music Type genres.
// ============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../logger.js';
import { getManifest, listArtists } from '../manifest.js';

const router = Router();
router.use(requireRole('admin'));

function logActivity({ actor, action, targetId, prev, next: nextVal }) {
  return query(
    `INSERT INTO production.music_activity_log
       (actor_user_id, actor_name, action, target_type, target_id, previous_value, new_value)
     VALUES ($1,$2,$3,'config',$4,$5,$6)`,
    [actor?.user?.id || null, actor?.user?.displayName || actor?.user?.email || null,
      action, targetId == null ? null : String(targetId),
      prev == null ? null : JSON.stringify(prev), nextVal == null ? null : JSON.stringify(nextVal)],
  ).catch((err) => logger.warn({ err }, 'mobile settings activity log failed'));
}

async function categoryByKey(key) {
  const r = await query('SELECT * FROM production.mobile_categories WHERE key = $1', [key]);
  if (!r.rowCount) throw new HttpError(404, 'Category not found');
  return r.rows[0];
}

// ---- Admin config view (everything, including inactive/hidden) --------------
router.get('/config', ah(async (req, res) => {
  const [cats, items, settings, mtypes] = await Promise.all([
    query(`SELECT id, key, label, kind, display_order, is_active, is_visible
             FROM production.mobile_categories ORDER BY display_order, id`),
    query(`SELECT id, category_id, item_type, item_ref, title, album_refs, display_order, is_active
             FROM production.mobile_category_items ORDER BY display_order, id`),
    query(`SELECT min_album_count FROM production.mobile_settings WHERE id = 1`),
    query(`SELECT id, genre, label, display_order, is_pinned, is_active
             FROM production.mobile_music_types ORDER BY display_order, id`),
  ]);
  const itemsByCat = new Map();
  for (const it of items.rows) {
    if (!itemsByCat.has(it.category_id)) itemsByCat.set(it.category_id, []);
    itemsByCat.get(it.category_id).push(it);
  }
  res.json({
    categories: cats.rows.map((c) => ({ ...c, items: itemsByCat.get(c.id) || [] })),
    musicTypes: mtypes.rows,
    settings: { min_album_count: settings.rows[0]?.min_album_count ?? 12 },
  });
}));

// ---- Categories ------------------------------------------------------------
const catPatch = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  is_active: z.boolean().optional(),
  is_visible: z.boolean().optional(),
});
router.patch('/categories/:key', validate(catPatch), ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  const fields = [];
  const vals = [];
  for (const k of ['label', 'is_active', 'is_visible']) {
    if (req.body[k] !== undefined) { vals.push(req.body[k]); fields.push(`${k} = $${vals.length}`); }
  }
  if (!fields.length) return res.json(cat);
  vals.push(req.auth.user.id);
  vals.push(cat.id);
  const upd = await query(
    `UPDATE production.mobile_categories SET ${fields.join(', ')}, updated_by = $${vals.length - 1}, updated_at = NOW()
      WHERE id = $${vals.length} RETURNING *`, vals);
  await logActivity({ actor: req.auth, action: 'mobile.category.updated', targetId: cat.key, prev: cat, next: upd.rows[0] });
  res.json(upd.rows[0]);
}));

const reorderKeys = z.object({ keys: z.array(z.string()).min(1) });
router.patch('/categories-order', validate(reorderKeys), ah(async (req, res) => {
  await withTransaction(async (client) => {
    for (let i = 0; i < req.body.keys.length; i += 1) {
      await client.query(
        'UPDATE production.mobile_categories SET display_order = $1, updated_at = NOW() WHERE key = $2',
        [i + 1, req.body.keys[i]]);
    }
  });
  await logActivity({ actor: req.auth, action: 'mobile.categories.reordered', targetId: 'categories', next: req.body.keys });
  res.json({ ok: true });
}));

// ---- Category items --------------------------------------------------------
const itemBody = z.object({
  item_type: z.enum(['album', 'artist', 'collection']),
  item_ref: z.string().trim().min(1).max(120),
  title: z.string().trim().max(80).optional(),
  album_refs: z.array(z.string().trim().min(1)).optional(),
});
router.post('/categories/:key/items', validate(itemBody), ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  const ord = await query(
    'SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM production.mobile_category_items WHERE category_id = $1',
    [cat.id]);
  const ins = await query(
    `INSERT INTO production.mobile_category_items (category_id, item_type, item_ref, title, album_refs, display_order)
       VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (category_id, item_type, item_ref) DO UPDATE SET is_active = TRUE
     RETURNING *`,
    [cat.id, req.body.item_type, req.body.item_ref, req.body.title || null,
      req.body.album_refs || null, ord.rows[0].next]);
  await logActivity({ actor: req.auth, action: 'mobile.item.added', targetId: cat.key, next: ins.rows[0] });
  res.json(ins.rows[0]);
}));

router.delete('/items/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid item id');
  const del = await query('DELETE FROM production.mobile_category_items WHERE id = $1 RETURNING *', [id]);
  if (!del.rowCount) throw new HttpError(404, 'Item not found');
  await logActivity({ actor: req.auth, action: 'mobile.item.removed', targetId: id, prev: del.rows[0] });
  res.json({ ok: true });
}));

const itemPatch = z.object({ is_active: z.boolean().optional(), title: z.string().trim().max(80).optional() });
router.patch('/items/:id', validate(itemPatch), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid item id');
  const fields = [];
  const vals = [];
  for (const k of ['is_active', 'title']) {
    if (req.body[k] !== undefined) { vals.push(req.body[k]); fields.push(`${k} = $${vals.length}`); }
  }
  if (!fields.length) throw new HttpError(400, 'Nothing to update');
  vals.push(id);
  const upd = await query(
    `UPDATE production.mobile_category_items SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  if (!upd.rowCount) throw new HttpError(404, 'Item not found');
  await logActivity({ actor: req.auth, action: 'mobile.item.updated', targetId: id, next: upd.rows[0] });
  res.json(upd.rows[0]);
}));

const reorderIds = z.object({ ids: z.array(z.number().int()).min(1) });
router.patch('/categories/:key/items-order', validate(reorderIds), ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  await withTransaction(async (client) => {
    for (let i = 0; i < req.body.ids.length; i += 1) {
      await client.query(
        'UPDATE production.mobile_category_items SET display_order = $1 WHERE id = $2 AND category_id = $3',
        [i + 1, req.body.ids[i], cat.id]);
    }
  });
  await logActivity({ actor: req.auth, action: 'mobile.items.reordered', targetId: cat.key, next: req.body.ids });
  res.json({ ok: true });
}));

// ---- Music types -----------------------------------------------------------
router.post('/music-types', validate(z.object({
  genre: z.string().trim().min(1).max(60), label: z.string().trim().max(60).optional(),
})), ah(async (req, res) => {
  const ord = await query('SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM production.mobile_music_types');
  const ins = await query(
    `INSERT INTO production.mobile_music_types (genre, label, display_order)
       VALUES ($1,$2,$3)
     ON CONFLICT (genre) DO UPDATE SET is_active = TRUE
     RETURNING *`,
    [req.body.genre, req.body.label || req.body.genre, ord.rows[0].next]);
  await logActivity({ actor: req.auth, action: 'mobile.musictype.added', targetId: req.body.genre, next: ins.rows[0] });
  res.json(ins.rows[0]);
}));

const mtPatch = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  is_active: z.boolean().optional(),
  is_pinned: z.boolean().optional(),
});
router.patch('/music-types/:id', validate(mtPatch), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const fields = [];
  const vals = [];
  for (const k of ['label', 'is_active', 'is_pinned']) {
    if (req.body[k] !== undefined) { vals.push(req.body[k]); fields.push(`${k} = $${vals.length}`); }
  }
  if (!fields.length) throw new HttpError(400, 'Nothing to update');
  vals.push(req.auth.user.id);
  vals.push(id);
  const upd = await query(
    `UPDATE production.mobile_music_types SET ${fields.join(', ')}, updated_by = $${vals.length - 1}, updated_at = NOW()
      WHERE id = $${vals.length} RETURNING *`, vals);
  if (!upd.rowCount) throw new HttpError(404, 'Music type not found');
  await logActivity({ actor: req.auth, action: 'mobile.musictype.updated', targetId: id, next: upd.rows[0] });
  res.json(upd.rows[0]);
}));

router.delete('/music-types/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const del = await query(
    'DELETE FROM production.mobile_music_types WHERE id = $1 AND is_pinned = FALSE RETURNING *', [id]);
  if (!del.rowCount) throw new HttpError(400, 'Not found or a pinned type cannot be deleted');
  await logActivity({ actor: req.auth, action: 'mobile.musictype.removed', targetId: id, prev: del.rows[0] });
  res.json({ ok: true });
}));

router.patch('/music-types-order', validate(reorderIds), ah(async (req, res) => {
  await withTransaction(async (client) => {
    for (let i = 0; i < req.body.ids.length; i += 1) {
      await client.query(
        'UPDATE production.mobile_music_types SET display_order = $1 WHERE id = $2', [i + 1, req.body.ids[i]]);
    }
  });
  await logActivity({ actor: req.auth, action: 'mobile.musictypes.reordered', targetId: 'music_types', next: req.body.ids });
  res.json({ ok: true });
}));

// ---- Settings --------------------------------------------------------------
router.patch('/settings', validate(z.object({ min_album_count: z.number().int().min(1).max(1000) })), ah(async (req, res) => {
  const upd = await query(
    `UPDATE production.mobile_settings SET min_album_count = $1, updated_by = $2, updated_at = NOW()
      WHERE id = 1 RETURNING *`, [req.body.min_album_count, req.auth.user.id]);
  await logActivity({ actor: req.auth, action: 'mobile.settings.updated', targetId: 'settings', next: upd.rows[0] });
  res.json(upd.rows[0]);
}));

// ---- Pickers (manifest-backed) ---------------------------------------------
router.get('/pick/artists', ah(async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  res.json(listArtists(category).map((a) => ({ slug: a.slug, name: a.name, category: a.category, albumCount: a.albumCount })));
}));

router.get('/pick/albums', ah(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const m = getManifest();
  const out = [];
  for (const [code, al] of m.byAlbumCode) {
    if (q && !(`${al.title} ${code} ${al.artistName}`.toLowerCase().includes(q))) continue;
    out.push({ code, title: al.title, artist: al.artistName, category: al.categoryLabel });
    if (out.length >= 50) break;
  }
  res.json(out);
}));

export default router;
