# SPEC: Magnificent AI-Agent Security Harness

**Version:** 1.0.0  
**Date:** 2026-04-29  
**Status:** APPROVED FOR IMPLEMENTATION  
**Author:** MATISSE (synthesized from Librarian, Oracle ×8, Momus)  
**Platform:** Claude Code (primary); OpenCode/Pi.dev in §16 only  

---

## 1. Executive Summary & Vision

This document specifies a **security harness** — not a security platform — for AI coding agents. The harness wraps a Claude Code agent with the minimum set of controls required to prevent secret leakage, detect credential exposure, sandbox code execution, and gate high-risk actions behind a human. It stays out of the way during normal coding and activates only when something dangerous is about to happen.

**The Magnificent Minimum:** Five controls, one platform, one context manager, one sandbox, one gateway. Everything else is Phase 2.

**Primary platform:** Claude Code. All hook, permission, and sandbox primitives are Claude Code native. Other platforms are addressed in §16.

**Core stack:**
- **Varlock** — secret prevention (`.env.schema` discipline)
- **TruffleHog** — secret detection (pre-commit gate)
- **Semgrep** — SAST (post-generation code scan)
- **Snyk** — SCA (dependency hallucination prevention)
- **Warm Docker** — execution sandbox (persistent, reset-not-recreate)
- **lean-ctx** — context/token management (single MCP server)
- **HITL Gateway** — terminal `readline` blocking prompt for high-risk actions

---

## 2. Problem Statement & Target User

### 2.1 Problem

AI coding agents (Claude Code and equivalents) operate with broad filesystem, shell, and network access. Without guardrails, they can:

1. **Leak secrets** — write real API keys into generated code, commit them to git, or expose them in tool outputs sent to the LLM provider.
2. **Execute unsafe code** — run AI-generated scripts directly on the developer's host machine, enabling supply-chain attacks, privilege escalation, or data exfiltration.
3. **Hallucinate dependencies** — suggest packages that do not exist or have known CVEs, which get installed without review.
4. **Bypass human judgment** — perform irreversible actions (DB migrations, production deploys, secret rotation) without explicit approval.
5. **Bloat context** — send entire file trees to the LLM, increasing cost, latency, and the risk of sensitive data appearing in provider logs.

### 2.2 Target User

**Primary:** A solo developer using Claude Code for day-to-day coding on a macOS or Linux workstation. They want security without ceremony — the harness should be invisible during safe operations and blocking only when genuinely needed.

**Secondary:** A small team (2–5 engineers) sharing a project repository. Each developer runs the harness locally; there is no shared server.

**Out of scope:** Enterprise SOC teams, multi-tenant deployments, Windows-primary workflows.

---

## 3. Goals / Non-Goals

### Goals

- **G-1:** Prevent real secrets from ever entering the LLM context window.
- **G-2:** Detect and block secret commits before they reach git history.
- **G-3:** Execute all agent-generated code inside an isolated sandbox, never on the host.
- **G-4:** Scan generated code for SAST issues and new dependencies for known CVEs before use.
- **G-5:** Require explicit human approval for a defined set of high-risk actions.
- **G-6:** Compress context to reduce token cost and provider exposure surface.
- **G-7:** Be implementable by one person in under four weeks.

### Non-Goals

- **NG-1:** This is NOT a security platform. It does not provide threat intelligence, SIEM integration, or incident response.
- **NG-2:** This is NOT a multi-platform harness. OpenCode and Pi.dev are not v1 targets.
- **NG-3:** This is NOT a CI/CD pipeline. It runs locally on the developer's machine.
- **NG-4:** This does NOT replace code review. It augments it.
- **NG-5:** This does NOT provide Windows support in v1. **[PHASE-2]**
- **NG-6:** This does NOT provide multi-user shared sandboxes in v1. **[PHASE-2]**

---

## 4. Personas & Primary User Journeys

### Persona A: "Alex" — Solo Developer

Alex is building a SaaS product with Claude Code. They have AWS credentials, a Stripe API key, and a database password in their environment. They want Claude to help write code without accidentally leaking those credentials.

**Journey A1 — Normal coding session:**
1. Alex runs `harness start` in the project directory.
2. Pre-flight check verifies no real secrets are in the environment (§11.1).
3. Claude Code starts with lean-ctx MCP active and Varlock schema loaded.
4. Alex asks Claude to add a new API endpoint. Claude reads files via lean-ctx (compressed), generates code, Semgrep scans it automatically via PostToolUse hook.
5. Alex commits. TruffleHog pre-commit hook scans staged changes. Clean — commit proceeds.

**Journey A2 — High-risk action blocked:**
1. Claude proposes running `DROP TABLE users` as part of a migration.
2. HITL Gateway fires. Terminal displays approval prompt with action schema.
3. Alex reviews and types `deny`. Claude receives the denial and proposes a safer migration path.

**Journey A3 — Secret leak attempt blocked:**
1. Claude generates code containing `os.environ["AWS_SECRET_ACCESS_KEY"]` in a log statement.
2. Semgrep MCP flags the pattern via PostToolUse hook.
3. Claude receives the finding and self-corrects before the file is written.

**Journey A4 — Dependency hallucination caught:**
1. Claude suggests `import secure_requests` (a non-existent package).
2. Snyk MCP's `snyk_package_health_check` returns "package not found."
3. Claude receives the result and substitutes `requests` with proper SSL verification.

---

## 5. Functional Requirements

