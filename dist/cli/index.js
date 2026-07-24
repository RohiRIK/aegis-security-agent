#!/usr/bin/env bun
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
var __require = import.meta.require;

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
import { appendFileSync } from "fs";
import { dirname } from "path";
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
async function appendText(filePath, text) {
  await ensureDir(dirname(filePath));
  appendFileSync(filePath, text, { encoding: "utf-8" });
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
            "command": "bun run \\"__AEGIS_DIR__/dist/hooks/pre-tool-use.js\\""
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
            "command": "bun run \\"__AEGIS_DIR__/dist/hooks/post-tool-use.js\\""
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
            "command": "bun run \\"__AEGIS_DIR__/dist/hooks/stop.js\\""
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
async function installManagedSkills(targetDir, hostDir) {
  const { readdir } = await import("fs/promises");
  await Promise.all(SKILL_DIRS.map(async (skillDir) => {
    const srcDir = join(AEGIS_DIR, "docs", "skills", skillDir);
    const entries = await readdir(srcDir, { recursive: true });
    const mdFiles = entries.filter((e) => e.endsWith(".md"));
    for (const relPath of mdFiles) {
      const content = await Bun.file(join(srcDir, relPath)).text();
      await writeIfMissing(join(targetDir, hostDir, "skills", skillDir, relPath), content, true);
    }
  }));
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
  const auditLogPath = join(targetDir, ".aegis", "audit.jsonl");
  if (!await fileExists(auditLogPath)) {
    await Bun.write(auditLogPath, "");
    log("created", auditLogPath);
  }
  await copyIfMissing(join(AEGIS_DIR, "aegis-policy.json"), join(targetDir, "aegis-policy.json"), force);
  await writeIfMissing(join(targetDir, ".opencode", "plugins", "aegis.ts"), SHIM_CONTENT, true);
  await writeIfMissing(join(targetDir, ".opencode", "package.json"), OPENCODE_PKG_CONTENT, true);
  const agentSrc = join(AEGIS_DIR, "docs", "agents", "aegis.md");
  if (await fileExists(agentSrc)) {
    const agentContent = (await Bun.file(agentSrc).text()).replaceAll("__AEGIS_DIR__", AEGIS_DIR);
    await writeIfMissing(join(targetDir, ".opencode", "agents", "aegis.md"), agentContent, true);
  }
  await installManagedSkills(targetDir, ".opencode");
  await writeIfMissing(join(targetDir, ".env.schema"), ENV_SCHEMA_CONTENT, force);
  await writeIfMissing(join(targetDir, ".pre-commit-config.yaml"), PRE_COMMIT_CONFIG_CONTENT, force);
  await writeIfMissing(join(targetDir, ".trufflehogignore"), TRUFFLEHOG_IGNORE_CONTENT, true);
  const opencodeDir = join(targetDir, ".opencode");
  const npmLock = join(opencodeDir, "package-lock.json");
  if (await fileExists(npmLock)) {
    await (await import("fs/promises")).rm(npmLock, { force: true });
    log("updated", npmLock + " (removed stale npm lock)");
  }
  if (await fileExists(join(opencodeDir, "package.json"))) {
    const updateResult = await runCommandCapture(["bun", "update", "aegis-security-agent"], { cwd: opencodeDir });
    if (updateResult.exitCode === 0) {
      writeStdout(`  ${icon.pass}  ${c.green("updated")}  ${c.dim(join(opencodeDir, "node_modules/aegis-security-agent"))}
`);
    }
  }
}
async function installClaudeMode(targetDir, force) {
  const hooksContent = HOOKS_TEMPLATE.replaceAll("__AEGIS_DIR__", AEGIS_DIR);
  await writeIfMissing(join(targetDir, ".claude", "hooks.json"), hooksContent, force);
  await ensureDir(join(targetDir, ".aegis"));
  const auditLogPath = join(targetDir, ".aegis", "audit.jsonl");
  if (!await fileExists(auditLogPath)) {
    await Bun.write(auditLogPath, "");
    log("created", auditLogPath);
  }
  const agentSrc = join(AEGIS_DIR, "docs", "agents", "aegis.md");
  const agentDest = join(targetDir, ".claude", "agents", "aegis.md");
  const agentContent = (await Bun.file(agentSrc).text()).replaceAll("__AEGIS_DIR__", AEGIS_DIR);
  await writeIfMissing(agentDest, agentContent, force);
  await installManagedSkills(targetDir, ".claude");
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
  await writeIfMissing(join(targetDir, ".trufflehogignore"), TRUFFLEHOG_IGNORE_CONTENT, true);
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
var AEGIS_DIR, AEGIS_VERSION, SHIM_CONTENT, OPENCODE_PKG_CONTENT, SKILL_DIRS, ENV_SCHEMA_CONTENT = `# Aegis Security \u2014 Environment Schema
# Add your secrets here. Mark sensitive values with @sensitive.
# See https://varlock.dev for full syntax.
#
# Example:
# @sensitive
# MY_API_KEY=
`, PRE_COMMIT_CONFIG_CONTENT = `repos:
  - repo: https://github.com/trufflesecurity/trufflehog
    rev: v3.82.13
    hooks:
      - id: trufflehog
        name: TruffleHog secret scan (Aegis)
        entry: trufflehog git file://. --since-commit HEAD --only-verified --fail
        language: system
        stages: [pre-commit]
`, TRUFFLEHOG_IGNORE_CONTENT = `# Auto-generated by aegis install. Excludes large binary paths that cause timeouts.
.git/objects/
.git/packed-refs
node_modules/
dist/
build/
*.lock
*.tar.gz
*.tar
*.zip
*.gz
*.whl
*.egg
`;
var init_install = __esm(async () => {
  init_base();
  init_ui();
  AEGIS_DIR = resolve(import.meta.dir, "../..");
  AEGIS_VERSION = (await Bun.file(join(AEGIS_DIR, "package.json")).json()).version;
  SHIM_CONTENT = `// Auto-generated by aegis install v${AEGIS_VERSION}. Do not edit.
// Observation-only mode: registers no hooks, blocks nothing.
export default async () => ({});
`;
  OPENCODE_PKG_CONTENT = JSON.stringify({ dependencies: { "aegis-security-agent": AEGIS_VERSION } }, null, 2) + `
`;
  SKILL_DIRS = ["AgentTrustBoundaries", "SecretSafeHandling", "CommandPathSafety"];
});

// src/lib/provisioner/downloader.ts
import crypto2 from "crypto";
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
  return crypto2.createHash("sha256").update(buffer).digest("hex") === expectedSha256;
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
  _setAutoUpdateOverride: () => _setAutoUpdateOverride,
  _resetAutoUpdateCache: () => _resetAutoUpdateCache,
  _readAutoUpdatePolicy: () => _readAutoUpdatePolicy
});
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
function _readAutoUpdatePolicy() {
  try {
    const policyPath = join6(resolve2(import.meta.dirname, "../../.."), "aegis-policy.json");
    const policy = JSON.parse(readFileSync2(policyPath, "utf-8"));
    return policy.tools?.auto_update !== false;
  } catch {
    return true;
  }
}
function _setAutoUpdateOverride(value) {
  autoUpdateOverride = value;
}
function isAutoUpdateEnabled() {
  return autoUpdateOverride ?? _readAutoUpdatePolicy();
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
var versionCache, checkedThisSession, autoUpdateOverride;
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
import { join as join7 } from "path";
async function emitEvent(event, logPath) {
  const targetPath = logPath ?? join7(process.cwd(), ".aegis", "audit.jsonl");
  const dir = targetPath.substring(0, targetPath.lastIndexOf("/"));
  await ensureDir(dir);
  await appendText(targetPath, JSON.stringify(event) + `
`);
}
var init_emitter = __esm(() => {
  init_base();
});

// src/lib/verdict-log.ts
var exports_verdict_log = {};
__export(exports_verdict_log, {
  readRecentVerdicts: () => readRecentVerdicts,
  formatVerdictEvent: () => formatVerdictEvent,
  createVerdictEvent: () => createVerdictEvent,
  appendVerdictEvent: () => appendVerdictEvent
});
function createVerdictEvent(event) {
  const severity = event.verdict === "BLOCKED" ? "critical" : event.verdict === "RISKY" ? "high" : "info";
  const outcome = event.verdict === "BLOCKED" ? "block" : event.verdict === "RISKY" ? "warn" : "allow";
  return createEvent("scanner.summary", severity, event.scope, `${event.task}: ${event.verdict} \u2014 C:${event.findings.critical} H:${event.findings.high} M:${event.findings.medium} L:${event.findings.low} I:${event.findings.info}`, {
    source: "agent",
    outcome,
    degraded: event.degraded.length > 0 ? true : undefined,
    evidence: {
      verdict: event.verdict,
      task: event.task,
      findings: event.findings,
      degraded: event.degraded,
      commit: event.commit,
      scope: event.scope
    }
  });
}
function formatVerdictEvent(event) {
  return JSON.stringify(createVerdictEvent(event)) + `
`;
}
async function appendVerdictEvent(auditLogPath, event) {
  await emitEvent(createVerdictEvent(event), auditLogPath);
}
function parseVerdictLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (parsed.type === "aegis_verdict") {
    return parsed;
  }
  if (parsed.schema === "aegis/v1" && parsed.kind === "scanner.summary" && parsed.evidence) {
    const evidence = parsed.evidence;
    if (typeof evidence.verdict === "string" && typeof evidence.task === "string") {
      return {
        type: "aegis_verdict",
        ts: parsed.ts ?? new Date().toISOString(),
        task: evidence.task,
        verdict: evidence.verdict,
        findings: evidence.findings ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        degraded: evidence.degraded ?? [],
        commit: evidence.commit ?? "",
        scope: evidence.scope ?? ""
      };
    }
  }
  return null;
}
async function readRecentVerdicts(auditLogPath, count) {
  if (!await fileExists(auditLogPath)) {
    return [];
  }
  const content = await Bun.file(auditLogPath).text();
  const lines = content.trim().split(`
`).filter(Boolean);
  const verdicts = [];
  for (const line of lines) {
    const verdict = parseVerdictLine(line);
    if (verdict) {
      verdicts.push(verdict);
    }
  }
  return verdicts.slice(-count);
}
var init_verdict_log = __esm(async () => {
  init_base();
  init_emitter();
  if (false) {}
});

