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
import { existsSync, readFileSync } from "fs";
import { dirname as dirname2, join as join4 } from "path";
function resolveManifestPath() {
  if (manifestPathCache)
    return manifestPathCache;
  let dir = import.meta.dir;
  for (let i = 0;i < 8; i++) {
    const candidate = join4(dir, "scanners-manifest.json");
    if (existsSync(candidate))
      return manifestPathCache = candidate;
    const parent = dirname2(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  throw new Error(`scanners-manifest.json not found (searched upward from ${import.meta.dir})`);
}
function loadManifest() {
  return JSON.parse(readFileSync(resolveManifestPath(), "utf8"));
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
var manifestPathCache = null;
var init_registry = () => {};

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
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "fs";
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
  if (existsSync2(provisionedPath)) {
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
  if (provisionedPath && existsSync2(provisionedPath)) {
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
        defaultConfiguration: { level: aegisSeverityToSarifLevel(f.severity) },
        ...f.fix ? { help: { text: f.fix } } : {}
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
import { chmod as chmod2, readdir as readdir2, unlink } from "fs/promises";
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
function isCacheableScanner(scanner) {
  return CACHEABLE_SCANNERS.has(scanner);
}
function shouldSkipCache(result, scanner) {
  if (scanner === undefined || !isCacheableScanner(scanner)) {
    return true;
  }
  if (result.status !== "ok") {
    return true;
  }
  return result.stdout.includes("CRITICAL");
}
async function purgeUncacheableEntries(cacheDir) {
  if (CACHEABLE_SCANNERS.size > 0) {
    return 0;
  }
  let names;
  try {
    names = await readdir2(cacheDir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith(".json"))
      continue;
    try {
      await unlink(join8(cacheDir, name));
      removed += 1;
    } catch {}
  }
  return removed;
}
function getCacheTtl(scanner) {
  return CACHE_TTLS[scanner] ?? 600000;
}
var CACHE_DIR = ".aegis/scan-cache", CACHE_TTLS, CACHEABLE_SCANNERS;
var init_scan_cache = __esm(() => {
  init_base();
  CACHE_TTLS = {
    semgrep: 600000,
    trivy: 3600000,
    trufflehog: 600000
  };
  CACHEABLE_SCANNERS = new Set;
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
function normalizeVersionOutput(raw) {
  const firstLine = raw.split(`
`).map((line) => line.trim()).find((line) => line.length > 0);
  if (!firstLine)
    return "unknown";
  const version = firstLine.match(/\bv?(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
  return version?.[1] ?? firstLine;
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
      const version = normalizeVersionOutput(await new Response(proc.stdout).text());
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
async function purgeLegacyCacheOnce() {
  if (legacyCachePurged)
    return;
  legacyCachePurged = true;
  await purgeUncacheableEntries(join9(process.cwd(), CACHE_DIR));
}
async function readScannerCache(scanner, config, scopePaths) {
  await purgeLegacyCacheOnce();
  if (!isCacheableScanner(scanner)) {
    return { key: "", cached: null };
  }
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
  if (shouldSkipCache(result, scanner)) {
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
var SCANNER_BUDGETS, scannerRunner, versionCache2, legacyCachePurged = false;
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

// src/core/patterns.ts
function detectLanguage(path, firstLine) {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot > slash + 1) {
    const byExtension = EXTENSION_LANGUAGE[path.slice(dot + 1).toLowerCase()];
    if (byExtension)
      return byExtension;
  }
  if (firstLine?.startsWith("#!")) {
    for (const [pattern, language] of SHEBANG_LANGUAGE) {
      if (pattern.test(firstLine))
        return language;
    }
  }
  return "any";
}
function ruleAppliesTo(rule, language) {
  if (!rule.languages || rule.languages.includes("any"))
    return true;
  return rule.languages.includes(language);
}
function shannonEntropy(value) {
  if (value.length === 0)
    return 0;
  const freq = new Map;
  for (const ch of value)
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}
function looksLikePlaceholder(text) {
  return PLACEHOLDER_RE.test(text);
}
function octets(ip) {
  return ip.split(".").map((part) => Number.parseInt(part, 10));
}
function classifyIpv4(ip) {
  const [a, b] = octets(ip);
  if (a === 0 || a === 127)
    return null;
  if (a === 255)
    return null;
  if (a >= 224)
    return null;
  if (a === 169 && b === 254)
    return null;
  if (a === 192 && b === 0)
    return null;
  if (a === 198 && (b === 18 || b === 19 || b === 51))
    return null;
  if (a === 203 && b === 0)
    return null;
  if (a === 10)
    return "low";
  if (a === 192 && b === 168)
    return "low";
  if (a === 172 && b >= 16 && b <= 31)
    return "low";
  if (a === 100 && b >= 64 && b <= 127)
    return "low";
  return "medium";
}
function expandIpv6(ip) {
  const halves = ip.toLowerCase().split("::");
  if (halves.length > 2)
    return null;
  const groups = (part) => part ? part.split(":") : [];
  const left = groups(halves[0]);
  const right = groups(halves[1]);
  if (halves.length === 1) {
    if (left.length !== 8)
      return null;
    return left.map((group) => Number.parseInt(group, 16));
  }
  const filled = 8 - left.length - right.length;
  if (filled < 1)
    return null;
  const all = [...left, ...Array.from({ length: filled }, () => "0"), ...right];
  return all.map((group) => Number.parseInt(group, 16));
}
function classifyIpv6(ip) {
  const groups = expandIpv6(ip);
  if (!groups)
    return null;
  const [first, second] = groups;
  if (groups.every((group) => group === 0))
    return null;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1)
    return null;
  if ((first & 65472) === 65152)
    return null;
  if ((first & 65024) === 64512)
    return null;
  if ((first & 65280) === 65280)
    return null;
  if (first === 8193 && second === 3512)
    return null;
  return "low";
}
function rulesForScanner(scanner) {
  return [
    ...PATTERN_RULES.filter((r) => r.scanner === scanner).map((r) => r.id),
    ...PATH_RULES.filter((r) => r.scanner === scanner).map((r) => r.id)
  ];
}
var BUILTIN_SCANNERS, EXTENSION_LANGUAGE, SHEBANG_LANGUAGE, TEST_OR_EXAMPLE_PATH, DOC_OR_GENERATED_PATH, PLACEHOLDER_RE, IGNORE_MARKER = "aegis:ignore", SECRET_RULES, PATH_TRAVERSAL_RULES, IPV4_RE, HARDCODED_IP_RULES, WEAK_CRYPTO_RULES, CUSTOM_PATTERN_RULES, PATH_RULES, PATH_RULE_EXCLUDE, PATTERN_RULES, RULE_FIX_INDEX;
var init_patterns = __esm(() => {
  BUILTIN_SCANNERS = [
    "gitleaks-replacement",
    "custom-patterns",
    "path-traversal",
    "hardcoded-ip",
    "weak-crypto"
  ];
  EXTENSION_LANGUAGE = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "javascript",
    tsx: "javascript",
    mts: "javascript",
    cts: "javascript",
    vue: "javascript",
    svelte: "javascript",
    py: "python",
    pyw: "python",
    pyi: "python",
    ps1: "powershell",
    psm1: "powershell",
    psd1: "powershell",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ksh: "shell"
  };
  SHEBANG_LANGUAGE = [
    [/^#!.*\b(?:python[\d.]*)\b/, "python"],
    [/^#!.*\b(?:bash|sh|zsh|ksh|dash)\b/, "shell"],
    [/^#!.*\b(?:node|bun|deno)\b/, "javascript"],
    [/^#!.*\bpwsh\b/, "powershell"]
  ];
  TEST_OR_EXAMPLE_PATH = /(?:^|\/)(?:tests?|__tests__|__mocks__|__fixtures__|fixtures?|examples?|samples?|spec|specs|e2e|testdata|mocks?)(?:\/|$)|\.(?:test|spec|snap|stories)\.[a-z]+$|(?:^|\/)conftest\.py$|_test\.[a-z]+$/i;
  DOC_OR_GENERATED_PATH = new RegExp(`${TEST_OR_EXAMPLE_PATH.source}|(?:^|/)(?:CHANGELOG|CONTRIBUTING|SECURITY|HISTORY|RELEASE[-_]?NOTES)[^/]*$|(?:^|/)(?:generated|out|dist)/`, "i");
  PLACEHOLDER_RE = /(?:example|placeholder|redacted|dummy|sample|changeme|fake|not[_-]?a[_-]?real|your[_-]?[a-z]*|xxx{2,}|\byyy+\b|<[a-z0-9_ -]+>|\$\{[^}]*\}|\$[A-Z][A-Z0-9_]{2,}|process\.env|import\.meta\.env|os\.environ|os\.getenv|ENV\[|secrets\.[A-Za-z]|vars\.[A-Za-z]|\{\{[^}]*\}\}|0{6,}|1234567|abcdef0)/i;
  SECRET_RULES = [
    {
      scanner: "gitleaks-replacement",
      id: "aws-access-key-id",
      title: "AWS access key ID",
      severity: "high",
      regex: /\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b/g,
      fix: "Deactivate the key in IAM, rotate it, and load it from the environment or AWS SSO instead of source."
    },
    {
      scanner: "gitleaks-replacement",
      id: "aws-secret-access-key",
      title: "AWS secret access key assignment",
      severity: "critical",
      regex: /(?:aws)?_?(?:secret|private)_?(?:access)?_?key\s*[:=]\s*["'`]([A-Za-z0-9/+=]{40})["'`]/gi,
      fix: "Rotate the key pair in IAM immediately and purge it from git history (git filter-repo).",
      minEntropy: 3.5
    },
    {
      scanner: "gitleaks-replacement",
      id: "github-token",
      title: "GitHub personal access / OAuth token",
      severity: "critical",
      regex: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36})\b/g,
      fix: "Revoke the token at github.com/settings/tokens and issue a fine-grained replacement stored in a secret manager."
    },
    {
      scanner: "gitleaks-replacement",
      id: "github-fine-grained-token",
      title: "GitHub fine-grained personal access token",
      severity: "critical",
      regex: /\b(github_pat_[A-Za-z0-9_]{30,})\b/g,
      fix: "Revoke the token at github.com/settings/tokens and re-issue it with the narrowest repo scope needed."
    },
    {
      scanner: "gitleaks-replacement",
      id: "gitlab-token",
      title: "GitLab personal access token",
      severity: "critical",
      regex: /\b(glpat-[A-Za-z0-9_-]{20,})\b/g,
      fix: "Revoke the token in GitLab user settings and replace it with a project CI/CD variable."
    },
    {
      scanner: "gitleaks-replacement",
      id: "npm-token",
      title: "npm access token",
      severity: "critical",
      regex: /\b(npm_[A-Za-z0-9]{36})\b/g,
      fix: "Revoke via `npm token revoke` and inject the replacement as NPM_TOKEN at publish time."
    },
    {
      scanner: "gitleaks-replacement",
      id: "npmrc-auth-token",
      title: "npm registry auth token in .npmrc syntax",
      severity: "critical",
      regex: /_authToken\s*=\s*([A-Za-z0-9._~+/-]{16,}=*)/g,
      fix: "Replace the literal with an env reference (`_authToken=${NPM_TOKEN}`) and revoke the exposed token."
    },
    {
      scanner: "gitleaks-replacement",
      id: "slack-token",
      title: "Slack API token",
      severity: "critical",
      regex: /\b(xox[baprse]-[A-Za-z0-9-]{10,})\b/g,
      fix: "Revoke the token in the Slack app admin console and rotate the app credentials."
    },
    {
      scanner: "gitleaks-replacement",
      id: "slack-webhook",
      title: "Slack incoming webhook URL",
      severity: "high",
      regex: /https:\/\/hooks\.slack\.com\/services\/([A-Za-z0-9+/]{18,})/g,
      fix: "Delete the webhook in Slack \u2014 anyone holding the URL can post as the app \u2014 and re-create it as a secret."
    },
    {
      scanner: "gitleaks-replacement",
      id: "stripe-live-key",
      title: "Stripe live secret key",
      severity: "critical",
      regex: /\b((?:sk|rk)_live_[A-Za-z0-9]{20,})\b/g,
      fix: "Roll the key in the Stripe dashboard now; live keys move money."
    },
    {
      scanner: "gitleaks-replacement",
      id: "stripe-test-key",
      title: "Stripe test secret key",
      severity: "low",
      regex: /\b((?:sk|rk)_test_[A-Za-z0-9]{20,})\b/g,
      fix: "Test keys are low risk but still belong in the environment, not in source."
    },
    {
      scanner: "gitleaks-replacement",
      id: "google-api-key",
      title: "Google API key",
      severity: "high",
      regex: /\b(AIza[0-9A-Za-z_-]{35})\b/g,
      fix: "Regenerate the key in the GCP console and add HTTP-referrer or IP restrictions."
    },
    {
      scanner: "gitleaks-replacement",
      id: "gcp-service-account-key",
      title: "GCP service-account key material",
      severity: "critical",
      regex: /"type"\s*:\s*"(service_account)"/g,
      fix: "Delete the service-account key in IAM and switch to workload identity federation."
    },
    {
      scanner: "gitleaks-replacement",
      id: "openai-api-key",
      title: "OpenAI API key",
      severity: "critical",
      regex: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/g,
      fix: "Revoke at platform.openai.com/api-keys and read the replacement from OPENAI_API_KEY."
    },
    {
      scanner: "gitleaks-replacement",
      id: "anthropic-api-key",
      title: "Anthropic API key",
      severity: "critical",
      regex: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g,
      fix: "Revoke in the Anthropic console and read the replacement from ANTHROPIC_API_KEY."
    },
    {
      scanner: "gitleaks-replacement",
      id: "huggingface-token",
      title: "Hugging Face access token",
      severity: "high",
      regex: /\b(hf_[A-Za-z0-9]{30,})\b/g,
      fix: "Revoke in Hugging Face account settings and use `huggingface-cli login` or HF_TOKEN."
    },
    {
      scanner: "gitleaks-replacement",
      id: "sendgrid-api-key",
      title: "SendGrid API key",
      severity: "critical",
      regex: /\b(SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})\b/g,
      fix: "Delete the key in the SendGrid dashboard \u2014 it can send mail as your domain."
    },
    {
      scanner: "gitleaks-replacement",
      id: "twilio-api-key",
      title: "Twilio API key SID",
      severity: "high",
      regex: /\b(SK[0-9a-fA-F]{32})\b/g,
      fix: "Delete the key in the Twilio console and store the replacement in a secret manager."
    },
    {
      scanner: "gitleaks-replacement",
      id: "azure-storage-account-key",
      title: "Azure storage account key",
      severity: "critical",
      regex: /AccountKey\s*=\s*([A-Za-z0-9+/]{40,}={0,2})/gi,
      fix: "Rotate the storage key in Azure and prefer SAS tokens or managed identity."
    },
    {
      scanner: "gitleaks-replacement",
      id: "private-key-block",
      title: "PEM private key block",
      severity: "critical",
      regex: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE KEY-----/g,
      fix: "Treat the key as compromised: re-issue the key pair, purge from git history, and store keys outside the repo."
    },
    {
      scanner: "gitleaks-replacement",
      id: "docker-config-auth",
      title: "Docker registry auth blob (base64 user:password)",
      severity: "critical",
      regex: /"auth"\s*:\s*"([A-Za-z0-9+/]{20,}={0,2})"/g,
      fix: "Registry auth blobs are plain base64, not encryption. Rotate the registry password and use a credential helper."
    },
    {
      scanner: "gitleaks-replacement",
      id: "docker-login-password",
      title: "Docker login password on the command line",
      severity: "critical",
      regex: /docker\s+login\b[^\n]*?(?:-p|--password)[= ]+(\S{6,})/g,
      fix: "Use `--password-stdin`; a CLI password lands in shell history and process listings. Rotate the credential."
    },
    {
      scanner: "gitleaks-replacement",
      id: "basic-auth-in-url",
      title: "Credentials embedded in a connection URL",
      severity: "high",
      regex: /(?:\b[a-z][a-z0-9+.-]{2,}:)?\/\/[^/\s:@"']+:([^/\s:@"']{4,})@/g,
      fix: "Move the password out of the URL into an env var or connection-secret, and rotate it.",
      minEntropy: 2
    },
    {
      scanner: "gitleaks-replacement",
      id: "jwt-token",
      title: "JSON Web Token literal",
      severity: "medium",
      regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
      fix: "JWT payloads are readable by anyone. If it is a live session or service token, revoke and re-issue it."
    },
    {
      scanner: "gitleaks-replacement",
      id: "generic-api-key-assignment",
      title: "High-entropy value assigned to an api-key/secret/token name",
      severity: "high",
      regex: /\b(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?token)\s*[:=]\s*["'`]([A-Za-z0-9_\-+/.=]{16,})["'`]/gi,
      fix: "Read the value from the environment at runtime and rotate the exposed credential.",
      minEntropy: 4
    },
    {
      scanner: "gitleaks-replacement",
      id: "generic-api-key-hex-assignment",
      title: "Hex-encoded key assigned to an api-key/secret/token name",
      severity: "high",
      regex: /\b(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?token)\s*[:=]\s*["'`]([0-9a-f]{32,})["'`]/gi,
      fix: "Read the value from the environment at runtime and rotate the exposed credential.",
      minEntropy: 3,
      pathExcludes: TEST_OR_EXAMPLE_PATH
    },
    {
      scanner: "gitleaks-replacement",
      id: "generic-password-assignment",
      title: "Literal password assignment",
      severity: "medium",
      regex: /\b(?:password|passwd|pwd|passphrase)\s*[:=]\s*["'`]([^"'`\n]{8,})["'`]/gi,
      fix: "Load the password from a secret store; if it is a real credential, rotate it.",
      minEntropy: 2.2,
      pathExcludes: TEST_OR_EXAMPLE_PATH
    },
    {
      scanner: "gitleaks-replacement",
      id: "high-entropy-string-assignment",
      title: "High-entropy string assigned to a variable",
      severity: "low",
      regex: /\b\w+\s*[:=]\s*["'`]([A-Za-z0-9_\-+/.=]{20,})["'`]/g,
      fix: "Verify this value is a placeholder or move it to a secret manager and rotate it.",
      minEntropy: 4,
      pathExcludes: TEST_OR_EXAMPLE_PATH
    }
  ];
  PATH_TRAVERSAL_RULES = [
    {
      scanner: "path-traversal",
      id: "fs-read-from-request",
      title: "Filesystem call takes a path derived from request input",
      severity: "high",
      regex: /\b(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|createWriteStream|unlink|unlinkSync|sendFile|appendFile|openSync)\s*\([^)]{0,160}\b(?:req|request)\.(?:query|params|body|headers|url)\b/g,
      fix: "Resolve the path and assert it stays under an allowed root (path.resolve + startsWith), or map input through an allowlist of ids."
    },
    {
      scanner: "path-traversal",
      id: "path-join-request-input",
      title: "Path join with unvalidated request input",
      severity: "high",
      regex: /\b(?:path\.(?:join|resolve)|os\.path\.join)\s*\([^)]{0,160}\b(?:req|request)\.(?:query|params|body|args|form|values|headers)\b/g,
      fix: "path.join does not prevent traversal. Normalize first, then reject any result outside the base directory."
    },
    {
      scanner: "path-traversal",
      id: "python-open-request-input",
      title: "Python open() on request-controlled path",
      severity: "high",
      regex: /\bopen\s*\(\s*[^)]{0,120}\brequest\.(?:args|form|json|values|GET|POST)\b/g,
      fix: "Use werkzeug.utils.secure_filename or resolve against a fixed root and verify with os.path.commonpath."
    },
    {
      scanner: "path-traversal",
      id: "encoded-traversal-sequence",
      title: "URL-encoded directory traversal sequence",
      severity: "high",
      regex: /(?:%2e%2e(?:%2f|%5c|\/|\\)|\.\.%2f|\.\.%5c)/gi,
      fix: "Decode once, then canonicalize and re-validate. Double-decoding is how traversal filters get bypassed."
    },
    {
      scanner: "path-traversal",
      id: "literal-traversal-path",
      title: "Literal ../../.. traversal in a path string",
      severity: "medium",
      regex: /["'`][^"'`\n]*(?:\.\.[\\/]){3,}[^"'`\n]*["'`]/g,
      fix: "Deep relative paths break when the working directory moves. Anchor to a module-relative or configured root.",
      lineExcludes: /(?:^\s*(?:\/\/|#|\*))|(?:import|require|from)\s/
    },
    {
      scanner: "path-traversal",
      id: "archive-entry-path-join",
      title: "Archive entry name joined onto a path (zip-slip)",
      severity: "medium",
      regex: /\b(?:path\.join|path\.resolve|os\.path\.join)\s*\([^)]{0,120}\b(?:entry|zipEntry|zip_entry|member|tarinfo|archiveEntry)\b/g,
      fix: "Archive entries can contain `../`. Resolve each entry and skip any that escapes the extraction root."
    },
    {
      scanner: "path-traversal",
      id: "path-build-from-ctx-input",
      title: "Filesystem call takes a path from Koa/Express ctx or Fastify request",
      severity: "high",
      regex: /\b(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|unlink|unlinkSync|sendFile|appendFile|openSync)\s*\([^)]{0,160}\b(?:ctx|context|request)\s*\./g,
      fix: "Resolve the path and assert it stays under an allowed root (path.resolve + startsWith)."
    },
    {
      scanner: "path-traversal",
      id: "go-file-open-from-request",
      title: "Go file open on a request-controlled path",
      severity: "high",
      regex: /\b(?:os\.Open(?:File)?|os\.ReadFile|ioutil\.ReadFile|os\.Create|os\.Remove)\s*\([^)]{0,160}\b(?:r\.URL\.Query|r\.Form|r\.PostForm|r\.FormValue|mux\.Vars)\b/g,
      fix: "Use filepath.Clean, then verify the result is still under the base directory before opening it."
    },
    {
      scanner: "path-traversal",
      id: "ruby-file-read-from-params",
      title: "Ruby File operation on a params-controlled path",
      severity: "high",
      regex: /\bFile\.(?:read|open|join|delete|binread)\s*\([^)]{0,160}\b(?:params|request)\b/g,
      fix: "Reject the input unless it matches an allowlist, or use File.expand_path and check it stays under the root."
    },
    {
      scanner: "path-traversal",
      id: "java-file-from-request-parameter",
      title: "Java file stream opened on a request parameter",
      severity: "high",
      regex: /\bnew\s+File(?:InputStream|Reader|OutputStream|Writer)?\s*\([^)]{0,160}\b(?:request|req)\.getParameter\b/g,
      fix: "Canonicalize with File.getCanonicalPath() and assert the result starts with the allowed base directory."
    },
    {
      scanner: "path-traversal",
      id: "php-file-read-from-superglobal",
      title: "PHP file read from a request superglobal",
      severity: "high",
      regex: /\b(?:file_get_contents|fopen|readfile|include|include_once|require|require_once|unlink)\s*\(?[^;\n]{0,160}\$_(?:GET|POST|REQUEST|COOKIE)\b/g,
      fix: "Map the input through an allowlist of ids; realpath() alone still resolves outside the web root."
    }
  ];
  IPV4_RE = /\b((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})\b/g;
  HARDCODED_IP_RULES = [
    {
      scanner: "hardcoded-ip",
      id: "hardcoded-ipv4",
      title: "Hardcoded IPv4 address",
      severity: "medium",
      regex: IPV4_RE,
      fix: "Move the address to configuration. Baked-in IPs break on redeploy and leak internal topology.",
      lineExcludes: /(?:version|semver|\bv\d+\.\d+|@\d+\.\d+\.\d+|\bchangelog\b|\breleases?\b|copyright|\u00A9)/i,
      classify: classifyIpv4
    },
    {
      scanner: "hardcoded-ip",
      id: "hardcoded-ipv6",
      title: "Hardcoded IPv6 address",
      severity: "low",
      regex: /(?<![:.\w])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?|::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6}))(?![:.\w])/g,
      fix: "Move the address to configuration rather than embedding it in source.",
      classify: classifyIpv6
    }
  ];
  WEAK_CRYPTO_RULES = [
    {
      scanner: "weak-crypto",
      id: "weak-hash-md5",
      title: "MD5 hash construction",
      severity: "medium",
      regex: /(?:createHash\s*\(\s*["'`]md5["'`]|hashlib\.md5\s*\(|MD5\.new\s*\(|md5\.New\s*\()/gi,
      fix: "MD5 is collision-broken. Use SHA-256 for integrity, or argon2id/bcrypt for passwords."
    },
    {
      scanner: "weak-crypto",
      id: "weak-hash-sha1",
      title: "SHA-1 hash construction",
      severity: "medium",
      regex: /(?:createHash\s*\(\s*["'`]sha-?1["'`]|hashlib\.sha1\s*\(|SHA1\.new\s*\(|sha1\.New\s*\()/gi,
      fix: "SHA-1 is collision-broken. Move to SHA-256 or SHA-3."
    },
    {
      scanner: "weak-crypto",
      id: "weak-cipher-des",
      title: "DES / 3DES cipher",
      severity: "high",
      regex: /(?:["'`](?:des|des3|des-ede3?)(?:-[a-z0-9]+)*["'`]|\bDES\.new\s*\(|\btriple.?des\b)/gi,
      fix: "DES and 3DES are retired (64-bit blocks, Sweet32). Use AES-256-GCM."
    },
    {
      scanner: "weak-crypto",
      id: "weak-cipher-rc4",
      title: "RC4 cipher",
      severity: "high",
      regex: /(?:["'`]rc4(?:-[a-z0-9]+)?["'`]|\bARC4\b|\bRC4\.new\s*\()/gi,
      fix: "RC4 has practical keystream biases. Use AES-256-GCM or ChaCha20-Poly1305."
    },
    {
      scanner: "weak-crypto",
      id: "ecb-mode",
      title: "ECB block-cipher mode",
      severity: "high",
      regex: /(?:["'`][a-z0-9-]*-ecb["'`]|MODE_ECB)/gi,
      fix: "ECB leaks plaintext structure block by block. Use GCM (authenticated) instead."
    },
    {
      scanner: "weak-crypto",
      id: "deprecated-create-cipher",
      title: "crypto.createCipher (MD5-derived key, no IV)",
      severity: "high",
      regex: /\bcrypto\.createCipher(?:iv)?\s*\(\s*["'`](?:des|rc4|[a-z0-9-]*-ecb)/gi,
      fix: "Use crypto.createCipheriv with AES-256-GCM and a random 12-byte IV per message."
    },
    {
      scanner: "weak-crypto",
      id: "insecure-random-for-secret",
      title: "Math.random() used to build a token/secret/nonce",
      severity: "high",
      regex: /\b(?:token|secret|password|passwd|apikey|api_key|nonce|salt|iv|session[_-]?id|otp)\b[^\n]{0,60}Math\.random\s*\(/gi,
      fix: "Math.random is not a CSPRNG. Use crypto.randomBytes / crypto.getRandomValues."
    },
    {
      scanner: "weak-crypto",
      id: "pseudo-random-bytes",
      title: "crypto.pseudoRandomBytes (non-cryptographic)",
      severity: "high",
      regex: /\bcrypto\.pseudoRandomBytes\s*\(/g,
      fix: "Replace with crypto.randomBytes."
    },
    {
      scanner: "weak-crypto",
      id: "tls-verification-disabled",
      title: "TLS certificate verification disabled",
      severity: "high",
      regex: /(?:NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*["'`]?0|rejectUnauthorized\s*:\s*false|InsecureSkipVerify\s*:\s*true|ssl\._?create_unverified_context|ssl\.CERT_NONE|verify\s*=\s*False|--insecure\b|curl\b[^\n]*\s-k\b)/g,
      fix: "Disabling verification defeats TLS entirely. Trust a pinned CA bundle instead."
    },
    {
      scanner: "weak-crypto",
      id: "jwt-algorithm-none",
      title: "JWT algorithm set to none",
      severity: "critical",
      regex: /["'`]?alg(?:orithm)?["'`]?\s*[:=]\s*["'`]none["'`]/gi,
      fix: "`alg: none` means unsigned tokens anyone can forge. Pin an explicit allowlist (RS256/EdDSA)."
    },
    {
      scanner: "weak-crypto",
      id: "weak-rsa-key-size",
      title: "RSA key size below 2048 bits",
      severity: "high",
      regex: /(?:modulusLength|key_?size|rsa_keygen_bits|-b\s)\s*[:=]?\s*(?:512|1024)\b/g,
      fix: "Generate at least 2048-bit RSA, or prefer Ed25519."
    },
    {
      scanner: "weak-crypto",
      id: "static-initialization-vector",
      title: "Static / hardcoded initialization vector",
      severity: "medium",
      regex: /\biv\s*[:=]\s*(?:Buffer\.from\s*\(\s*)?["'`]([A-Za-z0-9+/=]{8,})["'`]/g,
      fix: "Reusing an IV across messages breaks CTR/GCM confidentiality. Generate a fresh random IV per encryption."
    },
    {
      scanner: "weak-crypto",
      id: "hardcoded-crypto-salt",
      title: "Hardcoded password-hashing salt",
      severity: "medium",
      regex: /\bsalt\s*[:=]\s*["'`]([^"'`\n]{4,})["'`]/gi,
      fix: "A shared salt lets one rainbow table cover every user. Generate a random per-user salt.",
      pathExcludes: TEST_OR_EXAMPLE_PATH
    },
    {
      scanner: "weak-crypto",
      id: "weak-hash-md5-broad",
      title: "MD5 hash construction (language-agnostic)",
      severity: "medium",
      regex: /(?:["'`]MD5["'`]|\.getInstance\s*\(\s*["'`]MD5["'`]|md5\s*\(|MD5\.Create\s*\(|Md5::new\s*\()/gi,
      fix: "MD5 is collision-broken. Use SHA-256 for integrity, argon2id/bcrypt for passwords.",
      pathExcludes: /(?:node_modules|\.test\.[a-z]+$|spec\.[a-z]+$)/i
    },
    {
      scanner: "weak-crypto",
      id: "weak-hash-sha1-broad",
      title: "SHA-1 hash construction (language-agnostic)",
      severity: "medium",
      regex: /(?:["'`]SHA-?1["'`]|\.getInstance\s*\(\s*["'`]SHA-?1["'`]|sha1\s*\(|SHA1\.Create\s*\(|Sha1::new\s*\()/gi,
      fix: "SHA-1 is collision-broken. Move to SHA-256 or SHA-3.",
      pathExcludes: /(?:node_modules|\.test\.[a-z]+$|spec\.[a-z]+$)/i
    }
  ];
  CUSTOM_PATTERN_RULES = [
    {
      scanner: "custom-patterns",
      id: "python-eval-exec",
      title: "Python eval()/exec() on a runtime value",
      severity: "high",
      languages: ["python"],
      regex: /\b(?:eval|exec)\s*\(\s*(?!["'](?:[^"']*)["']\s*\))/g,
      fix: "eval/exec grant arbitrary code execution. Use ast.literal_eval for data, or a dispatch dict for behaviour."
    },
    {
      scanner: "custom-patterns",
      id: "python-pickle-load",
      title: "Python pickle deserialization",
      severity: "high",
      languages: ["python"],
      regex: /\b(?:pickle|cPickle|dill|shelve)\.(?:loads?|Unpickler)\s*\(/g,
      fix: "Unpickling executes constructor code. Use JSON, or sign the payload and verify before loading."
    },
    {
      scanner: "custom-patterns",
      id: "python-os-system",
      title: "Python os.system / os.popen command execution",
      severity: "high",
      languages: ["python"],
      regex: /\bos\.(?:system|popen[234]?)\s*\(/g,
      fix: "Use subprocess.run([...]) with an argument list so the shell never parses your string."
    },
    {
      scanner: "custom-patterns",
      id: "python-subprocess-shell-true",
      title: "Python subprocess with shell=True",
      severity: "high",
      languages: ["python"],
      regex: /\bsubprocess\.(?:run|call|check_output|check_call|Popen)\s*\([^)]{0,200}shell\s*=\s*True/g,
      fix: "Drop shell=True and pass an argument list; with a shell, any interpolated value becomes code."
    },
    {
      scanner: "custom-patterns",
      id: "python-yaml-unsafe-load",
      title: "Python yaml.load without SafeLoader",
      severity: "high",
      languages: ["python"],
      regex: /\byaml\.load\s*\((?![^)]*(?:SafeLoader|safe_load))/g,
      fix: "Use yaml.safe_load \u2014 the default loader can instantiate arbitrary Python objects."
    },
    {
      scanner: "custom-patterns",
      id: "python-fstring-sql",
      title: "SQL statement built by f-string / concatenation",
      severity: "high",
      languages: ["python"],
      regex: /(?:execute|executemany|raw|cursor\.execute)\s*\(\s*(?:f["']|["'][^"']*["']\s*(?:%|\+|\.format))/gi,
      fix: "Pass parameters as the second argument (`cur.execute(sql, params)`) so the driver binds them."
    },
    {
      scanner: "custom-patterns",
      id: "python-assert-as-validation",
      title: "assert used for runtime validation",
      severity: "medium",
      languages: ["python"],
      regex: /^\s*assert\s+(?:request|user|token|auth|is_|has_|permission)/gm,
      fix: "`python -O` strips asserts. Raise an explicit exception for security checks.",
      pathExcludes: TEST_OR_EXAMPLE_PATH
    },
    {
      scanner: "custom-patterns",
      id: "python-tempfile-mktemp",
      title: "Predictable temp file (tempfile.mktemp)",
      severity: "medium",
      languages: ["python"],
      regex: /\btempfile\.mktemp\s*\(/g,
      fix: "Use tempfile.mkstemp / NamedTemporaryFile \u2014 mktemp races between the name check and the open."
    },
    {
      scanner: "custom-patterns",
      id: "js-innerhtml-from-input",
      title: "innerHTML assigned from request/user data",
      severity: "high",
      languages: ["javascript"],
      regex: /\binnerHTML\s*=\s*(?:[^"'`\n]{0,80}?\b(?:req|request|input|data|user|payload|params|query|body)\b|[^\n]{0,120}?(?:\+|\$\{)\s*[\w.]{0,40}(?:req|input|user|payload|param|quer|body|data))/gi,
      fix: "Assign through textContent, or sanitize with DOMPurify before it reaches innerHTML."
    },
    {
      scanner: "custom-patterns",
      id: "js-document-write",
      title: "document.write()",
      severity: "medium",
      languages: ["javascript"],
      regex: /\bdocument\.write(?:ln)?\s*\((?!\s*\))/g,
      fix: "document.write parses its argument as HTML and blocks the parser. Build nodes and append them instead."
    },
    {
      scanner: "custom-patterns",
      id: "react-dangerously-set-inner-html",
      title: "React dangerouslySetInnerHTML",
      severity: "medium",
      languages: ["javascript"],
      regex: /\bdangerouslySetInnerHTML\s*=\s*\{/g,
      fix: "Render the value as text, or sanitize it (DOMPurify) at the boundary and note why raw HTML is required."
    },
    {
      scanner: "custom-patterns",
      id: "js-eval-on-runtime-value",
      title: "JavaScript eval() / new Function() on a runtime value",
      severity: "high",
      languages: ["javascript"],
      regex: /\beval\s*\((?!\s*\)|\s*["'`][^"'`]*["'`]\s*\))|\bnew\s+Function\s*\((?!\s*\))/g,
      fix: "eval and new Function compile whatever string reaches them. Use a dispatch object or JSON.parse for data."
    },
    {
      scanner: "custom-patterns",
      id: "js-child-process-template-string",
      title: "Shell command built from a template string",
      severity: "high",
      languages: ["javascript"],
      regex: /\b(?:exec|execSync|spawn|spawnSync|execFile)\s*\(\s*`[^`]*\$\{/g,
      fix: "Interpolation makes the value part of the command. Pass an argument array to execFile/spawn instead."
    },
    {
      scanner: "custom-patterns",
      id: "powershell-invoke-expression",
      title: "PowerShell Invoke-Expression / IEX",
      severity: "high",
      languages: ["powershell"],
      regex: /(?:\bInvoke-Expression\b|\bIEX\b)/gi,
      fix: "IEX executes whatever string reaches it. Call the cmdlet directly or use a scriptblock with & ."
    },
    {
      scanner: "custom-patterns",
      id: "powershell-download-execute",
      title: "PowerShell download-and-execute chain",
      severity: "critical",
      languages: ["powershell"],
      regex: /(?:Net\.WebClient|Invoke-WebRequest|Invoke-RestMethod|curl|wget)[^\n]{0,120}\|\s*(?:IEX|Invoke-Expression)/gi,
      fix: "Download to a file, verify a signature or hash, then execute. Never pipe remote content into an evaluator."
    },
    {
      scanner: "custom-patterns",
      id: "powershell-skip-certificate-check",
      title: "PowerShell certificate validation disabled",
      severity: "high",
      languages: ["powershell"],
      regex: /(?:-SkipCertificateCheck\b|ServerCertificateValidationCallback\s*=\s*\{?\s*\$?true|\[System\.Net\.ServicePointManager\]::ServerCertificateValidationCallback)/gi,
      fix: "Trust the correct CA or pin the thumbprint instead of accepting every certificate."
    },
    {
      scanner: "custom-patterns",
      id: "powershell-plaintext-secure-string",
      title: "ConvertTo-SecureString -AsPlainText",
      severity: "high",
      languages: ["powershell"],
      regex: /ConvertTo-SecureString\b[^\n]{0,120}-AsPlainText/gi,
      fix: "A SecureString built from a literal is not secret. Read the credential from a vault or Get-Credential."
    },
    {
      scanner: "custom-patterns",
      id: "powershell-plaintext-password-variable",
      title: "PowerShell password variable assigned a literal",
      severity: "high",
      languages: ["powershell"],
      regex: /\$(?:password|passwd|pwd|secret|apikey|token)\s*=\s*["'][^"'\n]{6,}["']/gi,
      fix: "Pull the value from Get-Credential, SecretManagement, or an environment variable."
    },
    {
      scanner: "custom-patterns",
      id: "powershell-assembly-load",
      title: "Reflective assembly load",
      severity: "high",
      languages: ["powershell"],
      regex: /\[(?:System\.)?Reflection\.Assembly\]::Load(?:File|WithPartialName)?\s*\(/gi,
      fix: "Loading assemblies from bytes at runtime is a common in-memory execution technique. Reference a signed assembly instead."
    },
    {
      scanner: "custom-patterns",
      id: "powershell-runkey-persistence",
      title: "Registry Run-key persistence",
      severity: "high",
      languages: ["powershell"],
      regex: /(?:HKCU|HKLM|HKEY_[A-Z_]+):?\\+(?:SOFTWARE\\+)?Microsoft\\+Windows\\+CurrentVersion\\+Run/gi,
      fix: "Auto-start registration belongs in an installer with user consent, not inline in a script."
    },
    {
      scanner: "custom-patterns",
      id: "shell-pipe-to-interpreter",
      title: "Remote content piped straight into a shell",
      severity: "critical",
      languages: ["shell", "any"],
      regex: /(?:curl|wget)\b[^\n|]{0,160}\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b/g,
      fix: "Download, checksum, review, then run. A piped installer executes whatever the server returns at that moment."
    },
    {
      scanner: "custom-patterns",
      id: "shell-eval-command-substitution",
      title: "eval over command substitution",
      severity: "high",
      languages: ["shell"],
      regex: /\beval\s+["']?\$\(/g,
      fix: "Assign the output to a variable and branch on it; eval re-parses the result as code."
    },
    {
      scanner: "custom-patterns",
      id: "shell-predictable-temp-file",
      title: "Predictable /tmp path",
      severity: "medium",
      languages: ["shell"],
      regex: /(?:>|>>|=|\s)\/tmp\/[A-Za-z0-9._-]+(?:\$\$)?(?:\s|$|")/g,
      fix: "Use mktemp so an attacker cannot pre-create or symlink the path.",
      lineExcludes: /mktemp/
    },
    {
      scanner: "custom-patterns",
      id: "shell-recursive-force-remove-root",
      title: "rm -rf against a root-anchored or unquoted path",
      severity: "high",
      languages: ["shell", "any"],
      regex: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+)*-?[a-zA-Z]*f?[a-zA-Z]*\s+(?:\/|"?\$\{?\w+)/g,
      fix: 'Guard the target: `[ -n "$dir" ] && [ -d "$dir" ] || exit 1`. An empty variable turns this into `rm -rf /`.'
    },
    {
      scanner: "custom-patterns",
      id: "shell-world-writable-chmod",
      title: "chmod granting world write/execute",
      severity: "medium",
      languages: ["shell", "any"],
      regex: /\bchmod\s+(?:-R\s+)?(?:777|776|766|666|a\+rwx|o\+w)\b/g,
      fix: "Grant the narrowest mode that works \u2014 755 for executables, 644 for data, 600 for secrets."
    },
    {
      scanner: "custom-patterns",
      id: "long-base64-blob",
      title: "Long base64 blob embedded in source",
      severity: "low",
      regex: /["'`]([A-Za-z0-9+/]{120,}={0,2})["'`]/g,
      fix: "Embedded blobs hide payloads and credentials from review. Store the artifact as a file with a checksum.",
      minEntropy: 4.5,
      pathExcludes: TEST_OR_EXAMPLE_PATH,
      classify: (value) => new Set(value).size <= 8 ? null : "low"
    },
    {
      scanner: "custom-patterns",
      id: "security-todo-marker",
      title: "Unresolved security TODO/FIXME/HACK",
      severity: "info",
      regex: /(?:TODO|FIXME|HACK|XXX)\b[^\n]{0,80}?\b(?:secur|auth|authz|vulnerab|inject|sanitiz|escap|encrypt|permission|exploit|csrf|xss)/gi,
      fix: "Track it as an issue with an owner; an inline marker is not a plan.",
      pathExcludes: DOC_OR_GENERATED_PATH
    },
    {
      scanner: "custom-patterns",
      id: "disabled-security-control",
      title: "Security control disabled inline",
      severity: "medium",
      regex: /(?:nosec|nosemgrep|eslint-disable(?:-next)?-line\s+security|type:\s*ignore\[.*security|#\s*noqa:\s*S\d|SkipSecurity|disableSecurity|allow_insecure\s*=\s*(?:true|True))/g,
      fix: "Suppressions need a written justification next to them, or they outlive the reason they were added."
    }
  ];
  PATH_RULES = [
    {
      scanner: "gitleaks-replacement",
      id: "committed-private-key-file",
      title: "Private key / keystore file committed to the repo",
      severity: "high",
      regex: /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx|jks|keystore|ppk))$/i,
      fix: "Remove the file, purge it from git history, re-issue the key pair, and keep keys outside the working tree."
    },
    {
      scanner: "gitleaks-replacement",
      id: "committed-env-file",
      title: "Environment file committed to the repo",
      severity: "medium",
      regex: /(?:^|\/)\.env(?:\.[A-Za-z0-9_-]+)?$/,
      fix: "Delete from the repo, add `.env*` to .gitignore, and keep only a committed `.env.example` / `.env.schema`."
    },
    {
      scanner: "gitleaks-replacement",
      id: "committed-credentials-file",
      title: "Credentials file committed to the repo",
      severity: "high",
      regex: /(?:^|\/)(?:\.netrc|\.pypirc|\.dockercfg|credentials(?:\.json|\.yml|\.yaml)?|service[-_]account[^/]*\.json|kubeconfig)$/i,
      fix: "Remove the file and purge from history; rotate every credential it contained."
    }
  ];
  PATH_RULE_EXCLUDE = /(?:\.example$|\.sample$|\.template$|\.schema$|\.dist$)/i;
  PATTERN_RULES = [
    ...SECRET_RULES,
    ...CUSTOM_PATTERN_RULES,
    ...PATH_TRAVERSAL_RULES,
    ...HARDCODED_IP_RULES,
    ...WEAK_CRYPTO_RULES
  ];
  RULE_FIX_INDEX = Object.fromEntries([
    ...PATTERN_RULES.map((r) => [`${r.scanner}/${r.id}`, r.fix]),
    ...PATH_RULES.map((r) => [`${r.scanner}/${r.id}`, r.fix])
  ]);
});

// src/core/builtin-scan.ts
import crypto6 from "crypto";
import { readdir as readdir3, readFile, stat as stat3 } from "fs/promises";
import { isAbsolute, join as join10, relative, sep } from "path";
function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}
function isMinified(name) {
  return /\.min\.(?:js|css|mjs)$/i.test(name) || /\.bundle\.js$/i.test(name);
}
function fingerprint(parts) {
  return crypto6.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 12);
}
function compileIgnorePatterns(text) {
  const patterns = [];
  for (const raw of text.split(`
`)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith("!"))
      continue;
    const body = line.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/\*\*$/, "");
    if (body.length === 0)
      continue;
    const resolved = body.replace(/\*\*\/|\*\*|[*?]|[.+^${}()|[\]\\]/g, (token) => {
      switch (token) {
        case "**/":
          return "(?:[^/]+/)*";
        case "**":
          return ".*";
        case "*":
          return "[^/]*";
        case "?":
          return "[^/]";
        default:
          return `\\${token}`;
      }
    });
    patterns.push(new RegExp(`(?:^|/)${resolved}(?:/|$)`));
  }
  return patterns;
}
function createPathExcluder(root, patterns) {
  const ignore = compileIgnorePatterns(patterns.join(`
`));
  if (ignore.length === 0)
    return () => false;
  return (file) => {
    if (!file)
      return false;
    const rel = (isAbsolute(file) ? relative(root, file) : file).split(sep).join("/");
    if (rel.length === 0 || rel === ".." || rel.startsWith("../"))
      return false;
    return ignore.some((re) => re.test(rel));
  };
}
async function readIgnorePatterns(root, extra) {
  const patterns = extra?.length ? compileIgnorePatterns(extra.join(`
`)) : [];
  for (const name of [".aegisignore", ".gitignore"]) {
    try {
      patterns.push(...compileIgnorePatterns(await readFile(join10(root, name), "utf8")));
    } catch {}
  }
  return patterns;
}
function matchValue(match) {
  return match[1] ?? match[0];
}
function rejects(rule, value, line, path, entropyGate) {
  if (rule.pathExcludes?.test(path))
    return true;
  if (rule.lineExcludes?.test(line))
    return true;
  const minEntropy = rule.minEntropy != null ? entropyGate ?? rule.minEntropy : undefined;
  if (minEntropy != null && shannonEntropy(value) < minEntropy)
    return true;
  if (rule.scanner === "gitleaks-replacement" && (looksLikePlaceholder(value) || looksLikePlaceholder(line))) {
    return true;
  }
  return false;
}
function scanContent(path, content, options, timings) {
  const maxLineLength = options?.maxLineLength ?? DEFAULTS.maxLineLength;
  const maxPerRule = options?.maxMatchesPerRulePerFile ?? DEFAULTS.maxMatchesPerRulePerFile;
  const findings = [];
  const perRuleCount = new Map;
  const lines = content.split(`
`);
  const language = detectLanguage(path, lines[0]);
  for (const scanner of options?.scanners ?? BUILTIN_SCANNERS) {
    const startedAt = timings ? performance.now() : 0;
    const rules = RULES_BY_SCANNER[scanner].filter((rule) => ruleAppliesTo(rule, language));
    const entropyGate = options?.entropyOverrides?.[scanner];
    const severityPin = options?.severityOverrides?.[scanner];
    for (let i = 0;i < lines.length; i++) {
      const line = lines[i];
      if (line.length === 0 || line.length > maxLineLength)
        continue;
      if (line.includes(IGNORE_MARKER))
        continue;
      for (const rule of rules) {
        if ((perRuleCount.get(rule.id) ?? 0) >= maxPerRule)
          continue;
        rule.regex.lastIndex = 0;
        let match;
        while ((match = rule.regex.exec(line)) !== null) {
          if (match[0].length === 0)
            rule.regex.lastIndex++;
          const value = matchValue(match);
          const matched = rejects(rule, value, line, path, entropyGate) ? null : rule.classify ? rule.classify(value) : rule.severity;
          const severity = matched === null ? null : severityPin ?? matched;
          if (severity !== null) {
            const ruleId = `${rule.scanner}/${rule.id}`;
            findings.push({
              scanner: rule.scanner,
              ruleId,
              message: rule.title,
              severity,
              location: { file: path, startLine: i + 1 },
              fingerprint: fingerprint([rule.scanner, ruleId, path, String(i + 1)]),
              fix: rule.fix
            });
            const next = (perRuleCount.get(rule.id) ?? 0) + 1;
            perRuleCount.set(rule.id, next);
            if (next >= maxPerRule)
              break;
          }
        }
      }
    }
    if (timings) {
      timings.set(scanner, (timings.get(scanner) ?? 0) + (performance.now() - startedAt));
    }
  }
  return findings;
}
function scanPath(path) {
  if (PATH_RULE_EXCLUDE.test(path))
    return [];
  const findings = [];
  for (const rule of PATH_RULES) {
    rule.regex.lastIndex = 0;
    if (!rule.regex.test(path))
      continue;
    const ruleId = `${rule.scanner}/${rule.id}`;
    findings.push({
      scanner: rule.scanner,
      ruleId,
      message: rule.title,
      severity: rule.severity,
      location: { file: path },
      fingerprint: fingerprint([rule.scanner, ruleId, path]),
      fix: rule.fix
    });
  }
  return findings;
}
async function collectFiles(root, ignore, maxFileBytes) {
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.pop();
    let entries;
    try {
      entries = await readdir3(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join10(dir, entry.name);
      const rel = relative(root, full).split(sep).join("/");
      if (rel.length === 0)
        continue;
      if (ignore.some((re) => re.test(rel)))
        continue;
      if (entry.isSymbolicLink())
        continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name))
          continue;
        queue.push(full);
        continue;
      }
      if (!entry.isFile())
        continue;
      if (SKIP_FILENAMES.has(entry.name))
        continue;
      if (SKIP_EXTENSIONS.has(extensionOf(entry.name)))
        continue;
      if (isMinified(entry.name))
        continue;
      try {
        if ((await stat3(full)).size > maxFileBytes)
          continue;
      } catch {
        continue;
      }
      files.push(full);
    }
  }
  return files.sort();
}
async function runBuiltinScan(root, options) {
  const startedAt = performance.now();
  const maxFileBytes = options?.maxFileBytes ?? DEFAULTS.maxFileBytes;
  const maxFindings = options?.maxFindings ?? DEFAULTS.maxFindings;
  const ignore = await readIgnorePatterns(root, options?.extraIgnorePatterns);
  const files = await collectFiles(root, ignore, maxFileBytes);
  const findings = [];
  const timings = new Map;
  let filesScanned = 0;
  let truncated = false;
  for (const full of files) {
    if (findings.length >= maxFindings) {
      truncated = true;
      break;
    }
    const rel = relative(root, full).split(sep).join("/");
    findings.push(...scanPath(rel));
    let content;
    try {
      content = await readFile(full, "utf8");
    } catch {
      continue;
    }
    if (content.includes("\x00"))
      continue;
    filesScanned++;
    findings.push(...scanContent(rel, content, options, timings));
  }
  return {
    findings: findings.slice(0, maxFindings),
    filesScanned,
    truncated: truncated || findings.length > maxFindings,
    durationMs: performance.now() - startedAt,
    durationByScanner: Object.fromEntries((options?.scanners ?? BUILTIN_SCANNERS).map((s) => [s, timings.get(s) ?? 0]))
  };
}
var DEFAULTS, SKIP_DIRS, SKIP_EXTENSIONS, SKIP_FILENAMES, RULES_BY_SCANNER;
var init_builtin_scan = __esm(() => {
  init_patterns();
  DEFAULTS = {
    maxFileBytes: 2 * 1024 * 1024,
    maxLineLength: 2000,
    maxMatchesPerRulePerFile: 5,
    maxFindings: 2000
  };
  SKIP_DIRS = new Set([
    ".git",
    ".hg",
    ".svn",
    ".aegis",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "bower_components",
    "vendor",
    "site-packages",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    "dist",
    "build",
    "out",
    "target",
    "coverage",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".cache",
    ".gradle",
    ".terraform",
    "Pods",
    "binaries"
  ]);
  SKIP_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "bmp",
    "ico",
    "webp",
    "avif",
    "tiff",
    "pdf",
    "zip",
    "gz",
    "tgz",
    "bz2",
    "xz",
    "7z",
    "rar",
    "tar",
    "jar",
    "war",
    "woff",
    "woff2",
    "ttf",
    "eot",
    "otf",
    "mp3",
    "mp4",
    "wav",
    "mov",
    "avi",
    "mkv",
    "webm",
    "flac",
    "ogg",
    "so",
    "dylib",
    "dll",
    "exe",
    "bin",
    "o",
    "a",
    "class",
    "wasm",
    "pyc",
    "pyo",
    "node",
    "db",
    "sqlite",
    "sqlite3",
    "parquet",
    "pack",
    "idx",
    "lockb"
  ]);
  SKIP_FILENAMES = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lock",
    "bun.lockb",
    "Cargo.lock",
    "poetry.lock",
    "Gemfile.lock",
    "composer.lock",
    "go.sum",
    "Pipfile.lock"
  ]);
  RULES_BY_SCANNER = Object.fromEntries(BUILTIN_SCANNERS.map((scanner) => [scanner, PATTERN_RULES.filter((r) => r.scanner === scanner)]));
});

// src/core/rules-config.ts
import { readFile as readFile2 } from "fs/promises";
import { join as join11 } from "path";
function defaultRulesConfig() {
  return { exclude_paths: [], scanners: {} };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseScannerConfig(raw) {
  if (!isRecord(raw))
    return {};
  const config = {};
  if (typeof raw.enabled === "boolean")
    config.enabled = raw.enabled;
  if (typeof raw.severity === "string" && SEVERITIES.includes(raw.severity)) {
    config.severity = raw.severity;
  }
  if (typeof raw.entropy_threshold === "number" && Number.isFinite(raw.entropy_threshold)) {
    config.entropy_threshold = raw.entropy_threshold;
  }
  return config;
}
function parseRulesConfig(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaultRulesConfig();
  }
  if (!isRecord(raw))
    return defaultRulesConfig();
  const exclude_paths = Array.isArray(raw.exclude_paths) ? raw.exclude_paths.filter((p) => typeof p === "string") : [];
  const scanners = {};
  if (isRecord(raw.scanners)) {
    for (const [name, value] of Object.entries(raw.scanners)) {
      scanners[name] = parseScannerConfig(value);
    }
  }
  return { exclude_paths, scanners };
}
async function loadRulesConfig(root) {
  try {
    return parseRulesConfig(await readFile2(join11(root, RULES_CONFIG_FILENAME), "utf8"));
  } catch {
    return defaultRulesConfig();
  }
}
function emptySelection() {
  return { only: [], disabled: [], enableAll: false };
}
function isScannerEnabled(name, selection, config) {
  if (selection.disabled.includes(name))
    return false;
  if (selection.only.length > 0)
    return selection.only.includes(name);
  if (selection.enableAll)
    return true;
  return config.scanners[name]?.enabled !== false;
}
function enabledBuiltins(selection, config) {
  return BUILTIN_SCANNERS.filter((name) => isScannerEnabled(name, selection, config));
}
function severityOverride(name, config) {
  return config.scanners[name]?.severity;
}
function entropyOverride(name, config) {
  return config.scanners[name]?.entropy_threshold;
}
var RULES_CONFIG_FILENAME = "aegis-rules.json", SEVERITIES;
var init_rules_config = __esm(() => {
  init_patterns();
  SEVERITIES = ["critical", "high", "medium", "low", "info"];
});

// src/core/external-scanners.ts
import crypto7 from "crypto";
function fingerprint2(parts) {
  return crypto7.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 12);
}
function gitleaksToNormalized(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed))
    return [];
  const findings = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object")
      continue;
    const rule = typeof raw.RuleID === "string" && raw.RuleID.length > 0 ? raw.RuleID : "unknown";
    const file = typeof raw.File === "string" ? raw.File : "";
    const line = typeof raw.StartLine === "number" ? raw.StartLine : undefined;
    const ruleId = `gitleaks/${rule}`;
    const severity = GITLEAKS_CRITICAL.test(rule) ? "critical" : "high";
    findings.push({
      scanner: "gitleaks",
      ruleId,
      message: typeof raw.Description === "string" && raw.Description.length > 0 ? raw.Description : `Secret pattern matched: ${rule}`,
      severity,
      ...file ? { location: { file, ...line != null ? { startLine: line } : {} } } : {},
      fingerprint: fingerprint2(["gitleaks", ruleId, file, String(line ?? 0)]),
      fix: "Rotate the exposed credential, then purge it from git history (git filter-repo) \u2014 deleting the line is not enough."
    });
  }
  return findings;
}
function mapNjsscanSeverity(severity) {
  switch ((severity ?? "").toUpperCase()) {
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
function firstMatchLine(value) {
  if (!Array.isArray(value))
    return;
  const first = value[0];
  return typeof first === "number" ? first : undefined;
}
function njsscanToNormalized(stdout) {
  let parsed;
  try {
    const raw = JSON.parse(stdout);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
      return [];
    parsed = raw;
  } catch {
    return [];
  }
  const findings = [];
  for (const section of ["nodejs", "templates"]) {
    const rules = parsed[section];
    if (!rules || typeof rules !== "object")
      continue;
    for (const [rule, body] of Object.entries(rules)) {
      if (!body || typeof body !== "object")
        continue;
      const severity = mapNjsscanSeverity(body.metadata?.severity);
      const description = body.metadata?.description ?? rule;
      const ruleId = `njsscan/${rule}`;
      for (const file of body.files ?? []) {
        const path = typeof file?.file_path === "string" ? file.file_path : "";
        const line = firstMatchLine(file?.match_lines);
        findings.push({
          scanner: "njsscan",
          ruleId,
          message: description,
          severity,
          ...path ? { location: { file: path, ...line != null ? { startLine: line } : {} } } : {},
          fingerprint: fingerprint2(["njsscan", ruleId, path, String(line ?? 0)]),
          fix: body.metadata?.cwe ? `Review against ${body.metadata.cwe}${body.metadata.owasp ? ` / ${body.metadata.owasp}` : ""} and apply the framework-recommended mitigation.` : "Apply the framework-recommended mitigation for this rule."
        });
      }
    }
  }
  return findings;
}
async function isScannerAvailable(binary) {
  try {
    const proc = Bun.spawn(["command", "-v", binary], { stdout: "ignore", stderr: "ignore" });
    return await proc.exited === 0;
  } catch {
    try {
      const proc = Bun.spawn(["which", binary], { stdout: "ignore", stderr: "ignore" });
      return await proc.exited === 0;
    } catch {
      return false;
    }
  }
}
function gitleaksArgv(dir) {
  return [
    "gitleaks",
    "dir",
    dir,
    "--report-format",
    "json",
    "--report-path",
    "/dev/stdout",
    "--no-banner",
    "--exit-code",
    "0"
  ];
}
function njsscanArgv(dir) {
  return ["njsscan", "--json", dir];
}
var GITLEAKS_CRITICAL;
var init_external_scanners = __esm(() => {
  GITLEAKS_CRITICAL = /(?:private-key|aws-secret|gcp-|slack-|stripe|github-pat|gitlab-pat|npm-|openai|anthropic)/i;
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

// src/report/fix-guide.ts
function fixGuidance(finding) {
  if (finding.fix)
    return finding.fix;
  const indexed = RULE_FIX_INDEX[finding.ruleId];
  if (indexed)
    return indexed;
  switch (finding.scanner) {
    case "trufflehog":
      return "Rotate the credential at its provider, then purge it from git history (git filter-repo). Deleting the line leaves it in every clone.";
    case "gitleaks":
      return "Rotate the exposed credential and purge it from git history; add the pattern to CI so it cannot land again.";
    case "trivy":
      return finding.package ? `Upgrade ${finding.package} to a patched release; if none exists, pin a fork or drop the dependency.` : "Upgrade the affected dependency to a patched release.";
    case "njsscan":
      return "Apply the framework-recommended mitigation for this rule.";
    case "semgrep": {
      for (const [pattern, guidance] of SEMGREP_GUIDANCE) {
        if (pattern.test(finding.ruleId))
          return guidance;
      }
      return "Review the flagged expression and constrain the untrusted input it consumes.";
    }
    default:
      return "Review the flagged code and apply the least-privilege fix.";
  }
}
function buildRecommendations(report) {
  const recommendations = [];
  for (const run of report.scanners) {
    if (run.status === "skipped") {
      recommendations.push({
        scanner: run.name,
        text: `Not installed \u2014 this analysis did not run. Install \`${run.name}\` to widen coverage.`
      });
      continue;
    }
    if (report.degraded.includes(run.name)) {
      recommendations.push({
        scanner: run.name,
        text: `Ran degraded (${run.status}) \u2014 treat this scan as incomplete and re-run before trusting the verdict.`
      });
      continue;
    }
    const findings = report.findings.filter((f) => f.scanner === run.name);
    if (findings.length === 0) {
      recommendations.push({ scanner: run.name, text: NO_FINDING_ADVICE[run.name] ?? "No findings." });
      continue;
    }
    const worst = ["critical", "high", "medium", "low", "info"].find((sev) => findings.some((f) => f.severity === sev));
    const topRule = mostCommonRule(findings);
    recommendations.push({
      scanner: run.name,
      text: `${findings.length} finding(s), worst severity ${worst}. ` + `Most frequent rule: ${topRule.ruleId} (${topRule.count}\xD7). ` + fixGuidance(findings.find((f) => f.ruleId === topRule.ruleId))
    });
  }
  return recommendations;
}
function mostCommonRule(findings) {
  const counts = new Map;
  for (const f of findings)
    counts.set(f.ruleId, (counts.get(f.ruleId) ?? 0) + 1);
  let best = { ruleId: findings[0]?.ruleId ?? "unknown", count: 0 };
  for (const [ruleId, count] of counts) {
    if (count > best.count)
      best = { ruleId, count };
  }
  return best;
}
var SEMGREP_GUIDANCE, NO_FINDING_ADVICE;
var init_fix_guide = __esm(() => {
  init_patterns();
  SEMGREP_GUIDANCE = [
    [
      /command-?injection|dangerous-(?:exec|spawn|subprocess)|shell-?(?:true|injection)/i,
      "Pass an argument array instead of a shell string, and validate every interpolated value against an allowlist."
    ],
    [
      /sql-?injection|tainted-sql|formatted-sql/i,
      "Use parameterized queries / bound placeholders. Never build SQL by string concatenation."
    ],
    [
      /(?:xss|cross-site-scripting|dangerouslysetinnerhtml|unescaped-?(?:template|output))/i,
      "Escape on output or render as text. Reserve raw-HTML sinks for values you produced yourself."
    ],
    [
      /path-?traversal|tainted-path|zipslip/i,
      "Resolve the path and assert it stays under an allowed root before touching the filesystem."
    ],
    [
      /(?:ssrf|tainted-url|request-forgery)/i,
      "Resolve the target host and reject private/link-local ranges before making the request."
    ],
    [
      /deserial|pickle|yaml-?load|unsafe-?eval|eval-?injection/i,
      "Use a safe loader (yaml.safe_load, JSON) \u2014 never deserialize untrusted input into live objects."
    ],
    [
      /hardcoded|secret|credential|api-?key|password/i,
      "Move the value into the environment or a secret manager, then rotate it."
    ],
    [
      /crypto|cipher|hash|random|tls|ssl|certificate/i,
      "Use a modern primitive (AES-256-GCM, SHA-256, crypto.randomBytes) and keep certificate verification on."
    ],
    [
      /prototype-?pollution/i,
      "Reject `__proto__`/`constructor`/`prototype` keys, or build objects with Object.create(null)."
    ],
    [
      /regex|redos/i,
      "Rewrite the pattern to avoid nested quantifiers, or bound the input length before matching."
    ],
    [
      /cors|csrf/i,
      "Pin an explicit origin allowlist and keep credentialed requests off wildcard origins."
    ]
  ];
  NO_FINDING_ADVICE = {
    semgrep: "No SAST findings. Add project-specific rules (`--config .semgrep/`) to cover your own invariants.",
    trivy: "No HIGH/CRITICAL dependency CVEs. Keep the vulnerability DB fresh \u2014 results are only as current as the last DB pull.",
    trufflehog: "No verified secrets. Verification needs network access; a fully offline run can only report unverified pattern hits.",
    gitleaks: "No gitleaks hits.",
    njsscan: "No njsscan findings.",
    "gitleaks-replacement": "No regex secret hits. Keep `.env*` and key material out of the working tree.",
    "custom-patterns": "No language-specific sink patterns matched.",
    "path-traversal": "No traversal patterns. Keep filesystem paths derived from input anchored to a fixed root.",
    "hardcoded-ip": "No hardcoded addresses. Keep endpoints in configuration.",
    "weak-crypto": "No weak primitives found."
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
function severityRank(severity) {
  return SEVERITY_ORDER.indexOf(severity);
}
function countBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings)
    counts[f.severity] += 1;
  return counts;
}
function formatDuration(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}
function renderFindingRows(findings) {
  const sorted = [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return sorted.map((f) => `        <tr>
          <td><span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
          <td class="rule">${escapeHtml(f.ruleId)}</td>
          <td>${escapeHtml(locationText(f))}<div class="msg">${escapeHtml(f.message)}</div></td>
          <td class="fix">${escapeHtml(fixGuidance(f))}</td>
        </tr>`).join(`
`);
}
function renderSeverityStrip(findings) {
  const counts = countBySeverity(findings);
  const total = findings.length;
  if (total === 0)
    return "";
  const segments = SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => `<span class="strip-seg" style="width:${(counts[s] / total * 100).toFixed(2)}%;background:rgb(${SEVERITY_RGB[s]})" title="${escapeHtml(s)}: ${counts[s]}"></span>`).join("");
  return `<span class="strip">${segments}</span>`;
}
function renderFindingGroups(report) {
  if (report.findings.length === 0) {
    return `  <p class="empty-card">No findings.</p>`;
  }
  const byScanner = new Map;
  for (const finding of report.findings) {
    const bucket = byScanner.get(finding.scanner);
    if (bucket)
      bucket.push(finding);
    else
      byScanner.set(finding.scanner, [finding]);
  }
  const groups = [...byScanner.entries()].sort((a, b) => {
    const worst = (list) => Math.min(...list.map((f) => severityRank(f.severity)));
    return worst(a[1]) - worst(b[1]) || b[1].length - a[1].length;
  });
  return groups.map(([scanner, findings]) => {
    const expanded = findings.some((f) => f.severity === "critical" || f.severity === "high");
    return `  <details class="group"${expanded ? " open" : ""}>
    <summary>
      <span class="group-name">${escapeHtml(scanner)}</span>
      <span class="group-count">${findings.length}</span>
      ${renderSeverityStrip(findings)}
    </summary>
    <table>
      <thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Fix Guide</th></tr></thead>
      <tbody>
${renderFindingRows(findings)}
      </tbody>
    </table>
  </details>`;
  }).join(`
`);
}
function renderSeverityBars(report) {
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + report.counts[s], 0);
  return SEVERITY_ORDER.map((severity) => {
    const count = report.counts[severity];
    const share = total === 0 ? 0 : count / total * 100;
    const width = count === 0 ? 0 : Math.max(share, 1.5);
    const pct = total === 0 ? "" : `${share.toFixed(1)}%`;
    return `      <div class="bar-row">
        <span class="bar-label">${escapeHtml(severity)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${width.toFixed(2)}%;background:rgb(${SEVERITY_RGB[severity]})"></span></span>
        <span class="bar-count">${count}</span>
        <span class="bar-share">${pct}</span>
      </div>`;
  }).join(`
`);
}
function renderHeatmapMatrix(report) {
  const scanners = report.scanners.map((s) => s.name);
  if (scanners.length === 0)
    return "";
  const cell = (scanner, severity) => report.findings.filter((f) => f.scanner === scanner && f.severity === severity).length;
  const max = Math.max(1, ...scanners.flatMap((s) => SEVERITY_ORDER.map((sev) => cell(s, sev))));
  const head = `<tr><th>Scanner</th>${SEVERITY_ORDER.map((s) => `<th class="num">${escapeHtml(s)}</th>`).join("")}<th class="num">total</th></tr>`;
  const rows = scanners.map((scanner) => {
    let total = 0;
    const cells = SEVERITY_ORDER.map((severity) => {
      const count = cell(scanner, severity);
      total += count;
      const alpha = count === 0 ? 0 : 0.15 + 0.85 * (count / max);
      const style = count === 0 ? "" : ` style="background:rgba(${SEVERITY_RGB[severity]},${alpha.toFixed(2)})"`;
      const cls = count === 0 ? "heat zero" : alpha > 0.55 ? "heat strong" : "heat";
      return `<td class="${cls}"${style}>${count}</td>`;
    }).join("");
    return `      <tr><td>${escapeHtml(scanner)}</td>${cells}<td class="num">${total}</td></tr>`;
  }).join(`
`);
  return `  <h2>Severity Heatmap</h2>
  <div class="card bars">
${renderSeverityBars(report)}
  </div>
  <table class="matrix">
    <thead>${head}</thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}
function renderScannerRows(report) {
  return report.scanners.map((s) => {
    const rules = s.ruleCount != null ? String(s.ruleCount) : "\u2014";
    const duration = s.status === "skipped" ? "\u2014" : formatDuration(s.durationMs);
    return `      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.version)}</td>
        <td><span class="status status-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span></td>
        <td class="num">${rules}</td>
        <td class="num">${escapeHtml(duration)}</td>
        <td class="detail">${escapeHtml(s.detail ?? "\u2014")}</td>
      </tr>`;
  }).join(`
`);
}
function renderRecommendations(report) {
  const items = buildRecommendations(report);
  if (items.length === 0)
    return "";
  return `  <h2>Recommendations</h2>
  <ul class="card recs">
${items.map((r) => `    <li><span class="rec-scanner">${escapeHtml(r.scanner)}</span>${escapeHtml(r.text)}</li>`).join(`
`)}
  </ul>`;
}
function renderFooter(report) {
  const parts = [
    `aegis-security-agent${report.toolVersion ? ` v${report.toolVersion}` : ""}`,
    `${report.scanners.length} scanners`,
    report.filesScanned != null ? `${report.filesScanned} files scanned` : null,
    report.durationMs != null ? `${formatDuration(report.durationMs)} total` : null,
    `${report.findings.length} findings`
  ].filter((part) => part !== null);
  return `  <div class="meta footer">${escapeHtml(parts.join(" \xB7 "))}</div>`;
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
  :root {
    color-scheme: light dark;
    --bg: #f6f8fa; --surface: #ffffff; --text: #1f2328; --muted: #656d76;
    --border: #eaeef2; --chip: #eaeef2; --track: #eaeef2;
    --shadow: 0 1px 3px rgba(0,0,0,.08);
    --warn-bg: #fff8c5; --warn-border: #eac54f;
    --ok-bg: #dafbe1; --ok-text: #1a7f37;
    --bad-bg: #ffebe9; --bad-text: #cf222e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117; --surface: #161b22; --text: #e6edf3; --muted: #9198a1;
      --border: #30363d; --chip: #21262d; --track: #21262d;
      --shadow: 0 1px 3px rgba(0,0,0,.4);
      --warn-bg: #341a00; --warn-border: #9e6a03;
      --ok-bg: #0f2f18; --ok-text: #3fb950;
      --bad-bg: #3c1618; --bad-text: #f85149;
    }
  }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 2rem; background: var(--bg); color: var(--text); }
  .wrap { max-width: 1100px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  .verdict { font-weight: 700; font-size: 1.5rem; padding: .25rem .9rem; border-radius: 8px; color: #fff; background: ${color}; }
  h1 { font-size: 1.25rem; margin: 0; }
  h2 { font-size: .95rem; margin: 1.5rem 0 .5rem; }
  .meta { color: var(--muted); font-size: .85rem; }
  .footer { margin-top: 2rem; padding-top: .75rem; border-top: 1px solid var(--border); }
  .counts { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1rem 0 1.5rem; }
  .pill { padding: .35rem .7rem; border-radius: 999px; font-size: .8rem; font-weight: 600; background: var(--chip); }
  .card { background: var(--surface); border-radius: 8px; box-shadow: var(--shadow); }
  .empty-card { background: var(--surface); border-radius: 8px; box-shadow: var(--shadow); padding: 1.25rem; text-align: center; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; box-shadow: var(--shadow); margin-bottom: 1.5rem; }
  th, td { text-align: left; padding: .6rem .8rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: var(--bg); font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .rule { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
  .msg { color: var(--muted); font-size: .8rem; margin-top: .2rem; }
  .fix { font-size: .8rem; max-width: 22rem; }
  .detail { font-size: .78rem; color: var(--muted); }
  .empty { color: var(--muted); text-align: center; }
  .sev { font-weight: 700; text-transform: uppercase; font-size: .72rem; padding: .1rem .45rem; border-radius: 4px; color: #fff; }
  .sev-critical { background: #cf222e; } .sev-high { background: #e16f24; }
  .sev-medium { background: #bf8700; } .sev-low { background: #0969da; } .sev-info { background: #656d76; }
  .status { font-size: .72rem; font-weight: 600; padding: .1rem .45rem; border-radius: 4px; background: var(--chip); color: var(--text); }
  .status-ok, .status-cached { background: var(--ok-bg); color: var(--ok-text); }
  .status-timeout, .status-error { background: var(--bad-bg); color: var(--bad-text); }
  .status-skipped { background: var(--chip); color: var(--muted); }
  .degraded { background: var(--warn-bg); border: 1px solid var(--warn-border); padding: .5rem .8rem; border-radius: 6px; margin-bottom: 1rem; font-size: .85rem; }
  .bars { padding: .9rem 1rem; margin-bottom: 1rem; }
  .bar-row { display: flex; align-items: center; gap: .6rem; margin: .25rem 0; }
  .bar-label { width: 5rem; font-size: .78rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  .bar-track { flex: 1; height: .7rem; background: var(--track); border-radius: 999px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 999px; }
  .bar-count { width: 3rem; text-align: right; font-variant-numeric: tabular-nums; font-size: .8rem; font-weight: 600; }
  .bar-share { width: 3.5rem; text-align: right; font-variant-numeric: tabular-nums; font-size: .75rem; color: var(--muted); }
  .matrix td.heat { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .matrix td.zero { color: var(--muted); opacity: .55; font-weight: 400; }
  .matrix td.strong { color: #fff; }
  .group { background: var(--surface); border-radius: 8px; box-shadow: var(--shadow); margin-bottom: .6rem; overflow: hidden; }
  .group > summary { display: flex; align-items: center; gap: .75rem; padding: .6rem .8rem; cursor: pointer; font-size: .85rem; }
  .group > summary::marker { color: var(--muted); }
  .group-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
  .group-count { font-size: .75rem; font-weight: 600; padding: .05rem .45rem; border-radius: 999px; background: var(--chip); color: var(--muted); }
  .strip { flex: 1; display: flex; height: .5rem; border-radius: 999px; overflow: hidden; background: var(--track); max-width: 22rem; }
  .strip-seg { display: block; height: 100%; }
  .group table { box-shadow: none; border-radius: 0; margin-bottom: 0; }
  .recs { padding: .9rem 1rem .9rem 2rem; margin-bottom: 1.5rem; }
  .recs li { font-size: .85rem; margin: .35rem 0; }
  .rec-scanner { display: inline-block; min-width: 8.5rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .76rem; color: var(--muted); }
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
${renderHeatmapMatrix(report)}
  <h2>Findings (${report.findings.length})</h2>
${renderFindingGroups(report)}
  <h2>Scanner Detail</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Version</th><th>Status</th><th class="num">Rules</th><th class="num">Duration</th><th>Patterns / Configuration</th></tr></thead>
    <tbody>
${renderScannerRows(report)}
    </tbody>
  </table>
${renderRecommendations(report)}
${renderFooter(report)}
</div>
</body>
</html>
`;
}
var VERDICT_COLOR, SEVERITY_ORDER, SEVERITY_RGB;
var init_html = __esm(() => {
  init_fix_guide();
  VERDICT_COLOR = {
    SAFE: "#1a7f37",
    RISKY: "#bf8700",
    BLOCKED: "#cf222e"
  };
  SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];
  SEVERITY_RGB = {
    critical: "207,34,46",
    high: "225,111,36",
    medium: "191,135,0",
    low: "9,105,218",
    info: "101,109,118"
  };
});

// src/report/catalog.ts
import { homedir as homedir3 } from "os";
import { dirname as dirname3, join as join12 } from "path";
import { chmod as chmod3 } from "fs/promises";
function aegisHome() {
  return process.env.AEGIS_HOME?.trim() || join12(homedir3(), ".aegis");
}
function sanitizeRepoName(name) {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "repo";
}
function catalogDir(root, repo, date, verdict) {
  return join12(root, sanitizeRepoName(repo), date, verdict);
}
async function writeReportCatalog(input, artifacts, opts) {
  const root = opts?.root ?? aegisHome();
  const dir = catalogDir(root, input.repo, input.date, input.verdict);
  await ensureDir(dir);
  for (let cur = dir;cur.startsWith(root); cur = dirname3(cur)) {
    await chmod3(cur, 448);
    if (cur === root)
      break;
  }
  const files = [
    ["report.html", artifacts.html],
    ["report.sarif", JSON.stringify(artifacts.sarif, null, 2)],
    ["verdict.json", JSON.stringify(artifacts.verdict, null, 2)]
  ];
  for (const [name, contents] of files) {
    const p = join12(dir, name);
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
import { basename as basename2, join as join13, resolve as resolve4 } from "path";
import { chmod as chmod4, mkdtemp, readdir as readdir4, rm as rm3, stat as stat4 } from "fs/promises";
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
  const selection = emptySelection();
  const takeList = (value) => (value ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
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
    } else if (arg === "--scanners") {
      const next = takeValue(i);
      if (next !== undefined) {
        selection.only.push(...takeList(next));
        i++;
      }
    } else if (arg === "--scanner-disable") {
      const next = takeValue(i);
      if (next !== undefined) {
        selection.disabled.push(...takeList(next));
        i++;
      }
    } else if (arg === "--scanner-enable-all") {
      selection.enableAll = true;
    } else if (arg === "--no-catalog") {
      noCatalog = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg && !arg.startsWith("-")) {
      target = arg;
    }
  }
  return { target, out, noCatalog, json, branch, subpath, allowUntrusted, maxRepoSizeMb, selection };
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
    run: {
      name: "semgrep",
      version: await getScannerVersionSafe("semgrep"),
      status: result.status,
      durationMs: result.durationMs,
      detail: `${SEMGREP_RULE_PACKS} \u2014 ERROR-severity results only`
    },
    findings,
    degraded: isDegraded(result)
  };
}
async function runTrivy(dir) {
  const result = await wrapTrivy(["fs", "--scanners", "vuln", "--severity", "HIGH,CRITICAL", "--format", "json", dir]);
  const findings = result.status === "error" || result.status === "timeout" ? [] : trivyToNormalized(result.stdout, "");
  return {
    run: {
      name: "trivy",
      version: await getScannerVersionSafe("trivy"),
      status: result.status,
      durationMs: result.durationMs,
      detail: "dependency CVEs from lockfiles \u2014 severity HIGH,CRITICAL"
    },
    findings,
    degraded: isDegraded(result)
  };
}
async function runTrufflehog(dir) {
  const result = await wrapTrufflehog(dir);
  const findings = result.status === "error" || result.status === "timeout" ? [] : trufflehogToNormalized(result.stdout);
  return {
    run: {
      name: "trufflehog",
      version: await getScannerVersionSafe("trufflehog"),
      status: result.status,
      durationMs: result.durationMs,
      detail: "filesystem mode, bundled credential detectors \u2014 verified hits are CRITICAL, pattern hits HIGH"
    },
    findings,
    degraded: isDegraded(result)
  };
}
async function runBuiltins(dir, selection, config) {
  const active = enabledBuiltins(selection, config);
  const severityOverrides = {};
  const entropyOverrides = {};
  for (const name of active) {
    const severity = severityOverride(name, config);
    if (severity)
      severityOverrides[name] = severity;
    const entropy = entropyOverride(name, config);
    if (entropy != null)
      entropyOverrides[name] = entropy;
  }
  const outcome = await runBuiltinScan(dir, {
    scanners: active,
    extraIgnorePatterns: config.exclude_paths,
    severityOverrides,
    entropyOverrides
  });
  const byScanner = new Map(active.map((s) => [s, []]));
  for (const finding of outcome.findings) {
    byScanner.get(finding.scanner)?.push(finding);
  }
  const truncated = outcome.truncated ? " (finding cap reached \u2014 results truncated)" : "";
  const outcomes = BUILTIN_SCANNERS.map((name) => {
    const rules = rulesForScanner(name);
    if (!active.includes(name)) {
      return {
        run: {
          name,
          version: "builtin",
          status: "skipped",
          durationMs: 0,
          ruleCount: rules.length,
          detail: "disabled by --scanner-disable/--scanners or aegis-rules.json"
        },
        findings: [],
        degraded: false
      };
    }
    return {
      run: {
        name,
        version: "builtin",
        status: "ok",
        durationMs: outcome.durationByScanner[name] ?? 0,
        ruleCount: rules.length,
        detail: `${outcome.filesScanned} files, rules: ${rules.join(", ")}${truncated}`
      },
      findings: byScanner.get(name) ?? [],
      degraded: false
    };
  });
  return { outcomes, filesScanned: outcome.filesScanned };
}
async function runOptionalScanner(name, argv, budgetMs, parse, detail) {
  if (!await isScannerAvailable(name)) {
    return {
      run: { name, version: "not installed", status: "skipped", durationMs: 0, detail: `${detail} (binary not on PATH)` },
      findings: [],
      degraded: false
    };
  }
  const result = await runScannerWithTimeout(argv, budgetMs);
  const findings = result.status === "error" || result.status === "timeout" ? [] : parse(result.stdout);
  return {
    run: {
      name,
      version: await getScannerVersionSafe(name),
      status: result.status,
      durationMs: result.durationMs,
      detail
    },
    findings,
    degraded: isDegraded(result)
  };
}
async function scanDirectory(dir, options) {
  const sel = options?.selection ?? emptySelection();
  const cfg = options?.trustTargetConfig ? await loadRulesConfig(dir) : defaultRulesConfig();
  const [semgrep, trivy, trufflehog, builtinResult, gitleaks, njsscan] = await Promise.all([
    runSemgrep(dir),
    runTrivy(dir),
    runTrufflehog(dir),
    runBuiltins(dir, sel, cfg),
    runOptionalScanner("gitleaks", gitleaksArgv(dir), SCANNER_BUDGETS.trufflehog, gitleaksToNormalized, "directory mode, default gitleaks rule set \u2014 never cached (raw output embeds secrets)"),
    runOptionalScanner("njsscan", njsscanArgv(dir), SCANNER_BUDGETS.semgrep, njsscanToNormalized, "Node.js SAST \u2014 semantic rules for express/template injection sinks")
  ]);
  const isExcluded = createPathExcluder(dir, cfg.exclude_paths);
  const outcomes = [semgrep, trivy, trufflehog, ...builtinResult.outcomes, gitleaks, njsscan].map((o) => ({ ...o, findings: o.findings.filter((f) => !isExcluded(f.location?.file)) }));
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
  const cloneRoot = await mkdtemp(join13(tmpdir(), "aegis-clone-"));
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
    const entries = await readdir4(tmpdir(), { withFileTypes: true });
    const now = Date.now();
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith("aegis-clone-"))
        continue;
      const full = join13(tmpdir(), e.name);
      try {
        const s = await stat4(full);
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
    const report = await scanDirectory(dir, {
      selection: flags.selection,
      trustTargetConfig: resolved.tempCloneDir === null
    });
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
    const { stat: stat5 } = await import("fs/promises");
    return (await stat5(path)).isDirectory();
  } catch {
    return false;
  }
}
var DEFAULT_MAX_REPO_SIZE_MB = 2048, SEMGREP_RULE_PACKS = "rule packs: p/security-audit, p/secrets";
var init_scan = __esm(() => {
  init_base();
  init_security();
  init_scanner();
  init_scanner();
  init_builtin_scan();
  init_rules_config();
  init_patterns();
  init_external_scanners();
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
var SCAN_HELP_TEXT = [
  `  ${c.bold("Usage")}`,
  `    ${c.cyan("aegis scan")} ${c.dim("[options]")}`,
  "",
  `  ${c.bold("Options")}`,
  `    ${c.cyan("--target, -t <path|git-url>")}  ${c.dim("Target to scan (default: current directory)")}`,
  `    ${c.cyan("--branch <name>")}              ${c.dim("Git branch to check out (git URLs only)")}`,
  `    ${c.cyan("--subpath <dir>")}              ${c.dim("Limit scan to a subdirectory within the target")}`,
  `    ${c.cyan("--allow-untrusted")}            ${c.dim("Allow scanning untrusted git URLs (shallow clone to tmp)")}`,
  `    ${c.cyan("--max-repo-size-mb <N>")}       ${c.dim("Max size for cloned repos in MB (default: 2048)")}`,
  `    ${c.cyan("--out, -o <file>")}             ${c.dim("Write verdict to file (default: stdout)")}`,
  `    ${c.cyan("--no-catalog")}                 ${c.dim("Skip saving report to the ~/.aegis catalog")}`,
  `    ${c.cyan("--json")}                       ${c.dim("Output verdict as JSON")}`,
  `    ${c.cyan("--help, -h")}                   ${c.dim("Show this help")}`
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
      if (args.includes("--help") || args.includes("-h")) {
        printHeader();
        println(SCAN_HELP_TEXT);
        println();
        return 0;
      }
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