| ID | Description | Acceptance Criteria | Priority |
|----|-------------|---------------------|----------|
| **FR-001** | The system MUST provide a `harness-preflight.sh` script that runs before the agent starts and verifies no real secrets are present in the shell environment. | Script exits non-zero and prints a human-readable error if any variable matching patterns in `SENSITIVE_PATTERNS` (see §11.1) is found in `env`. Agent startup is blocked on non-zero exit. | P0 |
| **FR-002** | The agent MUST interact exclusively with `.env.schema` files, never with `.env` files containing real values. | `.env` files MUST be listed in `.gitignore` and `.claudeignore`. The agent's working directory MUST NOT contain a readable `.env` file during sessions. | P0 |
| **FR-003** | Real secrets MUST be injected into the execution environment only via `varlock run -- <command>`, never by direct env export in the agent's shell. | Integration test: run agent session without `varlock run` wrapper; assert no secret-pattern strings appear in any tool output or lean-ctx DB. | P0 |
| **FR-004** | Varlock MUST be configured with `@sensitive` annotations for all secret fields in `.env.schema`. | `.env.schema` file MUST contain `@sensitive` on every field whose value is a credential, token, or key. CI lint step validates this. | P0 |
| **FR-005** | The pre-flight script MUST check for Varlock binary presence and fail with a clear error if Varlock is not installed. | `harness-preflight.sh` runs `which varlock \|\| exit 1` and prints installation instructions on failure. | P0 |
| **FR-006** | TruffleHog MUST be installed as a pre-commit hook using the documented hook entry. | `.pre-commit-config.yaml` contains the TruffleHog hook entry: `trufflehog git file://. --since-commit HEAD --results=verified --fail --trust-local-git-config`. | P0 |
| **FR-007** | The TruffleHog pre-commit hook MUST block commits that contain verified credentials. | Integration test: stage a file containing a seeded (revoked) AWS key; assert `git commit` exits non-zero. | P0 |
| **FR-008** | The pre-flight script MUST verify that the TruffleHog pre-commit hook is installed and active. | `harness-preflight.sh` checks for `.pre-commit-config.yaml` entry; exits non-zero if absent. | P0 |
| **FR-009** | `varlock scan` MUST be run as part of the pre-flight check to scan project files for plaintext secret occurrences. | `harness-preflight.sh` runs `varlock scan --staged` and exits non-zero on any finding. | P0 |
| **FR-010** | TruffleHog MUST also be configured to run in CI (pre-push or PR check) in addition to the local pre-commit hook. **[PHASE-2]** | CI pipeline YAML contains TruffleHog step. | P1 |
| **FR-011** | Semgrep MUST be configured as an MCP server (`semgrep/mcp`) and registered in `.claude/mcp.json`. | `.claude/mcp.json` contains a `semgrep` entry with `type: stdio` and the correct command. | P0 |
| **FR-012** | A Claude Code `PostToolUse` hook MUST invoke Semgrep scan on every file written by the agent. | `hooks/post-tool-use.sh` calls `semgrep scan --config=auto --json <file>` on the written path and appends findings to the HITL queue if severity >= ERROR. | P0 |
| **FR-013** | Semgrep MUST use at minimum the `p/security-audit` and `p/secrets` rulesets. | `.semgrep.yml` or hook invocation includes `--config=p/security-audit --config=p/secrets`. | P0 |
| **FR-014** | Snyk MUST be configured as an MCP server (`sammcj/mcp-snyk`) and registered in `.claude/mcp.json`. | `.claude/mcp.json` contains a `snyk` entry with `type: stdio`. | P0 |
| **FR-015** | The agent MUST invoke `snyk_package_health_check` via the Snyk MCP server before any `npm install`, `pip install`, or `cargo add` command is executed. | `PreToolUse` hook intercepts bash commands matching package-install patterns and calls `snyk_package_health_check`; blocks install if package is not found or has critical CVE. | P0 |
| **FR-016** | All agent-generated code execution MUST be routed through the Warm Docker sandbox, never executed directly on the host. | `PreToolUse` hook intercepts bash tool calls and rewrites the command to run inside the warm container via `docker exec harness-sandbox <cmd>`. | P0 |
| **FR-017** | The Warm Docker sandbox MUST be a persistent container named `harness-sandbox` that is reset (workspace files wiped) between agent calls, NOT destroyed and recreated. | `harness start` runs `docker run -d --name harness-sandbox ...` once. Between calls, `docker exec harness-sandbox rm -rf /workspace/*` resets state. Container is never stopped during a session. | P0 |
| **FR-018** | The Warm Docker sandbox MUST run in rootless mode with the default seccomp profile applied. | `docker run` command includes `--security-opt seccomp=default` and the Docker daemon is configured for rootless mode per Docker docs (per oracle-01). | P0 |
| **FR-019** | The Warm Docker sandbox MUST have no outbound network access by default. | `docker run` includes `--network none`. Network can be re-enabled per-call only via explicit HITL approval (FR-026). | P0 |
| **FR-020** | E2B MUST be supported as an optional sandbox backend, selectable via `HARNESS_SANDBOX=e2b` environment variable. **[PHASE-2]** | When `HARNESS_SANDBOX=e2b`, the sandbox router calls the E2B SDK instead of `docker exec`. Local Docker remains the default. | P1 |
| **FR-021** | lean-ctx MUST be configured as an MCP server and registered in `.claude/mcp.json`. | `.claude/mcp.json` contains a `lean-ctx` entry with `type: stdio`. | P0 |
| **FR-022** | lean-ctx MUST be the ONLY context management layer. RTK, context-mode, and claude-ltm-plugin MUST NOT be installed alongside lean-ctx. | `harness-preflight.sh` checks that no conflicting shell hooks from RTK or context-mode are active. | P0 |
| **FR-023** | lean-ctx cross-session memory MUST be stored in a single project-scoped SQLite file at `.harness/lean-ctx.db`. | lean-ctx configuration sets `db_path = .harness/lean-ctx.db`. **[ASSUMPTION]** lean-ctx supports custom DB path via flag. | P0 |
| **FR-024** | The `harness shred` command MUST delete `.harness/lean-ctx.db` and all other harness-managed SQLite files. | Running `harness shred` removes `.harness/*.db` and prints a confirmation. | P0 |
| **FR-025** | lean-ctx MUST NOT store raw secret values. The harness MUST verify this by checking that no string matching `SENSITIVE_PATTERNS` appears in `.harness/lean-ctx.db`. | `harness shred --audit` scans the DB before deletion and reports any sensitive-pattern matches. | P0 |
| **FR-026** | The HITL Gateway MUST block execution and present a `readline` prompt in the terminal for any action classified as HIGH-RISK (see §11.7). | When a HIGH-RISK action is detected, the agent pauses, prints the approval schema to stdout, and reads a line from stdin. Execution proceeds only if the user types `approve`. Any other input (including timeout) results in `deny`. | P0 |
| **FR-027** | The HITL Gateway MUST classify the following action types as HIGH-RISK: database schema changes, secret generation or rotation, production deployment commands, network access from sandbox, and any `rm -rf` or equivalent destructive filesystem operation. | `hooks/pre-tool-use.sh` pattern-matches bash commands against the HIGH-RISK pattern list in `harness-policy.json`. | P0 |
| **FR-028** | The HITL approval request MUST be printed as a structured JSON block to stdout before the readline prompt. | Output format defined in §11.7. | P0 |
| **FR-029** | HITL decisions MUST be logged to `.aegis/audit.log` with timestamp, action, decision, and user identity. | Each HITL event appends a JSON line to `.aegis/audit.log`. | P0 |
| **FR-030** | The HITL Gateway MUST have a configurable timeout (default: 120 seconds). On timeout, the action MUST be denied automatically. | `harness-policy.json` contains `hitl_timeout_seconds: 120`. After timeout, gateway logs `decision: timeout-deny`. | P0 |
| **FR-031** | Claude Code hooks MUST be configured in `.claude/hooks.json` with at minimum: `PreToolUse` (sandbox router + HITL gate + Snyk check) and `PostToolUse` (Semgrep scan). | `.claude/hooks.json` exists and contains entries for `PreToolUse` and `PostToolUse` pointing to shell scripts in `hooks/`. | P0 |
| **FR-032** | The `SessionStart` hook MUST run `harness-preflight.sh` and abort the session if it exits non-zero. | `.claude/hooks.json` contains a `SessionStart` entry. Claude Code session does not start if the hook exits non-zero. **[ASSUMPTION]** Claude Code `SessionStart` hook can block startup via non-zero exit. | P0 |
| **FR-033** | All MCP servers MUST use `stdio` transport. HTTP-transport MCP servers are PROHIBITED in v1. | `.claude/mcp.json` contains only entries with `"type": "stdio"` (per oracle-05). | P0 |
| **FR-034** | The harness MUST provide a `harness install` command that installs all hooks, MCP configs, and pre-commit entries into the current project. | Running `harness install` in a project directory creates `.claude/hooks.json`, `.claude/mcp.json`, `.pre-commit-config.yaml`, and `.env.schema` template if they do not exist. | P0 |
| **FR-035** | The harness MUST provide a `harness status` command that reports the health of all components. | `harness status` prints a table with component name, status (OK/WARN/ERROR), and version. | P1 |
| **FR-036** | All harness-managed persistent files MUST reside under `.harness/` in the project root. | No harness file is written outside `.harness/` or the standard config locations (`.claude/`, `.pre-commit-config.yaml`). | P0 |
| **FR-037** | `.harness/` MUST be listed in `.gitignore`. | `harness install` appends `.harness/` to `.gitignore` if not already present. | P0 |
| **FR-038** | The `harness-policy.json` file MUST define the permission manifest with actions: `read_file`, `edit_file`, `run_shell`, `fetch_domain`, `use_secret`, `approve_deploy`. | `harness-policy.json` schema defined in §11.8. | P0 |
| **FR-039** | The security smoke test (`security-smoke-test.sh`) MUST complete in under 5 minutes and exit non-zero on any failure. | Smoke test defined in §12.1. CI runs it on every push. | P0 |
| **FR-040** | Local model support via Ollama MUST be documented as an optional configuration. **[PHASE-2]** | `docs/local-models.md` describes Ollama setup for OpenCode/Pi. Claude Code local model path requires Anthropic-compatible gateway (per oracle-04). | P2 |

