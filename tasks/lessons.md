# Lessons — aegis-security-agent

## 2026-07-24 — dual-purpose pivot (Stage B)

- **`bin/aegis.ts` loads `dist/cli/index.js`, not source.** A CLI smoke test via
  `bun run bin/aegis.ts <cmd>` runs the *built* output. Always `bun run build`
  before smoke-testing the CLI binary, or the run reflects stale code. (Testing
  a source function directly, e.g. `import { scanDirectory }`, does hit live src.)

- **`Bun.spawn` throws synchronously when the binary is missing** ("Executable
  not found in $PATH"). It does NOT return a failed process. Any spawn wrapper
  that must degrade gracefully has to `try/catch` the `Bun.spawn(...)` call
  itself. Fixed in `runScannerWithTimeout` — a missing scanner now returns
  `{status:"error", degraded:true}` instead of aborting the whole scan.

- **Typing a spawn result via `let proc: ReturnType<typeof Bun.spawn>` widens
  stdout/stderr to `number | ReadableStream | undefined`** and breaks
  `new Response(proc.stdout)`. Keep the spawn as an inline `const` (inference
  narrows `{stdout:"pipe"}` to `ReadableStream`); wrap the whole body in one
  try/catch rather than annotating a `let`.

- **Pre-existing test failure (NOT introduced by this work):**
  `provisioner/manager.test.ts › ensureLatest › triggers install when tool is
  outdated`. `ensureLatest` reads the real `aegis-policy.json`, where commit
  6f26a17 set `tools.auto_update: false`, so it bails before install and the
  `atomicDownload` spy is never called. The test doesn't stub the policy read.
  Reproduced with all my changes stashed. Out of scope for the pivot; fix is to
  stub `isAutoUpdateEnabled`/policy in the test or gate on an env override.

- **Never copy raw secret values into findings.** `trufflehogToNormalized`
  deliberately drops the `Raw` field; a unit test asserts the secret string
  never appears in the serialized finding (CLAUDE.md §1).

## Bob verification pass (2026-07-24)
- **Always verify subagent self-reports against real runs.** Claude reported "336 pass / 1 fail"; independent `bun test` showed 13 fail under snap-bun, 1 fail under native bun. The delta was environmental, not code — but never trust the summary without reproducing.
- **snap-bun (`/snap/bin/bun`) is NOT interchangeable with native bun (`~/.bun/bin/bun`).** Snap confinement: (a) `/tmp` is mount-namespaced (fixtures invisible to the process), (b) the `home` interface blocks writes to top-level dot-dirs like `~/.aegis`, (c) hook stdin tests fail spuriously. **For this project use `~/.bun/bin/bun`** (put `~/.bun/bin` first in PATH). Cron/systemd must invoke the native bun, not the snap.
- **Interface parity matters:** the `aegis scan --target <path>` flag was specified but `parseScanFlags` only handled positional args. Added `--target`/`-t` + tests. Lesson: E2E-test the exact documented CLI invocation, not just the positional shorthand.
- Pre-existing failure on main: `ensureLatest > triggers install when tool is outdated` (policy `tools.auto_update:false` not stubbed in test). Not introduced by this branch.

## Bob — Phase 1.5 hardening + Phase 2.2 cloud build (2026-07-24)
- **Claude's 2nd run hit the monthly spend limit after 29 turns with zero code changes.** Lesson: don't leave a phase dependent on a rate-limited agent — Bob picked up the bounded work directly. Verify "completed exit 0" actually produced commits/diff before believing it.
- **Fixed the pre-existing `ensureLatest` test (root cause, not workaround):** it read the real `aegis-policy.json` (`tools.auto_update:false`). Extracted `_readAutoUpdatePolicy()` + `_setAutoUpdateOverride()` seam in `manager.ts`; test forces the flag hermetically in `beforeEach`. Full suite now 0 fail.
- **Hardened catalog perms (was 664/775 umask):** scan output can contain TruffleHog secret findings → now `report.*` are 0600, catalog dirs 0700 in `catalog.ts`.
- **Path traversal already safe:** `sanitizeRepoName` strips `/` (verified `../../etc` → `..-..-etc`). Subpath confinement added via `confineSubpath` (rejects escapes).
- **Built Phase 2.2 cloud git-URL scanning:** `isGitUrl`, `repoNameFromUrl`, `resolveScanTarget` in `scan.ts`. Shallow clone (`--depth 1`) to `mkdtemp(0700)`, `--branch`, `--subpath` confinement, `--max-repo-size-mb` guard (default 2048), temp cleanup in `finally` (incl. failure), `cleanupStaleClones` for >24h orphans. **Gated behind `--allow-untrusted`** — refused without it (untrusted code on host). E2E verified vs github.com/octocat/Hello-World + subpath slug naming.
- **Spawn bug caught by E2E:** `runCommandCapture(["clone",...])` missing the `git` argv[0] → "Executable not found". E2E against a REAL remote is the only thing that catches this — unit tests mocked the spawn.
