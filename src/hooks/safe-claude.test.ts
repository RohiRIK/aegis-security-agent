import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { runCommandCapture } from "../lib/base.ts";

const FIXTURES_DIR = resolve(import.meta.dir, "__fixtures__");

describe("safeClaude", () => {
  test("passes valid JSON through hookFn and exits 0", async () => {
    const script = resolve(FIXTURES_DIR, "safe-claude-passthrough.ts");
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } });
    const result = await runCommandCapture(["bun", "run", script], { stdinText: input });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.tool_name).toBe("Bash");
  });

  test("emits {} and exits 0 on malformed JSON", async () => {
    const script = resolve(FIXTURES_DIR, "safe-claude-passthrough.ts");
    const result = await runCommandCapture(["bun", "run", script], { stdinText: "NOT JSON" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).toContain("[AEGIS]");
  });

  test("emits {} on truncated JSON (rejects startsWith heuristic)", async () => {
    const script = resolve(FIXTURES_DIR, "safe-claude-passthrough.ts");
    const result = await runCommandCapture(["bun", "run", script], { stdinText: '{"x":' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).toContain("[AEGIS]");
  });

  test("emits {} and exits 0 on empty stdin", async () => {
    const script = resolve(FIXTURES_DIR, "safe-claude-passthrough.ts");
    const result = await runCommandCapture(["bun", "run", script], { stdinText: "" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
  });

  test("catches hookFn errors and exits 0", async () => {
    const script = resolve(FIXTURES_DIR, "safe-claude-throw.ts");
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } });
    const result = await runCommandCapture(["bun", "run", script], { stdinText: input });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.tool_name).toBe("Bash");
    expect(result.stderr).toContain("[AEGIS]");
  });
});
