import { join } from "node:path";

import {
  ensureDir,
  getString,
  isRecord,
  writeStderr,
} from "../lib/base.ts";
import { matchHighRiskPattern, parseInstallCommand, trivyScan } from "../core/security.ts";
import { routeCommand } from "../core/router.ts";
import { safeClaude } from "./safe-claude.ts";
import { createEvent } from "../events/types.ts";
import { emitEvent } from "../events/emitter.ts";
import type { AegisPolicy } from "../types/policy.ts";
import { validatePolicy } from "../types/policy.ts";

const PROJECT_DIR = process.cwd();
const POLICY_PATH = join(PROJECT_DIR, "aegis-policy.json");
const AUDIT_LOG = join(PROJECT_DIR, ".aegis", "audit.jsonl");

async function hookLogic(parsedInput: Record<string, unknown>): Promise<Record<string, unknown>> {
  const toolName = getString(parsedInput, "tool_name") ?? getString(parsedInput, "tool") ?? "";
  const toolInput = isRecord(parsedInput.tool_input) ? parsedInput.tool_input : undefined;
  const bashCommand = toolInput ? getString(toolInput, "command") ?? "" : "";

  await ensureDir(join(PROJECT_DIR, ".aegis"));

  if ((toolName === "Bash" || toolName === "bash") && bashCommand.length > 0) {
    let policy: AegisPolicy = { high_risk_patterns: [] };
    try {
      const raw = await Bun.file(POLICY_PATH).json();
      const result = validatePolicy(raw);
      policy = result.policy;
      for (const w of result.warnings) {
        writeStderr(`[AEGIS] Policy warning: ${w}\n`);
      }
    } catch {
      writeStderr("[AEGIS] Policy file missing or invalid — running in degraded mode\n");
    }

    const route = routeCommand(bashCommand, policy);
    const matchedPattern = matchHighRiskPattern(bashCommand, policy.high_risk_patterns ?? []) ?? "";

    if (matchedPattern.length > 0) {
      await emitEvent(
        createEvent("policy.match", "high", bashCommand, `High-risk pattern: ${matchedPattern}`, {
          source: "hook",
          outcome: "warn",
          policy: { rule: matchedPattern, action: "run_shell" },
        }),
        AUDIT_LOG,
      );
      writeStderr(`[AEGIS] HIGH-RISK pattern detected: ${matchedPattern} — advisory only\n`);
    }

    const parsedInstall = parseInstallCommand(bashCommand);
    if (parsedInstall !== null) {
      await emitEvent(
        createEvent("install.warning", "info", bashCommand, `Install detected: ${parsedInstall.packageName}`, {
          source: "hook",
          evidence: { ecosystem: parsedInstall.ecosystem, package: parsedInstall.packageName },
        }),
        AUDIT_LOG,
      );

      const { blocked, reason } = await trivyScan(parsedInstall);
      if (blocked) {
        await emitEvent(
          createEvent("scanner.finding", "high", bashCommand, `Trivy: ${parsedInstall.packageName} — ${reason}`, {
            source: "hook",
            evidence: { scanner: "trivy", package: parsedInstall.packageName, reason },
          }),
          AUDIT_LOG,
        );
        writeStderr(`[AEGIS] Trivy warning: '${parsedInstall.packageName}' — ${reason} (advisory)\n`);
      }
    }

    if (route !== "host" && matchedPattern.length === 0) {
      await emitEvent(
        createEvent("policy.match", "info", bashCommand, `Routing: ${route} (passthrough)`, {
          source: "hook",
          outcome: "allow",
          policy: { action: "run_shell" },
        }),
        AUDIT_LOG,
      );
    }
  }

  return parsedInput;
}

if (import.meta.main) {
  await safeClaude(hookLogic);
}

export { hookLogic };
