#!/usr/bin/env bash
# Build: lint, test, typecheck, bundle client (dist/) + server (dist-server/), optionally Docker images.
#   scripts/build.sh            # local artifacts only
#   scripts/build.sh --docker   # also build hk-tetracube-api / -web images (tag = git sha or IMAGE_TAG)
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund
npm run lint
npm run test
npm run build

if [[ "${1:-}" == "--docker" ]]; then
  export IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
  docker compose build
  echo "Images built with tag ${IMAGE_TAG}"
fi