---

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| **NFR-001** | Latency | The harness MUST NOT add more than 500ms of overhead to any single agent tool call under normal operation. | P95 wall-clock delta between tool call initiation and sandbox execution start <= 500ms on M1/M2 or equivalent x86. |
| **NFR-002** | Offline Capability | The harness MUST function fully offline when using the local Docker sandbox. Semgrep, TruffleHog, and lean-ctx MUST work without internet access once installed. | All P0 features pass smoke test with network interface disabled. E2B (FR-020) is explicitly exempt. |
| **NFR-003** | Privacy | No agent session data, code, or tool outputs MUST be sent to any third-party service except: (a) the configured LLM provider (Anthropic API), and (b) E2B if explicitly enabled. | Network audit: `tcpdump` during a session shows no unexpected outbound connections. |
| **NFR-004** | Reliability | The warm Docker sandbox MUST be available within 200ms of a tool call after initial startup. | P95 from `docker exec` invocation to first byte of output <= 200ms after container is warm. |
| **NFR-005** | Solo Maintainability | The entire harness codebase MUST be understandable and modifiable by one engineer without specialist knowledge in any single domain. | No component requires expertise beyond shell scripting, basic Docker, and reading MCP server docs. Total harness code (excluding vendored tools) MUST be under 1,000 lines. |
| **NFR-006** | Security — Sandbox Escape | The Docker sandbox MUST prevent host filesystem access. | Canary test: place sentinel file at `/tmp/harness-canary` on host; run agent session; assert file is unmodified and unread by sandbox. |
| **NFR-007** | Security — Secret Isolation | No real secret value MUST appear in any LLM provider API request. | Integration test: seed known-pattern fake secret in environment; run session that reads env vars; assert secret string does not appear in any Anthropic API request body (captured via proxy). |
| **NFR-008** | Security — MCP Transport | All MCP servers MUST use stdio transport to limit access to the MCP client process only. | Verified by absence of listening TCP ports from MCP server processes (per oracle-05). |
| **NFR-009** | Dependency Minimalism | The harness MUST NOT introduce more than 5 new runtime dependencies beyond the core tool binaries. | `harness install --dry-run` lists all dependencies. Count MUST be <= 5 additional packages. |
| **NFR-010** | Audit Logging | Every HITL decision and every Semgrep/Snyk finding MUST be logged to `.aegis/audit.log` in NDJSON format. | Log entries contain: `timestamp`, `event_type`, `tool`, `action`, `finding` (if applicable), `decision`, `user`. |

---

## 7. System Architecture

### 7.1 Component Overview

| Component | Role | Implementation | Source |
|-----------|------|----------------|--------|
| `harness-preflight.sh` | Pre-session hard gate | Shell script | §11.1 |
| Claude Code | Primary agent platform | Native | per oracle-03 |
| lean-ctx | Context compression + memory | Rust binary + MCP server | per oracle-02 |
| Varlock | Secret prevention | CLI wrapper + `.env.schema` | per oracle-07 |
| Semgrep MCP | SAST on generated code | `semgrep/mcp` stdio server | per oracle-05 |
| Snyk MCP | SCA on dependencies | `sammcj/mcp-snyk` stdio server | per oracle-05 |
| TruffleHog | Pre-commit secret detection | Pre-commit hook | per oracle-07 |
| Sandbox Router | Execution routing | Shell hook script | §11.5 |
| Warm Docker | Local execution sandbox | Persistent rootless container | per oracle-01 |
| E2B | Optional cloud sandbox | E2B SDK (opt-in) **[PHASE-2]** | per oracle-01 |
| HITL Gateway | Human approval gate | `readline` terminal prompt | §11.7 |
| `harness-policy.json` | Permission manifest | JSON config file | §11.8 |
| `.aegis/audit.log` | Audit trail | NDJSON append-only log | §10.1 |
| `.harness/lean-ctx.db` | Context memory | SQLite (lean-ctx managed) | §10.2 |

### 7.2 Data Flow Diagram (ASCII)

```
Developer Terminal
       |
       v
+-------------------------------------------------------------+
|  harness-preflight.sh  (SessionStart hook)                  |
|  +-- check: no real secrets in env (SENSITIVE_PATTERNS)     |
|  +-- check: varlock binary present                          |
|  +-- check: TruffleHog pre-commit hook installed            |
|  +-- check: Docker daemon running + harness-sandbox warm    |
|  +-- run: varlock scan --staged (leak scan)                 |
|  +-- EXIT 1 on any failure --> session BLOCKED              |
+-------------------------------------------------------------+
       | (all checks pass)
       v
+-------------------------------------------------------------+
|  varlock run -- claude  (agent startup wrapper)             |
|  Injects real secrets into subprocess env ONLY              |
|  Agent process sees schema values in context window         |
+-------------------------------------------------------------+
       |
       v
+-------------------------------------------------------------+
|  Claude Code Agent                                          |
|  +-- lean-ctx MCP ---- token compression (60-95%)          |
|  |    +-- .harness/lean-ctx.db (cross-session memory)      |
|  +-- Semgrep MCP ----- SAST on generated code              |
|  +-- Snyk MCP -------- SCA on new dependencies             |
+-------------------------------------------------------------+
       |
       |  Tool call (bash / write / edit)
       v
+-------------------------------------------------------------+
|  PreToolUse Hook  (hooks/pre-tool-use.sh)                   |
|  +-- Pattern match against HIGH-RISK list                   |
|  |    +-- HIGH-RISK? --> HITL Gateway (readline prompt)     |
|  |         +-- approve --> continue                         |
|  |         +-- deny / timeout --> BLOCK + log               |
|  +-- Package install? --> snyk_package_health_check         |
|  |    +-- CVE/not-found? --> BLOCK + report to agent        |
|  +-- Shell command? --> rewrite to sandbox exec             |
+-------------------------------------------------------------+
       |
       v
+-------------------------------------------------------------+
|  Sandbox Router                                             |
|  +-- HARNESS_SANDBOX=docker (default)                       |
|  |    +-- docker exec harness-sandbox <cmd>                 |
|  |         Container: rootless, seccomp=default,            |
|  |         --network none, workspace reset between calls    |
|  +-- HARNESS_SANDBOX=e2b (optional, PHASE-2)               |
|       +-- E2B SDK sandbox.run_code(<cmd>)                   |
+-------------------------------------------------------------+
       |
       |  Tool result returned to agent
       v
+-------------------------------------------------------------+
|  PostToolUse Hook  (hooks/post-tool-use.sh)                 |
|  +-- File written? --> semgrep scan --config=p/security-audit|
|  |    +-- Finding >= ERROR? --> report to agent next turn   |
|  +-- Append event to .aegis/audit.log                     |
+-------------------------------------------------------------+
       |
       |  git commit
       v
+-------------------------------------------------------------+
|  TruffleHog Pre-Commit Hook                                 |
|  trufflehog git file://. --since-commit HEAD                |
|  --results=verified --fail --trust-local-git-config         |
|  +-- Verified credential found? --> BLOCK commit            |
+-------------------------------------------------------------+
       |
       v
  git history (clean)
```

### 7.3 Agent Topology

This is a **single-agent architecture** in v1. There is one Claude Code agent instance per developer session. No sub-agents, no orchestrator. The security controls are implemented as hooks and MCP servers, not as separate agents.

**[PHASE-2]:** Multi-agent topology (reviewer agent, security agent) may be added once the single-agent harness is proven stable.

---

## 8. Agent Design

### 8.1 Roles & Responsibilities

The Claude Code agent has one role: **coding assistant**. The harness does not change the agent's role; it constrains the agent's action space.

The agent:
- MUST read files via lean-ctx MCP (compressed reads)
- MUST NOT read `.env` files directly (blocked by `.claudeignore`)
- MUST route all code execution through the sandbox router (enforced by PreToolUse hook)
- MUST receive Semgrep findings as tool results and self-correct before proceeding
- MUST pause and wait for HITL approval on HIGH-RISK actions

