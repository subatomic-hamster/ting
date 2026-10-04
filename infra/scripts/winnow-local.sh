#!/usr/bin/env bash
# Runs Winnow-12B on this Mac (Apple Silicon, 24 GB) and serves the deployed backend through an SQS queue: the worker
# long-polls AWS over HTTPS, so no tunnel, open port or AWS permission change is needed. When this stops, the backend
# notices the missing heartbeat within a minute and returns to the labelled simulation by itself.
# Usage (from infra/): AWS_PROFILE=ting-aws AWS_REGION=us-west-2 bash scripts/winnow-local.sh     (Ctrl+C to stop)
set -euo pipefail
WINNOW_DIR="${WINNOW_DIR:-$HOME/Developer/winnow/winnow-inference}"
STATE="$HOME/Developer/winnow"
KEY_FILE="$STATE/api-key"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$STATE"
[[ -s "$KEY_FILE" ]] || (umask 077 && openssl rand -hex 24 > "$KEY_FILE")

if ! curl -sf http://127.0.0.1:8091/health >/dev/null; then
  echo "Starting Winnow-12B (apple-silicon profile)…"
  (cd "$WINNOW_DIR" && python3 scripts/serve.py --api-key-file "$KEY_FILE" >"$STATE/server.log" 2>&1) &
  SERVER=$!
  trap 'kill ${SERVER:-} ${WORKER:-} 2>/dev/null || true' EXIT
  for _ in $(seq 1 180); do curl -sf http://127.0.0.1:8091/health >/dev/null && break; sleep 2; done
fi
curl -sf http://127.0.0.1:8091/health >/dev/null || { echo "Winnow did not start; see $STATE/server.log"; exit 1; }
echo "Winnow is up on http://127.0.0.1:8091 (API key required)"

cd "$HERE" && node scripts/winnow-worker.mjs &
WORKER=$!
trap 'kill ${SERVER:-} ${WORKER:-} 2>/dev/null || true' EXIT
wait $WORKER
