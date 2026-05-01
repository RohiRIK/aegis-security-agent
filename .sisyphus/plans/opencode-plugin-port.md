# OpenCode Plugin Port — Security Harness

## TL;DR

> **Quick Summary**: Port the Claude Code security harness to an OpenCode plugin by extracting shared pure business logic into `src/core/security.ts`, then building a thin OpenCode plugin adapter in `src/opencode/` that registers 4 named hook handlers (`tool.execute.before`, `tool.execute.after`, `shell.env`, `permission.ask`) plus one generic `event` hook handler (for `session.created` events) using throw-to-block and output mutation patterns. NOTE: `session.created` is NOT a named hook key in the `@opencode-ai/plugin` SDK — it is an event type received via the generic `event` hook (`event.type === "session.created"`).
>
> **Deliverables**:
> - `src/core/security.ts` — 6 shared pure functions extracted from existing hooks
> - `src/core/security.test.ts` — Unit tests for all 6 core functions
> - `src/opencode/index.ts` — Plugin entry point with hook registration
> - `src/opencode/handlers/before.ts` — Sandbox routing, file deny list, HIGH-RISK blocking, Trivy scan
> - `src/opencode/handlers/after.ts` — Semgrep post-write scan with self-correction injection
> - `src/opencode/handlers/session.ts` — Preflight soft gate (7 checks + `preflightPassed` flag)
> - `src/opencode/handlers/env.ts` — Sensitive env var stripping
> - `src/opencode/handlers/permission.ts` — Native dialog for HIGH-RISK matches
> - `src/opencode-smoke-test.ts` — 8+ smoke tests for all OpenCode hooks
> - `docs/OPENCODE-PORT.md` — Security regression table, ADRs, trade-offs
> - Updated `src/install.ts` — `--opencode` flag support
>
> **Estimated Effort**: Medium (~18-24 hours solo dev)
> **Parallel Execution**: YES — 5 waves, peak 5 concurrent tasks in Wave 3
> **Critical Path**: P0-01 → P1-01 → P1-02 → P1-07 → P2-02

---

## Context

### Original Request

Port the existing Claude Code security harness (stdin/stdout hook protocol) to an OpenCode plugin using the `@opencode-ai/plugin` SDK callback API, preserving all security guarantees with documented regressions where parity is impossible.

### Interview Summary

**Key Decisions** (from Metis):
1. **Separate plugin** in `src/opencode/` + `.opencode/plugins/harness-security/` symlink — zero risk to working Claude Code harness
2. **Throw-to-block** for hard blocks; `permission.ask` for soft HITL (native dialog, no custom terminal UI)
3. **Soft preflight gate** — generic `event` hook filters for `event.type === "session.created"`, runs 7 checks, sets `preflightPassed` flag; `tool.execute.before` blocks ALL tools until flag is `true`
4. **Extract pure functions first** — shared by both runtimes, no abstract interface for v1
5. **Do NOT modify** `src/hooks/`, `src/cli.ts`, `src/preflight.ts`, `.claude/hooks.json`
6. **Do NOT port** the CLI commands (`start`/`help` unnecessary; `stop`/`shred` already work independently)

**Research Findings**:
- OpenCode hook API: `tool.execute.before` can throw to block AND mutate `output.args` for sandbox routing
- `permission.ask` sets native dialog but has NO timeout, NO custom UI, NO audit trail in the dialog itself
- `shell.env` hook can strip vars from `output.env` before every shell command
- `session.created` is fire-and-forget (cannot block) — handled via generic `event` hook with `if (input.event.type !== "session.created") return` guard; hence the soft-gate pattern via `tool.execute.before`
- `Bun.$` shell available via `PluginInput` for subprocess spawning (Trivy, Semgrep)
- `directory` from `PluginInput` = project cwd
- In-process crash propagation is a real risk — ALL handlers need try/catch fail-closed

### Metis Review

**MUST DOs** (addressed in plan):
- Extract pure functions FIRST (P0-01)
- File-pattern deny list in `tool.execute.before` (P1-02)
- `shell.env` hook for sensitive var stripping (P1-05)
- Preserve 10/10 existing smoke tests — zero regression (gate on every commit)
- New smoke test file with 8+ tests (P2-02)

**MUST NOT DOs** (enforced as guardrails):
- Do NOT modify `src/hooks/`, `src/cli.ts`, `src/preflight.ts`, `.claude/hooks.json`
- Do NOT add `@opencode-ai/plugin` as production dependency (devDependencies only)
- Do NOT implement custom OpenCode tools in v1
- Do NOT port CLI commands (`start`/`help`)

**AI Failure Points** (guarded by acceptance criteria):
1. Mechanical stdin/stdout → callback translation → each handler tests the callback API directly
2. HITL parity illusion → regression register documents every gap explicitly
3. Over-scoping CLI port → scope locked to 5 hooks + install flag only

---

## Work Objectives

### Core Objective

Deliver a working OpenCode plugin that enforces the same security policies as the Claude Code harness (sandbox routing, HIGH-RISK blocking, file deny list, Trivy scanning, Semgrep scanning, env stripping, preflight gating) with all regressions documented and accepted.

### Concrete Deliverables

| File | Purpose |
|------|---------|
| `src/core/security.ts` | 6 shared pure/async functions |
| `src/core/security.test.ts` | Unit tests for all 6 functions |
| `src/opencode/index.ts` | Plugin entry, policy loader, hook registration |
| `src/opencode/handlers/before.ts` | `tool.execute.before` handler |
| `src/opencode/handlers/after.ts` | `tool.execute.after` handler |
| `src/opencode/handlers/session.ts` | `event` hook — `session.created` event type handler |
| `src/opencode/handlers/env.ts` | `shell.env` handler |
| `src/opencode/handlers/permission.ts` | `permission.ask` handler |
| `src/opencode-smoke-test.ts` | 8+ OpenCode-specific smoke tests |
| `src/install.ts` | Updated with `--opencode` flag |
| `docs/OPENCODE-PORT.md` | Regression table, ADRs, UX trade-offs |

### Definition of Done

- [ ] `bun test src/core/security.test.ts` — all tests pass
- [ ] `bun run src/smoke-test.ts` — 10/10 existing tests pass (zero regression)
- [ ] `bun test src/opencode-smoke-test.ts` — 8+ new tests pass
- [ ] `bun tsc --noEmit` — zero type errors across entire project
- [ ] No modifications to `src/hooks/`, `src/cli.ts`, `src/preflight.ts`, `.claude/hooks.json`
- [ ] `@opencode-ai/plugin` appears in `devDependencies` only, not `dependencies`
- [ ] `docs/OPENCODE-PORT.md` exists with regression table

### Must Have

- Sandbox routing via `output.args.command` mutation in `tool.execute.before`
- File deny list (`.env`, `*.pem`, `*.key`, `*_rsa`) — throw to block `read`/`write`/`edit`
- HIGH-RISK pattern matching — throw to block `bash` commands
- Trivy scanning on install commands — throw to block if HIGH/CRITICAL CVEs found
- Semgrep scanning on write/edit — findings appended to `output.output` for self-correction
- Sensitive env var stripping via `shell.env` hook
- Preflight soft gate via generic `event` hook (`session.created` event type) + `tool.execute.before` blocker
- `permission.ask` for HIGH-RISK patterns (native dialog)
- Fail-closed error boundaries on ALL handlers
- 8+ new smoke tests specific to OpenCode plugin

### Must NOT Have (Guardrails)

- No modifications to `src/hooks/`, `src/cli.ts`, `src/preflight.ts`, `.claude/hooks.json`
- No `@opencode-ai/plugin` in production `dependencies`
- No custom OpenCode tools in v1
- No CLI command porting (`start`/`help` — unnecessary)
- No abstract interface/base class for hook adapters (v1 = direct implementation)
- No custom terminal UI for HITL (use native `permission.ask` dialog)
- No `console.log` in committed code (use structured audit logging)

---

## Security Regression Register

| # | Gap | Severity | Claude Code Behavior | OpenCode Behavior | Mitigation | Acceptance Criteria |
|---|-----|----------|---------------------|-------------------|------------|---------------------|
| 0 | `chore(deps): add @opencode-ai/plugin as devDependency` | P0-00 | `bun tsc --noEmit` | `package.json`, `bun.lock` |
| R1 | No custom HITL terminal UI and no approve path for HIGH-RISK | Medium | Custom terminal box with approve/deny prompt, command details, risk reason; user can approve and command runs | Native OpenCode permission dialog — no custom formatting; dialog is notification-only, `tool.execute.before` ALWAYS hard-blocks HIGH-RISK commands unconditionally regardless of dialog outcome — there is NO approve path | `permission.ask` triggers native dialog as UX notification; `tool.execute.before` always throws for HIGH-RISK — these two handlers have different roles: notify vs block | `bun test` verifies `permission.ask` sets `output.status = "ask"` for HIGH-RISK match AND `tool.execute.before` throws unconditionally for HIGH-RISK even when `output.status = "ask"` was set |
| R2 | No HITL timeout/auto-deny | Medium | Auto-deny after `hitl_timeout_seconds` (default 120s) | Native dialog has no timeout — user must click | Document in `docs/OPENCODE-PORT.md`; fail-closed if dialog process errors | Regression documented in `docs/OPENCODE-PORT.md` with exact gap description |
| R3 | No `.claudeignore` equivalent | High | `.claudeignore` blocks read of `.env`, `*.pem`, etc. at Claude Code level | No built-in ignore; must replicate via `tool.execute.before` throw | `tool.execute.before` checks file paths against deny patterns and throws to block | Test: `before` handler throws for `read` of `.env`, `*.pem`, `*.key`, `*_rsa` |
| R4 | Preflight is soft gate | Medium | `preflight.ts` runs as blocking subprocess before Claude Code launches | `session.created` is fire-and-forget event (consumed via generic `event` hook, not a named hook); cannot block session start | `tool.execute.before` blocks ALL tools until `preflightPassed` promise resolves to `true` | Test: tool call before preflight completes → blocked; after → allowed |
| R5 | Preflight race condition | Low | Sequential subprocess — no race | Async `session.created` event handler + concurrent `tool.execute.before` calls | Promise-based async mutex; `preflightPassed` is a shared `Promise<boolean>` resolved once | Test: concurrent `before` handler calls during preflight → all wait, all get same result |
| R6 | In-process crash propagation | High | Separate process per hook — crash is isolated | In-process handlers — unhandled throw crashes entire plugin | try/catch fail-closed in EVERY handler; error → block tool (throw) | Test: handler that throws unexpected error → tool is still blocked (not allowed through) |
| R7 | No audit trail in permission dialog | Low | HITL gateway writes to `.harness/audit.log` with decision, user, timestamp | Native dialog has no callback for logging | Log audit event from `tool.execute.before` (pre-dialog) + `permission.ask` handler | Audit log entry written for every HIGH-RISK match regardless of dialog outcome |
| R8 | No sandbox for non-bash tools | Low | Only bash commands sandboxed (same) | Same limitation | Out of scope for v1; documented | Documented in `docs/OPENCODE-PORT.md` |

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES — `bun test` available (Bun built-in test runner)
- **Automated tests**: TDD — RED → GREEN → REFACTOR for core functions and smoke tests
- **Framework**: `bun test` (already used in project via `bun:test` imports)
- **Each task**: RED (write failing test) → GREEN (minimal implementation) → REFACTOR (clean up) → GATE (`bun tsc --noEmit && bun test && bun run src/smoke-test.ts`) → COMMIT

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{ID}-{scenario-slug}.{ext}`.

- **Unit tests**: `bun test {file}` — assert pass count, zero failures
- **Smoke tests**: `bun run src/smoke-test.ts` — assert 10/10 pass (regression gate)
- **Type checks**: `bun tsc --noEmit` — assert zero errors
- **File existence**: `test -f {path}` — assert file exists
- **File content**: `grep -c {pattern} {file}` — assert pattern present
- **No-modification guard**: `git diff --name-only src/hooks/ src/cli.ts src/preflight.ts .claude/hooks.json` — assert empty output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — foundation):
└── P0-01: Extract src/core/security.ts — 6 pure functions [deep]

Wave 2 (After Wave 1 — test + scaffold, PARALLEL):
├── P0-02: Unit tests for all 6 core functions [deep]
└── P1-01: Scaffold plugin entry + policy loader [quick]

Wave 3 (After Wave 2 — 5 handlers, MAX PARALLEL):
├── P1-02: tool.execute.before handler [deep]
├── P1-03: tool.execute.after handler [unspecified-high]
├── P1-04: event hook / session.created preflight soft gate [unspecified-high]
├── P1-05: shell.env handler [quick]
└── P1-06: permission.ask handler [quick]

Wave 4 (After Wave 3 — error boundary + install, PARALLEL):
├── P1-07: Fail-closed error boundaries on all handlers [unspecified-high]
└── P2-01: harness install --opencode flag [quick]

Wave 5 (After Wave 4 — tests + docs, PARALLEL):
├── P2-02: OpenCode smoke tests (8+ tests) [deep]
└── P2-03: docs/OPENCODE-PORT.md [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — run all test suites (unspecified-high)
└── F4: Scope fidelity check — no forbidden file modifications (deep)
→ Present results → Get explicit user okay

Critical Path: P0-01 → P0-02 → P1-01 → P1-02 → P1-07 → P2-02 → F1-F4 → user okay
Parallel Speedup: ~55% faster than sequential execution
Max Concurrent: 5 (Wave 3)
```

