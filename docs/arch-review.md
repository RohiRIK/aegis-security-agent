# Architecture Review: AI-Agent Aegis Security MVP

**Date:** 2026-04-29
**Reviewer:** Architecture Review (automated)
**Scope:** Phase 1 MVP — all files in project root
**SPEC Reference:** docs/SPEC.md v1.0.0 (40 FRs, 10 NFRs)

---

## 1. What Is Correctly Implemented

### 1.1 External Hard Gate (`aegis-preflight.sh`)

The 7-check preflight script is the strongest control in Aegis. It correctly:

- **Blocks on real secrets** (Check 3): Iterates `SENSITIVE_VARS` and fails if any are set in the shell environment. This is the safety net against Varlock fail-open (FR-001, SPEC §11.1).
- **Verifies toolchain presence** (Check 1): `bunx varlock --version` confirms bun + varlock availability (FR-005).
- **Validates `.env.schema` existence** (Check 2, FR-004).
- **Checks Docker daemon + warm container** (Check 5): Starts container if missing (FR-017).
- **Runs `varlock scan --staged`** (Check 6): Catches plaintext secrets in staged files (FR-009).
- **Warns on conflicting context tools** (Check 7): Detects RTK/context-mode processes (FR-022).

The external-gate design (`aegis start` = `preflight && claude`) is architecturally sound — see ADR-01 below.

### 1.2 Warm Docker Sandbox

`scripts/sandbox-start.sh` correctly implements:

- Persistent container (`tail -f /dev/null`) with reset-not-recreate pattern (FR-017).
- `--network none` — no outbound network (FR-019).
- `--read-only` root filesystem with `--tmpfs /workspace:rw,size=500m` and `--tmpfs /tmp:rw,size=100m`.
- `--memory 2g --cpus 2` resource limits.
- Stale container cleanup before start.

`scripts/sandbox-exec.sh` correctly wraps `docker exec` and resets workspace after each call (FR-016).

### 1.3 PreToolUse Hook — Sandbox Routing + HITL Gate

`hooks/pre-tool-use.sh` correctly:

- Intercepts all `bash`/`Bash` tool calls and rewrites them to route through `sandbox-exec.sh` (FR-016).
- Pattern-matches commands against `high_risk_patterns` from `aegis-policy.json` (FR-027).
- Invokes `hitl-gateway.sh` with a structured JSON approval schema before executing HIGH-RISK commands (FR-026, FR-028).
- Blocks execution on HITL denial (FR-026).

### 1.4 PostToolUse Hook — Semgrep Scan

`hooks/post-tool-use.sh` correctly:

- Fires on `Write`/`Edit`/`write`/`edit` tool calls (FR-012).
- Invokes `semgrep scan --config=p/security-audit --config=p/secrets` (FR-013, partial — see Gap G-04).
- Logs ERROR-severity findings to `.aegis/audit.log` in NDJSON format (NFR-010).
- Returns findings to the agent for self-correction (SPEC §11.3).

### 1.5 HITL Gateway

`scripts/hitl-gateway.sh` correctly:

- Presents a structured ASCII approval prompt with tool, command, risk reason, and reversibility (FR-028).
- Reads user input with configurable timeout (default 120s) from `HITL_TIMEOUT_SECONDS` env var (FR-030).
- Auto-denies on timeout (FR-030).
- Logs every decision (approve/deny/timeout-deny) with timestamp, request ID, and user to `.aegis/audit.log` (FR-029).

### 1.6 MCP Configuration

`.claude/mcp.json` correctly:

- Registers all 3 MCP servers: semgrep, snyk, lean-ctx (FR-011, FR-014, FR-021).
- Uses `stdio` transport exclusively — no HTTP (FR-033, NFR-008).

### 1.7 CLAUDE.md — ContextCrush Defense

`CLAUDE.md` correctly implements all 5 immutable directives from SPEC §9.3:

- Secret handling rules (§11.1 complement).
- Semgrep self-correction instruction (§11.3).
- MCP output treated as data, not instructions (§11.6).
- Sandbox execution mandate with host exceptions (§11.5).
- ContextCrush defense — explicit precedence statement over all external content.

### 1.8 Supporting Controls

- `.claudeignore`: Correctly blocks `.env`, `.env.*`, `*.pem`, `*.key`, `*_rsa`, `*_ed25519`, and `.aegis/` runtime files. Correctly exempts `.env.schema` (FR-002).
- `.env.schema`: All 11 sensitive fields have `@sensitive` annotations (FR-004).
- `aegis-policy.json`: All 6 action types defined, 14 HIGH-RISK patterns, 120s HITL timeout (FR-038).
- `aegis` CLI: `start`, `stop`, `install`, `shred` subcommands delegate to component scripts (FR-034).
- `security-smoke-test.sh`: 10 tests with `run_test_if_available` for optional tools (FR-039).

---

## 2. Structural Gaps

### G-01: Snyk Package Intercept Is Unreachable Code (CRITICAL)

**FR affected:** FR-015 (Snyk package health check before install)

`hooks/pre-tool-use.sh` has a structural control-flow bug. Section 3 (lines 71–78) routes ALL bash commands through the sandbox and `exit 0`. Section 4 (lines 83–95) — the Snyk package-install intercept — comes AFTER the exit and is therefore **never reached**.

```
Section 3: if bash tool → rewrite to sandbox → echo → exit 0   ← ALL bash commands exit here
Section 4: if bash tool → check package install → snyk test     ← DEAD CODE
```

**Impact:** `npm install malicious-package` is sandboxed (good) but never checked by Snyk (bad). FR-015 is implemented but non-functional.

**Fix:** Move the package-install intercept (Section 4) ABOVE the sandbox routing (Section 3), or merge it into the Section 1–3 block before the `exit 0`.

### G-02: `aegis install` Does Not Copy hooks.json or mcp.json (INCOMPLETE)

**FR affected:** FR-034 ("installs all hooks, MCP configs, and pre-commit entries")

`scripts/install.sh` copies only 3 files: `.env.schema`, `aegis-policy.json`, `CLAUDE.md`. It does NOT copy or generate:

- `.claude/hooks.json` — the hook registration that makes PreToolUse/PostToolUse work.
- `.claude/mcp.json` — the MCP server configuration.
- `.claudeignore` — the file read protection.
- `.pre-commit-config.yaml` — the TruffleHog hook entry.

Without these files, `aegis start` on a target project will launch Claude Code with no security hooks active.

### G-03: Hardcoded Absolute Paths in hooks.json (PORTABILITY)

**FR affected:** FR-034 (install works on fresh machine)

`.claude/hooks.json` contains 3 hardcoded absolute paths:

```
<project-root>/src/hooks/pre-tool-use.ts  (and 2 other absolute paths)
```

This file only works on this specific machine. Any other developer cloning the repo, or this developer using a different machine, will get broken hooks. `aegis install` must generate hooks.json with paths relative to the project root or use `$PWD`-based resolution.

### G-04: Missing `p/owasp-top-ten` Semgrep Ruleset

**FR affected:** FR-013 ("at minimum the `p/security-audit` and `p/secrets` rulesets")

SPEC §11.3 lists three required rulesets: `p/security-audit`, `p/secrets`, **and** `p/owasp-top-ten`. The `post-tool-use.sh` implementation includes only the first two. The OWASP Top 10 ruleset is absent.

### G-05: No `.claude/settings.json` Generation

**FR affected:** FR-038, SPEC §9.5, §11.8

SPEC §11.8 states: "The `aegis install` command reads `aegis-policy.json` and generates `.claude/settings.json` permission rules." No `.claude/settings.json` exists in the project. The `read_file.deny_patterns` and `bash.ask` patterns from SPEC §9.5 are not enforced at the Claude Code permission layer — they rely entirely on `.claudeignore` and the hook scripts.

