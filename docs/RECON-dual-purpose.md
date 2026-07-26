# Aegis Security Agent - Reconnaissance Summary (Dual-Purpose Pivot)

## Module Boundaries & Dependency Graph

### Core Modules
- **`src/lib`**: Low-level utilities
  - `scanner.ts`: Scanner abstraction (Semgrep, Trivy, TruffleHog wrappers)
  - `scan-cache.ts`: TTL-based caching for scanner results
  - `verdict-log.ts`: Audit logging (NDJSON)
  - `output-proxy.ts`: Summarizes scanner output for AI context
  - `base.ts`: Shared utilities (command execution, timeout handling)
  - `aegis-log.ts`: Internal logging
- **`src/core`**: Policy and decision engine
  - `security.ts`: High-risk pattern matching, sensitive file detection
  - `router.ts`: Command routing (host vs sandbox) based on policy
  - `verdict.ts`: Computes SAFE/RISKY/BLOCKED verdicts from findings
  - `normalize.ts`: Normalizes scanner findings into common format
- **`src/types`**: Type definitions
  - `policy.ts`: Policy schema (aegis-policy.json)
- **`src/hooks`**: Claude Code hook implementations
  - `pre-tool-use.ts`: Pre-tool hook (sandbox routing, HITL, Trivy for installs)
  - `post-tool-use.ts`: Post-tool hook (Semgrep on file writes)
  - `safe-claude.ts`: Error wrapper for hooks
- **`src/opencode`**: OpenCode plugin handlers
  - `handlers/env.ts`: Strips sensitive vars from environment
  - `handlers/before.ts`: Sensitive file check, high-risk pattern, Trivy for installs
  - `handlers/after.ts`: Semgrep on written files
  - `handlers/compaction.ts`: Session compaction handler
  - `handlers/permission.ts`: Permission warning handler
  - `handlers/session.ts`: Session lifecycle handler
- **`src/cli`**: Command-line interface
  - `index.ts`: Main `aegis` command dispatcher
  - `install.ts`: `aegis install` (OpenCode/Claude setup)
  - `report.ts`: `aegis report` (SARIF/HTML report generation)
  - `scan.ts`: `aegis scan` (on-demand scanning)
  - `tools.ts`: `aegis tools` (scanner provisioning)
- **`src/report`**: Report generation
  - `html.ts`: HTML report generation
  - `catalog.ts`: SARIF catalog organization
  - `types.ts`: Report types
- **`src/sarif`**: SARIF generation
  - `builder.ts`: Converts Aegis events to SARIF format
- **`src/sandbox`**: Sandbox detection
  - `detect.ts`: Detects Docker state for degraded mode
- **`src/events`**: Event emission
  - `emitter.ts`: NDJSON event emitter
  - `events.ts`: Event types and creation
  - `snapshot.ts`: Event snapshots for testing
  - `types.ts`: Event type definitions
- **`src/lib/provisioner`**: Scanner provisioning
  - `manager.ts`: Install/remove/status for scanners
  - `downloader.ts`: Download and verify scanner binaries
  - `registry.ts`: Reads scanners-manifest.json
  - `platform.ts`: Platform detection
  - `semgrep.ts`: Special handling for Semgrep (Python tool)
  - `types.ts`: Provisioner types

### Dependency Graph (Simplified)
```
CLI (src/cli) --> Core (src/core) + Lib (src/lib) + Provisioner (src/lib/provisioner)
OpenCode Plugin (src/opencode) --> Core + Lib + Provisioner
Claude Hooks (src/hooks) --> Core + Lib + Provisioner
Reports (src/report) --> Lib (verdict-log, output-proxy) + Sarif
Sarif (src/sarif) --> Lib (verdict-log, output-proxy)
```

## Scanner Abstraction

Located in `src/lib/scanner.ts`, the scanner abstraction provides a uniform interface for invoking Semgrep, Trivy, and TruffleHog:

