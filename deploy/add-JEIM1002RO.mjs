#!/usr/bin/env node
/*
 * add-JEIM1002RO.mjs — surgical catalog insert for one album that fell through the
 * stale-manifest gap (JEIM1002RO "Piatra Răsturnată", Jubilee Inspire, Romanian).
 *
 * The audio + art are already on the CDN (verified 200); the album was simply never
 * added to catalog-manifest.json (generated 2026-07-07, 949 albums stale). This is a
 * one-album fix, NOT the general reconciler — 947 other albums remain missing.
 *
 * Derives everything from disk. Backs up every file before writing. Idempotent:
 * re-running detects the album is already present and no-ops.
 *
 *   node deploy/add-JEIM1002RO.mjs           # apply
 *   node deploy/add-JEIM1002RO.mjs --dry     # report only
 */
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const CODE = "JEIM1002RO";
const FOLDER = "JEIM1002RO-piatra-rasturnata";
const REL = `albums/inspire/jubilee-inspire/${FOLDER}`;
const TITLE = "Piatra Răsturnată";
const GENRES = ["Gospel", "Praise & Worship"]; // from EN sibling JEIM1002EN
const TRACKS_DIR = `J:/jubilujah.com/music/${REL}/tracks`;

const WEB = "app/web/public/music";
const MANIFEST_WEB = `${WEB}/catalog-manifest.json`;
const MANIFEST_MASTER = "J:/jubilujah.com/music/catalog-manifest.json";
const COVERS = `${WEB}/album-covers.json`;
const GENRESF = `${WEB}/album-genres.json`;

function backup(f) {
  const b = `${f}.bak-add1002ro`;
  if (!fs.existsSync(b)) fs.copyFileSync(f, b);
  return b;
}
function readJSON(f) { return JSON.parse(fs.readFileSync(f, "utf8")); }

// ---- build tracks[] from disk ---------------------------------------------
const files = fs.readdirSync(TRACKS_DIR).filter((f) => /\.mp3$/i.test(f)).sort();
if (files.length === 0) { console.error("no mp3 tracks on disk at", TRACKS_DIR); process.exit(2); }
const tracks = files.map((file) => {
  const m = /^(\d+)\s+(.*)\.mp3$/i.exec(file);
  const n = m ? parseInt(m[1], 10) : 0;
  const title = m ? m[2] : file.replace(/\.mp3$/i, "");
  return { n, title, file, url: `${REL}/tracks/${file}`, audio: true };
}).sort((a, b) => a.n - b.n);

const album = {
  code: CODE,
  title: TITLE,
  folder: FOLDER,
  path: REL,
  playable: tracks.length,
  trackCount: tracks.length,
  tracks,
  genres: GENRES,
};

console.log(`Album: ${CODE} "${TITLE}" — ${tracks.length} tracks`);
console.log(`  first: ${tracks[0].title} · last: ${tracks[tracks.length - 1].title}`);

// ---- 1. manifest (web copy) ------------------------------------------------
const m = readJSON(MANIFEST_WEB);
let artist;
for (const cat of m.categories) {
  if (cat.key !== "inspire") continue;
  for (const a of cat.artists || []) if (a.slug === "jubilee-inspire") artist = a;
}
if (!artist) { console.error("jubilee-inspire artist not found in manifest"); process.exit(2); }

if (artist.albums.some((x) => x.code === CODE)) {
  console.log(`\n${CODE} already present in manifest — nothing to do.`);
  process.exit(0);
}

// insert just before the first existing RO album (keeps RO grouped, ascending code)
let idx = artist.albums.findIndex((x) => /RO$/.test(x.code) && x.code > CODE);
if (idx < 0) idx = artist.albums.length;
artist.albums.splice(idx, 0, album);

m.totalAlbums = (m.totalAlbums || 0) + 1;
m.totalPlayableAlbums = (m.totalPlayableAlbums || 0) + 1;
m.totalPlayableTracks = (m.totalPlayableTracks || 0) + tracks.length;

console.log(`\nManifest: inserted at jubilee-inspire index ${idx}.`);
console.log(`  totalAlbums ${m.totalAlbums - 1} -> ${m.totalAlbums}`);
console.log(`  totalPlayableAlbums ${m.totalPlayableAlbums - 1} -> ${m.totalPlayableAlbums}`);
console.log(`  totalPlayableTracks ${m.totalPlayableTracks - tracks.length} -> ${m.totalPlayableTracks}`);

// ---- 2. covers (add code to the whitelist array) --------------------------
const cov = readJSON(COVERS);
const covAdded = !cov.covers.includes(CODE);
if (covAdded) { cov.covers.push(CODE); cov.covers.sort(); cov.count = cov.covers.length; }

// ---- 3. genres ------------------------------------------------------------
const gen = readJSON(GENRESF);
const genAdded = !(CODE in gen.genres);
if (genAdded) { gen.genres[CODE] = GENRES; gen.count = Object.keys(gen.genres).length; }

console.log(`Covers: ${covAdded ? "added" : "already present"} (count ${cov.count}).`);
console.log(`Genres: ${genAdded ? "added" : "already present"} (count ${gen.count}).`);

if (DRY) { console.log("\n--dry: no files written."); process.exit(0); }

// ---- write (with backups) -------------------------------------------------
const manifestJSON = JSON.stringify(m, null, 2);
backup(MANIFEST_WEB); fs.writeFileSync(MANIFEST_WEB, manifestJSON);
backup(MANIFEST_MASTER); fs.writeFileSync(MANIFEST_MASTER, manifestJSON); // keep master identical
backup(COVERS); fs.writeFileSync(COVERS, JSON.stringify(cov));
backup(GENRESF); fs.writeFileSync(GENRESF, JSON.stringify(gen));

// validate round-trip
for (const f of [MANIFEST_WEB, MANIFEST_MASTER, COVERS, GENRESF]) JSON.parse(fs.readFileSync(f, "utf8"));
console.log("\nWrote manifest (web + J: master), covers, genres — all JSON-valid. Backups: *.bak-add1002ro");
