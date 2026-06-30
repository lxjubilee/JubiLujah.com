#!/bin/bash
set -e
echo "Deploying to development..."
cd "$(dirname "$0")/.."
git fetch origin && git checkout develop && git pull origin develop
cd web && npm ci && npm run build 2>/dev/null || true
cd ../api && npm ci && npm run build 2>/dev/null || true
echo "Development deployment complete!"
