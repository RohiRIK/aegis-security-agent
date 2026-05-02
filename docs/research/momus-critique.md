# MOMUS CRITIQUE — Stress-Test of Oracle Research

**Date:** 2026-04-29
**Role:** Momus (Ruthless Critic)
**Project:** Local AI Coding-Agent Aegis Security
**Status:** **CONDITIONAL PASS** (Major scope-reduction required for solo-developer feasibility)

---

## SECTION 1: OVERALL VERDICT

The research body is technically sound but **architecturally bloated**. Oracle has successfully identified the "best-in-class" tools for every niche, but has failed to account for the **operational tax** of a solo developer maintaining this stack. If Matisse implements this verbatim, the user will spend more time managing Docker images, MCP server configurations, and platform-specific adapters than actually coding.

### Critical Findings:
1.  **The Maintenance Trap:** Building for Claude Code, OpenCode, and Pi simultaneously without a unified abstraction is a suicide mission.
2.  **Redundant Context Layers:** The overlap between `lean-ctx`, `context-mode`, and `claude-ltm-plugin` is a recipe for "Context Chaos."
3.  **The "Ghost" Gateway:** The HITL (Human-In-The-Loop) gateway remains a marketing concept with zero technical specification.
4.  **Varlock Risk:** Relying on an unproven, potentially "fail-open" secret layer as the primary defense is a dangerous assumption.

---

## SECTION 2: PER-FILE CRITIQUE

### Oracle 01: Sandbox Comparison
- **Verdict:** PASS
- **Strengths:** Correctly identifies Cloudflare Workers as a mismatch for shell workloads. Rootless Docker is the right local choice.
- **Issues:** 
    1. Assumes "startup depends on host state" without providing a mitigation for the "first-call latency" problem which kills agent flow.
- **Required fixes:** Define a "Warm-Pool" strategy or a "Persistent-but-Isolated" container mode for local dev.

### Oracle 02: Context Management
- **Verdict:** CONDITIONAL PASS
- **Strengths:** Correctly identifies `lean-ctx` as the most versatile tool.
- **Issues:** 
    1. Fails to address the SQLite sprawl. Every tool (lean-ctx, context-mode, ltm-plugin) wants its own SQLite DB.
    2. "Complementary" claim for RTK + lean-ctx is aspirational; stacking shell hooks is a nightmare to debug.
- **Required fixes:** Veto the use of multiple context managers. Pick **ONE** (lean-ctx) and force all memory/compression into it.

### Oracle 03: Platform Integration
- **Verdict:** **REJECT**
- **Strengths:** Honest about the lack of abstraction.
- **Issues:** 
    1. Recommending 3 separate adapters for a solo dev is irresponsible.
    2. Claude Code is the "reference," but the user context mentions OpenCode and Pi as equals.
- **Required fixes:** Matisse must pick **ONE** primary platform (Claude Code) and treat others as "Experimental/Community Contributed."

### Oracle 04: Local Models
- **Verdict:** PASS
- **Strengths:** Correctly identifies the Anthropic-compatibility gap for Claude Code.
- **Issues:** 
    1. Ignores the "Small Model" reality. Most local models (Llama 3 8B) fail at complex tool-calling required for this aegis.
- **Required fixes:** Add a "Model Minimum Requirements" section (e.g., 30B+ parameters for security reasoning).

### Oracle 05: MCP Security
- **Verdict:** PASS
- **Strengths:** Strong alignment with official security best practices.
- **Issues:** 
    1. "Sandbox risky local servers" is easier said than done.
- **Required fixes:** Matisse must specify the *exact* command for sandboxing the Semgrep/Snyk MCP servers.

### Oracle 06: Eval Framework
- **Verdict:** **REJECT**
- **Strengths:** Good identification of CyberSecEval 4.
- **Issues:** 
    1. Too academic. A solo dev will not run a 1000-case benchmark suite.
    2. No "Minimum Viable Eval" (MVE) defined.
