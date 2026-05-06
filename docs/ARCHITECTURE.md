# Aegis Security Agent — Architecture Reference

> Version 0.1.16 · Last updated 2026-05-06

---

## 1. What Aegis Is

Aegis is a **thin npm package** (`aegis-security-agent`) that installs as an OpenCode plugin or a Claude Code hook and enforces a security policy on every tool call the AI agent makes. It does not run a server. It does not manage its own process. It is purely reactive — it intercepts tool calls via callbacks registered with the host (OpenCode or Claude Code) and either allows, warns, or blocks them.

---

## 2. npm Package Layout

```
aegis-security-agent/
├── dist/                        ← compiled output (published)
│   ├── index.js                 ← OpenCode plugin entry point
│   ├── index.d.ts               ← TypeScript types
│   └── cli/index.js             ← aegis CLI entry point
├── bin/
│   └── aegis.ts                 ← CLI shim (Bun shebang, published)
├── scanners-manifest.json       ← scanner version + download URLs (published)
├── aegis-policy.json            ← default policy template (published)
├── docs/agents/aegis.md         ← @aegis agent definition (published)
├── docs/skills/                 ← security guidance skills (published, full directories)
│   ├── AgentTrustBoundaries/
│   │   ├── SKILL.md             ← slim routing table
│   │   ├── TrustBoundaryPatterns.md
│   │   ├── ContextCrushDefense.md
│   │   └── Workflows/
│   │       ├── HandleUntrustedContent.md
│   │       └── DefendContextCrush.md
│   ├── SecretSafeHandling/
│   │   ├── SKILL.md
│   │   ├── CloudCredentialPatterns.md
│   │   ├── SecretHandlingPlaybook.md
│   │   └── Workflows/
│   │       ├── DesignSecretSafeFlow.md
│   │       └── RemoveSecretExposure.md
│   └── CommandPathSafety/
│       ├── SKILL.md
│       ├── CommandInjectionPatterns.md
│       ├── PathTraversalAndInstallerSafety.md
│       └── Workflows/
│           ├── HardenCommandExecution.md
│           └── EnforcePathBoundaries.md
├── .claudeignore                ← sensitive file patterns (published)
└── .trufflehogignore            ← TruffleHog exclusions (published)
```

The `package.json` `files` field controls what lands on npm:
```json
["dist", "bin", "scanners-manifest.json", "aegis-policy.json", "docs/agents/aegis.md", "docs/skills", ".claudeignore", ".trufflehogignore"]
```

Source files (`src/`), tests, `.github/`, and `docs/` (except published agent and skill assets) are **not published**.

---

## 3. Dependencies

### Runtime (ships with the package)

| Package | What it does |
|---------|-------------|
| `@opencode-ai/plugin` | OpenCode plugin SDK — provides the `Plugin` type and `PluginInput` types that Aegis implements |

That's it. One runtime dependency. Everything else is either built into Bun or a dev tool.

### Dev / Build time only

| Package | What it does |
|---------|-------------|
| `@types/bun` | TypeScript types for Bun APIs (`Bun.file`, `Bun.write`, etc.) |

### External tools (not npm packages — installed separately)

These are security scanners that Aegis provisions into `~/.aegis/bin/` or the system. They are **not** npm dependencies.

| Tool | Version | Install method |
|------|---------|---------------|
| Trivy | 0.70.0 | Binary download from GitHub releases → `~/.aegis/bin/trivy/` |
| TruffleHog | 3.95.2 | Binary download from GitHub releases → `~/.aegis/bin/trufflehog/` |
| Semgrep | 1.158.0 | `pipx install semgrep==1.158.0` (fallback: `uv tool install`) |

---

## 4. Scanner Tools — Install, Location, Version Pinning

### 4.1 `scanners-manifest.json`

All scanner versions and download URLs are pinned in `scanners-manifest.json` at the project root. This file is published to npm, so every version of the package has a fixed manifest.

