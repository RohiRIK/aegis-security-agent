# Aegis Cron Setup Guide

This guide explains how to set up Aegis to run security scans on a schedule using the system cron daemon, independent of Hermes cron.

## Overview

The Aegis cron wrapper (`deploy/cron/aegis-scan.sh`) provides a POSIX-compliant shell script that:
- Accepts one or more `--target` arguments (local paths or git URLs)
- Optionally reads targets from a config file (`--config <file>`)
- Sets up proper scanner PATH
- Calls `aegis scan --no-catalog --json` for each target (produces all report artifacts)
- Logs to `~/.aegis/cron.log` with timestamps and exit codes
- Prevents overlapping runs using `flock`
- Supports optional notifications via `AEGIS_NOTIFY_CMD` environment variable

## Installation

### 1. Install the wrapper script

```bash
# Copy the wrapper to your preferred location (e.g., ~/.aegis/)
mkdir -p ~/.aegis
cp deploy/cron/aegis-scan.sh ~/.aegis/
chmod +x ~/.aegis/aegis-scan.sh
```

### 2. Create a targets configuration (optional but recommended)

```bash
cp deploy/cron/targets.conf.sample ~/.aegis/targets.conf
# Edit ~/.aegis/targets.conf to add your targets
# Format: <path|url>[,scanners]
# Example:
#   ~/projects/my-app
#   https://github.com/example/repo.git,semgrep,trivy
```

### 3. Install the cron job

```bash
# Edit your crontab
crontab -e

# Add the following line (adjust path and schedule as needed):
# Aegis nightly full scan — 02:30
30 2 * * *  ~/.aegis/aegis-scan.sh --config ~/.aegis/targets.conf >> ~/.aegis/cron.log 2>&1
```

## Configuration

### Environment Variables

- `AEGIS_HOME`: Override the default `~/.aegis` directory (default: `$HOME/.aegis`)
- `AEGIS_BIN`: Command used to invoke Aegis (default: `bun $HOME/projects/aegis-security-agent/dist/cli/index.js`). Override with a globally installed `aegis` or a different runner, e.g. `AEGIS_BIN=aegis`.
- `AEGIS_NOTIFY_CMD`: Optional command to call after each scan run. Receives two arguments:
  - Exit code of the scan job (0=SAFE, 1=RISKY, 2=BLOCKED, 3=ERROR)
  - Number of targets scanned

Example notification script (Telegram via Hermes cron-independent):
```bash
#!/usr/bin/env bash
EXIT_CODE=$1
TARGET_COUNT=$2

STATUS_MAP=(SAFE RISKY BLOCKED ERROR)
STATUS=${STATUS_MAP[$EXIT_CODE]:-UNKNOWN}

# Only notify on issues or errors
if [[ $EXIT_CODE -ne 0 ]]; then
    hermes send-message \
        --to gabriel \
        --message "🚨 Aegis scan alert: $STATUS on $TARGET_COUNT target(s)" \
        --priority high
fi
```

Make it executable: `chmod +x ~/.aegis/notify-aegis.sh`

Then set in crontab or environment:
```
AEGIS_NOTIFY_CMD=$HOME/.aegis/notify-aegis.sh
```

## Log Rotation

The cron log (`~/.aegis/cron.log`) rotates automatically when it reaches 10MB via logrotate if installed, or you can manually rotate:

```bash
# Manual rotation example
mv ~/.aegis/cron.log ~/.aegis/cron.log.$(date +%Y%m%d)
gzip ~/.aegis/cron.log.$(date +%Y%m%d)
touch ~/.aegis/cron.log
chmod 600 ~/.aegis/cron.log
```

## Testing the Setup

Run the wrapper manually to verify everything works:

```bash
# Test with a single target
~/.aegis/aegis-scan.sh --target ~/projects/aegis-security-agent

# Test with config file
~/.aegis/aegis-scan.sh --config ~/.aegis/targets.conf

# Test overlap protection (run twice in parallel)
~/.aegis/aegis-scan.sh --target ~/projects/aegis-security-agent &
~/.aegis/aegis-scan.sh --target ~/projects/aegis-security-agent
# Second instance should exit with "Another instance is still running - exiting"
```

## Troubleshooting

### "command not found: aegis"
- Ensure `AEGIS_BIN` points to the correct location
- Default: `$HOME/projects/aegis-security-agent/bin/aegis`
- Verify the binary exists and is executable

### Permission denied on log file
- Ensure `~/.aegis` directory is writable by the user running cron
- Log file and directory should be owned by the user

### Scanner not found
- The wrapper sets up PATH for provisioned scanners
- Ensure scanners (semgrep, trivy, trufflehog) are installed and available
- Check `~/.aegis/logs/scanner-install.log` for installation issues

### No output in log
- Verify cron daemon is running: `systemctl status cron` or `service cron status`
- Check cron logs: `/var/log/syslog` or `/var/log/cron.log`
- Ensure the crontab entry is saved correctly

## Security Notes

- The cron wrapper runs with the privileges of the user who installed it
- Consider running scans as a dedicated unprivileged user
- The `flock` lock file prevents concurrent scans that could cause resource contention
- Log files and scan outputs are restricted to owner-only permissions (600/700)

## Customization

### Scanners
To customize which scanners run, edit the targets file with an optional `,scanners` suffix:
```
# Use only semgrep and the built-in scanners
~/projects/my-app,semgrep

# Enable all available scanners (default)
~/projects/my-app,semgrep,trivy,trufflehog,gitleaks,njsscan
```

When the `,scanners` field is present, it becomes a `--scanners` allowlist: **only** the named scanners run.
When omitted, every available scanner (external + built-in) runs.

Additionally, place an `aegis-rules.json` in the target root to disable specific built-in scanners
or set `exclude_paths` for the built-in file walk (see [README](../README.md#rules-configuration-aegis-rulesjson)).

### Output Format
Every run writes a self-contained catalog per target — no format flag needed.
The wrapper invokes `aegis scan --target <path>`, which produces all three
artifacts under `$AEGIS_HOME/<repo>/<date>/<verdict>/`:

- `report.html` — self-contained HTML report (inline CSS, no external assets)
- `report.sarif` — SARIF 2.1.0 for CI / code-scanning ingestion
- `verdict.json` — machine-readable verdict + finding counts

Files are written `0600` and every catalog directory `0700` (owner-only), since
reports may contain vulnerability detail. Pass `--no-catalog` to suppress the
catalog, or `--json` for a machine-readable summary on stdout.

> **Note:** the optional `,scanners` field in a targets file (e.g.
> `~/projects/app,semgrep,trivy`) is passed as `--scanners` to `aegis scan`,
> which runs **only** the named scanners. Omit it to run all available scanners.