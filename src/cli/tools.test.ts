import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import * as manager from "../lib/provisioner/manager.ts";
import type { ProvisionResult, ToolInfo } from "../lib/provisioner/types.ts";
import { parseToolsFlags, runToolsCommand, runToolsInstall, runToolsRemove, runToolsStatus } from "./tools.ts";

let installSpy: ReturnType<typeof spyOn>;
let removeSpy: ReturnType<typeof spyOn>;
let listSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  installSpy = spyOn(manager, "installTool").mockImplementation(
    async (_scanner: string, _opts?: { ci?: boolean }): Promise<ProvisionResult> => ({
      success: true,
      toolPath: `/mock/bin/${_scanner}`,
    }),
  );

  removeSpy = spyOn(manager, "removeTool").mockImplementation(async (_scanner: string): Promise<void> => {});

  listSpy = spyOn(manager, "listTools").mockImplementation(
    async (): Promise<ToolInfo[]> => [
      { name: "trivy", state: "installed", version: "0.50.0", path: "/mock/bin/trivy", source: "provisioned" },
      { name: "trufflehog", state: "not_installed", version: "", path: "", source: "none" },
      { name: "semgrep", state: "system", version: "1.60.0", path: "/usr/bin/semgrep", source: "system" },
    ],
  );
});

afterEach(() => {
  installSpy.mockRestore();
  removeSpy.mockRestore();
  listSpy.mockRestore();
});

function captureOutput(fn: () => Promise<number>): Promise<{ code: number; output: string }> {
  let captured = "";
  const spy = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    captured += String(chunk);
    return true;
  });
  return fn().then((code) => {
    spy.mockRestore();
    return { code, output: captured };
  });
}

describe("parseToolsFlags", () => {
  test("returns defaults when no args", () => {
    const flags = parseToolsFlags([]);
    expect(flags.tool).toBeUndefined();
    expect(flags.all).toBe(false);
    expect(flags.ci).toBe(false);
  });

  test("parses --tool=trivy", () => {
    const flags = parseToolsFlags(["--tool=trivy"]);
    expect(flags.tool).toBe("trivy");
  });

  test("parses --tool=trufflehog", () => {
    const flags = parseToolsFlags(["--tool=trufflehog"]);
    expect(flags.tool).toBe("trufflehog");
  });

  test("parses --tool=semgrep", () => {
    const flags = parseToolsFlags(["--tool=semgrep"]);
    expect(flags.tool).toBe("semgrep");
  });

  test("parses --all flag", () => {
    const flags = parseToolsFlags(["--all"]);
    expect(flags.all).toBe(true);
  });

  test("parses --ci flag", () => {
    const flags = parseToolsFlags(["--ci"]);
    expect(flags.ci).toBe(true);
  });

  test("parses combined flags", () => {
    const flags = parseToolsFlags(["--tool=trivy", "--ci"]);
    expect(flags.tool).toBe("trivy");
    expect(flags.ci).toBe(true);
    expect(flags.all).toBe(false);
  });
});

describe("runToolsInstall", () => {
  test("with --tool=trivy calls installTool('trivy') and returns 0", async () => {
    const { code } = await captureOutput(() =>
      runToolsInstall({ tool: "trivy", all: false, ci: false }),
    );
    expect(installSpy).toHaveBeenCalledTimes(1);
    expect(installSpy).toHaveBeenCalledWith("trivy", { ci: false });
    expect(code).toBe(0);
  });

  test("with --all calls installTool for all scanners", async () => {
    const { code } = await captureOutput(() =>
      runToolsInstall({ tool: undefined, all: true, ci: false }),
    );
    expect(installSpy).toHaveBeenCalledTimes(3);
    expect(code).toBe(0);
  });

  test("with no tool and no --all shows error and returns 1", async () => {
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runToolsInstall({ tool: undefined, all: false, ci: false });
    stderrSpy.mockRestore();
    expect(code).toBe(1);
  });

  test("returns 1 when installTool fails", async () => {
    installSpy.mockImplementationOnce(async () => ({
      success: false,
      toolPath: "",
      error: "download failed",
    }));
    const { code } = await captureOutput(() =>
      runToolsInstall({ tool: "trivy", all: false, ci: false }),
    );
    expect(code).toBe(1);
  });

  test("passes ci flag to installTool", async () => {
    await captureOutput(() => runToolsInstall({ tool: "trivy", all: false, ci: true }));
    expect(installSpy).toHaveBeenCalledWith("trivy", { ci: true });
  });
});

describe("runToolsStatus", () => {
  test("calls listTools and returns 0", async () => {
    const { code } = await captureOutput(() =>
      runToolsStatus({ tool: undefined, all: false, ci: false }),
    );
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  });

  test("output contains tool names", async () => {
    const { output } = await captureOutput(() =>
      runToolsStatus({ tool: undefined, all: false, ci: false }),
    );
    expect(output).toContain("trivy");
    expect(output).toContain("trufflehog");
    expect(output).toContain("semgrep");
  });

  test("output contains state information", async () => {
    const { output } = await captureOutput(() =>
      runToolsStatus({ tool: undefined, all: false, ci: false }),
    );
    expect(output).toContain("installed");
  });

  test("output contains version", async () => {
    const { output } = await captureOutput(() =>
      runToolsStatus({ tool: undefined, all: false, ci: false }),
    );
    expect(output).toContain("0.50.0");
  });
});

describe("runToolsRemove", () => {
  test("with --tool=trivy calls removeTool('trivy') and returns 0", async () => {
    const { code } = await captureOutput(() =>
      runToolsRemove({ tool: "trivy", all: false, ci: false }),
    );
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith("trivy");
    expect(code).toBe(0);
  });

  test("without --tool flag shows error and returns 1", async () => {
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runToolsRemove({ tool: undefined, all: false, ci: false });
    stderrSpy.mockRestore();
    expect(code).toBe(1);
  });
});

describe("runToolsCommand", () => {
  test("dispatches 'install' subcommand", async () => {
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    await runToolsCommand("install", []);
    stderrSpy.mockRestore();
  });

  test("dispatches 'status' subcommand and returns 0", async () => {
    const { code } = await captureOutput(() => runToolsCommand("status", []));
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  });

  test("dispatches 'remove' subcommand with no --tool returns 1", async () => {
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runToolsCommand("remove", []);
    stderrSpy.mockRestore();
    expect(code).toBe(1);
  });

  test("unknown subcommand shows usage and returns 1", async () => {
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runToolsCommand("unknown-cmd", []);
    stderrSpy.mockRestore();
    expect(code).toBe(1);
  });
});
