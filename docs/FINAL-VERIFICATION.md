# P3 — Final Integration Verification

**Branch:** `feat/dual-purpose-pivot`
**Date:** 2026-07-24
**Runner:** native bun `~/.bun/bin/bun` (v1.3.13) — *not* snap-bun (see [CRON.md](CRON.md))
**Scope:** integration verification, diff review vs `main`, docs audit, full E2E matrix.

This report closes the P3 task on the `aegis-dual-purpose` board.

---

## 1. Build & Test Suite

| Step | Command | Result |
|------|---------|--------|
| Unit tests | `bun test` | **347 pass / 0 fail** (30 files, 688 expect, 15 snapshots) |
| Typecheck | `bun x tsc --noEmit -p tsconfig.json` | **exit 0** (clean) |
| Build | `bun run build` | **exit 0** |

```
 347 pass
 0 fail
 15 snapshots, 688 expect() calls
Ran 347 tests across 30 files.
```

> Test count rose 346 → 347: a new regression test locking catalog directory
> permissions (see §3, fix #1).

---

## 2. Real Scan — Random Public Repo

Target: **`github.com/sindresorhus/slugify`** (real npm library, not a fixture).

```
$ AEGIS_HOME=/home/rohi/.aegis bun run dist/cli/index.js scan \
    --target https://github.com/sindresorhus/slugify --allow-untrusted
[AEGIS] SAFE — slugify (7c318bd) C:0 H:0 M:0 L:0 I:0
[AEGIS] Report cataloged at /home/rohi/.aegis/slugify/2026-07-24/SAFE
```

- **Verdict:** SAFE — **exit 0**
- **Catalog:** `/home/rohi/.aegis/slugify/2026-07-24/SAFE/`
- **Artifacts written:** `report.html`, `report.sarif`, `verdict.json` (all present, all `0600`)
- Also scanned `sindresorhus/type-fest` (with `--subpath source`) — SAFE, exit 0.

---

## 3. Issues Found & Fixed

Verification surfaced **three real defects** (two security-relevant) plus doc drift.
All fixed on-branch; none are open.

### Fix #1 — Catalog perms leaked repo identity + verdict (security)
`writeReportCatalog` locked only the **leaf** `<verdict>` dir to `0700`; the
intermediate `<root>/<repo>/<date>` dirs stayed at umask default (`0775`).
Because the repo name, date, and **verdict** are encoded in the *directory
names*, any local user could `ls ~/.aegis/<repo>/<date>/` and learn that a repo
scanned **RISKY/BLOCKED** — even though the report contents were locked.

**Fix:** `src/report/catalog.ts` now walks from the leaf up to (and including)
root, chmod-ing every level `0700`. Added a regression test asserting all four
levels are `0700` and all files `0600`.

Post-fix evidence:
```
700 d /home/rohi/.aegis
700 d /home/rohi/.aegis/slugify
700 d /home/rohi/.aegis/slugify/2026-07-24
700 d /home/rohi/.aegis/slugify/2026-07-24/SAFE
600 f .../SAFE/report.html
600 f .../SAFE/report.sarif
600 f .../SAFE/verdict.json
```

### Fix #2 — Manifest path broke after bundling → scanners un-provisionable
`src/lib/provisioner/registry.ts` resolved `scanners-manifest.json` via
`join(import.meta.dir, "../../../scanners-manifest.json")`. Correct from
`src/lib/provisioner` (3 dirs deep), but the bundled `dist/cli/index.js` is only
2 dirs deep, so it overshot to `/home/rohi/projects/scanners-manifest.json`:

```
$ bun run dist/cli/index.js tools status
ENOENT: no such file or directory, open '/home/rohi/projects/scanners-manifest.json'
```

Consequence: `aegis tools status/install` was **fully broken in the shipped
`dist` artifact**, so scanners could never be provisioned → every scan ran
`DEGRADED`. Invisible from `bun run src/...` (source path resolved fine).

**Fix:** resolve by walking **upward** from `import.meta.dir` until the manifest
is found (it ships at package root per `package.json` `files`). Works in both
the source tree and any bundled/installed layout. After the fix:

```
$ bun run dist/cli/index.js tools status
  trivy       not_installed
  trufflehog  not_installed
  semgrep     not_installed
$ bun run dist/cli/index.js tools install --tool=trufflehog --ci
  ✓  trufflehog  /home/rohi/.aegis/bin/trufflehog/3.95.2/linux-x64/trufflehog
```

Provisioning trivy + trufflehog then removed them from the DEGRADED list
(`DEGRADED: semgrep,trivy,trufflehog` → `DEGRADED: semgrep`).

### Fix #3 — `aegis scan --help` scanned cwd; README documented a phantom flag
`scan --help` printed no help — it fell through to a scan of the current
directory (`--target` defaults to `.`, `--help` was ignored). README/CRON.md
also documented a `--format` flag that **does not exist** (only `--json` does),
and `--json` "as an alias for `--format json`".

**Fix:** added a `--help/-h` guard in `src/cli/index.ts` with an accurate
`SCAN_HELP_TEXT` block; corrected `README.md` and `docs/CRON.md` to the real
flag set (`--target/-t, --branch, --subpath, --allow-untrusted,
--max-repo-size-mb, --out/-o, --no-catalog, --json`).

### Doc / hygiene cleanups
- Removed committed junk `deploy/cron/aegis-scan.sh.bak` (stray editor backup).
- `docs/CRON.md`: fixed stale `AEGIS_BIN` default (`bin/aegis` → `bun .../dist/cli/index.js`), removed a duplicate orphan line, replaced the fictional "Output Format / `--format`" section with the real catalog behaviour, and documented that the wrapper's optional `,scanners` field is **not yet wired into `aegis scan`** (all scanners always run).
- `docs/README.md`: indexed the previously-unlisted `SECURITY-HARDENING.md` and this report.

---

## 4. Diff Review vs `main`

`git diff main --stat`: 38 files, +3691 / −238. Reviewed every existing-file
change (those with deletions). **Conclusion: no drive-by refactors; every
existing-file change is justified, documented, and minimal-impact.**

| File | Change | Justification |
|------|--------|---------------|
| `src/lib/scanner.ts` | spawn moved inside `try` | missing-binary now degrades instead of throwing (was the DEGRADED-abort bug); also drops TruffleHog raw-secret caching (Victor finding) |
| `src/core/security.ts` | +`file?` on SemgrepFinding, +`trufflehogToNormalized` | per-finding paths + secret-safe normalizer (never copies raw secret) |
| `src/lib/scan-cache.ts` | +chmod 0700/0600 | cache may hold code snippets/vuln detail |
| `src/lib/provisioner/manager.ts` | extracted `_readAutoUpdatePolicy` seam | hermetic tests |
| `src/sarif/builder.ts` | `eventsToSarif` delegates to `findingsToSarif` | headless path, behaviour-preserving |
| `src/report/catalog.ts` | leaf→root chmod (**this pass**) | perms leak fix |
| `src/lib/provisioner/registry.ts` | upward manifest search (**this pass**) | bundling path fix |
| `src/cli/index.ts` | scan `--help` guard (**this pass**) | documented help |

Everything else is additive (new files: `scan.ts`, `verdict.ts`, `html.ts`,
`catalog.ts`, cron scripts, docs, tests).

---

## 5. Docs Audit

| Doc | Check | Result |
|-----|-------|--------|
| `README.md` | both-mode quick-starts copy-paste | ✅ verified equivalents run (local scan, git-URL, exit codes, snap-bun note all accurate); phantom `--format` removed |
| `docs/CRON.md` | crontab sample + env vars | ✅ fixed `AEGIS_BIN` default, orphan line, Output-Format section |
| `deploy/cron/crontab.sample` | schedule matches CRON.md | ✅ `30 2 * * *` consistent |
| `CHANGELOG.md` | dual-purpose entries | ✅ present under `[Unreleased]` (headless scan, HTML/catalog, TruffleHog normalizer, verdict, git-URL, cron) |
| `docs/README.md` | index complete, no broken links | ✅ all links resolve; added `SECURITY-HARDENING.md` + this report |

Minor known imprecision (not fixed, low impact): README §Cron says `AEGIS_BIN`
may be set "in targets.conf" — that file is a targets list, not an env file; the
cron job's environment is the correct place (also stated in the same sentence).

---

## 6. End-to-End Matrix

| # | Case | Command | Result | Exit |
|---|------|---------|--------|------|
| M1 | local dir → SAFE | `scan --target /tmp/aegis-local-safe` | `SAFE — aegis-local-safe` | **0** ✅ |
| — | local dir → RISKY | cron wrapper on this repo | `RISKY C:0 H:30` | **1** ✅ |
| M2 | git-URL + `--allow-untrusted` → catalog | `scan --target https://github.com/sindresorhus/slugify --allow-untrusted` | catalog written (3 files) | **0** ✅ |
| M3 | git-URL **without** flag → refused | `scan --target https://…/slugify` | `Refusing to scan untrusted remote repo without --allow-untrusted` | **3** ✅ |
| M4 | HTML self-contained | grep generated `report.html` | 1 inline `<style>`, 0 external href/src, 0 stylesheet links, 0 external script | ✅ |
| M5 | HTML XSS escaping | render finding msg `<script>alert('xss')</script>` | output `&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;`, raw absent | ✅ |
| M6 | cron flock overlap | hold lock, re-run wrapper | `Another instance is still running - exiting`, `cron.log` WARNING logged | **1** ✅ |
| M7a | cloud `--branch` | `--branch main` (slugify) | SAFE | **0** ✅ |
| M7b | cloud `--subpath` | `--subpath source` (type-fest) | SAFE, identity `type-fest-source` | **0** ✅ |
| — | `--branch` gate | bogus branch | `Remote branch … not found` | **3** ✅ |
| — | `--subpath` gate | `../../../etc` | `--subpath escapes clone root` | **3** ✅ |
| M8 | file perms | `find ~/.aegis` | catalog dirs `0700`, report files `0600`, root `0700` | ✅ |

**Verdict → exit contract** (`src/core/verdict.ts`, `runScan` scan.ts:392):
`SAFE=0` (live), `RISKY=1` (live cron, H:30), `BLOCKED=2` (unit + `VERDICT_EXIT_CODE`
test — CRITICAL→BLOCKED; live BLOCKED requires a verified secret / critical CVE),
`ERROR=3` (live ×4: invalid target, refused untrusted, bogus branch, traversal).

Cron wrapper live: wrapper exit **1** on RISKY target (verdict propagated),
catalog written under `~/.aegis/aegis-security-agent/2026-07-24/RISKY/`, and:
```
2026-07-24 23:41:22 [2387741] WARNING: Another instance is still running - exiting
```

---

## 7. Open Items

**None blocking.** Documented, non-blocking notes:

1. **Live BLOCKED** not reproduced end-to-end (needs a verified secret or a
   CRITICAL-CVE dependency + trivy DB). Contract proven via unit test +
   `VERDICT_EXIT_CODE` assertion. Low risk.
2. **`semgrep` still DEGRADED** on this host (python-tool; not installed via the
   binary provisioner here). trivy + trufflehog provision and run. Environmental,
   not a code defect — `aegis tools install --tool=semgrep` (pipx/uv) enables it.
3. **Per-target `,scanners` selection** in cron targets files is parsed by the
   wrapper but ignored by `aegis scan` (all scanners run). Documented in CRON.md
   as reserved; wiring it is a future feature, out of P3 scope.

---

## 8. Sign-off

347/347 tests pass, tsc clean, build succeeds. Random public-repo scan succeeds
and catalogs correctly. Full E2E matrix green. Three real defects (two security)
found during verification were fixed on-branch with tests. Docs corrected to
match the real CLI. **P3 can be marked done.**
