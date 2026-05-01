# Week 0 Risk Discovery Findings
**Date:** 2026-04-29
**Executor:** Sisyphus (direct shell verification)

---

## W0-01: Varlock Fail-Open/Fail-Closed

**Status:** ❌ INVALID — Varlock is NOT installed on this machine

**Finding:**
```
$ which varlock
varlock not found
$ varlock --help
zsh: command not found: varlock
```

Varlock is not installed. The entire §1B secret-prevention layer (FR-001, FR-002, FR-005) was designed assuming varlock is present.

**Impact on Plan:**
- `harness-preflight.sh` (1B-02) MUST add check #0: `command -v varlock || { echo "ERROR: varlock not installed. Run: brew install varlock"; exit 1; }`
- OR: Replace varlock with a tool that IS available. Candidates: **1Password CLI (`op`)**, **git-secrets**, or a pure shell approach using `grep -E` against `.env.schema @sensitive` fields
- The SPEC §11.1 preflight script assumes varlock — that script cannot be copied verbatim without modification
- **Decision needed from user before 1B-02:** Use varlock (requires installation) or substitute?

---

## W0-02: varlock scan --staged Flag

**Status:** ❌ INVALID — Varlock not installed, flag cannot be verified

**Finding:**
Varlock is not present on this machine so `varlock scan --help` cannot be run. However, this is moot — if the decision from W0-01 is to install varlock, W0-02 can be re-verified post-install. If an alternative tool is chosen, the `--staged` mechanism needs to be adapted to that tool.

**Impact on Plan:**
- Blocked by W0-01 decision. If varlock installed: re-run `varlock scan --help`. If alternative: rewrite preflight §11.1 section to use alternative scanner.

---

## W0-03: Claude Code SessionStart Hook Blocks on Non-Zero Exit

**Status:** ❌ INVALID — SessionStart hooks are DEFERRED and do NOT block startup

**Finding:**
Claude Code changelog explicitly states:
> "Improved startup performance by deferring SessionStart hook execution, reducing time-to-interactive by ~500ms."

This means `SessionStart` runs **after** Claude Code is already interactive — a SessionStart hook that exits 1 does NOT prevent the session from starting. The hard-gate design in SPEC §4D-01 ("Claude Code session does NOT start if pre-flight exits non-zero") is architecturally incorrect.

Additionally, global `settings.json` has zero SessionStart hooks currently registered.

Claude Code IS installed (`~/.local/bin/claude`) and `SessionStart` hook type IS supported — but it fires async/deferred, not as a blocking gate.

**Impact on Plan:**
- `4D-01` as written (register SessionStart → preflight) WILL NOT work as a blocking gate
- **Alternative:** Use `PreToolUse` with a first-call state flag — block all tools until preflight passes
- **OR:** Run preflight in the `harness start` shell command (outside Claude Code entirely) and refuse to launch Claude if it fails: `harness-preflight.sh && claude`
- The simpler and more reliable approach: **`harness start` = run preflight → if exits 0, launch Claude Code; if exits 1, abort before Claude starts**
- This makes the gate external to Claude Code hooks entirely (no dependency on hook blocking semantics)

---

## Summary

**Proceed to Week 1?** ❌ NO — CONDITIONAL on user decision

**Required plan updates before Week 1:**

| # | Update Required | Urgency |
|---|-----------------|---------|
| 1 | **Varlock alternative decision:** Install varlock, or substitute with another secret scanner. This affects 1B-02, 1B-03, and the entire §11.1 script. | BLOCKING |
| 2 | **Hard-gate redesign:** Replace `SessionStart` hook gate with external `harness start` gate (preflight runs before `claude` is invoked). `4D-01` must be rewritten. | BLOCKING |
| 3 | SPEC §11.1 preflight script cannot be copied verbatim — it needs varlock alternative and the gate mechanism changed | BLOCKING |

**What is NOT changed:**
- Docker sandbox (2A) is unaffected
- Semgrep, Snyk, TruffleHog (Weeks 3) are unaffected — these use PostToolUse/PreToolUse which ARE blocking
- HITL gateway (4A) is unaffected — PreToolUse IS blocking (confirmed from existing hook patterns in settings.json)
- lean-ctx (4B), shred (4C) are unaffected
- CLAUDE.md (1C-02), smoke tests (1C-01), repo scaffold (1A) are unaffected

**The core of the harness is still sound. Two targeted fixes needed.**
