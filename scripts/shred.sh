#!/usr/bin/env bash
# scripts/shred.sh — delete all sensitive harness runtime data
# Usage: shred.sh [--audit]  (--audit: scan for secrets before deletion)
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)/.harness"
AUDIT_FLAG="${1:-}"

if [[ "${AUDIT_FLAG}" == "--audit" ]]; then
  echo "[shred] Scanning .harness/ for sensitive patterns before deletion..."
  if strings "${HARNESS_DIR}/lean-ctx.db" 2>/dev/null | grep -iE 'password|secret|api_key|token'; then
    echo "[shred] WARNING: Potential sensitive data found in lean-ctx.db (above). Proceeding with shred."
  else
    echo "[shred] Scan clean — no sensitive patterns detected."
  fi
fi

[[ -f "${HARNESS_DIR}/lean-ctx.db" ]] && rm -f "${HARNESS_DIR}/lean-ctx.db" && echo "[shred] Removed lean-ctx.db"
[[ -f "${HARNESS_DIR}/audit.log" ]]   && rm -f "${HARNESS_DIR}/audit.log"   && echo "[shred] Removed audit.log"

echo "[shred] Done."
