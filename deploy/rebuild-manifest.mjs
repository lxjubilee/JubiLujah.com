#!/usr/bin/env node
/*
 * rebuild-manifest.mjs — the missing reconciler for catalog-manifest.json.
 *
 * WHY THIS EXISTS: PUBLISH.md Step 0 is a MANDATORY gate ("never publish on a
 * stale manifest"), and `check-manifest.mjs` restored the *detection* half of it
 * — but nothing in the repo ever wrote the manifest back. New albums landed on
 * disk and stayed invisible on every page. This is the write half.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN: ADD-ONLY. This tool never modifies or deletes an existing entry.
 *
 * That is a deliberate constraint, not laziness, because large parts of the
 * manifest are CURATED and cannot be regenerated from disk:
 *
 *   • Album titles are not derivable from folder slugs.
 *       AMIM1002EN-bridge-forever  ->  title "Cedars of Praise"
 *   • Track titles are not derivable from filenames.
 *       01_love-was-looking-at-me.mp3  ->  title "Open the Window"
 *   • Category is not derivable from the disk path.
 *       radiant-stones + kingdom-pulse live under faith-based/ on disk
 *       but belong to category `inspire` in the manifest.
 *   • `christmas: true` and per-album `genres` are curated/derived elsewhere.
 *
 * A regenerate-from-scratch tool would silently destroy all of the above. So
 * this one only ever APPENDS albums that are missing, and reports everything it
 * is unsure about instead of guessing.
 *
 * PLACEMENT: a new album is placed by looking up its PARENT DIRECTORY in the
 * mapping the existing manifest already demonstrates (parent path -> category +
 * artist). If a parent has no precedent, the album is reported as UNPLACEABLE
 * and skipped — never guessed into the wrong category.
 *
 * DUPLICATE PATHS: 160 album codes exist at two different disk paths (e.g.
 * `children/party-giggles/IX401EN-…` and `party-giggles/IX401EN-…`). Album code
 * is the site's identity (`albumUuid(code)`, `getAlbumByCode`), so adding the
 * twin would create a phantom duplicate album. Codes already present anywhere in
 * the manifest are skipped.
 *
 * PATH PREFIX: the J: master stores `inspire/…`; the bundled web copy stores
 * `albums/inspire/…` (lib/cdn.ts strips `albums/` when building CDN urls, and
 * keeps it for the local-disk fallback). Use --prefix to emit the web flavour.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage:
 *   node deploy/rebuild-manifest.mjs                          # dry run, J: master
 *   node deploy/rebuild-manifest.mjs --apply
 *   node deploy/rebuild-manifest.mjs --apply \
 *        --out=app/web/public/music/catalog-manifest.json --prefix=albums/
 *   node deploy/rebuild-manifest.mjs --list                   # every addition
 *
 * Flags:
 *   --music=<dir>     source tree            (default J:/jubilujah.com/music)
 *   --manifest=<file> manifest to read       (default <music>/catalog-manifest.json)
 *   --out=<file>      manifest to write      (default = --manifest)
 *   --prefix=<str>    prepend to album.path  (e.g. albums/)
 *   --apply           actually write (default is dry run)
 *   --no-backup       skip the .bak snapshot
 *   --list            print every album that would be added
 *
 * Exit codes: 0 = ok · 2 = usage/IO error
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const has = (k) => args.includes(`--${k}`);

const MUSIC = arg("music", "J:/jubilujah.com/music").replace(/\\/g, "/").replace(/\/+$/, "");
const MANIFEST = arg("manifest", `${MUSIC}/catalog-manifest.json`);
const OUT = arg("out", MANIFEST);
const PREFIX = arg("prefix", "").replace(/^\/+/, "");
const APPLY = has("apply");
const LIST = has("list");
const BACKUP = !has("no-backup");

if (!fs.existsSync(MANIFEST)) {
  console.error(`manifest not found: ${MANIFEST}`);
  process.exit(2);
}
if (!fs.existsSync(MUSIC)) {
  console.error(`music root not found: ${MUSIC}`);
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

// ── directory helpers ───────────────────────────────────────────────────────
const RESERVED = new Set([
  "tracks", "lyrics", "artwork", "manifest",
  "lossless", "high", "standard", "preview",
]);
const dirs = (p) => {
  try {
    return fs.readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name);
  } catch { return []; }
};

// ── 1. learn placement + identity from the existing manifest ────────────────
// parent path ("inspire/jubilee-inspire") -> { categoryKey, artistSlug }
const parentMap = new Map();
const knownCodes = new Set();
const knownPaths = new Set();
let existingAlbums = 0;

for (const c of manifest.categories ?? []) {
  for (const a of c.artists ?? []) {
    for (const al of a.albums ?? []) {
      existingAlbums++;
      if (al.code) knownCodes.add(String(al.code).toUpperCase());
      if (!al.path) continue;
      const p = al.path.replace(/\\/g, "/").replace(/^albums\//, "");
      knownPaths.add(p);
      const parent = p.split("/").slice(0, -1).join("/");
      if (parent && !parentMap.has(parent)) {
        parentMap.set(parent, { categoryKey: c.key, artistSlug: a.slug });
      }
    }
  }
}

// artist lookup by (category, slug) so we can append into the right array
const artistRef = new Map();
for (const c of manifest.categories ?? []) {
  for (const a of c.artists ?? []) artistRef.set(`${c.key}\u0000${a.slug}`, a);
}

// ── 2. find album folders on disk ───────────────────────────────────────────
// An album folder is one containing tracks/ | lyrics/ | artwork/, or loose mp3s.
const albumDirs = [];
const walk = (parts, depth) => {
  for (const d of dirs(path.join(MUSIC, ...parts))) {
    if (RESERVED.has(d)) continue;
    const next = [...parts, d];
    const abs = path.join(MUSIC, ...next);
    const kids = dirs(abs);
    if (kids.some((k) => RESERVED.has(k)) || hasMp3(abs)) albumDirs.push(next.join("/"));
    else if (depth < 3) walk(next, depth + 1);
  }
};
function hasMp3(abs) {
  try { return fs.readdirSync(abs).some((f) => /\.mp3$/i.test(f)); } catch { return false; }
}
walk([], 0);

// ── 3. derivation helpers ───────────────────────────────────────────────────
const SMALL = new Set(["a","an","and","as","at","but","by","for","from","in","of","on","or","the","to","with"]);
const deslug = (s) =>
  s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
   .split(" ")
   .map((w, i, arr) => {
     const lw = w.toLowerCase();
     if (i > 0 && i < arr.length - 1 && SMALL.has(lw)) return lw;
     return w.charAt(0).toUpperCase() + w.slice(1);
   })
   .join(" ");

// code = leading alphanumeric token of the folder name (JEIM1082EN-hover-here)
const codeOf = (folder) => {
  const m = folder.match(/^([A-Za-z]+\d[A-Za-z0-9]*)/);
  return m ? m[1] : folder;
};

// Best-effort album title. Curated titles cannot be regenerated, so anything
// this produces for a NEW album is flagged for review in the report.
function titleFor(abs, folder, code) {
  // 1. album.meta.json
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(abs, "album.meta.json"), "utf8"));
    if (meta.album_title) return { title: String(meta.album_title), src: "album.meta.json" };
  } catch { /* none */ }
  // 2. lyrics file: "<Artist> Inspire-<Title>-lyrics.md"
  try {
    const f = fs.readdirSync(path.join(abs, "lyrics")).find((x) => /-lyrics\.md$/i.test(x));
    if (f) {
      const mm = f.replace(/-lyrics\.md$/i, "").split("-");
      if (mm.length >= 2) return { title: mm.slice(1).join("-").trim(), src: "lyrics filename" };
    }
  } catch { /* none */ }
  // 3. de-slug the folder after the code
  const rest = folder.startsWith(code) ? folder.slice(code.length).replace(/^[-_]+/, "") : folder;
  return { title: deslug(rest) || code, src: "folder slug (REVIEW)" };
}

