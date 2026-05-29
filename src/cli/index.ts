#!/usr/bin/env bun

import { c, icon, printHeader, println } from "../lib/ui.ts";
import { resolve } from "node:path";

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
  `    ${c.cyan("tools")}    ${c.dim("Install, check, or remove scanner binaries")}`,
    `    ${c.cyan("verdict")}  ${c.dim("Read or append verdict audit log entries")}`,
    `    ${c.cyan("report")}   ${c.dim("Generate security reports from audit data")}`,
    `    ${c.cyan("help")}     ${c.dim("Show this help")}`,
  "",
  `  ${c.bold("Install Flags")}`,
  `    ${c.cyan("--opencode")}     ${c.dim("Install for OpenCode (default)")}`,
  `    ${c.cyan("--claude")}       ${c.dim("Install for Claude Code")}`,
  `    ${c.cyan("--force")}        ${c.dim("Overwrite existing files")}`,
  `    ${c.cyan("--skip-docker")}  ${c.dim("Skip Docker availability check")}`,
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
  println(`  ${icon.info} Use 'bunx aegis-security-agent status' or install to get full status`);
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
    case "tools": {
      const { runToolsCommand } = await import("./tools.ts");
      const [subcommand, ...toolArgs] = args;
      return await runToolsCommand(subcommand ?? "status", toolArgs);
    }
    case "verdict": {
      const { appendVerdictEvent, readRecentVerdicts } = await import("../lib/verdict-log.ts");
      const [subcommand, ...verdictArgs] = args;
      const logPath = resolve(process.cwd(), ".aegis", "audit.jsonl");

      if (subcommand === "read") {
        const count = Number(verdictArgs[0]) || 10;
        const verdicts = await readRecentVerdicts(logPath, count);
        if (verdicts.length === 0) {
          process.stdout.write("No verdict history found.\n");
          return 0;
        }
        for (const v of verdicts) {
          process.stdout.write(`${v.ts} | ${v.verdict} | ${v.task} | C:${v.findings.critical} H:${v.findings.high} M:${v.findings.medium} L:${v.findings.low} I:${v.findings.info}${v.degraded.length > 0 ? ` | DEGRADED: ${v.degraded.join(",")}` : ""}\n`);
        }
        return 0;
      }

      if (subcommand === "append") {
        const jsonStr = verdictArgs[0];
        if (!jsonStr) {
          process.stderr.write("Usage: aegis verdict append '<json>'\n");
          return 1;
        }
        let event: Parameters<typeof appendVerdictEvent>[1];
        try {
          event = JSON.parse(jsonStr) as Parameters<typeof appendVerdictEvent>[1];
        } catch {
          process.stderr.write("Invalid JSON\n");
          return 1;
        }
        await appendVerdictEvent(logPath, event);
        process.stdout.write(`Verdict appended to ${logPath}\n`);
        return 0;
      }

      process.stderr.write(`  ${icon.fail} Unknown verdict subcommand: ${c.bold(subcommand ?? "")}\n`);
      process.stderr.write(`  Usage: ${c.cyan("aegis verdict")} ${c.dim("<read|append> [args]")}\n`);
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
      const { runReport, parseReportFlags } = await import("./report.ts");
      return await runReport(parseReportFlags(args));
    }
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
