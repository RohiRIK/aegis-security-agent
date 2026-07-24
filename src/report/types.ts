import type { NormalizedFinding } from "../events/types.ts";
import type { SeverityCounts, Verdict } from "../core/verdict.ts";

export type ScannerRun = {
  name: string;
  version: string;
  status: string;
  durationMs: number;
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
};
