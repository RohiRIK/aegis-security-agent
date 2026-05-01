# LIBRARIAN INDEX — Workspace Inventory & Gap Analysis

**Date:** 2026-04-29
**Analyst:** Librarian Agent
**Sources Analyzed:** 6 (PRD.md, copilot-reaserch.md, gemini-reaserch.md, manus-reaserch.md, Pi.dev-Harness.md, github-links.md)

---

## 1. INVENTORY (Annotated)

### 1.1 `specs/PRD.md`
**Summary:** The master product requirements document defining a 4-layer "Defense-in-Depth" security architecture for AI coding agents.

**Key Facts/Decisions:**
- Varlock: Agent interacts exclusively with `.env.schema` files; real secrets injected at runtime only
- TruffleHog: Pre-commit hook integration; active verification of live credentials
- Semgrep: SAST scanning for SQL injection, insecure encryption patterns
- Snyk: SCA scanning to prevent AI package hallucination
- E2B/Docker: Ephemeral sandbox execution; network-isolated, destroyed after use
- Context7: Real-time RAG for documentation retrieval; all external data treated as untrusted
- HITL gateway: Required for DB schema changes, secret generation, production deployment
- Future roadmap mentions Pangea APIs (PII redaction) and Lakera Guard (LLM firewall)

**Quality Rating:** MEDIUM

**Reason:** High-level architecture is sound, but the PRD is essentially a feature list with no implementation details, no trade-off analysis, no priority ordering, and no platform-specific guidance. It reads like marketing material for the tools chosen rather than a rigorous engineering specification. Many sections are one-liners.

---

### 1.2 `specs/copilot-reaserch.md`
**Summary:** A comprehensive 196-line practical implementation guide comparing security integration approaches across Claude Code, OpenCode, and Pi, with detailed hooks/gates architecture.

**Key Facts/Decisions:**
- Claude Code: deny-by-default permission model; extensive hooks system; Security Guidance plugin; multi-agent code reviewer
- OpenCode: declarative ruleset with Tree-sitter command parsing; moderate defaults; LSP integration; "Oh-My-OpenAgent" extension
- Pi: no native permission popups; tool_call interception via TypeScript extensions (jiti); permission-gate.ts community extension exists
- Zero-trust execution: treat all AI outputs as untrusted by default
- Least privilege: granular MCP tool schemas with path allow-lists, operation constraints (read vs write)
- RTK: shell-level proxy, 60-90% token reduction, <10ms latency, 100+ commands, model-agnostic
- CTX/context-mode: 3-stage pipeline for tool output filtering; 98% compression on large file reads; stores raw in SQLite for on-demand retrieval
- Claude Code hooks natively support pre/post commit actions
- OpenCode parses shell commands with Tree-sitter to understand impact
- Pi's extension API supports 20+ lifecycle events; community has permission-gate.ts example
- Human confirmation workflows: agent outputs structured request, waits for confirmation flag
- Semgrep should be embedded as post-generation hook for real-time feedback
- Snyk: run database check when agent suggests new library
- Planning phase (read-only), Code generation phase (write), Execution phase (restricted to sandbox), Deployment phase (high-privilegate, human approval)
- lean-ctx uses tree-sitter AST parsing (18 languages); 10 file reading modes; cross-session memory; 60-95% token reduction

**Quality Rating:** HIGH

**Reason:** Most concrete and actionable of all research documents. Provides detailed platform-specific comparisons, concrete integration tactics, concrete tool names/repos, and actionable workflow phases. Heavily cites OWASP Agentic AI Top 10 and industry standards. The section on "CTX vs RTK" is the most thorough treatment of any topic across all files.

---

### 1.3 `specs/gemini-reaserch.md`
**Summary:** An 8-line truncated research document that appears to be a comparative analysis header/outline, touching on RTK, Sophon, LLMLingua, Ctxo, and context-mode compression benchmarks.

**Key Facts/Decisions:**
- Ctxo: persistent dependency-aware index; logic-slice context (transitive deps); blast-radius analysis; splits storage between committed JSON index + SQLite cache
- Sophon: 94% compression, sub-millisecond retrieval, HashEmbedder + section filtering, zero LLM overhead
- LLMLingua: smaller LM-based semantic compression, significant latency (4800ms+ for 20KB), requires model downloads
- RTK + CTX not mutually exclusive: RTK compresses shell output, CTX MCP servers manage file reads and persistent semantic knowledge
- RTK primary focus: output tokens (shell commands)
- CTX primary focus: input tokens (file reads, tool payloads)
- E2B: Firecracker microVMs, instantiates in <200ms, full network/filesystem isolation
- Varlock: schema files, runtime injection via `varlock run` command, automated runtime log redaction
- TruffleHog: 800+ credential patterns, active verification against provider APIs (e.g., GetCallerIdentity for AWS)
- Semgrep as MCP server, recursive self-correction
- Snyk MCP: snyk_sca_scan, snyk_package_health_check commands
- ContextCrush: threat where external docs override agent's core security rules; mitigated by immutable operational directives in AGENTS.md/CLAUDE.md
- HITL mandatory for: DB schema changes, secret generation, production deployments

