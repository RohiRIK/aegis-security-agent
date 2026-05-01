import { matchHighRiskPattern } from "../../core/security.ts";
import type { HarnessPolicy } from "../index.ts";

export function createPermissionHandler(policy: HarnessPolicy): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    const command = input.command ?? input.title ?? "";
    if (!command) return;
    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);
    if (matched) {
      output.status = "ask";
    }
  };
}
