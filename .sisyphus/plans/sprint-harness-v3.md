# Sprint: Harness v3 — Routing, Cleanup, Security, Agent Mode

## TL;DR

> **Quick Summary**: Four-track sprint to harden the AI-agent security harness — remove dead code, fix 8 security vulnerabilities from Aegis audit, add smart command routing (host vs. sandbox), and enable Aegis as a TAB-switchable agent.
>
> **Deliverables**:
> - Smart command routing matrix in `harness-policy.json` + `pre-tool-use.ts`
> - Dead code removed, scanner duplicates consolidated to single implementations
> - 8 security fixes applied (HIGH → MEDIUM priority)
> - Aegis agent available via TAB-switch in OpenCode
>
> **Estimated Effort**: Large (28 atomic tasks + final verification)
> **Parallel Execution**: YES — 7 waves
> **Critical Path**: T-01→T-05→T-08→T-12→T-14→T-19→T-23→T-27→Final

---

## Context

### Original Request
Four-track sprint for the AI-agent security harness (TypeScript/Bun):
- **Track A**: Command Routing Matrix — stop sending safe commands (git, ls, bun tsc) to Docker sandbox
- **Track B**: Dead Code Cleanup — remove unused exports, delete unused files, consolidate 3 Trivy/Semgrep/parseInstallCommand duplicates to 1 each
- **Track C**: Security Fixes — 8 findings from Aegis audit (seccomp removal, shell injection, swallowed errors, atomic writes, JSON hardening, policy gaps)
- **Track D**: Aegis Agent Mode — change `mode: subagent` → `mode: agent` for TAB-switching

### Research Findings (Verified via Codebase)

**Dead code verified zero-import (production code)**:
- `src/lib/ui.ts`: `printErr` (L40), `printSectionTitle` (L55), `printBox` (L59) — never imported
- `src/lib/base.ts`: `runShellInherit` (L94-102) — zero imports anywhere
- `src/types/aegis.ts`: entire file — zero imports anywhere
- `src/lib/scanner.ts`: `wrapTrufflehog` (L194-205) — only imported by `scanner.test.ts`
- `src/lib/verdict-log.ts`: `appendVerdictEvent` (L18-23), `readRecentVerdicts` (L25-42) — only imported by `verdict-log.test.ts`

**Trivy duplication (3 implementations)**:
1. `src/hooks/pre-tool-use.ts:85-118` — inline `trivyScan()` with local types
2. `src/core/security.ts:138-175` — canonical `trivyScan()` with proper exports
3. `src/opencode/handlers/before.ts:15-61` — `scanPackageWithTrivy()` using `wrapTrivy` wrapper

**Semgrep parsing duplication (3 implementations)**:
1. `src/hooks/post-tool-use.ts:17-26,46-77` — local `SemgrepResult` type + inline parsing
2. `src/core/security.ts:18-34,185-220` — canonical types + `semgrepScan()`
3. `src/opencode/handlers/after.ts:4-21` — `parseSemgrepFindings()` using imported types

**parseInstallCommand duplication (2 implementations)**:
1. `src/hooks/pre-tool-use.ts:30-50` — local copy with local types
2. `src/core/security.ts:74-88` — canonical version

**Security issues verified with line numbers**:
1. `src/sandbox/start.ts:38` — `--security-opt seccomp=unconfined`
2. `scripts/sandbox-exec.sh:9` — `bash -c "${CMD}"` shell injection
3. `src/opencode/index.ts:65` — `{ swallow: true }` on afterHandler
4. `src/lib/base.ts:121-125` — `appendText` read+rewrite race condition
5. `src/hitl-gateway.ts:54` — `JSON.parse` without try/catch
6. `harness-policy.json:31-35` — missing high_risk_patterns
7. `harness-policy.json:12` — missing deny_patterns for key files
8. `scripts/sandbox-start.sh:19-29` — missing `--no-new-privileges`, `--user`

---

## Work Objectives

### Core Objective
Harden the security harness by removing dead code, fixing known vulnerabilities, adding intelligent command routing, and enabling interactive Aegis access.

### Concrete Deliverables
- `harness-policy.json` with `routing` section and expanded patterns
- `src/hooks/pre-tool-use.ts` with routing-aware command dispatch
- Dead code removed from `src/lib/ui.ts`, `src/lib/base.ts`, `src/lib/scanner.ts`, `src/lib/verdict-log.ts`
- `src/types/aegis.ts` deleted
- Single shared Trivy scanner in `src/core/security.ts`, used by hooks + opencode handlers
- Single shared Semgrep parser in `src/core/security.ts`, used by hooks + opencode handlers
- 8 security fixes applied across 6 files
- Aegis agent TAB-switchable in OpenCode

### Definition of Done
- [ ] `bun tsc --noEmit` passes (zero errors)
- [ ] `bun test` passes (all test suites green)
- [ ] No `seccomp=unconfined` in any Docker run/start command
- [ ] `grep -r 'bash -c "\$' scripts/` returns zero matches
- [ ] `grep -c 'swallow: true' src/opencode/index.ts` returns exactly `1` (event handler only — afterHandler line removed)
- [ ] `harness-policy.json` contains `routing` section with `host_passthrough` and `sandbox_required`

### Must Have
- Every command routed through host_passthrough regex runs on host (not Docker)
- Every command NOT matching host_passthrough goes to sandbox
- Security fixes do NOT change external behavior (commands still execute, HITL still works)
- Consolidated scanner functions maintain identical behavior to originals
- Test files updated to match API changes

### Must NOT Have (Guardrails)
- No new dependencies added
- No changes to the HITL approval flow logic (only hardening)
- No changes to `src/preflight.ts` or `src/cli.ts` (not in scope)
- No refactoring beyond what's specified (no "while we're here" changes)
- No changes to `.env`, secrets, or credential files
- No `console.log` in committed code
- No `as any` or `@ts-ignore` additions
- No changes to `src/lib/scan-cache.ts` or `src/lib/scan-cache.test.ts`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD for Track A (new routing logic), Tests-after for Track C hardening
- **Framework**: `bun test`
- **Test gate**: `bun tsc --noEmit && bun test` after EVERY task

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **TypeScript compilation**: `bun tsc --noEmit` — zero errors
- **Unit tests**: `bun test` — all suites pass
- **Grep verification**: Search for removed/fixed patterns to confirm absence
- **Policy validation**: `bun -e "JSON.parse(await Bun.file('harness-policy.json').text())"` — valid JSON

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Track B — dead code removal, all independent):
├── T-01: Remove printErr/printSectionTitle/printBox from ui.ts
├── T-02: Remove runShellInherit from base.ts
├── T-03: Delete src/types/aegis.ts
├── T-04: Remove wrapTrufflehog from scanner.ts + update scanner.test.ts
└── T-05: Remove appendVerdictEvent/readRecentVerdicts from verdict-log.ts + update test

Wave 2 (Track B — consolidation, depends on Wave 1):
├── T-06: Export parseSemgrepFindings from core/security.ts (canonical parser)
├── T-07: Refactor post-tool-use.ts → use shared Semgrep types/parser from core/security.ts
├── T-08: Refactor after.ts → use shared parseSemgrepFindings from core/security.ts
└── T-09: Remove local parseInstallCommand/types/makeLockfileContent/trivyScan from pre-tool-use.ts → import from core/security.ts

Wave 3 (Track B — Trivy consolidation + final test gate):
├── T-10: Refactor before.ts scanPackageWithTrivy → use trivyScan from core/security.ts
├── T-11: Track B verification gate — bun tsc && bun test

Wave 4 (Track C — security fixes, all independent):
├── T-12: Fix sandbox/start.ts — remove seccomp, add --no-new-privileges + --user
├── T-13: Fix sandbox-exec.sh — fix $CMD shell injection
├── T-14: Fix opencode/index.ts — remove swallow:true from afterHandler
├── T-15: Fix base.ts appendText — atomic fs.appendFile
├── T-16: Fix hitl-gateway.ts — wrap JSON.parse in try/catch
└── T-17: Fix sandbox-start.sh — add --no-new-privileges + --user

Wave 5 (Track C — policy updates, independent of each other):
├── T-18: Add missing high_risk_patterns to harness-policy.json
├── T-19: Add missing deny_patterns to harness-policy.json edit_file section
└── T-20: Track C verification gate — bun tsc && bun test + grep checks

Wave 6 (Track A — command routing, TDD):
├── T-21: Add routing section to harness-policy.json
├── T-22: Add HarnessPolicy routing types to pre-tool-use.ts
├── T-23: Write routing tests (RED phase)
├── T-24: Implement routing logic in pre-tool-use.ts (GREEN phase)
├── T-25: Track A verification gate — bun tsc && bun test

Wave 7 (Track D — agent mode):
├── T-26: Update docs/agents/aegis.md — mode: subagent → mode: agent
├── T-27: Update ~/.config/opencode/agents/aegis.md — mode: subagent → mode: agent
└── T-28: Track D verification — confirm agent appears in OpenCode TAB list

Critical Path: T-01→T-05→T-09→T-11→T-12→T-14→T-20→T-21→T-24→T-25→T-28→Final
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1) / 6 (Wave 4)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T-01 | — | T-11 | 1 |
| T-02 | — | T-11 | 1 |
| T-03 | — | T-11 | 1 |
| T-04 | — | T-11 | 1 |
| T-05 | — | T-11 | 1 |
| T-06 | — | T-07, T-08 | 2 |
| T-07 | T-06 | T-11 | 2 |
| T-08 | T-06 | T-11 | 2 |
| T-09 | — | T-10, T-11 | 2 |
| T-10 | T-09 | T-11 | 3 |
| T-11 | T-01…T-10 | T-12…T-19 | 3 |
| T-12 | T-11 | T-20 | 4 |
| T-13 | T-11 | T-20 | 4 |
| T-14 | T-11 | T-20 | 4 |
| T-15 | T-11 | T-20 | 4 |
| T-16 | T-11 | T-20 | 4 |
| T-17 | T-11 | T-20 | 4 |
| T-18 | T-11 | T-20 | 5 |
| T-19 | T-11 | T-20 | 5 |
| T-20 | T-12…T-19 | T-21 | 5 |
| T-21 | T-20 | T-22, T-23 | 6 |
| T-22 | T-21 | T-23, T-24 | 6 |
| T-23 | T-22 | T-24 | 6 |
| T-24 | T-23 | T-25 | 6 |
| T-25 | T-24 | T-26 | 6 |
| T-26 | T-25 | T-28 | 7 |
| T-27 | T-25 | T-28 | 7 |
| T-28 | T-26, T-27 | Final | 7 |

