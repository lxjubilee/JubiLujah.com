#!/usr/bin/env node
/*
 * check-manifest.mjs — read-only staleness gate for the catalog manifest.
 *
 * WHY THIS EXISTS: PUBLISH.md Step 0 calls `node C:/jubilujah-local/rebuild-manifest.js`
 * (dry run) as a MANDATORY gate. That tool is not present on this machine and no copy
 * exists anywhere on W:. This script reproduces the gate's *signal* — "would add: N" —
 * by diffing album folders on disk against the album paths recorded in the manifest.
 *
 * It only REPORTS. It never writes the manifest. Reconciling still needs the real
 * rebuild tool (or a deliberate manual add).
 *
 * Usage:
 *   node deploy/check-manifest.mjs
 *   node deploy/check-manifest.mjs --music=J:/music --manifest=J:/music/catalog-manifest.json
 *   node deploy/check-manifest.mjs --list        # print every missing album path
 *
 * Exit codes: 0 = current (would add: 0) · 3 = stale · 2 = usage/IO error
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const MUSIC = arg("music", "J:/music").replace(/\\/g, "/").replace(/\/+$/, "");
const MANIFEST = arg("manifest", `${MUSIC}/catalog-manifest.json`);
const LIST = args.includes("--list");

if (!fs.existsSync(MANIFEST)) {
  console.error(`manifest not found: ${MANIFEST}`);
  process.exit(2);
}
const albumsRoot = path.join(MUSIC, "albums");
if (!fs.existsSync(albumsRoot)) {
  console.error(`albums dir not found: ${albumsRoot}`);
  process.exit(2);
}

// ---- 1. album paths recorded in the manifest -------------------------------
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const known = new Set();
let manifestAlbums = 0;
for (const cat of manifest.categories ?? []) {
  for (const artist of cat.artists ?? []) {
    for (const album of artist.albums ?? []) {
      manifestAlbums++;
      if (album.path) known.add(album.path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
    }
  }
}

// ---- 2. album folders actually on disk -------------------------------------
// Layout: albums/<category>/<artist>/<CODE-slug>
const dirs = (p) => {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};
const onDisk = [];
for (const category of dirs(albumsRoot)) {
  for (const artist of dirs(path.join(albumsRoot, category))) {
    for (const album of dirs(path.join(albumsRoot, category, artist))) {
      onDisk.push(`albums/${category}/${artist}/${album}`);
    }
  }
}

// ---- 3. diff ---------------------------------------------------------------
const missing = onDisk.filter((p) => !known.has(p)).sort();
const orphaned = [...known].filter((p) => !onDisk.includes(p)).sort();

const age = manifest.generated
  ? Math.floor((Date.now() - Date.parse(manifest.generated)) / 86400000)
  : null;

console.log(`manifest : ${MANIFEST}`);
console.log(`generated: ${manifest.generated ?? "unknown"}${age === null ? "" : `  (${age} days old)`}`);
console.log(`albums   : ${manifestAlbums} in manifest · ${onDisk.length} on disk`);
console.log("");
console.log(`would add: ${missing.length}`);
if (orphaned.length) console.log(`in manifest but not on disk: ${orphaned.length}`);

if (missing.length) {
  const show = LIST ? missing : missing.slice(0, 15);
  for (const p of show) console.log(`  + ${p}`);
  if (!LIST && missing.length > show.length) {
    console.log(`  ... and ${missing.length - show.length} more  (--list to see all)`);
  }
  console.log("");
  console.log("MANIFEST IS STALE — new albums would be silently dropped from every page.");
  console.log("Reconcile before publishing (PUBLISH.md Step 0).");
  process.exit(3);
}

console.log("");
console.log("Manifest is current.");
process.exit(0);
