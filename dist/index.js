// @bun
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// src/lib/provisioner/downloader.ts
import crypto4 from "crypto";
import { chmod, mkdir, readdir, rename, rm, stat } from "fs/promises";
import { basename as basename2, join as join2 } from "path";
function getToken(explicitToken) {
  return explicitToken?.trim() || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
}
function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
async function cleanupPath(path) {
  await rm(path, { recursive: true, force: true });
}
async function ensureNoActiveTempFile(tempPath) {
  try {
    const tempStat = await stat(tempPath);
    if (Date.now() - tempStat.mtimeMs < LOCK_MAX_AGE_MS) {
      throw new ActiveProvisioningError("Provisioning already in progress");
    }
    await cleanupPath(tempPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}
async function findBinary(extractDir, binaryName) {
  const entries = await readdir(extractDir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || basename2(entry.name) !== binaryName) {
      continue;
    }
    const relativePath = "parentPath" in entry && typeof entry.parentPath === "string" ? join2(entry.parentPath, entry.name) : join2(extractDir, entry.name);
    return relativePath;
  }
  return null;
}
async function verifyChecksum(filePath, expectedSha256) {
  const buffer = Buffer.from(await Bun.file(filePath).arrayBuffer());
  return crypto4.createHash("sha256").update(buffer).digest("hex") === expectedSha256;
}
async function downloadFile(url, destPath, options) {
  const token = getToken(options?.token);
  const headers = {};
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await Bun.write(destPath, buffer);
}
async function extractTarGz(archivePath, extractDir) {
  await mkdir(extractDir, { recursive: true });
  const proc = Bun.spawn(["tar", "xzf", archivePath, "-C", extractDir], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error((await new Response(proc.stderr).text()).trim() || `tar exited with code ${exitCode}`);
  }
  const entries = await readdir(extractDir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}
async function atomicDownload(url, destDir, binaryName, expectedSha256) {
  const tempPath = join2(destDir, `${binaryName}.tmp`);
  const finalPath = join2(destDir, binaryName);
  const extractDir = join2(destDir, ".extract");
  try {
    await mkdir(destDir, { recursive: true });
    await ensureNoActiveTempFile(tempPath);
    await cleanupPath(extractDir);
    await downloadFile(url, tempPath);
    const isValid = await verifyChecksum(tempPath, expectedSha256);
    if (!isValid) {
      await cleanupPath(tempPath);
      return { success: false, toolPath: "", error: "SHA256 mismatch" };
    }
    await cleanupPath(finalPath);
    if (url.endsWith(".tar.gz")) {
      await extractTarGz(tempPath, extractDir);
      const extractedBinary = await findBinary(extractDir, binaryName);
      if (!extractedBinary) {
        throw new Error(`Extracted archive did not contain ${binaryName}`);
      }
      await rename(extractedBinary, finalPath);
      await cleanupPath(extractDir);
      await cleanupPath(tempPath);
    } else {
      await rename(tempPath, finalPath);
    }
    await chmod(finalPath, 493);
    return { success: true, toolPath: finalPath };
  } catch (error) {
    if (error instanceof ActiveProvisioningError) {
      return {
        success: false,
        toolPath: "",
        error: error.message
      };
    }
    await Promise.all([cleanupPath(tempPath), cleanupPath(extractDir)]);
    return {
      success: false,
      toolPath: "",
      error: toErrorMessage(error)
    };
  }
}
var LOCK_MAX_AGE_MS, ActiveProvisioningError;
var init_downloader = __esm(() => {
  LOCK_MAX_AGE_MS = 10 * 60 * 1000;
  ActiveProvisioningError = class ActiveProvisioningError extends Error {
  };
});

// src/lib/provisioner/platform.ts
import { homedir } from "os";
import { join as join3 } from "path";
function splitPlatform(platform) {
  const [host, arch] = platform.split("-");
  if (host === undefined || arch === undefined) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return { host, arch };
}
function detectPlatform() {
  const platform = `${process.platform}-${process.arch}`;
  if (platform === "darwin-arm64" || platform === "darwin-x64" || platform === "linux-arm64" || platform === "linux-x64") {
    return platform;
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
function mapPlatformToTrivy(platform) {
  const { host, arch } = splitPlatform(platform);
  return {
    os: host === "darwin" ? "macOS" : "Linux",
    arch: arch === "x64" ? "64bit" : "ARM64"
  };
}
function mapPlatformToTrufflehog(platform) {
  const { host, arch } = splitPlatform(platform);
  return {
    os: host,
    arch: arch === "x64" ? "amd64" : "arm64"
  };
}
function mapPlatformToScanner(platform, scanner) {
  const { host, arch } = splitPlatform(platform);
  if (scanner === "trivy")
    return mapPlatformToTrivy(platform);
  if (scanner === "trufflehog")
    return mapPlatformToTrufflehog(platform);
  return { os: host, arch };
}
function resolveDownloadUrl(urlTemplate, version, platform, scanner) {
  const { os, arch } = mapPlatformToScanner(platform, scanner);
  return urlTemplate.replaceAll("{VERSION}", version).replaceAll("{OS}", os).replaceAll("{ARCH}", arch);
}
function getToolPath(scanner, version, platform) {
  const toolsDir = process.env.AEGIS_TOOLS_DIR?.trim() || join3(homedir(), ".aegis", "bin");
  return `${join3(toolsDir, scanner, version, platform)}/`;
}
var init_platform = () => {};

// src/lib/provisioner/registry.ts
import { readFileSync } from "fs";
import { join as join4 } from "path";
function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}
function resolveToolEntry(manifest, scanner, platform) {
  const entry = manifest.scanners[scanner];
  if (!entry) {
    throw new Error(`Unknown scanner: ${scanner}`);
  }
  if (entry.kind === "python-tool") {
    return entry;
  }
  const platformEntry = entry.platforms[platform];
  if (!platformEntry) {
    throw new Error(`No manifest entry for ${scanner} on ${platform}`);
  }
  return platformEntry;
}
function getExpectedVersion(manifest, scanner) {
  const entry = manifest.scanners[scanner];
  if (!entry) {
    throw new Error(`Unknown scanner: ${scanner}`);
  }
  return entry.version;
}
var MANIFEST_PATH;
var init_registry = __esm(() => {
  MANIFEST_PATH = join4(import.meta.dir, "../../../scanners-manifest.json");
});

// src/lib/provisioner/semgrep.ts
async function readStreamText(stream) {
  if (!stream) {
    return "";
  }
  return new Response(stream).text();
}
async function spawnCommand(argv) {
  const proc = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe"
  });
  const exitCode = await proc.exited;
  const [stdout, stderr] = await Promise.all([readStreamText(proc.stdout), readStreamText(proc.stderr)]);
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}
async function whichSemgrep() {
  const result = await spawnCommand(["which", "semgrep"]);
  return result.exitCode === 0 ? result.stdout : "";
}
async function semgrepVersion() {
  const result = await spawnCommand(["semgrep", "--version"]);
  return { version: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
}
async function isSemgrepAvailable() {
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
async function installWithPipx(version) {
  const result = await spawnCommand(["pipx", "install", `semgrep==${version}`]);
  return { ok: result.exitCode === 0, stderr: result.stderr };
}
async function installWithUv(version) {
  const result = await spawnCommand(["uv", "tool", "install", `semgrep==${version}`]);
  return { ok: result.exitCode === 0, stderr: result.stderr };
}
async function provisionSemgrep(version) {
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
  const errors = [pipx.stderr, uv.stderr].filter(Boolean).join(`
`);
  const suffix = errors ? `
${errors}` : "";
  return {
    success: false,
    toolPath: "",
    error: `Could not install semgrep. Please install manually: pip install semgrep or pipx install semgrep${suffix}`
  };
}

// src/lib/provisioner/types.ts
import { homedir as homedir2 } from "os";
import { join as join5 } from "path";
function getToolsDir() {
  return process.env.AEGIS_TOOLS_DIR?.trim() || TOOLS_DIR_DEFAULT;
}
var TOOLS_DIR_DEFAULT;
var init_types = __esm(() => {
  TOOLS_DIR_DEFAULT = join5(homedir2(), ".aegis", "bin");
});

// src/lib/provisioner/manager.ts
var exports_manager = {};
__export(exports_manager, {
  resolveToolPath: () => resolveToolPath,
  removeTool: () => removeTool,
  listTools: () => listTools,
  installTool: () => installTool,
  getToolStatus: () => getToolStatus,
  ensureLatest: () => ensureLatest,
  _resetAutoUpdateCache: () => _resetAutoUpdateCache
});
import { existsSync, readFileSync as readFileSync2 } from "fs";
import { rm as rm2 } from "fs/promises";
import { join as join6, resolve } from "path";
async function readStreamText2(stream) {
  if (!stream) {
    return "";
  }
  return (await new Response(stream).text()).trim();
}
async function runCommandCapture2(argv) {
  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  const [stdout, stderr] = await Promise.all([readStreamText2(proc.stdout), readStreamText2(proc.stderr)]);
  return { exitCode, stdout, stderr };
}
function parseVersion(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return "unknown";
  }
  const match = trimmed.match(/\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.-]+)?/);
  return match?.[0] ?? trimmed;
}
async function getCommandVersion(commandPath) {
  const cached = versionCache.get(commandPath);
  if (cached) {
    return cached;
  }
  try {
    const result = await runCommandCapture2([commandPath, "--version"]);
    if (result.exitCode === 0) {
      const version = parseVersion(result.stdout || result.stderr);
      versionCache.set(commandPath, version);
      return version;
    }
  } catch {}
  versionCache.set(commandPath, "unknown");
  return "unknown";
}
function getProvisionedBinaryPath(scanner) {
  const manifest = loadManifest();
  const entry = manifest.scanners[scanner];
  if (!entry || entry.kind !== "binary") {
    return null;
  }
  const platform = detectPlatform();
  const resolvedEntry = resolveToolEntry(manifest, scanner, platform);
  if ("kind" in resolvedEntry) {
    return null;
  }
  return join6(getToolPath(scanner, entry.version, platform), resolvedEntry.binaryName);
}
async function getToolStatus(scanner) {
  const manifest = loadManifest();
  const expectedVersion = getExpectedVersion(manifest, scanner);
  if (scanner === "semgrep") {
    const semgrep = await isSemgrepAvailable();
    if (!semgrep.available) {
      return { name: scanner, state: "not_installed", version: "", path: "", source: "none" };
    }
    return {
      name: scanner,
      state: semgrep.version === expectedVersion ? "installed" : "outdated",
      version: semgrep.version,
      path: semgrep.path,
      source: "system"
    };
  }
  const platform = detectPlatform();
  const resolvedEntry = resolveToolEntry(manifest, scanner, platform);
  if ("kind" in resolvedEntry) {
    throw new Error(`Expected binary manifest entry for ${scanner}`);
  }
  const provisionedPath = join6(getToolPath(scanner, expectedVersion, platform), resolvedEntry.binaryName);
  if (existsSync(provisionedPath)) {
    const version = await getCommandVersion(provisionedPath);
    return {
      name: scanner,
      state: version === expectedVersion ? "installed" : "outdated",
      version,
      path: provisionedPath,
      source: "provisioned"
    };
  }
  const whichResult = await runCommandCapture2(["which", scanner]);
  if (whichResult.exitCode === 0 && whichResult.stdout) {
    const systemPath = whichResult.stdout;
    const version = await getCommandVersion(systemPath);
    return {
      name: scanner,
      state: "system",
      version,
      path: systemPath,
      source: "system"
    };
  }
  return { name: scanner, state: "not_installed", version: "", path: "", source: "none" };
}
async function isBrewAvailable() {
  try {
    const result = await runCommandCapture2(["brew", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
async function brewProvision(scanner) {
  const formulaMap = {
    trivy: "trivy",
    trufflehog: "trufflehog",
    semgrep: "semgrep"
  };
  const formula = formulaMap[scanner];
  const listResult = await runCommandCapture2(["brew", "list", formula]);
  const subcommand = listResult.exitCode === 0 ? "upgrade" : "install";
  const result = await runCommandCapture2(["brew", subcommand, formula]);
  if (result.exitCode !== 0 && subcommand === "upgrade" && result.stderr.includes("already installed")) {
    const whichResult = await runCommandCapture2(["brew", "--prefix"]);
    const brewPath = Bun.which(scanner);
    return { success: true, toolPath: brewPath ?? scanner };
  }
  if (result.exitCode !== 0) {
    return { success: false, toolPath: "", error: result.stderr || `brew ${subcommand} ${formula} failed` };
  }
  const toolPath = Bun.which(scanner);
  return { success: true, toolPath: toolPath ?? scanner };
}
async function installTool(scanner, _options) {
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
async function installToolBinary(scanner, manifest, expectedVersion) {
  if (scanner === "semgrep") {
    return provisionSemgrep(expectedVersion);
  }
  const platform = detectPlatform();
  const resolvedEntry = resolveToolEntry(manifest, scanner, platform);
  if ("kind" in resolvedEntry) {
    throw new Error(`Expected binary manifest entry for ${scanner}`);
  }
  const destinationDir = getToolPath(scanner, expectedVersion, platform);
  const downloadUrl = resolveDownloadUrl(resolvedEntry.url, expectedVersion, platform, scanner);
  const result = await atomicDownload(downloadUrl, destinationDir, resolvedEntry.binaryName, resolvedEntry.sha256);
  if (!result.success) {
    return result;
  }
  const verification = await runCommandCapture2([result.toolPath, "--version"]);
  if (verification.exitCode !== 0) {
    return {
      success: false,
      toolPath: result.toolPath,
      error: verification.stderr || verification.stdout || `Failed to verify ${scanner}`
    };
  }
  versionCache.set(result.toolPath, parseVersion(verification.stdout || verification.stderr));
  return result;
}
async function removeTool(scanner) {
  await rm2(join6(getToolsDir(), scanner), { recursive: true, force: true });
}
async function listTools() {
  const manifest = loadManifest();
  const scanners = Object.keys(manifest.scanners);
  return Promise.all(scanners.map((scanner) => getToolStatus(scanner)));
}
function resolveToolPath(scanner) {
  const provisionedPath = getProvisionedBinaryPath(scanner);
  if (provisionedPath && existsSync(provisionedPath)) {
    return provisionedPath;
  }
  return Bun.which(scanner) ?? null;
}
function _resetAutoUpdateCache() {
  checkedThisSession.clear();
}
function isAutoUpdateEnabled() {
  try {
    const policyPath = join6(resolve(import.meta.dirname, "../../.."), "aegis-policy.json");
    const policy = JSON.parse(readFileSync2(policyPath, "utf-8"));
    return policy.tools?.auto_update !== false;
  } catch {
    return true;
  }
}
async function ensureLatest(scanner) {
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
  } catch {}
}
var versionCache, checkedThisSession;
var init_manager = __esm(() => {
  init_downloader();
  init_platform();
  init_registry();
  init_types();
  versionCache = new Map;
  checkedThisSession = new Set;
});

// src/opencode/index.ts
import { join as join11 } from "path";

// src/core/security.ts
import crypto2 from "crypto";
import { basename } from "path";
function parseSemgrepFindings(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  return results.filter((result) => result.extra?.severity === "ERROR").map((result) => ({
    rule: result.check_id ?? "unknown",
    severity: result.extra?.severity ?? "ERROR",
    message: result.extra?.message ?? "",
    line: result.start?.line ?? 0,
    endLine: result.end?.line
  }));
}
function computeFingerprint(parts) {
  return crypto2.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 12);
}
function mapSemgrepSeverity(severity) {
  switch (severity.toUpperCase()) {
    case "ERROR":
      return "high";
    case "WARNING":
      return "medium";
    case "INFO":
      return "low";
    default:
      return "medium";
  }
}
function semgrepToNormalized(findings, filePath) {
  return findings.map((f) => ({
    scanner: "semgrep",
    ruleId: `semgrep/${f.rule}`,
    message: f.message,
    severity: mapSemgrepSeverity(f.severity),
    location: {
      file: filePath,
      startLine: f.line,
      endLine: f.endLine
    },
    fingerprint: computeFingerprint(["semgrep", `semgrep/${f.rule}`, filePath, String(f.line)])
  }));
}
var DEFAULT_SENSITIVE_VARS = [
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "STRIPE_SECRET_KEY",
  "GITHUB_TOKEN",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PRIVATE_KEY",
  "SECRET_KEY",
  "PASSWORD",
  "PASSWD"
];
function matchHighRiskPattern(command, patterns) {
  if (!command || !patterns.length)
    return null;
  return patterns.find((pattern) => new RegExp(pattern, "i").test(command)) ?? null;
}
function parseInstallCommand(cmd) {
  const npmMatch = cmd.match(/^npm (?:install|i) (?:--save(?:-dev)? )?(@?[^\s@]+)(?:@([^\s]+))?/);
  if (npmMatch)
    return { ecosystem: "npm", packageName: npmMatch[1] ?? "", packageVersion: npmMatch[2] ?? "latest" };
  const pipMatch = cmd.match(/^pip3? install (?:--[^\s]+ )*([^\s=<>!]+)(?:[=<>!]+([^\s]+))?/);
  if (pipMatch)
    return { ecosystem: "pip", packageName: pipMatch[1] ?? "", packageVersion: pipMatch[2] ?? "latest" };
  const cargoMatch = cmd.match(/^cargo add ([^\s@]+)(?:@([^\s]+))?/);
  if (cargoMatch)
    return { ecosystem: "cargo", packageName: cargoMatch[1] ?? "", packageVersion: cargoMatch[2] ?? "latest" };
  const goMatch = cmd.match(/^go get ([^\s@]+)(?:@([^\s]+))?/);
  if (goMatch)
    return { ecosystem: "go", packageName: goMatch[1] ?? "", packageVersion: goMatch[2] ?? "latest" };
  return null;
}
function makeLockfileContent(pkg) {
  const ver = pkg.packageVersion === "latest" ? "0.0.1" : pkg.packageVersion;
  switch (pkg.ecosystem) {
    case "npm":
      return {
        filename: "package-lock.json",
        content: JSON.stringify({
          name: "aegis-scan",
          lockfileVersion: 2,
          packages: {
            [`node_modules/${pkg.packageName}`]: {
              version: ver,
              resolved: `https://registry.npmjs.org/${pkg.packageName}/-/${pkg.packageName}-${ver}.tgz`,
              integrity: "sha512-placeholder"
            }
          }
        })
      };
    case "pip":
      return { filename: "requirements.txt", content: `${pkg.packageName}==${ver}
` };
    case "cargo":
      return {
        filename: "Cargo.lock",
        content: `[[package]]
name = "${pkg.packageName}"
version = "${ver}"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "placeholder"
`
      };
    case "go":
      return {
        filename: "go.sum",
        content: `${pkg.packageName} v${ver} h1:placeholder=
`
      };
  }
}
function checkSensitiveFile(filePath, denyPatterns) {
  return denyPatterns.some((pattern) => {
    if (pattern === filePath)
      return true;
    if (pattern.startsWith("**/")) {
      const suffix = pattern.slice(3);
      const suffixRe = new RegExp(`^${suffix.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")}$`);
      return suffixRe.test(basename(filePath)) || suffixRe.test(filePath);
    }
    const re = new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`);
    return re.test(filePath);
  });
}

// src/opencode/handlers/before.ts
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { basename as basename3, join as join10 } from "path";

// src/lib/scanner.ts
import crypto5 from "crypto";
import { stat as stat2 } from "fs/promises";
import { join as join7 } from "path";

// src/lib/scan-cache.ts
import crypto3 from "crypto";
import { join } from "path";

// src/lib/base.ts
import { appendFileSync } from "fs";
import { dirname } from "path";
function buildEnv(extraEnv) {
  const merged = { ...process.env, ...extraEnv };
  const env = {};
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}
async function streamToText(stream) {
  if (!stream) {
    return "";
  }
  return await new Response(stream).text();
}
async function runCommandCapture(argv, options) {
  const stdin = options?.stdinText === undefined ? undefined : new TextEncoder().encode(options.stdinText);
  const proc = Bun.spawn(argv, {
    cwd: options?.cwd,
    env: buildEnv(options?.env),
    stdin,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    streamToText(proc.stdout),
    streamToText(proc.stderr)
  ]);
  return { exitCode, stdout, stderr };
}
async function ensureDir(dirPath) {
  const result = await runCommandCapture(["mkdir", "-p", dirPath]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to create directory: ${dirPath}`);
  }
}
async function fileExists(filePath) {
  return await Bun.file(filePath).exists();
}
async function appendText(filePath, text) {
  await ensureDir(dirname(filePath));
  appendFileSync(filePath, text, { encoding: "utf-8" });
}

// src/lib/scan-cache.ts
var CACHE_DIR = ".aegis/scan-cache";
var CACHE_TTLS = {
  semgrep: 600000,
  trivy: 3600000,
  trufflehog: 600000
};
function computeCacheKey(scanner, version, config, scopeHash) {
  return crypto3.createHash("sha256").update([scanner, version, config, scopeHash].join("|")).digest("hex").slice(0, 16);
}
function computeScopeHash(filePaths, mtimes) {
  const normalized = filePaths.map((filePath, index) => ({ filePath, mtime: mtimes[index] ?? 0 })).sort((left, right) => left.filePath.localeCompare(right.filePath));
  const payload = normalized.map(({ filePath, mtime }) => `${filePath}:${mtime}`).join("|");
  return crypto3.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
function isCacheEntry(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value;
  return typeof entry.key === "string" && typeof entry.timestamp === "number" && typeof entry.ttl === "number" && typeof entry.result === "object" && entry.result !== null;
}
async function readCacheEntry(cacheDir, key) {
  const filePath = join(cacheDir, `${key}.json`);
  if (!await fileExists(filePath)) {
    return null;
  }
  try {
    const parsed = await Bun.file(filePath).json();
    if (!isCacheEntry(parsed)) {
      return null;
    }
    if (Date.now() - parsed.timestamp >= parsed.ttl) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
async function writeCacheEntry(cacheDir, entry) {
  await ensureDir(cacheDir);
  await Bun.write(join(cacheDir, `${entry.key}.json`), JSON.stringify(entry));
}
function shouldSkipCache(result) {
  if (result.status !== "ok") {
    return true;
  }
  return result.stdout.includes("CRITICAL");
}
function getCacheTtl(scanner) {
  return CACHE_TTLS[scanner] ?? 600000;
}

// src/lib/scanner.ts
async function resolveScanner(scanner) {
  try {
    const { ensureLatest: ensureLatest2, resolveToolPath: resolveToolPath2 } = (init_manager(), __toCommonJS(exports_manager));
    await ensureLatest2(scanner);
    return resolveToolPath2(scanner) ?? scanner;
  } catch {
    return scanner;
  }
}
var SCANNER_BUDGETS = {
  semgrep: 120000,
  trivy: 60000,
  trufflehog: 90000
};
async function runScannerWithTimeout(argv, budgetMs) {
  const startedAt = performance.now();
  const proc = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe"
  });
  const timeout = new Promise((resolve2) => {
    setTimeout(() => resolve2({ status: "timeout" }), budgetMs);
  });
  const completion = proc.exited.then((exitCode) => ({ status: "completed", exitCode }));
  const outcome = await Promise.race([completion, timeout]);
  if (outcome.status === "timeout") {
    proc.kill();
    return {
      status: "timeout",
      exitCode: -1,
      stdout: "",
      stderr: "",
      degraded: true,
      durationMs: budgetMs
    };
  }
  const durationMs = performance.now() - startedAt;
  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ]);
    return {
      status: "ok",
      exitCode: outcome.exitCode,
      stdout,
      stderr,
      degraded: false,
      durationMs
    };
  } catch (error) {
    return {
      status: "error",
      exitCode: outcome.exitCode,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      degraded: false,
      durationMs
    };
  }
}
var scannerRunner = {
  runScannerWithTimeout,
  getScannerVersion
};
var versionCache2 = new Map;
async function getScannerVersion(scanner) {
  const cached = versionCache2.get(scanner);
  if (cached) {
    return cached;
  }
  try {
    const proc = Bun.spawn([await resolveScanner(scanner), "--version"], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      const version = (await new Response(proc.stdout).text()).trim();
      versionCache2.set(scanner, version);
      return version;
    }
  } catch {}
  versionCache2.set(scanner, "unknown");
  return "unknown";
}
function hashConfig(config) {
  return crypto5.createHash("sha256").update(config).digest("hex").slice(0, 16);
}
async function getMtimeMs(filePath) {
  try {
    const fileStat = await stat2(filePath);
    return fileStat.mtimeMs;
  } catch {
    return 0;
  }
}
async function readScannerCache(scanner, config, scopePaths) {
  const mtimes = await Promise.all(scopePaths.map((filePath) => getMtimeMs(filePath)));
  const scopeHash = computeScopeHash(scopePaths, mtimes);
  const version = await scannerRunner.getScannerVersion(scanner);
  const configHash = hashConfig(config);
  const key = computeCacheKey(scanner, version, configHash, scopeHash);
  const entry = await readCacheEntry(join7(process.cwd(), CACHE_DIR), key);
  if (!entry) {
    return { key, cached: null };
  }
  return {
    key,
    cached: {
      ...entry.result,
      status: "cached"
    }
  };
}
async function writeScannerCache(scanner, key, result) {
  if (shouldSkipCache(result)) {
    return;
  }
  await writeCacheEntry(join7(process.cwd(), CACHE_DIR), {
    key,
    timestamp: Date.now(),
    ttl: getCacheTtl(scanner),
    result
  });
}
async function wrapSemgrep(filePath) {
  const config = "--config=p/security-audit|--config=p/secrets|--json";
  const { key, cached } = await readScannerCache("semgrep", config, [filePath]);
  if (cached) {
    return cached;
  }
  const result = await scannerRunner.runScannerWithTimeout([await resolveScanner("semgrep"), "scan", "--config=p/security-audit", "--config=p/secrets", "--json", filePath], SCANNER_BUDGETS.semgrep);
  await writeScannerCache("semgrep", key, result);
  return result;
}
async function wrapTrivy(args) {
  const config = args.join("|");
  const { key, cached } = await readScannerCache("trivy", config, args);
  if (cached) {
    return cached;
  }
  const result = await scannerRunner.runScannerWithTimeout([await resolveScanner("trivy"), ...args], SCANNER_BUDGETS.trivy);
  await writeScannerCache("trivy", key, result);
  return result;
}

// src/lib/aegis-log.ts
function logAegis(client, level, message) {
  client?.app.log({ body: { service: "aegis", level, message } });
  if (!client?.app.log)
    process.stderr.write(`${message}
`);
}

// src/lib/output-proxy.ts
import crypto6 from "crypto";
import { join as join8 } from "path";
import { mkdirSync } from "fs";
var SCANS_DIR = ".aegis/scans";
function computeHash(content) {
  return crypto6.createHash("sha256").update(content).digest("hex").slice(0, 12);
}
function ensureScansDirSync() {
  try {
    mkdirSync(SCANS_DIR, { recursive: true });
  } catch {}
}
function writeDetailAsync(hash, fullOutput) {
  const detailPath = join8(SCANS_DIR, `${hash}.json`);
  Promise.resolve().then(async () => {
    try {
      ensureScansDirSync();
      await Bun.write(detailPath, JSON.stringify(fullOutput, null, 2));
    } catch {}
  });
  return detailPath;
}
function buildSemgrepSummary(findings, filename, hash, detailPath) {
  const severities = [...new Set(findings.map((f) => (f.severity ?? "UNKNOWN").toUpperCase()))].join(", ");
  const base = filename ? ` in ${filename}` : "";
  return `[AEGIS] Semgrep: ${findings.length} finding(s)${base} (${severities}). Details: ${detailPath}`;
}
function buildTrivySummary(parsed, packageName, hash, detailPath) {
  const vulnCount = parsed.Results?.reduce((sum, r) => sum + (r.Vulnerabilities?.length ?? 0), 0) ?? 0;
  const pkg = packageName ? ` in ${packageName}` : "";
  return `[AEGIS] Trivy: ${vulnCount} CVE(s)${pkg}. Details: ${detailPath}`;
}
function proxyResult(toolName, fullOutput, options) {
  const serialized = JSON.stringify(fullOutput);
  const hash = computeHash(serialized);
  const detailPath = writeDetailAsync(hash, fullOutput);
  const tool = toolName.toLowerCase();
  if (tool === "semgrep") {
    const findings = Array.isArray(fullOutput) ? fullOutput : [];
    const summary = buildSemgrepSummary(findings, options?.filename ?? "", hash, detailPath);
    return { summary, detailPath };
  }
  if (tool === "trivy") {
    const parsed = typeof fullOutput === "object" && fullOutput !== null ? fullOutput : {};
    const summary = buildTrivySummary(parsed, options?.packageName ?? "", hash, detailPath);
    return { summary, detailPath };
  }
  return {
    summary: `[AEGIS] ${toolName}: result saved. Details: ${detailPath}`,
    detailPath
  };
}

// src/events/types.ts
function createEvent(kind, severity, subject, message, overrides) {
  return {
    schema: "aegis/v1",
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    source: "plugin",
    kind,
    severity,
    subject,
    outcome: "warn",
    message,
    ...overrides
  };
}

// src/events/emitter.ts
import { join as join9 } from "path";
async function emitEvent(event, logPath) {
  const targetPath = logPath ?? join9(process.cwd(), ".aegis", "audit.jsonl");
  const dir = targetPath.substring(0, targetPath.lastIndexOf("/"));
  await ensureDir(dir);
  await appendText(targetPath, JSON.stringify(event) + `
`);
}

// src/opencode/handlers/before.ts
function createBeforeHandler(policy, client) {
  return async (input, output) => {
    if (["read", "write", "edit"].includes(input.tool)) {
      const filePath = output.args?.filePath ?? output.args?.path ?? "";
      if (filePath && checkSensitiveFile(filePath, policy.actions?.read_file?.deny_patterns ?? [])) {
        logAegis(client, "warn", `[AEGIS] \u26A0\uFE0F sensitive file access \u2014 ${basename3(filePath)}`);
        await emitEvent(createEvent("policy.match", "medium", filePath, `Sensitive file access: ${basename3(filePath)}`, {
          source: "plugin",
          outcome: "warn",
          policy: { rule: "deny_patterns", action: input.tool },
          correlation: {
            sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
            toolCall: input.id ?? undefined
          }
        }));
      }
    }
    if (input.tool !== "bash")
      return;
    const command = output.args?.command ?? "";
    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);
    if (matched) {
      logAegis(client, "warn", `[AEGIS] \u26A0\uFE0F high-risk pattern detected \u2014 ${matched}`);
      await emitEvent(createEvent("policy.match", "high", command, `High-risk pattern: ${matched}`, {
        source: "plugin",
        outcome: "warn",
        policy: { rule: matched, action: "run_shell" },
        correlation: {
          sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
          toolCall: input.id ?? undefined
        }
      }));
    }
    const pkg = parseInstallCommand(command);
    if (pkg) {
      await emitEvent(createEvent("install.warning", "info", command, `Install detected: ${pkg.packageName}`, {
        source: "plugin",
        evidence: { ecosystem: pkg.ecosystem, package: pkg.packageName },
        correlation: {
          sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
          toolCall: input.id ?? undefined
        }
      }));
      const { filename, content } = makeLockfileContent(pkg);
      const scanDir = mkdtempSync(join10(tmpdir(), "aegis-trivy-"));
      try {
        await Bun.write(join10(scanDir, filename), content);
        const result = await wrapTrivy([
          "fs",
          "--scanners",
          "vuln",
          "--severity",
          "HIGH,CRITICAL",
          "--exit-code",
          "1",
          "--quiet",
          "--format",
          "json",
          scanDir
        ]);
        if (result.degraded) {
          logAegis(client, "warn", "[AEGIS] \u26A0\uFE0F Trivy DEGRADED: dep scan timed out");
          await emitEvent(createEvent("scanner.summary", "medium", command, "Trivy scan timed out", {
            source: "plugin",
            outcome: "skip",
            degraded: true,
            evidence: { scanner: "trivy", package: pkg.packageName },
            correlation: {
              sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
              toolCall: input.id ?? undefined
            }
          }));
        } else if (result.status === "ok" && result.exitCode === 1) {
          let parsed = {};
          try {
            parsed = JSON.parse(result.stdout);
          } catch {}
          const { summary } = proxyResult("trivy", parsed, { packageName: pkg.packageName });
          logAegis(client, "warn", `[AEGIS] \u26A0\uFE0F Trivy found vulnerabilities \u2014 ${summary}`);
          await emitEvent(createEvent("scanner.finding", "high", command, `Trivy: ${pkg.packageName} \u2014 ${summary}`, {
            source: "plugin",
            outcome: "warn",
            evidence: { scanner: "trivy", package: pkg.packageName, summary },
            correlation: {
              sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
              toolCall: input.id ?? undefined
            }
          }));
        } else if (result.status === "error") {
          logAegis(client, "warn", "[AEGIS] \u26A0\uFE0F Trivy unavailable: dep scan skipped");
          await emitEvent(createEvent("scanner.summary", "low", command, "Trivy unavailable \u2014 scan skipped", {
            source: "plugin",
            outcome: "skip",
            evidence: { scanner: "trivy", status: "unavailable" },
            correlation: {
              sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
              toolCall: input.id ?? undefined
            }
          }));
        }
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    }
  };
}

// src/opencode/handlers/after.ts
import { basename as basename4 } from "path";
function createAfterHandler() {
  return async (input, output) => {
    if (!["write", "edit"].includes(input.tool))
      return;
    const filePath = input.args?.filePath ?? input.args?.path ?? "";
    if (!filePath)
      return;
    const result = await wrapSemgrep(filePath);
    const findings = result.status === "ok" ? parseSemgrepFindings(result.stdout) : [];
    if (findings.length > 0) {
      const { summary, detailPath } = proxyResult("semgrep", findings, { filename: basename4(filePath) });
      const normalized = semgrepToNormalized(findings, filePath);
      output.output += `

${summary}`;
      await emitEvent(createEvent("scanner.finding", "medium", filePath, `Semgrep: ${basename4(filePath)} \u2014 ${findings.length} finding(s)`, {
        source: "plugin",
        outcome: "warn",
        evidence: {
          scanner: "semgrep",
          file: filePath,
          count: findings.length,
          findings: normalized,
          detailPath,
          summary
        },
        correlation: {
          sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
          toolCall: input.id ?? undefined
        }
      }));
    }
    if (result.degraded) {
      output.output += `

[AEGIS] \u26A0\uFE0F Semgrep DEGRADED: scan timed out after 120s`;
      await emitEvent(createEvent("scanner.summary", "medium", filePath, "Semgrep scan timed out", {
        source: "plugin",
        outcome: "skip",
        degraded: true,
        evidence: { scanner: "semgrep", file: filePath },
        correlation: {
          sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
          toolCall: input.id ?? undefined
        }
      }));
    }
  };
}

// src/opencode/handlers/compaction.ts
function createCompactionHandler(policy) {
  return async (output) => {
    const blockedPatterns = policy.high_risk_patterns?.length ?? 0;
    output.context.push(`[AEGIS] Security: blocked_patterns=${blockedPatterns}`);
  };
}

// src/opencode/handlers/env.ts
function createEnvHandler(sensitiveVars) {
  return async (_input, output) => {
    const redacted = [];
    for (const varName of sensitiveVars) {
      if (output.env && varName in output.env) {
        delete output.env[varName];
        redacted.push(varName);
      }
    }
    if (redacted.length > 0) {
      await emitEvent(createEvent("env.redaction", "info", "shell.env", `Redacted ${redacted.length} sensitive var(s): ${redacted.join(", ")}`, {
        source: "plugin",
        outcome: "allow",
        evidence: { redacted_vars: redacted },
        correlation: {
          sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString()
        }
      }));
    }
  };
}

// src/opencode/handlers/permission.ts
function createPermissionHandler(policy) {
  return async (input, output) => {
    const command = input.command ?? input.title ?? "";
    if (!command)
      return;
    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);
    if (matched) {
      output.status = "ask";
      await emitEvent(createEvent("permission.warning", "high", command, `Permission escalation: ${matched}`, {
        source: "plugin",
        outcome: "warn",
        policy: { rule: matched, action: "permission.ask" },
        correlation: {
          sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString()
        }
      }));
    }
  };
}

