import type { ProvisionResult } from "./types.ts";

type AvailabilityResult = {
  available: boolean;
  version: string;
  path: string;
};

async function readStreamText(stream: ReadableStream<Uint8Array> | null | undefined): Promise<string> {
  if (!stream) {
    return "";
  }

  return new Response(stream).text();
}

async function spawnCommand(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const [stdout, stderr] = await Promise.all([readStreamText(proc.stdout), readStreamText(proc.stderr)]);

  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function whichSemgrep(): Promise<string> {
  const result = await spawnCommand(["which", "semgrep"]);
  return result.exitCode === 0 ? result.stdout : "";
}

async function semgrepVersion(): Promise<{ version: string; stderr: string; exitCode: number }> {
  const result = await spawnCommand(["semgrep", "--version"]);
  return { version: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
}

export async function isSemgrepAvailable(): Promise<AvailabilityResult> {
  const path = await whichSemgrep();
  if (!path) {
    return { available: false, version: "", path: "" };
  }

  const versionResult = await semgrepVersion();
  if (versionResult.exitCode !== 0 || !versionResult.version) {
    return { available: false, version: "", path };
  }

  return { available: true, version: versionResult.version, path };
}

async function installWithPipx(version: string): Promise<{ ok: boolean; stderr: string }> {
  const result = await spawnCommand(["pipx", "install", `semgrep==${version}`]);
  return { ok: result.exitCode === 0, stderr: result.stderr };
}

async function installWithUv(version: string): Promise<{ ok: boolean; stderr: string }> {
  const result = await spawnCommand(["uv", "tool", "install", `semgrep==${version}`]);
  return { ok: result.exitCode === 0, stderr: result.stderr };
}

export async function provisionSemgrep(version: string): Promise<ProvisionResult> {
  const available = await isSemgrepAvailable();
  if (available.available && available.version === version) {
    return { success: true, toolPath: available.path };
  }

  const pipx = await installWithPipx(version);
  if (pipx.ok) {
    const installedPath = await whichSemgrep();
    return { success: true, toolPath: installedPath || "semgrep" };
  }

  const uv = await installWithUv(version);
  if (uv.ok) {
    const installedPath = await whichSemgrep();
    return { success: true, toolPath: installedPath || "semgrep" };
  }

  const errors = [pipx.stderr, uv.stderr].filter(Boolean).join("\n");
  const suffix = errors ? `\n${errors}` : "";

  return {
    success: false,
    toolPath: "",
    error: `Could not install semgrep. Please install manually: pip install semgrep or pipx install semgrep${suffix}`,
  };
}
