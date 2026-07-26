# Aegis Security Agent — Architecture Audit & Dual-Purpose Extension Advisory

> Author: Principal DevSecOps review (claude-opus-4-8)
> Date: 2026-07-24
> Branch: `feat/dual-purpose-pivot`
> Scope: whole-repo audit + extension design for (a) headless `aegis scan`, (b) HTML report renderer, (c) `~/.aegis` catalog.

---

## 0. TL;DR

The codebase is well-factored: pure logic in `src/core/` and `src/events/`, side-effecting scanner orchestration in `src/lib/`, and two thin integration shells (`src/opencode/` and `src/hooks/`) on top. The scanner + normalizer + SARIF pipeline is **already** the exact backbone a headless scanner needs — it just has no CLI entry point that runs all three scanners against a target and emits a verdict.

**The dual-purpose design is sound and the extension points are unambiguous and low-risk for the local-directory case.** I recommend proceeding with Stage B for local-path scanning + HTML + catalog, and deferring the *cloud-git-URL* path to a second, clearly-scoped increment (open questions in §6). Command-injection surface is low because every scanner spawn already uses `Bun.spawn(argv[])` (no shell). The main real risks are (1) legacy sandbox-routing dead code, (2) a missing TruffleHog normalizer, and (3) size-guard / untrusted-repo execution policy for the clone path.

---

## 1. Module Boundaries

| Layer | Path | Responsibility | Purity |
|---|---|---|---|
| Policy types | `src/types/policy.ts` | `AegisPolicy` shape + `validatePolicy()` | pure |
| Core logic | `src/core/security.ts` | finding parsers, severity mappers, **normalizers**, install parsing, pattern match | pure |
| Core routing | `src/core/router.ts` | `routeCommand()` host/sandbox decision | pure (but **legacy**, see §5.1) |
| Events | `src/events/types.ts`, `emitter.ts` | typed `AegisEvent` schema + NDJSON append | types pure, emitter I/O |
| SARIF | `src/sarif/builder.ts`, `types.ts` | `eventsToSarif()` — events → SARIF 2.1.0 | pure |
| Scanner runtime | `src/lib/scanner.ts` | `wrapSemgrep/Trivy/Trufflehog`, timeout budgets, caching | I/O (spawn) |
| Scan cache | `src/lib/scan-cache.ts` | content-hash TTL cache under `.aegis/scan-cache` | I/O |
| Provisioner | `src/lib/provisioner/*` | tool resolution/install (brew, binary DL, semgrep pip); `~/.aegis/bin` | I/O |
| Verdict log | `src/lib/verdict-log.ts` | append/read verdicts (dual legacy + `aegis/v1` format) | I/O |
| Output proxy | `src/lib/output-proxy.ts` | lean one-liner summaries + fire-and-forget detail write | I/O |
| CLI surface | `src/cli/index.ts` (+ `install/tools/report/verdict`) | command dispatch | I/O |
| OpenCode plugin | `src/opencode/*` | **active** integration — 5 handlers | I/O |
| Claude hooks | `src/hooks/*` | pre/post-tool-use, stop, safe-claude | I/O |

**Scanner abstraction (`src/lib/scanner.ts`).** `runScannerWithTimeout(argv, budgetMs)` is the single spawn primitive: races `proc.exited` against a `setTimeout`, kills on timeout, returns a typed `ScannerResult {status, exitCode, stdout, stderr, degraded, durationMs}`. `wrapSemgrep(path)`, `wrapTrivy(args)`, `wrapTrufflehog(path)` wrap it with per-scanner budgets and the content-hash cache. **Crucially, `wrapSemgrep`/`wrapTrufflehog` already accept a path that may be a directory** — so whole-tree scanning needs no new spawn code.

**Provisioner (`src/lib/provisioner/`).** `resolveToolPath(scanner)` returns the provisioned binary (`~/.aegis/bin/...`) or `Bun.which()` fallback or `null`; `ensureLatest(scanner)` best-effort auto-updates (gated by `tools.auto_update`, currently `false`). `scanner.ts::resolveScanner()` is the bridge used before every spawn.

