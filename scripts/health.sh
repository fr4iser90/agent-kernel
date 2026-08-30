#!/usr/bin/env bash
# Post-install / smoke health check for agent-kernel (local or Compose publish).
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8787}"
WEB_BASE="${WEB_BASE:-}"
TIMEOUT_SEC="${TIMEOUT_SEC:-3}"

fail=0

check_url() {
  local name="$1" url="$2"
  if ! curl -fsS --max-time "$TIMEOUT_SEC" "$url" >/dev/null; then
    echo "FAIL  $name  $url"
    fail=1
    return
  fi
  echo "OK    $name  $url"
}

echo "health: API_BASE=$API_BASE"
check_url "api /health" "${API_BASE%/}/health"

if [[ -n "$WEB_BASE" ]]; then
  check_url "web /" "${WEB_BASE%/}/"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "health: FAILED"
  exit 1
fi
echo "health: OK"
