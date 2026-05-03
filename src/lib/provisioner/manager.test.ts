import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import * as downloader from "./downloader.ts";
import { getToolPath } from "./platform.ts";
import * as platform from "./platform.ts";
import * as semgrepModule from "./semgrep.ts";
import * as manager from "./manager.ts";
import {
  _resetAutoUpdateCache,
  ensureLatest,
  getToolStatus,
  installTool,
  listTools,
  removeTool,
  resolveToolPath,
} from "./manager.ts";

type SpawnResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

const originalToolsDir = process.env.AEGIS_TOOLS_DIR;

function streamFromText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function makeProcess(result: SpawnResult): any {
  return {
    exited: Promise.resolve(result.exitCode),
    stdout: streamFromText(result.stdout ?? ""),
    stderr: streamFromText(result.stderr ?? ""),
    kill() {},
  };
}

async function createExecutable(filePath: string, contents = "#!/bin/sh\nexit 0\n"): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await Bun.write(filePath, contents);
  await chmod(filePath, 0o755);
}

beforeEach(async () => {
  _resetAutoUpdateCache();
  process.env.AEGIS_TOOLS_DIR = await mkdtemp(join(tmpdir(), "aegis-provisioner-"));
});

afterEach(async () => {
  mock.restore();

  if (process.env.AEGIS_TOOLS_DIR) {
    await rm(process.env.AEGIS_TOOLS_DIR, { recursive: true, force: true });
  }

  if (originalToolsDir === undefined) {
    delete process.env.AEGIS_TOOLS_DIR;
  } else {
    process.env.AEGIS_TOOLS_DIR = originalToolsDir;
  }
});

describe("getToolStatus", () => {
  test("returns installed when provisioned binary matches expected version", async () => {
    const platformSpy = spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");
    const toolPath = join(getToolPath("trivy", "0.70.0", "darwin-arm64"), "trivy");
    await createExecutable(toolPath);

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[], _opts?: any) => {
      const command = cmd.join(" ");
      if (command === `${toolPath} --version`) {
        return makeProcess({ exitCode: 0, stdout: "Version: 0.70.0\n" });
      }

      throw new Error(`Unexpected spawn: ${command}`);
    });

    const info = await getToolStatus("trivy");

    expect(platformSpy).toHaveBeenCalledTimes(1);
    expect(info).toEqual({
      name: "trivy",
      state: "installed",
      version: "0.70.0",
      path: toolPath,
      source: "provisioned",
    });
  });

  test("returns system when provisioned binary is missing and tool exists on PATH", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[], _opts?: any) => {
      const command = cmd.join(" ");
      if (command === "which trivy") {
        return makeProcess({ exitCode: 0, stdout: "/usr/local/bin/trivy\n" });
      }

      if (command === "/usr/local/bin/trivy --version") {
        return makeProcess({ exitCode: 0, stdout: "Version: 0.69.0\n" });
      }

      throw new Error(`Unexpected spawn: ${command}`);
    });

    const info = await getToolStatus("trivy");

    expect(info).toEqual({
      name: "trivy",
      state: "system",
      version: "0.69.0",
      path: "/usr/local/bin/trivy",
      source: "system",
    });
  });
});

describe("installTool", () => {
  test("calls downloader and returns provision result", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");
    const downloadSpy = spyOn(downloader, "atomicDownload").mockResolvedValue({
      success: true,
      toolPath: "/tmp/aegis-tools/trivy",
    });

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[], _opts?: any) => {
      const command = cmd.join(" ");
      if (command === "/tmp/aegis-tools/trivy --version") {
        return makeProcess({ exitCode: 0, stdout: "Version: 0.70.0\n" });
      }

      throw new Error(`Unexpected spawn: ${command}`);
    });

    const result = await installTool("trivy");

    expect(downloadSpy).toHaveBeenCalledWith(
      "https://github.com/aquasecurity/trivy/releases/download/v0.70.0/trivy_0.70.0_macOS-ARM64.tar.gz",
      `${process.env.AEGIS_TOOLS_DIR}/trivy/0.70.0/darwin-arm64/`,
      "trivy",
      "68e543c51dcc96e1c344053a4fde9660cf602c25565d9f09dc17dd41e13b838a",
    );
    expect(result).toEqual({ success: true, toolPath: "/tmp/aegis-tools/trivy" });
  });
});