### Task Dependency Graph

| Task | Depends On | Blocks | Reason |
|------|------------|--------|--------|
| P0-00 | None | P0-01 | Adds required OpenCode plugin dependency before the rest of the plan |
| P0-01 | P0-00 | P0-02, P1-01 | Foundation — extracts shared functions all handlers import |
| P0-02 | P0-01 | P1-02 | Tests verify core functions before handlers depend on them |
| P1-01 | P0-01 | P1-02, P1-03, P1-04, P1-05, P1-06 | Scaffold provides plugin entry + registration structure handlers plug into |
| P1-02 | P0-02, P1-01 | P1-07 | Largest handler — needs tested core functions + scaffold |
| P1-03 | P1-01 | P1-07 | Needs scaffold; independent of before handler |
| P1-04 | P1-01 | P1-07 | Needs scaffold; exports `preflightPromise` consumed by P1-02's handler |
| P1-05 | P1-01 | P1-07 | Needs scaffold; fully independent handler |
| P1-06 | P1-01 | P1-07 | Needs scaffold; fully independent handler |
| P1-07 | P1-02, P1-03, P1-04, P1-05, P1-06 | P2-02 | Wraps ALL handlers — must be last hook task |
| P2-01 | P1-01 | P2-02 | Needs plugin path for symlink; independent of handler content |
| P2-02 | P1-07, P2-01 | F1-F4 | Tests all hooks — needs error boundaries + install in place |
| P2-03 | P1-07 | F1-F4 | Documents all regressions — needs final handler behavior |

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| P0-00 | — | P0-01 | 1 |
| P0-01 | P0-00 | P0-02, P1-01 | 1 |
| P0-02 | P0-01 | P1-02 | 2 |
| P1-01 | P0-01 | P1-02..P1-06, P2-01 | 2 |
| P1-02 | P0-02, P1-01 | P1-07 | 3 |
| P1-03 | P1-01 | P1-07 | 3 |
| P1-04 | P1-01 | P1-07 | 3 |
| P1-05 | P1-01 | P1-07 | 3 |
| P1-06 | P1-01 | P1-07 | 3 |
| P1-07 | P1-02..P1-06 | P2-02, P2-03 | 4 |
| P2-01 | P1-01 | P2-02 | 4 |
| P2-02 | P1-07, P2-01 | F1-F4 | 5 |
| P2-03 | P1-07 | F1-F4 | 5 |

### Agent Dispatch Summary

| Wave | Tasks | Agents |
|------|-------|--------|
| 1 | 1 | P0-01 → `deep` |
| 2 | 2 | P0-02 → `deep`, P1-01 → `quick` |
| 3 | 5 | P1-02 → `deep`, P1-03 → `unspecified-high`, P1-04 → `unspecified-high`, P1-05 → `quick`, P1-06 → `quick` |
| 4 | 2 | P1-07 → `unspecified-high`, P2-01 → `quick` |
| 5 | 2 | P2-02 → `deep`, P2-03 → `writing` |
| FINAL | 4 | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

### Effort Estimate

| Phase | Tasks | Estimated Hours (Solo Dev) |
|-------|-------|---------------------------|
| Phase 0: Core Extraction | P0-01, P0-02 | 3-4h |
| Phase 1: Plugin Hooks | P1-01 through P1-07 | 10-14h |
| Phase 2: Integration | P2-01 through P2-03 | 4-6h |
| Final Verification | F1-F4 | 1-2h |
| **Total** | **13 tasks + 4 reviews** | **18-26h** |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task has: Recommended Agent Profile + Parallelization + QA Scenarios.
> TDD per task: RED → GREEN → REFACTOR → GATE → COMMIT.

- [ ] P0-00. Add `@opencode-ai/plugin` to devDependencies (`package.json`)

  **What to do**:
  1. Run: `bun add -d @opencode-ai/plugin`
  2. Verify `package.json` shows `@opencode-ai/plugin` under `devDependencies`
  3. Ensure `semgrep` is installed as a hard prerequisite (required for OC-06 smoke test — NOT optional):
     - Run: `command -v semgrep` — if exit code non-zero, install via `pip install semgrep` (requires Python/pip) or `brew install semgrep` on macOS
     - Run: `semgrep --version` — assert exit code 0 and version printed
     - This is a one-time environment setup step. The smoke suite OC-06 will fail without semgrep present.

  **Must NOT do**:
  - Do NOT add to `dependencies` (production) — devDependencies only

  **Recommended Agent Profile**: `quick` + `CodingStandards`

  **Parallelization**: Wave 1 (solo, before P0-01). Blocks P0-01.

  **Acceptance Criteria**:
  - [ ] `grep -A20 '"devDependencies"' package.json` contains `@opencode-ai/plugin`
  - [ ] `grep '"dependencies"' package.json` does NOT contain `@opencode-ai/plugin` in production block
  - [ ] `semgrep --version` exits 0 (hard prerequisite for OC-06)

  **QA Scenarios**:
  ```
  Scenario: devDependency added
    Tool: Bash
    Steps:
      1. Run: grep "@opencode-ai/plugin" package.json
      2. Assert: line contains "devDependencies" context (not under "dependencies")
    Expected Result: package present in devDependencies
    Evidence: .sisyphus/evidence/task-P0-00-dep.txt

  Scenario: semgrep available
    Tool: Bash
    Steps:
      1. Run: semgrep --version
      2. Assert: exit code 0 and version string printed
    Expected Result: semgrep binary available — required for OC-06
    Failure Indicators: "command not found" — install via pip or brew before proceeding
    Evidence: .sisyphus/evidence/task-P0-00-semgrep.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): add @opencode-ai/plugin as devDependency`
  - Files: `package.json`, `bun.lock`
  - Pre-commit: `bun tsc --noEmit`

---

- [ ] P0-01. Extract `src/core/security.ts` — 6 shared pure functions

  **What to do**:
  1. Create `src/core/security.ts` with these 6 exported functions extracted from existing code:
     - `matchHighRiskPattern(command: string, patterns: string[]): string | null` — extracted from `src/hooks/pre-tool-use.ts:136` inline logic. Returns the first matched pattern or `null`.
     - `parseInstallCommand(cmd: string): ParsedInstall | null` — copy verbatim from `src/hooks/pre-tool-use.ts:36-50`. Parses npm/pip/cargo/go install commands.
     - `makeLockfileContent(pkg: ParsedInstall): { filename: string; content: string }` — copy verbatim from `src/hooks/pre-tool-use.ts:52-83`. Generates lockfile stubs for Trivy scanning.
     - `trivyScan(pkg: ParsedInstall): Promise<{ blocked: boolean; reason: string }>` — extracted from `src/hooks/pre-tool-use.ts:85-118`. Must NOT depend on `runCommandCapture` from `lib/base.ts` — use `Bun.spawn` directly to remain portable.
     - `semgrepScan(filePath: string): Promise<SemgrepFinding[]>` — extracted from `src/hooks/post-tool-use.ts:45-77`. Returns structured findings array instead of writing to stdout.
     - `checkSensitiveFile(filePath: string, denyPatterns: string[]): boolean` — NEW function. Matches file path against deny patterns from `harness-policy.json` `actions.read_file.deny_patterns` (`.env`, `**/*.pem`, `**/*.key`, `**/*_rsa`). Uses glob-style matching.
     - `stripSensitiveEnv(env: Record<string, string>, sensitiveVars: string[]): Record<string, string>` — NEW function. Returns a copy of `env` with all keys in `sensitiveVars` removed. Sensitive vars list from `src/preflight.ts:8-20`.
  2. Export all types: `PackageEcosystem`, `ParsedInstall`, `SemgrepFinding`, `SemgrepResult`
  3. Do NOT import from `src/lib/base.ts` — use `Bun.spawn` and `Bun.file` directly for portability
  4. Do NOT modify any existing files — this is a new file only

  **Must NOT do**:
  - Do NOT modify `src/hooks/pre-tool-use.ts` or `src/hooks/post-tool-use.ts` — they keep their inline copies
  - Do NOT create an abstract interface or base class
  - Do NOT import from `src/lib/base.ts` — core must be self-contained
  - Do NOT add any `console.log` statements

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Careful extraction of logic from multiple source files with behavior preservation — needs thorough understanding of existing code
  - **Skills**: [`CodingStandards`, `SecurityReview`]
    - `CodingStandards`: TypeScript coding standards, proper exports, Bun-native patterns
    - `SecurityReview`: Reviewing security-critical functions for correctness during extraction
  - **Skills Evaluated but Omitted**:
    - `BackendDesign`: No API/DB design involved — pure function extraction
    - `TddWorkflow`: Tests are separate task P0-02
    - `FrontendDesign`: No UI involved

  **Parallelization**:
  - **Can Run In Parallel**: NO — foundation task
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: P0-02, P1-01
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to extract from):
  - `src/hooks/pre-tool-use.ts:36-50` — `parseInstallCommand()` function — copy this regex-based parser verbatim
  - `src/hooks/pre-tool-use.ts:52-83` — `makeLockfileContent()` function — copy this lockfile stub generator verbatim
  - `src/hooks/pre-tool-use.ts:85-118` — `trivyScan()` function — extract this but replace `runCommandCapture` with `Bun.spawn`
  - `src/hooks/pre-tool-use.ts:136` — inline high-risk pattern matching logic — extract into `matchHighRiskPattern()` function
  - `src/hooks/pre-tool-use.ts:23-34` — type definitions `HarnessPolicy`, `PackageEcosystem`, `ParsedInstall` — move to core
  - `src/hooks/post-tool-use.ts:17-30` — `SemgrepResult` and `SemgrepPayload` types — adapt for `SemgrepFinding` return type
  - `src/hooks/post-tool-use.ts:45-77` — Semgrep scanning logic — extract into `semgrepScan()` returning findings array
  - `src/preflight.ts:8-20` — `SENSITIVE_VARS` array — use as default list for `stripSensitiveEnv()`
  - `.claudeignore:1-9` — deny patterns for files — use as reference for `checkSensitiveFile()` glob matching

  **API/Type References**:
  - `harness-policy.json:7` — `deny_patterns: [".env", "**/*.pem", "**/*.key", "**/*_rsa"]` — patterns for `checkSensitiveFile()`
  - `harness-policy.json:31-35` — `high_risk_patterns` array — input for `matchHighRiskPattern()`

  **Acceptance Criteria**:

  - [ ] File `src/core/security.ts` exists
  - [ ] Exports 6 functions: `matchHighRiskPattern`, `parseInstallCommand`, `makeLockfileContent`, `trivyScan`, `semgrepScan`, `checkSensitiveFile`, `stripSensitiveEnv`
  - [ ] Exports 4 types: `PackageEcosystem`, `ParsedInstall`, `SemgrepFinding`, `SemgrepResult`
  - [ ] `bun tsc --noEmit` passes with zero errors
  - [ ] `bun run src/smoke-test.ts` still passes 10/10 (zero regression)
  - [ ] `git diff --name-only src/hooks/` returns empty (no modifications to existing hooks)
  - [ ] No imports from `src/lib/base.ts` in `src/core/security.ts` (grep returns 0 matches)

  **TDD Workflow**: N/A for this task (extraction only — tests in P0-02)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Core module compiles and exports all functions
    Tool: Bash
    Preconditions: P0-01 implementation complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun -e "import * as s from './src/core/security.ts'; console.log(Object.keys(s).sort().join(','))"
      3. Assert output contains: checkSensitiveFile,makeLockfileContent,matchHighRiskPattern,parseInstallCommand,semgrepScan,stripSensitiveEnv,trivyScan
    Expected Result: All 7 functions (including makeLockfileContent) exported, zero type errors
    Failure Indicators: TypeScript errors, missing exports, import errors
    Evidence: .sisyphus/evidence/task-P0-01-exports.txt

  Scenario: No regression in existing smoke tests
    Tool: Bash
    Preconditions: P0-01 implementation complete
    Steps:
      1. Run: bun run src/smoke-test.ts
      2. Assert output contains: "10 passed, 0 failed" or "SMOKE TEST PASSED"
    Expected Result: All 10 existing tests pass
    Failure Indicators: Any test failure, exit code != 0
    Evidence: .sisyphus/evidence/task-P0-01-regression.txt

  Scenario: Core module has no imports from lib/base.ts
    Tool: Bash
    Preconditions: P0-01 implementation complete
    Steps:
      1. Run: grep -c "lib/base" src/core/security.ts || echo "0"
      2. Assert output is "0"
    Expected Result: Zero imports from lib/base.ts
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-P0-01-no-base-import.txt
  ```

  **Commit**: YES
  - Message: `feat(core): extract pure security functions to src/core/security.ts`
  - Files: `src/core/security.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

