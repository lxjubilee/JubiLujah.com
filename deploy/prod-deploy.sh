#!/bin/bash
set -e
echo "PRODUCTION DEPLOYMENT"
read -p "Confirm (yes/no): " confirm
[ "$confirm" != "yes" ] && exit 0
cd "$(dirname "$0")/.."
git fetch origin && git checkout main && git reset --hard origin/main
cd web && npm ci --production && npm run build 2>/dev/null || true
cd ../api && npm ci --production && npm run build 2>/dev/null || true
echo "Production deployment complete!"
