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

  test("escapes malicious finding content", () => {
    const html = renderReportHtml(
      report({
        findings: [{ scanner: "semgrep", ruleId: "r", message: "<script>alert(1)</script>", severity: "info" }],
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("shows degraded banner", () => {
    const html = renderReportHtml(report({ degraded: ["trivy"] }));
    expect(html).toContain("DEGRADED");
    expect(html).toContain("trivy");
  });

  test("empty findings renders no-findings row", () => {
    const html = renderReportHtml(report({ findings: [] }));
    expect(html).toContain("No findings.");
  });
});
