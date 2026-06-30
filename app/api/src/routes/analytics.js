import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { isUuid, albumUuid, artistUuid } from '../ids.js';
import { getManifest, getSongById, getAlbumById, statusCounts } from '../manifest.js';
import { HttpError, requireAuth, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { parseUserAgent } from '../util/ua.js';
import { logger } from '../logger.js';

// ============================================================================
// Media Analytics API.
//   POST /api/analytics/play        — record a playback event (any logged-in user)
//   GET  /api/analytics/*           — admin-only dashboard reads (overview,
//                                     albums, songs, users, trends, ratings,
//                                     reviews, export)
// Album/song/artist ids on a play are resolved server-side from the manifest,
// so the client only needs to send the song id + timing.
// ============================================================================
const router = Router();

// ---- Name resolution helpers (manifest-backed) -----------------------------
function albumName(id) { const a = getAlbumById(id); return a ? { title: a.title, artist: a.artist, cover: a.cover, code: a.code } : null; }
function songName(id) { const s = getSongById(id); return s ? { title: s.title, album: s.album, artist: s.artist, cover: s.cover, code: s.code } : null; }

// ===========================================================================
// 1. RECORD A PLAY (any authenticated listener)
// ===========================================================================
const playSchema = z.object({
  song_id: z.string().uuid(),
  session_id: z.string().max(120).optional(),
  source: z.enum(['album', 'playlist', 'search', 'recommendation', 'radio', 'direct', 'other']).optional(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  listening_seconds: z.number().int().min(0).max(86400),
  duration_seconds: z.number().int().min(0).max(86400).optional(),
  completed: z.boolean().optional(),
  skipped: z.boolean().optional(),
});

router.post('/play', requireAuth, validate(playSchema), ah(async (req, res) => {
  const b = req.body;
  const song = getSongById(b.song_id);
  const album_id = song ? albumUuid(song.code) : null;
  const artist_id = song ? artistUuid(song.artistSlug) : null;
  const { device, browser, os } = parseUserAgent(req.get('user-agent'));

  const dur = b.duration_seconds ?? null;
  const completion = dur && dur > 0
    ? Math.max(0, Math.min(100, Math.round((b.listening_seconds / dur) * 10000) / 100))
    : (b.completed ? 100 : 0);
  const completed = b.completed ?? (completion >= 90);
  const skipped = b.skipped ?? (!completed && completion < 80);
  const startedAt = b.started_at ? new Date(b.started_at) : new Date(Date.now() - b.listening_seconds * 1000);
  const endedAt = b.ended_at ? new Date(b.ended_at) : new Date();

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO production.playback_events
         (user_id, session_id, album_id, song_id, artist_id, device_type, browser, os, ip_address,
          source, started_at, ended_at, listening_seconds, duration_seconds, completion_pct, completed, skipped)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [req.auth.user.id, b.session_id ?? null, album_id, b.song_id, artist_id, device, browser, os,
       req.ip || null, b.source ?? 'other', startedAt, endedAt, b.listening_seconds, dur, completion, completed, skipped]
    );
    await client.query(
      `INSERT INTO production.analytics_daily (day, plays, listening_seconds, completed_plays, skipped_plays)
         VALUES (($1 AT TIME ZONE 'UTC')::date, 1, $2, $3, $4)
       ON CONFLICT (day) DO UPDATE SET
         plays = analytics_daily.plays + 1,
         listening_seconds = analytics_daily.listening_seconds + $2,
         completed_plays = analytics_daily.completed_plays + $3,
         skipped_plays = analytics_daily.skipped_plays + $4,
         updated_at = NOW()`,
      [startedAt, b.listening_seconds, completed ? 1 : 0, skipped ? 1 : 0]
    );
  });
  res.status(201).json({ recorded: true });
}));

// ===========================================================================
// 1b. NOW-PLAYING HEARTBEAT (any authenticated listener) — real-time presence
//     for the admin Active Listeners page. Upserted by the player on play +
//     every ~25s, deleted on stop. Ephemeral (production.now_playing).
// ===========================================================================
const npSchema = z.object({ song_id: z.string().uuid(), session_id: z.string().min(1).max(120) });
router.post('/now-playing', requireAuth, validate(npSchema), ah(async (req, res) => {
  await query(
    `INSERT INTO production.now_playing (session_id, user_id, song_id, ip_address, started_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (session_id) DO UPDATE
       SET song_id = EXCLUDED.song_id, user_id = EXCLUDED.user_id,
           ip_address = EXCLUDED.ip_address, updated_at = NOW()`,
    [req.body.session_id, req.auth.user.id, req.body.song_id, req.ip || null]
  );
  res.json({ ok: true });
}));
router.post('/now-playing/stop', requireAuth, validate(z.object({ session_id: z.string().min(1).max(120) })), ah(async (req, res) => {
  await query('DELETE FROM production.now_playing WHERE session_id = $1 AND user_id = $2', [req.body.session_id, req.auth.user.id]);
  res.json({ ok: true });
}));