**Policy engine (`src/core/` + `src/types/policy.ts`).** `validatePolicy()` warns on unknown/invalid-regex keys and returns a typed policy; `routeCommand()` + `matchHighRiskPattern()` implement the decision logic. Post-pivot the policy is permissive-by-default (`routing.host_passthrough: [".*"]`, `run_shell.default: "host"`) so the *routing* half is effectively inert (§5.1).

**OpenCode handlers vs Claude hooks — duplication.** Both integration shells re-implement the same orchestration on top of the same `core/security.ts` primitives:

| Concern | OpenCode (`src/opencode/handlers/before.ts`) | Claude (`src/hooks/pre-tool-use.ts`) |
|---|---|---|
| sensitive-file check | `checkSensitiveFile` + emit | (not in pre-tool-use) |
| high-risk pattern | `matchHighRiskPattern` + emit | `matchHighRiskPattern` + emit |
| install detect | `parseInstallCommand` + emit | `parseInstallCommand` + emit |
| Trivy on install | `wrapTrivy` on temp lockfile | `trivyScan()` (a *second* temp-lockfile + spawn impl in `security.ts`) |
| routing log | — | `routeCommand` → info event |

The **shared primitives are fine**; the duplication is in the ~40-line event-emitting wrappers and, more importantly, in **two parallel Trivy-on-install implementations** (`scanner.ts::wrapTrivy` used by OpenCode vs `security.ts::trivyScan` used by the Claude hook). That is real, low-grade duplication (see §5.4). It does **not** block the pivot — the headless scanner will use the `scanner.ts` path exclusively.

---

## 2. Cleanest Extension Points

### (a) Headless `aegis scan` subcommand

**Entry.** Add one `case "scan":` to the switch in `src/cli/index.ts::main()` (lines 59–124), mirroring the existing `report`/`tools` lazy-import pattern:

```ts
case "scan": {
  const { runScan, parseScanFlags } = await import("./scan.ts");
  return await runScan(parseScanFlags(args));   // returns 0|1|2|3
}
```

`main()` already returns a number that is passed straight to `process.exit()`, so the 0/1/2/3 exit-code contract needs **no plumbing changes** — `runScan` just returns the right code and swallows its own errors as `3`.

**New file `src/cli/scan.ts`** — signatures:

```ts
export type ScanTarget = { kind: "local"; dir: string } | { kind: "git"; url: string; subpath?: string };
export type ScanFlags = { target: string; subpath?: string; out?: string; noCatalog: boolean; json: boolean };
export function parseScanFlags(args: string[]): ScanFlags;
export async function runScan(flags: ScanFlags): Promise<number>;   // 0 SAFE 1 RISKY 2 BLOCKED 3 ERROR
```

**Reused, unchanged:** `wrapSemgrep(dir)`, `wrapTrufflehog(dir)`, `wrapTrivy(["fs","--scanners","vuln","--severity","HIGH,CRITICAL","--format","json",dir])` from `scanner.ts`; `parseSemgrepFindings` + `semgrepToNormalized`, `trivyToNormalized` from `security.ts`.

**Two small additive pieces required:**
1. `trufflehogToNormalized(stdout, ...)` in `security.ts` — **currently missing** (§5.2). TruffleHog emits NDJSON (one JSON object per verified/unverified secret), not a single JSON doc, so it needs its own parser.
2. `computeVerdict(counts)` — pure verdict function encoding the aegis.md rules (CRITICAL→BLOCKED, HIGH/MEDIUM→RISKY, else SAFE). New `src/core/verdict.ts`.

### (b) HTML report renderer

**New file `src/report/html.ts`** — single pure function, zero deps, no runtime:

```ts
export type ScanReport = {
  repo: string; target: string; date: string; commit: string;
  verdict: "SAFE" | "RISKY" | "BLOCKED";
  counts: { critical: number; high: number; medium: number; low: number; info: number };
  findings: NormalizedFinding[];
  degraded: string[];
  scanners: { name: string; version: string; durationMs: number; status: string }[];
};
export function renderReportHtml(report: ScanReport): string;
```

