# QA Report — AI-Agent Aegis Security MVP

Scope: review of the existing smoke suite and adjacent aegis scripts/config only. No production code changed.

Files reviewed:

- `security-smoke-test.sh`
- `aegis-preflight.sh`
- `hooks/pre-tool-use.sh`
- `hooks/post-tool-use.sh`
- `scripts/hitl-gateway.sh`
- `scripts/sandbox-exec.sh`
- `scripts/shred.sh`
- `aegis-policy.json`
- `.claude/mcp.json`
- `.claude/hooks.json`
- `.pre-commit-config.yaml`
- `.env.schema`
- `docs/SPEC.md`

## 1. Current Test Coverage Analysis

### 1.1 T-001 to T-010 → SPEC mapping

| Test | Current result | SPEC FR(s) | Assessment |
|---|---:|---|---|
| T-001 Pre-flight blocks real secret in env | PASS | FR-001, partial FR-003 | Good negative-path coverage for the env hard gate. Only exercises one sensitive var, not the full list. |
| T-002 Pre-flight passes clean environment | PASS | partial FR-001, incidental FR-005/FR-008/FR-009/FR-022 | Weak happy-path coverage only. It does not isolate any individual pre-flight check. |
| T-003 TruffleHog blocks seeded credential | SKIP | intended FR-007 | Coverage is invalid for FR-007. The test runs `trufflehog filesystem` on a temp file, not a git/pre-commit path; see `security-smoke-test.sh:53-57`. |
| T-004 Sandbox cannot read host sentinel | PASS | partial FR-016; strongest match is NFR-006 | Useful escape canary, but it does not prove bash-tool routing through `hooks/pre-tool-use.sh`. |
| T-005 Semgrep detects hardcoded API key | SKIP | partial FR-013 | Only checks Semgrep CLI + `p/secrets`; it does not verify `PostToolUse` hook invocation required by FR-012. |
| T-006 HITL gateway denies on 'no' input | PASS | partial FR-026 | Deny-path only. No approve-path, timeout-path, JSON-output, or audit-log assertion. |
| T-007 lean-ctx DB clean of sensitive patterns | PASS (vacuous) | intended FR-025 | Invalid. `.aegis/lean-ctx.db` may not exist, so `strings ... | grep ...` trivially succeeds; see `security-smoke-test.sh:79-81`. |
| T-008 `.env.schema` has `@sensitive` annotations | PASS | partial FR-004 | Weak coverage. It proves at least one annotation exists, not that all required sensitive fields are annotated. |
| T-009 MCP config uses stdio only | PASS | FR-033, partial FR-011/FR-014/FR-021 | Good transport check, but does not assert required servers actually exist. |
| T-010 `aegis shred` removes lean-ctx.db | PASS | partial FR-024 | Only checks one file. FR-024 requires all aegis-managed SQLite files, and the spec text also expects confirmation output. |

### 1.2 Confirmed smoke-suite weaknesses

- **T-007 is a vacuous pass** because the DB is never created before scanning (`security-smoke-test.sh:79-81`).
- **T-003 and T-005 are conditional SKIPs**, so two core detections can disappear from CI signal entirely when local tooling is absent (`security-smoke-test.sh:23-39`, `53-72`).
- **T-006 covers only denial**, not approval or timeout (`security-smoke-test.sh:74-77`).
- **Pre-flight checks are not isolated**; a single green T-002 can hide regressions in checks 1, 2, 4, 5, 6, or 7.
- **HIGH-RISK pattern discrimination is untested**; there is no assertion that `DROP TABLE` gates and `SELECT *` bypasses.

### 1.3 FRs with no direct smoke coverage

Non-Phase-2 FRs with **no direct** current smoke coverage:

- FR-002
- FR-006
- FR-007
- FR-011
- FR-012
- FR-014
- FR-015
- FR-016
- FR-017
- FR-018
- FR-019
- FR-021
- FR-023
- FR-028
- FR-029
- FR-030
- FR-031
- FR-032
- FR-034
- FR-036
- FR-037
- FR-038
- FR-039

FRs with only **weak / incidental / vacuous** coverage today:

- FR-003
- FR-004
- FR-005
- FR-008
- FR-009
- FR-013
- FR-022
- FR-024
- FR-025
- FR-026
- FR-027
- FR-033

## 2. Bug Report

### BUG-001 — T-007 passes even when lean-ctx DB was never created