// ===========================================================================
// Everything below is ADMIN-ONLY. Log all access (fire-and-forget).
// ===========================================================================
router.use(requireRole('admin'));
router.use((req, res, next) => {
  query(
    `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
       VALUES ($1, 'analytics.access', 'analytics', $2, $3)`,
    [req.auth.user.id, req.path, JSON.stringify({ query: req.query })]
  ).catch((err) => logger.warn({ err }, 'analytics audit log failed'));
  next();
});

// Common date-range filter from ?from=&to= (ISO dates). Returns SQL + params.
function range(req, col = 'started_at', startIdx = 1) {
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;
  const clauses = []; const params = []; let i = startIdx;
  if (from) { params.push(from); clauses.push(`${col} >= $${i++}`); }
  if (to) { params.push(to); clauses.push(`${col} < ($${i++}::date + 1)`); }
  return { sql: clauses.length ? clauses.join(' AND ') : 'TRUE', params, nextIdx: i };
}

const pageOf = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
  return { page, limit, offset: (page - 1) * limit };
};

// ===========================================================================
// 2. OVERVIEW — home summary cards
// ===========================================================================
router.get('/overview', ah(async (req, res) => {
  const m = getManifest();
  const totals = await query(
    `SELECT COALESCE(SUM(plays),0)::bigint AS plays,
            COALESCE(SUM(listening_seconds),0)::bigint AS seconds,
            COALESCE(SUM(completed_plays),0)::bigint AS completed,
            COALESCE(SUM(skipped_plays),0)::bigint AS skipped
       FROM production.analytics_daily`
  );
  const users = await query('SELECT COUNT(*)::int AS n FROM identity.users');
  const active = await query(
    `SELECT COUNT(DISTINCT user_id)::int AS n FROM production.playback_events
      WHERE started_at >= NOW() - INTERVAL '30 days'`
  );
  const reviews = await query(
    `SELECT COUNT(*)::int AS ratings,
            COUNT(*) FILTER (WHERE body IS NOT NULL AND char_length(trim(body))>0)::int AS reviews,
            ROUND(AVG(stars) FILTER (WHERE target_type='album')::numeric,2) AS avg_album,
            ROUND(AVG(stars) FILTER (WHERE target_type='song')::numeric,2) AS avg_song
       FROM production.user_reviews WHERE deleted_at IS NULL AND status='published'`
  );
  const topAlbum = await query(
    `SELECT album_id, COUNT(*)::int AS plays FROM production.playback_events
      WHERE album_id IS NOT NULL GROUP BY album_id ORDER BY plays DESC LIMIT 1`
  );
  const topSong = await query(
    `SELECT song_id, COUNT(*)::int AS plays FROM production.playback_events
      WHERE song_id IS NOT NULL GROUP BY song_id ORDER BY plays DESC LIMIT 1`
  );
  const topListener = await query(
    `SELECT pe.user_id, u.display_name, COUNT(*)::int AS plays,
            COALESCE(SUM(pe.listening_seconds),0)::bigint AS seconds
       FROM production.playback_events pe JOIN identity.users u ON u.id = pe.user_id
      GROUP BY pe.user_id, u.display_name ORDER BY plays DESC LIMIT 1`
  );
  const mostRated = await query(
    `SELECT target_id, rating_count FROM production.review_summaries
      WHERE target_type='album' ORDER BY rating_count DESC NULLS LAST LIMIT 1`
  );
  const mostReviewed = await query(
    `SELECT target_id, review_count FROM production.review_summaries
      WHERE target_type='album' ORDER BY review_count DESC NULLS LAST LIMIT 1`
  );

  // Ready (available to users) vs Studio (in development) split — the headline
  // total_albums/total_songs count the FULL catalog; these break it down.
  const sc = statusCounts('all');

  res.json({
    total_albums: m.byAlbumCode.size,
    total_songs: m.bySongId.size,
    available_albums: sc.ready.albums,
    available_songs: sc.ready.songs,
    studio_albums: sc.studio.albums,
    studio_songs: sc.studio.songs,
    total_artists: m.byArtist.size,
    total_users: users.rows[0].n,
    active_users: active.rows[0].n,
    total_plays: Number(totals.rows[0].plays),
    total_listening_hours: Math.round(Number(totals.rows[0].seconds) / 360) / 10,
    completed_plays: Number(totals.rows[0].completed),
    skipped_plays: Number(totals.rows[0].skipped),
    total_ratings: reviews.rows[0].ratings,
    total_reviews: reviews.rows[0].reviews,
    avg_album_rating: reviews.rows[0].avg_album != null ? Number(reviews.rows[0].avg_album) : null,
    avg_song_rating: reviews.rows[0].avg_song != null ? Number(reviews.rows[0].avg_song) : null,
    most_played_album: topAlbum.rowCount ? { ...albumName(topAlbum.rows[0].album_id), plays: topAlbum.rows[0].plays } : null,
    most_played_song: topSong.rowCount ? { ...songName(topSong.rows[0].song_id), plays: topSong.rows[0].plays } : null,
    most_active_listener: topListener.rowCount ? { name: topListener.rows[0].display_name, plays: topListener.rows[0].plays, hours: Math.round(Number(topListener.rows[0].seconds) / 360) / 10 } : null,
    most_rated_album: mostRated.rowCount ? { ...albumName(mostRated.rows[0].target_id), rating_count: mostRated.rows[0].rating_count } : null,
    most_reviewed_album: mostReviewed.rowCount ? { ...albumName(mostReviewed.rows[0].target_id), review_count: mostReviewed.rows[0].review_count } : null,
  });
}));

