# Aegis v2 — Scanner Infrastructure Hardening

## TL;DR

> **Quick Summary**: Add runtime timeout enforcement, scan result caching, verdict history logging, and a typed plugin→Aegis handoff schema — four atomic improvements that harden the scanner infrastructure backing the Aegis security agent.
>
> **Deliverables**:
> - `src/lib/scanner.ts` — Timeout-wrapped scanner invocation utility
> - `src/lib/scanner.test.ts` — Unit tests for scanner timeout + DEGRADED behavior
> - `src/lib/scan-cache.ts` — File-based scan result cache with TTL + key hashing
> - `src/lib/scan-cache.test.ts` — Unit tests for cache hit/miss/expiry/skip logic
> - `src/lib/verdict-log.ts` — NDJSON verdict event appender for `.harness/audit.log`
> - `src/lib/verdict-log.test.ts` — Unit tests for verdict event formatting + append
> - `src/types/aegis.ts` — `AegisHandoffEvent` TypeScript interface
> - Updated `src/opencode/handlers/after.ts` — Uses scanner wrapper instead of raw `semgrepScan`
> - Updated `src/opencode/handlers/before.ts` — Uses scanner wrapper instead of raw `trivyScan`
> - Updated `docs/agents/aegis.md` + `~/.config/opencode/agents/aegis.md` — Verdict history reading section
> - Updated `src/install.ts` — Creates `.harness/scan-cache/` directory
>
> **Estimated Effort**: Medium (~4-6 hours)
> **Parallel Execution**: YES — 3 waves (3 parallel in Wave 1, 1 in Wave 2, 1 in Wave 3)
> **Critical Path**: A2-01 → A2-02 → Integration smoke test

---

## Context

### Original Request

Implement the remaining "needs a plan" improvements for Aegis v2 — four atomic tasks that harden scanner infrastructure with timeouts, caching, verdict history, and a typed handoff schema.

### Prior Work (DO NOT re-implement)

- False-positive triage rules (docs/agents/aegis.md updated) ✅
- `.harness/audit.log` auto-creation in install.ts ✅
- Scope strategy table in agent prompt ✅
- TAB accessibility (confirmed working) ✅

### Self-Review Gap Analysis (Metis timed out)

**Identified Gaps** (addressed in plan):
1. **Handler refactoring scope** — `after.ts` calls `semgrepScan` directly, `before.ts` calls `trivyScan` directly. Both need updating to use the new scanner wrapper. Plan includes handler updates in A2-01.
2. **Bun.spawn timeout mechanism** — Bun has no `AbortSignal.timeout()` for spawned processes. Use `Promise.race` + `proc.kill()` pattern. Documented in A2-01.
3. **Cache directory creation** — `install.ts` creates `.harness/` but not `scan-cache/`. Plan updates `install.ts` in A2-02.
4. **`src/types/` directory** — Does not exist. A2-04 creates it.
5. **Verdict log caller** — Plugin doesn't orchestrate Aegis calls directly. `logVerdictEvent()` is a standalone export callable by any orchestrator. Documented in A2-03.

---

## Work Objectives

### Core Objective

Harden the scanner infrastructure that backs the Aegis agent and the OpenCode plugin with enforced timeouts, result caching, verdict history tracking, and a typed escalation contract.

### Concrete Deliverables

- Timeout-wrapped scanner utility with per-tool budgets
- File-based scan cache with TTL and intelligent invalidation
- NDJSON verdict event logging to audit log
- TypeScript interface for plugin→Aegis escalation handoff

### Definition of Done

- [ ] `bun tsc --noEmit` passes with zero errors
- [ ] `bun test` passes all existing + new tests
- [ ] `bun run src/smoke-test.ts` stays 10/10
- [ ] `bun test ./src/opencode-smoke-test.ts` stays 7+/8
- [ ] Scanner timeout fires after configured budget and reports DEGRADED
- [ ] Cache prevents redundant scans within TTL window
- [ ] Verdict events appear in `.harness/audit.log` as valid NDJSON
- [ ] `AegisHandoffEvent` interface compiles and is importable

### Must Have

- Per-scanner timeout budgets: semgrep 120s, trivy 60s, trufflehog 90s
- `Promise.race` + `proc.kill()` timeout mechanism (no npm deps)
- Cache key = scanner name + version + config hash + scope hash (file paths + mtimes)
- Cache TTL: 10 min for semgrep/trufflehog, 60 min for trivy
- Cache exclusions: failed runs, timed-out runs, CRITICAL findings
- NDJSON verdict event schema matching the spec in the request
- `AegisHandoffEvent` TypeScript interface with all specified fields
- Aegis prompt updated to read verdict history and note trends
- Both `after.ts` and `before.ts` updated to use scanner wrapper

### Must NOT Have (Guardrails)

- **No npm runtime dependencies** — Pure Bun built-ins only (`Bun.spawn`, `Bun.file`, `Bun.write`, `crypto`)
- **No Aegis write permissions** — `edit: deny` is permanent. Verdict log is written by plugin/harness, not Aegis
- **No changes to existing test assertions** — New tests only; existing tests must pass unchanged
- **No cache for failed/timed-out scans** — These must always re-run
- **No cache for CRITICAL findings** — Safety-critical results must never be stale
- **No refactoring of `core/security.ts` exports** — Scanner wrapper imports from it, doesn't replace it
- **No new npm packages** — `crypto.createHash` from Node built-ins for hashing

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES — `bun:test` with `describe/test/expect/spyOn` in `src/core/security.test.ts`
- **Automated tests**: YES (TDD) — RED → GREEN → REFACTOR per task
- **Framework**: `bun test`
- **Each new `src/lib/*.ts` file gets a co-located `src/lib/*.test.ts` file**

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **TypeScript compilation**: `bun tsc --noEmit`
- **Unit tests**: `bun test src/lib/scanner.test.ts` (etc.)
- **Smoke tests**: `bun run src/smoke-test.ts`
- **Integration**: `bun test ./src/opencode-smoke-test.ts`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent, MAX PARALLEL):
├── A2-01: Scanner Timeout Enforcement [deep]
├── A2-03: Verdict History Logging [unspecified-high]
└── A2-04: Plugin→Aegis Handoff Schema [quick]

