# PLAN: Magnificent AI-Agent Security Harness

**Version:** 1.1.0
**Date:** 2026-04-29
**Derived from:** SPEC.md v1.0.0 + Momus Critique (v1.1.0)
**Scope:** Phase 1 MVP (4 weeks, solo developer)

Every task references the SPEC requirement ID(s) it implements. Tasks are ordered for sequential execution within each workstream — no task should start until its predecessors are complete. Major changes from v1.0.0 are marked with **[v1.1]** for traceability.

---

## Week 0 — Risk Discovery (Pre-MVP, Day-Zero)

**Purpose:** Before Week 1 starts, confirm the 3 highest-risk assumptions that could invalidate the entire hard-gate design. If any of these fail, the spec and plan must be updated before a single line of code is written.

**Exit criteria:** All 3 unknowns resolved. Plan updated with findings.

---

| # | Task | Risk Area | How to Verify | BLOCKS |
|---|------|-----------|---------------|--------|
| W0-01 | Test Varlock fail-open/fail-closed behavior | §15.2 OPEN (HIGH) | Set a known secret in env WITHOUT varlock running; start Claude Code; check if secret appears in any API call | All of Week 1B |
| W0-02 | Verify `varlock scan --staged` flag exists | §14 ASSUMPTION | `varlock --help` or `varlock scan --help` | 1B-04 (preflight script) |
| W0-03 | Verify Claude Code `SessionStart` hook blocks on non-zero exit | §14 ASSUMPTION | Add `exit 1` to a SessionStart hook script; try starting Claude Code | 4D-02 |

---

## Phase 1 — MVP (Weeks 1–4)

### Week 1 — Foundation & Secret Prevention

**Exit criteria:** `harness install` works on a fresh macOS/Linux machine. Pre-flight blocks a real secret in env. Warm sandbox container starts and resets correctly.

**Parallelization:** 1A and 1B can run concurrently. 1C (smoke foundation) starts after 1A is complete.

---

#### Workstream 1A — Repository Scaffold + CLI

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 1A-01 | Create repo structure: `scripts/`, `hooks/`, `.claude/`, `.harness/` (gitignored) | FR-036, FR-037 | | All directories exist; `.harness/` in `.gitignore` |
| 1A-02 | Write `harness` CLI shell wrapper that delegates to `scripts/` + create `harness-policy.json` in the same session | FR-034, FR-038, §11.8 | Spec §9.1, §11.8 | `harness --help` works; `harness-policy.json` validates against schema; all 6 action types present |

**1A-02 note:** `harness-policy.json` is created alongside the CLI since the CLI will eventually read it. Both are lightweight config — combine into one session.

---

#### Workstream 1B — Varlock & Secret Prevention

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 1B-01 | Create `.env.schema` template with `@sensitive` annotations for AWS, Stripe, DB, GitHub, OpenAI, Anthropic fields | FR-004 | | Template has all 6 field types annotated `@sensitive` |
| 1B-02 | Write `harness-preflight.sh` (copy from SPEC verbatim, adapt for machine) | FR-001, FR-002, FR-005, FR-008, FR-009 | Spec §11.1 (full script included) | Script exits 1 when `AWS_SECRET_ACCESS_KEY=fake123` is set; exits 0 on clean env; all 6 checks run in order |
| 1B-03 | Wire `harness install` to write `.env.schema` template and append `.harness/` + `.env` to `.gitignore` | FR-034, FR-037 | | Fresh project: `harness install` creates all required files |

**1B-02 note:** The full `harness-preflight.sh` source is in SPEC.md §11.1. Copy it verbatim and adapt the Docker container name and paths for this machine. Do not rewrite from scratch.

---

#### Workstream 1C — Smoke Test Foundation + CLAUDE.md

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 1C-01 | Create `security-smoke-test.sh` skeleton: T-001 (pre-flight blocks real secret), T-002 (pre-flight passes clean env), T-004 (sandbox sentinel), T-006 (HITL denies non-approve) | FR-039 | Spec §12.1 | Script exits 0 when all 4 tests pass, 1 on any failure; runs in < 5 minutes |
| 1C-02 | Create `CLAUDE.md` at project root with ALL immutable directives: ContextCrush mitigation + Semgrep self-correction instruction | §9.3, §9.4, §11.3, §11.6 | Spec §9.3 | File exists at project root; contains both directives upfront |