// Tracks: prefer tracks/, fall back to lyrics/ (a real misfiling in this catalog).
function tracksFor(abs, relPath) {
  for (const sub of ["tracks", "lyrics"]) {
    let files;
    try {
      files = fs.readdirSync(path.join(abs, sub)).filter((f) => /\.mp3$/i.test(f)).sort();
    } catch { continue; }
    if (!files.length) continue;
    const seen = new Set();
    let dupes = 0;
    const tracks = files.map((file, i) => {
      const m = file.match(/^(\d{1,3})/);
      let n = m ? parseInt(m[1], 10) : i + 1;
      if (seen.has(n)) { dupes++; }           // preserved, reported — matches live data
      seen.add(n);
      const base = file.replace(/\.mp3$/i, "").replace(/^\d{1,3}[\s._-]*/, "");
      return {
        n,
        title: deslug(base),
        file,
        url: `${relPath}/${sub}/${file}`,
        audio: true,
      };
    });
    return { tracks, sub, dupes };
  }
  return { tracks: [], sub: null, dupes: 0 };
}

// ── 4. reconcile ────────────────────────────────────────────────────────────
const additions = [];
const unplaceable = [];
const dupCodeSkipped = [];
let reviewTitles = 0, misfiled = 0, dupTrackNums = 0;

