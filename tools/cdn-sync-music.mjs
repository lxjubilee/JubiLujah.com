#!/usr/bin/env node
/*
 * cdn-sync-music.mjs — push new album audio from the music drive to the CDN.
 *
 * Replaces _r2-sync-music-inspire.js at the repo root, which had three faults and
 * all three were silent:
 *
 *   1. IT COULD NOT RUN. It imports @aws-sdk/client-s3, which is declared in
 *      app/api/package.json and is not installed at the repo root, so a bare
 *      `node _r2-sync-music-inspire.js` dies with MODULE_NOT_FOUND.
 *
 *   2. ITS PREFIX WAS WRONG. It defaulted to `music/inspire/`. The live tree — the
 *      one catalog-manifest.json builds every track URL from — is
 *      `music/albums/inspire/`. `music/inspire/` is EMPTY on the bucket. Had the
 *      dependency been installed, a single --apply would have pushed 23 GB to a
 *      prefix nothing serves, reported complete success, and changed nothing.
 *
 *   3. IT NAMED THE WRONG HOST AND BUCKET in its own documentation
 *      (cdn.jubilujah.com; the audio serves from the jubileeverse-cdn bucket).
 *
 * This one shells out to rclone, which is configured on this machine as the
 * `jubilee-r2` remote and needs no npm dependency at all.
 *
 * 🔴 THE PUBLISH GATE IS BUILT IN AND IS THE POINT OF THIS TOOL.
 *
 * An album whose lyrics were rewritten for compliance still has the OLD audio
 * sitting in tracks/ — the folder looks full, the count still reads twelve, and
 * pushing it puts retired songs on the public CDN under an album that now says
 * something else. The only mechanical trace of that is the filename: a track
 * whose name no current `SONG TITLE:` line claims is a pre-rewrite render.
 *
 * Those are HELD, never uploaded, and written to a list for review. On the run
 * this tool was written for, that was 331 of 826 candidates — 314 of them Amir,
 * whose AMIM1002EN still had "Cedars of Praise" and "Pour the Qahwa for the King"
 * on disk against lyrics that now read "The Grove Breaks Into Singing".
 *
 * Usage:
 *   node tools/cdn-sync-music.mjs                 # report only: what would upload, what is held
 *   node tools/cdn-sync-music.mjs --apply         # upload the gate-passed files
 *   node tools/cdn-sync-music.mjs --persona=amir-inspire
 *   node tools/cdn-sync-music.mjs --apply --force-held    # ⚠ push held files too. Do not.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};

const SRC = opt('src', 'J:/jubileepraise.com/music/inspire');
// 🔴 THE BUCKET, MEASURED 2026-08-19, AND IT IS NOT THE OBVIOUS ONE.
//
// This said jubileeverse-cdn, and that bucket EXISTS, HOLDS A FULL COPY OF THE
// AUDIO, and accepts writes — so every symptom of a working sync was present.
// It is simply not what cd.jubilujah.com serves. Proven by uploading a fresh
// object to each bucket and requesting it:
//
//   jubilujah-cdn      music/_probe/r-<n>.txt  ->  200
//   jubileeverse-cdn   music/_probe/q-<n>.txt  ->  404   (and music/albums/… 404)
//
// So a push to jubileeverse-cdn lands, reports success, and the site never plays
// it. Same class of bug this tool's header describes at the PREFIX level, one
// level up at the bucket. The probe objects were deleted afterwards.
//
// 🔴 AND THE NAME IS `jubilujah-cdn`, WHICH IS NOT A TYPO AND MUST NOT BE
// "CORRECTED" TO A JUBILEEPRAISE ONE.
//
// The JubileePraise rename rewrote this string to `jubileepraise-cdn` on
// 2026-08-27 along with 543 other files, and restored on 2026-09-10. It is the
// same exclusion CLAUDE.md already documents for the CDN HOST, one level down at
// the bucket: `cd.jubileepraise.com` has no DNS record, so no JubileePraise CDN
// exists to hold a JubileePraise bucket. `cd.jubilujah.com` is what every media
// URL on the live site resolves to — including on www.jubileepraise.com, which
// serves the identical build — and `jubilujah-cdn` is what fronts it.
//
// Pointed at `jubileepraise-cdn`, this tool does one of two things and both are
// silent: rclone errors on a bucket that does not exist, or — if somebody creates
// one to make the error go away — it uploads 35 GB to a bucket nothing serves and
// reports complete success. That is the exact failure the paragraph above this
// one was written about, repeated.
//
// This changes when `cd.jubileepraise.com` has DNS and a bucket behind it, and
// not before. Until then the CDN is the one old-brand string left standing on
// purpose.
const REMOTE = opt('remote', 'jubilee-r2:jubilujah-cdn');
// The live tree. catalog-manifest.json builds every track URL as
// `albums/inspire/<artist>/<album>/tracks/<file>` under the CDN's music/ root, so
// this is not a preference — it is the only prefix the site can play from.
// AND NO 'albums/' SEGMENT. The serving bucket's keys are the public URL path
// exactly — app/web/lib/cdn.ts strips 'albums/' off the manifest path to build a
// url, and the bucket is laid out to match. jubileeverse-cdn is the one that
// carries albums/, which is part of why the two looked interchangeable.
const PREFIX = opt('prefix', 'music/inspire');
const APPLY = flag('apply');
const FORCE = flag('force-held');
const ONLY = opt('persona', '');

const OUT = path.join(os.tmpdir(), 'cdn-sync-music');
fs.mkdirSync(OUT, { recursive: true });

const say = (s = '') => process.stdout.write(s + '\n');

// ---- preflight -------------------------------------------------------------
// Every one of these is a thing that has actually been wrong, so each is checked
// and named rather than assumed.
function preflight() {
  if (!fs.existsSync(SRC)) fail(`Music drive not found: ${SRC}`);
  const r = spawnSync('rclone', ['listremotes'], { encoding: 'utf8' });
  if (r.error) fail('rclone is not on PATH. Install it, or run the sync from a box that has it.');
  const remoteName = REMOTE.split(':')[0] + ':';
  if (!r.stdout.includes(remoteName))
    fail(`rclone has no remote called ${remoteName}. Configured: ${r.stdout.trim().replace(/\n/g, ' ') || '(none)'}`);
}
function fail(msg) { say('✗ ' + msg); process.exit(1); }

// ---- what is on each side --------------------------------------------------
function remoteMp3s() {
  say(`Listing ${REMOTE}/${PREFIX} …`);
  const out = execFileSync('rclone',
    ['lsf', `${REMOTE}/${PREFIX}`, '--recursive', '--files-only', '--include', '*.mp3', '--s3-no-check-bucket'],
    { encoding: 'utf8', maxBuffer: 1 << 28 });
  return new Set(out.split('\n').filter(Boolean));
}

function localMp3s() {
  const found = [];
  for (const persona of fs.readdirSync(SRC)) {
    if (persona.startsWith('_') || persona.startsWith('.')) continue;
    if (ONLY && persona !== ONLY) continue;
    const pdir = path.join(SRC, persona);
    if (!safeStat(pdir)?.isDirectory()) continue;
    for (const album of fs.readdirSync(pdir)) {
      const tdir = path.join(pdir, album, 'tracks');
      if (!safeStat(tdir)?.isDirectory()) continue;
      for (const f of fs.readdirSync(tdir))
        if (f.toLowerCase().endsWith('.mp3')) found.push(`${persona}/${album}/tracks/${f}`);
    }
  }
  return found.sort();
}
const safeStat = (p) => { try { return fs.statSync(p); } catch { return null; } };

// ---- the publish gate ------------------------------------------------------
const clean = (s) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const titleCache = new Map();

/** The album's CURRENT song titles, off its lyrics file. */
function currentTitles(albumDir) {
  if (titleCache.has(albumDir)) return titleCache.get(albumDir);
  const set = new Set();
  const ldir = path.join(SRC, albumDir, 'lyrics');
  if (safeStat(ldir)?.isDirectory()) {
    const file = fs.readdirSync(ldir)
      .filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'blueprint.md')
      .sort((a, b) => Number(b.includes('-lyrics')) - Number(a.includes('-lyrics')))[0];
    if (file) {
      for (const line of fs.readFileSync(path.join(ldir, file), 'utf8').split('\n')) {
        const m = /^SONG TITLE:\s*(.+?)\s*$/.exec(line.trim());
        if (m) set.add(clean(m[1]));
      }
    }
  }
  titleCache.set(albumDir, set);
  return set;
}

