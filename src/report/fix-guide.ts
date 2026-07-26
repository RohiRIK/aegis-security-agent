import { RULE_FIX_INDEX } from "../core/patterns.ts";
import type { NormalizedFinding } from "../events/types.ts";
import type { ScanReport } from "./types.ts";

/**
 * Remediation guidance for the report. Built-in rules carry their own `fix`;
 * this module supplies it for findings that arrive from external scanners,
 * which report *what* is wrong but rarely *what to do next*.
 */

/** Semgrep rule-id fragments → guidance, most specific first. */
const SEMGREP_GUIDANCE: [RegExp, string][] = [
  [/command-?injection|dangerous-(?:exec|spawn|subprocess)|shell-?(?:true|injection)/i,
   "Pass an argument array instead of a shell string, and validate every interpolated value against an allowlist."],
  [/sql-?injection|tainted-sql|formatted-sql/i,
   "Use parameterized queries / bound placeholders. Never build SQL by string concatenation."],
  [/(?:xss|cross-site-scripting|dangerouslysetinnerhtml|unescaped-?(?:template|output))/i,
   "Escape on output or render as text. Reserve raw-HTML sinks for values you produced yourself."],
  [/path-?traversal|tainted-path|zipslip/i,
   "Resolve the path and assert it stays under an allowed root before touching the filesystem."],
  [/(?:ssrf|tainted-url|request-forgery)/i,
   "Resolve the target host and reject private/link-local ranges before making the request."],
  [/deserial|pickle|yaml-?load|unsafe-?eval|eval-?injection/i,
   "Use a safe loader (yaml.safe_load, JSON) — never deserialize untrusted input into live objects."],
  [/hardcoded|secret|credential|api-?key|password/i,
   "Move the value into the environment or a secret manager, then rotate it."],
  [/crypto|cipher|hash|random|tls|ssl|certificate/i,
   "Use a modern primitive (AES-256-GCM, SHA-256, crypto.randomBytes) and keep certificate verification on."],
  [/prototype-?pollution/i,
   "Reject `__proto__`/`constructor`/`prototype` keys, or build objects with Object.create(null)."],
  [/regex|redos/i,
   "Rewrite the pattern to avoid nested quantifiers, or bound the input length before matching."],
  [/cors|csrf/i,
   "Pin an explicit origin allowlist and keep credentialed requests off wildcard origins."],
];

/**
 * Guidance for one finding. Prefers the finding's own `fix`, then the built-in
 * rule index, then scanner-specific heuristics. Always returns something
 * actionable — an empty cell teaches nothing.
 */
export function fixGuidance(finding: NormalizedFinding): string {
  if (finding.fix) return finding.fix;

  const indexed = RULE_FIX_INDEX[finding.ruleId];
  if (indexed) return indexed;

  switch (finding.scanner) {
    case "trufflehog":
      return "Rotate the credential at its provider, then purge it from git history (git filter-repo). Deleting the line leaves it in every clone.";
    case "gitleaks":
      return "Rotate the exposed credential and purge it from git history; add the pattern to CI so it cannot land again.";
    case "trivy":
      return finding.package
        ? `Upgrade ${finding.package} to a patched release; if none exists, pin a fork or drop the dependency.`
        : "Upgrade the affected dependency to a patched release.";
    case "njsscan":
      return "Apply the framework-recommended mitigation for this rule.";
    case "semgrep": {
      for (const [pattern, guidance] of SEMGREP_GUIDANCE) {
        if (pattern.test(finding.ruleId)) return guidance;
      }
      return "Review the flagged expression and constrain the untrusted input it consumes.";
    }
    default:
      return "Review the flagged code and apply the least-privilege fix.";
  }
}

// ---------------------------------------------------------------------------
// Scanner-level recommendations
// ---------------------------------------------------------------------------

export type Recommendation = {
  scanner: string;
  text: string;
};

const NO_FINDING_ADVICE: Record<string, string> = {
  semgrep: "No SAST findings. Add project-specific rules (`--config .semgrep/`) to cover your own invariants.",
  trivy: "No HIGH/CRITICAL dependency CVEs. Keep the vulnerability DB fresh — results are only as current as the last DB pull.",
  trufflehog: "No verified secrets. Verification needs network access; a fully offline run can only report unverified pattern hits.",
  gitleaks: "No gitleaks hits.",
  njsscan: "No njsscan findings.",
  "gitleaks-replacement": "No regex secret hits. Keep `.env*` and key material out of the working tree.",
  "custom-patterns": "No language-specific sink patterns matched.",
  "path-traversal": "No traversal patterns. Keep filesystem paths derived from input anchored to a fixed root.",
  "hardcoded-ip": "No hardcoded addresses. Keep endpoints in configuration.",
  "weak-crypto": "No weak primitives found.",
};

/**
 * Per-scanner advice derived from what that scanner actually reported, so the
 * report says something useful whether or not it found anything.
 */
export function buildRecommendations(report: ScanReport): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const run of report.scanners) {
    if (run.status === "skipped") {
      recommendations.push({
        scanner: run.name,
        text: `Not installed — this analysis did not run. Install \`${run.name}\` to widen coverage.`,
      });
      continue;
    }
    if (report.degraded.includes(run.name)) {
      recommendations.push({
        scanner: run.name,
        text: `Ran degraded (${run.status}) — treat this scan as incomplete and re-run before trusting the verdict.`,
      });
      continue;
    }

    const findings = report.findings.filter((f) => f.scanner === run.name);
    if (findings.length === 0) {
      recommendations.push({ scanner: run.name, text: NO_FINDING_ADVICE[run.name] ?? "No findings." });
      continue;
    }

    const worst = ["critical", "high", "medium", "low", "info"].find((sev) =>
      findings.some((f) => f.severity === sev),
    );
    const topRule = mostCommonRule(findings);
    recommendations.push({
      scanner: run.name,
      text:
        `${findings.length} finding(s), worst severity ${worst}. ` +
        `Most frequent rule: ${topRule.ruleId} (${topRule.count}×). ` +
        fixGuidance(findings.find((f) => f.ruleId === topRule.ruleId) as NormalizedFinding),
    });
  }

  return recommendations;
}

function mostCommonRule(findings: NormalizedFinding[]): { ruleId: string; count: number } {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.ruleId, (counts.get(f.ruleId) ?? 0) + 1);
  let best = { ruleId: findings[0]?.ruleId ?? "unknown", count: 0 };
  for (const [ruleId, count] of counts) {
    if (count > best.count) best = { ruleId, count };
  }
  return best;
}
