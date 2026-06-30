// ============================================================================
// Manage Music — CDN synchronization engine.
//
// Reconciles the management-state tables (production.music_album_state /
// music_song_state) with the authoritative catalog manifest (a folder-scan of
// cdn.jubileeverse.com). NO media is copied — we only mirror metadata + CDN
// references and probe the CDN (HEAD) for cover/file availability.
//
// A "sync" run:
//   1. inserts a production.music_sync_runs row (status=running)
//   2. walks every album/song in the manifest, derives its state + validation,
//      optionally HEAD-probes cover art on the CDN,
//   3. bulk-upserts album/song state, flags rows no longer in the manifest as
//      broken/removed CDN references,
//   4. records the result summary + per-step log back on the sync_runs row.
// ============================================================================
import { config } from '../config.js';
import { logger } from '../logger.js';
import { query, withTransaction } from '../db.js';
import { getManifest } from '../manifest.js';
import { albumUuid, songUuid } from '../ids.js';

const CDN = config.cdnBase.replace(/\/$/, '');

// Absolute CDN URL for an album's published cover art.
export function coverUrlFor(path, code) {
  return path ? `${CDN}/music/${path}/artwork/${code}.png` : null;
}

// HEAD-probe a single URL on the CDN. Never throws — a network failure is just
// "not available". 8s ceiling so a stuck edge can't wedge the whole run.
export async function probeUrl(url) {
  if (!url) return { ok: false, status: 0 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const head = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    return {
      ok: head.ok,
      status: head.status,
      contentType: head.headers.get('content-type'),
      contentLength: Number(head.headers.get('content-length')) || null,
      lastModified: head.headers.get('last-modified') || null,
    };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// De-duplicate rows by a key, keeping the LAST occurrence. The manifest can
// carry the same album_code / song_id more than once (e.g. duplicated folder
// trees), which would make a single ON CONFLICT upsert touch one row twice
// ("cannot affect row a second time"). Collapsing first keeps the upsert legal
// and makes the count of distinct managed albums correct.
function dedupeBy(rows, key) {
  const map = new Map();
  for (const r of rows) map.set(r[key], r);
  return [...map.values()];
}

// Bounded-concurrency map (CDN-friendly: don't fire thousands of HEADs at once).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---- State derivation from the manifest ------------------------------------

// Build the management-state record for one manifest album (cover_present is
// resolved separately via probing, since it requires a network round-trip).
function deriveAlbumState(album, artist, category, generatedAt) {
  const code = String(album.code).toUpperCase();
  const tracks = album.tracks || [];
  const songCount = album.trackCount || tracks.length;
  const audioPresent = tracks.filter((t) => t.audio && t.url).length;
  const audioMissing = Math.max(0, songCount - audioPresent);
  const titlesOk = tracks.length > 0 && tracks.every((t) => String(t.title || '').trim().length > 0);
  const metadataComplete = !!album.title && !!artist.name && songCount > 0 && titlesOk;
  return {
    album_code: code,
    album_id: albumUuid(code),
    title: album.title || '',
    artist_slug: artist.slug || '',
    artist_name: artist.name || '',
    category: category.key || null,
    release_year: parseYear(album),
    cdn_path: album.path ? `/music/${album.path}` : null,
    cover_url: coverUrlFor(album.path, code),
    song_count: songCount,
    audio_present_count: audioPresent,
    audio_missing_count: audioMissing,
    metadata_complete: metadataComplete,
    // Initial auto-visibility: a fully-rendered album is published, otherwise draft.
    auto_visibility: audioPresent > 0 ? 'published' : 'draft',
    last_modified_at: generatedAt,
  };
}

function parseYear(album) {
  // The manifest carries no release date; tolerate an optional `year`/`released`.
  const y = album.year || album.released || null;
  const n = y ? parseInt(String(y).slice(0, 4), 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

function deriveSongStates(album, artist, generatedAt) {
  const code = String(album.code).toUpperCase();
  return (album.tracks || []).map((t) => {
    const available = !!(t.audio && t.url);
    return {
      song_id: songUuid(code, t.n),
      album_code: code,
      album_id: albumUuid(code),
      track_number: Number(t.n) || 0,
      title: t.title || '',
      artist_name: artist.name || '',
      duration_seconds: t.duration ? Math.round(Number(t.duration)) : null,
      cdn_path: t.url || null,
      mp3_url: t.url ? `${CDN}/music/${t.url}` : null,
      mp3_available: available,
      lyrics_available: !!t.lyrics,
      metadata_complete: !!t.title && String(t.title).trim().length > 0,
      auto_visibility: available ? 'published' : 'draft',
      last_modified_at: generatedAt,
    };
  });
}

// ---- Asset validation (BRD: Asset Validation) ------------------------------

// Run the per-album validation checks. `coverPresent` may be null (unprobed).
export function validateAlbum(state, coverPresent) {
  const checks = [];
  const add = (check, passed, detail) => checks.push({ check, passed, detail });

  add('Album Cover Exists',
    coverPresent === true,
    coverPresent === null ? 'Not yet probed' : coverPresent ? 'Found' : 'Missing cover image');
  add('MP3 Files Exist',
    state.audio_present_count > 0,
    `${state.audio_present_count}/${state.song_count} songs have audio`);
  add('Song Count Matches Metadata',
    state.audio_missing_count === 0,
    state.audio_missing_count === 0 ? 'All tracks present' : `${state.audio_missing_count} missing audio`);
  add('Artist Exists', !!state.artist_name, state.artist_name || 'No artist');
  add('Album Metadata Complete', state.metadata_complete,
    state.metadata_complete ? 'Complete' : 'Missing title / artist / track titles');
  add('Required Metadata Present', !!state.title && !!state.artist_name && state.song_count > 0,
    'Title, artist and at least one track');

  return checks;
}

// ---- Bulk upsert -----------------------------------------------------------

// Multi-row INSERT … ON CONFLICT upsert, chunked so a single statement never
// carries an unbounded parameter list. `cols` order defines the value tuples.
async function bulkUpsert(client, table, cols, conflictCol, updateCols, rows, chunk = 200) {
  for (let off = 0; off < rows.length; off += chunk) {
    const slice = rows.slice(off, off + chunk);
    const params = [];
    const tuples = slice.map((row, r) => {
      const ph = cols.map((c, ci) => {
        params.push(row[c]);
        return `$${r * cols.length + ci + 1}`;
      });
      return `(${ph.join(',')})`;
    });
    const setClause = updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    await client.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')}
       ON CONFLICT (${conflictCol}) DO UPDATE SET ${setClause}, updated_at = NOW()`,
      params,
    );
  }
}

// ---- Main sync engine ------------------------------------------------------

// Run a full reconcile. `probe`: 'none' | 'missing' (default) | 'all' controls
// how aggressively cover art is HEAD-checked on the CDN.
export async function runSync({ trigger = 'manual', actorUserId = null, probe = 'missing' } = {}) {
  const startedAt = new Date();
  const runRes = await query(
    `INSERT INTO production.music_sync_runs (trigger, status, actor_user_id, started_at)
       VALUES ($1, 'running', $2, $3) RETURNING id`,
    [trigger, actorUserId, startedAt],
  );
  const runId = runRes.rows[0].id;
  const log = [];
  const step = (msg, data) => { log.push({ at: new Date().toISOString(), msg, ...(data || {}) }); };

  try {
    const m = getManifest();
    const generatedAt = m.raw.generated ? new Date(m.raw.generated) : startedAt;
    step('Manifest loaded', { albums: m.raw.totalAlbums, generated: m.raw.generated });

    // Flatten the manifest into album/song state rows, then collapse any
    // duplicate album_code / song_id the manifest may contain.
    let albumStates = [];
    let songStates = [];
    for (const category of m.raw.categories || []) {
      for (const artist of category.artists || []) {
        for (const album of artist.albums || []) {
          albumStates.push(deriveAlbumState(album, artist, category, generatedAt));
          songStates.push(...deriveSongStates(album, artist, generatedAt));
        }
      }
    }
    albumStates = dedupeBy(albumStates, 'album_code');
    songStates = dedupeBy(songStates, 'song_id');

    // Load existing state so we can classify new vs updated and respect manual
    // visibility overrides (sync must never clobber an admin's explicit choice).
    const existing = await query(
      `SELECT album_code, song_count, audio_present_count, cover_present, visibility,
              visibility_source, title
         FROM production.music_album_state`,
    );
    const prev = new Map(existing.rows.map((r) => [r.album_code, r]));
    const existingSongs = await query(
      `SELECT song_id, mp3_available, visibility_source FROM production.music_song_state`,
    );
    const prevSong = new Map(existingSongs.rows.map((r) => [r.song_id, r]));

    // Probe cover art. Default 'missing' only re-checks albums not yet confirmed.
    const toProbe = albumStates.filter((a) => {
      if (probe === 'all') return true;
      if (probe === 'none') return false;
      const p = prev.get(a.album_code);
      return !p || p.cover_present === null || p.cover_present === false;
    });
    step('Probing cover art', { count: toProbe.length, mode: probe });
    const coverResult = new Map();
    await mapLimit(toProbe, 24, async (a) => {
      const res = await probeUrl(a.cover_url);
      coverResult.set(a.album_code, res.ok);
    });

    // Resolve final cover_present per album (probed value, else last known).
    let missingCovers = 0;
    for (const a of albumStates) {
      const probed = coverResult.has(a.album_code) ? coverResult.get(a.album_code) : undefined;
      const prior = prev.get(a.album_code)?.cover_present;
      a.cover_present = probed !== undefined ? probed : (prior ?? null);
      if (a.cover_present === false) missingCovers += 1;
      a.validation = JSON.stringify(validateAlbum(a, a.cover_present));
    }

    // Resolve visibility: 'auto' rows track the manifest; 'manual' rows are kept.
    let albumsNew = 0; let albumsUpdated = 0;
    const nowIso = new Date();
    for (const a of albumStates) {
      const p = prev.get(a.album_code);
      if (!p) {
        albumsNew += 1;
        a.visibility = a.auto_visibility;
        a.visibility_source = 'auto';
        a.published_at = a.auto_visibility === 'published' ? nowIso : null;
        a.hidden_at = null;
      } else {
        a.visibility_source = p.visibility_source;
        a.visibility = p.visibility_source === 'manual' ? p.visibility : a.auto_visibility;
        a.published_at = a.visibility === 'published' ? nowIso : null;
        a.hidden_at = a.visibility === 'hidden' ? nowIso : null;
        if (p.song_count !== a.song_count || p.audio_present_count !== a.audio_present_count
            || p.cover_present !== a.cover_present || p.title !== a.title) {
          albumsUpdated += 1;
        }
      }
      a.present_in_manifest = true;
      a.last_synced_at = nowIso;
    }

    let songsNew = 0; let songsUpdated = 0; let missingAudio = 0;
    for (const s of songStates) {
      const p = prevSong.get(s.song_id);
      if (!s.mp3_available) missingAudio += 1;
      if (!p) {
        songsNew += 1;
        s.visibility = s.auto_visibility;
        s.visibility_source = 'auto';
      } else {
        s.visibility_source = p.visibility_source;
        s.visibility = p.visibility_source === 'manual' ? p.visibility : s.auto_visibility;
        if (p.mp3_available !== s.mp3_available) songsUpdated += 1;
      }
      s.present_in_manifest = true;
      s.last_synced_at = nowIso;
    }

    step('Writing state', { albums: albumStates.length, songs: songStates.length });
    let albumsRemoved = 0; let songsRemoved = 0;
    await withTransaction(async (client) => {
      await bulkUpsert(client, 'production.music_album_state',
        ['album_code', 'album_id', 'title', 'artist_slug', 'artist_name', 'category', 'release_year',
          'cdn_path', 'cover_url', 'song_count', 'audio_present_count', 'audio_missing_count',
          'cover_present', 'metadata_complete', 'visibility', 'visibility_source', 'validation',
          'present_in_manifest', 'last_modified_at', 'last_synced_at', 'published_at', 'hidden_at'],
        'album_code',
        ['title', 'artist_slug', 'artist_name', 'category', 'release_year', 'cdn_path', 'cover_url',
          'song_count', 'audio_present_count', 'audio_missing_count', 'cover_present', 'metadata_complete',
          'visibility', 'visibility_source', 'validation', 'present_in_manifest', 'last_modified_at',
          'last_synced_at', 'published_at', 'hidden_at'],
        albumStates);

      await bulkUpsert(client, 'production.music_song_state',
        ['song_id', 'album_code', 'album_id', 'track_number', 'title', 'artist_name', 'duration_seconds',
          'cdn_path', 'mp3_url', 'mp3_available', 'lyrics_available', 'metadata_complete',
          'visibility', 'visibility_source', 'present_in_manifest', 'last_modified_at', 'last_synced_at'],
        'song_id',
        ['album_code', 'album_id', 'track_number', 'title', 'artist_name', 'duration_seconds', 'cdn_path',
          'mp3_url', 'mp3_available', 'lyrics_available', 'metadata_complete', 'visibility',
          'visibility_source', 'present_in_manifest', 'last_modified_at', 'last_synced_at'],
        songStates);

      // Flag rows that vanished from the manifest as broken/removed CDN refs.
      const seenCodes = albumStates.map((a) => a.album_code);
      const seenSongs = songStates.map((s) => s.song_id);
      const remAlb = await client.query(
        `UPDATE production.music_album_state SET present_in_manifest = FALSE, updated_at = NOW()
           WHERE present_in_manifest = TRUE AND album_code <> ALL($1::text[]) RETURNING album_code`,
        [seenCodes]);
      albumsRemoved = remAlb.rowCount;
      const remSong = await client.query(
        `UPDATE production.music_song_state SET present_in_manifest = FALSE, updated_at = NOW()
           WHERE present_in_manifest = TRUE AND song_id <> ALL($1::uuid[]) RETURNING song_id`,
        [seenSongs]);
      songsRemoved = remSong.rowCount;

      // Mirror validation into the normalized results table.
      for (const a of albumStates) {
        for (const c of JSON.parse(a.validation)) {
          await client.query(
            `INSERT INTO production.music_validation_results (album_code, check_name, passed, detail, checked_at)
               VALUES ($1,$2,$3,$4,NOW())
             ON CONFLICT (album_code, check_name)
               DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail, checked_at = NOW()`,
            [a.album_code, c.check, c.passed, c.detail || null]);
        }
      }
    });

    const summary = {
      albums_new: albumsNew, songs_new: songsNew,
      albums_updated: albumsUpdated, songs_updated: songsUpdated,
      albums_removed: albumsRemoved, songs_removed: songsRemoved,
      missing_covers: missingCovers, missing_audio: missingAudio,
    };
    step('Done', summary);

    await query(
      `UPDATE production.music_sync_runs SET status='success', finished_at=NOW(),
         albums_scanned=$2, songs_scanned=$3, albums_new=$4, songs_new=$5, albums_updated=$6,
         songs_updated=$7, albums_removed=$8, songs_removed=$9, missing_covers=$10, missing_audio=$11,
         summary=$12, log=$13 WHERE id=$1`,
      [runId, albumStates.length, songStates.length, albumsNew, songsNew, albumsUpdated, songsUpdated,
        albumsRemoved, songsRemoved, missingCovers, missingAudio, JSON.stringify(summary), JSON.stringify(log)]);
    await query(`UPDATE production.music_sync_config SET last_run_at = NOW() WHERE id = 1`);

    return { runId, status: 'success', albums_scanned: albumStates.length, songs_scanned: songStates.length, ...summary };
  } catch (err) {
    logger.error({ err, runId }, 'music sync failed');
    step('Error', { error: err.message });
    await query(
      `UPDATE production.music_sync_runs SET status='error', finished_at=NOW(), error=$2, log=$3 WHERE id=$1`,
      [runId, err.message, JSON.stringify(log)]).catch(() => {});
    throw err;
  }
}

// Re-probe + re-validate a single album from the CDN (BRD: Refresh from CDN).
export async function refreshAlbum(code) {
  const m = getManifest();
  const manifestAlbum = m.byAlbumCode.get(String(code).toUpperCase());
  if (!manifestAlbum) return null;
  const artist = { slug: manifestAlbum.artistSlug, name: manifestAlbum.artistName };
  const category = { key: manifestAlbum.categoryKey };
  const generatedAt = m.raw.generated ? new Date(m.raw.generated) : new Date();
  const a = deriveAlbumState(manifestAlbum, artist, category, generatedAt);
  const cover = await probeUrl(a.cover_url);
  a.cover_present = cover.ok;
  const validation = validateAlbum(a, a.cover_present);

  const prev = await query(
    `SELECT visibility, visibility_source FROM production.music_album_state WHERE album_code=$1`,
    [a.album_code]);
  const p = prev.rows[0];
  const visibility = p?.visibility_source === 'manual' ? p.visibility : a.auto_visibility;

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO production.music_album_state
         (album_code, album_id, title, artist_slug, artist_name, category, release_year, cdn_path,
          cover_url, song_count, audio_present_count, audio_missing_count, cover_present, metadata_complete,
          visibility, visibility_source, validation, present_in_manifest, last_modified_at, last_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,TRUE,$18,NOW())
       ON CONFLICT (album_code) DO UPDATE SET
         title=EXCLUDED.title, artist_slug=EXCLUDED.artist_slug, artist_name=EXCLUDED.artist_name,
         category=EXCLUDED.category, release_year=EXCLUDED.release_year, cdn_path=EXCLUDED.cdn_path,
         cover_url=EXCLUDED.cover_url, song_count=EXCLUDED.song_count,
         audio_present_count=EXCLUDED.audio_present_count, audio_missing_count=EXCLUDED.audio_missing_count,
         cover_present=EXCLUDED.cover_present, metadata_complete=EXCLUDED.metadata_complete,
         visibility=EXCLUDED.visibility, validation=EXCLUDED.validation, present_in_manifest=TRUE,
         last_modified_at=EXCLUDED.last_modified_at, last_synced_at=NOW(), updated_at=NOW()`,
      [a.album_code, a.album_id, a.title, a.artist_slug, a.artist_name, a.category, a.release_year,
        a.cdn_path, a.cover_url, a.song_count, a.audio_present_count, a.audio_missing_count,
        a.cover_present, a.metadata_complete, visibility, p?.visibility_source || 'auto',
        JSON.stringify(validation), a.last_modified_at]);
    for (const c of validation) {
      await client.query(
        `INSERT INTO production.music_validation_results (album_code, check_name, passed, detail, checked_at)
           VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (album_code, check_name)
           DO UPDATE SET passed=EXCLUDED.passed, detail=EXCLUDED.detail, checked_at=NOW()`,
        [a.album_code, c.check, c.passed, c.detail || null]);
    }
  });
  return { ...a, visibility, validation };
}

// Next scheduled-run time for a cadence (used by the scheduler + config echo).
export function nextRunAt(schedule, from = new Date()) {
  const ms = { hourly: 36e5, '6h': 6 * 36e5, '12h': 12 * 36e5, daily: 24 * 36e5, weekly: 7 * 24 * 36e5 }[schedule];
  return ms ? new Date(from.getTime() + ms) : null;
}
