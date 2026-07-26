# Mega Expansion — Multi-Language Built-in Scanners

**Branch:** `feat/dual-purpose-pivot` (8 commits) — merged to `main` as `60d78eb`, released as v0.3.0  
**Date:** 2026-07-25 (merged 2026-07-26)  
**Runner:** Claude Opus 5 (48 turns total, $2.93) + Bob (fixes + finalization)  
**Baseline → Final:** 347 tests → **676 tests** (+329), tsc clean, build OK

> Counts below are verified against `main` at `60d78eb`. Where the original write-up
> quoted Phase 1 numbers, they have been updated to the shipped figures.

## What Was Built

### 1. Multi-Language Pattern Scanner (`src/core/patterns.ts` — 1126 lines)
**87 rules total:** 84 `PATTERN_RULES` + 3 `PATH_RULES`, 96 compiled regexes.

By scanner family (`rule.scanner`):

| Family | Rules |
|--------|-------|
| `gitleaks-replacement` | 28 |
| `custom-patterns` | 28 |
| `weak-crypto` | 15 |
| `path-traversal` | 11 |
| `hardcoded-ip` | 2 |

By language tag (`rule.languages`) — untagged rules run against every file, so a Python
file is matched by 8 + 62 = 70 rules:

| Tag | Rules | Covers |
|-----|-------|--------|
| `python` | 8 | eval/exec/pickle, os.system(shell=True), verify=False, f-string SQL injection, yaml.load, hardcoded DB URIs, flask SECRET_KEY |
| `powershell` | 7 | IEX, -SkipCertificateCheck, plaintext passwords, WebClient download-exec, Assembly::Load, Run-key persistence, ConvertFrom-SecureString |
| `javascript` | 5 | child_process.exec, fs.writeFile(userInput), eval/new Function, crypto.createCipher weak algos, jwt.verify without algo whitelist |
| `shell` | 5 | pipe-to-shell, eval "$(curl)", insecure /tmp, rm -rf /, chmod 777/666, URL-embedded credentials |
| *(untagged / `any`)* | 62 | AWS/GitHub/OpenAI/SSH key patterns, JWT tokens, base64 blobs, entropy detection, security TODO/FIXME/HACK, disabled-security comments, hardcoded IPs, and the Go/Ruby/Java/PHP/Rust/C# traversal + weak-crypto sinks |

Language is resolved from file extension, falling back to shebang.

### 2. Built-in Scanner Engine (`src/core/builtin-scan.ts` — 468 lines)
In-process scanner engine that runs alongside external binaries:
- File extension + shebang language detection
- Configurable caps: maxFileBytes (2MB), maxLineLength (2000), maxMatchesPerRulePerFile (5), maxFindings (2000)
- `SKIP_DIRS` — VCS metadata, virtualenvs, vendored code and build output (`.git`, `.hg`, `.svn`, `.aegis`, `.venv`, `venv`, `env`, `node_modules`, `bower_components`, `vendor`, `site-packages`, `__pycache__`, `.mypy_cache`, `.pytest_cache`, `.ruff_cache`, `.tox`, `dist`, `build`, `out`, `target`, `coverage`, `.next`, …)
- `SKIP_EXTENSIONS` (binary/media/archive) and `SKIP_FILENAMES` (lockfiles: `package-lock.json`, `bun.lock`, `Cargo.lock`, `go.sum`, …)
- Per-rule Shannon entropy gating — gates in use are 2.0, 2.2, 3.0, 3.5, 4.0 (×2) and 4.5; `entropyOverrides` in `aegis-rules.json` replaces the per-rule gate for a whole family
- False-positive guards: test/fixture path exclusions, placeholder-value exclusion, secret-handling invariant (matched values never leave the module)

### 3. Rules Configuration (`aegis-rules.json` + `src/core/rules-config.ts`)
```json
{
  "custom_scanners": {
    "custom-patterns": { "enabled": true, "severity": "high" },
    "gitleaks-replacement": { "enabled": true, "entropy_threshold": 4.5, "severity": "high" },
    "path-traversal": { "enabled": true, "severity": "critical" },
    "hardcoded-ip": { "enabled": false, "severity": "medium" },
    "weak-crypto": { "enabled": true, "severity": "high" }
  },
  "exclude_paths": [
    "node_modules/**", ".git/**", ".opencode/**", "dist/**", "*.min.js", "vendor/**",
    ".aegis/**", ".hermes/**", "src/**/*.test.ts", "docs/**", "tests/**", "scripts/**", "…"
  ]
}
```

