'use strict';
// ============================================================================
// Catalog importer — mirrors the authoritative manifest into catalog.* using
// the deterministic UUIDv5 mapping (db/ids.js) so editorial tables that store a
// rateable_id can join to real catalog rows for admin/reporting.
//
// The manifest remains the source of truth for browsing; this is a one-way
// mirror, safe to re-run (idempotent via ON CONFLICT). It also seeds a small
// amount of demo editorial data (ratings/comments) for the first playable album.
//
//   node db/import-catalog.js
// ============================================================================
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { albumUuid, songUuid } = require('./ids');

const MANIFEST_PATH = process.env.MANIFEST_PATH
  ? path.resolve(__dirname, '..', process.env.MANIFEST_PATH)
  : path.join(__dirname, '..', 'web', 'public', 'music', 'catalog-manifest.json');

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const EDITOR_ID = '22222222-2222-2222-2222-222222222222';

// Map manifest category keys to the four canonical groupings (§6).
function groupingFor(categoryKey) {
  if (categoryKey === 'inspire') return 'inspire_family';
  if (categoryKey === 'party-giggles' || categoryKey === 'tiny-tiggles') return 'childrens_brands';
  if (categoryKey === 'faith-based' || categoryKey === 'general') return 'affiliated_artists';
  return 'other_initiatives';
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('Manifest not found at', MANIFEST_PATH);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let artistCount = 0, albumCount = 0, songCount = 0;
  let firstPlayable = null;

  try {
    await client.query('BEGIN');

    for (const category of manifest.categories || []) {
      const grouping = groupingFor(category.key);
      for (const artist of category.artists || []) {
        // Upsert artist; RETURNING id handles both freshly-seeded and existing rows.
        const a = await client.query(
          `INSERT INTO catalog.artists (slug, display_name, grouping, genre_anchor)
             VALUES ($1, $2, $3, $4)
           ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
           RETURNING id`,
          [artist.slug, artist.name, grouping, artist.role || null]
        );
        const artistId = a.rows[0].id;
        artistCount++;

        for (const album of artist.albums || []) {
          const albumId = albumUuid(album.code);
          const slug = album.folder || album.code;
          await client.query(
            `INSERT INTO catalog.albums (id, artist_id, slug, title, is_published)
               VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
            [albumId, artistId, slug, album.title || album.code, (album.playable || 0) > 0]
          );
          albumCount++;
          if (!firstPlayable && (album.playable || 0) > 0) firstPlayable = album;

          for (const track of album.tracks || []) {
            // Skip malformed tracks (some manifest entries lack a track number).
            const n = Number(track.n);
            if (!Number.isInteger(n) || n < 1 || n > 99) continue;
            const songId = songUuid(album.code, n);
            await client.query(
              `INSERT INTO catalog.songs (id, album_id, track_number, title)
                 VALUES ($1, $2, $3, $4)
               ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
              [songId, albumId, n, track.title || ('Track ' + n)]
            );
            songCount++;
          }
        }
      }
    }

    // ---- demo editorial data on the first playable album ------------------
    if (firstPlayable) {
      const albumId = albumUuid(firstPlayable.code);
      await client.query(
        `INSERT INTO production.ratings (rateable_type, rateable_id, rater_user_id, stars, note)
           VALUES ('album', $1, $2, 5, 'Reference demo rating (admin).')
         ON CONFLICT (rateable_type, rateable_id, rater_user_id) DO NOTHING`,
        [albumId, ADMIN_ID]
      );
      await client.query(
        `INSERT INTO production.ratings (rateable_type, rateable_id, rater_user_id, stars, note)
           VALUES ('album', $1, $2, 4, 'Reference demo rating (editor).')
         ON CONFLICT (rateable_type, rateable_id, rater_user_id) DO NOTHING`,
        [albumId, EDITOR_ID]
      );
      await client.query(
        `INSERT INTO production.comments (rateable_type, rateable_id, author_user_id, body)
           VALUES ('album', $1, $2, 'Demo comment seeded by import-catalog.js')`,
        [albumId, ADMIN_ID]
      );
      console.log(`Demo editorial seeded on album ${firstPlayable.code}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }

  console.log(`Imported: ${artistCount} artists, ${albumCount} albums, ${songCount} songs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
