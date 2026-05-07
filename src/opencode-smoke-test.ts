import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { AegisPolicy } from "./opencode/index.ts";
import { createAfterHandler } from "./opencode/handlers/after.ts";
import { createBeforeHandler } from "./opencode/handlers/before.ts";
import { createEnvHandler } from "./opencode/handlers/env.ts";
import { DEFAULT_SENSITIVE_VARS } from "./core/security.ts";

const ROOT = resolve(import.meta.dir, "..");
const POLICY = JSON.parse(await Bun.file(join(ROOT, "aegis-policy.json")).text()) as AegisPolicy;

type BeforeInput = {
  tool: string;
  sessionID: string;
  callID: string;
};

type BeforeOutput = {
  args?: {
    command?: string;
    filePath?: string;
    path?: string;
  };
};

type AfterInput = BeforeInput & {
  args?: {
    filePath?: string;
    path?: string;
  };
};

type AfterOutput = {
  args?: {
    filePath?: string;
    path?: string;
  };
  output: string;
};

function makeBeforeHandler() {
  return createBeforeHandler(POLICY);
}

describe("OpenCode Plugin Smoke Tests", () => {
  let tempDir = "";
  let tempPythonFile = "";

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencode-smoke-"));
    tempPythonFile = join(tempDir, "semgrep-smoke.py");
    await Bun.write(tempPythonFile, "import subprocess\nsubprocess.run(user_input, shell=True)\n");
  });

  afterAll(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("OC-01: tool.execute.before HIGH-RISK bash warns but does not throw", async () => {
    const handler = makeBeforeHandler();
    const input: BeforeInput = { tool: "bash", sessionID: "s1", callID: "c1" };
    const output: BeforeOutput = { args: { command: "rm -rf /" } };

    await expect(handler(input, output)).resolves.toBeUndefined();
  });

  it("OC-02: tool.execute.before safe bash resolves", async () => {
    const handler = makeBeforeHandler();
    const input: BeforeInput = { tool: "bash", sessionID: "s1", callID: "c1" };
    const output: BeforeOutput = { args: { command: "ls -la" } };

    await expect(handler(input, output)).resolves.toBeUndefined();
  });

  it("OC-03: tool.execute.before reads .env warns but does not throw", async () => {
    const handler = createBeforeHandler({
      ...POLICY,
      actions: {
        ...POLICY.actions,
        read_file: {
          ...POLICY.actions?.read_file,
          deny_patterns: [...(POLICY.actions?.read_file?.deny_patterns ?? []), "/project/.env"],
        },
      },
    });
    const input: BeforeInput = { tool: "read", sessionID: "s1", callID: "c1" };
    const output: BeforeOutput = { args: { filePath: "/project/.env" } };

    await expect(handler(input, output)).resolves.toBeUndefined();
  });

  it("OC-04: tool.execute.before safe file read resolves", async () => {
    const handler = makeBeforeHandler();
    const input: BeforeInput = { tool: "read", sessionID: "s1", callID: "c1" };
    const output: BeforeOutput = { args: { filePath: "src/index.ts" } };

    await expect(handler(input, output)).resolves.toBeUndefined();
  });

  it("OC-05: tool.execute.before safe bash command passes through unchanged", async () => {
    const handler = makeBeforeHandler();
    const input: BeforeInput = { tool: "bash", sessionID: "s1", callID: "c1" };
    const output: BeforeOutput = { args: { command: "ls" } };

    await handler(input, output);

    expect(output.args?.command).toBe("ls");
  });

  it("OC-06: tool.execute.after write with shell injection appends semgrep findings", async () => {
    const handler = createAfterHandler();
    const input: AfterInput = {
      tool: "write",
      sessionID: "s1",
      callID: "c1",
      args: { filePath: tempPythonFile },
    };
    const output: AfterOutput = {
      args: { filePath: tempPythonFile },
      output: "",
    };

    await handler(input, output);

    expect(output.output).toContain("[AEGIS]");
  });

  it("OC-07: shell.env strips AWS_SECRET_ACCESS_KEY and keeps PATH", async () => {
    const handler = createEnvHandler(DEFAULT_SENSITIVE_VARS);
    const output = {
      env: {
        AWS_SECRET_ACCESS_KEY: "secret-value",
        PATH: "/usr/bin",
      },
    };

    await handler({}, output);

    expect(output.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(output.env.PATH).toBe("/usr/bin");
  });

  it("OC-08: before handler completes instantly with no preflight", async () => {
    const handler = makeBeforeHandler();
    const input: BeforeInput = { tool: "bash", sessionID: "s1", callID: "c1" };

    const start = performance.now();
    await handler(input, { args: { command: "ls" } });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
