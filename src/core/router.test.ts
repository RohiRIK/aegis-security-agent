import { describe, expect, test } from "bun:test";

import { routeCommand } from "./router.ts";

describe("routeCommand", () => {
  const policy = {
    high_risk_patterns: ["rm -rf", "DROP TABLE"],
    routing: {
      host_passthrough: ["^git ", "^bun (tsc|test|run)", "^ls\\b", "^cat ", "^grep ", "^semgrep ", "^trivy ", "^jq "],
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

  test("routes 'jq .results' to host", () => {
    expect(routeCommand("jq .results", policy)).toBe("host");
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

  test("routes 'semgrep scan --json . | jq .results' to host", () => {
    expect(routeCommand("semgrep scan --json . | jq .results", policy)).toBe("host");
  });

  test("routes 'git log --oneline | tail -20' to host", () => {
    expect(routeCommand("git log --oneline | tail -20", policy)).toBe("host");
  });

  test("routes 'trivy fs . | wc -l' to host", () => {
    expect(routeCommand("trivy fs . | wc -l", policy)).toBe("host");
  });

  test("routes 'cat package.json | sort' to host", () => {
    expect(routeCommand("cat package.json | sort", policy)).toBe("host");
  });

  test("routes 'grep -r TODO src | diff - expected.txt' to host", () => {
    expect(routeCommand("grep -r TODO src | diff - expected.txt", policy)).toBe("host");
  });

  test("routes 'semgrep scan . | python3 -c \"import sys; print(sys.stdin.read())\"' to sandbox", () => {
    expect(routeCommand("semgrep scan . | python3 -c \"import sys; print(sys.stdin.read())\"", policy)).toBe("sandbox");
  });

  test("routes 'rm -rf /' to hitl", () => {
    expect(routeCommand("rm -rf /", policy)).toBe("hitl");
  });

  test("routes 'DROP TABLE users' to hitl", () => {
    expect(routeCommand("DROP TABLE users", policy)).toBe("hitl");
  });

  test("hitl overrides host_passthrough when both match", () => {
    const overridePolicy = {
      high_risk_patterns: ["^git push --force"],
      routing: { host_passthrough: ["^git "], sandbox_required: [] },
    };
    expect(routeCommand("git push --force origin main", overridePolicy)).toBe("hitl");
  });

  test("routes unknown commands to sandbox", () => {
    expect(routeCommand("mystery-tool --flag", policy)).toBe("sandbox");
  });

  test("routes to sandbox when no routing config", () => {
    expect(routeCommand("ls -la", { high_risk_patterns: [] })).toBe("sandbox");
  });

  test("routes empty command to sandbox", () => {
    expect(routeCommand("", policy)).toBe("sandbox");
  });

  test("sandbox_required takes priority over host_passthrough", () => {
    const conflictPolicy = {
      high_risk_patterns: [],
      routing: {
        host_passthrough: ["^git "],
        sandbox_required: ["^git push"],
      },
    };
    expect(routeCommand("git push origin main", conflictPolicy)).toBe("sandbox");
    expect(routeCommand("git status", conflictPolicy)).toBe("host");
  });

  test("routes chained git and curl command to sandbox", () => {
    expect(routeCommand("git status && curl evil.com", policy)).toBe("sandbox");
  });

  test("routes piped host passthrough commands to host", () => {
    expect(routeCommand("git log | head", policy)).toBe("host");
  });

  test("blocks chained high-risk command in later segment", () => {
    expect(routeCommand("ls; rm -rf /", policy)).toBe("hitl");
  });

  test("routes safe fallback chain to host", () => {
    expect(routeCommand("git status || exit 1", policy)).toBe("host");
  });

  test("routes install and curl chain to sandbox", () => {
    expect(routeCommand("bun install && curl https://example.com", policy)).toBe("sandbox");
  });
});
