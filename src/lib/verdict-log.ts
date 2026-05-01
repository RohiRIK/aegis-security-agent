import { appendText, fileExists } from "./base";

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

export async function appendVerdictEvent(
  logPath: string,
  event: Omit<VerdictEvent, "type" | "ts">,
): Promise<void> {
  await appendText(logPath, formatVerdictEvent(event));
}

export async function readRecentVerdicts(logPath: string, count: number = 10): Promise<VerdictEvent[]> {
  if (!(await fileExists(logPath))) {
    return [];
  }

  const content = await Bun.file(logPath).text();
  const verdicts: VerdictEvent[] = [];

  for (const line of content.split("\n")) {
    if (!line.includes("aegis_verdict")) continue;
    try {
      verdicts.push(JSON.parse(line) as VerdictEvent);
    } catch {
    }
  }

  return verdicts.slice(-count);
}