// src/types/policy.ts
var KNOWN_KEYS = new Set([
  "$schema",
  "version",
  "actions",
  "high_risk_patterns",
  "routing",
  "degraded_mode",
  "tools"
]);
var DEPRECATED_KEYS = {};
function validatePolicy(raw) {
  const warnings = [];
  if (raw === null || raw === undefined || typeof raw !== "object") {
    warnings.push("Policy is not an object \u2014 using empty defaults");
    return { policy: { high_risk_patterns: [] }, warnings };
  }
  const obj = raw;
  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      warnings.push(`Unknown policy key: "${key}" \u2014 ignored`);
    }
    if (key in DEPRECATED_KEYS) {
      warnings.push(DEPRECATED_KEYS[key]);
    }
  }
  const patterns = obj.high_risk_patterns;
  if (Array.isArray(patterns)) {
    for (const pattern of patterns) {
      if (typeof pattern !== "string")
        continue;
      try {
        new RegExp(pattern);
      } catch {
        warnings.push(`Invalid regex in high_risk_patterns: "${pattern}"`);
      }
    }
  }
  const routing = obj.routing;
  if (routing && typeof routing === "object") {
    for (const field of ["host_passthrough", "sandbox_required"]) {
      const arr = routing[field];
      if (!Array.isArray(arr))
        continue;
      for (const pattern of arr) {
        if (typeof pattern !== "string")
          continue;
        try {
          new RegExp(pattern);
        } catch {
          warnings.push(`Invalid regex in routing.${field}: "${pattern}"`);
        }
      }
    }
  }
  return { policy: obj, warnings };
}

