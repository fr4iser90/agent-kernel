#!/usr/bin/env bash
# Emit a versioned lawpack for product init.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="${1:-$(git -C "$ROOT" rev-parse --short HEAD)}"
OUT="${2:-"$ROOT/dist/lawpack-$VER.tar.gz"}"
mkdir -p "$(dirname "$OUT")"
tar -C "$ROOT" -czf "$OUT" lawpack
echo "wrote $OUT"