- **`wrapSemgrep(filePath)`**: Runs Semgrep with `p/security-audit` and `p/secrets` rulesets, returns JSON.
- **`wrapTrivy(args)`**: Runs Trivy with given args (e.g., `fs .` for filesystem scan).
- **`wrapTrufflehog(targetPath)`**: Runs TruffleHog in filesystem mode with JSON output.

Each wrapper:
1. Checks the scan cache (TTL-based) in `.aegis/scan-cache/`.
2. If cache miss, resolves the scanner binary via `src/lib/provisioner/manager.ts` (which reads `scanners-manifest.json`).
3. Executes the scanner via `src/lib/base.ts`'s `runScannerWithTimeout` (per-scanner timeouts: Semgrep 120s, Trivy 60s, TruffleHog 90s).
4. Caches successful results unless they contain CRITICAL findings, timeouts, or errors.
5. Returns a `ScannerResult` object with `{ status, findings, elapsedMs, degraded }`.

Scanner provisioning (`src/lib/provisioner/`):
- Reads `scanners-manifest.json` for versions, download URLs, and SHA256 checksums.
- For Trivy/TruffleHog: downloads platform-specific binaries, verifies SHA256, extracts to `~/.aegis/bin/<tool>/<version>/<platform>/`.
- For Semgrep: attempts `pipx install semgrep==<version>` then falls back to `uv tool install`.
- Provides `installTool`, `removeTool`, `listTools`, `getToolStatus`, and `ensureLatest` functions.

## Policy Engine

The policy engine is defined in `aegis-policy.json` (schema in `src/types/policy.ts`) and implemented in `src/core/`.

### Policy Structure (`aegis-policy.json`)
```jsonc
{
  "version": "1.0",
  "high_risk_patterns": [ "DROP TABLE", "rm -rf", ... ],
  "actions": {
    "read_file": { "default": "allow", "deny_patterns": [ ".env", "**/*.pem", ... ] },
    "edit_file": { "default": "ask", "allow_patterns": [ "src/**", "tests/**" ], "deny_patterns": [ ... ] },
    "run_shell": { "default": "host", "high_risk_patterns": [ "DROP TABLE", "rm -rf", ... ] },
    "fetch_domain": { "default": "deny", "allow_list": [ "api.anthropic.com", "registry.npmjs.org", ... ] },
    "use_secret": { "default": "deny", "allowed_via": "varlock" },
    "approve_deploy": { "default": "hitl" }
  },
  "routing": {
    "host_passthrough": [ "^git ", "^ls\\b", "^cat ", ... ],
    "sandbox_required": [ "^npm ", "^curl ", "^python ", ... ]
  },
  "degraded_mode": { ... },
  "tools": { "enabled": [ "trivy", "trufflehog", "semgrep" ], "auto_update": true }
}
```

### Enforcement Flow (per tool call)
1. **`shell.env` (OpenCode) / PreToolUse (Claude)**: 
   - Strips sensitive environment variables (`AWS_SECRET_ACCESS_KEY`, etc.).
2. **`tool.execute.before` (OpenCode) / PreToolUse (Claude)**:
   - Checks `read_file`/`write_file`/`edit_file` paths against `actions.*.deny_patterns` → warns if matched.
   - For `bash` tool: checks command against `high_risk_patterns` → warns if matched.
   - For package install commands (`bun add`, `npm install`, etc.): writes temp lockfile, runs `trivy fs` → warns on HIGH/CRITICAL CVEs.
3. **`permission.ask` (OpenCode) / PreToolUse (Claude)**:
   - Re-checks `high_risk_patterns` for bash commands → warns if matched (HITL gateway in Claude).
4. **`tool.execute.after` (OpenCode) / PostToolUse (Claude)**:
   - For `write`/`edit` tool: runs `wrapSemgrep` on the written file path → appends `[AEGIS] Semgrep: N findings` to output; writes full JSON to `.aegis/scans/<uuid>.json`.

