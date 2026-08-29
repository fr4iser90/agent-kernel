#!/usr/bin/env bash
# Gate for agent-kernel control plane repo (not product repos).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "gate: docs + tree presence checks"
test -f docs/VISION.md
test -f docs/ARCHITECTURE.md
test -d lawpack/roles
test -d apps/api/domain/catalog
test -d services/policy-proxy
echo "gate: OK (docs/scaffold only — expand after ADR-0002)"