// src/sarif/builder.ts
function aegisSeverityToSarifLevel(severity) {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    case "info":
      return "note";
  }
}
function findingToResult(finding) {
  const result = {
    ruleId: finding.ruleId,
    level: aegisSeverityToSarifLevel(finding.severity),
    message: { text: finding.message }
  };
  if (finding.location) {
    const loc = {
      physicalLocation: {
        artifactLocation: { uri: finding.location.file },
        ...finding.location.startLine != null ? {
          region: {
            startLine: finding.location.startLine,
            ...finding.location.endLine != null ? { endLine: finding.location.endLine } : {}
          }
        } : {}
      }
    };
    result.locations = [loc];
  }
  if (finding.fingerprint) {
    result.fingerprints = { "aegis/v1": finding.fingerprint };
  }
  if (finding.package) {
    result.properties = { package: finding.package };
  }
  return result;
}
function extractFindings(event) {
  if (event.kind !== "scanner.finding")
    return [];
  const evidence = event.evidence;
  if (!evidence)
    return [];
  const findings = evidence.findings;
  if (!Array.isArray(findings) || findings.length === 0)
    return [];
  return findings;
}
function buildRules(findings) {
  const seen = new Map;
  for (const f of findings) {
    if (!seen.has(f.ruleId)) {
      seen.set(f.ruleId, {
        id: f.ruleId,
        shortDescription: { text: f.message },
        defaultConfiguration: { level: aegisSeverityToSarifLevel(f.severity) }
      });
    }
  }
  return [...seen.values()];
}
function buildInvocations(events) {
  const start = events.find((e) => e.kind === "session.start");
  const end = events.find((e) => e.kind === "session.end");
  if (!start && !end)
    return;
  return [
    {
      executionSuccessful: true,
      ...start ? { startTimeUtc: start.ts } : {},
      ...end ? { endTimeUtc: end.ts } : {}
    }
  ];
}
function findingsToSarif(findings, packageVersion, invocations) {
  const results = findings.map(findingToResult);
  const rules = buildRules(findings);
  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "aegis-security-agent",
            semanticVersion: packageVersion,
            informationUri: "https://github.com/RohiRIK/aegis-security-agent",
            rules
          }
        },
        results,
        ...invocations ? { invocations } : {}
      }
    ]
  };
}
function eventsToSarif(events, packageVersion) {
  const allFindings = [];
  for (const event of events) {
    allFindings.push(...extractFindings(event));
  }
  return findingsToSarif(allFindings, packageVersion, buildInvocations(events));
}
var SARIF_SCHEMA = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json";