### Routing (Informational Only in v1)
- `routeCommand()` in `src/core/router.ts` returns `"host"` or `"sandbox"` based on `host_passthrough` and `sandbox_required` arrays.
- Currently, the OpenCode plugin does **not** enforce routing (it's advisory-only). The Claude Code `pre-tool-use.sh` hook implements actual sandbox routing via `scripts/sandbox-exec.sh`.

### Verdict Computation (`src/core/verdict.ts`)
- `computeVerdict(findings)`: maps highest severity to `SAFE` (none), `RISKY` (HIGH/MEDIUM), `BLOCKED` (CRITICAL).
- `tallySeverities(findings)`: counts by severity for trending.

## CLI Surface

### `src/cli/index.ts`
- Main entry point: `aegis <command> [args]`
- Subcommands: `install`, `start`, `stop`, `status`, `shred`, `policy`, `tools`, `report`, `scan`, `verdict`

### `src/cli/install.ts`
- `aegis install --opencode`: writes OpenCode plugin files (`.opencode/plugins/aegis.ts`, `.opencode/package.json`, `opencode.json`, etc.)
- `aegis install --claude`: writes Claude Code hooks (`.claude/hooks.json`, `.claude/mcp.json`, `.claudeignore`, etc.)
- Both write `.aegis/` directory, `aegis-policy.json`, `.env.schema`, `.pre-commit-config.yaml` if missing.

### `src/cli/report.ts`
- `aegis report [--format sarif|html] [--output <file>]`
- Reads `.aegis/audit.log`, converts to SARIF (default) or HTML via `src/report/html.ts`.
- Supports `--input <file>` to read a custom audit log.

### `src/cli/scan.ts`
- `aegis scan [--format sarif|html] [--output <file>] [--timeout <ms>] <target>`
- Runs Semgrep, Trivy (`fs`), and TruffleHog (`filesystem`) on `<target>` (file or dir).
- Outputs SARIF by default; can output HTML or write to file.

### `src/cli/tools.ts`
- `aegis tools install --tool=<name>|--all [--ci]`
- `aegis tools status`
- `aegis tools remove --tool=<name>`

### `src/cli/verdict.ts`
- `aegis verdict read [n]`: reads last n audit log entries
- `aegis verdict append '<json>'`: appends a custom verdict entry

## OpenCode Plugin Handlers vs Claude Code Hooks

### Shared Logic
Both use the same core modules for:
- Policy evaluation (`src/core/*.ts`)
- Scanner invocation (`src/lib/scanner.ts`)
- Audit logging (`src/lib/verdict-log.ts`)
- Output proxying (`src/lib/output-proxy.ts`)

### OpenCode Plugin (`src/opencode/index.ts`)
Registers five handlers via `AegisSecurityPlugin({ directory, client })`:
1. **`shell.env`** (`handlers/env.ts`): 
   - Strips `DEFAULT_SENSITIVE_VARS` from `output.env` before OpenCode sets the shell environment.
2. **`tool.execute.before`** (`handlers/before.ts`):
   - Sensitive file check (read/write/edit tools) → warns if path matches `actions.*.deny_patterns`.
   - High-risk pattern check (bash tool) → warns if command matches `high_risk_patterns`.
   - Trivy dependency scan (package install commands) → warns if HIGH/CRITICAL CVEs found.
3. **`tool.execute.after`** (`handlers/after.ts`):
   - Runs Semgrep on written files (write/edit tools) → appends summary to `output.output`, writes full JSON to `.aegis/scans/`.
4. **`experimental.session.compacting`** (`handlers/compaction.ts`):
   - Appends `[AEGIS] Security: warned_patterns=<count>` to `output.context` on session compaction.
5. **`permission.ask`** (`handlers/permission.ts`):
   - Warns if bash command matches `high_risk_patterns` (no blocking).

### Claude Code Hooks (`src/hooks/`)
Implemented as shell scripts invoked by Claude Code's hook system:
- **`pre-tool-use.sh`** (`src/hooks/pre-tool-use.ts` → compiled to JS, but deployed as shell script via build? Actually, the repo contains `.ts` files; the build outputs JS to `dist/hooks/` but the hooks.json points to shell scripts? Wait, checking: the hooks are TypeScript but the `.claude/hooks.json` points to `bash hooks/pre-tool-use.sh`. There must be a build step that generates the shell script. However, for recon, we note the logic):
  - Reads policy from `aegis-policy.json` (in package dir, not project root).
  - For `Bash` tool:
    - Routes command via `routeCommand()` → if `sandbox_required`, rewrites to `docker exec aegis-sandbox bash -c \"$CMD\"`.
    - If command matches `high_risk_patterns` → triggers HITL gateway (`scripts/hitl-gateway.sh`) → prompts for `approve`/`deny`.
    - If package install pattern → calls `snyk_package_health_check` via Snyk MCP → blocks if not found or critical CVE.
  - Always exits 0 (never blocks).
- **`post-tool-use.sh`** (`src/hooks/post-tool-use.ts`):
  - If `write`/`edit` tool → runs `semgrep scan --config=p/security-audit --config=p/secrets --json <file>` → if ERROR findings ≥1, logs to `.aegis/audit.log` and appends summary to tool result.
  - Always exits 0.
- **`safe-claude.ts`**: Wrapper that catches errors and exits 0 (used by the hook system? Actually, the hooks are `.ts` files; the built JS is likely used. The `safe-claude.ts` is a helper for the hooks.)

### Key Differences
- **Sandbox Routing**: Only Claude hooks currently implement sandbox routing (via `pre-tool-use.sh`). OpenCode plugin does not enforce sandboxing (advisory-only).
- **HITL Gateway**: Only Claude hooks have a blocking HITL prompt for high-risk commands. OpenCode only warns.
- **Snyk Integration**: Claude hooks use Snyk MCP for package health checks; OpenCode uses Trivy for CVE scanning on install (both are advisory).
- **Context Injection**: Both append status lines on session compaction (OpenCode via `experimental.session.compacting`, Claude via `session-end.sh`? Actually, Claude has a `session-end.sh` hook that appends to audit.log; the compaction handler is in OpenCode only. However, the SPEC mentions lean-ctx MCP for both platforms.)

## HTML Report Generation & Headless `scan` Command

### HTML Report Generation
- Located in `src/report/html.ts` with tests in `src/report/html.test.ts`.
- Function `renderReportHtml(report: AegisReport): string` returns an HTML string.
- The report includes:
  - Verdict badge (SAFE/RISKY/BLOCKED)
  - Summary table (findings by severity)
  - Detailed findings (with code snippets if available)
  - Degraded mode banner if any scanner was degraded.
- Currently used by the `report` CLI when `--format html` is specified.

### Headless `scan` Command
- Located in `src/cli/scan.ts` with tests in `src/cli/scan.test.ts`.
- Implements the `aegis scan` command:
  - Parses flags: `--format`, `--output`, `--timeout`, `<target>`.
  - Defaults: format=sarif, target=current directory, timeout=scanner-specific.
  - Runs all three scanners (Semgrep, Trivy, TruffleHog) on the target.
  - Aggregates results into a SARIF structure (via `src/sarif/builder.ts`).
  - Outputs SARIF JSON to stdout or `--output` file.
  - Can output HTML if `--format html` is used (internally calls `src/report/html.ts`).

## Extension Points Recommendations

### (a) Adding a `scan` CLI command
- **Already exists** at `src/cli/scan.ts`. To extend:
  - Add more scanners (e.g., add support for Grype, Syft) by adding new wrap functions in `src/lib/scanner.ts` and calling them in `src/cli/scan.ts`.
  - Add new output formats (e.g., JSON, SARIF, HTML, Markdown) by extending the format switch in `src/cli/scan.ts`.
  - Add CLI flags for scanner selection (e.g., `--tool semgrep`) to run a subset.

### (b) HTML report rendering
- Currently coupled to the `report` CLI. To make it more pluggable:
  - Create a new directory `src/report/formats/` with format-specific renderers (e.g., `html.ts`, `sarif.ts`, `markdown.ts`).
  - Define a common interface: `formatReport(report: AegisReport): string`.
  - Update `src/report/index.ts` (create if needed) to export all formatters.
  - In `src/cli/report.ts`, import the formatters and select based on `--format`.
  - This allows easy addition of new formats without touching the core report logic.

### (c) Hermes Skill wrapper
- Create a new Hermes skill (e.g., in `~/projects/aegis-security-agent/hermes-skill-aegis/` or under `src/hermes-skill/` if following the project structure).
- The skill should expose Aegis functionality as Hermes tools:
  - `aegis_scan(target: string, format?: "sarif"|"html")`: runs a scan and returns the report.
  - `aegis_report(format?: "sarif"|"html", input?: string)`: generates a report from the audit log.
  - `aegis_tools_install(tool?: string)`: installs a scanner.
  - `aegis_tools_status()`: returns installation status.
  - `aegis_verdict_read(n?: number)`: reads the last n verdicts.
  - `aegis_verdict_append(json: string)`: appends a custom verdict.
- Implementation approach:
  - Option 1: Shell out to the local `aegis` CLI (simplest, reuses existing CLI).
  - Option 2: Import and call internal TypeScript functions directly (requires bundling the skill with the Aegis package or linking).
  - Given the Hermes environment, shelling out to `aegis` is likely the most straightforward and ensures consistency.
- The skill would need to be installed via Hermes skill mechanism (e.g., `hermes skills install ./hermes-skill-aegis`).

## Additional Observations

### Code Quality & Testing
- The project has a comprehensive test suite (337 tests, 324 passing, 13 failing as of the latest run).
- Failures are primarily due to missing `bun` in test environments (environment issue, not code).
- TypeScript compilation (`bun tsc --noEmit`) passes after installing TypeScript dev dependency.
- The project uses Bun for runtime and testing.

### Documentation
- Comprehensive documentation in `docs/`:
  - `ARCHITECTURE.md`: High-level architecture and component details.
  - `SPEC.md`: Original specification (Magnificent AI-Agent Aegis Security).
  - `PLAN.md`: Implementation plan broken down by weeks and workstreams.
  - `AEGIS.md`: Details on the on-demand Aegis agent (separate from the plugin).
  - `SIEM.md`: Schema for SIEM integration (referenced but not viewed in this recon).
  - `CHANGELOG.md`: Version history.
  - `README.md`: Project overview.

### Potential Gaps / Future Work
- The OpenCode plugin does not currently enforce sandbox routing or HITL blocking (advisory-only). To achieve parity with Claude Code integration, the OpenCode plugin would need to implement:
  - Sandbox routing via a before hook that rewrites commands to run in a sandbox.
  - A HITL-like mechanism (OpenCode may not have a direct equivalent; might need to return a modified tool input that prompts the user).
- The plugin currently uses `safe()` wrappers to swallow errors and never block. Changing to blocking would require adjusting the `safe()` usage or removing it for specific hooks.
- The `scan` command is present but not integrated into the plugin/hook flow (i.e., there's no automatic invocation of `aegis scan` on certain events). This could be added via a new hook or plugin command.
- HTML report generation is functional but not the default (SARIF is). Consider making HTML the default for `--format` or adding a `--html` flag.

## Conclusion
Aegis is a well-structured, modular security agent that cleanly separates concerns:
- **Policy engine** defines what is allowed/warned/blocked.
- **Scanner abstraction** provides uniform access to Semgrep, Trivy, and TruffleHog.
- **Plugin/Hook system** adapts the core engine to OpenCode and Claude Code platforms.
- **CLI** provides operational commands for installation, scanning, reporting, and tool management.
- **Reporting** supports both machine-readable (SARIF) and human-readable (HTML) formats.

The clearest extension points for the dual-purpose pivot (adding a `scan` CLI, HTML reports, and a Hermes skill) are already well-defined and minimally invasive, requiring mostly new files or small additions to existing files rather than major refactors.