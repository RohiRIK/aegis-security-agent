import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import * as downloaderModule from "./downloader.ts";
import * as platformModule from "./platform.ts";
import { getExpectedVersion, loadManifest, resolveToolEntry } from "./registry.ts";
import * as semgrepModule from "./semgrep.ts";
import { getToolsDir, type ProvisionResult, type ScannerName, type ToolInfo } from "./types.ts";

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const versionCache = new Map<string, string>();

async function readStreamText(stream: ReadableStream<Uint8Array> | null | undefined): Promise<string> {
  if (!stream) {
    return "";
  }

  return (await new Response(stream).text()).trim();
}

async function runCommandCapture(argv: string[]): Promise<CommandResult> {
  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  const [stdout, stderr] = await Promise.all([readStreamText(proc.stdout), readStreamText(proc.stderr)]);
  return { exitCode, stdout, stderr };
}

function parseVersion(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) {
    return "unknown";
  }

  const match = trimmed.match(/\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.-]+)?/);
  return match?.[0] ?? trimmed;
}

async function getCommandVersion(commandPath: string): Promise<string> {
  const cached = versionCache.get(commandPath);
  if (cached) {
    return cached;
  }

  try {
    const result = await runCommandCapture([commandPath, "--version"]);
    if (result.exitCode === 0) {
      const version = parseVersion(result.stdout || result.stderr);
      versionCache.set(commandPath, version);
      return version;
    }
  } catch {
    // command unavailable
  }

  versionCache.set(commandPath, "unknown");
  return "unknown";
}

function getProvisionedBinaryPath(scanner: ScannerName): string | null {
  const manifest = loadManifest();
  const entry = manifest.scanners[scanner];
  if (!entry || entry.kind !== "binary") {
    return null;
  }

  const platform = platformModule.detectPlatform();
  const resolvedEntry = resolveToolEntry(manifest, scanner, platform);
  if ("kind" in resolvedEntry) {
    return null;
  }

  return join(platformModule.getToolPath(scanner, entry.version, platform), resolvedEntry.binaryName);
}

export async function getToolStatus(scanner: ScannerName): Promise<ToolInfo> {
  const manifest = loadManifest();
  const expectedVersion = getExpectedVersion(manifest, scanner);

  if (scanner === "semgrep") {
    const semgrep = await semgrepModule.isSemgrepAvailable();
    if (!semgrep.available) {
      return { name: scanner, state: "not_installed", version: "", path: "", source: "none" };
    }

    return {
      name: scanner,
      state: semgrep.version === expectedVersion ? "installed" : "outdated",
      version: semgrep.version,
      path: semgrep.path,
      source: "system",
    };
  }

  const platform = platformModule.detectPlatform();
  const resolvedEntry = resolveToolEntry(manifest, scanner, platform);
  if ("kind" in resolvedEntry) {
    throw new Error(`Expected binary manifest entry for ${scanner}`);
  }

  const provisionedPath = join(platformModule.getToolPath(scanner, expectedVersion, platform), resolvedEntry.binaryName);
  if (existsSync(provisionedPath)) {
    const version = await getCommandVersion(provisionedPath);
    return {
      name: scanner,
      state: version === expectedVersion ? "installed" : "outdated",
      version,
      path: provisionedPath,
      source: "provisioned",
    };
  }

  const whichResult = await runCommandCapture(["which", scanner]);
  if (whichResult.exitCode === 0 && whichResult.stdout) {
    const systemPath = whichResult.stdout;
    const version = await getCommandVersion(systemPath);
    return {
      name: scanner,
      state: "system",
      version,
      path: systemPath,
      source: "system",
    };
  }

  return { name: scanner, state: "not_installed", version: "", path: "", source: "none" };
}

