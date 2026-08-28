#!/usr/bin/env bash
# publish.sh — runs the "Publish JubileePraise.com" procedure end-to-end.
# See ../PUBLISH.md for the runbook this script automates.
#
# Usage:
#   bash deploy/publish.sh                 # full: manifest gate + CDN sync + deploy + verify
#   bash deploy/publish.sh --site-only     # skip CDN sync; deploy + verify only
#   bash deploy/publish.sh --yes           # don't prompt before uploading to R2
#   bash deploy/publish.sh --skip-manifest-check   # override the Step 0 gate (NOT recommended)
#   bash deploy/publish.sh --no-backup     # skip the prod rollback snapshot
#
# 2026-07-23 repair — the previous version could not run on this machine:
#   * SYNC_SCRIPT pointed at C:/Websites/jubileeverse.com/.claude/r2-sync-music.js  (does not exist)
#   * Step 0's manifest gate pointed at C:/jubileepraise-local/rebuild-manifest.js      (does not exist)
#   * @aws-sdk/client-s3 is not installed at this repo root, so a bare `node` run fails
#   * the runbook's SSH key path named a different Windows user
# Now: uses the in-repo sync script, auto-detects the SDK, gates on deploy/check-manifest.mjs,
# and snapshots prod before deploying (PUBLISH.md previously noted rollback was NOT automatic).

set -euo pipefail

REPO_DIR="/w/JubileePraise.com"
SSH_KEY="$USERPROFILE/.ssh/id_ed25519_jubilee_prod"
PROD="root@94.72.120.231"

# CORRECTED 2026-08-27. Steps 2 and 3 below had never been updated to match the Step 2 that
# PUBLISH.md rewrote on 2026-08-14 after verifying it against the live host. Until today this
# script still did all four things that rewrite calls wrong:
#
#   * PROD_PATH=/var/www/JubileePraise.com   -> capitalised; the prod dir is lowercase
#   * tar the working tree over PROD_PATH    -> prod runs a BUILT Next.js app whose layout
#                                               (web/, api/) does not match this repo
#                                               (app/web, app/api). Raw source breaks the build.
#   * pm2 restart <bare name>                -> no such process; it is <name>-web / <name>-api
#   * verify 127.0.0.1:3119 + cdn.jubileeverse.com -> 3119 is JubileeVibes, and that CDN host
#                                               404s for music
#
# A catalog publish is ONE file (PUBLISH.md Step 2): lib/manifest.ts reads the manifest at
# runtime and caches it in memory, so it is a copy plus a restart, with no rebuild. A full
# source deploy still has no procedure in this repo — see PUBLISH.md "Standing up the parallel
# site". This script deliberately refuses to attempt one.
# TARGET: the EXISTING jubilujah deployment (Founder decision 2026-08-27 — deploy the rebrand to
# the same location and credentials rather than standing up a parallel site). These are the
# live-verified values from PUBLISH.md "Production facts"; they are NOT renamed to jubileepraise,
# because the server, the path, the processes and the domain are unchanged. The rebrand is what
# gets deployed INTO them.
PROD_PATH="/var/www/jubilujah.com"
PM2_WEB="jubilujah-web"
PUBLIC_HOST="https://www.jubilujah.com"
BACKUP_DIR="/var/www/.backup"

# nginx proxies the web app on :3030 and the API on :4030 (:3119 is JubileeVibes, a different site).
WEB_PORT="${WEB_PORT:-3030}"

# --- CDN sync target -------------------------------------------------------
# CORRECTED 2026-08-14. The previous values here were wrong on all three counts and would have
# pushed ~6.7 GB into a bucket the site does not read:
#
#   * "cdn.jubileeverse.com, 131 occurrences" -> actually 7 refs total across app/web, and
#     app/web/lib/cdn.ts defaults to cd.jubilujah.com. Live probe 2026-08-14:
#     https://cd.jubilujah.com/music/... -> 200 ;  https://cdn.jubileeverse.com/music/... -> 404
#   * bucket jubileeverse-cdn      -> that is the AVATARS bucket, not the music CDN
#   * source tree J:/music         -> does not exist; the store is J:/jubileepraise.com/music
#
# BLOCKER: no credentials for the live music bucket exist on this machine. The only R2 token
# present (R2_AVATARS_* in W:/JubileeInspire.com/api/.env) is scoped to jubileeverse-cdn. Set
# R2_S3_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_CDN for cd.jubilujah.com
# before enabling the sync. Until then --site-only is the correct publish, and is usually all
# that is needed: albums hidden by a stale manifest already have their media live on the CDN.
SYNC_SCRIPT="$REPO_DIR/_r2-sync-music-inspire.js"
SYNC_SRC="J:/jubileepraise.com/music"
SYNC_PREFIX="music/"
SYNC_BUCKET="${R2_BUCKET_CDN:-}"          # intentionally empty until the live bucket is configured