**1C-02 note:** SPEC originally had CLAUDE.md in two places (initial creation 1A-04, then Semgrep instruction added in 3A-04). This plan creates the complete CLAUDE.md in Week 1 so no rework is needed in Week 3.

---

### Week 2 — Warm Sandbox

**Exit criteria:** All agent shell commands execute inside `harness-sandbox` container. Container survives session; workspace resets between calls.

**Parallelization:** 2A (Docker scripts) and 2B (hook registration) run concurrently. The base `pre-tool-use.sh` skeleton (2B-01) must be complete before Week 3 workstreams extend it.

---

#### Workstream 2A — Docker Sandbox

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 2A-01 | Write `scripts/sandbox-start.sh`: rootless Docker, seccomp=default, `--network none`, `--read-only`, tmpfs for `/workspace` and `/tmp` | FR-017, FR-018, FR-019 | Spec §11.5 | Container starts; `docker inspect harness-sandbox` shows all 4 security flags |
| 2A-02 | Write `scripts/sandbox-reset.sh`: `docker exec harness-sandbox rm -rf /workspace/*` | FR-017 | | After reset, `/workspace` is empty; container still running |
| 2A-03 | Write `scripts/sandbox-stop.sh`: stop and remove `harness-sandbox` | FR-017 | | `harness stop` cleanly removes container |
| 2A-04 | Write `scripts/sandbox-exec.sh`: wraps `docker exec harness-sandbox bash -c "$CMD"` | FR-016 | | Arbitrary command runs inside container; output returned; workspace reset after each call |
| 2A-05 | Update `harness start` to call `sandbox-start.sh` | FR-034 | | `harness start` brings up warm container |

---

#### Workstream 2B — Sandbox Router Hook

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 2B-01 | Write `hooks/pre-tool-use.sh` skeleton: intercepts `bash` tool calls, rewrites to `sandbox-exec.sh`; registers HIGH-RISK pattern matching from `harness-policy.json` | FR-016, FR-027 | Spec §11.7 | All Claude `bash` calls route through container; `DROP TABLE` patterns trigger HITL call |
| 2B-02 | Register `PreToolUse` hook in `.claude/hooks.json` pointing to `hooks/pre-tool-use.sh` | FR-031 | | Hook fires on every tool call |
| 2B-03 | Add T-004 (sandbox cannot read host sentinel) to smoke test | FR-039, NFR-006 | | Container cannot read `/tmp/harness-canary` on host |

**2B-01 note:** The base `pre-tool-use.sh` is defined here. Week 3 workstreams (3A, 3B) append to this file — not overwrite it. Document this in the file header comment.

---

### Week 3 — Security Scanners

**Exit criteria:** Semgrep catches a seeded secret. Snyk blocks a non-existent package. TruffleHog blocks a seeded credential commit. T-003, T-005, T-009 pass.

**Parallelization:** 3A, 3B, and 3C are independent and run in parallel. Merge order: 3A first (defines PostToolUse block in post-tool-use.sh), then 3B appends to pre-tool-use.sh (package block), then 3C runs independently (different file: .pre-commit-config.yaml).

---

#### Workstream 3A — Semgrep (SAST)

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 3A-01 | Add `semgrep` MCP entry to `.claude/mcp.json` (stdio transport) | FR-011, FR-033 | | `npx @semgrep/mcp` starts without error; config is valid |
| 3A-02 | Write `hooks/post-tool-use.sh` block: invoke `semgrep scan` on every written file; append ERROR findings to `.harness/audit.log` | FR-012, FR-013, NFR-010 | Spec §11.3 (script included) | Writing `api_key = "sk-1234567890abcdef"` triggers a Semgrep ERROR logged to audit.log |
| 3A-03 | Register `PostToolUse` hook in `.claude/hooks.json` | FR-031 | | Hook fires after every write/edit tool call |
| 3A-04 | Add T-005 (Semgrep detects hardcoded API key) to smoke test | FR-039 | | T-005 passes |

---

