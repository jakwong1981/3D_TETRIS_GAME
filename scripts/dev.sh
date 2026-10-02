#!/usr/bin/env bash
# Hot local dev over HTTPS: Mongo in Docker, API with tsx watch, Vite HMR on https://localhost:5173.
# Ctrl+C stops the API and Vite; Mongo keeps running (scripts/deploy.sh down to stop it).
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -d node_modules ]] || npm install --no-audit --no-fund
docker compose up -d mongo

npm run dev:server &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM

echo "Game: https://localhost:5173 (self-signed cert: accept once in the browser)"
npm run dev:https