- **Severity:** HIGH
- **File:line:** `security-smoke-test.sh:79-81`
- **Description:** The test intended to validate FR-025 does not create `.aegis/lean-ctx.db` first. Because `strings` runs on a missing file and stderr is discarded, the negated pipeline returns success and the test reports PASS without validating anything.
- **Reproduction:**
  1. Ensure `.aegis/lean-ctx.db` does not exist.
  2. Run `bash security-smoke-test.sh`.
  3. Observe T-007 passes.
- **Expected:** T-007 should create a real SQLite DB, write benign content, then verify the detector is actually scanning a real file.
- **Actual:** T-007 passes vacuously on a missing DB.

### BUG-002 — T-003 exercises the wrong TruffleHog interface

- **Severity:** MEDIUM
- **File:line:** `security-smoke-test.sh:53-57`
- **Description:** FR-007 requires the git/pre-commit path to block commits containing verified credentials. The current test uses `trufflehog filesystem` against an untracked temp file, so it does not verify the documented hook path from `docs/SPEC.md:115` and `.pre-commit-config.yaml:1-10`.
- **Reproduction:**
  1. Install `trufflehog`.
  2. Run only the T-003 command from `security-smoke-test.sh`.
  3. Note the command never stages a file and never exercises a commit/pre-commit flow.
- **Expected:** A temporary git repo with a staged credential should produce a non-zero result on the git/pre-commit path.
- **Actual:** The smoke suite only proves filesystem scanning behavior.

### BUG-003 — T-005 can skip entirely and does not verify the PostToolUse hook path

- **Severity:** MEDIUM
- **File:line:** `security-smoke-test.sh:65-72`, `hooks/post-tool-use.sh:18-32`
- **Description:** FR-012 requires the `PostToolUse` hook to scan every written file. T-005 only runs Semgrep CLI directly, and when `semgrep` is absent it reports SKIP rather than a failed security signal.
- **Reproduction:**
  1. Run `bash security-smoke-test.sh` on a machine without `semgrep`.
  2. Observe T-005 is SKIP.
  3. Even with `semgrep` installed, T-005 never invokes `hooks/post-tool-use.sh`.
- **Expected:** At minimum one smoke test should drive `hooks/post-tool-use.sh` end-to-end and assert findings/audit logging.
- **Actual:** The suite tests only raw Semgrep CLI output.

### BUG-004 — No smoke coverage for HITL approve path

- **Severity:** MEDIUM
- **File:line:** `security-smoke-test.sh:74-77`
- **Description:** The suite validates only deny-on-`no`. FR-026 requires execution to proceed on `approve`; FR-030 also requires timeout deny. Neither path is covered.
- **Reproduction:**
  1. Review `security-smoke-test.sh` tests T-006 only.
  2. There is no approve-path or timeout-path test.
- **Expected:** Separate tests for `approve`, non-approve deny, and timeout deny.
- **Actual:** Deny path only.

### BUG-005 — Pre-flight does not fail when TruffleHog hook is missing

- **Severity:** HIGH
- **File:line:** `aegis-preflight.sh:65-72`
- **Description:** FR-008 says the pre-flight script must verify the TruffleHog hook is installed and active, and `docs/SPEC.md:116` states the acceptance criterion is non-zero exit if absent. The implementation emits `WARN` and continues.
- **Reproduction:**
  1. Temporarily remove or rename `.pre-commit-config.yaml`.
  2. Run `bash aegis-preflight.sh` in an otherwise clean environment.
  3. Observe the script warns and continues instead of exiting non-zero.
- **Expected:** Missing TruffleHog hook should block startup.
- **Actual:** Startup is allowed with only a warning.

### BUG-006 — `PreToolUse` consumes stdin before invoking HITL, so hook-level approval is not reachable

- **Severity:** HIGH
- **File:line:** `hooks/pre-tool-use.sh:14-16`, `hooks/pre-tool-use.sh:65`, `scripts/hitl-gateway.sh:24-30`
- **Description:** The hook protocol delivers JSON on stdin. `pre-tool-use.sh` reads all stdin into `INPUT=$(cat)` before calling `scripts/hitl-gateway.sh`. The gateway then tries to `read` from the same stdin, which has already been exhausted. In hook context this makes interactive approval effectively unreachable.
- **Reproduction:**
  1. Run `printf '%s' '{"tool_name":"bash","tool_input":{"command":"DROP TABLE users"}}' | HITL_TIMEOUT_SECONDS=1 bash hooks/pre-tool-use.sh`.
  2. Observe the hook denies after the timeout path.
  3. There is no way to feed a second interactive response once stdin has already been consumed by `cat`.