```jsonc
{
  "scanners": {
    "trivy": {
      "version": "0.70.0",
      "kind": "binary",
      "platforms": {
        "darwin-arm64": { "url": "...", "sha256": "...", "binaryName": "trivy" },
        "darwin-x64":   { ... },
        "linux-arm64":  { ... },
        "linux-x64":    { ... }
      }
    },
    "trufflehog": {
      "version": "3.95.2",
      "kind": "binary",
      "platforms": { ... }
    },
    "semgrep": {
      "version": "1.158.0",
      "kind": "python-tool",
      "commands": [
        "pipx install semgrep==1.158.0",
        "uv tool install semgrep==1.158.0"
      ]
    }
  }
}
```

### 4.2 Binary tools (Trivy, TruffleHog)

Install flow:
1. `aegis tools install --tool=trivy` (or `--all`)
2. Reads `scanners-manifest.json` to get URL and SHA-256
3. Downloads `.tar.gz` from GitHub releases
4. Verifies SHA-256 checksum
5. Extracts binary atomically into `~/.aegis/bin/<tool>/`
6. Uses a temp file lock to prevent concurrent downloads

Binary locations (versioned and platform-specific):
```
~/.aegis/bin/
├── trivy/
│   └── 0.70.0/
│       └── darwin-arm64/
│           └── trivy              ← the actual binary
└── trufflehog/
    └── 3.95.2/
        └── darwin-arm64/
            └── trufflehog         ← the actual binary
```

Override with `AEGIS_TOOLS_DIR` env var to change the base directory.

### 4.3 Semgrep

Semgrep is Python-based. It cannot be distributed as a simple binary because it requires a Python runtime. Install flow:
1. Try `pipx install semgrep==1.158.0`
2. If pipx fails or not found, fall back to `uv tool install semgrep==1.158.0`
3. Semgrep lands wherever pipx/uv puts it (usually `~/.local/bin/semgrep`)

### 4.4 `aegis tools` CLI commands

| Command | What it does |
|---------|-------------|
| `aegis tools install --tool=trivy` | Download and install one scanner |
| `aegis tools install --all` | Install all three scanners |
| `aegis tools install --ci` | Same but optimised for CI (no TTY spinners) |
| `aegis tools status` | Show installed versions and states |
| `aegis tools remove --tool=trivy` | Remove a provisioned binary |

---

## 5. Everything `aegis install --opencode` Writes

Run as: `bunx aegis-security-agent install --opencode` (in the target project directory)

| File | Overwrite policy | What it does |
|------|-----------------|-------------|
| `opencode.json` | Patch only — adds `"aegis-security-agent"` to `plugin[]` array | Registers the plugin with OpenCode |
| `.aegis/` | Create if missing | Runtime directory for audit logs and scan cache |
| `.aegis/audit.log` | Create if missing | Append-only audit log |
| `aegis-policy.json` | Skip if exists | Your security policy — **user-editable** |
| `.opencode/plugins/aegis.ts` | **Always overwrite** | Plugin shim — auto-updated on every install |
| `.opencode/package.json` | **Always overwrite** | Pins the exact version of `aegis-security-agent` Bun will load |
| `.opencode/agents/aegis.md` | **Always overwrite** | `@aegis` agent definition — must stay in sync with package |
| `.opencode/skills/*/` | **Always overwrite** | Security guidance skills — full directories (SKILL.md + reference docs + Workflows/) |
| `.env.schema` | Skip if exists | varlock schema for secret validation |
| `.pre-commit-config.yaml` | Skip if exists | TruffleHog pre-commit hook |
| `.trufflehogignore` | **Always overwrite** | Excludes `.git/objects/` and binaries from TruffleHog scans |

**Why `.opencode/plugins/aegis.ts` and `.opencode/package.json` always overwrite:** These are generated files — they should never be manually edited. Always overwriting ensures that running `bunx aegis-security-agent@X.Y.Z install` upgrades the plugin in-place without needing `--force`.

The shim content (observation-only — registers no hooks, blocks nothing):
```typescript
// Auto-generated by aegis install v0.1.14. Do not edit.
// Observation-only mode: registers no hooks, blocks nothing.
export default async () => ({});
```

