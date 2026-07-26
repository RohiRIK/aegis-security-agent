import type { NormalizedFinding } from "../events/types.ts";
import type { SeverityCounts, Verdict } from "../core/verdict.ts";

export type ScannerRun = {
  name: string;
  version: string;
  /** `ok` | `cached` | `timeout` | `error` | `skipped` (optional tool absent). */
  status: string;
  durationMs: number;
  /** What this scanner was configured to look for — shown in Scanner Detail. */
  detail?: string;
  /** How many rules/patterns it applied, when the count is knowable. */
  ruleCount?: number;
};

export type ScanReport = {
  repo: string;
  target: string;
  date: string;
  commit: string;
  verdict: Verdict;
  counts: SeverityCounts;
  findings: NormalizedFinding[];
  degraded: string[];
  scanners: ScannerRun[];
  /** Aegis version that produced the report — shown in the footer. */
  toolVersion?: string;
  /** Wall-clock time for the whole scan. */
  durationMs?: number;
  /** Files read by the built-in walker. */
  filesScanned?: number;
};
