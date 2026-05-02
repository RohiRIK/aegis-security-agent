import { join, resolve } from "node:path";

import { fileExists, runCommandCapture, runCommandInherit } from "./lib/base.ts";
import { c, icon, print, printHeader, println, printStatusTable } from "./lib/ui.ts";

const AEGIS_DIR = resolve(import.meta.dir, "..");

const HELP_TEXT = [
  `  ${c.bold("Commands")}`,
  `    ${c.cyan("start")}    ${c.dim("Run pre-flight checks then launch Claude Code")}`,
  `    ${c.cyan("stop")}     ${c.dim("Stop the sandbox container")}`,
  `    ${c.cyan("install")}  ${c.dim("Scaffold all config files in the current project")}`,
  `    ${c.cyan("shred")}    ${c.dim("Delete all sensitive aegis runtime data")}`,
  `    ${c.cyan("status")}   ${c.dim("Show status of all aegis components")}`,
  `    ${c.cyan("help")}     ${c.dim("Show this help")}`,
].join("\n");

async function runBunScript(scriptPath: string, args: string[] = []): Promise<number> {
  return await runCommandInherit(["bun", "run", scriptPath, ...args]);
}

async function showStatus(): Promise<number> {
  const [sandbox, hooks, policy, schema, precommit] = await Promise.all([
    runCommandCapture(["docker", "ps", "--filter", "name=aegis-sandbox", "--filter", "status=running", "--format", "{{.Names}}"]),
    fileExists(join(AEGIS_DIR, ".claude", "hooks.json")),
    fileExists(join(AEGIS_DIR, "aegis-policy.json")),
    fileExists(join(AEGIS_DIR, ".env.schema")),
    fileExists(join(AEGIS_DIR, ".git", "hooks", "pre-commit")),
  ]);

  printHeader();
  printStatusTable([
    { label: "Sandbox container", value: sandbox.stdout.includes("aegis-sandbox") ? "running" : "stopped", ok: sandbox.stdout.includes("aegis-sandbox") },
    { label: "Hooks config", value: hooks ? "present" : "missing", ok: hooks },
    { label: "Policy file", value: policy ? "present" : "missing", ok: policy },
    { label: ".env.schema", value: schema ? "present" : "missing", ok: schema },
    { label: "TruffleHog pre-commit", value: precommit ? "installed" : "not installed", ok: precommit },
  ]);
  return 0;
}

async function main(): Promise<number> {
  const [rawCommand, ...args] = Bun.argv.slice(2);
  const command = rawCommand ?? "help";

  switch (command) {
    case "start": {
      printHeader();
      println(`  ${icon.lock} ${c.bold("Pre-flight")}  ${c.dim("verifying environment before agent launch")}`);
      println();
      const preflightCode = await runBunScript(join(AEGIS_DIR, "src", "preflight.ts"));
      if (preflightCode !== 0) return preflightCode;
      println(`  ${icon.fire} ${c.bold("Launching Claude Code…")}`);
      println();
      return await runCommandInherit(["claude", ...args]);
    }
    case "stop": {
      print(`  ${icon.info} Stopping sandbox… `);
      const code = await runBunScript(join(AEGIS_DIR, "src", "sandbox", "stop.ts"));
      println(code === 0 ? icon.pass : icon.fail);
      return code;
    }
    case "install": {
      println(`  ${icon.info} ${c.bold("Installing aegis config files…")}`);
      return await runBunScript(join(AEGIS_DIR, "src", "install.ts"));
    }
    case "shred": {
      println(`  ${icon.warn} ${c.bold(c.yellow("Shredding sensitive runtime data…"))}`);
      return await runBunScript(join(AEGIS_DIR, "src", "shred.ts"), args);
    }
    case "status":
      return await showStatus();
    case "help":
    case "--help":
    case "-h": {
      printHeader();
      println(HELP_TEXT);
      println();
      return 0;
    }
    default: {
      process.stderr.write(`  ${icon.fail} Unknown command: ${c.bold(command)}\n`);
      process.stderr.write(`  Run ${c.cyan("aegis help")} for usage.\n`);
      return 1;
    }
  }
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