// src/cli/report.ts
var exports_report = {};
__export(exports_report, {
  runReport: () => runReport,
  parseReportFlags: () => parseReportFlags
});
import { resolve as resolve3 } from "path";
function parseReportFlags(args) {
  let format = "sarif";
  let output;
  let input;
  for (let i = 0;i < args.length; i++) {
    const arg = args[i];
    if (arg === "--format" && args[i + 1]) {
      if (args[i + 1] !== "sarif") {
        process.stderr.write(`Unsupported format: ${args[i + 1]}. Only 'sarif' is supported.
`);
      }
      format = "sarif";
      i++;
    } else if ((arg === "--output" || arg === "-o") && args[i + 1]) {
      output = args[i + 1];
      i++;
    } else if ((arg === "--input" || arg === "-i") && args[i + 1]) {
      input = args[i + 1];
      i++;
    }
  }
  return { format, output, input };
}
async function getPackageVersion() {
  try {
    const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json();
    return pkg.version;
  } catch {
    return "unknown";
  }
}
function parseNdjson(content) {
  const events = [];
  for (const line of content.split(`
`)) {
    const trimmed = line.trim();
    if (trimmed.length === 0)
      continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      process.stderr.write(`[AEGIS] Skipping unparseable NDJSON line
`);
    }
  }
  return events;
}
async function runReport(flags) {
  const inputPath = flags.input ?? resolve3(process.cwd(), ".aegis", "audit.jsonl");
  const file = Bun.file(inputPath);
  let events = [];
  if (await file.exists()) {
    const content = await file.text();
    events = parseNdjson(content);
  }
  const version = await getPackageVersion();
  const sarif = eventsToSarif(events, version);
  const json = JSON.stringify(sarif, null, 2);
  if (flags.output) {
    const outPath = resolve3(flags.output);
    await Bun.write(outPath, json);
    process.stderr.write(`SARIF report written to ${outPath}
`);
  } else {
    process.stdout.write(json);
  }
  return 0;
}
var init_report = () => {};

