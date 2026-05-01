import {
  checkSensitiveFile,
  matchHighRiskPattern,
  parseInstallCommand,
  trivyScan,
} from "../../core/security.ts";
import { basename } from "node:path";
import type { HarnessPolicy } from "../index.ts";

export function createBeforeHandler(
  policy: HarnessPolicy,
  getPreflightPromise: () => Promise<void> | null,
  preflightPassed: () => boolean,
): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    const pp = getPreflightPromise();
    if (pp === null) throw new Error("Preflight not initialized — tool calls blocked");
    await pp;
    if (!preflightPassed()) throw new Error("Preflight failed — tool calls blocked");

    if (["read", "write", "edit"].includes(input.tool)) {
      const filePath = output.args?.filePath ?? output.args?.path ?? "";
      if (filePath && checkSensitiveFile(filePath, policy.actions?.read_file?.deny_patterns ?? [])) {
        throw new Error(`BLOCKED: access to sensitive file denied — ${basename(filePath)}`);
      }
    }

    if (input.tool !== "bash") return;

    const command = output.args?.command ?? "";
    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);

    const pkg = parseInstallCommand(command);
    if (pkg) {
      const { blocked, reason } = await trivyScan(pkg);
      if (blocked) throw new Error(`BLOCKED by Trivy: ${pkg.packageName} — ${reason}`);
    }

    const escaped = command.replace(/'/g, "'\\''");
    output.args ??= {};
    output.args.command = `docker exec harness-sandbox bash -c '${escaped}'`;

    if (matched) throw new Error(`BLOCKED: HIGH-RISK pattern matched — ${matched}`);
  };
}
