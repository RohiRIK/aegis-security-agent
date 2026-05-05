import { describe, expect, test } from "bun:test";
import { createBeforeHandler } from "./before.ts";
import type { AegisPolicy } from "../index.ts";

const POLICY: AegisPolicy = {
  high_risk_patterns: ["rm\\s+-rf\\s+/"],
  actions: {
    read_file: { deny_patterns: [".env", "**/*.pem"] },
  },
};

function makeHandler(opts?: { preflightPassed?: boolean }) {
  const preflightPassed = opts?.preflightPassed ?? true;
  const promise = Promise.resolve();
  return createBeforeHandler(POLICY, () => promise, () => preflightPassed);
}

function bashInput() { return { tool: "bash" }; }
function bashOutput(command: string) { return { args: { command } }; }

describe("before handler — high-risk blocking", () => {
  test("blocks rm -rf /", async () => {
    const handler = makeHandler();
    await expect(handler(bashInput(), bashOutput("rm -rf /"))).rejects.toThrow("BLOCKED: HIGH-RISK pattern matched");
  });

  test("allows safe commands", async () => {
    const handler = makeHandler();
    await expect(handler(bashInput(), bashOutput("ls -la"))).resolves.toBeUndefined();
  });

  test("allows git commands", async () => {
    const handler = makeHandler();
    await expect(handler(bashInput(), bashOutput("git status"))).resolves.toBeUndefined();
  });
});

describe("before handler — preflight gate", () => {
  test("throws after 500ms when preflight promise stays null", async () => {
    const handler = createBeforeHandler(POLICY, () => null, () => false);
    const start = Date.now();
    await expect(handler(bashInput(), bashOutput("ls"))).rejects.toThrow("Preflight not initialized");
    expect(Date.now() - start).toBeGreaterThanOrEqual(490);
  }, 2000);

  test("resolves once preflight promise is set during polling window", async () => {
    let resolveDeferred!: () => void;
    const deferred = new Promise<void>(r => { resolveDeferred = r; });
    let promise: Promise<void> | null = null;

    const handler = createBeforeHandler(POLICY, () => promise, () => true);

    setTimeout(() => {
      promise = deferred;
      resolveDeferred();
    }, 100);

    await expect(handler(bashInput(), bashOutput("ls"))).resolves.toBeUndefined();
  }, 2000);

  test("warns but continues when preflight failed", async () => {
    const handler = makeHandler({ preflightPassed: false });
    await expect(handler(bashInput(), bashOutput("ls"))).resolves.toBeUndefined();
  });
});

describe("before handler — sensitive file access", () => {
  test("blocks read of .env files", async () => {
    const handler = makeHandler();
    await expect(handler({ tool: "read" }, { args: { filePath: ".env" } })).rejects.toThrow("BLOCKED: access to sensitive file denied");
  });

  test("blocks write to .pem files", async () => {
    const handler = makeHandler();
    await expect(handler({ tool: "write" }, { args: { filePath: "/certs/server.pem" } })).rejects.toThrow("BLOCKED: access to sensitive file denied");
  });

  test("allows read of normal files", async () => {
    const handler = makeHandler();
    await expect(handler({ tool: "read" }, { args: { filePath: "/project/src/index.ts" } })).resolves.toBeUndefined();
  });
});