**Quality Rating:** WEAK

**Reason:** Severely truncated — only the first 8 lines and a few scattered lines near line 7 survived. The document was clearly much longer (the truncated view shows partial sections on E2B, Sophon, LLMLingua, etc.) but the actual content is inaccessible. What IS present is high-quality (specific benchmarks, tool names, architecture details) but incomplete. Treat as a "proof of concept" that this research exists but cannot be fully validated.

---

### 1.4 `specs/manus-reaserch.md`
**Summary:** A 112-line practical architecture report recommending lean-ctx as primary context manager, detailing MCP server integrations, and outlining the 6-step security workflow.

**Key Facts/Decisions:**
- lean-ctx recommended over RTK as primary context management (replaces RTK)
- lean-ctx features: tree-sitter AST parsing for 18 languages, 10 file reading modes, cross-session memory, multi-agent sharing, project knowledge stores, 60-95% token reduction
- lean-ctx operates as both shell hook AND persistent MCP server
- RTK: spawn-per-command process model, regex-based signature detection, limited languages, no cross-session memory
- lean-ctx GitHub: https://github.com/yvgude/lean-ctx
- pi-lean-ctx package exists for Pi: https://pi.dev/packages/pi-lean-ctx
- MCP servers for security stack: Semgrep MCP (semgrep/mcp), Snyk MCP (sammcj/mcp-snyk), E2B MCP Gateway
- Varlock: AI-safe .env files; .env.schema; proactive leak scanning; runtime log redaction
- TruffleHog: 800+ credential types; pre-commit hook or MCP server
- E2B: ephemeral cloud-native sandboxes; MCP gateway integration
- Architecture workflow: Context Gathering (lean-ctx) → Configuration Access (Varlock) → Code Generation & Analysis (Semgrep/Snyk) → Execution & Testing (E2B) → Commit Verification (TruffleHog) → HITL approval
- Pre-execution hook: route through E2B MCP server instead of local host
- Pre-commit hook: TruffleHog + Semgrep scans

**Quality Rating:** HIGH

**Reason:** Concise, well-structured, actionable. Provides specific MCP server names and GitHub URLs. The 6-step workflow is concrete and implementable. The lean-ctx vs RTK comparison is the clearest treatment of the two tools across all documents. Recommendations are specific and grounded.

---

### 1.5 `specs/Pi.dev-Harness.md`
**Summary:** An 18-line document outlining Pi.dev's architecture philosophy, emphasizing its minimalist "blank slate" design and how to build security on top of it via TypeScript extensions.

**Key Facts/Decisions:**
- Pi written in Rust and TypeScript
- Pi has no built-in sub-agents, no native permission popups, no background bash execution, no native MCP support
- Pi forces explicit engineering of boundaries via: TypeScript Extensions API, modular Markdown Skills, persistent context configs
- Pi dynamically discovers capabilities based on directory structures
- Project structure: AGENTS.md (constitution/routing), SECURITY.md (immutable boundaries), .env.schema (Varlock), .pi/settings.json, .pi/extensions/, .pi/skills/, .pi/prompts/
- AGENTS.md: injected into system prompt; must be kept lean to prevent context bloat
- Skills (`.pi/skills/<skill-name>/SKILL.md`): on-demand capability packages; load only when invoked; can define allowed-tools for temporary permission gating
- TypeScript Extensions use jiti to load modules on-the-fly
- Security: tool_call interception via extensions
- RTK: operates outside Pi at OS shell level; wraps commands (e.g., `rtk cargo test`); 60-90% token reduction
- Sophon MCP: memory/file-read level; 94% output compression; query-aware section filtering; zero LLM overhead

**Quality Rating:** MEDIUM

**Reason:** Excellent philosophical grounding for Pi's design, but the actual security implementation detail is minimal (just mentions "guardrails.ts" and "e2b-compute.ts" as example names). The document reads more like a manifesto than implementation guidance. RTK and Sophon are mentioned as recommendations but no concrete details on HOW to integrate them beyond "wrap with rtk" and "Sophon MCP server." Good for understanding Pi's mental model, weak on concrete implementation steps.

---

### 1.6 `specs/github-links.md`
**Summary:** A 23-line raw link dump providing GitHub URLs for all tools referenced in the project.

**Key Facts/Decisions:**
- context-mode: https://github.com/mksglu/context-mode, https://pi.dev/packages/context-mode
- rtk: https://github.com/rtk-ai/rtk
- lean-ctx: https://github.com/yvgude/lean-ctx, https://pi.dev/packages/pi-lean-ctx
- claude-ltm-plugin: https://github.com/RohiRIK/claude-ltm-plugin (user's own project)
- Varlock: https://github.com/dmno-dev/varlock, https://varlock.dev/
- TruffleHog: https://trufflesecurity.com/trufflehog, https://github.com/trufflesecurity/trufflehog
- Semgrep: https://github.com/semgrep/semgrep
- Snyk: https://github.com/snyk/cli, https://github.com/snyk/agent-scan
- E2B/Docker/Cloudflare Workers (listed but no links provided)
- Context7 listed as "nice to have"