- **Expected:** The hook should read approval from the terminal/TTY while still receiving hook JSON.
- **Actual:** Hook-level HIGH-RISK commands fall into deny/timeout behavior because stdin is already spent.

### BUG-007 — HITL gateway does not print the structured JSON block required by FR-028

- **Severity:** MEDIUM
- **File:line:** `scripts/hitl-gateway.sh:14-21`
- **Description:** FR-028 and `docs/SPEC.md:777-799` require the approval request JSON block to be printed to stdout before the prompt. The implementation prints a banner and formatted field list instead.
- **Reproduction:**
  1. Run `echo approve | bash scripts/hitl-gateway.sh '<json>'`.
  2. Capture stdout.
  3. Observe there is no raw JSON block.
- **Expected:** Stdout should first contain the full `hitl_request` JSON object.
- **Actual:** Stdout contains only a human-formatted table.

### BUG-008 — HIGH-RISK taxonomy is incomplete relative to FR-027

- **Severity:** HIGH
- **File:line:** `aegis-policy.json:31-35`, `hooks/pre-tool-use.sh:25-35`
- **Description:** FR-027 requires HIGH-RISK handling for database schema changes, secret generation/rotation, production deployment commands, network access from sandbox, and destructive filesystem operations. The policy covers some DB/destructive/deploy patterns, but it does **not** cover secret generation/rotation or sandbox network access.
- **Reproduction:**
  1. Review `aegis-policy.json` high-risk patterns.
  2. Note there is no pattern for secret generation/rotation and no pattern for enabling network access.
- **Expected:** Policy should encode all FR-027 classes.
- **Actual:** Two required classes are absent.

### BUG-009 — `SessionStart` pre-flight hook is missing

- **Severity:** HIGH
- **File:line:** `.claude/hooks.json:1-37`
- **Description:** FR-032 requires a `SessionStart` hook that runs `aegis-preflight.sh` and aborts startup on non-zero exit. `.claude/hooks.json` contains `PreToolUse`, `PostToolUse`, and `Stop`, but no `SessionStart`.
- **Reproduction:**
  1. Open `.claude/hooks.json`.
  2. Observe there is no `SessionStart` key.
- **Expected:** `SessionStart` should exist and invoke `aegis-preflight.sh`.
- **Actual:** No startup gate is configured.

### BUG-010 — Package-install guard does not implement the spec’d Snyk MCP health check

- **Severity:** HIGH
- **File:line:** `hooks/pre-tool-use.sh:84-94`
- **Description:** FR-015 requires the hook to invoke `snyk_package_health_check` via the Snyk MCP server before `npm install`, `pip install`, or `cargo add`. The current implementation shells out to `snyk test`, does not use MCP, and hardcodes `--package-manager=npm` even for `pip` and `cargo` flows.
- **Reproduction:**
  1. Review `hooks/pre-tool-use.sh:84-94`.
  2. Note there is no MCP invocation and that all package-manager checks are treated as npm.
- **Expected:** A package-manager-aware MCP health check should run before install commands.
- **Actual:** The implementation uses a local CLI fallback with incorrect package-manager semantics.

## 3. Extended Test Cases (T-011 onwards)

All commands below are written in the same `run_test` / `run_test_if_available` style as `security-smoke-test.sh` and are intended to be copy-pasted into that suite.

### T-011 — Corrected replacement for current T-007

- **Name:** `T-011: lean-ctx DB clean after real SQLite write`
- **Tests:** FR-025 with a real SQLite file, not a missing path.
- **Expected exit code:** `0`

```bash
run_test "T-011: lean-ctx DB clean after real SQLite write" \
  "DB='$ROOT/.aegis/lean-ctx.db'; export DB; mkdir -p '$ROOT/.aegis' && rm -f \"$DB\" && \
   python3 -c 'import os, sqlite3; db=os.environ[\"DB\"]; conn=sqlite3.connect(db); conn.execute(\"create table memory(summary text)\"); conn.execute(\"insert into memory values (?)\", (\"architecture summary only\",)); conn.commit(); conn.close()' && \
   ! strings \"$DB\" 2>/dev/null | grep -iE 'password|secret|api_key|token'"
```

### T-012 — Negative control for the DB scanner