- [ ] P0-02. Write unit tests for all core functions (`src/core/security.test.ts`)

  **What to do**:
  1. Create `src/core/security.test.ts` using `bun:test` framework
  2. Write TDD-style tests for ALL 7 exported functions (RED first, then verify GREEN after P0-01):
     - `matchHighRiskPattern`:
       - Returns matched pattern string for `"rm -rf /"` against `["rm -rf"]` → `"rm -rf"`
       - Returns `null` for `"ls -la"` against `["rm -rf", "DROP TABLE"]` → `null`
       - Case-insensitive: `"drop table users"` matches `"DROP TABLE"` → `"DROP TABLE"`
       - Empty patterns array → `null`
       - Empty command → `null`
     - `parseInstallCommand`:
       - Parses `"npm install express"` → `{ ecosystem: "npm", packageName: "express", packageVersion: "latest" }`
       - Parses `"npm i @types/node@18.0.0"` → `{ ecosystem: "npm", packageName: "@types/node", packageVersion: "18.0.0" }`
       - Parses `"pip install requests==2.31.0"` → `{ ecosystem: "pip", packageName: "requests", packageVersion: "2.31.0" }`
       - Parses `"cargo add serde@1.0"` → `{ ecosystem: "cargo", packageName: "serde", packageVersion: "1.0" }`
       - Parses `"go get github.com/gin-gonic/gin@v1.9.0"` → `{ ecosystem: "go", ... }`
       - Returns `null` for `"echo hello"` (not an install command)
     - `checkSensitiveFile`:
       - Returns `true` for `".env"` against `[".env", "**/*.pem"]`
       - Returns `true` for `"certs/server.pem"` against `["**/*.pem"]`
       - Returns `true` for `"ssh/id_rsa"` against `["**/*_rsa"]`
       - Returns `false` for `"src/index.ts"` against all deny patterns
       - Returns `false` for `".env.schema"` (must NOT match `.env` pattern if using exact match)
     - `stripSensitiveEnv`:
       - Strips `AWS_SECRET_ACCESS_KEY` from env → key absent in result
       - Preserves non-sensitive vars like `HOME`, `PATH`
       - Returns empty object for empty input
       - Does not mutate original env object
     - `trivyScan`: Test with mock — verify it returns `{ blocked: false, reason: "trivy not installed — scan skipped" }` when trivy is not available
     - `semgrepScan`: Test with mock — verify it returns empty array when semgrep is not available
     - `makeLockfileContent`: Test npm ecosystem → returns `package-lock.json` filename with correct structure
  3. Each test group in a `describe()` block with descriptive names
  4. Minimum 20 test cases total across all functions

  **Must NOT do**:
  - Do NOT test against live external services (Trivy, Semgrep)
  - Do NOT create temporary files on disk for pure function tests
  - Do NOT modify any existing files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Comprehensive test coverage with edge cases requires thorough analysis of each function's behavior
  - **Skills**: [`CodingStandards`, `Test`, `TddWorkflow`]
    - `CodingStandards`: TypeScript test file conventions, bun:test patterns
    - `Test`: TDD RED-GREEN-REFACTOR methodology
    - `TddWorkflow`: Structured test-first development orchestration
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: Tests don't introduce security concerns — testing existing security logic
    - `BackendDesign`: No API/DB involved

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P1-01
  - **Parallel Group**: Wave 2 (with P1-01)
  - **Blocks**: P1-02 (handler needs tested core)
  - **Blocked By**: P0-01

  **References** (CRITICAL):

  **Pattern References**:
  - `src/core/security.ts` — (created in P0-01) all function signatures and types to test against
  - `src/hooks/pre-tool-use.ts:36-50` — `parseInstallCommand` original — verify test cases match all regex branches
  - `src/hooks/pre-tool-use.ts:136` — `highRiskPatterns.find((pattern) => new RegExp(pattern, "i").test(bashCommand))` — verify case-insensitive regex matching
  - `harness-policy.json:7` — deny patterns for `checkSensitiveFile` test data
  - `harness-policy.json:31-35` — high-risk patterns for `matchHighRiskPattern` test data
  - `.claudeignore:1-9` — file deny patterns for `checkSensitiveFile` test data
  - `src/preflight.ts:8-20` — `SENSITIVE_VARS` list for `stripSensitiveEnv` test data

  **Test References**:
  - `src/smoke-test.ts` — existing test structure and naming conventions (though uses custom runner, not bun:test)

  **Acceptance Criteria**:

  - [ ] File `src/core/security.test.ts` exists
  - [ ] `bun test src/core/security.test.ts` passes — all tests green
  - [ ] Minimum 20 test cases (count `test(` or `it(` occurrences ≥ 20)
  - [ ] All 7 exported functions have at least 2 test cases each
  - [ ] `bun tsc --noEmit` passes
  - [ ] `bun run src/smoke-test.ts` still passes 10/10

  **TDD Workflow**:
  - **RED**: Write all test cases — they should pass since P0-01 is already done (Wave 2 runs after Wave 1)
  - **GREEN**: If any test fails, it reveals a bug in P0-01 extraction — fix in core, re-run
  - **REFACTOR**: Clean up test descriptions, remove duplicates, add edge cases
  - **GATE**: `bun tsc --noEmit && bun test src/core/security.test.ts && bun run src/smoke-test.ts`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All core function tests pass
    Tool: Bash
    Preconditions: P0-01 complete, P0-02 test file written
    Steps:
      1. Run: bun test src/core/security.test.ts
      2. Assert output contains: "pass" for all test cases
      3. Assert exit code: 0
    Expected Result: 20+ tests pass, 0 failures
    Failure Indicators: Any test failure, "FAIL" in output, exit code != 0
    Evidence: .sisyphus/evidence/task-P0-02-tests.txt

  Scenario: Minimum test count met
    Tool: Bash
    Preconditions: P0-02 test file written
    Steps:
      1. Run: grep -c "test(\|it(" src/core/security.test.ts
      2. Assert output >= 20
    Expected Result: At least 20 test cases defined
    Failure Indicators: Count < 20
    Evidence: .sisyphus/evidence/task-P0-02-count.txt
  ```

  **Commit**: YES
  - Message: `test(core): add unit tests for all core security functions`
  - Files: `src/core/security.test.ts`
  - Pre-commit: `bun tsc --noEmit && bun test src/core/security.test.ts`

---

- [ ] P1-01. Scaffold plugin entry point with policy loader and hook stubs (`src/opencode/index.ts`)

  **What to do**:
  1. Create directory structure: `src/opencode/` and `src/opencode/handlers/`
  2. Create `src/opencode/index.ts` exporting `HarnessSecurityPlugin` as a named export AND default export
  3. The plugin function signature: `async ({ $, directory, worktree }) => { ... }` matching `@opencode-ai/plugin` `Plugin` type
  4. Inside the plugin closure:
     - Load policy: `const policy = JSON.parse(await Bun.file(join(directory, "harness-policy.json")).text()) as HarnessPolicy`
     - Declare shared state: `let preflightPassed = false`, `let preflightPromise: Promise<void> | null = null` (null = not yet initialized — event hook has not fired)
       - IMPORTANT: initialize as `null`, NOT as an unresolved `Promise<void>`. This allows P1-02 to detect the uninitialized state and throw immediately with "preflight not initialized" rather than hanging indefinitely.
      - Return an object with 4 named hook keys plus one generic event hook, each calling a stub async function that does nothing yet:
        - `"tool.execute.before": async (input, output) => {}`
        - `"tool.execute.after": async (input, output) => {}`
        - `"event": async (input) => {}` — NOTE: `session.created` is NOT a named hook; it is received here via `input.event.type === "session.created"`
        - `"shell.env": async (input, output) => {}`
        - `"permission.ask": async (input, output) => {}`
   5. Export the full `HarnessPolicy` type — do NOT copy from `src/hooks/pre-tool-use.ts:23-26` (that type is minimal and missing `actions`). Instead, define the full shape from `harness-policy.json`:
      ```typescript
      type HarnessPolicy = {
        high_risk_patterns?: string[];
        hitl_timeout_seconds?: number;
        actions?: {
          read_file?: { default?: string; deny_patterns?: string[] };
          edit_file?: { default?: string; allow_patterns?: string[]; deny_patterns?: string[] };
          run_shell?: { default?: string; high_risk_patterns?: string[] };
          fetch_domain?: { default?: string; allow_list?: string[] };
          use_secret?: { default?: string; allowed_via?: string };
          approve_deploy?: { default?: string; hitl_timeout_seconds?: number };
        };
      };
      ```
      This type must be defined in `src/opencode/index.ts` and re-exported for use by all handler files.
  6. Export `preflightPassed` and `preflightPromise` references via a closure-accessible module-level object so handlers can share state

  **Must NOT do**:
  - Do NOT import from `src/hooks/` — copy types, never share imports
  - Do NOT implement handler logic — stubs only (logic added in P1-02..P1-06)
  - Do NOT add `@opencode-ai/plugin` to production `dependencies`
  - Do NOT create custom OpenCode tools

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward scaffolding task — file creation with known structure, no complex logic
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: TypeScript export conventions, Bun-native patterns, proper module structure
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: No security logic yet — stubs only
    - `BackendDesign`: No API/DB design
    - `TddWorkflow`: No tests for scaffolding (tested via P2-02)

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P0-02
  - **Parallel Group**: Wave 2 (with P0-02)
  - **Blocks**: P1-02, P1-03, P1-04, P1-05, P1-06, P2-01
  - **Blocked By**: P0-01

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/hooks/pre-tool-use.ts:23-26` — NOTE: the existing `HarnessPolicy` type here is minimal (only `high_risk_patterns` + `hitl_timeout_seconds`). The plugin needs the FULL type including `actions` — define it from `harness-policy.json` schema as specified in step 5 above, do NOT copy the minimal type.
  - `src/hooks/pre-tool-use.ts:133-136` — Policy loading pattern with `Bun.file().json()` and high-risk pattern extraction
  - `harness-policy.json:1-37` — Full policy structure — the plugin must load and parse this entire file

  **API/Type References**:
  - OpenCode Plugin SDK: `Plugin` type signature is `async ({ $, directory, worktree }) => ({ "hook.name": handler })`
  - `input.tool` values are lowercase: `"bash"`, `"write"`, `"edit"`, `"read"`
  - `output.args` is mutable — mutate in-place for sandbox routing

  **Acceptance Criteria**:

  - [ ] File `src/opencode/index.ts` exists
  - [ ] File exports `HarnessSecurityPlugin` as named export
  - [ ] File exports `HarnessSecurityPlugin` as default export
  - [ ] File contains 4 named hook keys plus generic `event` hook: `tool.execute.before`, `tool.execute.after`, `event`, `shell.env`, `permission.ask`
  - [ ] `bun tsc --noEmit` passes with zero errors
  - [ ] `bun run src/smoke-test.ts` still passes 10/10
  - [ ] `git diff --name-only src/hooks/` returns empty

  **TDD Workflow**: N/A — scaffolding task, tested end-to-end in P2-02

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Plugin module compiles and exports correctly
    Tool: Bash
    Preconditions: P1-01 implementation complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun -e "import { HarnessSecurityPlugin } from './src/opencode/index.ts'; console.log(typeof HarnessSecurityPlugin)"
      3. Assert output is: "function"
    Expected Result: Module compiles, named export is a function
    Failure Indicators: TypeScript errors, "undefined" output, import errors
    Evidence: .sisyphus/evidence/task-P1-01-export.txt

  Scenario: Plugin returns all 5 hook keys when invoked
    Tool: Bash
    Preconditions: P1-01 implementation complete, harness-policy.json exists in cwd
    Steps:
      1. Run: bun -e "import { HarnessSecurityPlugin } from './src/opencode/index.ts'; const hooks = await HarnessSecurityPlugin({ directory: process.cwd(), worktree: process.cwd(), $: {} }); console.log(Object.keys(hooks).sort().join(','))"
      2. Assert output is: "event,permission.ask,shell.env,tool.execute.after,tool.execute.before"
    Expected Result: All 5 hook keys present
    Failure Indicators: Missing keys, runtime error, policy load failure
    Evidence: .sisyphus/evidence/task-P1-01-hooks.txt

  Scenario: No regression in existing smoke tests
    Tool: Bash
    Preconditions: P1-01 implementation complete
    Steps:
      1. Run: bun run src/smoke-test.ts
      2. Assert output contains: "SMOKE TEST PASSED"
      3. Assert exit code: 0
    Expected Result: 10/10 existing tests pass
    Failure Indicators: Any test failure, exit code != 0
    Evidence: .sisyphus/evidence/task-P1-01-regression.txt
  ```

  **Commit**: YES
  - Message: `feat(opencode): scaffold plugin entry with policy loader and hook stubs`
  - Files: `src/opencode/index.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

