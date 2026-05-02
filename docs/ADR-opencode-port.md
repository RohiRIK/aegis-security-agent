# Architectural Guidance: Porting Security Harness to OpenCode Plugin

**Date:** 2026-04-29
**Status:** Proposed
**Scope:** Design-only — no implementation code

---

## Table of Contents

1. [Situation Analysis](#situation-analysis)
2. [ADR-001: Shared Logic Layer](#adr-001-shared-logic-layer)
3. [ADR-002: HITL Interaction Model](#adr-002-hitl-interaction-model)
4. [ADR-003: Session Gate Gap](#adr-003-session-gate-gap)
5. [ADR-004: Plugin Structure](#adr-004-plugin-structure)
6. [ADR-005: Dual-Runtime Abstraction](#adr-005-dual-runtime-abstraction)
7. [ADR-006: Install Flow](#adr-006-install-flow)
8. [C4 Diagram](#c4-diagram)
9. [Shared Module Boundaries](#shared-module-boundaries)
10. [Top 3 Architectural Risks](#top-3-architectural-risks)

---

## Situation Analysis

### Current Architecture (Claude Code)

The harness is a **subprocess-per-invocation** system. Each tool call spawns a
fresh Bun process that reads JSON from stdin, applies security logic, and
signals allow/block via exit code. The five security capabilities are:

| Capability | File | Mechanism |
|---|---|---|
| High-risk pattern matching | pre-tool-use.ts | Regex against harness-policy.json |
| HITL approval gate | hitl-gateway.ts | Terminal readline with timeout |
| Trivy CVE scan | pre-tool-use.ts | Synthetic lockfile + `trivy fs` |
| Docker sandbox routing | pre-tool-use.ts + sandbox/*.ts | Command rewrite to `docker exec` |
| Semgrep post-write scan | post-tool-use.ts | `semgrep scan` on written files |

Plus a **preflight gate** (preflight.ts) that blocks the session before the
agent starts — 7 checks including env cleanliness, Docker readiness, and
varlock availability.

### Target Architecture (OpenCode)

OpenCode plugins are **in-process TypeScript modules**. No subprocess spawning,
no stdin/stdout protocol. Blocking = `throw`. Three events available:

| Event | When | Can Block? |
|---|---|---|
| `tool.execute.before` | Before any tool runs | Yes (throw) |
| `tool.execute.after` | After any tool runs | No |
| `session.created` | After session starts | No (already active) |

### Fundamental Tensions

1. **Process boundary disappears.** Hooks go from isolated processes to
   in-process callbacks — shared memory, shared event loop.
2. **No pre-session gate.** Preflight can't prevent the first tool call.
3. **No command rewriting.** Can't intercept and mutate tool_input the
   Claude Code way.
4. **HITL requires terminal.** In-process plugin may not own the terminal.

---

## ADR-001: Shared Logic Layer

### Context

The current codebase has security logic interleaved with I/O protocol code.
`pre-tool-use.ts` simultaneously handles stdin parsing, policy evaluation, HITL
subprocess spawning, Trivy scanning, and stdout command rewriting.

The reusable security logic (pattern matching, install-command parsing, Trivy
lockfile generation, policy loading) is ~120 lines buried in ~200 lines of I/O
glue.

### Options Considered

| Option | Description | Effort | Risk |
|---|---|---|---|
| **(A) Extract `src/lib/security/`** | Pull pure security logic into shared modules. Both runtimes import these. I/O adapters are runtime-specific. | Medium | Low drift, clear boundary |
| **(B) Full duplication** | Copy-paste into OpenCode plugin, diverge freely. | Low initial | High drift over time |
| **(C) Adapter pattern** | Single codebase with `RuntimeAdapter` interface injected at startup. | High | Over-engineering for 2 targets |

### Decision

**(A) Extract `src/lib/security/` — shared pure-logic modules.**

### Rationale

- The actual decision logic is small (~120 lines) and pure (no I/O side effects).
- Two consumers (Claude Code hooks, OpenCode plugin) is not enough to justify
  the adapter pattern's indirection cost.
- Duplication will rot within weeks for a solo dev — one runtime gets the fix,
  the other doesn't.
- The extraction is a clean refactor of existing code, not new architecture.

### Module Decomposition

```
src/lib/security/
  policy.ts        — loadPolicy(), matchHighRiskPattern()
  install-parse.ts — parseInstallCommand(), makeLockfileContent()
  trivy.ts         — trivyScan() (takes runCommand as param)
  semgrep.ts       — semgrepScan() (takes runCommand as param)
  audit.ts         — appendAuditEntry() (takes writer as param)
  types.ts         — HarnessPolicy, ParsedInstall, SemgrepResult, AuditEntry
```

### Consequences

- Each module is a pure function or a function parameterized on I/O callbacks.
- Claude Code hooks call these with `Bun.spawn`-based callbacks.
- OpenCode plugin calls these with `Bun.$`-based callbacks (in-process).
- Smoke tests can cover the shared modules with mock I/O.
- ~2 hours of refactoring to extract from existing hook files.

---

## ADR-002: HITL Interaction Model

### Context

The current HITL gateway uses `node:readline/promises` to present an ASCII box
on the terminal and wait for "approve" from stdin. This requires:
1. Owning the terminal (process.stdin/stdout)
2. Synchronous blocking (readline.question)
3. A subprocess to isolate the blocking I/O

In OpenCode's in-process model, the plugin callback runs on the main event loop.
Blocking for terminal input would freeze the entire agent. The plugin may not
have terminal access at all.

### Options Considered

| Option | Description | Viability |
|---|---|---|
| **(A) Terminal subprocess** | Spawn `bun run hitl-gateway.ts` from within the plugin, wait for exit code. | Works but adds cold-start latency and subprocess management in-process. |
| **(B) Throw-with-message** | For high-risk actions, throw a descriptive error. The agent sees the error, the user sees it in the UI. No interactive approval — just hard block. | Always works. No terminal dependency. Loses approve/deny choice. |
| **(C) OpenCode client API** | Use `context.client` to render a prompt or notification. Hypothetical — depends on what client API exposes. | Unknown API surface. May not exist. |
| **(D) File-based gate** | Write a `.harness/pending-approval.json`, throw to block. Separate CLI tool polls and writes `.harness/approved.json`. Plugin checks on next tool call. | Clunky but decouples terminal from plugin. |

### Decision

**(B) Throw-with-message as primary, with (A) as opt-in fallback.**

### Rationale

- **Throw-with-message** is the only mechanism guaranteed to work in all
  OpenCode environments (headless, SSH, CI). It blocks the tool call, the
  agent receives the error message, and the user sees it in the OpenCode UI.
- The error message contains full context: tool, command, risk reason, pattern
  matched. The agent can explain to the user why it was blocked.
- Interactive approval is a Claude Code luxury tied to the subprocess model.
  Porting it 1:1 would fight the platform.
- **Fallback (A)** can be enabled via `harness-policy.json` flag
  `hitl_mode: "interactive" | "block"`. If the user sets "interactive" and
  OpenCode is running in a terminal-capable environment, spawn the subprocess.
  Otherwise, fall back to throw.

### Consequences

- High-risk commands are **hard-blocked** by default in OpenCode, not
  approve/deny. This is stricter than Claude Code.
- The agent's error response becomes the "HITL" — the user reads the block
  reason and can manually re-issue the command if appropriate.
- `hitl_mode` policy field lets power users opt into interactive mode.
- Audit log still records the block decision (auto-deny).

---

## ADR-003: Session Gate Gap

### Context

Claude Code harness runs preflight.ts **before** `claude` launches. All 7
checks pass or the session never starts. Zero tool calls can execute in an
unverified environment.

OpenCode's `session.created` fires **after** the session is active. There is
no `session.creating` or `session.before` event. This means:

1. The first `tool.execute.before` could fire before `session.created`.
2. Even if `session.created` fires first, it cannot abort the session.
3. There is a temporal window where tools execute in an unverified environment.

### Options Considered

| Option | Impact | Complexity |
|---|---|---|
| **(A) Compensating control in `tool.execute.before`** | Every tool call runs lightweight preflight. Blocks all tools until preflight passes. State cached after first pass. | Low |
| **(B) External wrapper script** | `harness-opencode start` runs preflight, then launches `opencode`. Mirrors Claude Code flow. | Low |
| **(C) Accept regression** | Document that OpenCode doesn't have a pre-session gate. Rely on tool-level checks only. | None |
| **(D) Lazy preflight + kill** | `session.created` runs preflight. If it fails, use `process.exit()` to kill the process. | Low but brutal |

### Decision

**(A) + (B) — Belt and suspenders.**

- **(B)** is the primary control. The `harness` CLI gets an `opencode`
  subcommand: `harness opencode` runs preflight, then launches `opencode`.
  This preserves the true pre-session gate for users who launch via CLI.

- **(A)** is the defensive fallback. The plugin maintains a `preflightPassed`
  boolean. On every `tool.execute.before`, if `!preflightPassed`, run
  preflight checks. If they fail, throw to block. Once passed, cache the
  result for the session lifetime.

### Rationale

- (B) alone is insufficient because users might launch OpenCode directly
  (not via `harness opencode`), bypassing the wrapper.
- (A) alone adds latency to the first tool call (preflight checks take 1-3s)
  but is invisible after that.
- Together, they provide defense-in-depth: the wrapper catches 90% of launches,
  the in-plugin check catches the rest.
- (D) is rejected because killing the process is a terrible UX. The user loses
  all session state.

### Consequences

- First tool call in a non-wrapper launch has ~2s overhead (preflight runs).
- Preflight results are cached in-memory (plugin lifetime = session lifetime).
- If Docker isn't running, the first tool call blocks with a clear error
  explaining what to fix.
- The `harness status` and `harness opencode` commands unify both runtimes.

---

## ADR-004: Plugin Structure

### Context

The current harness is 15 files, ~1,100 lines total. The OpenCode plugin needs
to live in `.opencode/plugins/` and be discoverable by OpenCode's plugin
loader.

### Options Considered

| Option | Pros | Cons |
|---|---|---|
| **(A) Single file** | Simple, no bundling, copy-paste install | 500+ lines in one file, hard to test |
| **(B) Multi-file in `.opencode/plugins/harness/`** | Clean separation, testable | OpenCode may not support subdirectory plugins |
| **(C) npm package** | Proper packaging, versioning, `bun add` | Dependency management contradicts zero-deps ethos, publishing overhead |
| **(D) Git submodule** | Versioned, separate repo, shared across projects | Git submodule pain |
| **(E) Symlink from mono-repo** | Plugin code lives in harness repo, symlinked into `.opencode/plugins/` | Fragile paths, platform-specific symlink behavior |

### Decision

**(E) Symlink from harness repo, with (A) as built artifact.**

### Rationale

The harness repo already owns all the security logic. The OpenCode plugin is
a **thin adapter** (~150 lines) that:
1. Registers event handlers
2. Delegates to `src/lib/security/*` shared modules
3. Manages preflight state

The adapter file lives at `src/opencode-plugin.ts` in the harness repo. The
`harness install` command creates a symlink:

```
.opencode/plugins/harness.ts → <harness-repo>/src/opencode-plugin.ts
```

If OpenCode doesn't support symlinks or subdirectories, fallback to **(A)**:
`harness install` **copies** the built single-file artifact into
`.opencode/plugins/harness.ts`.

### Consequences

- Plugin source lives alongside Claude Code hooks — one repo, one review.
- `harness install` handles provisioning for both runtimes.
- If the symlink approach breaks, the copy approach is a simple fallback.
- Testing: the plugin adapter has its own test file in the harness repo.

---

## ADR-005: Dual-Runtime Abstraction

### Context

The harness must work for both Claude Code (subprocess hooks) and OpenCode
(in-process plugin) simultaneously. The question is where to draw the
abstraction boundary.

### Options Considered

| Option | Description | Maintenance Burden |
|---|---|---|
| **(A) No abstraction** | Two completely separate codepaths sharing only `types.ts`. | High — every security rule change is made twice. |
| **(B) Full adapter** | `RuntimeAdapter` interface with `ClaudeCodeAdapter` and `OpenCodeAdapter` implementations. | High — interface design overhead, solo dev can't justify it. |
| **(C) Pure-core + thin shells** | Shared pure security logic in `src/lib/security/`. Each runtime has a ~100-line shell that handles I/O and calls the core. | Low — the sweet spot for 2 consumers. |

### Decision

**(C) Pure-core + thin shells.**

### Architecture

```
                  ┌─────────────────────────┐
                  │   src/lib/security/      │
                  │   (pure logic, no I/O)   │
                  │                          │
                  │   policy.ts              │
                  │   install-parse.ts       │
                  │   trivy.ts               │
                  │   semgrep.ts             │
                  │   preflight-checks.ts    │
                  │   audit.ts               │
                  │   types.ts               │
                  └──────────┬──────────────┘
                             │
              ┌──────────────┼──────────────┐
              │                             │
    ┌─────────▼─────────┐       ┌───────────▼──────────┐
    │  Claude Code Shell │       │  OpenCode Shell      │
    │                    │       │                      │
    │  pre-tool-use.ts   │       │  opencode-plugin.ts  │
    │  post-tool-use.ts  │       │  (~150 lines)        │
    │  hitl-gateway.ts   │       │                      │
    │  (~300 lines)      │       │  Handles:            │
    │                    │       │  - tool.execute.before│
    │  Handles:          │       │  - tool.execute.after │
    │  - stdin/stdout    │       │  - session.created    │
    │  - exit codes      │       │  - throw-to-block     │
    │  - cmd rewriting   │       │  - in-process exec    │
    │  - subprocess HITL │       │  - preflight cache    │
    └────────────────────┘       └──────────────────────┘
```

### Key Design Rule: Dependency Injection of I/O

Every security module takes its I/O operations as parameters:

```
// trivy.ts signature (conceptual)
trivyScan(pkg, { runCommand, writeTempFile, deleteTempDir })

// semgrep.ts signature (conceptual)
semgrepScan(filePath, { runCommand })

// policy.ts signature (conceptual)
loadPolicy(policyPath, { readFile })
```

Claude Code shell passes `Bun.spawn`-based implementations.
OpenCode shell passes `Bun.$`-based or direct `Bun.file` implementations.

### Consequences

- Security logic changes are made once in `src/lib/security/`.
- I/O differences are isolated to ~100-line shell files.
- Testing: mock the I/O params, test the pure logic directly.
- No interface/class indirection — just function parameters.

---

## ADR-006: Install Flow

### Context

The current `harness install` command scaffolds 8 files into a target project
for Claude Code: hooks.json, .claudeignore, harness-policy.json, .env.schema,
.gitignore entries, .pre-commit-config.yaml, .harness/ directory, and mcp.json.

OpenCode needs:
- Plugin file at `.opencode/plugins/harness.ts`
- Policy file (shared with Claude Code)
- .harness/ runtime directory
- No hooks.json equivalent (plugin discovery is automatic)

### Decision

**Extend `harness install` with runtime detection.**

The install command detects which runtimes are present and scaffolds
accordingly:

| Check | Action |
|---|---|
| `.claude/` exists or `--claude` flag | Scaffold Claude Code hooks.json, .claudeignore, mcp.json |
| `.opencode/` exists or `--opencode` flag | Create `.opencode/plugins/`, symlink/copy plugin file |
| Always | harness-policy.json, .env.schema, .gitignore, .harness/, .pre-commit-config.yaml |

The shared files (policy, schema, gitignore, pre-commit) are written once
regardless of runtime. Runtime-specific files are conditional.

### New CLI Surface

```
harness install              # Auto-detect, scaffold both if applicable
harness install --claude     # Claude Code only
harness install --opencode   # OpenCode only
harness opencode [args]      # Preflight + launch opencode (mirrors 'harness start')
```

### Consequences

- Users don't need to know which scaffolding is for which runtime.
- `harness install` is idempotent — re-running doesn't clobber existing config.
- The `harness opencode` command provides the pre-session gate wrapper.
- Solo dev maintains one install script, not two.

---

## C4 Diagram

### Level 1: System Context

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Developer Workstation                         │
│                                                                      │
│  ┌──────────┐     ┌────────────────────────────────────────────┐    │
│  │          │     │         Security Harness                    │    │
│  │  Human   │────>│                                            │    │
│  │Developer │     │  CLI: harness start | opencode | install   │    │
│  │          │<────│  HITL: approve/deny prompts                │    │
│  └──────────┘     └──────────────┬─────────────────────────────┘    │
│                                  │                                   │
│                    ┌─────────────┼─────────────┐                    │
│                    │             │             │                      │
│              ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐             │
│              │Claude Code│ │OpenCode │ │   Docker    │              │
│              │  (Agent)  │ │ (Agent) │ │  Sandbox    │              │
│              └─────┬─────┘ └────┬────┘ └──────┬──────┘             │
│                    │            │              │                      │
│              ┌─────▼────────────▼──────────────▼─────┐              │
│              │          External Tools               │              │
│              │  Semgrep · Trivy · TruffleHog · Docker│              │
│              └───────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────┘
```

### Level 2: Container Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Security Harness Repo                           │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     src/lib/security/  (SHARED CORE)               │  │
│  │                                                                    │  │
│  │  ┌──────────┐ ┌──────────────┐ ┌────────┐ ┌─────────┐ ┌───────┐  │  │
│  │  │ policy   │ │install-parse │ │ trivy  │ │ semgrep │ │ audit │  │  │
│  │  │          │ │              │ │        │ │         │ │       │  │  │
│  │  │ load()   │ │ parse()      │ │ scan() │ │ scan()  │ │ log() │  │  │
│  │  │ match()  │ │ lockfile()   │ │        │ │         │ │       │  │  │
│  │  └──────────┘ └──────────────┘ └────────┘ └─────────┘ └───────┘  │  │
│  │                                                                    │  │
│  │  ┌───────────────────┐  ┌────────────────┐                        │  │
│  │  │preflight-checks   │  │ types          │                        │  │
│  │  │                   │  │                │                        │  │
│  │  │ checkVarlock()    │  │ HarnessPolicy  │                        │  │
│  │  │ checkEnvClean()   │  │ ParsedInstall  │                        │  │
│  │  │ checkDocker()     │  │ SemgrepResult  │                        │  │
│  │  │ checkSchema()     │  │ AuditEntry     │                        │  │
│  │  │ checkTruffleHog() │  │ PreflightResult│                        │  │
│  │  │ checkVarlockScan()│  │ ...            │                        │  │
│  │  │ checkConflicts()  │  │                │                        │  │
│  │  └───────────────────┘  └────────────────┘                        │  │
│  └────────────────────────────────┬───────────────────────────────────┘  │
│                                   │                                      │
│          ┌────────────────────────┼────────────────────────┐             │
│          │                        │                        │             │
│  ┌───────▼────────────┐  ┌───────▼───────────┐  ┌────────▼──────────┐  │
│  │  Claude Code Shell  │  │ OpenCode Plugin   │  │  CLI (cli.ts)     │  │
│  │                     │  │                   │  │                   │  │
│  │  pre-tool-use.ts    │  │ opencode-plugin.ts│  │  start/stop/      │  │
│  │  post-tool-use.ts   │  │                   │  │  install/shred/   │  │
│  │  hitl-gateway.ts    │  │ tool.exec.before  │  │  status/opencode  │  │
│  │                     │  │ tool.exec.after   │  │                   │  │
│  │  stdin/stdout JSON  │  │ session.created   │  │  preflight.ts     │  │
│  │  exit code blocking │  │ throw-to-block    │  │  sandbox/*.ts     │  │
│  └─────────────────────┘  └───────────────────┘  └───────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     src/lib/ (SHARED INFRA)                        │  │
│  │                                                                    │  │
│  │  base.ts    — runCommandCapture, fileExists, ensureDir, etc.       │  │
│  │  ui.ts      — ANSI colors, spinners, printHeader, etc.             │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Level 3: Component — OpenCode Plugin Internal

```
┌──────────────────────────────────────────────────────────────────┐
│                    opencode-plugin.ts                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     Plugin Entry                           │  │
│  │                                                            │  │
│  │  export default function(context) {                        │  │
│  │    // context = { client, $, directory, worktree }         │  │
│  │    return { onToolBefore, onToolAfter, onSessionCreated }  │  │
│  │  }                                                         │  │
│  └────────┬──────────────┬──────────────┬─────────────────────┘  │
│           │              │              │                         │
│  ┌────────▼──────┐ ┌─────▼──────┐ ┌────▼────────────┐           │
│  │ onToolBefore  │ │onToolAfter │ │onSessionCreated │           │
│  │               │ │            │ │                 │           │
│  │ if !preflight │ │ semgrep    │ │ log session     │           │
│  │   → run it   │ │ scan on    │ │ start to        │           │
│  │               │ │ writes     │ │ audit.log       │           │
│  │ policy match? │ │            │ │                 │           │
│  │   → throw     │ │ audit log  │ │ warm sandbox    │           │
│  │               │ │ append     │ │ if not running  │           │
│  │ install cmd?  │ │            │ └─────────────────┘           │
│  │   → trivy     │ └────────────┘                               │
│  │   → throw if  │                                              │
│  │     CVE found │   State:                                     │
│  │               │   ┌──────────────────────────┐               │
│  │ sandbox route │   │ preflightPassed: boolean │               │
│  │   → rewrite?  │   │ policyCache: HarnessPolicy│              │
│  │   → or throw  │   │ auditLogPath: string     │               │
│  └───────────────┘   └──────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow: tool.execute.before

```
Agent issues tool call
        │
        ▼
┌─────────────────┐     ┌─────────────────────────┐
│ tool.execute     │     │ Plugin: onToolBefore     │
│ .before fires   │────>│                          │
└─────────────────┘     │  1. Preflight passed?    │
                        │     No → run checks      │
                        │     Fail → throw(reason)  │
                        │                          │
                        │  2. Is Bash tool?         │
                        │     No → return (allow)   │
                        │                          │
                        │  3. High-risk pattern?    │
                        │     Yes → throw(blocked)  │
                        │                          │
                        │  4. Install command?      │
                        │     Yes → trivy scan      │
                        │     CVE → throw(blocked)  │
                        │                          │
                        │  5. return (allow)        │
                        └──────────┬───────────────┘
                                   │
                        ┌──────────▼───────────────┐
                        │ Tool executes normally    │
                        │ (no command rewriting —   │
                        │  see ADR-003 note below)  │
                        └──────────────────────────┘
```

---

## Shared Module Boundaries

### Boundary Rules

1. **`src/lib/security/` modules MUST NOT import from:**
   - `node:readline/promises` (HITL-specific)
   - `process.stdin` / `process.stdout` (protocol-specific)
   - Any module in `src/hooks/` or `src/opencode-plugin.ts`

2. **`src/lib/security/` modules MAY import from:**
   - `src/lib/security/types.ts` (shared types)
   - Bun built-ins (`Bun.file`, `Bun.spawn` — but only via injected callbacks)

3. **Shell files (hooks, plugin) MAY import from:**
   - `src/lib/security/*` (the whole point)
   - `src/lib/base.ts` (I/O utilities)
   - `src/lib/ui.ts` (CLI only, not plugin)

### Module Dependency Graph

```
types.ts                    ← imported by everything
    ▲
    │
policy.ts                   ← pure: regex match, JSON parse
    ▲
    │
install-parse.ts            ← pure: regex parse, template generation
    ▲
    │
trivy.ts                    ← I/O-injected: needs runCommand, writeTempFile
    ▲
    │
semgrep.ts                  ← I/O-injected: needs runCommand
    ▲
    │
preflight-checks.ts         ← I/O-injected: needs runCommand, fileExists, envCheck
    ▲
    │
audit.ts                    ← I/O-injected: needs appendFile

    ─── No circular dependencies. DAG only. ───
```

### I/O Injection Contract

```
type CommandRunner = (argv: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
type FileWriter = (path: string, content: string) => Promise<void>
type FileReader = (path: string) => Promise<string>
type FileChecker = (path: string) => Promise<boolean>
type DirEnsurer = (path: string) => Promise<void>
type TempDirMaker = () => string          // returns temp dir path
type TempDirCleaner = (path: string) => void

// Example: trivy.ts
type TrivyDeps = {
  runCommand: CommandRunner
  makeTempDir: TempDirMaker
  writeFile: FileWriter
  cleanTempDir: TempDirCleaner
}
```

### What Stays Runtime-Specific

| Concern | Claude Code Shell | OpenCode Plugin |
|---|---|---|
| Input parsing | `readStdinText()` → `JSON.parse()` | Event handler parameter |
| Output/blocking | `writeStdout(JSON)` + `process.exit(1)` | `throw new Error(reason)` |
| Command rewriting | Mutate `tool_input.command` in JSON | Not available (see Risk #1) |
| HITL | Spawn `hitl-gateway.ts` subprocess | `throw` with descriptive message |
| Audit write target | `appendText()` to `.aegis/audit.log` | Same (shared via audit.ts) |
| State management | None (stateless per invocation) | `preflightPassed` in closure |

---

## Top 3 Architectural Risks

### Risk 1: No Command Rewriting — Sandbox Gap

**Severity: HIGH**

**Description:** Claude Code's pre-tool-use hook rewrites
`tool_input.command` to route bash commands through `docker exec
harness-sandbox`. This is the primary sandbox enforcement mechanism.
OpenCode's `tool.execute.before` event can block (throw) but cannot rewrite
the command. If the tool is allowed, it runs as-is on the host.

**Impact:** All bash commands in OpenCode execute on the host, not in the
sandbox. This is a **fundamental security regression**.

**Mitigations (choose one or combine):**

| Mitigation | Effectiveness | Complexity |
|---|---|---|
| **(M1) Block-only policy** | Instead of sandboxing, block all commands matching `run_shell.default = "sandbox"`. User must manually approve via separate tool. | High security, bad UX |
| **(M2) OpenCode permission layer** | Rely on OpenCode's native permission system (if it has `bash: "ask"` equivalent). Harness policy becomes advisory. | Depends on OpenCode maturity |
| **(M3) Feature request to OpenCode** | Request `tool.execute.before` to support command mutation (return modified event). | Long-term, no guarantee |
| **(M4) CLAUDE.md / AGENTS.md instruction** | Inject immutable instruction: "ALL shell commands MUST be prefixed with `docker exec harness-sandbox bash -c`". Prompt-level enforcement. | Weak — agent can ignore |
| **(M5) Wrapper detection** | In `tool.execute.after`, check if the command ran on host when it should have been sandboxed. Log a security violation. Detective, not preventive. | Medium — audit trail only |

**Recommendation:** **(M1) + (M5)** — Block by default, detect violations as
backup. This is the safest posture for a security tool. Accept the UX
regression until OpenCode supports command mutation.

---

### Risk 2: In-Process Crash Propagation

**Severity: MEDIUM**

**Description:** Claude Code hooks run as separate processes. If a hook crashes
(unhandled exception, OOM), only the hook dies — the agent continues (with the
tool call blocked). In OpenCode's in-process model, an unhandled exception in
the plugin's event handler could crash the entire OpenCode process, killing
the user's session.

**Impact:** A bug in Trivy scanning, Semgrep parsing, or policy loading could
take down the agent session. The security tool becomes a reliability risk.

**Mitigations:**

| Mitigation | Effectiveness |
|---|---|
| **(M1) Top-level try/catch in every handler** | Catches all sync/async errors. On catch: log error, allow the tool call (fail-open). |
| **(M2) Fail-closed try/catch** | On catch: `throw new Error("Harness internal error — tool blocked for safety")`. Safer but annoying if buggy. |
| **(M3) Timeout wrapper** | Wrap each handler in `Promise.race([handler(), timeout(5000)])`. If the security check hangs, fail-open or fail-closed per policy. |

**Recommendation:** **(M2) + (M3)** — Fail-closed with a 5-second timeout.
A security tool that silently fails open is worse than one that blocks too
aggressively. The timeout prevents a hung Trivy/Semgrep from freezing the
agent.

---

### Risk 3: Preflight Race Condition

**Severity: MEDIUM**

**Description:** With the compensating control in `tool.execute.before`
(ADR-003), the first tool call triggers preflight. But if two tool calls fire
concurrently (e.g., parallel subagents), both see `preflightPassed === false`
and both run preflight simultaneously. This is a race condition that could
cause duplicate Docker container starts, redundant Varlock checks, or
conflicting audit log writes.

**Impact:** Mostly benign (duplicate work, confusing logs) but could cause
Docker errors if two `docker run` commands try to create `harness-sandbox`
simultaneously.

**Mitigations:**

| Mitigation | Effectiveness |
|---|---|
| **(M1) Mutex via promise** | First caller sets `preflightPromise`. Subsequent callers `await preflightPromise`. Classic async mutex pattern. |
| **(M2) Atomic flag** | `preflightRunning` boolean. Second caller throws "preflight in progress, retry". |
| **(M3) Idempotent checks** | Make every preflight check idempotent (e.g., `docker run` with `--rm` first, `docker start` is a no-op if running). |

**Recommendation:** **(M1) + (M3)** — Promise-based mutex ensures exactly one
preflight runs. Idempotent checks are good hygiene regardless.

---

## Summary Decision Matrix

| # | Question | Decision | Key Trade-off |
|---|---|---|---|
| ADR-001 | Shared logic | Extract `src/lib/security/` | Refactor effort vs. drift prevention |
| ADR-002 | HITL model | Throw-to-block (interactive opt-in) | Stricter by default, worse UX |
| ADR-003 | Session gate | Wrapper CLI + in-plugin lazy preflight | Belt-and-suspenders complexity |
| ADR-004 | Plugin structure | Symlink from harness repo | Fragile paths vs. one source of truth |
| ADR-005 | Dual-runtime | Pure-core + thin shells | I/O injection verbosity |
| ADR-006 | Install flow | Extend `harness install` with auto-detect | One command, conditional scaffolding |
