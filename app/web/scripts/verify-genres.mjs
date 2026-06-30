// Verification helper: for a sample of albums per persona, print the blueprint's
// authoritative style fields next to the current displayed genres, so the
// primary/secondary labels can be checked against what each album actually is.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MUSIC = (process.env.ARTWORK_BASE || 'J:/music').replace(/\\/g, '/');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'music', 'catalog-manifest.json'), 'utf8'));
const GENRES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'music', 'album-genres.json'), 'utf8')).genres || {};

const PERSONAS = ['jubilee-inspire','melody-inspire','zariah-inspire','elias-inspire','eliana-inspire',
  'caleb-inspire','imani-inspire','zev-inspire','amir-inspire','nova-inspire','santiago-inspire','tahoma-inspire'];
const PER = Number(process.argv[2] || 2);

function blueprintLines(albumPath) {
  for (const dir of [path.join(MUSIC, albumPath, 'lyrics'), path.join(MUSIC, albumPath)]) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (!/blueprint\.md$/i.test(name)) continue;
      try {
        const body = fs.readFileSync(path.join(dir, name), 'utf8');
        return body.split('\n')
          .filter((l) => /album type:|dominant music styles?:|^\s*\*\*fusion:|genre\s*\/\s*sound|primary style:/i.test(l))
          .map((l) => l.replace(/^[#>\-*\s]+/, '').replace(/\*\*/g, '').trim())
          .slice(0, 3);
      } catch { return []; }
    }
  }
  return [];
}

for (const slug of PERSONAS) {
  let artist = null, cat = null;
  for (const c of manifest.categories || []) for (const a of c.artists || []) if (a.slug === slug) { artist = a; cat = c; }
  if (!artist) { console.log(`\n## ${slug}: (not found)`); continue; }
  console.log(`\n## ${artist.name}  [persona genres: ${JSON.stringify(artist.genres)}]`);
  for (const al of (artist.albums || []).slice(0, PER)) {
    console.log(`  ${al.code}  "${al.title}"  derived=${JSON.stringify(GENRES[al.code] || [])}`);
    for (const l of blueprintLines(al.path)) console.log(`      · ${l.slice(0, 150)}`);
  }
}
