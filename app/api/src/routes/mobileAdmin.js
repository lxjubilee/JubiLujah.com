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
import { getManifest, getFullManifest, listArtists } from '../manifest.js';

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

// ---- Admin config view (everything: pages → hero + sections → items) --------
router.get('/config', ah(async (req, res) => {
  const [cats, sections, items, hero, settings, mtypes, mtAlbums] = await Promise.all([
    query(`SELECT id, key, label, kind, display_order, is_active, is_visible, hero_enabled
             FROM production.mobile_categories ORDER BY display_order, id`),
    query(`SELECT id, category_id, name, kind, display_order, is_active
             FROM production.mobile_sections ORDER BY display_order, id`),
    query(`SELECT id, section_id, category_id, item_type, item_ref, title, album_refs, display_order, is_active
             FROM production.mobile_category_items WHERE section_id IS NOT NULL ORDER BY display_order, id`),
    query(`SELECT id, category_id, album_ref, headline, subtitle, display_order, is_active, starts_at, ends_at
             FROM production.mobile_hero_slides ORDER BY display_order, id`),
    query(`SELECT min_album_count FROM production.mobile_settings WHERE id = 1`),
    query(`SELECT id, genre, label, display_order, is_pinned, is_active
             FROM production.mobile_music_types ORDER BY display_order, id`),
    query(`SELECT id, music_type_id, album_ref, display_order, is_active
             FROM production.mobile_music_type_albums ORDER BY display_order, id`),
  ]);
  const group = (rows, key) => {
    const m = new Map();
    for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
    return m;
  };
  const itemsBySection = group(items.rows, 'section_id');
  const secByCat = group(sections.rows, 'category_id');
  const heroByCat = group(hero.rows, 'category_id');
  const mtAlbumsByType = group(mtAlbums.rows, 'music_type_id');
  // Resolve each curated album's code → title/artist (persona) from the FULL
  // manifest so the admin UI shows album names + persona, never bare codes.
  // Music-type and hero rows key on `album_ref`; section items key on `item_ref`
  // and only resolve for album items (artist items carry a persona slug, not a code).
  const mfst = getFullManifest();
  const albumByRef = (ref) => mfst.byAlbumCode.get(String(ref || '').toUpperCase());
  const withNames = (rows) => rows.map((a) => {
    const al = albumByRef(a.album_ref);
    return { ...a, title: al?.title || a.album_ref, artist: al?.artistName || null };
  });
  const withItemNames = (rows) => rows.map((it) => {
    const al = it.item_type === 'album' ? albumByRef(it.item_ref) : null;
    return { ...it, title: it.title || al?.title || it.item_ref, artist: al?.artistName || null };
  });
  res.json({
    categories: cats.rows.map((c) => ({
      ...c,
      hero: withNames(heroByCat.get(c.id) || []),
      sections: (secByCat.get(c.id) || []).map((s) => ({ ...s, items: withItemNames(itemsBySection.get(s.id) || []) })),
    })),
    musicTypes: mtypes.rows.map((m) => ({ ...m, albums: withNames(mtAlbumsByType.get(m.id) || []) })),
    settings: { min_album_count: settings.rows[0]?.min_album_count ?? 12 },
  });
}));

