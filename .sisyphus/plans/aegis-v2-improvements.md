# Aegis v2 — Targeted Improvements Batch

## TL;DR

> **Quick Summary**: Batch of 6 targeted improvements to the Aegis security analyst agent: automate agent installation, add false-positive handling, scanner timeout protection, incremental scan mode, scan-cache directory scaffolding, and verdict history comparison. Mix of TypeScript infrastructure changes (install.ts) and markdown prompt engineering (aegis.md).
>
> **Deliverables**:
> - `src/install.ts` — Updated with audit.log creation, scan-cache dir, aegis.md copy during `--opencode`
> - `src/install.test.ts` — TDD tests for new install behaviors
> - `docs/agents/aegis.md` — v2 prompt overhaul (false-positives, timeout, incremental scan, verdict history, bash allowlist)
> - `docs/AEGIS.md` — Updated user docs reflecting v2 capabilities
>
> **Estimated Effort**: Short (~4-6 hours solo dev)
> **Parallel Execution**: YES — 2 waves (3 parallel in Wave 1, 1 sequential in Wave 2)
> **Critical Path**: A2-01 → A2-04

---

## Context

### Original Request

Batch of targeted improvements to the Aegis security analyst agent based on findings from the first `@aegis full-audit` run and usability gaps. Not a rewrite — surgical enhancements to the existing v1 agent.

### Key Research Findings

**Agent TAB-accessibility (resolved)**:
- All existing agents (`review.md`, `security.md`, `simplify.md`) use `mode: subagent` — same as Aegis
- SDK confirms: `mode: subagent` agents appear in `@` autocomplete by default (`hidden` defaults to `false`)
- **No mode change needed.** The real fix: automate `aegis.md` copy in `src/install.ts` during `--opencode` install so fresh installs include it. Currently install.ts doesn't copy agent definitions.

**First audit findings (6 improvements identified)**:
1. 3 false-positive AKIA patterns in docs (test fixtures described in documentation) — Aegis flagged them as HIGH
2. Missing `.aegis/audit.log` reported as finding — install.ts creates `.harness/` but not the log file
3. No scanner timeout protection — scanners can hang indefinitely
4. Full-repo scans only — no incremental/changed-files-only mode
5. Design doc Section 6 mentions `.harness/scan-cache/` but directory doesn't exist
6. No verdict history comparison — can't see if security posture improved or regressed

**Infrastructure state**:
- `src/install.ts` creates `.harness/` dir (empty), `.claude/`, copies policy files — does NOT create audit.log, scan-cache, or copy aegis.md
- `.harness/` is currently empty in the repo
- Audit logging implemented in hooks (`post-tool-use.sh` writes NDJSON to `.aegis/audit.log`)
- Test infrastructure: `src/smoke-test.ts` (10 tests, custom runner), `src/opencode-smoke-test.ts` (8 tests, `bun:test`)

### Gap Analysis (self-review, Metis timed out)

**Identified Gaps** (addressed in plan):
1. **`timeout` command portability** — macOS uses `gtimeout` (Homebrew coreutils). Aegis prompt must handle both.
2. **Shell redirect semantics** — `semgrep scan ... > file` matches `"semgrep scan *": allow` since redirection is a shell feature, not part of the command string. No new bash pattern needed for cache writes.
3. **Audit.log empty vs missing** — Aegis v1 already handles missing audit.log as a finding. The install fix ensures it always exists (empty). Prompt should distinguish "empty log" (new install) from "missing log" (something deleted it).
4. **Incremental scan scoping** — Must use `git diff --name-only main...HEAD` for branch scoping. Need to handle case where no `main` branch exists.

---

## Work Objectives

### Core Objective

Upgrade Aegis from v1 to v2 with 6 targeted improvements that address false positives, resilience, performance, and usability — without changing the core architecture or security posture.

### Concrete Deliverables

- `src/install.ts` — 3 new install steps (audit.log, scan-cache, aegis.md copy)
- `src/install.test.ts` — TDD tests for install behaviors (new file)
- `docs/agents/aegis.md` — v2 prompt with 5 prompt improvements + bash allowlist update
- `docs/AEGIS.md` — Updated user docs

### Definition of Done

- [ ] `bun tsc --noEmit` passes (zero type errors)
- [ ] `bun run src/smoke-test.ts` passes (10/10 existing + no regressions)
- [ ] `bun test ./src/opencode-smoke-test.ts` passes (8/8 existing + no regressions)
- [ ] `bun test ./src/install.test.ts` passes (new tests)
- [ ] After `bun run src/install.ts -- --opencode`, `.aegis/audit.log` exists
- [ ] After install, `.harness/scan-cache/` directory exists
- [ ] After install with `--opencode`, `~/.config/opencode/agents/aegis.md` exists
- [ ] Aegis v2 prompt contains all 5 improvement sections

### Must Have