#### Workstream 3B — Snyk (SCA)

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 3B-01 | Add `snyk` MCP entry to `.claude/mcp.json` (stdio transport) | FR-014, FR-033 | | MCP config validates |
| 3B-02 | Append package-install intercept to `hooks/pre-tool-use.sh`: pattern-match `npm install`, `pip install`, `cargo add`; call `snyk_package_health_check`; block if CVE or not-found | FR-015 | Spec §11.4 | `npm install nonexistent-package-xyz` is blocked with exit 1; real package proceeds |
| 3B-03 | Add T-009 (MCP config stdio only) to smoke test | FR-039, NFR-008 | | T-009 passes |

---

#### Workstream 3C — TruffleHog (Pre-Commit)

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 3C-01 | Create `.pre-commit-config.yaml` with TruffleHog hook entry: `trufflehog git file://. --since-commit HEAD --results=verified --fail --trust-local-git-config` | FR-006 | | File exists with exact command; `git commit` with `AKIA1234567890ABCDEF` staged is blocked |
| 3C-02 | Run `pre-commit install`; verify hook activates | FR-007 | | Hook fires on next `git commit` attempt |
| 3C-03 | Add T-003 (TruffleHog blocks seeded credential) + T-008 (.env.schema has @sensitive annotations) to smoke test | FR-039 | | Both T-003 and T-008 pass |

---

### Week 4 — HITL Gateway, lean-ctx & Final Integration

**Exit criteria:** All 10 smoke tests pass. `harness shred` works. lean-ctx MCP active. HITL gateway fires correctly. Manual end-to-end session succeeds.

---

#### Workstream 4A — HITL Gateway

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 4A-01 | Write `scripts/hitl-gateway.sh` (copy from SPEC verbatim, adapt paths) | FR-026, FR-028, FR-029, FR-030 | Spec §11.7 (full script included) | `echo "deny" | bash hitl-gateway.sh ...` exits 1; `echo "approve" | bash hitl-gateway.sh ...` exits 0; timeout exits 1; all decisions logged to `.harness/audit.log` |
| 4A-02 | Integrate HITL call into `hooks/pre-tool-use.sh` for HIGH-RISK commands | FR-027, FR-031 | | `DROP TABLE users` triggers HITL prompt; `SELECT * FROM sessions` does not |

---

#### Workstream 4B — lean-ctx Context Management

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 4B-01 | Add `lean-ctx` MCP entry to `.claude/mcp.json` with `lean-ctx serve --db .harness/lean-ctx.db` | FR-021, FR-023 | | lean-ctx MCP starts; DB written to `.harness/lean-ctx.db` |
| 4B-02 | Add conflicting-tool check to `harness-preflight.sh`: warn if RTK or context-mode shell hooks are detected | FR-022 | | Pre-flight warns if `rtk` or `context-mode` hook processes are found running |
| 4B-03 | Add T-007 (lean-ctx DB clean of sensitive patterns after session) to smoke test | FR-039 | | T-007 passes after a full Claude Code session |

---

#### Workstream 4C — Session Shredder & Audit Log

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 4C-01 | Write `scripts/shred.sh` (copy from SPEC verbatim) + wire to `harness shred` CLI | FR-024, FR-025, §10.3 | Spec §10.3 | `harness shred` deletes `.harness/lean-ctx.db` and `.harness/audit.log`; `harness shred --audit` scans before deletion |
| 4C-02 | Register `SessionEnd` hook in `.claude/hooks.json`; append session-end event to `.harness/audit.log` | FR-029, NFR-010 | | After session, audit.log contains `{"event":"session_end",...}` entry |
| 4C-03 | Add T-010 (shred removes lean-ctx.db) to smoke test | FR-039 | | T-010 passes |

---

#### Workstream 4D — Final Integration & Verification

| # | Task | Implements | Source | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 4D-01 | Register `SessionStart` hook in `.claude/hooks.json` pointing to `harness-preflight.sh` | FR-032 | | Claude Code session does NOT start if pre-flight exits non-zero |
| 4D-02 | Final `harness install` integration: write all config files (`.claude/hooks.json`, `.claude/mcp.json`, `.claudeignore`, `.pre-commit-config.yaml`, `harness-policy.json`, `CLAUDE.md`) in one command | FR-034 | | `harness install` on a blank project creates all files; `harness start` runs clean |
| 4D-03 | Run full `security-smoke-test.sh`; fix any failures | FR-039 | | All 10 tests pass; runtime < 5 minutes |
| 4D-04 | Manual end-to-end test: full Claude Code session with harness active, covering all 4 user journeys from SPEC §4 | All P0 FRs | | Journeys A1 (normal coding), A2 (HITL deny), A3 (Semgrep self-correct), A4 (Snyk package block) all complete without harness friction |