// ===========================================================================
// 3. ALBUM ANALYTICS (table + detail)
// ===========================================================================
const ALBUM_SORTS = { plays: 'plays', listening: 'seconds', unique: 'listeners', rating: 'avg_rating', reviews: 'review_count' };

router.get('/albums', ah(async (req, res) => {
  const r = range(req);
  const rows = await query(
    `SELECT pe.album_id,
            COUNT(*)::int AS plays,
            COUNT(DISTINCT pe.user_id)::int AS listeners,
            COALESCE(SUM(pe.listening_seconds),0)::bigint AS seconds,
            ROUND(AVG(pe.listening_seconds)::numeric,0)::int AS avg_seconds,
            ROUND(AVG(pe.completion_pct)::numeric,1) AS avg_completion,
            MAX(pe.started_at) AS last_played
       FROM production.playback_events pe
      WHERE pe.album_id IS NOT NULL AND ${r.sql}
      GROUP BY pe.album_id`,
    r.params
  );
  const sums = await query(
    `SELECT target_id, avg_stars, rating_count, review_count FROM production.review_summaries WHERE target_type='album'`
  );
  const sumMap = new Map(sums.rows.map((s) => [s.target_id, s]));
  const q = (typeof req.query.q === 'string' ? req.query.q : '').trim().toLowerCase();

  let items = rows.rows.map((row) => {
    const a = albumName(row.album_id) || {};
    const s = sumMap.get(row.album_id) || {};
    return {
      album_id: row.album_id, title: a.title || row.album_id, artist: a.artist || null, cover: a.cover || null, code: a.code || null,
      plays: row.plays, listeners: row.listeners,
      listening_seconds: Number(row.seconds), avg_seconds: row.avg_seconds, avg_completion: Number(row.avg_completion),
      avg_rating: s.avg_stars != null ? Number(s.avg_stars) : null, rating_count: s.rating_count || 0, review_count: s.review_count || 0,
      last_played: row.last_played,
    };
  });
  if (q) items = items.filter((x) => (x.title || '').toLowerCase().includes(q) || (x.artist || '').toLowerCase().includes(q));
  const sortKey = ALBUM_SORTS[req.query.sort] || 'plays';
  items.sort((a, b) => (b[sortMapField(sortKey)] || 0) - (a[sortMapField(sortKey)] || 0));
  const { page, limit, offset } = pageOf(req);
  res.json({ total: items.length, page, limit, items: items.slice(offset, offset + limit) });
}));

function sortMapField(k) {
  return ({ plays: 'plays', seconds: 'listening_seconds', listeners: 'listeners', avg_rating: 'avg_rating', review_count: 'review_count' })[k] || 'plays';
}