// ---- Categories ------------------------------------------------------------
const catPatch = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  is_active: z.boolean().optional(),
  is_visible: z.boolean().optional(),
  hero_enabled: z.boolean().optional(),
});
router.patch('/categories/:key', validate(catPatch), ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  const fields = [];
  const vals = [];
  for (const k of ['label', 'is_active', 'is_visible', 'hero_enabled']) {
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

// Create / delete pages (fully dynamic). New pages are `curated` containers;
// their content is defined by the sections + hero added under them.
function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'page';
}
router.post('/categories', validate(z.object({ label: z.string().trim().min(1).max(60) })), ah(async (req, res) => {
  const base = slugify(req.body.label);
  const existing = await query('SELECT key FROM production.mobile_categories');
  const keys = new Set(existing.rows.map((r) => r.key));
  let key = base;
  for (let n = 2; keys.has(key); n += 1) key = `${base}-${n}`;
  const ord = await query('SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM production.mobile_categories');
  const ins = await query(
    `INSERT INTO production.mobile_categories (key, label, kind, display_order, updated_by)
       VALUES ($1,$2,'curated',$3,$4) RETURNING *`,
    [key, req.body.label, ord.rows[0].next, req.auth.user.id]);
  await logActivity({ actor: req.auth, action: 'mobile.page.created', targetId: key, next: ins.rows[0] });
  res.json(ins.rows[0]);
}));

router.delete('/categories/:key', ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  await query('DELETE FROM production.mobile_categories WHERE id = $1', [cat.id]);
  await logActivity({ actor: req.auth, action: 'mobile.page.deleted', targetId: cat.key, prev: cat });
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

// ids arrive from the client as strings (Postgres returns BIGSERIAL/BIGINT ids as
// strings), so coerce each to an integer before validating.
const reorderIds = z.object({ ids: z.array(z.coerce.number().int()).min(1) });
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

// ---- Sections (dynamic, typed rows within a page) --------------------------
async function sectionById(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new HttpError(400, 'Invalid section id');
  const r = await query('SELECT * FROM production.mobile_sections WHERE id = $1', [n]);
  if (!r.rowCount) throw new HttpError(404, 'Section not found');
  return r.rows[0];
}

router.post('/categories/:key/sections', validate(z.object({
  name: z.string().trim().min(1).max(80), kind: z.enum(['artists', 'albums']),
})), ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  const ord = await query(
    'SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM production.mobile_sections WHERE category_id = $1', [cat.id]);
  const ins = await query(
    `INSERT INTO production.mobile_sections (category_id, name, kind, display_order, updated_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [cat.id, req.body.name, req.body.kind, ord.rows[0].next, req.auth.user.id]);
  await logActivity({ actor: req.auth, action: 'mobile.section.added', targetId: cat.key, next: ins.rows[0] });
  res.json(ins.rows[0]);
}));

const sectionPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(['artists', 'albums']).optional(),
  is_active: z.boolean().optional(),
});
router.patch('/sections/:id', validate(sectionPatch), ah(async (req, res) => {
  const sec = await sectionById(req.params.id);
  const fields = [];
  const vals = [];
  for (const k of ['name', 'kind', 'is_active']) {
    if (req.body[k] !== undefined) { vals.push(req.body[k]); fields.push(`${k} = $${vals.length}`); }
  }
  if (!fields.length) return res.json(sec);
  // Switching a section's type clears its items — they no longer match (an album
  // can't live in an "artists" section, and vice-versa).
  if (req.body.kind && req.body.kind !== sec.kind) {
    await query('DELETE FROM production.mobile_category_items WHERE section_id = $1', [sec.id]);
  }
  vals.push(req.auth.user.id);
  vals.push(sec.id);
  const upd = await query(
    `UPDATE production.mobile_sections SET ${fields.join(', ')}, updated_by = $${vals.length - 1}, updated_at = NOW()
      WHERE id = $${vals.length} RETURNING *`, vals);
  await logActivity({ actor: req.auth, action: 'mobile.section.updated', targetId: sec.id, prev: sec, next: upd.rows[0] });
  res.json(upd.rows[0]);
}));

router.delete('/sections/:id', ah(async (req, res) => {
  const sec = await sectionById(req.params.id);
  await query('DELETE FROM production.mobile_sections WHERE id = $1', [sec.id]);
  await logActivity({ actor: req.auth, action: 'mobile.section.removed', targetId: sec.id, prev: sec });
  res.json({ ok: true });
}));

router.patch('/categories/:key/sections-order', validate(reorderIds), ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  await withTransaction(async (client) => {
    for (let i = 0; i < req.body.ids.length; i += 1) {
      await client.query('UPDATE production.mobile_sections SET display_order = $1 WHERE id = $2 AND category_id = $3',
        [i + 1, req.body.ids[i], cat.id]);
    }
  });
  await logActivity({ actor: req.auth, action: 'mobile.sections.reordered', targetId: cat.key, next: req.body.ids });
  res.json({ ok: true });
}));

// Add an item to a section. The item type is derived from the section's kind
// (artists → artist, albums → album), so the picker only supplies the ref.
router.post('/sections/:id/items', validate(z.object({
  item_ref: z.string().trim().min(1).max(120), title: z.string().trim().max(80).optional(),
})), ah(async (req, res) => {
  const sec = await sectionById(req.params.id);
  const item_type = sec.kind === 'artists' ? 'artist' : 'album';
  const ord = await query(
    'SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM production.mobile_category_items WHERE section_id = $1', [sec.id]);
  const ins = await query(
    `INSERT INTO production.mobile_category_items (category_id, section_id, item_type, item_ref, title, display_order)
       VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (section_id, item_type, item_ref) DO UPDATE SET is_active = TRUE
     RETURNING *`,
    [sec.category_id, sec.id, item_type, req.body.item_ref, req.body.title || null, ord.rows[0].next]);
  await logActivity({ actor: req.auth, action: 'mobile.item.added', targetId: sec.id, next: ins.rows[0] });
  res.json(ins.rows[0]);
}));

router.patch('/sections/:id/items-order', validate(reorderIds), ah(async (req, res) => {
  const sec = await sectionById(req.params.id);
  await withTransaction(async (client) => {
    for (let i = 0; i < req.body.ids.length; i += 1) {
      await client.query('UPDATE production.mobile_category_items SET display_order = $1 WHERE id = $2 AND section_id = $3',
        [i + 1, req.body.ids[i], sec.id]);
    }
  });
  await logActivity({ actor: req.auth, action: 'mobile.items.reordered', targetId: sec.id, next: req.body.ids });
  res.json({ ok: true });
}));

// ---- Hero slides (per page) ------------------------------------------------
const heroBody = z.object({
  album_ref: z.string().trim().min(1).max(120),
  headline: z.string().trim().max(120).optional(),
  subtitle: z.string().trim().max(160).optional(),
  starts_at: z.string().trim().max(40).optional().nullable(),
  ends_at: z.string().trim().max(40).optional().nullable(),
});
router.post('/categories/:key/hero-slides', validate(heroBody), ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  const ord = await query(
    'SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM production.mobile_hero_slides WHERE category_id = $1', [cat.id]);
  const ins = await query(
    `INSERT INTO production.mobile_hero_slides (category_id, album_ref, headline, subtitle, starts_at, ends_at, display_order, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [cat.id, req.body.album_ref, req.body.headline || null, req.body.subtitle || null,
      req.body.starts_at || null, req.body.ends_at || null, ord.rows[0].next, req.auth.user.id]);
  await logActivity({ actor: req.auth, action: 'mobile.hero.added', targetId: cat.key, next: ins.rows[0] });
  res.json(ins.rows[0]);
}));

const heroPatch = z.object({
  headline: z.string().trim().max(120).optional().nullable(),
  subtitle: z.string().trim().max(160).optional().nullable(),
  is_active: z.boolean().optional(),
  starts_at: z.string().trim().max(40).optional().nullable(),
  ends_at: z.string().trim().max(40).optional().nullable(),
});
router.patch('/hero-slides/:id', validate(heroPatch), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const fields = [];
  const vals = [];
  for (const k of ['headline', 'subtitle', 'is_active', 'starts_at', 'ends_at']) {
    if (req.body[k] !== undefined) { vals.push(req.body[k] === '' ? null : req.body[k]); fields.push(`${k} = $${vals.length}`); }
  }
  if (!fields.length) throw new HttpError(400, 'Nothing to update');
  vals.push(req.auth.user.id);
  vals.push(id);
  const upd = await query(
    `UPDATE production.mobile_hero_slides SET ${fields.join(', ')}, updated_by = $${vals.length - 1}, updated_at = NOW()
      WHERE id = $${vals.length} RETURNING *`, vals);
  if (!upd.rowCount) throw new HttpError(404, 'Hero slide not found');
  await logActivity({ actor: req.auth, action: 'mobile.hero.updated', targetId: id, next: upd.rows[0] });
  res.json(upd.rows[0]);
}));

