import type { AegisPolicy } from "../index.ts";

type CompactionOutput = {
  context: string[];
  prompt?: string;
};

export function createCompactionHandler(
  policy: AegisPolicy,
) {
  return async (output: CompactionOutput) => {
    const blockedPatterns = policy.high_risk_patterns?.length ?? 0;

    output.context.push(
      `[AEGIS] Security: blocked_patterns=${blockedPatterns}`,
    );
  };
}
