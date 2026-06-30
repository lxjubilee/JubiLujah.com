// ============================================================================
// Manage Music — admin module API (BRD: Manage Music for Jubilujah.com Admin).
//
// Mounted at /api/admin/music. EVERY route requires the `admin` role. The data
// model is the production.music_* tables (see migration 0015) layered over the
// catalog manifest. No media is duplicated — only metadata + CDN references.
//
//   Dashboard ...... GET  /dashboard
//   Sync ........... POST /sync   GET /sync/runs   GET /sync/runs/:id
//                    GET/PUT /sync/config
//   Albums ......... GET /albums   GET /albums/:code   PATCH /albums/:code/visibility
//                    PATCH /albums/:code/metadata   POST /albums/:code/refresh
//                    POST /albums/:code/validate   DELETE /albums/:code
//   Songs .......... GET /songs   GET /songs/:id   PATCH /songs/:id/visibility
//   Missing ........ GET /missing
//   Bulk ........... POST /bulk
//   Activity ....... GET /activity
//   Export ......... GET /export
// ============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../logger.js';
import { getAlbumByCode } from '../manifest.js';
import { isUuid } from '../ids.js';
import { runSync, refreshAlbum, probeUrl, nextRunAt, validateAlbum } from '../services/musicSync.js';
import { invalidateVisibilityCache } from '../services/musicVisibility.js';

const router = Router();

// ---- Access control: admin only + read-access audit ------------------------
router.use(requireRole('admin'));
router.use((req, res, next) => {
  query(
    `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
       VALUES ($1, 'music.access', 'music', $2, $3)`,
    [req.auth.user.id, req.path, JSON.stringify({ method: req.method, query: req.query })],
  ).catch((err) => logger.warn({ err }, 'music audit log failed'));
  next();
});

