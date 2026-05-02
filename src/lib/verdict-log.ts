import { resolve } from "node:path";

import { appendText, ensureDir, fileExists } from "./base.ts";

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

export async function appendVerdictEvent(auditLogPath: string, event: Omit<VerdictEvent, "type" | "ts">): Promise<void> {
  const dir = resolve(auditLogPath, "..");
  await ensureDir(dir);
  await appendText(auditLogPath, formatVerdictEvent(event));
}

export async function readRecentVerdicts(auditLogPath: string, count: number): Promise<VerdictEvent[]> {
  if (!(await fileExists(auditLogPath))) {
    return [];
  }

  const content = await Bun.file(auditLogPath).text();
  const lines = content.trim().split("\n").filter(Boolean);

  const verdicts: VerdictEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.type === "aegis_verdict") {
        verdicts.push(parsed as unknown as VerdictEvent);
      }
    } catch {
      continue;
    }
  }

  return verdicts.slice(-count);
}

async function cli(): Promise<void> {
  const [command, ...args] = Bun.argv.slice(2);

  if (command === "append") {
    const jsonStr = args[0];
    if (!jsonStr) {
      process.stderr.write("Usage: verdict-log.ts append '<json>'\n");
      process.exit(1);
    }

    let event: Omit<VerdictEvent, "type" | "ts">;
    try {
      event = JSON.parse(jsonStr) as Omit<VerdictEvent, "type" | "ts">;
    } catch {
      process.stderr.write("Invalid JSON\n");
      process.exit(1);
    }

    const logPath = args[1] ?? resolve(process.cwd(), ".aegis", "audit.log");
    await appendVerdictEvent(logPath, event);
    process.stdout.write(`Verdict appended to ${logPath}\n`);
    return;
  }

  if (command === "read") {
    const count = Number(args[0]) || 10;
    const logPath = args[1] ?? resolve(process.cwd(), ".aegis", "audit.log");
    const verdicts = await readRecentVerdicts(logPath, count);

    if (verdicts.length === 0) {
      process.stdout.write("No verdict history found.\n");
      return;
    }

    for (const v of verdicts) {
      process.stdout.write(`${v.ts} | ${v.verdict} | ${v.task} | C:${v.findings.critical} H:${v.findings.high} M:${v.findings.medium} L:${v.findings.low} I:${v.findings.info}${v.degraded.length > 0 ? ` | DEGRADED: ${v.degraded.join(",")}` : ""}\n`);
    }
    return;
  }

  process.stderr.write("Usage: verdict-log.ts <append|read> [args]\n");
  process.stderr.write("  append '<json>' [log-path]  — Append verdict event\n");
  process.stderr.write("  read [count] [log-path]     — Read recent verdicts\n");
  process.exit(1);
}

if (import.meta.main) {
  await cli();
}
