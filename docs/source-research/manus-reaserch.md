Secure CLI Development Agent Architecture Report

1. Executive Summary

This report synthesizes research on building a highly secure, efficient, and context-aware CLI development agent (compatible with Claude Code, OpenCode, and Pi). Based on the provided PRD, the architecture integrates advanced context management, cryptographic secret isolation, and ephemeral execution sandboxing. The goal is to maximize developer productivity while enforcing strict security boundaries.

2. Context Management: CTX vs. RTK

A critical component of an efficient CLI agent is context management, which directly impacts token consumption, cost, and agent reasoning capabilities.

2.1 RTK (Rust Token Killer)

RTK is primarily a shell hook designed to compress terminal output before it reaches the LLM 
. It operates on a spawn-per-command process model and uses regex-based signature detection for a limited number of languages. While it effectively reduces token usage, it lacks advanced features like cross-session memory and dependency mapping.

2.2 lean-ctx (CTX)

lean-ctx is a comprehensive Context Engineering Runtime that replaces RTK 
. It operates as both a shell hook and a persistent MCP server.
Key advantages over RTK include:

•
Advanced Parsing: Uses tree-sitter AST parsing for 18 languages, providing deeper semantic understanding compared to RTK's regex approach.

•
File Reading Modes: Offers 10 distinct file reading modes (e.g., full, map, signatures, diff, entropy) for optimized context gathering.

•
Persistent Memory: Supports cross-session memory, multi-agent sharing, and project knowledge stores.

•
Cost Efficiency: Reduces LLM token consumption by 60-95% through intelligent caching and compression strategies.

Recommendation: Adopt lean-ctx as the primary context management solution. Its persistent MCP server architecture and advanced AST parsing provide superior context awareness and cost efficiency compared to RTK.

3. Security Stack Implementation via MCP

The Model Context Protocol (MCP) provides a standardized way to integrate external tools and data sources into AI agents 
. The proposed security stack leverages specific MCP servers to enforce the "Defense-in-Depth" architecture.

3.1 Layer 1: Secret Management (Varlock & TruffleHog)

•
Varlock: Varlock ensures AI-safe configuration by allowing agents to interact exclusively with .env.schema files 
. This provides the agent with necessary context (variable names, types, validation rules) without exposing actual secret values. Varlock also offers proactive leak scanning and runtime log redaction.

•
TruffleHog: TruffleHog actively scans for over 800 types of leaked credentials 
. It can be integrated as a pre-commit hook or via an MCP server to verify that no hardcoded secrets are committed by the agent.

3.2 Layer 2: Secure Code Lifecycle (Semgrep & Snyk)

•
Semgrep (SAST): The official Semgrep MCP server (semgrep/mcp) allows the agent to perform static analysis on generated code 
. It supports scanning code files for security vulnerabilities using standard or custom rules, ensuring that anti-patterns (e.g., SQL injection) are caught early.

•
Snyk (SCA): The Snyk MCP server (sammcj/mcp-snyk) enables the agent to scan repositories and projects for dependency vulnerabilities 
. This prevents "AI Package Hallucination" by verifying the legitimacy and security of suggested libraries.

3.3 Layer 3: Execution Isolation (E2B)

•
E2B Sandboxing: E2B provides ephemeral, cloud-native sandboxes for secure code execution 
. The E2B MCP gateway allows the agent to run untrusted, AI-generated code, execute scripts, and run tests in an isolated environment that is destroyed immediately after use, protecting the host system.

4. Architecture Design

The secure CLI agent architecture integrates these components into a cohesive workflow:

1.
Context Gathering: The agent uses lean-ctx to efficiently gather project context, minimizing token usage while maximizing semantic understanding.

2.
Configuration Access: The agent reads .env.schema via Varlock, understanding required environment variables without accessing secrets.

3.
Code Generation & Analysis: As the agent generates code, it utilizes the Semgrep MCP server to perform real-time static analysis and the Snyk MCP server to verify dependencies.

4.
Execution & Testing: The agent executes the generated code and runs tests within an ephemeral E2B sandbox via the E2B MCP gateway.

5.
Commit Verification: Before committing, TruffleHog scans the changes to ensure no secrets have been inadvertently included.

6.
Human-in-the-Loop (HITL): High-risk actions (e.g., database migrations, production deployments) trigger a prompt for explicit human approval.

5. Hooks and Adjustments

To implement this architecture effectively, specific hooks and adjustments are required within the CLI agent (e.g., Claude Code):

•
Pre-execution Hook: Intercept code execution requests and route them through the E2B MCP server instead of the local host.

•
Pre-commit Hook: Integrate TruffleHog and Semgrep scans before allowing the agent to finalize a commit.

•
Context Hook: Configure lean-ctx as the primary context provider, replacing default file reading mechanisms.

References

[1] https://github.com/rtk-ai/rtk "RTK - Rust Token Killer"
[2] https://github.com/yvgude/lean-ctx "lean-ctx - Context Engineering Runtime"
[3] https://modelcontextprotocol.io/ "Model Context Protocol"
[4] https://github.com/dmno-dev/varlock "Varlock - AI-safe .env files"
[5] https://github.com/trufflesecurity/trufflehog "TruffleHog - Secret Scanning"
[6] https://github.com/semgrep/mcp "Semgrep MCP Server"
[7] https://github.com/sammcj/mcp-snyk "Snyk MCP Server"
[8] https://e2b.dev/docs/mcp "E2B MCP Gateway"