- **Required fixes:** Define a 5-minute "Smoke Test" suite that runs on every build.

### Oracle 07: Varlock + TruffleHog
- **Verdict:** CONDITIONAL PASS
- **Strengths:** Clear division of Prevention vs. Detection.
- **Issues:** 
    1. Varlock's "fail-open" behavior is a critical unknown.
    2. No mention of how to handle "False Positives" in TruffleHog without the agent getting stuck in a loop.
- **Required fixes:** Define a "Bypass/Override" protocol for the user.

### Oracle 08: Storage + Permissions
- **Verdict:** PASS
- **Strengths:** Pragmatic rejection of Cedar as a runtime dependency.
- **Issues:** 
    1. "Forensic artifact" warning is good, but no mitigation (like auto-shredding) is proposed.
- **Required fixes:** Add a "Session Shredder" command to the spec.

---

## SECTION 3: CROSS-CUTTING CONCERNS

1.  **Solo-Developer Feasibility:** **CRITICAL RISK.** The proposed stack requires expertise in: Rust (lean-ctx), TypeScript (Pi/Claude hooks), Docker (Sandboxing), Python (Semgrep rules), and Security Engineering. This is too much. 
    *   *Mitigation:* Matisse must prioritize "Off-the-shelf" over "Custom-built."
2.  **The "Context Chaos" Contradiction:** Oracle 02 says use `lean-ctx`, but Oracle 08 discusses `context-mode` and `ltm-plugin` storage. 
    *   *Risk:* The agent will be confused by multiple "sources of truth" for its own memory.
3.  **Docker Operational Burden:** Running a container per agent call is realistic for a cloud provider (E2B), but for a local dev on a laptop, it will drain battery and introduce 2-5s of lag per turn.

---

## SECTION 4: VETOED SECTIONS

1.  **Vetoed:** "Parity across Claude Code, OpenCode, and Pi" (Oracle 03).
    *   *Why:* Maintenance suicide for a solo dev.
    *   *Replacement:* "Claude Code First" architecture with an "MCP-only" path for other platforms.
2.  **Vetoed:** "Stacking RTK + lean-ctx" (Oracle 02).
    *   *Why:* Debugging overlapping shell hooks is a time-sink.
    *   *Replacement:* Use `lean-ctx` for both input and output (it has a shell hook).
3.  **Vetoed:** "CyberSecEval as primary benchmark" (Oracle 06).
    *   *Why:* Too heavy for local dev.
    *   *Replacement:* A custom `security-smoke-test.sh` script.

---

## SECTION 5: GREEN-LIGHT LIST (Direct to SPEC.md)

- **Oracle 01:** Rootless Docker + Seccomp as the local sandbox.
- **Oracle 05:** Stdio-only MCP servers; No token passthrough.
- **Oracle 07:** Varlock for `.env.schema` discipline.
- **Oracle 08:** Fine-grained internal policy manifest (concept only).

---

## SECTION 6: MATISSE DIRECTIVES

1.  **Cut the Fat:** Remove Pi and OpenCode from the "Core Implementation." Move them to "Future Compatibility."
2.  **Consolidate Memory:** Merge `claude-ltm-plugin` logic into the `lean-ctx` MCP server. One binary, one DB.
3.  **Define the Gateway:** Matisse, you MUST specify the HITL Gateway. Is it a `readline` prompt in the terminal? A local `http` server? Pick one and define the schema.
4.  **The "Warm Sandbox":** Specify a persistent Docker container that is "reset" (files wiped) rather than "destroyed" between calls to save latency.
5.  **The Single Most Dangerous Assumption:** **Varlock's stability.** If Varlock fails to load, the agent might see the real `.env`. Matisse must include a "Hard-Gate" check: a script that runs *before* the agent starts to verify no real secrets are in the environment.

**Final Instruction to Matisse:** Build the "Magnificent Minimum." Do not build a security platform; build a security *aegis* that stays out of the way.

---
*Momus has spoken. Vetoes are final.*
