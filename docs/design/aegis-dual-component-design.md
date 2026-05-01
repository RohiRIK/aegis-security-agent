# Aegis Dual-Component Security System — Design Document

> **Status**: Design-only — no implementation code  
> **Date**: 2026-04-30  
> **Components**: OpenCode Plugin (silent guardrail) + Aegis Agent (on-demand analyst)

---

## 1. Capability Matrix

Three security layers, each with a distinct role. No overlap in responsibility.

| Capability | Plugin (silent) | Aegis (on-demand) | dev-team:security-analyst |
|---|---|---|---|
| **Trigger** | Automatic (every tool call) | Explicit (`@aegis` or Sisyphus escalation) | `buddy` task dispatch |
| **Scope** | Single tool invocation | Whole codebase / PR / feature branch | Single file or diff |
| **Sandbox routing** | ✅ Rewrites bash → `docker exec` | ❌ Does not execute code | ❌ Read-only |
| **HIGH-RISK blocking** | ✅ Pattern match → block/HITL | ❌ Analyzes after the fact | ❌ |
| **Semgrep scan** | ✅ Auto on every file write | ✅ On-demand full-repo scan | ❌ |
| **Trivy CVE scan** | ✅ Auto on package installs | ✅ On-demand lockfile/image scan | ❌ |
| **TruffleHog secrets** | ❌ (preflight only) | ✅ Full repo secrets scan | ❌ |
| **Threat modeling** | ❌ | ✅ STRIDE analysis of architecture | ❌ |
| **Dependency audit** | ❌ (Trivy per-install only) | ✅ Full dependency tree audit | ❌ |
| **Audit log analysis** | ❌ (writes to log) | ✅ Reads + analyzes `.harness/audit.log` | ❌ |
| **Policy review** | ❌ (consumes policy) | ✅ Reviews + recommends policy changes | ❌ |
| **Remediation** | ❌ (blocks only) | ✅ Suggests fixes (read-only output) | ✅ Suggests fixes |
| **HITL gateway** | ✅ Invokes gateway | ❌ | ❌ |
| **Preflight gate** | ✅ `session.created` | ❌ | ❌ |
| **Structured verdict** | ❌ (pass/block binary) | ✅ SAFE/RISKY/BLOCKED + evidence | ❌ |
| **Can fix code** | ❌ | ❌ (read-only analyst) | ❌ (read-only) |
| **Latency budget** | <500ms per hook | Minutes (deep analysis) | Minutes |

### Key Distinction: Plugin vs Aegis

- **Plugin** = immune system. Fast, silent, zero-latency guardrails. Prevents harm in real-time.
- **Aegis** = specialist doctor. Called when you need diagnosis, not just prevention. Deep analysis, structured reports, actionable remediation.

### Key Distinction: Aegis vs dev-team:security-analyst

- **security-analyst** is a dev-team subagent dispatched by `buddy`. It reviews a single file/diff for OWASP issues and hands off fixes. It has no access to harness tooling (Trivy, Semgrep, TruffleHog) and no knowledge of `harness-policy.json`.
- **Aegis** is harness-aware. It reads the policy, runs the same scanners the plugin uses, analyzes audit logs, and produces structured verdicts. It's the security team's senior analyst; security-analyst is a junior code reviewer.

---

## 2. Aegis Tool Whitelist

Aegis is a **read-only analyst**. It can run scanners but cannot edit files or execute arbitrary commands.

```yaml
permission:
  edit: deny
  bash:
    "*": deny                              # No arbitrary shell
    "semgrep scan *": allow                # Semgrep full-repo scans
    "trivy fs *": allow                    # Trivy filesystem scans
    "trivy image *": allow                 # Trivy container image scans
    "trufflehog filesystem *": allow       # TruffleHog secrets scan
    "bun audit": allow                     # Bun dependency audit
    "git diff *": allow                    # Diff inspection
    "git log *": allow                     # History inspection
    "git show *": allow                    # Commit inspection
    "grep *": allow                        # Content search
    "docker inspect *": allow              # Container config inspection
  webfetch: deny
```

### Rationale

| Tool | Why allowed | Why not broader |
|---|---|---|
| `semgrep scan` | Core scanner — same as plugin uses | Scoped to `scan` subcommand only |
| `trivy fs/image` | CVE scanning — same as plugin uses | No `trivy server` or write operations |
| `trufflehog filesystem` | Secrets detection — plugin only checks preflight | Read-only filesystem scan |
| `bun audit` | Dependency vulnerability check | Same as existing security.md agent |
| `git diff/log/show` | Understand what changed and when | Read-only git operations |
| `grep` | Search for patterns in code | No sed/awk/write operations |
| `docker inspect` | Verify sandbox container config | No exec/run/build |