// src/core/security.ts
import crypto3 from "crypto";
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
    endLine: result.end?.line,
    ...result.path ? { file: result.path } : {}
  }));
}
function computeFingerprint(parts) {
  return crypto3.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 12);
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
function mapTrivySeverity(severity) {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "medium";
  }
}
function semgrepToNormalized(findings, filePath) {
  return findings.map((f) => {
    const file = f.file ?? filePath;
    return {
      scanner: "semgrep",
      ruleId: `semgrep/${f.rule}`,
      message: f.message,
      severity: mapSemgrepSeverity(f.severity),
      location: {
        file,
        startLine: f.line,
        endLine: f.endLine
      },
      fingerprint: computeFingerprint(["semgrep", `semgrep/${f.rule}`, file, String(f.line)])
    };
  });
}
function trivyToNormalized(stdout, packageName) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const findings = [];
  for (const result of parsed.Results ?? []) {
    for (const vuln of result.Vulnerabilities ?? []) {
      const ruleId = vuln.VulnerabilityID ?? "unknown";
      const pkg = vuln.PkgName ?? packageName;
      findings.push({
        scanner: "trivy",
        ruleId,
        message: vuln.Title ?? "",
        severity: mapTrivySeverity(vuln.Severity ?? "UNKNOWN"),
        package: pkg,
        fingerprint: computeFingerprint(["trivy", ruleId, pkg])
      });
    }
  }
  return findings;
}
function extractTrufflehogLocation(result) {
  const data = result.SourceMetadata?.Data;
  const source = data?.Filesystem ?? data?.Git;
  if (!source?.file)
    return null;
  return { file: source.file, line: typeof source.line === "number" ? source.line : undefined };
}
function trufflehogToNormalized(stdout) {
  const findings = [];
  for (const line of stdout.split(`
`)) {
    const trimmed = line.trim();
    if (trimmed.length === 0)
      continue;
    let result;
    try {
      result = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!result.DetectorName)
      continue;
    const verified = result.Verified === true;
    const detector = result.DetectorName;
    const location = extractTrufflehogLocation(result);
    const ruleId = `trufflehog/${detector}`;
    const fingerprintParts = ["trufflehog", ruleId, location?.file ?? "", String(location?.line ?? 0), String(verified)];
    findings.push({
      scanner: "trufflehog",
      ruleId,
      message: `${verified ? "Verified" : "Unverified"} secret detected: ${detector}`,
      severity: verified ? "critical" : "high",
      ...location ? { location: { file: location.file, ...location.line != null ? { startLine: location.line } : {} } } : {},
      fingerprint: computeFingerprint(fingerprintParts)
    });
  }
  return findings;
}
var init_security = () => {};