// Append an immutable Manage-Music activity record (publish/hide/edit/sync).
function logActivity({ actor, action, targetType, targetId, prev, next: nextVal }) {
  return query(
    `INSERT INTO production.music_activity_log
       (actor_user_id, actor_name, action, target_type, target_id, previous_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actor?.user?.id || null, actor?.user?.displayName || actor?.user?.email || null,
      action, targetType, targetId == null ? null : String(targetId),
      prev == null ? null : JSON.stringify(prev), nextVal == null ? null : JSON.stringify(nextVal)],
  ).catch((err) => logger.warn({ err }, 'music activity log failed'));
}

const num = (v) => (v == null ? 0 : Number(v));

// ===========================================================================
// DASHBOARD — summary cards
// ===========================================================================
router.get('/dashboard', ah(async (req, res) => {
  const albums = await query(`
    SELECT
      COUNT(*) FILTER (WHERE present_in_manifest)                                   AS total_albums,
      COUNT(*) FILTER (WHERE present_in_manifest AND visibility='published')        AS published,
      COUNT(*) FILTER (WHERE visibility='hidden')                                   AS hidden,
      COUNT(*) FILTER (WHERE present_in_manifest AND cover_present IS FALSE)        AS missing_cover,
      COUNT(*) FILTER (WHERE present_in_manifest AND visibility='draft')            AS pending_review,
      COUNT(*) FILTER (WHERE present_in_manifest AND metadata_complete IS FALSE)    AS missing_metadata,
      COUNT(*) FILTER (WHERE NOT present_in_manifest)                               AS broken_refs,
      COUNT(DISTINCT artist_slug) FILTER (WHERE present_in_manifest)                AS artists
    FROM production.music_album_state`);
  const songs = await query(`
    SELECT
      COUNT(*) FILTER (WHERE present_in_manifest)                                   AS total_songs,
      COUNT(*) FILTER (WHERE present_in_manifest AND visibility='published')        AS published,
      COUNT(*) FILTER (WHERE visibility='hidden')                                   AS hidden,
      COUNT(*) FILTER (WHERE present_in_manifest AND mp3_available IS FALSE)        AS missing_audio,
      COUNT(*) FILTER (WHERE present_in_manifest AND metadata_complete IS FALSE)    AS missing_metadata
    FROM production.music_song_state`);
  const last = await query(
    `SELECT id, trigger, status, started_at, finished_at, summary
       FROM production.music_sync_runs ORDER BY started_at DESC LIMIT 1`);
  const cfg = await query(`SELECT schedule, enabled, last_run_at, next_run_at FROM production.music_sync_config WHERE id=1`);
  const a = albums.rows[0]; const s = songs.rows[0];

  res.json({
    cards: {
      total_albums_cdn: num(a.total_albums),
      albums_published: num(a.published),
      albums_hidden: num(a.hidden),
      albums_missing_cover: num(a.missing_cover),
      total_songs_cdn: num(s.total_songs),
      songs_published: num(s.published),
      songs_hidden: num(s.hidden),
      songs_missing_audio: num(s.missing_audio),
      total_artists: num(a.artists),
      albums_pending_review: num(a.pending_review),
      albums_missing_metadata: num(a.missing_metadata),
      songs_missing_metadata: num(s.missing_metadata),
      broken_references: num(a.broken_refs),
    },
    last_sync: last.rows[0] || null,
    schedule: cfg.rows[0] || null,
    initialized: num(a.total_albums) + num(a.broken_refs) > 0,
  });
}));

// ===========================================================================
// SYNC
// ===========================================================================
const syncSchema = z.object({ probe: z.enum(['none', 'missing', 'all']).optional() });
router.post('/sync', validate(syncSchema), ah(async (req, res) => {
  const result = await runSync({ trigger: 'manual', actorUserId: req.auth.user.id, probe: req.body.probe || 'missing' });
  invalidateVisibilityCache();
  await logActivity({ actor: req.auth, action: 'sync.executed', targetType: 'sync', targetId: result.runId, next: result });
  res.json(result);
}));

router.get('/sync/runs', ah(async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const r = await query(
    `SELECT id, trigger, status, actor_user_id, started_at, finished_at, albums_scanned, songs_scanned,
            albums_new, songs_new, albums_updated, songs_updated, albums_removed, songs_removed,
            missing_covers, missing_audio, summary, error
       FROM production.music_sync_runs ORDER BY started_at DESC LIMIT $1`, [limit]);
  res.json(r.rows);
}));

router.get('/sync/runs/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw new HttpError(400, 'invalid run id');
  const r = await query(`SELECT * FROM production.music_sync_runs WHERE id=$1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'sync run not found');
  res.json(r.rows[0]);
}));

router.get('/sync/config', ah(async (req, res) => {
  const r = await query(`SELECT schedule, enabled, last_run_at, next_run_at, updated_at FROM production.music_sync_config WHERE id=1`);
  res.json(r.rows[0] || { schedule: 'off', enabled: false });
}));

const cfgSchema = z.object({
  schedule: z.enum(['off', 'hourly', '6h', '12h', 'daily', 'weekly']),
  enabled: z.boolean(),
});
router.put('/sync/config', validate(cfgSchema), ah(async (req, res) => {
  const { schedule, enabled } = req.body;
  const next = enabled && schedule !== 'off' ? nextRunAt(schedule) : null;
  const r = await query(
    `UPDATE production.music_sync_config
       SET schedule=$1, enabled=$2, next_run_at=$3, updated_by=$4, updated_at=NOW()
       WHERE id=1 RETURNING schedule, enabled, last_run_at, next_run_at`,
    [schedule, enabled, next, req.auth.user.id]);
  await logActivity({ actor: req.auth, action: 'sync.config_updated', targetType: 'config', targetId: 'schedule', next: { schedule, enabled } });
  res.json(r.rows[0]);
}));