- **Name:** `T-012: lean-ctx DB detector trips on seeded token`
- **Tests:** Confirms the FR-025 detector actually catches a seeded sensitive pattern.
- **Expected exit code:** `0`

```bash
run_test "T-012: lean-ctx DB detector trips on seeded token" \
  "DB='$ROOT/.aegis/lean-ctx.db'; export DB; mkdir -p '$ROOT/.aegis' && rm -f \"$DB\" && \
   python3 -c 'import os, sqlite3; db=os.environ[\"DB\"]; conn=sqlite3.connect(db); conn.execute(\"create table memory(summary text)\"); conn.execute(\"insert into memory values (?)\", (\"api_key=sk-test-123\",)); conn.commit(); conn.close()' && \
   strings \"$DB\" 2>/dev/null | grep -qiE 'password|secret|api_key|token'"
```

### T-013 — Active TruffleHog detection on the git path

- **Name:** `T-013: TruffleHog blocks seeded credential on git diff`
- **Tests:** Active detector behavior on the git interface used by the documented hook path.
- **Expected exit code:** `0`
- **Requires:** `trufflehog`, `git`

```bash
run_test_if_available "T-013: TruffleHog blocks seeded credential on git diff" \
  "command -v trufflehog && command -v git" \
  "tmpdir=\$(mktemp -d) && \
   git -C \"$tmpdir\" init -q && \
   git -C \"$tmpdir\" config user.email qa@example.com && \
   git -C \"$tmpdir\" config user.name qa && \
   printf 'baseline\n' > \"$tmpdir/README.md\" && \
   git -C \"$tmpdir\" add README.md && \
   git -C \"$tmpdir\" commit -qm init && \
   printf 'aws=AKIAIOSFODNN7EXAMPLE\n' > \"$tmpdir/secret.txt\" && \
   git -C \"$tmpdir\" add secret.txt && \
   trufflehog git \"file://$tmpdir\" --since-commit HEAD --results=verified --fail --trust-local-git-config >/dev/null 2>&1; \
   EXIT=$?; rm -rf \"$tmpdir\"; [[ $EXIT -ne 0 ]]"
```

### T-014 — Pre-commit hook entry matches the documented command

- **Name:** `T-014: TruffleHog hook entry matches spec`
- **Tests:** FR-006
- **Expected exit code:** `0`

```bash
run_test "T-014: TruffleHog hook entry matches spec" \
  "grep -q 'trufflehog git file://\\. --since-commit HEAD --results=verified --fail --trust-local-git-config' '$ROOT/.pre-commit-config.yaml'"
```

### T-015 — PostToolUse hook invokes Semgrep and logs findings

- **Name:** `T-015: PostToolUse hook emits Semgrep finding`
- **Tests:** FR-012, FR-013, NFR-010
- **Expected exit code:** `0`
- **Requires:** `semgrep`, `jq`

```bash
run_test_if_available "T-015: PostToolUse hook emits Semgrep finding" \
  "command -v semgrep && command -v jq" \
  "tmp=\$(mktemp -t posttoolXXXXXX.py 2>/dev/null || mktemp) && \
   printf 'import subprocess\nsubprocess.run(user_input, shell=True)\n' > \"$tmp\" && \
   rm -f '$ROOT/.aegis/audit.log' && \
   out=\$(printf '%s' '{\"tool_name\":\"Write\",\"tool_input\":{\"path\":\"'\"$tmp\"'\"}}' | bash '$ROOT/hooks/post-tool-use.sh') && \
   rm -f \"$tmp\" && \
   printf '%s' \"$out\" | grep -q '\"rule\"' && \
   grep -q '\"event\":\"semgrep_finding\"' '$ROOT/.aegis/audit.log'"
```

### T-016 — HITL approve path

- **Name:** `T-016: HITL gateway approves on approve`
- **Tests:** FR-026
- **Expected exit code:** `0`

```bash
run_test "T-016: HITL gateway approves on approve" \
  "echo 'approve' | bash '$ROOT/scripts/hitl-gateway.sh' '{\"hitl_request\":{\"id\":\"t016\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"session_id\":\"test\",\"action\":{\"tool\":\"bash\",\"command\":\"rm -rf /tmp/demo\",\"risk_reason\":\"test\",\"risk_level\":\"HIGH\",\"reversible\":false},\"context\":{\"current_task\":\"test\",\"working_directory\":\"/tmp\"},\"instructions\":\"test\"}}'"
```

### T-017 — HITL timeout path