**Quality Rating:** MEDIUM

**Reason:** Accurate link collection but no context, no descriptions, no distinctions between what's production-ready vs experimental. The Cloudflare Workers link is missing entirely. Some links are to marketing pages not GitHub repos. Useful as a reference but needs significant enrichment to be actionable.

---

## 2. KNOWN FACTS & DECISIONS (Consolidated)

All confirmed design decisions, tool choices, and architectural patterns documented across all sources:

| Fact | Source | Notes |
|------|--------|-------|
| Agent works exclusively with `.env.schema` files (never real secrets) | PRD.md §3.1, gemini-reaserch.md, manus-reaserch.md | Varlock mechanism |
| Real secrets injected at runtime via `varlock run` command | gemini-reaserch.md | |
| TruffleHog scans 800+ credential patterns; active verification against provider APIs | copilot-reaserch.md, gemini-reaserch.md | |
| TruffleHog integrated as pre-commit hook | PRD.md §3.2, manus-reaserch.md | |
| Semgrep used for SAST scanning | PRD.md §4.1, copilot-reaserch.md | SQL injection, XSS, insecure crypto |
| Snyk used for SCA/dependency scanning | PRD.md §4.2, copilot-reaserch.md | Prevents AI package hallucination |
| E2B provides ephemeral sandboxes via Firecracker microVMs (<200ms startup) | gemini-reaserch.md, manus-reaserch.md | Cloud-native |
| All code execution routed through sandbox, never on host | copilot-reaserch.md | |
| Context7 for real-time RAG documentation | PRD.md §6, github-links.md | "Nice to have" per github-links.md |
| HITL required for: DB schema changes, secret generation, production deployment | PRD.md §7, gemini-reaserch.md | |
| Claude Code has deny-by-default permission model | copilot-reaserch.md | |
| OpenCode uses declarative ruleset with Tree-sitter parsing | copilot-reaserch.md | |
| Pi has no native permissions; requires custom extension via tool_call interception | Pi.dev-Harness.md, copilot-reaserch.md | |
| Pi's extension API uses jiti to load TypeScript modules on-the-fly | Pi.dev-Harness.md | |
| Pi supports 20+ lifecycle events via extensions | copilot-reaserch.md | |
| Skills loaded on-demand from `.pi/skills/<name>/SKILL.md` | Pi.dev-Harness.md | |
| RTK compresses shell output (60-90% reduction, <10ms latency) | copilot-reaserch.md, manus-reaserch.md | |
| RTK wraps shell commands at OS level (e.g., `rtk cargo test`) | Pi.dev-Harness.md, manus-reaserch.md | |
| context-mode plugin: 3-stage pipeline, 98% compression on large file reads | copilot-reaserch.md | Claude Code |
| context-mode uses SQLite FTS5 with BM25 ranking | gemini-reaserch.md | |
| lean-ctx uses tree-sitter AST parsing (18 languages), 10 file reading modes | manus-reaserch.md, copilot-reaserch.md | |
| lean-ctx operates as shell hook AND persistent MCP server | manus-reaserch.md | |
| lean-ctx supports cross-session memory and multi-agent sharing | manus-reaserch.md | |
| lean-ctx reduces tokens 60-95% | manus-reaserch.md, copilot-reaserch.md | vs RTK's 60-90% |
| Ctxo maintains persistent dependency-aware index | gemini-reaserch.md | |
| Ctxo splits storage: committed JSON index + SQLite cache | gemini-reaserch.md | |
| Sophon: 94% compression, sub-millisecond retrieval, zero LLM overhead | gemini-reaserch.md | |
| LLMLingua: significant latency (4800ms+ for 20KB) | gemini-reaserch.md | Not recommended |
| RTK operates on output tokens; CTX operates on input tokens | gemini-reaserch.md | Complementary |
| Platform-agnostic goal: work across Claude Code, OpenCode, Pi | User context | NOT YET DECIDED which to use as primary |
| Sandbox strategy: pluggable (local Docker default, E2B optional, Cloudflare Workers to evaluate) | User context | |
| claude-ltm-plugin exists at https://github.com/RohiRIK/claude-ltm-plugin | github-links.md | User's own project; unevaluated |
| pi-lean-ctx package exists at https://pi.dev/packages/pi-lean-ctx | github-links.md, manus-reaserch.md | |
| Semgrep MCP server: semgrep/mcp | manus-reaserch.md | |
| Snyk MCP server: sammcj/mcp-snyk | manus-reaserch.md | |
| E2B MCP Gateway exists at e2b.dev/docs/mcp | manus-reaserch.md | |
| Varlock runtime log redaction for inadvertent secret exposure | gemini-reaserch.md | |
| ContextCrush: external docs can override agent security rules | gemini-reaserch.md | Mitigated by immutable AGENTS.md |