// ===========================================================================
// ALBUMS — searchable / filterable / sortable / paginated table
// ===========================================================================
const SORTABLE = {
  album_name: 'title', artist: 'artist_name', release: 'release_year',
  updated: 'last_synced_at', songs: 'song_count', visibility: 'visibility', cdn: 'cover_present',
};
router.get('/albums', ah(async (req, res) => {
  const where = []; const params = [];
  const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)); };

  const q = (req.query.q || '').toString().trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(title) LIKE $${params.length} OR lower(artist_name) LIKE $${params.length} OR lower(album_code) LIKE $${params.length})`);
  }
  if (req.query.artist) add('artist_slug = ?', req.query.artist.toString());
  if (req.query.category) add('category = ?', req.query.category.toString());
  if (req.query.year) add('release_year = ?', parseInt(req.query.year, 10) || 0);
  if (req.query.visibility) add('visibility = ?', req.query.visibility.toString());
  if (req.query.cover === 'missing') where.push('cover_present IS FALSE');
  if (req.query.cover === 'present') where.push('cover_present IS TRUE');
  if (req.query.audio === 'missing') where.push('audio_missing_count > 0');
  if (req.query.metadata === 'missing') where.push('metadata_complete IS FALSE');
  if (req.query.metadata === 'complete') where.push('metadata_complete IS TRUE');
  if (req.query.broken === '1') where.push('present_in_manifest IS FALSE');
  else if (req.query.broken !== 'all') where.push('present_in_manifest IS TRUE');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = SORTABLE[req.query.sort] || 'title';
  const dir = (req.query.dir || 'asc').toString().toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

  const total = await query(`SELECT COUNT(*) AS n FROM production.music_album_state ${whereSql}`, params);
  const rows = await query(
    `SELECT album_code, album_id, title, artist_name, artist_slug, category, release_year, cover_url,
            cover_present, song_count, audio_present_count, audio_missing_count, metadata_complete,
            visibility, present_in_manifest, published_at, last_synced_at
       FROM production.music_album_state ${whereSql}
       ORDER BY ${sortCol} ${dir} NULLS LAST, album_code ASC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);

  res.json({ items: rows.rows, total: num(total.rows[0].n), page, pageSize });
}));

// Album detail (BRD: Album Details Page + CDN File Information).
router.get('/albums/:code', ah(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const r = await query(`SELECT * FROM production.music_album_state WHERE album_code=$1`, [code]);
  if (!r.rowCount) throw new HttpError(404, 'album not found in Manage Music — run a sync first');
  const album = r.rows[0];
  const songs = await query(
    `SELECT song_id, track_number, title, duration_seconds, mp3_url, cdn_path, mp3_available,
            lyrics_available, metadata_complete, visibility, present_in_manifest
       FROM production.music_song_state WHERE album_code=$1 ORDER BY track_number`, [code]);
  const validations = await query(
    `SELECT check_name, passed, detail, checked_at FROM production.music_validation_results
       WHERE album_code=$1 ORDER BY check_name`, [code]);
  const manifest = getAlbumByCode(code); // canonical track titles / folder path
  res.json({ album, songs: songs.rows, validation: validations.rows, manifest });
}));

// ---- Album visibility (Publish / Hide / Draft) ----------------------------
const visSchema = z.object({ visibility: z.enum(['published', 'hidden', 'draft']) });
router.patch('/albums/:code/visibility', validate(visSchema), ah(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { visibility } = req.body;
  const prev = await query(`SELECT visibility FROM production.music_album_state WHERE album_code=$1`, [code]);
  if (!prev.rowCount) throw new HttpError(404, 'album not found');
  const r = await query(
    `UPDATE production.music_album_state
       SET visibility=$2, visibility_source='manual',
           published_at = CASE WHEN $2='published' THEN NOW() ELSE published_at END,
           hidden_at    = CASE WHEN $2='hidden'    THEN NOW() ELSE hidden_at END,
           updated_at=NOW()
       WHERE album_code=$1 RETURNING album_code, visibility`, [code, visibility]);
  invalidateVisibilityCache();
  await logActivity({ actor: req.auth, action: `album.${visibility}`, targetType: 'album', targetId: code,
    prev: { visibility: prev.rows[0].visibility }, next: { visibility } });
  res.json(r.rows[0]);
}));

