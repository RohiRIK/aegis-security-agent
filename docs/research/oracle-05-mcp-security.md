# Oracle 05 — MCP Server Security

## Decision summary
Treat every MCP server as **privileged local code** unless proven otherwise. For v1, default to **stdio MCP servers**, avoid token passthrough, sandbox risky local servers when possible, and keep OAuth scope and redirect handling extremely narrow because the official MCP security guidance explicitly calls out **confused deputy**, **token passthrough**, **SSRF**, **session hijacking**, **local MCP server compromise**, and **scope minimization** as real attack surfaces. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices), [Claude MCP docs](https://code.claude.com/docs/en/mcp.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))

## Researched answers

### 1) What is the main attack surface?
The official MCP security guidance calls out several high-risk classes directly: **confused deputy**, **token passthrough**, **SSRF**, **session hijacking**, **local MCP server compromise**, and over-broad scope grants. That means the attack surface is not just “bad tool output”; it includes auth flows, transport choice, server startup commands, local system access, and outbound network behavior. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices))

### 2) Can prompt-injected or malicious content drive unauthorized network behavior?
Yes. The MCP security guidance explicitly covers **SSRF** during OAuth metadata discovery and warns that local MCP servers are attractive targets because they can run with the same privileges as the client. Claude’s MCP docs also warn to be especially careful with third-party MCP servers that can fetch **untrusted content**, because they can expose you to prompt-injection risk. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices), [Claude MCP docs](https://code.claude.com/docs/en/mcp.md))

### 3) How are credentials isolated?
The MCP guidance says MCP servers **must not** accept tokens that were not explicitly issued for that MCP server, and it explicitly forbids **token passthrough** as an anti-pattern. That is the clearest guidance in the gathered set: credentials must be scoped to the server and validated server-side, not blindly forwarded. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices))

### 4) Can MCP servers read arbitrary host files?
Potentially yes, if the local process has that access. The MCP guidance’s “local MCP server compromise” section treats local servers as binaries running on the user’s machine that may have direct access to the user’s system. Claude’s permissions docs also clarify that built-in `Read` deny rules do **not** protect arbitrary bash subprocesses; for OS-level protection you need sandboxing. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices), [Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))

### 5) Is there a sandbox mode for MCP servers?
Claude’s sandboxing docs explicitly say the open-source sandbox runtime can also be used to sandbox **other programs**, and it gives the example `npx @anthropic-ai/sandbox-runtime <command-to-sandbox>`, including MCP servers. I did **not** find a comparable cross-platform MCP-server sandbox primitive in the OpenCode or Pi docs. ([Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md), [OpenCode plugins](https://opencode.ai/docs/plugins/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

### 6) Do the platforms themselves provide full MCP isolation?
No general platform-level answer was found. Claude has permission rules, MCP transport controls, and a separate bash sandbox, but that is not the same thing as universal MCP server isolation. OpenCode and Pi docs show plugin/extension systems and permissions/events, but not a built-in MCP sandbox boundary. ([Claude MCP docs](https://code.claude.com/docs/en/mcp.md), [Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md), [OpenCode permissions](https://opencode.ai/docs/permissions/), [OpenCode plugins](https://opencode.ai/docs/plugins/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

### 7) What transport should you prefer?
The MCP security guidance’s local-server section recommends **stdio** to limit access to just the MCP client. If HTTP transport is necessary, it recommends explicit restrictions such as auth tokens or restricted IPC mechanisms. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices))

### 8) What does the auth guidance imply for proxy-style MCP servers?
The spec spends significant space on the **confused deputy** problem and says MCP proxy servers **must** implement **per-client consent**, strict `redirect_uri` validation, secure state handling, and minimal OAuth scopes. That matters if you ever put a security-harness control plane in front of third-party APIs. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices))

### 9) How much audit logging exists out of the box?
I did **not** find a unified cross-platform audit-log standard for MCP interactions in the gathered evidence. Claude and OpenCode both have ecosystem-level logging/config surfaces, but the main MCP security doc focuses on threats and mitigations, not an end-to-end audit schema. For this project, you should assume you need to build your own structured audit trail for tool call, server name, action, principal, scope, and result. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices), [OpenCode plugins](https://opencode.ai/docs/plugins/))

### 10) How does this interact with Varlock?
I did **not** find evidence in the gathered Varlock docs that secrets are automatically redacted **before** an MCP server sees them. Varlock documents secret loading, sensitivity annotations, scanning, and pre-commit hooks, but not a specific “MCP-safe secret mediation” contract. Assume MCP servers can still see any secret that is resolved into their environment or file access path unless you explicitly isolate them. ([Varlock secrets guide](https://varlock.dev/guides/secrets))

### 11) Known CVEs in MCP servers?
No concrete MCP-server CVE list was established from the gathered evidence. The absence of evidence here should be treated as “not researched enough,” not “safe by default.”

## RECOMMENDATION
For v1, apply these rules:
1. **Prefer stdio MCP servers** over HTTP where practical. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices))
2. **Never allow token passthrough**; every server validates tokens issued for itself. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices))
3. **Sandbox high-risk local MCP servers** when possible, especially anything with filesystem or network reach. Claude’s sandbox runtime gives you an immediate path for that. ([Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))
4. **Keep scopes minimal and incremental**, and reject broad “all access” patterns. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices))
5. **Do not trust server output** just because it came through MCP; log it, label it, and keep untrusted-content boundaries explicit. ([Claude MCP docs](https://code.claude.com/docs/en/mcp.md), [MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices))

## Confidence level
**High** on the core threat model because it comes from the official MCP security documentation. **Medium** on platform-specific operational details because the gathered docs do not fully describe how each host isolates third-party MCP processes in practice. ([MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))

## OPEN questions
1. Which MCP servers in your planned stack genuinely need **network egress**?
2. Do you want to enforce **sandboxed MCP startup** as a default, or only for risky servers?
3. What structured fields should your **MCP audit log** capture for incident response?
