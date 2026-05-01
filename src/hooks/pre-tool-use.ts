import { join, resolve } from "node:path";

import {
  ensureDir,
  formatTimestamp,
  getString,
  isRecord,
  readStdinText,
  runCommandInherit,
  shellQuote,
  writeStderr,
  writeStdout,
} from "../lib/base.ts";
import { matchHighRiskPattern, parseInstallCommand, trivyScan } from "../core/security.ts";

const HARNESS_DIR = resolve(import.meta.dir, "..", "..");
const POLICY_PATH = join(HARNESS_DIR, "harness-policy.json");

type HarnessPolicy = {
  high_risk_patterns?: string[];
  hitl_timeout_seconds?: number;
};

async function main(): Promise<number> {
  const inputText = await readStdinText();
  const parsedInput = JSON.parse(inputText) as unknown;
  if (!isRecord(parsedInput)) {
    throw new Error("Invalid hook input.");
  }

  const toolName = getString(parsedInput, "tool_name") ?? getString(parsedInput, "tool") ?? "";
  const toolInput = isRecord(parsedInput.tool_input) ? parsedInput.tool_input : undefined;
  const bashCommand = toolInput ? getString(toolInput, "command") ?? "" : "";

  await ensureDir(join(HARNESS_DIR, ".harness"));

  if ((toolName === "Bash" || toolName === "bash") && bashCommand.length > 0) {
    const policy = (await Bun.file(POLICY_PATH).json()) as HarnessPolicy;
    const highRiskPatterns = Array.isArray(policy.high_risk_patterns) ? policy.high_risk_patterns : [];
    const matchedPattern = matchHighRiskPattern(bashCommand, highRiskPatterns) ?? "";

    if (matchedPattern.length > 0) {
      const timeoutSeconds = typeof policy.hitl_timeout_seconds === "number" ? policy.hitl_timeout_seconds : 120;
      const requestId = crypto.randomUUID();
      const hitlJson = JSON.stringify({
        hitl_request: {
          id: requestId,
          timestamp: formatTimestamp(),
          session_id: "harness",
          action: {
            tool: "bash",
            command: bashCommand,
            risk_reason: `Matches HIGH-RISK pattern: ${matchedPattern}`,
            risk_level: "HIGH",
            reversible: false,
          },
          context: {
            current_task: "Agent-initiated shell command",
            working_directory: process.cwd(),
          },
          instructions: `Type 'approve' to allow, anything else to deny. Auto-deny in ${timeoutSeconds}s.`,
        },
      });

      const hitlExitCode = await runCommandInherit(
        ["bun", "run", join(HARNESS_DIR, "src", "hitl-gateway.ts"), hitlJson],
        { env: { HITL_TIMEOUT_SECONDS: String(timeoutSeconds) } },
      );
      if (hitlExitCode !== 0) {
        writeStderr("BLOCKED by HITL gateway: HIGH-RISK command denied.\n");
        return 1;
      }
    }

    const parsedInstall = parseInstallCommand(bashCommand);
    if (parsedInstall !== null) {
      const { blocked, reason } = await trivyScan(parsedInstall);
      if (blocked) {
        writeStderr(`BLOCKED by Trivy: '${parsedInstall.packageName}' — ${reason}\n`);
        return 1;
      }
    }

    const rewrittenInput: Record<string, unknown> = structuredClone(parsedInput);
    const rewrittenToolInput = isRecord(rewrittenInput.tool_input) ? rewrittenInput.tool_input : {};
    rewrittenToolInput.command = `bun run \"${join(HARNESS_DIR, "src", "sandbox", "exec.ts")}\" ${shellQuote(bashCommand)}`;
    rewrittenInput.tool_input = rewrittenToolInput;
    writeStdout(`${JSON.stringify(rewrittenInput)}\n`);
    return 0;
  }

  writeStdout(`${JSON.stringify(parsedInput)}\n`);
  return 0;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
