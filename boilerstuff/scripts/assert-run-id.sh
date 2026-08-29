#!/usr/bin/env bash
# Fail if current branch is not the pinned RUN_ID (or main/baseline for humans).
# Usage: assert-run-id.sh agent/myapp-20260829
# Env: ALLOW_MAIN=1 to allow main/baseline (human commits).
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <exact-agent-run-id>" >&2
  echo "example: $0 agent/myapp-20260829" >&2
  exit 2
fi

expected="$1"
current="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$current" == "main" || "$current" == "baseline" || "$current" == "master" ]]; then
  if [[ "${ALLOW_MAIN:-}" == "1" ]]; then
    echo "assert-run-id: on $current (ALLOW_MAIN=1) — OK"
    exit 0
  fi
  echo "assert-run-id: refusing $current without ALLOW_MAIN=1 (agents must use $expected)" >&2
  exit 1
fi

if [[ "$current" != "$expected" ]]; then
  echo "assert-run-id: branch is '$current' but RUN_ID is '$expected'" >&2
  echo "FORBIDDEN: -v2 / -p* / -rebased forks. checkout -B $expected origin/main if needed." >&2
  exit 1
fi

# Soft check: slug looks like a zombie pattern
if [[ "$current" =~ -v[0-9]+$ || "$current" =~ -p[0-9] || "$current" =~ -rebased ]]; then
  echo "assert-run-id: branch name looks like a forbidden fork pattern: $current" >&2
  exit 1
fi

echo "assert-run-id: OK ($current)"
