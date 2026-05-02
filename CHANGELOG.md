# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
