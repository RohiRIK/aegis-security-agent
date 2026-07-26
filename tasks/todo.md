# TODO — Multi-language expansion (2026-07-25)

Baseline: 347 pass / 0 fail, `tsc` clean, build OK.

## Task 1 — `custom-patterns` rule family (multi-language)
- [ ] Language tagging on rules (`python` / `powershell` / `shell` / `javascript` / `any`)
- [ ] Extension + shebang language detection
- [ ] Python rules: eval/exec/pickle, os.system, shell=True, verify=False,
      f-string SQL, yaml.load, assert-as-validation, input()
- [ ] PowerShell rules: IEX, -SkipCertificateCheck, ConvertTo-SecureString
      -AsPlainText, plaintext `$Password`, WebClient download-exec,
      Assembly::Load, Run-key persistence
- [ ] Shell rules: pipe-to-shell, `eval "$(curl)"`, predictable /tmp,
      `rm -rf /`, chmod 777/666, unquoted expansion
- [ ] Generic: long base64 blobs, security TODO/FIXME/HACK, disabled-security
      comments

## Task 2 — Built-in scanner families
- [ ] Rename `secrets` → `gitleaks-replacement` (spec-mandated scanner id)
- [ ] `path-traversal`, `hardcoded-ip`, `weak-crypto` retained + widened
      (Python `open()`, `fs.readFile`, encoded traversal)
- [ ] Entropy gate configurable per scanner

## Task 3 — Pipeline integration
- [ ] `scanDirectory()` runs builtin families + optional external adapters
- [ ] Every family emits its own `ScannerRun` (version/status/duration/rules)
- [ ] Scanners run concurrently
- [ ] Unified verdict flow unchanged (SAFE / RISKY / BLOCKED)

## Task 4 — HTML report
- [ ] Severity heatmap bar (proportional, not max-scaled)
- [ ] Scanner summary cards with per-scanner severity bar
- [ ] Fix Guide column (done in WIP — verify)
- [ ] Collapsible finding groups (`<details>`, no JS)
- [ ] Metadata footer: version, duration, files scanned
- [ ] Dark mode via CSS variables + `prefers-color-scheme`

## Task 5 — `aegis-rules.json`
- [ ] Loader with defaults; config entirely optional
- [ ] `exclude_paths` globs honoured by the walker
- [ ] Per-scanner `enabled` / `severity` / `entropy_threshold`
- [ ] CLI: `--scanners`, `--scanner-disable`, `--scanner-enable-all`
- [ ] Documented in README + docs

## Task 6 — Multi-repo verification
- [ ] ~/projects/aegis-security-agent
- [ ] ~/projects/OpenLtm
- [ ] ~/projects/rohi-skills

## Task 7 — Wiring
- [ ] Scanner failure messages name the binary and the reason
- [ ] Tests for every new module
- [ ] `bun test` 0 fail, `tsc` clean, `bun run build` OK
- [ ] `docs/MEGA-EXPANSION.md`