// src/lib/scan-cache.ts
import crypto4 from "crypto";
import { join as join8 } from "path";
import { chmod as chmod2 } from "fs/promises";
function computeCacheKey(scanner, version, config, scopeHash) {
  return crypto4.createHash("sha256").update([scanner, version, config, scopeHash].join("|")).digest("hex").slice(0, 16);
}
function computeScopeHash(filePaths, mtimes) {
  const normalized = filePaths.map((filePath, index) => ({ filePath, mtime: mtimes[index] ?? 0 })).sort((left, right) => left.filePath.localeCompare(right.filePath));
  const payload = normalized.map(({ filePath, mtime }) => `${filePath}:${mtime}`).join("|");
  return crypto4.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
function isCacheEntry(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value;
  return typeof entry.key === "string" && typeof entry.timestamp === "number" && typeof entry.ttl === "number" && typeof entry.result === "object" && entry.result !== null;
}
async function readCacheEntry(cacheDir, key) {
  const filePath = join8(cacheDir, `${key}.json`);
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
  await chmod2(cacheDir, 448).catch(() => {});
  const filePath = join8(cacheDir, `${entry.key}.json`);
  await Bun.write(filePath, JSON.stringify(entry));
  await chmod2(filePath, 384).catch(() => {});
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
var CACHE_DIR = ".aegis/scan-cache", CACHE_TTLS;
var init_scan_cache = __esm(() => {
  init_base();
  CACHE_TTLS = {
    semgrep: 600000,
    trivy: 3600000,
    trufflehog: 600000
  };
});

// src/lib/scanner.ts
import crypto5 from "crypto";
import { stat as stat2 } from "fs/promises";
import { join as join9 } from "path";
async function resolveScanner(scanner) {
  try {
    const { ensureLatest: ensureLatest2, resolveToolPath: resolveToolPath2 } = (init_manager(), __toCommonJS(exports_manager));
    await ensureLatest2(scanner);
    return resolveToolPath2(scanner) ?? scanner;
  } catch {
    return scanner;
  }
}
async function runScannerWithTimeout(argv, budgetMs) {
  const startedAt = performance.now();
  try {
    const proc = Bun.spawn(argv, {
      stdout: "pipe",
      stderr: "pipe"
    });
    const timeout = new Promise((resolve4) => {
      setTimeout(() => resolve4({ status: "timeout" }), budgetMs);
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
      exitCode: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      degraded: true,
      durationMs: performance.now() - startedAt
    };
  }
}
async function getScannerVersionSafe(scanner) {
  return getScannerVersion(scanner);
}
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
  const entry = await readCacheEntry(join9(process.cwd(), CACHE_DIR), key);
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
  await writeCacheEntry(join9(process.cwd(), CACHE_DIR), {
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
async function wrapTrufflehog(targetPath) {
  return scannerRunner.runScannerWithTimeout([await resolveScanner("trufflehog"), "filesystem", "--json", targetPath], SCANNER_BUDGETS.trufflehog);
}
var SCANNER_BUDGETS, scannerRunner, versionCache2;
var init_scanner = __esm(() => {
  init_scan_cache();
  SCANNER_BUDGETS = {
    semgrep: 120000,
    trivy: 60000,
    trufflehog: 90000
  };
  scannerRunner = {
    runScannerWithTimeout,
    getScannerVersion
  };
  versionCache2 = new Map;
});

// src/core/verdict.ts
function emptyCounts() {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}
function tallySeverities(findings) {
  const counts = emptyCounts();
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}
function computeVerdict(counts) {
  if (counts.critical > 0)
    return "BLOCKED";
  if (counts.high > 0 || counts.medium > 0)
    return "RISKY";
  return "SAFE";
}
var VERDICT_EXIT_CODE, SCAN_ERROR_EXIT_CODE = 3;
var init_verdict = __esm(() => {
  VERDICT_EXIT_CODE = {
    SAFE: 0,
    RISKY: 1,
    BLOCKED: 2
  };
});

// src/report/html.ts
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function locationText(finding) {
  if (finding.location) {
    const line = finding.location.startLine != null ? `:${finding.location.startLine}` : "";
    return `${finding.location.file}${line}`;
  }
  if (finding.package)
    return finding.package;
  return "\u2014";
}
function renderFindingRows(findings) {
  if (findings.length === 0) {
    return `<tr><td colspan="4" class="empty">No findings.</td></tr>`;
  }
  const sorted = [...findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return sorted.map((f) => `      <tr>
        <td><span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
        <td>${escapeHtml(f.scanner)}</td>
        <td class="rule">${escapeHtml(f.ruleId)}</td>
        <td>${escapeHtml(locationText(f))}<div class="msg">${escapeHtml(f.message)}</div></td>
      </tr>`).join(`
`);
}
function renderScannerRows(report) {
  return report.scanners.map((s) => `      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.version)}</td>
        <td>${escapeHtml(s.status)}</td>
        <td>${Math.round(s.durationMs)} ms</td>
      </tr>`).join(`
`);
}
function renderReportHtml(report) {
  const color = VERDICT_COLOR[report.verdict];
  const c2 = report.counts;
  const degraded = report.degraded.length > 0 ? `<div class="degraded">\u26A0\uFE0F DEGRADED: ${escapeHtml(report.degraded.join(", "))}</div>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aegis Scan \u2014 ${escapeHtml(report.repo)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 2rem; background: #f6f8fa; color: #1f2328; }
  .wrap { max-width: 960px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  .verdict { font-weight: 700; font-size: 1.5rem; padding: .25rem .9rem; border-radius: 8px; color: #fff; background: ${color}; }
  h1 { font-size: 1.25rem; margin: 0; }
  .meta { color: #656d76; font-size: .85rem; }
  .counts { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1rem 0 1.5rem; }
  .pill { padding: .35rem .7rem; border-radius: 999px; font-size: .8rem; font-weight: 600; background: #eaeef2; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 1.5rem; }
  th, td { text-align: left; padding: .6rem .8rem; border-bottom: 1px solid #eaeef2; vertical-align: top; }
  th { background: #f6f8fa; font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: #656d76; }
  .rule { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
  .msg { color: #656d76; font-size: .8rem; margin-top: .2rem; }
  .empty { color: #656d76; text-align: center; }
  .sev { font-weight: 700; text-transform: uppercase; font-size: .72rem; padding: .1rem .45rem; border-radius: 4px; color: #fff; }
  .sev-critical { background: #cf222e; } .sev-high { background: #e16f24; }
  .sev-medium { background: #bf8700; } .sev-low { background: #0969da; } .sev-info { background: #656d76; }
  .degraded { background: #fff8c5; border: 1px solid #eac54f; padding: .5rem .8rem; border-radius: 6px; margin-bottom: 1rem; font-size: .85rem; }
  h2 { font-size: .95rem; margin: 1.5rem 0 .5rem; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="verdict">${escapeHtml(report.verdict)}</span>
    <div>
      <h1>${escapeHtml(report.repo)}</h1>
      <div class="meta">${escapeHtml(report.target)} \xB7 ${escapeHtml(report.date)} \xB7 ${escapeHtml(report.commit)}</div>
    </div>
  </header>
  ${degraded}
  <div class="counts">
    <span class="pill">critical ${c2.critical}</span>
    <span class="pill">high ${c2.high}</span>
    <span class="pill">medium ${c2.medium}</span>
    <span class="pill">low ${c2.low}</span>
    <span class="pill">info ${c2.info}</span>
  </div>
  <h2>Findings (${report.findings.length})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Scanner</th><th>Rule</th><th>Location</th></tr></thead>
    <tbody>
${renderFindingRows(report.findings)}
    </tbody>
  </table>
  <h2>Scanners</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Version</th><th>Status</th><th>Duration</th></tr></thead>
    <tbody>
${renderScannerRows(report)}
    </tbody>
  </table>
  <div class="meta">Generated by aegis-security-agent</div>
</div>
</body>
</html>
`;
}
var VERDICT_COLOR, SEVERITY_ORDER;
var init_html = __esm(() => {
  VERDICT_COLOR = {
    SAFE: "#1a7f37",
    RISKY: "#bf8700",
    BLOCKED: "#cf222e"
  };
  SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];
});

// src/report/catalog.ts
import { homedir as homedir3 } from "os";
import { join as join10 } from "path";
import { chmod as chmod3 } from "fs/promises";
function aegisHome() {
  return process.env.AEGIS_HOME?.trim() || join10(homedir3(), ".aegis");
}
function sanitizeRepoName(name) {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "repo";
}
function catalogDir(root, repo, date, verdict) {
  return join10(root, sanitizeRepoName(repo), date, verdict);
}
async function writeReportCatalog(input, artifacts, opts) {
  const root = opts?.root ?? aegisHome();
  const dir = catalogDir(root, input.repo, input.date, input.verdict);
  await ensureDir(dir);
  await chmod3(dir, 448);
  const files = [
    ["report.html", artifacts.html],
    ["report.sarif", JSON.stringify(artifacts.sarif, null, 2)],
    ["verdict.json", JSON.stringify(artifacts.verdict, null, 2)]
  ];
  for (const [name, contents] of files) {
    const p = join10(dir, name);
    await Bun.write(p, contents);
    await chmod3(p, 384);
  }
  return dir;
}
var init_catalog = __esm(() => {
  init_base();
});

// src/cli/scan.ts
var exports_scan = {};
__export(exports_scan, {
  scanDirectory: () => scanDirectory,
  runScan: () => runScan,
  resolveScanTarget: () => resolveScanTarget,
  repoNameFromUrl: () => repoNameFromUrl,
  parseScanFlags: () => parseScanFlags,
  isGitUrl: () => isGitUrl,
  cleanupStaleClones: () => cleanupStaleClones,
  DEFAULT_MAX_REPO_SIZE_MB: () => DEFAULT_MAX_REPO_SIZE_MB
});
import { basename as basename2, join as join11, resolve as resolve4 } from "path";
import { chmod as chmod4, mkdtemp, readdir as readdir2, rm as rm3, stat as stat3 } from "fs/promises";
import { realpath } from "fs/promises";
import { tmpdir } from "os";
function parseScanFlags(args) {
  let target = ".";
  let out;
  let noCatalog = false;
  let json = false;
  let branch;
  let subpath;
  let allowUntrusted = false;
  let maxRepoSizeMb = DEFAULT_MAX_REPO_SIZE_MB;
  const takeValue = (i) => args[i + 1];
  for (let i = 0;i < args.length; i++) {
    const arg = args[i];
    if (arg === "--target" || arg === "-t") {
      const next = takeValue(i);
      if (next !== undefined) {
        target = next;
        i++;
      }
    } else if (arg === "--out" || arg === "-o") {
      const next = takeValue(i);
      if (next !== undefined) {
        out = next;
        i++;
      }
    } else if (arg === "--branch") {
      const next = takeValue(i);
      if (next !== undefined) {
        branch = next;
        i++;
      }
    } else if (arg === "--subpath") {
      const next = takeValue(i);
      if (next !== undefined) {
        subpath = next;
        i++;
      }
    } else if (arg === "--allow-untrusted") {
      allowUntrusted = true;
    } else if (arg === "--max-repo-size-mb") {
      const next = takeValue(i);
      const parsed = next !== undefined ? Number.parseInt(next, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        maxRepoSizeMb = parsed;
        i++;
      }
    } else if (arg === "--no-catalog") {
      noCatalog = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg && !arg.startsWith("-")) {
      target = arg;
    }
  }
  return { target, out, noCatalog, json, branch, subpath, allowUntrusted, maxRepoSizeMb };
}
async function getPackageVersion2() {
  try {
    const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json();
    return pkg.version;
  } catch {
    return "unknown";
  }
}
async function getCommit(dir) {
  try {
    const result = await runCommandCapture(["git", "-C", dir, "rev-parse", "--short", "HEAD"]);
    return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : "no-git";
  } catch {
    return "no-git";
  }
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function isDegraded(result) {
  return result.degraded || result.status === "timeout" || result.status === "error";
}
async function runSemgrep(dir) {
  const result = await wrapSemgrep(dir);
  const findings = result.status === "error" || result.status === "timeout" ? [] : semgrepToNormalized(parseSemgrepFindings(result.stdout), dir);
  return {
    run: { name: "semgrep", version: await getScannerVersionSafe("semgrep"), status: result.status, durationMs: result.durationMs },
    findings,
    degraded: isDegraded(result)
  };
}
async function runTrivy(dir) {
  const result = await wrapTrivy(["fs", "--scanners", "vuln", "--severity", "HIGH,CRITICAL", "--format", "json", dir]);
  const findings = result.status === "error" || result.status === "timeout" ? [] : trivyToNormalized(result.stdout, "");
  return {
    run: { name: "trivy", version: await getScannerVersionSafe("trivy"), status: result.status, durationMs: result.durationMs },
    findings,
    degraded: isDegraded(result)
  };
}
async function runTrufflehog(dir) {
  const result = await wrapTrufflehog(dir);
  const findings = result.status === "error" || result.status === "timeout" ? [] : trufflehogToNormalized(result.stdout);
  return {
    run: { name: "trufflehog", version: await getScannerVersionSafe("trufflehog"), status: result.status, durationMs: result.durationMs },
    findings,
    degraded: isDegraded(result)
  };
}
async function scanDirectory(dir) {
  const outcomes = await Promise.all([runSemgrep(dir), runTrivy(dir), runTrufflehog(dir)]);
  const findings = outcomes.flatMap((o) => o.findings);
  const counts = tallySeverities(findings);
  const verdict = computeVerdict(counts);
  const degraded = outcomes.filter((o) => o.degraded).map((o) => o.run.name);
  return {
    repo: basename2(dir),
    target: dir,
    date: today(),
    commit: await getCommit(dir),
    verdict,
    counts,
    findings,
    degraded,
    scanners: outcomes.map((o) => o.run)
  };
}
function printSummary(report, catalogPath) {
  const { counts } = report;
  process.stderr.write(`[AEGIS] ${report.verdict} \u2014 ${report.repo} (${report.commit}) ` + `C:${counts.critical} H:${counts.high} M:${counts.medium} L:${counts.low} I:${counts.info}` + `${report.degraded.length > 0 ? ` | DEGRADED: ${report.degraded.join(",")}` : ""}
`);
  if (catalogPath) {
    process.stderr.write(`[AEGIS] Report cataloged at ${catalogPath}
`);
  }
}
function isGitUrl(target) {
  if (/[;&|`$\\!]/.test(target))
    return false;
  return /^(https?|git|ssh):\/\//.test(target) || /^git@[^:]+:.+/.test(target);
}
function repoNameFromUrl(url) {
  let s = url.trim();
  s = s.replace(/^[a-z]+:\/\//i, "");
  s = s.replace(/^[^@/]+@/, "");
  s = s.replace(/:/, "/");
  const parts = s.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "repo";
  return last.replace(/\.git$/i, "") || "repo";
}
async function resolveScanTarget(flags) {
  const { target } = flags;
  if (!isGitUrl(target)) {
    const base = await realpath(resolve4(target)).catch(() => resolve4(target));
    const dir2 = await confineSubpath(base, flags.subpath);
    if (!dir2) {
      return { dir: base, tempCloneDir: null, error: `--subpath escapes target root: ${flags.subpath}` };
    }
    return { dir: dir2, tempCloneDir: null };
  }
  if (!flags.allowUntrusted) {
    return {
      dir: target,
      tempCloneDir: null,
      error: `Refusing to scan untrusted remote repo without --allow-untrusted: ${target}
` + `  Cloning runs scanner tools over attacker-controlled files on this host. ` + `Re-run with --allow-untrusted to accept the risk.`
    };
  }
  const cloneRoot = await mkdtemp(join11(tmpdir(), "aegis-clone-"));
  await chmod4(cloneRoot, 448);
  const repoName = repoNameFromUrl(target);
  const cloneArgs = ["git", "clone", "--depth", "1", "--quiet"];
  if (flags.branch) {
    cloneArgs.push("--branch", flags.branch, "--single-branch");
  }
  cloneArgs.push(target, cloneRoot);
  const clone = await runCommandCapture(cloneArgs);
  if (clone.exitCode !== 0) {
    await rm3(cloneRoot, { recursive: true, force: true }).catch(() => {});
    return {
      dir: target,
      tempCloneDir: null,
      error: `git clone failed (exit ${clone.exitCode}): ${clone.stderr.trim() || "unknown error"}`
    };
  }
  const sizeMb = await dirSizeMb(cloneRoot);
  if (sizeMb > flags.maxRepoSizeMb) {
    await rm3(cloneRoot, { recursive: true, force: true }).catch(() => {});
    return {
      dir: target,
      tempCloneDir: null,
      error: `Repo exceeds size guard: ${sizeMb}MB > ${flags.maxRepoSizeMb}MB (--max-repo-size-mb to raise)`
    };
  }
  const dir = await confineSubpath(cloneRoot, flags.subpath);
  if (!dir) {
    await rm3(cloneRoot, { recursive: true, force: true }).catch(() => {});
    return { dir: cloneRoot, tempCloneDir: null, error: `--subpath escapes clone root: ${flags.subpath}` };
  }
  const catalogName = flags.subpath ? `${repoName}-${flags.subpath.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}` : repoName;
  return { dir, repoName: catalogName, tempCloneDir: cloneRoot };
}
async function confineSubpath(root, subpath) {
  if (!subpath)
    return root;
  const realRoot = await realpath(root).catch(() => root);
  const candidate = resolve4(realRoot, subpath);
  let target;
  try {
    target = await realpath(candidate);
  } catch {
    return candidate;
  }
  const rootWithSep = realRoot.endsWith("/") ? realRoot : realRoot + "/";
  return target === realRoot || target.startsWith(rootWithSep) ? target : null;
}
async function dirSizeMb(dir) {
  const res = await runCommandCapture(["du", "-sm", dir]);
  if (res.exitCode !== 0)
    return 0;
  const mb = Number.parseInt(res.stdout.trim().split(/\s+/)[0] ?? "0", 10);
  return Number.isFinite(mb) ? mb : 0;
}
async function cleanupStaleClones(maxAgeMs = 24 * 60 * 60 * 1000) {
  let removed = 0;
  try {
    const entries = await readdir2(tmpdir(), { withFileTypes: true });
    const now = Date.now();
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith("aegis-clone-"))
        continue;
      const full = join11(tmpdir(), e.name);
      try {
        const s = await stat3(full);
        if (now - s.mtimeMs > maxAgeMs) {
          await rm3(full, { recursive: true, force: true });
          removed++;
        }
      } catch {}
    }
  } catch {}
  return removed;
}
async function runScan(flags) {
  let tempCloneDir = null;
  try {
    const resolved = await resolveScanTarget(flags);
    if (resolved.error) {
      process.stderr.write(`[AEGIS] ${resolved.error}
`);
      return SCAN_ERROR_EXIT_CODE;
    }
    tempCloneDir = resolved.tempCloneDir;
    const dir = resolved.dir;
    if (!await isDirectory(dir)) {
      process.stderr.write(`[AEGIS] Scan target is not a directory: ${dir}
`);
      return SCAN_ERROR_EXIT_CODE;
    }
    const report = await scanDirectory(dir);
    if (resolved.repoName) {
      report.repo = resolved.repoName;
    }
    const version = await getPackageVersion2();
    const sarif = findingsToSarif(report.findings, version);
    const html = renderReportHtml(report);
    const verdictJson = {
      repo: report.repo,
      target: report.target,
      date: report.date,
      commit: report.commit,
      verdict: report.verdict,
      findings: report.counts,
      degraded: report.degraded
    };
    let catalogPath = null;
    if (!flags.noCatalog) {
      catalogPath = await writeReportCatalog({ repo: report.repo, date: report.date, verdict: report.verdict }, { html, sarif, verdict: verdictJson });
    }
    if (flags.out) {
      await Bun.write(resolve4(flags.out), html);
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ...verdictJson, findings: report.findings, counts: report.counts }, null, 2) + `
`);
    } else {
      printSummary(report, catalogPath);
    }
    return VERDICT_EXIT_CODE[report.verdict];
  } catch (error) {
    process.stderr.write(`[AEGIS] Scan error: ${error instanceof Error ? error.message : String(error)}
`);
    return SCAN_ERROR_EXIT_CODE;
  } finally {
    if (tempCloneDir) {
      await rm3(tempCloneDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
async function isDirectory(path) {
  try {
    const { stat: stat4 } = await import("fs/promises");
    return (await stat4(path)).isDirectory();
  } catch {
    return false;
  }
}
var DEFAULT_MAX_REPO_SIZE_MB = 2048;
var init_scan = __esm(() => {
  init_base();
  init_security();
  init_scanner();
  init_scanner();
  init_verdict();
  init_html();
  init_catalog();
});

// src/cli/index.ts
init_ui();
import { resolve as resolve5 } from "path";
var HELP_TEXT = [
  `  ${c.bold("Usage")}`,
  `    ${c.cyan("aegis")} ${c.dim("<command> [flags]")}`,
  "",
  `  ${c.bold("Commands")}`,
  `    ${c.cyan("install")}  ${c.dim("Install Aegis config into the current project")}`,
  `    ${c.cyan("status")}   ${c.dim("Show installation status")}`,
  `    ${c.cyan("tools")}    ${c.dim("Install, check, or remove scanner binaries")}`,
  `    ${c.cyan("scan")}     ${c.dim("Headless deep scan of a directory \u2192 HTML/SARIF/verdict")}`,
  `    ${c.cyan("verdict")}  ${c.dim("Read or append verdict audit log entries")}`,
  `    ${c.cyan("report")}   ${c.dim("Generate security reports from audit data")}`,
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
  const { runInstall: runInstall2 } = await init_install().then(() => exports_install);
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
    case "verdict": {
      const { appendVerdictEvent: appendVerdictEvent2, readRecentVerdicts: readRecentVerdicts2 } = await init_verdict_log().then(() => exports_verdict_log);
      const [subcommand, ...verdictArgs] = args;
      const logPath = resolve5(process.cwd(), ".aegis", "audit.jsonl");
      if (subcommand === "read") {
        const count = Number(verdictArgs[0]) || 10;
        const verdicts = await readRecentVerdicts2(logPath, count);
        if (verdicts.length === 0) {
          process.stdout.write(`No verdict history found.
`);
          return 0;
        }
        for (const v of verdicts) {
          process.stdout.write(`${v.ts} | ${v.verdict} | ${v.task} | C:${v.findings.critical} H:${v.findings.high} M:${v.findings.medium} L:${v.findings.low} I:${v.findings.info}${v.degraded.length > 0 ? ` | DEGRADED: ${v.degraded.join(",")}` : ""}
`);
        }
        return 0;
      }
      if (subcommand === "append") {
        const jsonStr = verdictArgs[0];
        if (!jsonStr) {
          process.stderr.write(`Usage: aegis verdict append '<json>'
`);
          return 1;
        }
        let event;
        try {
          event = JSON.parse(jsonStr);
        } catch {
          process.stderr.write(`Invalid JSON
`);
          return 1;
        }
        await appendVerdictEvent2(logPath, event);
        process.stdout.write(`Verdict appended to ${logPath}
`);
        return 0;
      }
      process.stderr.write(`  ${icon.fail} Unknown verdict subcommand: ${c.bold(subcommand ?? "")}
`);
      process.stderr.write(`  Usage: ${c.cyan("aegis verdict")} ${c.dim("<read|append> [args]")}
`);
      return 1;
    }
    case "help":
    case "--help":
    case "-h":
      printHeader();
      println(HELP_TEXT);
      println();
      return 0;
    case "report": {
      const { runReport: runReport2, parseReportFlags: parseReportFlags2 } = await Promise.resolve().then(() => (init_report(), exports_report));
      return await runReport2(parseReportFlags2(args));
    }
    case "scan": {
      const { runScan: runScan2, parseScanFlags: parseScanFlags2 } = await Promise.resolve().then(() => (init_scan(), exports_scan));
      return await runScan2(parseScanFlags2(args));
    }
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