### Agent Dispatch Summary

| Wave | Tasks | Agent Profiles |
|------|-------|---------------|
| 1 | 5 | T-01…T-05 → `quick` |
| 2 | 4 | T-06…T-09 → `quick` |
| 3 | 2 | T-10 → `quick`, T-11 → `unspecified-high` |
| 4 | 6 | T-12…T-17 → `quick` |
| 5 | 3 | T-18, T-19 → `quick`, T-20 → `unspecified-high` |
| 6 | 5 | T-21 → `quick`, T-22…T-24 → `deep`, T-25 → `unspecified-high` |
| 7 | 3 | T-26, T-27 → `quick`, T-28 → `unspecified-high` |
| FINAL | 4 | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

### ═══ WAVE 1 — Track B: Dead Code Removal (all parallel, no dependencies) ═══

- [x] T-01. Remove `printErr`, `printSectionTitle`, `printBox` from `src/lib/ui.ts`

  **What to do**:
  - Delete the `printErr` function (line 40-42)
  - Delete the `printSectionTitle` function (lines 55-57)
  - Delete the `printBox` function (lines 59-69) and its helper `stripAnsi` (lines 71-73) which is only used by `printBox`
  - Verify no other code imports these functions (confirmed: zero imports outside this file)
  - Do NOT touch: `c`, `icon`, `print`, `println`, `clearLine`, `printHeader`, `runSteps`, `printPreflightSummary`, `printStatusTable`, `StepResult`, `Step` — these ARE used by `src/cli.ts` and `src/preflight.ts`

  **Must NOT do**:
  - Remove any function that IS imported by cli.ts or preflight.ts
  - Reformat or refactor surrounding code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T-02, T-03, T-04, T-05)
  - **Blocks**: T-11
  - **Blocked By**: None

  **References**:
  - `src/lib/ui.ts:40-73` — Functions to remove
  - `src/cli.ts:4` — `import { c, icon, print, printHeader, println, printStatusTable } from "./lib/ui.ts"` — DO NOT break this import
  - `src/preflight.ts:4` — `import { c, icon, printPreflightSummary, runSteps, type StepResult } from "./lib/ui.ts"` — DO NOT break this import

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'printErr\|printSectionTitle\|printBox\|stripAnsi' src/lib/ui.ts` → `0`

  **QA Scenarios**:
  ```
  Scenario: Functions removed, remaining exports intact
    Tool: Bash
    Steps:
      1. grep -c 'printErr\|printSectionTitle\|printBox\|stripAnsi' src/lib/ui.ts
      2. bun tsc --noEmit
      3. grep 'export function' src/lib/ui.ts
    Expected Result: Step 1 → "0"; Step 2 → exit code 0; Step 3 → print, println, clearLine, printHeader, runSteps, printPreflightSummary, printStatusTable still present
    Evidence: .sisyphus/evidence/task-01-ui-dead-code.txt
  ```

  **Commit**: YES (groups with T-02…T-05)
  - Message: `refactor(cleanup): remove dead code — ui, base, aegis types, scanner, verdict-log`

---

- [x] T-02. Remove `runShellInherit` from `src/lib/base.ts`

  **What to do**:
  - Delete the `runShellInherit` function (lines 94-102)
  - Verify no imports exist (confirmed: zero imports anywhere in codebase)
  - Do NOT touch `runShellCapture` (lines 83-92) — different function, still potentially useful

  **Must NOT do**:
  - Remove `runShellCapture` (different function)
  - Touch `appendText` (that's T-15, Track C)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T-01, T-03, T-04, T-05)
  - **Blocks**: T-11
  - **Blocked By**: None

  **References**:
  - `src/lib/base.ts:94-102` — Function to remove
  - `src/lib/base.ts:83-92` — `runShellCapture` — DO NOT remove (different function)

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'runShellInherit' src/lib/base.ts` → `0`

  **QA Scenarios**:
  ```
  Scenario: runShellInherit removed, runShellCapture intact
    Tool: Bash
    Steps:
      1. grep -c 'runShellInherit' src/lib/base.ts
      2. grep -c 'runShellCapture' src/lib/base.ts
      3. bun tsc --noEmit
    Expected Result: Step 1 → "0"; Step 2 → ≥ 1; Step 3 → exit 0
    Evidence: .sisyphus/evidence/task-02-base-dead-code.txt
  ```

  **Commit**: YES (groups with T-01, T-03…T-05)

---

- [x] T-03. Delete `src/types/aegis.ts`

  **What to do**:
  - Delete the entire file `src/types/aegis.ts`
  - Verify no imports exist (confirmed: zero imports anywhere in codebase)

  **Must NOT do**:
  - Remove the `docs/agents/aegis.md` agent definition (different file, different purpose)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T-01, T-02, T-04, T-05)
  - **Blocks**: T-11
  - **Blocked By**: None

  **References**:
  - `src/types/aegis.ts` — entire file to delete (22 lines, `AegisTaskType` + `AegisHandoffEvent` types)
  - Zero imports confirmed via `grep -r 'from.*types/aegis' src/`

  **Acceptance Criteria**:
  - [ ] `ls src/types/aegis.ts 2>&1` → "No such file or directory"
  - [ ] `bun tsc --noEmit` → zero errors

  **QA Scenarios**:
  ```
  Scenario: File deleted, no broken imports
    Tool: Bash
    Steps:
      1. ls src/types/aegis.ts 2>&1
      2. bun tsc --noEmit
    Expected Result: Step 1 → "No such file or directory"; Step 2 → exit 0
    Evidence: .sisyphus/evidence/task-03-aegis-types-deleted.txt
  ```

  **Commit**: YES (groups with T-01, T-02, T-04, T-05)

---

- [x] T-04. Remove `wrapTrufflehog` from `src/lib/scanner.ts` + update `scanner.test.ts`

  **What to do**:
  - Delete `wrapTrufflehog` function from `src/lib/scanner.ts` (lines 194-205)
  - Update `src/lib/scanner.test.ts`: remove the import of `wrapTrufflehog` (line 12) and the entire test case `"wrapTrufflehog uses 90000ms budget"` (lines 140-155)
  - Keep `wrapSemgrep` and `wrapTrivy` — they ARE used by production code

  **Must NOT do**:
  - Remove `wrapSemgrep` or `wrapTrivy` (used by `after.ts` and `before.ts`)
  - Remove `SCANNER_BUDGETS.trufflehog` — may be referenced externally

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T-01, T-02, T-03, T-05)
  - **Blocks**: T-11
  - **Blocked By**: None

  **References**:
  - `src/lib/scanner.ts:194-205` — `wrapTrufflehog` function to remove
  - `src/lib/scanner.test.ts:12` — import to remove
  - `src/lib/scanner.test.ts:140-155` — test case to remove
  - `src/opencode/handlers/after.ts:2` — imports `wrapSemgrep` — DO NOT break
  - `src/opencode/handlers/before.ts:13` — imports `wrapTrivy` — DO NOT break

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `bun test src/lib/scanner.test.ts` → PASS
  - [ ] `grep -c 'wrapTrufflehog' src/lib/scanner.ts` → `0`

  **QA Scenarios**:
  ```
  Scenario: wrapTrufflehog removed, tests pass
    Tool: Bash
    Steps:
      1. grep -c 'wrapTrufflehog' src/lib/scanner.ts
      2. grep -c 'wrapTrufflehog' src/lib/scanner.test.ts
      3. bun test src/lib/scanner.test.ts
      4. bun tsc --noEmit
    Expected Result: Steps 1,2 → "0"; Step 3 → all tests pass; Step 4 → exit 0
    Evidence: .sisyphus/evidence/task-04-trufflehog-removed.txt
  ```

  **Commit**: YES (groups with T-01…T-03, T-05)

---

- [x] T-05. Remove `appendVerdictEvent` and `readRecentVerdicts` from `src/lib/verdict-log.ts` + update test

  **What to do**:
  - Delete `appendVerdictEvent` function (lines 18-23) from `src/lib/verdict-log.ts`
  - Delete `readRecentVerdicts` function (lines 25-42) from `src/lib/verdict-log.ts`
  - Remove their imports from `src/lib/verdict-log.test.ts` (line 6: remove `appendVerdictEvent`, `readRecentVerdicts` from import)
  - Remove the `describe("appendVerdictEvent")` block (lines 53-69) and `describe("readRecentVerdicts")` block (lines 72-105) from the test file
  - Keep `formatVerdictEvent` and `VerdictEvent` type — `formatVerdictEvent` is tested and the type is used by the format function

  **Must NOT do**:
  - Remove `formatVerdictEvent` or `VerdictEvent` type
  - Delete the entire test file (the `formatVerdictEvent` tests should remain)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T-01…T-04)
  - **Blocks**: T-11
  - **Blocked By**: None

  **References**:
  - `src/lib/verdict-log.ts:1` — imports `appendText, fileExists` from base — `appendText` import can be removed if no longer needed after deleting the two functions
  - `src/lib/verdict-log.ts:18-42` — functions to remove
  - `src/lib/verdict-log.test.ts:6` — import line to update
  - `src/lib/verdict-log.test.ts:53-105` — test blocks to remove
  - `src/lib/verdict-log.test.ts:8-15` — `baseEvent` fixture — check if still needed by remaining `formatVerdictEvent` tests

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `bun test src/lib/verdict-log.test.ts` → PASS (formatVerdictEvent tests pass)
  - [ ] `grep -c 'appendVerdictEvent\|readRecentVerdicts' src/lib/verdict-log.ts` → `0`

  **QA Scenarios**:
  ```
  Scenario: Dead functions removed, formatVerdictEvent tests still pass
    Tool: Bash
    Steps:
      1. grep -c 'appendVerdictEvent\|readRecentVerdicts' src/lib/verdict-log.ts
      2. grep -c 'appendVerdictEvent\|readRecentVerdicts' src/lib/verdict-log.test.ts
      3. bun test src/lib/verdict-log.test.ts
      4. bun tsc --noEmit
    Expected Result: Steps 1,2 → "0"; Step 3 → formatVerdictEvent tests pass; Step 4 → exit 0
    Evidence: .sisyphus/evidence/task-05-verdict-log-cleanup.txt
  ```

  **Commit**: YES (groups with T-01…T-04)

