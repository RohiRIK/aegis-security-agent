import { describe, expect, test } from "bun:test";
import { escapeHtml, renderReportHtml } from "./html.ts";
import type { ScanReport } from "./types.ts";

function report(overrides?: Partial<ScanReport>): ScanReport {
  return {
    repo: "demo",
    target: "/tmp/demo",
    date: "2026-07-24",
    commit: "abc1234",
    verdict: "RISKY",
    counts: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    findings: [
      {
        scanner: "semgrep",
        ruleId: "semgrep/rule.x",
        message: "hardcoded thing",
        severity: "high",
        location: { file: "src/a.ts", startLine: 4 },
      },
    ],
    degraded: [],
    scanners: [{ name: "semgrep", version: "1.0.0", status: "ok", durationMs: 12 }],
    ...overrides,
  };
}

describe("escapeHtml", () => {
  test("escapes angle brackets and quotes", () => {
    expect(escapeHtml(`<img src="x" onerror='y'>`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;",
    );
  });
});

describe("renderReportHtml", () => {
  test("includes verdict, repo, finding, counts", () => {
    const html = renderReportHtml(report());
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("RISKY");
    expect(html).toContain("demo");
    expect(html).toContain("semgrep/rule.x");
    expect(html).toContain("src/a.ts:4");
  });

  test("shows degraded banner", () => {
    const html = renderReportHtml(report({ degraded: ["trivy"] }));
    expect(html).toContain("DEGRADED");
    expect(html).toContain("trivy");
  });

  test("empty findings renders a no-findings card", () => {
    const html = renderReportHtml(report({ findings: [], counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } }));
    expect(html).toContain("No findings.");
  });
});

