# Summary Letter — AI-Agent Security Harness

**To:** Senior Engineer (peer review)  
**From:** MATISSE  
**Date:** 2026-04-29  
**Re:** What we built, why, and what keeps me up at night  

---

Here's the honest version.

## What this is

A security harness for Claude Code. Not a platform, not a product — a harness. Seven controls bolted around a single agent to prevent the most common ways AI coding agents go wrong: leaking secrets, running unsafe code on the host, installing hallucinated packages, and making irreversible changes without a human in the loop.

The stack: Varlock (secret prevention), TruffleHog (pre-commit secret detection), Semgrep (SAST on generated code), Snyk (SCA on new dependencies), a warm Docker container (execution sandbox), lean-ctx (context compression), and a terminal readline prompt (HITL gateway). That's it. Everything else is Phase 2.

## Why these choices

**Claude Code first, only.** We had research for three platforms (Claude Code, OpenCode, Pi.dev). The critic (Momus) correctly identified that maintaining three separate hook/permission/extension integrations is a maintenance suicide mission for a solo developer. Claude Code has the strongest native hook and permission primitives. OpenCode and Pi get a "future compatibility" section and nothing else.

**lean-ctx, not RTK + context-mode.** Multiple sources recommended stacking shell-output compressors. Momus vetoed it. Stacking overlapping shell hooks is a debugging nightmare. lean-ctx handles both input tokens (file reads) and output tokens (shell results) in one Rust binary with one SQLite DB. One tool, one DB, one source of truth.

**Warm Docker, not ephemeral.** The original PRD said "destroy the container after each call." That's 2-5 seconds of cold-start per agent turn on a laptop. Instead: one persistent container per session, workspace wiped between calls. Same isolation, no cold-start tax.

**readline HITL, not Slack.** The PRD said "Terminal/Slack." Slack requires a bot token, a webhook, network access, and a human watching a channel. A readline prompt in the terminal requires none of that and works offline. The approval schema is JSON so it's machine-readable if you later want to add a UI.

**Custom smoke test, not CyberSecEval.** CyberSecEval 4 is a 1000-case academic benchmark that takes hours to run. A solo developer will not run it. We have 10 targeted tests that run in under 5 minutes and cover every P0 control. CyberSecEval is Phase 2.

## The key open questions

**Varlock fail-open behavior.** This is the #1 risk. If Varlock fails to load (binary missing, schema invalid, plugin error), does the agent fall back to reading the real `.env`? The docs don't say. We mitigated this with a hard-gate pre-flight script that checks for real secrets in the environment before the agent starts — but that's a safety net, not a guarantee. You need to test Varlock's failure modes before trusting it in production.

**Varlock-MCP interaction.** When the Snyk MCP server needs a `SNYK_TOKEN`, does Varlock redact that token before the MCP server process sees it? The research found no documented answer. Current assumption: MCP servers CAN see resolved secrets unless you explicitly isolate them. This needs verification.

**Claude Code SessionStart hook blocking.** The spec assumes a non-zero exit from the `SessionStart` hook blocks the session. This needs to be verified against the Claude Code hooks documentation before Week 1 implementation.

**Snyk MCP tool name.** The spec uses `snyk_package_health_check` based on one research document. Verify against the actual `sammcj/mcp-snyk` README before wiring the PreToolUse hook.

## What I'm confident about

The architecture is sound. The data flow is clean. The Momus vetoes were all correct — the original research was technically thorough but operationally bloated. The spec as written is implementable by one person in four weeks without specialist security engineering knowledge. The smoke test suite gives you a clear pass/fail signal at every milestone.

The hardest part isn't the code. It's the Varlock failure mode question. Get that answered in Week 1.

---

*Total spec: 40 functional requirements, 10 non-functional requirements, 10 smoke tests, 8 open risks.*  
*Momus directives applied: 8/8. Overrides: 0.*
