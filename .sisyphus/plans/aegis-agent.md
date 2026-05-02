# Aegis — OpenCode Security Analyst Agent

## TL;DR

> **Quick Summary**: Create the Aegis security analyst agent for OpenCode — a read-only, harness-aware agent that runs deep vulnerability scans (Semgrep, Trivy, TruffleHog), analyzes audit logs, performs threat modeling, and produces structured SAFE/RISKY/BLOCKED verdicts. Deliverables are 3 markdown files + manual smoke test verification.
>
> **Deliverables**:
> - `~/.config/opencode/agents/aegis.md` — Agent definition (YAML frontmatter + system prompt with 7 task types)
> - `~/.config/opencode/AGENTS.md` — Updated with Security Escalation section (8 triggers + 3 anti-triggers)
> - `docs/AEGIS.md` — User-facing documentation (what/when/how + verdict format + capability comparison)
> - Documented smoke test steps with expected verdicts
>
> **Estimated Effort**: Quick (~2-4 hours solo dev)
> **Parallel Execution**: YES — 2 waves (3 parallel in Wave 1, 1 sequential in Wave 2)
> **Critical Path**: A1-01 → A1-04

---

## Context

### Original Request

Build Aegis — an OpenCode security agent. Aegis is the "specialist doctor" complement to the plugin "immune system." It performs deep security analysis that the silent plugin cannot: whole-repo scans, dependency audits, TruffleHog secrets scans, audit log forensics, threat modeling, and pre-merge security gates. All design decisions are captured in `docs/design/aegis-dual-component-design.md`.

### Design Document Summary

The architecture design (`docs/design/aegis-dual-component-design.md`) defines 7 deliverables:

1. **Capability matrix** — Plugin (fast/silent/real-time) vs Aegis (deep/on-demand/structured) vs security-analyst (junior reviewer)
2. **Tool whitelist** — 13 allowed bash patterns (10 scan/git/grep patterns + 3 version-check patterns for scanner availability), `edit: deny`, `webfetch: deny`
3. **8 Sisyphus triggers** — Plugin block override, ≥3 Semgrep errors, Trivy CVE block, pre-commit gate (>500 LOC), new dependency, auth/crypto code, infrastructure changes, user request
4. **3 anti-triggers** — Routine file edits, passing Trivy installs, read-only operations
5. **Structured verdict format** — SAFE/RISKY/BLOCKED with findings table, evidence, remediation, policy recommendations
6. **Plugin ↔ Aegis escalation flow** — Sisyphus orchestrates; plugin blocks → escalation decision → Aegis deep scan → verdict
7. **Draft aegis.md skeleton** — Complete YAML frontmatter + system prompt structure with 7 task types

### Existing Agent Conventions (from `~/.config/opencode/agents/`)

All 3 existing agents follow this pattern:
- **YAML frontmatter**: `description` (1-2 lines), `mode: subagent`, `temperature: 0.1`, `permission` block with `edit: deny` for read-only agents
- **Bash permissions**: Use glob patterns (`"*": ask/deny`, specific commands: `allow`)
- **Body**: Concise role description → focus areas → output format expectations → rules
- **Tone**: Direct, imperative, no conversational filler

Aegis differs from the existing `security.md` agent:
- `security.md` = generic OWASP code reviewer with no scanner access, no harness awareness, no structured verdict
- Aegis = harness-aware analyst with scanner CLI access, policy file reading, audit log analysis, structured SAFE/RISKY/BLOCKED verdicts

### Gap Analysis (self-review, Metis timed out)

**Identified Gaps** (addressed in plan):
1. **Scanner unavailability** — Aegis must check scanner availability at task start and degrade gracefully with `DEGRADED` warning (Design doc Risk 1)
2. **Missing audit log** — Aegis must detect missing/empty `.aegis/audit.log` and report it as a finding itself
3. **Missing policy file** — Aegis must report if `harness-policy.json` is absent
4. **AGENTS.md location** — Design doc says "AGENTS.md"; the OpenCode global rules file is at `~/.config/opencode/AGENTS.md`. Triggers go there, not in project CLAUDE.md
5. **Smoke test execution** — `opencode` CLI may not support `run --agent` syntax. Tests are documented as manual verification steps

---

## Work Objectives

### Core Objective

Deliver a production-ready Aegis agent definition that any OpenCode user can install by placing one file at `~/.config/opencode/agents/aegis.md`, with supporting trigger documentation and user-facing docs.

### Concrete Deliverables

- `~/.config/opencode/agents/aegis.md` — Complete agent definition file
- `~/.config/opencode/AGENTS.md` — Updated with `## Security Escalation` section
- `docs/AEGIS.md` — User-facing documentation

### Definition of Done

- [ ] `aegis.md` has valid YAML frontmatter with `edit: deny` and all 13 allowed bash patterns
- [ ] System prompt covers all 7 task types from design doc Section 7
- [ ] Response format matches design doc Section 4 exactly
- [ ] 8 trigger conditions and 3 anti-triggers documented in AGENTS.md
- [ ] `docs/AEGIS.md` explains Aegis purpose, invocation, verdict format, and capability comparison
- [ ] Smoke test steps documented with expected outcomes

### Must Have

- `edit: deny` — permanently read-only, never editable
- `mode: subagent` — runs as delegated subagent, not standalone
- `temperature: 0.1` — deterministic analysis, minimal creativity
- All 7 task types: `full-audit`, `deep-scan`, `dependency-audit`, `auth-review`, `pre-merge-review`, `audit-override`, `infra-review`
- Structured verdict format (SAFE/RISKY/BLOCKED) with findings table
- Scanner availability check with graceful degradation
- `harness-policy.json` reading before every analysis
- `.aegis/audit.log` reading for forensic tasks

### Must NOT Have (Guardrails)