The package.json pins the exact version:
```json
{ "dependencies": { "aegis-security-agent": "0.1.14" } }
```

### Upgrading an existing install

```bash
bunx aegis-security-agent@latest install --opencode
# then update the pinned version in node_modules:
cd .opencode && bun update aegis-security-agent
```

---

## 6. Everything `aegis install --claude` Writes

Run as: `bunx aegis-security-agent install --claude` (in the target project directory)

| File | Overwrite policy | What it does |
|------|-----------------|-------------|
| `.claude/hooks.json` | Skip if exists | Registers `pre-tool-use.ts` as a Claude Code hook |
| `.aegis/` | Create if missing | Runtime directory |
| `.aegis/audit.log` | Create if missing | Append-only audit log |
| `.claude/agents/aegis.md` | Skip if exists | `@aegis` agent persona |
| `.claude/skills/*/` | **Always overwrite** | Security guidance skills — full directories (SKILL.md + reference docs + Workflows/) |
| `.claudeignore` | Skip if exists | Blocks Claude from reading `.env`, `*.pem`, `*.key`, `*_rsa` |
| `.trufflehogignore` | **Always overwrite** | Excludes `.git/objects/` and binaries from TruffleHog scans |

The hooks.json wires `src/hooks/pre-tool-use.ts` as a `PreToolUse` hook. Claude Code invokes this script before every tool call, passing the tool input as JSON on stdin, and expects modified (or unchanged) JSON on stdout. Exit code 1 blocks the tool call.

---

## 7. OpenCode Plugin Lifecycle

### 7.1 How OpenCode loads the plugin

1. OpenCode reads `opencode.json` at project root — finds `"plugin": ["aegis-security-agent"]`
2. Looks for `.opencode/plugins/aegis.ts`
3. Runs `bun install` in `.opencode/` to resolve `aegis-security-agent` from `.opencode/package.json`
4. Imports the default export from `aegis.ts` (which re-exports from the installed package)
5. Calls the plugin factory `AegisSecurityPlugin({ directory, client })`
6. Receives the hook map and registers each hook

### 7.2 Plugin factory (`src/opencode/index.ts`)

```
AegisSecurityPlugin({ directory, client })
  ├── reads aegis-policy.json from project root
  ├── creates shared state: preflightPassed, preflightRan, preflightPromise, degraded
  ├── creates 6 handlers (each is a closure over the shared state)
  └── returns hook map:
       "event"                        → session handler (preflight)
       "shell.env"                    → env handler (secret stripping)
       "tool.execute.before"          → before handler (block/allow)
       "tool.execute.after"           → after handler (Semgrep scan)
       "experimental.session.compacting" → compaction handler (context injection)
       "permission.ask"               → permission handler (HITL escalation)
```

All handlers are wrapped in `safe()` which catches and swallows all errors — Aegis is advisory-only and must never block tool calls. Errors are logged to stderr. The `event` handler additionally marks `preflightPassed = false` on failure.

### 7.3 The 6 Hook Handlers

#### `event` — Session Handler (preflight)

Fires when OpenCode emits `session.created`.

Flow:
1. `bootstrapAegisDir()` — idempotently creates `.aegis/`, `.aegis/scans/`, `.aegis/audit.log`, patches `.gitignore`
2. `runDefaultPreflight()`:
   - Check if `bunx varlock --version` exits 0 → warn if not found
   - Check if `.env.schema` exists → warn if missing
   - Scan `process.env` for known sensitive variable names → **BLOCK** if any found (live secrets in env = active risk)
   - Check `.pre-commit-config.yaml` for TruffleHog hook → warn if missing
   - Check Docker state → set `degraded = true` if Docker unavailable (warn only)
   - If varlock available: run `bunx varlock scan --staged` → **BLOCK** if staged secrets detected
3. Sets `preflightPassed` and resolves `preflightPromise`

**Block vs warn summary:**

