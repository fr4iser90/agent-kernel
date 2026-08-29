#!/usr/bin/env bash
# Deny agent commits that touch HUMAN_OWNED / kernel paths (diff vs main).
# Usage: protect-owned-paths.sh [base-ref]
# Default base: origin/main (merge-base with HEAD).
# Optional: OWNED_PATHS_FILE with extra newline-separated path prefixes.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BASE_REF="${1:-}"
if [[ -z "$BASE_REF" ]]; then
  git fetch origin main --depth=1 2>/dev/null || true
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    BASE_REF="$(git merge-base HEAD origin/main 2>/dev/null || echo origin/main)"
  else
    echo "protect-owned-paths: no origin/main — skip (bootstrap?)" >&2
    exit 0
  fi
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "main" || "$branch" == "baseline" || "$branch" == "master" ]]; then
  echo "protect-owned-paths: on $branch — skip"
  exit 0
fi

if [[ "$branch" != agent/* ]]; then
  echo "protect-owned-paths: non-agent branch $branch — skip"
  exit 0
fi

# Default deny list (prefixes). Products extend via OWNED_PATHS_EXTRA or file.
DEFAULT_PATHS=(
  '.github/workflows'
  'LICENSE'
  'LAWS.md'
  'OWNED_PATHS.md'
  'vendor/agent-kernel'
)

EXTRA_FILE="${OWNED_PATHS_FILE:-}"
PATHS=("${DEFAULT_PATHS[@]}")
if [[ -n "$EXTRA_FILE" && -f "$EXTRA_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    PATHS+=("$line")
  done < "$EXTRA_FILE"
fi
if [[ -n "${OWNED_PATHS_EXTRA:-}" ]]; then
  # shellcheck disable=SC2206
  PATHS+=($OWNED_PATHS_EXTRA)
fi

mapfile -t changed < <(git diff --name-only "$BASE_REF"...HEAD 2>/dev/null || true)
bad=()
for f in "${changed[@]:-}"; do
  [[ -z "$f" ]] && continue
  for p in "${PATHS[@]}"; do
    if [[ "$f" == "$p" || "$f" == "$p"/* ]]; then
      bad+=("$f")
      break
    fi
  done
done

if [[ ${#bad[@]} -gt 0 ]]; then
  echo "protect-owned-paths: agent branch touched HUMAN/KERNEL owned paths:" >&2
  printf ' - %s\n' "${bad[@]}" >&2
  echo "See OWNED_PATHS.md — revert these to main." >&2
  exit 1
fi

echo "protect-owned-paths: OK (base=$BASE_REF)"