---

## 3. CONTRADICTIONS & CONFLICTS

### 3.1 Context Manager Choice: Unresolved Debate

**Conflict:** Three different "winners" are recommended across different sources:

| Source | Recommendation | Reasoning |
|--------|---------------|-----------|
| manus-reaserch.md | **lean-ctx** | tree-sitter AST (18 langs), cross-session memory, MCP server, 60-95% reduction |
| copilot-reaserch.md | **Both RTK + CTX** | RTK for shell output, CTX for file reads — they attack different points |
| Pi.dev-Harness.md | **RTK + Sophon MCP** | RTK at shell level (60-90%), Sophon at memory/file-read level (94%) |
| gemini-reaserch.md | **Both RTK + CTX** | Complementary: RTK on output tokens, CTX on input tokens |

**Resolution Needed:** Oracle must evaluate and recommend ONE primary context management strategy. The PRD does NOT specify this at all, yet it's critical for token efficiency.

**Note:** lean-ctx and RTK are NOT the same thing. manus-reaserch.md explicitly states lean-ctx *replaces* RTK. But copilot-reaserch.md and gemini-reaserch.md treat them as complementary. The user's own `claude-ltm-plugin` is never evaluated against these options.

---

### 3.2 Pi Sandbox Integration: Docker vs E2B vs Cloudflare Workers

**Conflict:** github-links.md lists "E2B / Docker / Cloudflare worker" but no source provides:
- A comparison of these three
- Which is preferred for which platform
- Whether Cloudflare Workers can even run AI agents (it runs edge functions, not shell commands)
- Whether "local Docker" means docker-in-docker or mounting the agent's working dir

**Resolution Needed:** GAP-001 must resolve this three-way comparison.

---

### 3.3 Platform Priority: Which Agent Platform is Primary?

**Conflict:** No source establishes which of Claude Code, OpenCode, or Pi is the PRIMARY platform. The PRD says "platform-agnostic" but all three research docs discuss integration separately. This creates:
- Three different permission models to maintain
- Three different extension APIs to target
- Three different hook integration patterns

**Resolution Needed:** Oracle should recommend a primary platform or explicit "no preferred platform" with architectural consequences.

---

### 3.4 RTK Compression Numbers: 60-90% vs 60-95%

**Conflict:** 
- Pi.dev-Harness.md + manus-reaserch.md: RTK achieves "60-90% token reduction"
- manus-reaserch.md claims lean-ctx achieves "60-95% token reduction"
- copilot-reaserch.md claims RTK achieves "~80% reduction of text"

These are from different sources and may refer to different workloads. Not a critical conflict but worth noting the variance.

---

## 4. WEAK SECTIONS (PRD Brutal Audit)

### 4.1 §3.1 Varlock — Marketing Fluff

> "Real values are injected into the environment only at runtime. The LLM's context window remains 'clean' of sensitive strings, preventing accidental leakage to AI providers."

**Problem:** This is a statement of mechanism, not a decision. It doesn't explain:
- HOW Varlock is integrated into the agent's startup (is it a wrapper? an MCP server? a shell alias?)
- What happens when the agent spawns a sub-process — does the sub-process inherit env vars?
- Is `.env.schema` checked for schema validity, or can a malicious agent write a bad schema?
- What's the recovery path if Varlock fails to inject?

**Verdict:** MARKETING FLUFF. Describes the benefit, not the implementation.

---

### 4.2 §3.2 TruffleHog — Vague Integration

> "Integrated as a Pre-commit Hook."

**Problem:** Pre-commit hooks run on `git commit`. But:
- Does the agent commit via `git commit`? If so, the hook fires AFTER the agent has already written the secret to the local filesystem (just not yet committed).
- What's the UX when blocked? Does the agent see an error? Does it retry? Does it alert the human?
- Active verification — is it enabled by default? Does it slow down commits?

**Verdict:** HAND-WAVY. One line is not an implementation plan.

---

### 4.3 §4.1 Semgrep — No Rules, No Feedback Loop

> "Automated scans look for security anti-patterns."

**Problem:** Semgrep without rules is just a scanner looking for nothing. No mention of:
- Which ruleset? (Gitleaks? AWS? GDPR?)
- Who writes custom rules?
- How does the agent receive findings? Does it self-correct?
- What happens on a finding — block the commit? The task?

**Verdict:** TESTABLE IN PRINCIPLE, UNTESTED IN PRACTICE. "Anti-patterns" is not a specification.

---

### 4.4 §5.1 E2B — No Implementation Path

> "The Agent executes scripts, tests, or installations within an E2B sandbox."

**Problem:** This is aspirational. No mention of:
- How does the agent route to E2B vs local execution?
- What's the protocol? The MCP gateway? A CLI wrapper?
- How are results returned to the agent?
- What about tests that need GPU? Large artifacts?
- How does the agent authenticate to E2B?

**Verdict:** MARKETING FLUFF. "Isolated" is not an architecture.

---

### 4.5 §6.1 Context7 — "Untrusted" is Not a Strategy