- `edit: deny` remains PERMANENT on aegis.md — never editable
- `mode: subagent` unchanged — all agents use this mode
- `timeout *` bash pattern added to allowlist (scanner timeout protection)
- False-positive exclusion guidance for AKIA patterns in docs/
- Scanner timeout wrapping with graceful degradation
- Incremental scan mode using `git diff --name-only`
- Verdict version bumped to "Aegis v2" in footer
- TDD tests for install.ts changes

### Must NOT Have (Guardrails)

- **No new runtime dependencies** — pure Bun, zero npm deps
- **No `edit: allow`** — Aegis stays read-only forever (design doc Risk 3)
- **No complex caching system** — just directory creation and prompt awareness
- **No new task types** — enhance existing workflows, don't add new ones
- **No response format changes** — v2 uses same SAFE/RISKY/BLOCKED format
- **No plugin changes** — this is agent-level, not plugin-level
- **No breaking changes to existing tests** — 10/10 smoke + 8/8 opencode must stay green

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (`bun:test` framework, existing test files)
- **Automated tests**: YES (TDD) — new `src/install.test.ts` for install.ts changes
- **Framework**: `bun:test` (matches `src/opencode-smoke-test.ts` pattern)
- **Agent prompt changes**: QA scenarios (grep-based content verification)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **TypeScript**: Bash (`bun test`, `bun tsc --noEmit`) — compile + test verification
- **Markdown agent prompt**: Bash (grep for required sections/keywords/patterns)
- **Install behavior**: Bash (run installer in temp dir, verify file creation)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent, MAX PARALLEL):
├── A2-01: Install.ts infrastructure hardening [deep, TDD]
├── A2-02: aegis.md v2 prompt overhaul [deep]
└── A2-03: docs/AEGIS.md v2 update [writing]

Wave 2 (After Wave 1 — depends on A2-01, A2-02):
└── A2-04: Regression + smoke test verification [quick]

Critical Path: A2-01 → A2-04
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Depended On By | Wave |
|------|------------|----------------|------|
| A2-01 | — | A2-04 | 1 |
| A2-02 | — | A2-04 | 1 |
| A2-03 | — | — | 1 |
| A2-04 | A2-01, A2-02 | — | 2 |

### Agent Dispatch Summary

| Wave | Tasks | Dispatch |
|------|-------|----------|
| 1 | 3 | A2-01 → `deep`, A2-02 → `deep`, A2-03 → `writing` |
| 2 | 1 | A2-04 → `quick` |
| FINAL | 4 | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