Pure string builder (self-contained `<style>`, HTML-escaped values). Trivially unit-testable via `expect(html).toContain(...)`. **Do not** pull in a templating dependency — the repo has exactly one runtime dep (`@opencode-ai/plugin`) and should keep it that way.

### (c) `~/.aegis` catalog layout

**New file `src/report/catalog.ts`**:

```ts
export function catalogDir(root: string, repo: string, date: string, verdict: string): string;   // pure path join
export async function writeReportCatalog(report: ScanReport, artifacts: {
  html: string; sarif: string; verdict: unknown;
}, opts?: { root?: string }): Promise<string>;   // returns the written dir
```

Layout: `~/.aegis/<Repo>/<YYYY-MM-DD>/<SAFE|RISKY|BLOCKED>/{report.html,report.sarif,verdict.json}`. Root defaults to `join(homedir(), ".aegis")`, overridable via `opts.root` (for tests) and env `AEGIS_HOME`. **No collision** with the existing `~/.aegis/bin` provisioner dir. `<Repo>` derives from the target basename (local) or the URL repo name (git), sanitized to `[A-Za-z0-9._-]`.

### SARIF reuse — one justified existing-file change

`eventsToSarif(events, version)` internally does events → `NormalizedFinding[]` → results/rules. For scan we already hold `NormalizedFinding[]`. The clean move is to **extract** `findingsToSarif(findings, version, invocation?)` in `src/sarif/builder.ts` and have `eventsToSarif` delegate to it. This is additive to the public surface and behavior-preserving for `eventsToSarif` (snapshot test guards it).

---

## 3. Data Flow for `aegis scan <dir>`

```
resolve target (local dir | git clone→mkdtemp 0700, size guard, subpath)
  → wrapSemgrep(dir) / wrapTrivy(fs args, dir) / wrapTrufflehog(dir)   [parallel, budgeted, cached]
  → parseSemgrepFindings + *ToNormalized  → NormalizedFinding[]
  → tally counts by severity → computeVerdict()
  → findingsToSarif() | renderReportHtml() | verdict.json
  → writeReportCatalog(~/.aegis/<repo>/<date>/<verdict>/)
  → print summary to stderr; return exit code 0|1|2|3
  → finally: cleanup temp clone
```

---

## 4. Is the dual-purpose design the most elegant approach?

**Yes, with one refinement.** The design correctly reuses the existing scanner/normalizer/SARIF spine instead of forking it, and the CLI-shell-out contract (Hermes Skill → `aegis scan`, OS cron → `aegis scan`) keeps Aegis a single source of truth with two thin callers — exactly mirroring the existing plugin-vs-hooks shell pattern. Exit-code + on-disk-catalog is the right headless contract (composes with cron, CI, and any wrapper).

**Refinement:** make the *scan core* a pure-ish orchestrator (`runScanCore(target): Promise<ScanReport>`) separate from the CLI/catalog side-effects, so the Hermes Skill path and the cron path share one tested function and differ only in output plumbing. That is what the `src/cli/scan.ts` + `src/report/*` split above achieves. I would **not** introduce a plugin/daemon or a second config format — the policy file and event schema already cover it.

