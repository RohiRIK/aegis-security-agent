# Plugin Deployment & Hardening — @aegis/opencode v0.1.0

## TL;DR

> **Quick Summary**: Ship Aegis as `@aegis/opencode` npm package with CLI installer, fix command-chain routing bypass, optimize scanner token output, and establish semver + changelog versioning.
> 
> **Deliverables**:
> - npm package `@aegis/opencode` with dual entry points (plugin + CLI)
> - Command-chain routing fix (no more `&&`/`;` bypass)
> - Lean scanner output (90% token reduction)
> - `experimental.session.compacting` hook for security context
> - CHANGELOG.md + semver release workflow
> - `bunx @aegis/opencode install` CLI flow
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1 → T4 → T8 → T12 → T14 → Final

---

## Context

### Original Request
User requested plugin development completion: sandbox validation, structure verification against OpenCode plugin spec, deployment strategy (modeled on oh-my-openagent), token optimization, and versioning.

### Interview Summary
**Key Discussions**:
- Package name: `@aegis/opencode` (scoped npm package)
- Initial version: `0.1.0` (pre-1.0 signals API may change)
- Versioning: semver + CHANGELOG.md
- Scope: everything in one plan (fixes + deployment + versioning)

**Research Findings**:
- oh-my-openagent uses single-package dual-entrypoint model (plugin + CLI in one)
- OpenCode plugin spec confirms `tool.execute.before` can mutate `output.args` ✓
- `permission.ask` IS a valid hook (Oracle confirmed via SDK typings)
- Command chaining (`&&`, `;`, `|`) bypasses routing — CRITICAL BUG
- Semgrep JSON in output costs 150-500 tokens per finding — needs lean mode
- Plugin load order matters: local plugins > npm plugins for precedence

### Oracle Architecture Review
**Key Recommendations**:
- Single package with local plugin shim (stronger precedence than npm-only)
- Aegis is a "tool-call guard" not a full sandbox — document limitations
- Use `client.app.log()` for structured logging
- Add compaction hook for security state persistence
- Don't add custom tools in v1 (enforcement stays in hooks)

### Metis Gaps Addressed
- Command chain bypass identified and planned for fix
- Token bloat from scanner output identified and solution designed
- Plugin export rename (Harness → Aegis) included
- Deployment strategy resolved (single package, not split)

---

## Work Objectives

### Core Objective
Ship `@aegis/opencode` as a properly versioned npm package with CLI installer, fixing known security bugs and optimizing for production use.

### Concrete Deliverables
- `package.json` configured for `@aegis/opencode` with bin + exports
- `src/opencode/index.ts` renamed export + compaction hook
- `src/core/router.ts` handles command chaining safely
- `src/opencode/handlers/after.ts` lean output mode
- `CHANGELOG.md` with initial release notes
- `bunx @aegis/opencode install` working end-to-end
- GitHub release workflow (tag → publish to npm)

### Definition of Done
- [ ] `bun tsc --noEmit` → 0 errors
- [ ] `bun test` → all pass (including new tests)
- [ ] `bunx @aegis/opencode install` scaffolds target project correctly
- [ ] Command chaining no longer bypasses routing (test proves it)
- [ ] Semgrep output in LLM context ≤ 50 tokens per finding

### Must Have
- Command chain validation in router
- Lean scanner output (one-liner + file-based detail)
- Working `bunx @aegis/opencode install` flow
- CHANGELOG.md + semver version in package.json
- Plugin export renamed to `AegisSecurityPlugin`

