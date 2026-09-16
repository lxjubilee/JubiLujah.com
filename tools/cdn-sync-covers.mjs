#!/usr/bin/env node
/*
 * cdn-sync-covers.mjs — push album COVER art from the music drive to the CDN.
 *
 * The third of the sync trio, and until 2026-09-10 the missing one:
 *
 *   cdn-sync-music.mjs     tracks/*.mp3            ("covers … are NOT touched; audio only")
 *   cdn-sync-artwork.mjs   artwork/<CODE>-support-<N>.webp
 *   cdn-sync-covers.mjs    artwork/<CODE>.png      <- this file
 *
 * A cover is what `hasCover()` gates the whole site on: app/web/lib/covers.ts hides an
 * album from every listing when its code is absent from album-covers.json, and that file
 * is written by probing the CDN. So an album whose cover never reaches the bucket is not
 * merely missing a picture — it is invisible.
 *
 * 🔴 THE BUCKET KEY IS NOT THE PUBLIC URL. Measured against live objects on 2026-09-10:
 *
 *   bucket key   music/albums/inspire/<artist>/<album>/artwork/IMIM1001EN.png
 *   public URL   https://cd.jubilujah.com/music/inspire/<artist>/<album>/artwork/IMIM1001EN.png   200
 *                https://cd.jubilujah.com/music/albums/inspire/…                                  404
 *
 * The edge strips the `albums/` segment; the bucket keeps it. The upload key is therefore
 * `music/` + the manifest's own album.path (which already begins `albums/`), and the URL
 * the site builds is that with `albums/` removed — exactly what app/web/lib/cdn.ts
 * musicUrl() does. Neither is guessed here: both come from catalog-manifest.json.
 *
 * 🔴 `--music` DEFAULTS TO J:/jubilujah.com/music, NOT J:/jubileepraise.com/music. The
 * rename of 2026-08-27 created the jubileepraise root but did not move the ~41 GB into it;
 * it is still empty. Pointing this tool there finds zero covers and reports success.
 *
 * Existing objects are never overwritten unless --replace is passed, and nothing on R2 is
 * ever deleted by this tool.
 *
 * Usage:
 *   node tools/cdn-sync-covers.mjs                    # report only
 *   node tools/cdn-sync-covers.mjs --apply            # upload the missing ones
 *   node tools/cdn-sync-covers.mjs --apply --replace  # also re-upload covers already there
 *   node tools/cdn-sync-covers.mjs --persona=melody-inspire
 *   node tools/cdn-sync-covers.mjs --codes=JEIM1082EN,IMIM1041EN
 *
 * Requires the `jubilee-r2` rclone remote. Per PUBLISH.md the token for this bucket lives
 * only on prod (/var/www/jubilujah.com/.env); the local R2_AVATARS_* token is scoped to
 * jubileeverse-cdn and cannot write here.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};

// 🔴 `jubilujah-cdn`, NOT a JubileePraise bucket, and that is deliberate.
// The 2026-08-27 rename rewrote this to `jubileepraise-cdn`; restored 2026-09-10.
// `cd.jubileepraise.com` has no DNS record, so no JubileePraise CDN exists —
// every media URL on the live site (www.jubileepraise.com included) resolves to
// `cd.jubilujah.com`, and `jubilujah-cdn` is the bucket behind it. Pointed at a
// jubileepraise bucket this either errors on a bucket that is not there or,
// worse, uploads to one nothing serves and reports success. Same exclusion
// CLAUDE.md documents for the CDN host, one level down at the bucket.
const REMOTE = opt('remote', 'jubilee-r2:jubilujah-cdn');
const MUSIC = opt('music', 'J:/jubilujah.com/music');
const MANIFEST = opt('manifest', 'app/web/public/music/catalog-manifest.json');
const ONLY = opt('persona', '');
const CODES = opt('codes', '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const APPLY = flag('apply');
const REPLACE = flag('replace');

const say = (s) => process.stdout.write(s + '\n');
const fail = (s) => { say('✗ ' + s); process.exit(1); };

// ── album code → the manifest's own path, so no key is ever constructed here ──
if (!fs.existsSync(MANIFEST)) fail(`manifest not found: ${MANIFEST}`);
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const meta = new Map();
for (const c of manifest.categories || [])
  for (const a of c.artists || [])
    for (const al of a.albums || [])
      if (al.code && al.path) meta.set(String(al.code).toUpperCase(), { path: al.path, artist: a.slug, title: al.title });

// ── the cover master on disk, per album ──────────────────────────────────────
if (!fs.existsSync(MUSIC)) fail(`music root not found: ${MUSIC}`);
const COVER = /^([A-Z0-9]+)\.png$/i;
const found = new Map();                 // CODE -> absolute file path

function walk(dir, depth) {
  if (depth > 4) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.name === 'artwork') {
      for (const f of fs.readdirSync(full)) {
        const m = COVER.exec(f);
        // `-support-N.webp` fails COVER anyway, but be explicit: only <CODE>.png is a cover.
        if (!m) continue;
        const code = m[1].toUpperCase();
        if (meta.has(code)) found.set(code, path.join(full, f));
      }
    } else walk(full, depth + 1);
  }
}
walk(MUSIC, 0);

// ── what is already published ────────────────────────────────────────────────
const probe = spawnSync('rclone', ['listremotes'], { encoding: 'utf8' });
if (probe.error) fail('rclone is not on PATH. Install it, or run this from a box that has it.');
const remoteName = REMOTE.split(':')[0] + ':';
if (!(probe.stdout || '').split('\n').map((s) => s.trim()).includes(remoteName))
  fail(`rclone has no remote called ${remoteName} Configured: ${(probe.stdout || '').trim().replace(/\n/g, ' ') || '(none)'}`);

say(`Listing published covers in ${REMOTE}/music …`);
// The full music tree is tens of thousands of objects; only artwork PNGs matter here.
const listed = spawnSync('rclone', ['lsf', '-R', '--files-only', `${REMOTE}/music`,
  '--include', '*/artwork/*.png', '--s3-no-check-bucket'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (listed.status !== 0) {
  say('✗ rclone could not list the bucket. Is the `jubilee-r2` remote configured, and does the token cover it?');
  say((listed.stderr || '').trim());
  process.exit(1);
}
const onCdn = new Set(listed.stdout.split('\n').map((s) => s.trim()).filter(Boolean));

// ── plan ─────────────────────────────────────────────────────────────────────
const upload = [], skip = [];
for (const [code, src] of [...found].sort()) {
  const m = meta.get(code);
  if (ONLY && m.artist !== ONLY) continue;
  if (CODES.length && !CODES.includes(code)) continue;
  // Normalised, so it does not matter which manifest was read: the J: master writes
  // `inspire/<artist>/<album>` and the repo copy prefixes `albums/`.
  const norm = m.path.replace(/^albums\//, '');
  const rel = `${norm}/artwork/${code}.png`;              // relative to music/
  const row = { code, src, rel, key: `music/${rel}`, title: m.title };
  if (onCdn.has(rel) && !REPLACE) skip.push(row); else upload.push(row);
}

say('');
say(`covers found on disk          ${found.size}`);
say(`already on the CDN            ${skip.length}${REPLACE ? ' (ignored: --replace)' : ''}`);
say(`to upload                     ${upload.length}`);

if (!upload.length) { say('\nNothing to upload.'); process.exit(0); }
if (!APPLY) {
  say('');
  for (const r of upload.slice(0, 12)) say(`  ${r.code}  ->  ${r.key}`);
  if (upload.length > 12) say(`  … and ${upload.length - 12} more`);
  say(`\nReport only. Re-run with --apply to upload ${upload.length} file(s).`);
  process.exit(0);
}

// ── upload ───────────────────────────────────────────────────────────────────
say('');
let ok = 0, bad = 0;
for (const r of upload) {
  const dest = `${REMOTE}/${path.posix.dirname(r.key)}/`;
  // --s3-no-check-bucket: the R2 token is scoped to objects and cannot CreateBucket,
  // which rclone otherwise attempts before every copy.
  const res = spawnSync('rclone', ['copy', r.src, dest, '--no-traverse', '--s3-no-check-bucket'], { encoding: 'utf8' });
  if (res.status === 0) { ok++; if (ok % 25 === 0) say(`  … ${ok}/${upload.length}`); }
  else { bad++; say(`  ✗ ${r.code}: ${(res.stderr || '').trim().split('\n').pop()}`); }
}
say('');
say(`uploaded ${ok}, failed ${bad}`);
say('Now re-run: node app/web/scripts/gen-album-covers.mjs   (CDN probe — until it runs, the site still hides these albums)');
