#!/usr/bin/env bash
# scripts/sandbox-reset.sh — reset workspace inside harness-sandbox (keep container running)
set -euo pipefail

CONTAINER="harness-sandbox"
docker exec "${CONTAINER}" rm -rf /workspace/*
echo "[sandbox] /workspace reset."