async function isBrewAvailable(): Promise<boolean> {
  try {
    const result = await runCommandCapture(["brew", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function brewProvision(scanner: ScannerName): Promise<ProvisionResult> {
  const formulaMap: Record<ScannerName, string> = {
    trivy: "trivy",
    trufflehog: "trufflehog",
    semgrep: "semgrep",
  };

  const formula = formulaMap[scanner];
  const listResult = await runCommandCapture(["brew", "list", formula]);
  const subcommand = listResult.exitCode === 0 ? "upgrade" : "install";

  const result = await runCommandCapture(["brew", subcommand, formula]);
  if (result.exitCode !== 0 && subcommand === "upgrade" && result.stderr.includes("already installed")) {
    const whichResult = await runCommandCapture(["brew", "--prefix"]);
    const brewPath = Bun.which(scanner);
    return { success: true, toolPath: brewPath ?? scanner };
  }

  if (result.exitCode !== 0) {
    return { success: false, toolPath: "", error: result.stderr || `brew ${subcommand} ${formula} failed` };
  }

  const toolPath = Bun.which(scanner);
  return { success: true, toolPath: toolPath ?? scanner };
}

export async function installTool(scanner: ScannerName, _options?: { ci?: boolean }): Promise<ProvisionResult> {
  const manifest = loadManifest();
  const expectedVersion = getExpectedVersion(manifest, scanner);

  if (await isBrewAvailable()) {
    const brewResult = await brewProvision(scanner);
    if (brewResult.success) {
      return brewResult;
    }
  }

  return installToolBinary(scanner, manifest, expectedVersion);
}

async function installToolBinary(
  scanner: ScannerName,
  manifest: ReturnType<typeof loadManifest>,
  expectedVersion: string,
): Promise<ProvisionResult> {
  if (scanner === "semgrep") {
    return semgrepModule.provisionSemgrep(expectedVersion);
  }

  const platform = platformModule.detectPlatform();
  const resolvedEntry = resolveToolEntry(manifest, scanner, platform);
  if ("kind" in resolvedEntry) {
    throw new Error(`Expected binary manifest entry for ${scanner}`);
  }

  const destinationDir = platformModule.getToolPath(scanner, expectedVersion, platform);
  const downloadUrl = platformModule.resolveDownloadUrl(resolvedEntry.url, expectedVersion, platform, scanner);
  const result = await downloaderModule.atomicDownload(downloadUrl, destinationDir, resolvedEntry.binaryName, resolvedEntry.sha256);

  if (!result.success) {
    return result;
  }

  const verification = await runCommandCapture([result.toolPath, "--version"]);
  if (verification.exitCode !== 0) {
    return {
      success: false,
      toolPath: result.toolPath,
      error: verification.stderr || verification.stdout || `Failed to verify ${scanner}`,
    };
  }

  versionCache.set(result.toolPath, parseVersion(verification.stdout || verification.stderr));
  return result;
}

export async function removeTool(scanner: ScannerName): Promise<void> {
  await rm(join(getToolsDir(), scanner), { recursive: true, force: true });
}

export async function listTools(): Promise<ToolInfo[]> {
  const manifest = loadManifest();
  const scanners = Object.keys(manifest.scanners) as ScannerName[];
  return Promise.all(scanners.map((scanner) => getToolStatus(scanner)));
}

export function resolveToolPath(scanner: ScannerName): string | null {
  const provisionedPath = getProvisionedBinaryPath(scanner);
  if (provisionedPath && existsSync(provisionedPath)) {
    return provisionedPath;
  }

  return Bun.which(scanner) ?? null;
}

const checkedThisSession = new Set<string>();

export function _resetAutoUpdateCache(): void {
  checkedThisSession.clear();
}

/**
 * Reads the auto-update flag from the policy file. Extracted as an exported,
 * overridable seam so tests can stub the policy read instead of depending on
 * the real `aegis-policy.json` (which may set `tools.auto_update:false`).
 * Default-on when the file is missing/unparseable.
 */
export function _readAutoUpdatePolicy(): boolean {
  try {
    const policyPath = join(resolve(import.meta.dirname, "../../.."), "aegis-policy.json");
    const policy = JSON.parse(readFileSync(policyPath, "utf-8")) as {
      tools?: { auto_update?: boolean };
    };
    return policy.tools?.auto_update !== false;
  } catch {
    return true;
  }
}

let autoUpdateOverride: boolean | undefined;

/** Test-only: force the auto-update flag (pass undefined to restore real read). */
export function _setAutoUpdateOverride(value: boolean | undefined): void {
  autoUpdateOverride = value;
}

function isAutoUpdateEnabled(): boolean {
  return autoUpdateOverride ?? _readAutoUpdatePolicy();
}

export async function ensureLatest(scanner: ScannerName): Promise<void> {
  if (checkedThisSession.has(scanner)) {
    return;
  }
  checkedThisSession.add(scanner);

  if (!isAutoUpdateEnabled()) {
    return;
  }

  const status = await getToolStatus(scanner);
  if (status.state === "installed") {
    return;
  }

  try {
    await installTool(scanner);
  } catch {
    // auto-update is best-effort — continue with existing version
  }
}
