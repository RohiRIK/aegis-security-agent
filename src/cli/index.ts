#!/usr/bin/env bun

import { c, icon, printHeader, println } from "../lib/ui.ts";

type InstallFlags = {
  claude: boolean;
  force: boolean;
  skipDocker: boolean;
};

const HELP_TEXT = [
  `  ${c.bold("Usage")}`,
  `    ${c.cyan("aegis")} ${c.dim("<command> [flags]")}`,
  "",
  `  ${c.bold("Commands")}`,
  `    ${c.cyan("install")}  ${c.dim("Install Aegis config into the current project")}`,
  `    ${c.cyan("status")}   ${c.dim("Show installation status")}`,
  `    ${c.cyan("help")}     ${c.dim("Show this help")}`,
].join("\n");

function parseInstallFlags(args: string[]): InstallFlags {
  return {
    claude: args.includes("--claude"),
    force: args.includes("--force"),
    skipDocker: args.includes("--skip-docker"),
  };
}

async function runInstallCommand(args: string[]): Promise<number> {
  const { runInstall } = await import("./install.ts");
  const { claude, force, skipDocker } = parseInstallFlags(args);
  const targetDir = process.cwd();

  await runInstall({ targetDir, claude, force, skipDocker });
  return 0;
}

async function showStatus(): Promise<number> {
  printHeader();
  println(`  ${icon.info} Use 'bunx aegis-security status' or install to get full status`);
  println();
  return 0;
}

async function main(): Promise<number> {
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
      process.stderr.write(`  ${icon.fail} Unknown command: ${c.bold(command)}\n`);
      process.stderr.write(`  Run ${c.cyan("aegis help")} for usage.\n`);
      return 1;
  }
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
