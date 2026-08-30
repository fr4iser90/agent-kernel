#!/usr/bin/env bash
# Fast checks for pre-commit (not the full gate).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "precommit: lawpack + docs presence"
test -d lawpack/roles
test -f lawpack/MANIFEST.json
test -f docs/index.md
test -f docs/reference/naming.md

echo "precommit: doc links"
bash scripts/check-doc-links.sh

if [[ ! -d node_modules ]]; then
  echo "precommit: pnpm install"
  pnpm install
fi

echo "precommit: typecheck"
pnpm run typecheck

echo "precommit: unit tests"
pnpm run test

echo "precommit: OK (run pnpm gate before claiming DONE — includes build)"
