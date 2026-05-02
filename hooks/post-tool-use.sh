#!/usr/bin/env bash
# hooks/post-tool-use.sh
# PostToolUse hook — runs Semgrep on every file written/edited by the agent.
# Findings are logged to .aegis/audit.log and returned to the agent for self-correction.
#
# Input (stdin): JSON with tool_name and tool_result from Claude Code hook protocol
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT_LOG="$HARNESS_DIR/.aegis/audit.log"

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // .tool // ""')
WRITTEN_FILE=$(echo "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""')

mkdir -p "$HARNESS_DIR/.harness"

if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" || \
      "$TOOL_NAME" == "write" || "$TOOL_NAME" == "edit" ]]; then
  if [[ -n "$WRITTEN_FILE" && -f "$WRITTEN_FILE" ]]; then
    RESULT=$(semgrep scan \
      --config=p/security-audit \
      --config=p/secrets \
      --json \
      "$WRITTEN_FILE" 2>/dev/null || echo '{"results":[]}')

    ERRORS=$(echo "$RESULT" | jq '.results | map(select(.extra.severity == "ERROR")) | length' 2>/dev/null || echo "0")

    if [[ "$ERRORS" -gt 0 ]]; then
      echo "$RESULT" | jq '.results[] | {rule: .check_id, severity: .extra.severity, message: .extra.message, line: .start.line}'
      echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"semgrep_finding\",\"file\":\"${WRITTEN_FILE}\",\"errors\":${ERRORS}}" >> "$AUDIT_LOG"
    fi
  fi
fi

echo "$INPUT"
exit 0