### 8.2 Tool Inventory

| Tool | Source | Purpose | Risk Level |
|------|--------|---------|------------|
| `lean_ctx_read` | lean-ctx MCP | Compressed file reads | LOW |
| `lean_ctx_search` | lean-ctx MCP | Semantic code search | LOW |
| `semgrep_scan` | Semgrep MCP | SAST on generated code | LOW (read-only) |
| `snyk_sca_scan` | Snyk MCP | Dependency vulnerability scan | LOW (read-only) |
| `snyk_package_health_check` | Snyk MCP | Package existence + CVE check | LOW (read-only) |
| `bash` | Claude Code native | Shell execution | HIGH (sandboxed) |
| `read` | Claude Code native | File read | LOW |
| `write` | Claude Code native | File write | MEDIUM |
| `edit` | Claude Code native | File edit | MEDIUM |

**Prohibited tools (blocked by permission rules):**
- Direct `.env` file reads
- Any tool that bypasses the sandbox router
- Token passthrough to any MCP server (per oracle-05)

### 8.3 Memory & Handoffs

**Within-session memory:** lean-ctx MCP maintains compressed context of files read and tool outputs during the session.

**Cross-session memory:** lean-ctx persists project-scoped summaries and decisions to `.harness/lean-ctx.db`. This DB is the single source of truth for agent memory. No other memory layer is active.

**Session shredder:** `harness shred` deletes `.harness/lean-ctx.db` and `.aegis/audit.log`. Use when switching projects or when privacy requires a clean slate (see §10.3).

**Handoffs:** In v1, there are no agent-to-agent handoffs. All context lives in lean-ctx.

---

## 9. Local Tooling & Integrations

### 9.1 CLI Interface

The harness exposes a single `harness` CLI with the following subcommands:

```
harness install          # Install hooks, MCP config, pre-commit entry into current project
harness start            # Run preflight + start warm sandbox + launch agent
harness stop             # Stop warm sandbox container
harness status           # Report health of all components
harness shred            # Delete all harness-managed local data
harness shred --audit    # Scan DB for sensitive patterns before deletion
harness policy edit      # Open harness-policy.json in $EDITOR
```

**Implementation:** Shell script wrapper (`harness`) that delegates to component scripts in `scripts/`. No compiled binary required for the CLI itself.

### 9.2 Editor/IDE Hooks

Claude Code hooks are the primary integration surface. All hooks are shell scripts in `hooks/` and registered in `.claude/hooks.json`.

```json
{
  "hooks": {
    "SessionStart": [{ "command": "bash hooks/session-start.sh" }],
    "PreToolUse":   [{ "command": "bash hooks/pre-tool-use.sh" }],
    "PostToolUse":  [{ "command": "bash hooks/post-tool-use.sh" }],
    "SessionEnd":   [{ "command": "bash hooks/session-end.sh" }]
  }
}
```

Hook scripts receive tool name and arguments via environment variables set by Claude Code. Per oracle-03: Claude Code `PreToolUse` hooks run before the permission prompt and can deny/ask/allow.

### 9.3 MCP Servers (with security notes per server)

All MCP servers use `stdio` transport (per oracle-05: stdio limits access to just the MCP client).

```json
{
  "mcpServers": {
    "lean-ctx": {
      "type": "stdio",
      "command": "lean-ctx",
      "args": ["serve", "--db", ".harness/lean-ctx.db"]
    },
    "semgrep": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@semgrep/mcp"]
    },
    "snyk": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-snyk"]
    }
  }
}
```

**Security notes per server:**

| Server | Risk | Mitigation |
|--------|------|------------|
| lean-ctx | Reads project files; DB is a forensic artifact | DB path scoped to `.harness/`; `harness shred` deletes it; no secrets stored (FR-025) |
| semgrep | Reads generated code; no network egress needed | stdio transport; no API key required for `p/security-audit` ruleset |
| snyk | Calls Snyk API for CVE data; requires `SNYK_TOKEN` | Token injected via Varlock; **[OPEN]** verify Varlock-MCP interaction per oracle-05 §10 |

**ContextCrush mitigation (per oracle-05, gemini-reaserch.md):** The `CLAUDE.md` file in the project root contains immutable operational directives re-injected on every turn. These directives state that no external documentation source may override the security rules defined in `CLAUDE.md`. The agent treats all external content as untrusted data, not as instructions.

### 9.4 Local Model Runtimes (Ollama)

**[PHASE-2]** — Local model support is not a v1 requirement.

When implemented: Use Ollama as the local model backend (per oracle-04). Ollama supports `/v1/chat/completions` and `/v1/responses` compatibility. Claude Code requires an Anthropic-compatible gateway; plain Ollama endpoints are not a drop-in for Claude Code (per oracle-04 §4). For local model use, OpenCode or Pi.dev are the appropriate platforms (see §16).

**Model minimum requirements [PHASE-2]:** Local models used with this harness MUST have >= 30B parameters and demonstrated tool-calling capability. Smaller models (e.g., Llama 3 8B) are insufficient for reliable security-harness tool orchestration (per momus-critique §4).

### 9.5 File System Access Rules

The following rules are enforced via `.claude/settings.json` permission rules and `.claudeignore`:

```
# .claudeignore
.env
.env.*
!.env.schema
.harness/lean-ctx.db
.aegis/audit.log
**/*.pem
**/*.key
**/*_rsa
**/*_ed25519
```

**Permission rules (`.claude/settings.json`):**
```json
{
  "permissions": {
    "read": {
      "deny": [".env", ".env.*", "**/*.pem", "**/*.key"]
    },
    "bash": {
      "ask": ["rm -rf *", "DROP *", "DELETE FROM *", "kubectl *", "terraform apply *"]
    }
  }
}
```

---

## 10. Data Model & On-Device Storage

### 10.1 What Gets Persisted

| File | Contents | Retention | Sensitive? |
|------|----------|-----------|------------|
| `.harness/lean-ctx.db` | Compressed file summaries, project decisions, cross-session memory | Until `harness shred` | NO (secrets must not appear here — FR-025) |
| `.aegis/audit.log` | HITL decisions, Semgrep/Snyk findings, session events | Until `harness shred` | LOW (action descriptions, not secret values) |
| `.env.schema` | Secret field names and types (NO values) | Committed to git | NO |
| `.claude/hooks.json` | Hook configuration | Committed to git | NO |
| `.claude/mcp.json` | MCP server configuration | Committed to git | NO |
| `harness-policy.json` | Permission manifest | Committed to git | NO |

**What is NEVER persisted:**
- Real secret values
- Raw LLM API request/response bodies
- Sandbox execution outputs (ephemeral, discarded after tool result)

### 10.2 Schema (lean-ctx SQLite)

lean-ctx manages its own SQLite schema. The harness constrains it to `.harness/lean-ctx.db`. The relevant tables (per oracle-02, lean-ctx README) include:

```sql
-- Managed by lean-ctx; harness does not write directly
-- Harness reads only for audit purposes (harness shred --audit)

-- Project-scoped file summaries
CREATE TABLE file_cache (
  path TEXT PRIMARY KEY,
  summary TEXT,
  tokens_saved INTEGER,
  updated_at INTEGER
);

-- Cross-session memory entries
CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  content TEXT,
  project TEXT,
  created_at INTEGER
);
```

**[ASSUMPTION]** The above schema is inferred from oracle-02 and lean-ctx README. Actual schema may differ. The harness MUST NOT depend on specific lean-ctx internal table names; it interacts with lean-ctx only via its MCP tools.

### 10.3 Session Shredder

The `harness shred` command provides a clean-slate capability:

```bash
#!/usr/bin/env bash
# scripts/shred.sh
set -euo pipefail

HARNESS_DIR="${PROJECT_ROOT:-.}/.harness"

if [[ "${1:-}" == "--audit" ]]; then
  echo "=== Scanning for sensitive patterns before shred ==="
  SENSITIVE_PATTERNS="password|secret|api_key|token|private_key"
  if command -v strings &>/dev/null; then
    strings "${HARNESS_DIR}/lean-ctx.db" 2>/dev/null | \
      grep -iE "${SENSITIVE_PATTERNS}" && \
      echo "WARNING: Sensitive patterns found in lean-ctx.db" || \
      echo "OK: No sensitive patterns found"
  fi
fi

echo "Shredding harness data..."
rm -f "${HARNESS_DIR}/lean-ctx.db"
rm -f "${HARNESS_DIR}/audit.log"
echo "Done. Harness data deleted."
```

---

## 11. Security, Sandboxing & Permissions

### 11.1 Secret Management (Varlock + Hard-Gate)

**Architecture:** Varlock enforces `.env.schema` discipline. The agent process NEVER sees real secret values in its context window. Real values are injected only into the subprocess environment via `varlock run`.

**Hard-Gate Pre-Flight Script (`harness-preflight.sh`):**

This script MUST run before every agent session (via `SessionStart` hook). It is the primary defense against Varlock failure modes, including the critical fail-open risk identified by Momus.

```bash
#!/usr/bin/env bash
# harness-preflight.sh
# EXIT 1 on any failure -- agent session is BLOCKED
set -euo pipefail

# Variables that indicate real secrets in the environment
SENSITIVE_VARS=(
  "AWS_SECRET_ACCESS_KEY"
  "AWS_SESSION_TOKEN"
  "STRIPE_SECRET_KEY"
  "GITHUB_TOKEN"
  "DATABASE_URL"
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "PRIVATE_KEY"
  "SECRET_KEY"
  "PASSWORD"
  "PASSWD"
)

echo "=== Harness Pre-Flight Check ==="

# CHECK 1: Varlock binary present
echo -n "[1/6] Varlock binary... "
if ! command -v varlock &>/dev/null; then
  echo "FAIL"
  echo "ERROR: varlock not found. Install: npm install -g varlock"
  exit 1
fi
echo "OK"

# CHECK 2: .env.schema exists
echo -n "[2/6] .env.schema present... "
if [[ ! -f ".env.schema" ]]; then
  echo "FAIL"
  echo "ERROR: .env.schema not found. Run 'harness install' to create a template."
  exit 1
fi
echo "OK"

# CHECK 3: No real secrets in current shell environment
# This is the hard gate against Varlock fail-open behavior
echo -n "[3/6] Environment clean (no real secrets)... "
FOUND_SECRETS=()
for var in "${SENSITIVE_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    FOUND_SECRETS+=("$var")
  fi
done
if [[ ${#FOUND_SECRETS[@]} -gt 0 ]]; then
  echo "FAIL"
  echo "ERROR: Real secrets detected in environment:"
  for s in "${FOUND_SECRETS[@]}"; do
    echo "  - $s is set"
  done
  echo ""
  echo "SOLUTION: Unset these variables and use 'varlock run -- harness start'"
  echo "          to inject secrets only into the agent subprocess."
  exit 1
fi
echo "OK"

# CHECK 4: TruffleHog pre-commit hook installed
echo -n "[4/6] TruffleHog pre-commit hook... "
if [[ ! -f ".pre-commit-config.yaml" ]] || \
   ! grep -q "trufflehog" ".pre-commit-config.yaml" 2>/dev/null; then
  echo "WARN"
  echo "WARNING: TruffleHog pre-commit hook not found. Run 'harness install'."
else
  echo "OK"
fi

# CHECK 5: Docker daemon running and harness-sandbox container warm
echo -n "[5/6] Docker sandbox... "
if ! docker info &>/dev/null 2>&1; then
  echo "FAIL"
  echo "ERROR: Docker daemon not running. Start Docker and retry."
  exit 1
fi
if ! docker ps --filter "name=harness-sandbox" --filter "status=running" \
   --format "{{.Names}}" | grep -q "harness-sandbox"; then
  echo "STARTING"
  docker run -d \
    --name harness-sandbox \
    --security-opt seccomp=default \
    --network none \
    --memory 2g \
    --cpus 2 \
    --read-only \
    --tmpfs /workspace:rw,size=500m \
    --tmpfs /tmp:rw,size=100m \
    ubuntu:22.04 \
    tail -f /dev/null
  echo "OK (container started)"
else
  echo "OK (container warm)"
fi

# CHECK 6: varlock scan for plaintext secrets in project files
echo -n "[6/6] Varlock scan (staged files)... "
if varlock scan --staged --quiet 2>/dev/null; then
  echo "OK"
else
  echo "FAIL"
  echo "ERROR: varlock scan found potential secrets in staged files."
  exit 1
fi

echo ""
echo "=== Pre-Flight PASSED. Starting agent session. ==="
```

**[OPEN]** Varlock's fail-open/fail-closed behavior when secret resolution fails is undocumented (per oracle-07 §5). Until verified, CHECK 3 in the hard-gate script provides the safety net: if Varlock fails to load and real secrets leak into the environment, the pre-flight check catches them before the agent starts.

### 11.2 Secret Auditing (TruffleHog)

**Integration:** TruffleHog runs as a pre-commit hook using the official documented hook entry (per oracle-07).

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/trufflesecurity/trufflehog
    rev: v3.88.0
    hooks:
      - id: trufflehog
        name: TruffleHog Secret Scan
        entry: trufflehog git file://. --since-commit HEAD --results=verified --fail --trust-local-git-config
        language: system
        stages: [pre-commit]
        pass_filenames: false
```

**False positive handling:** If TruffleHog blocks a commit on a false positive, the developer MUST:
1. Verify the finding is a false positive (confirm the credential is not real/active).
2. Add the specific finding to `.trufflehog-ignore` or use `--exclude-paths`.
3. Document the override in `.aegis/audit.log` manually.

**[OPEN]** No official TruffleHog MCP server was found in research (per oracle-07 §9). TruffleHog integration is pre-commit only in v1. MCP integration is **[PHASE-2]** pending verification of an official server.

### 11.3 SAST (Semgrep)

**Integration:** Semgrep runs as an MCP server (`semgrep/mcp`) and is invoked by the `PostToolUse` hook on every file write.

**Rulesets (minimum):**
- `p/security-audit` — general security anti-patterns
- `p/secrets` — hardcoded secret detection
- `p/owasp-top-ten` — OWASP Top 10 patterns

**Hook invocation (`hooks/post-tool-use.sh`):**
```bash
if [[ "${TOOL_NAME}" == "write" || "${TOOL_NAME}" == "edit" ]]; then
  RESULT=$(semgrep scan \
    --config=p/security-audit \
    --config=p/secrets \
    --json \
    "${WRITTEN_FILE}" 2>/dev/null)

  ERRORS=$(echo "$RESULT" | jq '.results | map(select(.extra.severity == "ERROR")) | length')

  if [[ "$ERRORS" -gt 0 ]]; then
    echo "$RESULT" | jq '.results[] | {rule: .check_id, severity: .extra.severity, message: .extra.message, line: .start.line}'
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"semgrep_finding\",\"file\":\"${WRITTEN_FILE}\",\"errors\":${ERRORS}}" >> .aegis/audit.log
  fi
