#!/usr/bin/env bash
# scripts/hitl-gateway.sh — blocking terminal HITL prompt for HIGH-RISK actions
# Usage: hitl-gateway.sh '<hitl_request_json>'
# Exit 0: approved  |  Exit 1: denied or timeout
set -euo pipefail

REQUEST_JSON="${1:?Usage: hitl-gateway.sh '<hitl_request_json>'}"
TIMEOUT="${HITL_TIMEOUT_SECONDS:-120}"
HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT_LOG="$HARNESS_DIR/.aegis/audit.log"

mkdir -p "$HARNESS_DIR/.harness"
mkdir -p "$HARNESS_DIR/.aegis"

echo "+--------------------------------------------------------------+"
echo "|  WARNING: HITL GATEWAY -- HIGH-RISK ACTION REQUIRES APPROVAL |"
echo "+--------------------------------------------------------------+"
echo "$REQUEST_JSON" | jq -r '"| Tool:       \(.hitl_request.action.tool)\n| Command:    \(.hitl_request.action.command)\n| Risk:       \(.hitl_request.action.risk_reason)\n| Reversible: \(if .hitl_request.action.reversible then "YES" else "NO" end)"'
echo "+--------------------------------------------------------------+"
echo "| Type 'approve' to allow, anything else to deny.             |"
printf "| Auto-deny in %d seconds.%*s|\n" "$TIMEOUT" $((46 - ${#TIMEOUT})) ""
echo "+--------------------------------------------------------------+"

DECISION="timeout-deny"
if read -r -t "${TIMEOUT}" RESPONSE 2>/dev/null; then
  if [[ "${RESPONSE}" == "approve" ]]; then
    DECISION="approve"
  else
    DECISION="deny"
  fi
fi

REQUEST_ID=$(echo "$REQUEST_JSON" | jq -r '.hitl_request.id')
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"hitl_decision\",\"id\":\"${REQUEST_ID}\",\"decision\":\"${DECISION}\",\"user\":\"${USER}\"}" >> "$AUDIT_LOG"

if [[ "${DECISION}" == "approve" ]]; then
  echo "Approved."
  exit 0
else
  echo "Denied (${DECISION})."
  exit 1
fi
