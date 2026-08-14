#!/usr/bin/env node
/*
 * check-manifest.mjs — read-only staleness gate for the catalog manifest.
 *
 * WHY THIS EXISTS: PUBLISH.md Step 0 calls `node C:/jubilujah-local/rebuild-manifest.js`
 * (dry run) as a MANDATORY gate. That tool was never present on this machine. This
 * script reproduces the gate's *signal* — "would add: N" — by diffing album folders on
 * disk against the album paths recorded in the manifest.
 *
 * It only REPORTS. The write half now exists: `deploy/rebuild-manifest.mjs` (add-only).
 *
 * ── CORRECTED 2026-08-14 ────────────────────────────────────────────────────────
 * This gate could not run at all as originally written. Two defects, both fixed here:
 *
 *   1. Default `--music=J:/music` does not exist. The real source tree is
 *      `J:/jubilujah.com/music` (PUBLISH.md carried the stale path too).
 *   2. It assumed an `albums/` directory under the music root and walked exactly
 *      `albums/<category>/<artist>/<album>`. On disk there is no `albums/` level, and
 *      album folders sit at depth 1–3 (`tiny-tiggles/<album>`,
 *      `inspire/<artist>/<album>`, `nations/romanian/<artist>/<album>`).
 *
 * It now detects album folders structurally (a directory containing tracks/, lyrics/
 * or artwork/, or loose mp3s) and compares by ALBUM CODE rather than by path, because
 * 163 albums exist at two different disk paths and are not duplicates to be added.
 * It also tolerates the `albums/` prefix carried by the bundled web copy of the
 * manifest (see lib/cdn.ts — the prefix is intentional and is stripped for CDN urls).
 *
 * Usage:
 *   node deploy/check-manifest.mjs
 *   node deploy/check-manifest.mjs --manifest=app/web/public/music/catalog-manifest.json
 *   node deploy/check-manifest.mjs --list        # print every missing album
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
const MUSIC = arg("music", "J:/jubilujah.com/music").replace(/\\/g, "/").replace(/\/+$/, "");
const MANIFEST = arg("manifest", `${MUSIC}/catalog-manifest.json`);
const LIST = args.includes("--list");

if (!fs.existsSync(MANIFEST)) {
  console.error(`manifest not found: ${MANIFEST}`);
  process.exit(2);
}
if (!fs.existsSync(MUSIC)) {
  console.error(`music root not found: ${MUSIC}`);
  process.exit(2);
}

// ---- 1. albums recorded in the manifest (by code AND by path) --------------
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const knownCodes = new Set();
const knownPaths = new Set();
let manifestAlbums = 0;
for (const cat of manifest.categories ?? []) {
  for (const artist of cat.artists ?? []) {
    for (const album of artist.albums ?? []) {
      manifestAlbums++;
      if (album.code) knownCodes.add(String(album.code).toUpperCase());
      if (album.path) {
        // the bundled web copy carries an intentional `albums/` prefix (lib/cdn.ts)
        knownPaths.add(album.path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/^albums\//, ""));
      }
    }
  }
}

// ---- 2. album folders actually on disk -------------------------------------
// No `albums/` level exists. Album folders sit at depth 1–3 and are identified
// structurally: a directory holding tracks/, lyrics/ or artwork/, or loose mp3s.
const RESERVED = new Set(["tracks", "lyrics", "artwork", "manifest", "lossless", "high", "standard", "preview"]);
const dirs = (p) => {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};
const hasMp3 = (abs) => {
  try { return fs.readdirSync(abs).some((f) => /\.mp3$/i.test(f)); } catch { return false; }
};
const onDisk = [];
const walk = (parts, depth) => {
  for (const d of dirs(path.join(MUSIC, ...parts))) {
    if (RESERVED.has(d)) continue;
    const next = [...parts, d];
    const abs = path.join(MUSIC, ...next);
    if (dirs(abs).some((k) => RESERVED.has(k)) || hasMp3(abs)) onDisk.push(next.join("/"));
    else if (depth < 3) walk(next, depth + 1);
  }
};
walk([], 0);

// ---- 3. diff ---------------------------------------------------------------
// Compare by CODE: 163 albums exist at two disk paths (e.g. children/party-giggles/X
// and party-giggles/X). Those are the same album, not a missing one.
const codeOf = (rel) => {
  const leaf = rel.split("/").pop();
  const m = leaf.match(/^([A-Za-z]+\d[A-Za-z0-9]*)/);
  return (m ? m[1] : leaf).toUpperCase();
};
const unreconciled = onDisk.filter((p) => !knownPaths.has(p) && !knownCodes.has(codeOf(p))).sort();
const orphaned = [...knownPaths].filter((p) => !onDisk.includes(p)).sort();

// ---- 3b. deliberate holds --------------------------------------------------
// deploy/manifest-hold.json records album folders knowingly kept OUT of the
// manifest, with a reason. They are reported but do NOT fail the gate — so the
// gate keeps its meaning: anything missing that is NOT held is an accident.
let holds = [];
try {
  const holdFile = arg("holds", path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "manifest-hold.json"));
  holds = JSON.parse(fs.readFileSync(holdFile, "utf8")).holds ?? [];
} catch { /* no hold file — every miss is stale */ }
const isHeld = (p) => holds.find((h) => p.startsWith(h.match));
const held = unreconciled.filter(isHeld);
const missing = unreconciled.filter((p) => !isHeld(p));

const age = manifest.generated
  ? Math.floor((Date.now() - Date.parse(manifest.generated)) / 86400000)
  : null;

console.log(`manifest : ${MANIFEST}`);
console.log(`generated: ${manifest.generated ?? "unknown"}${age === null ? "" : `  (${age} days old)`}`);
console.log(`albums   : ${manifestAlbums} in manifest · ${onDisk.length} on disk`);
console.log("");
console.log(`would add: ${missing.length}`);
if (held.length) console.log(`held (reviewed, see deploy/manifest-hold.json): ${held.length}`);
if (orphaned.length) console.log(`in manifest but not on disk: ${orphaned.length}`);

if (held.length) {
  console.log("");
  const byReason = new Map();
  for (const p of held) {
    const h = isHeld(p);
    byReason.set(h.match, (byReason.get(h.match) ?? 0) + 1);
  }
  for (const [m, n] of byReason) {
    const h = holds.find((x) => x.match === m);
    console.log(`  HELD ${String(n).padStart(4)}  ${m}`);
    console.log(`        ${h.reason.split(". ")[0]}.`);
    console.log(`        needs: ${h.decision_needed_from}`);
  }
}

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
