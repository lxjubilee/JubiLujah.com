#!/usr/bin/env node
/*
 * _r2-sync-music-inspire.js — incremental sync of J:/jubilujah.com/music/inspire -> Cloudflare R2
 * under the `music/inspire/` prefix, so tracks serve at
 * https://cdn.jubilujah.com/music/inspire/<artist>/<album>/tracks/<file>.
 *
 * Modeled directly on _r2-sync-avatars.js (W:/JubileeVerse.com): diff by size, nothing is ever
 * deleted, `--apply` to upload, immutable cache headers for media. Credentials are read from a
 * .env file (NEVER printed):
 *   R2_S3_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_CDN
 *
 * NOTE ON THE BUCKET: the avatars sync targets `jubileeverse-cdn` (cdn.jubileeverse.com). This
 * job targets cdn.jubilujah.com, which is a DIFFERENT bucket. Either set R2_BUCKET_CDN to the
 * jubilujah bucket in the .env you point at, or override per-run with --bucket=<name>.
 *
 * PUBLISH SCOPE (decided 2026-07-21): audio + album art ONLY — 4,795 files / 23.58 GB.
 * Everything else in that tree is internal (blueprints, todo notes, red-flags.md, lyric .docx,
 * catalog .zip archives, _artwork-backup, desktop.ini/Thumbs.db) and must not reach a public CDN.
 *
 * DEPENDENCY: @aws-sdk/client-s3 is declared in app/api/package.json but is NOT installed at the
 * repo root, so a bare `node _r2-sync-music-inspire.js` fails with MODULE_NOT_FOUND. Either:
 *   cd app/api && npm install          # then run with NODE_PATH=w:/JubiLujah.com/app/api/node_modules
 *   NODE_PATH=w:/JubileeInspire.com/api/node_modules node _r2-sync-music-inspire.js   # works today
 *
 * Usage:
 *   node _r2-sync-music-inspire.js                     # diff only — shows what would upload
 *   node _r2-sync-music-inspire.js --apply             # upload missing/size-mismatched files
 *   node _r2-sync-music-inspire.js --apply --concurrency=8
 *   node _r2-sync-music-inspire.js --bucket=jubilujah-cdn --env=W:/JubiLujah.com/.env
 */
const fs = require("fs");
const path = require("path");
const { S3Client, ListObjectsV2Command, PutObjectCommand } = require("@aws-sdk/client-s3");

const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const APPLY = args.includes("--apply");
const CONC = Math.max(1, Math.min(parseInt(arg("concurrency", "6"), 10) || 6, 12));
const SRC = arg("src", "J:/jubilujah.com/music/inspire");
const PREFIX = arg("prefix", "music/inspire/").replace(/^\/+/, "");
const ENVF = arg("env", process.env.R2_ENV_FILE || "");

// load a .env into process.env (only vars not already set); silent if file missing
function loadEnv(file) {
  if (!file) return;
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
[ENVF, "W:/JubiLujah.com/.env", "W:/JubileeInspire.com/api/.env", "W:/JubileeVerse.com/.env"].forEach(loadEnv);

// Credentials live under two different naming schemes in this estate:
//   R2_S3_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_CDN  (_r2-sync-avatars.js)
//   R2_AVATARS_ENDPOINT / R2_AVATARS_ACCESS_KEY_ID / ...                      (JubileeInspire api/.env)
// Accept either. NOTE: the R2_AVATARS_* token is scoped to the `jubileeverse-cdn` bucket only
// (verified: ListBuckets returns AccessDenied), so it CANNOT write a jubilujah bucket. Publishing
// to cdn.jubilujah.com needs a token scoped to that bucket, or an account-wide one.
const BUCKET = arg("bucket", process.env.R2_BUCKET_CDN || process.env.R2_AVATARS_BUCKET);
const R2_S3_ENDPOINT      = process.env.R2_S3_ENDPOINT      || process.env.R2_AVATARS_ENDPOINT;
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID    || process.env.R2_AVATARS_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_AVATARS_SECRET_ACCESS_KEY;
if (!R2_S3_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !BUCKET) {
  console.error("Missing R2 creds (need R2_S3_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_CDN).");
  console.error("Point --env=<path to a .env that has them>, or export them in the shell.");
  process.exit(2);
}
if (/^https?:\/\//i.test(BUCKET) || BUCKET.includes(".")) {
  console.error(`Bucket looks like a hostname ('${BUCKET}'). It must be the bucket NAME (e.g. jubilujah-cdn);`);
  console.error("the public domain is bound to the bucket separately in the Cloudflare dashboard.");
  process.exit(2);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_S3_ENDPOINT,
  forcePathStyle: true, // R2 gotcha #1, per JubileeInspire api/services/r2-avatars.js
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const CT = { ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// --- The publish whitelist -------------------------------------------------
// Include by FILE TYPE, never by folder. A blanket `lyrics/` exclusion looks correct and is
// wrong: album CAIM1016EN-surrender has all 12 of its .mp3 tracks misfiled inside its lyrics/
// folder, and a directory-level rule silently drops the entire album from the CDN.
const PUBLISHABLE = /\.(mp3|png|jpe?g|webp)$/i;
const EXCLUDED_DIR = /(^|[\\/])_artwork-backup[^\\/]*([\\/]|$)/i;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!EXCLUDED_DIR.test(p)) out.push(...walk(p)); }
    else out.push(p);
  }
  return out;
}

