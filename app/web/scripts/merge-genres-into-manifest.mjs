// ============================================================================
// Bake the derived data into the catalog manifest(s):
//   - every album gets   "genres": [g1, g2]   (from album-genres.json)
//   - every mapped persona artist gets "genre": "<pill label>"
// Updates the web copy and (if present) the J: master, preserving 2-space JSON.
//
//   node scripts/merge-genres-into-manifest.mjs
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARTWORK_BASE = (process.env.ARTWORK_BASE || 'J:/music').replace(/\\/g, '/');

const GENRES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'music', 'album-genres.json'), 'utf8')).genres || {};

const norm = (g) => (g === 'Praise-Worship' ? 'Praise & Worship' : g);

function updateManifest(file) {
  if (!fs.existsSync(file)) { console.log(`  skip (missing): ${file}`); return; }
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  let albums = 0, artists = 0;
  for (const c of m.categories || []) {
    for (const a of c.artists || []) {
      const counts = {};
      for (const al of a.albums || []) {
        const g = GENRES[al.code];
        if (g && g.length) {
          al.genres = g.map(norm);
          albums++;
          for (const x of al.genres) counts[x] = (counts[x] || 0) + 1;
        }
      }
      // Artist-level genres = the artist's two most-common album genres.
      const top = Object.entries(counts).sort((x, y) => y[1] - x[1]).slice(0, 2).map((e) => e[0]);
      if (top.length) { a.genres = top; artists++; }
    }
  }
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
  console.log(`  updated ${file}: ${albums} albums tagged, ${artists} personas tagged`);
}

console.log('Merging genres into catalog manifests…');
updateManifest(path.join(ROOT, 'public', 'music', 'catalog-manifest.json'));
updateManifest(path.join(ARTWORK_BASE, 'catalog-manifest.json'));
console.log('Done.');
