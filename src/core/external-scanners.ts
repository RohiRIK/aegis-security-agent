import crypto from "node:crypto";

import type { AegisEventSeverity, NormalizedFinding } from "../events/types.ts";

/**
 * Adapters for optional third-party scanners. Neither binary ships with Aegis:
 * when one is absent the scan records it as `skipped` rather than `degraded`,
 * so an optional tool's absence never changes the verdict or the exit code.
 */

export type OptionalScannerName = "gitleaks" | "njsscan";

function fingerprint(parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// gitleaks
// ---------------------------------------------------------------------------

type GitleaksResult = {
  RuleID?: string;
  Description?: string;
  File?: string;
  StartLine?: number;
  EndLine?: number;
  Entropy?: number;
  // `Match` and `Secret` are deliberately absent from this type: gitleaks emits
  // the plaintext credential in both, and neither may enter a finding.
};

/** Gitleaks rule ids whose hits are live credentials rather than shape guesses. */
const GITLEAKS_CRITICAL = /(?:private-key|aws-secret|gcp-|slack-|stripe|github-pat|gitlab-pat|npm-|openai|anthropic)/i;

/**
 * Parses `gitleaks ... --report-format json` output.
 * NEVER copies the `Secret`/`Match` fields — only rule identity and location.
 */
export function gitleaksToNormalized(stdout: string): NormalizedFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const findings: NormalizedFinding[] = [];
  for (const raw of parsed as GitleaksResult[]) {
    if (!raw || typeof raw !== "object") continue;
    const rule = typeof raw.RuleID === "string" && raw.RuleID.length > 0 ? raw.RuleID : "unknown";
    const file = typeof raw.File === "string" ? raw.File : "";
    const line = typeof raw.StartLine === "number" ? raw.StartLine : undefined;
    const ruleId = `gitleaks/${rule}`;
    const severity: AegisEventSeverity = GITLEAKS_CRITICAL.test(rule) ? "critical" : "high";

    findings.push({
      scanner: "gitleaks",
      ruleId,
      // Description is the rule's own text, never the matched value.
      message: typeof raw.Description === "string" && raw.Description.length > 0
        ? raw.Description
        : `Secret pattern matched: ${rule}`,
      severity,
      ...(file ? { location: { file, ...(line != null ? { startLine: line } : {}) } } : {}),
      fingerprint: fingerprint(["gitleaks", ruleId, file, String(line ?? 0)]),
      fix: "Rotate the exposed credential, then purge it from git history (git filter-repo) — deleting the line is not enough.",
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// njsscan
// ---------------------------------------------------------------------------

type NjsscanFile = {
  file_path?: string;
  match_lines?: unknown;
};

type NjsscanRule = {
  files?: NjsscanFile[];
  metadata?: {
    severity?: string;
    description?: string;
    cwe?: string;
    owasp?: string;
  };
};

function mapNjsscanSeverity(severity: string | undefined): AegisEventSeverity {
  switch ((severity ?? "").toUpperCase()) {
    case "ERROR":
      return "high";
    case "WARNING":
      return "medium";
    case "INFO":
      return "low";
    default:
      return "medium";
  }
}

function firstMatchLine(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  const first = value[0];
  return typeof first === "number" ? first : undefined;
}

/**
 * Parses `njsscan --json` output. njsscan groups by rule id under a
 * `nodejs`/`templates` section, each holding the files it fired on.
 */
export function njsscanToNormalized(stdout: string): NormalizedFinding[] {
  let parsed: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(stdout);
    // `JSON.parse("null")` yields null, which is typeof "object" — guard both.
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
    parsed = raw as Record<string, unknown>;
  } catch {
    return [];
  }

  const findings: NormalizedFinding[] = [];
  for (const section of ["nodejs", "templates"]) {
    const rules = parsed[section];
    if (!rules || typeof rules !== "object") continue;

    for (const [rule, body] of Object.entries(rules as Record<string, NjsscanRule>)) {
      if (!body || typeof body !== "object") continue;
      const severity = mapNjsscanSeverity(body.metadata?.severity);
      const description = body.metadata?.description ?? rule;
      const ruleId = `njsscan/${rule}`;

      for (const file of body.files ?? []) {
        const path = typeof file?.file_path === "string" ? file.file_path : "";
        const line = firstMatchLine(file?.match_lines);
        findings.push({
          scanner: "njsscan",
          ruleId,
          message: description,
          severity,
          ...(path ? { location: { file: path, ...(line != null ? { startLine: line } : {}) } } : {}),
          fingerprint: fingerprint(["njsscan", ruleId, path, String(line ?? 0)]),
          fix: body.metadata?.cwe
            ? `Review against ${body.metadata.cwe}${body.metadata.owasp ? ` / ${body.metadata.owasp}` : ""} and apply the framework-recommended mitigation.`
            : "Apply the framework-recommended mitigation for this rule.",
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Availability + argv
// ---------------------------------------------------------------------------

/** True when the binary resolves on PATH. Never throws. */
export async function isScannerAvailable(binary: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["command", "-v", binary], { stdout: "ignore", stderr: "ignore" });
    return (await proc.exited) === 0;
  } catch {
    // `command` is a shell builtin on some systems — fall back to `which`.
    try {
      const proc = Bun.spawn(["which", binary], { stdout: "ignore", stderr: "ignore" });
      return (await proc.exited) === 0;
    } catch {
      return false;
    }
  }
}

/**
 * gitleaks argv for a directory scan. `--exit-code 0` keeps a findings result
 * from looking like a tool failure; the verdict comes from Aegis, not gitleaks.
 */
export function gitleaksArgv(dir: string): string[] {
  return [
    "gitleaks",
    "dir",
    dir,
    "--report-format", "json",
    "--report-path", "/dev/stdout",
    "--no-banner",
    "--exit-code", "0",
  ];
}

export function njsscanArgv(dir: string): string[] {
  return ["njsscan", "--json", dir];
}