> Every task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [ ] 1. Install.ts Infrastructure Hardening (TDD)

  **What to do**:
  1. **Write tests first** (`src/install.test.ts`) using `bun:test` pattern from `src/opencode-smoke-test.ts`:
     - Test: `install()` creates `.aegis/audit.log` as an empty file if it doesn't exist
     - Test: `install()` creates `.harness/scan-cache/` directory if it doesn't exist
     - Test: `install() --opencode` copies `docs/agents/aegis.md` to `~/.config/opencode/agents/aegis.md`
     - Test: `install()` skips audit.log creation if file already exists (idempotent)
     - Test: `install()` skips scan-cache dir if already exists (idempotent)
     - Test: `install()` skips aegis.md copy if already exists (idempotent)
     - All tests should use a temp directory (like `src/opencode-smoke-test.ts` uses `mkdtemp`) — don't touch real `.harness/` or real `~/.config/opencode/agents/`
  2. **Run tests** — confirm they fail (RED phase)
  3. **Implement in `src/install.ts`** — add 3 new steps to `main()`:
     - After line 97 (`.harness/` dir creation): `await copyIfMissing(/* empty content */, join(targetDir, ".harness", "audit.log"))` — use a new helper or inline `Bun.write` with empty string content, wrapped in the existing `copyIfMissing` pattern
     - After audit.log: `await ensureDir(join(targetDir, ".harness", "scan-cache"))` — create scan-cache directory
     - Inside the `if (opencode)` block (after line 125): copy `docs/agents/aegis.md` to `~/.config/opencode/agents/aegis.md` using the existing `copyIfMissing` pattern. Use `join(HARNESS_DIR, "docs", "agents", "aegis.md")` as source and `join(homedir(), ".config", "opencode", "agents", "aegis.md")` as destination. Import `homedir` from `node:os`.
  4. **Run tests again** — confirm they pass (GREEN phase)
  5. **Run existing tests** — `bun run src/smoke-test.ts` (10/10) and `bun test ./src/opencode-smoke-test.ts` (8/8) must still pass
  6. Copy updated aegis.md to live path after committing: `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md`

  **Must NOT do**:
  - Do NOT add runtime dependencies — use Bun built-ins only
  - Do NOT change the behavior of existing install steps — only ADD new ones
  - Do NOT modify the existing `.harness/` gitignore entry
  - Do NOT write non-empty content to audit.log — it must be empty (or touch equivalent)
  - Do NOT hardcode paths — use `join()` and `homedir()` for portability
  - Do NOT modify the test runner for `smoke-test.ts` — new tests go in a separate `install.test.ts` using `bun:test`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD workflow requires careful test design, implementation in an existing file with specific patterns, and regression verification. Multiple concerns (3 new install steps + 6 tests + idempotency).
  - **Skills**: [`CodingStandards`, `TddWorkflow`]
    - `CodingStandards`: TypeScript conventions, Bun patterns, import style.
    - `TddWorkflow`: RED-GREEN-REFACTOR discipline, test isolation with temp dirs.
  - **Skills Evaluated but Omitted**:
    - `BackendDesign`: No API design. Simple file operations.
    - `SecurityReview`: Not auditing security — implementing install flow.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A2-02, A2-03)
  - **Blocks**: A2-04 (regression test needs install changes to verify)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/install.ts:8-16` — `copyIfMissing()` helper: pattern for idempotent file creation. Use this for audit.log and aegis.md copy.
  - `src/install.ts:96-97` — `.harness/` dir creation with `ensureDir()`. Add audit.log and scan-cache creation AFTER this line.
  - `src/install.ts:114-126` — `if (opencode)` block where aegis.md copy belongs.
  - `src/opencode-smoke-test.ts:48-62` — Test setup/teardown with `mkdtemp` and `rm`. Follow this pattern for install.test.ts temp dir management.
  - `src/lib/base.ts` — `ensureDir()`, `fileExists()`, `writeStdout()` helpers already available.

  **API/Type References**:
  - `docs/design/aegis-dual-component-design.md:236-256` — Section 6: Shared State Architecture. Shows `.harness/scan-cache/` directory structure.
  - `src/install.ts:6` — `HARNESS_DIR` resolution. Used to locate `docs/agents/aegis.md` source.

  **WHY Each Reference Matters**:
  - `copyIfMissing` is the established idempotent file creation pattern — reuse it, don't reinvent.
  - The `if (opencode)` block is where OpenCode-specific install steps live — aegis.md copy belongs there.
  - `mkdtemp` pattern ensures tests don't mutate real filesystem.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Install creates audit.log in .harness/
    Tool: Bash
    Preconditions: Fresh temp directory, no .harness/ exists
    Steps:
      1. Run: bun test ./src/install.test.ts --test-name-pattern "audit.log"
      2. Assert test passes
      3. Verify the test checks: file exists, file is empty (0 bytes)
    Expected Result: Test passes, audit.log created as empty file
    Failure Indicators: Test fails, file not created, file has content
    Evidence: .sisyphus/evidence/task-1-audit-log.txt

  Scenario: Install creates .harness/scan-cache/ directory
    Tool: Bash
    Preconditions: Fresh temp directory
    Steps:
      1. Run: bun test ./src/install.test.ts --test-name-pattern "scan-cache"
      2. Assert test passes
      3. Verify the test checks: directory exists, is empty
    Expected Result: Test passes, scan-cache directory created
    Failure Indicators: Test fails, directory not created
    Evidence: .sisyphus/evidence/task-1-scan-cache.txt

  Scenario: Install copies aegis.md during --opencode
    Tool: Bash
    Preconditions: Fresh temp directory, docs/agents/aegis.md exists in source
    Steps:
      1. Run: bun test ./src/install.test.ts --test-name-pattern "aegis"
      2. Assert test passes
      3. Verify the test checks: file exists at destination, content matches source
    Expected Result: Test passes, aegis.md copied to agents dir
    Failure Indicators: Test fails, file not copied, content mismatch
    Evidence: .sisyphus/evidence/task-1-aegis-copy.txt

  Scenario: Install is idempotent (skip existing files)
    Tool: Bash
    Preconditions: Files from previous install exist
    Steps:
      1. Run: bun test ./src/install.test.ts --test-name-pattern "idempotent\|skip\|already exists"
      2. Assert all idempotency tests pass
    Expected Result: Existing files not overwritten, [SKIP] messages logged
    Failure Indicators: Files overwritten, no skip message
    Evidence: .sisyphus/evidence/task-1-idempotent.txt

  Scenario: Existing tests still pass (no regression)
    Tool: Bash
    Preconditions: Install changes applied
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert exit code 0
      3. Run: bun run src/smoke-test.ts
      4. Assert "10 passed, 0 failed"
      5. Run: bun test ./src/opencode-smoke-test.ts
      6. Assert all 8 tests pass
    Expected Result: All existing tests green, zero regressions
    Failure Indicators: Any test fails, type errors
    Evidence: .sisyphus/evidence/task-1-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-audit-log.txt
  - [ ] task-1-scan-cache.txt
  - [ ] task-1-aegis-copy.txt
  - [ ] task-1-idempotent.txt
  - [ ] task-1-regression.txt

  **Commit**: YES
  - Message: `feat(harness): harden install with audit.log, scan-cache, aegis copy`
  - Files: `src/install.ts`, `src/install.test.ts`
  - Pre-commit: `bun tsc --noEmit && bun test ./src/install.test.ts && bun run src/smoke-test.ts && bun test ./src/opencode-smoke-test.ts`

---

- [ ] 2. aegis.md v2 Prompt Overhaul — 5 Improvements + Bash Allowlist Update

  **What to do**:
  Edit `docs/agents/aegis.md` with these 5 targeted improvements. Each improvement is a NEW section or modification to existing sections. Do NOT rewrite from scratch — surgical edits to the existing v1 prompt.

  **Improvement A — Bash Allowlist Update** (YAML frontmatter):
  1. Add `"timeout *": allow` to the bash permission block — enables scanner timeout wrapping
  2. Verify `"semgrep --version": allow`, `"trivy --version": allow`, `"trufflehog --version": allow` are present (they ARE in v1 — don't duplicate)
  3. Final allowlist should have 14 patterns total (13 existing + 1 new `timeout`)

  **Improvement B — Scanner Timeout Protection** (new section after "Scanner Availability"):
  1. Add a `## Scanner Timeout Protection` section
  2. Instruct Aegis to wrap ALL scanner invocations with `timeout 300` (5 minute max):
     - `timeout 300 semgrep scan --config=p/security-audit --json .`
     - `timeout 300 trivy fs --scanners vuln --format json .`
     - `timeout 300 trufflehog filesystem --json .`
  3. If timeout exits with code 124: add `⚠️ TIMEOUT: <scanner> exceeded 5 minute limit` to verdict header
  4. Fall back to grep-based heuristics for that scanner (same as unavailable scanner)
  5. If `timeout` command not found (macOS without coreutils): run without timeout, note `⚠️ NO TIMEOUT: timeout command unavailable` in verdict

  **Improvement C — Known False Positives** (new section after "Rules"):
  1. Add a `## Known False Positives` section
  2. Document these exclusion patterns:
     - **AKIA patterns in documentation**: Files matching `docs/**/*.md` containing `AKIA` followed by 16 alphanumeric characters are test fixtures unless they pass Shannon entropy check (>4.5 bits/char). Report as `INFO` severity, not `HIGH`.
     - **Example credentials in README/docs**: Strings like `password123`, `example-api-key`, `sk-test-*` in `docs/`, `README.md`, or files containing "example" in the name are documentation fixtures.
     - **harness-policy.json patterns**: The `high_risk_patterns` array in `harness-policy.json` contains patterns like `rm -rf`, `DROP TABLE` — these are policy definitions, not vulnerabilities.
  3. Instruct Aegis: "Before reporting a finding, cross-reference against these exclusion patterns. If a finding matches an exclusion, downgrade to INFO severity and note `[known false-positive]` in the Description column."

  **Improvement D — Incremental Scan Mode** (enhance existing task workflows):
  1. Add a `## Incremental Scan Mode` section BEFORE the Task Types section
  2. Document: "When invoked with keywords like 'changed files only', 'incremental', or 'since last commit', scope all scanners to changed files only:"
     - Use `git diff --name-only main...HEAD` to identify changed files
     - If no `main` branch: try `git diff --name-only origin/main...HEAD`, then fall back to `git diff --name-only HEAD~10`
     - Pass file list to scanners: `semgrep scan --config=... <file1> <file2> ...` instead of `.`
     - Note in verdict: `**Scope**: Incremental — N changed files (not full repo)`
  3. The `pre-merge-review` task type already uses `git diff main...HEAD` — this enhancement generalizes it to all task types when requested

  **Improvement E — Verdict History Comparison** (enhance Response Format section):
  1. Add a `**Previous Verdict**` field to the response format, after `**Scope**`:
     ```
     **Verdict**: SAFE | RISKY | BLOCKED
     **Task**: <task-type>
     **Scope**: <what was analyzed>
     **Previous Verdict**: <last verdict for same task-type, or "N/A — first scan">
     **Delta**: <+N new findings / -N resolved / unchanged>
     ```
  2. Instruct Aegis: "Before producing your verdict, read `.aegis/audit.log` and grep for previous Aegis verdict entries. If a previous verdict exists for the same task type, include it as `Previous Verdict` and compute the delta (new findings vs resolved findings)."
  3. If audit.log is empty or has no Aegis entries: `**Previous Verdict**: N/A — first scan`

  **Improvement F — Version Bump**:
  1. Update the response format footer from `Scanned by: Aegis v1` to `Scanned by: Aegis v2`
  2. No other format changes

  **Must NOT do**:
  - Do NOT change `edit: deny` — permanent constraint
  - Do NOT change `mode: subagent` — all agents use this
  - Do NOT change `temperature: 0.1` — security analysis requires determinism
  - Do NOT add `webfetch: allow`
  - Do NOT rewrite existing task type workflows — only ADD sections
  - Do NOT change the verdict format structure (SAFE/RISKY/BLOCKED) — only add fields
  - Do NOT add conversational filler ("feel free to", "you might want to", "consider")
  - Do NOT remove any existing rules — only add new ones

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 5 surgical modifications to a security-critical system prompt. Each change must preserve existing behavior while adding new capabilities. The bash allowlist change requires exact YAML syntax. False-positive rules need precise language to avoid over-exclusion.
  - **Skills**: [`CodingStandards`, `Prompting`]
    - `CodingStandards`: YAML frontmatter formatting, markdown conventions.
    - `Prompting`: System prompt design — imperative voice, specificity, structured output instructions.
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: Aegis IS a security tool, but this task is writing its definition. Domain overlap indirect.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A2-01, A2-03)
  - **Blocks**: A2-04 (smoke test verifies prompt content)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `docs/agents/aegis.md:1-26` — YAML frontmatter. Add `"timeout *": allow` to the bash block (line ~24, after existing patterns). Keep exact format: `"pattern": allow`.
  - `docs/agents/aegis.md:49-57` — Scanner Availability section. New Scanner Timeout section goes AFTER this.
  - `docs/agents/aegis.md:107-134` — Response Format section. Add `**Previous Verdict**` and `**Delta**` fields here.
  - `docs/agents/aegis.md:136-152` — Rules section. Known False Positives section goes AFTER Rules.
  - `docs/agents/aegis.md:59-106` — Task Type workflows. Incremental Scan section goes BEFORE Task Types.

  **API/Type References**:
  - `docs/design/aegis-dual-component-design.md:400-410` — Risk 1: Scanner Availability Gap. Timeout protection addresses this risk.
  - `docs/design/aegis-dual-component-design.md:236-256` — Section 6: `.harness/scan-cache/` directory reference.

  **External References**:
  - `timeout` command: POSIX `timeout` (GNU coreutils) — exits with code 124 on timeout.

  **WHY Each Reference Matters**:
  - Frontmatter format must match exactly — wrong YAML syntax breaks the agent.
  - New sections must be placed at correct positions to maintain document flow.
  - Response format is a contract — additions must be backward-compatible.
  - Risk 1 from design doc directly motivates the timeout improvement.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Bash allowlist has 14 patterns including timeout
    Tool: Bash
    Preconditions: docs/agents/aegis.md exists
    Steps:
      1. Run: grep -c '": allow' docs/agents/aegis.md
      2. Assert output is "14" (13 existing + 1 new timeout pattern)
      3. Run: grep '"timeout \*": allow' docs/agents/aegis.md
      4. Assert match found
      5. Run: grep '"*": deny' docs/agents/aegis.md
      6. Assert match found (default deny preserved)
    Expected Result: 14 allow patterns including timeout, default deny preserved
    Failure Indicators: Wrong count, timeout pattern missing, default deny removed
    Evidence: .sisyphus/evidence/task-2-bash-allowlist.txt

  Scenario: Scanner Timeout Protection section present
    Tool: Bash
    Preconditions: docs/agents/aegis.md exists
    Steps:
      1. Run: grep -i "timeout.*protection\|scanner.*timeout" docs/agents/aegis.md
      2. Assert match found (section header)
      3. Run: grep "timeout 300" docs/agents/aegis.md
      4. Assert match found (timeout value in scanner commands)
      5. Run: grep "124\|TIMEOUT" docs/agents/aegis.md
      6. Assert match found (exit code 124 handling)
    Expected Result: Timeout section present with 300s default and exit code 124 handling
    Failure Indicators: Missing section, no timeout value, no exit code handling
    Evidence: .sisyphus/evidence/task-2-timeout.txt

  Scenario: Known False Positives section present
    Tool: Bash
    Preconditions: docs/agents/aegis.md exists
    Steps:
      1. Run: grep -i "false.positive\|known.*false\|exclusion" docs/agents/aegis.md
      2. Assert match found (section header)
      3. Run: grep -i "AKIA" docs/agents/aegis.md
      4. Assert match found (AKIA exclusion pattern)
      5. Run: grep -i "docs/\*\*/\*\.md\|documentation" docs/agents/aegis.md
      6. Assert match found (docs directory exclusion)
      7. Run: grep -i "INFO\|downgrade" docs/agents/aegis.md
      8. Assert match found (severity downgrade instruction)
    Expected Result: False positive section with AKIA exclusion, doc file awareness, severity downgrade
    Failure Indicators: Missing section, no AKIA mention, no severity guidance
    Evidence: .sisyphus/evidence/task-2-false-positives.txt

  Scenario: Incremental Scan Mode section present
    Tool: Bash
    Preconditions: docs/agents/aegis.md exists
    Steps:
      1. Run: grep -i "incremental\|changed.only\|changed.files" docs/agents/aegis.md
      2. Assert match found (section header or description)
      3. Run: grep "git diff --name-only" docs/agents/aegis.md
      4. Assert match found (git diff scoping command)
      5. Run: grep -i "main\.\.\.HEAD\|origin/main" docs/agents/aegis.md
      6. Assert match found (branch reference)
    Expected Result: Incremental scan section with git diff scoping and branch handling
    Failure Indicators: Missing section, no git diff command, no branch reference
    Evidence: .sisyphus/evidence/task-2-incremental.txt

  Scenario: Verdict History Comparison fields present
    Tool: Bash
    Preconditions: docs/agents/aegis.md exists
    Steps:
      1. Run: grep "Previous Verdict" docs/agents/aegis.md
      2. Assert match found
      3. Run: grep "Delta" docs/agents/aegis.md
      4. Assert match found
      5. Run: grep "first scan\|N/A" docs/agents/aegis.md
      6. Assert match found (handling for no previous verdict)
    Expected Result: Previous Verdict and Delta fields in response format
    Failure Indicators: Missing fields, no handling for first-scan case
    Evidence: .sisyphus/evidence/task-2-verdict-history.txt

  Scenario: Version bumped to v2
    Tool: Bash
    Preconditions: docs/agents/aegis.md exists
    Steps:
      1. Run: grep "Aegis v2" docs/agents/aegis.md
      2. Assert match found
      3. Run: grep "Aegis v1" docs/agents/aegis.md
      4. Assert ZERO matches (v1 reference removed from footer)
    Expected Result: Footer says "Aegis v2", no remaining "Aegis v1" references
    Failure Indicators: Still says v1, or v2 not present
    Evidence: .sisyphus/evidence/task-2-version.txt

  Scenario: No forbidden patterns introduced
    Tool: Bash
    Preconditions: docs/agents/aegis.md exists
    Steps:
      1. Run: grep -i "edit: allow" docs/agents/aegis.md
      2. Assert ZERO matches
      3. Run: grep -i "webfetch: allow" docs/agents/aegis.md
      4. Assert ZERO matches
      5. Run: grep -iE "feel free to|you might want|consider doing" docs/agents/aegis.md
      6. Assert ZERO matches (no AI slop)
      7. Run: grep "mode: subagent" docs/agents/aegis.md
      8. Assert match found (mode preserved)
    Expected Result: Zero forbidden patterns, mode preserved
    Failure Indicators: Any forbidden pattern found
    Evidence: .sisyphus/evidence/task-2-forbidden.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-bash-allowlist.txt
  - [ ] task-2-timeout.txt
  - [ ] task-2-false-positives.txt
  - [ ] task-2-incremental.txt
  - [ ] task-2-verdict-history.txt
  - [ ] task-2-version.txt
  - [ ] task-2-forbidden.txt

  **Commit**: YES
  - Message: `feat(aegis): upgrade agent prompt to v2 — timeout, false-positives, incremental scan`
  - Files: `docs/agents/aegis.md`
  - Post-commit: `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md` (install to live path)
  - Pre-commit: All QA scenarios pass