### Must NOT Have (Guardrails)
- No custom tools in v1 (increases attack surface)
- No marketing as "complete sandbox" (it's a tool-call guard)
- No breaking changes to existing `aegis-policy.json` format
- No cloud dependencies or telemetry
- No Docker as hard requirement (degraded mode must work)
- Do NOT use `directory` to locate bundled package assets
- Do NOT rely on npm plugin loading alone for enforcement ordering

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (bun test, 115 tests)
- **Automated tests**: TDD for security-critical fixes (command chain, token output)
- **Framework**: bun test

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI**: Use Bash — run install command, verify scaffolded files
- **Router**: Use Bash (bun test) — verify chained commands handled
- **Plugin**: Use Bash — run OpenCode with plugin, verify hooks fire

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — package setup + versioning):
├── Task 1: Package.json + exports map + bin entry [quick]
├── Task 2: CHANGELOG.md + version 0.1.0 [quick]
├── Task 3: Rename export HarnessSecurityPlugin → AegisSecurityPlugin [quick]

Wave 2 (Security fixes — command chain + output proxy):
├── Task 4: Fix command-chain bypass in router (depends: none) [deep]
├── Task 5: Output proxy layer — lean summaries + file storage (depends: none) [unspecified-high]
├── Task 6: Add compaction hook for security state (depends: 3) [quick]
├── Task 7: Use client.app.log() for structured logging (depends: 3) [quick]

Wave 3 (Deployment — CLI installer + local plugin shim):
├── Task 8: CLI install command — scaffolds for OpenCode (depends: 1) [unspecified-high]
├── Task 9: CLI install command — scaffolds for Claude Code (depends: 1) [unspecified-high]
├── Task 10: Local plugin shim generation (depends: 8) [quick]
├── Task 11: Build script (bun build → dist/) (depends: 1) [quick]

Wave 4 (Release — CI + publish):
├── Task 12: GitHub Actions release workflow (depends: 11) [quick]
├── Task 13: Standalone binary compilation (depends: 11) [quick]
├── Task 14: Integration test — full install → run flow (depends: 8,9,10) [deep]