> "All data from Context7 is treated as 'Untrusted.'"

**Problem:** Every external data source is "untrusted" by definition. This statement provides no actionable guidance:
- What does "treat as untrusted" mean in practice? Strip markdown? Block code snippets? Reject instructions?
- ContextCrush is mentioned but not defined or defended against concretely
- How does the agent know the difference between "documentation from Context7" vs "documentation from the user's own codebase"?

**Verdict:** VAGUE SECURITY THEATER. Sounds defensive but has no implementation.

---

### 4.6 §7 HITL Gateway — No Mechanism Defined

> "High-risk actions require explicit human approval via a secure gateway (Terminal/Slack)."

**Problem:** "Secure gateway" is not a technical specification. Missing:
- Is this a blocking prompt in the terminal? A Slack message? Both?
- How does the agent wait? Does it poll? Does it receive a webhook callback?
- What happens if Slack is down? If the human doesn't respond in 24 hours?
- Who gets paged? What's the escalation path?

**Verdict:** MARKETING FLUFF. Describes the concept, not the implementation.

---

### 4.7 §8 Future Roadmap — Noise, Not Requirements

> "Pangea APIs: For automatic PII redaction in logs and threat intel on external URLs."
> "Lakera Guard: A dedicated LLM firewall to block Prompt Injection."

**Problem:** This is a wishlist with no priority, no constraints, no analysis of whether these tools even exist or are compatible. Including this in a "Final Draft for Implementation" (per the document header) is misleading.

**Verdict:** MARKETING NOISE. Remove from spec or mark as "out of scope."

---

## 5. GAP LIST (Oracle's Research Agenda)

---

### GAP-001: Sandbox Comparison — Local Docker vs E2B vs Cloudflare Workers

**Why it matters:** The PRD names three sandbox options but provides no guidance on which to use. This is a foundational architectural decision affecting security, performance, cost, offline capability, and platform support.

**Research Questions:**
1. What are the isolation models of each? (Process-level vs VM-level vs microVM vs edge function)
2. What is the cold-start latency for each? (E2B claims <200ms — what about local Docker?)
3. Can all three run shell commands vs just HTTP handlers?
4. Which supports GPU access for ML workloads?
5. What is the cost model for E2B vs Cloudflare Workers (free tier? pay-per-use?)
6. Which works offline (no internet)?
7. Which integrates with which agent platforms (Claude Code hooks, OpenCode rules, Pi extensions)?
8. What are the data residency / privacy implications of Cloudflare Workers vs E2B vs local Docker?
9. Is Cloudflare Workers even architecturally appropriate for running AI agent code execution? (It runs JS/Wasm, not shell)
10. What's the attack surface of each? (privilege escalation, container escape, etc.)

**Suggested Sources:**
- E2B documentation: https://e2b.dev/docs
- Docker security docs: seccomp, gVisor, rootless containers
- Cloudflare Workers limitations: can it run arbitrary shell?
- OWASP Agentic AI security cheatsheet (referenced in copilot-reaserch.md)
- Agent SDK comparison docs

---

### GAP-002: Context/Token Management — lean-ctx vs RTK vs context-mode vs Sophon vs claude-ltm-plugin

**Why it matters:** Token efficiency directly affects cost, latency, and reasoning quality. The PRD has NO opinion on this. The research docs contradict each other. This gap is a critical dependency for any implementation.

**Research Questions:**
1. What is the actual architecture of lean-ctx vs RTK vs context-mode vs Sophon? (MCP server? Shell wrapper? Both?)
2. What are the compression ratios for each on IDENTICAL workloads?
3. What is the latency per command/tool call for each?
4. Which supports cross-session memory (context that persists across restarts)?
5. Which supports multi-agent sharing (context visible to multiple agents)?
6. Which has MCP compatibility (works as an MCP server)?
7. What are the dependencies? (Does lean-ctx require Node.js? Does RTK require Rust?)
8. What does the user's claude-ltm-plugin (https://github.com/RohiRIK/claude-ltm-plugin) actually do? What is its architecture? How does it compare?
9. Is there a benchmark comparing all 5 on the same workload?
10. Do any of these conflict with each other if installed simultaneously?

**Suggested Sources:**
- https://github.com/yvgude/lean-ctx
- https://github.com/rtk-ai/rtk
- https://github.com/mksglu/context-mode
- https://github.com/RohiRIK/claude-ltm-plugin
- pi.dev/packages/pi-lean-ctx
- Sophon documentation (if public)

---

### GAP-003: Platform-Agnostic Integration — Security Hooks Across Claude Code, OpenCode, and Pi

**Why it matters:** The goal is "platform-agnostic" but the three platforms have fundamentally different extension models. If we need to triplicate every security hook, maintainability becomes impossible. A unified abstraction layer may or may not exist.

