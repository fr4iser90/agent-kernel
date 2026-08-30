#!/usr/bin/env bash
# Verify relative markdown links under docs/ resolve to existing files.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fail=0
while IFS= read -r -d '' f; do
  dir="$(dirname "$f")"
  # Extract markdown links: ](path) skipping http(s), mailto, anchors-only
  while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    [[ "$url" =~ ^(https?://|mailto:|#) ]] && continue
    path="${url%%#*}"
    [[ -z "$path" ]] && continue
    # skip site-absolute vitepress paths starting with /
    [[ "$path" == /* ]] && continue
    target="$dir/$path"
    if [[ ! -e "$target" ]]; then
      echo "BROKEN: $f -> $url"
      fail=1
    fi
  done < <(grep -oE '\[[^]]*\]\([^)]+\)' "$f" | sed -E 's/.*\(([^)]+)\).*/\1/' || true)
done < <(find docs -type f -name '*.md' -print0)

if [[ "$fail" -ne 0 ]]; then
  echo "gate: doc link check FAILED"
  exit 1
fi
echo "gate: doc link check OK"