- **No `edit: allow`** — Aegis never edits files. Fixes flow through Sisyphus → normal edit path → plugin Semgrep check
- **No arbitrary bash** — Only the 10 whitelisted scanner/git/grep/docker-inspect commands
- **No webfetch** — Aegis works entirely offline with local scanners and files
- **No duplicate of security.md** — Aegis is harness-aware; security.md is a generic OWASP reviewer. Different roles
- **No TypeScript code** — Aegis is a markdown agent definition, not an application
- **No plugin dependency** — Aegis works standalone with just `harness-policy.json` + scanners installed
- **No custom tools** — Uses OpenCode native tools (Read, Bash) only
- **No AI slop** — System prompt uses imperative voice, no "feel free to", "you might want to", "consider"

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: NO (this is markdown authoring, not code)
- **Automated tests**: NO — deliverables are markdown files, not executable code
- **Framework**: N/A
- **Primary verification**: Agent-executed QA scenarios (YAML validation, content checks, grep assertions)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **YAML frontmatter**: Bash (parse with `yq` or grep for required fields)
- **Content completeness**: Bash (grep for required sections/keywords)
- **File existence**: Bash (ls/stat)
- **Cross-reference**: Bash (diff expected patterns against actual content)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent, MAX PARALLEL):
├── A1-01: Write aegis.md agent definition [deep]
├── A1-02: Add trigger conditions to AGENTS.md [quick]
└── A1-03: Write docs/AEGIS.md user documentation [writing]

Wave 2 (After Wave 1 — depends on A1-01):
└── A1-04: Smoke test verification [quick]

Critical Path: A1-01 → A1-04
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Task Dependency Graph

| Task | Depends On | Blocks | Reason |
|------|------------|--------|--------|
| A1-01 | None | A1-04 | Agent file must exist before smoke testing |
| A1-02 | None | None | Independent — edits a different file (AGENTS.md) |
| A1-03 | None | None | Independent — references design doc, not aegis.md itself |
| A1-04 | A1-01 | None | Must load the agent file to verify it works |

### Dependency Matrix

| Task | Depends On | Depended On By | Wave |
|------|------------|----------------|------|
| A1-01 | — | A1-04 | 1 |
| A1-02 | — | — | 1 |
| A1-03 | — | — | 1 |
| A1-04 | A1-01 | — | 2 |

### Agent Dispatch Summary

| Wave | Tasks | Dispatch |
|------|-------|----------|
| 1 | 3 | A1-01 → `deep`, A1-02 → `quick`, A1-03 → `writing` |
| 2 | 1 | A1-04 → `quick` |
| FINAL | 4 | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