### ═══ WAVE 2 — Track B: Semgrep + parseInstallCommand Consolidation ═══

- [x] T-06. Export `parseSemgrepFindings` from `src/core/security.ts`

  **What to do**:
  - Add a new exported function `parseSemgrepFindings(stdout: string): SemgrepFinding[]` to `src/core/security.ts`
  - This function should contain the parsing logic currently duplicated in:
    - `src/opencode/handlers/after.ts:4-21` (the `parseSemgrepFindings` function)
    - `src/hooks/post-tool-use.ts:59-61` (inline parsing logic)
  - The implementation should: parse JSON → extract `results` array → filter by `severity === "ERROR"` → map to `SemgrepFinding[]`
  - This creates the single canonical Semgrep parser that T-07 and T-08 will import

  **Must NOT do**:
  - Modify any callers yet (that's T-07 and T-08)
  - Change the existing `semgrepScan` function
  - Remove any existing exports

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T-09)
  - **Parallel Group**: Wave 2
  - **Blocks**: T-07, T-08
  - **Blocked By**: None

  **References**:
  - `src/core/security.ts:18-34` — existing `SemgrepFinding` and `SemgrepResult` types to reuse
  - `src/opencode/handlers/after.ts:4-21` — reference implementation of `parseSemgrepFindings`
  - `src/core/security.ts:185-220` — existing `semgrepScan` which has similar but coupled logic

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'export function parseSemgrepFindings' src/core/security.ts` → `1`

  **QA Scenarios**:
  ```
  Scenario: New export added, existing code unbroken
    Tool: Bash
    Steps:
      1. grep 'export function parseSemgrepFindings' src/core/security.ts
      2. bun tsc --noEmit
    Expected Result: Step 1 → matches function signature; Step 2 → exit 0
    Evidence: .sisyphus/evidence/task-06-semgrep-parser-export.txt
  ```

  **Commit**: YES (groups with T-07…T-10)
  - Message: `refactor(consolidate): unify trivy/semgrep/parseInstall to single implementations`

---

- [x] T-07. Refactor `src/hooks/post-tool-use.ts` → use shared Semgrep types/parser from `core/security.ts`

  **What to do**:
  - Remove the local `SemgrepResult` type definition (lines 17-26) and `SemgrepPayload` type (lines 28-30)
  - Import `parseSemgrepFindings` from `../../core/security.ts` (added in T-06)
  - Replace the inline Semgrep parsing logic (lines 59-61) with a call to `parseSemgrepFindings(semgrepOutput)`
  - Also replace the inline `Bun.spawn` semgrep call (lines 46-56) with `wrapSemgrep` from `../../lib/scanner.ts` for consistency (the after.ts handler already uses it)
  - Update the findings output format to use the structured `SemgrepFinding` type

  **Must NOT do**:
  - Change the audit log writing logic (lines 73-76)
  - Change the tool name detection logic (line 45)
  - Modify any other file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T-08, after T-06)
  - **Parallel Group**: Wave 2 (after T-06)
  - **Blocks**: T-11
  - **Blocked By**: T-06

  **References**:
  - `src/hooks/post-tool-use.ts:17-30` — local types to remove
  - `src/hooks/post-tool-use.ts:46-77` — inline Semgrep logic to replace
  - `src/core/security.ts` — canonical `SemgrepFinding`, `SemgrepResult` types + new `parseSemgrepFindings`
  - `src/lib/scanner.ts:164-179` — `wrapSemgrep` wrapper to use
  - `src/opencode/handlers/after.ts:23-39` — reference for how after.ts already uses wrapSemgrep + parseSemgrepFindings pattern

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'type SemgrepResult' src/hooks/post-tool-use.ts` → `0`
  - [ ] `grep -c 'parseSemgrepFindings' src/hooks/post-tool-use.ts` → ≥ 1

  **QA Scenarios**:
  ```
  Scenario: Local types removed, shared imports used
    Tool: Bash
    Steps:
      1. grep -c 'type SemgrepResult' src/hooks/post-tool-use.ts
      2. grep -c 'type SemgrepPayload' src/hooks/post-tool-use.ts
      3. grep 'from.*core/security' src/hooks/post-tool-use.ts
      4. bun tsc --noEmit
    Expected Result: Steps 1,2 → "0"; Step 3 → shows import; Step 4 → exit 0
    Evidence: .sisyphus/evidence/task-07-post-hook-semgrep-consolidate.txt
  ```

  **Commit**: YES (groups with T-06, T-08…T-10)

---

- [x] T-08. Refactor `src/opencode/handlers/after.ts` → use shared `parseSemgrepFindings` from `core/security.ts`

  **What to do**:
  - Remove the local `parseSemgrepFindings` function (lines 4-21)
  - Import `parseSemgrepFindings` from `../../core/security.ts` instead (it already imports `SemgrepFinding` and `SemgrepResult` types from there)
  - Update the import line to include `parseSemgrepFindings` alongside the existing type imports
  - Keep the `wrapSemgrep` import from `../../lib/scanner.ts` — it's still used

  **Must NOT do**:
  - Change the handler logic (lines 23-39)
  - Remove the `wrapSemgrep` import
  - Modify any other file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T-07, after T-06)
  - **Parallel Group**: Wave 2 (after T-06)
  - **Blocks**: T-11
  - **Blocked By**: T-06

  **References**:
  - `src/opencode/handlers/after.ts:1` — existing import: `import type { SemgrepFinding, SemgrepResult } from "../../core/security.ts"` — add `parseSemgrepFindings` to this import, change `type` to regular import
  - `src/opencode/handlers/after.ts:4-21` — local `parseSemgrepFindings` to delete
  - `src/opencode/handlers/after.ts:30` — call site: `parseSemgrepFindings(result.stdout)` — should work unchanged since function signature is identical

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'function parseSemgrepFindings' src/opencode/handlers/after.ts` → `0`
  - [ ] `grep 'from.*core/security' src/opencode/handlers/after.ts` → includes `parseSemgrepFindings`

  **QA Scenarios**:
  ```
  Scenario: Local function removed, import used instead
    Tool: Bash
    Steps:
      1. grep -c 'function parseSemgrepFindings' src/opencode/handlers/after.ts
      2. grep 'parseSemgrepFindings' src/opencode/handlers/after.ts
      3. bun tsc --noEmit
    Expected Result: Step 1 → "0"; Step 2 → shows import + call site; Step 3 → exit 0
    Evidence: .sisyphus/evidence/task-08-after-semgrep-consolidate.txt
  ```

  **Commit**: YES (groups with T-06, T-07, T-09, T-10)

---

- [x] T-09. Remove local `parseInstallCommand`/types/`makeLockfileContent`/`trivyScan` from `src/hooks/pre-tool-use.ts` → import from `core/security.ts`

  **What to do**:
  - Remove the local type definitions: `HarnessPolicy` (lines 23-26), `PackageEcosystem` (line 28), `ParsedInstall` (lines 30-34) — these duplicate `src/core/security.ts` exports
  - Remove the local `parseInstallCommand` function (lines 36-50) — exact duplicate of `src/core/security.ts:74-88`
  - Remove the local `makeLockfileContent` function (lines 52-83) — exact duplicate of `src/core/security.ts:97-128`
  - Remove the local `trivyScan` function (lines 85-118) — duplicate of `src/core/security.ts:138-175`
  - Add imports from `../../core/security.ts`: `parseInstallCommand`, `makeLockfileContent`, `trivyScan`, `type ParsedInstall`
  - Keep the `HarnessPolicy` type as-is BUT import `matchHighRiskPattern` from core/security instead of inline pattern matching (line 136)
  - Update the `main()` function to use the imported functions (the call signatures at lines 171-178 should remain the same since the canonical versions have identical signatures)
  - Remove unused imports: `mkdtempSync`, `rmSync` from `node:fs`, `tmpdir` from `node:os`, `join as joinPath` from `node:path` — these were only used by the removed functions

  **Must NOT do**:
  - Change the HITL gateway logic (lines 138-169)
  - Change the sandbox routing logic (lines 180-185)
  - Remove `shellQuote` import or the rewrite logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T-06, T-07, T-08)
  - **Parallel Group**: Wave 2
  - **Blocks**: T-10, T-11
  - **Blocked By**: None

  **References**:
  - `src/hooks/pre-tool-use.ts:23-118` — all code to remove (types + 3 functions)
  - `src/core/security.ts:10-16` — canonical `ParsedInstall` type
  - `src/core/security.ts:62-65` — `matchHighRiskPattern` to use instead of inline matching
  - `src/core/security.ts:74-88` — canonical `parseInstallCommand`
  - `src/core/security.ts:97-128` — canonical `makeLockfileContent`
  - `src/core/security.ts:138-175` — canonical `trivyScan`

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'function parseInstallCommand\|function makeLockfileContent\|function trivyScan\|type PackageEcosystem\|type ParsedInstall' src/hooks/pre-tool-use.ts` → `0`
  - [ ] `grep 'from.*core/security' src/hooks/pre-tool-use.ts` → shows imports

  **QA Scenarios**:
  ```
  Scenario: All local duplicates removed, imports from core/security
    Tool: Bash
    Steps:
      1. grep -c 'function parseInstallCommand' src/hooks/pre-tool-use.ts
      2. grep -c 'function makeLockfileContent' src/hooks/pre-tool-use.ts
      3. grep -c 'function trivyScan' src/hooks/pre-tool-use.ts
      4. grep 'from.*core/security' src/hooks/pre-tool-use.ts
      5. bun tsc --noEmit
    Expected Result: Steps 1,2,3 → "0"; Step 4 → shows import line; Step 5 → exit 0
    Evidence: .sisyphus/evidence/task-09-pre-hook-consolidate.txt
  ```

  **Commit**: YES (groups with T-06…T-08, T-10)

