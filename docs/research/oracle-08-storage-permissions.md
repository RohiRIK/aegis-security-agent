# Oracle 08 — Storage + Permissions

## Decision summary
Persist **only the minimum operational memory you truly need**, and assume any long-lived local SQLite store can become a forensic artifact. For permissions, use a **small internal policy manifest with fine-grained actions**, compile it down to each platform’s native controls, and keep **OS-level sandboxing** as a separate enforcement layer; **do not introduce Cedar as a runtime dependency in v1**, but do borrow Cedar’s guidance to model permissions at a fine granularity. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [context-mode store](https://raw.githubusercontent.com/mksglu/context-mode/main/src/store.ts), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md), [Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md), [OpenCode permissions](https://opencode.ai/docs/permissions/), [Cedar overview](https://docs.cedarpolicy.com/), [Cedar fine-grained permissions best practice](https://docs.cedarpolicy.com/bestpractices/bp-fine-grained-permissions.html))

## Researched answers

### 1) What persistent local data models are already in scope?
- **context-mode** stores raw-ish session events, session metadata, and resume snapshots in a persistent per-project **SQLite** database, and separately stores chunked content in **SQLite FTS5 + BM25**. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [context-mode store](https://raw.githubusercontent.com/mksglu/context-mode/main/src/store.ts), [context-mode package.json](https://raw.githubusercontent.com/mksglu/context-mode/main/package.json))
- **claude-ltm-plugin** stores long-term memories, FTS, context items, relations, tags, and settings in one **SQLite** database. ([claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### 2) What exactly can persist?
Based on the gathered code/docs, persistent storage may include:
- session events,
- content chunks,
- search indexes,
- compacted/resume snapshots,
- long-term memory items,
- relations and tags,
- project-scoped context items. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [context-mode store](https://raw.githubusercontent.com/mksglu/context-mode/main/src/store.ts), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### 3) Is encryption at rest documented?
I did **not** find encryption-at-rest claims for either **context-mode** or **claude-ltm-plugin** in the gathered evidence. The documented storage model is plain local SQLite plus FTS tables. That means local disk access should be treated as access to the memory corpus unless you add encryption separately. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### 4) Can those stores reconstruct history later?
Yes, at least partially and often substantially. `session_events`, resume snapshots, indexed content chunks, and long-term memory tables are exactly the kinds of structures that make later reconstruction possible. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [context-mode store](https://raw.githubusercontent.com/mksglu/context-mode/main/src/store.ts), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### 5) Does data automatically disappear at session end?
Not by default in the architectures shown. **context-mode** includes explicit delete/cleanup methods and old-session cleanup logic, which implies persistence is normal unless cleanup runs. **claude-ltm-plugin** is explicitly designed for persistent memory. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### 6) What does Claude Code expose for permissions?
Claude Code has a first-class permission model with **allow / ask / deny**, rule precedence **deny -> ask -> allow**, path/domain/tool scoping, and hooks that can influence tool approval. It also clearly separates **permissions** from **sandboxing**, and says effective sandboxing needs both **filesystem and network isolation**. ([Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))

### 7) What does OpenCode expose for permissions?
OpenCode also has a first-class permission model with **allow / ask / deny**, a global `permission` config, granular per-tool rules, wildcard matching, `external_directory` handling, and agent-specific overrides. ([OpenCode permissions](https://opencode.ai/docs/permissions/))

### 8) What does Pi expose for permissions?
Pi’s extension API exposes tool registration, command registration, event hooks, and tool activation changes, but the gathered docs do **not** describe a comparable built-in permission-policy layer. That implies the harness would need to implement its own permission mediation in Pi extensions. ([Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

### 9) What does Cedar contribute conceptually?
Cedar is an authorization policy language intended to decouple authorization logic from application code, and its best-practice guidance explicitly says it is better to model **fine-grained permissions up front** and aggregate them in the UI than to start with overly coarse actions and regret it later. ([Cedar overview](https://docs.cedarpolicy.com/), [Cedar fine-grained permissions best practice](https://docs.cedarpolicy.com/bestpractices/bp-fine-grained-permissions.html))

### 10) Should Cedar be your v1 runtime policy engine?
Probably not. None of **Claude Code**, **OpenCode**, or **Pi** natively consumes Cedar policies in the gathered docs. Adding Cedar now would mean introducing a new runtime policy engine and a compile/adaptation layer on top of the three host platforms before the harness basics are proven. The concept is strong; the direct platform integration evidence is not there. ([Claude permissions](https://code.claude.com/docs/en/permissions.md), [OpenCode permissions](https://opencode.ai/docs/permissions/), [Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api), [Cedar overview](https://docs.cedarpolicy.com/))

## RECOMMENDATION
Use this model for v1:

### Storage
- Persist **project-scoped summaries, decisions, and security-relevant events**, not raw secrets. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))
- Put all persistent stores on **per-project SQLite files** with an explicit **retention window** and delete path. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts))
- Assume the DB is a **forensic artifact** unless you later add encryption or OS-level disk protections. ([context-mode store](https://raw.githubusercontent.com/mksglu/context-mode/main/src/store.ts), [claude-ltm-plugin architecture](https://raw.githubusercontent.com/RohiRIK/claude-ltm-plugin/main/docs/architecture.md))

### Permissions
- Define a **small internal manifest** with fine-grained actions like `read_file`, `edit_file`, `run_shell`, `fetch_domain`, `use_secret`, `approve_deploy`, plus path/domain scopes.
- Compile that manifest to:
  - **Claude Code** permission rules + hooks + sandbox config, ([Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))
  - **OpenCode** permission config + plugin checks, ([OpenCode permissions](https://opencode.ai/docs/permissions/), [OpenCode plugins](https://opencode.ai/docs/plugins/))
  - **Pi** extension-enforced tool gating. ([Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))
- Use **Cedar as design inspiration**, not as a mandatory runtime dependency yet. ([Cedar fine-grained permissions best practice](https://docs.cedarpolicy.com/bestpractices/bp-fine-grained-permissions.html))

## Confidence level
**High** on the storage risk and the platform-native permission comparison. **Medium-high** on the “do not add Cedar in v1” conclusion because it is a pragmatic integration judgment rather than a direct statement from platform docs. ([context-mode SessionDB](https://raw.githubusercontent.com/mksglu/context-mode/main/src/session/db.ts), [Claude permissions](https://code.claude.com/docs/en/permissions.md), [OpenCode permissions](https://opencode.ai/docs/permissions/), [Cedar overview](https://docs.cedarpolicy.com/))

## OPEN questions
1. Do you require **encryption at rest**, or is project-local SQLite acceptable for v1?
2. What retention policy is acceptable for stored agent memory: **hours, days, or indefinite**?
3. Which actions truly need **fine-grained policy distinctions** on day one versus later?