> Every task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [ ] 1. Write `docs/agents/aegis.md` — Agent Definition File (repo source of truth)

  **What to do**:
  1. Create `docs/agents/aegis.md` (repo path — committed to version control). After committing, copy to the live location: `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md`
  2. **YAML frontmatter** — Copy the exact permission block from the design doc Section 7 draft skeleton:
     - `description`: 1-2 line summary matching design doc Section 7 (`"Harness-aware security analyst..."`)
     - `mode: subagent`
     - `temperature: 0.1` (match existing agents; design doc says 0.1)
     - `permission.edit: deny` — PERMANENT. Never change this.
     - `permission.bash`: **13 allowed patterns** — the 10 scan/git/grep patterns from design doc Section 2 PLUS `semgrep --version`, `trivy --version`, `trufflehog --version` for scanner availability checks. Use `"*": deny` default. The final allowlist is: `semgrep scan`, `trivy fs`, `trivy image`, `trufflehog filesystem`, `bun audit`, `git diff`, `git log`, `git show`, `grep`, `docker inspect`, `semgrep --version`, `trivy --version`, `trufflehog --version`.
     - `permission.webfetch: deny`
  3. **System prompt body** — Write the full system prompt incorporating ALL content from design doc Section 7 draft skeleton. The system prompt MUST include:
     - **Identity section**: Read-only analyst, structured verdicts, harness-aware, complements plugin
     - **Capabilities section**: 7 things Aegis does that the plugin cannot (from design doc Section 7: full-repo Semgrep, full dependency audit, TruffleHog secrets scan, audit log analysis, threat modeling, policy review, pre-merge security gate)
     - **Scanner availability check**: At the START of every task, check if required scanners are installed by running `semgrep --version`, `trivy --version`, and `trufflehog --version` (all three are within the allowed bash patterns). If any scanner is missing (command not found or non-zero exit), include a `⚠️ DEGRADED` warning in the verdict header and fall back to grep-based heuristics. This addresses Design doc Risk 1. NOTE: add `semgrep --version`, `trivy --version`, `trufflehog --version` to the bash permission allowlist alongside the existing scan patterns.
     - **7 task type workflows**: `full-audit`, `deep-scan`, `dependency-audit`, `auth-review`, `pre-merge-review`, `audit-override`, `infra-review` — each with numbered steps from design doc Section 7. Each task type must specify which scanners to run, which files to read, and what to analyze.
     - **Response format**: EXACTLY matching design doc Section 4 — `## 🛡️ Aegis Security Assessment` header, Verdict (SAFE/RISKY/BLOCKED), Task, Scope, Findings table (# | Severity | Category | Location | Description), Evidence section, Remediation section, Policy Recommendation section, footer with scanner list
     - **Verdict definitions**: SAFE (no findings above LOW), RISKY (HIGH/MEDIUM exist, no CRITICAL), BLOCKED (CRITICAL or active secret exposure) — from design doc Section 4
     - **Rules section**: 7 rules from design doc Section 7 draft skeleton (never edit, never run unauthorized commands, always read policy first, always check audit.log for forensic tasks, always produce verdict, handle missing scanners gracefully, findings require evidence)
     - **Edge case handling**: Missing `.aegis/audit.log` → report as finding. Missing `harness-policy.json` → report inability to validate against policy. Empty scan results → SAFE verdict with "no findings" note.
  4. Keep the system prompt **concise but complete** — match the tone of existing agents (imperative, direct, no filler). Target 120-180 lines total for the markdown body (similar density to design doc Section 7 but with scanner availability check and edge case handling added).

  **Must NOT do**:
  - Do NOT add `edit: allow` or any write permissions
  - Do NOT add bash commands beyond the 10 whitelisted patterns
  - Do NOT add `webfetch: allow`
  - Do NOT duplicate the generic security.md agent's role — Aegis is harness-aware, not a generic OWASP reviewer
  - Do NOT add conversational filler ("feel free to", "you might want to", "consider") — use imperative voice
  - Do NOT reference internal plugin implementation details — Aegis works standalone
  - Do NOT add `temperature` higher than 0.2 — security analysis requires determinism

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: The system prompt is the primary deliverable of the entire plan. It must precisely encode 7 task workflows, structured output format, scanner invocation patterns, edge case handling, and security rules. This requires careful, thorough composition — not a quick edit.
  - **Skills**: [`CodingStandards`, `Prompting`]
    - `CodingStandards`: Agent definition files follow structural conventions (YAML frontmatter, markdown body). CodingStandards ensures consistent formatting.
    - `Prompting`: The system prompt IS a prompt — it defines agent behavior, output format, and constraints. Prompting skill provides best practices for system prompt design (imperative voice, specificity, structured output).
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: Aegis IS a security tool, but this task is writing its definition, not performing a security audit. Domain overlap is indirect.
    - `BackendDesign`: No API or database work. Purely markdown authoring.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A1-02, A1-03)
  - **Blocks**: A1-04 (smoke test needs the agent file to exist)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — executor has no interview context):

  **Pattern References** (existing code to follow):
  - `~/.config/opencode/agents/review.md` — YAML frontmatter structure (description, mode, temperature, permission block with edit/bash/webfetch). Follow this exact format for the frontmatter section.
  - `~/.config/opencode/agents/security.md` — Closest existing agent to Aegis. Note how it structures "Analyze code for:" and "Provide findings with:" sections. Aegis follows similar structure but is MORE detailed (7 task types vs generic list).
  - `~/.config/opencode/agents/simplify.md` — Shows how to structure a multi-step workflow in an agent definition (## Workflow section with numbered steps). Aegis task types follow this pattern.

  **API/Type References** (contracts to implement against):
  - `docs/design/aegis-dual-component-design.md:262-396` — Section 7: Complete draft skeleton. This is the PRIMARY source for the system prompt content. The executor should use this as the starting template and enhance it with scanner availability checks and edge case handling.
  - `docs/design/aegis-dual-component-design.md:49-65` — Section 2: Tool whitelist. Copy the exact YAML permission block for the frontmatter.
  - `docs/design/aegis-dual-component-design.md:116-146` — Section 4: Structured response format. The response format in the system prompt MUST match this exactly.
  - `docs/design/aegis-dual-component-design.md:148-155` — Section 4: Verdict definitions table. Include these exact definitions.
  - `docs/design/aegis-dual-component-design.md:400-432` — Section 8: Top 3 architectural risks. Risk 1 (scanner availability) drives the scanner check requirement. Risk 3 (boundary creep) reinforces `edit: deny` permanence.

  **External References**:
  - None needed — all content comes from the design doc and existing agent conventions.

  **WHY Each Reference Matters**:
  - The existing agents establish formatting conventions that Aegis MUST follow for consistency.
  - The design doc Section 7 draft skeleton is the starting template — don't reinvent, enhance it.
  - The tool whitelist (Section 2) must be copied exactly into the YAML frontmatter — no creative additions.
  - The response format (Section 4) is a contract — Sisyphus and users depend on this exact structure.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: YAML frontmatter is valid and contains required fields
    Tool: Bash
    Preconditions: aegis.md file exists at ~/.config/opencode/agents/aegis.md
    Steps:
      1. Run: grep -c "^---$" ~/.config/opencode/agents/aegis.md
      2. Assert output is "2" (opening and closing frontmatter delimiters)
      3. Run: grep "edit: deny" ~/.config/opencode/agents/aegis.md
      4. Assert output contains "edit: deny"
      5. Run: grep "mode: subagent" ~/.config/opencode/agents/aegis.md
      6. Assert output contains "mode: subagent"
      7. Run: grep 'temperature:' ~/.config/opencode/agents/aegis.md
      8. Assert output contains "temperature: 0.1"
      9. Run: grep '"*": deny' ~/.config/opencode/agents/aegis.md
      10. Assert output contains the default deny rule for bash
    Expected Result: All 5 required frontmatter fields present, edit is deny, bash default is deny
    Failure Indicators: Any grep returns empty, "edit: allow" found, missing frontmatter delimiters
    Evidence: .sisyphus/evidence/task-1-yaml-frontmatter.txt

  Scenario: All 13 allowed bash patterns are present in frontmatter
    Tool: Bash
    Preconditions: aegis.md file exists
    Steps:
      1. For each of: "semgrep scan", "trivy fs", "trivy image", "trufflehog filesystem", "bun audit", "git diff", "git log", "git show", "grep", "docker inspect", "semgrep --version", "trivy --version", "trufflehog --version"
      2. Run: grep "<pattern>" ~/.config/opencode/agents/aegis.md
      3. Assert each returns a match with ": allow"
    Expected Result: All 13 patterns found with "allow" permission
    Failure Indicators: Any pattern missing or not set to "allow"
    Evidence: .sisyphus/evidence/task-1-bash-whitelist.txt

  Scenario: All 7 task types present in system prompt body
    Tool: Bash
    Preconditions: aegis.md file exists
    Steps:
      1. For each of: "full-audit", "deep-scan", "dependency-audit", "auth-review", "pre-merge-review", "audit-override", "infra-review"
      2. Run: grep -c "<task-type>" ~/.config/opencode/agents/aegis.md
      3. Assert each returns >= 1
    Expected Result: All 7 task types documented in the system prompt
    Failure Indicators: Any task type returns 0 matches
    Evidence: .sisyphus/evidence/task-1-task-types.txt

  Scenario: Response format matches design doc Section 4
    Tool: Bash
    Preconditions: aegis.md file exists
    Steps:
      1. Run: grep "🛡️ Aegis Security Assessment" ~/.config/opencode/agents/aegis.md
      2. Assert match found
      3. Run: grep "SAFE.*RISKY.*BLOCKED" ~/.config/opencode/agents/aegis.md
      4. Assert match found (verdict line)
      5. Run: grep "Severity.*Category.*Location.*Description" ~/.config/opencode/agents/aegis.md
      6. Assert match found (findings table header)
      7. Run: grep "### Remediation" ~/.config/opencode/agents/aegis.md
      8. Assert match found
      9. Run: grep "### Policy Recommendation" ~/.config/opencode/agents/aegis.md
      10. Assert match found
    Expected Result: All 5 response format elements present
    Failure Indicators: Any element missing
    Evidence: .sisyphus/evidence/task-1-response-format.txt

  Scenario: Scanner availability check is documented
    Tool: Bash
    Preconditions: aegis.md file exists
    Steps:
      1. Run: grep -i "DEGRADED\|scanner.*available\|scanner.*missing\|semgrep.*version\|trivy.*version\|trufflehog.*version" ~/.config/opencode/agents/aegis.md
      2. Assert at least one match related to scanner availability checking
    Expected Result: System prompt includes instructions for checking scanner availability and degrading gracefully
    Failure Indicators: No mention of scanner availability or degradation
    Evidence: .sisyphus/evidence/task-1-scanner-check.txt

  Scenario: No forbidden patterns (edit allow, webfetch allow, AI slop)
    Tool: Bash
    Preconditions: aegis.md file exists
    Steps:
      1. Run: grep -i "edit: allow" ~/.config/opencode/agents/aegis.md
      2. Assert ZERO matches
      3. Run: grep -i "webfetch: allow" ~/.config/opencode/agents/aegis.md
      4. Assert ZERO matches
      5. Run: grep -iE "feel free to|you might want|consider doing|you could" ~/.config/opencode/agents/aegis.md
      6. Assert ZERO matches (no AI slop)
    Expected Result: Zero forbidden patterns found
    Failure Indicators: Any forbidden pattern found
    Evidence: .sisyphus/evidence/task-1-forbidden-patterns.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-yaml-frontmatter.txt
  - [ ] task-1-bash-whitelist.txt
  - [ ] task-1-task-types.txt
  - [ ] task-1-response-format.txt
  - [ ] task-1-scanner-check.txt
  - [ ] task-1-forbidden-patterns.txt

  **Commit**: YES
  - Message: `feat(aegis): add Aegis security analyst agent definition`
  - Files: `docs/agents/aegis.md`
  - Pre-commit order:
    1. Write `docs/agents/aegis.md` (repo file)
    2. Copy to live path: `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md` — this MUST happen BEFORE QA so the live file exists for verification
    3. Run all QA scenarios (they check the live path `~/.config/opencode/agents/aegis.md`)
    4. If all QA pass → commit `docs/agents/aegis.md` to repo

---

- [ ] 2. Add Aegis Trigger Conditions to `docs/agents/AGENTS-security-section.md` (repo source) + append to `~/.config/opencode/AGENTS.md`

  **What to do**:
  1. Create `docs/agents/AGENTS-security-section.md` in the repo — this is the canonical source for the new `## Security Escalation` section content only (NOT the Agents table row). After committing, install to the live file via the 2-step procedure below.
  2. Read the current `~/.config/opencode/AGENTS.md` file to understand existing structure and placement
  3. The section content in `docs/agents/AGENTS-security-section.md` MUST contain:
     - An introductory line: `Sisyphus MUST call @aegis when:`
     - A table with 3 columns: `Trigger | Condition | Aegis Task` — containing ALL 8 triggers from design doc Section 3:
       1. **Plugin block** — Plugin blocked a command AND user overrode the block → `audit-override`
       2. **Semgrep errors** — PostToolUse Semgrep found ≥3 ERROR findings in a single file → `deep-scan`
       3. **Trivy CVE** — Plugin blocked a package install due to CVEs → `dependency-audit`
       4. **Pre-commit gate** — User requests `/commit-push-pr` on a branch with >500 LOC changed → `pre-merge-review`
       5. **New dependency** — Any new dependency added to package.json/pyproject.toml → `dependency-audit`
       6. **Auth/crypto code** — File written contains auth/crypto patterns (jwt, bcrypt, oauth, cipher, private_key) → `auth-review`
       7. **Infrastructure** — Dockerfile, docker-compose, k8s manifests, terraform files modified → `infra-review`
       8. **User request** — User says "security review", "audit", "check security" → `full-audit`
     - Anti-triggers paragraph: `Sisyphus MUST NOT call @aegis for:` followed by 3 bullet points:
       - Routine file edits (plugin handles via Semgrep)
       - Package installs that pass Trivy (plugin already cleared them)
       - Read-only operations (no security surface)
  4. **Install procedure** (run BEFORE QA, BEFORE commit — in this exact order):
     - Step A — Add `@aegis` row to the existing `## Agents` table in `~/.config/opencode/AGENTS.md` using an in-place edit. Find the last row in the Agents table and insert after it: `| @aegis | Harness-aware security analyst (read-only, structured verdicts) |`
     - Step B — Insert the new `## Security Escalation` section BEFORE `## Commands` (NOT appended to EOF). Use sed insertion:
       ```bash
       SECTION_CONTENT=$'\n## Security Escalation\n\n'"$(cat docs/agents/AGENTS-security-section.md)"$'\n'
       sed -i '' "/^## Commands/i\\
       ${SECTION_CONTENT}" ~/.config/opencode/AGENTS.md
       ```
     - Verify placement: `grep -n "## " ~/.config/opencode/AGENTS.md` — `## Security Escalation` must appear BETWEEN `## Agents` and `## Commands`
  5. Copy the trigger table content EXACTLY from design doc Section 3 — do not paraphrase or rewrite

  **Must NOT do**:
  - Do NOT modify the content of any existing sections (Workflow, Commands, Skills, Rules, Configuration) — but DO add a new row to the existing `## Agents` table (see step 4 above)
  - Do NOT remove existing agents from the table
  - Do NOT change the file's overall structure or formatting
  - Do NOT add implementation details — this is a reference table, not a how-to guide
  - Do NOT add triggers beyond the 8 specified in the design doc

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple markdown table insertion into an existing file. No complex logic, no code, no design decisions. Just copy content from design doc Section 3 into AGENTS.md.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: Ensures markdown table formatting matches existing conventions in AGENTS.md.
  - **Skills Evaluated but Omitted**:
    - `Prompting`: No prompt authoring needed — this is reference documentation.
    - `SecurityReview`: Not performing a security audit — just documenting trigger conditions.
    - `BackendDesign`: No API or architecture work.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A1-01, A1-03)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `~/.config/opencode/AGENTS.md:20-27` — Existing `## Agents` table. Add `@aegis` as a new row following the same format (`| @aegis | ... |`).
  - `~/.config/opencode/AGENTS.md` (full file) — Understand the document structure so the new section is placed correctly (after Agents, before Commands).

  **API/Type References**:
  - `docs/design/aegis-dual-component-design.md:88-112` — Section 3: Sisyphus Trigger Conditions. Copy the EXACT trigger table and anti-trigger list from here. This is the source of truth.

  **WHY Each Reference Matters**:
  - AGENTS.md structure must be preserved — the new section slots in without breaking existing content.
  - Design doc Section 3 is the canonical source — copy, don't paraphrase.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Security Escalation section exists with correct structure
    Tool: Bash
    Preconditions: AGENTS.md file exists at ~/.config/opencode/AGENTS.md
    Steps:
      1. Run: grep -c "## Security Escalation" ~/.config/opencode/AGENTS.md
      2. Assert output is "1"
      3. Run: grep -c "Sisyphus MUST call @aegis when:" ~/.config/opencode/AGENTS.md
      4. Assert output is "1" (intro trigger line present)
      5. Run: grep -c "Sisyphus MUST NOT call @aegis" ~/.config/opencode/AGENTS.md
      6. Assert output is "1" (anti-triggers header present)
      7. Run: grep -c "@aegis" ~/.config/opencode/AGENTS.md
      8. Assert output is >= 3 (at minimum: Agents table row + trigger intro line + anti-trigger line)
    Expected Result: Section header, trigger intro, and anti-trigger header all present; @aegis referenced at least 3 times
    Failure Indicators: Missing section header, missing trigger intro, missing anti-trigger header
    Evidence: .sisyphus/evidence/task-2-escalation-section.txt

  Scenario: All 8 trigger conditions present
    Tool: Bash
    Preconditions: AGENTS.md updated
    Steps:
      1. For each of: "Plugin block", "Semgrep errors", "Trivy CVE", "Pre-commit gate", "New dependency", "Auth/crypto code", "Infrastructure", "User request"
      2. Run: grep "<trigger>" ~/.config/opencode/AGENTS.md
      3. Assert each returns a match
    Expected Result: All 8 triggers documented
    Failure Indicators: Any trigger missing
    Evidence: .sisyphus/evidence/task-2-triggers.txt

  Scenario: Existing AGENTS.md content not damaged
    Tool: Bash
    Preconditions: AGENTS.md updated
    Steps:
      1. Run: grep "## Workflow" ~/.config/opencode/AGENTS.md
      2. Assert match found
      3. Run: grep "@review" ~/.config/opencode/AGENTS.md
      4. Assert match found
      5. Run: grep "@security" ~/.config/opencode/AGENTS.md
      6. Assert match found
      7. Run: grep "@simplify" ~/.config/opencode/AGENTS.md
      8. Assert match found
    Expected Result: All existing content preserved
    Failure Indicators: Any existing section or agent missing
    Evidence: .sisyphus/evidence/task-2-existing-content.txt

  Scenario: Aegis row added to Agents table
    Tool: Bash
    Preconditions: AGENTS.md updated
    Steps:
      1. Run: grep -A1 "@aegis" ~/.config/opencode/AGENTS.md | head -1
      2. Assert output contains "@aegis" and a description mentioning "security analyst" or "harness"
    Expected Result: @aegis row present in Agents table with description
    Failure Indicators: No @aegis row in the Agents table
    Evidence: .sisyphus/evidence/task-2-agents-table.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-escalation-section.txt
  - [ ] task-2-triggers.txt
  - [ ] task-2-existing-content.txt
  - [ ] task-2-agents-table.txt

  **Commit**: YES
  - Message: `docs(agents): add Aegis security escalation triggers section`
  - Files: `docs/agents/AGENTS-security-section.md`
   - Pre-commit order:
     1. Write `docs/agents/AGENTS-security-section.md` (repo file — section content only, no table row)
     2. Install to live file using the 2-step procedure:
        - Step A: Add `@aegis` row to existing `## Agents` table via in-place edit of `~/.config/opencode/AGENTS.md`
        - Step B: Insert `## Security Escalation` section BEFORE `## Commands` using sed (NOT append to EOF):
          `SECTION_CONTENT=$'\n## Security Escalation\n\n'"$(cat docs/agents/AGENTS-security-section.md)"$'\n'; sed -i '' "/^## Commands/i\\${SECTION_CONTENT}" ~/.config/opencode/AGENTS.md`
        - Verify: `grep -n "## " ~/.config/opencode/AGENTS.md` — Security Escalation must appear between Agents and Commands
        — MUST happen BEFORE QA
     3. Run all QA scenarios (they check `~/.config/opencode/AGENTS.md`)
     4. If all QA pass → commit `docs/agents/AGENTS-security-section.md` to repo

