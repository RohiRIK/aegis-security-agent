# Oracle 03 — Platform-Agnostic Integration

## Decision summary
There is **no official cross-platform security-hook abstraction** that spans Claude Code, OpenCode, and Pi. The clean path is to build a **shared aegis core** behind MCP/CLI services, then add **thin platform adapters**, with **Claude Code as the reference implementation first** because it has the strongest native hook, permission, and sandbox story in the gathered evidence. ([Claude hooks guide](https://code.claude.com/docs/en/hooks-guide), [Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md), [OpenCode plugins](https://opencode.ai/docs/plugins/), [OpenCode permissions](https://opencode.ai/docs/permissions/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

## Researched answers

### 1) Does a unified abstraction already exist?
I did **not** find an official abstraction layer that lets one security-hook implementation run unchanged across **Claude Code**, **OpenCode**, and **Pi**. The platforms expose different control points: Claude uses lifecycle hooks plus permissions and sandboxing, OpenCode uses config rules plus plugins, and Pi exposes an extension/event API. ([Claude hooks guide](https://code.claude.com/docs/en/hooks-guide), [OpenCode plugins](https://opencode.ai/docs/plugins/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

### 2) Claude Code interception surface
Claude Code supports hook events including **SessionStart**, **UserPromptSubmit**, **PreToolUse**, **PostToolUse**, **Notification**, **PreCompact**, **SessionEnd**, and more. `PreToolUse` hooks run **before** the permission prompt and can deny, ask, or allow, while permission rules are still evaluated with **deny -> ask -> allow** precedence. Claude also has a built-in permission system and separate OS-level sandboxing for bash subprocesses. ([Claude hooks guide](https://code.claude.com/docs/en/hooks-guide), [Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))

### 3) OpenCode interception surface
OpenCode exposes a permission system with **allow / ask / deny** and granular object syntax keyed by tool name, including `bash`, `read`, `edit`, `webfetch`, `external_directory`, and more. It also has a plugin system where plugins can hook events like `tool.execute.before`, `tool.execute.after`, `permission.asked`, and `permission.replied`. ([OpenCode permissions](https://opencode.ai/docs/permissions/), [OpenCode plugins](https://opencode.ai/docs/plugins/))

### 4) Pi interception surface
Pi’s extension API supports **tool registration**, **command registration**, and event subscriptions such as `tool_call`, `tool_result`, `session_start`, `session_shutdown`, `turn_start`, and `turn_end`. Pi also exposes an `exec()` method for bash commands, but the gathered docs do **not** describe a native permission-prompt system comparable to Claude Code or OpenCode. ([Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api), [Pi + Ollama docs](https://docs.ollama.com/integrations/pi))

### 5) Can MCP be the unifying layer?
**Partially, but not fully.** MCP is a good shared layer for scanners, memory stores, search, and external services, and all three ecosystems can participate in MCP-like or tool-extension flows. But MCP does **not** replace host-level controls such as pre-tool permission gating, shell command interception, or OS sandboxing. You still need platform-native adapters around the shared services. ([Claude MCP docs](https://code.claude.com/docs/en/mcp.md), [OpenCode plugins](https://opencode.ai/docs/plugins/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

### 6) Maintenance burden
Equal first-class support across all three platforms means maintaining:
- one **Claude hook + permissions + sandbox** integration,
- one **OpenCode plugin + permission config** integration,
- and one **Pi extension + custom permission gate** integration. ([Claude hooks guide](https://code.claude.com/docs/en/hooks-guide), [OpenCode plugins](https://opencode.ai/docs/plugins/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

That is workable only if the shared core stays very small and the adapters remain thin.

### 7) Existing community projects in this space
I found cross-platform **context** tools such as **lean-ctx**, **RTK**, and **context-mode** that support multiple coding-agent platforms, but I did **not** find a mature public project in the gathered evidence that already provides a full **Aegis across Claude Code, OpenCode, and Pi**. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md), [RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md), [context-mode package.json](https://raw.githubusercontent.com/mksglu/context-mode/main/package.json))

### 8) Permission prompt automation
- **Claude Code**: yes; permissions are first-class, and hooks can influence prompting. ([Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude hooks guide](https://code.claude.com/docs/en/hooks-guide))
- **OpenCode**: yes; the permission config directly encodes allow/ask/deny, and plugins can observe tool execution events. ([OpenCode permissions](https://opencode.ai/docs/permissions/), [OpenCode plugins](https://opencode.ai/docs/plugins/))
- **Pi**: possible, but custom; the docs show extension hooks and tool registration, not a built-in policy engine. ([Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

## RECOMMENDATION
Build Aegis in **three layers**:
1. **Shared core**: sandbox router, secret loader/scanner, policy manifest, and audit/event logger exposed through MCP and small local CLIs. ([Claude MCP docs](https://code.claude.com/docs/en/mcp.md), [OpenCode plugins](https://opencode.ai/docs/plugins/))
2. **Claude Code adapter first**: implement the full reference flow here because the native hook and sandbox primitives are strongest. ([Claude hooks guide](https://code.claude.com/docs/en/hooks-guide), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))
3. **OpenCode adapter second, Pi adapter third**: reuse the same core services, but keep platform-specific interception logic minimal. ([OpenCode permissions](https://opencode.ai/docs/permissions/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

That gives you a genuine platform-agnostic architecture without pretending the three host environments are interchangeable.

## Confidence level
**High** on the main conclusion that a single ready-made abstraction does not exist and that Claude Code is the strongest first target in the current evidence set. ([Claude hooks guide](https://code.claude.com/docs/en/hooks-guide), [OpenCode plugins](https://opencode.ai/docs/plugins/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

## OPEN questions
1. Do you want **one primary platform** with adapters, or true day-one feature parity across all three?
2. How much policy logic are you willing to keep **outside** the host agent versus inside platform-native hooks?
3. Is Pi support a **v1 requirement**, or a later portability goal?