router.get('/albums/:id', ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid album id');
  const agg = await query(
    `SELECT COUNT(*)::int AS plays, COUNT(DISTINCT user_id)::int AS listeners,
            COALESCE(SUM(listening_seconds),0)::bigint AS seconds,
            ROUND(AVG(listening_seconds)::numeric,0)::int AS avg_seconds,
            MIN(started_at) AS first_played, MAX(started_at) AS last_played
       FROM production.playback_events WHERE album_id = $1`, [id]
  );
  const perSong = await query(
    `SELECT song_id, COUNT(*)::int AS plays, COUNT(DISTINCT user_id)::int AS listeners,
            COALESCE(SUM(listening_seconds),0)::bigint AS seconds
       FROM production.playback_events WHERE album_id = $1 AND song_id IS NOT NULL
      GROUP BY song_id ORDER BY plays DESC`, [id]
  );
  const s = await query(`SELECT avg_stars, rating_count, review_count FROM production.review_summaries WHERE target_type='album' AND target_id=$1`, [id]);
  const songs = perSong.rows.map((row) => ({ song_id: row.song_id, ...(songName(row.song_id) || {}), plays: row.plays, listeners: row.listeners, listening_seconds: Number(row.seconds) }));
  res.json({
    album_id: id, ...(albumName(id) || {}),
    plays: agg.rows[0].plays, listeners: agg.rows[0].listeners,
    listening_seconds: Number(agg.rows[0].seconds), avg_seconds: agg.rows[0].avg_seconds,
    first_played: agg.rows[0].first_played, last_played: agg.rows[0].last_played,
    avg_rating: s.rowCount && s.rows[0].avg_stars != null ? Number(s.rows[0].avg_stars) : null,
    rating_count: s.rowCount ? s.rows[0].rating_count : 0, review_count: s.rowCount ? s.rows[0].review_count : 0,
    most_played_song: songs[0] || null, least_played_song: songs.length ? songs[songs.length - 1] : null,
    songs,
  });
}));

// ===========================================================================
// 4. SONG ANALYTICS (table + detail with per-user history)
// ===========================================================================
router.get('/songs', ah(async (req, res) => {
  const r = range(req);
  const rows = await query(
    `SELECT pe.song_id,
            COUNT(*)::int AS plays, COUNT(DISTINCT pe.user_id)::int AS listeners,
            COALESCE(SUM(pe.listening_seconds),0)::bigint AS seconds,
            ROUND(AVG(pe.listening_seconds)::numeric,0)::int AS avg_seconds,
            ROUND(AVG(pe.completion_pct)::numeric,1) AS avg_completion,
            COUNT(*) FILTER (WHERE pe.completed)::int AS complete_plays,
            COUNT(*) FILTER (WHERE pe.skipped)::int AS skips,
            MAX(pe.started_at) AS last_played, MIN(pe.started_at) AS first_played
       FROM production.playback_events pe
      WHERE pe.song_id IS NOT NULL AND ${r.sql}
      GROUP BY pe.song_id`, r.params
  );
  const sums = await query(`SELECT target_id, avg_stars, rating_count, review_count FROM production.review_summaries WHERE target_type='song'`);
  const sumMap = new Map(sums.rows.map((s) => [s.target_id, s]));
  const q = (typeof req.query.q === 'string' ? req.query.q : '').trim().toLowerCase();
  let items = rows.rows.map((row) => {
    const n = songName(row.song_id) || {}; const s = sumMap.get(row.song_id) || {};
    return {
      song_id: row.song_id, title: n.title || row.song_id, album: n.album || null, artist: n.artist || null,
      plays: row.plays, listeners: row.listeners, listening_seconds: Number(row.seconds), avg_seconds: row.avg_seconds,
      avg_completion: Number(row.avg_completion), complete_plays: row.complete_plays, partial_plays: row.plays - row.complete_plays,
      skips: row.skips, last_played: row.last_played, first_played: row.first_played,
      avg_rating: s.avg_stars != null ? Number(s.avg_stars) : null, rating_count: s.rating_count || 0, review_count: s.review_count || 0,
    };
  });
  if (q) items = items.filter((x) => (x.title || '').toLowerCase().includes(q) || (x.album || '').toLowerCase().includes(q) || (x.artist || '').toLowerCase().includes(q));
  const sortKey = sortMapField(ALBUM_SORTS[req.query.sort] || 'plays');
  items.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  const { page, limit, offset } = pageOf(req);
  res.json({ total: items.length, page, limit, items: items.slice(offset, offset + limit) });
}));