for (const rel of albumDirs) {
  if (knownPaths.has(rel)) continue;
  const folder = rel.split("/").pop();
  const parent = rel.split("/").slice(0, -1).join("/");
  const code = codeOf(folder);

  if (knownCodes.has(code.toUpperCase())) { dupCodeSkipped.push({ rel, code }); continue; }

  const place = parentMap.get(parent);
  if (!place) { unplaceable.push({ rel, code, parent }); continue; }

  const abs = path.join(MUSIC, ...rel.split("/"));
  const { title, src } = titleFor(abs, folder, code);
  if (src.includes("REVIEW")) reviewTitles++;
  const { tracks, sub, dupes } = tracksFor(abs, PREFIX + rel);
  if (sub === "lyrics") misfiled++;
  if (dupes) dupTrackNums += dupes;

  const artist = artistRef.get(`${place.categoryKey}\u0000${place.artistSlug}`);
  const entry = {
    code,
    title,
    folder,
    path: PREFIX + rel,
    playable: tracks.length,
    trackCount: tracks.length,
    tracks,
  };
  if (artist?.genres?.length) entry.genres = [...artist.genres];

  additions.push({ entry, place, rel, titleSrc: src, artist });
  knownCodes.add(code.toUpperCase());
}

// ── 5. orphans (recorded but no longer on disk) — reported, never removed ────
const onDisk = new Set(albumDirs);
const orphans = [...knownPaths].filter((p) => !onDisk.has(p));

// ── 6. report ───────────────────────────────────────────────────────────────
console.log(`source    : ${MUSIC}`);
console.log(`manifest  : ${MANIFEST}`);
console.log(`out       : ${OUT}${PREFIX ? `   (path prefix "${PREFIX}")` : ""}`);
console.log("");
console.log(`album folders on disk        : ${albumDirs.length}`);
console.log(`already in manifest          : ${existingAlbums}`);
console.log(`WOULD ADD                    : ${additions.length}`);
console.log(`  ...with audio              : ${additions.filter((a) => a.entry.playable > 0).length}`);
console.log(`  ...studio (no audio yet)   : ${additions.filter((a) => a.entry.playable === 0).length}`);
console.log(`  ...title needs review      : ${reviewTitles}`);
console.log(`  ...mp3s under lyrics/      : ${misfiled}`);
console.log(`  ...duplicate track numbers : ${dupTrackNums}`);
console.log(`skipped, code already present: ${dupCodeSkipped.length}   (same album at a second disk path)`);
console.log(`UNPLACEABLE (no precedent)   : ${unplaceable.length}`);
console.log(`orphaned entries (kept)      : ${orphans.length}`);

if (unplaceable.length) {
  console.log("\nUNPLACEABLE — parent directory has no precedent in the manifest:");
  for (const u of unplaceable.slice(0, LIST ? 1e9 : 15)) console.log(`  ? ${u.rel}`);
  if (!LIST && unplaceable.length > 15) console.log(`  ... and ${unplaceable.length - 15} more (--list)`);
}
if (additions.length) {
  console.log("\nadditions:");
  const show = LIST ? additions : additions.slice(0, 20);
  for (const a of show) {
    console.log(`  + [${a.place.categoryKey}/${a.place.artistSlug}] ${a.entry.code}  "${a.entry.title}"  ${a.entry.playable} trk   ${a.titleSrc}`);
  }
  if (!LIST && additions.length > show.length) console.log(`  ... and ${additions.length - show.length} more (--list)`);
}

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply.");
  process.exit(0);
}

// ── 7. apply ────────────────────────────────────────────────────────────────
for (const a of additions) {
  a.artist.albums = a.artist.albums || [];
  a.artist.albums.push(a.entry);
  a.artist.albums.sort((x, y) => String(x.code).localeCompare(String(y.code)));
}

// recompute totals
let totalAlbums = 0, totalPlayableAlbums = 0, totalPlayableTracks = 0;
const artistSlugs = new Set();
for (const c of manifest.categories ?? []) {
  for (const a of c.artists ?? []) {
    artistSlugs.add(a.slug);
    for (const al of a.albums ?? []) {
      totalAlbums++;
      if ((al.playable || 0) > 0) { totalPlayableAlbums++; totalPlayableTracks += al.playable; }
    }
  }
}
manifest.totalAlbums = totalAlbums;
manifest.totalArtists = artistSlugs.size;
manifest.totalPlayableAlbums = totalPlayableAlbums;
manifest.totalPlayableTracks = totalPlayableTracks;
manifest.generated = new Date().toISOString();

if (BACKUP && fs.existsSync(OUT)) {
  const bak = `${OUT}.bak`;
  fs.copyFileSync(OUT, bak);
  console.log(`\nbackup    : ${bak}`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 1));
console.log(`WROTE     : ${OUT}`);
console.log(`totals    : ${totalAlbums} albums · ${artistSlugs.size} artists · ${totalPlayableAlbums} playable albums · ${totalPlayableTracks} playable tracks`);