fi
```

**Self-correction loop:** When Semgrep returns findings, the agent receives them as tool results and is expected to self-correct. The `CLAUDE.md` system prompt instructs the agent: "When Semgrep returns findings, fix them before proceeding. Do not ask for permission to fix security issues."

### 11.4 SCA (Snyk)

**Integration:** Snyk MCP server (`sammcj/mcp-snyk`) is invoked by the `PreToolUse` hook before any package installation command.

**Intercepted command patterns:**
```
npm install *  |  npm i *  |  pip install *  |  pip3 install *  |  cargo add *  |  go get *
```

**Hook logic:**
```bash
if echo "${BASH_COMMAND}" | grep -qE "^(npm install|npm i|pip install|pip3 install|cargo add|go get)"; then
  PACKAGE=$(echo "${BASH_COMMAND}" | awk '{print $NF}')
  HEALTH=$(snyk_package_health_check "${PACKAGE}")
  if echo "$HEALTH" | jq -e '.critical_cves > 0 or .not_found == true' &>/dev/null; then
    echo "BLOCKED: Package '${PACKAGE}' has critical CVEs or does not exist."
    echo "$HEALTH"
    exit 1
  fi
fi
```

**[ASSUMPTION]** `snyk_package_health_check` is the MCP tool name per manus-reaserch.md. Verify against `sammcj/mcp-snyk` README before implementation.

### 11.5 Execution Sandbox (Warm Docker + E2B optional)

**Default: Warm Docker**

The warm sandbox is a persistent Docker container that is reset (not recreated) between agent calls. This eliminates per-call cold-start overhead (per momus-critique §6, Directive 4).

```bash
# harness start -- run once per session
docker run -d \
  --name harness-sandbox \
  --security-opt seccomp=default \
  --network none \
  --memory 2g \
  --cpus 2 \
  --read-only \
  --tmpfs /workspace:rw,size=500m \
  --tmpfs /tmp:rw,size=100m \
  ubuntu:22.04 \
  tail -f /dev/null

# Between agent calls -- reset workspace, NOT container
docker exec harness-sandbox rm -rf /workspace/*

# Execute agent command
docker exec harness-sandbox bash -c "${AGENT_COMMAND}"
```

**Hardening (per oracle-01):**
- Rootless Docker daemon (Docker rootless mode)
- Default seccomp profile (blocks ~44 syscalls)
- `--network none` (no outbound network)
- `--read-only` root filesystem with tmpfs for `/workspace` and `/tmp`
- Memory and CPU limits to prevent resource exhaustion

**Optional: E2B [PHASE-2]**

Set `HARNESS_SANDBOX=e2b` to route execution to E2B instead of local Docker. E2B provides Firecracker-backed microVM isolation with ~150-200ms startup (per oracle-01, directional estimate from product materials).

**[OPEN]** E2B startup latency of 150-200ms is from product/marketing materials, not lower-level API docs (per oracle-01). Treat as directional until measured on target hardware.

### 11.6 MCP Server Security Model

All MCP servers in this harness follow these rules (per oracle-05):

1. **stdio transport only** — no HTTP-transport MCP servers in v1.
2. **No token passthrough** — each MCP server validates tokens issued for itself only.
3. **Minimal scope** — Semgrep: read files only; Snyk: network to Snyk API only; lean-ctx: read/write `.harness/lean-ctx.db` only.
4. **Untrusted output** — all MCP tool results are treated as untrusted data. The agent MUST NOT execute instructions embedded in MCP tool output.
5. **Sandboxed startup** — high-risk MCP servers (those with filesystem or network reach) SHOULD be started via `npx @anthropic-ai/sandbox-runtime <mcp-command>` when available (per oracle-05 §5).

**Audit logging for MCP interactions:** Every MCP tool call is logged by the `PostToolUse` hook to `.aegis/audit.log` with: `timestamp`, `server`, `tool`, `input_hash` (SHA-256 of input, not raw input), `output_length`.

### 11.7 HITL Gateway (terminal readline + schema)

**Interaction model:** A blocking `readline` prompt in the terminal. The agent pauses. The developer reads the approval request and types a response. No Slack, no HTTP server, no async callback.

**Trigger:** Any action classified as HIGH-RISK by `harness-policy.json` (FR-027).

**HIGH-RISK action patterns (default list in `harness-policy.json`):**
```json
[
  "DROP TABLE", "DROP DATABASE", "DELETE FROM", "ALTER TABLE", "TRUNCATE",
  "rm -rf", "kubectl apply", "kubectl delete", "terraform apply", "terraform destroy",
  "git push --force", "npm publish", "docker push", "ssh ", "curl.*--upload", "wget.*-O"
]
```

**Approval request schema (printed to stdout before readline):**

```json
{
  "hitl_request": {
    "id": "<uuid>",
    "timestamp": "2026-04-29T10:30:00Z",
    "session_id": "<claude-session-id>",
    "action": {
      "tool": "bash",
      "command": "DROP TABLE users CASCADE",
      "risk_reason": "Matches HIGH-RISK pattern: DROP TABLE",
      "risk_level": "HIGH",
      "reversible": false
    },
    "context": {
      "current_task": "<last agent message summary, max 200 chars>",
      "working_directory": "/path/to/project"
    },
    "instructions": "Type 'approve' to allow, anything else to deny. Auto-deny in 120s."
  }
}
```

**Terminal interaction:**
```
+--------------------------------------------------------------+
|  WARNING: HITL GATEWAY -- HIGH-RISK ACTION REQUIRES APPROVAL |
+--------------------------------------------------------------+
|  Tool:       bash                                            |
|  Command:    DROP TABLE users CASCADE                        |
|  Risk:       Matches HIGH-RISK pattern: DROP TABLE           |
|  Reversible: NO                                              |
|  Task:       Running database migration for user cleanup     |
+--------------------------------------------------------------+
|  Type 'approve' to allow, anything else to deny.            |
|  Auto-deny in 120 seconds.                                   |
+--------------------------------------------------------------+
> _
```

**Implementation (`scripts/hitl-gateway.sh`):**
```bash
#!/usr/bin/env bash
set -euo pipefail

REQUEST_JSON="$1"
TIMEOUT="${HITL_TIMEOUT_SECONDS:-120}"

# Print the approval request
echo "+--------------------------------------------------------------+"
echo "|  WARNING: HITL GATEWAY -- HIGH-RISK ACTION REQUIRES APPROVAL |"
echo "+--------------------------------------------------------------+"
echo "$REQUEST_JSON" | jq -r '"| Tool:       \(.hitl_request.action.tool)\n| Command:    \(.hitl_request.action.command)\n| Risk:       \(.hitl_request.action.risk_reason)\n| Reversible: \(if .hitl_request.action.reversible then "YES" else "NO" end)"'
echo "+--------------------------------------------------------------+"
echo "| Type 'approve' to allow, anything else to deny.             |"
printf "| Auto-deny in %d seconds.%*s|\n" "$TIMEOUT" $((46 - ${#TIMEOUT})) ""
echo "+--------------------------------------------------------------+"

# Read with timeout
DECISION="timeout-deny"
if read -r -t "${TIMEOUT}" RESPONSE 2>/dev/null; then
  if [[ "${RESPONSE}" == "approve" ]]; then
    DECISION="approve"
  else
    DECISION="deny"
  fi
fi

# Log the decision
REQUEST_ID=$(echo "$REQUEST_JSON" | jq -r '.hitl_request.id')
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"hitl_decision\",\"id\":\"${REQUEST_ID}\",\"decision\":\"${DECISION}\",\"user\":\"${USER}\"}" >> .aegis/audit.log

if [[ "${DECISION}" == "approve" ]]; then
  echo "Approved."
  exit 0
else
  echo "Denied (${DECISION})."
  exit 1
fi
```

### 11.8 Permission Policy Format

`harness-policy.json` is the single source of truth for permission rules. It is committed to git and shared across the team.

```json
{
  "$schema": "https://harness.local/policy-schema/v1",
  "version": "1.0",
  "actions": {
    "read_file": {
      "default": "allow",
      "deny_patterns": [".env", "**/*.pem", "**/*.key", "**/*_rsa"]
    },
    "edit_file": {
      "default": "ask",
      "allow_patterns": ["src/**", "tests/**", "docs/**"],
      "deny_patterns": [".env", "**/*.pem"]
    },
    "run_shell": {
      "default": "sandbox",
      "high_risk_patterns": ["DROP TABLE", "rm -rf", "kubectl apply", "terraform apply"]
    },
    "fetch_domain": {
      "default": "deny",
      "allow_list": ["api.anthropic.com", "registry.npmjs.org", "pypi.org"]
    },
    "use_secret": {
      "default": "deny",
      "allowed_via": "varlock"
    },
    "approve_deploy": {
      "default": "hitl",
      "hitl_timeout_seconds": 120
    }
  },
  "high_risk_patterns": [
    "DROP TABLE", "DROP DATABASE", "DELETE FROM", "ALTER TABLE", "TRUNCATE",
    "rm -rf", "kubectl apply", "kubectl delete", "terraform apply", "terraform destroy",
    "git push --force", "npm publish", "docker push", "ssh ", "curl.*--upload"
  ],
  "hitl_timeout_seconds": 120
}
```

**Compilation to Claude Code:** The `harness install` command reads `harness-policy.json` and generates `.claude/settings.json` permission rules. `.claude/settings.json` is not edited manually.

---

## 12. Evaluation Plan

### 12.1 Security Smoke Test (MVP)

`security-smoke-test.sh` runs in under 5 minutes and validates all P0 controls. It MUST pass before any release.

```bash
#!/usr/bin/env bash
# security-smoke-test.sh
# Runtime: < 5 minutes | Exit: 0 = all pass, 1 = any failure
set -euo pipefail
PASS=0; FAIL=0

