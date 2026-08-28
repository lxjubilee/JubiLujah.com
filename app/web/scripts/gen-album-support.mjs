// ============================================================================
// Probe the CDN for which albums have a published SUPPORT image, and write
// public/music/album-support.json — the source of truth lib/support.ts reads.
//
//   node scripts/gen-album-support.mjs
//
// A support image is the wide 16:9 band above an album's song list, generated
// by the WPF Studio from that album's own cover art and stored beside it:
//
//   <CDN>/music/<album.path>/artwork/<CODE>-support-<N>.webp
//
// WHY IT PROBES FOR A NUMBER RATHER THAN A FILE.
// The Studio writes several numbered drafts per album, and choosing between
// them is done by DELETING the ones you do not want. So an album's image is
// whichever draft SURVIVED with the lowest number — 1 normally, 3 if 1 and 2
// were rejected. This walks 1..MAX_DRAFT and records the first that answers
// 200. Assuming draft 1 would leave every album whose first draft was rejected
// silently without a band, which is the failure mode nobody would report.
//
// WHAT IT WRITES is the resolved SUBPATH, not just the draft number:
//
//   { "MDIM1042EN": "inspire/melody-inspire/MDIM1042EN-.../artwork/MDIM1042EN-support-1.webp" }
//
// The manifest is open here and nowhere else in the chain, so this is the one
// place that knows an album's path for free. Writing it means the album page —
// whose rail carries codes and no paths — can resolve a url from a code alone.
//
// Re-run whenever artwork is (re)synced to the CDN.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --local scans the music drive instead of probing the CDN.
//
// BOTH MODES ARE NEEDED AND THEY ANSWER DIFFERENT QUESTIONS. The site can only
// show what it can reach: on the VPS that is the CDN, on the studio machine it
// is also J:. Running the CDN probe on a machine whose images have not been
// synced yet writes an empty index and the feature looks broken when it is only
// unpublished — which is exactly the trap this flag exists to get out of.
//
//   node scripts/gen-album-support.mjs            # before deploying
//   node scripts/gen-album-support.mjs --local    # on the studio machine
const LOCAL = process.argv.includes('--local');
const ARTWORK_BASE = process.env.ARTWORK_BASE || 'J:/jubileepraise.com/music';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CDN = (process.env.NEXT_PUBLIC_CDN_BASE || 'https://cd.jubilujah.com').replace(/\/$/, '');
const MANIFEST = path.join(ROOT, 'public', 'music', 'catalog-manifest.json');
const OUT = path.join(ROOT, 'public', 'music', 'album-support.json');
const CONCURRENCY = 24;
const TIMEOUT_MS = 8000;

// Matches CmbSupportDrafts' largest option in the Studio. Probing past it costs
// a request per album for a file that cannot exist.
const MAX_DRAFT = 4;

// The manifest keeps a leading `albums/` for the local-disk fallback; the CDN
// bucket omits it. Same normalisation as musicUrl() in lib/cdn.ts.
const cdnSubpath = (album, n) =>
  `${album.path}/artwork/${album.code}-support-${n}.webp`.replace(/^\/+/, '').replace(/^albums\//, '');

async function exists(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    return res.status === 200;
  } catch { return false; }
  finally { clearTimeout(t); }
}

/** The subpath of the lowest-numbered surviving draft, or '' when there is none. */
async function surviving(album) {
  for (let n = 1; n <= MAX_DRAFT; n++) {
    const sub = cdnSubpath(album, n);
    if (LOCAL) {
      const file = path.join(ARTWORK_BASE, sub);
      if (fs.existsSync(file)) return sub;
    } else if (await exists(`${CDN}/music/${sub}`)) {
      return sub;
    }
  }
  return '';
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const albums = [];
  for (const c of manifest.categories || [])
    for (const a of c.artists || [])
      for (const al of a.albums || [])
        if (al.path && al.code) albums.push(al);

  console.log(LOCAL
    ? `Scanning ${albums.length} albums for support images under ${ARTWORK_BASE} …`
    : `Probing ${albums.length} albums for support images on ${CDN} …`);
  const support = {};
  let done = 0, found = 0;
  for (let i = 0; i < albums.length; i += CONCURRENCY) {
    const batch = albums.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (al) => ({ code: al.code, sub: await surviving(al) })));
    for (const r of results) if (r.sub) { support[r.code.toUpperCase()] = r.sub; found++; }
    done += batch.length;
    process.stdout.write(`  ${done}/${albums.length} (found ${found})\r`);
  }

  const sorted = {};
  for (const k of Object.keys(support).sort()) sorted[k] = support[k];
  fs.writeFileSync(OUT, JSON.stringify(
    { generated: new Date().toISOString(), source: LOCAL ? ARTWORK_BASE : CDN, count: found, support: sorted }, null, 0));
  console.log(`\nWrote ${OUT}: ${found}/${albums.length} albums have a support image ${LOCAL ? 'on the drive' : 'on the CDN'}.`);
  if (LOCAL && found > 0) {
    console.log('This index is LOCAL. Re-run without --local before deploying, or the site');
    console.log('will claim images the VPS cannot reach and heroes will render without one.');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
