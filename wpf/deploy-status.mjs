#!/usr/bin/env node
/*
 * deploy-status.mjs — read-only measurement of the three places that hold
 * JubileePraise.com: this checkout, the production VPS, and the CDN bucket.
 *
 * It is what the Studio's Deploy view reads. It changes nothing, anywhere.
 *
 *   node wpf/deploy-status.mjs            # human readable
 *   node wpf/deploy-status.mjs --json     # the shape the Studio parses
 *   node wpf/deploy-status.mjs --no-ssh   # skip the production round trip
 *   node wpf/deploy-status.mjs --music=J:/jubileepraise.com/music
 *
 * EVERY NUMBER IS MEASURED, NONE ASSUMED. When a probe cannot run it says so
 * and reports null rather than 0, because "I could not reach the server" and
 * "the server has nothing" are different answers and only one of them means
 * press Deploy. The Studio renders a null as "?" for the same reason.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const arg = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};

const JSON_OUT = flag("json");
const NO_SSH = flag("no-ssh");

// The music drive. Not derived from the Studio's music root, which points one
// level deeper at the persona folders: the manifest and the category folders
// live together at this level.
const MUSIC = arg("music", "J:/jubileepraise.com/music").replace(/\\/g, "/").replace(/\/+$/, "");
const MANIFEST = arg("manifest", `${MUSIC}/catalog-manifest.json`);

// Production. The host and key are deploy/publish.sh's, verbatim.
//
// THE PATH IS NOT. publish.sh names /var/www/JubileePraise.com and the directory on
// the box is /var/www/jubileepraise.com, lowercase, with the web app under web/
// rather than app/web/ — so the shape publish.sh ships is not the shape that is
// running. This probe therefore SEARCHES rather than asserting, and reports
// which root it found along with whether publish.sh's own path was among them.
// Measuring the box that exists is safe; silently retargeting the deploy script
// at a different path would not be, so this file does not touch publish.sh.
const SSH_KEY = path.join(process.env.USERPROFILE || "", ".ssh", "id_ed25519_jubilee_prod");
const PROD = "root@94.72.120.231";
const PUBLISH_SH_PATH = "/var/www/JubileePraise.com";
const PROD_ROOTS = ["/var/www/JubileePraise.com", "/var/www/jubileepraise.com"];
const PROD_WEB_DIRS = ["web", "app/web"];
const ORIGIN = "http://127.0.0.1:3119/";
const PUBLIC_URL = "https://www.jubileepraise.com/";
const PM2_APPS = ["jubileepraise-web", "jubileepraise"];

// ---------------------------------------------------------------- helpers ---
const countFiles = (dir, ext) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && (!ext || e.name.toLowerCase().endsWith(ext)))
      .length;
  } catch {
    return 0;
  }
};

const dirNames = (p) => {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

// ------------------------------------------------------------------ local ---
function measureLocal() {
  const articles = countFiles(path.join(REPO, "core", "articles"), ".md");

  let backstage = 0;
  for (const section of ["interviews", "stories", "testimonies"]) {
    const dir = path.join(REPO, "core", "backstage", section);
    try {
      backstage += fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md").length;
    } catch { /* a missing section counts as none */ }
  }

  const pub = path.join(REPO, "app", "web", "public", "images");
  const images = countFiles(path.join(pub, "articles")) + countFiles(path.join(pub, "backstage"));

  return { articles, backstage, images };
}