### G-06: No MCP Tool Call Audit Logging

**FR affected:** NFR-010, SPEC §11.6

SPEC §11.6 requires: "Every MCP tool call is logged by the `PostToolUse` hook to `.aegis/audit.log` with: `timestamp`, `server`, `tool`, `input_hash`, `output_length`." The `post-tool-use.sh` implementation only logs Semgrep findings. General MCP tool calls (lean-ctx reads, Snyk checks) are not logged.

### G-07: Three P0 Tools Not Installed

| Tool | FR | Status |
|------|-----|--------|
| TruffleHog | FR-006, FR-007 | Not installed. Pre-commit hook file exists but `pre-commit install` never ran. T-003 SKIPs. |
| Semgrep | FR-012, FR-013 | Not installed. PostToolUse hook silently falls through (`semgrep scan` returns `{"results":[]}` fallback). T-005 SKIPs. |
| lean-ctx | FR-021, FR-023 | Binary presence unverified. `lean-ctx serve` command may not exist. MCP entry in mcp.json will fail silently at session start. |

All three are P0 requirements in the SPEC. The aegis is structurally complete but operationally degraded without them.

### G-08: SNYK_TOKEN Not Wired via Varlock

**FR affected:** FR-015, SPEC §9.3 (snyk security notes)

SPEC §9.3 notes: "Token injected via Varlock." The Snyk MCP entry in `mcp.json` does not include `SNYK_TOKEN` in its environment. Even if the dead-code issue (G-01) were fixed, the Snyk CLI in `pre-tool-use.sh` would fail authentication. The Snyk MCP server (`mcp-snyk`) also needs the token in its environment to call the Snyk API.

### G-09: Preflight Check Numbering Mismatch

The preflight script labels checks `[1/6]` through `[6/6]` but then adds a 7th check labeled `[7/7]`. This is cosmetic but creates confusion about how many checks must pass. The conflicting-tool check (Check 7) was added for FR-022 (4B-02) after the initial 6-check structure was written.

---

## 3. Security Concerns

### S-01: `seccomp=unconfined` Negates Syscall Filtering (HIGH)

**FR affected:** FR-018 ("default seccomp profile applied")

`scripts/sandbox-start.sh` line 21:
```bash
--security-opt seccomp=unconfined
```

The SPEC explicitly requires `seccomp=default`, which blocks ~44 dangerous syscalls (including `keyctl`, `bpf`, `userfaultfd`, `perf_event_open`). `seccomp=unconfined` disables ALL syscall filtering, meaning code running in the sandbox can invoke any syscall the kernel supports.

**Root cause:** macOS Docker Desktop does not support custom seccomp profiles via `--security-opt seccomp=<profile.json>`. The `seccomp=default` flag may also behave differently on macOS Docker's LinuxKit VM vs native Linux.

**Risk:** An attacker who achieves code execution inside the sandbox (e.g., via a malicious npm package run in the container) can use syscalls like `ptrace`, `mount`, or `keyctl` that would normally be blocked. Combined with the container running as root (see S-02), this significantly widens the escape surface.

**Mitigation present:** `--network none` and `--read-only` are still active, limiting exfiltration paths. The warm sandbox is reset between calls, limiting persistence.

### S-02: Container Runs as Root User

**NFR affected:** NFR-006 (sandbox escape prevention)

`sandbox-start.sh` does not include `--user` flag. The container process runs as `root` inside the container. While container root ≠ host root (due to user namespace mapping in Docker Desktop), running as root inside the container increases the blast radius of any container escape vulnerability.

SPEC §11.5 says "Rootless Docker daemon" — this refers to the Docker daemon configuration, not the in-container user. The SPEC does not explicitly require `--user`, but defense-in-depth would add it.

### S-03: Command Injection Risk in Sandbox Routing

**FR affected:** FR-016