**Research Questions:**
1. Does a unified security hook abstraction exist that works across all three platforms?
2. Claude Code hooks API: what events can be intercepted? Can you block a tool call before it executes?
3. OpenCode declarative rules: what's the schema? Can rules be externalized to a shared config file?
4. Pi TypeScript Extensions: what events are available? Is there a security-focused extension community repo?
5. Can MCP servers serve as the unified integration layer instead of platform-specific hooks?
6. What's the maintenance burden of three platform-specific integrations vs one unified layer?
7. Are there existing community projects attempting this (e.g., a "security-harness-for-all-agents" repo)?
8. How does each platform handle permission prompts — can they be automated/scripted?

**Suggested Sources:**
- Claude Code plugin API docs
- OpenCode extensibility docs
- Pi extension API: https://pi.dev/packages (community extensions)
- OWASP Agentic AI Top 10 (has platform-specific guidance)

---

### GAP-004: Local Model Serving — Ollama, llama.cpp, LM Studio Compatibility

**Why it matters:** The architecture should support local LLMs for privacy, cost, or offline scenarios. The PRD mentions "local model serving" nowhere, but github-links.md mentions Cloudflare Workers. No source addresses whether local models work with all three platforms.

**Research Questions:**
1. Which local LLM runtimes (Ollama, llama.cpp, LM Studio, oobabooga) are tested with Claude Code, OpenCode, and Pi?
2. What are the latency benchmarks for each combination?
3. Can Claude Code use a local model via OpenAI-compatible API? What's lost?
4. Does OpenCode's multi-model support include Ollama endpoints?
5. Does Pi's "model-agnostic" claim extend to local models in practice?
6. What's the privacy trade-off? (Local model = no data leaves machine, but Docker/E2B may send data)
7. What's the context window size for each local runtime?
8. Can local models handle the same security scanning tasks (Semgrep, TruffleHog integration)?

**Suggested Sources:**
- Ollama docs (OpenAI compatibility API)
- Claude Code model configuration docs
- OpenCode multi-model support
- Pi.dev model configuration

---

### GAP-005: MCP Server Security — Attack Surface and Isolation

**Why it matters:** MCP servers run locally and have filesystem/network access. If an agent can prompt-inject an MCP server, or if a compromised MCP server can exfiltrate data, the security architecture is compromised. This is completely unaddressed in the PRD.

**Research Questions:**
1. What is the attack surface of running multiple MCP servers locally?
2. Can a malicious prompt to the agent cause an MCP server to make unauthorized network calls?
3. How are MCP server credentials isolated from each other?
4. Can MCP servers read arbitrary files on the host? Can they be restricted to specific directories?
5. What happens if a buggy MCP server logs secrets to stdout?
6. Is there a sandbox mode for MCP servers (process isolation, seccomp)?
7. Do any of the agent platforms (Claude Code, OpenCode, Pi) provide MCP server isolation primitives?
8. How does Varlock interact with MCP servers — does it redact secrets before MCP servers see them?
9. Are there known CVEs for MCP servers in the wild?
10. What is the audit logging story for MCP server interactions?

**Suggested Sources:**
- MCP specification: https://modelcontextprotocol.io/
- MCP server security advisories (search)
- OWASP Agentic AI Top 10 (MCP-related threats)

---

### GAP-006: Eval / Testing Framework — Red-Team and Benchmark Approach

**Why it matters:** The PRD claims security but provides NO metrics, NO test plan, NO red-team methodology. How do we know if the harness actually works? This is the most critical gap for an actual security product.

**Research Questions:**
1. What existing datasets exist for evaluating AI agent security? (e.g., CyberRLBench, AgentBench, etc.)
2. What metrics should be tracked? (Secret leakage rate? Blocked exploit attempts? False positive rate?)
3. What red-team approaches exist? (Prompt injection attacks, multi-turn conversation exploits, etc.)
4. How do you test that Varlock actually prevents secrets from reaching the LLM context?
5. How do you test that TruffleHog catches what Varlock misses?
6. How do you test the E2B sandbox actually prevents host compromise?
7. Is there a "security harness regression test suite" or must this be built from scratch?
8. What is the false positive rate for Semgrep rules when scanning AI-generated code?
9. How do you evaluate HITL gateway effectiveness? (Time to approve? Escalation paths?)
10. What industry benchmarks exist for AI coding agent security?

**Suggested Sources:**
- AgentBench (academic benchmark)
- CyberRLBench (if it exists)
- OWASP Agentic AI Top 10 testing guidance
- Red team research papers on LLM agents

---

### GAP-007: Varlock Deep-Dive — Production Readiness and Alternatives

**Why it matters:** Varlock is the PRIMARY secret prevention layer in the PRD, yet its production readiness, known limitations, and alternatives are completely unexamined. This is a critical dependency.