---

### ═══ WAVE 3 — Track B: Trivy Consolidation + Verification Gate ═══

- [x] T-10. Refactor `src/opencode/handlers/before.ts` `scanPackageWithTrivy` → use `trivyScan` from `core/security.ts`

  **What to do**:
  - Remove the local `scanPackageWithTrivy` function (lines 15-61)
  - Import `trivyScan` from `../../core/security.ts`
  - Replace the call at line 88: `const { blocked, reason, degraded } = await scanPackageWithTrivy(pkg)` → `const { blocked, reason } = await trivyScan(pkg)`
  - Handle the `degraded` field: the canonical `trivyScan` doesn't return `degraded`. Either:
    - Option A: Remove degraded handling (lines 89-91) since canonical trivyScan already handles timeout internally
    - Option B: Add `degraded` to the canonical return type — but this adds scope, prefer Option A
  - Remove unused imports that were only needed by `scanPackageWithTrivy`: `mkdtemp`, `rm` from `node:fs/promises`, `tmpdir` from `node:os`, `join` from `node:path`, `runCommandCapture` from `../../lib/base.ts`, `wrapTrivy` from `../../lib/scanner.ts`
  - Keep `makeLockfileContent` import — still used? No, that was only used by `scanPackageWithTrivy`. Remove it too.
  - Keep `parseInstallCommand`, `checkSensitiveFile`, `matchHighRiskPattern` imports from `core/security.ts`

  **Must NOT do**:
  - Change the HITL / high-risk matching logic
  - Modify `core/security.ts` (just consume it)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T-09)
  - **Parallel Group**: Wave 3
  - **Blocks**: T-11
  - **Blocked By**: T-09

  **References**:
  - `src/opencode/handlers/before.ts:15-61` — `scanPackageWithTrivy` to remove
  - `src/opencode/handlers/before.ts:86-93` — call site to update
  - `src/core/security.ts:138-175` — canonical `trivyScan` to import
  - `src/opencode/handlers/before.ts:1-13` — imports to clean up

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'scanPackageWithTrivy' src/opencode/handlers/before.ts` → `0`
  - [ ] `grep 'trivyScan' src/opencode/handlers/before.ts` → shows import + call

  **QA Scenarios**:
  ```
  Scenario: Local trivy wrapper removed, canonical used
    Tool: Bash
    Steps:
      1. grep -c 'scanPackageWithTrivy' src/opencode/handlers/before.ts
      2. grep 'trivyScan' src/opencode/handlers/before.ts
      3. bun tsc --noEmit
    Expected Result: Step 1 → "0"; Step 2 → import + usage; Step 3 → exit 0
    Evidence: .sisyphus/evidence/task-10-before-trivy-consolidate.txt
  ```

  **Commit**: YES (groups with T-06…T-09)

---

- [x] T-11. Track B Verification Gate

  **What to do**:
  - Run `bun tsc --noEmit` — must pass with zero errors
  - Run `bun test` — all test suites must pass
  - Verify all dead code is gone:
    - `grep -r 'printErr\|printSectionTitle\|printBox' src/lib/ui.ts` → 0 matches
    - `grep -r 'runShellInherit' src/lib/base.ts` → 0 matches
    - `ls src/types/aegis.ts` → not found
    - `grep -r 'wrapTrufflehog' src/lib/scanner.ts` → 0 matches
    - `grep -r 'appendVerdictEvent\|readRecentVerdicts' src/lib/verdict-log.ts` → 0 matches
  - Verify all duplicates are consolidated:
    - `grep -c 'function parseInstallCommand' src/hooks/pre-tool-use.ts` → 0
    - `grep -c 'type SemgrepResult' src/hooks/post-tool-use.ts` → 0
    - `grep -c 'function parseSemgrepFindings' src/opencode/handlers/after.ts` → 0
    - `grep -c 'scanPackageWithTrivy' src/opencode/handlers/before.ts` → 0

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (gate task)
  - **Blocks**: T-12…T-19
  - **Blocked By**: T-01…T-10

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → exit 0
  - [ ] `bun test` → all suites pass
  - [ ] All grep checks return 0 matches

  **QA Scenarios**:
  ```
  Scenario: Full Track B verification
    Tool: Bash
    Steps:
      1. bun tsc --noEmit
      2. bun test
      3. grep -rc 'printErr\|printSectionTitle\|printBox' src/lib/ui.ts || echo "0"
      4. grep -rc 'runShellInherit' src/lib/base.ts || echo "0"
      5. ls src/types/aegis.ts 2>&1
      6. grep -rc 'wrapTrufflehog' src/lib/scanner.ts || echo "0"
    Expected Result: Steps 1,2 → pass; Steps 3,4,6 → "0"; Step 5 → "No such file"
    Evidence: .sisyphus/evidence/task-11-track-b-gate.txt
  ```

  **Commit**: NO (verification only)

### ═══ WAVE 4 — Track C: Security Fixes (all parallel, HIGH priority first) ═══

- [ ] T-12. **[HIGH]** Fix `src/sandbox/start.ts` — remove `seccomp=unconfined`, add `--no-new-privileges` + `--user 65534:65534`

  **What to do**:
  - Remove `"--security-opt", "seccomp=unconfined"` from the docker run args array (lines 37-38)
  - Add `"--security-opt", "no-new-privileges"` in its place
  - Add `"--user", "65534:65534"` to the docker run args array (user `nobody`)
  - The final docker run args should include: `--security-opt no-new-privileges --user 65534:65534 --network none --memory 2g --cpus 2 --read-only`

  **Must NOT do**:
  - Change the container name, network, memory, cpu, or tmpfs settings
  - Modify the stale container detection/removal logic (lines 6-28)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T-13…T-17)
  - **Blocks**: T-20
  - **Blocked By**: T-11

  **References**:
  - `src/sandbox/start.ts:31-54` — docker run command to modify
  - `src/sandbox/start.ts:37-38` — exact lines: `"--security-opt", "seccomp=unconfined"` to replace

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'seccomp=unconfined' src/sandbox/start.ts` → `0`
  - [ ] `grep -c 'no-new-privileges' src/sandbox/start.ts` → `1`
  - [ ] `grep -c '65534:65534' src/sandbox/start.ts` → `1`

  **QA Scenarios**:
  ```
  Scenario: Seccomp removed, hardening flags added
    Tool: Bash
    Steps:
      1. grep -c 'seccomp=unconfined' src/sandbox/start.ts
      2. grep -c 'no-new-privileges' src/sandbox/start.ts
      3. grep -c '65534:65534' src/sandbox/start.ts
      4. bun tsc --noEmit
    Expected Result: Step 1 → "0"; Steps 2,3 → "1"; Step 4 → exit 0
    Evidence: .sisyphus/evidence/task-12-sandbox-start-hardening.txt

  Scenario: Docker args order is valid (no syntax errors)
    Tool: Bash
    Steps:
      1. grep -A2 'security-opt' src/sandbox/start.ts
    Expected Result: Shows "no-new-privileges" as the value after --security-opt
    Evidence: .sisyphus/evidence/task-12-docker-args-valid.txt
  ```

  **Commit**: YES (groups with T-13…T-19)
  - Message: `fix(security): apply 8 aegis audit findings — seccomp, injection, swallow, atomic writes, policy`

---

- [ ] T-13. **[HIGH]** Fix `scripts/sandbox-exec.sh` — fix `$CMD` shell injection

  **What to do**:
  - Line 9: Change `docker exec "${CONTAINER}" bash -c "${CMD}"` to pass CMD as a separate argument to avoid shell injection
  - Correct approach: `docker exec "${CONTAINER}" bash -c "$1" -- "${CMD}"` OR use `--` separator properly
  - Actually, the safest fix: pass the command via stdin or as a properly escaped argument
  - Recommended fix: Change line 9 to `docker exec "${CONTAINER}" sh -c "$1" _ "$@"` pattern, or simply:
    ```bash
    docker exec "${CONTAINER}" bash -c "$CMD"
    ```
    Wait — the issue is that `${CMD}` inside double quotes within `bash -c` allows the container's bash to interpret metacharacters. The fix is to NOT use `bash -c` with string interpolation. Instead:
    - Write the command to a temp file in the container, or
    - Pass it as `$1`: `docker exec "${CONTAINER}" bash -c '$1' _ "${CMD}"`
  - **Simplest correct fix**: `docker exec "${CONTAINER}" bash -c '$1' _ "${CMD}"` — this passes CMD as positional arg `$1` to bash, avoiding injection in the `-c` string

  **Must NOT do**:
  - Change the reset script call (line 12)
  - Change the exit code propagation logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T-12, T-14…T-17)
  - **Blocks**: T-20
  - **Blocked By**: T-11

  **References**:
  - `scripts/sandbox-exec.sh:9` — vulnerable line: `docker exec "${CONTAINER}" bash -c "${CMD}"`
  - `src/sandbox/exec.ts:15` — TypeScript equivalent also passes command via `-c` argument (separate concern, same pattern but via argv so less vulnerable)

  **Acceptance Criteria**:
  - [ ] `grep 'bash -c "\${CMD}"' scripts/sandbox-exec.sh` → 0 matches (vulnerable pattern gone)
  - [ ] `grep -c '\$1' scripts/sandbox-exec.sh` → ≥ 1 (positional arg pattern used)

  **QA Scenarios**:
  ```
  Scenario: Shell injection vector removed
    Tool: Bash
    Steps:
      1. grep -c 'bash -c "\${CMD}"' scripts/sandbox-exec.sh
      2. cat scripts/sandbox-exec.sh | grep 'docker exec'
      3. bash -n scripts/sandbox-exec.sh
    Expected Result: Step 1 → "0"; Step 2 → shows safe pattern; Step 3 → syntax OK (exit 0)
    Evidence: .sisyphus/evidence/task-13-shell-injection-fix.txt

  Scenario: Script still has valid bash syntax
    Tool: Bash
    Steps:
      1. bash -n scripts/sandbox-exec.sh
    Expected Result: exit code 0 (no syntax errors)
    Evidence: .sisyphus/evidence/task-13-syntax-check.txt
  ```

  **Commit**: YES (groups with T-12, T-14…T-19)

