import { parseSemgrepFindings, type SemgrepFinding } from "../../core/security.ts";
import { wrapSemgrep } from "../../lib/scanner.ts";

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