Wave FINAL (After ALL — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | - | 8, 9, 10, 11 | 1 |
| 2 | - | 12 | 1 |
| 3 | - | 6, 7 | 1 |
| 4 | - | 14 | 2 |
| 5 | - | 14 | 2 |
| 6 | 3 | 14 | 2 |
| 7 | 3 | - | 2 |
| 8 | 1 | 10, 14 | 3 |
| 9 | 1 | 14 | 3 |
| 10 | 8 | 14 | 3 |
| 11 | 1 | 12, 13 | 3 |
| 12 | 11 | - | 4 |
| 13 | 11 | - | 4 |
| 14 | 8, 9, 10, 4, 5 | Final | 4 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks → `quick` × 3
- **Wave 2**: 4 tasks → `deep` × 1, `unspecified-high` × 1, `quick` × 2
- **Wave 3**: 4 tasks → `unspecified-high` × 2, `quick` × 2
- **Wave 4**: 3 tasks → `quick` × 2, `deep` × 1
- **FINAL**: 4 tasks → `oracle` × 1, `unspecified-high` × 2, `deep` × 1

---

## TODOs

- [x] 1. Package.json + exports map + bin entry

  **What to do**:
  - Create/update `package.json` with name `@aegis/opencode`, version `0.1.0`
  - Configure `bin: { "aegis": "bin/aegis.js" }`
  - Configure `exports: { ".": { types, import }, "./policy-schema": schema }`
  - Set `main: "./dist/index.js"`, `type: "module"`
  - Add `files: ["dist", "bin"]`
  - Add build scripts: `build`, `build:cli`, `prepublishOnly`
  - Add `@opencode-ai/plugin` as dependency (types + runtime)

  **Must NOT do**:
  - Do not add telemetry or analytics dependencies
  - Do not add `postinstall` scripts that run automatically

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 8, 9, 10, 11
  - **Blocked By**: None

  **References**:
  - `package.json` (current) — existing deps and scripts
  - oh-my-openagent package.json — reference for exports map, bin, and build scripts pattern
  - OpenCode plugin docs — how npm packages are resolved

  **Acceptance Criteria**:
  - [ ] `bun install` succeeds
  - [ ] `bun run build` produces `dist/index.js` and `dist/cli/index.js`

  **QA Scenarios**:
  ```
  Scenario: Package builds successfully
    Tool: Bash
    Steps:
      1. Run `bun run build`
      2. Assert `dist/index.js` exists
      3. Assert `dist/cli/index.js` exists
      4. Assert no TypeScript errors in build output
    Expected Result: Exit code 0, both dist files present
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES (groups with 2, 3)
  - Message: `chore: configure @aegis/opencode v0.1.0 package`
  - Files: `package.json`

- [x] 2. CHANGELOG.md + version 0.1.0

  **What to do**:
  - Create `CHANGELOG.md` following Keep a Changelog format
  - Add `[0.1.0] - YYYY-MM-DD` section with initial features list
  - Categories: Added, Fixed, Security
  - Document: command routing, Docker sandbox, degraded mode, Semgrep scanning, Trivy dep scanning

  **Must NOT do**:
  - Do not include unreleased/planned features as "Added"

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:
  - https://keepachangelog.com/en/1.1.0/ — changelog format
  - Current feature set in `src/opencode/handlers/` — what to document

  **Acceptance Criteria**:
  - [ ] CHANGELOG.md exists at project root
  - [ ] Contains `[0.1.0]` section with date

  **QA Scenarios**:
  ```
  Scenario: Changelog format valid
    Tool: Bash
    Steps:
      1. Read CHANGELOG.md
      2. Assert contains "# Changelog"
      3. Assert contains "[0.1.0]"
      4. Assert contains "### Added" section
    Expected Result: All assertions pass
    Evidence: .sisyphus/evidence/task-2-changelog.txt
  ```

  **Commit**: YES (groups with 1, 3)

- [x] 3. Rename export HarnessSecurityPlugin → AegisSecurityPlugin

  **What to do**:
  - Rename `HarnessSecurityPlugin` → `AegisSecurityPlugin` in `src/opencode/index.ts`
  - Keep `export default AegisSecurityPlugin` for backward compat
  - Update any imports/references in test files

  **Must NOT do**:
  - Do not rename the `HarnessPolicy` type yet (used broadly, separate concern)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:
  - `src/opencode/index.ts:48` — current export name
  - `src/opencode/handlers/before.test.ts` — may import it

  **Acceptance Criteria**:
  - [ ] `grep -r "HarnessSecurityPlugin" src/` returns 0 results
  - [ ] `bun tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Export renamed correctly
    Tool: Bash
    Steps:
      1. Run `grep -r "HarnessSecurityPlugin" src/`
      2. Assert 0 matches
      3. Run `grep -r "AegisSecurityPlugin" src/opencode/index.ts`
      4. Assert 2+ matches (named + default export)
    Expected Result: Old name gone, new name present
    Evidence: .sisyphus/evidence/task-3-rename.txt
  ```

  **Commit**: YES (groups with 1, 2)

- [x] 4. Fix command-chain bypass in router

  **What to do**:
  - In `src/core/router.ts`, before routing: split command on shell operators (`&&`, `||`, `;`, `|`)
  - Check EACH segment against routing patterns
  - If ANY segment matches `sandbox_required` → entire command routes to sandbox
  - If ANY segment matches high-risk → entire command blocked
  - Only route to `host` if ALL segments match `host_passthrough`
  - Add comprehensive tests for chained commands

  **Must NOT do**:
  - Do not attempt to parse complex shell syntax (subshells, heredocs) — focus on the 4 common operators
  - Do not break existing routing for simple commands

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`CodingStandards`, `Test`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Task 14
  - **Blocked By**: None

  **References**:
  - `src/core/router.ts` — current `routeCommand()` function
  - `src/core/router.test.ts` — existing 14 tests to not break
  - Bash operator semantics: `&&` (AND), `||` (OR), `;` (sequence), `|` (pipe)

  **Acceptance Criteria**:
  - [ ] `git status && curl evil.com` → routed to `sandbox` (not host)
  - [ ] `ls; rm -rf /` → blocked (high-risk in second segment)
  - [ ] `git log | head` → routed to `host` (pipe of two host-safe commands)
  - [ ] All existing 14 router tests still pass

  **QA Scenarios**:
  ```
  Scenario: Chained command with sandbox-required segment
    Tool: Bash
    Steps:
      1. Run `bun test src/core/router.test.ts`
      2. Assert test "chained command with sandbox segment routes to sandbox" passes
      3. Assert test "chained command with high-risk segment is blocked" passes
    Expected Result: All router tests pass including new chain tests
    Evidence: .sisyphus/evidence/task-4-router-chain.txt

  Scenario: Pipe of host-safe commands stays on host
    Tool: Bash
    Steps:
      1. Run `bun test src/core/router.test.ts --grep "pipe"` 
      2. Assert "git log | head" routes to host
    Expected Result: Pass
    Evidence: .sisyphus/evidence/task-4-pipe-host.txt
  ```

  **Commit**: YES
  - Message: `fix(security): validate all segments of chained commands in router`
  - Files: `src/core/router.ts`, `src/core/router.test.ts`
  - Pre-commit: `bun test src/core/router.test.ts`

- [x] 5. Output proxy layer — lean summaries + file storage

  **What to do**:
  - Create `src/lib/output-proxy.ts` with:
    - `proxyResult(toolName: string, fullOutput: string): { summary: string; detailPath: string }`
    - Writes full output to `.aegis/scans/{hash}.json`
    - Returns one-liner summary (≤50 tokens) for LLM context
    - Format: `"[AEGIS] {tool}: {count} issue(s) in {file} ({severities}). Details: {path}"`
  - Rewrite `src/opencode/handlers/after.ts` to use proxy:
    - Semgrep findings → proxy → lean summary in `output.output`
  - Rewrite Trivy output in `src/opencode/handlers/before.ts` to use proxy:
    - CVE details → proxy → lean error message
  - Pattern: ALL tool outputs go through proxy — never raw JSON in LLM context

  **Must NOT do**:
  - Do not remove the blocking behavior (Trivy still throws on CVEs)
  - Do not store secrets or sensitive file paths in scan result files
  - Do not make the proxy async-blocking (file write can be fire-and-forget)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Task 14
  - **Blocked By**: None

  **References**:
  - `src/opencode/handlers/after.ts` — current Semgrep output injection (line 14: `JSON.stringify(findings, null, 2)`)
  - `src/opencode/handlers/before.ts:67` — current Trivy error message
  - `src/lib/scan-cache.ts` — existing cache pattern to follow
  - context-mode plugin concept — same architectural pattern (proxy large output → lean summary)

  **Acceptance Criteria**:
  - [ ] Semgrep findings in LLM context ≤ 50 tokens per file scan
  - [ ] Full findings written to `.aegis/scans/` as JSON
  - [ ] Trivy block message is one line (not full vuln list)
  - [ ] `bun test` passes (after.ts tests updated)

  **QA Scenarios**:
  ```
  Scenario: Semgrep output is proxied to lean summary
    Tool: Bash
    Steps:
      1. Mock a Semgrep result with 5 findings
      2. Call afterHandler
      3. Assert output.output contains "[AEGIS] Semgrep:" 
      4. Assert output.output does NOT contain full JSON array
      5. Assert .aegis/scans/ contains a new .json file with full findings
    Expected Result: Lean summary in context, full detail in file
    Evidence: .sisyphus/evidence/task-5-proxy-lean.txt

  Scenario: Token count verification
    Tool: Bash
    Steps:
      1. Run afterHandler with 3 findings
      2. Count characters in output.output addition (proxy for tokens)
      3. Assert < 200 characters (≈50 tokens)
    Expected Result: Output addition is under 200 chars
    Evidence: .sisyphus/evidence/task-5-token-count.txt
  ```

  **Commit**: YES
  - Message: `feat(proxy): add output proxy for lean scanner summaries`
  - Files: `src/lib/output-proxy.ts`, `src/opencode/handlers/after.ts`, `src/opencode/handlers/before.ts`
  - Pre-commit: `bun test`

- [x] 6. Add compaction hook for security state

  **What to do**:
  - Add `experimental.session.compacting` handler in `src/opencode/handlers/compaction.ts`
  - Inject minimal security context into compaction:
    - Current routing mode (full/degraded)
    - Preflight status (passed/failed)
    - Active restrictions (blocked patterns count)
    - Docker state
  - Wire into `src/opencode/index.ts` return object
  - Keep injection ≤ 100 tokens

  **Must NOT do**:
  - Do not replace the compaction prompt (use `output.context.push()` only)
  - Do not inject scan results into compaction (they're ephemeral)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: Task 14
  - **Blocked By**: Task 3

  **References**:
  - OpenCode plugin docs — `experimental.session.compacting` example (output.context.push())
  - `src/opencode/index.ts` — where to wire the new handler

  **Acceptance Criteria**:
  - [ ] Compaction hook registered in plugin return object
  - [ ] Context injection ≤ 100 tokens

  **QA Scenarios**:
  ```
  Scenario: Compaction injects security context
    Tool: Bash
    Steps:
      1. Call compaction handler with mock output object
      2. Assert output.context array has 1 new entry
      3. Assert entry mentions "routing mode" and "preflight"
    Expected Result: Security context present in compaction
    Evidence: .sisyphus/evidence/task-6-compaction.txt
  ```

  **Commit**: YES (groups with 7)
  - Message: `feat(plugin): add compaction hook + structured logging`

- [x] 7. Use client.app.log() for structured logging

  **What to do**:
  - Update plugin signature to destructure `{ directory, client }` 
  - Replace `process.stderr.write("[AEGIS]...")` calls with `client.app.log()`
  - Use levels: `warn` for degraded, `error` for blocked, `info` for status
  - Keep stderr fallback if `client` unavailable (graceful)

  **Must NOT do**:
  - Do not remove stderr writes entirely (they're useful for debugging outside OpenCode)
  - Do not log sensitive data (file paths of .env, secret names)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - OpenCode plugin docs — `client.app.log()` example with service/level/message/extra
  - `src/opencode/handlers/before.ts` — all `process.stderr.write` calls
  - `src/opencode/handlers/session.ts` — preflight error logging

  **Acceptance Criteria**:
  - [ ] All `process.stderr.write("[AEGIS]` calls replaced with `client.app.log()`
  - [ ] Plugin signature includes `client` parameter

  **QA Scenarios**:
  ```
  Scenario: Structured logging works
    Tool: Bash
    Steps:
      1. grep for "process.stderr.write" in src/opencode/
      2. Assert 0 matches (all replaced)
      3. grep for "client.app.log" in src/opencode/
      4. Assert 3+ matches
    Expected Result: Structured logging replaces stderr
    Evidence: .sisyphus/evidence/task-7-logging.txt
  ```

  **Commit**: YES (groups with 6)

- [x] 8. CLI install command — scaffolds for OpenCode

  **What to do**:
  - Create `src/cli/install.ts` with OpenCode scaffolding logic:
    - Register `@aegis/opencode` in `opencode.json` plugin array
    - Copy `aegis-policy.json` template to project root (if missing)
    - Create `.aegis/` runtime directory
    - Generate local plugin shim at `.opencode/plugins/aegis.ts`
  - The local shim re-exports the npm package plugin (stronger precedence)
  - Accept flags: `--force` (overwrite existing), `--skip-docker` (skip sandbox check)

  **Must NOT do**:
  - Do not overwrite existing `aegis-policy.json` (user customizations!)
  - Do not modify files outside project root
  - Do not require Docker at install time

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: Tasks 10, 14
  - **Blocked By**: Task 1

  **References**:
  - `src/install.ts` — existing install logic (for Claude Code)
  - oh-my-openagent install flow — reference for registration in opencode.json
  - OpenCode plugin docs — local plugin loading from `.opencode/plugins/`

  **Acceptance Criteria**:
  - [ ] `bunx @aegis/opencode install` creates `.opencode/plugins/aegis.ts`
  - [ ] `opencode.json` contains `"@aegis/opencode"` in plugin array
  - [ ] `aegis-policy.json` exists in project root
  - [ ] Does NOT overwrite existing policy file

  **QA Scenarios**:
  ```
  Scenario: Fresh install scaffolds correctly
    Tool: Bash
    Preconditions: Empty temp directory with no existing config
    Steps:
      1. Run install command in temp dir
      2. Assert .opencode/plugins/aegis.ts exists
      3. Assert opencode.json has plugin entry
      4. Assert aegis-policy.json exists
      5. Assert .aegis/ directory exists
    Expected Result: All scaffolded files present
    Evidence: .sisyphus/evidence/task-8-install-fresh.txt

  Scenario: Install preserves existing policy
    Tool: Bash
    Preconditions: Temp dir with existing aegis-policy.json (custom content)
    Steps:
      1. Write custom aegis-policy.json with "custom": true
      2. Run install command
      3. Read aegis-policy.json
      4. Assert still contains "custom": true
    Expected Result: User policy not overwritten
    Evidence: .sisyphus/evidence/task-8-install-preserve.txt
  ```

  **Commit**: YES (groups with 9)
  - Message: `feat(cli): add install command for OpenCode + Claude Code`

- [x] 9. CLI install command — scaffolds for Claude Code

  **What to do**:
  - Extend `src/cli/install.ts` with `--claude` flag for Claude Code mode
  - Generates `.claude/hooks.json` with `__AEGIS_DIR__` stamped
  - Copies `.claude/agents/aegis.md` with path stamping
  - Creates `.claudeignore` if missing
  - Reuses existing `src/lib/hooks-template.ts` logic

  **Must NOT do**:
  - Do not duplicate the hooks-template — import from existing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10, 11)
  - **Blocks**: Task 14
  - **Blocked By**: Task 1

  **References**:
  - `src/install.ts` — existing Claude Code install logic (refactor into CLI)
  - `src/lib/hooks-template.ts` — HOOKS_TEMPLATE with __AEGIS_DIR__
  - `docs/agents/aegis.md` — agent template

  **Acceptance Criteria**:
  - [ ] `bunx @aegis/opencode install --claude` creates `.claude/hooks.json`
  - [ ] hooks.json contains stamped absolute path (no __AEGIS_DIR__ placeholder)

  **QA Scenarios**:
  ```
  Scenario: Claude Code install stamps hooks
    Tool: Bash
    Steps:
      1. Run install with --claude flag in temp dir
      2. Assert .claude/hooks.json exists
      3. Assert file does NOT contain "__AEGIS_DIR__"
      4. Assert file contains absolute path to src/hooks/
    Expected Result: Hooks stamped correctly
    Evidence: .sisyphus/evidence/task-9-claude-install.txt
  ```

  **Commit**: YES (groups with 8)

- [x] 10. Local plugin shim generation

  **What to do**:
  - The install command (Task 8) generates `.opencode/plugins/aegis.ts`:
    ```typescript
    export { AegisSecurityPlugin as default } from "@aegis/opencode";
    ```
  - This ensures Aegis loads LAST (local plugins load after npm plugins)
  - Add `.opencode/package.json` with `@aegis/opencode` as dependency
  - This gives Aegis strongest hook precedence in the plugin chain

  **Must NOT do**:
  - Do not inline the full plugin code in the shim (just re-export)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 8
  - **Blocks**: Task 14
  - **Blocked By**: Task 8

  **References**:
  - OpenCode plugin docs — load order: local plugins load after npm plugins
  - Oracle recommendation — local shim gives stronger final say

  **Acceptance Criteria**:
  - [ ] `.opencode/plugins/aegis.ts` re-exports from `@aegis/opencode`
  - [ ] `.opencode/package.json` has `@aegis/opencode` dependency

  **QA Scenarios**:
  ```
  Scenario: Shim re-exports correctly
    Tool: Bash
    Steps:
      1. Read .opencode/plugins/aegis.ts after install
      2. Assert contains 'from "@aegis/opencode"'
      3. Assert file is < 5 lines (just a re-export)
    Expected Result: Minimal shim present
    Evidence: .sisyphus/evidence/task-10-shim.txt
  ```

  **Commit**: YES (groups with 8, 9)

- [x] 11. Build script (bun build → dist/)

  **What to do**:
  - Add `scripts.build` to package.json:
    - `bun build src/opencode/index.ts --outdir dist --target bun --format esm`
    - `bun build src/cli/index.ts --outdir dist/cli --target bun --format esm`
    - `tsc --emitDeclarationOnly --outDir dist`
  - Ensure `dist/index.js` exports the plugin
  - Ensure `dist/cli/index.js` exports the CLI
  - Add `bin/aegis.js` wrapper that calls `dist/cli/index.js`
  - Add `.npmignore` or verify `files` field excludes src/tests

  **Must NOT do**:
  - Do not bundle `@opencode-ai/plugin` (keep as external)
  - Do not include test files in published package

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 10)
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Task 1

  **References**:
  - oh-my-openagent build script — `bun build src/index.ts --outdir dist --target bun --format esm --external ...`
  - Current `package.json` scripts section

  **Acceptance Criteria**:
  - [ ] `bun run build` produces `dist/index.js` and `dist/cli/index.js`
  - [ ] `node dist/cli/index.js --help` shows usage

  **QA Scenarios**:
  ```
  Scenario: Build produces valid dist
    Tool: Bash
    Steps:
      1. Run `bun run build`
      2. Assert dist/index.js exists and exports AegisSecurityPlugin
      3. Assert dist/cli/index.js exists
      4. Assert bin/aegis.js exists and is executable
    Expected Result: Build artifacts present
    Evidence: .sisyphus/evidence/task-11-build.txt
  ```

  **Commit**: YES
  - Message: `build: add bun build pipeline for dist + CLI`