---

- [ ] T-14. **[HIGH]** Fix `src/opencode/index.ts` — remove `swallow: true` from `tool.execute.after`

  **What to do**:
  - Line 65: Change `safe(afterHandler as AnyHandler, { swallow: true })` to `safe(afterHandler as AnyHandler)` (remove the options object entirely)
  - This means errors in the after-handler (Semgrep scanning) will now propagate instead of being silently swallowed
  - Keep `{ swallow: true, onError: () => { preflightPassed = false; } }` on the event handler (line 66) — that one is intentional for session stability

  **Must NOT do**:
  - Remove `swallow: true` from the event handler on line 66 (that's intentional)
  - Change the `safe()` function implementation
  - Modify any other handler wiring

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T-12, T-13, T-15…T-17)
  - **Blocks**: T-20
  - **Blocked By**: T-11

  **References**:
  - `src/opencode/index.ts:65` — `"tool.execute.after": safe(afterHandler as AnyHandler, { swallow: true })` — remove `{ swallow: true }`
  - `src/opencode/index.ts:66` — `"event": safe(sessionHandler as AnyHandler, { swallow: true, onError: ... })` — DO NOT TOUCH this line
  - `src/opencode/index.ts:25-37` — `safe()` function definition — DO NOT modify

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'swallow: true' src/opencode/index.ts` → `1` (only the event handler line remains)
  - [ ] Line 65 should read: `"tool.execute.after": safe(afterHandler as AnyHandler),`

  **QA Scenarios**:
  ```
  Scenario: swallow:true removed from afterHandler only
    Tool: Bash
    Steps:
      1. grep -n 'swallow' src/opencode/index.ts
      2. bun tsc --noEmit
    Expected Result: Step 1 → shows only ONE match on the event handler line (not afterHandler); Step 2 → exit 0
    Evidence: .sisyphus/evidence/task-14-swallow-removed.txt
  ```

  **Commit**: YES (groups with T-12, T-13, T-15…T-19)

---

- [ ] T-15. **[MEDIUM]** Fix `src/lib/base.ts` `appendText()` — replace with atomic `fs.appendFile` (`O_APPEND`)

  **What to do**:
  - Replace the current `appendText` implementation (lines 121-125) which does read-then-write (race condition):
    ```ts
    export async function appendText(filePath: string, text: string): Promise<void> {
      await ensureDir(dirname(filePath));
      const existing = (await fileExists(filePath)) ? await Bun.file(filePath).text() : "";
      await Bun.write(filePath, `${existing}${text}`);
    }
    ```
  - Replace with atomic append using Node.js `fs.appendFile` (which uses `O_APPEND` internally):
    ```ts
    import { appendFile, mkdir } from "node:fs/promises";
    
    export async function appendText(filePath: string, text: string): Promise<void> {
      await ensureDir(dirname(filePath));
      await appendFile(filePath, text);
    }
    ```
  - This eliminates the read-modify-write race condition under concurrent access

  **Must NOT do**:
  - Change the function signature
  - Modify `ensureDir` or other functions
  - Add `console.log` or debug statements

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T-12…T-14, T-16, T-17)
  - **Blocks**: T-20
  - **Blocked By**: T-11

  **References**:
  - `src/lib/base.ts:121-125` — current `appendText` implementation (race condition)
  - `src/lib/base.ts:1` — existing `dirname` import from `node:path`
  - `src/hitl-gateway.ts:77-80` — caller of `appendText` (must continue to work)
  - `src/hooks/post-tool-use.ts:73-76` — caller of `appendText` (must continue to work)

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'Bun.file.*text.*Bun.write' src/lib/base.ts` → `0` (read-modify-write pattern gone)
  - [ ] `grep -c 'appendFile' src/lib/base.ts` → ≥ 1 (atomic append used)

  **QA Scenarios**:
  ```
  Scenario: Atomic append replaces read-modify-write
    Tool: Bash
    Steps:
      1. grep -c 'appendFile' src/lib/base.ts
      2. grep -A3 'async function appendText' src/lib/base.ts
      3. bun tsc --noEmit
    Expected Result: Step 1 → ≥ 1; Step 2 → shows appendFile call, no read-then-write; Step 3 → exit 0
    Evidence: .sisyphus/evidence/task-15-atomic-append.txt
  ```

  **Commit**: YES (groups with T-12…T-14, T-16…T-19)

---

- [ ] T-16. **[MEDIUM]** Fix `src/hitl-gateway.ts` — wrap `JSON.parse` in try/catch

  **What to do**:
  - Line 54: `const parsed = JSON.parse(requestJson) as HitlRequest;` is unprotected
  - Wrap in try/catch. On parse failure:
    - Log the error to stderr: `writeStderr("HITL: Failed to parse request JSON\\n")`
    - Return exit code 1 (deny by default on malformed input)
  - This prevents crash on malformed JSON input to the HITL gateway

  **Must NOT do**:
  - Change the approval/denial logic
  - Change the readline/timeout mechanism
  - Modify the audit log format

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T-12…T-15, T-17)
  - **Blocks**: T-20
  - **Blocked By**: T-11

  **References**:
  - `src/hitl-gateway.ts:54` — unprotected `JSON.parse(requestJson)`
  - `src/hitl-gateway.ts:46-89` — `main()` function context
  - `src/hitl-gateway.ts:4` — `writeStderr` already imported

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] The `JSON.parse` on line ~54 is now inside a try/catch block

  **QA Scenarios**:
  ```
  Scenario: JSON.parse is wrapped in try/catch
    Tool: Bash
    Steps:
      1. grep -B2 -A5 'JSON.parse(requestJson)' src/hitl-gateway.ts
      2. bun tsc --noEmit
    Expected Result: Step 1 → shows try/catch around JSON.parse; Step 2 → exit 0
    Evidence: .sisyphus/evidence/task-16-json-parse-hardening.txt

  Scenario: Malformed JSON returns exit 1
    Tool: Bash
    Steps:
      1. grep -A3 'catch' src/hitl-gateway.ts | grep -c 'return 1\|writeStderr'
    Expected Result: ≥ 1 (error handling present)
    Evidence: .sisyphus/evidence/task-16-error-handling.txt
  ```

  **Commit**: YES (groups with T-12…T-15, T-17…T-19)

---

- [ ] T-17. **[MEDIUM]** Fix `scripts/sandbox-start.sh` — add `--no-new-privileges` + `--user 65534:65534`

  **What to do**:
  - Line 21: Replace `--security-opt seccomp=unconfined` with `--security-opt no-new-privileges`
  - Add `--user 65534:65534` to the docker run command (after `--security-opt`)
  - Keep all other flags: `--network none`, `--memory 2g`, `--cpus 2`, `--read-only`, `--tmpfs` settings

  **Must NOT do**:
  - Change the container detection logic (lines 7-16)
  - Change the container name or base image

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T-12…T-16)
  - **Blocks**: T-20
  - **Blocked By**: T-11

  **References**:
  - `scripts/sandbox-start.sh:19-29` — docker run command to modify
  - `scripts/sandbox-start.sh:21` — `--security-opt seccomp=unconfined` to replace
  - `src/sandbox/start.ts` — TypeScript equivalent (being fixed in T-12) — keep in sync

  **Acceptance Criteria**:
  - [ ] `grep -c 'seccomp=unconfined' scripts/sandbox-start.sh` → `0`
  - [ ] `grep -c 'no-new-privileges' scripts/sandbox-start.sh` → `1`
  - [ ] `grep -c '65534:65534' scripts/sandbox-start.sh` → `1`
  - [ ] `bash -n scripts/sandbox-start.sh` → exit 0 (valid syntax)

  **QA Scenarios**:
  ```
  Scenario: Shell script hardened correctly
    Tool: Bash
    Steps:
      1. grep -c 'seccomp=unconfined' scripts/sandbox-start.sh
      2. grep -c 'no-new-privileges' scripts/sandbox-start.sh
      3. grep -c '65534:65534' scripts/sandbox-start.sh
      4. bash -n scripts/sandbox-start.sh
    Expected Result: Step 1 → "0"; Steps 2,3 → "1"; Step 4 → exit 0
    Evidence: .sisyphus/evidence/task-17-sandbox-start-sh-hardening.txt
  ```

  **Commit**: YES (groups with T-12…T-16, T-18, T-19)

---

### ═══ WAVE 5 — Track C: Policy Updates + Verification Gate ═══

