#!/usr/bin/env bash
# Gate for agent-kernel control plane repo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "gate: docs Diátaxis presence"
test -f docs/index.md
test -f docs/readme.md
test -f docs/tutorials/getting-started.md
test -f docs/how-to/init.md
test -f docs/how-to/run-the-gate.md
test -f docs/explanation/vision.md
test -f docs/explanation/architecture.md
test -f docs/explanation/orchestration.md
test -f docs/reference/naming.md
test -f docs/reference/settings.md
test -f docs/reference/schemas/openapi.yaml
test -f docs/reference/schemas/settings.schema.json
test -f docs/reference/schemas/init.schema.json
test -f lawpack/MANIFEST.json
test -d lawpack/roles
test -d apps/api/domain/catalog
test -d services/policy-proxy
test -f deploy/compose.yml
test -f deploy/compose.server.yml

echo "gate: doc link check"
bash scripts/check-doc-links.sh

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

echo "gate: docs site build"
pnpm run build:docs

echo "gate: OK"