router.get('/songs/:id', ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid song id');
  const agg = await query(
    `SELECT COUNT(*)::int AS plays, COUNT(DISTINCT user_id)::int AS listeners,
            COALESCE(SUM(listening_seconds),0)::bigint AS seconds,
            ROUND(AVG(listening_seconds)::numeric,0)::int AS avg_seconds,
            ROUND(AVG(completion_pct)::numeric,1) AS avg_completion,
            COUNT(*) FILTER (WHERE completed)::int AS complete_plays,
            COUNT(*) FILTER (WHERE skipped)::int AS skips,
            MIN(started_at) AS first_played, MAX(started_at) AS last_played
       FROM production.playback_events WHERE song_id=$1`, [id]
  );
  const perUser = await query(
    `SELECT pe.user_id, u.display_name, COUNT(*)::int AS plays,
            COALESCE(SUM(pe.listening_seconds),0)::bigint AS seconds, MAX(pe.started_at) AS last_played
       FROM production.playback_events pe LEFT JOIN identity.users u ON u.id = pe.user_id
      WHERE pe.song_id=$1 GROUP BY pe.user_id, u.display_name ORDER BY plays DESC LIMIT 200`, [id]
  );
  const s = await query(`SELECT avg_stars, rating_count, review_count FROM production.review_summaries WHERE target_type='song' AND target_id=$1`, [id]);
  res.json({
    song_id: id, ...(songName(id) || {}),
    plays: agg.rows[0].plays, listeners: agg.rows[0].listeners, listening_seconds: Number(agg.rows[0].seconds),
    avg_seconds: agg.rows[0].avg_seconds, avg_completion: Number(agg.rows[0].avg_completion),
    complete_plays: agg.rows[0].complete_plays, partial_plays: agg.rows[0].plays - agg.rows[0].complete_plays,
    skips: agg.rows[0].skips, first_played: agg.rows[0].first_played, last_played: agg.rows[0].last_played,
    avg_rating: s.rowCount && s.rows[0].avg_stars != null ? Number(s.rows[0].avg_stars) : null,
    rating_count: s.rowCount ? s.rows[0].rating_count : 0, review_count: s.rowCount ? s.rows[0].review_count : 0,
    listeners_detail: perUser.rows.map((u) => ({ user_id: u.user_id, name: u.display_name || 'Deleted user', plays: u.plays, listening_seconds: Number(u.seconds), last_played: u.last_played })),
  });
}));

// ===========================================================================
// 5. USER LISTENING ANALYTICS
// ===========================================================================
router.get('/users', ah(async (req, res) => {
  const { page, limit, offset } = pageOf(req);
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? `%${req.query.q.trim()}%` : null;
  const where = q ? 'AND u.display_name ILIKE $3' : '';
  const params = [limit, offset]; if (q) params.push(q);
  const rows = await query(
    `SELECT u.id, u.display_name, u.email,
            COUNT(pe.id)::int AS plays,
            COUNT(DISTINCT pe.song_id)::int AS songs,
            COUNT(DISTINCT pe.album_id)::int AS albums,
            COUNT(DISTINCT pe.session_id)::int AS sessions,
            COALESCE(SUM(pe.listening_seconds),0)::bigint AS seconds,
            MIN(pe.started_at) AS first_listen, MAX(pe.started_at) AS last_listen
       FROM identity.users u JOIN production.playback_events pe ON pe.user_id = u.id
      WHERE TRUE ${where}
      GROUP BY u.id, u.display_name, u.email
      ORDER BY plays DESC
      LIMIT $1 OFFSET $2`, params
  );
  const totalR = await query(`SELECT COUNT(DISTINCT user_id)::int AS n FROM production.playback_events`);
  res.json({
    total: totalR.rows[0].n, page, limit,
    items: rows.rows.map((u) => ({
      user_id: u.id, name: u.display_name, email: u.email, plays: u.plays, songs: u.songs, albums: u.albums,
      sessions: u.sessions, listening_seconds: Number(u.seconds), first_listen: u.first_listen, last_listen: u.last_listen,
    })),
  });
}));

