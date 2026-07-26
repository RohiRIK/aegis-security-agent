# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-26

Multi-language built-in scanner engine + dual-purpose pivot. Aegis now carries its own
detection engine: five in-process scanners match Python, PowerShell, Shell, JS/TS and
language-agnostic sinks with no external binary on the box, so a scan degrades gracefully
instead of going quiet when Semgrep or Trivy is missing. Scanner selection, severity and
entropy gates move into a checked-in `aegis-rules.json`, letting a repo tune its own signal
without forking rules. The HTML report gains a severity heatmap, per-scanner detail cards, a
fix-guide column and dark mode. Suite is 676 tests, 0 fail, across 35 files.

### Added
- **5 built-in in-process scanners** — `custom-patterns`, `gitleaks-replacement`, `path-traversal`, `hardcoded-ip`, `weak-crypto` — run regex-based matching directly with no external binary required, configurable per-scanner via `aegis-rules.json` or CLI flags
- **87 polyglot detection rules** (84 pattern rules + 3 path rules, 96 regexes) split across the five families — `gitleaks-replacement` (28), `custom-patterns` (28), `weak-crypto` (15), `path-traversal` (11), `hardcoded-ip` (2). Language-tagged for Python (eval, pickle, os.system, verify=False, f-string SQLi), PowerShell (IEX, SkipCertificateCheck, Assembly::Load), Shell/Bash (pipe-to-shell, curl-pipe-sh, rm -rf /, chmod 777) and JS/TS (child_process.exec, eval, crypto.createCipher weak algos, jwt.verify no-algo); the remaining 62 rules are language-agnostic and reach Go/Ruby/Java/PHP/Rust/C# sinks plus AWS/GitHub/OpenAI/SSH key shapes, JWT, base64 blobs and entropy-gated generic secrets
- **Rules configuration** (`aegis-rules.json`) — per-scanner `enabled`, `severity`, `entropy_threshold`, plus global `exclude_paths`; CLI overrides `--scanner-disable X,Y` / `--scanners X,Y` / `--scanner-enable-all`
- **Enhanced HTML report** (`src/report/html.ts`) — severity heatmap bar (CSS proportional segments), scanner detail cards (name, version, status, duration, finding count), fix guidance column (from `src/report/fix-guide.ts`), dark mode (`@media prefers-color-scheme: dark`)
- **Headless `aegis scan` subcommand** — runs Semgrep + Trivy + TruffleHog against a target directory or git URL, returns unified SAFE | RISKY | BLOCKED verdict with exit codes 0/1/2/3
- **Catalog writer** (`src/report/catalog.ts`) — writes `report.html`, `report.sarif`, and `verdict.json` under `~/.aegis/<Repo>/<YYYY-MM-DD>/<verdict>/`; `AEGIS_HOME` env override
- **TruffleHog normalizer** (`trufflehogToNormalized` in `src/core/security.ts`) — secrets findings now reach SARIF/catalog alongside SAST and CVE results
- **Verdict computation** (`src/core/verdict.ts`) — `computeVerdict()`, `tallySeverities()`, exit-code mapping
- **SARIF builder extraction** (`findingsToSarif` in `src/sarif/builder.ts`) — `eventsToSarif` now delegates to it (behavior-preserving)
- **Git URL scanning** with safety gates — shallow clone (`--depth 1`) into 0700 temp dir, `--allow-untrusted` required, `--branch`/`--subpath`/`--max-repo-size-mb` (default 2048 MB), `finally` cleanup + >24h orphan cleanup
- **Cron automation scripts** (`deploy/cron/aegis-scan.sh`, `crontab.sample`, `targets.conf.sample`) — OS cron wrapper with POSIX `flock` overlap protection, repeatable `--target` or `--config` file, logs to `~/.aegis/cron.log`
- **Cron setup guide** (`docs/CRON.md`) — installation, configuration, notification hooks, log rotation, troubleshooting
- **`getScannerVersionSafe`** in scanner.ts — safe version lookup for report metadata
- **Hardened `runScannerWithTimeout`** — catches `Bun.spawn` failures on missing binaries → degraded (never SAFE-by-omission)
- **676 tests, 0 fail** across 35 files (1556 `expect()` calls, 15 snapshots), TypeScript 7 strict-mode clean (`tsc --noEmit` passes)

### Changed
- `aegis-policy.json` — relaxed to permissive-by-default: `run_shell.default` → `"host"`, `edit_file.default` → `"allow"`, `host_passthrough` → `".*"`, trimmed `high_risk_patterns` to truly destructive commands only, disabled scanners
- `.gitignore` — added `graphify-out/` (Graphify knowledge graph output) and Python artifact patterns
- `ensureLatest` test now hermetic (`_readAutoUpdatePolicy`/`_setAutoUpdateOverride` in manager.ts) — full suite 0 fail
- Policy is permissive-by-default since commit 6f26a17 — `routing.sandbox_required` and `degraded_mode` are legacy/inert
- Plugin/hooks mode descoped — primary mode is headless scanner + cron
- README restructured around two modes (AI-integrated scan + standalone cron) with tested quick-starts

## [0.2.2] - 2026-05-09

