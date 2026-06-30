// ============================================================================
// gen-completion-dates.mjs — record each album's COMPLETION DATE = when its
// audio was uploaded to the J: drive (the max mtime of its tracks/*.mp3 files).
//
// The registry is IMMUTABLE / first-seen: once an album has a recorded date it
// is NEVER changed, so a later re-render can't move it to a different workweek.
// This is the permanent record the Production History page buckets by workweek.
//
// Run on a machine with J: mounted:  node scripts/gen-completion-dates.mjs
// Writes public/music/album-completion-dates.json. Deploy it like the other
// generated catalog JSON (the prod server has no J: drive).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.ARTWORK_BASE || 'J:/music';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PUB = path.join(here, '..', 'public', 'music');
const MANIFEST = path.join(PUB, 'catalog-manifest.json');
const OUT = path.join(PUB, 'album-completion-dates.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let registry = { generated: null, dates: {} };
try { registry = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
registry.dates = registry.dates || {};

let added = 0, kept = 0, noAudio = 0;
for (const c of manifest.categories) for (const a of c.artists) for (const al of a.albums) {
  if (registry.dates[al.code]) { kept++; continue; }   // immutable: never overwrite
  let maxT = 0;
  try {
    for (const f of fs.readdirSync(path.join(ROOT, al.path, 'tracks'))) {
      if (!/\.mp3$/i.test(f)) continue;
      const st = fs.statSync(path.join(ROOT, al.path, 'tracks', f));
      if (st.mtimeMs > maxT) maxT = st.mtimeMs;
    }
  } catch {}
  if (!maxT) { noAudio++; continue; }                  // no audio yet → not completed
  registry.dates[al.code] = new Date(maxT).toISOString();
  added++;
}

registry.generated = new Date().toISOString();
fs.writeFileSync(OUT, JSON.stringify(registry, null, 2));
console.log(`album-completion-dates.json: +${added} new, ${kept} kept (immutable), ${noAudio} no-audio. Total dated: ${Object.keys(registry.dates).length}`);