- **Name:** `T-017: HITL gateway auto-denies on timeout`
- **Tests:** FR-030, FR-029
- **Expected exit code:** `0`

```bash
run_test "T-017: HITL gateway auto-denies on timeout" \
  "rm -f '$ROOT/.aegis/audit.log' && \
   ! HITL_TIMEOUT_SECONDS=1 bash '$ROOT/scripts/hitl-gateway.sh' '{\"hitl_request\":{\"id\":\"t017\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"session_id\":\"test\",\"action\":{\"tool\":\"bash\",\"command\":\"rm -rf /tmp/demo\",\"risk_reason\":\"test\",\"risk_level\":\"HIGH\",\"reversible\":false},\"context\":{\"current_task\":\"test\",\"working_directory\":\"/tmp\"},\"instructions\":\"test\"}}' </dev/null && \
   grep -q '\"decision\":\"timeout-deny\"' '$ROOT/.aegis/audit.log'"
```

### T-018 — HIGH-RISK command triggers HITL in PreToolUse

- **Name:** `T-018: DROP TABLE triggers HITL gate`
- **Tests:** FR-027, FR-029
- **Expected exit code:** `0`

```bash
run_test "T-018: DROP TABLE triggers HITL gate" \
  "rm -f '$ROOT/.aegis/audit.log' && \
   ! printf '%s' '{\"tool_name\":\"bash\",\"tool_input\":{\"command\":\"DROP TABLE users\"}}' | HITL_TIMEOUT_SECONDS=1 bash '$ROOT/hooks/pre-tool-use.sh' >/dev/null 2>&1 && \
   grep -q '\"event\":\"hitl_decision\"' '$ROOT/.aegis/audit.log'"
```

### T-019 — LOW-RISK query bypasses HITL and is sandbox-routed

- **Name:** `T-019: SELECT * bypasses HITL and is rewritten to sandbox exec`
- **Tests:** FR-016, FR-027
- **Expected exit code:** `0`

```bash
run_test "T-019: SELECT * bypasses HITL and is rewritten to sandbox exec" \
  "printf '%s' '{\"tool_name\":\"bash\",\"tool_input\":{\"command\":\"SELECT * FROM users\"}}' | bash '$ROOT/hooks/pre-tool-use.sh' | jq -er '.tool_input.command | test("sandbox-exec\\.sh")'"
```

### T-020 — Pre-flight check 1 isolated

- **Name:** `T-020: Pre-flight check 1 fails when bunx/varlock unavailable`
- **Tests:** FR-005
- **Expected exit code:** `0`

```bash
run_test "T-020: Pre-flight check 1 fails when bunx/varlock unavailable" \
  "tmpdir=\$(mktemp -d) && cp '$ROOT/aegis-preflight.sh' \"$tmpdir/\" && \
   printf '#!/usr/bin/env bash\nexit 127\n' > \"$tmpdir/bunx\" && chmod +x \"$tmpdir/bunx\" && \
   printf '#!/usr/bin/env bash\nexit 0\n' > \"$tmpdir/docker\" && chmod +x \"$tmpdir/docker\" && \
   printf '#!/usr/bin/env bash\nexit 1\n' > \"$tmpdir/pgrep\" && chmod +x \"$tmpdir/pgrep\" && \
   touch \"$tmpdir/.env.schema\" \"$tmpdir/.pre-commit-config.yaml\" && \
   output=\$(cd \"$tmpdir\" && PATH=\"$tmpdir:$PATH\" bash ./aegis-preflight.sh 2>&1 || true) && \
   rm -rf \"$tmpdir\" && printf '%s' \"$output\" | grep -q 'bunx varlock not available'"
```

### T-021 — Pre-flight check 2 isolated

- **Name:** `T-021: Pre-flight check 2 fails when .env.schema is missing`
- **Tests:** FR-001 prerequisite behavior
- **Expected exit code:** `0`