The checked-in `aegis-rules.json` at the repo root carries a longer `exclude_paths` list —
it is Aegis's own self-scan configuration, so it also excludes `src/core/patterns.ts`
(the rule table matches itself) and the snapshot/fixture directories.

CLI flags: `--scanners X,Y` (run only these), `--scanner-disable X,Y`, `--scanner-enable-all`

### 4. HTML Report Enhancement (`src/report/html.ts`)
- Severity heatmap bar (CSS proportional colored segments)
- Scanner detail cards (name, version, status, duration, finding count)
- Fix guide column (recommendation per finding type from `src/report/fix-guide.ts`)
- Dark mode (dark background #0d1117 via `@media prefers-color-scheme`)

### 5. External Scanner Adapter (`src/core/external-scanners.ts`)
- Gitleaks (raw secret output — never cached, value-stripped normalization)
- njsscan (Node.js SAST — semantic rules for Express/template injection)

## Pipeline Integration
All scanners flow through one unified `scanDirectory()` → `runScan()` → `computeVerdict()` pipeline:
- External: semgrep, trivy, trufflehog, gitleaks, njsscan
- Built-in: custom-patterns, gitleaks-replacement, path-traversal, hardcoded-ip, weak-crypto
- Each emits ScannerRun with version/status/duration
- Unified verdict unchanged (SAFE/RISKY/BLOCKED)

## Test Suite Growth
| Area | Tests | 
|------|-------|
| Patterns | patterns.test.ts + custom-patterns.test.ts |
| Built-in scan | builtin-scan.test.ts (redaction assertions) |
| External scanners | external-scanners.test.ts |
| Existing tests | All 347 original tests maintained |
| **Total** | **676 tests, 0 fail, 1556 expect() calls, 15 snapshots, 35 files** |

## Security Invariant (Critical)
Secret-handling invariant maintained end-to-end: matched values from regex captures NEVER appear in findings, reports, or logs. The built-in scanner tests explicitly assert this with a `never-copies-secret-value` integration test.

---

## Phase 2: Reviewer Fixes Applied

Three specialist reviews (Leo — coverage gaps, Victor — red-team bypasses, Alex — hardening) produced 10 findings against the Phase 1 expansion. All 10 are addressed below, plus Leo's hardening sprint.

### CRITICAL 1 — scan-cache persisted raw scanner stdout
`src/lib/scan-cache.ts`, `src/lib/scanner.ts`

`shouldSkipCache()` rejected only stdout containing the literal `CRITICAL`, so semgrep and trivy output — which quotes matched source lines — was written to `.aegis/scan-cache/*.json`.

- Caching raw stdout is now **opt-in** through `CACHEABLE_SCANNERS`, and that allowlist is empty: semgrep (`extra.lines`), trivy (secret `Match`) and trufflehog (`Raw`/`RawV2`) all echo source back.
- `shouldSkipCache(result, scanner)` returns `true` for any scanner not on the allowlist, and for a caller that names no scanner at all.
- `readScannerCache()` also refuses non-allowlisted scanners, so entries written by an older build cannot be served back.
- `purgeUncacheableEntries()` deletes those pre-existing entries on the first cache access of a process — stopping new writes does not clear what is already on disk.
- Restoring cache hits means caching *normalized findings* (value already stripped by the normalizer), not adding a scanner to the allowlist.

### CRITICAL 2 — generic API-key rule bypassed by variable naming
`src/core/patterns.ts`

`generic-api-key-assignment` enumerated variable names, so `const token = …`, `const cred = …`, `const appSecret = …` all passed.

- New `high-entropy-string-assignment` (severity `low`, `minEntropy: 4.0`, excludes test/example paths): entropy is the whole filter, name-agnostic. Low by design so operators raise it per repo via `aegis-rules.json` instead of the pipeline eating the noise.
- `generic-api-key-assignment` entropy gate raised 3.2 → 4.0 (Leo).
- **Deviation, deliberate:** a 4.0 bits/char gate silently drops hex-charset keys, whose entropy is bounded by log2(16) = 4.0 — a random 32-char hex key measures ≈ 3.9. A blanket raise would therefore have lost a very common issuance format. New `generic-api-key-hex-assignment` (severity `high`, hex `{32,}`, gate 3.0) keeps that shape covered.

### HIGH 3 — path-traversal rules missed real-world handler shapes
Added `path-build-from-ctx-input`: filesystem sinks taking a path off `ctx.` / `context.` / `request.` — Koa, Fastify, and any destructured handler argument, none of which matched the `req|request` + fixed-property-list pattern.

### HIGH 4 — compressed IPv6 not detected
- Regex now matches all three forms: fully expanded, `::`-compressed with a head, and leading `::`. Lookarounds keep matches from starting mid-token, which is what excludes C++/Ruby scope resolution (`Foo::Bad`) and clock times (`12:34:56`).
- New exported `classifyIpv6()` expands the literal to 8 groups and drops what cannot be a deployment target: `::`, `::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`, `2001:db8::/32`, and any malformed literal the regex swept up.
- **Deviation, deliberate:** the review asked for `2001:0db8:0000:0000:0000:0000:1428:57ab` to be *kept* while also dropping the `2001:db8::` documentation prefix — those are the same address. Consistency won: both forms drop, and the "kept" cases are tested with real routable addresses (`2607:f8b0:4004:800::200e`, `2606:4700:4700::1111`).

### MEDIUM 5 — weak-crypto only knew JS/Python/Ruby/Go
Added `weak-hash-md5-broad` and `weak-hash-sha1-broad`, covering Java MessageDigest.getInstance, the PHP md5 and sha1 builtins, C# MD5.Create / SHA1.Create, and the Rust Md5 / Sha1 types.

### MEDIUM 6 — SVG treated as binary
`svg` removed from `SKIP_EXTENSIONS` in `src/core/builtin-scan.ts`: SVG is XML and can carry `<script>`, data URIs, and credentials.

### MEDIUM 7 — password entropy gate
Accepted as calibrated; `minEntropy: 2.2` documented in place. Real passwords are short and word-like ("Tr0ub4dor&3" ≈ 3.3, "hunter22" ≈ 2.5) — raising the gate trades a whole class of real findings for very little noise.

### LOW 8 — protocol-relative auth URLs
`basic-auth-in-url` scheme prefix is now optional, so `//user:pass@host` is caught.

### LOW 9 — security-todo false positives
`security-todo-marker` now excludes release notes, contributor/security docs, and build output via `DOC_OR_GENERATED_PATH`, which is composed from `TEST_OR_EXAMPLE_PATH.source` so the two cannot drift apart.

### LOW 10 — long-base64-blob uniqueness guard
`long-base64-blob` gained a `classify` that drops blobs built from ≤ 8 distinct characters.

**Correction to the finding as written:** Shannon entropy is bounded by log2(distinct characters), so 4–6 distinct characters top out at ≈ 2.6 bits/char and can never clear the 4.5 gate — the described bypass is not reachable through the default configuration. The guard is still worth having: `entropyOverrides` in `aegis-rules.json` *replaces* the per-rule gate, so an operator who lowers it re-opens exactly this hole. The tests exercise it with the gate lowered to 0.5.

### Hardening sprint (Leo)
- JS/TS injection rules: `js-innerhtml-from-input` (direct assignment *and* concatenation/interpolation — the common shape), `js-document-write`, `react-dangerously-set-inner-html`, `js-eval-on-runtime-value`, `js-child-process-template-string`.
- Multi-language traversal sinks: `go-file-open-from-request`, `ruby-file-read-from-params`, `java-file-from-request-parameter`, `php-file-read-from-superglobal`.
- `js-eval-on-runtime-value` and `js-document-write` skip empty argument lists: `eval()` / `document.write()` with no arguments is prose, and matching it turned rule titles and docs into findings.

### Verification
- `bun test` → **667 pass, 0 fail** at the close of this phase (was 578 before it). On `main` at `60d78eb` the suite is **676 pass, 0 fail** across 35 files.
- `bun x tsc --noEmit` → clean. `bun run build` → clean.
- Self-scan runs end to end, exit 2 / BLOCKED: `C:7 H:96 M:22 L:8 I:4` (baseline `C:7 H:92 M:22 L:6 I:3`). New SVG scanning and the disabled cache path do not crash the run. Part of the working-tree delta is semgrep no longer being served from a stale cache entry, and part is this phase's own test/doc text tripping the new detectors.
- **A/B differential** (old and new binaries against one pristine HEAD worktree, identical input): `94 → 95` findings, the single delta being one `js-eval-on-runtime-value` hit. Every pre-existing finding still reports, CRITICAL count unchanged at 7 — the new detectors are strictly additive, and no rule lost coverage.
- Deliberately vulnerable fixture lines in the test corpus carry the `aegis:ignore` marker, matching the convention already used for the `FAKE` credential fixtures.