**Research Questions:**
1. Is Varlock production-ready? What's the release status? (v1.0? Beta?)
2. What happens when Varlock is NOT running — does the agent refuse to start, or does it silently fall back to .env files?
3. What is Varlock's failure mode — fail-open or fail-closed?
4. Does Varlock support Windows? macOS? Linux only?
5. What secret managers does Varlock integrate with? (1Password? AWS Secrets Manager? HashiCorp Vault?)
6. Are there known issues with Varlock's schema validation?
7. What are the alternatives? (.env.schema npm package? python-dotenv? Custom solution?)
8. Does Varlock work with MCP servers, or only with direct agent invocations?
9. What is the performance overhead of Varlock runtime injection?
10. Is there a Varlock MCP server? (copilot-reaserch.md mentions "varlock scan" — what is this?)

**Suggested Sources:**
- https://github.com/dmno-dev/varlock
- https://varlock.dev/
- Varlock GitHub issues (for known bugs/limitations)
- dmno-dev community docs

---

### GAP-008: TruffleHog MCP Server — Existence, Stability, Scope

**Why it matters:** The PRD references TruffleHog as both a pre-commit hook AND (implicitly) an MCP server. But the github-links.md doesn't link to an MCP-specific TruffleHog server. This gap determines HOW TruffleHog is integrated.

**Research Questions:**
1. Does a TruffleHog MCP server officially exist? What's the repo?
2. What's the difference between TruffleHog as a pre-commit hook vs as an MCP server?
3. What exactly does the TruffleHog MCP server scan? (Git history? Working directory? Specific files?)
4. Is the MCP server version actively maintained?
5. What is the false positive rate for active verification? (Does it actually call GetCallerIdentity or just pattern-match?)
6. How does TruffleHog MCP interact with the agent's conversation history — does it scan the context window?
7. Can TruffleHog MCP be configured to scan only staged changes vs entire history?
8. What are the performance implications of scanning large repositories?
9. Is there a CI/CD integration path vs local-only?

**Suggested Sources:**
- https://github.com/trufflesecurity/trufflehog
- https://trufflesecurity.com/trufflehog
- TruffleHog MCP server repo (if it exists — search for "trufflehog mcp")

---

### GAP-009: On-Device Storage Model — What Gets Persisted

**Why it matters:** The architecture references SQLite caches, context indexes, session memory. But there's no data model. What schema? What persists? What is deleted on session end? This matters for privacy and security.

**Research Questions:**
1. What is the data model for the context-mode SQLite cache? (Schema? Tables?)
2. What is the data model for Ctxo's committed JSON index + SQLite cache?
3. What data from the agent session persists locally? (Conversation history? Tool outputs? Secrets?)
4. Is any of this encrypted at rest?
5. Who has access to these local databases? (Is it root-only? User-group controlled?)
6. What happens on session end — is context deleted, or does it accumulate?
7. For lean-ctx — where does cross-session memory live? (File? SQLite? Redis?)
8. Does the agent ever write secrets to local storage (even temporarily)?
9. What is the GDPR/data privacy implication of persistent agent memory?
10. Can a forensic analysis of the local SQLite databases reconstruct the agent's full execution history?