Wave 2 (After A2-01 completes):
└── A2-02: Scan Result Caching [deep]

Wave 3 (After ALL tasks — integration verification):
└── A2-05: Integration Smoke Test [quick]

Critical Path: A2-01 → A2-02 → A2-05
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Task Dependency Graph

| Task | Depends On | Blocks | Reason |
|------|------------|--------|--------|
| A2-01 | None | A2-02, A2-05 | scanner.ts must exist before cache wraps it |
| A2-02 | A2-01 | A2-05 | scan-cache.ts is consumed by scanner.ts |
| A2-03 | None | A2-05 | Independent — writes to audit.log, no scanner dependency |
| A2-04 | None | A2-05 | Independent — pure type definition |
| A2-05 | A2-01, A2-02, A2-03, A2-04 | None | Verifies all tasks integrate correctly |

### Dependency Matrix

| Task | Depends On | Depended On By | Wave |
|------|------------|----------------|------|
| A2-01 | — | A2-02, A2-05 | 1 |
| A2-03 | — | A2-05 | 1 |
| A2-04 | — | A2-05 | 1 |
| A2-02 | A2-01 | A2-05 | 2 |
| A2-05 | A2-01, A2-02, A2-03, A2-04 | — | 3 |

### Agent Dispatch Summary

| Wave | Tasks | Dispatch |
|------|-------|----------|
| 1 | 3 | A2-01 → `deep`, A2-03 → `unspecified-high`, A2-04 → `quick` |
| 2 | 1 | A2-02 → `deep` |
| 3 | 1 | A2-05 → `quick` |
| FINAL | 4 | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> TDD: Write failing tests FIRST, then implement until green.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [ ] 1. A2-01: Scanner Timeout Enforcement

  **What to do**:
  1. **Write tests first** (`src/lib/scanner.test.ts`):
     - Test: `runScannerWithTimeout` returns `{ status: "ok", stdout, stderr, exitCode }` when process completes within budget
     - Test: `runScannerWithTimeout` returns `{ status: "timeout", stdout: "", stderr: "" }` when process exceeds budget (use `sleep 10` with 100ms budget)
     - Test: `runScannerWithTimeout` kills the child process on timeout (spy on proc.kill)
     - Test: `wrapSemgrep(filePath)` calls runScannerWithTimeout with 120_000ms budget
     - Test: `wrapTrivy(args)` calls runScannerWithTimeout with 60_000ms budget
     - Test: `wrapTrufflehog(args)` calls runScannerWithTimeout with 90_000ms budget
     - Test: timeout result includes `degraded: true` marker
  2. **Create `src/lib/scanner.ts`**:
     - Export type `ScannerResult = { status: "ok" | "timeout" | "error"; exitCode: number; stdout: string; stderr: string; degraded: boolean; durationMs: number }`
     - Export `SCANNER_BUDGETS = { semgrep: 120_000, trivy: 60_000, trufflehog: 90_000 } as const`
     - Export `async function runScannerWithTimeout(argv: string[], budgetMs: number): Promise<ScannerResult>`:
       - Spawn with `Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" })`
       - Race between `proc.exited` and `new Promise(resolve => setTimeout(resolve, budgetMs))`
       - On timeout: `proc.kill()`, return `{ status: "timeout", exitCode: -1, stdout: "", stderr: "", degraded: true, durationMs: budgetMs }`
       - On completion: return `{ status: "ok", exitCode, stdout, stderr, degraded: false, durationMs }`
       - Measure actual duration with `performance.now()`
     - Export convenience wrappers:
       - `wrapSemgrep(filePath: string): Promise<ScannerResult>` — calls `runScannerWithTimeout(["semgrep", "scan", "--config=p/security-audit", "--config=p/secrets", "--json", filePath], SCANNER_BUDGETS.semgrep)`
       - `wrapTrivy(args: string[]): Promise<ScannerResult>` — calls `runScannerWithTimeout(["trivy", ...args], SCANNER_BUDGETS.trivy)`
       - `wrapTrufflehog(args: string[]): Promise<ScannerResult>` — calls `runScannerWithTimeout(["trufflehog", ...args], SCANNER_BUDGETS.trufflehog)`
  3. **Update `src/opencode/handlers/after.ts`**:
     - Replace direct `semgrepScan(filePath)` call with `wrapSemgrep(filePath)`
     - Parse `stdout` from `ScannerResult` to extract findings (reuse `SemgrepResult` type from `core/security.ts`)
     - If `result.degraded`, append `[HARNESS] ⚠️ Semgrep DEGRADED: scan timed out after 120s` to output
  4. **Update `src/opencode/handlers/before.ts`**:
     - Replace direct `trivyScan(pkg)` call with `wrapTrivy(["fs", "--scanners", "vuln", "--severity", "HIGH,CRITICAL", "--exit-code", "1", "--quiet", "--format", "json", scanDir])`
     - If `result.degraded`, log warning but do NOT block (fail-open for trivy timeout — same behavior as "trivy not installed")
     - Keep the existing lockfile tempdir creation logic from `trivyScan` — extract into a helper or keep inline

  **Must NOT do**:
  - Do NOT remove `semgrepScan` or `trivyScan` from `core/security.ts` — they stay as reference implementations
  - Do NOT add any npm dependencies — use only `Bun.spawn`, `performance.now()`, `setTimeout`, `proc.kill()`
  - Do NOT change the handler function signatures — only internal implementation
  - Do NOT change how findings are reported to the output — same format, just wrapped
  - Do NOT add `console.log` — use `process.stderr.write` for debug output if needed

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This task involves process lifecycle management (spawn, timeout, kill), async race conditions, and updating two handler files while preserving existing behavior. Requires careful implementation to avoid resource leaks.
  - **Skills**: [`CodingStandards`, `TddWorkflow`, `Build`]
    - `CodingStandards`: TypeScript conventions, Bun patterns, type safety
    - `TddWorkflow`: RED→GREEN→REFACTOR cycle for each test
    - `Build`: Compile gate + incremental verification
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: Not auditing code — building infrastructure
    - `BackendDesign`: No API design — utility function

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A2-03, A2-04)
  - **Blocks**: A2-02 (cache wraps scanner.ts), A2-05 (integration test)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/lib/base.ts:38-62` — `runCommandCapture` function: spawn pattern, stdout/stderr capture, `Promise.all` for exit+streams. Follow this exact spawn pattern but add timeout racing.
  - `src/lib/base.ts:1-7` — `CommandResult` type: model `ScannerResult` after this shape (exitCode, stdout, stderr) with additions (status, degraded, durationMs).
  - `src/core/security.ts:138-175` — `trivyScan` function: current trivy invocation pattern including tempdir creation, `Bun.spawn`, exit code interpretation. The new `wrapTrivy` convenience function should produce equivalent behavior.
  - `src/core/security.ts:185-220` — `semgrepScan` function: current semgrep invocation. The new `wrapSemgrep` should produce compatible output for finding extraction.

  **API/Type References** (contracts to implement against):
  - `src/core/security.ts:18-23` — `SemgrepFinding` type: the return shape from semgrep scan parsing. After.ts must still produce this shape from `ScannerResult.stdout`.
  - `src/core/security.ts:25-34` — `SemgrepResult` type: JSON shape from semgrep stdout. Parse this from `ScannerResult.stdout`.
  - `src/opencode/handlers/after.ts:1-13` — Current after handler: replace line 8 (`semgrepScan`) with scanner wrapper call.
  - `src/opencode/handlers/before.ts:33-37` — Current trivy call site: replace with scanner wrapper.

  **Test References** (testing patterns to follow):
  - `src/core/security.test.ts:42-47` — `makeUnavailableSpawnResult` mock: pattern for mocking `Bun.spawn` to simulate unavailable tools. Use similar approach for timeout testing.
  - `src/core/security.test.ts:200-226` — Trivy test with spyOn: pattern for spy-based spawn testing.

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `src/lib/scanner.test.ts`
  - [ ] `bun test src/lib/scanner.test.ts` → PASS (7+ tests, 0 failures)
  - [ ] `bun tsc --noEmit` → 0 errors
  - [ ] `bun run src/smoke-test.ts` → 10/10
  - [ ] `bun test ./src/opencode-smoke-test.ts` → 7+/8

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Scanner completes within budget
    Tool: Bash
    Preconditions: src/lib/scanner.ts exists, bun test works
    Steps:
      1. Run: bun test src/lib/scanner.test.ts --filter "completes within budget"
      2. Assert: test passes
      3. Run: bun -e "import { runScannerWithTimeout } from './src/lib/scanner.ts'; const r = await runScannerWithTimeout(['echo', 'hello'], 5000); console.log(JSON.stringify(r))"
      4. Assert: output contains "status":"ok" and "degraded":false
    Expected Result: ScannerResult with status=ok, degraded=false, stdout containing output
    Failure Indicators: status=timeout, degraded=true, or thrown error
    Evidence: .sisyphus/evidence/task-1-scanner-ok.txt

  Scenario: Scanner times out and returns DEGRADED
    Tool: Bash
    Preconditions: src/lib/scanner.ts exists
    Steps:
      1. Run: bun test src/lib/scanner.test.ts --filter "timeout"
      2. Assert: test passes
      3. Run: bun -e "import { runScannerWithTimeout } from './src/lib/scanner.ts'; const r = await runScannerWithTimeout(['sleep', '10'], 200); console.log(JSON.stringify(r))"
      4. Assert: output contains "status":"timeout" and "degraded":true
      5. Assert: process completes in <1s (not waiting for sleep 10)
    Expected Result: Timeout triggers within budget, process killed, degraded=true
    Failure Indicators: Hangs for 10s, status=ok, or process not killed
    Evidence: .sisyphus/evidence/task-1-scanner-timeout.txt

  Scenario: Budget constants are correct
    Tool: Bash
    Preconditions: src/lib/scanner.ts exists
    Steps:
      1. Run: bun -e "import { SCANNER_BUDGETS } from './src/lib/scanner.ts'; console.log(JSON.stringify(SCANNER_BUDGETS))"
      2. Assert: semgrep=120000, trivy=60000, trufflehog=90000
    Expected Result: All three budget values match spec
    Failure Indicators: Wrong values or missing keys
    Evidence: .sisyphus/evidence/task-1-budgets.txt

  Scenario: after.ts uses scanner wrapper
    Tool: Bash
    Preconditions: src/opencode/handlers/after.ts updated
    Steps:
      1. Run: grep "wrapSemgrep\|scanner" src/opencode/handlers/after.ts
      2. Assert: match found (uses scanner wrapper)
      3. Run: grep "semgrepScan" src/opencode/handlers/after.ts
      4. Assert: no direct semgrepScan import (only via scanner wrapper)
    Expected Result: after.ts imports from scanner.ts, not directly from core/security.ts for scanning
    Failure Indicators: Still imports semgrepScan directly
    Evidence: .sisyphus/evidence/task-1-after-handler.txt

  Scenario: Existing smoke tests still pass
    Tool: Bash
    Preconditions: All changes committed
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert: exit code 0
      3. Run: bun run src/smoke-test.ts
      4. Assert: "10 passed, 0 failed"
    Expected Result: Zero regressions
    Failure Indicators: Any test fails or tsc errors
    Evidence: .sisyphus/evidence/task-1-smoke.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-scanner-ok.txt
  - [ ] task-1-scanner-timeout.txt
  - [ ] task-1-budgets.txt
  - [ ] task-1-after-handler.txt
  - [ ] task-1-smoke.txt

  **Commit**: YES
  - Message: `feat(scanner): add timeout-wrapped scanner invocations`
  - Files: `src/lib/scanner.ts`, `src/lib/scanner.test.ts`, `src/opencode/handlers/after.ts`, `src/opencode/handlers/before.ts`
  - Pre-commit: `bun tsc --noEmit && bun test src/lib/scanner.test.ts && bun run src/smoke-test.ts`

---

- [ ] 2. A2-04: Plugin→Aegis Handoff Schema

  **What to do**:
  1. **Create `src/types/` directory** (does not exist yet)
  2. **Create `src/types/aegis.ts`** with:
     ```typescript
     export type AegisTaskType =
       | "full-audit"
       | "deep-scan"
       | "dependency-audit"
       | "auth-review"
       | "pre-merge-review"
       | "audit-override"
       | "infra-review";

     export type AegisHandoffEvent = {
       triggerType: AegisTaskType;
       scopePaths: string[];
       auditLogEventIds: string[];
       scannerFindings: {
         semgrep: { count: number; maxSeverity: string } | null;
         trivy: { count: number; maxSeverity: string } | null;
         trufflehog: { count: number } | null;
       };
       branch: string;
       commit: string;
       timestamp: string;
     };
     ```
  3. **Verify** the type compiles and is importable from other modules

  **Must NOT do**:
  - Do NOT add runtime code — this is types only (zero runtime footprint)
  - Do NOT add npm dependencies
  - Do NOT add class implementations — interfaces/types only
  - Do NOT import this type into existing handlers yet — that's future work when escalation triggers are implemented in code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definition. No logic, no tests needed (types are compile-time only). Single file creation.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: TypeScript type conventions, naming patterns
  - **Skills Evaluated but Omitted**:
    - `BackendDesign`: No API design — just a type file
    - `TddWorkflow`: Types have no runtime behavior to test

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A2-01, A2-03)
  - **Blocks**: A2-05 (integration test verifies it compiles)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/core/security.ts:10-34` — Existing inline type definitions (`PackageEcosystem`, `ParsedInstall`, `SemgrepFinding`, `SemgrepResult`). Follow this naming convention (PascalCase types, explicit field types).
  - `src/opencode/index.ts:10-21` — `HarnessPolicy` type: another inline type. The new `src/types/aegis.ts` file establishes the pattern for a dedicated types directory.

  **API/Type References**:
  - User specification in request: exact fields for `AegisHandoffEvent` — `triggerType`, `scopePaths`, `auditLogEventIds`, `scannerFindings`, `branch`, `commit`, `timestamp`.
  - `docs/agents/aegis.md:89-136` — Task types list. The `AegisTaskType` union must match these exactly.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Type file compiles without errors
    Tool: Bash
    Preconditions: src/types/aegis.ts created
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert: exit code 0 (no compilation errors)
    Expected Result: Clean compile
    Failure Indicators: Type errors referencing aegis.ts
    Evidence: .sisyphus/evidence/task-2-tsc.txt

  Scenario: Type is importable from another module
    Tool: Bash
    Preconditions: src/types/aegis.ts exists
    Steps:
      1. Run: bun -e "import type { AegisHandoffEvent, AegisTaskType } from './src/types/aegis.ts'; const x: AegisTaskType = 'full-audit'; console.log('OK:', x)"
      2. Assert: output contains "OK: full-audit"
    Expected Result: Type imports and compiles successfully
    Failure Indicators: Import error, type error
    Evidence: .sisyphus/evidence/task-2-import.txt

  Scenario: All 7 task types are defined
    Tool: Bash
    Preconditions: src/types/aegis.ts exists
    Steps:
      1. For each of: "full-audit", "deep-scan", "dependency-audit", "auth-review", "pre-merge-review", "audit-override", "infra-review"
      2. Run: grep "<task-type>" src/types/aegis.ts
      3. Assert: each returns a match
    Expected Result: All 7 task types present in the union type
    Failure Indicators: Any task type missing
    Evidence: .sisyphus/evidence/task-2-task-types.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-tsc.txt
  - [ ] task-2-import.txt
  - [ ] task-2-task-types.txt

  **Commit**: YES
  - Message: `feat(aegis): add AegisHandoffEvent handoff schema`
  - Files: `src/types/aegis.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [ ] 3. A2-03: Verdict History Logging

  **What to do**:
  1. **Write tests first** (`src/lib/verdict-log.test.ts`):
     - Test: `formatVerdictEvent` returns valid NDJSON string with all required fields
     - Test: `formatVerdictEvent` includes `type: "aegis_verdict"`, ISO timestamp, task, verdict, findings summary, degraded array, commit, scope
     - Test: `appendVerdictEvent` appends a newline-terminated JSON line to a file
     - Test: `appendVerdictEvent` creates parent directory if missing (via `ensureDir`)
     - Test: `readRecentVerdicts` reads last N verdict events from file
     - Test: `readRecentVerdicts` returns empty array for missing/empty file
     - Test: `readRecentVerdicts` skips malformed lines
  2. **Create `src/lib/verdict-log.ts`**:
     - Export type `VerdictEvent`:
       ```typescript
       export type VerdictEvent = {
         type: "aegis_verdict";
         ts: string;
         task: string;
         verdict: "SAFE" | "RISKY" | "BLOCKED";
         findings: { critical: number; high: number; medium: number; low: number; info: number };
         degraded: string[];
         commit: string;
         scope: string;
       };
       ```
     - Export `function formatVerdictEvent(event: Omit<VerdictEvent, "type" | "ts">): string`:
       - Returns `JSON.stringify({ type: "aegis_verdict", ts: formatTimestamp(), ...event }) + "\n"`
       - Import `formatTimestamp` from `./base.ts`
     - Export `async function appendVerdictEvent(logPath: string, event: Omit<VerdictEvent, "type" | "ts">): Promise<void>`:
       - Uses `appendText` from `./base.ts` to append the formatted event
     - Export `async function readRecentVerdicts(logPath: string, count: number = 10): Promise<VerdictEvent[]>`:
       - Read file, split by newline, filter for lines containing `"aegis_verdict"`, JSON.parse each, return last N
       - Handle missing file (return []), empty file (return []), malformed lines (skip with try/catch)
  3. **Update `docs/agents/aegis.md`** — Add a `## Verdict History` section BEFORE `## Task Types`:
     ```markdown
     ## Verdict History

     When `.harness/audit.log` contains `aegis_verdict` events, read the last 10 entries
     before producing your verdict. Note the trend:
     - **Improving**: severity counts decreasing over recent verdicts
     - **Stable**: no significant change
     - **Degrading**: severity counts increasing or new CRITICAL findings

     Include trend in your verdict header:
     `**Trend**: Improving (3 recent verdicts: RISKY → RISKY → SAFE)`

     If no verdict history exists, omit the Trend line.
     ```
  4. **Copy updated aegis.md to live path**: `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md`

  **Must NOT do**:
  - Do NOT make Aegis write verdict events — it is read-only. The harness/plugin writes, Aegis reads.
  - Do NOT add npm dependencies — use `Bun.file`, `appendText` from base.ts
  - Do NOT modify existing audit.log format — verdict events are additive NDJSON lines
  - Do NOT add log rotation — out of scope for this task
  - Do NOT change existing rules in aegis.md — only add the new section

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Involves both TypeScript utility code (TDD) and markdown prompt editing. Not as complex as scanner timeout, but needs attention to NDJSON format and aegis prompt integration.
  - **Skills**: [`CodingStandards`, `TddWorkflow`, `Build`]
    - `CodingStandards`: TypeScript patterns, Bun file I/O
    - `TddWorkflow`: RED→GREEN→REFACTOR for verdict-log tests
    - `Build`: Compile gate
  - **Skills Evaluated but Omitted**:
    - `Prompting`: Aegis prompt change is minor (one section addition), not a full prompt rewrite
    - `SecurityReview`: Not auditing — building logging infrastructure

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A2-01, A2-04)
  - **Blocks**: A2-05
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/base.ts:121-125` — `appendText` function: appends to file, creates parent dir with `ensureDir`. Use this for verdict event writing.
  - `src/lib/base.ts:127-129` — `formatTimestamp` function: ISO 8601 timestamp. Use this for the `ts` field.
  - `src/lib/base.ts:111-113` — `fileExists` function: check before reading log file.

  **API/Type References**:
  - User specification: exact NDJSON schema `{"type":"aegis_verdict","ts":"...","task":"full-audit","verdict":"RISKY","findings":{"critical":0,"high":0,"medium":3,"low":1,"info":2},"degraded":[],"commit":"abc123","scope":"full"}`
  - `docs/agents/aegis.md:93-99` — `full-audit` task type: line 98 reads `.harness/audit.log`. The new verdict history section enhances what Aegis looks for in the log.
  - `docs/agents/aegis.md:138-165` — Response format: the Trend line goes in the verdict header.

  **Test References**:
  - `src/core/security.test.ts:1-13` — Import pattern for bun:test (describe, expect, spyOn, test).

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Test file created: `src/lib/verdict-log.test.ts`
  - [ ] `bun test src/lib/verdict-log.test.ts` → PASS (7 tests, 0 failures)
  - [ ] `bun tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verdict event formats correctly as NDJSON
    Tool: Bash
    Preconditions: src/lib/verdict-log.ts exists
    Steps:
      1. Run: bun -e "import { formatVerdictEvent } from './src/lib/verdict-log.ts'; console.log(formatVerdictEvent({ task: 'full-audit', verdict: 'SAFE', findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, degraded: [], commit: 'abc123', scope: 'full' }))"
      2. Assert: output is valid JSON with type="aegis_verdict", ts field present, all finding counts present
      3. Run: echo '<output>' | python3 -c "import sys,json; json.load(sys.stdin)"
      4. Assert: valid JSON (exit 0)
    Expected Result: Single-line valid JSON with all required fields
    Failure Indicators: Missing fields, invalid JSON, multi-line output
    Evidence: .sisyphus/evidence/task-3-format.txt

  Scenario: Verdict event appends to audit.log
    Tool: Bash
    Preconditions: src/lib/verdict-log.ts exists
    Steps:
      1. Run: bun -e "import { appendVerdictEvent } from './src/lib/verdict-log.ts'; await appendVerdictEvent('/tmp/test-audit.log', { task: 'full-audit', verdict: 'RISKY', findings: { critical: 0, high: 1, medium: 2, low: 0, info: 0 }, degraded: ['trufflehog'], commit: 'def456', scope: 'full' }); console.log(await Bun.file('/tmp/test-audit.log').text())"
      2. Assert: file contains one NDJSON line with aegis_verdict type
      3. Cleanup: rm /tmp/test-audit.log
    Expected Result: Event appended to file as newline-terminated JSON
    Failure Indicators: File not created, invalid JSON in file
    Evidence: .sisyphus/evidence/task-3-append.txt

  Scenario: readRecentVerdicts returns parsed events
    Tool: Bash
    Preconditions: src/lib/verdict-log.ts exists
    Steps:
      1. Write 3 verdict NDJSON lines to /tmp/test-read-audit.log
      2. Run: bun -e "import { readRecentVerdicts } from './src/lib/verdict-log.ts'; const r = await readRecentVerdicts('/tmp/test-read-audit.log', 2); console.log(JSON.stringify(r))"
      3. Assert: array of 2 elements, each with type="aegis_verdict"
      4. Cleanup: rm /tmp/test-read-audit.log
    Expected Result: Last 2 verdict events returned as parsed objects
    Failure Indicators: Wrong count, parse errors, missing fields
    Evidence: .sisyphus/evidence/task-3-read.txt

  Scenario: Aegis prompt has Verdict History section
    Tool: Bash
    Preconditions: docs/agents/aegis.md updated
    Steps:
      1. Run: grep "## Verdict History" docs/agents/aegis.md
      2. Assert: match found
      3. Run: grep "aegis_verdict" docs/agents/aegis.md
      4. Assert: match found
      5. Run: grep -i "trend\|improving\|stable\|degrading" docs/agents/aegis.md
      6. Assert: at least 3 matches (trend terminology)
    Expected Result: Verdict History section with trend analysis instructions
    Failure Indicators: Missing section or trend instructions
    Evidence: .sisyphus/evidence/task-3-prompt.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-format.txt
  - [ ] task-3-append.txt
  - [ ] task-3-read.txt
  - [ ] task-3-prompt.txt

  **Commit**: YES
  - Message: `feat(aegis): add verdict history logging and prompt update`
  - Files: `src/lib/verdict-log.ts`, `src/lib/verdict-log.test.ts`, `docs/agents/aegis.md`
  - Pre-commit: `bun tsc --noEmit && bun test src/lib/verdict-log.test.ts`
  - Post-commit: `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md`

