#!/usr/bin/env bash
# publish.sh — runs the "Publish Jubilujah.com" procedure end-to-end.
# See ../PUBLISH.md for the runbook this script automates.
#
# Usage:
#   bash deploy/publish.sh              # full procedure (CDN sync + site deploy + verify)
#   bash deploy/publish.sh --site-only  # skip CDN sync; deploy site + verify only
#   bash deploy/publish.sh --yes        # don't prompt for CDN upload confirmation

set -euo pipefail

VIBES_DIR="/w/Jubilujah.com"
VERSE_DIR="/c/Websites/jubileeverse.com"
SSH_KEY="$USERPROFILE/.ssh/id_ed25519_jubilee_prod"
PROD="root@94.72.120.231"
PROD_PATH="/var/www/Jubilujah.com"
SYNC_SCRIPT="$VERSE_DIR/.claude/r2-sync-music.js"

SITE_ONLY=0
AUTO_YES=0
for a in "$@"; do
  case "$a" in
    --site-only) SITE_ONLY=1 ;;
    --yes|-y)    AUTO_YES=1 ;;
    *) echo "Unknown arg: $a" >&2; exit 2 ;;
  esac
done

line() { printf '\n%s\n' "============================================================"; }
hdr()  { line; printf '  %s\n' "$1"; line; }

[[ -f "$SSH_KEY" ]] || { echo "SSH key not found at $SSH_KEY"; exit 1; }
[[ -d "$VIBES_DIR" ]] || { echo "$VIBES_DIR missing"; exit 1; }

if [[ $SITE_ONLY -eq 0 ]]; then
  hdr "Step 1/3 — CDN sync (J:/music → R2)"
  [[ -f "$SYNC_SCRIPT" ]] || { echo "Sync script missing at $SYNC_SCRIPT"; exit 1; }
  ( cd "$VERSE_DIR" && node .claude/r2-sync-music.js ) | tee /tmp/jv-cdn-diff.log

  if grep -q "^PLAN: upload 0 files" /tmp/jv-cdn-diff.log; then
    echo "Nothing to upload. CDN already in sync."
  else
    if [[ $AUTO_YES -eq 0 ]]; then
      read -r -p "Apply upload to R2? [y/N] " ans
      [[ "$ans" =~ ^[Yy]$ ]] || { echo "Aborted by user."; exit 1; }
    fi
    ( cd "$VERSE_DIR" && node .claude/r2-sync-music.js --apply --concurrency=8 )
  fi
else
  echo "Skipping CDN sync (--site-only)."
fi

hdr "Step 2/3 — Deploy site to $PROD:$PROD_PATH"
cd "$VIBES_DIR" && tar \
  --exclude='./.claude' \
  --exclude='./wpf' \
  --exclude='./node_modules' \
  --exclude='*.log' \
  -czf - . | ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$PROD" \
  "tar -xzf - -C $PROD_PATH && pm2 restart jubilujah --update-env && pm2 save | tail -2"

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