describe("removeTool", () => {
  test("removes the binary directory tree", async () => {
    const toolPath = join(getToolPath("trivy", "0.70.0", "darwin-arm64"), "trivy");
    await createExecutable(toolPath);

    await removeTool("trivy");

    expect(await Bun.file(toolPath).exists()).toBe(false);
    expect(await Bun.file(join(process.env.AEGIS_TOOLS_DIR!, "trivy")).exists()).toBe(false);
  });
});

describe("listTools", () => {
  test("returns ToolInfo entries for all scanners", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");
    spyOn(semgrepModule, "isSemgrepAvailable").mockResolvedValue({
      available: false,
      version: "",
      path: "",
    });

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[], _opts?: any) => {
      const command = cmd.join(" ");
      if (command === "which trivy" || command === "which trufflehog") {
        return makeProcess({ exitCode: 1 });
      }

      throw new Error(`Unexpected spawn: ${command}`);
    });

    const tools = await listTools();

    expect(tools).toHaveLength(3);
    expect(tools.map((tool) => tool.name).sort()).toEqual(["semgrep", "trivy", "trufflehog"]);
    expect(tools.every((tool) => typeof tool.version === "string")).toBe(true);
  });
});

describe("resolveToolPath", () => {
  test("prefers provisioned path then PATH and finally null", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");
    const whichSpy = spyOn(Bun, "which") as any;

    const provisionedPath = join(getToolPath("trivy", "0.70.0", "darwin-arm64"), "trivy");
    await createExecutable(provisionedPath);
    expect(resolveToolPath("trivy")).toBe(provisionedPath);

    await rm(join(process.env.AEGIS_TOOLS_DIR!, "trivy"), { recursive: true, force: true });

    whichSpy.mockReturnValueOnce("/usr/local/bin/trivy");
    expect(resolveToolPath("trivy")).toBe("/usr/local/bin/trivy");

    whichSpy.mockReturnValueOnce(null);
    expect(resolveToolPath("trivy")).toBeNull();
  });
});

describe("ensureLatest", () => {
  test("skips install when tool version matches manifest", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");
    const provisionedPath = join(getToolPath("trivy", "0.70.0", "darwin-arm64"), "trivy");
    await createExecutable(provisionedPath);

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      if (cmd[1] === "--version") {
        return makeProcess({ exitCode: 0, stdout: "0.70.0" });
      }
      throw new Error(`Unexpected spawn: ${cmd}`);
    });

    const downloadSpy = spyOn(downloader, "atomicDownload");

    await ensureLatest("trivy");

    expect(downloadSpy).not.toHaveBeenCalled();
  });

  test("triggers install when tool is outdated", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");
    const provisionedPath = join(getToolPath("trivy", "0.70.0", "darwin-arm64"), "trivy");
    await createExecutable(provisionedPath);

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      if (cmd[1] === "--version") {
        return makeProcess({ exitCode: 0, stdout: "0.69.0" });
      }
      if (cmd[0] === "brew") {
        return makeProcess({ exitCode: 127, stderr: "command not found" });
      }
      throw new Error(`Unexpected spawn: ${cmd}`);
    });

    const downloadSpy = spyOn(downloader, "atomicDownload").mockResolvedValue({
      success: true,
      toolPath: provisionedPath,
    });

    await ensureLatest("trivy");

    expect(downloadSpy).toHaveBeenCalledTimes(1);
  });

  test("caches check per session — second call is a no-op", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");
    const provisionedPath = join(getToolPath("trivy", "0.70.0", "darwin-arm64"), "trivy");
    await createExecutable(provisionedPath);

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      if (cmd[1] === "--version") {
        return makeProcess({ exitCode: 0, stdout: "0.70.0" });
      }
      throw new Error(`Unexpected spawn: ${cmd}`);
    });

    await ensureLatest("trivy");
    spawnSpy.mockClear();

    await ensureLatest("trivy");

    expect(spawnSpy).not.toHaveBeenCalled();
  });

  test("does not throw when install fails", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      if (cmd[0] === "which") {
        return makeProcess({ exitCode: 1, stdout: "" });
      }
      if (cmd[1] === "--version") {
        return makeProcess({ exitCode: 1, stdout: "" });
      }
      if (cmd[0] === "brew") {
        return makeProcess({ exitCode: 127, stderr: "command not found" });
      }
      throw new Error(`Unexpected spawn: ${cmd}`);
    });

    spyOn(downloader, "atomicDownload").mockRejectedValue(new Error("network error"));

    await expect(ensureLatest("trivy")).resolves.toBeUndefined();
  });
});

