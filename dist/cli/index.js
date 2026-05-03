#!/usr/bin/env bun
// @bun
var __defProp = Object.defineProperty;
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

// src/lib/ui.ts
function println(text = "") {
  process.stdout.write(`${text}
`);
}
function printHeader() {
  println();
  println(`  ${icon.shield}  ${c.bold(c.white("Aegis"))} ${c.dim("\xB7 AI-Agent Security")}`);
  println(c.dim("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  println();
}
var ESC = "\x1B[", RESET = "\x1B[0m", c, icon;
var init_ui = __esm(() => {
  c = {
    bold: (s) => `\x1B[1m${s}${RESET}`,
    dim: (s) => `\x1B[2m${s}${RESET}`,
    green: (s) => `${ESC}32m${s}${RESET}`,
    red: (s) => `${ESC}31m${s}${RESET}`,
    yellow: (s) => `${ESC}33m${s}${RESET}`,
    cyan: (s) => `${ESC}36m${s}${RESET}`,
    white: (s) => `${ESC}97m${s}${RESET}`,
    gray: (s) => `${ESC}90m${s}${RESET}`,
    bgRed: (s) => `${ESC}41m${s}${RESET}`
  };
  icon = {
    pass: c.green("\u2713"),
    fail: c.red("\u2717"),
    warn: c.yellow("\u26A0"),
    info: c.cyan("\u203A"),
    shield: "\uD83D\uDEE1",
    lock: "\uD83D\uDD12",
    fire: "\uD83D\uDD25"
  };
});

// src/lib/base.ts
function writeStdout(text) {
  process.stdout.write(text);
}
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
var init_base = () => {};

// src/lib/hooks-template.ts
var HOOKS_TEMPLATE = `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun run \\"__AEGIS_DIR__/src/hooks/pre-tool-use.ts\\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun run \\"__AEGIS_DIR__/src/hooks/post-tool-use.ts\\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo \\"{\\\\\\"timestamp\\\\\\":\\\\\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\\\\",\\\\\\"event\\\\\\":\\\\\\"session_end\\\\\\"}\\" >> \\"__AEGIS_DIR__/.aegis/audit.log\\""
          }
        ]
      }
    ]
  }
}
`;

// src/cli/install.ts
var exports_install = {};
__export(exports_install, {
  runInstall: () => runInstall
});
import { join, resolve } from "path";
function log(status, filePath) {
  const badge = status === "created" ? icon.pass : status === "updated" ? icon.info : c.dim("\u2013");
  const label = status === "created" ? c.green("created") : status === "updated" ? c.cyan("updated") : c.dim("skipped");
  writeStdout(`  ${badge}  ${label}  ${c.dim(filePath)}
`);
}
async function copyIfMissing(src, dest, force) {
  if (!force && await fileExists(dest)) {
    log("skipped", dest);
    return;
  }
  const existed = await fileExists(dest);
  const content = await Bun.file(src).text();
  await ensureDir(dest.substring(0, dest.lastIndexOf("/")));
  await Bun.write(dest, content);
  log(existed ? "updated" : "created", dest);
}
async function writeIfMissing(dest, content, force) {
  if (!force && await fileExists(dest)) {
    log("skipped", dest);
    return;
  }
  const existed = await fileExists(dest);
  await ensureDir(dest.substring(0, dest.lastIndexOf("/")));
  await Bun.write(dest, content);
  log(existed ? "updated" : "created", dest);
}
async function patchOpencodeJson(targetDir) {
  const configPath = join(targetDir, "opencode.json");
  let config = {};
  if (await fileExists(configPath)) {
    try {
      config = JSON.parse(await Bun.file(configPath).text());
    } catch {
      config = {};
    }
  }
  const plugins = Array.isArray(config["plugin"]) ? config["plugin"] : [];
  if (plugins.includes("aegis-security-agent")) {
    log("skipped", configPath + " (plugin already registered)");
    return;
  }
  config["plugin"] = [...plugins, "aegis-security-agent"];
  await Bun.write(configPath, JSON.stringify(config, null, 2) + `
`);
  log("updated", configPath);
}
async function installOpenCodeMode(targetDir, force) {
  await patchOpencodeJson(targetDir);
  await ensureDir(join(targetDir, ".aegis"));
  log("created", join(targetDir, ".aegis") + "/");
  await copyIfMissing(join(AEGIS_DIR, "aegis-policy.json"), join(targetDir, "aegis-policy.json"), force);
  await writeIfMissing(join(targetDir, ".opencode", "plugins", "aegis.ts"), SHIM_CONTENT, force);
  await writeIfMissing(join(targetDir, ".opencode", "package.json"), OPENCODE_PKG_CONTENT, force);
  const agentSrc = join(AEGIS_DIR, "docs", "agents", "aegis.md");
  if (await fileExists(agentSrc)) {
    const agentContent = (await Bun.file(agentSrc).text()).replaceAll("__AEGIS_DIR__", AEGIS_DIR);
    await writeIfMissing(join(targetDir, ".opencode", "agents", "aegis.md"), agentContent, force);
  }
}
async function installClaudeMode(targetDir, force) {
  const hooksContent = HOOKS_TEMPLATE.replaceAll("__AEGIS_DIR__", AEGIS_DIR);
  await writeIfMissing(join(targetDir, ".claude", "hooks.json"), hooksContent, force);
  const agentSrc = join(AEGIS_DIR, "docs", "agents", "aegis.md");
  const agentDest = join(targetDir, ".claude", "agents", "aegis.md");
  if (!force && await fileExists(agentDest)) {
    log("skipped", agentDest);
  } else {
    const agentContent = (await Bun.file(agentSrc).text()).replaceAll("__AEGIS_DIR__", AEGIS_DIR);
    const existed = await fileExists(agentDest);
    await ensureDir(join(targetDir, ".claude", "agents"));
    await Bun.write(agentDest, agentContent);
    log(existed ? "updated" : "created", agentDest);
  }
  const claudeignoreSrc = join(AEGIS_DIR, ".claudeignore");
  const claudeignoreDest = join(targetDir, ".claudeignore");
  if (await fileExists(claudeignoreSrc)) {
    await copyIfMissing(claudeignoreSrc, claudeignoreDest, force);
  } else {
    await writeIfMissing(claudeignoreDest, `# Aegis \u2014 sensitive files
.env
.env.*
**/*.pem
**/*.key
**/*_rsa
`, force);
  }
}
async function runInstall(options) {
  const { targetDir, claude = false, force = false, skipDocker = false } = options;
  writeStdout(`
  ${icon.shield}  ${c.bold("Aegis Install")}  ${c.dim(targetDir)}

`);
  if (!skipDocker) {
    const result = await runCommandCapture(["docker", "info"]);
    if (result.exitCode !== 0) {
      writeStdout(`  ${icon.warn}  ${c.yellow("Docker not available \u2014 degraded mode will be used at runtime")}

`);
    }
  }
  try {
    if (claude) {
      await installClaudeMode(targetDir, force);
    } else {
      await installOpenCodeMode(targetDir, force);
    }
    writeStdout(`
  ${icon.pass}  ${c.bold(c.green("Done."))}

`);
    return 0;
  } catch (error) {
    process.stderr.write(`  ${icon.fail}  ${c.red("Install failed")}: ${error instanceof Error ? error.message : String(error)}
`);
    return 1;
  }
}
var AEGIS_DIR, SHIM_CONTENT = `// Auto-generated by aegis install. Do not edit.
export { AegisSecurityPlugin as default } from "aegis-security-agent";
`, OPENCODE_PKG_CONTENT;
var init_install = __esm(() => {
  init_base();
  init_ui();
  AEGIS_DIR = resolve(import.meta.dir, "../..");
  OPENCODE_PKG_CONTENT = JSON.stringify({ dependencies: { "aegis-security-agent": "latest" } }, null, 2) + `
`;
});

// src/lib/provisioner/downloader.ts
import crypto from "crypto";
import { chmod, mkdir, readdir, rename, rm, stat } from "fs/promises";
import { basename, join as join2 } from "path";
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
    if (!entry.isFile() || basename(entry.name) !== binaryName) {
      continue;
    }
    const relativePath = "parentPath" in entry && typeof entry.parentPath === "string" ? join2(entry.parentPath, entry.name) : join2(extractDir, entry.name);
    return relativePath;
  }
  return null;
}
async function verifyChecksum(filePath, expectedSha256) {
  const buffer = Buffer.from(await Bun.file(filePath).arrayBuffer());
  return crypto.createHash("sha256").update(buffer).digest("hex") === expectedSha256;
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
import { existsSync, readFileSync as readFileSync2 } from "fs";
import { rm as rm2 } from "fs/promises";
import { join as join6, resolve as resolve2 } from "path";
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
var versionCache, checkedThisSession;
var init_manager = __esm(() => {
  init_downloader();
  init_platform();
  init_registry();
  init_types();
  versionCache = new Map;
  checkedThisSession = new Set;
});

// src/cli/tools.ts
var exports_tools = {};
__export(exports_tools, {
  runToolsStatus: () => runToolsStatus,
  runToolsRemove: () => runToolsRemove,
  runToolsInstall: () => runToolsInstall,
  runToolsCommand: () => runToolsCommand,
  parseToolsFlags: () => parseToolsFlags
});
function parseToolsFlags(args) {
  let tool;
  for (const arg of args) {
    if (arg.startsWith("--tool=")) {
      tool = arg.slice("--tool=".length);
    }
  }
  return {
    tool,
    all: args.includes("--all"),
    ci: args.includes("--ci")
  };
}
function stateColor(info) {
  switch (info.state) {
    case "installed":
      return c.green(info.state);
    case "system":
      return c.cyan(info.state);
    case "outdated":
      return c.yellow(info.state);
    default:
      return c.dim(info.state);
  }
}
async function runToolsInstall(flags) {
  if (!flags.tool && !flags.all) {
    process.stderr.write(`  ${icon.fail} Specify --tool=<name> or --all
`);
    return 1;
  }
  printHeader();
  println(`  ${icon.shield}  ${c.bold("Aegis Tools Install")}
`);
  const scanners = flags.all ? ALL_SCANNERS : [flags.tool];
  let anyFailed = false;
  for (const scanner of scanners) {
    const result = await installTool(scanner, { ci: flags.ci });
    if (result.success) {
      println(`  ${icon.pass}  ${c.green(scanner)}  ${c.dim(result.toolPath)}`);
    } else {
      process.stderr.write(`  ${icon.fail}  ${c.red(scanner)}  ${result.error ?? "failed"}
`);
      anyFailed = true;
    }
  }
  println();
  return anyFailed ? 1 : 0;
}
async function runToolsStatus(flags) {
  const tools = await listTools();
  printHeader();
  println(`  ${c.bold("Tool")}${"".padEnd(14)}${c.bold("State")}${"".padEnd(10)}${c.bold("Version")}${"".padEnd(6)}${c.bold("Path")}`);
  println(c.dim("  " + "\u2500".repeat(72)));
  for (const info of tools) {
    const name = info.name.padEnd(18);
    const state = stateColor(info).padEnd(18);
    const version = (info.version || c.dim("\u2014")).padEnd(14);
    const path = info.path ? c.dim(info.path) : c.dim("\u2014");
    println(`  ${name}${state}${version}${path}`);
  }
  println();
  return 0;
}
async function runToolsRemove(flags) {
  if (!flags.tool) {
    process.stderr.write(`  ${icon.fail} Specify --tool=<name> to remove
`);
    return 1;
  }
  await removeTool(flags.tool);
  println(`  ${icon.pass}  ${c.green(flags.tool)} removed`);
  return 0;
}
async function runToolsCommand(subcommand, args) {
  const flags = parseToolsFlags(args);
  switch (subcommand) {
    case "install":
      return await runToolsInstall(flags);
    case "status":
      return await runToolsStatus(flags);
    case "remove":
      return await runToolsRemove(flags);
    default:
      process.stderr.write(`  ${icon.fail} Unknown tools subcommand: ${c.bold(subcommand)}
`);
      process.stderr.write(`${TOOLS_USAGE}
`);
      return 1;
  }
}
var ALL_SCANNERS, TOOLS_USAGE;
var init_tools = __esm(() => {
  init_ui();
  init_manager();
  ALL_SCANNERS = ["trivy", "trufflehog", "semgrep"];
  TOOLS_USAGE = [
    `  ${c.bold("Usage")}`,
    `    ${c.cyan("aegis tools")} ${c.dim("<subcommand> [flags]")}`,
    "",
    `  ${c.bold("Subcommands")}`,
    `    ${c.cyan("install")}  ${c.dim("Install scanner binaries")}`,
    `    ${c.cyan("status")}   ${c.dim("Show scanner status")}`,
    `    ${c.cyan("remove")}   ${c.dim("Remove a scanner binary")}`,
    "",
    `  ${c.bold("Flags")}`,
    `    ${c.cyan("--tool=<name>")}  ${c.dim("Target scanner: trivy | trufflehog | semgrep")}`,
    `    ${c.cyan("--all")}          ${c.dim("Apply to all scanners")}`,
    `    ${c.cyan("--ci")}           ${c.dim("Non-interactive CI mode")}`
  ].join(`
`);
});

// src/cli/index.ts
init_ui();
var HELP_TEXT = [
  `  ${c.bold("Usage")}`,
  `    ${c.cyan("aegis")} ${c.dim("<command> [flags]")}`,
  "",
  `  ${c.bold("Commands")}`,
  `    ${c.cyan("install")}  ${c.dim("Install Aegis config into the current project")}`,
  `    ${c.cyan("status")}   ${c.dim("Show installation status")}`,
  `    ${c.cyan("tools")}    ${c.dim("Install, check, or remove scanner binaries")}`,
  `    ${c.cyan("help")}     ${c.dim("Show this help")}`,
  "",
  `  ${c.bold("Install Flags")}`,
  `    ${c.cyan("--opencode")}     ${c.dim("Install for OpenCode (default)")}`,
  `    ${c.cyan("--claude")}       ${c.dim("Install for Claude Code")}`,
  `    ${c.cyan("--force")}        ${c.dim("Overwrite existing files")}`,
  `    ${c.cyan("--skip-docker")}  ${c.dim("Skip Docker availability check")}`
].join(`
`);
function parseInstallFlags(args) {
  return {
    claude: args.includes("--claude"),
    force: args.includes("--force"),
    skipDocker: args.includes("--skip-docker")
  };
}
async function runInstallCommand(args) {
  const { runInstall: runInstall2 } = await Promise.resolve().then(() => (init_install(), exports_install));
  const { claude, force, skipDocker } = parseInstallFlags(args);
  const targetDir = process.cwd();
  await runInstall2({ targetDir, claude, force, skipDocker });
  return 0;
}
async function showStatus() {
  printHeader();
  println(`  ${icon.info} Use 'bunx aegis-security-agent status' or install to get full status`);
  println();
  return 0;
}
async function main() {
  const [rawCommand, ...args] = Bun.argv.slice(2);
  const command = rawCommand ?? "help";
  switch (command) {
    case "install":
      return await runInstallCommand(args);
    case "status":
      return await showStatus();
    case "tools": {
      const { runToolsCommand: runToolsCommand2 } = await Promise.resolve().then(() => (init_tools(), exports_tools));
      const [subcommand, ...toolArgs] = args;
      return await runToolsCommand2(subcommand ?? "status", toolArgs);
    }
    case "help":
    case "--help":
    case "-h":
      printHeader();
      println(HELP_TEXT);
      println();
      return 0;
    default:
      process.stderr.write(`  ${icon.fail} Unknown command: ${c.bold(command)}
`);
      process.stderr.write(`  Run ${c.cyan("aegis help")} for usage.
`);
      return 1;
  }
}
try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  process.exit(1);
}