`hooks/pre-tool-use.sh` line 75:
```bash
SANDBOXED=$(echo "$INPUT" | jq \
  --arg cmd "bash $AEGIS_DIR/scripts/sandbox-exec.sh $(printf '%q' "$BASH_CMD")" \
  '.tool_input.command = $cmd')
```

The `printf '%q'` shell-quotes `$BASH_CMD`, but this quoting happens in the hook's shell context. The resulting string is embedded in a `jq --arg` which is then read back by Claude Code and passed to another `bash -c` invocation. Multi-layer shell quoting with user-controlled input (the agent's proposed command) is fragile. Edge cases with backticks, `$()`, or embedded newlines could bypass the quoting.

`scripts/sandbox-exec.sh` line 9 has the same issue:
```bash
docker exec "${CONTAINER}" bash -c "${CMD}"
```

`$CMD` is passed directly to `bash -c` inside the container. If the command contains shell metacharacters that survived the outer quoting, they will be interpreted.

**Practical risk:** LOW in current use (Claude Code generates the commands, not a malicious user), but this becomes a vector if the agent processes untrusted input that influences the bash command.

### S-04: PostToolUse Calls Semgrep on Host, Not via MCP

**Architectural inconsistency**

`post-tool-use.sh` calls `semgrep scan` directly on the host. Meanwhile, `mcp.json` registers a Semgrep MCP server (`npx @semgrep/mcp`). These are two separate Semgrep instances:

- The MCP server is available to the agent for on-demand scans.
- The PostToolUse hook bypasses MCP and invokes Semgrep directly.

This is not a vulnerability per se, but it means: (a) two separate Semgrep installations may produce inconsistent results, and (b) the hook bypasses any MCP-layer controls documented in SPEC §11.6.

### S-05: Audit Log Has No File Locking

**NFR affected:** NFR-010

Both `hitl-gateway.sh` and `post-tool-use.sh` append to `.aegis/audit.log` using `>>` without advisory locking (`flock`). If two hooks fire concurrently (possible if the agent issues rapid tool calls), the NDJSON log could get interleaved or corrupted.

**Practical risk:** LOW for a solo developer. Becomes relevant with concurrent agent sessions in Phase 2.

### S-06: `bunx` Cold-Start Latency May Violate NFR-001

**NFR affected:** NFR-001 (≤500ms overhead per tool call)

`bunx varlock --version` (preflight Check 1) and `bunx varlock scan --staged` (Check 6) both invoke `bunx`, which has a cold-start penalty when the package is not cached. This penalty (~1-3s on first run) applies to every `aegis start` invocation. While the preflight only runs once per session (not per tool call), `bunx` startup time should be benchmarked to ensure it doesn't create a frustrating developer experience.

### S-07: Snyk Intercept Uses CLI, Not MCP Tool

**FR affected:** FR-015

The SPEC requires invoking `snyk_package_health_check` via the Snyk MCP server. The implementation in `pre-tool-use.sh` (lines 87-94) calls `snyk test` directly via the CLI. This bypasses the MCP transport security model (SPEC §11.6) and requires Snyk CLI to be independently installed and authenticated on the host.

---

## 4. Architectural Decision Records

### ADR-01: External Hard Gate vs SessionStart Hook

**Context:** SPEC FR-032 assumed Claude Code's `SessionStart` hook would block agent startup on non-zero exit. Week 0 risk discovery (W0-03) proved this assumption false — `SessionStart` is deferred (non-blocking). The agent starts before the hook completes.

**Decision:** Move the hard gate outside Claude Code entirely. `aegis start` runs `aegis-preflight.sh && claude`. If preflight exits non-zero, `claude` never starts. The `&&` operator is the gate.