**One caution (not a blocker):** scanning an **untrusted cloned repo** runs Semgrep/Trivy/TruffleHog over attacker-controlled files on the host. These tools statically analyze (they don't execute the target), so this is acceptable, but per the repo's own sandbox directive the clone-scan path is the natural candidate to run inside `aegis-sandbox`. Recorded as open question §6.1.

---

## 5. Ranked Improvement Backlog

Severity = security/correctness impact. Effort = S(<1h) / M(half-day) / L(multi-day).

| # | Title | Files | Severity | Effort | Risk of fixing |
|---|---|---|---|---|---|
| 5.1 | **Legacy sandbox-routing dead code** — `routeCommand`/`RouteDecision`/`routing.sandbox_required`/`degraded_mode` are inert post-pivot (policy is permissive-by-default; hooks descoped). `route` is only used to emit an info event in `pre-tool-use.ts`. | `src/core/router.ts`, `src/types/policy.ts:12-20,72-86`, `src/hooks/pre-tool-use.ts:41,87` | Medium (confusion/maintenance) | M | Low-Med — touches hook + policy validation; keep `high_risk_patterns` path |
| 5.2 | **Missing TruffleHog normalizer** — `semgrepToNormalized`/`trivyToNormalized` exist; no `trufflehogToNormalized`. Secrets are a headline scanner but never reach SARIF/catalog. | `src/core/security.ts` | High (feature gap for scan) | S | Low — additive pure fn |
| 5.3 | **`any` in handler signatures** — `createBeforeHandler` uses `(input: any, output: any)`; several `as any`-adjacent casts. Defeats type safety on the untrusted-input boundary. | `src/opencode/handlers/before.ts:21-22`, others (9 `any` hits) | Medium | M | Low — types only |
| 5.4 | **Duplicate Trivy-on-install impls** — `security.ts::trivyScan` (Claude hook) vs `scanner.ts::wrapTrivy` (OpenCode). Two temp-lockfile+spawn code paths. | `src/core/security.ts:255-292`, `src/opencode/handlers/before.ts:74-134` | Low | M | Med — behavioral parity needed |
| 5.5 | **`shouldSkipCache` brittle heuristic** — `stdout.includes("CRITICAL")` decides cacheability by substring; false hits on any output mentioning "CRITICAL". | `src/lib/scan-cache.ts:78-84` | Low | S | Low |
| 5.6 | **Error-swallowing hides scanner failures** — `resolveScanner` catch→returns raw name; `getScannerVersion`→"unknown"; scan must *surface* degraded scanners, not hide them. | `src/lib/scanner.ts:15-26,104-124` | Medium (for scan verdict integrity) | S | Low — scan layer reads `status`/`degraded` |
| 5.7 | **Path-traversal / size guard for clone+subpath** (new surface) — subpath must be resolved and confined under the clone root; clone needs a size cap + shallow depth. | new `src/cli/scan.ts` | High (only if git-URL path ships) | M | N/A (new code) |
| 5.8 | **Temp-dir file perms** — `mkdtempSync` dirs are 0700 (good), but files written inside inherit umask. For secret-bearing scan output prefer explicit 0600 and always `rmSync(...,{force:true})` in `finally` (already done in `security.ts`/`before.ts`; replicate in scan). | new scan code; pattern from `src/core/security.ts:261,290` | Low | S | Low |
| 5.9 | **Test gaps** — no tests for a full scan orchestration, no `trufflehogToNormalized`, no HTML render, no catalog path building, no cache-skip edge cases. | `*.test.ts` | Medium | M | Low |

---

## 6. Open Questions (recorded, not guessed)

1. **Untrusted-repo execution policy.** Should the cloud-git-URL scan run scanners inside `aegis-sandbox` (per CLAUDE.md §4) rather than on the host? The existing scanner path runs on host; the local-dir case is trusted, but a clone of an arbitrary URL is not. **Recommendation:** ship local-dir on host now; gate git-URL scanning behind sandbox execution or an explicit `--allow-untrusted` flag.
2. **Size guard threshold & depth.** What clone size cap (e.g. 500 MB) and `--depth` (1?) are acceptable? Needs a product decision; hard-coding a guess is out of scope for Stage B.
3. **Repo identity for catalog `<Repo>`.** Basename of the target dir vs git remote slug vs org/repo. For git URLs the URL repo name is natural; for local dirs the basename may collide across machines. **Assumption used in Stage B:** sanitized basename (local) / URL repo name (git); revisit if collisions matter.
4. **Verdict thresholds vs policy.** aegis.md encodes CRITICAL→BLOCKED, HIGH/MEDIUM→RISKY. Should these be policy-driven (`aegis-policy.json`) rather than hard-coded? Stage B hard-codes the aegis.md rules in `computeVerdict`; making them policy-configurable is a follow-up.
5. **Auto-provisioning on scan.** Should `aegis scan` auto-install missing scanners (`ensureLatest`) or only warn+degrade? Stage B: **warn + mark degraded**, never auto-install during a scan (least surprise for cron).

---

## 7. Stage B Build Plan (what was implemented on this branch)

See "Build Results" below. Scope built: local-directory `aegis scan`, `trufflehogToNormalized`, `computeVerdict`, `findingsToSarif`, HTML renderer, `~/.aegis` catalog writer, unit tests. Git-URL clone path deferred per §6.1/§6.2.

---

## 8. Build Results (Stage B)

### Files added
- `src/core/verdict.ts` — `computeVerdict`, `tallySeverities`, `VERDICT_EXIT_CODE` (0/1/2), `SCAN_ERROR_EXIT_CODE` (3).
- `src/cli/scan.ts` — `parseScanFlags`, `scanDirectory` (pure-ish orchestrator), `runScan` (side-effects + exit code).
- `src/report/types.ts` — `ScanReport` / `ScannerRun`.
- `src/report/html.ts` — `renderReportHtml` + `escapeHtml` (self-contained, zero-dep, XSS-escaped).
- `src/report/catalog.ts` — `writeReportCatalog`, `catalogDir`, `sanitizeRepoName`, `aegisHome` (`~/.aegis`, `AEGIS_HOME` override).
- Tests: `src/core/verdict.test.ts`, `src/core/security.normalize.test.ts`, `src/report/html.test.ts`, `src/report/catalog.test.ts`, `src/cli/scan.test.ts`, plus a degrade case in `src/lib/scanner.test.ts`.

### Existing files changed (each justified, additive)
- `src/cli/index.ts` — new `case "scan"` + help line. Additive dispatch only.
- `src/core/security.ts` — added `trufflehogToNormalized` (§5.2 gap); added optional `file` to `SemgrepFinding` + populated it from `result.path` so directory scans attribute findings to the real file (backward-compatible fallback preserves single-file callers).
- `src/sarif/builder.ts` — extracted `findingsToSarif`; `eventsToSarif` now delegates (behavior-preserving, snapshot-guarded).
- `src/lib/scanner.ts` — added `getScannerVersionSafe`; **hardened `runScannerWithTimeout` to catch `Bun.spawn` throwing on a missing binary** (returns `status:"error", degraded:true` instead of aborting). This resolves backlog §5.6 for the scan path and benefits all existing callers.

### Verification (real output)
- `bun x tsc --noEmit -p tsconfig.json` → **exit 0**.
- `bun run build` → **exit 0** (all bundles + `.d.ts`).
- `bun test` → **336 pass / 1 fail**. The single failure (`ensureLatest › triggers install when tool is outdated`) is **pre-existing and unrelated** — reproduced with all Stage B changes stashed. Root cause: `ensureLatest` reads the real `aegis-policy.json` (`tools.auto_update: false` from commit 6f26a17), so it bails before install and the download spy is never called; the test doesn't stub the policy read. See `tasks/lessons.md`.
- End-to-end: `aegis scan <dir>` on a scanner-less host correctly returns **SAFE / exit 0**, declares `DEGRADED: semgrep,trivy,trufflehog`, and writes `~/.aegis/<repo>/<date>/SAFE/{report.html,report.sarif,verdict.json}`.

### Not built (deferred — see §6)
- Cloud git-URL clone (shallow clone, subpath scoping, size guard, temp cleanup, untrusted-repo sandbox policy). `ScanTarget` was designed as a discriminated union so the `git` variant slots in without reworking `scanDirectory`.
- Backlog §5.1 (legacy sandbox routing), §5.3 (`any` in handlers), §5.4 (duplicate Trivy impls), §5.5 (`shouldSkipCache` heuristic) — left untouched to honor minimal-impact.