- [ ] 12. GitHub Actions release workflow

  **What to do**:
  - Create `.github/workflows/release.yml`:
    - Trigger: push tag `v*`
    - Steps: checkout → bun install → bun test → bun run build → npm publish
    - Uses `NPM_TOKEN` secret for publishing
  - Create `.github/workflows/ci.yml`:
    - Trigger: push/PR to master
    - Steps: checkout → bun install → tsc → bun test
  - Add `.npmrc` with registry config for scoped package

  **Must NOT do**:
  - Do not auto-publish on every push (tag-triggered only)
  - Do not include secrets in workflow files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 13)
  - **Blocks**: None
  - **Blocked By**: Task 11

  **References**:
  - Standard npm publish workflow pattern
  - `CHANGELOG.md` — version to publish

  **Acceptance Criteria**:
  - [ ] `.github/workflows/release.yml` exists
  - [ ] `.github/workflows/ci.yml` exists
  - [ ] CI runs tsc + test on PR

  **QA Scenarios**:
  ```
  Scenario: Workflow files are valid YAML
    Tool: Bash
    Steps:
      1. Run yaml lint on .github/workflows/*.yml
      2. Assert valid syntax
    Expected Result: Both workflows parse correctly
    Evidence: .sisyphus/evidence/task-12-workflows.txt
  ```

  **Commit**: YES (groups with 13)
  - Message: `ci: add release + CI workflows`

