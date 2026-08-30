#!/usr/bin/env bash
# Live E2E: local-owner + scan Documents/Git; GitHub login; import all+public; analyze.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SMOKE_PORT:-18790}"
DB="/tmp/ak-e2e-$$.db"
API="http://127.0.0.1:${PORT}"
TOKEN_FILE="${AK_GH_TOKEN_FILE:-/tmp/ak-gh-token}"
CLONE_ROOT="${AK_CLONE_ROOT:-/tmp/ak-gh-clones-e2e}"
GIT_ROOT="${AK_GIT_ROOT:-/home/fr4iser/Documents/Git}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "missing $TOKEN_FILE — extract GitHub token first"
  exit 1
fi
GH_PAT="$(cat "$TOKEN_FILE")"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

mkdir -p "$CLONE_ROOT"
cd "$ROOT/apps/api"
PORT="$PORT" DB_PATH="$DB" AK_REPO_ROOT="$ROOT" SCHEDULER_INTERVAL_MS=0 \
  pnpm exec tsx src/presentation/main.ts >/tmp/ak-e2e-api.log 2>&1 &
API_PID=$!
for i in $(seq 1 50); do curl -sf "$API/health" >/dev/null && break; sleep 0.2; done

auth_json() { curl -sf -H "Content-Type: application/json" -H "x-ak-session: $1" "${@:2}"; }

echo "== 1 password admin + my executor =="
TOK=$(curl -sf -H 'Content-Type: application/json' -X POST "$API/api/auth/register" \
  -d '{"username":"e2eadmin","password":"secret123"}' | jq -r .token)
auth_json "$TOK" -X PUT "$API/api/me/executor" -d \
  '{"dshInvokeMode":"host_http","dshEndpoint":"http://localhost:13080","dshTrustedHost":"localhost:13080","executorId":"dsh"}' >/dev/null
auth_json "$TOK" -X PUT "$API/api/settings" -d "$(jq -n \
  --arg cr "$CLONE_ROOT" \
  '{githubCloneRoot:$cr,githubDefaultLogin:"fr4iser90",setupCompleted:true}')" >/dev/null

echo "== 2 scan local $GIT_ROOT + analyze =="
SCAN=$(auth_json "$TOK" -X POST "$API/api/catalog/scan-local" \
  -d "$(jq -n --arg p "$GIT_ROOT" '{path:$p,analyze:true}')")
echo "$SCAN" | jq '{registered:(.registered|length),skipped:(.skipped|length),analyzed:(.analyzed|length)}'
echo "$SCAN" | jq -e '.analyzed|length > 0' >/dev/null

echo "== 3 GitHub PAT login =="
GH=$(curl -sf -H 'Content-Type: application/json' -X POST "$API/api/auth/login" \
  -d "$(jq -n --arg t "$GH_PAT" '{mode:"github",token:$t}')")
echo "$GH" | jq '{provider,githubLogin,ownerId}'
echo "$GH" | jq -e '.githubLogin=="fr4iser90"' >/dev/null
GTOK=$(echo "$GH" | jq -r .token)
auth_json "$GTOK" -X PUT "$API/api/settings" -d "$(jq -n \
  --arg cr "$CLONE_ROOT" \
  '{setupCompleted:true,githubCloneRoot:$cr,githubDefaultLogin:"fr4iser90"}')" >/dev/null

echo "== 4 GitHub import ALL (incl private) + analyze =="
ALL=$(auth_json "$GTOK" -X POST "$API/api/catalog/github/import" \
  -d '{"visibility":"all","login":"fr4iser90","clone":true,"analyze":true}')
echo "$ALL" | jq '{visibility,repoCount,registered:(.registered|length),analyzed:(.analyzed|length),skipped:(.skipped|length)}'
echo "$ALL" | jq -e '.repoCount > 0' >/dev/null

echo "== 5 GitHub import PUBLIC only + analyze =="
PUB=$(auth_json "$GTOK" -X POST "$API/api/catalog/github/import" \
  -d '{"visibility":"public","login":"fr4iser90","clone":true,"analyze":true}')
echo "$PUB" | jq '{visibility,repoCount,registered:(.registered|length),analyzed:(.analyzed|length),skipped:(.skipped|length)}'
echo "$PUB" | jq -e '.repoCount > 0' >/dev/null

echo "E2E LIVE OK"