**Consequences:**
- (+) **Fail-closed guarantee**: If preflight fails, the agent process never starts. No race condition.
- (+) **No dependency on Claude Code internals**: The gate works regardless of how Claude Code implements hook lifecycle.
- (+) **Debuggable**: The preflight runs as a standalone script. Failures are visible in the terminal before any agent output.
- (−) **Bypass risk**: A developer who runs `claude` directly (without `aegis start`) gets no preflight checks. There is no enforcement that `claude` must be invoked via `aegis`.
- (−) **FR-032 not implemented**: The SPEC requirement for a SessionStart hook is formally unmet, even though the security intent is achieved by an alternative mechanism.
- **Assessment:** This is a sound architectural decision. The bypass risk is acceptable for a solo developer who is the security author. For team use, consider aliasing `claude` to `aegis start` in shell profiles.

### ADR-02: Warm Container (Reset-Not-Recreate)

**Context:** Per-call `docker run` + `docker rm` adds 1-3 seconds of latency per tool call. The SPEC requires P95 ≤ 500ms (NFR-001) and P95 ≤ 200ms after warm-up (NFR-004).

**Decision:** Start a persistent container once per session. Reset workspace (`rm -rf /workspace/*`) between calls. Never stop/recreate during a session.

**Consequences:**
- (+) **Low latency**: `docker exec` on a warm container is ~50-100ms, well within NFR-004.
- (+) **State isolation**: Workspace reset between calls prevents cross-call data leakage.
- (−) **Shared kernel state**: Container-level state (open file descriptors, network sockets, environment variables) persists between calls. A malicious script could set up a persistent backdoor in the container's memory that survives workspace reset.
- (−) **No seccomp rotation**: If a container escape relies on accumulated state, the persistent container gives the attacker more time. Per-call recreation would force a fresh seccomp context each time.
- **Assessment:** Correct tradeoff for MVP. The `--network none` flag limits what a persistent backdoor can achieve. Phase 2 should consider periodic full container recreation (e.g., every N calls).

### ADR-03: `bunx varlock` vs Global Install

**Context:** SPEC §14 lists Varlock as `npm install -g varlock`. The implementation uses `bunx varlock` (zero-install, on-demand invocation).

**Decision:** Use `bunx varlock` for all Varlock operations. No global install required.

**Consequences:**
- (+) **Zero setup**: New users don't need a separate install step. `bun` is the only prerequisite.
- (+) **Version consistency**: `bunx` resolves the latest version each time (or from cache).
- (−) **Cold-start latency**: First invocation per session incurs ~1-3s overhead while `bunx` resolves and caches the package (see S-06).
- (−) **Offline failure**: `bunx` requires network access on first use if the package isn't cached. This conflicts with NFR-002 (offline capability).
- **Assessment:** Acceptable for developer ergonomics. Mitigate cold-start by running `bunx varlock --version` in preflight (already done — this warms the cache for subsequent calls within the session).

### ADR-04: HITL via Terminal Readline

**Context:** SPEC §11.7 specifies a blocking `readline` prompt. Alternatives considered: HTTP webhook to Slack, web UI dashboard.

**Decision:** Terminal `readline` with `read -r -t $TIMEOUT`. No server, no external dependencies.

**Consequences:**
- (+) **Zero infrastructure**: No webhook server, no Slack bot, no port to open.
- (+) **Blocking guarantee**: `read -t` blocks the hook script. The agent waits.
- (+) **Offline compatible**: Works without internet (NFR-002).
- (−) **Single-terminal constraint**: The developer must have the terminal visible and focused. If the terminal is backgrounded, the HITL prompt is invisible and auto-denies after timeout.
- (−) **No mobile/remote approval**: Cannot approve actions from a phone or different machine.
- **Assessment:** Correct for solo developer MVP. Phase 2 could add an optional Slack/webhook channel without removing the readline fallback.

### ADR-05: stdio-Only MCP Transport

**Context:** SPEC §11.6 and FR-033 require stdio transport for all MCP servers. HTTP transport opens a network port accessible to any local process.

**Decision:** All 3 MCP servers (semgrep, snyk, lean-ctx) use `"type": "stdio"` in `.claude/mcp.json`.

