export type VerdictEvent = {
  type: "aegis_verdict";
  ts: string;
  task: string;
  verdict: "SAFE" | "RISKY" | "BLOCKED";
  findings: { critical: number; high: number; medium: number; low: number; info: number };
  degraded: string[];
  commit: string;
  scope: string;
};

export function formatVerdictEvent(event: Omit<VerdictEvent, "type" | "ts">): string {
  return JSON.stringify({ type: "aegis_verdict", ts: new Date().toISOString(), ...event }) + "\n";
}