- [ ] T-18. **[MEDIUM]** Add missing `high_risk_patterns` to `harness-policy.json`

  **What to do**:
  - Add the following patterns to the `high_risk_patterns` array in `harness-policy.json`:
    - `"bun install"`, `"bun add"`
    - `"curl "` (note trailing space to avoid matching `curl.*--upload` which is already present)
    - `"wget "`
    - `"chmod \\+x"` (escaped `+`)
    - `"sudo "`, `"su "`
    - `"\\bnc\\b"` (netcat — word boundary to avoid matching "once", "dance", etc.)
    - `"\\beval\\b"` (eval — word boundary)
  - These are all commands that should trigger HITL approval before execution
  - Note: `curl.*--upload` already exists — do not duplicate, but add plain `curl ` for all curl usage

  **Must NOT do**:
  - Remove any existing patterns
  - Change the `hitl_timeout_seconds` value
  - Modify the `actions` section (that's T-19)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T-19)
  - **Parallel Group**: Wave 5
  - **Blocks**: T-20
  - **Blocked By**: T-11

  **References**:
  - `harness-policy.json:31-35` — current `high_risk_patterns` array
  - `src/hooks/pre-tool-use.ts:136` — where patterns are matched: `highRiskPatterns.find((pattern) => new RegExp(pattern, "i").test(bashCommand))`
  - `src/core/security.ts:62-65` — `matchHighRiskPattern` uses same `new RegExp(pattern, "i")` matching

  **Acceptance Criteria**:
  - [ ] `bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(p.high_risk_patterns.length)"` → count increased
  - [ ] `grep -c 'bun install\|bun add\|curl \|wget \|chmod\|sudo \|\\bsu \\b\|nc\|eval' harness-policy.json` → ≥ 8 new patterns

  **QA Scenarios**:
  ```
  Scenario: All required patterns present in valid JSON
    Tool: Bash
    Steps:
      1. bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(JSON.stringify(p.high_risk_patterns, null, 2))"
      2. bun -e "JSON.parse(await Bun.file('harness-policy.json').text()); console.log('valid JSON')"
    Expected Result: Step 1 → array includes bun install, bun add, curl, wget, chmod, sudo, su, nc, eval; Step 2 → "valid JSON"
    Evidence: .sisyphus/evidence/task-18-policy-patterns.txt

  Scenario: Existing patterns still present (no accidental removal)
    Tool: Bash
    Steps:
      1. bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); const required = ['DROP TABLE', 'rm -rf', 'kubectl apply', 'terraform apply']; console.log(required.every(r => p.high_risk_patterns.some(p => p.includes(r))))"
    Expected Result: "true"
    Evidence: .sisyphus/evidence/task-18-existing-patterns-intact.txt
  ```

  **Commit**: YES (groups with T-12…T-17, T-19)

---

- [ ] T-19. **[MEDIUM]** Add missing `deny_patterns` to `harness-policy.json` `edit_file` section

  **What to do**:
  - Add the following patterns to `actions.edit_file.deny_patterns` array:
    - `"**/*.key"` — private key files
    - `"**/*_rsa"` — RSA private keys
    - `"**/*_ed25519"` — Ed25519 private keys
  - The current deny_patterns are: `[".env", "**/*.pem"]`
  - After: `[".env", "**/*.pem", "**/*.key", "**/*_rsa", "**/*_ed25519"]`

  **Must NOT do**:
  - Change `edit_file.allow_patterns`
  - Modify the `read_file.deny_patterns` (it already has `**/*.key` and `**/*_rsa`)
  - Touch any other section

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T-18)
  - **Parallel Group**: Wave 5
  - **Blocks**: T-20
  - **Blocked By**: T-11

  **References**:
  - `harness-policy.json:9-13` — `edit_file` section with current `deny_patterns`
  - `harness-policy.json:6-8` — `read_file.deny_patterns` for reference (already more complete)
  - `src/core/security.ts:229-240` — `checkSensitiveFile` function that processes these patterns

  **Acceptance Criteria**:
  - [ ] `bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(p.actions.edit_file.deny_patterns)"` → includes `**/*.key`, `**/*_rsa`, `**/*_ed25519`
  - [ ] Valid JSON (no trailing commas, proper quoting)

  **QA Scenarios**:
  ```
  Scenario: All deny patterns present
    Tool: Bash
    Steps:
      1. bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(JSON.stringify(p.actions.edit_file.deny_patterns))"
      2. bun -e "JSON.parse(await Bun.file('harness-policy.json').text()); console.log('valid')"
    Expected Result: Step 1 → array includes .env, **/*.pem, **/*.key, **/*_rsa, **/*_ed25519; Step 2 → "valid"
    Evidence: .sisyphus/evidence/task-19-deny-patterns.txt
  ```

  **Commit**: YES (groups with T-12…T-18)

---

- [ ] T-20. Track C Verification Gate

  **What to do**:
  - Run `bun tsc --noEmit` — must pass
  - Run `bun test` — must pass
  - Verify all security fixes:
    - `grep -r 'seccomp=unconfined' src/ scripts/` → 0 matches
    - `grep 'bash -c "\${CMD}"' scripts/sandbox-exec.sh` → 0 matches
    - `grep -c 'swallow: true' src/opencode/index.ts` → exactly 1 (event handler only)
    - `grep -c 'appendFile' src/lib/base.ts` → ≥ 1
    - `grep -B2 'JSON.parse(requestJson)' src/hitl-gateway.ts` → shows try block
    - `grep -c 'no-new-privileges' scripts/sandbox-start.sh src/sandbox/start.ts` → 2 (one per file)
    - Valid JSON: `bun -e "JSON.parse(await Bun.file('harness-policy.json').text()); console.log('ok')"`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`CodingStandards`, `SecurityReview`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (gate task)
  - **Blocks**: T-21
  - **Blocked By**: T-12…T-19

  **Acceptance Criteria**:
  - [ ] All grep checks pass as specified
  - [ ] `bun tsc --noEmit && bun test` → pass

  **QA Scenarios**:
  ```
  Scenario: Full Track C verification
    Tool: Bash
    Steps:
      1. bun tsc --noEmit
      2. bun test
      3. grep -rc 'seccomp=unconfined' src/ scripts/ || echo "0"
      4. grep -c 'swallow: true' src/opencode/index.ts
      5. bun -e "JSON.parse(await Bun.file('harness-policy.json').text()); console.log('valid')"
    Expected Result: Steps 1,2 → pass; Step 3 → "0"; Step 4 → "1"; Step 5 → "valid"
    Evidence: .sisyphus/evidence/task-20-track-c-gate.txt
  ```

  **Commit**: NO (verification only)

### ═══ WAVE 6 — Track A: Command Routing Matrix (TDD) ═══

- [ ] T-21. Add `routing` section to `harness-policy.json`

  **What to do**:
  - Add a new top-level `routing` key to `harness-policy.json` with two arrays:
    ```json
    "routing": {
      "host_passthrough": [
        "^git ",
        "^bun (tsc|test|run)",
        "^ls\\b",
        "^cat ",
        "^grep ",
        "^find ",
        "^echo ",
        "^pwd$",
        "^which ",
        "^head ",
        "^tail ",
        "^wc ",
        "^sort ",
        "^diff "
      ],
      "sandbox_required": [
        "^bun (install|add|x|pm)",
        "^npm ",
        "^curl ",
        "^wget ",
        "^python[23]? ",
        "^node ",
        "^pip3? ",
        "^cargo ",
        "^go (get|run|build)",
        "^make\\b",
        "^sh ",
        "^bash "
      ]
    }
    ```
  - Routing logic (documented in policy for reference):
    - Match `host_passthrough` → run on host directly (skip Docker)
    - Match `sandbox_required` → route to Docker sandbox
    - Match `high_risk_patterns` → HITL first, then sandbox
    - No match → default to sandbox (safe default)

  **Must NOT do**:
  - Move or rename existing fields
  - Change any existing patterns or values
  - Add `routing` inside `actions` — it should be top-level

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (sequential: T-21 → T-22 → T-23 → T-24)
  - **Blocks**: T-22, T-23
  - **Blocked By**: T-20

  **References**:
  - `harness-policy.json` — add routing section at top level
  - `src/hooks/pre-tool-use.ts:23-26` — current `HarnessPolicy` type will need updating (T-22)
  - `src/hooks/pre-tool-use.ts:133-186` — main routing logic that will consume this (T-24)

  **Acceptance Criteria**:
  - [ ] `bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(!!p.routing && Array.isArray(p.routing.host_passthrough) && Array.isArray(p.routing.sandbox_required))"` → `true`
  - [ ] Valid JSON

  **QA Scenarios**:
  ```
  Scenario: Routing section added with both arrays
    Tool: Bash
    Steps:
      1. bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(p.routing.host_passthrough.length, p.routing.sandbox_required.length)"
      2. bun -e "JSON.parse(await Bun.file('harness-policy.json').text()); console.log('valid')"
    Expected Result: Step 1 → two numbers (≥14 and ≥12); Step 2 → "valid"
    Evidence: .sisyphus/evidence/task-21-routing-policy.txt
  ```

  **Commit**: YES (groups with T-22…T-24)
  - Message: `feat(routing): add command routing matrix — host passthrough vs sandbox`

---