describe("installTool provisioning chain", () => {
  test("uses brew as primary when available", async () => {
    const whichSpy = spyOn(Bun, "which") as any;
    whichSpy.mockReturnValue("/opt/homebrew/bin/trivy");

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      const command = cmd.join(" ");
      if (command === "brew --version") {
        return makeProcess({ exitCode: 0, stdout: "Homebrew 4.0.0" });
      }
      if (command === "brew list trivy") {
        return makeProcess({ exitCode: 0, stdout: "" });
      }
      if (command === "brew upgrade trivy") {
        return makeProcess({ exitCode: 0, stdout: "" });
      }
      throw new Error(`Unexpected spawn: ${command}`);
    });

    const downloadSpy = spyOn(downloader, "atomicDownload");

    const result = await installTool("trivy");

    expect(result.success).toBe(true);
    expect(result.toolPath).toBe("/opt/homebrew/bin/trivy");
    expect(downloadSpy).not.toHaveBeenCalled();
  });

  test("uses brew install when formula not already installed", async () => {
    const whichSpy = spyOn(Bun, "which") as any;
    whichSpy.mockReturnValue("/opt/homebrew/bin/trufflehog");

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      const command = cmd.join(" ");
      if (command === "brew --version") {
        return makeProcess({ exitCode: 0, stdout: "Homebrew 4.0.0" });
      }
      if (command === "brew list trufflehog") {
        return makeProcess({ exitCode: 1, stdout: "" });
      }
      if (command === "brew install trufflehog") {
        return makeProcess({ exitCode: 0, stdout: "" });
      }
      throw new Error(`Unexpected spawn: ${command}`);
    });

    const result = await installTool("trufflehog");

    expect(result.success).toBe(true);
  });

  test("falls back to binary download when brew unavailable", async () => {
    spyOn(platform, "detectPlatform").mockReturnValue("darwin-arm64");

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      const command = cmd.join(" ");
      if (command === "brew --version") {
        return makeProcess({ exitCode: 127, stderr: "command not found" });
      }
      if (cmd[1] === "--version") {
        return makeProcess({ exitCode: 0, stdout: "0.70.0" });
      }
      throw new Error(`Unexpected spawn: ${command}`);
    });

    const downloadSpy = spyOn(downloader, "atomicDownload").mockResolvedValue({
      success: true,
      toolPath: "/tmp/aegis-tools/trivy",
    });

    const result = await installTool("trivy");

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  test("uses brew for semgrep as primary", async () => {
    const whichSpy = spyOn(Bun, "which") as any;
    whichSpy.mockReturnValue("/opt/homebrew/bin/semgrep");

    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      const command = cmd.join(" ");
      if (command === "brew --version") {
        return makeProcess({ exitCode: 0, stdout: "Homebrew 4.0.0" });
      }
      if (command === "brew list semgrep") {
        return makeProcess({ exitCode: 0, stdout: "" });
      }
      if (command === "brew upgrade semgrep") {
        return makeProcess({ exitCode: 0, stdout: "" });
      }
      throw new Error(`Unexpected spawn: ${command}`);
    });

    const pipxSpy = spyOn(semgrepModule, "provisionSemgrep");

    const result = await installTool("semgrep");

    expect(result.success).toBe(true);
    expect(result.toolPath).toBe("/opt/homebrew/bin/semgrep");
    expect(pipxSpy).not.toHaveBeenCalled();
  });

  test("falls back to pipx for semgrep when brew unavailable", async () => {
    const spawnSpy = spyOn(Bun, "spawn") as any;
    spawnSpy.mockImplementation((cmd: string[]) => {
      const command = cmd.join(" ");
      if (command === "brew --version") {
        return makeProcess({ exitCode: 127, stderr: "command not found" });
      }
      throw new Error(`Unexpected spawn: ${command}`);
    });

    spyOn(semgrepModule, "provisionSemgrep").mockResolvedValue({
      success: true,
      toolPath: "/usr/local/bin/semgrep",
    });

    const result = await installTool("semgrep");

    expect(result.success).toBe(true);
    expect(result.toolPath).toBe("/usr/local/bin/semgrep");
  });
});