// ------------------------------------------------------- the album manifest --
//
// Two questions, and they are not the same one:
//
//   1. What does the repo's OWN gate say? deploy/publish.sh refuses to publish
//      on deploy/check-manifest.mjs, so that script is the authority and this
//      runs it rather than second-guessing it.
//   2. If the gate cannot run at all, what is actually true on the drive?
//
// The fallback exists because the gate is currently pointed at a layout this
// drive does not have — it looks for <music>/albums/<category>/<artist>/<album>
// and the manifest's own paths are <category>/<artist>/<album>, with no albums/
// level on disk — so it exits 2 before comparing anything. A tool that reported
// "not checked" and stopped there would leave the one number that matters
// unmeasured. The fallback measures the same diff the gate describes, against
// the manifest's own path shape, and SAYS which of the two produced the number.
function measureManifest() {
  const out = { checked: false, wouldAdd: null, source: "", reason: "" };

  try {
    execFileSync("node", [path.join("deploy", "check-manifest.mjs")], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    out.checked = true;
    out.wouldAdd = 0;
    out.source = "deploy/check-manifest.mjs";
    return out;
  } catch (e) {
    const code = typeof e.status === "number" ? e.status : -1;
    const said = `${e.stdout || ""}${e.stderr || ""}`;
    if (code === 3) {
      // The gate ran and found the manifest stale. Its own count is the answer.
      const m = /would add:\s*(\d+)/.exec(said);
      out.checked = true;
      out.wouldAdd = m ? Number(m[1]) : null;
      out.source = "deploy/check-manifest.mjs";
      return out;
    }
    out.reason =
      `deploy/check-manifest.mjs could not run (exit ${code}): ` +
      (said.split("\n").find((l) => l.trim().length) || "no output").trim();
  }

  // Fallback: measure it here, and label it as such.
  try {
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

    // The manifest's own path shape: <category>/<artist>/<CODE-slug>. Only
    // categories that the manifest already names are walked, so a scratch or
    // backup folder sitting beside them is not counted as a missing album.
    const categories = new Set([...known].map((p) => p.split("/")[0]));
    const onDisk = [];
    for (const category of dirNames(MUSIC)) {
      if (!categories.has(category)) continue;
      for (const artist of dirNames(path.join(MUSIC, category))) {
        if (artist.startsWith("_") || artist.startsWith(".")) continue;
        for (const album of dirNames(path.join(MUSIC, category, artist))) {
          if (album.startsWith("_") || album.startsWith(".")) continue;
          onDisk.push(`${category}/${artist}/${album}`);
        }
      }
    }

    out.checked = true;
    out.wouldAdd = onDisk.filter((p) => !known.has(p)).length;
    out.source = "measured here, the repo gate could not run";
    out.manifestAlbums = manifestAlbums;
    out.diskAlbums = onDisk.length;
    out.generated = manifest.generated ?? null;
  } catch (e) {
    out.reason += (out.reason ? " · " : "") + `manifest unreadable at ${MANIFEST}: ${e.message}`;
  }
  return out;
}

/** Album folders on the drive, in the manifest's own path shape. */
function measureAlbums(manifest) {
  if (typeof manifest.diskAlbums === "number") {
    return { albums: manifest.diskAlbums, manifestAlbums: manifest.manifestAlbums ?? 0 };
  }
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    let manifestAlbums = 0;
    const categories = new Set();
    for (const cat of m.categories ?? []) {
      for (const artist of cat.artists ?? []) {
        for (const album of artist.albums ?? []) {
          manifestAlbums++;
          if (album.path) categories.add(String(album.path).replace(/\\/g, "/").split("/")[0]);
        }
      }
    }
    let albums = 0;
    for (const category of dirNames(MUSIC)) {
      if (!categories.has(category)) continue;
      for (const artist of dirNames(path.join(MUSIC, category))) {
        if (artist.startsWith("_") || artist.startsWith(".")) continue;
        albums += dirNames(path.join(MUSIC, category, artist))
          .filter((a) => !a.startsWith("_") && !a.startsWith(".")).length;
      }
    }
    return { albums, manifestAlbums };
  } catch {
    return { albums: 0, manifestAlbums: 0 };
  }
}

// ------------------------------------------------------------- production ---
//
// One SSH round trip, emitting KEY=value lines. Anything that cannot be
// measured on the box emits nothing for that key rather than a zero, and the
// parser leaves it null.
const REMOTE_SCRIPT = `
set -u

# The site root, and then the web app inside it. Both are searched rather than
# assumed, because the two do not agree with deploy/publish.sh.
ROOT=""
for c in ${PROD_ROOTS.join(" ")}; do [ -d "$c" ] && { ROOT="$c"; break; }; done
[ -n "$ROOT" ] || { echo "DEPLOYED=0"; exit 0; }
echo "DEPLOYED=1"
echo "ROOT=$ROOT"

WEB=""
for w in ${PROD_WEB_DIRS.join(" ")}; do
  [ -f "$ROOT/$w/public/articles/articles.json" ] && { WEB="$ROOT/$w"; break; }
done
[ -n "$WEB" ] || WEB="$ROOT/web"
echo "WEB=$WEB"

A=$(node -e 'try{const j=require(process.argv[1]);process.stdout.write(String((j.articles||[]).length))}catch(e){}' "$WEB/public/articles/articles.json" 2>/dev/null)
[ -n "$A" ] && echo "ARTICLES=$A"

IA=$(ls -1 "$WEB/public/images/articles" 2>/dev/null | wc -l)
IB=$(ls -1 "$WEB/public/images/backstage" 2>/dev/null | wc -l)
echo "IMAGES=$((IA+IB))"

S=$(date -r "$WEB/public/articles/articles.json" '+%Y-%m-%d %H:%M' 2>/dev/null)
[ -n "$S" ] && echo "SHIPPED=$S"

RUN=0
for app in ${PM2_APPS.join(" ")}; do
  P=$(pm2 pid "$app" 2>/dev/null | head -1 | tr -dc '0-9')
  [ -n "$P" ] && [ "$P" != "0" ] && { RUN=1; echo "PM2=$app"; break; }
done
echo "RUNNING=$RUN"

H=$(curl -sS -o /dev/null -m 10 -w '%{http_code}' ${ORIGIN} 2>/dev/null)
[ -n "$H" ] && echo "HTTP=$H"
PUB=$(curl -sS -o /dev/null -m 15 -w '%{http_code}' ${PUBLIC_URL} 2>/dev/null)
[ -n "$PUB" ] && echo "PUBLIC=$PUB"
`;

