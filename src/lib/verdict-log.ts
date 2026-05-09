import { resolve } from "node:path";

import { fileExists } from "./base.ts";
import { createEvent } from "../events/types.ts";
import { emitEvent } from "../events/emitter.ts";
import type { AegisEvent } from "../events/types.ts";

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

/**
 * Create an AegisEvent from verdict fields.
 * The VerdictEvent fields are stored in `evidence` for backward reading.
 */
export function createVerdictEvent(event: Omit<VerdictEvent, "type" | "ts">): AegisEvent {
  const severity = event.verdict === "BLOCKED" ? "critical" as const
    : event.verdict === "RISKY" ? "high" as const
    : "info" as const;

  const outcome = event.verdict === "BLOCKED" ? "block" as const
    : event.verdict === "RISKY" ? "warn" as const
    : "allow" as const;

  return createEvent(
    "scanner.summary",
    severity,
    event.scope,
    `${event.task}: ${event.verdict} — C:${event.findings.critical} H:${event.findings.high} M:${event.findings.medium} L:${event.findings.low} I:${event.findings.info}`,
    {
      source: "agent",
      outcome,
      degraded: event.degraded.length > 0 ? true : undefined,
      evidence: {
        verdict: event.verdict,
        task: event.task,
        findings: event.findings,
        degraded: event.degraded,
        commit: event.commit,
        scope: event.scope,
      },
    },
  );
}

/** @deprecated Use createVerdictEvent + emitEvent instead. Kept for backward compat in tests. */
export function formatVerdictEvent(event: Omit<VerdictEvent, "type" | "ts">): string {
  return JSON.stringify(createVerdictEvent(event)) + "\n";
}

export async function appendVerdictEvent(auditLogPath: string, event: Omit<VerdictEvent, "type" | "ts">): Promise<void> {
  await emitEvent(createVerdictEvent(event), auditLogPath);
}

/**
 * Parse a single NDJSON line into a VerdictEvent, supporting both formats:
 * - Legacy: `{ type: "aegis_verdict", ... }`
 * - New:    `{ schema: "aegis/v1", kind: "scanner.summary", evidence: { verdict, ... } }`
 */
function parseVerdictLine(line: string): VerdictEvent | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Legacy format
  if (parsed.type === "aegis_verdict") {
    return parsed as unknown as VerdictEvent;
  }

  // New AegisEvent format
  if (parsed.schema === "aegis/v1" && parsed.kind === "scanner.summary" && parsed.evidence) {
    const evidence = parsed.evidence as Record<string, unknown>;
    if (typeof evidence.verdict === "string" && typeof evidence.task === "string") {
      return {
        type: "aegis_verdict",
        ts: (parsed.ts as string) ?? new Date().toISOString(),
        task: evidence.task as string,
        verdict: evidence.verdict as VerdictEvent["verdict"],
        findings: (evidence.findings as VerdictEvent["findings"]) ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        degraded: (evidence.degraded as string[]) ?? [],
        commit: (evidence.commit as string) ?? "",
        scope: (evidence.scope as string) ?? "",
      };
    }
  }

  return null;
}

export async function readRecentVerdicts(auditLogPath: string, count: number): Promise<VerdictEvent[]> {
  if (!(await fileExists(auditLogPath))) {
    return [];
  }

  const content = await Bun.file(auditLogPath).text();
  const lines = content.trim().split("\n").filter(Boolean);

  const verdicts: VerdictEvent[] = [];
  for (const line of lines) {
    const verdict = parseVerdictLine(line);
    if (verdict) {
      verdicts.push(verdict);
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

    const logPath = args[1] ?? resolve(process.cwd(), ".aegis", "audit.jsonl");
    await appendVerdictEvent(logPath, event);
    process.stdout.write(`Verdict appended to ${logPath}\n`);
    return;
  }

  if (command === "read") {
    const count = Number(args[0]) || 10;
    const logPath = args[1] ?? resolve(process.cwd(), ".aegis", "audit.jsonl");
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