| Check | Blocks? | Why |
|-------|---------|-----|
| varlock not installed | Warn only | Advisory gap |
| `.env.schema` missing | Warn only | Advisory gap |
| Live secrets in `process.env` | **BLOCK** | Active exfiltration risk |
| `.pre-commit-config.yaml` missing | Warn only | Advisory gap |
| Docker unavailable | Warn + degraded | Sandbox fallback |
| Staged secrets detected (varlock) | **BLOCK** | About to commit secrets |

#### `shell.env` — Env Handler

Fires before OpenCode sets the shell environment for a tool call.

Deletes known sensitive variable names from the `output.env` object. This prevents secrets from leaking into the AI's visible environment.

Default sensitive vars: `AWS_SECRET_ACCESS_KEY`, `AWS_ACCESS_KEY_ID`, `GITHUB_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `NPM_TOKEN`, and others defined in `DEFAULT_SENSITIVE_VARS`.

#### `tool.execute.before` — Before Handler

Fires before every tool call. The preflight must complete first.

Flow:
1. **Preflight gate** — polls up to 500ms for `preflightPromise` to be set; throws if still null ("Preflight not initialized"). Warns (does not block) if `preflightPassed = false`.
2. **Sensitive file check** — for `read`, `write`, `edit` tools: checks `filePath` against `actions.read_file.deny_patterns` in policy → **BLOCK** if matched
3. **High-risk pattern check** — for `bash` tool: checks command against `high_risk_patterns` array → **BLOCK** if matched
4. **Trivy dependency scan** — if command is a package install (`bun add X`, `npm install X`, etc.): writes a lockfile to a temp dir and runs `trivy fs` → **BLOCK** if HIGH/CRITICAL CVEs found

#### `tool.execute.after` — After Handler

Fires after `write` or `edit` tool calls complete.

Runs Semgrep on the written file path. If findings exist, appends a `[AEGIS] Semgrep: N findings` summary to `output.output` (the result shown to the AI). Full finding details are written to `.aegis/scans/<uuid>.json` to avoid bloating the AI's context window.

#### `experimental.session.compacting` — Compaction Handler

Fires when OpenCode compacts the session context.

Appends a status line to `output.context`:
```
[AEGIS] Security: routing=full, preflight=passed, blocked_patterns=42
```

This ensures the AI always knows Aegis is running even after context compaction.

#### `permission.ask` — Permission Handler

Fires when OpenCode asks for permission to execute a command.

Checks the command/title against `high_risk_patterns`. If matched, sets `output.status = "ask"` to force a human confirmation prompt.

---

## 8. Claude Code Hooks Lifecycle (`pre-tool-use.ts`)

For Claude Code integration (not OpenCode), Aegis uses a different mechanism: a **PreToolUse hook** script.

### How it works

1. Claude Code invokes `pre-tool-use.ts` before every tool call
2. Hook receives full tool input as JSON on stdin
3. Script reads policy from `aegis-policy.json` (loaded from the Aegis package dir, not project root)
4. For `Bash` tool calls:
   - Routes command via `routeCommand()` against policy
   - If `hitl`: writes a HITL request JSON and invokes `hitl-gateway.ts` which prompts for human approval with a configurable timeout (default 120s) → blocks on denial
   - If `host`: passes through unchanged
   - If install command: runs Trivy scan → blocks on CVEs
   - Otherwise: rewrites command to run through `src/sandbox/exec.ts` (sandbox execution)
5. Outputs (possibly rewritten) JSON to stdout
6. Exit code 1 = block the tool call

### `.claudeignore`

Installed to the target project. Tells Claude Code never to read:
```
.env
.env.*
**/*.pem
**/*.key
**/*_rsa
```

---

## 9. Security Enforcement Layers (in execution order)

```
Session start
    └── [event] bootstrapAegisDir + runDefaultPreflight
             ├── WARN: varlock missing
             ├── WARN: .env.schema missing
             ├── BLOCK: live secrets in process.env  ← hard block
             ├── WARN: .pre-commit-config.yaml missing
             ├── WARN: Docker unavailable → degraded=true
             └── BLOCK: staged secrets (varlock scan)  ← hard block

Each tool call
    ├── [shell.env]             Strip sensitive vars from env
    ├── [tool.execute.before]
    │       ├── Wait for preflight
    │       ├── BLOCK: sensitive file access (.env, *.pem, *.key)
    │       ├── BLOCK: high-risk pattern match (rm -rf, DROP TABLE, etc.)
    │       └── BLOCK: Trivy CVE on package install
    ├── [permission.ask]        Escalate to HITL if high-risk
    └── [tool.execute.after]
            └── Semgrep scan on write/edit → append findings to output
```

---

## 10. `aegis-policy.json` Schema

Every field, what it controls, and which enforcement layer reads it.

```jsonc
{
  "$schema": "https://aegis.local/policy-schema/v1",
  "version": "1.0",

  // ── High-risk bash patterns ─────────────────────────────────────────
  // Checked by: tool.execute.before (bash), permission.ask, pre-tool-use.ts
  // Any bash command matching any of these regex patterns is blocked.
  "high_risk_patterns": [
    "DROP TABLE", "rm -rf", "kubectl apply", "git push --force", ...
  ],

  // HITL timeout — how long to wait for human approval before auto-deny
  // Checked by: pre-tool-use.ts (Claude Code mode only)
  "hitl_timeout_seconds": 120,

  // ── File access rules ──────────────────────────────────────────────
  // Checked by: tool.execute.before (read/write/edit tools)
  "actions": {
    "read_file": {
      "default": "allow",
      "deny_patterns": [".env", "**/*.pem", "**/*.key", "**/*_rsa"]
      // deny_patterns: glob patterns. Any filePath matching any pattern is BLOCKED.
    },
    "edit_file": {
      "default": "ask",
      "allow_patterns": ["src/**", "tests/**", "docs/**"],
      "deny_patterns": [".env", "**/*.pem", "**/*.key", "**/*_rsa", "**/*_ed25519"]
    },

    // ── Shell execution ─────────────────────────────────────────────
    // Note: run_shell.high_risk_patterns is an ADDITIONAL list merged
    // with the top-level high_risk_patterns for bash command checking.
    "run_shell": {
      "default": "sandbox",
      "high_risk_patterns": ["DROP TABLE", "rm -rf", "kubectl apply", "terraform apply"]
    },

    // ── Network ─────────────────────────────────────────────────────
    // Currently informational — not yet enforced in handlers
    "fetch_domain": {
      "default": "deny",
      "allow_list": ["api.anthropic.com", "registry.npmjs.org", "pypi.org"]
    },

    // ── Secrets ─────────────────────────────────────────────────────
    // Currently informational
    "use_secret": {
      "default": "deny",
      "allowed_via": "varlock"
    },

    // ── Deployments ─────────────────────────────────────────────────
    // Currently informational
    "approve_deploy": {
      "default": "hitl",
      "hitl_timeout_seconds": 120
    }
  },

  // ── Routing (sandbox intercept) ────────────────────────────────────
  // Previously used to route commands to Docker sandbox.
  // Sandbox routing was removed in v0.1.8 — these fields are now
  // informational / used by pre-tool-use.ts (Claude Code mode only).
  "routing": {
    // Commands matching these patterns run directly on host
    "host_passthrough": ["^git ", "^ls\\b", "^cat ", ...],
    // Commands matching these patterns were previously sandboxed
    "sandbox_required": ["^npm ", "^curl ", "^python ", ...]
  },

  // ── Degraded mode (Docker unavailable) ────────────────────────────
  "degraded_mode": {
    "allow_host_passthrough": true,   // host_passthrough commands still allowed
    "block_sandbox_required": false,  // sandbox_required commands NOT blocked (changed in v0.1.8)
    "warn_on_degraded": true          // emit a warning when Docker is unavailable
  },

  // ── Scanner config ──────────────────────────────────────────────
  // Currently informational — scanner enablement is not gated at runtime
  "tools": {
    "enabled": ["trivy", "trufflehog", "semgrep"],
    "auto_update": true
  }
}
```

---

## 11. Directory Layout: `~/.aegis/` vs Per-project `.aegis/`

### Global: `~/.aegis/`

Shared across ALL projects. Contains only provisioned scanner binaries.

```
~/.aegis/
├── bin/
│   ├── trivy/
│   │   └── <version>/<platform>/
│   │       └── trivy              ← the actual binary
│   └── trufflehog/
│       └── <version>/<platform>/
│           └── trufflehog         ← the actual binary
```

Semgrep is not here — it's managed by pipx/uv in its own location (usually `~/.local/bin/semgrep`).

Override the binary directory with `AEGIS_TOOLS_DIR` env var.

### Where Aegis Does NOT Deploy

Aegis does **not** write to any global config directories:

- `~/.config/opencode/` — OpenCode's global config. Aegis only writes to the **project-local** `.opencode/` directory.
- `~/.claude/` — Claude Code's global config. Aegis only writes to the **project-local** `.claude/` directory.
- `~/.config/claude/` — not used by Aegis at all.

All agent definitions, skills, plugins, and hooks are **per-project**. The only global artifact is `~/.aegis/bin/` for scanner binaries, which is shared across all projects.

### Per-project: `.aegis/`

Created by `aegis install` and bootstrapped on every session start. Contains runtime data specific to the project.

```
<project>/.aegis/
├── audit.log         ← append-only log of all aegis decisions
└── scans/
    └── <uuid>.json   ← full scanner output files (kept out of AI context)
