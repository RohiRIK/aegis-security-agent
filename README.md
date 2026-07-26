<p align="center">
  <img src="assets/logo.svg" alt="Aegis Security Agent" width="128" height="128" />
</p>

# Aegis Security Agent

Offline-first security scanner for AI coding agents and cron automation. Runs Semgrep, Trivy, TruffleHog, plus **built-in multi-language regex scanners** (Python, JS/TS, Shell, PowerShell) and optional external scanners (Gitleaks, njsscan) against local repos or cloned git URLs. Produces self-contained HTML reports with severity heatmaps, scanner cards, and fix guidance, plus SARIF and JSON output. Catalogs results under `~/.aegis`. No server, no daemon, no Docker required.

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

The core is identical: `aegis scan` runs Semgrep, Trivy, TruffleHog, built-in multi-language regex scanners, and optional Gitleaks/njsscan against a target, returns a SAFE / RISKY / BLOCKED verdict, and catalogs the report.

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

    B --> C1[External: Semgrep]
    B --> C2[External: Trivy]
    B --> C3[External: TruffleHog]

    B --> D1[Built-in: custom-patterns]
    B --> D2[Built-in: gitleaks-replacement]
    B --> D3[Built-in: path-traversal]
    B --> D4[Built-in: hardcoded-ip]
    B --> D5[Built-in: weak-crypto]

    B --> E1[Optional: Gitleaks]
    B --> E2[Optional: njsscan]

    C1 & C2 & C3 & D1 & D2 & D3 & D4 & D5 & E1 & E2 --> F

    F[Unified Verdict: SAFE\\|RISKY\\|BLOCKED]
    F --> G[Catalog: ~/.aegis/<Repo>/<YYYY-MM-DD>/<VERDICT>/]
    G --> H[report.html: heatmap, scanner cards, fix guide, dark mode]
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
    --out, -o <file>             Write report HTML to file (default: stdout)
    --no-catalog                 Skip saving report to catalog
    --json                       Output verdict as JSON
    --scanners <X,Y>             Run ONLY these scanners (comma-separated names)
    --scanner-disable <X,Y>      Disable specific scanners (comma-separated names)
    --scanner-enable-all         Enable all scanners, overriding aegis-rules.json
    --help, -h                   Show help
```

---

## Multi-Language Built-in Scanners

Aegis ships with 5 built-in scanner families that run regex-based pattern matching directly in-process, with no external binary required. Each targets specific language families or security categories:

| Scanner Family | Languages / Focus | Rules | Config Key |
|---|---|---|---|
| `custom-patterns` | Python, JS/TS, Shell, PowerShell, generic | 30+ generic + language-specific | `custom_scanners.custom-patterns` |
| `gitleaks-replacement` | Secret detection (AWS, GitHub, OpenAI, SSH keys, JWT, base64) | Entropy-gated (≥4.5 bits) | `custom_scanners.gitleaks-replacement` |
| `path-traversal` | Generic path traversal sinks | ~5 rules | `custom_scanners.path-traversal` |
| `hardcoded-ip` | Hardcoded IPv4 addresses | 1 rule | `custom_scanners.hardcoded-ip` |
| `weak-crypto` | Weak crypto primitives (MD5, SHA1, ECB, fixed IVs) | ~10 rules | `custom_scanners.weak-crypto` |

**Language detection:** Extension-based (`.py`, `.js`, `.ts`, `.sh`, `.ps1`, etc.) plus shebang fallback. Generic rules run on every file.

**Security invariant:** Matched values from regex captures NEVER appear in findings, reports, or logs (asserted by integration test).

---

## Rules Configuration (`aegis-rules.json`)

Place an `aegis-rules.json` file in the scan target root to customize scanner behaviour:

```json
{
  "custom_scanners": {
    "custom-patterns": { "enabled": true, "severity": "high" },
    "gitleaks-replacement": { "enabled": true, "entropy_threshold": 4.5, "severity": "high" },
    "path-traversal": { "enabled": true, "severity": "critical" },
    "hardcoded-ip": { "enabled": false, "severity": "medium" },
    "weak-crypto": { "enabled": true, "severity": "high" }
  },
  "exclude_paths": ["node_modules/**", ".git/**", "dist/**", "*.min.js", "vendor/**"]
}
```

| Field | Purpose |
|---|---|
| `custom_scanners.<name>.enabled` | `false` disables the scanner (overridable via `--scanner-enable-all`) |
| `custom_scanners.<name>.severity` | Forces all findings from this scanner to a fixed severity level |
| `custom_scanners.<name>.entropy_threshold` | Overrides the Shannon entropy gate for secret patterns |
| `exclude_paths` | Glob patterns to skip during built-in scanning (gitignore-style) |

**CLI overrides** (precedence): `--scanner-enable-all` > `--scanners` > `--scanner-disable` > config `enabled` > default on.

---

## Enhanced HTML Reports

The HTML report now includes:

- **Severity heatmap bar** — CSS proportional colored segments showing the distribution across Critical / High / Medium / Low / Info
- **Scanner detail cards** — Per-scanner name, version, status, duration, and finding count
- **Fix guidance column** — Remediation recommendations per finding type (from built-in rule index + scanner-specific heuristics)
- **Dark mode** — Automatically activated via `@media prefers-color-scheme: dark` (#0d1117 background)

Example: `aegis scan --target ./my-repo --out report.html` produces a fully self-contained report with all assets inline.

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