import { describe, expect, test } from "bun:test";
import { createBeforeHandler } from "./before.ts";
import type { AegisPolicy } from "../index.ts";

const POLICY: AegisPolicy = {
  high_risk_patterns: ["rm\\s+-rf\\s+/"],
  actions: {
    read_file: { deny_patterns: [".env", "**/*.pem"] },
  },
};

function makeHandler() {
  return createBeforeHandler(POLICY);
}

function bashInput() { return { tool: "bash" }; }
function bashOutput(command: string) { return { args: { command } }; }

describe("before handler — high-risk blocking", () => {
  test("warns but allows rm -rf /", async () => {
    const handler = makeHandler();
    await expect(handler(bashInput(), bashOutput("rm -rf /"))).resolves.toBeUndefined();
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

describe("before handler — latency gate", () => {
  test("completes instantly", async () => {
    const handler = makeHandler();
    const start = performance.now();
    await handler(bashInput(), bashOutput("ls"));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  test("never throws regardless of input", async () => {
    const handler = makeHandler();
    await expect(handler(bashInput(), bashOutput("ls"))).resolves.toBeUndefined();
    await expect(handler({ tool: "read" }, { args: {} })).resolves.toBeUndefined();
    await expect(handler({ tool: "write" }, { args: {} })).resolves.toBeUndefined();
  });
});

describe("before handler — sensitive file access", () => {
  test("warns but allows read of .env files", async () => {
    const handler = makeHandler();
    await expect(handler({ tool: "read" }, { args: { filePath: ".env" } })).resolves.toBeUndefined();
  });

  test("warns but allows write to .pem files", async () => {
    const handler = makeHandler();
    await expect(handler({ tool: "write" }, { args: { filePath: "/certs/server.pem" } })).resolves.toBeUndefined();
  });

  test("allows read of normal files", async () => {
    const handler = makeHandler();
    await expect(handler({ tool: "read" }, { args: { filePath: "/project/src/index.ts" } })).resolves.toBeUndefined();
  });
});
