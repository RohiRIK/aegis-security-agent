# OpenCode Plugin Port — Reference Guide

## Overview

The OpenCode plugin (`src/opencode/`) is a silent, always-on security layer that mirrors the Claude Code harness for the OpenCode AI runtime. It is built on the `@opencode-ai/plugin` SDK and shares the same core logic (`src/core/security.ts`) as the Claude Code hooks. The plugin registers five hooks — `tool.execute.before`, `tool.execute.after`, `event`, `shell.env`, and `permission.ask` — covering sandbox routing, deny-list enforcement, preflight gating, sensitive env stripping, and HIGH-RISK notification. The Claude Code harness is completely unchanged; both runtimes run independently from the same codebase.

---

## Security Regression Register

| Gap | Severity | Claude Code Behavior | OpenCode Behavior | Mitigation | Status |
|-----|----------|---------------------|-------------------|------------|--------|
| R1 | No custom HITL terminal UI and no approve path for HIGH-RISK | Medium | Custom terminal box with approve/deny prompt, command details, risk reason; user can approve and command runs | Native OpenCode permission dialog — no custom formatting; dialog is notification-only, `tool.execute.before` ALWAYS hard-blocks HIGH-RISK commands unconditionally regardless of dialog outcome — there is NO approve path | `permission.ask` triggers native dialog as UX notification; `tool.execute.before` always throws for HIGH-RISK — these two handlers have different roles: notify vs block | Documented; `bun test` verifies both behaviors |
| R2 | No HITL timeout/auto-deny | Medium | Auto-deny after `hitl_timeout_seconds` (default 120s) | Native dialog has no timeout — user must click | Document in `docs/OPENCODE-PORT.md`; fail-closed if dialog process errors | Documented |
| R3 | No `.claudeignore` equivalent | High | `.claudeignore` blocks read of `.env`, `*.pem`, etc. at Claude Code level | No built-in ignore; must replicate via `tool.execute.before` throw | `tool.execute.before` checks file paths against deny patterns and throws to block | Implemented; tested in OC-03 |
| R4 | Preflight is soft gate | Medium | `preflight.ts` runs as blocking subprocess before Claude Code launches | `session.created` is fire-and-forget event (consumed via generic `event` hook, not a named hook); cannot block session start | `tool.execute.before` blocks ALL tools until `preflightPassed` promise resolves to `true` | Implemented; tested in OC-08 |
| R5 | Preflight race condition | Low | Sequential subprocess — no race | Async `session.created` event handler + concurrent `tool.execute.before` calls | Promise-based async mutex; `preflightPassed` is a shared `Promise<boolean>` resolved once | Implemented |
| R6 | In-process crash propagation | High | Separate process per hook — crash is isolated | In-process handlers — unhandled throw crashes entire plugin | try/catch fail-closed in EVERY handler via `safe()` wrapper; error → block tool (throw) | Implemented in P1-07 |
| R7 | No audit trail in permission dialog | Low | HITL gateway writes to `.harness/audit.log` with decision, user, timestamp | Native dialog has no callback for logging | Log audit event from `tool.execute.before` (pre-dialog) + `permission.ask` handler | Implemented |
| R8 | No sandbox for non-bash tools | Low | Only bash commands sandboxed (same) | Same limitation | Out of scope for v1; documented | Documented |

---

## ADR-001: Shared Core vs Separate Plugin

**Decision**: Separate plugin (`src/opencode/`) with shared core (`src/core/security.ts`).

**Rationale**: Zero risk to the working Claude Code harness. The plugin is a new surface area (~500 lines) so the duplication cost is low. Sharing `src/core/security.ts` gives both runtimes the same `matchHighRiskPattern`, `trivyScan`, `semgrepScan`, and `checkSensitiveFile` logic without copy-paste. Keeping the plugin directory separate means a bug in the plugin cannot affect Claude Code hooks.

**Alternatives Considered**: Single unified module with runtime detection — rejected because it would require modifying the working Claude Code `src/hooks/` files, violating the "do not touch working hooks" constraint.

---

## ADR-002: HITL Mechanism

**Decision**: Use `permission.ask` native OpenCode dialog for HIGH-RISK notification.

**Rationale**: Implementing a custom terminal HITL flow (like the Claude Code harness) would require fighting the OpenCode process model — OpenCode owns the terminal during a session. The native `permission.ask` hook provides a built-in block/allow dialog that preserves the essential "user sees HIGH-RISK command before it runs" UX.

