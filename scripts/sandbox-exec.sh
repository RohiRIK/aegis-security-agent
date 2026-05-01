#!/usr/bin/env bash
# scripts/sandbox-exec.sh — execute a command inside harness-sandbox, then reset workspace
# Usage: sandbox-exec.sh "<shell command>"
set -euo pipefail

CONTAINER="harness-sandbox"
CMD="${1:?Usage: sandbox-exec.sh \"<command>\"}"

docker exec "${CONTAINER}" bash -c "${CMD}"
EXIT_CODE=$?

bash "$(dirname "$0")/sandbox-reset.sh" >/dev/null

exit "${EXIT_CODE}"
