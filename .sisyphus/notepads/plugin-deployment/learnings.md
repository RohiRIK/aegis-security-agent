# Learnings — plugin-deployment

## [2026-05-02] Session ses_227d9b9c4ffe4m2Dvdgug4kGc9 — Initial context

### Baseline State
- `bun tsc --noEmit` → 0 errors
- `bun test` → 115 pass, 0 fail, 162 expect() calls
- Git HEAD: `5dcdd50` (Wave 2+3 of docker-fallback-routing plan committed)
- Smoke test: 12/12 PASS (Docker OFF → degraded mode confirmed working)

### Key Patterns
- Plugin export is currently `HarnessSecurityPlugin` in `src/opencode/index.ts:48` — must be renamed to `AegisSecurityPlugin`
- `package.json` is currently `03-super-duper-security-agent`, `private: true`, no bin, no exports map — needs full reconfiguration
- `@opencode-ai/plugin` is already in devDependencies
- Token bloat: `src/opencode/handlers/after.ts` does `JSON.stringify(findings, null, 2)` → 150-500 tokens per finding in LLM context
- Command chain bypass: `src/core/router.ts` only checks first token of command string — `&&`/`;`/`|` bypass routing
- Bun is the runtime (bun build, bun test, bun install)

### Architecture Decisions
- Package name: `@aegis/opencode` (scoped npm)
- Version: `0.1.0`
- Single package with dual entry points (plugin + CLI in one npm package)
- Local plugin shim (`.opencode/plugins/aegis.ts`) gives Aegis strongest hook precedence
- Output proxy: full scanner output → `.aegis/scans/{hash}.json`, lean one-liner in LLM context
- `client.app.log()` replaces `process.stderr.write("[AEGIS]...")`
- Compaction hook for security state persistence (≤100 tokens)
- No custom tools in v1 (enforcement stays in hooks only)
- Docker is NOT a hard requirement — degraded mode must work

### Conventions to Follow
- All tests use `bun test` (not jest/vitest)
- Imports use `.ts` extension (not `.js`)
- `Bun.file()` instead of `fs.readFile`
- `node:path` for path joins
- `type: "module"` in package.json (ESM)
- `--target bun --format esm` for bun build
- External: do NOT bundle `@opencode-ai/plugin`

### Must NOT Do
- No custom tools in v1
- No marketing as "complete sandbox" 
- No breaking changes to `aegis-policy.json` format
- No cloud dependencies or telemetry
- Do NOT use `directory` to locate bundled package assets
- Do NOT rely on npm plugin loading alone for enforcement ordering
- No `postinstall` scripts that run automatically

### [2026-05-02] Package manifest publishability update
- `package.json` was reconfigured to `@aegis/opencode@0.1.0` with publishable metadata.
- `@opencode-ai/plugin` moved to runtime `dependencies`; `@types/bun` remains the only `devDependency`.
- `bun install` completed successfully after the manifest update.

## [2026-05-02] Session task-3 — Plugin export rename

### Result
- Renamed the plugin export from `HarnessSecurityPlugin` to `AegisSecurityPlugin` in `src/opencode/index.ts`.
- Kept `HarnessPolicy` unchanged as requested.
- Verified no remaining `HarnessSecurityPlugin` references under `src/`.

### Verification
- `bun tsc --noEmit` passed.
- `bun test` passed: 115 pass, 0 fail.

## [2026-05-02] Session task-4 — Structured OpenCode logging

### Result
- Replaced OpenCode plugin stderr status writes with a shared logger that prefers `client.app.log()` and falls back to stderr when client is unavailable.
- Passed the SDK log payload as `{ body: { service, level, message } }` to match the installed `@opencode-ai/plugin`/SDK types.

### Verification
- `bun tsc --noEmit` passed.
- `bun test` passed: 127 pass, 0 fail.

## [2026-05-02] Session task-4 — Compaction hook wiring

### Result
- Added `src/opencode/handlers/compaction.ts` with `createCompactionHandler()`.
- Wired `"experimental.session.compacting"` in `src/opencode/index.ts` via `safe(compactionHandler as AnyHandler)`.
- Used the plugin hook shape `output: { context: string[]; prompt?: string }` from `@opencode-ai/plugin`.

### Verification
- `bun tsc --noEmit` passed.
- `bun test` passed: 115 pass, 0 fail.
