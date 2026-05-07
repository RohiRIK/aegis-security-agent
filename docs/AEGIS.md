# Aegis — Security Analyst Agent

## Overview

Aegis is the on-demand security analyst for the Aegis system. Where the silent plugin acts as an advisory observer — logging file writes and scanning package installs — Aegis is the specialist called in for deep diagnosis: whole-repo scans, dependency audits, threat modeling, and audit log forensics. Aegis is policy-aware (reads `aegis-policy.json` and `.aegis/audit.log`) and produces structured `SAFE/RISKY/BLOCKED` verdicts with evidence and remediation. It is strictly read-only; it never edits files.

---

## Capability Comparison

| Capability | Plugin (silent, advisory) | Aegis (on-demand) | @security (generic) |
|---|---|---|---|
| File write observation (Semgrep) | ✅ (logs findings) | ✅ (full-repo) | ❌ |
| Package install scanning (Trivy) | ✅ (logs CVEs) | ✅ (full lockfile) | ❌ |
| Full dependency audit | ❌ | ✅ | ❌ |
| TruffleHog secrets scan | ❌ | ✅ (on-demand) | ❌ |
| Audit log analysis | writes only | ✅ reads + analyzes | ❌ |
| Threat modeling | ❌ | ✅ | ❌ |
| aegis-policy.json aware | ✅ | ✅ | ❌ |
| Structured SAFE/RISKY/BLOCKED verdict | ❌ | ✅ | ❌ |
| Verdict history + trend analysis | ❌ | ✅ | ❌ |
| Scanner timeout enforcement | ✅ (runtime wrappers) | ✅ (300s per command) | ❌ |
| Scan result caching | ✅ (TTL-based) | ❌ (always fresh) | ❌ |
| Edits files | ❌ | ❌ | ❌ |

---

## Architecture

### Plugin (advisory-only)

The plugin operates in observation mode:
- **PostToolUse**: Scans file writes with Semgrep, logs findings to `.aegis/audit.log`
- **PreToolUse**: Scans package installs with Trivy, logs CVE findings
- **Session start**: Bootstraps `.aegis/` directory structure
- **Never blocks**: All findings are logged, never enforced. The plugin uses `safe()` wrappers on all handlers to ensure it cannot crash the host agent.

### Scanner Infrastructure

- **Timeout enforcement**: All scanner invocations use `runScannerWithTimeout()` with per-scanner budgets (semgrep 120s, trivy 60s, trufflehog 90s). Timed-out scans return `{ status: "timeout" }` and trigger degraded mode fallbacks.
- **Scan caching**: File-based cache with TTL (semgrep/trufflehog 10min, trivy 60min). Failed runs, timeouts, and CRITICAL findings are never cached. Cache lives in `.aegis/scan-cache/`.
- **Scanner provisioning**: `aegis tools install --tool=<name>|--all` auto-downloads scanner binaries from GitHub Releases with SHA256 verification. Supports trivy, trufflehog (binary), and semgrep (via pipx/uv).

### Verdict History

Aegis maintains a verdict trail in `.aegis/audit.log` (NDJSON format). Before producing a new verdict, Aegis reads the last 10 entries and reports trend:
- **Improving**: severity counts decreasing
- **Stable**: no significant change
- **Degrading**: severity counts increasing or new CRITICAL findings

CLI: `bunx aegis-security-agent verdict read 10` / `verdict append '<json>'`

---

## When to Invoke Aegis

### 1. Automatically — Sisyphus escalates

Sisyphus calls `@aegis` when any of these trigger conditions are met (see `AGENTS.md` Security Escalation section):

| Trigger | Condition | Task |
|---------|-----------|------|
| **Semgrep errors** | PostToolUse Semgrep found ≥3 ERROR findings in a single file | `deep-scan` |
| **Trivy CVE** | Plugin logged a CVE for a package install | `dependency-audit` |
| **Pre-commit gate** | `/commit-push-pr` on a branch with >500 LOC changed | `pre-merge-review` |
| **New dependency** | Any new dep added to `package.json` / `pyproject.toml` | `dependency-audit` |
| **Auth/crypto code** | File written contains `jwt`, `bcrypt`, `oauth`, `cipher`, `private_key` | `auth-review` |
| **Infrastructure** | Dockerfile, docker-compose, k8s manifests, or terraform files modified | `infra-review` |
| **User request** | User says "security review", "audit", or "check security" | `full-audit` |