async function listRemote() {
  const map = new Map();
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token }));
    for (const o of r.Contents || []) map.set(o.Key, o.Size);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return map;
}

(async () => {
  if (!fs.existsSync(SRC)) { console.error("source dir not found:", SRC); process.exit(2); }
  const all = walk(SRC);
  const files = all.filter((f) => PUBLISHABLE.test(f) && !EXCLUDED_DIR.test(f));
  const heldBack = all.length - files.length;

  // Surface the misfiled-album defect rather than quietly publishing a bad key shape.
  const misfiled = files.filter((f) => /[\\/]lyrics[\\/]/i.test(f));

  const remote = await listRemote();
  const todo = [];
  let bytes = 0;
  for (const f of files) {
    const rel = path.relative(SRC, f).split(path.sep).join("/");
    const key = PREFIX + rel;
    const size = fs.statSync(f).size;
    if (remote.get(key) !== size) { todo.push({ f, key, size }); bytes += size; }
  }

  console.log(`R2 bucket=${BUCKET} prefix=${PREFIX}`);
  console.log(`publishable: ${files.length} | held back (internal/noise): ${heldBack} | remote keys: ${remote.size}`);
  console.log(`PLAN: upload ${todo.length} files (${(bytes / 1073741824).toFixed(2)} GB)`);
  if (misfiled.length) {
    console.log(`\n  !! ${misfiled.length} audio/art files sit under a lyrics/ folder and will publish at a`);
    console.log(`     key shape no other album uses (…/<album>/lyrics/<file> instead of …/tracks/<file>).`);
    console.log(`     Fix the source layout before --apply, or these tracks will be unreachable by any`);
    console.log(`     consumer that resolves tracks via the <album>/tracks/ convention.`);
    misfiled.slice(0, 3).forEach((f) => console.log(`       - ${path.relative(SRC, f).split(path.sep).join("/")}`));
    if (misfiled.length > 3) console.log(`       ... and ${misfiled.length - 3} more`);
  }
  console.log("");
  todo.slice(0, 15).forEach((t) => console.log("  +", t.key, `(${(t.size / 1048576).toFixed(2)} MB)`));
  if (todo.length > 15) console.log(`  ... and ${todo.length - 15} more`);
  if (!APPLY) { console.log("\n(diff only — re-run with --apply to upload)"); return; }

  let i = 0, done = 0, fail = 0;
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      const ext = path.extname(t.f).toLowerCase();
      try {
        // R2 gotcha #2 (api/services/r2-avatars.js): R2 rejects the AWS chunked/streaming
        // signature STREAMING-AWS4-HMAC-SHA256-PAYLOAD. PUT a Buffer with a known
        // Content-Length so the SDK signs the whole body and never streams. Largest file in
        // this set is 11.39 MB and concurrency caps at 12, so peak buffered memory is ~128 MB
        // (measured, not estimated). Do NOT "optimize" this back to fs.createReadStream.
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET, Key: t.key, Body: fs.readFileSync(t.f),
          ContentType: CT[ext] || "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable", ContentLength: t.size,
        }));
        if (++done % 20 === 0 || done + fail === todo.length) console.log(`  uploaded ${done}/${todo.length}`);
      } catch (e) { fail++; console.error("  FAIL", t.key, String((e && e.message) || e).slice(0, 140)); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`\nDONE: uploaded ${done}, failed ${fail}`);
  process.exit(fail ? 1 : 0);
})();