// src/opencode/index.ts
function safe(handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      console.error("[AEGIS] handler error (swallowed):", err instanceof Error ? err.message : String(err));
    }
  };
}
var AegisSecurityPlugin = async ({ directory, client }) => {
  let policy = {};
  try {
    const raw = JSON.parse(await Bun.file(join11(directory, "aegis-policy.json")).text());
    const result = validatePolicy(raw);
    policy = result.policy;
    for (const w of result.warnings) {
      console.error(`[AEGIS] Policy warning: ${w}`);
    }
  } catch {
    console.error("[AEGIS] aegis-policy.json not found or invalid \u2014 running with empty policy");
  }
  const beforeHandler = createBeforeHandler(policy, client);
  const afterHandler = createAfterHandler();
  const compactionHandler = createCompactionHandler(policy);
  const envHandler = createEnvHandler(DEFAULT_SENSITIVE_VARS);
  const permissionHandler = createPermissionHandler(policy);
  return {
    "tool.execute.before": safe(beforeHandler),
    "tool.execute.after": safe(afterHandler),
    "experimental.session.compacting": safe(compactionHandler),
    "shell.env": safe(envHandler),
    "permission.ask": safe(permissionHandler)
  };
};
var opencode_default = AegisSecurityPlugin;
export {
  opencode_default as default,
  AegisSecurityPlugin
};