- [ ] 3. Write `docs/AEGIS.md` — User-Facing Documentation

  **What to do**:
  1. Create `docs/AEGIS.md` in the project repository
  2. Structure the document with these sections:
     - **Title + one-line summary**: `# Aegis — Security Analyst Agent` + "Harness-aware deep security analysis with structured verdicts."
     - **What is Aegis?**: 2-3 paragraph explanation. Aegis is the specialist doctor to the plugin's immune system. It performs deep analysis the plugin cannot: whole-repo scans, dependency audits, secrets scanning, audit log forensics, threat modeling. It is permanently read-only (edit: deny) and produces structured SAFE/RISKY/BLOCKED verdicts.
     - **When is Aegis called?**: Summarize the 8 trigger conditions from the design doc (reference the full table in AGENTS.md). Include the 3 anti-triggers. Note that Aegis can also be invoked directly by the user with `@aegis`.
     - **How to invoke Aegis**: Show concrete examples:
       - `@aegis Run a full security audit of this project` → `full-audit`
       - `@aegis Review the auth changes in src/auth/` → `auth-review`
       - `@aegis Check this branch before I merge` → `pre-merge-review`
       - `@aegis Scan dependencies for vulnerabilities` → `dependency-audit`
     - **Verdict Format**: Explain the 3 verdict levels (SAFE/RISKY/BLOCKED) with the definitions from design doc Section 4. Show a sample verdict output.
     - **Capability Comparison**: Table comparing Plugin vs Aegis vs security-analyst (condensed version of design doc Section 1 capability matrix). Focus on the key differences: trigger type, scope, scanner access, structured verdicts.
     - **Prerequisites**: List required scanners (semgrep, trivy, trufflehog) + `harness-policy.json`. Note that Aegis degrades gracefully if scanners are missing.
     - **Architecture Decision**: Brief note on why Aegis is read-only (no conflict of interest, fixes go through normal edit path with plugin guardrails). Reference design doc Risk 3.
  3. Keep the document concise — target 100-150 lines. This is user-facing docs, not an architecture document.
  4. Use the same markdown style as existing docs in the `docs/` directory.

  **Must NOT do**:
  - Do NOT duplicate the full design document — reference it instead
  - Do NOT include implementation details (TypeScript code, hook internals)
  - Do NOT document internal plugin ↔ Aegis data flow (that's in the design doc)
  - Do NOT add installation instructions beyond "place aegis.md at ~/.config/opencode/agents/"
  - Do NOT write a tutorial — this is reference documentation

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: This is pure technical documentation — no code, no design decisions. The `writing` category is optimized for prose quality.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: Ensures markdown formatting consistency with project conventions.
  - **Skills Evaluated but Omitted**:
    - `Prompting`: No prompt authoring — this is user docs, not a system prompt.
    - `SecurityReview`: Not auditing code — writing documentation about a security tool.
    - `ContentWriter`: This is technical reference docs, not a blog post or social media content.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with A1-01, A1-02)
  - **Blocks**: None
  - **Blocked By**: None (references design doc directly, not aegis.md)

  **References**:

  **Pattern References**:
  - `docs/SPEC.md` — Existing documentation style and formatting conventions in this project. Follow the same markdown patterns (headers, tables, code blocks).
  - `docs/design/aegis-dual-component-design.md:9-42` — Section 1: Capability matrix. Condense this into a user-friendly comparison table for the "Capability Comparison" section.

  **API/Type References**:
  - `docs/design/aegis-dual-component-design.md:116-155` — Section 4: Structured response format + verdict definitions. Use this for the "Verdict Format" section with a sample output.
  - `docs/design/aegis-dual-component-design.md:88-112` — Section 3: Trigger conditions. Summarize for the "When is Aegis called?" section.
  - `docs/design/aegis-dual-component-design.md:400-432` — Section 8: Architectural risks. Reference Risk 3 (boundary creep) in the "Architecture Decision" section.

  **WHY Each Reference Matters**:
  - SPEC.md establishes the documentation voice and formatting for this project.
  - The design doc sections contain the exact content to condense into user-facing docs — don't reinvent.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: docs/AEGIS.md exists with all required sections
    Tool: Bash
    Preconditions: docs/ directory exists
    Steps:
      1. Run: test -f docs/AEGIS.md && echo "EXISTS" || echo "MISSING"
      2. Assert output is "EXISTS"
      3. Run: grep "## What is Aegis" docs/AEGIS.md
      4. Assert match found
      5. Run: grep -i "when.*called\|when.*invoke\|trigger" docs/AEGIS.md
      6. Assert match found (trigger section)
      7. Run: grep -i "verdict.*format\|SAFE.*RISKY.*BLOCKED" docs/AEGIS.md
      8. Assert match found (verdict section)
      9. Run: grep -i "capability\|comparison\|plugin.*aegis\|aegis.*plugin" docs/AEGIS.md
      10. Assert match found (comparison section)
    Expected Result: File exists with all 4+ required sections
    Failure Indicators: File missing or any required section absent
    Evidence: .sisyphus/evidence/task-3-sections.txt

  Scenario: Invocation examples are present
    Tool: Bash
    Preconditions: docs/AEGIS.md exists
    Steps:
      1. Run: grep "@aegis" docs/AEGIS.md
      2. Assert at least 3 matches (invocation examples)
      3. Run: grep -E "full-audit|auth-review|pre-merge-review|dependency-audit" docs/AEGIS.md
      4. Assert at least 2 task types mentioned in examples
    Expected Result: Multiple concrete invocation examples with task type mapping
    Failure Indicators: Fewer than 3 @aegis examples, no task types in examples
    Evidence: .sisyphus/evidence/task-3-examples.txt

  Scenario: Prerequisites section mentions required scanners
    Tool: Bash
    Preconditions: docs/AEGIS.md exists
    Steps:
      1. Run: grep -i "semgrep" docs/AEGIS.md
      2. Assert match found
      3. Run: grep -i "trivy" docs/AEGIS.md
      4. Assert match found
      5. Run: grep -i "trufflehog" docs/AEGIS.md
      6. Assert match found
      7. Run: grep -i "harness-policy" docs/AEGIS.md
      8. Assert match found
    Expected Result: All 3 scanners and policy file mentioned
    Failure Indicators: Any prerequisite missing
    Evidence: .sisyphus/evidence/task-3-prerequisites.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-sections.txt
  - [ ] task-3-examples.txt
  - [ ] task-3-prerequisites.txt

  **Commit**: YES
  - Message: `docs(aegis): add user-facing Aegis documentation`
  - Files: `docs/AEGIS.md`
  - Pre-commit: All QA scenarios pass