// ---- Album metadata edit (limited, management-side fields) -----------------
const metaSchema = z.object({
  release_year: z.number().int().min(1900).max(2100).nullable().optional(),
  category: z.string().max(120).nullable().optional(),
});
router.patch('/albums/:code/metadata', validate(metaSchema), ah(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const prev = await query(`SELECT release_year, category FROM production.music_album_state WHERE album_code=$1`, [code]);
  if (!prev.rowCount) throw new HttpError(404, 'album not found');
  const release_year = req.body.release_year === undefined ? prev.rows[0].release_year : req.body.release_year;
  const category = req.body.category === undefined ? prev.rows[0].category : req.body.category;
  const r = await query(
    `UPDATE production.music_album_state SET release_year=$2, category=$3, updated_at=NOW()
       WHERE album_code=$1 RETURNING album_code, release_year, category`, [code, release_year, category]);
  await logActivity({ actor: req.auth, action: 'album.metadata_edited', targetType: 'album', targetId: code,
    prev: prev.rows[0], next: { release_year, category } });
  res.json(r.rows[0]);
}));

// ---- Refresh single album from CDN ----------------------------------------
router.post('/albums/:code/refresh', ah(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const result = await refreshAlbum(code);
  if (!result) throw new HttpError(404, 'album not in manifest');
  await logActivity({ actor: req.auth, action: 'album.refreshed', targetType: 'album', targetId: code,
    next: { cover_present: result.cover_present, audio_present: result.audio_present_count } });
  res.json({ album_code: code, refreshed: true, cover_present: result.cover_present, validation: result.validation });
}));

// ---- Validate single album ------------------------------------------------
router.post('/albums/:code/validate', ah(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const r = await query(`SELECT * FROM production.music_album_state WHERE album_code=$1`, [code]);
  if (!r.rowCount) throw new HttpError(404, 'album not found');
  const checks = validateAlbum(r.rows[0], r.rows[0].cover_present);
  await withTransaction(async (client) => {
    await client.query(`UPDATE production.music_album_state SET validation=$2, updated_at=NOW() WHERE album_code=$1`,
      [code, JSON.stringify(checks)]);
    for (const c of checks) {
      await client.query(
        `INSERT INTO production.music_validation_results (album_code, check_name, passed, detail, checked_at)
           VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (album_code, check_name) DO UPDATE SET passed=EXCLUDED.passed, detail=EXCLUDED.detail, checked_at=NOW()`,
        [code, c.check, c.passed, c.detail || null]);
    }
  });
  await logActivity({ actor: req.auth, action: 'album.validated', targetType: 'album', targetId: code, next: { checks } });
  res.json({ album_code: code, validation: checks });
}));

