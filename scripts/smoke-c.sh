#!/usr/bin/env bash
# Full Scope-C smoke: API + DSH host_http nudge + fan-out + cron tick + CLI ping.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SMOKE_PORT:-18787}"
DB="/tmp/ak-smoke-$$.db"
# Opaque executor workdir — kernel never owns FS; path is what DSH understands.
WORK="${DSH_SMOKE_WORKDIR:-/workspace/ak-smoke-$$}"

DSH_URL="${DSH_URL:-http://localhost:13080}"
DSH_HOST="${DSH_HOST:-localhost:13080}"
DSH_CLI_ROOT="${DSH_CLI_ROOT:-$HOME/Documents/Git/deepseek-harness}"
DSH_HOME_DIR="${DSH_HOME_DIR:-$HOME/.dsh}"
API="http://127.0.0.1:${PORT}"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${PROXY_PID:-}" ]]; then kill "$PROXY_PID" 2>/dev/null || true; fi
  rm -f "$DB"
}
trap cleanup EXIT

echo "== DSH host ping =="
curl -sf -H "Host: ${DSH_HOST}" "${DSH_URL}/" >/dev/null || {
  echo "DSH not reachable at ${DSH_URL} (Host ${DSH_HOST})"
  exit 1
}

echo "== start API =="
cd "$ROOT/apps/api"
PORT="$PORT" DB_PATH="$DB" AK_REPO_ROOT="$ROOT" SCHEDULER_INTERVAL_MS=0 pnpm exec tsx src/presentation/main.ts &
API_PID=$!
for i in $(seq 1 40); do
  curl -sf "$API/health" >/dev/null && break
  sleep 0.25
done
curl -sf "$API/health" >/dev/null

hdr=(-H "Content-Type: application/json")
tok=$(curl -sf "${hdr[@]}" -X POST "$API/api/auth/register" \
  -d '{"username":"smokeadmin","password":"secret123"}' | jq -r .token)
auth=(-H "Content-Type: application/json" -H "x-ak-session: $tok")

echo "== my executor host_http =="
curl -sf "${auth[@]}" -X PUT "$API/api/me/executor" -d "$(jq -n \
  --arg ep "$DSH_URL" --arg th "$DSH_HOST" \
  '{dshInvokeMode:"host_http",dshEndpoint:$ep,dshTrustedHost:$th,executorId:"dsh"}')" >/dev/null
curl -sf "${auth[@]}" -X PUT "$API/api/settings" -d \
  '{"injectionMode":"harness_inject","injectStrength":"hybrid"}' >/dev/null
curl -sf "${auth[@]}" -X POST "$API/api/settings/test-dsh" >/dev/null

echo "== project init (opaque executor path, DB-only) =="
proj=$(curl -sf "${auth[@]}" -X POST "$API/api/projects" -d "$(jq -n --arg p "$WORK" '{name:"smoke",path:$p}')")
pid=$(echo "$proj" | jq -r .project.id)
curl -sf "${auth[@]}" -X POST "$API/api/projects/$pid/init" -d '{"presetId":"tracking"}' >/dev/null

echo "== project assignment nudge =="
asg=$(curl -sf "${auth[@]}" -X POST "$API/api/projects/$pid/assignments" -d \
  '{"profileId":"tracking-cycle","scheduleMode":"manual","reviewMode":"human"}')
aid=$(echo "$asg" | jq -r .assignment.id)
curl -sf "${auth[@]}" -X POST "$API/api/assignments/$aid/brief" >/dev/null
run=$(curl -sf "${auth[@]}" -X POST "$API/api/assignments/$aid/nudge" -d '{"text":"Reply with exactly: PONG"}')
echo "$run" | jq -e '.run.id' >/dev/null

echo "== global fan-out =="
gas=$(curl -sf "${auth[@]}" -X POST "$API/api/assignments" -d \
  '{"profileId":"docs-only","scheduleMode":"manual","reviewMode":"human","fanOut":{"mode":"all_initialized"}}')
gid=$(echo "$gas" | jq -r .assignment.id)
curl -sf "${auth[@]}" "$API/api/assignments/$gid/targets" | jq -e '.projectIds|length>=1' >/dev/null
fout=$(curl -sf "${auth[@]}" -X POST "$API/api/assignments/$gid/nudge" -d '{"text":"fanout smoke"}')
echo "$fout" | jq -e '(.run.count // 1) >= 1 or .run.id' >/dev/null

echo "== cron schedule + tick =="
cas=$(curl -sf "${auth[@]}" -X POST "$API/api/assignments" -d "$(jq -n \
  --arg pid "$pid" \
  '{projectId:$pid,profileId:"fix-only",scheduleMode:"cron",cronExpr:"* * * * *",reviewMode:"human"}')")
cid=$(echo "$cas" | jq -r .assignment.id)
tick=$(curl -sf "${auth[@]}" -X POST "$API/api/scheduler/tick")
echo "$tick" | jq -e --arg cid "$cid" '.fired|index($cid)' >/dev/null

echo "== CLI mode ping =="
if [[ -f "$DSH_CLI_ROOT/apps/cli/src/bin.ts" || -f "$DSH_CLI_ROOT/apps/cli/lib/bin.js" ]]; then
  curl -sf "${auth[@]}" -X PUT "$API/api/me/executor" -d "$(jq -n \
    --arg root "$DSH_CLI_ROOT" --arg home "$DSH_HOME_DIR" \
    '{dshInvokeMode:"cli",dshCliRoot:$root,dshHome:$home,executorId:"dsh"}')" >/dev/null
  curl -sf "${auth[@]}" -X POST "$API/api/settings/test-dsh" >/dev/null
  echo "CLI path OK"
else
  echo "WARN: DSH CLI root missing at $DSH_CLI_ROOT — skip CLI ping"
fi

echo "== basic-auth (Traefik-style) path =="
node "$ROOT/scripts/dsh-basic-auth-proxy.mjs" &
PROXY_PID=$!
sleep 0.4
curl -sf "${auth[@]}" -X PUT "$API/api/me/executor" -d "$(jq -n \
  --arg ep "http://localhost:13081" \
  '{dshInvokeMode:"host_http",dshEndpoint:$ep,dshTrustedHost:"localhost:13081",dshBasicAuthUser:"ak",dshBasicAuthPassword:"secret",executorId:"dsh"}')" >/dev/null
curl -sf "${auth[@]}" -X POST "$API/api/settings/test-dsh" >/dev/null
kill "$PROXY_PID" 2>/dev/null || true
echo "basic-auth path OK"

curl -sf "${auth[@]}" -X PUT "$API/api/me/executor" -d "$(jq -n \
  --arg ep "$DSH_URL" --arg th "$DSH_HOST" \
  '{dshInvokeMode:"host_http",dshEndpoint:$ep,dshTrustedHost:$th,dshBasicAuthUser:null,dshBasicAuthPassword:null,executorId:"dsh"}')" >/dev/null

echo "SMOKE C OK"
