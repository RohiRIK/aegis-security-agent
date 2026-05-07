# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.17](https://github.com/RohiRIK/aegis-security-agent/compare/v0.1.16...v0.1.17) (2026-05-07)


### Bug Fixes

* strip preflight system — plugin loads instantly, never blocks tool calls ([0c3dc54](https://github.com/RohiRIK/aegis-security-agent/commit/0c3dc5488671458c2199e9d226bde5f5814fa1f1))

## [Unreleased]

## [0.1.17] - 2026-05-07

### Removed
- Entire preflight system — no more `session.created` event handler, no Docker detection, no varlock checks, no subprocess calls at plugin startup
- Shared mutable state (`preflightPassed`, `preflightRan`, `preflightPromise`, `degraded`) from plugin factory
- Preflight gate (polling loop + timeout race) from `tool.execute.before` handler
- `createSessionHandler` and `runDefaultPreflight` from session handler module

### Fixed
- **"Preflight not initialized — tool calls blocked"** can no longer occur — the plugin loads instantly with zero async I/O beyond policy file read
- Plugin factory returns 5 hooks (was 6) — no `"event"` hook registered

### Changed
- `createBeforeHandler` signature simplified: `(policy, client?)` instead of `(policy, getPreflightPromise, preflightPassed, client?)`
- `createCompactionHandler` signature simplified: `(policy)` instead of `(getPreflightStatus, getDegraded, policy)`
- `bootstrapAegisDir` kept as standalone export for `@aegis` agent use

## [0.1.16] - 2026-05-06

### Fixed
- Plugin no longer blocks tool calls when preflight hangs — `safe()` wrapper now always swallows errors (advisory-only mode)
- `tool.execute.before` handler races preflight against a 5-second timeout instead of awaiting indefinitely
- Plugin init survives missing or corrupt `aegis-policy.json` — falls back to empty policy instead of crashing

## [0.1.15] - 2026-05-06

### Added
- 3 enriched security skills with full directory structure (SKILL.md + reference docs + workflows):
  - **AgentTrustBoundaries** — TrustBoundaryPatterns.md, ContextCrushDefense.md, 2 workflows
  - **SecretSafeHandling** — CloudCredentialPatterns.md (AWS/GCP/Azure), SecretHandlingPlaybook.md, 2 workflows
  - **CommandPathSafety** — CommandInjectionPatterns.md (OWASP vectors), PathTraversalAndInstallerSafety.md, 2 workflows
- Installer recursively copies full skill directories (not just SKILL.md)
- `scripts/verify-version-sync.ts` — pre-publish check that all version references match `package.json`
- Version sync step added to CI and release workflows

### Changed
- `package.json` files field: `docs/skills/*/SKILL.md` → `docs/skills` (publishes full skill directories)
- Integration tests verify all 15 skill files install correctly
- ARCHITECTURE.md updated with current deployment map, binary path structure, and version history

## [0.1.14] - 2026-05-04

### Changed
- Agent definition (`agents/aegis.md`) now **always overwrites** on install — must stay in sync with package version.
- Agent permissions switched from restrictive allowlist (`"*": deny`) to permissive denylist (`"*": allow` + block only destructive commands).
- `webfetch` permission changed from `deny` to `allow`.
- Plugin shim changed to **no-op** (observation-only mode: registers no hooks, blocks nothing).
- Advisory-only mode — all enforcement warns instead of blocking.
- ARCHITECTURE.md added with full system documentation.

### Fixed
- Stale `package-lock.json` removed on install to prevent npm reinstalling old intercepting versions.
- `fs.rm(force: true)` used for package-lock cleanup to avoid ENOENT race.

## [0.1.8] - 2026-05-03

### Changed
- Removed Docker sandbox exec intercept — all commands pass through directly on host.
- Plugin shim and `.opencode/package.json` always overwritten on install (version-pinned).
- `block_sandbox_required` changed to `false` in degraded mode default.

### Fixed
- Auto-update `aegis.ts` shim and pin package version on every install.
- Prevent full-session block from preflight failures.
- Added `.trufflehogignore` (always overwritten) to exclude `.git/objects/` and binaries.

## [0.1.7] - 2026-05-03

### Fixed
- Preflight now warns on setup gaps (missing varlock, `.env.schema`, `.pre-commit-config.yaml`) but only blocks on active violations (live secrets in env, staged secrets).
- `rootDir` added to tsconfig for declaration emit in CI.
- CI and release-please workflows retargeted from `master` to `main`.

### Changed
- Renamed `HarnessPolicy` to `AegisPolicy` across codebase.

## [0.1.5] - 2026-05-02

### Added
- Auto-bootstrap `.aegis/` directory at runtime (session start).
- Agent mode set to `all` (available in all contexts).
- Release automation via GitHub Actions (`release.yml`, `release-please.yml`, `ci.yml`).

## [0.1.4] - 2026-05-02

### Fixed
- Installer assets (agent definition, policy, `.claudeignore`) included in npm package `files` field.

## [0.1.3] - 2026-05-02

### Fixed
- Added `--exclude-paths` to TruffleHog command in agent definition.
- Removed workspace artifacts, dead shell scripts, and build output from git.

### Security
- Audit remediation: scanner ignore files, verdict CLI, audit log initialization.

## [0.1.2] - 2026-05-02

### Added
- Automatic scanner provisioning with brew-first strategy.
- Scanner commands added to `host_passthrough` routing.

### Fixed
- Scanner timeout tests stabilized for CI.

## [0.1.0] - 2026-05-02

### Added
- OpenCode plugin hooks for `tool.execute.before`, `tool.execute.after`, `shell.env`, `permission.ask`, and `event` handling.
- Shared command router in `src/core/router.ts` for routing shell commands to the Docker sandbox or host passthrough based on policy.
- Docker sandbox detection in `src/sandbox/detect.ts`, including degraded-mode detection when Docker is unavailable.
- Degraded mode support that allows host-passthrough commands when Docker is unavailable and blocks sandbox-required commands.
- Semgrep SAST scanning on file writes through the PostToolUse hook.
- Trivy dependency scanning on package installs through the PreToolUse hook.
- Preflight session checks that block session start when environment variable leaks are detected.
- `aegis-policy.json` policy configuration for routing patterns, HITL handling, and actions.
- `aegis status` CLI output showing Docker state and routing mode.

### Fixed
- Renamed all Harness references to Aegis.

### Security
- Immutable directives in `CLAUDE.md` to mitigate ContextCrush-style prompt injection and override attempts.