**Consequences:**
- (+) **No listening ports**: Eliminates the attack surface of a localhost HTTP server that other processes (or the sandbox) could reach.
- (+) **Process isolation**: Each MCP server is a child process of the Claude Code client. Only Claude Code can communicate with it.
- (−) **No out-of-process debugging**: Cannot `curl` the MCP server to test it independently.
- (−) **Startup overhead**: Each session start spawns 3 MCP child processes.
- **Assessment:** Unambiguously correct for a Aegis. No change recommended.

---

## 5. Phase 2 Recommendations

Ordered by risk priority. Each item includes the gap/concern it addresses and specific implementation guidance.

### HIGH Priority

#### P2-H1: Fix Unreachable Snyk Package Intercept (G-01, FR-015)

**What:** Move the package-install intercept (lines 83–95 of `pre-tool-use.sh`) ABOVE the sandbox routing `exit 0` at line 78.

**How:**
```bash
# After HITL gate (line 69), BEFORE sandbox routing:
# 1. Check if command matches package-install pattern
# 2. If yes, run snyk check → block or allow
# 3. Then fall through to sandbox routing
```

Merge Section 4 into the Section 1–3 block. The Snyk check should fire first, and if it passes, the command proceeds to sandbox routing.

**Effort:** 30 minutes. No new dependencies.

#### P2-H2: Install TruffleHog, Semgrep, and Verify lean-ctx (G-07, FR-006, FR-007, FR-012, FR-013, FR-021)

**What:** Install the three P0 tools that are currently missing.

**How:**
```bash
brew install trufflehog               # FR-006
pip install semgrep                    # FR-012
pre-commit install                    # Activates TruffleHog hook (FR-007)
cargo install lean-ctx                # FR-021 — or brew install lean-ctx
lean-ctx serve --help                 # Verify serve command exists
```

After installation, re-run `security-smoke-test.sh` and confirm T-003 and T-005 change from SKIP to PASS.

**Effort:** 1 hour (install + verify).

#### P2-H3: Fix `aegis install` to Copy All Config Files (G-02, G-03, FR-034)

**What:** `aegis install` must generate `.claude/hooks.json`, `.claude/mcp.json`, `.claudeignore`, and `.pre-commit-config.yaml` in the target project.

**How:**
- `hooks.json`: Generate at install time using the target project's absolute path. Use a template with `__AEGIS_DIR__` placeholder, replaced by `sed` during install.
- Better: Use relative paths from `.claude/hooks.json` (if Claude Code resolves hooks relative to the project root, use `./hooks/pre-tool-use.sh`). Test this — if Claude Code requires absolute paths, generate them at install time.
- Copy `mcp.json`, `.claudeignore`, `.pre-commit-config.yaml` from Aegis source directory.

**Effort:** 2–3 hours. Requires testing Claude Code's path resolution behavior.

#### P2-H4: Replace `seccomp=unconfined` with Hardened Profile (S-01, FR-018)

**What:** The sandbox must apply syscall filtering.

**How:**
1. Test `--security-opt seccomp=default` on macOS Docker Desktop. If it works (it should on recent versions), use it.
2. If `seccomp=default` fails on macOS, create a custom seccomp profile (`aegis-seccomp.json`) that blocks the highest-risk syscalls: `ptrace`, `mount`, `umount2`, `keyctl`, `bpf`, `userfaultfd`, `perf_event_open`, `add_key`, `request_key`.
3. Apply via `--security-opt seccomp=aegis-seccomp.json`.
4. Gate on platform: use `seccomp=default` on Linux, custom profile on macOS.

**Effort:** 2–4 hours including testing.

#### P2-H5: Wire SNYK_TOKEN via Varlock (G-08, FR-015, SPEC §9.3)

**What:** Add `SNYK_TOKEN` to `.env.schema` with `@sensitive` annotation. Ensure the Snyk MCP server and CLI receive the token at runtime.