**Suggested Sources:**
- context-mode schema (https://github.com/mksglu/context-mode)
- Ctxo schema (from gemini-reaserch.md description)
- lean-ctx architecture docs

---

### GAP-010: Permission/Sandboxing Model — How Agents Declare and Enforce Boundaries

**Why it matters:** The PRD says "least privilege" and "zero trust" but provides no technical model for how an agent declares what it can/cannot access. This is the core security contract and it's completely underspecified.

**Research Questions:**
1. Is there a standard format for agent permission declarations? ( Cedar? OPA? Custom JSON?)
2. Who defines the permission policy — the user? The platform? The security harness?
3. Can the agent REQUEST more permissions? (Yes — per OpenCode/Claude model — but how?)
4. Is the permission policy enforced at the agent level (framework) or beneath it (OS-level)?
5. For filesystem access — is there a path allow-list? A pattern matcher? Symlink traversal protection?
6. For network access — is there outbound allow-listing? DNS rebinding protection?
7. For process execution — can the agent spawn arbitrary processes or only predefined commands?
8. How does each platform (Claude Code, OpenCode, Pi) expose permission controls?
9. Can permissions be scoped to a specific task/workflow (vs global)?
10. Is there an audit log of permission requests and their outcomes?

**Suggested Sources:**
- Cedars language for policy (AWS uses it)
- OPA (Open Policy Agent)
- Claude Code permission tags (allow/ask/deny)
- OpenCode declarative rules schema
- Pi extension API for permissions

---

### GAP-011: TruffleHog MCP Server (Redundant with GAP-008, but confirms existence)

**Why it matters:** The manus-reaserch.md references TruffleHog MCP integration but the github-links.md provides no MCP-specific link. Need to confirm whether this integration actually exists or is planned.

**Research Questions:** Same as GAP-008 — confirm existence and stability of TruffleHog MCP server.

---

### GAP-012: Cloudflare Workers as Sandbox — Architectural Feasibility

**Why it matters:** github-links.md lists "Cloudflare worker" as an execution option alongside E2B/Docker. But Cloudflare Workers run JavaScript/Wasm at edge locations — they cannot run arbitrary shell commands, compile code, or host a full AI agent runtime. This may be a fundamental mismatch.

**Research Questions:**
1. Can Cloudflare Workers execute arbitrary shell commands? (Answer: NO — they run JS/Wasm in V8 isolates)
2. If not, what WAS the intent behind listing Cloudflare Workers?
3. Is there a Cloudflare product that CAN run AI agent code? (Cloudflare AI Studio? Workers AI?)
4. What's the latency of routing code execution to Cloudflare Workers vs E2B vs local Docker?
5. Does Cloudflare Workers provide any security isolation benefits over the other options?

**Suggested Sources:**
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/
- Cloudflare Workers AI (if relevant)
- Comparison docs

---

### GAP-013: RTK Installation/Configuration for Pi

**Why it matters:** Pi.dev-Harness.md mentions RTK but provides zero implementation detail. How exactly does RTK wrap Pi's shell commands? Is there a documented integration?

**Research Questions:**
1. How is RTK integrated with Pi? (Shell alias? Wrapper script? Pi extension?)
2. Does a pi-lean-ctx package exist? (github-links.md says yes — https://pi.dev/packages/pi-lean-ctx)
3. What's the configuration format?
4. Does RTK work with Pi's specific command set?
5. Are there benchmarks for RTK+Pi specifically?

**Suggested Sources:**
- https://github.com/rtk-ai/rtk
- pi.dev/packages/pi-lean-ctx
- Pi community extensions repo

---

### GAP-014: Sophon MCP — Production Readiness

**Why it matters:** gemini-reaserch.md praises Sophon (94% compression, sub-millisecond) as an alternative to LLMLingua. But there's no link in github-links.md. Is it real? Open source? Maintained?

**Research Questions:**
1. Is Sophon open source? What's the repo?
2. Is it available as an MCP server? As a standalone tool?
3. What are the exact system requirements?
4. How does it compare to lean-ctx in practice?
5. Is there a benchmark comparing Sophon vs context-mode vs lean-ctx?

**Suggested Sources:**
- Search "Sophon MCP" / "Sophon agent tool"
- Agentic AI context compression research

---

### GAP-015: Varlock MCP Server

**Why it matters:** The PRD references Varlock as the primary secret layer but never clarifies whether it's a wrapper script, a shell alias, an MCP server, or a framework-level integration. Different integration paths have different security implications.

**Research Questions:**
1. What is the Varlock integration model? (MCP server? Shell preexec hook? Agent plugin?)
2. Does Varlock expose an MCP server interface?
3. What is varlock scan (mentioned in copilot-reaserch.md)?
4. How does varlock run -- <command> work at the OS level?
5. Does Varlock support being used as an MCP server for multiple agents simultaneously?

**Suggested Sources:**
- https://github.com/dmno-dev/varlock
- Varlock documentation

---

### GAP-016: "ContextCrush" Attack — Definition and Mitigation Specifics

**Why it matters:** gemini-reaserch.md mentions ContextCrush as a threat where external docs override agent security rules. The PRD mentions "ContextCrush protections" in §6.1 but provides no definition. This is a named attack vector requiring specific defenses.

**Research Questions:**
1. What is the precise attack vector of ContextCrush? (Prompt injection via RAG? Doc poisoning?)
2. Is "ContextCrush" a documented/cited term or project-specific terminology?
3. What are the specific mitigation strategies beyond "immutable AGENTS.md"?
4. Does Context7 have any built-in protections against doc poisoning?
5. How does immutable AGENTS.md actually prevent the attack? (Is it re-injected on each turn?)
6. Are there automated tests for ContextCrush resistance?

**Suggested Sources:**
- Prompt injection research (Lakehore, Pattern matching)
- RAG security research
- Context7 trust/safety model

---

## APPENDIX A: File Index

| File | Lines | Quality |
|------|-------|---------|
| specs/PRD.md | 51 | MEDIUM |
| specs/copilot-reaserch.md | 196 | HIGH |
| specs/gemini-reaserch.md | 8 (truncated) | WEAK |
| specs/manus-reaserch.md | 112 | HIGH |
| specs/Pi.dev-Harness.md | 18 | MEDIUM |
| specs/github-links.md | 23 | MEDIUM |

## APPENDIX B: Missing from All Sources

The following topics appear in the project context but are NOT covered in any source file:

1. **Claude-ltm-plugin** (user's own project): never evaluated, only listed as a link
2. **Timeline / milestones**: no dates, no phases, no priority ordering
3. **Team size / roles**: who builds what? Is there a dedicated sec-eng?
4. **Budget**: E2B pricing? Cloudflare Workers pricing? Hardware requirements?
5. **Offline capability**: what works without internet?
6. **Windows support**: most sources assume macOS/Linux
7. **CI/CD integration**: how does this fit into existing pipelines?
8. **Audit log storage**: where do logs go? Splunk? Local file? SIEM?
9. **Multi-user support**: can multiple developers share the same agent? Shared sandboxes?
10. **Graceful degradation**: what happens when E2B is down? When Varlock fails?

---

*End of Librarian Index — prepared for Oracle Agent research phase.*
