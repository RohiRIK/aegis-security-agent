<p align="center">
  <img src="assets/logo.svg" alt="Aegis Security Agent" width="128" height="128" />
</p>

# Aegis Security Agent

Offline-first security scanner for AI coding agents and cron automation. Runs Semgrep, Trivy, and TruffleHog against local repos or cloned git URLs, produces self-contained HTML reports and SARIF, and catalogs results under `~/.aegis`. No server, no daemon, no Docker required.

[![npm version](https://img.shields.io/npm/v/aegis-security-agent.svg)](https://www.npmjs.com/package/aegis-security-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1)](https://bun.sh)

---

## Two Modes

Aegis operates in two distinct modes:

| Mode | Entry Point | Purpose |
|------|-------------|---------|
| **AI-integrated scan** | `aegis scan` + Hermes Skill | Gabriel (or any AI agent) shells out to `aegis scan` for on-demand security audits |
| **Standalone cron** | `deploy/cron/aegis-scan.sh` + OS crontab | Scheduled headless scans independent of Hermes or any AI agent |

The core is identical: `aegis scan` runs Semgrep, Trivy, and TruffleHog against a target, returns a SAFE / RISKY / BLOCKED verdict, and catalogs the report.

---

## Quick Start — AI-Integrated Scan

> **Note:** Use the native Bun installed at `~/.bun/bin/bun` (not the snap version, which cannot write to `~/.aegis`).

```bash
# 1. Build the CLI (requires bun ~1.x)
cd ~/projects/aegis-security-agent
bun install
bun run build

# 2. Run a scan against a local repo
~/.bun/bin/bun dist/cli/index.js scan --target ~/projects/my-app

# Sample output:
# [AEGIS] SAFE — my-app (a3f2c1d) C:0 H:0 M:0 L:0 I:0
# [AEGIS] Report cataloged at ~/.aegis/my-app/2026-07-24/SAFE
```

The catalog contains:
- `report.html` (self-contained, browser-ready, XSS-escaped)
- `report.sarif` (machine-readable)
- `verdict.json` (structured summary)

**Exit codes:** `0 = SAFE`, `1 = RISKY`, `2 = BLOCKED`, `3 = ERROR` — usable in shell pipelines and CI gates.

### Scanning a Git URL (untrusted repos)

```bash
~/.bun/bin/bun dist/cli/index.js scan --target https://github.com/example/repo.git --allow-untrusted
```

Clones shallow (`--depth 1`) into a `0700` temp directory, size-guarded (default 2048 MB cap), cleans up temp files, and confines `--subpath` to the clone root (traversal rejected).

---

## Quick Start — Standalone Cron Mode

1. **Install the cron script** (adjust paths as needed):

```bash
sudo cp deploy/cron/aegis-scan.sh /usr/local/bin/aegis-scan
sudo chmod +x /usr/local/bin/aegis-scan
```

2. **Configure targets** (see `deploy/cron/targets.conf.sample`):

```bash
sudo cp deploy/cron/targets.conf.sample /etc/aegis-scan/targets.conf
sudo chmod 600 /etc/aegis-scan/targets.conf
```

Edit `/etc/aegis-scan/targets.conf` to add lines like:
```
/path/to/local/repo
https://github.com/internal/repo.git
```

3. **Install the cron job** (see `deploy/cron/crontab.sample`):

```bash
sudo cp deploy/cron/crontab.sample /etc/cron.d/aegis-scan
```

Edit `/etc/cron.d/aegis-scan` to adjust the schedule and environment as needed.

**Important:** The cron job **must** use the native Bun (`~/.bun/bin/bun`) — the snap Breaks writes to `~/.aegis`. The script uses `AEGIS_BIN` to override the Bun binary; set it in `/etc/aegis-scan/targets.conf` or the cron job's environment if needed.

Logs are written to `~/.aegis/cron.log`.

---

## Architecture

```mermaid
flowchart TD
    A[Target: Local Path or Git URL] --> B{aegis scan}
    B --> C[Semgrep]
    B --> D[Trivy]
    B --> E[TruffleHog]
    C --> F[Unified Verdict: SAFE\|RISKY\|BLOCKED]
    D --> F
    E --> F
    F --> G[Catalog: ~/.aegis/<Repo>/<YYYY-MM-DD>/<VERDICT>/]
    G --> H[report.html]
    G --> I[report.sarif]
    G --> J[verdict.json]
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style F fill#bbf,stroke:#333,stroke-width:2px
    style G fill#bfb,stroke:#333,stroke-width:2px
```

---

## CLI Reference

Run `aegis --help` for the full command list:

```
🛡  Aegis · AI-Agent Security
  ─────────────────────────────────────

  Usage
    aegis <command> [flags]

  Commands
    install  Install Aegis config into the current project
    status   Show installation status
    tools    Install, check, or remove scanner binaries
    scan     Headless deep scan of a directory → HTML/SARIF/verdict
    verdict  Read or append verdict audit log entries
    report   Generate security reports from audit data
    help     Show this help

  Install Flags
    --opencode     Install for OpenCode (default)
    --claude       Install for Claude Code
    --force        Overwrite existing files
    --skip-docker  Skip Docker availability check
```

Run `aegis scan --help` for scan-specific options:

```
  Usage
    aegis scan [options]

  Options
    --target, -t <path|git-url>  Target to scan (default: current directory)
    --branch <name>              Git branch to check out (git URLs only)
    --subpath <dir>              Limit scan to a subdirectory within the target
    --allow-untrusted            Allow scanning untrusted git URLs (shallow clone to tmp)
    --max-repo-size-mb <N>       Max size for cloned repos in MB (default: 2048)
    --out, -o <file>             Write verdict to file (default: stdout)
    --no-catalog                 Skip saving report to catalog
    --json                       Output verdict as JSON
    --help, -h                   Show help
```

---

## Documentation

See the [`docs/`](docs/) directory for detailed documentation:

- [`docs/README.md`](docs/README.md) – Index of documentation
- [`docs/CRON.md`](docs/CRON.md) – Cron setup guide
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) – System architecture
- [`docs/SIEM.md`](docs/SIEM.md) – SIEM integration guide

> **Note:** Some documents in `docs/` are archival or superseded by the dual-purpose pivot. See the index for details.

---

## Error Messages

Aegis aims for actionable error messages. Common scan errors:

- `DEGRADED: <scanner>` – One or more scanners missing; results may be incomplete.
- `ERROR: Failed to clone repository` – Check URL, network, or `--allow-untrusted` flag.
- `ERROR: Target path does not exist` – Verify `--target` path.
- `ERROR: Verdict JSON malformed` – Report catalog corruption; consider clearing `~/.aegis`.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, testing, and release process.