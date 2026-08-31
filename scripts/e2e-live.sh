#!/usr/bin/env bash
# Live E2E: password admin; register opaque executor paths + init; GitHub PAT login.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SMOKE_PORT:-18790}"
DB="/tmp/ak-e2e-$$.db"
API="http://127.0.0.1:${PORT}"
TOKEN_FILE="${AK_GH_TOKEN_FILE:-/tmp/ak-gh-token}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "missing $TOKEN_FILE — extract GitHub token first"
  exit 1
fi
GH_PAT="$(cat "$TOKEN_FILE")"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

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
auth_json "$TOK" -X PUT "$API/api/settings" -d \
  '{"githubDefaultLogin":"fr4iser90"}' >/dev/null

echo "== 2 register opaque executor paths + init =="
for name in demo-a demo-b; do
  PROJ=$(auth_json "$TOK" -X POST "$API/api/projects" \
    -d "$(jq -n --arg n "$name" --arg p "/executor/workdir/$name" '{name:$n,path:$p}')")
  echo "$PROJ" | jq '{id:.project.id,path:.project.localPath,status:.project.status}'
  PID=$(echo "$PROJ" | jq -r .project.id)
  auth_json "$TOK" -X POST "$API/api/projects/$PID/init" -d '{"presetId":"tracking"}' \
    | jq -e '.project.status=="initialized"' >/dev/null
done

echo "== 3 GitHub PAT login =="
GH=$(curl -sf -H 'Content-Type: application/json' -X POST "$API/api/auth/login" \
  -d "$(jq -n --arg t "$GH_PAT" '{mode:"github",token:$t}')")
echo "$GH" | jq '{provider,githubLogin,ownerId}'
echo "$GH" | jq -e '.githubLogin=="fr4iser90"' >/dev/null
GTOK=$(echo "$GH" | jq -r .token)
auth_json "$GTOK" -X PUT "$API/api/settings" -d \
  '{"githubDefaultLogin":"fr4iser90"}' >/dev/null

echo "== 4 github user registers opaque path (no catalog import) =="
GPROJ=$(auth_json "$GTOK" -X POST "$API/api/projects" \
  -d '{"name":"from-gh","path":"/executor/workdir/from-gh","gitRemote":"https://github.com/fr4iser90/PublicOne.git"}')
echo "$GPROJ" | jq '{id:.project.id,path:.project.localPath}'
echo "$GPROJ" | jq -e '.project.localPath=="/executor/workdir/from-gh"' >/dev/null

echo "E2E LIVE OK"
