#!/usr/bin/env bash
# scripts/sandbox-start.sh — start the warm harness-sandbox Docker container
set -euo pipefail

CONTAINER="harness-sandbox"

if docker ps --filter "name=${CONTAINER}" --filter "status=running" \
   --format "{{.Names}}" | grep -q "${CONTAINER}"; then
  echo "[sandbox] Container '${CONTAINER}' already running."
  exit 0
fi

if docker ps -a --filter "name=${CONTAINER}" --format "{{.Names}}" | grep -q "${CONTAINER}"; then
  echo "[sandbox] Removing stale container..."
  docker rm -f "${CONTAINER}" >/dev/null
fi

echo "[sandbox] Starting ${CONTAINER}..."
docker run -d \
  --name "${CONTAINER}" \
  --security-opt no-new-privileges \
  --user 65534:65534 \
  --network none \
  --memory 2g \
  --cpus 2 \
  --read-only \
  --tmpfs /workspace:rw,size=500m \
  --tmpfs /tmp:rw,size=100m \
  ubuntu:22.04 \
  tail -f /dev/null

echo "[sandbox] ${CONTAINER} ready."
