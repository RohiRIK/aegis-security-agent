import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

import { routeCommand } from "../core/router.ts";
import { runCommandCapture } from "../lib/base.ts";

describe("routeCommand", () => {
  const policy = {
    high_risk_patterns: ["rm -rf", "DROP TABLE"],
    routing: {
      host_passthrough: ["^git ", "^bun (tsc|test|run)", "^ls\\b", "^cat "],
      sandbox_required: ["^curl ", "^python ", "^node "],
    },
  };

  test("routes 'git status' to host", () => {
    expect(routeCommand("git status", policy)).toBe("host");
  });

  test("routes 'git push origin main' to host", () => {
    expect(routeCommand("git push origin main", policy)).toBe("host");
  });

  test("routes 'bun tsc --noEmit' to host", () => {
    expect(routeCommand("bun tsc --noEmit", policy)).toBe("host");
  });

  test("routes 'bun test' to host", () => {
    expect(routeCommand("bun test", policy)).toBe("host");
  });

  test("routes 'bun run build' to host", () => {
    expect(routeCommand("bun run build", policy)).toBe("host");
  });

  test("routes 'ls -la' to host", () => {
    expect(routeCommand("ls -la", policy)).toBe("host");
  });

  test("routes 'cat file.txt' to host", () => {
    expect(routeCommand("cat file.txt", policy)).toBe("host");
  });

  test("routes 'curl https://example.com' to sandbox", () => {
    expect(routeCommand("curl https://example.com", policy)).toBe("sandbox");
  });

  test("routes 'python script.py' to sandbox", () => {
    expect(routeCommand("python script.py", policy)).toBe("sandbox");
  });

  test("routes 'node index.js' to sandbox", () => {
    expect(routeCommand("node index.js", policy)).toBe("sandbox");
  });

  test("routes 'rm -rf /' to sandbox", () => {
    expect(routeCommand("rm -rf /", policy)).toBe("sandbox");
  });

  test("routes 'DROP TABLE users' to sandbox", () => {
    expect(routeCommand("DROP TABLE users", policy)).toBe("sandbox");
  });

  test("high-risk overrides host_passthrough when both match", () => {
    const overridePolicy = {
      high_risk_patterns: ["^git push --force"],
      routing: { host_passthrough: ["^git "], sandbox_required: [] },
    };

    expect(routeCommand("git push --force origin main", overridePolicy)).toBe("sandbox");
  });

  test("routes unknown commands to sandbox", () => {
    expect(routeCommand("mystery-tool --flag", policy)).toBe("sandbox");
  });

  test("routes to sandbox when no routing config", () => {
    expect(routeCommand("ls -la", { high_risk_patterns: [] })).toBe("sandbox");
  });
});

const HOOK_SCRIPT = resolve(import.meta.dir, "pre-tool-use.ts");

describe("pre-tool-use hook: never blocks invariant", () => {
  test("high-risk command exits 0 (advisory, not block)", async () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -rf /" } });
    const result = await runCommandCapture(["bun", "run", HOOK_SCRIPT], { stdinText: input });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toBeDefined();
  });

  test("malformed JSON input exits 0 (never crash)", async () => {
    const result = await runCommandCapture(["bun", "run", HOOK_SCRIPT], { stdinText: "NOT VALID JSON" });
    expect(result.exitCode).toBe(0);
  });

  test("missing policy file exits 0 (graceful degradation)", async () => {
    const projectRoot = resolve(import.meta.dir, "..", "..");
    const policyPath = join(projectRoot, "aegis-policy.json");
    const backupPath = join(projectRoot, "aegis-policy.json.bak");

    const policyFile = Bun.file(policyPath);
    const exists = await policyFile.exists();
    if (exists) {
      const content = await policyFile.text();
      await Bun.write(backupPath, content);
      const { unlinkSync } = await import("node:fs");
      unlinkSync(policyPath);
    }

    try {
      const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } });
      const result = await runCommandCapture(["bun", "run", HOOK_SCRIPT], { stdinText: input });
      expect(result.exitCode).toBe(0);
    } finally {
      if (exists) {
        const backupFile = Bun.file(backupPath);
        const content = await backupFile.text();
        await Bun.write(policyPath, content);
        const { unlinkSync } = await import("node:fs");
        unlinkSync(backupPath);
      }
    }
  });

  test("install command (Trivy would-block) exits 0 (advisory)", async () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm install malicious-pkg" } });
    const result = await runCommandCapture(["bun", "run", HOOK_SCRIPT], { stdinText: input });
    expect(result.exitCode).toBe(0);
  });

  test("non-Bash tool passes through unchanged with exit 0", async () => {
    const input = JSON.stringify({ tool_name: "Read", tool_input: { path: "/tmp/test.txt" } });
    const result = await runCommandCapture(["bun", "run", HOOK_SCRIPT], { stdinText: input });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.tool_name).toBe("Read");
  });

  test("empty stdin exits 0", async () => {
    const result = await runCommandCapture(["bun", "run", HOOK_SCRIPT], { stdinText: "" });
    expect(result.exitCode).toBe(0);
  });
});
