import { parseSemgrepFindings, semgrepToNormalized } from "../../core/security.ts";
import { wrapSemgrep } from "../../lib/scanner.ts";
import { proxyResult } from "../../lib/output-proxy.ts";
import { basename } from "node:path";
import { createEvent } from "../../events/types.ts";
import { emitEvent } from "../../events/emitter.ts";

export function createAfterHandler(): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    if (!["write", "edit"].includes(input.tool)) return;
    const filePath = input.args?.filePath ?? input.args?.path ?? "";
    if (!filePath) return;

    const result = await wrapSemgrep(filePath);
    const findings = result.status === "ok" ? parseSemgrepFindings(result.stdout) : [];

    if (findings.length > 0) {
      const { summary, detailPath } = proxyResult("semgrep", findings, { filename: basename(filePath) });
      const normalized = semgrepToNormalized(findings, filePath);
      output.output += `\n\n${summary}`;
      await emitEvent(
        createEvent("scanner.finding", "medium", filePath, `Semgrep: ${basename(filePath)} — ${findings.length} finding(s)`, {
          source: "plugin",
          outcome: "warn",
          evidence: {
            scanner: "semgrep",
            file: filePath,
            count: findings.length,
            findings: normalized,
            detailPath,
            summary,
          },
          correlation: {
            sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
            toolCall: input.id ?? undefined,
          },
        }),
      );
    }

    if (result.degraded) {
      output.output += "\n\n[AEGIS] ⚠️ Semgrep DEGRADED: scan timed out after 120s";
      await emitEvent(
        createEvent("scanner.summary", "medium", filePath, "Semgrep scan timed out", {
          source: "plugin",
          outcome: "skip",
          degraded: true,
          evidence: { scanner: "semgrep", file: filePath },
          correlation: {
            sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
            toolCall: input.id ?? undefined,
          },
        }),
      );
    }
  };
}