- [ ] 13. Standalone binary compilation

  **What to do**:
  - Create `scripts/build-binaries.ts`:
    - Uses `bun build --compile` for CLI entry point
    - Targets: `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-linux-arm64`
    - Output to `binaries/aegis-{platform}-{arch}`
  - Add `scripts.build:binaries` to package.json
  - Add `binaries/` to `.gitignore`

  **Must NOT do**:
  - Do not compile the plugin (only the CLI needs standalone binary)
  - Do not include binaries in npm package (they're for GitHub releases only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 12)
  - **Blocks**: None
  - **Blocked By**: Task 11

  **References**:
  - oh-my-openagent `script/build-binaries.ts` — reference for bun compile targets
  - Bun docs on `--compile` flag

  **Acceptance Criteria**:
  - [ ] `bun run build:binaries` produces at least one binary
  - [ ] Binary runs without Bun installed (standalone)

  **QA Scenarios**:
  ```
  Scenario: Binary compiles for current platform
    Tool: Bash
    Steps:
      1. Run `bun run build:binaries`
      2. Assert binaries/ directory has at least 1 file
      3. Run the binary with --help flag
      4. Assert shows usage text
    Expected Result: Standalone binary works
    Evidence: .sisyphus/evidence/task-13-binary.txt
  ```

  **Commit**: YES (groups with 12)

- [ ] 14. Integration test — full install → run flow

  **What to do**:
  - Create `src/opencode/integration.test.ts`:
    - Test 1: Fresh install → verify all scaffolded files
    - Test 2: Plugin loads → verify hooks return correct keys
    - Test 3: Command routing with chained commands → verify correct behavior
    - Test 4: Output proxy → verify lean output + file written
    - Test 5: Degraded mode → verify blocked sandbox + allowed host
  - Use temp directories for isolation
  - This is the final gate before release

  **Must NOT do**:
  - Do not require Docker for these tests (mock detect state)
  - Do not require npm registry access

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`Test`, `CodingStandards`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final task before verification)
  - **Blocks**: Final verification wave
  - **Blocked By**: Tasks 4, 5, 8, 9, 10

  **References**:
  - `src/opencode/handlers/before.test.ts` — existing handler test patterns
  - `src/sandbox/detect.test.ts` — mock patterns for Docker state

  **Acceptance Criteria**:
  - [ ] All 5 integration tests pass
  - [ ] `bun test src/opencode/integration.test.ts` → 5 pass, 0 fail

  **QA Scenarios**:
  ```
  Scenario: Full integration suite passes
    Tool: Bash
    Steps:
      1. Run `bun test src/opencode/integration.test.ts`
      2. Assert 5 tests pass
      3. Assert 0 failures
    Expected Result: 5 pass / 0 fail
    Evidence: .sisyphus/evidence/task-14-integration.txt
  ```

  **Commit**: YES
  - Message: `test: add integration test suite for plugin + CLI flow`
  - Pre-commit: `bun test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify each Must Have is implemented. Check Must NOT Have patterns are absent. Verify evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `bun test`. Check for `as any`, empty catches, console.log, unused imports, AI slop.
  Output: `Build [PASS/FAIL] | Tests [N/N] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Run `bunx @aegis/opencode install` in a temp project. Verify scaffolding. Test command routing with Docker on/off.
  Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Compare each task spec vs actual diff. Verify nothing beyond spec was built. Check no cross-task contamination.
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Files |
|------|---------------|-------|
| 1 | `chore: configure @aegis/opencode package + rename export` | package.json, CHANGELOG.md, src/opencode/index.ts |
| 2 | `fix(security): handle command chaining + lean scanner output` | src/core/router.ts, src/opencode/handlers/after.ts, src/opencode/handlers/compaction.ts |
| 3 | `feat(cli): add bunx install flow with local plugin shim` | src/cli/, dist/ config |
| 4 | `ci: add release workflow + standalone binary compilation` | .github/workflows/, scripts/ |

---

## Success Criteria

### Verification Commands
```bash
bun tsc --noEmit                    # 0 errors
bun test                            # all pass
bun run build                       # dist/ created
bunx @aegis/opencode install        # scaffolds correctly
bunx @aegis/opencode status         # shows Docker state + version
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] CHANGELOG.md has v0.1.0 entry
- [ ] package.json version = "0.1.0"
- [ ] Export is `AegisSecurityPlugin`
- [ ] Command chaining validated in tests
- [ ] Scanner output ≤ 50 tokens per finding
