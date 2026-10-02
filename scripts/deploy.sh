#!/usr/bin/env bash
# Docker deploy: Mongo + API + Caddy (HTTPS) on this machine.
#   scripts/deploy.sh up          build images and start (https://localhost by default)
#   scripts/deploy.sh down        stop containers (data volumes kept)
#   scripts/deploy.sh logs        follow logs
#   scripts/deploy.sh status      container health
#   scripts/deploy.sh trust-cert  trust Caddy's local CA in the macOS keychain (asks for your password)
# Public host: SITE_ADDRESS=game.example.com TLS_MODE=you@example.com scripts/deploy.sh up
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && source .env && set +a
SITE="${SITE_ADDRESS:-localhost}"

wait_healthy() {
  for _ in $(seq 1 60); do
    if curl -skf "https://${SITE}:${HTTPS_PORT:-443}/api/v1/health" >/dev/null; then
      echo "Up: https://${SITE}$( [[ "${HTTPS_PORT:-443}" == 443 ]] || echo ":${HTTPS_PORT}" )"
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for health check" >&2
  docker compose ps
  return 1
}

case "${1:-up}" in
  up)
    export IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
    docker compose up -d --build
    wait_healthy
    ;;
  down) docker compose down ;;
  logs) docker compose logs -f --tail=100 ;;
  status) docker compose ps ;;
  trust-cert)
    tmp="$(mktemp -t caddy-root).crt"
    docker compose cp web:/data/caddy/pki/authorities/local/root.crt "$tmp"
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$tmp"
    rm -f "$tmp"
    echo "Caddy local CA trusted. Restart the browser."
    ;;
  *) echo "Usage: $0 {up|down|logs|status|trust-cert}" >&2; exit 2 ;;
esac