```bash
run_test "T-021: Pre-flight check 2 fails when .env.schema is missing" \
  "tmpdir=\$(mktemp -d) && cp '$ROOT/aegis-preflight.sh' \"$tmpdir/\" && \
   printf '#!/usr/bin/env bash\nexit 0\n' > \"$tmpdir/bunx\" && chmod +x \"$tmpdir/bunx\" && \
   printf '#!/usr/bin/env bash\nif [[ \"$1\" == \"info\" ]]; then exit 0; fi\nif [[ \"$1\" == \"ps\" ]]; then printf \"aegis-sandbox\\n\"; exit 0; fi\nexit 0\n' > \"$tmpdir/docker\" && chmod +x \"$tmpdir/docker\" && \
   printf '#!/usr/bin/env bash\nexit 1\n' > \"$tmpdir/pgrep\" && chmod +x \"$tmpdir/pgrep\" && \
   touch \"$tmpdir/.pre-commit-config.yaml\" && \
   output=\$(cd \"$tmpdir\" && PATH=\"$tmpdir:$PATH\" bash ./aegis-preflight.sh 2>&1 || true) && \
   rm -rf \"$tmpdir\" && printf '%s' \"$output\" | grep -q '.env.schema not found'"
```

### T-022 — Pre-flight check 3 isolated

- **Name:** `T-022: Pre-flight check 3 fails when GITHUB_TOKEN is set`
- **Tests:** FR-001, FR-003
- **Expected exit code:** `0`

```bash
run_test "T-022: Pre-flight check 3 fails when GITHUB_TOKEN is set" \
  "tmpdir=\$(mktemp -d) && cp '$ROOT/aegis-preflight.sh' \"$tmpdir/\" && \
   printf '#!/usr/bin/env bash\nexit 0\n' > \"$tmpdir/bunx\" && chmod +x \"$tmpdir/bunx\" && \
   printf '#!/usr/bin/env bash\nif [[ \"$1\" == \"info\" ]]; then exit 0; fi\nif [[ \"$1\" == \"ps\" ]]; then printf \"aegis-sandbox\\n\"; exit 0; fi\nexit 0\n' > \"$tmpdir/docker\" && chmod +x \"$tmpdir/docker\" && \
   printf '#!/usr/bin/env bash\nexit 1\n' > \"$tmpdir/pgrep\" && chmod +x \"$tmpdir/pgrep\" && \
   touch \"$tmpdir/.env.schema\" \"$tmpdir/.pre-commit-config.yaml\" && \
   output=\$(cd \"$tmpdir\" && PATH=\"$tmpdir:$PATH\" GITHUB_TOKEN=fake123 bash ./aegis-preflight.sh 2>&1 || true) && \
   rm -rf \"$tmpdir\" && printf '%s' \"$output\" | grep -q 'GITHUB_TOKEN is set'"
```

### T-023 — Pre-flight check 4 isolated

- **Name:** `T-023: Pre-flight check 4 fails when TruffleHog hook is missing`
- **Tests:** FR-008
- **Expected exit code:** `1` from `aegis-preflight.sh` (this should currently fail and expose BUG-005)

```bash
run_test "T-023: Pre-flight check 4 fails when TruffleHog hook is missing" \
  "tmpdir=\$(mktemp -d) && cp '$ROOT/aegis-preflight.sh' \"$tmpdir/\" && \
   printf '#!/usr/bin/env bash\nexit 0\n' > \"$tmpdir/bunx\" && chmod +x \"$tmpdir/bunx\" && \
   printf '#!/usr/bin/env bash\nif [[ \"$1\" == \"info\" ]]; then exit 0; fi\nif [[ \"$1\" == \"ps\" ]]; then printf \"aegis-sandbox\\n\"; exit 0; fi\nexit 0\n' > \"$tmpdir/docker\" && chmod +x \"$tmpdir/docker\" && \
   printf '#!/usr/bin/env bash\nexit 1\n' > \"$tmpdir/pgrep\" && chmod +x \"$tmpdir/pgrep\" && \
   touch \"$tmpdir/.env.schema\" && \
   ! (cd \"$tmpdir\" && PATH=\"$tmpdir:$PATH\" bash ./aegis-preflight.sh >/dev/null 2>&1)"
```

### T-024 — Pre-flight check 5 isolated

- **Name:** `T-024: Pre-flight check 5 fails when Docker is unavailable`
- **Tests:** FR-016 prerequisite behavior
- **Expected exit code:** `0`

