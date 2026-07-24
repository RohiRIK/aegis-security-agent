#!/usr/bin/env bash
# Aegis cron wrapper script - POSIX compliant
# Runs Aegis security scans on schedule, independent of Hermes cron

set -euo pipefail

# Default paths
AEGIS_HOME="${AEGIS_HOME:-${HOME}/.aegis}"
# Default to the built CLI script run with bun; user can override to use a different
# runner or a globally installed 'aegis' command (e.g., 'aegis' or 'bun /path/to/cli.js')
AEGIS_BIN="${AEGIS_BIN:-bun ${HOME}/projects/aegis-security-agent/dist/cli/index.js}"
LOG_FILE="${AEGIS_HOME}/cron.log"
LOCK_FILE="${AEGIS_HOME}/cron.lock"

# Ensure AEGIS_HOME exists
mkdir -p "${AEGIS_HOME}"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$$] $*" >> "${LOG_FILE}"
}

# Parse arguments
TARGETS=()
CONFIG_FILE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGETS+=("$2")
            shift 2
            ;;
        --config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 2
            ;;
    esac
done

# Read targets from config file if provided
if [[ -n "${CONFIG_FILE}" ]]; then
    if [[ ! -f "${CONFIG_FILE}" ]]; then
        log "ERROR: Config file not found: ${CONFIG_FILE}"
        exit 2
    fi
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        TARGETS+=("$line")
    done < "${CONFIG_FILE}"
fi

# Validate targets
if [[ ${#TARGETS[@]} -eq 0 ]]; then
    log "ERROR: No targets specified. Use --target or --config"
    exit 2
fi

# Acquire lock to prevent overlapping runs
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
    log "WARNING: Another instance is still running - exiting"
    echo "Another instance is still running - exiting"
    exit 1
fi

# Ensure lock file is cleaned up on exit
trap 'flock -u 200; exec 200<&-' EXIT

# Scan each target
EXIT_CODE=0
for target in "${TARGETS[@]}"; do
    # Parse target and optional scanners: path[,scanners]
    IFS=',' read -r target_path scanner_list <<< "$target"
    
    # Build command - split AEGIS_BIN into words to allow overrides like "bun /path/to/cli.js"
    # shellcheck disable=SC2206
    CMD=(${AEGIS_BIN} scan --target "${target_path}")
    
    if [[ -n "${scanner_list}" ]]; then
        CMD+=(--scanners "${scanner_list}")
    fi
    
    log "Starting scan: ${CMD[*]}"
    
    # Run the scan
    if "${CMD[@]}"; then
        log "Scan completed successfully: ${target_path}"
    else
        SCAN_EXIT=$?
        log "ERROR: Scan failed with exit code ${SCAN_EXIT}: ${target_path}"
        EXIT_CODE=$(( EXIT_CODE > SCAN_EXIT ? EXIT_CODE : SCAN_EXIT ))
    fi
done

# Optional notification hook
if [[ -n "${AEGIS_NOTIFY_CMD:-}" ]]; then
    log "Sending notification via AEGIS_NOTIFY_CMD"
    if ! "${AEGIS_NOTIFY_CMD}" "${EXIT_CODE}" "${#TARGETS[@]}"; then
        log "WARNING: Notification command failed"
    fi
fi

log "Cron scan completed with exit code: ${EXIT_CODE}"
exit "${EXIT_CODE}"