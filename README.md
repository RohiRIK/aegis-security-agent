# aegis-security-agent

Security layer for AI coding agents, command routing, scanner integration, and policy enforcement

[![npm version](https://img.shields.io/npm/v/aegis-security-agent.svg)](https://www.npmjs.com/package/aegis-security-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

### What is Aegis?

Aegis is a silent security plugin that runs inside your AI coding agent, such as OpenCode or Claude Code. It intercepts every tool call to route commands between a sandbox and the host, block high-risk patterns, and scan file writes with Semgrep. It also scans package installs with Trivy to ensure your development environment remains secure.

Aegis includes a deep-scan security analyst agent, `@aegis`, for on-demand audits. It works with or without Docker, though it operates in a degraded mode if Docker isn't available.

### Architecture

Aegis consists of three primary components:

1. **Plugin**: Silent hooks that intercept `tool.execute.before/after`, `shell.env`, `permission.ask`, and session compaction. It routes commands based on `aegis-policy.json`, blocks secrets from the environment, and scans output using a lean proxy.
2. **Agent (@aegis)**: A deep security analyst capable of running full-repo Semgrep scans, Trivy dependency audits, TruffleHog secrets scans, and threat modeling. It produces structured SAFE, RISKY, or BLOCKED verdicts.
3. **CLI (aegis)**: An installer and status tool for managing the Aegis environment.

### Install

You can install Aegis for different AI agents using the following paths.

**For OpenCode users:**

```bash
bunx aegis-security-agent install
```

This command creates:
- `opencode.json`: Registers the plugin.
- `.aegis/`: Directory for scan output.
- `aegis-policy.json`: Customizable security policy.
- `.opencode/plugins/aegis.ts`: Plugin shim.
- `.opencode/agents/aegis.md`: @aegis agent definition.
- `.opencode/package.json`: Dependency declaration.

**For Claude Code users:**

```bash
bunx aegis-security-agent install --claude
```

This command creates:
- `.claude/hooks.json`: Pre and post tool hooks.
- `.claude/agents/aegis.md`: @aegis agent definition.
- `.claudeignore`: Blocks sensitive files from the agent's context.
- `.aegis/`: Directory for scan output.
- `aegis-policy.json`: Security policy.

**Flags:**
- `--force`: Overwrite existing files.
- `--skip-docker`: Skip the Docker availability check.

### Usage

Once installed, Aegis works silently in the background. No code changes are required. The plugin performs the following actions:
- Routes safe commands like `git`, `bun test`, `ls`, and `cat` to the host.
- Routes commands like `curl`, `npm install`, and `python` to the Docker sandbox.
- Blocks high-risk commands such as `rm -rf`, `DROP TABLE`, and `kubectl apply`, requiring human approval.
- Scans file writes with Semgrep for vulnerabilities.
- Scans package installs with Trivy for CVEs.
- Strips secrets from the shell environment.

For deep scans, you can invoke `@aegis` in your agent chat:
- `@aegis full-audit`: Performs a whole-repo security scan.
- `@aegis dependency-audit`: Checks the lockfile for CVEs.
- `@aegis auth-review`: Reviews authentication and cryptographic code.
- `@aegis pre-merge-review`: Acts as a branch security gate.

### Policy Configuration

The `aegis-policy.json` file defines how Aegis handles different commands and patterns.

```json
{
  "routing": {
    "host_passthrough": ["^git ", "^bun (tsc|test|run)", "^ls\\b", "^cat "],
    "sandbox_required": ["^curl ", "^npm ", "^python[23]? ", "^node "]
  },
  "high_risk_patterns": ["rm -rf", "DROP TABLE", "kubectl apply", "terraform apply"],
  "degraded_mode": {
    "allow_host_passthrough": true,
    "block_sandbox_required": true,
    "warn_on_degraded": true
  },
  "actions": {
    "read_file": { "default": "allow", "deny_patterns": [".env", "**/*.pem"] },
    "edit_file": { "default": "ask", "allow_patterns": ["src/**", "tests/**"] },
    "run_shell": { "default": "sandbox", "high_risk_patterns": ["rm -rf"] }
  }
}
```

- `routing.host_passthrough`: Regex patterns for commands that can run safely on the host.
- `routing.sandbox_required`: Regex patterns for commands that must run inside the Docker sandbox.
- `high_risk_patterns`: Patterns that trigger a human-in-the-loop (HITL) check.
- `degraded_mode`: Determines behavior when Docker is unavailable.
- `actions`: Default behavior for specific actions like reading or editing files.

### Degraded Mode

If Docker isn't available, Aegis runs in degraded mode. In this state:
- Host-passthrough commands continue to function.
- Sandbox-required commands are blocked by default, though this is configurable in the policy.
- A warning is displayed during installation and at runtime.

### Requirements

- Bun >= 1.0
- Docker (optional, for full sandbox mode)
- Semgrep (optional, for SAST scanning)
- Trivy (optional, for dependency scanning)
- TruffleHog (optional, for secrets scanning)

### Development

```bash
bun install
bun test          # 132 tests
bun run build     # Build dist
bun tsc --noEmit  # Typecheck
```

### Changelog

See [CHANGELOG.md](CHANGELOG.md) for details. The current version is 0.1.0.

### License

MIT
