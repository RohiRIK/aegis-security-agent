#!/usr/bin/env bash
# harness-preflight.sh
# Run before every Claude Code session. EXIT 1 on any failure -- agent session is BLOCKED.
# Adapted from SPEC.md §11.1 — uses `bunx varlock` (no global install required).
set -euo pipefail

# Variables that indicate real secrets in the environment
SENSITIVE_VARS=(
  "AWS_SECRET_ACCESS_KEY"
  "AWS_SESSION_TOKEN"
  "STRIPE_SECRET_KEY"
  "GITHUB_TOKEN"
  "DATABASE_URL"
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "PRIVATE_KEY"
  "SECRET_KEY"
  "PASSWORD"
  "PASSWD"
)

echo "=== Harness Pre-Flight Check ==="

# CHECK 1: bunx varlock available
echo -n "[1/6] Varlock (via bunx)... "
if ! bunx varlock --version &>/dev/null; then
  echo "FAIL"
  echo "ERROR: bunx varlock not available. Ensure bun is installed: https://bun.sh"
  exit 1
fi
echo "OK"

# CHECK 2: .env.schema exists
echo -n "[2/6] .env.schema present... "
if [[ ! -f ".env.schema" ]]; then
  echo "FAIL"
  echo "ERROR: .env.schema not found. Run 'harness install' to create a template."
  exit 1
fi
echo "OK"

# CHECK 3: No real secrets in current shell environment
# This is the hard gate against Varlock fail-open behavior
echo -n "[3/6] Environment clean (no real secrets)... "
FOUND_SECRETS=()
for var in "${SENSITIVE_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    FOUND_SECRETS+=("$var")
  fi
done
if [[ ${#FOUND_SECRETS[@]} -gt 0 ]]; then
  echo "FAIL"
  echo "ERROR: Real secrets detected in environment:"
  for s in "${FOUND_SECRETS[@]}"; do
    echo "  - $s is set"
  done
  echo ""
  echo "SOLUTION: Unset these variables and use 'bunx varlock run -- harness start'"
  echo "          to inject secrets only into the agent subprocess."
  exit 1
fi
echo "OK"

# CHECK 4: TruffleHog pre-commit hook installed
echo -n "[4/6] TruffleHog pre-commit hook... "
if [[ ! -f ".pre-commit-config.yaml" ]] || \
   ! grep -q "trufflehog" ".pre-commit-config.yaml" 2>/dev/null; then
  echo "WARN"
  echo "WARNING: TruffleHog pre-commit hook not found. Run 'harness install'."
else
  echo "OK"
fi

# CHECK 5: Docker daemon running and harness-sandbox container warm
echo -n "[5/6] Docker sandbox... "
if ! docker info &>/dev/null 2>&1; then
  echo "FAIL"
  echo "ERROR: Docker daemon not running. Start Docker and retry."
  exit 1
fi
if ! docker ps --filter "name=harness-sandbox" --filter "status=running" \
   --format "{{.Names}}" | grep -q "harness-sandbox"; then
  echo "STARTING"
  bash "$(dirname "$0")/scripts/sandbox-start.sh"
  echo "OK (container started)"
else
  echo "OK (container warm)"
fi

# CHECK 6: varlock scan for plaintext secrets in staged files
echo -n "[6/6] Varlock scan (staged files)... "
if bunx varlock scan --staged 2>/dev/null; then
  echo "OK"
else
  echo "FAIL"
  echo "ERROR: varlock scan found potential secrets in staged files."
  exit 1
fi

# CHECK 7 (4B-02): Warn if conflicting context tools are running
echo -n "[7/7] Conflicting context tools... "
CONFLICTS=()
pgrep -f "rtk" &>/dev/null && CONFLICTS+=("rtk")
pgrep -f "context-mode" &>/dev/null && CONFLICTS+=("context-mode")
if [[ ${#CONFLICTS[@]} -gt 0 ]]; then
  echo "WARN"
  echo "WARNING: Conflicting context tools detected: ${CONFLICTS[*]}"
  echo "         lean-ctx is the only supported context manager. Stop the above before starting."
else
  echo "OK"
fi

echo ""
echo "=== Pre-Flight PASSED. Starting agent session. ==="