function gate(candidates) {
  const pass = [], hold = [], unknown = [];
  for (const rel of candidates) {
    const albumDir = rel.split('/').slice(0, 2).join('/');
    const titles = currentTitles(albumDir);
    const base = clean(path.parse(rel).name);
    if (titles.size === 0) unknown.push(rel);          // no lyrics to check against
    else if (titles.has(base)) pass.push(rel);
    else hold.push(rel);
  }
  return { pass, hold, unknown };
}

// ---- run -------------------------------------------------------------------
preflight();

const local = localMp3s();
const remote = remoteMp3s();
const candidates = local.filter((f) => !remote.has(f));

say('');
say(`local mp3s      ${local.length}`);
say(`already on CDN  ${remote.size}`);
say(`not on CDN yet  ${candidates.length}`);

if (candidates.length === 0) { say('\n✓ CDN is in sync. Nothing to push.'); process.exit(0); }

const { pass, hold, unknown } = gate(candidates);
const byPersona = (list) => {
  const m = {};
  for (const f of list) m[f.split('/')[0]] = (m[f.split('/')[0]] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
};

say('');
say('🔴 PUBLISH GATE');
say(`  PASS  ${String(pass.length).padStart(5)}  filename matches a current SONG TITLE   ${byPersona(pass)}`);
say(`  HOLD  ${String(hold.length).padStart(5)}  pre-rewrite render — NOT published      ${byPersona(hold)}`);
if (unknown.length) say(`  ?     ${String(unknown.length).padStart(5)}  no lyrics file to check against         ${byPersona(unknown)}`);

const passFile = path.join(OUT, 'pass.txt');
const holdFile = path.join(OUT, 'hold.txt');
fs.writeFileSync(passFile, pass.join('\n'));
fs.writeFileSync(holdFile, hold.join('\n'));
if (hold.length) {
  say('');
  say(`  Held tracks listed in ${holdFile}`);
  say('  These albums need their audio RE-RENDERED from the current lyrics, not uploaded.');
  const albums = [...new Set(hold.map((f) => f.split('/').slice(0, 2).join('/')))];
  say(`  ${albums.length} album(s) affected. First few:`);
  albums.slice(0, 5).forEach((a) => say('    ' + a));
}

const upload = FORCE ? [...pass, ...hold] : pass;
if (FORCE && hold.length) say('\n⚠ --force-held is set. Retired audio WILL be published. This is almost never right.');

if (!APPLY) {
  say('');
  say(`Report only. Re-run with --apply to upload ${upload.length} file(s).`);
  process.exit(0);
}
if (upload.length === 0) { say('\nNothing passed the gate. Nothing uploaded.'); process.exit(0); }

const listFile = path.join(OUT, 'upload.txt');
fs.writeFileSync(listFile, upload.join('\n'));
say('');
say(`Uploading ${upload.length} file(s) to ${REMOTE}/${PREFIX} …`);

// --checksum, not --size-only: a re-render can land on the same byte count.
// Immutable cache headers because a track's bytes never change under one name —
// a new take gets a new filename, which is exactly what the gate relies on.
const r = spawnSync('rclone', [
  // --s3-no-check-bucket: the R2 token is scoped to objects, so rclone's default
  // bucket existence check fails with AccessDenied on CreateBucket and nothing
  // uploads at all.
  'copy', SRC, `${REMOTE}/${PREFIX}`, '--s3-no-check-bucket',
  '--files-from', listFile,
  '--checksum',
  '--transfers', '8',
  '--header-upload', 'Cache-Control: public, max-age=31536000, immutable',
  '--stats', '30s', '--stats-one-line',
], { stdio: 'inherit' });

if (r.status !== 0) fail(`rclone exited ${r.status}. Nothing further was changed.`);
say('');
say(`✓ Uploaded ${upload.length} file(s).`);
if (hold.length) say(`⚠ ${hold.length} file(s) still held — see ${holdFile}.`);
say('Covers, artwork and lyrics are NOT touched by this tool; audio only.');