```

This directory is automatically added to `.gitignore` — it should never be committed.

---

## 12. npm Publish Pipeline

### What triggers a release

Pushing a `v*` tag triggers the `release.yml` workflow:

```
git tag v0.1.9
git push origin v0.1.9
```

### Release workflow steps (`release.yml`)

```
push tag v* →
  checkout →
  setup Bun →
  bun install --frozen-lockfile →
  bun test →
  bun run build →
  npm publish --access public
```

The build step (`bun run build`) does two things:
1. Compiles `src/opencode/index.ts` → `dist/index.js` (ESM, Bun target)
2. Compiles `src/cli/index.ts` → `dist/cli/index.js`
3. Emits TypeScript declarations via `tsc --emitDeclarationOnly`

The publish step uses `NPM_TOKEN` from GitHub Secrets.

### Release Please (`release-please.yml`)

Runs on every push to `main`. Automatically:
- Parses conventional commits (`feat:`, `fix:`, `chore:` etc.)
- Opens a "Release PR" that bumps `package.json` version and updates `CHANGELOG.md`
- When the Release PR is merged, creates a GitHub Release

Note: Release Please creates the GitHub Release but **does not push the tag**. The tag must be pushed manually to trigger the npm publish. Current workflow: bump version in `package.json` + commit + `git tag vX.Y.Z` + `git push origin vX.Y.Z`.

### CI workflow (`ci.yml`)

Runs on every push to `main` and every PR:
```
checkout → setup Bun → bun install --frozen-lockfile → bunx tsc --noEmit → bun test
```

---

## 13. Version History Summary

| Version | Key change |
|---------|-----------|
| 0.1.4 | Initial OpenCode plugin port |
| 0.1.5 | Auto-bootstrap `.aegis/` at runtime |
| 0.1.6 | First working npm release |
| 0.1.7 | Fixed preflight blocking; restored unconditional live-secrets check; scaffold `.env.schema` and `.pre-commit-config.yaml` on install |
| 0.1.8 | Removed Docker exec sandbox intercept — commands pass through directly |
| 0.1.9 | `aegis.ts` shim and `.opencode/package.json` always overwritten on install; version pinned to exact installed release |
| 0.1.14 | Agent definition always overwrites; shim changed to no-op; skills expanded from single SKILL.md to full directories (reference docs + workflows); installer recursively copies skill directories; binary paths versioned and platform-specific (`~/.aegis/bin/<tool>/<version>/<platform>/`) |
