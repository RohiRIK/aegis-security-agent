#!/usr/bin/env bash
# scripts/install.sh — scaffold all harness config files into current project
# Called by: harness install
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="${PWD}"

echo "[harness install] Scaffolding into: $TARGET_DIR"

copy_if_missing() {
  local src="$1"
  local dst="$2"
  if [[ -f "$dst" ]]; then
    echo "  [SKIP] $dst already exists"
  else
    cp "$src" "$dst"
    echo "  [CREATED] $dst"
  fi
}

# .env.schema
copy_if_missing "$HARNESS_DIR/.env.schema" "$TARGET_DIR/.env.schema"

# harness-policy.json
copy_if_missing "$HARNESS_DIR/harness-policy.json" "$TARGET_DIR/harness-policy.json"

# CLAUDE.md
copy_if_missing "$HARNESS_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"

# .gitignore entries
GITIGNORE="$TARGET_DIR/.gitignore"
if ! grep -q "\.harness/" "$GITIGNORE" 2>/dev/null; then
  echo "" >> "$GITIGNORE"
  echo "# Harness runtime (added by harness install)" >> "$GITIGNORE"
  echo ".harness/" >> "$GITIGNORE"
  echo ".env" >> "$GITIGNORE"
  echo ".env.*" >> "$GITIGNORE"
  echo "!.env.schema" >> "$GITIGNORE"
  echo "  [UPDATED] $GITIGNORE (added harness entries)"
else
  echo "  [SKIP] $GITIGNORE already has harness entries"
fi

# .harness/ runtime dir
mkdir -p "$TARGET_DIR/.harness"
echo "  [CREATED] $TARGET_DIR/.harness/"

# .claude/ config dir
mkdir -p "$TARGET_DIR/.claude"
echo "  [CREATED] $TARGET_DIR/.claude/"

# hooks.json — copy template and stamp __HARNESS_DIR__ with HARNESS_DIR absolute path
HOOKS_DST="$TARGET_DIR/.claude/hooks.json"
if [[ -f "$HOOKS_DST" ]]; then
  echo "  [SKIP] $HOOKS_DST already exists"
else
  sed "s|__HARNESS_DIR__|${HARNESS_DIR}|g" "$HARNESS_DIR/.claude/hooks.json" > "$HOOKS_DST"
  echo "  [CREATED] $HOOKS_DST (paths stamped for $HARNESS_DIR)"
fi

copy_if_missing "$HARNESS_DIR/.claude/mcp.json" "$TARGET_DIR/.claude/mcp.json"
copy_if_missing "$HARNESS_DIR/.claudeignore" "$TARGET_DIR/.claudeignore"
copy_if_missing "$HARNESS_DIR/.pre-commit-config.yaml" "$TARGET_DIR/.pre-commit-config.yaml"

echo ""
echo "[harness install] Done. Next: run 'harness start' to launch."