---

## Phase 2 — Hardening (Weeks 5–8)

| Task | Implements | Notes |
|------|-----------|-------|
| TruffleHog CI integration | FR-010 | GitHub Actions YAML |
| E2B sandbox backend | FR-020 | `HARNESS_SANDBOX=e2b` env var path |
| `harness status` command | FR-035 | Health table for all components |
| Write `README.md` with quickstart | — | Moved from Phase 1 (not exit criterion) |
| Windows support investigation | §3 NG-5 | WSL2 path; may become Phase 3 |
| Resolve all OPEN risks from SPEC §15.2 | §15.2 | Varlock fail-open, Varlock-MCP interaction |

---

## Phase 3 — Benchmarks & Portability (Future)

| Task | Implements | Notes |
|------|-----------|-------|
| CyberSecEval 4 integration | §12.3 | Significant compute required |
| AgentBench regression check | §12.3 | Agent utility under harness constraints |
| OpenCode adapter | §16.1 | MCP-only path; 1–2 weeks |
| Pi.dev adapter | §16.2 | TypeScript extensions; 2–3 weeks |
| Encryption at rest for `.harness/lean-ctx.db` | §16 | SQLCipher or equivalent |

---

## Task Summary

| Phase | Workstream | Tasks | Week |
|-------|-----------|-------|------|
| 0 | Risk Discovery | 3 | Pre-MVP |
| 1 | 1A Scaffold | 2 | 1 |
| 1 | 1B Varlock | 3 | 1 |
| 1 | 1C Smoke + CLAUDE.md | 2 | 1 |
| 1 | 2A Docker Sandbox | 5 | 2 |
| 1 | 2B Sandbox Router | 3 | 2 |
| 1 | 3A Semgrep | 4 | 3 |
| 1 | 3B Snyk | 3 | 3 |
| 1 | 3C TruffleHog | 3 | 3 |
| 1 | 4A HITL Gateway | 2 | 4 |
| 1 | 4B lean-ctx | 3 | 4 |
| 1 | 4C Shredder | 3 | 4 |
| 1 | 4D Integration | 4 | 4 |
| **Total Phase 1** | | **40 tasks** | **4 weeks** |

*vs v1.0.0: 52 → 40 tasks (-12). Week 1: 12 → 8 tasks. README moved to Phase 2.*

---

## What Changed from v1.0.0

| Change | Reason |
|--------|--------|
| **Week 0 added** (W0-01, W0-02, W0-03) | Varlock fail-open and SessionStart assumptions were flagged as BLOCKING — verify before coding, not during |
| **1A-02 + 1A-05 merged** | Both are lightweight config; same session |
| **1A-04 (CLAUDE.md) removed as separate task** | Moved to 1C-02 (complete CLAUDE.md with all directives upfront, not incremental) |
| **1B-01 removed** | "Verify varlock scan --staged" is redundant with running the preflight script — 1B-04 will fail if the flag doesn't exist |
| **1B-02 (preflight script) flagged "copy from SPEC"** | Full source is in SPEC §11.1 — executor should copy, not rewrite |
| **2A-06 removed** | Docker daemon check already in preflight as check #5 (1B-04) |
| **3C-05 removed** | T-008 merged into 3C-03 alongside T-003 |
| **3A-04 removed** (Semgrep CLAUDE.md instruction) | CLAUDE.md is complete from 1C-02 — no incremental update needed |
| **4B-01 removed** (lean-ctx flag check) | Merged into 4B-01's acceptance criteria |
| **4D-05 (README) moved to Phase 2** | Documentation is not an MVP exit criterion |
| **Week 3 parallelization noted explicitly** | 3A, 3B, 3C can run concurrently; merge order: 3A → 3B → 3C |

---

*End of PLAN.md — Version 1.1.0*
*All tasks trace to SPEC.md requirement IDs. No task is orphaned.*
*Phase 1 exit: All 10 smoke tests pass + successful end-to-end session (4D-04).*
