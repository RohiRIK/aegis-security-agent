import type { AegisEventSeverity, NormalizedFinding } from "../events/types.ts";

export type SeverityCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};

export type Verdict = "SAFE" | "RISKY" | "BLOCKED";

/** Exit codes for the headless `aegis scan` contract. */
export const VERDICT_EXIT_CODE: Record<Verdict, number> = {
  SAFE: 0,
  RISKY: 1,
  BLOCKED: 2,
};

export const SCAN_ERROR_EXIT_CODE = 3;

export function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function tallySeverities(findings: NormalizedFinding[]): SeverityCounts {
  const counts = emptyCounts();
  for (const finding of findings) {
    counts[finding.severity satisfies AegisEventSeverity] += 1;
  }
  return counts;
}

/**
 * Verdict rules (from docs/agents/aegis.md):
 * - Any CRITICAL           → BLOCKED
 * - Any HIGH or MEDIUM     → RISKY
 * - Otherwise (LOW/INFO)   → SAFE
 */
export function computeVerdict(counts: SeverityCounts): Verdict {
  if (counts.critical > 0) return "BLOCKED";
  if (counts.high > 0 || counts.medium > 0) return "RISKY";
  return "SAFE";
}
