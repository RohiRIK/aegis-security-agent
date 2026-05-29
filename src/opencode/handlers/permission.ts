import { matchHighRiskPattern } from "../../core/security.ts";
import { createEvent } from "../../events/types.ts";
import { emitEvent } from "../../events/emitter.ts";
import type { AegisPolicy } from "../index.ts";

export function createPermissionHandler(policy: AegisPolicy): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    const command = input.command ?? input.title ?? "";
    if (!command) return;
    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);
    if (matched) {
      output.status = "ask";
      await emitEvent(
        createEvent("permission.warning", "high", command, `Permission escalation: ${matched}`, {
          source: "plugin",
          outcome: "warn",
          policy: { rule: matched, action: "permission.ask" },
          correlation: {
            sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
          },
        }),
      );
    }
  };
}