- [ ] 4. Smoke Test — Verify Aegis Loads and Responds Correctly

  **What to do**:
  1. Verify `aegis.md` is syntactically correct and loadable by OpenCode:
     - Confirm the YAML frontmatter parses without errors
     - Confirm the file is at the correct path (`~/.config/opencode/agents/aegis.md`)
  2. Run a "dependency audit" test (defined task type: `dependency-audit`):
     - Invoke Aegis with: `@aegis Scan dependencies for vulnerabilities`
     - Expected: Aegis invokes `trivy fs` or `bun audit`, returns a structured verdict (SAFE/RISKY/BLOCKED), includes Findings table and scanner footer
     - Verify the response contains the structured format (🛡️ header, Verdict, Findings table)
  3. Run a "auth review" test (defined task type: `auth-review`):
     - Invoke Aegis with: `@aegis Review authentication and authorization code for security issues`
     - Expected: Aegis returns a structured verdict referencing relevant source files, includes remediation section
     - Verify the response includes findings referencing src/ files or a "no findings" note
  4. Run a "full audit" test (defined task type: `full-audit`):
     - Invoke Aegis with: `@aegis Run a full security audit of this project`
     - Expected: Aegis attempts to run scanners (semgrep, trivy, trufflehog). If scanners are installed, results are included. If not, Aegis reports DEGRADED status and falls back to grep-based analysis.
     - Verify the response includes the structured verdict format
  5. Document all test results in `.sisyphus/evidence/task-4-smoke-test.md`:
     - For each test: input prompt, actual output (truncated if long), verdict received, pass/fail
     - Note any issues discovered (YAML parse errors, missing sections, wrong verdict)
  6. If any test fails, create an issue describing the failure — do NOT attempt to fix aegis.md (that would require going back to A1-01 scope)

  **Must NOT do**:
  - Do NOT modify `aegis.md` — this task is verification only
  - Do NOT write automated test scripts — these are manual verification steps executed by the agent
  - Do NOT skip any of the 4 test scenarios
  - Do NOT mark the task as passed if any scenario fails — report the failure

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification-only task. Run 4 commands, check outputs, record results. No complex reasoning or code writing needed.
  - **Skills**: [`CodingStandards`]
    - `CodingStandards`: Ensures evidence file is properly formatted markdown.
  - **Skills Evaluated but Omitted**:
    - `SecurityReview`: Not performing a security audit — testing that the security agent works.
    - `playwright`: No browser interaction needed — this is CLI verification.
    - `TddWorkflow`: Not writing unit tests — documenting manual smoke test results.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: None
  - **Blocked By**: A1-01 (needs aegis.md to exist before testing)

  **References**:

  **Pattern References**:
  - `~/.config/opencode/agents/aegis.md` — The file being tested. Read it to understand what Aegis should do, then invoke it and verify behavior matches.

  **API/Type References**:
  - `docs/design/aegis-dual-component-design.md:116-155` — Section 4: Expected response format and verdict definitions. Use to validate that Aegis output matches the spec.

  **WHY Each Reference Matters**:
  - The agent file defines what Aegis should do — tests verify it does what it says.
  - The design doc defines the expected output format — tests verify format compliance.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Aegis handles dependency-audit task type
    Tool: Bash
    Preconditions: aegis.md exists at ~/.config/opencode/agents/aegis.md, opencode is installed
    Steps:
      1. Run: opencode run --agent aegis "Scan dependencies for vulnerabilities" 2>&1 | tee /tmp/aegis-dep-test.txt
      2. Read output from /tmp/aegis-dep-test.txt
      3. Assert output contains a verdict (SAFE, RISKY, or BLOCKED)
      4. Assert output contains "Aegis Security Assessment" header
      5. Assert output references trivy or bun audit (scanner invocation)
    Expected Result: Structured dependency-audit response with scanner invocation
    Failure Indicators: Missing verdict, no scanner mention, unstructured response
    Evidence: .sisyphus/evidence/task-4-dep-audit.txt

  Scenario: Aegis handles auth-review task type
    Tool: Bash
    Preconditions: aegis.md exists, opencode is installed
    Steps:
      1. Run: opencode run --agent aegis "Review authentication and authorization code for security issues" 2>&1 | tee /tmp/aegis-auth-test.txt
      2. Read output from /tmp/aegis-auth-test.txt
      3. Assert output contains a verdict (SAFE, RISKY, or BLOCKED)
      4. Assert output contains a Findings table or "no findings" note
      5. Assert output contains a Remediation section
    Expected Result: Structured auth-review response with findings and remediation
    Failure Indicators: No verdict, missing sections, crash/error
    Evidence: .sisyphus/evidence/task-4-auth-review.txt

  Scenario: Aegis handles full-audit task type
    Tool: Bash
    Preconditions: aegis.md exists, opencode is installed, project has harness-policy.json
    Steps:
      1. Run: opencode run --agent aegis "Run a full security audit of this project" 2>&1 | tee /tmp/aegis-audit-test.txt
      2. Read output from /tmp/aegis-audit-test.txt
      3. Assert output contains a verdict (SAFE, RISKY, or BLOCKED)
      4. Assert output contains scanner invocation attempts OR DEGRADED warning
      5. Assert output references harness-policy.json (either read it or noted it)
    Expected Result: Structured audit response with scanner results or graceful degradation
    Failure Indicators: No verdict, no scanner mention, crash/error
    Evidence: .sisyphus/evidence/task-4-full-audit.txt

  Scenario: Evidence file captures all results
    Tool: Bash
    Preconditions: All 3 test scenarios completed
    Steps:
      1. Create .sisyphus/evidence/task-4-smoke-test.md summarizing:
         - Test 1: dependency-audit → verdict received
         - Test 2: auth-review → verdict received
         - Test 3: full-audit → verdict received
         - Overall: PASS/FAIL with notes
      2. Verify file exists: test -f .sisyphus/evidence/task-4-smoke-test.md
    Expected Result: Comprehensive evidence file documenting all test results
    Failure Indicators: Missing evidence file, incomplete test documentation
    Evidence: .sisyphus/evidence/task-4-smoke-test.md
  ```

  **Evidence to Capture:**
  - [ ] task-4-safe-verdict.txt
  - [ ] task-4-blocked-verdict.txt
  - [ ] task-4-full-audit.txt
  - [ ] task-4-smoke-test.md (summary)

  **Commit**: NO (verification only — no committed files)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for keywords). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [4/4] | VERDICT: APPROVE/REJECT`

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Plan compliance audit produces a verdict
    Tool: oracle (subagent)
    Preconditions: All A1-01..A1-04 tasks completed, evidence files exist in .sisyphus/evidence/
    Steps:
      1. Oracle reads .sisyphus/plans/aegis-agent.md end-to-end
      2. Oracle reads each deliverable file (docs/agents/aegis.md, docs/agents/AGENTS-security-section.md, docs/AEGIS.md)
      3. Oracle checks each "Must Have" against actual files — grepping for required keywords
      4. Oracle checks each "Must NOT Have" — grepping for forbidden patterns (edit: allow, arbitrary bash)
      5. Oracle checks .sisyphus/evidence/ directory for required evidence files
      6. Oracle emits structured output: Must Have [N/N] | Must NOT Have [N/N] | Tasks [4/4] | VERDICT
    Expected Result: APPROVE with all Must Have satisfied and no Must NOT Have violations
    Failure Indicators: REJECT with specific file:line citations; missing evidence files
    Evidence: .sisyphus/evidence/final-qa/f1-compliance.txt
  ```

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Verify YAML frontmatter is valid (no syntax errors). Check markdown formatting. Verify all cross-references (file paths mentioned in docs exist or are correctly noted as future). Check for AI slop patterns (excessive hedging, filler phrases, "feel free to").
  Output: `YAML [VALID/INVALID] | Markdown [CLEAN/N issues] | References [N/N valid] | Slop [CLEAN/N issues] | VERDICT`

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Code quality review produces a verdict
    Tool: unspecified-high (subagent)
    Preconditions: docs/agents/aegis.md, docs/agents/AGENTS-security-section.md, docs/AEGIS.md all exist
    Steps:
      1. Agent reads docs/agents/aegis.md and validates YAML frontmatter (no syntax errors, required keys present)
      2. Agent checks all three deliverable markdown files for formatting issues (broken tables, unclosed blocks)
      3. Agent grep-searches docs/ for file path references and verifies each exists or is clearly marked as future
      4. Agent searches all deliverable files for slop patterns: "feel free", "please note", "it's worth mentioning", excessive hedging
      5. Agent emits structured output: YAML [VALID/INVALID] | Markdown [CLEAN/N issues] | References [N/N valid] | Slop [CLEAN/N issues] | VERDICT
    Expected Result: YAML VALID, Markdown CLEAN, References all valid, Slop CLEAN — VERDICT: APPROVE
    Failure Indicators: YAML parse error; broken markdown; dead file reference; slop found
    Evidence: .sisyphus/evidence/final-qa/f2-quality.txt
  ```

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task. Load aegis.md, verify it parses. Check AGENTS.md has the new section. Verify docs/AEGIS.md covers all required topics. Run content completeness checks. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Cross-file consistency [N/N] | VERDICT`

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: All per-task QA scenarios pass
    Tool: unspecified-high (subagent)
    Preconditions: All A1-01..A1-04 evidence files exist in .sisyphus/evidence/
    Steps:
      1. Agent reads each evidence file from A1-01..A1-04 tasks
      2. For each QA scenario documented in A1-01: re-run the grep/check against live files and assert expected result
      3. For each QA scenario documented in A1-02: re-run the grep/check against ~/.config/opencode/AGENTS.md
      4. For each QA scenario documented in A1-03: re-run the grep/check against docs/AEGIS.md
      5. For each QA scenario documented in A1-04: read the evidence files and confirm all verdicts captured
      6. Check cross-file consistency: task types listed in aegis.md match task types in docs/AEGIS.md
      7. Agent emits: Scenarios [N/N pass] | Cross-file consistency [N/N] | VERDICT
    Expected Result: All scenarios pass; cross-file consistency clean
    Failure Indicators: Any scenario fails; task type mismatch between files
    Evidence: .sisyphus/evidence/final-qa/f3-manual-qa.txt
  ```

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual file. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect unaccounted file changes.
  Output: `Tasks [4/4 compliant] | Creep [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Scope fidelity check produces a verdict
    Tool: deep (subagent)
    Preconditions: All A1-01..A1-04 tasks completed
    Steps:
      1. Agent reads "What to do" for each of A1-01..A1-04 in this plan
      2. For A1-01: reads docs/agents/aegis.md and ~/.config/opencode/agents/aegis.md — verifies all required frontmatter keys and system prompt sections are present, no extra unauthorized sections added
      3. For A1-02: reads docs/agents/AGENTS-security-section.md and ~/.config/opencode/AGENTS.md — verifies only the Security Escalation section and @aegis table row were added
      4. For A1-03: reads docs/AEGIS.md — verifies the 4 core required sections are present (Purpose/What-is-Aegis, Invocation/How-to-invoke, Verdict format, Capability comparison); additional sections beyond these 4 are ALLOWED per Task 3 spec (lines 491-510)
      5. For A1-04: reads .sisyphus/evidence/task-4-smoke-test.md — verifies 3 test scenarios documented; aegis.md was not modified during testing
      6. Agent runs git diff --name-only to detect any unaccounted file changes outside docs/agents/ and docs/AEGIS.md
      7. Agent emits: Tasks [4/4 compliant] | Creep [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT
    Expected Result: All tasks 1:1 with spec; no creep; no unaccounted changes
    Failure Indicators: Missing spec requirement; added content beyond spec; unexpected file changes
    Evidence: .sisyphus/evidence/final-qa/f4-scope.txt
  ```