**How:**
1. Add `SNYK_TOKEN= # @sensitive type=string required=false` to `.env.schema`.
2. Update `mcp.json` to pass the token to the Snyk MCP process: `"env": {"SNYK_TOKEN": "${SNYK_TOKEN}"}` (if Claude Code supports env passthrough in MCP config; otherwise, launch via `bunx varlock run -- npx mcp-snyk`).
3. For the CLI path in `pre-tool-use.sh`, wrap the `snyk test` call in `bunx varlock run --`.

**Effort:** 1–2 hours.

### MEDIUM Priority

#### P2-M1: Add `p/owasp-top-ten` Ruleset to PostToolUse (G-04, FR-013)

**What:** Add `--config=p/owasp-top-ten` to the Semgrep invocation in `post-tool-use.sh`.

**How:** Change line 22 to:
```bash
RESULT=$(semgrep scan \
  --config=p/security-audit \
  --config=p/secrets \
  --config=p/owasp-top-ten \
  --json \
  "$WRITTEN_FILE" 2>/dev/null || echo '{"results":[]}')
```

**Effort:** 5 minutes. May increase scan time by ~200ms per file.

#### P2-M2: Generate `.claude/settings.json` from Policy (G-05, FR-038, SPEC §9.5)

**What:** `aegis install` should read `aegis-policy.json` and generate Claude Code permission rules in `.claude/settings.json`.

**How:** Write a `jq` transformation in `install.sh` that maps `aegis-policy.json` actions to Claude Code's `permissions` format. This adds a second layer of defense — even if the hook scripts fail, Claude Code's native permission system will `ask` before destructive operations.

**Effort:** 2 hours.

#### P2-M3: Add MCP Tool Call Audit Logging (G-06, NFR-010, SPEC §11.6)

**What:** Log all MCP tool interactions (lean-ctx, Snyk, Semgrep) to `audit.log` with `timestamp`, `server`, `tool`, `input_hash`, `output_length`.

**How:** Extend `post-tool-use.sh` to detect MCP tool names (not just Write/Edit) and log a NDJSON entry for each. Use `echo "$INPUT" | jq -r '.tool_input' | sha256sum` for input hash.

**Effort:** 1–2 hours.

#### P2-M4: Harden Sandbox Command Passing (S-03)

**What:** Eliminate the multi-layer shell quoting risk in sandbox routing.

**How:**
1. In `sandbox-exec.sh`, write the command to a temporary file and execute it via `docker exec aegis-sandbox bash /workspace/_cmd.sh` instead of `bash -c "$CMD"`. This avoids shell metacharacter interpretation.
2. Alternatively, use `docker exec` with array-form command: `docker exec aegis-sandbox bash -c "$(cat /dev/stdin)"` with the command piped via stdin.

**Effort:** 2 hours including test.

#### P2-M5: Implement `aegis status` Command (FR-035)

**What:** Health check for all aegis components.

**How:** Report a table with:
```
Component          Status    Version
─────────────────  ────────  ────────
Varlock (bunx)     OK        1.x.x
TruffleHog         MISSING   —
Semgrep            MISSING   —
Snyk               OK        1.x.x
Docker             OK        24.x
aegis-sandbox    RUNNING   ubuntu:22.04
lean-ctx           MISSING   —
pre-commit         MISSING   —
```

**Effort:** 2 hours.

#### P2-M6: Use Snyk MCP Tool Instead of CLI (S-07, FR-015)

**What:** Replace the direct `snyk test` CLI call in `pre-tool-use.sh` with a call to the Snyk MCP server's `snyk_package_health_check` tool.

**How:** This requires the hook to invoke the MCP tool programmatically. Since hooks are bash scripts and MCP is stdio, this is non-trivial. Alternative: accept the CLI approach but document the divergence from SPEC FR-015, and ensure SNYK_TOKEN is injected (P2-H5).

**Effort:** 4–8 hours (MCP invocation from bash) or 30 minutes (document divergence + keep CLI approach).

### LOW Priority

#### P2-L1: Add `--user 1000:1000` to Docker Run (S-02, NFR-006)

**What:** Run the sandbox container as a non-root user.