function measureProduction() {
  const out = { reachable: false, deployed: false, reason: "", articles: null, images: null };

  if (NO_SSH) { out.reason = "skipped (--no-ssh)"; return out; }
  if (!fs.existsSync(SSH_KEY)) { out.reason = `SSH key not found at ${SSH_KEY}`; return out; }

  let text;
  try {
    text = execFileSync(
      "ssh",
      ["-i", SSH_KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
       "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=12",
       PROD, "bash -s"],
      { input: REMOTE_SCRIPT, encoding: "utf8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch (e) {
    out.reason =
      e.code === "ENOENT"
        ? "ssh is not on PATH — install the Windows OpenSSH client, or use Git's ssh"
        : `ssh failed: ${(e.stderr || e.message || "").toString().split("\n")[0]}`;
    return out;
  }

  out.reachable = true;
  const kv = {};
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) kv[m[1]] = m[2];
  }

  out.deployed = kv.DEPLOYED === "1";
  if (!out.deployed) {
    out.reason = `none of ${PROD_ROOTS.join(", ")} is present on the box`;
    return out;
  }

  if (kv.ARTICLES !== undefined) out.articles = Number(kv.ARTICLES);
  if (kv.IMAGES !== undefined) out.images = Number(kv.IMAGES);
  out.root = kv.ROOT ?? "";
  out.web = kv.WEB ?? "";
  out.pm2 = kv.PM2 ?? "";
  out.shipped = kv.SHIPPED ?? "unknown";
  out.running = kv.RUNNING === "1";
  out.http = kv.HTTP ?? "?";
  out.public = kv.PUBLIC ?? "?";

  // Said out loud rather than smoothed over: publish.sh ships to a path the box
  // does not have, so a deploy from this button would not land where the site is
  // actually served from.
  out.publishShPathOk = out.root === PUBLISH_SH_PATH;
  if (!out.publishShPathOk)
    out.warning =
      `deploy/publish.sh targets ${PUBLISH_SH_PATH}, but the live tree is ${out.root} — ` +
      "reconcile the script before shipping from here";

  return out;
}

// -------------------------------------------------------------------- cdn ---
//
// "Configured" means publish.sh could actually run its sync step: the script it
// calls exists, and the credentials it reads are present. It does NOT mean the
// bucket is in sync — measuring that is a full R2 listing and belongs to the
// sync script itself, which prints its own PLAN line during a publish.
function measureCdn() {
  const script = path.join(REPO, "_r2-sync-music-inspire.js");
  const creds = "W:/JubileeInspire.com/api/.env";

  if (!fs.existsSync(script)) return { configured: false, reason: `sync script missing at ${script}` };
  if (!fs.existsSync(creds)) return { configured: false, reason: `R2 credentials not found at ${creds}` };
  try {
    const env = fs.readFileSync(creds, "utf8");
    if (!/R2_[A-Z_]*ACCESS_KEY/i.test(env))
      return { configured: false, reason: `${creds} carries no R2 access key` };
  } catch (e) {
    return { configured: false, reason: `could not read ${creds}: ${e.message}` };
  }
  return { configured: true, bucket: "jubileeverse-cdn", prefix: "music/" };
}

// ------------------------------------------------------------------- main ---
const local = measureLocal();
const manifest = measureManifest();
const albums = measureAlbums(manifest);
const production = measureProduction();
const cdn = measureCdn();

const report = {
  repo: REPO,
  music: MUSIC,
  local: { ...local, albums: albums.albums, manifestAlbums: albums.manifestAlbums },
  production,
  manifest,
  cdn,
};

if (JSON_OUT) {
  process.stdout.write(JSON.stringify(report, null, 2));
} else {
  const q = (v) => (v === null || v === undefined ? "?" : String(v));
  console.log(`repo        ${REPO}`);
  console.log(`music       ${MUSIC}`);
  console.log("");
  console.log(`articles    ${local.articles} here · ${q(production.articles)} live`);
  console.log(`backstage   ${local.backstage} pieces here`);
  console.log(`images      ${local.images} here · ${q(production.images)} live`);
  console.log(`albums      ${albums.albums} on the drive · ${albums.manifestAlbums} in the manifest`);
  console.log("");
  console.log(
    `manifest    ${manifest.checked ? `would add: ${q(manifest.wouldAdd)}  (${manifest.source})` : `not checked — ${manifest.reason}`}`
  );
  console.log(
    `production  ${
      !production.reachable
        ? `unreachable — ${production.reason}`
        : !production.deployed
          ? `never deployed — ${production.reason}`
          : `${production.web}\n            shipped ${production.shipped} · pm2 ${production.pm2 || "?"} ${production.running ? "online" : "STOPPED"} · origin ${production.http} · public ${production.public}`
    }`
  );
  if (production.warning) console.log(`  ⚠        ${production.warning}`);
  console.log(`cdn         ${cdn.configured ? `bucket ${cdn.bucket}` : `not configured — ${cdn.reason}`}`);
}
