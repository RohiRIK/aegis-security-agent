import type { HarnessPolicy } from "../index.ts";

type CompactionOutput = {
  context: string[];
  prompt?: string;
};

export function createCompactionHandler(
  getPreflightPassed: () => boolean,
  getDegraded: () => boolean,
  policy: HarnessPolicy,
) {
  return async (output: CompactionOutput) => {
    const mode = getDegraded() ? "DEGRADED" : "full";
    const preflight = getPreflightPassed() ? "passed" : "not-run";
    const blockedPatterns = policy.high_risk_patterns?.length ?? 0;

    output.context.push(
      `[AEGIS] Security: routing=${mode}, preflight=${preflight}, blocked_patterns=${blockedPatterns}`,
    );
  };
}