router.get('/users/:id', ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid user id');
  const u = await query('SELECT id, display_name, email, created_at FROM identity.users WHERE id=$1', [id]);
  if (!u.rowCount) throw new HttpError(404, 'user not found');
  const agg = await query(
    `SELECT COUNT(*)::int AS plays, COUNT(DISTINCT song_id)::int AS songs, COUNT(DISTINCT album_id)::int AS albums,
            COUNT(DISTINCT session_id)::int AS sessions, COALESCE(SUM(listening_seconds),0)::bigint AS seconds,
            MIN(started_at) AS first_listen, MAX(started_at) AS last_listen
       FROM production.playback_events WHERE user_id=$1`, [id]
  );
  const favArtist = await query(`SELECT artist_id, COUNT(*)::int AS n FROM production.playback_events WHERE user_id=$1 AND artist_id IS NOT NULL GROUP BY artist_id ORDER BY n DESC LIMIT 1`, [id]);
  const favAlbum = await query(`SELECT album_id, COUNT(*)::int AS n FROM production.playback_events WHERE user_id=$1 AND album_id IS NOT NULL GROUP BY album_id ORDER BY n DESC LIMIT 1`, [id]);
  const favSong = await query(`SELECT song_id, COUNT(*)::int AS n FROM production.playback_events WHERE user_id=$1 AND song_id IS NOT NULL GROUP BY song_id ORDER BY n DESC LIMIT 1`, [id]);
  const rev = await query(`SELECT COUNT(*)::int AS ratings, COUNT(*) FILTER (WHERE body IS NOT NULL AND char_length(trim(body))>0)::int AS reviews FROM production.user_reviews WHERE reviewer_user_id=$1 AND deleted_at IS NULL`, [id]);

  const secs = Number(agg.rows[0].seconds);
  const first = agg.rows[0].first_listen ? new Date(agg.rows[0].first_listen) : null;
  const days = first ? Math.max(1, Math.round((Date.now() - first.getTime()) / 86400000)) : 1;
  res.json({
    user_id: id, name: u.rows[0].display_name, email: u.rows[0].email, joined: u.rows[0].created_at,
    plays: agg.rows[0].plays, songs_played: agg.rows[0].songs, albums_played: agg.rows[0].albums, sessions: agg.rows[0].sessions,
    listening_seconds: secs,
    avg_daily_minutes: Math.round((secs / 60) / days),
    avg_weekly_minutes: Math.round((secs / 60) / Math.max(1, days / 7)),
    avg_monthly_minutes: Math.round((secs / 60) / Math.max(1, days / 30)),
    favorite_artist: favArtist.rowCount ? artistNameById(favArtist.rows[0].artist_id) : null,
    favorite_album: favAlbum.rowCount ? albumName(favAlbum.rows[0].album_id) : null,
    favorite_song: favSong.rowCount ? songName(favSong.rows[0].song_id) : null,
    ratings_submitted: rev.rows[0].ratings, reviews_submitted: rev.rows[0].reviews,
    first_listen: agg.rows[0].first_listen, last_listen: agg.rows[0].last_listen,
  });
}));

function artistNameById(artistId) {
  for (const a of getManifest().byArtist.values()) {
    if (artistUuid(a.slug) === artistId) return { name: a.name, slug: a.slug };
  }
  return null;
}

// ===========================================================================
// 6. TRENDS (charts)
// ===========================================================================
router.get('/trends', ah(async (req, res) => {
  const days = Math.min(730, Math.max(7, parseInt(req.query.days, 10) || 90));
  const daily = await query(
    `SELECT to_char(day,'YYYY-MM-DD') AS day, plays, listening_seconds, completed_plays, skipped_plays
       FROM production.analytics_daily WHERE day >= (CURRENT_DATE - $1::int) ORDER BY day`, [days]
  );
  const dau = await query(
    `SELECT to_char((started_at AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day, COUNT(DISTINCT user_id)::int AS users
       FROM production.playback_events WHERE started_at >= NOW() - ($1 || ' days')::interval
      GROUP BY 1 ORDER BY 1`, [days]
  );
  const monthly = await query(
    `SELECT to_char(date_trunc('month', day),'YYYY-MM') AS month, SUM(plays)::int AS plays,
            ROUND(SUM(listening_seconds)/3600.0,1) AS hours
       FROM production.analytics_daily WHERE day >= (CURRENT_DATE - 730) GROUP BY 1 ORDER BY 1`
  );
  const peakHours = await query(
    `SELECT EXTRACT(hour FROM started_at)::int AS hour, COUNT(*)::int AS plays
       FROM production.playback_events GROUP BY 1 ORDER BY 1`
  );
  const peakDays = await query(
    `SELECT EXTRACT(dow FROM started_at)::int AS dow, COUNT(*)::int AS plays
       FROM production.playback_events GROUP BY 1 ORDER BY 1`
  );
  res.json({
    daily: daily.rows.map((d) => ({ day: d.day, plays: d.plays, hours: Math.round(Number(d.listening_seconds) / 360) / 10, completed: d.completed_plays, skipped: d.skipped_plays })),
    dau: dau.rows,
    monthly: monthly.rows.map((m) => ({ month: m.month, plays: m.plays, hours: Number(m.hours) })),
    peak_hours: peakHours.rows,
    peak_days: peakDays.rows,
  });
}));