run_test() {
  local name="$1"; local cmd="$2"
  echo -n "  [TEST] ${name}... "
  if eval "$cmd" &>/dev/null; then
    echo "PASS"; ((PASS++))
  else
    echo "FAIL"; ((FAIL++))
  fi
}

echo "=== Security Smoke Test ==="

# T-001: Pre-flight blocks real secrets in env
run_test "T-001: Pre-flight blocks real secret in env" \
  "AWS_SECRET_ACCESS_KEY=fake123 bash harness-preflight.sh; [[ \$? -ne 0 ]]"

# T-002: Pre-flight passes clean environment
run_test "T-002: Pre-flight passes clean environment" \
  "bash harness-preflight.sh"

# T-003: TruffleHog blocks seeded credential
run_test "T-003: TruffleHog blocks seeded credential" \
  "echo 'AKIA1234567890ABCDEF' > /tmp/test-secret.txt && \
   git add /tmp/test-secret.txt 2>/dev/null; \
   trufflehog git file://. --since-commit HEAD --results=verified --fail; \
   [[ \$? -ne 0 ]]"

# T-004: Sandbox cannot read host sentinel file
run_test "T-004: Sandbox cannot read host sentinel file" \
  "echo 'SENTINEL' > /tmp/harness-canary && \
   docker exec harness-sandbox cat /tmp/harness-canary 2>&1 | grep -v SENTINEL"

# T-005: Semgrep detects hardcoded API key
run_test "T-005: Semgrep detects hardcoded API key" \
  "echo 'api_key = \"sk-1234567890abcdef\"' > /tmp/test-code.py && \
   semgrep scan --config=p/secrets --json /tmp/test-code.py | \
   jq '.results | length > 0'"

# T-006: HITL gateway denies on non-approve input
run_test "T-006: HITL gateway denies on 'no' input" \
  "echo 'no' | bash scripts/hitl-gateway.sh \
   '{\"hitl_request\":{\"id\":\"test\",\"action\":{\"tool\":\"bash\",\"command\":\"rm -rf /\",\"risk_reason\":\"test\",\"reversible\":false}}}'; \
   [[ \$? -ne 0 ]]"

# T-007: lean-ctx DB clean of sensitive patterns
run_test "T-007: lean-ctx DB clean of sensitive patterns" \
  "! strings .harness/lean-ctx.db 2>/dev/null | grep -iE 'password|secret|api_key|token'"

# T-008: .env.schema has @sensitive annotations
run_test "T-008: .env.schema has @sensitive annotations" \
  "grep -q '@sensitive' .env.schema"

# T-009: MCP config uses stdio only
run_test "T-009: MCP config uses stdio only" \
  "! jq '.mcpServers | to_entries[] | .value.type' .claude/mcp.json | grep -v '\"stdio\"'"

# T-010: harness shred removes lean-ctx.db
run_test "T-010: harness shred removes lean-ctx.db" \
  "touch .harness/lean-ctx.db && bash scripts/shred.sh && [[ ! -f .harness/lean-ctx.db ]]"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[[ $FAIL -eq 0 ]] && echo "SMOKE TEST PASSED" && exit 0 || echo "SMOKE TEST FAILED" && exit 1