- [ ] T-22. Add `HarnessPolicy` routing types to `src/hooks/pre-tool-use.ts`

  **What to do**:
  - Update the `HarnessPolicy` type (currently at the top of `pre-tool-use.ts`, or imported from core/security after T-09) to include:
    ```ts
    routing?: {
      host_passthrough?: string[];
      sandbox_required?: string[];
    };
    ```
  - If after T-09 the HarnessPolicy type was kept local (it's specific to the hook's needs), update it in place
  - If it was moved to core/security, update it there
  - Also create a helper function signature for routing (implementation in T-24):
    ```ts
    function routeCommand(command: string, policy: HarnessPolicy): "host" | "sandbox" | "hitl"
    ```

  **Must NOT do**:
  - Implement the routing logic yet (that's T-24)
  - Change existing type fields

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (after T-21)
  - **Blocks**: T-23, T-24
  - **Blocked By**: T-21

  **References**:
  - `src/hooks/pre-tool-use.ts` — `HarnessPolicy` type to extend
  - `harness-policy.json` — routing section schema (from T-21)

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `grep -c 'host_passthrough\|sandbox_required' src/hooks/pre-tool-use.ts` → ≥ 2

  **QA Scenarios**:
  ```
  Scenario: Type definitions compile
    Tool: Bash
    Steps:
      1. bun tsc --noEmit
      2. grep 'host_passthrough' src/hooks/pre-tool-use.ts
      3. grep 'sandbox_required' src/hooks/pre-tool-use.ts
    Expected Result: Step 1 → exit 0; Steps 2,3 → matches found
    Evidence: .sisyphus/evidence/task-22-routing-types.txt
  ```

  **Commit**: YES (groups with T-21, T-23, T-24)

---

- [ ] T-23. Write routing tests (TDD RED phase) — `src/hooks/pre-tool-use.test.ts`

  **What to do**:
  - Create a new test file `src/hooks/pre-tool-use.test.ts` (or add to existing if one exists)
  - Write tests for the `routeCommand` function that WILL FAIL (RED phase):
    ```ts
    import { describe, expect, test } from "bun:test";
    // import { routeCommand } from "./pre-tool-use.ts"; // will be exported in T-24

    describe("routeCommand", () => {
      const policy = {
        high_risk_patterns: ["rm -rf", "DROP TABLE"],
        routing: {
          host_passthrough: ["^git ", "^bun (tsc|test|run)", "^ls\\b", "^cat "],
          sandbox_required: ["^curl ", "^python ", "^node "],
        },
      };

      // host_passthrough tests
      test("routes 'git status' to host", () => {
        expect(routeCommand("git status", policy)).toBe("host");
      });
      test("routes 'git push origin main' to host", () => {
        expect(routeCommand("git push origin main", policy)).toBe("host");
      });
      test("routes 'bun tsc --noEmit' to host", () => {
        expect(routeCommand("bun tsc --noEmit", policy)).toBe("host");
      });
      test("routes 'bun test' to host", () => {
        expect(routeCommand("bun test", policy)).toBe("host");
      });
      test("routes 'bun run build' to host", () => {
        expect(routeCommand("bun run build", policy)).toBe("host");
      });
      test("routes 'ls -la' to host", () => {
        expect(routeCommand("ls -la", policy)).toBe("host");
      });
      test("routes 'cat file.txt' to host", () => {
        expect(routeCommand("cat file.txt", policy)).toBe("host");
      });

      // sandbox_required tests
      test("routes 'curl https://example.com' to sandbox", () => {
        expect(routeCommand("curl https://example.com", policy)).toBe("sandbox");
      });
      test("routes 'python script.py' to sandbox", () => {
        expect(routeCommand("python script.py", policy)).toBe("sandbox");
      });
      test("routes 'node index.js' to sandbox", () => {
        expect(routeCommand("node index.js", policy)).toBe("sandbox");
      });

      // high_risk_patterns → hitl
      test("routes 'rm -rf /' to hitl", () => {
        expect(routeCommand("rm -rf /", policy)).toBe("hitl");
      });
      test("routes 'DROP TABLE users' to hitl", () => {
        expect(routeCommand("DROP TABLE users", policy)).toBe("hitl");
      });

      // hitl takes priority over host_passthrough
      test("hitl overrides host_passthrough when both match", () => {
        const p = {
          high_risk_patterns: ["^git push --force"],
          routing: { host_passthrough: ["^git "], sandbox_required: [] },
        };
        expect(routeCommand("git push --force origin main", p)).toBe("hitl");
      });

      // no match → sandbox (safe default)
      test("routes unknown commands to sandbox", () => {
        expect(routeCommand("mystery-tool --flag", policy)).toBe("sandbox");
      });

      // empty/missing policy
      test("routes to sandbox when no routing config", () => {
        expect(routeCommand("ls -la", { high_risk_patterns: [] })).toBe("sandbox");
      });
    });
    ```
  - These tests define the contract for the routing logic

  **Must NOT do**:
  - Implement the routing logic (that's T-24)
  - Modify any existing production file

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`CodingStandards`, `TddWorkflow`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (after T-22)
  - **Blocks**: T-24
  - **Blocked By**: T-22

  **References**:
  - `src/core/security.test.ts` — existing test patterns to follow (bun:test, describe/test/expect)
  - `src/hooks/pre-tool-use.ts` — file where `routeCommand` will be exported
  - `harness-policy.json` — routing patterns to test against

  **Acceptance Criteria**:
  - [ ] Test file created: `src/hooks/pre-tool-use.test.ts`
  - [ ] `bun tsc --noEmit` → zero errors (tests compile even if routeCommand not yet implemented)
  - [ ] Tests are expected to FAIL at this stage (RED phase)

  **QA Scenarios**:
  ```
  Scenario: Test file compiles
    Tool: Bash
    Steps:
      1. ls src/hooks/pre-tool-use.test.ts
      2. bun tsc --noEmit
    Expected Result: Step 1 → file exists; Step 2 → exit 0 (compilation OK even if tests would fail at runtime)
    Evidence: .sisyphus/evidence/task-23-routing-tests-red.txt
  ```

  **Commit**: YES (groups with T-21, T-22, T-24)

---

- [ ] T-24. Implement `routeCommand` in `src/hooks/pre-tool-use.ts` (TDD GREEN phase)

  **What to do**:
  - Export a `routeCommand` function from `src/hooks/pre-tool-use.ts`:
    ```ts
    export function routeCommand(
      command: string,
      policy: HarnessPolicy,
    ): "host" | "sandbox" | "hitl" {
      // 1. Check high_risk_patterns FIRST (highest priority)
      const highRiskPatterns = policy.high_risk_patterns ?? [];
      if (highRiskPatterns.some((p) => new RegExp(p, "i").test(command))) {
        return "hitl";
      }

      // 2. Check host_passthrough
      const hostPatterns = policy.routing?.host_passthrough ?? [];
      if (hostPatterns.some((p) => new RegExp(p, "i").test(command))) {
        return "host";
      }

      // 3. Default to sandbox (safe default — sandbox_required patterns are informational)
      return "sandbox";
    }
    ```
  - Integrate `routeCommand` into the `main()` function:
    - After reading the policy, call `routeCommand(bashCommand, policy)`
    - If result is `"host"`: skip sandbox rewrite, output the original parsedInput unchanged (bypass the Docker exec rewrite at line 182)
    - If result is `"hitl"`: go through existing HITL flow first, then sandbox
    - If result is `"sandbox"`: proceed with existing Docker exec rewrite
  - The existing HITL + Trivy scan logic should remain but be gated by the routing result
  - **Priority order**: hitl (high_risk) > host (passthrough) > sandbox (default)

  **Must NOT do**:
  - Remove the existing HITL gateway logic
  - Remove the existing Trivy scanning logic
  - Change the sandbox exec mechanism
  - Add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`CodingStandards`, `TddWorkflow`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (after T-23)
  - **Blocks**: T-25
  - **Blocked By**: T-23

  **References**:
  - `src/hooks/pre-tool-use.ts:120-190` — `main()` function to modify
  - `src/hooks/pre-tool-use.ts:133-136` — current high_risk pattern matching (incorporate into routeCommand)
  - `src/hooks/pre-tool-use.ts:180-185` — Docker exec rewrite (make conditional on routing result)
  - `src/core/security.ts:62-65` — `matchHighRiskPattern` (reference for pattern matching approach)
  - `harness-policy.json` — routing section (from T-21)
  - `src/hooks/pre-tool-use.test.ts` — tests that must pass (from T-23)

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit` → zero errors
  - [ ] `bun test src/hooks/pre-tool-use.test.ts` → ALL tests PASS (GREEN)
  - [ ] `grep -c 'export function routeCommand' src/hooks/pre-tool-use.ts` → `1`

  **QA Scenarios**:
  ```
  Scenario: All routing tests pass (GREEN phase)
    Tool: Bash
    Steps:
      1. bun test src/hooks/pre-tool-use.test.ts
      2. bun tsc --noEmit
    Expected Result: Step 1 → all tests pass; Step 2 → exit 0
    Evidence: .sisyphus/evidence/task-24-routing-green.txt

  Scenario: Routing integrated into main flow
    Tool: Bash
    Steps:
      1. grep 'routeCommand' src/hooks/pre-tool-use.ts
      2. grep -c 'host.*sandbox.*hitl\|"host"\|"sandbox"\|"hitl"' src/hooks/pre-tool-use.ts
    Expected Result: Step 1 → shows function definition + call in main(); Step 2 → ≥ 3
    Evidence: .sisyphus/evidence/task-24-routing-integration.txt
  ```

  **Commit**: YES (groups with T-21…T-23)

---

- [ ] T-25. Track A Verification Gate

  **What to do**:
  - Run `bun tsc --noEmit` — must pass
  - Run `bun test` — ALL suites must pass (including new routing tests)
  - Verify routing is functional:
    - `bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(Object.keys(p.routing))"` → `["host_passthrough", "sandbox_required"]`
    - `grep -c 'routeCommand' src/hooks/pre-tool-use.ts` → ≥ 2 (definition + usage)
  - Verify existing functionality preserved:
    - HITL gateway logic still present
    - Trivy scanning logic still present
    - Docker exec rewrite still present for sandbox-routed commands

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`CodingStandards`, `TddWorkflow`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (gate task)
  - **Blocks**: T-26, T-27
  - **Blocked By**: T-24

  **Acceptance Criteria**:
  - [ ] `bun tsc --noEmit && bun test` → pass
  - [ ] Routing section in policy, routeCommand in hook

  **QA Scenarios**:
  ```
  Scenario: Full Track A verification
    Tool: Bash
    Steps:
      1. bun tsc --noEmit
      2. bun test
      3. bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(!!p.routing)"
      4. grep -c 'routeCommand' src/hooks/pre-tool-use.ts
    Expected Result: Steps 1,2 → pass; Step 3 → "true"; Step 4 → ≥ 2
    Evidence: .sisyphus/evidence/task-25-track-a-gate.txt
  ```

  **Commit**: NO (verification only)

---

### ═══ WAVE 7 — Track D: Aegis Agent Mode ═══

- [ ] T-26. Update `docs/agents/aegis.md` — `mode: subagent` → `mode: agent`

  **What to do**:
  - Line 6: Change `mode: subagent` to `mode: agent`
  - This makes Aegis available as a TAB-switchable primary agent in OpenCode
  - Do NOT change any other frontmatter field or the agent prompt content

  **Must NOT do**:
  - Change the description, temperature, or permissions
  - Modify the agent prompt body
  - Touch any other file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T-27)
  - **Parallel Group**: Wave 7
  - **Blocks**: T-28
  - **Blocked By**: T-25

  **References**:
  - `docs/agents/aegis.md:6` — `mode: subagent` → `mode: agent`

  **Acceptance Criteria**:
  - [ ] `grep -c 'mode: agent' docs/agents/aegis.md` → `1`
  - [ ] `grep -c 'mode: subagent' docs/agents/aegis.md` → `0`

  **QA Scenarios**:
  ```
  Scenario: Mode changed in docs copy
    Tool: Bash
    Steps:
      1. grep 'mode:' docs/agents/aegis.md
      2. grep -c 'mode: subagent' docs/agents/aegis.md
    Expected Result: Step 1 → "mode: agent"; Step 2 → "0"
    Evidence: .sisyphus/evidence/task-26-aegis-docs-mode.txt
  ```

  **Commit**: YES — `feat(aegis): enable TAB-switch agent mode` covering only `docs/agents/aegis.md` (repo-tracked file only)
  - Message: `feat(aegis): enable TAB-switch agent mode`

---

- [ ] T-27. Update `~/.config/opencode/agents/aegis.md` — `mode: subagent` → `mode: agent`

  **What to do**:
  - Line 6: Change `mode: subagent` to `mode: agent`
  - This is the OpenCode runtime copy that actually controls agent behavior
  - **NOTE**: This file is outside the repository (in user's home config). The executor should edit `~/.config/opencode/agents/aegis.md` directly.

  **Must NOT do**:
  - Change any other frontmatter field
  - Modify permissions or temperature
  - Touch any other agent files (review.md, security.md, simplify.md)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T-26)
  - **Parallel Group**: Wave 7
  - **Blocks**: T-28
  - **Blocked By**: T-25

  **References**:
  - `~/.config/opencode/agents/aegis.md:6` — `mode: subagent` → `mode: agent`
  - Other agents in same dir: `review.md`, `security.md`, `simplify.md` — DO NOT modify

  **Acceptance Criteria**:
  - [ ] `grep -c 'mode: agent' ~/.config/opencode/agents/aegis.md` → `1`
  - [ ] `grep -c 'mode: subagent' ~/.config/opencode/agents/aegis.md` → `0`

  **QA Scenarios**:
  ```
  Scenario: Mode changed in OpenCode config copy
    Tool: Bash
    Steps:
      1. grep 'mode:' ~/.config/opencode/agents/aegis.md
      2. grep -c 'mode: subagent' ~/.config/opencode/agents/aegis.md
    Expected Result: Step 1 → "mode: agent"; Step 2 → "0"
    Evidence: .sisyphus/evidence/task-27-aegis-opencode-mode.txt
  ```

  **Commit**: NO — this is a manual local-config step only. `~/.config/opencode/agents/aegis.md` is outside the git repo and cannot be committed. Execute after T-26's commit via: `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md`

---

- [ ] T-28. Track D Verification — Confirm Aegis Agent Configuration

  **What to do**:
  - Verify both copies are updated:
    - `grep 'mode:' docs/agents/aegis.md` → `mode: agent`
    - `grep 'mode:' ~/.config/opencode/agents/aegis.md` → `mode: agent`
  - Verify the YAML frontmatter is still valid in both files
   - Verify no other agent files were modified:
    - `grep 'mode: subagent' ~/.config/opencode/agents/review.md` → still `mode: subagent` (unchanged)
    - `grep 'mode: subagent' ~/.config/opencode/agents/security.md` → still `mode: subagent` (unchanged)
    - Only `aegis.md` should differ from its prior state
  - Run final full test suite: `bun tsc --noEmit && bun test`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (gate task)
  - **Blocks**: Final Verification
  - **Blocked By**: T-26, T-27

  **Acceptance Criteria**:
  - [ ] Both aegis.md copies show `mode: agent`
  - [ ] `bun tsc --noEmit && bun test` → pass
  - [ ] No unintended file modifications

  **QA Scenarios**:
  ```
  Scenario: Both copies updated, full test suite passes
    Tool: Bash
    Steps:
      1. grep 'mode:' docs/agents/aegis.md
      2. grep 'mode:' ~/.config/opencode/agents/aegis.md
      3. bun tsc --noEmit
      4. bun test
    Expected Result: Steps 1,2 → "mode: agent"; Steps 3,4 → pass
    Evidence: .sisyphus/evidence/task-28-track-d-gate.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  **Tools**: Read, Grep, Bash (`bun tsc --noEmit`, `bun test`, `grep`)
  **Steps**:
  1. `bun tsc --noEmit` → expected: 0 errors
  2. `bun test` → expected: all suites pass
  3. `grep -c 'swallow: true' src/opencode/index.ts` → expected: `1`
  4. `grep -r 'seccomp=unconfined' src/ scripts/` → expected: no output
  5. `grep -r 'bash -c "\$' scripts/` → expected: no output
  6. `grep -c 'printErr\|printSectionTitle\|printBox' src/lib/ui.ts` → expected: `0`
  7. `grep -c 'runShellInherit' src/lib/base.ts` → expected: `0`
  8. `grep 'mode: agent' docs/agents/aegis.md` → expected: 1 match
  9. `bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(!!p.routing)"` → expected: `true`
  10. For each "Must NOT do" in every task: grep for the forbidden pattern, confirm 0 matches
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N compliant] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  **Tools**: Bash (`bun tsc --noEmit`, `bun test`), Read, Grep, lsp_diagnostics
  **Steps**:
  1. `bun tsc --noEmit` → expected: 0 errors
  2. `bun test` → expected: all pass, capture count
  3. `lsp_diagnostics src/` → expected: 0 errors
  4. `grep -rn 'as any\|@ts-ignore\|@ts-expect-error' src/` → expected: 0 matches
  5. `grep -rn 'console\.log' src/` → expected: 0 matches in non-test files
  6. Read each file modified in this sprint (from `git diff --name-only HEAD~5 HEAD`): check for empty catches, commented-out code, unused imports, excessive inline comments
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT: APPROVE/REJECT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  **Tools**: Bash, Read
  **Steps** (execute each QA scenario from tasks T-12 through T-24):
  1. T-12 (seccomp): `grep 'seccomp=unconfined' scripts/sandbox-start.sh` → 0 matches; `grep 'no-new-privileges' scripts/sandbox-start.sh` → 1 match
  2. T-13 (shell injection): `grep 'bash -c "\${CMD}"\|bash -c "\$CMD"' scripts/sandbox-exec.sh` → 0 matches
  3. T-14 (swallow): `grep -c 'swallow: true' src/opencode/index.ts` → exactly `1`
  4. T-15 (atomic write): `grep -c 'appendFile\|O_APPEND' src/lib/base.ts` → at least `1` (new atomic implementation present); `grep 'Bun\.file.*text.*Bun\.write\|existing.*Bun\.write' src/lib/base.ts` → `0` matches (old race-condition pattern removed)
  5. T-16 (JSON.parse): `grep -A2 'JSON.parse' src/hitl-gateway.ts` → shows try/catch wrapper
  6. T-17 (policy patterns): `grep 'bun install\|curl \|wget \|chmod' harness-policy.json` → matches in high_risk_patterns
  7. T-18 (deny patterns): `grep '_rsa\|\.key\|_ed25519' harness-policy.json` → matches in edit_file.deny_patterns
  8. T-21 (routing in policy): `bun -e "const p=JSON.parse(await Bun.file('harness-policy.json').text()); console.log(Object.keys(p.routing))"` → shows `['host_passthrough','sandbox_required']`
  9. T-24 (routing wired): `grep 'routeCommand\|host_passthrough' src/hooks/pre-tool-use.ts` → 1+ matches
  10. Save evidence: `.sisyphus/evidence/final-qa/f3-results.txt`
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT: APPROVE/REJECT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  **Tools**: Bash (`git diff --name-only HEAD~5 HEAD`), Read, Grep
  **Steps**:
  1. `git diff --name-only HEAD~5 HEAD` → list all changed files
  2. For each changed file: read the file, read the corresponding task's "What to do" and "Must NOT do" sections, verify 1:1 match
  3. Check no files were changed outside the sprint scope (no unrelated files touched)
  4. `grep -rn 'TODO\|FIXME\|HACK\|XXX' src/` → expected: 0 new instances added in this sprint
  5. Verify each task's evidence file exists in `.sisyphus/evidence/`
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

