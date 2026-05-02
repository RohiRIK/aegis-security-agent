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
  println(`  ${icon.shield}  ${c.bold(c.white("Harness"))} ${c.dim("\xB7 AI-Agent Security Harness")}`);
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
  if (plugins.includes("@aegis/opencode")) {
    log("skipped", configPath + " (plugin already registered)");
    return;
  }
  config["plugin"] = [...plugins, "@aegis/opencode"];
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
export { AegisSecurityPlugin as default } from "@aegis/opencode";
`, OPENCODE_PKG_CONTENT;
var init_install = __esm(() => {
  init_base();
  init_ui();
  AEGIS_DIR = resolve(import.meta.dir, "../..");
  OPENCODE_PKG_CONTENT = JSON.stringify({ dependencies: { "@aegis/opencode": "latest" } }, null, 2) + `
`;
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
  `    ${c.cyan("help")}     ${c.dim("Show this help")}`
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
  println(`  ${icon.info} Use 'bunx @aegis/opencode status' or install to get full status`);
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