- [ ] P1-02. Implement `tool.execute.before` handler — sandbox routing, file deny list, HIGH-RISK blocking, Trivy scan (`src/opencode/handlers/before.ts`)

  **What to do**:
  1. Create `src/opencode/handlers/before.ts` exporting `createBeforeHandler(policy: HarnessPolicy, getPreflightPromise: () => Promise<void> | null, preflightPassed: () => boolean): (input, output) => Promise<void>`
  2. Handler logic in execution order:
     a. **Preflight gate**: Call `getPreflightPromise()`. If result is `null` → throw `new Error("Preflight not initialized — tool calls blocked")` immediately. If non-null → `await` the promise. After resolving, if `!preflightPassed()` → throw `new Error("Preflight failed — tool calls blocked")`
     b. **File deny list** (for `read`, `write`, `edit` tools): Extract `filePath` from `output.args.filePath ?? output.args.path`. Call `checkSensitiveFile(filePath, policy.actions.read_file.deny_patterns)`. If match → `throw new Error(\`BLOCKED: access to sensitive file denied — ${filePath}\`)`
     c. **HIGH-RISK check** (for `bash` tool): Extract `command` from `output.args.command`. Call `matchHighRiskPattern(command, policy.high_risk_patterns)`. Store result as `matched`. NOTE: Do NOT throw here — sandbox routing (step e) and Trivy scan (step d) run unconditionally for ALL bash commands regardless of HIGH-RISK status. If `matched` → throw at end of handler unconditionally (always hard-block; no `hitl_mode` field exists in `harness-policy.json`).
     d. **Trivy scan** (for `bash` tool): Call `parseInstallCommand(command)`. If not null → call `trivyScan(pkg)`. If `blocked` → `throw new Error(\`BLOCKED by Trivy: ${pkg.packageName} — ${reason}\`)`
     e. **Sandbox routing** (for ALL `bash` tool calls — runs unconditionally after checks above): Mutate `output.args.command` to wrap in Docker exec: `const escaped = command.replace(/'/g, "'\\''"); output.args.command = \`docker exec harness-sandbox bash -c '${escaped}'\``
  3. Import `matchHighRiskPattern`, `checkSensitiveFile`, `parseInstallCommand`, `trivyScan` from `../../core/security.ts`
  4. The handler must check `input.tool` (lowercase string) to determine tool type

  **Must NOT do**:
  - Do NOT implement custom HITL terminal UI — use `throw` for hard blocks and `output.status = "ask"` for soft blocks
  - Do NOT modify `output.args` for non-bash tools
  - Do NOT import from `src/hooks/` or `src/lib/base.ts`
  - Do NOT add `console.log` — use structured throw messages only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex handler — 5 sequential security checks with branching logic, sandbox routing mutation, and preflight gate coordination
  - **Skills**: [`CodingStandards`, `SecurityReview`]
    - `CodingStandards`: TypeScript patterns, proper error handling, Bun-native code
    - `SecurityReview`: Security-critical handler — correct check ordering prevents bypass
  - **Skills Evaluated but Omitted**:
    - `TddWorkflow`: Handler tested via P2-02 smoke tests
    - `BackendDesign`: No API/DB involved
    - `docker-patterns`: Sandbox routing is a string mutation, not Docker API usage

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P1-03, P1-04, P1-05, P1-06
  - **Parallel Group**: Wave 3 (with P1-03, P1-04, P1-05, P1-06)
  - **Blocks**: P1-07
  - **Blocked By**: P0-02, P1-01

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/hooks/pre-tool-use.ts:133-186` — Full pre-tool-use handler flow: tool name check → high-risk match → HITL → Trivy → sandbox rewrite. Follow this exact ordering for the OpenCode handler
  - `src/hooks/pre-tool-use.ts:180-184` — Sandbox command rewriting pattern — adapt from stdin/stdout JSON rewrite to `output.args.command` mutation
  - `src/hooks/pre-tool-use.ts:136` — `highRiskPatterns.find((pattern) => new RegExp(pattern, "i").test(bashCommand))` — this logic is now in `matchHighRiskPattern()` from core

  **API/Type References**:
  - `src/core/security.ts` (created in P0-01) — `matchHighRiskPattern()`, `checkSensitiveFile()`, `parseInstallCommand()`, `trivyScan()` signatures
  - `harness-policy.json:7` — `deny_patterns` array for file deny list
  - `harness-policy.json:31-35` — `high_risk_patterns` array for HIGH-RISK matching
  - OpenCode SDK: `input.tool` is lowercase (`"bash"`, `"read"`, `"write"`, `"edit"`), `output.args` is mutable, throw to block

  **Acceptance Criteria**:

  - [ ] File `src/opencode/handlers/before.ts` exists
  - [ ] Exports `createBeforeHandler` function
  - [ ] `bun tsc --noEmit` passes
  - [ ] `bun run src/smoke-test.ts` still passes 10/10
  - [ ] `git diff --name-only src/hooks/` returns empty
  - [ ] `grep -c "import.*from.*src/hooks" src/opencode/handlers/before.ts` returns 0
  - [ ] `grep -c "import.*from.*lib/base" src/opencode/handlers/before.ts` returns 0

  **TDD Workflow**: N/A — handler logic tested via P2-02 smoke tests (tests 1-5)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: before handler module compiles and exports createBeforeHandler
    Tool: Bash
    Preconditions: P0-01 and P1-01 complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun -e "import { createBeforeHandler } from './src/opencode/handlers/before.ts'; console.log(typeof createBeforeHandler)"
      3. Assert output is: "function"
    Expected Result: Module compiles, export is a function
    Failure Indicators: TypeScript errors, "undefined" output
    Evidence: .sisyphus/evidence/task-P1-02-export.txt

  Scenario: Handler throws for HIGH-RISK bash command
    Tool: Bash
    Preconditions: P0-01 and P1-02 complete
    Steps:
      1. Run: bun -e "
         import { createBeforeHandler } from './src/opencode/handlers/before.ts';
          const handler = createBeforeHandler(
           { high_risk_patterns: ['rm -rf'], actions: { read_file: { deny_patterns: [] } } },
           () => Promise.resolve(),
           () => true
         );
         try { await handler({ tool: 'bash', sessionID: 's1', callID: 'c1' }, { args: { command: 'rm -rf /' } }); console.log('NOT_THROWN'); } catch (e) { console.log('THROWN:' + e.message); }
         "
      2. Assert output starts with: "THROWN:"
      3. Assert output contains: "HIGH-RISK"
    Expected Result: Handler throws with HIGH-RISK message
    Failure Indicators: Output is "NOT_THROWN", handler silently passes
    Evidence: .sisyphus/evidence/task-P1-02-highrisk.txt

  Scenario: Handler does NOT throw for safe bash command
    Tool: Bash
    Preconditions: P0-01 and P1-02 complete
    Steps:
      1. Run: bun -e "
         import { createBeforeHandler } from './src/opencode/handlers/before.ts';
          const handler = createBeforeHandler(
           { high_risk_patterns: ['rm -rf'], actions: { read_file: { deny_patterns: [] } } },
           () => Promise.resolve(),
           () => true
         );
         try { await handler({ tool: 'bash', sessionID: 's1', callID: 'c1' }, { args: { command: 'ls -la' } }); console.log('OK'); } catch (e) { console.log('THROWN'); }
         "
      2. Assert output is: "OK"
    Expected Result: Handler does not throw for safe commands
    Failure Indicators: Output is "THROWN", false positive block
    Evidence: .sisyphus/evidence/task-P1-02-safe.txt

  Scenario: Handler throws for read of .env file
    Tool: Bash
    Preconditions: P0-01 and P1-02 complete
    Steps:
      1. Run: bun -e "
         import { createBeforeHandler } from './src/opencode/handlers/before.ts';
          const handler = createBeforeHandler(
           { high_risk_patterns: [], actions: { read_file: { deny_patterns: ['.env', '**/*.pem'] } } },
           () => Promise.resolve(),
           () => true
         );
         try { await handler({ tool: 'read', sessionID: 's1', callID: 'c1' }, { args: { filePath: '.env' } }); console.log('NOT_THROWN'); } catch (e) { console.log('THROWN:' + e.message); }
         "
      2. Assert output starts with: "THROWN:"
      3. Assert output contains: "sensitive file"
    Expected Result: Handler throws for denied file path
    Failure Indicators: Output is "NOT_THROWN"
    Evidence: .sisyphus/evidence/task-P1-02-filedeny.txt

  Scenario: Sandbox routing mutates output.args.command
    Tool: Bash
    Preconditions: P0-01 and P1-02 complete
    Steps:
      1. Run: bun -e "
         import { createBeforeHandler } from './src/opencode/handlers/before.ts';
          const handler = createBeforeHandler(
           { high_risk_patterns: [], actions: { read_file: { deny_patterns: [] } } },
           () => Promise.resolve(),
           () => true
         );
         const output = { args: { command: 'echo hello' } };
         await handler({ tool: 'bash', sessionID: 's1', callID: 'c1' }, output);
         console.log(output.args.command);
         "
      2. Assert output contains: "docker exec harness-sandbox"
      3. Assert output contains: "echo hello"
    Expected Result: Command wrapped in docker exec
    Failure Indicators: Command unchanged, missing docker wrapper
    Evidence: .sisyphus/evidence/task-P1-02-sandbox.txt
  ```

  **Commit**: YES
  - Message: `feat(opencode): implement tool.execute.before — sandbox, file deny, high-risk, Trivy`
  - Files: `src/opencode/handlers/before.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

- [ ] P1-03. Implement `tool.execute.after` handler — Semgrep post-write scan (`src/opencode/handlers/after.ts`)

  **What to do**:
  1. Create `src/opencode/handlers/after.ts` exporting `createAfterHandler(): (input, output) => Promise<void>`
  2. Handler logic:
     a. Check `input.tool` — only process `"write"` or `"edit"` tools
     b. Extract file path: `const filePath = input.args.filePath ?? input.args.path`
     c. Call `semgrepScan(filePath)` from `../../core/security.ts`
     d. If findings array is non-empty, append to `output.output`:
        ```
        output.output += `\n\n[HARNESS] Semgrep found ${findings.length} issue(s):\n` + JSON.stringify(findings, null, 2)
        ```
     e. This injects findings into the LLM's context for self-correction — the LLM sees the findings and fixes them on the next turn
  3. Import `semgrepScan` from `../../core/security.ts`
  4. Do NOT throw — findings are advisory, not blocking. The LLM self-corrects.

  **Must NOT do**:
  - Do NOT throw errors for Semgrep findings — append to output only
  - Do NOT block tool execution — `tool.execute.after` runs AFTER the tool completes
  - Do NOT import from `src/hooks/post-tool-use.ts`
  - Do NOT scan non-file tools (bash, read)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Straightforward handler with one code path, but Semgrep output parsing requires careful string handling
  - **Skills**: [`CodingStandards`, `SecurityReview`]
    - `CodingStandards`: TypeScript patterns, string concatenation, async/await
    - `SecurityReview`: Semgrep output handling — must not swallow findings
  - **Skills Evaluated but Omitted**:
    - `TddWorkflow`: Handler tested via P2-02 smoke test (test 6)
    - `BackendDesign`: No API/DB involved

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P1-02, P1-04, P1-05, P1-06
  - **Parallel Group**: Wave 3 (with P1-02, P1-04, P1-05, P1-06)
  - **Blocks**: P1-07
  - **Blocked By**: P1-01

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/hooks/post-tool-use.ts:45-77` — Existing Semgrep scanning logic: tool name check, file path extraction, `Bun.spawn` for semgrep, JSON parsing of results, filtering by severity. The OpenCode handler simplifies this by delegating to `semgrepScan()` from core.
  - `src/hooks/post-tool-use.ts:39-41` — File path extraction pattern: `getString(toolInput, "path") ?? getString(toolInput, "file_path")` — adapt to `input.args.filePath ?? input.args.path`
  - `src/hooks/post-tool-use.ts:63-71` — Output formatting pattern for findings — adapt from stdout JSON to `output.output` string append

  **API/Type References**:
  - `src/core/security.ts` (P0-01) — `semgrepScan(filePath: string): Promise<SemgrepFinding[]>` — returns structured array
  - OpenCode SDK: `tool.execute.after` — `input.args` = original args, `output.output` = mutable string (append findings here)

  **Acceptance Criteria**:

  - [ ] File `src/opencode/handlers/after.ts` exists
  - [ ] Exports `createAfterHandler` function
  - [ ] `bun tsc --noEmit` passes
  - [ ] `bun run src/smoke-test.ts` still passes 10/10
  - [ ] `grep -c "import.*from.*src/hooks" src/opencode/handlers/after.ts` returns 0
  - [ ] Handler does NOT throw (grep for `throw` returns 0 in handler body)

  **TDD Workflow**: N/A — handler tested via P2-02 smoke test (test 6)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: after handler module compiles and exports createAfterHandler
    Tool: Bash
    Preconditions: P0-01 and P1-01 complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun -e "import { createAfterHandler } from './src/opencode/handlers/after.ts'; console.log(typeof createAfterHandler)"
      3. Assert output is: "function"
    Expected Result: Module compiles, export is a function
    Failure Indicators: TypeScript errors, "undefined" output
    Evidence: .sisyphus/evidence/task-P1-03-export.txt

  Scenario: Handler appends findings to output when semgrep detects issues
    Tool: Bash
    Preconditions: P0-01 and P1-03 complete, semgrep installed
    Steps:
      1. Create temp file: bun -e "await Bun.write('/tmp/harness-test-inject.py', 'import subprocess\nuser_input = input()\nsubprocess.run(user_input, shell=True)\n')"
      2. Run: bun -e "
         import { createAfterHandler } from './src/opencode/handlers/after.ts';
         const handler = createAfterHandler();
         const output = { output: 'file written' };
         await handler({ tool: 'write', args: { filePath: '/tmp/harness-test-inject.py' } }, output);
         console.log(output.output.includes('[HARNESS] Semgrep found') ? 'FINDINGS_APPENDED' : 'NO_FINDINGS');
         "
      3. Assert output is: "FINDINGS_APPENDED"
    Expected Result: Semgrep findings appended to output.output
    Failure Indicators: "NO_FINDINGS" when semgrep is installed and file has known vulnerability
    Evidence: .sisyphus/evidence/task-P1-03-findings.txt

  Scenario: Handler does nothing for non-write tools
    Tool: Bash
    Preconditions: P1-03 complete
    Steps:
      1. Run: bun -e "
         import { createAfterHandler } from './src/opencode/handlers/after.ts';
         const handler = createAfterHandler();
         const output = { output: 'original' };
         await handler({ tool: 'bash', args: { command: 'ls' } }, output);
         console.log(output.output === 'original' ? 'UNCHANGED' : 'MODIFIED');
         "
      2. Assert output is: "UNCHANGED"
    Expected Result: Output unchanged for non-write/edit tools
    Failure Indicators: "MODIFIED" — handler incorrectly processing bash tool
    Evidence: .sisyphus/evidence/task-P1-03-noop.txt
  ```

  **Commit**: YES
  - Message: `feat(opencode): implement tool.execute.after — Semgrep post-write scan`
  - Files: `src/opencode/handlers/after.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

 - [ ] P1-04. Implement `session.created` preflight soft gate via generic `event` hook (`src/opencode/handlers/session.ts`)

  **What to do**:
  1. Create `src/opencode/handlers/session.ts` exporting `createSessionHandler(directory: string, setPreflightPassed: (val: boolean) => void, setPreflightPromise?: (p: Promise<void>) => void, runPreflight?: () => Promise<void>): { handler: (input: { event: { type: string; sessionID?: string } }) => Promise<void> }`
   2. The returned object contains:
      a. `handler` — the generic `event` hook callback; must guard with `if (input.event.type !== "session.created") return` at the top
   2b. When `session.created` fires: immediately create a `Promise<void>` that runs the preflight checks, invoke `setPreflightPromise?.(promise)` to expose it to the plugin closure (so `getPreflightPromise()` stops returning null), and await the promise internally.
  3. Handler logic (runs 7 preflight checks, fire-and-forget since `event` hook cannot block):
     a. Check 1: Varlock available — `Bun.spawn(["bunx", "varlock", "--version"])` exit code 0
     b. Check 2: `.env.schema` exists — `await Bun.file(join(directory, ".env.schema")).exists()`
     c. Check 3: No real secrets in env — check `SENSITIVE_VARS` list against `process.env`, fail if any non-empty
     d. Check 4: TruffleHog pre-commit hook — `.pre-commit-config.yaml` exists and contains "trufflehog"
     e. Check 5: Docker daemon running — `Bun.spawn(["docker", "info"])` exit code 0
     f. Check 6: harness-sandbox container running — `Bun.spawn(["docker", "ps", "--filter", "name=harness-sandbox", ...])` stdout contains "harness-sandbox"
     g. Check 7: Varlock scan staged files — `Bun.spawn(["bunx", "varlock", "scan", "--staged"])` exit code 0
  4. If ALL checks pass → `setPreflightPassed(true)`
  5. If ANY check fails → `setPreflightPassed(false)` (preflight promise still resolves — but flag is false, so `tool.execute.before` in P1-02 will block)
  6. Import `SENSITIVE_VARS` list — copy from `src/preflight.ts:8-20` (do NOT import)
  7. The `directory` parameter comes from the plugin closure (passed to handler factory)

  **Must NOT do**:
  - Do NOT throw from the handler — generic `event` hook is fire-and-forget
  - Do NOT register as a named `"session.created"` key — that is NOT a valid `Hooks` key in `@opencode-ai/plugin`; use the generic `"event"` hook with `input.event.type` guard
  - Do NOT import from `src/preflight.ts` — copy the `SENSITIVE_VARS` list
  - Do NOT use `src/lib/ui.ts` formatting — no terminal UI in OpenCode plugin
  - Do NOT block session creation — all checks are informational, gating happens in `tool.execute.before`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Moderate complexity — 7 async subprocess checks with shared promise coordination
  - **Skills**: [`CodingStandards`, `SecurityReview`]
    - `CodingStandards`: Async/await patterns, promise coordination, Bun.spawn
    - `SecurityReview`: Preflight checks are security-critical — missing check = security gap
  - **Skills Evaluated but Omitted**:
    - `TddWorkflow`: Handler tested via P2-02 smoke test (test 8)
    - `docker-patterns`: Docker checks are simple subprocess spawns, not Docker API

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P1-02, P1-03, P1-05, P1-06
  - **Parallel Group**: Wave 3 (with P1-02, P1-03, P1-05, P1-06)
  - **Blocks**: P1-07
  - **Blocked By**: P1-01

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/preflight.ts:22-124` — Full preflight check implementation: 7 steps with labels and result types. Adapt each check to standalone `Bun.spawn` calls without the custom UI runner
  - `src/preflight.ts:8-20` — `SENSITIVE_VARS` array — copy this exact list into the session handler
  - `src/preflight.ts:46-49` — Env var check pattern: `SENSITIVE_VARS.filter(v => process.env[v]?.length > 0)` — replicate exactly
  - `src/preflight.ts:62-69` — TruffleHog check: `fileExists(configPath) && text.includes("trufflehog")` — replicate with `Bun.file`
  - `src/preflight.ts:74-96` — Docker sandbox check: two-stage `docker info` then `docker ps --filter` — replicate exactly

  **API/Type References**:
  - OpenCode SDK: `session.created` is an event TYPE, not a named hook key. Consumed via generic `event` hook: `"event": async ({ event }) => { if (event.type !== "session.created") return; ... }`. The `event` hook input is `{ event: Event }` where `Event` is from `@opencode-ai/sdk`.
  - Soft-gate pattern: when `session.created` fires, `setPreflightPromise(p)` is called which sets `preflightPromise` in the plugin closure from `null` to a live `Promise<void>`; `tool.execute.before` in P1-02 calls `getPreflightPromise()` and blocks with "Preflight not initialized" while it is still `null`

  **Acceptance Criteria**:

  - [ ] File `src/opencode/handlers/session.ts` exists
  - [ ] Exports `createSessionHandler` function
  - [ ] `createSessionHandler` accepts 4 parameters: `directory`, `setPreflightPassed`, optional `setPreflightPromise`, optional `runPreflight`
  - [ ] `createSessionHandler` returns `{ handler }` object (no longer returns `preflightPromise` — uses `setPreflightPromise` callback instead)
  - [ ] `bun tsc --noEmit` passes
  - [ ] `bun run src/smoke-test.ts` still passes 10/10
  - [ ] `grep -c "import.*from.*src/preflight" src/opencode/handlers/session.ts` returns 0
  - [ ] `grep -c "import.*from.*src/lib/ui" src/opencode/handlers/session.ts` returns 0

  **TDD Workflow**: N/A — handler tested via P2-02 smoke test (test 8)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: session handler module compiles and exports createSessionHandler
    Tool: Bash
    Preconditions: P1-01 complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun -e "import { createSessionHandler } from './src/opencode/handlers/session.ts'; console.log(typeof createSessionHandler)"
      3. Assert output is: "function"
    Expected Result: Module compiles, export is a function
    Failure Indicators: TypeScript errors, "undefined" output
    Evidence: .sisyphus/evidence/task-P1-04-export.txt

  Scenario: createSessionHandler returns object with handler function
    Tool: Bash
    Preconditions: P1-04 complete
    Steps:
      1. Run: bun -e "
         import { createSessionHandler } from './src/opencode/handlers/session.ts';
         const result = createSessionHandler('/tmp', () => {});
         console.log(typeof result.handler + ',' + ('preflightPromise' in result));
         "
      2. Assert output is: "function,false"
    Expected Result: Returns object with handler function only (no preflightPromise property — setPreflightPromise callback pattern used instead)
    Failure Indicators: Missing handler, preflightPromise still returned as property
    Evidence: .sisyphus/evidence/task-P1-04-shape.txt

  Scenario: Preflight sets flag to true when all checks pass (mocked)
    Tool: Bash
    Preconditions: P1-04 complete
    Steps:
      1. Run: bun -e "
         import { createSessionHandler } from './src/opencode/handlers/session.ts';
         let flag = false;
         let resolveP: () => void;
         const p = new Promise<void>((r) => { resolveP = r; });
         // Pass setPreflightPromise as 3rd arg, runPreflight (mock: always succeeds) as 4th arg
         const { handler } = createSessionHandler('/tmp', (v) => { flag = v; }, (pr) => { resolveP(); }, async () => {});
         await handler({ event: { type: 'session.created', sessionID: 'test-s1' } });
         await p;
         console.log('flag=' + flag);
         "
      2. Assert output is exactly: "flag=true"
    Expected Result: Flag is true when all checks pass (runPreflight mocked to succeed)
    Failure Indicators: Output is "flag=false" or Promise never resolves
    Evidence: .sisyphus/evidence/task-P1-04-preflight-pass.txt

  Scenario: Preflight sets flag to false when a check fails (mocked)
    Tool: Bash
    Preconditions: P1-04 complete
    Steps:
      1. Run: bun -e "
         import { createSessionHandler } from './src/opencode/handlers/session.ts';
         let flag = true;
         let resolveP: () => void;
         const p = new Promise<void>((r) => { resolveP = r; });
         // Pass setPreflightPromise as 3rd arg, runPreflight (mock: always throws) as 4th arg
         const { handler } = createSessionHandler('/tmp', (v) => { flag = v; }, (pr) => { resolveP(); }, async () => { throw new Error('mock check failure'); });
         await handler({ event: { type: 'session.created', sessionID: 'test-s1' } });
         await p;
         console.log('flag=' + flag);
         "
      2. Assert output is exactly: "flag=false"
    Expected Result: Flag is false when runPreflight throws
    Failure Indicators: Output is "flag=true", exception propagates out of handler
    Evidence: .sisyphus/evidence/task-P1-04-preflight-fail.txt
    Evidence: .sisyphus/evidence/task-P1-04-preflight-fail.txt

  Scenario: Handler does not throw (fire-and-forget)
    Tool: Bash
    Preconditions: P1-04 complete
    Steps:
      1. Run: grep -c "throw " src/opencode/handlers/session.ts
      2. Assert output is: "0"
    Expected Result: No throw statements in handler
    Failure Indicators: Count > 0 — session.created must never throw
    Evidence: .sisyphus/evidence/task-P1-04-nothrow.txt
  ```

  **Commit**: YES (grouped with P1-05, P1-06)
  - Message: `feat(opencode): implement event-hook preflight + shell.env + permission.ask`
  - Files: `src/opencode/handlers/session.ts`, `src/opencode/handlers/env.ts`, `src/opencode/handlers/permission.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

- [ ] P1-05. Implement `shell.env` handler — sensitive environment variable stripping (`src/opencode/handlers/env.ts`)

  **What to do**:
  1. Create `src/opencode/handlers/env.ts` exporting `createEnvHandler(sensitiveVars: string[]): (input, output) => Promise<void>`
  2. Handler logic:
     a. Iterate `sensitiveVars` array
     b. For each var name, if `output.env[varName]` exists, `delete output.env[varName]`
     c. This strips sensitive variables before they reach shell commands
  3. `sensitiveVars` list passed from plugin entry (loaded from `SENSITIVE_VARS` constant, copied from `src/preflight.ts:8-20`)
  4. Import `stripSensitiveEnv` from `../../core/security.ts` — or inline the delete loop (it is 3 lines)

  **Must NOT do**:
  - Do NOT import from `src/preflight.ts`
  - Do NOT throw — env stripping is silent (never blocks)
  - Do NOT mutate keys not in the `sensitiveVars` list
  - Do NOT log stripped variable values

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial handler — iterate array, delete keys from object. Under 15 lines of logic.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: TypeScript delete operator, Record<string,string> handling
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: Logic is trivial — a loop with delete. No security subtlety.
    - `TddWorkflow`: Handler tested via P2-02 smoke test (test 7)

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P1-02, P1-03, P1-04, P1-06
  - **Parallel Group**: Wave 3 (with P1-02, P1-03, P1-04, P1-06)
  - **Blocks**: P1-07
  - **Blocked By**: P1-01

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/preflight.ts:8-20` — `SENSITIVE_VARS` array: `["AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "STRIPE_SECRET_KEY", "GITHUB_TOKEN", "DATABASE_URL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "PRIVATE_KEY", "SECRET_KEY", "PASSWORD", "PASSWD"]` — copy this exact list
  - `src/core/security.ts` (P0-01) — `stripSensitiveEnv(env, sensitiveVars)` — can call this or inline equivalent

  **API/Type References**:
  - OpenCode SDK: `shell.env` — `output.env` is a mutable `Record<string, string>`. Delete keys to strip them before shell execution.

  **Acceptance Criteria**:

  - [ ] File `src/opencode/handlers/env.ts` exists
  - [ ] Exports `createEnvHandler` function
  - [ ] `bun tsc --noEmit` passes
  - [ ] `bun run src/smoke-test.ts` still passes 10/10
  - [ ] `grep -c "import.*from.*src/preflight" src/opencode/handlers/env.ts` returns 0

  **TDD Workflow**: N/A — handler tested via P2-02 smoke test (test 7)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: env handler module compiles and exports createEnvHandler
    Tool: Bash
    Preconditions: P1-01 complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun -e "import { createEnvHandler } from './src/opencode/handlers/env.ts'; console.log(typeof createEnvHandler)"
      3. Assert output is: "function"
    Expected Result: Module compiles, export is a function
    Failure Indicators: TypeScript errors, "undefined" output
    Evidence: .sisyphus/evidence/task-P1-05-export.txt

  Scenario: Handler strips AWS_SECRET_ACCESS_KEY from env
    Tool: Bash
    Preconditions: P1-05 complete
    Steps:
      1. Run: bun -e "
         import { createEnvHandler } from './src/opencode/handlers/env.ts';
         const handler = createEnvHandler(['AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN']);
         const output = { env: { HOME: '/tmp/mock-home', AWS_SECRET_ACCESS_KEY: 'AKIAI...', PATH: '/usr/bin', GITHUB_TOKEN: 'ghp_xxx' } };
         await handler({}, output);
         console.log(JSON.stringify(Object.keys(output.env).sort()));
         "
      2. Assert output is: '["HOME","PATH"]'
    Expected Result: Sensitive vars removed, non-sensitive vars preserved
    Failure Indicators: Sensitive vars still present, non-sensitive vars removed
    Evidence: .sisyphus/evidence/task-P1-05-strip.txt

  Scenario: Handler preserves env when no sensitive vars present
    Tool: Bash
    Preconditions: P1-05 complete
    Steps:
      1. Run: bun -e "
         import { createEnvHandler } from './src/opencode/handlers/env.ts';
         const handler = createEnvHandler(['AWS_SECRET_ACCESS_KEY']);
         const output = { env: { HOME: '/tmp/mock-home', PATH: '/usr/bin' } };
         await handler({}, output);
         console.log(Object.keys(output.env).length);
         "
      2. Assert output is: "2"
    Expected Result: All keys preserved when none are sensitive
    Failure Indicators: Keys missing or count wrong
    Evidence: .sisyphus/evidence/task-P1-05-noop.txt
  ```

  **Commit**: YES (grouped with P1-04, P1-06)
  - Message: `feat(opencode): implement event-hook preflight + shell.env + permission.ask`
  - Files: `src/opencode/handlers/session.ts`, `src/opencode/handlers/env.ts`, `src/opencode/handlers/permission.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