// ---- Delete local reference (does NOT touch CDN files) --------------------
router.delete('/albums/:code', ah(async (req, res) => {
  const code = req.params.code.toUpperCase();
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM production.music_song_state WHERE album_code=$1`, [code]);
    await client.query(`DELETE FROM production.music_validation_results WHERE album_code=$1`, [code]);
    const del = await client.query(`DELETE FROM production.music_album_state WHERE album_code=$1 RETURNING album_code`, [code]);
    if (!del.rowCount) throw new HttpError(404, 'album not found');
  });
  invalidateVisibilityCache();
  await logActivity({ actor: req.auth, action: 'album.local_reference_deleted', targetType: 'album', targetId: code });
  res.json({ album_code: code, deleted: true, note: 'Local reference removed; CDN files untouched. A future sync will re-import it.' });
}));

// ===========================================================================
// SONGS
// ===========================================================================
router.get('/songs', ah(async (req, res) => {
  const where = []; const params = [];
  const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)); };
  const q = (req.query.q || '').toString().trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(title) LIKE $${params.length} OR lower(artist_name) LIKE $${params.length} OR lower(album_code) LIKE $${params.length})`);
  }
  if (req.query.album) add('album_code = ?', req.query.album.toString().toUpperCase());
  if (req.query.visibility) add('visibility = ?', req.query.visibility.toString());
  if (req.query.audio === 'missing') where.push('mp3_available IS FALSE');
  if (req.query.audio === 'present') where.push('mp3_available IS TRUE');
  if (req.query.metadata === 'missing') where.push('metadata_complete IS FALSE');
  if (req.query.broken === '1') where.push('present_in_manifest IS FALSE');
  else if (req.query.broken !== 'all') where.push('present_in_manifest IS TRUE');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const dir = (req.query.dir || 'asc').toString().toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const sortCol = { title: 'title', album: 'album_code', updated: 'last_synced_at' }[req.query.sort] || 'album_code';

  const total = await query(`SELECT COUNT(*) AS n FROM production.music_song_state ${whereSql}`, params);
  const rows = await query(
    `SELECT song_id, album_code, track_number, title, artist_name, duration_seconds, mp3_url, cdn_path,
            mp3_available, lyrics_available, metadata_complete, visibility, present_in_manifest, last_synced_at
       FROM production.music_song_state ${whereSql}
       ORDER BY ${sortCol} ${dir} NULLS LAST, track_number ASC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  res.json({ items: rows.rows, total: num(total.rows[0].n), page, pageSize });
}));

router.get('/songs/:id', ah(async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) throw new HttpError(400, 'invalid song id');
  const r = await query(`SELECT * FROM production.music_song_state WHERE song_id=$1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'song not found');
  res.json(r.rows[0]);
}));

router.patch('/songs/:id/visibility', validate(visSchema), ah(async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) throw new HttpError(400, 'invalid song id');
  const { visibility } = req.body;
  const prev = await query(`SELECT visibility FROM production.music_song_state WHERE song_id=$1`, [id]);
  if (!prev.rowCount) throw new HttpError(404, 'song not found');
  const r = await query(
    `UPDATE production.music_song_state SET visibility=$2, visibility_source='manual', updated_at=NOW()
       WHERE song_id=$1 RETURNING song_id, album_code, visibility`, [id, visibility]);
  invalidateVisibilityCache();
  await logActivity({ actor: req.auth, action: `song.${visibility}`, targetType: 'song', targetId: id,
    prev: { visibility: prev.rows[0].visibility }, next: { visibility } });
  res.json(r.rows[0]);
}));

// ===========================================================================
// MISSING ASSETS (BRD: dedicated Missing Assets section)
// ===========================================================================
router.get('/missing', ah(async (req, res) => {
  const albumsMissingCover = await query(
    `SELECT album_code, title, artist_name, cover_url FROM production.music_album_state
       WHERE present_in_manifest AND cover_present IS FALSE ORDER BY artist_name, title LIMIT 500`);
  const albumsMissingMeta = await query(
    `SELECT album_code, title, artist_name FROM production.music_album_state
       WHERE present_in_manifest AND metadata_complete IS FALSE ORDER BY artist_name, title LIMIT 500`);
  const songsMissingAudio = await query(
    `SELECT song_id, album_code, track_number, title, artist_name FROM production.music_song_state
       WHERE present_in_manifest AND mp3_available IS FALSE ORDER BY album_code, track_number LIMIT 1000`);
  const songsMissingMeta = await query(
    `SELECT song_id, album_code, track_number, title FROM production.music_song_state
       WHERE present_in_manifest AND metadata_complete IS FALSE ORDER BY album_code, track_number LIMIT 1000`);
  const brokenAlbums = await query(
    `SELECT album_code, title, artist_name, cover_url FROM production.music_album_state
       WHERE present_in_manifest IS FALSE ORDER BY album_code LIMIT 500`);
  const brokenSongs = await query(
    `SELECT song_id, album_code, track_number, title, mp3_url FROM production.music_song_state
       WHERE present_in_manifest IS FALSE ORDER BY album_code LIMIT 1000`);
  res.json({
    albums_missing_cover: albumsMissingCover.rows,
    albums_missing_metadata: albumsMissingMeta.rows,
    songs_missing_audio: songsMissingAudio.rows,
    songs_missing_metadata: songsMissingMeta.rows,
    broken_cover_references: brokenAlbums.rows,
    broken_audio_references: brokenSongs.rows,
  });
}));