---

## Commit Strategy

The deliverable files for A1-01 and A1-02 are global config files outside the git repo (`~/.config/opencode/`). To keep the repo as the source of truth and enable atomic commits, adopt this concrete strategy:

1. **Author files in the repo** under `docs/agents/`:
   - `docs/agents/aegis.md` — canonical source for the Aegis agent definition
   - `docs/agents/AGENTS-security-section.md` — the new `## Security Escalation` section to append to `~/.config/opencode/AGENTS.md`
2. **Install step** (part of A1-01 task): `cp docs/agents/aegis.md ~/.config/opencode/agents/aegis.md` — run after committing the repo file
3. **Install step** (part of A1-02 task): 2-step install — (A) in-place edit to add `@aegis` row to the `## Agents` table; (B) sed insertion of `## Security Escalation` section BEFORE `## Commands` in `~/.config/opencode/AGENTS.md` (NOT append-to-EOF) — run BEFORE QA, BEFORE commit

| Commit | Tasks | Message | Files (repo paths) |
|--------|-------|---------|-------|
| 1 | A1-01 | `feat(aegis): add Aegis security analyst agent definition` | `docs/agents/aegis.md` |
| 2 | A1-02 | `docs(agents): add Aegis security escalation triggers section` | `docs/agents/AGENTS-security-section.md` |
| 3 | A1-03 | `docs(aegis): add user-facing Aegis documentation` | `docs/AEGIS.md` |