- [ ] P1-06. Implement `permission.ask` handler — native dialog for HIGH-RISK matches (`src/opencode/handlers/permission.ts`)

  **What to do**:
  1. Create `src/opencode/handlers/permission.ts` exporting `createPermissionHandler(policy: HarnessPolicy): (input, output) => Promise<void>`
   2. Handler logic — NOTE: `permission.ask` receives a `Permission` object from `@opencode-ai/sdk`, NOT tool-call args. The `Permission` type contains the command/action being requested. Check its `command` or `title` field for HIGH-RISK patterns:
      a. Extract the command string from `input`: use `(input as any).command ?? (input as any).title ?? ""` — the exact field depends on the SDK `Permission` type; use a defensive fallback to empty string if neither exists
      b. Call `matchHighRiskPattern(command, policy.high_risk_patterns)` from `../../core/security.ts`
      c. If match found → set `output.status = "ask"` to trigger native OpenCode permission dialog
      d. If no match → do nothing (default behavior: auto-allow)
   3. This handler provides a best-effort HITL gate — if the `Permission` payload does not contain a command string, it falls back to auto-allow (no false positives)
    4. Note: HIGH-RISK behavior is split across two handlers with explicitly different roles. `permission.ask` (this handler) fires first and sets `output.status = "ask"` — this triggers the native OpenCode dialog as a best-effort user notification. The dialog outcome is irrelevant: `tool.execute.before` (P1-02) ALWAYS fires unconditionally afterward and always hard-blocks HIGH-RISK commands by throwing, regardless of what the user clicked. There is NO approve path for HIGH-RISK commands — the dialog is a warning UX only, not a gate. This is documented in the regression register as R1 (no custom HITL, no approve/deny semantics). A developer reading both handlers must understand: `permission.ask` = notify, `tool.execute.before` = always block.

  **Must NOT do**:
  - Do NOT implement custom terminal UI — use native `output.status = "ask"` only
  - Do NOT throw from this handler — it sets dialog status, not blocks
  - Do NOT handle non-bash tools
  - Do NOT log command details (security risk — commands may contain secrets)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Minimal handler — one condition check, one property set. Under 10 lines of logic.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: TypeScript patterns, conditional assignment
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: Logic is trivial — match pattern, set status
    - `TddWorkflow`: No dedicated test — covered by integration with before handler

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P1-02, P1-03, P1-04, P1-05
  - **Parallel Group**: Wave 3 (with P1-02, P1-03, P1-04, P1-05)
  - **Blocks**: P1-07
  - **Blocked By**: P1-01

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/hooks/pre-tool-use.ts:136-169` — HIGH-RISK matching + HITL gateway pattern. In OpenCode, this is split: `permission.ask` sets `output.status = "ask"` (this handler), `tool.execute.before` throws for hard block (P1-02)
  - `src/core/security.ts` (P0-01) — `matchHighRiskPattern(command, patterns)` — returns matched pattern string or null

  **API/Type References**:
  - OpenCode SDK: `permission.ask` — `output.status` can be set to `"ask"` to trigger native permission dialog. No custom UI available.
  - `harness-policy.json:31-35` — `high_risk_patterns` array passed to handler via policy

  **Acceptance Criteria**:

  - [ ] File `src/opencode/handlers/permission.ts` exists
  - [ ] Exports `createPermissionHandler` function
  - [ ] `bun tsc --noEmit` passes
  - [ ] `bun run src/smoke-test.ts` still passes 10/10
  - [ ] Handler never throws (`grep -c "throw " src/opencode/handlers/permission.ts` returns 0)

  **TDD Workflow**: N/A — handler tested indirectly via integration

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: permission handler compiles and exports createPermissionHandler
    Tool: Bash
    Preconditions: P1-01 complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun -e "import { createPermissionHandler } from './src/opencode/handlers/permission.ts'; console.log(typeof createPermissionHandler)"
      3. Assert output is: "function"
    Expected Result: Module compiles, export is a function
    Failure Indicators: TypeScript errors, "undefined" output
    Evidence: .sisyphus/evidence/task-P1-06-export.txt

  Scenario: Handler sets output.status to 'ask' for HIGH-RISK command
    Tool: Bash
    Preconditions: P0-01 and P1-06 complete
    Steps:
      1. Run: bun -e "
         import { createPermissionHandler } from './src/opencode/handlers/permission.ts';
         const handler = createPermissionHandler({ high_risk_patterns: ['rm -rf', 'DROP TABLE'] });
         const output = { status: 'allow' };
         await handler({ command: 'rm -rf /tmp/data' }, output);
         console.log(output.status);
         "
      2. Assert output is: "ask"
    Expected Result: Status changed to 'ask' for high-risk match
    Failure Indicators: Status still 'allow' — handler did not detect pattern
    Evidence: .sisyphus/evidence/task-P1-06-ask.txt

  Scenario: Handler does not change status for safe commands
    Tool: Bash
    Preconditions: P0-01 and P1-06 complete
    Steps:
      1. Run: bun -e "
         import { createPermissionHandler } from './src/opencode/handlers/permission.ts';
         const handler = createPermissionHandler({ high_risk_patterns: ['rm -rf'] });
         const output = { status: 'allow' };
         await handler({ command: 'echo hello' }, output);
         console.log(output.status);
         "
      2. Assert output is: "allow"
    Expected Result: Status unchanged for safe command
    Failure Indicators: Status changed to 'ask' — false positive
    Evidence: .sisyphus/evidence/task-P1-06-safe.txt

  Scenario: Handler handles missing command field gracefully (no false positives)
    Tool: Bash
    Preconditions: P0-01 and P1-06 complete
    Steps:
      1. Run: bun -e "
         import { createPermissionHandler } from './src/opencode/handlers/permission.ts';
         const handler = createPermissionHandler({ high_risk_patterns: ['rm -rf'] });
         const output = { status: 'allow' };
         await handler({}, output);
         console.log(output.status);
         "
      2. Assert output is: "allow"
    Expected Result: No crash, status unchanged when Permission has no command field
    Failure Indicators: Throws error, status unexpectedly changed
    Evidence: .sisyphus/evidence/task-P1-06-nocrash.txt
  ```

  **Commit**: YES (grouped with P1-04, P1-05)
  - Message: `feat(opencode): implement event-hook preflight + shell.env + permission.ask`
  - Files: `src/opencode/handlers/session.ts`, `src/opencode/handlers/env.ts`, `src/opencode/handlers/permission.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

- [ ] P1-07. Add fail-closed error boundaries to ALL handlers (`src/opencode/index.ts`)

  **What to do**:
  1. In `src/opencode/index.ts`, create a `safe()` wrapper function:
     ```
     const safe = <T extends (...args: any[]) => Promise<void>>(handler: T): T =>
       (async (...args: any[]) => {
         try {
           await handler(...args)
         } catch (err) {
           // For blocking handlers (before, permission): rethrow so tool is blocked
           throw err
         }
       }) as T
     ```
  2. Wrap EVERY handler registration with `safe()`:
     - `"tool.execute.before": safe(beforeHandler)`
     - `"tool.execute.after": safe(afterHandler)`
     - `"event": safe(sessionHandler)` — special case: catch and log, do NOT rethrow (fire-and-forget); the sessionHandler already guards `event.type === "session.created"` internally
     - `"shell.env": safe(envHandler)`
     - `"permission.ask": safe(permissionHandler)`
  3. For `session.created` specifically, the wrapper must swallow errors (fire-and-forget) but set `preflightPassed = false` if error occurs
  4. For `tool.execute.after`, the wrapper must swallow errors (advisory only, should not block)
  5. For `tool.execute.before`, `shell.env`, `permission.ask`, the wrapper must rethrow (fail-closed — unhandled error = tool blocked)
   6. Wire up ALL handler factories from P1-02..P1-06:
      - Import `createBeforeHandler` from `./handlers/before.ts`; call as `createBeforeHandler(policy, () => preflightPromise, () => preflightPassed)` — pass a getter lambda for `preflightPromise` (so null-before-init is detectable) and a getter for `preflightPassed`
      - Import `createAfterHandler` from `./handlers/after.ts`
       - Import `createSessionHandler` from `./handlers/session.ts` — call as `createSessionHandler(directory, (v) => { preflightPassed = v }, (p) => { preflightPromise = p })` — the third argument is a setter callback invoked by the session handler when `session.created` fires, which is when `preflightPromise` transitions from `null` to a live `Promise<void>`. Do NOT assign `preflightPromise` directly in the plugin closure — it must remain `null` until `session.created` fires so that `getPreflightPromise()` returning `null` correctly signals "preflight not yet initialized" to the before-handler
      - Import `createEnvHandler` from `./handlers/env.ts`
      - Import `createPermissionHandler` from `./handlers/permission.ts`
  7. Replace stub handlers with actual factory-created handlers

  **Must NOT do**:
  - Do NOT silently swallow errors in `tool.execute.before` — fail-closed means rethrow
  - Do NOT add `console.log` — use throw/rethrow for error propagation
  - Do NOT modify handler files (P1-02..P1-06) — only modify `src/opencode/index.ts`
  - Do NOT use `// @ts-ignore` or `as any` to suppress type errors

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration task requiring careful error boundary semantics — different handlers need different error strategies (rethrow vs swallow)
  - **Skills**: [`CodingStandards`, `SecurityReview`]
    - `CodingStandards`: TypeScript generics for wrapper function, proper error handling patterns
    - `SecurityReview`: Error boundary is security-critical — wrong strategy = silent bypass
  - **Skills Evaluated but Omitted**:
    - `TddWorkflow`: Tested via P2-02 smoke tests
    - `BackendDesign`: No API/DB involved

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P2-01
  - **Parallel Group**: Wave 4 (with P2-01)
  - **Blocks**: P2-02, P2-03
  - **Blocked By**: P1-02, P1-03, P1-04, P1-05, P1-06

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/hooks/pre-tool-use.ts:192-197` — Existing error boundary pattern: `try { main() } catch { writeStderr(); process.exit(1) }` — adapt from process exit to throw for OpenCode in-process model
  - `src/hooks/post-tool-use.ts:84-89` — Same pattern in post-tool hook
  - `src/opencode/index.ts` (P1-01) — Current stub structure to be updated with real handlers and safe() wrappers

  **API/Type References**:
  - `src/opencode/handlers/before.ts` (P1-02) — `createBeforeHandler(policy, getPreflightPromise, preflightPassed)` signature — NOTE: first arg is a getter `() => Promise<void> | null`, not the promise directly
  - `src/opencode/handlers/after.ts` (P1-03) — `createAfterHandler()` signature
  - `src/opencode/handlers/session.ts` (P1-04) — `createSessionHandler(directory, setPreflightPassed, setPreflightPromise?, runPreflight?)` returns `{ handler }` — `setPreflightPromise` callback is invoked when `session.created` fires, transitioning `preflightPromise` from `null` to a live Promise in the plugin closure
  - `src/opencode/handlers/env.ts` (P1-05) — `createEnvHandler(sensitiveVars)` signature
  - `src/opencode/handlers/permission.ts` (P1-06) — `createPermissionHandler(policy)` signature

  **Acceptance Criteria**:

  - [ ] `src/opencode/index.ts` imports all 5 handler factories (4 named hooks + 1 generic event hook)
  - [ ] All 5 hook registrations wrapped with `safe()` or equivalent error boundary
  - [ ] `bun tsc --noEmit` passes
  - [ ] `bun run src/smoke-test.ts` still passes 10/10
  - [ ] `grep -c "safe(" src/opencode/index.ts` returns at least 5
  - [ ] No `as any` or `@ts-ignore` in file: `grep -c "as any\|@ts-ignore" src/opencode/index.ts` returns 0

  **TDD Workflow**: N/A — integration wiring tested via P2-02 smoke tests

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Plugin compiles with all handlers wired up
    Tool: Bash
    Preconditions: P1-02 through P1-06 complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun -e "
         import { HarnessSecurityPlugin } from './src/opencode/index.ts';
         const hooks = await HarnessSecurityPlugin({ directory: process.cwd(), worktree: process.cwd(), $: {} });
         const keys = Object.keys(hooks).sort().join(',');
         console.log(keys);
         "
       3. Assert output is: "event,permission.ask,shell.env,tool.execute.after,tool.execute.before"
    Failure Indicators: Missing hooks, import errors, TypeScript errors
    Evidence: .sisyphus/evidence/task-P1-07-wired.txt

  Scenario: Error in before handler still blocks tool (fail-closed)
    Tool: Bash
    Preconditions: P1-07 complete
    Steps:
      1. Run: bun -e "
         import { HarnessSecurityPlugin } from './src/opencode/index.ts';
         const hooks = await HarnessSecurityPlugin({ directory: process.cwd(), worktree: process.cwd(), $: {} });
         try {
           await hooks['tool.execute.before']({ tool: 'read', sessionID: 's1', callID: 'c1' }, { args: { filePath: '.env' } });
           console.log('NOT_BLOCKED');
         } catch (e) {
           console.log('BLOCKED');
         }
         "
      2. Assert output is: "BLOCKED"
    Expected Result: Handler error propagates as block (fail-closed)
    Failure Indicators: "NOT_BLOCKED" — error was swallowed, tool allowed through
    Evidence: .sisyphus/evidence/task-P1-07-failclosed.txt

  Scenario: All safe() wrappers present in index.ts
    Tool: Bash
    Preconditions: P1-07 complete
    Steps:
      1. Run: grep -c "safe(" src/opencode/index.ts
      2. Assert output >= 5
    Expected Result: At least 5 safe() wrapper calls
    Failure Indicators: Count < 5 — some handlers not wrapped
    Evidence: .sisyphus/evidence/task-P1-07-wrapcount.txt
  ```

  **Commit**: YES (grouped with P2-01)
  - Message: `feat(opencode): add fail-closed error boundaries and install --opencode flag`
  - Files: `src/opencode/index.ts`, `src/install.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

- [ ] P2-01. Add `--opencode` flag to `harness install` command (`src/install.ts`)

  **What to do**:
  1. In `src/install.ts`, detect `--opencode` flag from `process.argv` (or `Bun.argv`)
  2. When `--opencode` is passed, add these steps AFTER existing install logic:
      a. Create the PARENT directory only: `${targetDir}/.opencode/plugins/` using `ensureDir()` — do NOT pre-create `harness-security/` as a directory; the symlink itself creates it as a named symlink.
      b. Symlink the ENTIRE `src/opencode/` directory → `${targetDir}/.opencode/plugins/harness-security` so all relative imports (`./handlers/before.ts`, `./handlers/session.ts`, etc.) resolve correctly:
         - Use `Bun.spawn(["ln", "-sf", join(HARNESS_DIR, "src/opencode"), join(targetDir, ".opencode/plugins/harness-security")])` 
         - IMPORTANT: the destination path must NOT already exist as a directory before running this — if it does, `ln -sf` will create a nested symlink inside it. Check with `Bun.file(destPath).exists()` and remove or skip if already a symlink.
         - Fallback to recursive copy of the full `src/opencode/` tree if symlink fails (`cp -r src/opencode .opencode/plugins/harness-security`)
         - DO NOT copy/symlink only `index.ts` — relative imports to `./handlers/*` and `../core/security.ts` will break
         - NOTE: `opencode.json` plugin entry must reference the directory entry point: `".opencode/plugins/harness-security/index.ts"`
      b2. Symlink `src/core/` → `${targetDir}/.opencode/plugins/core` (same pattern as above — parent `.opencode/plugins/` already exists; do NOT pre-create `core/` as a directory):
         - Use `Bun.spawn(["ln", "-sf", join(HARNESS_DIR, "src/core"), join(targetDir, ".opencode/plugins/core")])`
         - Fallback to recursive copy of `src/core/` if symlink fails
         - This is required because handlers import `../../core/security.ts` which resolves to `plugins/core/security.ts` from the installed plugin tree
     c. Read or create `${targetDir}/opencode.json`
      d. Ensure `"plugin"` array exists and contains `".opencode/plugins/harness-security/index.ts"`
     e. Write updated `opencode.json` back with `Bun.write()`
  3. Print status messages matching existing style: `[CREATED]`, `[UPDATED]`, `[SKIP]`
  4. Existing install behavior MUST NOT change when `--opencode` is not passed

  **Must NOT do**:
  - Do NOT change existing install behavior (Claude Code scaffolding)
  - Do NOT add `--opencode` as default — it must be an explicit flag
  - Do NOT overwrite existing `opencode.json` settings — only add to `plugin` array
  - NOTE: `src/cli.ts` currently does not forward args to `src/install.ts`. The user-facing command is `bun run src/install.ts -- --opencode` (direct invocation), NOT `harness install --opencode` via the CLI. This is acceptable for v1 — the CLI wiring is deferred to v2. Update the Success Criteria and docs accordingly.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward flag detection + file operations. Follows existing patterns in install.ts.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: TypeScript file I/O, Bun.file/Bun.write patterns, argv parsing
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: Install script has no security-sensitive logic
    - `BackendDesign`: No API/DB involved
    - `docker-patterns`: No Docker involved

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P1-07
  - **Parallel Group**: Wave 4 (with P1-07)
  - **Blocks**: P2-02
  - **Blocked By**: P1-01

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/install.ts:8-16` — `copyIfMissing()` helper — reuse for plugin file copy fallback
  - `src/install.ts:18-58` — `main()` function structure: sequential file operations with status messages
  - `src/install.ts:21` — `const targetDir = process.cwd()` — target directory pattern
  - `src/install.ts:27-37` — `.gitignore` patching pattern — adapt for `opencode.json` patching (check-before-modify)
  - `src/install.ts:42-51` — `.claude/hooks.json` creation pattern — adapt for `.opencode/plugins/` directory

  **API/Type References**:
  - `Bun.argv` — command line arguments array (equivalent to `process.argv`)
  - `Bun.file().json()` — read JSON from file
  - `Bun.write()` — write file atomically

  **Acceptance Criteria**:

  - [ ] `bun run src/install.ts` (without `--opencode`) behaves identically to current behavior
   - [ ] `bun run src/install.ts -- --opencode` creates `.opencode/plugins/harness-security/` directory (full tree, not single file)
   - [ ] `bun run src/install.ts -- --opencode` creates/symlinks `src/opencode/` tree to `.opencode/plugins/harness-security/` so `index.ts` and all `handlers/` are resolvable
   - [ ] `bun run src/install.ts -- --opencode` creates or patches `opencode.json` with plugin entry `".opencode/plugins/harness-security/index.ts"`
  - [ ] `bun tsc --noEmit` passes
  - [ ] `bun run src/smoke-test.ts` still passes 10/10
  - [ ] `git diff --name-only src/cli.ts` returns empty (cli.ts not modified)

  **TDD Workflow**: N/A — integration task, tested via QA scenarios below

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: install without --opencode does not create .opencode directory
    Tool: Bash
    Preconditions: Clean temp directory
    Steps:
      1. Run: REPO=$(pwd) && TMPDIR=$(mktemp -d) && cp harness-policy.json "$TMPDIR/" && cp .env.schema "$TMPDIR/" && (cd "$TMPDIR" && bun run "$REPO/src/install.ts") && test -d "$TMPDIR/.opencode" && echo "EXISTS" || echo "NOT_EXISTS"
      2. Assert output is: "NOT_EXISTS"
    Expected Result: .opencode directory not created without flag
    Failure Indicators: "EXISTS" — flag defaulting to true
    Evidence: .sisyphus/evidence/task-P2-01-noflag.txt

  Scenario: install --opencode creates plugin directory and file
    Tool: Bash
    Preconditions: P1-01 complete (src/opencode/index.ts exists)
    Steps:
      1. Run: REPO=$(pwd) && TMPDIR=$(mktemp -d) && cp harness-policy.json "$TMPDIR/" && cp .env.schema "$TMPDIR/" && (cd "$TMPDIR" && bun run "$REPO/src/install.ts" -- --opencode)
       2. Run: test -d "$TMPDIR/.opencode/plugins/harness-security" && echo "DIR_EXISTS" || echo "NO_DIR"
       3. Run: test -f "$TMPDIR/.opencode/plugins/harness-security/index.ts" && echo "FILE_EXISTS" || echo "NO_FILE"
       4. Run: test -f "$TMPDIR/.opencode/plugins/harness-security/handlers/before.ts" && echo "HANDLERS_EXISTS" || echo "NO_HANDLERS"
       5. Assert all three: "DIR_EXISTS", "FILE_EXISTS", "HANDLERS_EXISTS"
     Expected Result: Plugin directory tree created with index.ts and handlers/ subdirectory
     Failure Indicators: Missing directory, missing index.ts, or missing handlers/
    Evidence: .sisyphus/evidence/task-P2-01-created.txt

  Scenario: install --opencode patches opencode.json with plugin entry
    Tool: Bash
    Preconditions: P2-01 complete
    Steps:
      1. Run: REPO=$(pwd) && TMPDIR=$(mktemp -d) && cp harness-policy.json "$TMPDIR/" && cp .env.schema "$TMPDIR/" && (cd "$TMPDIR" && bun run "$REPO/src/install.ts" -- --opencode)
      2. Run: bun -e "const c = await Bun.file('$TMPDIR/opencode.json').json(); console.log(JSON.stringify(c.plugin))"
       3. Assert output contains: ".opencode/plugins/harness-security/index.ts"
    Expected Result: opencode.json contains plugin path
    Failure Indicators: Missing plugin entry, malformed JSON
    Evidence: .sisyphus/evidence/task-P2-01-json.txt
  ```

  **Commit**: YES (grouped with P1-07)
  - Message: `feat(opencode): add fail-closed error boundaries and install --opencode flag`
  - Files: `src/opencode/index.ts`, `src/install.ts`
  - Pre-commit: `bun tsc --noEmit && bun run src/smoke-test.ts`

---

- [ ] P2-02. Write OpenCode smoke test suite (`src/opencode-smoke-test.ts`)

  **What to do**:
  1. Create `src/opencode-smoke-test.ts` using `bun:test` framework
  2. Import handlers directly — do NOT run OpenCode UI:
     ```typescript
     import { createBeforeHandler } from "./opencode/handlers/before.ts"
     import { createAfterHandler } from "./opencode/handlers/after.ts"
     import { createEnvHandler } from "./opencode/handlers/env.ts"
     import { createSessionHandler } from "./opencode/handlers/session.ts"
     ```
  3. Write exactly these 8 tests:
     - **OC-01** `tool.execute.before` — HIGH-RISK bash → throws: `input={tool:"bash",...}, output={args:{command:"rm -rf /"}}` → `rejects.toThrow()`
     - **OC-02** `tool.execute.before` — safe bash → does NOT throw: `output={args:{command:"ls -la"}}` → `resolves`
     - **OC-03** `tool.execute.before` — read `.env` → throws (file deny list): `input={tool:"read",...}, output={args:{filePath:"/project/.env"}}` → `rejects.toThrow()`
     - **OC-04** `tool.execute.before` — safe file read → does NOT throw: `output={args:{filePath:"src/index.ts"}}` → `resolves`
     - **OC-05** `tool.execute.before` — sandbox routing: `output={args:{command:"ls"}}` → after handler runs, `output.args.command` equals `"docker exec harness-sandbox bash -c 'ls'"`
     - **OC-06** `tool.execute.after` — write with shell injection → appends semgrep findings: create temp Python file with `subprocess.run(user_input, shell=True)`, run after handler, assert `output.output` contains `"[HARNESS]"`
     - **OC-07** `shell.env` — strips `AWS_SECRET_ACCESS_KEY`: `output={env:{AWS_SECRET_ACCESS_KEY:"secret",PATH:"/usr/bin"}}` → after handler, `AWS_SECRET_ACCESS_KEY` absent, `PATH` present
     - **OC-08** `event` hook soft gate — preflight promise behavior: (a) if `event` hook never fired with `session.created` (`getPreflightPromise()` returns `null`), `tool.execute.before` throws immediately with "Preflight not initialized"; (b) if preflight ran and failed (flag=false), throws with "Preflight failed"; (c) if preflight ran and passed (flag=true), resolves normally. Test (a) by calling `createBeforeHandler` with a getter that returns `null` and asserting it throws synchronously.
  4. Each test in a `describe("OpenCode Plugin Smoke Tests")` block
  5. Use `beforeAll` / `afterAll` for temp file setup/teardown in OC-06

  **Must NOT do**:
  - Do NOT call OpenCode CLI or spawn OpenCode process
  - Do NOT modify any handler files
  - Do NOT skip OC-08 (preflight gate test) — it's the only test for the soft-gate behavior
  - Do NOT use `console.log` in test output

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`CodingStandards`, `Test`, `TddWorkflow`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P2-03
  - **Parallel Group**: Wave 5
  - **Blocks**: F1-F4
  - **Blocked By**: P1-07, P2-01

  **References**:
  - `src/smoke-test.ts` — existing test runner style/conventions
  - `src/opencode/handlers/before.ts` — import path + exported factory function name
  - `src/opencode/handlers/after.ts` — import path + exported factory function name
  - `src/opencode/handlers/env.ts` — import path + exported factory function name
  - `src/opencode/handlers/session.ts` — import path + exported factory function name
  - `harness-policy.json` — high_risk_patterns + deny_patterns for test data

  **Acceptance Criteria**:
  - [ ] File `src/opencode-smoke-test.ts` exists
  - [ ] `bun test src/opencode-smoke-test.ts` passes — 8/8 tests green
  - [ ] `bun run src/smoke-test.ts` still passes 10/10 (regression gate)
  - [ ] `bun tsc --noEmit` passes
  - [ ] `grep -c "test(\|it(" src/opencode-smoke-test.ts` ≥ 8

  **TDD Workflow**:
  - **RED**: Write all 8 tests — they fail (handlers not wired yet if running before P1-07)
  - **GREEN**: After P1-07 complete, all 8 should pass without changes
  - **REFACTOR**: Add edge cases if gaps found
  - **GATE**: `bun tsc --noEmit && bun test src/opencode-smoke-test.ts && bun run src/smoke-test.ts`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All 8 OpenCode smoke tests pass
    Tool: Bash
    Preconditions: P1-07 and P2-01 complete
    Steps:
      1. Run: bun test src/opencode-smoke-test.ts
      2. Assert exit code: 0
      3. Assert output contains: "8 pass" or "8 tests passed"
    Expected Result: 8/8 pass, 0 failures
    Failure Indicators: Any FAIL, exit code != 0
    Evidence: .sisyphus/evidence/task-P2-02-smoke.txt

  Scenario: Regression gate — existing smoke tests unaffected
    Tool: Bash
    Preconditions: P2-02 complete
    Steps:
      1. Run: bun run src/smoke-test.ts
      2. Assert output contains: "10 passed" or "SMOKE TEST PASSED"
    Expected Result: 10/10 existing tests still pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-P2-02-regression.txt

  Scenario: Minimum test count
    Tool: Bash
    Steps:
      1. Run: grep -c "test(\|it(" src/opencode-smoke-test.ts
      2. Assert output >= 8
    Expected Result: At least 8 test cases
    Evidence: .sisyphus/evidence/task-P2-02-count.txt
  ```

  **Commit**: YES
  - Message: `test(opencode): add 8-test OpenCode plugin smoke suite`
  - Files: `src/opencode-smoke-test.ts`
  - Pre-commit: `bun tsc --noEmit && bun test src/opencode-smoke-test.ts && bun run src/smoke-test.ts`

---

- [ ] P2-03. Write `docs/OPENCODE-PORT.md` — regression table, ADRs, trade-offs

  **What to do**:
  1. Create `docs/OPENCODE-PORT.md` with these sections:
     - **Overview**: 1 paragraph — what the OpenCode plugin is, how it relates to the Claude Code harness
     - **Security Regression Register**: table with all 8 gaps from the plan's regression register (R1–R8) — columns: Gap | Severity | Claude Code Behavior | OpenCode Behavior | Mitigation | Status
     - **ADR-001: Shared core vs separate plugin** — Decision: separate. Rationale: zero risk to working Claude Code harness; ~500 lines = low duplication cost.
     - **ADR-002: HITL mechanism** — Decision: `permission.ask` native dialog. Rationale: custom terminal HITL fights the platform; native dialog preserves block/allow semantics. Known gap: no timeout, no custom UI, no audit trail in dialog — compensated by `tool.execute.before` audit logging.
     - **ADR-003: Preflight gate** — Decision: soft gate via generic `event` hook (filtering `session.created` events) + `tool.execute.before` blocker. NOTE: `session.created` is NOT a named hook — it is an event type in the SDK `Event` union, consumed via `"event": async ({ event }) => { if (event.type !== "session.created") return; ... }`. Rationale: OpenCode has no pre-session gate; accepted regression (R4) with async mutex to prevent race (R5).
     - **ADR-004: Plugin structure** — Decision: `src/opencode/` source + symlink of full `src/opencode/` directory tree to `.opencode/plugins/harness-security/` via `bun run src/install.ts -- --opencode`. Plugin entry in `opencode.json` points to `.opencode/plugins/harness-security/index.ts`. Symlinking the full tree (not just `index.ts`) is required so relative imports to `./handlers/*` and `../core/security.ts` resolve correctly. Rationale: single source of truth, easy to update. CLI wiring (`harness install --opencode`) is deferred to v2.
     - **Installation**: exact steps to install the plugin for a project — `bun run src/install.ts -- --opencode`, what it creates (`.opencode/plugins/harness-security/` directory symlink pointing to `src/opencode/`, `.opencode/plugins/core/` symlink pointing to `src/core/`, and the `opencode.json` plugin entry `.opencode/plugins/harness-security/index.ts`)
     - **Known Limitations**: bullet list of R1–R8 in plain English for end users
  2. All sections must be in markdown with proper headings

  **Must NOT do**:
  - Do NOT write implementation code in the doc
  - Do NOT invent regressions not in the plan's regression register
  - Do NOT use `console.log` examples in docs

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with P2-02
  - **Parallel Group**: Wave 5
  - **Blocks**: F1-F4
  - **Blocked By**: P1-07

  **References**:
  - Plan section "Security Regression Register" — all 8 rows verbatim
  - Plan section "Interview Summary" — ADR decisions + rationale
  - `docs/arch-review.md` — existing doc style to match
  - `docs/qa-report.md` — existing doc style to match

  **Acceptance Criteria**:
  - [ ] File `docs/OPENCODE-PORT.md` exists
  - [ ] `grep -c "^## " docs/OPENCODE-PORT.md` ≥ 6 (at least 6 top-level sections)
  - [ ] `grep -c "ADR-00" docs/OPENCODE-PORT.md` ≥ 4 (all 4 ADRs present)
  - [ ] `grep -c "| R" docs/OPENCODE-PORT.md` ≥ 8 (all 8 regression rows)
  - [ ] `test -f docs/OPENCODE-PORT.md` exits 0

  **TDD Workflow**: N/A — documentation task

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Document exists with required sections
    Tool: Bash
    Preconditions: P2-03 complete
    Steps:
      1. Run: test -f docs/OPENCODE-PORT.md && echo "EXISTS"
      2. Run: grep -c "^## " docs/OPENCODE-PORT.md
      3. Assert count >= 6
    Expected Result: File exists, 6+ top-level sections
    Failure Indicators: File not found, count < 6
    Evidence: .sisyphus/evidence/task-P2-03-sections.txt

  Scenario: All 4 ADRs present
    Tool: Bash
    Steps:
      1. Run: grep -c "ADR-00" docs/OPENCODE-PORT.md
      2. Assert count >= 4
    Expected Result: 4 ADRs documented
    Evidence: .sisyphus/evidence/task-P2-03-adrs.txt

  Scenario: All 8 regression rows present
    Tool: Bash
    Steps:
      1. Run: grep -c "| R" docs/OPENCODE-PORT.md
      2. Assert count >= 8
    Expected Result: 8 regression entries in table
    Evidence: .sisyphus/evidence/task-P2-03-regressions.txt
  ```

  **Commit**: YES
  - Message: `docs(opencode): add OPENCODE-PORT.md with regression register and ADRs`
  - Files: `docs/OPENCODE-PORT.md`
  - Pre-commit: `test -f docs/OPENCODE-PORT.md`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE.
> Present consolidated results to user and get explicit "okay" before completing.
> Never mark F1-F4 as checked before getting user's okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun tsc --noEmit`. Review all new/changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify `@opencode-ai/plugin` is devDependencies only.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Run: `bun test src/core/security.test.ts`, `bun run src/smoke-test.ts` (10/10), `bun test src/opencode-smoke-test.ts` (8+). Verify `bun tsc --noEmit` passes. Check `git diff --name-only src/hooks/ src/cli.ts src/preflight.ts .claude/hooks.json` returns empty. Save all output to `.sisyphus/evidence/final-qa/`.
  Output: `Core Tests [N/N pass] | Smoke [10/10] | OC Smoke [N/N] | TSC [PASS] | No-Mod [CLEAN] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no modifications to forbidden files, no production `@opencode-ai/plugin`, no custom tools. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Forbidden Files [CLEAN] | Dependencies [CLEAN] | VERDICT`

---

## Commit Strategy

> 8 atomic commits. Each commit passes gate: `bun tsc --noEmit && bun test && bun run src/smoke-test.ts`

| # | Message | Tasks | Gate | Files |
|---|---------|-------|------|-------|
| 1 | `feat(core): extract pure security functions to src/core/security.ts` | P0-01 | `bun tsc --noEmit` | `src/core/security.ts` |
| 2 | `test(core): add unit tests for all 6 core security functions` | P0-02 | `bun tsc --noEmit && bun test src/core/security.test.ts` | `src/core/security.test.ts` |
| 3 | `feat(opencode): scaffold plugin entry with policy loader and hook stubs` | P1-01 | `bun tsc --noEmit` | `src/opencode/index.ts` |
| 4 | `feat(opencode): implement tool.execute.before — sandbox, file deny, high-risk, Trivy` | P1-02 | `bun tsc --noEmit && bun test` | `src/opencode/handlers/before.ts` |
| 5 | `feat(opencode): implement tool.execute.after — Semgrep post-write scan` | P1-03 | `bun tsc --noEmit && bun test` | `src/opencode/handlers/after.ts` |
| 6 | `feat(opencode): implement event-hook preflight + shell.env + permission.ask` | P1-04, P1-05, P1-06 | `bun tsc --noEmit` | `src/opencode/handlers/session.ts`, `src/opencode/handlers/env.ts`, `src/opencode/handlers/permission.ts` |
| 7 | `feat(opencode): add fail-closed error boundaries and install --opencode flag` | P1-07, P2-01 | `bun tsc --noEmit && bun run src/smoke-test.ts` | `src/opencode/index.ts`, `src/install.ts` |
| 8 | `test(opencode): add smoke tests + OpenCode port documentation` | P2-02, P2-03 | `bun tsc --noEmit && bun test && bun run src/smoke-test.ts && bun test src/opencode-smoke-test.ts` | `src/opencode-smoke-test.ts`, `docs/OPENCODE-PORT.md` |

---

## Success Criteria

### Verification Commands

```bash
bun tsc --noEmit                           # Expected: zero errors
bun test src/core/security.test.ts         # Expected: all tests pass
bun run src/smoke-test.ts                  # Expected: 10 passed, 0 failed — SMOKE TEST PASSED
bun test src/opencode-smoke-test.ts         # Expected: 8+ passed, 0 failed
git diff --name-only src/hooks/ src/cli.ts src/preflight.ts .claude/hooks.json  # Expected: empty (no modifications)
grep '"@opencode-ai/plugin"' package.json  # Expected: appears in devDependencies only
test -f docs/OPENCODE-PORT.md              # Expected: exit 0 (file exists)
test -f src/core/security.ts               # Expected: exit 0
test -f src/opencode/index.ts              # Expected: exit 0
```

### Final Checklist

- [ ] All 6 core functions extracted and tested
- [ ] All 5 hook handlers implemented with fail-closed error boundaries
- [ ] Existing 10/10 smoke tests still pass (zero regression)
- [ ] New 8+ OpenCode smoke tests pass
- [ ] `@opencode-ai/plugin` in devDependencies only
- [ ] No modifications to `src/hooks/`, `src/cli.ts`, `src/preflight.ts`, `.claude/hooks.json`
- [ ] `docs/OPENCODE-PORT.md` contains regression table with all 8 gaps
- [ ] `bun run src/install.ts -- --opencode` creates `.opencode/plugins/harness-security/` directory tree and updates `opencode.json` with entry `.opencode/plugins/harness-security/index.ts`
- [ ] All "Must Have" present, all "Must NOT Have" absent
