import crypto from "node:crypto";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const SCANS_DIR = ".aegis/scans";

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function ensureScansDirSync(): void {
  try {
    mkdirSync(SCANS_DIR, { recursive: true });
  } catch {
    // ignore — dir may already exist
  }
}

function writeDetailAsync(hash: string, fullOutput: unknown): string {
  const detailPath = join(SCANS_DIR, `${hash}.json`);
  // Fire-and-forget: do not await, do not block hook response
  Promise.resolve().then(async () => {
    try {
      ensureScansDirSync();
      await Bun.write(detailPath, JSON.stringify(fullOutput, null, 2));
    } catch {
      // best-effort — never throw from background write
    }
  });
  return detailPath;
}

type SemgrepFinding = { severity?: string; rule?: string; [key: string]: unknown };
type TrivyResult = { Results?: Array<{ Vulnerabilities?: unknown[] }> };

function buildSemgrepSummary(
  findings: SemgrepFinding[],
  filename: string,
  hash: string,
  detailPath: string,
): string {
  const severities = [...new Set(findings.map((f) => (f.severity ?? "UNKNOWN").toUpperCase()))].join(", ");
  const base = filename ? ` in ${filename}` : "";
  return `[AEGIS] Semgrep: ${findings.length} finding(s)${base} (${severities}). Details: ${detailPath}`;
}

function buildTrivySummary(
  parsed: TrivyResult,
  packageName: string,
  hash: string,
  detailPath: string,
): string {
  const vulnCount = parsed.Results?.reduce((sum, r) => sum + (r.Vulnerabilities?.length ?? 0), 0) ?? 0;
  const pkg = packageName ? ` in ${packageName}` : "";
  return `[AEGIS] Trivy: ${vulnCount} CVE(s)${pkg}. Details: ${detailPath}`;
}

export type ProxyResultOutput = {
  summary: string;
  detailPath: string;
};

/**
 * Intercepts scanner tool output, writes full details to .aegis/scans/{hash}.json,
 * and returns a lean one-liner summary for the LLM context.
 *
 * The file write is fire-and-forget — this function returns synchronously.
 */
export function proxyResult(
  toolName: string,
  fullOutput: unknown,
  options?: {
    filename?: string;
    packageName?: string;
  },
): ProxyResultOutput {
  const serialized = JSON.stringify(fullOutput);
  const hash = computeHash(serialized);
  const detailPath = writeDetailAsync(hash, fullOutput);

  const tool = toolName.toLowerCase();

  if (tool === "semgrep") {
    const findings = Array.isArray(fullOutput) ? (fullOutput as SemgrepFinding[]) : [];
    const summary = buildSemgrepSummary(findings, options?.filename ?? "", hash, detailPath);
    return { summary, detailPath };
  }

  if (tool === "trivy") {
    const parsed = (typeof fullOutput === "object" && fullOutput !== null ? fullOutput : {}) as TrivyResult;
    const summary = buildTrivySummary(parsed, options?.packageName ?? "", hash, detailPath);
    return { summary, detailPath };
  }

  return {
    summary: `[AEGIS] ${toolName}: result saved. Details: ${detailPath}`,
    detailPath,
  };
}