describe("renderReportHtml — XSS escaping", () => {
  const HOSTILE = `<script>alert(1)</script>`;

  test("escapes a script tag in a finding message", () => {
    const html = renderReportHtml(
      report({
        findings: [{ scanner: "semgrep", ruleId: "r", message: HOSTILE, severity: "info" }],
      }),
    );
    expect(html).not.toContain(HOSTILE);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("escapes hostile content in every scanner-controlled field", () => {
    const html = renderReportHtml(
      report({
        repo: HOSTILE,
        target: HOSTILE,
        commit: HOSTILE,
        date: HOSTILE,
        degraded: [HOSTILE],
        findings: [
          {
            scanner: "semgrep",
            ruleId: HOSTILE,
            message: HOSTILE,
            severity: "high",
            location: { file: HOSTILE, startLine: 1 },
            fix: HOSTILE,
          },
        ],
        scanners: [
          { name: HOSTILE, version: HOSTILE, status: HOSTILE, durationMs: 1, detail: HOSTILE },
        ],
        toolVersion: HOSTILE,
      }),
    );
    // The only <script in the document must be none at all.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("escapes attribute-breaking quotes", () => {
    const html = renderReportHtml(
      report({
        findings: [
          {
            scanner: "semgrep",
            ruleId: `x" onload="alert(1)`,
            message: `y' onerror='alert(2)`,
            severity: "high",
          },
        ],
      }),
    );
    expect(html).not.toContain(`onload="alert(1)`);
    expect(html).not.toContain(`onerror='alert(2)`);
  });
});

describe("renderReportHtml — self-contained", () => {
  test("has no scripts, external references, or url() assets", () => {
    const html = renderReportHtml(
      report({
        findings: [
          { scanner: "trivy", ruleId: "CVE-1", message: "m", severity: "critical", package: "p" },
          { scanner: "semgrep", ruleId: "s", message: "m", severity: "low" },
        ],
        scanners: [
          { name: "semgrep", version: "1", status: "ok", durationMs: 1 },
          { name: "gitleaks", version: "not installed", status: "skipped", durationMs: 0 },
        ],
      }),
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\bsrc\s*=/i);
    expect(html).not.toMatch(/\bhref\s*=/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i); // no inline event handlers
  });
});

describe("renderReportHtml — severity heatmap", () => {
  const heatmapReport = report({
    counts: { critical: 1, high: 3, medium: 0, low: 4, info: 0 },
    findings: [
      { scanner: "trufflehog", ruleId: "t/1", message: "m", severity: "critical" },
      { scanner: "trufflehog", ruleId: "t/2", message: "m", severity: "high" },
      { scanner: "semgrep", ruleId: "s/1", message: "m", severity: "high" },
      { scanner: "semgrep", ruleId: "s/2", message: "m", severity: "high" },
      { scanner: "hardcoded-ip", ruleId: "h/1", message: "m", severity: "low" },
      { scanner: "hardcoded-ip", ruleId: "h/2", message: "m", severity: "low" },
      { scanner: "hardcoded-ip", ruleId: "h/3", message: "m", severity: "low" },
      { scanner: "hardcoded-ip", ruleId: "h/4", message: "m", severity: "low" },
    ],
    scanners: [
      { name: "trufflehog", version: "3", status: "ok", durationMs: 1 },
      { name: "semgrep", version: "1", status: "ok", durationMs: 1 },
      { name: "hardcoded-ip", version: "builtin", status: "ok", durationMs: 1 },
    ],
  });

  test("renders a bar per severity with proportional widths", () => {
    const html = renderReportHtml(heatmapReport);
    expect(html).toContain("Severity Heatmap");
    // 4 low of 8 findings = 50%
    expect(html).toContain("width:50.00%");
    // 1 critical of 8 = 12.5%
    expect(html).toContain("width:12.50%");
  });

  test("zero-count severities render an empty bar, not a full one", () => {
    const html = renderReportHtml(heatmapReport);
    expect(html).toContain("width:0.00%");
  });

  test("a lone critical among many findings stays visible", () => {
    const findings = [
      { scanner: "trufflehog" as const, ruleId: "t/1", message: "m", severity: "critical" as const },
      ...Array.from({ length: 400 }, (_, i) => ({
        scanner: "hardcoded-ip" as const,
        ruleId: `h/${i}`,
        message: "m",
        severity: "low" as const,
      })),
    ];
    const html = renderReportHtml(
      report({ findings, counts: { critical: 1, high: 0, medium: 0, low: 400, info: 0 } }),
    );
    // 1/401 = 0.25%, floored to the 1.5% minimum so it renders.
    expect(html).toContain("width:1.50%");
  });

  test("matrix cross-tabulates scanner against severity", () => {
    const html = renderReportHtml(heatmapReport);
    const matrix = html.split('<table class="matrix">')[1]?.split("</table>")[0] ?? "";
    expect(matrix).toContain("trufflehog");
    expect(matrix).toContain("hardcoded-ip");
    expect(matrix).toMatch(/class="heat[^"]*"[^>]*>4</);
  });
});

describe("renderReportHtml — collapsible groups", () => {
  test("groups findings by scanner with a details element each", () => {
    const html = renderReportHtml(
      report({
        counts: { critical: 0, high: 1, medium: 0, low: 1, info: 0 },
        findings: [
          { scanner: "semgrep", ruleId: "s/1", message: "m", severity: "high" },
          { scanner: "hardcoded-ip", ruleId: "h/1", message: "m", severity: "low" },
        ],
      }),
    );
    expect((html.match(/<details class="group"/g) ?? [])).toHaveLength(2);
  });

  test("groups with high or critical findings open by default; quiet ones stay folded", () => {
    const html = renderReportHtml(
      report({
        counts: { critical: 0, high: 1, medium: 0, low: 1, info: 0 },
        findings: [
          { scanner: "semgrep", ruleId: "s/1", message: "m", severity: "high" },
          { scanner: "hardcoded-ip", ruleId: "h/1", message: "m", severity: "low" },
        ],
      }),
    );
    expect(html).toContain(`<details class="group" open>`);
    expect(html).toContain(`<details class="group">`);
  });

  test("works without JavaScript — no script element is emitted", () => {
    const html = renderReportHtml(report());
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("<details");
  });
});

describe("renderReportHtml — fix guide", () => {
  test("renders a Fix Guide column with per-finding remediation", () => {
    const html = renderReportHtml(
      report({
        findings: [
          {
            scanner: "gitleaks-replacement",
            ruleId: "gitleaks-replacement/aws-access-key-id",
            message: "AWS access key ID",
            severity: "high",
            fix: "Deactivate the key in IAM.",
          },
        ],
      }),
    );
    expect(html).toContain("Fix Guide");
    expect(html).toContain("Deactivate the key in IAM.");
  });

  test("derives guidance for findings that carry none", () => {
    const html = renderReportHtml(
      report({
        findings: [
          { scanner: "trivy", ruleId: "CVE-2021-23337", message: "prototype pollution", severity: "high", package: "lodash" },
        ],
      }),
    );
    expect(html).toContain("Upgrade lodash");
  });
});

describe("renderReportHtml — scanner detail", () => {
  test("lists version, status, rule count and configuration per scanner", () => {
    const html = renderReportHtml(
      report({
        scanners: [
          {
            name: "weak-crypto",
            version: "builtin",
            status: "ok",
            durationMs: 8,
            ruleCount: 13,
            detail: "42 files, rules: weak-hash-md5, ecb-mode",
          },
        ],
      }),
    );
    expect(html).toContain("Scanner Detail");
    expect(html).toContain("weak-crypto");
    expect(html).toContain("builtin");
    expect(html).toContain("13");
    expect(html).toContain("rules: weak-hash-md5, ecb-mode");
  });

  test("a skipped scanner shows no duration and a skipped badge", () => {
    const html = renderReportHtml(
      report({
        scanners: [{ name: "gitleaks", version: "not installed", status: "skipped", durationMs: 0 }],
      }),
    );
    expect(html).toContain("status-skipped");
    expect(html).toContain("not installed");
  });
});

describe("renderReportHtml — recommendations and footer", () => {
  test("recommends installing a skipped optional scanner", () => {
    const html = renderReportHtml(
      report({
        scanners: [{ name: "gitleaks", version: "not installed", status: "skipped", durationMs: 0 }],
      }),
    );
    expect(html).toContain("Recommendations");
    expect(html).toContain("Install");
  });

  test("flags a degraded scanner as an incomplete scan", () => {
    const html = renderReportHtml(
      report({
        degraded: ["trivy"],
        scanners: [{ name: "trivy", version: "0.70.0", status: "timeout", durationMs: 60000 }],
      }),
    );
    expect(html).toContain("incomplete");
  });

  test("footer carries version, file count and duration", () => {
    const html = renderReportHtml(
      report({ toolVersion: "0.3.0", filesScanned: 109, durationMs: 18400 }),
    );
    expect(html).toContain("aegis-security-agent v0.3.0");
    expect(html).toContain("109 files scanned");
    expect(html).toContain("18.4 s total");
  });

  test("sub-second scans report milliseconds", () => {
    const html = renderReportHtml(report({ durationMs: 420 }));
    expect(html).toContain("420 ms total");
  });
});

describe("renderReportHtml — dark mode", () => {
  test("defines themed CSS variables under prefers-color-scheme", () => {
    const html = renderReportHtml(report());
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain("--surface:");
    expect(html).toContain("var(--text)");
  });
});
