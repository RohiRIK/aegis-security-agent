#!/usr/bin/env bash
# scripts/sandbox-stop.sh — stop and remove harness-sandbox container
set -euo pipefail

CONTAINER="harness-sandbox"

if docker ps --filter "name=${CONTAINER}" --format "{{.Names}}" | grep -q "${CONTAINER}"; then
  docker stop "${CONTAINER}" >/dev/null
  docker rm "${CONTAINER}" >/dev/null
  echo "[sandbox] ${CONTAINER} stopped and removed."
else
  echo "[sandbox] ${CONTAINER} not running."
fi
