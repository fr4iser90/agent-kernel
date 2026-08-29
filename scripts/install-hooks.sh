#!/usr/bin/env bash
# Install git hooks for this clone (no husky/GitHub Actions required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.git/hooks/pre-commit"

mkdir -p "$ROOT/.git/hooks"
cat > "$HOOK" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
exec bash "$ROOT/scripts/precommit.sh"
EOF
chmod +x "$HOOK" "$ROOT/scripts/precommit.sh"
echo "installed pre-commit → scripts/precommit.sh"
echo "full gate remains: pnpm gate"