**Known Gap**: No timeout, no custom UI, no audit trail in the dialog itself. Compensated by:
1. `tool.execute.before` always hard-blocks HIGH-RISK regardless of dialog outcome — there is no approve path. The dialog is UX notification only.
2. Audit logging in `permission.ask` handler records every HIGH-RISK match to `.harness/audit.log`.

---

## ADR-003: Preflight Gate

**Decision**: Soft gate via generic `event` hook (filtering `session.created` events) + `tool.execute.before` blocker.

**Important implementation note**: `session.created` is NOT a named hook in the OpenCode SDK. It is an event type in the SDK `Event` union, consumed via the generic `"event"` hook:

```typescript
"event": async ({ event }) => {
  if (event.type !== "session.created") return;
  // run preflight...
}
```

**Rationale**: OpenCode has no pre-session gate equivalent to Claude Code's blocking subprocess. The `event` hook fires after the session is created, not before. The mitigation is a Promise-based async mutex: `preflightPromise` is `null` until `session.created` fires, then transitions to a live `Promise<void>` that resolves or rejects based on the 7 preflight checks. Every `tool.execute.before` call awaits this promise before proceeding — blocking all tool calls until preflight completes.

**Accepted Regression**: R4 (soft gate) and R5 (race condition, mitigated by promise mutex).

---

## ADR-004: Plugin Structure

**Decision**: `src/opencode/` source directory + symlink of full tree to `.opencode/plugins/harness-security/` via `bun run src/install.ts -- --opencode`.

**Rationale**: Single source of truth — updating `src/opencode/` automatically updates the installed plugin via symlink. Symlinking the full tree (not just `index.ts`) is required so relative imports to `./handlers/*` and `../core/security.ts` resolve correctly at runtime.

**Plugin entry** in `opencode.json`:
```json
{ "plugin": [".opencode/plugins/harness-security/index.ts"] }
```

**Note**: CLI wiring (`harness install --opencode` via `src/cli.ts`) is deferred to v2. For v1, invoke the install script directly: `bun run src/install.ts -- --opencode`.

---

## Installation

### Prerequisites

- Bun ≥ 1.3
- OpenCode installed and configured
- Docker daemon running (for harness-sandbox)
- `semgrep` available on PATH

### Steps

```bash
# 1. Clone / have the harness repo available
# 2. From your target project directory:
bun run /path/to/harness/src/install.ts -- --opencode
```

This command:
1. Runs the standard Claude Code harness install (copies `.env.schema`, `harness-policy.json`, `CLAUDE.md`, patches `.gitignore`, creates `.harness/`, `.claude/hooks.json`)
2. Creates `.opencode/plugins/` directory
3. Symlinks `src/opencode/` → `.opencode/plugins/harness-security/` (full tree, including `handlers/`)
4. Symlinks `src/core/` → `.opencode/plugins/core/` (required for `../core/security.ts` imports)
5. Creates or patches `opencode.json` with plugin entry: `".opencode/plugins/harness-security/index.ts"`

### Verify install

```bash
bun tsc --noEmit           # must be clean
bun run src/smoke-test.ts  # must pass 10/10
```

---

## Known Limitations

- **R1 — No HITL approve path**: HIGH-RISK commands are always hard-blocked. There is no way for the user to approve a HIGH-RISK command through the OpenCode dialog. The `permission.ask` dialog is notification-only.
- **R2 — No HITL timeout**: The native OpenCode permission dialog has no auto-deny timeout. The user must click to dismiss.
- **R3 — Deny list is software-only**: In Claude Code, `.claudeignore` blocks file reads at the platform level. In OpenCode, the deny list is enforced only by the `tool.execute.before` handler — a bug in that handler could allow reads of `.env`, `*.pem`, etc.
- **R4 — Preflight is a soft gate**: Preflight runs asynchronously after the session is created, not before. A very fast tool call could theoretically start before preflight completes (mitigated by the promise mutex, but not eliminated).
- **R5 — Preflight race condition**: Mitigated by promise mutex but not fully eliminated in pathological cases.
- **R6 — In-process crash propagation**: A panic in any handler could affect the entire plugin. Mitigated by `safe()` fail-closed wrappers.
- **R7 — No audit trail in permission dialog**: The native OpenCode dialog does not provide a post-decision callback for audit logging. Audit entries are written pre-dialog only.
- **R8 — No sandbox for non-bash tools**: Only bash/shell commands are routed through `harness-sandbox`. File writes, web fetches, and other tool types are not sandboxed.
