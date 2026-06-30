'use strict';
// ============================================================================
// DEMO DATA for the Media Analytics Dashboard. NOT a migration. Inserts ~4000
// synthetic playback events over the last 90 days so the dashboard has data to
// show before real traffic accrues.
//
//   DATABASE_URL=postgres://... node app/db/seed-analytics-demo.js [count]
//
// Remove later with:
//   DELETE FROM production.playback_events WHERE session_id LIKE 'demo-%';
//   (then re-run this script's rollup, or DELETE FROM production.analytics_daily and replay)
// ============================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const COUNT = parseInt(process.argv[2], 10) || 4000;
const DEVICES = ['desktop', 'desktop', 'mobile', 'mobile', 'tablet'];
const BROWSERS = ['Chrome', 'Chrome', 'Safari', 'Firefox', 'Edge'];
const OSES = ['Windows', 'macOS', 'iOS', 'Android'];
const SOURCES = ['album', 'album', 'playlist', 'search', 'recommendation', 'direct'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const songs = (await client.query(
      `SELECT s.id AS song, s.album_id AS album, al.artist_id AS artist
         FROM catalog.songs s JOIN catalog.albums al ON al.id = s.album_id`
    )).rows;
    const users = (await client.query('SELECT id FROM identity.users')).rows.map((r) => r.id);
    if (!songs.length || !users.length) { console.error('Need catalog songs + users seeded first.'); process.exit(1); }
    console.log(`Seeding ${COUNT} events across ${songs.length} songs and ${users.length} users…`);

    const BATCH = 500;
    for (let start = 0; start < COUNT; start += BATCH) {
      const n = Math.min(BATCH, COUNT - start);
      const vals = []; const params = []; let p = 0;
      for (let i = 0; i < n; i++) {
        const s = pick(songs);
        const dur = 180 + Math.floor(Math.random() * 120);
        const listened = Math.random() < 0.45 ? dur : Math.floor(Math.random() * dur);
        const completion = Math.min(100, Math.round((listened / dur) * 100 * 100) / 100);
        const ageMs = Math.random() * 90 * 86400000 + Math.random() * 86400000;
        const started = new Date(Date.now() - ageMs);
        const ended = new Date(started.getTime() + listened * 1000);
        vals.push(`($${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p}::production.playback_source,$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p})`);
        params.push(
          pick(users), 'demo-' + Math.floor(Math.random() * 100000), s.album, s.song, s.artist,
          pick(DEVICES), pick(BROWSERS), pick(OSES), pick(SOURCES),
          started.toISOString(), ended.toISOString(), listened, dur, completion,
          listened >= 0.9 * dur, listened < 0.8 * dur,
        );
      }
      await client.query(
        `INSERT INTO production.playback_events
           (user_id, session_id, album_id, song_id, artist_id, device_type, browser, os, source,
            started_at, ended_at, listening_seconds, duration_seconds, completion_pct, completed, skipped)
         VALUES ${vals.join(',')}`,
        params
      );
      process.stdout.write(`  ${Math.min(start + n, COUNT)}/${COUNT}\r`);
    }

    console.log('\nRebuilding analytics_daily rollup…');
    await client.query(
      `INSERT INTO production.analytics_daily (day, plays, listening_seconds, completed_plays, skipped_plays)
       SELECT (started_at AT TIME ZONE 'UTC')::date, COUNT(*), SUM(listening_seconds),
              COUNT(*) FILTER (WHERE completed), COUNT(*) FILTER (WHERE skipped)
         FROM production.playback_events GROUP BY 1
       ON CONFLICT (day) DO UPDATE SET
         plays = EXCLUDED.plays, listening_seconds = EXCLUDED.listening_seconds,
         completed_plays = EXCLUDED.completed_plays, skipped_plays = EXCLUDED.skipped_plays, updated_at = NOW()`
    );
    const c = await client.query('SELECT COUNT(*)::int AS e FROM production.playback_events');
    const d = await client.query('SELECT COUNT(*)::int AS d FROM production.analytics_daily');
    console.log(`Done. ${c.rows[0].e} events, ${d.rows[0].d} daily rows.`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