# Credentials: the sync script auto-loads W:/JubileeInspire.com/api/.env. No secrets in this repo.

SITE_ONLY=0
AUTO_YES=0
SKIP_MANIFEST=0
DO_BACKUP=1
for a in "$@"; do
  case "$a" in
    --site-only)            SITE_ONLY=1 ;;
    --yes|-y)               AUTO_YES=1 ;;
    --skip-manifest-check)  SKIP_MANIFEST=1 ;;
    --no-backup)            DO_BACKUP=0 ;;
    *) echo "Unknown arg: $a" >&2; exit 2 ;;
  esac
done

line() { printf '\n%s\n' "============================================================"; }
hdr()  { line; printf '  %s\n' "$1"; line; }

[[ -f "$SSH_KEY" ]] || { echo "SSH key not found at $SSH_KEY"; exit 1; }
[[ -d "$REPO_DIR" ]] || { echo "$REPO_DIR missing"; exit 1; }

# Locate @aws-sdk/client-s3 (not installed at this repo root).
detect_node_path() {
  for c in "$REPO_DIR/node_modules" "$REPO_DIR/app/api/node_modules" \
           "/w/JubileeInspire.com/api/node_modules"; do
    [[ -d "$c/@aws-sdk/client-s3" ]] && { echo "$c"; return 0; }
  done
  return 1
}

# ---------------------------------------------------------------- Step 0 ----
if [[ $SKIP_MANIFEST -eq 0 ]]; then
  hdr "Step 0/3 — Catalog manifest gate (MANDATORY)"
  if node "$REPO_DIR/deploy/check-manifest.mjs"; then
    echo "Manifest current — proceeding."
  else
    rc=$?
    if [[ $rc -eq 3 ]]; then
      echo ""
      echo "REFUSING TO PUBLISH: the manifest is stale."
      echo "Stale manifest silently drops albums from every page (home + category), covers,"
      echo "genres and analytics. Reconcile it first, then re-run."
      echo "Override only if you know what you are doing: --skip-manifest-check"
      exit 3
    fi
    echo "Manifest check failed to run (exit $rc)."; exit "$rc"
  fi
else
  echo "Skipping manifest gate (--skip-manifest-check)."
fi

# ---------------------------------------------------------------- Step 1 ----
if [[ $SITE_ONLY -eq 0 ]]; then
  hdr "Step 1/3 — CDN sync ($SYNC_SRC -> R2 $SYNC_BUCKET/$SYNC_PREFIX)"
  [[ -f "$SYNC_SCRIPT" ]] || { echo "Sync script missing at $SYNC_SCRIPT"; exit 1; }

  # Guard added 2026-08-14: refuse to sync without an explicitly configured live bucket.
  # Falling back to the avatars bucket would upload gigabytes to a store the site never reads.
  if [[ -z "$SYNC_BUCKET" ]]; then
    echo "REFUSING to sync: no live music bucket configured."
    echo "  The live CDN host is cd.jubilujah.com; the only credentials on this machine"
    echo "  (R2_AVATARS_* in W:/JubileeInspire.com/api/.env) are scoped to jubileeverse-cdn,"
    echo "  which the site does NOT read (verified 404 on 2026-08-14)."
    echo "  Set R2_BUCKET_CDN (plus R2_S3_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY),"
    echo "  or run with --site-only. See PUBLISH.md Step 1."
    exit 1
  fi

  NP="$(detect_node_path)" || {
    echo "@aws-sdk/client-s3 not found. Install it, e.g.:"
    echo "    cd $REPO_DIR && npm install @aws-sdk/client-s3 @aws-sdk/lib-storage"
    exit 1
  }
  echo "Using SDK from: $NP"

  SYNC_ARGS=( --src="$SYNC_SRC" --prefix="$SYNC_PREFIX" --bucket="$SYNC_BUCKET" )

  NODE_PATH="$NP" node "$SYNC_SCRIPT" "${SYNC_ARGS[@]}" | tee /tmp/jv-cdn-diff.log

  if grep -q "^PLAN: upload 0 files" /tmp/jv-cdn-diff.log; then
    echo "Nothing to upload. CDN already in sync."
  else
    if [[ $AUTO_YES -eq 0 ]]; then
      read -r -p "Apply upload to R2? [y/N] " ans
      [[ "$ans" =~ ^[Yy]$ ]] || { echo "Aborted by user."; exit 1; }
    fi
    NODE_PATH="$NP" node "$SYNC_SCRIPT" "${SYNC_ARGS[@]}" --apply --concurrency=8
  fi