> Renumbered from `0.3.0`: this entry was never tagged or published (npm stops at `0.2.1`),
> and `0.3.0` is now the 2026-07-26 scanner release above.

### Added
- `NormalizedFinding` type for per-finding data in scanner events
- `semgrepToNormalized()` and `trivyToNormalized()` converter functions
- SARIF 2.1.0 types and `eventsToSarif()` builder (zero external dependencies)
- `aegis report --format sarif` CLI subcommand (stdout by default, `--output` for file)
- `correlation` field populated on all emitted events (sessionId, toolCall)
- SIEM integration guide (`docs/SIEM.md`) with Vector, Fluent Bit, Splunk, Datadog shipper configs
- Golden snapshot tests for mixed Semgrep/Trivy SARIF output
- `endLine` field on `SemgrepFinding` type (optional, backward-compatible)

### Changed
- `scanner.finding` event evidence enriched with `findings: NormalizedFinding[]`, `detailPath`, `fingerprint`
- `detailPath` from `proxyResult()` now propagated to event evidence in all handlers
- `SemgrepResult` raw type widened with `path` and `end.line` fields

## [0.2.1] - 2026-05-09

### Changed
- `RouteDecision` type simplified from `"host" | "sandbox" | "hitl"` to `"host" | "sandbox"` — high-risk commands now route to sandbox with advisory warning
- Audit log renamed from `.aegis/audit.log` to `.aegis/audit.jsonl` to reflect NDJSON format

### Removed
- `"hitl"` variant from `RouteDecision` — HITL routing fully removed from router
- `approve_deploy` action and `hitl_timeout_seconds` field from `AegisPolicy` type
- `hitl_timeout_seconds` from known/deprecated policy keys — now treated as unknown key

## [0.2.0] - 2026-05-08

### Added
- Unified `AegisEvent` envelope type (`src/events/types.ts`) with `schema: "aegis/v1"`, typed `AegisEventKind` (8 kinds), and `AegisEventSeverity`
- `createEvent()` helper for constructing typed events
- `emitEvent()` for writing NDJSON to `.aegis/audit.log`
- Typed event emission in all OpenCode handlers (before, after, env, permission, session)
- Typed event emission in Claude Code `pre-tool-use` hook
- `validatePolicy()` runtime validation with deprecation warnings and regex syntax checking
- Golden output snapshot tests for all event kinds (`src/events/snapshot.test.ts`)
- Backward-compatible audit log reader: parses both legacy `type: "aegis_verdict"` and new `schema: "aegis/v1"` records

### Changed
- `AegisPolicy` type unified into `src/types/policy.ts` — 3 duplicate definitions eliminated
- `VerdictEvent` now written in `AegisEvent` format (`kind: "scanner.summary"`) with evidence payload
- `appendVerdictEvent` and `readRecentVerdicts` use the new format while reading both old and new
- Claude hooks are now fully audit-only (never block, always exit 0)
- `safeClaude()` error boundary guarantees JSON output even on parse failures

### Removed
- HITL gateway (`src/hitl-gateway.ts`) — deleted entirely
- Sandbox command rewriting — deferred indefinitely, commands pass through unchanged
- `RoutingPolicy` duplicate type — replaced by `Pick<AegisPolicy, ...>`

### Deprecated
- `hitl_timeout_seconds` policy field — ignored with deprecation warning via `validatePolicy()`

## [0.1.18](https://github.com/RohiRIK/aegis-security-agent/compare/v0.1.17...v0.1.18) (2026-05-08)


### Bug Fixes

* release workflow — publish inline on release-please, add manual dispatch fallback ([6d127d3](https://github.com/RohiRIK/aegis-security-agent/commit/6d127d312e9c04fd386c1a50877013029b3d20a1))
* remove all preflight dead code, bump v0.1.18 ([72214d6](https://github.com/RohiRIK/aegis-security-agent/commit/72214d685a6a19255054afee962fe6de3eca1a30))
* skip npm publish when version already exists — prevents false CI failures ([24f52f2](https://github.com/RohiRIK/aegis-security-agent/commit/24f52f2eab9e79603b3ce3aec1a97eccbb0c3051))

## [0.1.17](https://github.com/RohiRIK/aegis-security-agent/compare/v0.1.16...v0.1.17) (2026-05-07)


### Bug Fixes

* strip preflight system — plugin loads instantly, never blocks tool calls ([0c3dc54](https://github.com/RohiRIK/aegis-security-agent/commit/0c3dc5488671458c2199e9d226bde5f5814fa1f1))

## [0.1.18] - 2026-05-08

### Added
- Project logo (`assets/logo.svg`) and wired to README header
- `timeout 300` wrappers on all 6 scanner commands in `docs/agents/aegis.md` with exit-code 124 handling

### Changed
- Rewrote `docs/AEGIS.md` — fixed 7 factual errors, documented timeout/caching/verdict-history/provisioner-CLI/runtime-dirs
- Bumped @aegis agent prompt from "Aegis v1" to "Aegis v2"

### Removed
- All remaining preflight dead code from source: `printPreflightSummary` (ui.ts), T-001/T-002 smoke tests, `preflight` npm script, stale comments and test names referencing preflight
- `src/preflight.ts` deleted entirely

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