---

- [ ] 3. Update docs/AEGIS.md — v2 User Documentation

  **What to do**:
  1. Update `docs/AEGIS.md` to reflect v2 capabilities. This is an UPDATE to the existing file, not a rewrite.
  2. **Changes needed**:
     - Update the "Overview" paragraph to mention v2 improvements (timeout protection, incremental scan, false-positive handling, verdict history)
     - Add a `## What's New in v2` section after Overview with bullet list:
       - Scanner timeout protection (5-minute limit, graceful degradation)
       - Known false-positive exclusions (AKIA doc fixtures, example credentials)
       - Incremental scan mode (scope to changed files only)
       - Verdict history comparison (previous verdict + delta tracking)
     - Update the "How to Invoke" section with new invocation examples:
       - `@aegis Run an incremental scan on changed files only` → `full-audit` with incremental mode
       - `@aegis Compare this audit to the last one` → shows verdict history
     - Update the "Known Limitations" section:
       - ADD: "Scanner timeout set to 5 minutes — very large repos may need manual adjustment"
       - ADD: "False-positive exclusions are pattern-based — novel test fixture formats may not be caught"
     - Update version reference from v1 to v2
  3. Keep the document concise — this is a delta update, not a rewrite. Target adding ~20-30 lines.

  **Must NOT do**:
  - Do NOT rewrite the full document — only modify/add the sections listed above
  - Do NOT duplicate the design document content
  - Do NOT add implementation details (TypeScript code, internal paths)
  - Do NOT remove the capability comparison table
  - Do NOT change the verdict format documentation (it's backward-compatible)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Pure documentation update — no code, no design decisions. Writing skill for prose quality.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: Markdown formatting consistency.
  - **Skills Evaluated but Omitted**:
    - `Prompting`: Not prompt authoring — user docs.
    - `ContentWriter`: Technical reference, not content marketing.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A2-01, A2-02)
  - **Blocks**: None
  - **Blocked By**: None (references existing docs, not aegis.md changes)

  **References**:

  **Pattern References**:
  - `docs/AEGIS.md:1-128` — Entire existing file. Read before editing. Preserve structure and tone.
  - `docs/AEGIS.md:1-6` — Overview paragraph. Update to mention v2.
  - `docs/AEGIS.md:47-57` — "How to Invoke" section. Add incremental scan examples.
  - `docs/AEGIS.md:123-128` — "Known Limitations" section. Update with v2 limitations.

  **WHY Each Reference Matters**:
  - Must preserve existing structure while adding v2 content seamlessly.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: v2 capabilities documented
    Tool: Bash
    Preconditions: docs/AEGIS.md exists
    Steps:
      1. Run: grep -i "v2\|version 2\|what's new" docs/AEGIS.md
      2. Assert match found (v2 reference)
      3. Run: grep -i "timeout" docs/AEGIS.md
      4. Assert match found (timeout documented)
      5. Run: grep -i "false.positive\|exclusion" docs/AEGIS.md
      6. Assert match found (false-positive handling documented)
      7. Run: grep -i "incremental\|changed.files\|changed.only" docs/AEGIS.md
      8. Assert match found (incremental scan documented)
      9. Run: grep -i "verdict.*history\|previous.*verdict\|delta" docs/AEGIS.md
      10. Assert match found (verdict history documented)
    Expected Result: All 4 v2 capabilities mentioned in docs
    Failure Indicators: Any capability missing
    Evidence: .sisyphus/evidence/task-3-v2-docs.txt

  Scenario: Existing content preserved
    Tool: Bash
    Preconditions: docs/AEGIS.md exists
    Steps:
      1. Run: grep "## Overview" docs/AEGIS.md
      2. Assert match found
      3. Run: grep "SAFE.*RISKY.*BLOCKED\|Verdict" docs/AEGIS.md
      4. Assert match found (verdict format preserved)
      5. Run: grep -i "capability\|comparison" docs/AEGIS.md
      6. Assert match found (comparison table preserved)
      7. Run: grep "@aegis" docs/AEGIS.md
      8. Assert >= 5 matches (existing + new invocation examples)
    Expected Result: All existing sections preserved, new content added
    Failure Indicators: Existing sections removed or broken
    Evidence: .sisyphus/evidence/task-3-preserved.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-v2-docs.txt
  - [ ] task-3-preserved.txt

  **Commit**: YES
  - Message: `docs(aegis): update user docs for v2 capabilities`
  - Files: `docs/AEGIS.md`
  - Pre-commit: All QA scenarios pass