router.delete('/hero-slides/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const del = await query('DELETE FROM production.mobile_hero_slides WHERE id = $1 RETURNING *', [id]);
  if (!del.rowCount) throw new HttpError(404, 'Hero slide not found');
  await logActivity({ actor: req.auth, action: 'mobile.hero.removed', targetId: id, prev: del.rows[0] });
  res.json({ ok: true });
}));

router.patch('/categories/:key/hero-order', validate(reorderIds), ah(async (req, res) => {
  const cat = await categoryByKey(req.params.key);
  await withTransaction(async (client) => {
    for (let i = 0; i < req.body.ids.length; i += 1) {
      await client.query('UPDATE production.mobile_hero_slides SET display_order = $1 WHERE id = $2 AND category_id = $3',
        [i + 1, req.body.ids[i], cat.id]);
    }
  });
  await logActivity({ actor: req.auth, action: 'mobile.hero.reordered', targetId: cat.key, next: req.body.ids });
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

// ---- Music type albums (manual per-genre membership) -----------------------
async function musicTypeById(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new HttpError(400, 'Invalid music type id');
  const r = await query('SELECT * FROM production.mobile_music_types WHERE id = $1', [n]);
  if (!r.rowCount) throw new HttpError(404, 'Music type not found');
  return r.rows[0];
}
// Album codes from the manifest whose genre tags include `genre` (case-insensitive).
function albumsForGenre(genre, limit = 60) {
  const g = String(genre).toLowerCase();
  const m = getManifest();
  const out = [];
  for (const [code, al] of m.byAlbumCode) {
    if ((al.genres || []).some((x) => String(x).toLowerCase() === g)) out.push(code);
    if (out.length >= limit) break;
  }
  return out;
}

router.post('/music-types/:id/albums', validate(z.object({ album_ref: z.string().trim().min(1).max(120) })), ah(async (req, res) => {
  const mt = await musicTypeById(req.params.id);
  const ord = await query('SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM production.mobile_music_type_albums WHERE music_type_id = $1', [mt.id]);
  const ins = await query(
    `INSERT INTO production.mobile_music_type_albums (music_type_id, album_ref, display_order)
       VALUES ($1,$2,$3)
     ON CONFLICT (music_type_id, album_ref) DO UPDATE SET is_active = TRUE
     RETURNING *`,
    [mt.id, req.body.album_ref, ord.rows[0].next]);
  await logActivity({ actor: req.auth, action: 'mobile.musictype.album.added', targetId: mt.id, next: ins.rows[0] });
  res.json(ins.rows[0]);
}));

router.delete('/music-type-albums/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const del = await query('DELETE FROM production.mobile_music_type_albums WHERE id = $1 RETURNING *', [id]);
  if (!del.rowCount) throw new HttpError(404, 'Not found');
  await logActivity({ actor: req.auth, action: 'mobile.musictype.album.removed', targetId: id, prev: del.rows[0] });
  res.json({ ok: true });
}));

router.patch('/music-types/:id/albums-order', validate(reorderIds), ah(async (req, res) => {
  const mt = await musicTypeById(req.params.id);
  await withTransaction(async (client) => {
    for (let i = 0; i < req.body.ids.length; i += 1) {
      await client.query('UPDATE production.mobile_music_type_albums SET display_order = $1 WHERE id = $2 AND music_type_id = $3',
        [i + 1, req.body.ids[i], mt.id]);
    }
  });
  await logActivity({ actor: req.auth, action: 'mobile.musictype.albums.reordered', targetId: mt.id, next: req.body.ids });
  res.json({ ok: true });
}));

// Convenience: seed a genre's album list from the catalog's genre tags (admin
// then curates). Existing entries are kept; only new matches are appended.
router.post('/music-types/:id/autofill', ah(async (req, res) => {
  const mt = await musicTypeById(req.params.id);
  const codes = albumsForGenre(mt.genre, 60);
  let added = 0;
  await withTransaction(async (client) => {
    const ordR = await client.query('SELECT COALESCE(MAX(display_order), 0) AS max FROM production.mobile_music_type_albums WHERE music_type_id = $1', [mt.id]);
    let ord = ordR.rows[0].max;
    for (const code of codes) {
      ord += 1;
      const r = await client.query(
        `INSERT INTO production.mobile_music_type_albums (music_type_id, album_ref, display_order)
           VALUES ($1,$2,$3) ON CONFLICT (music_type_id, album_ref) DO NOTHING`,
        [mt.id, code, ord]);
      if (r.rowCount) added += 1;
    }
  });
  await logActivity({ actor: req.auth, action: 'mobile.musictype.autofill', targetId: mt.id, next: { genre: mt.genre, added } });
  res.json({ ok: true, added, matched: codes.length });
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
  res.json(listArtists(category, { full: true }).map((a) => ({ slug: a.slug, name: a.name, category: a.category, albumCount: a.albumCount })));
}));

router.get('/pick/albums', ah(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 100));
  const m = getFullManifest();
  const matches = [];
  for (const [code, al] of m.byAlbumCode) {
    if (q && !(`${al.title} ${code} ${al.artistName}`.toLowerCase().includes(q))) continue;
    matches.push({ code, title: al.title, artist: al.artistName, category: al.categoryLabel });
  }
  // Alphabetical by title (the primary label shown as "Title — Artist"), artist as
  // tiebreaker, THEN page. Sorting before paging keeps each page stable and stops the
  // list from being monopolized by whichever artist appears first in the manifest.
  matches.sort((a, b) =>
    (a.title || '').localeCompare(b.title || '') ||
    (a.artist || '').localeCompare(b.artist || ''));
  const total = matches.length;
  const start = (page - 1) * pageSize;
  res.json({ items: matches.slice(start, start + pageSize), total, page, pageSize });
}));

export default router;