| After | Message | Files | Pre-commit |
|-------|---------|-------|------------|
| T-01…T-05 | `refactor(cleanup): remove dead code — ui, base, aegis types, scanner, verdict-log` | Modified/deleted files from T-01…T-05 | `bun tsc --noEmit && bun test` |
| T-06…T-10 | `refactor(consolidate): unify trivy/semgrep/parseInstall to single implementations` | Modified files from T-06…T-10 | `bun tsc --noEmit && bun test` |
| T-12…T-19 | `fix(security): apply 8 aegis audit findings — seccomp, injection, swallow, atomic writes, policy` | Modified files from T-12…T-19 | `bun tsc --noEmit && bun test` |
| T-21…T-24 | `feat(routing): add command routing matrix — host passthrough vs sandbox` | Modified files from T-21…T-24 | `bun tsc --noEmit && bun test` |
| T-26 only | `feat(aegis): enable TAB-switch agent mode` | `docs/agents/aegis.md` (repo-tracked only) | — |
| T-27 (manual) | **Manual step — not committed**: `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md` | `~/.config/opencode/agents/aegis.md` is outside the repo and cannot be git-tracked | — |

---

## Success Criteria

### Verification Commands
```bash
bun tsc --noEmit                          # Expected: zero errors
bun test                                  # Expected: all suites pass
grep -r 'seccomp=unconfined' src/ scripts/ # Expected: zero matches
grep -r 'bash -c "\$' scripts/            # Expected: zero matches  
grep -c 'swallow: true' src/opencode/index.ts # Expected: 1 (event handler only — afterHandler swallow removed)
grep 'printErr\|printSectionTitle\|printBox' src/lib/ui.ts # Expected: zero matches
grep 'runShellInherit' src/lib/base.ts     # Expected: zero matches
ls src/types/aegis.ts 2>&1                 # Expected: No such file
bun -e "const p = JSON.parse(await Bun.file('harness-policy.json').text()); console.log(!!p.routing)"  # Expected: true
grep 'mode: agent' docs/agents/aegis.md    # Expected: 1 match
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] All 5 commits created with conventional messages
- [ ] No dead code remains from identified targets
- [ ] All 8 security fixes applied
- [ ] Routing matrix functional
- [ ] Aegis TAB-switchable