```

### 12.2 Metrics & Success Criteria

| Metric | Target | How Measured |
|--------|--------|--------------|
| Secret leakage rate | 0 verified leaks per 100 sessions | Audit log review + TruffleHog CI scan |
| Pre-flight block rate | 100% of sessions with real secrets in env are blocked | Smoke test T-001 |
| Sandbox escape rate | 0 host-touch events per 100 sandbox executions | Canary file test (T-004) |
| HITL approval latency | P50 < 30s, P95 < 90s | `.aegis/audit.log` timestamps |
| Semgrep false positive rate | < 10% of findings are false positives | Manual review of 50 findings |
| Smoke test runtime | < 5 minutes | CI timing |
| Harness overhead per tool call | P95 < 500ms | Instrumented hook timing |

### 12.3 Future: Full Benchmark Suite

**[PHASE-2]** — Academic benchmarks are deferred per Momus directive 3.

When implemented, use:
- **CyberSecEval 4** (prompt injection + interpreter families) as the external benchmark base (per oracle-06). Specifically: `prompt_injection` dataset for injection resistance, `interpreter` dataset for sandbox escape prevention.
- **AgentBench** as a utility regression check — verifies the agent remains useful under harness constraints (per oracle-06 §10).
- Custom fixtures for Varlock, TruffleHog, and HITL gateway effectiveness.

**[OPEN]** CyberSecEval 4 requires significant setup and compute. Do not block v1 release on this.

---

## 13. Rollout Phases & Milestones

### Phase 1 — MVP (Target: 4 weeks, solo developer)

| Week | Deliverable |
|------|-------------|
| 1 | `harness install`, `harness-preflight.sh`, `.env.schema` template, Varlock integration |
| 2 | Warm Docker sandbox, sandbox router hook, `harness start`/`stop` |
| 3 | Semgrep MCP + PostToolUse hook, Snyk MCP + PreToolUse hook, TruffleHog pre-commit |
| 4 | HITL Gateway, lean-ctx MCP, `harness shred`, smoke test suite |

**Phase 1 exit criteria:** All 10 smoke tests pass. `harness install` works on a fresh macOS/Linux machine. Solo developer can use Claude Code for a full day without harness friction.

### Phase 2 — Hardening (Target: weeks 5–8)

- TruffleHog CI integration (FR-010)
- E2B sandbox backend (FR-020)
- `harness status` command (FR-035)
- Local model support documentation (FR-040)
- Windows support investigation
- Multi-user shared policy documentation

### Phase 3 — Benchmarks & Portability (Future)

- CyberSecEval 4 integration
- OpenCode adapter (thin, MCP-only path)
- Pi.dev adapter (thin, MCP-only path)
- Encryption at rest for `.harness/lean-ctx.db`

---

## 14. Dependencies & Assumptions

### Hard Dependencies (must be installed for P0 features)

| Dependency | Version | Install | Purpose |
|------------|---------|---------|---------|
| Claude Code | latest | `npm install -g @anthropic-ai/claude-code` | Primary agent platform |
| Docker | >= 24.0 | docker.com | Warm sandbox |
| Varlock | latest | `npm install -g varlock` | Secret prevention |
| TruffleHog | >= 3.80 | `brew install trufflehog` | Secret detection |
| Semgrep | >= 1.70 | `pip install semgrep` | SAST |
| Snyk CLI | >= 1.1200 | `npm install -g snyk` | SCA |
| lean-ctx | latest | `cargo install lean-ctx` or `brew install lean-ctx` | Context management |
| pre-commit | >= 3.0 | `pip install pre-commit` | Hook framework |
| jq | >= 1.6 | `brew install jq` | JSON processing in hooks |

### Soft Dependencies (P1/P2 features)

| Dependency | Purpose | When Needed |
|------------|---------|-------------|
| E2B SDK | Cloud sandbox | FR-020 (Phase 2) |
| Ollama | Local model serving | FR-040 (Phase 2) |

### Assumptions

**[ASSUMPTION]** Varlock's `varlock scan --staged` command exists and works as described in oracle-07. Verify against `varlock --help` before implementing FR-009.

**[ASSUMPTION]** `sammcj/mcp-snyk` exposes a `snyk_package_health_check` tool. Verify against the repo README before implementing FR-015.

**[ASSUMPTION]** lean-ctx's `--db` flag accepts a custom path. Verify against lean-ctx README before implementing FR-023.

**[ASSUMPTION]** Claude Code's `SessionStart` hook can block session startup by exiting non-zero. Verify against Claude Code hooks documentation before implementing FR-032.

**[ASSUMPTION]** Docker rootless mode is available on the developer's machine. Some corporate IT environments disable rootless Docker. Provide fallback instructions for standard Docker with `--user` flag.

---

## 15. Open Questions & Risks

### 15.1 Mitigated Risks

| Risk | Mitigation |
|------|------------|
| Varlock fail-open (secrets leak into env) | Hard-gate pre-flight script (§11.1) catches real secrets in env before agent starts |
| Docker cold-start latency | Warm container (persistent, reset-not-recreate) eliminates per-call startup cost |
| Context chaos (multiple memory layers) | lean-ctx is the ONLY context layer; RTK and context-mode are prohibited (FR-022) |
| Three-platform maintenance burden | Claude Code only in v1; OpenCode/Pi in §16 |
| HITL gateway undefined | Concrete `readline` implementation specified in §11.7 |
| Academic benchmark overhead | Custom 5-minute smoke test replaces CyberSecEval as primary eval |

### 15.2 Open Risks

| Risk | Severity | Status |
|------|----------|--------|
| **[OPEN]** Varlock fail-closed behavior undocumented | HIGH | Must test before production use. If Varlock fails to load, does the agent see real `.env`? |
| **[OPEN]** Snyk MCP tool name (`snyk_package_health_check`) unverified | MEDIUM | Verify against `sammcj/mcp-snyk` README |
| **[OPEN]** lean-ctx custom DB path flag unverified | MEDIUM | Verify against lean-ctx README |
| **[OPEN]** Claude Code `SessionStart` hook can block startup | MEDIUM | Verify against Claude Code hooks docs |
| **[OPEN]** Varlock-MCP interaction: does Varlock redact secrets before MCP servers see them? | HIGH | Per oracle-05 §10: assume MCP servers CAN see resolved secrets unless explicitly isolated |
| **[OPEN]** E2B startup latency (150-200ms) is from marketing materials | LOW | Measure on target hardware before committing to NFR-004 |
| **[OPEN]** Semgrep false positive rate on AI-generated code | MEDIUM | Measure with representative codebase before tuning rulesets |
| **[OPEN]** Docker rootless mode availability in corporate environments | LOW | Provide fallback instructions |

---

## 16. Future Compatibility (OpenCode, Pi.dev)

**Per Momus directive 1 and 7:** OpenCode and Pi.dev are NOT v1 targets. They are documented here for future contributors.

### 16.1 OpenCode Adapter (Community Contributed)

OpenCode has a first-class permission model (`allow`/`ask`/`deny`) and a plugin system with `tool.execute.before`/`tool.execute.after` hooks (per oracle-03). An OpenCode adapter would:

1. Register the sandbox router as a `tool.execute.before` plugin.
2. Map `harness-policy.json` to OpenCode's permission config format.
3. Register lean-ctx as an MCP server in OpenCode's MCP config.
4. Implement HITL gateway via the same `readline` script (platform-agnostic).

**Effort estimate:** 1–2 weeks for a developer familiar with OpenCode plugins.

### 16.2 Pi.dev Adapter (Community Contributed)

Pi.dev has no native permission system; security must be implemented via TypeScript extensions using `jiti` (per oracle-03, Pi.dev-Harness.md). A Pi adapter would:

1. Implement a `guardrails.ts` extension that intercepts `tool_call` events.
2. Route shell commands through the sandbox router.
3. Register lean-ctx as an MCP server (Pi supports `pi-lean-ctx` package per manus-reaserch.md).
4. Implement HITL gateway via the same `readline` script.

**Effort estimate:** 2–3 weeks. Pi's lack of native permissions makes this more work than OpenCode.

### 16.3 Local Model Path (OpenCode/Pi)

For local model use, OpenCode and Pi are the appropriate platforms (per oracle-04). Claude Code requires an Anthropic-compatible gateway for local models; plain Ollama endpoints are not a drop-in.

**Minimum model requirements for harness use:** >= 30B parameters, demonstrated tool-calling capability (per momus-critique §4).

---

## 17. Glossary

| Term | Definition |
|------|------------|
| **Harness** | This project. A security wrapper around Claude Code that enforces secret isolation, sandboxed execution, and human approval gates. |
| **Hard-Gate** | The `harness-preflight.sh` script that blocks agent startup if any security precondition fails. |
| **Warm Sandbox** | A persistent Docker container that is reset (workspace wiped) between agent calls but never destroyed during a session. Eliminates cold-start latency. |
| **HITL Gateway** | Human-In-The-Loop Gateway. A blocking `readline` terminal prompt that requires explicit human approval before a HIGH-RISK action executes. |
| **HIGH-RISK action** | Any action matching the patterns in `harness-policy.json`'s `high_risk_patterns` list. Includes DB schema changes, destructive filesystem operations, production deployments. |
| **lean-ctx** | The single context management layer. A Rust binary that operates as both a shell hook and an MCP server, providing 60-95% token reduction and cross-session memory (per oracle-02). |
| **Varlock** | Secret prevention tool. Enforces `.env.schema` discipline so the agent never sees real secret values. |
| **TruffleHog** | Secret detection tool. Runs as a pre-commit hook to block commits containing verified credentials. |
| **Semgrep** | SAST tool. Scans agent-generated code for security anti-patterns via MCP server. |
| **Snyk** | SCA tool. Checks new dependencies for CVEs and existence via MCP server. |
| **ContextCrush** | Attack vector where external documentation (via RAG or web fetch) contains instructions that override the agent's security rules. Mitigated by immutable `CLAUDE.md` directives (per oracle-05, gemini-reaserch.md). |
| **Session Shredder** | `harness shred` command. Deletes all harness-managed local data including lean-ctx DB and audit log. |
| **`.env.schema`** | A Varlock schema file that defines secret field names and types but contains NO real values. Committed to git. |
| **MCP** | Model Context Protocol. The protocol used by Claude Code to communicate with external tool servers. |
| **stdio transport** | MCP server communication via standard input/output. Preferred over HTTP for security (limits access to the MCP client process only, per oracle-05). |
| **SAST** | Static Application Security Testing. Code analysis without execution. |
| **SCA** | Software Composition Analysis. Dependency vulnerability scanning. |
| **NDJSON** | Newline-Delimited JSON. Log format used by `.aegis/audit.log`. |
| **[PHASE-2]** | Feature deferred to Phase 2. Not required for MVP. |
| **[OPEN]** | Open question or unresolved risk. Must be resolved before production use. |
| **[ASSUMPTION]** | An assumption made in this spec that must be verified during implementation. |

---

*End of SPEC.md — Version 1.0.0*  
*Sources: oracle-01 through oracle-08, momus-critique, 00-librarian-index*  
*All Momus directives applied. Zero overrides.*