```bash
run_test "T-024: Pre-flight check 5 fails when Docker is unavailable" \
  "tmpdir=\$(mktemp -d) && cp '$ROOT/aegis-preflight.sh' \"$tmpdir/\" && \
   printf '#!/usr/bin/env bash\nexit 0\n' > \"$tmpdir/bunx\" && chmod +x \"$tmpdir/bunx\" && \
   printf '#!/usr/bin/env bash\nexit 1\n' > \"$tmpdir/docker\" && chmod +x \"$tmpdir/docker\" && \
   printf '#!/usr/bin/env bash\nexit 1\n' > \"$tmpdir/pgrep\" && chmod +x \"$tmpdir/pgrep\" && \
   touch \"$tmpdir/.env.schema\" \"$tmpdir/.pre-commit-config.yaml\" && \
   output=\$(cd \"$tmpdir\" && PATH=\"$tmpdir:$PATH\" bash ./aegis-preflight.sh 2>&1 || true) && \
   rm -rf \"$tmpdir\" && printf '%s' \"$output\" | grep -q 'Docker daemon not running'"
```

### T-025 — Pre-flight check 6 isolated

- **Name:** `T-025: Pre-flight check 6 fails when varlock scan finds staged secret`
- **Tests:** FR-009
- **Expected exit code:** `0`

```bash
run_test "T-025: Pre-flight check 6 fails when varlock scan finds staged secret" \
  "tmpdir=\$(mktemp -d) && cp '$ROOT/aegis-preflight.sh' \"$tmpdir/\" && \
   printf '#!/usr/bin/env bash\nif [[ \"$2\" == \"--version\" ]]; then exit 0; fi\nif [[ \"$2\" == \"scan\" ]]; then exit 1; fi\nexit 0\n' > \"$tmpdir/bunx\" && chmod +x \"$tmpdir/bunx\" && \
   printf '#!/usr/bin/env bash\nif [[ \"$1\" == \"info\" ]]; then exit 0; fi\nif [[ \"$1\" == \"ps\" ]]; then printf \"aegis-sandbox\\n\"; exit 0; fi\nexit 0\n' > \"$tmpdir/docker\" && chmod +x \"$tmpdir/docker\" && \
   printf '#!/usr/bin/env bash\nexit 1\n' > \"$tmpdir/pgrep\" && chmod +x \"$tmpdir/pgrep\" && \
   touch \"$tmpdir/.env.schema\" \"$tmpdir/.pre-commit-config.yaml\" && \
   output=\$(cd \"$tmpdir\" && PATH=\"$tmpdir:$PATH\" bash ./aegis-preflight.sh 2>&1 || true) && \
   rm -rf \"$tmpdir\" && printf '%s' \"$output\" | grep -q 'varlock scan found potential secrets'"
```

### T-026 — Pre-flight check 7 isolated

- **Name:** `T-026: Pre-flight check 7 warns on conflicting context tools`
- **Tests:** FR-022
- **Expected exit code:** `0`

```bash
run_test "T-026: Pre-flight check 7 warns on conflicting context tools" \
  "tmpdir=\$(mktemp -d) && cp '$ROOT/aegis-preflight.sh' \"$tmpdir/\" && \
   printf '#!/usr/bin/env bash\nexit 0\n' > \"$tmpdir/bunx\" && chmod +x \"$tmpdir/bunx\" && \
   printf '#!/usr/bin/env bash\nif [[ \"$1\" == \"info\" ]]; then exit 0; fi\nif [[ \"$1\" == \"ps\" ]]; then printf \"aegis-sandbox\\n\"; exit 0; fi\nexit 0\n' > \"$tmpdir/docker\" && chmod +x \"$tmpdir/docker\" && \
   printf '#!/usr/bin/env bash\nexit 0\n' > \"$tmpdir/pgrep\" && chmod +x \"$tmpdir/pgrep\" && \
   touch \"$tmpdir/.env.schema\" \"$tmpdir/.pre-commit-config.yaml\" && \
   output=\$(cd \"$tmpdir\" && PATH=\"$tmpdir:$PATH\" bash ./aegis-preflight.sh 2>&1) && \
   rm -rf \"$tmpdir\" && printf '%s' \"$output\" | grep -q 'Conflicting context tools detected'"
```

### T-027 — HITL request JSON must be printed before the prompt

- **Name:** `T-027: HITL gateway prints structured JSON block`
- **Tests:** FR-028
- **Expected exit code:** `0` (this should currently fail and expose BUG-007)

```bash
run_test "T-027: HITL gateway prints structured JSON block" \
  "out=\$(echo 'approve' | bash '$ROOT/scripts/hitl-gateway.sh' '{\"hitl_request\":{\"id\":\"t027\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"session_id\":\"test\",\"action\":{\"tool\":\"bash\",\"command\":\"rm -rf /tmp/demo\",\"risk_reason\":\"test\",\"risk_level\":\"HIGH\",\"reversible\":false},\"context\":{\"current_task\":\"test\",\"working_directory\":\"/tmp\"},\"instructions\":\"test\"}}') && \
   printf '%s' \"$out\" | jq -e '.hitl_request.action.command == \"rm -rf /tmp/demo\"' >/dev/null"
```

