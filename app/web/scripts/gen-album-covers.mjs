// ============================================================================
// Probe the CDN for which albums actually have published cover art, and write
// public/music/album-covers.json — the source of truth for "this album has a
// cover" (used by the Home page filter) and confirmation that the CDN path is
// reachable. Re-run whenever covers are (re)synced to the CDN.
//
//   node scripts/gen-album-covers.mjs
//
// Cover location on the CDN: <CDN>/music/<album.path>/artwork/<CODE>.png
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CDN = (process.env.NEXT_PUBLIC_CDN_BASE || 'https://cdn.jubileeverse.com').replace(/\/$/, '');
const MANIFEST = path.join(ROOT, 'public', 'music', 'catalog-manifest.json');
const OUT = path.join(ROOT, 'public', 'music', 'album-covers.json');
const CONCURRENCY = 24;
const TIMEOUT_MS = 8000;

const coverUrl = (album) => `${CDN}/music/${album.path}/artwork/${album.code}.png`;

async function exists(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    return res.status === 200;
  } catch { return false; }
  finally { clearTimeout(t); }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const albums = [];
  for (const c of manifest.categories || [])
    for (const a of c.artists || [])
      for (const al of a.albums || [])
        if (al.path && al.code) albums.push(al);

  console.log(`Probing ${albums.length} album covers on ${CDN} …`);
  const covers = [];
  let done = 0;
  for (let i = 0; i < albums.length; i += CONCURRENCY) {
    const batch = albums.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (al) => ({ code: al.code, ok: await exists(coverUrl(al)) })));
    for (const r of results) if (r.ok) covers.push(r.code);
    done += batch.length;
    process.stdout.write(`  ${done}/${albums.length} (found ${covers.length})\r`);
  }
  covers.sort();
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), cdn: CDN, count: covers.length, covers }, null, 0));
  console.log(`\nWrote ${OUT}: ${covers.length}/${albums.length} albums have a CDN cover.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
