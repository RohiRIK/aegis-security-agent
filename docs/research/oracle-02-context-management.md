# Oracle 02 — Context / Token Management

## Decision summary
Use **lean-ctx as the primary v1 context layer**. It is the cleanest cross-platform fit in the gathered evidence because it combines a **shell hook**, an **MCP server**, cached file reads, and explicit support for **Claude Code, OpenCode, and Pi** in one tool, while **RTK** is shell-output only, **context-mode** is richer but more opinionated and storage-heavy, **Sophon** is promising but still compression-first, and **claude-ltm-plugin** is a memory system rather than a token-optimization layer. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md), [RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md), [context-mode package.json](https://raw.githubusercontent.com/mksglu/context-mode/main/package.json), [Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

## Researched answers

### 1) What is each tool architecturally?
- **lean-ctx** is both a **shell hook** and an **MCP/context server** in a single Rust binary, with cached reads, read modes, compression, and explicit agent integrations including Claude Code, OpenCode, and Pi. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md))
- **RTK** is a **CLI proxy / shell-output compressor** that rewrites or wraps commands before they reach the model; it is not positioned as a persistent memory store or general MCP knowledge base. ([RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md), [RTK Cargo.toml](https://raw.githubusercontent.com/rtk-ai/rtk/master/Cargo.toml))
- **context-mode** is an **MCP/plugin system** with a session SQLite database, FTS5/BM25 content store, runtime detection, and plugin surfaces for OpenCode, OpenClaw, and Pi. ([context-mode package.json](https://raw.githubusercontent.com/mksglu/context-mode/main/package.json), [context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [context-mode store](https://raw.githubusercontent.com/mksglu/context-mode/main/src/store.ts), [context-mode server](https://raw.githubusercontent.com/mksglu/context-mode/main/src/server.ts))
- **Sophon** is an **MCP-native deterministic context compressor** with tools like `compress_prompt`, `compress_history`, `compress_output`, `navigate_codebase`, and file delta helpers. Its own README explicitly says it is meant to sit **in front of** another memory/cache layer rather than replace one. ([Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))
- **claude-ltm-plugin** is a **Claude-focused long-term memory system** with hooks, an MCP server, and a single SQLite DB containing memories, FTS, context items, relations, tags, and settings. ([claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md), [claude-ltm-plugin package.json](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/package.json))

### 2) Compression ratios on identical workloads
I did **not** find an apples-to-apples benchmark comparing **lean-ctx**, **RTK**, **context-mode**, **Sophon**, and **claude-ltm-plugin** on the same workload. The available numbers are all tool-authored/self-published and use different workloads, so they are useful for direction but not for strict comparison. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md), [RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md), [context-mode package.json](https://raw.githubusercontent.com/mksglu/context-mode/main/package.json), [Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))

### 3) Reported performance / latency
- **lean-ctx** reports **60–95%** savings overall, **74–99%** on MCP reads, **cached re-reads ≈ 13 tokens**, and says overhead is effectively sub-millisecond in normal use. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md))
- **RTK** reports **60–90%** token reduction and **<10 ms** overhead. ([RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md))
- **context-mode** describes itself as saving **98%** of context and uses SQLite FTS5/BM25, but I did **not** find a comparable, precise end-to-end latency table in the gathered evidence. ([context-mode package.json](https://raw.githubusercontent.com/mksglu/context-mode/main/package.json), [context-mode store](https://raw.githubusercontent.com/mksglu/context-mode/main/src/store.ts))
- **Sophon** publishes the most detailed benchmark section in the gathered set, including **10.6 ms p50** cold start, **25 ms p99** cold start, **68.1%** session token savings, **70.2%** prompt savings, and **81.6%** weighted `compress_output` coverage. ([Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))
- **claude-ltm-plugin** does not present itself as a compression benchmark tool; I did not find token-reduction or latency claims in the gathered architecture evidence. ([claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### 4) Cross-session memory
- **lean-ctx**: yes. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md))
- **context-mode**: yes; it has persistent SQLite `SessionDB` and content storage. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [context-mode store](https://raw.githubusercontent.com/mksglu/context-mode/main/src/store.ts))
- **Sophon**: yes, when `SOPHON_MEMORY_PATH` is set. ([Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))
- **claude-ltm-plugin**: yes, by design. ([claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))
- **RTK**: no persistent memory capability is documented in the gathered evidence. ([RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md))

### 5) Multi-agent sharing
- **lean-ctx** explicitly documents **multi-agent coordination** and context sharing tools. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md))
- I did **not** find equally explicit multi-agent-sharing claims in the gathered **context-mode**, **Sophon**, or **claude-ltm-plugin** sources, even though they all persist state that could be shared by architecture. Treat that capability as **documented for lean-ctx, unproven for the others** based on the current evidence set. ([context-mode package.json](https://raw.githubusercontent.com/mksglu/context-mode/main/package.json), [Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### 6) MCP compatibility
- **lean-ctx**: yes. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md))
- **context-mode**: yes. ([context-mode server](https://raw.githubusercontent.com/mksglu/context-mode/main/src/server.ts))
- **Sophon**: yes. ([Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))
- **claude-ltm-plugin**: yes. ([claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))
- **RTK**: no MCP server is documented; it is a command/output proxy. ([RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md))

### 7) Dependencies / runtime stack
- **lean-ctx** is primarily a **Rust** binary, with install paths through shell script, Homebrew, npm, or Cargo. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md))
- **RTK** is a **Rust** CLI. ([RTK Cargo.toml](https://raw.githubusercontent.com/rtk-ai/rtk/master/Cargo.toml))
- **context-mode** is **Node/TypeScript**, with optional `better-sqlite3`. ([context-mode package.json](https://raw.githubusercontent.com/mksglu/context-mode/main/package.json))
- **Sophon** is a **Rust** binary with an npm wrapper and optional feature flags for tree-sitter/BGE. ([Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))
- **claude-ltm-plugin** uses **Bun** and SQLite. ([claude-ltm-plugin package.json](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/package.json))

### 8) What does claude-ltm-plugin actually do?
It is a **memory layer**, not a primary compression layer. The architecture centers on a single SQLite DB, MCP tools, and lifecycle hooks that write directly to the DB; the schema stores memories, FTS rows, context items, relations, tags, and settings. ([claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### 9) Is there a benchmark comparing all five?
No benchmark covering **all five on the same workload** was found in the gathered evidence. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md), [RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md), [Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))

### 10) Do they conflict if installed together?
- **Shell-hook / command-rewrite tools** absolutely can conflict if you stack them. **lean-ctx**, **RTK**, and **Sophon hook install** all want to sit in front of the same command stream. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md), [RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md), [Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))
- **MCP servers** can usually coexist as separate named servers, but that does **not** mean the overall system is simpler; overlapping storage/search/memory layers add operator confusion and make debugging harder. ([context-mode server](https://raw.githubusercontent.com/mksglu/context-mode/main/src/server.ts), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

## RECOMMENDATION
Standardize on **lean-ctx** for v1. It is the best fit for a platform-agnostic aegis because it covers both the **input-token** problem (file/context reads) and the **CLI-output** problem in one tool, supports your target agent platforms directly, and avoids the operational sprawl of layering multiple compressors. Keep **RTK** as a reference comparator, treat **Sophon** as an experimental compression-only track, and keep **claude-ltm-plugin** out of the core path unless the project narrows to **Claude-only memory workflows**. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md), [RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md), [Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

## Confidence level
**Medium.** The architectural comparison is solid, but most performance numbers are self-reported by tool authors and not normalized across one benchmark aegis. ([lean-ctx README](https://raw.githubusercontent.com/yvgude/lean-ctx/main/README.md), [RTK README](https://raw.githubusercontent.com/rtk-ai/rtk/master/README.md), [Sophon README](https://raw.githubusercontent.com/lacausecrypto/mcp-sophon/main/README.md))

## OPEN questions
1. Which of the candidate tools still performs best when measured against **your** representative prompts, repos, and CLI outputs?
2. Do you want persistent **memory**, or only **token compression** in v1?
3. Is Claude-only memory worth a dedicated **claude-ltm-plugin** integration, or is that complexity premature?