**How:** Add `--user 1000:1000` to the `docker run` command in `sandbox-start.sh`. Ensure the tmpfs mounts are writable by UID 1000.

**Effort:** 30 minutes.

#### P2-L2: Add File Locking to Audit Log (S-05, NFR-010)

**What:** Use `flock` to prevent concurrent write corruption.

**How:** Wrap all `>> $AUDIT_LOG` calls with:
```bash
(flock -x 200; echo "$JSON_ENTRY" >> "$AUDIT_LOG") 200>"$AUDIT_LOG.lock"
```

**Effort:** 30 minutes.

#### P2-L3: Fix Preflight Check Numbering (G-09)

**What:** Change labels from `[1/6]...[6/6]...[7/7]` to `[1/7]...[7/7]`.

**Effort:** 5 minutes.

#### P2-L4: Add Periodic Container Recreation

**What:** Mitigate persistent in-memory backdoors (ADR-02 consequence).

**How:** After every N sandbox calls (configurable, default 50), destroy and recreate the container instead of just resetting the workspace. Track call count in `.aegis/sandbox-calls`.

**Effort:** 1 hour.

#### P2-L5: Benchmark `bunx` Cold-Start Latency (S-06, NFR-001)

**What:** Measure actual `bunx varlock` startup time on target hardware. If >2s, consider switching to `npx varlock` or a global install.

**Effort:** 30 minutes.

---

## Summary Matrix

| ID | Category | Severity | FR/NFR | Status |
|----|----------|----------|--------|--------|
| G-01 | Structural | CRITICAL | FR-015 | Snyk intercept unreachable (dead code) |
| G-02 | Structural | HIGH | FR-034 | install.sh incomplete |
| G-03 | Portability | HIGH | FR-034 | Hardcoded absolute paths in hooks.json |
| G-04 | Structural | MEDIUM | FR-013 | Missing OWASP ruleset |
| G-05 | Structural | MEDIUM | FR-038 | No settings.json generation |
| G-06 | Structural | MEDIUM | NFR-010 | No MCP audit logging |
| G-07 | Operational | HIGH | FR-006/12/21 | 3 P0 tools not installed |
| G-08 | Operational | HIGH | FR-015 | SNYK_TOKEN not wired |
| G-09 | Cosmetic | LOW | — | Check numbering mismatch |
| S-01 | Security | HIGH | FR-018 | seccomp=unconfined |
| S-02 | Security | MEDIUM | NFR-006 | Container runs as root |
| S-03 | Security | LOW | FR-016 | Command injection risk |
| S-04 | Architecture | LOW | — | Semgrep host vs MCP inconsistency |
| S-05 | Reliability | LOW | NFR-010 | Audit log no file locking |
| S-06 | Performance | LOW | NFR-001 | bunx cold-start latency |
| S-07 | Architecture | MEDIUM | FR-015 | Snyk CLI vs MCP divergence |

**Overall assessment:** The aegis architecture is structurally sound. The defence-in-depth layering (preflight → hooks → sandbox → CLAUDE.md) is correct. The external hard gate (ADR-01) is a pragmatic improvement over the original SessionStart design. The critical gap is G-01 (dead code in Snyk intercept) — a 30-minute fix. The operational gaps (G-07, G-08) are tool installation tasks, not design problems. The `seccomp=unconfined` issue (S-01) is the most significant security regression vs SPEC intent and should be the first hardening item in Phase 2.

---

*End of Architecture Review*
*Source files reviewed: aegis, aegis-preflight.sh, aegis-policy.json, hooks/pre-tool-use.sh, hooks/post-tool-use.sh, scripts/sandbox-start.sh, scripts/sandbox-exec.sh, scripts/sandbox-reset.sh, scripts/hitl-gateway.sh, scripts/install.sh, scripts/shred.sh, .claude/hooks.json, .claude/mcp.json, .claudeignore, .env.schema, CLAUDE.md, security-smoke-test.sh, docs/SPEC.md, docs/PLAN.md*
