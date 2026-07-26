# Security Hardening — `feat/dual-purpose-pivot`

Audit of the dual-purpose scanner (`aegis scan`, cloud git-URL targeting, HTML/SARIF
catalog) against the red-team findings and a full diff-vs-`main` review.

Date: 2026-07-24 · Branch: `feat/dual-purpose-pivot` · Auditor: DevSecOps review pass

---

## 1. Red-team findings

### Finding 2 — Symlink-based path traversal in scanner targets — **FIXED**

**Risk:** the scan directory was passed to the scanners as `resolve(target)` without
canonicalization. A symlinked target directory is followed by the scanners at the
top level, so the effective scan root could differ from the operator's intent, and
the catalog `target` field would record the symlink path rather than the real one.

**Fix:** `resolveScanTarget()` now `realpath()`s the resolved local target before it
reaches `confineSubpath()`/the scanners (`src/cli/scan.ts`). `confineSubpath()`
already resolved symlinks under the root when `--subpath` was supplied (Victor's
Finding 4 fix); this closes the no-subpath case so the top-level path is canonical
in both branches. Falls back to the resolved (non-real) path on `ENOENT` so a
missing target still fails cleanly at the `isDirectory` gate.

**Residual (accepted):** `realpath` canonicalizes only the *top-level* path.
Symlinks *inside* the scanned tree that point outside it are a scanner-level
concern — Semgrep, Trivy `fs`, and TruffleHog `filesystem` do not traverse into
symlinked directories by default, so no in-tree escape is reachable through them.
Documented rather than re-implemented as a bespoke walk.

### Finding 3 — Secret persistence in scanner output files — **FIXED (live leak found)**

**Audit:** `output-proxy.ts` (the original concern) is wired only into the hook /
OpenCode paths (`post-tool-use.ts`, `handlers/before.ts`, `handlers/after.ts`), not
into the new `aegis scan` path. The new path writes `report.html` / `report.sarif` /
`verdict.json`, all derived from **normalized** findings, and the TruffleHog
normalizer never copies the raw secret value (asserted by
`security.normalize.test.ts:20`). So far, clean.

**But** the new path calls `wrapSemgrep` / `wrapTrivy` / `wrapTrufflehog`
(`src/lib/scanner.ts`), and each wrapper cached the **full raw scanner stdout** to
`.aegis/scan-cache/{key}.json` via `writeScannerCache`. TruffleHog's `--json`
output embeds the plaintext secret (`Raw`/`RawV2`). `shouldSkipCache` only screens
for the literal `"CRITICAL"` (a Trivy string) — TruffleHog NDJSON contains no such
token, so verified secrets were written to disk in cleartext. This is a direct
violation of the CLAUDE.md "never write real secret values into any file" directive
and was a **live leak**, not the originally-reported one.

**Fix:**
- `wrapTrufflehog` no longer touches the cache at all — it runs the scanner and
  returns the raw result in-memory only (`src/lib/scanner.ts`). The secret never
  reaches disk. Regression test: `scanner.test.ts` → "wrapTrufflehog never caches
  raw stdout (secrets scanner)" asserts the runner is invoked on every call (no
  cache replay).
- Defense-in-depth for the remaining Semgrep/Trivy caches (code snippets, vuln
  detail — sensitive though not secrets): `writeCacheEntry` now `chmod`s the cache
  dir to `0700` and each entry to `0600` (`src/lib/scan-cache.ts`), matching the
  catalog's owner-only posture.

### Finding 5 — Silent failure in dynamic scanner resolution — **VERIFIED ADEQUATE**

`resolveScanner()` still swallows provisioner errors and falls back to the bare
scanner name — correct, because a missing/failed provisioner should degrade to
"try the binary on PATH", not abort. The failure is **not** silent downstream:

- `runScannerWithTimeout` catches a missing binary and returns
  `{ status: "error", degraded: true }` instead of throwing.
- `scanDirectory` collects every degraded scanner into `report.degraded[]`.
- The verdict summary, HTML report (`⚠️ DEGRADED` banner), and `verdict.json` all
  surface the degraded list.
- `getScannerVersionSafe` reports `"unknown"` rather than crashing.

A degraded scanner contributes zero findings, so a repo could read `SAFE` on a
dimension that was never scanned — but that gap is explicitly surfaced in every
output channel, so it is transparent, not silent. **No code change.** (Whether a
degraded scanner should force `SAFE → RISKY` is a policy decision left to the
operator; see Deferred.)

---

## 2. Full-diff hardening review

| Area | Result |
| --- | --- |
| **Command injection (scanner spawn)** | All scanners spawn via `Bun.spawn(argv[])` — no shell. `isGitUrl` screens `` [;&|`$\!] `` (Victor Finding 1). `git clone` uses an argv array; `--branch <value>` consumes the operator value positionally (no option injection); `target` is validated to start with `https?/git/ssh` so it can never begin with `-`. `du -sm <cloneRoot>` uses a mkdtemp path. **No injection surface found.** |
| **HTML escaping** | Every interpolated value passes through `escapeHtml` — repo, target, date, commit, verdict, degraded list, and per-row severity/scanner/ruleId/location/message. Numeric counts and `Math.round(durationMs)` are numbers. The CSS `background: ${color}` reads from a fixed `VERDICT_COLOR` map keyed by the (enum) verdict, never user input. **Complete.** |
| **File perms** | Catalog dir `0700`, files `0600` (unchanged). Clone temp dir `0700`. Scan cache now `0700`/`0600` (new — was default umask). **Not regressed; improved.** |
| **`--allow-untrusted` gate** | Enforced in `resolveScanTarget` before any clone; the git-URL branch returns an error verdict if the flag is absent. Local paths need no gate. No code path clones without the check. **Correctly enforced.** |
| **Path confinement** | `confineSubpath` realpaths root + candidate and requires a `root + "/"` prefix (or exact root) match; rejects escapes with `null` → error verdict. **Sound.** |
| **Temp-clone lifecycle** | `runScan` cleans the clone in `finally`; `cleanupStaleClones` sweeps `aegis-clone-*` older than 24h. Cleanup on clone failure, size-guard trip, and subpath escape all present. **Sound.** |

---

## 3. Fixes committed

1. `src/lib/scanner.ts` — `wrapTrufflehog` no longer caches raw stdout (secret leak).
2. `src/lib/scan-cache.ts` — `writeCacheEntry` restricts cache dir/file to `0700`/`0600`.
3. `src/cli/scan.ts` — `realpath()` the local target before scanning (Finding 2).
4. `src/lib/scanner.test.ts` — regression test locking the no-cache-for-TruffleHog behavior.

Verification: `bun test` → **346 pass / 0 fail**; `bun x tsc --noEmit` clean;
`bun run build` succeeds.

---

## 4. Deferred / accepted risks

- **In-tree symlink following** — scanners skip symlinked subdirectories by default;
  a bespoke pre-walk was not added. Revisit only if a scanner config enables symlink
  traversal.
- **Degraded-scanner → verdict downgrade** — a scanner that fails to run leaves its
  dimension unscanned while the verdict may still read `SAFE`. Surfaced in all
  outputs but not enforced as a downgrade; that is a policy call for the operator.
- **Pre-clone size bound** — `--max-repo-size-mb` is checked *after* `git clone`
  completes (`du -sm`), so a hostile repo can still consume disk/bandwidth during the
  shallow clone. Bounded by `--depth 1` and network; a pre-clone estimate is not
  reliably available from git. Accepted.
