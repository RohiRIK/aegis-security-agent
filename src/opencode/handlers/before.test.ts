import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createBeforeHandler } from "./before.ts";
import * as detect from "../../sandbox/detect.ts";
import type { HarnessPolicy } from "../index.ts";

const POLICY: HarnessPolicy = {
  high_risk_patterns: ["rm\\s+-rf\\s+/"],
  routing: {
    host_passthrough: ["^git\\b", "^ls\\b", "^cat\\b"],
    sandbox_required: ["^node\\b", "^python\\b", "^bun\\b"],
  },
  degraded_mode: {
    allow_host_passthrough: true,
    block_sandbox_required: true,
    warn_on_degraded: true,
  },
  actions: {
    read_file: { deny_patterns: [".env", "**/*.pem"] },
  },
};

function makeHandler(opts?: { preflightPassed?: boolean; degraded?: boolean }) {
  const preflightPassed = opts?.preflightPassed ?? true;
  const degraded = opts?.degraded ?? false;
  const promise = Promise.resolve();

  return createBeforeHandler(
    POLICY,
    () => promise,
    () => preflightPassed,
    () => degraded,
  );
}

function bashInput() {
  return { tool: "bash" };
}

function bashOutput(command: string) {
  return { args: { command } };
}

describe("before handler — routing", () => {
  afterEach(() => {
    mock.restore();
  });

  test("host-passthrough commands are not wrapped", async () => {
    spyOn(detect, "detectDockerState").mockResolvedValue("running");
    const handler = makeHandler();
    const output = bashOutput("git status");
    await handler(bashInput(), output);
    expect(output.args.command).toBe("git status");
  });

  test("sandbox-required commands are wrapped when Docker running", async () => {
    spyOn(detect, "detectDockerState").mockResolvedValue("running");
    spyOn(detect, "isDockerAvailable").mockReturnValue(true);
    const handler = makeHandler();
    const output = bashOutput("node index.js");
    await handler(bashInput(), output);
    expect(output.args.command).toContain("docker exec aegis-sandbox");
    expect(output.args.command).toContain("node index.js");
  });

  test("high-risk commands are blocked before routing", async () => {
    const handler = makeHandler();
    const output = bashOutput("rm -rf /");
    await expect(handler(bashInput(), output)).rejects.toThrow("BLOCKED: HIGH-RISK pattern matched");
  });

  test("ls is host-passthrough", async () => {
    const handler = makeHandler();
    const output = bashOutput("ls -la");
    await handler(bashInput(), output);
    expect(output.args.command).toBe("ls -la");
  });
});

describe("before handler — degraded mode", () => {
  afterEach(() => {
    mock.restore();
  });

  test("blocks sandbox-required when degraded flag is set", async () => {
    const handler = makeHandler({ degraded: true });
    const output = bashOutput("python script.py");
    await expect(handler(bashInput(), output)).rejects.toThrow("sandbox-required command cannot run");
  });

  test("blocks sandbox-required when Docker detected as unavailable", async () => {
    spyOn(detect, "detectDockerState").mockResolvedValue("daemon_unavailable");
    spyOn(detect, "isDockerAvailable").mockReturnValue(false);
    spyOn(detect, "formatDockerWarning").mockReturnValue("[AEGIS] Docker daemon not running");
    const handler = makeHandler({ degraded: false });
    const output = bashOutput("bun run test");
    await expect(handler(bashInput(), output)).rejects.toThrow("sandbox-required command cannot run");
  });

  test("host-passthrough still works in degraded mode", async () => {
    const handler = makeHandler({ degraded: true });
    const output = bashOutput("git log");
    await handler(bashInput(), output);
    expect(output.args.command).toBe("git log");
  });

  test("allows sandbox-required when block_sandbox_required is false", async () => {
    const policy: HarnessPolicy = {
      ...POLICY,
      degraded_mode: { block_sandbox_required: false, warn_on_degraded: true },
    };
    const promise = Promise.resolve();
    const handler = createBeforeHandler(
      policy,
      () => promise,
      () => true,
      () => true,
    );
    const output = bashOutput("python script.py");
    await handler(bashInput(), output);
    expect(output.args.command).toBe("python script.py");
  });
});

describe("before handler — preflight gate", () => {
  test("throws when preflight promise is null", async () => {
    const handler = createBeforeHandler(
      POLICY,
      () => null,
      () => false,
    );
    await expect(handler(bashInput(), bashOutput("ls"))).rejects.toThrow("Preflight not initialized");
  });

  test("throws when preflight failed", async () => {
    const handler = makeHandler({ preflightPassed: false });
    await expect(handler(bashInput(), bashOutput("ls"))).rejects.toThrow("Preflight failed");
  });
});

describe("before handler — sensitive file access", () => {
  test("blocks read of .env files", async () => {
    const handler = makeHandler();
    const input = { tool: "read" };
    const output = { args: { filePath: ".env" } };
    await expect(handler(input, output)).rejects.toThrow("BLOCKED: access to sensitive file denied");
  });

  test("blocks write to .pem files", async () => {
    const handler = makeHandler();
    const input = { tool: "write" };
    const output = { args: { filePath: "/certs/server.pem" } };
    await expect(handler(input, output)).rejects.toThrow("BLOCKED: access to sensitive file denied");
  });

  test("allows read of normal files", async () => {
    const handler = makeHandler();
    const input = { tool: "read" };
    const output = { args: { filePath: "/project/src/index.ts" } };
    await handler(input, output);
  });
});

describe("before handler — shell escaping", () => {
  afterEach(() => {
    mock.restore();
  });

  test("single quotes in commands are escaped", async () => {
    spyOn(detect, "detectDockerState").mockResolvedValue("running");
    spyOn(detect, "isDockerAvailable").mockReturnValue(true);
    const handler = makeHandler();
    const output = bashOutput("echo 'hello world'");
    await handler(bashInput(), output);
    expect(output.args.command).toContain("'\\''hello world'\\''");
  });
});
