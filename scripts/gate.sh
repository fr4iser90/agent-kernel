#!/usr/bin/env bash
# Gate for agent-kernel control plane repo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "gate: docs + lawpack presence"
test -f docs/VISION.md
test -f docs/ARCHITECTURE.md
test -f docs/NAMING.md
test -d lawpack/roles
test -d apps/api/domain/catalog
test -d services/policy-proxy

echo "gate: install (if needed)"
if [[ ! -d node_modules ]]; then
  pnpm install
fi

echo "gate: typecheck"
pnpm run typecheck

echo "gate: test"
pnpm run test

echo "gate: build"
pnpm run build

echo "gate: OK"
