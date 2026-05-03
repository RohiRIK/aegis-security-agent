import type { HarnessPolicy } from "../index.ts";

type CompactionOutput = {
  context: string[];
  prompt?: string;
};

export function createCompactionHandler(
  getPreflightStatus: () => "passed" | "failed" | "not-run",
  getDegraded: () => boolean,
  policy: HarnessPolicy,
) {
  return async (output: CompactionOutput) => {
    const mode = getDegraded() ? "DEGRADED" : "full";
    const preflight = getPreflightStatus();
    const blockedPatterns = policy.high_risk_patterns?.length ?? 0;

    output.context.push(
      `[AEGIS] Security: routing=${mode}, preflight=${preflight}, blocked_patterns=${blockedPatterns}`,
    );
  };
}
