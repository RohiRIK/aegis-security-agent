# Decisions — plugin-deployment

## [2026-05-02] Session ses_227d9b9c4ffe4m2Dvdgug4kGc9 — Plan approved

- Package: `@aegis/opencode` v0.1.0
- Single npm package, dual entry points: plugin at `dist/index.js`, CLI at `dist/cli/index.js`
- `bin: { "aegis": "bin/aegis.js" }` 
- `exports: { ".": { types, import }, "./policy-schema": schema }`
- `main: "./dist/index.js"`, `type: "module"`
- `files: ["dist", "bin"]`
- Local shim at `.opencode/plugins/aegis.ts` re-exports AegisSecurityPlugin (stronger precedence)
- Output proxy writes to `.aegis/scans/{hash}.json` (NOT `.aegis/scan-cache/`)
- Compaction hook: `experimental.session.compacting` with `output.context.push()`
- Structured logging: `client.app.log()` with levels warn/error/info + stderr fallback
- CLI flags: `--force`, `--skip-docker`, `--claude`
- Do NOT overwrite existing `aegis-policy.json`
- CHANGELOG.md follows Keep a Changelog format
