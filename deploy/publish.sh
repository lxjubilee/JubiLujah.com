#!/usr/bin/env bash
# publish.sh — runs the "Publish Jubilujah.com" procedure end-to-end.
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
#   * Step 0's manifest gate pointed at C:/jubilujah-local/rebuild-manifest.js      (does not exist)
#   * @aws-sdk/client-s3 is not installed at this repo root, so a bare `node` run fails
#   * the runbook's SSH key path named a different Windows user
# Now: uses the in-repo sync script, auto-detects the SDK, gates on deploy/check-manifest.mjs,
# and snapshots prod before deploying (PUBLISH.md previously noted rollback was NOT automatic).

set -euo pipefail

REPO_DIR="/w/JubiLujah.com"
SSH_KEY="$USERPROFILE/.ssh/id_ed25519_jubilee_prod"
PROD="root@94.72.120.231"
PROD_PATH="/var/www/Jubilujah.com"
BACKUP_DIR="/var/www/.backup"

# --- CDN sync target -------------------------------------------------------
# The live site references cdn.jubileeverse.com (131 occurrences in app/web) and never
# cdn.jubilujah.com, so the canonical bucket is jubileeverse-cdn. Source tree is J:/music.
SYNC_SCRIPT="$REPO_DIR/_r2-sync-music-inspire.js"
SYNC_SRC="J:/music"
SYNC_PREFIX="music/"
SYNC_BUCKET="jubileeverse-cdn"

# Credentials: the sync script auto-loads W:/JubileeInspire.com/api/.env, whose R2_AVATARS_*
# token is scoped to jubileeverse-cdn. No secrets are stored in this repo.

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
if [[ $DO_BACKUP -eq 1 ]]; then
  hdr "Step 2a/3 — Snapshot prod for rollback"
  ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$PROD" \
    "mkdir -p $BACKUP_DIR && tar -czf $BACKUP_DIR/Jubilujah.com.\$(date +%Y%m%d-%H%M%S).tgz -C $PROD_PATH . \
     && ls -1t $BACKUP_DIR | head -3"
fi

hdr "Step 2/3 — Deploy site to $PROD:$PROD_PATH"
cd "$REPO_DIR" && tar \
  --exclude='./.claude' \
  --exclude='./.git' \
  --exclude='./wpf' \
  --exclude='./node_modules' \
  --exclude='*.log' \
  -czf - . | ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$PROD" \
  "tar -xzf - -C $PROD_PATH && pm2 restart jubilujah --update-env && pm2 save | tail -2"

# ---------------------------------------------------------------- Step 3 ----
hdr "Step 3/3 — Verify"
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$PROD" '
  origin=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3119/);
  public=$(curl -sS -o /dev/null -w "%{http_code}" https://www.jubilujah.com/);
  cdn=$(curl -sS -o /dev/null -w "%{http_code}" https://cdn.jubileeverse.com/music/catalog-manifest.json);
  echo "  origin (127.0.0.1:3119):  $origin";
  echo "  public (www):             $public";
  echo "  cdn  (catalog-manifest):  $cdn";
  test "$origin" = "200" -a "$public" = "200" -a "$cdn" = "200"
' || { echo "Verification failed."; exit 1; }

line
echo "  PUBLISHED https://www.jubilujah.com"
line