Note: A1-04 (smoke test) produces no committed files — verification only.

---

## Success Criteria

### Verification Commands

```bash
# Verify aegis.md exists and has correct frontmatter
grep -c "edit: deny" ~/.config/opencode/agents/aegis.md  # Expected: 1
grep -c "mode: subagent" ~/.config/opencode/agents/aegis.md  # Expected: 1
grep -c "temperature:" ~/.config/opencode/agents/aegis.md  # Expected: 1

# Verify all 7 task types are in the system prompt
for task in full-audit deep-scan dependency-audit auth-review pre-merge-review audit-override infra-review; do
  grep -c "$task" ~/.config/opencode/agents/aegis.md
done
# Expected: each returns >= 1

# Verify trigger conditions in AGENTS.md
grep -c "Security Escalation" ~/.config/opencode/AGENTS.md  # Expected: 1
grep -c "Sisyphus MUST call @aegis when:" ~/.config/opencode/AGENTS.md  # Expected: 1
grep -c "Sisyphus MUST NOT call @aegis" ~/.config/opencode/AGENTS.md  # Expected: 1

# Verify docs exist
test -f docs/AEGIS.md && echo "EXISTS" || echo "MISSING"  # Expected: EXISTS
```

### Final Checklist

- [ ] `aegis.md` has valid YAML frontmatter with `edit: deny`
- [ ] All 7 task types present in system prompt
- [ ] Structured verdict format (SAFE/RISKY/BLOCKED) specified
- [ ] Scanner availability check included in system prompt
- [ ] Graceful degradation when scanners missing
- [ ] `harness-policy.json` reading mandated before analysis
- [ ] 8 trigger conditions in AGENTS.md
- [ ] 3 anti-triggers in AGENTS.md
- [ ] `docs/AEGIS.md` covers: purpose, invocation, verdict format, capability comparison
- [ ] No `edit: allow` anywhere in aegis.md
- [ ] No arbitrary bash commands beyond the 13 whitelisted patterns
