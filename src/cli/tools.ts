import { c, icon, printHeader, println } from "../lib/ui.ts";
import * as manager from "../lib/provisioner/manager.ts";
import type { ScannerName, ToolInfo } from "../lib/provisioner/types.ts";

const ALL_SCANNERS: ScannerName[] = ["trivy", "trufflehog", "semgrep"];

export type ToolsFlags = {
  tool?: ScannerName;
  all: boolean;
  ci: boolean;
};

export function parseToolsFlags(args: string[]): ToolsFlags {
  let tool: ScannerName | undefined;
  for (const arg of args) {
    if (arg.startsWith("--tool=")) {
      tool = arg.slice("--tool=".length) as ScannerName;
    }
  }
  return {
    tool,
    all: args.includes("--all"),
    ci: args.includes("--ci"),
  };
}

function stateColor(info: ToolInfo): string {
  switch (info.state) {
    case "installed": return c.green(info.state);
    case "system": return c.cyan(info.state);
    case "outdated": return c.yellow(info.state);
    default: return c.dim(info.state);
  }
}

export async function runToolsInstall(flags: ToolsFlags): Promise<number> {
  if (!flags.tool && !flags.all) {
    process.stderr.write(`  ${icon.fail} Specify --tool=<name> or --all\n`);
    return 1;
  }

  printHeader();
  println(`  ${icon.shield}  ${c.bold("Aegis Tools Install")}\n`);

  const scanners = flags.all ? ALL_SCANNERS : [flags.tool as ScannerName];
  let anyFailed = false;

  for (const scanner of scanners) {
    const result = await manager.installTool(scanner, { ci: flags.ci });
    if (result.success) {
      println(`  ${icon.pass}  ${c.green(scanner)}  ${c.dim(result.toolPath)}`);
    } else {
      process.stderr.write(`  ${icon.fail}  ${c.red(scanner)}  ${result.error ?? "failed"}\n`);
      anyFailed = true;
    }
  }

  println();
  return anyFailed ? 1 : 0;
}

export async function runToolsStatus(flags: ToolsFlags): Promise<number> {
  const tools = await manager.listTools();

  printHeader();
  println(`  ${c.bold("Tool")}${"".padEnd(14)}${c.bold("State")}${"".padEnd(10)}${c.bold("Version")}${"".padEnd(6)}${c.bold("Path")}`);
  println(c.dim("  " + "─".repeat(72)));

  for (const info of tools) {
    const name = info.name.padEnd(18);
    const state = stateColor(info).padEnd(18);
    const version = (info.version || c.dim("—")).padEnd(14);
    const path = info.path ? c.dim(info.path) : c.dim("—");
    println(`  ${name}${state}${version}${path}`);
  }

  println();
  return 0;
}

export async function runToolsRemove(flags: ToolsFlags): Promise<number> {
  if (!flags.tool) {
    process.stderr.write(`  ${icon.fail} Specify --tool=<name> to remove\n`);
    return 1;
  }

  await manager.removeTool(flags.tool);
  println(`  ${icon.pass}  ${c.green(flags.tool)} removed`);
  return 0;
}

const TOOLS_USAGE = [
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
  `    ${c.cyan("--ci")}           ${c.dim("Non-interactive CI mode")}`,
].join("\n");

export async function runToolsCommand(subcommand: string, args: string[]): Promise<number> {
  const flags = parseToolsFlags(args);
  switch (subcommand) {
    case "install": return await runToolsInstall(flags);
    case "status": return await runToolsStatus(flags);
    case "remove": return await runToolsRemove(flags);
    default:
      process.stderr.write(`  ${icon.fail} Unknown tools subcommand: ${c.bold(subcommand)}\n`);
      process.stderr.write(`${TOOLS_USAGE}\n`);
      return 1;
  }
}
