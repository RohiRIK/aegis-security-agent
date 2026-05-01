#!/usr/bin/env bash
# hooks/pre-tool-use.sh
# PreToolUse hook — routes bash calls through sandbox and gates HIGH-RISK commands via HITL.
# Extended by Week 3 workstreams (3B appends package-install intercept). DO NOT OVERWRITE.
#
# Input (stdin): JSON with tool_name and tool_input from Claude Code hook protocol
# Exit 0: allow  |  Exit 1: block (stderr message shown to agent)
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
POLICY="$HARNESS_DIR/harness-policy.json"
AUDIT_LOG="$HARNESS_DIR/.harness/audit.log"

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // .tool // ""')
BASH_CMD=$(echo "$INPUT"  | jq -r '.tool_input.command // ""')

mkdir -p "$HARNESS_DIR/.harness"

# ── SECTION 1: Sandbox routing (bash tool → harness-sandbox container) ─────────
if [[ "$TOOL_NAME" == "Bash" || "$TOOL_NAME" == "bash" ]]; then
  if [[ -n "$BASH_CMD" ]]; then

    # ── SECTION 2: HIGH-RISK pattern check → HITL gate ──────────────────────────
    HIGH_RISK_PATTERNS=$(jq -r '.high_risk_patterns[]' "$POLICY" 2>/dev/null || echo "")
    MATCHED_PATTERN=""
    while IFS= read -r pattern; do
      if echo "$BASH_CMD" | grep -qiE "$pattern" 2>/dev/null; then
        MATCHED_PATTERN="$pattern"
        break
      fi
    done <<< "$HIGH_RISK_PATTERNS"

    if [[ -n "$MATCHED_PATTERN" ]]; then
      TIMEOUT=$(jq -r '.hitl_timeout_seconds // 120' "$POLICY")
      REQUEST_ID=$(uuidgen 2>/dev/null || date +%s%N)
      TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

      HITL_JSON=$(jq -n \
        --arg id "$REQUEST_ID" \
        --arg ts "$TIMESTAMP" \
        --arg cmd "$BASH_CMD" \
        --arg reason "Matches HIGH-RISK pattern: $MATCHED_PATTERN" \
        --arg cwd "$PWD" \
        '{
          hitl_request: {
            id: $id,
            timestamp: $ts,
            session_id: "harness",
            action: {
              tool: "bash",
              command: $cmd,
              risk_reason: $reason,
              risk_level: "HIGH",
              reversible: false
            },
            context: {
              current_task: "Agent-initiated shell command",
              working_directory: $cwd
            },
            instructions: "Type '\''approve'\'' to allow, anything else to deny. Auto-deny in \($timeout)s."
          }
        }' --argjson timeout "$TIMEOUT")

      if ! bash "$HARNESS_DIR/scripts/hitl-gateway.sh" "$HITL_JSON"; then
        echo "BLOCKED by HITL gateway: HIGH-RISK command denied." >&2
        exit 1
      fi
    fi

    # ── SECTION 3: Route through sandbox ────────────────────────────────────────
    # Rewrite the command to run inside harness-sandbox
    # Output the modified input for Claude Code to use
    SANDBOXED=$(echo "$INPUT" | jq \
      --arg cmd "bash $HARNESS_DIR/scripts/sandbox-exec.sh $(printf '%q' "$BASH_CMD")" \
      '.tool_input.command = $cmd')
    echo "$SANDBOXED"
    exit 0

  fi
fi

# ── SECTION 4 (3B): Package install intercept → Snyk health check ───────────────
if [[ "$TOOL_NAME" == "Bash" || "$TOOL_NAME" == "bash" ]]; then
  if echo "$BASH_CMD" | grep -qE "^(npm install|npm i |pip install|pip3 install|cargo add|go get) "; then
    PACKAGE=$(echo "$BASH_CMD" | awk '{print $NF}')
    if command -v snyk &>/dev/null; then
      if ! snyk test --package-manager=npm --packages-folder=/dev/null \
           --json 2>/dev/null | jq -e '.ok == true' &>/dev/null; then
        echo "BLOCKED by Snyk: package '$PACKAGE' has critical CVEs or does not exist." >&2
        exit 1
      fi
    fi
  fi
fi

# All other tools: pass through unchanged
echo "$INPUT"
exit 0