### Why read-only?

Aegis identifies problems. Sisyphus (or the user) fixes them. This separation ensures:
1. Aegis findings are trustworthy (no conflict of interest — it doesn't write the code it reviews)
2. Fixes go through the normal plugin guardrails (Semgrep on write, sandbox routing)
3. Solo developer retains control over what gets changed

---

## 3. Sisyphus Trigger Conditions

Add to `AGENTS.md` under a new `## Security Escalation` section:

```markdown
## Security Escalation

Sisyphus MUST call `@aegis` when:

| Trigger | Condition | Aegis Task |
|---------|-----------|------------|
| **Plugin block** | Plugin blocked a command AND user overrode the block | `audit-override` — review what was allowed through |
| **Semgrep errors** | PostToolUse Semgrep found ≥3 ERROR findings in a single file | `deep-scan` — full Semgrep + context analysis |
| **Trivy CVE** | Plugin blocked a package install due to CVEs | `dependency-audit` — full lockfile scan + alternatives |
| **Pre-commit gate** | User requests `/commit-push-pr` on a branch with >500 LOC changed | `pre-merge-review` — full branch security review |
| **New dependency** | Any new dependency added to package.json/pyproject.toml | `dependency-audit` — scan new dep + transitive tree |
| **Auth/crypto code** | File written contains auth/crypto patterns (jwt, bcrypt, oauth, cipher, private_key) | `auth-review` — focused auth/crypto review |
| **Infrastructure** | Dockerfile, docker-compose, k8s manifests, terraform files modified | `infra-review` — container/infra security review |
| **User request** | User says "security review", "audit", "check security" | `full-audit` — comprehensive security review |

Sisyphus MUST NOT call @aegis for:
- Routine file edits (plugin handles via Semgrep)
- Package installs that pass Trivy (plugin already cleared them)
- Read-only operations (no security surface)
```

---

## 4. Structured Response Format

Every Aegis response follows this format:

```
## 🛡️ Aegis Security Assessment

**Verdict**: SAFE | RISKY | BLOCKED
**Scope**: <what was analyzed>
**Scan Duration**: <time>

### Findings

| # | Severity | Category | File:Line | Description |
|---|----------|----------|-----------|-------------|
| 1 | CRITICAL | injection | src/api.ts:42 | Unsanitized user input in SQL query |
| 2 | HIGH | secrets | .env.example:3 | Hardcoded API key pattern detected |

### Evidence
<scanner output, code snippets, CVE references>

### Remediation
1. <specific fix for finding 1>
2. <specific fix for finding 2>

### Policy Recommendation
<optional: suggest harness-policy.json changes if applicable>

---
Scanned by: Aegis v1 | Scanners: semgrep, trivy, trufflehog
```

**Verdict definitions:**

| Verdict | Meaning | Action |
|---------|---------|--------|
| `SAFE` | No findings above LOW severity | Proceed normally |
| `RISKY` | HIGH/MEDIUM findings exist but no CRITICAL | Proceed with caution; fix recommended before merge |
| `BLOCKED` | CRITICAL findings or active secret exposure | Do NOT proceed; fix required |

---

## 5. Plugin ↔ Aegis Escalation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        SISYPHUS (orchestrator)                  │
│                                                                 │
│  Normal flow:                                                   │
│  ┌──────┐    tool call    ┌────────┐   pass    ┌──────────┐    │
│  │ User ├───────────────►│ Plugin  ├─────────►│ Execute   │    │
│  │ Task │                │(silent) │          │ (sandbox) │    │
│  └──────┘                └───┬─────┘          └──────────┘    │
│                              │                                  │
│  Escalation flow:            │ block/warn                       │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │ Escalation      │                          │
│                    │ Decision Point  │                          │
│                    └────┬───────┬────┘                          │
│                         │       │                               │
│            ≥3 semgrep   │       │  single block                │
│            or CVE block │       │  (routine)                   │
│            or auth code │       │                               │
│                         ▼       ▼                               │
│                    ┌────────┐  ┌──────────┐                    │
│                    │ @aegis │  │ Log only │                    │
│                    │ (deep  │  │ (plugin  │                    │
│                    │ scan)  │  │ handled) │                    │
│                    └───┬────┘  └──────────┘                    │
│                        │                                        │
│                        ▼                                        │
│               ┌─────────────────┐                              │
│               │ Aegis Verdict   │                              │
│               │ SAFE|RISKY|     │                              │
│               │ BLOCKED         │                              │
│               └────┬───────┬────┘                              │
│                    │       │                                    │
│              SAFE/ │       │ BLOCKED                           │
│              RISKY │       │                                    │
│                    ▼       ▼                                    │
│              ┌────────┐ ┌──────────────┐                      │
│              │Continue│ │ STOP +       │                      │
│              │+ apply │ │ show findings│                      │
│              │remedia-│ │ to user      │                      │
│              │tion    │ │              │                      │
│              └────────┘ └──────────────┘                      │
└─────────────────────────────────────────────────────────────────┘

Sequence (escalation case):

  Sisyphus          Plugin              Aegis           audit.log
     │                 │                   │                │
     │──tool call────►│                   │                │
     │                 │──check policy───►│                │
     │                 │  HIGH-RISK match  │                │
     │                 │──block + log────►│───────────────►│
     │                 │                   │                │
     │◄─block reason──│                   │                │
     │                 │                   │                │
     │  (trigger met)  │                   │                │
     │─────────────────────@aegis────────►│                │
     │                 │                   │──semgrep──┐    │
     │                 │                   │──trivy────┤    │
     │                 │                   │──trufflehog┤   │
     │                 │                   │◄───results─┘   │
     │                 │                   │                │
     │                 │                   │──read─────────►│
     │                 │                   │◄─audit history─│
     │                 │                   │                │
     │◄──verdict───────────────────────────│                │
     │  (SAFE/RISKY/BLOCKED + remediation) │                │
     │                 │                   │                │
```

---

## 6. Shared State Architecture

Both plugin and Aegis consume the same artifacts. Neither owns them — the harness runtime does.

```
.harness/
├── audit.log              # NDJSON — plugin writes, Aegis reads
├── harness-policy.json    # Symlink → repo root harness-policy.json
└── scan-cache/            # Optional: cached scan results
    ├── semgrep-<hash>.json
    └── trivy-<hash>.json

harness-policy.json        # Source of truth (repo root)
```

| Artifact | Plugin | Aegis | Format |
|----------|--------|-------|--------|
| `harness-policy.json` | Reads (enforce rules) | Reads (review rules, recommend changes) | JSON schema v1 |
| `.harness/audit.log` | Appends (semgrep_finding, hitl_decision) | Reads (pattern analysis, override tracking) | NDJSON |
| Semgrep results | Runs + logs per-file | Runs full-repo + reads cached | JSON |
| Trivy results | Runs per-install + blocks | Runs full-lockfile + reports | JSON |
| TruffleHog results | Preflight only | Runs on-demand | JSON |

**No shared mutable state.** Plugin writes → Aegis reads. No race conditions. No locking needed.

---

## 7. Draft `aegis.md` Skeleton

```yaml
---
description: >-
  Harness-aware security analyst. Deep vulnerability scanning, threat modeling,
  dependency auditing, and audit log analysis. Produces structured SAFE/RISKY/BLOCKED
  verdicts with evidence and remediation. Read-only — never edits code.
mode: subagent
temperature: 0.1
permission:
  edit: deny
  bash:
    "*": deny
    "semgrep scan *": allow
    "trivy fs *": allow
    "trivy image *": allow
    "trufflehog filesystem *": allow
    "bun audit": allow
    "git diff *": allow
    "git log *": allow
    "git show *": allow
    "grep *": allow
    "docker inspect *": allow
  webfetch: deny
---

# Aegis — Security Analyst Agent

You are **Aegis**, the harness security analyst. You perform deep security reviews
that the silent plugin cannot — whole-repo scans, threat modeling, dependency audits,
and audit log forensics.

## Identity

- You are a **read-only analyst**. You NEVER edit files.
- You produce **structured verdicts**: SAFE, RISKY, or BLOCKED.
- You are **harness-aware**: you know about harness-policy.json, .harness/audit.log,
  and the plugin's real-time guardrails.
- You complement the plugin — you don't duplicate it.

## What You Do (that the plugin cannot)

1. **Full-repo Semgrep scan** — not just single files
2. **Full dependency audit** — entire lockfile, not just new installs
3. **TruffleHog secrets scan** — full repo history
4. **Audit log analysis** — read .harness/audit.log for patterns (repeated blocks,
   override abuse, recurring findings)
5. **Threat modeling** — STRIDE analysis of architecture changes
6. **Policy review** — recommend harness-policy.json improvements
7. **Pre-merge security gate** — comprehensive branch review before PR

## Task Types

When invoked, you receive a task type. Execute the corresponding workflow:

### `full-audit`
1. Read harness-policy.json — note current rules
2. Run: `semgrep scan --config=p/security-audit --config=p/secrets --json .`
3. Run: `trivy fs --scanners vuln --severity HIGH,CRITICAL --format json .`
4. Run: `trufflehog filesystem --json .`
5. Read .harness/audit.log — analyze recent events
6. Produce verdict with all findings consolidated

### `deep-scan`
1. Run Semgrep on the specific file(s) flagged
2. Analyze surrounding code for context (grep for related patterns)
3. Check git log for recent changes to flagged files
4. Produce verdict focused on the flagged area

### `dependency-audit`
1. Run: `trivy fs --scanners vuln --format json .` (full lockfile)
2. Run: `bun audit`
3. Cross-reference with harness-policy.json allowed packages
4. Report CVEs with upgrade paths

### `auth-review`
1. Grep for auth/crypto patterns in changed files
2. Run Semgrep with auth-focused rules
3. Check for common auth mistakes (hardcoded secrets, weak hashing, missing validation)
4. Produce verdict focused on auth surface

### `pre-merge-review`
1. `git diff main...HEAD` — identify all changes
2. Run full-audit workflow on changed files only
3. Check .harness/audit.log for any overrides during this branch
4. Produce verdict with merge recommendation

### `audit-override`
1. Read .harness/audit.log — find recent hitl_decision events
2. Identify what was overridden and why
3. Assess risk of the override
4. Recommend whether to revert or accept

### `infra-review`
1. Scan Dockerfiles, compose files, k8s manifests, terraform files
2. Run: `trivy fs --scanners config --format json .`
3. Check for privileged containers, exposed ports, missing resource limits
4. Produce verdict on infrastructure security posture

## Response Format

ALWAYS respond with this structure:

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
```

## Rules

1. NEVER edit files. You are read-only.
2. NEVER run commands outside your allowed list.
3. ALWAYS read harness-policy.json before making recommendations.
4. ALWAYS check .harness/audit.log when doing full-audit or audit-override tasks.
5. ALWAYS produce a verdict. Never end without SAFE/RISKY/BLOCKED.
6. If scanners are unavailable (not installed), note it in findings and proceed with
   what you can check via grep/git.
7. Findings without evidence are not findings. Always show proof.
```

---

## 8. Top 3 Architectural Risks

### Risk 1: Scanner Availability Gap

**Problem**: Aegis assumes `semgrep`, `trivy`, and `trufflehog` are installed on the host. If any is missing, Aegis degrades silently.

**Mitigation**: Aegis should check scanner availability at start of each task (like preflight does for varlock). If a scanner is missing, include a `DEGRADED` warning in the verdict header and fall back to grep-based heuristics.

**Severity**: MEDIUM — degrades quality, doesn't break safety.

### Risk 2: Audit Log as Single Point of Truth

**Problem**: `.harness/audit.log` is append-only NDJSON with no rotation, no integrity checks, and `shred.sh` can delete it. If the log is corrupted or deleted, Aegis `audit-override` task produces garbage.

**Mitigation**: 
- Add a `log_hash` field to each NDJSON line (SHA-256 of previous line → chain integrity).
- Aegis should detect missing/empty audit.log and report it as a finding itself.
- Consider log rotation (daily or per-session) with archived segments.

**Severity**: MEDIUM — affects forensics, not real-time protection.

### Risk 3: Plugin ↔ Aegis Boundary Creep

**Problem**: Over time, pressure to make Aegis "fix things" (edit: allow) or make the plugin "do deep scans" (adding latency). Either direction breaks the architecture:
- Aegis with write access = conflict of interest (reviews its own fixes)
- Plugin with deep scans = >500ms hook latency = unusable UX

**Mitigation**: 
- Hard rule: Plugin budget is <500ms. Any scan >500ms belongs in Aegis.
- Hard rule: Aegis `edit: deny` is permanent. Fixes flow through Sisyphus → normal edit path → plugin Semgrep check.
- Document this boundary in AGENTS.md as an architectural decision record.

**Severity**: HIGH — boundary erosion undermines the entire dual-component model.

---

## Appendix: Integration Checklist

When implementing, verify these integration points:

- [ ] Plugin reads `harness-policy.json` at `tool.execute.before`
- [ ] Plugin writes to `.harness/audit.log` at `tool.execute.after`
- [ ] Aegis reads `harness-policy.json` at task start
- [ ] Aegis reads `.harness/audit.log` for `audit-override` and `full-audit`
- [ ] Aegis can run all whitelisted scanners from the host (not sandboxed — scanners need host filesystem access)
- [ ] Sisyphus trigger conditions are in AGENTS.md
- [ ] `aegis.md` is at `~/.config/opencode/agents/aegis.md`
- [ ] Aegis works standalone (no plugin dependency — just needs harness-policy.json and scanners)