**Anti-triggers** — Sisyphus MUST NOT call Aegis for:
- Routine file edits (plugin handles via Semgrep)
- Package installs that pass Trivy (plugin already cleared them)
- Read-only operations (no security surface)

### 2. Manually — invoke directly

```
@aegis full-audit
@aegis deep-scan src/api/auth.ts
@aegis dependency-audit
@aegis pre-merge-review
@aegis auth-review
@aegis audit-override
@aegis infra-review
```

---

## How to Invoke

| Task type | What it does |
|-----------|-------------|
| `full-audit` | Runs Semgrep, Trivy, TruffleHog (all with `timeout 300`), reads verdict history + audit.log — comprehensive security review. |
| `deep-scan <file>` | Focused Semgrep + context analysis on a specific file or set of files. |
| `dependency-audit` | Full lockfile Trivy scan + `bun audit` + cross-reference with policy. |
| `pre-merge-review` | Diffs the branch, runs full-audit on changed files, checks for override abuse. |
| `auth-review` | Grep + Semgrep focused on auth/crypto patterns in changed files. |
| `audit-override` | Reads `.aegis/audit.log` to assess risk of a user-approved plugin override. |
| `infra-review` | Trivy config scan on Dockerfiles, compose, k8s, and terraform files. |

---

## Verdict Format

Every Aegis response follows this structure:

```
## 🛡️ Aegis Security Assessment

**Verdict**: SAFE | RISKY | BLOCKED
**Task**: <task-type>
**Scope**: <what was analyzed>
**Trend**: Improving | Stable | Degrading (from verdict history)

### Findings

| # | Severity | Category | Location | Description |
|---|----------|----------|----------|-------------|

### Evidence
<scanner output, code snippets, CVE IDs>

### Remediation
<numbered list of specific fixes>

### Policy Recommendation
<optional: aegis-policy.json changes>

---
Scanned by: Aegis v2 | Scanners: semgrep, trivy, trufflehog
```

**Verdict levels:**

| Verdict | Meaning | Action |
|---------|---------|--------|
| `SAFE` | No findings above LOW severity | Proceed normally |
| `RISKY` | HIGH/MEDIUM findings exist, no CRITICAL | Proceed with caution; fix before merge |
| `BLOCKED` | CRITICAL findings or active secret exposure | Stop; fix required before continuing |

---

## Installation

```bash
bunx aegis-security-agent install --opencode
```

This creates:
- `opencode.json` — registers the plugin
- `.opencode/plugins/aegis.ts` — plugin shim (observation-only)
- `.opencode/agents/aegis.md` — @aegis agent definition (project-local)
- `.opencode/package.json` — dependency declaration
- `.aegis/` — runtime directory (audit.log, scans/, scan-cache/)
- `aegis-policy.json` — security policy
- `.opencode/skills/` — managed security skills (AgentTrustBoundaries, SecretSafeHandling, CommandPathSafety)

For Claude Code: `bunx aegis-security-agent install --claude`

### Scanner Provisioning

Scanners are NOT bundled. Install them via:

```bash
# Install individual scanner
aegis tools install --tool=trivy
aegis tools install --tool=trufflehog

# Install all scanners
aegis tools install --all

# Check status
aegis tools status

# Remove
aegis tools remove --tool=trivy
```

Aegis degrades gracefully if scanners are missing — falls back to grep-based heuristics and notes `⚠️ DEGRADED` in the verdict header.

---

## Runtime Directory Structure

All paths are auto-managed by the package. Users never create these manually.

```
.aegis/
├── audit.log          # NDJSON verdict events + session events
├── scans/             # Scanner output files (semgrep, trivy, trufflehog JSON)
└── scan-cache/        # TTL-based scan result cache

~/.aegis/
└── bin/               # Provisioned scanner binaries (trivy, trufflehog, semgrep)
```

---

## Known Limitations

- **No approve path** — Aegis never edits files; all fixes flow through Sisyphus → normal edit path → plugin Semgrep check.
- **Scanners not bundled** — `semgrep`, `trivy`, and `trufflehog` must be installed via `aegis tools install` or manually on PATH.
- **Audit log forensics degrade** — if `.aegis/audit.log` is missing or empty, `audit-override` and `full-audit` tasks produce incomplete results.
- **`bun audit` requires lockfile** — dependency audit degrades if `bun.lockb` is absent.
- **Advisory-only plugin** — the plugin never blocks commands or tool calls. It observes and logs. Enforcement is left to Aegis verdicts and human judgment.