---

- [ ] 4. A2-02: Scan Result Caching

  **What to do**:
  1. **Write tests first** (`src/lib/scan-cache.test.ts`):
     - Test: `computeCacheKey` returns deterministic SHA-256 hash from scanner name + version + config + scope
     - Test: `computeCacheKey` with different inputs produces different hashes
     - Test: `writeCacheEntry` writes valid JSON to `.harness/scan-cache/<key>.json`
     - Test: `readCacheEntry` returns cached result when within TTL
     - Test: `readCacheEntry` returns null when TTL expired
     - Test: `readCacheEntry` returns null for missing cache file
     - Test: `shouldSkipCache` returns true for timed-out scans (status=timeout)
     - Test: `shouldSkipCache` returns true for error scans (status=error)
     - Test: `shouldSkipCache` returns true when stdout contains CRITICAL severity
     - Test: `shouldSkipCache` returns false for clean ok results
     - Test: `getCacheTtl` returns 600_000 (10 min) for semgrep/trufflehog
     - Test: `getCacheTtl` returns 3_600_000 (60 min) for trivy
  2. **Create `src/lib/scan-cache.ts`**:
     - Import `crypto` from `node:crypto` (Node built-in, no npm dep)
     - Import `ensureDir`, `fileExists` from `./base.ts`
     - Export type `CacheEntry = { key: string; timestamp: number; ttl: number; result: ScannerResult }`
     - Import `ScannerResult` from `./scanner.ts`
     - Export `CACHE_DIR = ".harness/scan-cache"` constant
     - Export `CACHE_TTLS = { semgrep: 600_000, trivy: 3_600_000, trufflehog: 600_000 } as const`
     - Export `function computeCacheKey(scanner: string, version: string, config: string, scopeHash: string): string`:
       - `crypto.createHash("sha256").update([scanner, version, config, scopeHash].join("|")).digest("hex").slice(0, 16)`
     - Export `function computeScopeHash(filePaths: string[], mtimes: number[]): string`:
       - Sort filePaths, join with mtimes, SHA-256 hash, take first 16 chars
     - Export `async function readCacheEntry(cacheDir: string, key: string): Promise<CacheEntry | null>`:
       - Read `<cacheDir>/<key>.json`, parse JSON, check `Date.now() - entry.timestamp < entry.ttl`
       - Return null if expired, missing, or parse error
     - Export `async function writeCacheEntry(cacheDir: string, entry: CacheEntry): Promise<void>`:
       - `ensureDir(cacheDir)`, `Bun.write(<cacheDir>/<key>.json, JSON.stringify(entry))`
     - Export `function shouldSkipCache(result: ScannerResult): boolean`:
       - Returns true if `result.status !== "ok"` (timeout or error)
       - Returns true if `result.stdout` contains `"CRITICAL"` (case-sensitive)
       - Returns false otherwise
     - Export `function getCacheTtl(scanner: string): number`:
       - Returns the TTL from `CACHE_TTLS` or 600_000 as default
  3. **Update `src/lib/scanner.ts`** — Add cache integration to convenience wrappers:
     - Before running scanner: check `readCacheEntry`
     - If cache hit: return cached `ScannerResult` (with `status: "cached"` added to the union)
     - If cache miss: run scanner, check `shouldSkipCache`, write cache if allowed
     - Update `ScannerResult.status` union to include `"cached"`
  4. **Update `src/install.ts`** — Add `.harness/scan-cache/` creation after `.harness/` creation:
     ```typescript
     await ensureDir(join(targetDir, ".harness", "scan-cache"));
     ```

  **Must NOT do**:
  - Do NOT cache results where `status` is `timeout` or `error` — always re-run
  - Do NOT cache results containing CRITICAL findings — safety-critical must be fresh
  - Do NOT use file locking — single-user tool, no concurrency concerns
  - Do NOT add npm dependencies — `crypto.createHash` is a Node built-in
  - Do NOT implement cache eviction/rotation — TTL-based expiry is sufficient
  - Do NOT change `ScannerResult` type incompatibly — `"cached"` is additive to the union

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: File-based caching with hash computation, TTL logic, and integration with the scanner wrapper. Requires careful handling of cache invalidation edge cases and thread-safe file operations.
  - **Skills**: [`CodingStandards`, `TddWorkflow`, `Build`]
    - `CodingStandards`: TypeScript, Bun file I/O, crypto patterns
    - `TddWorkflow`: 12 tests to write first
    - `Build`: Compile gate + smoke test gate
  - **Skills Evaluated but Omitted**:
    - `BackendDesign`: No database or API — file-based cache only

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after A2-01)
  - **Blocks**: A2-05
  - **Blocked By**: A2-01 (needs `ScannerResult` type and `src/lib/scanner.ts`)

  **References**:

  **Pattern References**:
  - `src/lib/scanner.ts` (created in A2-01) — `ScannerResult` type and wrapper functions. Cache integrates into the convenience wrappers.
  - `src/lib/base.ts:104-109` — `ensureDir` function: create cache directory.
  - `src/lib/base.ts:111-113` — `fileExists` function: check cache entry existence.
  - `src/install.ts:96-103` — `.harness/` and `audit.log` creation pattern. Follow this for adding `scan-cache/` directory creation.

  **API/Type References**:
  - User specification: cache key = scanner name + version + config hash + scope hash (file paths + mtimes). TTL: 10 min semgrep/trufflehog, 60 min trivy. Cache format: `{ key, timestamp, ttl, result }`. Never cache: failures, timeouts, CRITICALs.
  - `docs/design/aegis-dual-component-design.md:238-247` — Shared state architecture showing `.harness/scan-cache/` in the directory tree.

  **Test References**:
  - `src/core/security.test.ts:1-13` — Import pattern for bun:test.
  - `src/lib/scanner.test.ts` (created in A2-01) — Testing patterns for scanner module.

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Test file created: `src/lib/scan-cache.test.ts`
  - [ ] `bun test src/lib/scan-cache.test.ts` → PASS (12 tests, 0 failures)
  - [ ] `bun tsc --noEmit` → 0 errors
  - [ ] `bun run src/smoke-test.ts` → 10/10

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cache key is deterministic
    Tool: Bash
    Preconditions: src/lib/scan-cache.ts exists
    Steps:
      1. Run: bun -e "import { computeCacheKey } from './src/lib/scan-cache.ts'; const a = computeCacheKey('semgrep', '1.0', 'p/security', 'abc'); const b = computeCacheKey('semgrep', '1.0', 'p/security', 'abc'); console.log(a === b ? 'DETERMINISTIC' : 'NON-DETERMINISTIC')"
      2. Assert: output is "DETERMINISTIC"
    Expected Result: Same inputs produce same key
    Failure Indicators: Output is "NON-DETERMINISTIC"
    Evidence: .sisyphus/evidence/task-4-cache-key.txt

  Scenario: Cache write and read within TTL
    Tool: Bash
    Preconditions: src/lib/scan-cache.ts exists
    Steps:
      1. Run: bun -e "
         import { writeCacheEntry, readCacheEntry } from './src/lib/scan-cache.ts';
         const entry = { key: 'test123', timestamp: Date.now(), ttl: 600000, result: { status: 'ok', exitCode: 0, stdout: '{}', stderr: '', degraded: false, durationMs: 100 } };
         await writeCacheEntry('/tmp/test-cache', entry);
         const read = await readCacheEntry('/tmp/test-cache', 'test123');
         console.log(read ? 'HIT' : 'MISS');
         "
      2. Assert: output is "HIT"
      3. Cleanup: rm -rf /tmp/test-cache
    Expected Result: Cache hit for fresh entry
    Failure Indicators: Output is "MISS" or error
    Evidence: .sisyphus/evidence/task-4-cache-hit.txt

  Scenario: Cache returns null for expired entry
    Tool: Bash
    Preconditions: src/lib/scan-cache.ts exists
    Steps:
      1. Write cache entry with timestamp 1 hour ago and TTL of 1ms
      2. Read same key
      3. Assert: returns null (expired)
    Expected Result: Expired cache treated as miss
    Failure Indicators: Returns stale data
    Evidence: .sisyphus/evidence/task-4-cache-expired.txt

  Scenario: shouldSkipCache rejects timeout and CRITICAL results
    Tool: Bash
    Preconditions: src/lib/scan-cache.ts exists
    Steps:
      1. Run: bun -e "
         import { shouldSkipCache } from './src/lib/scan-cache.ts';
         console.log('timeout:', shouldSkipCache({ status: 'timeout', exitCode: -1, stdout: '', stderr: '', degraded: true, durationMs: 120000 }));
         console.log('critical:', shouldSkipCache({ status: 'ok', exitCode: 1, stdout: '{\"severity\":\"CRITICAL\"}', stderr: '', degraded: false, durationMs: 5000 }));
         console.log('clean:', shouldSkipCache({ status: 'ok', exitCode: 0, stdout: '{}', stderr: '', degraded: false, durationMs: 1000 }));
         "
      2. Assert: timeout=true, critical=true, clean=false
    Expected Result: Timeouts and CRITICALs never cached; clean results cacheable
    Failure Indicators: Wrong boolean for any case
    Evidence: .sisyphus/evidence/task-4-skip-cache.txt

  Scenario: install.ts creates scan-cache directory
    Tool: Bash
    Preconditions: src/install.ts updated
    Steps:
      1. Run: grep "scan-cache" src/install.ts
      2. Assert: match found (directory creation logic)
    Expected Result: install.ts creates .harness/scan-cache/ directory
    Failure Indicators: No reference to scan-cache in install.ts
    Evidence: .sisyphus/evidence/task-4-install.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-cache-key.txt
  - [ ] task-4-cache-hit.txt
  - [ ] task-4-cache-expired.txt
  - [ ] task-4-skip-cache.txt
  - [ ] task-4-install.txt

  **Commit**: YES
  - Message: `feat(scanner): add file-based scan result caching`
  - Files: `src/lib/scan-cache.ts`, `src/lib/scan-cache.test.ts`, `src/lib/scanner.ts`, `src/install.ts`
  - Pre-commit: `bun tsc --noEmit && bun test src/lib/scan-cache.test.ts && bun run src/smoke-test.ts`

