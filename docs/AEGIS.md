# Aegis — Security Analyst Agent

## Overview

Aegis is the on-demand security analyst for the harness system. Where the silent plugin acts as a real-time immune system — blocking dangerous tool calls in <500ms — Aegis is the specialist called in for deep diagnosis: whole-repo scans, dependency audits, threat modeling, and audit log forensics. Aegis is harness-aware (reads `harness-policy.json` and `.harness/audit.log`) and produces structured `SAFE/RISKY/BLOCKED` verdicts with evidence and remediation. It is strictly read-only; it never edits files.

---

## Capability Comparison

| Capability | Plugin (silent) | Aegis (on-demand) | @security (generic) |
|---|---|---|---|
| Real-time tool blocking | ✅ | ❌ | ❌ |
| Per-file Semgrep scan | ✅ (on write) | ✅ (full-repo) | ❌ |
| Full dependency audit | ❌ | ✅ | ❌ |
| TruffleHog secrets scan | preflight only | ✅ (on-demand) | ❌ |
| Audit log analysis | writes only | ✅ reads + analyzes | ❌ |
| Threat modeling | ❌ | ✅ | ❌ |
| harness-policy.json aware | ✅ | ✅ | ❌ |
| Structured SAFE/RISKY/BLOCKED verdict | ❌ | ✅ | ❌ |
| Edits files | ❌ | ❌ | ❌ |

---

## When to Invoke Aegis

### 1. Automatically — Sisyphus escalates

Sisyphus calls `@aegis` when any of these trigger conditions are met (see `~/.config/opencode/AGENTS.md` Security Escalation section):

| Trigger | Condition | Task |
|---------|-----------|------|
| **Plugin block** | Plugin blocked a command AND user overrode the block | `audit-override` |
| **Semgrep errors** | PostToolUse Semgrep found ≥3 ERROR findings in a single file | `deep-scan` |
| **Trivy CVE** | Plugin blocked a package install due to CVEs | `dependency-audit` |
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
| `full-audit` | Runs Semgrep, Trivy, TruffleHog, and reads audit.log — comprehensive security review. |
| `deep-scan <file>` | Focused Semgrep + context analysis on a specific file or set of files. |
| `dependency-audit` | Full lockfile Trivy scan + `bun audit` + cross-reference with policy. |
| `pre-merge-review` | Diffs the branch, runs full-audit on changed files, checks for override abuse. |
| `auth-review` | Grep + Semgrep focused on auth/crypto patterns in changed files. |
| `audit-override` | Reads `.harness/audit.log` to assess risk of a user-approved plugin override. |
| `infra-review` | Trivy config scan on Dockerfiles, compose, k8s, and terraform files. |

---

## Verdict Format

Every Aegis response follows this structure:

```
## 🛡️ Aegis Security Assessment

**Verdict**: SAFE | RISKY | BLOCKED
**Task**: <task-type>
**Scope**: <what was analyzed>

### Findings

| # | Severity | Category | Location | Description |
|---|----------|----------|----------|-------------|

### Evidence
<scanner output, code snippets, CVE IDs>

### Remediation
<numbered list of specific fixes>

### Policy Recommendation
<optional: harness-policy.json changes>

---
Scanned by: Aegis v1 | Scanners: semgrep, trivy, trufflehog
```

**Verdict levels:**

| Verdict | Meaning | Action |
|---------|---------|--------|
| `SAFE` | No findings above LOW severity | Proceed normally |
| `RISKY` | HIGH/MEDIUM findings exist, no CRITICAL | Proceed with caution; fix before merge |
| `BLOCKED` | CRITICAL findings or active secret exposure | Stop; fix required before continuing |

---

## Installation

1. Aegis is installed automatically by `bun run src/install.ts -- --opencode` (same command that installs the OpenCode plugin).
2. The agent definition is placed at `~/.config/opencode/agents/aegis.md`.
3. Requires `semgrep`, `trivy`, and `trufflehog` on PATH for full capability.
4. Degrades gracefully if scanners are missing — falls back to grep-based heuristics and notes `DEGRADED` in the verdict header.

---

## Known Limitations

- **No approve path** — Aegis never edits files; all fixes flow through Sisyphus → normal edit path → plugin Semgrep check.
- **Scanners not bundled** — `semgrep`, `trivy`, and `trufflehog` must be installed separately on the host.
- **Audit log forensics degrade** — if `.harness/audit.log` is missing or empty, `audit-override` and `full-audit` tasks produce incomplete results.
- **`bun audit` requires lockfile** — dependency audit degrades if `bun.lockb` is absent.