// ===========================================================================
// 7. RATING ANALYTICS
// ===========================================================================
router.get('/ratings', ah(async (req, res) => {
  const totals = await query(
    `SELECT COUNT(*) FILTER (WHERE target_type='album')::int AS album_ratings,
            COUNT(*) FILTER (WHERE target_type='song')::int AS song_ratings,
            ROUND(AVG(stars)::numeric,2) AS avg_all,
            COUNT(DISTINCT reviewer_user_id)::int AS raters
       FROM production.user_reviews WHERE deleted_at IS NULL AND status='published'`
  );
  const dist = await query(
    `SELECT stars, COUNT(*)::int AS n FROM production.user_reviews
      WHERE deleted_at IS NULL AND status='published' GROUP BY stars`
  );
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const d of dist.rows) distribution[d.stars] = d.n;
  const top = (type, dir) => query(
    `SELECT target_id, avg_stars, rating_count FROM production.review_summaries
      WHERE target_type=$1 AND rating_count>0 ORDER BY avg_stars ${dir}, rating_count DESC LIMIT 10`, [type]
  );
  const most = (type) => query(
    `SELECT target_id, avg_stars, rating_count FROM production.review_summaries
      WHERE target_type=$1 AND rating_count>0 ORDER BY rating_count DESC LIMIT 10`, [type]
  );
  const [hiAlb, loAlb, hiSong, mostAlb, mostSong] = await Promise.all([top('album', 'DESC'), top('album', 'ASC'), top('song', 'DESC'), most('album'), most('song')]);
  const resolveAlbum = (rows) => rows.map((r) => ({ ...albumName(r.target_id), avg_rating: Number(r.avg_stars), rating_count: r.rating_count }));
  const resolveSong = (rows) => rows.map((r) => ({ ...songName(r.target_id), avg_rating: Number(r.avg_stars), rating_count: r.rating_count }));
  res.json({
    total_album_ratings: totals.rows[0].album_ratings, total_song_ratings: totals.rows[0].song_ratings,
    average_rating: totals.rows[0].avg_all != null ? Number(totals.rows[0].avg_all) : null, raters: totals.rows[0].raters,
    distribution,
    highest_rated_albums: resolveAlbum(hiAlb.rows), lowest_rated_albums: resolveAlbum(loAlb.rows),
    highest_rated_songs: resolveSong(hiSong.rows),
    most_rated_albums: resolveAlbum(mostAlb.rows), most_rated_songs: resolveSong(mostSong.rows),
  });
}));

