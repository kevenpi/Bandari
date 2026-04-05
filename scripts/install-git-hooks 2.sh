#!/usr/bin/env bash
# Install an OPTIONAL local pre-push hook that runs the verification suite.
# Local git only — there is no remote and nothing is pushed to GitHub.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

if [ ! -d .git ]; then
  echo "Initializing a LOCAL git repo (no remote will be added)."
  git init -q
fi

mkdir -p .git/hooks
cat > .git/hooks/pre-push <<'EOF'
#!/usr/bin/env bash
echo "[pre-push] running local verification suite (pnpm verify)..."
pnpm verify
EOF
chmod +x .git/hooks/pre-push

echo "Installed .git/hooks/pre-push -> runs 'pnpm verify'."
echo "Note: no git remote is configured; this is local-only."