---

- [ ] 4. Regression + Smoke Test Verification

  **What to do**:
  1. Run ALL existing test suites to verify zero regressions:
     - `bun tsc --noEmit` — TypeScript compilation
     - `bun run src/smoke-test.ts` — 10 security smoke tests
     - `bun test ./src/opencode-smoke-test.ts` — 8 OpenCode plugin tests
     - `bun test ./src/install.test.ts` — new install tests (from A2-01)
  2. Run the installer and verify new behaviors:
     - Execute `bun run src/install.ts -- --opencode` in a test context
     - Verify `.aegis/audit.log` exists (empty)
     - Verify `.harness/scan-cache/` directory exists
     - Verify `~/.config/opencode/agents/aegis.md` exists and matches `docs/agents/aegis.md`
  3. Verify aegis.md prompt content (cross-check with A2-02):
     - All 14 bash allowlist patterns present
     - Scanner timeout section present
     - Known false positives section present
     - Incremental scan section present
     - Verdict history fields present
     - Version says "Aegis v2"
  4. Verify docs/AEGIS.md content (cross-check with A2-03):
     - v2 capabilities mentioned
     - Existing content preserved
  5. Document ALL results in `.sisyphus/evidence/task-4-regression.md`:
     - For each test suite: command, exit code, output summary
     - For each install verification: check, result, pass/fail
     - For each content check: grep result, pass/fail
     - Overall: PASS/FAIL with notes
  6. If any test fails, report the failure — do NOT attempt to fix (that would cross task boundaries)

  **Must NOT do**:
  - Do NOT modify any source files — this task is verification only
  - Do NOT skip any test suite
  - Do NOT mark the task as passed if any check fails
  - Do NOT run the installer against the real project directory — use test isolation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification-only task. Run commands, check outputs, document results. No complex reasoning or code writing.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: Evidence file formatting.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: None
  - **Blocked By**: A2-01 (needs install changes), A2-02 (needs prompt changes)

  **References**:

  **Pattern References**:
  - `src/smoke-test.ts` — 10 test definitions. Expect all to pass.
  - `src/opencode-smoke-test.ts` — 8 test definitions. Expect all to pass.
  - `src/install.test.ts` — New tests from A2-01. Expect all to pass.
  - `docs/agents/aegis.md` — Updated prompt from A2-02. Verify content.
  - `docs/AEGIS.md` — Updated docs from A2-03. Verify content.

  **WHY Each Reference Matters**:
  - Each file is a verification target — tests prove no regressions, content checks prove improvements landed.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All test suites pass
    Tool: Bash
    Preconditions: A2-01 and A2-02 changes applied
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert exit code 0
      3. Run: bun run src/smoke-test.ts
      4. Assert output contains "10 passed, 0 failed"
      5. Run: bun test ./src/opencode-smoke-test.ts
      6. Assert all 8 tests pass
      7. Run: bun test ./src/install.test.ts
      8. Assert all tests pass
    Expected Result: All test suites green
    Failure Indicators: Any non-zero exit code, any failed test
    Evidence: .sisyphus/evidence/task-4-tests.txt

  Scenario: Install creates all required artifacts
    Tool: Bash
    Preconditions: Install changes from A2-01 applied
    Steps:
      1. Run: test -f .aegis/audit.log && echo "EXISTS" || echo "MISSING"
      2. Assert "EXISTS"
      3. Run: test -d .harness/scan-cache && echo "EXISTS" || echo "MISSING"
      4. Assert "EXISTS"
      5. Run: test -f ~/.config/opencode/agents/aegis.md && echo "EXISTS" || echo "MISSING"
      6. Assert "EXISTS"
      7. Run: diff docs/agents/aegis.md ~/.config/opencode/agents/aegis.md
      8. Assert no differences (files match)
    Expected Result: All artifacts exist, aegis.md matches source
    Failure Indicators: Any artifact missing, content mismatch
    Evidence: .sisyphus/evidence/task-4-install-artifacts.txt

  Scenario: Evidence summary file complete
    Tool: Bash
    Preconditions: All verification steps completed
    Steps:
      1. Create .sisyphus/evidence/task-4-regression.md with:
         - Test suite results (command, exit code, pass/fail)
         - Install artifact checks (file, exists, pass/fail)
         - Content verification checks (grep, match, pass/fail)
         - Overall verdict: PASS/FAIL
      2. Verify file exists: test -f .sisyphus/evidence/task-4-regression.md
    Expected Result: Comprehensive evidence file documenting all verification results
    Failure Indicators: Missing file, incomplete documentation
    Evidence: .sisyphus/evidence/task-4-regression.md
  ```

  **Evidence to Capture:**
  - [ ] task-4-tests.txt
  - [ ] task-4-install-artifacts.txt
  - [ ] task-4-regression.md (summary)

  **Commit**: NO (verification only — no committed files)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for keywords). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [4/4] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun tsc --noEmit` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (install creates files that aegis.md references). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [4/4 compliant] | Creep [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Tasks | Message | Files |
|--------|-------|---------|-------|
| 1 | A2-01 | `feat(harness): harden install with audit.log, scan-cache, aegis copy` | `src/install.ts`, `src/install.test.ts` |
| 2 | A2-02 | `feat(aegis): upgrade agent prompt to v2 — timeout, false-positives, incremental scan` | `docs/agents/aegis.md` |
| 3 | A2-03 | `docs(aegis): update user docs for v2 capabilities` | `docs/AEGIS.md` |

Note: A2-04 (verification) produces no committed files — verification only.

---

## Success Criteria

### Verification Commands

```bash
# Existing tests still pass
bun tsc --noEmit                          # Expected: no errors
bun run src/smoke-test.ts                 # Expected: 10 passed, 0 failed
bun test ./src/opencode-smoke-test.ts     # Expected: 8 pass

# New tests pass
bun test ./src/install.test.ts            # Expected: all pass

# Install creates required files
bun run src/install.ts -- --opencode      # Then verify:
test -f .aegis/audit.log               # Expected: exists (empty)
test -d .harness/scan-cache              # Expected: exists
test -f ~/.config/opencode/agents/aegis.md # Expected: exists

# Aegis v2 prompt has required content
grep "timeout" docs/agents/aegis.md       # Expected: match
grep -i "false.positive\|known.*false\|exclusion" docs/agents/aegis.md  # Expected: match
grep "changed-only\|incremental\|changed.files" docs/agents/aegis.md   # Expected: match
grep "Aegis v2" docs/agents/aegis.md      # Expected: match
```

### Final Checklist

- [ ] `edit: deny` preserved in aegis.md
- [ ] `mode: subagent` preserved in aegis.md
- [ ] `timeout *` bash pattern added to allowlist
- [ ] False-positive handling section present
- [ ] Scanner timeout wrapping documented
- [ ] Incremental scan mode documented
- [ ] Verdict comparison section present
- [ ] Version bumped to Aegis v2 in footer
- [ ] Install creates audit.log, scan-cache/, copies aegis.md
- [ ] All existing tests pass (10/10 + 8/8)
- [ ] New install tests pass
- [ ] No new runtime dependencies added