// Live CDN HEAD probe of one URL (download test). Must target the CDN.
router.get('/probe', ah(async (req, res) => {
  const url = (req.query.url || '').toString();
  const result = await probeUrl(url);
  res.json({ url, ...result });
}));

// ===========================================================================
// BULK OPERATIONS (BRD: Bulk Operations)
// ===========================================================================
const bulkSchema = z.object({
  action: z.enum(['publish', 'hide', 'draft', 'publish_songs', 'hide_songs', 'refresh', 'validate']),
  albumCodes: z.array(z.string().max(40)).max(2000).optional(),
  songIds: z.array(z.string().uuid()).max(5000).optional(),
});
router.post('/bulk', validate(bulkSchema), ah(async (req, res) => {
  const { action, albumCodes = [], songIds = [] } = req.body;
  let affected = 0;

  if (['publish', 'hide', 'draft'].includes(action)) {
    const vis = action;
    const r = await query(
      `UPDATE production.music_album_state
         SET visibility=$2, visibility_source='manual',
             published_at=CASE WHEN $2='published' THEN NOW() ELSE published_at END,
             hidden_at=CASE WHEN $2='hidden' THEN NOW() ELSE hidden_at END, updated_at=NOW()
         WHERE album_code = ANY($1::text[]) RETURNING album_code`,
      [albumCodes.map((c) => c.toUpperCase()), vis]);
    affected = r.rowCount;
    invalidateVisibilityCache();
  } else if (action === 'publish_songs' || action === 'hide_songs') {
    const vis = action === 'publish_songs' ? 'published' : 'hidden';
    const r = await query(
      `UPDATE production.music_song_state SET visibility=$2, visibility_source='manual', updated_at=NOW()
         WHERE song_id = ANY($1::uuid[]) RETURNING song_id`, [songIds, vis]);
    affected = r.rowCount;
    invalidateVisibilityCache();
  } else if (action === 'validate' || action === 'refresh') {
    // Bounded: refresh/validate a selected set of albums sequentially.
    const codes = albumCodes.map((c) => c.toUpperCase()).slice(0, 200);
    for (const code of codes) {
      try {
        if (action === 'refresh') await refreshAlbum(code);
        else {
          const r = await query(`SELECT * FROM production.music_album_state WHERE album_code=$1`, [code]);
          if (r.rowCount) {
            const checks = validateAlbum(r.rows[0], r.rows[0].cover_present);
            await query(`UPDATE production.music_album_state SET validation=$2, updated_at=NOW() WHERE album_code=$1`,
              [code, JSON.stringify(checks)]);
          }
        }
        affected += 1;
      } catch (err) { logger.warn({ err, code }, 'bulk op item failed'); }
    }
    if (action === 'refresh') invalidateVisibilityCache();
  }

  await logActivity({ actor: req.auth, action: `bulk.${action}`, targetType: 'bulk', targetId: null,
    next: { action, affected, albums: albumCodes.length, songs: songIds.length } });
  res.json({ action, affected });
}));