---

- [ ] 5. A2-05: Integration Smoke Test

  **What to do**:
  1. Verify all new modules compile together: `bun tsc --noEmit`
  2. Run all unit tests: `bun test`
  3. Run existing smoke test: `bun run src/smoke-test.ts` → 10/10
  4. Run opencode smoke test: `bun test ./src/opencode-smoke-test.ts` → 7+/8
  5. Verify cross-module integration:
     - Import `ScannerResult` from `src/lib/scanner.ts` and `CacheEntry` from `src/lib/scan-cache.ts` — types are compatible
     - Import `VerdictEvent` from `src/lib/verdict-log.ts` — compiles
     - Import `AegisHandoffEvent` from `src/types/aegis.ts` — compiles
  6. Verify `.harness/scan-cache/` directory creation in install.ts code
  7. Verify Aegis prompt has the Verdict History section
  8. Document all results in `.sisyphus/evidence/task-5-integration.md`

  **Must NOT do**:
  - Do NOT modify any source files — this is verification only
  - Do NOT skip any verification step

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification-only task. Run commands, check outputs, document. No implementation.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: Understands TypeScript compilation and test patterns
  - **Skills Evaluated but Omitted**:
    - `TddWorkflow`: Not writing tests — verifying existing
    - `Build`: Not building — verifying build passes

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after all implementation tasks)
  - **Blocks**: None
  - **Blocked By**: A2-01, A2-02, A2-03, A2-04

  **References**:
  - All files created in A2-01 through A2-04
  - `src/smoke-test.ts` — Existing smoke test runner
  - `src/opencode-smoke-test.ts` — OpenCode plugin smoke test

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full compilation passes
    Tool: Bash
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert: exit code 0
    Expected Result: Zero TypeScript errors
    Evidence: .sisyphus/evidence/task-5-tsc.txt

  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: bun test
      2. Assert: exit code 0, all tests pass
    Expected Result: All existing + new tests green
    Evidence: .sisyphus/evidence/task-5-tests.txt

  Scenario: Smoke tests unchanged
    Tool: Bash
    Steps:
      1. Run: bun run src/smoke-test.ts
      2. Assert: "10 passed, 0 failed"
      3. Run: bun test ./src/opencode-smoke-test.ts
      4. Assert: 7+ out of 8 pass
    Expected Result: Zero regressions from baseline
    Evidence: .sisyphus/evidence/task-5-smoke.txt

  Scenario: Cross-module type compatibility
    Tool: Bash
    Steps:
      1. Run: bun -e "
         import type { ScannerResult } from './src/lib/scanner.ts';
         import type { CacheEntry } from './src/lib/scan-cache.ts';
         import type { VerdictEvent } from './src/lib/verdict-log.ts';
         import type { AegisHandoffEvent } from './src/types/aegis.ts';
         console.log('All types import OK');
         "
      2. Assert: output contains "All types import OK"
    Expected Result: All new types are importable and compatible
    Evidence: .sisyphus/evidence/task-5-types.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-tsc.txt
  - [ ] task-5-tests.txt
  - [ ] task-5-smoke.txt
  - [ ] task-5-types.txt
  - [ ] task-5-integration.md (summary)

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [5/5] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun tsc --noEmit`. Review all new files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify zero npm runtime deps added.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (scanner wrapper → cache → verdict log). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [5/5 compliant] | Creep [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit | Message | Files |
|------|--------|---------|-------|
| A2-01 | YES | `feat(scanner): add timeout-wrapped scanner invocations` | `src/lib/scanner.ts`, `src/lib/scanner.test.ts`, `src/opencode/handlers/after.ts`, `src/opencode/handlers/before.ts` |
| A2-02 | YES | `feat(scanner): add file-based scan result caching` | `src/lib/scan-cache.ts`, `src/lib/scan-cache.test.ts`, `src/lib/scanner.ts` (cache integration), `src/install.ts` |
| A2-03 | YES | `feat(aegis): add verdict history logging and prompt update` | `src/lib/verdict-log.ts`, `src/lib/verdict-log.test.ts`, `docs/agents/aegis.md` |
| A2-04 | YES | `feat(aegis): add AegisHandoffEvent handoff schema` | `src/types/aegis.ts` |
| A2-05 | NO | (verification only) | — |

---

## Success Criteria

### Verification Commands
```bash
bun tsc --noEmit            # Expected: 0 errors
bun test                    # Expected: all pass (existing + new)
bun run src/smoke-test.ts   # Expected: 10/10 PASS
bun test ./src/opencode-smoke-test.ts  # Expected: 7+/8
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] No npm runtime dependencies added
- [ ] Aegis `edit: deny` unchanged