### T-028 — Required hooks must exist

- **Name:** `T-028: hooks.json contains SessionStart, PreToolUse, and PostToolUse`
- **Tests:** FR-031, FR-032
- **Expected exit code:** `0` (this should currently fail and expose BUG-009)

```bash
run_test "T-028: hooks.json contains SessionStart, PreToolUse, and PostToolUse" \
  "jq -e '.hooks.PreToolUse and .hooks.PostToolUse and .hooks.SessionStart' '$ROOT/.claude/hooks.json' >/dev/null"
```

### T-029 — Required MCP servers must exist and use stdio

- **Name:** `T-029: mcp.json declares semgrep, snyk, and lean-ctx over stdio`
- **Tests:** FR-011, FR-014, FR-021, FR-033
- **Expected exit code:** `0`

```bash
run_test "T-029: mcp.json declares semgrep, snyk, and lean-ctx over stdio" \
  "jq -e '.mcpServers.semgrep.type == \"stdio\" and .mcpServers.snyk.type == \"stdio\" and .mcpServers[\"lean-ctx\"].type == \"stdio\"' '$ROOT/.claude/mcp.json' >/dev/null"
```

### T-030 — Policy manifest must expose the required action set

- **Name:** `T-030: aegis-policy.json contains required actions`
- **Tests:** FR-038
- **Expected exit code:** `0`

```bash
run_test "T-030: aegis-policy.json contains required actions" \
  "jq -e '.actions.read_file and .actions.edit_file and .actions.run_shell and .actions.fetch_domain and .actions.use_secret and .actions.approve_deploy' '$ROOT/aegis-policy.json' >/dev/null"
```

## 4. Test Execution Recommendations

### 4.1 Tool/install requirements

| Test(s) | Requires |
|---|---|
| T-013 | `trufflehog`, `git` |
| T-015 | `semgrep`, `jq` |
| T-018, T-019, any existing T-004 | Docker + `aegis-sandbox` availability or equivalent hook environment |
| T-011, T-012 | `python3`, `strings` |
| T-028 to T-030 | `jq` |

Recommended policy for CI: **SKIP is acceptable only for optional local-tool smoke probes**. Core P0 gating checks should run in a pinned CI image with `trufflehog`, `semgrep`, `jq`, `python3`, `git`, and Docker preinstalled so the suite emits PASS/FAIL, not SKIP.

### 4.2 CI / non-TTY suitability

| Test(s) | CI-safe without TTY? | Notes |
|---|---:|---|
| T-011, T-012, T-014, T-020–T-030 | Yes | Pure file/config/script tests. |
| T-013 | Yes | Uses temp repo; no TTY needed. |
| T-015 | Yes | Non-interactive hook invocation. |
| T-016 | Yes | `echo approve | ...` supplies stdin explicitly. |
| T-017 | Yes | Uses timeout + closed stdin. |
| T-018 | Yes | Uses forced timeout path. |
| T-019 | Yes | Pure JSON rewrite check. |

### 4.3 Recommended ordering

Run **fastest first** to fail early:

1. **Static config checks:** T-014, T-028, T-029, T-030
2. **Synthetic local file checks:** T-011, T-012
3. **Pre-flight isolated checks:** T-020 through T-026
4. **Direct HITL checks:** T-016, T-017, T-027
5. **Hook-path checks:** T-018, T-019, T-015
6. **External tool / heavier integration:** T-013
7. **Docker isolation checks:** existing T-004 last among mandatory checks if CI Docker startup is slow

### 4.4 Practical suite split

- **Always-on smoke gate:** T-011, T-014, T-016, T-017, T-019, T-020–T-030
- **Tool-backed smoke gate in CI image:** T-013, T-015
- **Environment-backed smoke gate:** existing T-004 and T-018 when the CI runner provides Docker + sandbox container

## Bottom line

The current suite is a useful MVP sanity check, but it is not yet a reliable release gate for the SPEC. The biggest issues are the vacuous FR-025 check, weak coverage of hook-driven behavior, missing approve-path coverage, and several spec/code mismatches outside the smoke suite itself (`FR-008`, `FR-028`, `FR-032`, `FR-015`, and part of `FR-027`).