else
  echo "Skipping CDN sync (--site-only)."
fi

# ---------------------------------------------------------------- Step 2 ----
REMOTE_MANIFEST="$PROD_PATH/web/public/music/catalog-manifest.json"
LOCAL_MANIFEST="$REPO_DIR/app/web/public/music/catalog-manifest.json"

hdr "Step 2a/3 — Preflight: does the target actually exist?"
# Everything below is fatal rather than best-effort. The whole reason this script was wrong for
# two weeks is that it assumed a prod layout nobody had checked.
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$PROD" "
  fail=0
  [ -d '$PROD_PATH' ]        || { echo '  MISSING dir      : $PROD_PATH'; fail=1; }
  [ -f '$REMOTE_MANIFEST' ]  || { echo '  MISSING manifest : $REMOTE_MANIFEST'; fail=1; }
  pm2 describe '$PM2_WEB' >/dev/null 2>&1 || { echo '  MISSING process  : $PM2_WEB'; fail=1; }
  [ \$fail -eq 0 ] && echo '  ok — target exists'
  exit \$fail
" || {
  echo ""
  echo "REFUSING TO PUBLISH: the target above is not what this script expects."
  echo "It targets the EXISTING jubilujah deployment ($PROD_PATH, $PM2_WEB)."
  echo "If that is wrong, fix the values at the top of this script — do not"
  echo "bypass this check. Nothing was changed on the server."
  exit 4
}

if [[ $DO_BACKUP -eq 1 ]]; then
  hdr "Step 2b/3 — Back up the live manifest"
  # Rollback is the reverse copy from the newest .bak-* beside it, then the same restart.
  ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$PROD" \
    "cp -p '$REMOTE_MANIFEST' '$REMOTE_MANIFEST'.bak-\$(date +%Y%m%d-%H%M%S) \
     && ls -1t '$(dirname "$REMOTE_MANIFEST")' | grep catalog-manifest | head -3"
fi

hdr "Step 2/3 — Publish the catalog manifest to $PROD:$REMOTE_MANIFEST"
scp -i "$SSH_KEY" -o IdentitiesOnly=yes "$LOCAL_MANIFEST" "$PROD:$REMOTE_MANIFEST"
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$PROD" \
  "pm2 restart '$PM2_WEB' --update-env && pm2 save | tail -2"

# ---------------------------------------------------------------- Step 3 ----
hdr "Step 3/3 — Verify"
# A 200 proves the app is up, not that the manifest landed, so the album count is checked too.
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$PROD" "
  origin=\$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:$WEB_PORT/);
  echo \"  origin (127.0.0.1:$WEB_PORT):  \$origin\";
  node -e \"const m=require('$REMOTE_MANIFEST');
            let n=0; for(const c of m.categories||[]) for(const a of c.artists||[]) n+=(a.albums||[]).length;
            console.log('  manifest live       : '+m.generated+' — '+n+' albums');\";
  test \"\$origin\" = '200'
" || { echo "Verification failed."; exit 1; }

# The site is served at its existing domain until DNS for jubileepraise.com exists.
public=$(curl -sS -o /dev/null -w "%{http_code}" "$PUBLIC_HOST/" 2>/dev/null || echo "unreachable")
echo "  public (www)        : $public"
# cd.jubilujah.com is deliberately NOT renamed — there is no DNS for a jubileepraise CDN.
cdn=$(curl -sS -o /dev/null -w "%{http_code}" \
  "https://cd.jubilujah.com/music/inspire/jubilee-inspire/JEIM1001EN-sky-splits-open/artwork/JEIM1001EN.png" 2>/dev/null || echo "fail")
echo "  cdn  (artwork probe): $cdn"

line
echo "  CATALOG PUBLISHED to $PROD:$REMOTE_MANIFEST"
if [[ "$public" != "200" ]]; then
  echo "  (the public host is not serving yet — this publish changed the origin only)"
fi
line