// ===========================================================================
// 8. REVIEW ANALYTICS
// ===========================================================================
router.get('/reviews', ah(async (req, res) => {
  const totals = await query(
    `SELECT COUNT(*) FILTER (WHERE target_type='album' AND body IS NOT NULL AND char_length(trim(body))>0)::int AS album_reviews,
            COUNT(*) FILTER (WHERE target_type='song' AND body IS NOT NULL AND char_length(trim(body))>0)::int AS song_reviews,
            COUNT(DISTINCT reviewer_user_id) FILTER (WHERE body IS NOT NULL AND char_length(trim(body))>0)::int AS reviewers,
            ROUND(AVG(char_length(body)) FILTER (WHERE body IS NOT NULL),0)::int AS avg_len,
            COUNT(*) FILTER (WHERE status IN ('pending','hidden'))::int AS pending
       FROM production.user_reviews WHERE deleted_at IS NULL`
  );
  const latest = await query(
    `SELECT ur.target_type, ur.target_id, ur.stars, ur.title, ur.body, ur.created_at, u.display_name
       FROM production.user_reviews ur JOIN identity.users u ON u.id = ur.reviewer_user_id
      WHERE ur.deleted_at IS NULL AND ur.status='published' AND ur.body IS NOT NULL AND char_length(trim(ur.body))>0
      ORDER BY ur.created_at DESC LIMIT 10`
  );
  const mostAlb = await query(`SELECT target_id, review_count FROM production.review_summaries WHERE target_type='album' AND review_count>0 ORDER BY review_count DESC LIMIT 1`);
  const mostSong = await query(`SELECT target_id, review_count FROM production.review_summaries WHERE target_type='song' AND review_count>0 ORDER BY review_count DESC LIMIT 1`);
  res.json({
    total_album_reviews: totals.rows[0].album_reviews, total_song_reviews: totals.rows[0].song_reviews,
    reviewers: totals.rows[0].reviewers, avg_review_length: totals.rows[0].avg_len || 0, pending_moderation: totals.rows[0].pending,
    most_reviewed_album: mostAlb.rowCount ? { ...albumName(mostAlb.rows[0].target_id), review_count: mostAlb.rows[0].review_count } : null,
    most_reviewed_song: mostSong.rowCount ? { ...songName(mostSong.rows[0].target_id), review_count: mostSong.rows[0].review_count } : null,
    latest: latest.rows.map((r) => ({
      ...(r.target_type === 'album' ? albumName(r.target_id) : songName(r.target_id)),
      target_type: r.target_type, stars: r.stars, title: r.title, body: r.body, by: r.display_name, created_at: r.created_at,
    })),
  });
}));

// ===========================================================================
// 9. EXPORT (CSV) — albums | songs | users
// ===========================================================================
function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

router.get('/export', ah(async (req, res) => {
  const kind = ['albums', 'songs', 'users'].includes(req.query.kind) ? req.query.kind : 'albums';
  const r = range(req);
  let headers; let rows;
  if (kind === 'albums') {
    const data = await query(
      `SELECT album_id, COUNT(*)::int AS plays, COUNT(DISTINCT user_id)::int AS listeners, COALESCE(SUM(listening_seconds),0)::bigint AS seconds, MAX(started_at) AS last_played
         FROM production.playback_events WHERE album_id IS NOT NULL AND ${r.sql} GROUP BY album_id ORDER BY plays DESC`, r.params);
    headers = ['Album', 'Artist', 'Plays', 'Unique Listeners', 'Listening Hours', 'Last Played'];
    rows = data.rows.map((x) => { const a = albumName(x.album_id) || {}; return [a.title || x.album_id, a.artist || '', x.plays, x.listeners, (Number(x.seconds) / 3600).toFixed(2), x.last_played ? new Date(x.last_played).toISOString() : '']; });
  } else if (kind === 'songs') {
    const data = await query(
      `SELECT song_id, COUNT(*)::int AS plays, COUNT(DISTINCT user_id)::int AS listeners, COALESCE(SUM(listening_seconds),0)::bigint AS seconds, ROUND(AVG(completion_pct)::numeric,1) AS comp
         FROM production.playback_events WHERE song_id IS NOT NULL AND ${r.sql} GROUP BY song_id ORDER BY plays DESC`, r.params);
    headers = ['Song', 'Album', 'Artist', 'Plays', 'Unique Listeners', 'Listening Hours', 'Avg Completion %'];
    rows = data.rows.map((x) => { const n = songName(x.song_id) || {}; return [n.title || x.song_id, n.album || '', n.artist || '', x.plays, x.listeners, (Number(x.seconds) / 3600).toFixed(2), Number(x.comp)]; });
  } else {
    const data = await query(
      `SELECT u.display_name, u.email, COUNT(pe.id)::int AS plays, COUNT(DISTINCT pe.song_id)::int AS songs, COALESCE(SUM(pe.listening_seconds),0)::bigint AS seconds
         FROM identity.users u JOIN production.playback_events pe ON pe.user_id=u.id GROUP BY u.id, u.display_name, u.email ORDER BY plays DESC`);
    headers = ['User', 'Email', 'Plays', 'Distinct Songs', 'Listening Hours'];
    rows = data.rows.map((x) => [x.display_name, x.email, x.plays, x.songs, (Number(x.seconds) / 3600).toFixed(2)]);
  }
  const csv = toCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jubilujah-analytics-${kind}.csv"`);
  res.send(csv);
}));

export default router;
