#!/usr/bin/env node
/*
 * refresh-tracks.mjs — bring existing albums' tracks[] up to date with what is
 * actually PUBLISHED, and recompute the playable totals.
 *
 * deploy/rebuild-manifest.mjs only ADDS albums; it never revisits one it has
 * already seen. So an album whose audio was rendered after it was first listed
 * keeps `playable: 0` forever and the site shows it as studio-only. That is the
 * gap this closes, and it is the last step of a publish: sync the audio, then
 * run this, then deploy.
 *
 * 🔴 audio:true MEANS "ON THE CDN", NOT "ON THE DRIVE", and that distinction is
 * the whole reason this exists rather than a disk walk. The player streams from
 * cd.jubilujah.com. A track sitting in J: tracks/ that never reached the bucket
 * is not playable, and marking it so puts a dead player on a public page. The
 * publish gate in tools/cdn-sync-music.mjs deliberately HOLDS pre-rewrite
 * renders — 13 of them on this run — and those files are on the drive precisely
 * because they must not be published. Reading the drive would undo the gate.
 *
 * So the bucket is listed once and used as the source of truth for the flag,
 * while the drive supplies the filenames and order.
 *
 * BOTH MANIFEST COPIES, EACH IN ITS OWN PATH CONVENTION. The J: master writes
 * `inspire/<artist>/<album>` and the repo copy prefixes `albums/`, which
 * app/web/lib/cdn.ts strips at url-build time. Track urls are therefore built
 * from each album's OWN path field rather than a constant, so neither file is
 * rewritten into the other's shape.
 *
 * Usage:
 *   node deploy/refresh-tracks.mjs                    # dry run
 *   node deploy/refresh-tracks.mjs --apply
 *   node deploy/refresh-tracks.mjs --persona=tahoma-inspire
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ONLY = opt('persona', '');
const REMOTE = opt('remote', 'jubilee-r2:jubileepraise-cdn');

const MANIFESTS = [
  'J:/jubileepraise.com/music/catalog-manifest.json',
  'W:/JubileePraise.com/app/web/public/music/catalog-manifest.json',
];
const ROOTS = ['J:/jubileepraise.com/music', 'J:/gopartygiggles.com/music', 'J:/mytinytiggles.com/music'];
const say = (s) => process.stdout.write(s + '\n');

// ── what is published ────────────────────────────────────────────────────────
say(`Listing published audio in ${REMOTE}/music …`);
const ls = spawnSync('rclone', ['lsf', '-R', '--files-only', `${REMOTE}/music`,
  '--include', '*.mp3', '--s3-no-check-bucket'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (ls.status !== 0) { say('✗ rclone could not list the bucket.'); say((ls.stderr || '').trim()); process.exit(1); }
const published = new Set(ls.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
say(`  ${published.size} mp3 object(s) published.`);

// ── album folder on disk, by code ────────────────────────────────────────────
const diskByCode = new Map();
function walk(dir, depth) {
  if (depth > 4) return;
  let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (!x.isDirectory() || x.name.startsWith('_') || x.name.startsWith('.')) continue;
    const full = path.join(dir, x.name);
    if (x.name === 'tracks') {
      const code = path.basename(path.dirname(full)).split('-', 1)[0].toUpperCase();
      if (code) diskByCode.set(code, full);
    } else walk(full, depth + 1);
  }
}
for (const r of ROOTS) walk(r, 0);

const NUMBERED = new RegExp('^([0-9]+)[ _-]+(.*)[.]mp3$', 'i');

let changedAlbums = 0, gained = 0, lost = 0;
const notes = [];

for (const file of MANIFESTS) {
  if (!fs.existsSync(file)) { say(`  (skipped, not on this machine: ${file})`); continue; }
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  let touched = 0;

  for (const cat of manifest.categories || []) {
    for (const artist of cat.artists || []) {
      if (ONLY && artist.slug !== ONLY) continue;
      for (const al of artist.albums || []) {
        const code = String(al.code || '').toUpperCase();
        const dir = diskByCode.get(code);
        if (!dir || !al.path) continue;

        // The album's own path decides the url shape, so each manifest keeps its
        // own convention. `rel` is what the bucket listing is relative to.
        const norm = String(al.path).replace(/^albums\//, '');
        const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.mp3')).sort();

        const tracks = files.map((f) => {
          const m = NUMBERED.exec(f);
          return {
            n: m ? parseInt(m[1], 10) : 0,
            title: m ? m[2] : f.slice(0, -4),
            file: f,
            url: `${al.path}/tracks/${f}`,
            audio: published.has(`${norm}/tracks/${f}`),
          };
        });

        const playable = tracks.filter((t) => t.audio).length;
        if (playable === (al.playable || 0) && tracks.length === (al.tracks || []).length) continue;

        if (playable > (al.playable || 0)) gained += playable - (al.playable || 0);
        else lost += (al.playable || 0) - playable;
        if (file === MANIFESTS[0]) {
          changedAlbums++;
          notes.push(`  ${code.padEnd(11)} ${artist.slug.padEnd(18)} playable ${String(al.playable || 0).padStart(3)} -> ${String(playable).padStart(3)}  of ${tracks.length}`);
        }
        al.tracks = tracks;
        al.trackCount = tracks.length;
        al.playable = playable;
        touched++;
      }
    }
  }

  // Totals, recomputed from the albums rather than adjusted, so they cannot drift.
  let totalAlbums = 0, playAlbums = 0, playTracks = 0;
  for (const cat of manifest.categories || [])
    for (const artist of cat.artists || [])
      for (const al of artist.albums || []) {
        totalAlbums++;
        if ((al.playable || 0) > 0) { playAlbums++; playTracks += al.playable; }
      }
  manifest.totalAlbums = totalAlbums;
  manifest.totalPlayableAlbums = playAlbums;
  manifest.totalPlayableTracks = playTracks;
  manifest.generated = new Date().toISOString();

  say('');
  say(`${file}`);
  say(`  albums touched ${touched} · totals: ${totalAlbums} albums · ${playAlbums} playable albums · ${playTracks} playable tracks`);

  if (APPLY && touched > 0) {
    const bak = `${file}.bak-refresh`;
    fs.copyFileSync(file, bak);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    say(`  written (backup: ${path.basename(bak)})`);
  }
}

say('');
say(`albums changed ${changedAlbums} · tracks gaining audio ${gained} · losing ${lost}`);
for (const n of notes.slice(0, 15)) say(n);
if (notes.length > 15) say(`  … and ${notes.length - 15} more`);
if (!APPLY) say('\nDry run. Re-run with --apply to write both manifests.');
