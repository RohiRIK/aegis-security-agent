import type { SemgrepFinding, SemgrepResult } from "../../core/security.ts";
import { wrapSemgrep } from "../../lib/scanner.ts";

function parseSemgrepFindings(stdout: string): SemgrepFinding[] {
  let parsed: { results?: SemgrepResult[] };
  try {
    parsed = JSON.parse(stdout) as { results?: SemgrepResult[] };
  } catch {
    return [];
  }

  const results = Array.isArray(parsed.results) ? parsed.results : [];
  return results
    .filter((result) => result.extra?.severity === "ERROR")
    .map((result) => ({
      rule: result.check_id ?? "unknown",
      severity: result.extra?.severity ?? "ERROR",
      message: result.extra?.message ?? "",
      line: result.start?.line ?? 0,
    }));
}

export function createAfterHandler(): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    if (!["write", "edit"].includes(input.tool)) return;
    const filePath = input.args?.filePath ?? input.args?.path ?? "";
    if (!filePath) return;

    const result = await wrapSemgrep(filePath);
    const findings = result.status === "ok" ? parseSemgrepFindings(result.stdout) : [];

    if (findings.length > 0) {
      output.output += `\n\n[HARNESS] Semgrep found ${findings.length} issue(s):\n` + JSON.stringify(findings, null, 2);
    }

    if (result.degraded) {
      output.output += "\n\n[HARNESS] ⚠️ Semgrep DEGRADED: scan timed out after 120s";
    }
  };
}