// ===========================================================================
// ACTIVITY LOG
// ===========================================================================
router.get('/activity', ah(async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = []; const params = [];
  if (req.query.target_type) { params.push(req.query.target_type.toString()); where.push(`target_type=$${params.length}`); }
  if (req.query.action) { params.push(`${req.query.action}%`); where.push(`action LIKE $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await query(`SELECT COUNT(*) AS n FROM production.music_activity_log ${whereSql}`, params);
  const rows = await query(
    `SELECT id, actor_user_id, actor_name, action, target_type, target_id, previous_value, new_value, created_at
       FROM production.music_activity_log ${whereSql}
       ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
  res.json({ items: rows.rows, total: num(total.rows[0].n), page, pageSize: limit });
}));

// ===========================================================================
// EXPORT (CSV) — albums | songs | missing | activity
// ===========================================================================
function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}
router.get('/export', ah(async (req, res) => {
  const kind = (req.query.kind || 'albums').toString();
  const format = (req.query.format || 'csv').toString();
  if (format !== 'csv') throw new HttpError(400, 'only csv export is implemented (xlsx/pdf are a planned enhancement)');
  let headers; let rows;

  if (kind === 'albums') {
    const r = await query(
      `SELECT album_code, title, artist_name, category, release_year, song_count, cover_present,
              audio_missing_count, metadata_complete, visibility, present_in_manifest, last_synced_at
         FROM production.music_album_state ORDER BY artist_name, title`);
    headers = ['Album Code', 'Title', 'Artist', 'Category', 'Year', 'Songs', 'Cover', 'Missing Audio',
      'Metadata Complete', 'Visibility', 'On CDN', 'Last Synced'];
    rows = r.rows.map((x) => [x.album_code, x.title, x.artist_name, x.category, x.release_year, x.song_count,
      x.cover_present ? 'yes' : 'no', x.audio_missing_count, x.metadata_complete ? 'yes' : 'no', x.visibility,
      x.present_in_manifest ? 'yes' : 'no', x.last_synced_at ? new Date(x.last_synced_at).toISOString() : '']);
  } else if (kind === 'songs') {
    const r = await query(
      `SELECT album_code, track_number, title, artist_name, duration_seconds, mp3_available, lyrics_available,
              visibility, present_in_manifest FROM production.music_song_state ORDER BY album_code, track_number`);
    headers = ['Album Code', 'Track', 'Title', 'Artist', 'Duration (s)', 'MP3', 'Lyrics', 'Visibility', 'On CDN'];
    rows = r.rows.map((x) => [x.album_code, x.track_number, x.title, x.artist_name, x.duration_seconds,
      x.mp3_available ? 'yes' : 'no', x.lyrics_available ? 'yes' : 'no', x.visibility, x.present_in_manifest ? 'yes' : 'no']);
  } else if (kind === 'missing') {
    const r = await query(
      `SELECT album_code, title, artist_name, 'missing cover' AS issue FROM production.music_album_state
         WHERE present_in_manifest AND cover_present IS FALSE
       UNION ALL
       SELECT album_code, title, artist_name, 'missing metadata' FROM production.music_album_state
         WHERE present_in_manifest AND metadata_complete IS FALSE
       UNION ALL
       SELECT album_code, title, artist_name, 'missing audio' FROM production.music_song_state s
         WHERE present_in_manifest AND mp3_available IS FALSE
       ORDER BY artist_name, album_code`);
    headers = ['Album Code', 'Title', 'Artist', 'Issue'];
    rows = r.rows.map((x) => [x.album_code, x.title, x.artist_name, x.issue]);
  } else if (kind === 'activity') {
    const r = await query(
      `SELECT created_at, actor_name, action, target_type, target_id FROM production.music_activity_log
         ORDER BY created_at DESC LIMIT 5000`);
    headers = ['Timestamp', 'Administrator', 'Action', 'Target Type', 'Target'];
    rows = r.rows.map((x) => [new Date(x.created_at).toISOString(), x.actor_name, x.action, x.target_type, x.target_id]);
  } else {
    throw new HttpError(400, 'unknown export kind');
  }

  const csv = toCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jubilujah-music-${kind}.csv"`);
  res.send(csv);
}));

export default router;
