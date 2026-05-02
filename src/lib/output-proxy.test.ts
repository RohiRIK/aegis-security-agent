import { describe, expect, test } from "bun:test";
import { proxyResult } from "./output-proxy.ts";

describe("proxyResult — semgrep", () => {
  test("returns lean summary under 200 chars", () => {
    const findings = [
      { rule: "rule1", severity: "ERROR", message: "msg", line: 1 },
      { rule: "rule2", severity: "WARNING", message: "msg2", line: 5 },
    ];
    const { summary } = proxyResult("semgrep", findings, { filename: "auth.ts" });
    expect(summary.length).toBeLessThanOrEqual(200);
    expect(summary).toContain("[AEGIS] Semgrep:");
    expect(summary).toContain("2 finding(s)");
    expect(summary).toContain("auth.ts");
    expect(summary).toContain("ERROR");
    expect(summary).toContain("Details: .aegis/scans/");
  });

  test("deduplicates severities", () => {
    const findings = [
      { rule: "r1", severity: "ERROR", message: "m", line: 1 },
      { rule: "r2", severity: "ERROR", message: "m", line: 2 },
    ];
    const { summary } = proxyResult("semgrep", findings, { filename: "foo.ts" });
    const errorCount = (summary.match(/ERROR/g) ?? []).length;
    expect(errorCount).toBe(1);
  });

  test("returns detailPath pointing to .aegis/scans/", () => {
    const { detailPath } = proxyResult("semgrep", [], { filename: "x.ts" });
    expect(detailPath).toMatch(/^\.aegis\/scans\/.+\.json$/);
  });
});

describe("proxyResult — trivy", () => {
  test("returns lean summary with CVE count", () => {
    const trivyOutput = {
      Results: [
        { Vulnerabilities: [{}, {}] },
        { Vulnerabilities: [{}] },
      ],
    };
    const { summary } = proxyResult("trivy", trivyOutput, { packageName: "lodash" });
    expect(summary).toContain("[AEGIS] Trivy:");
    expect(summary).toContain("3 CVE(s)");
    expect(summary).toContain("lodash");
    expect(summary).toContain("Details: .aegis/scans/");
    expect(summary.length).toBeLessThanOrEqual(200);
  });

  test("handles empty Results gracefully", () => {
    const { summary } = proxyResult("trivy", {}, { packageName: "pkg" });
    expect(summary).toContain("0 CVE(s)");
  });
});

describe("proxyResult — generic", () => {
  test("returns generic summary for unknown tool", () => {
    const { summary } = proxyResult("trufflehog", { secrets: [] });
    expect(summary).toContain("[AEGIS] trufflehog: result saved.");
    expect(summary).toContain("Details: .aegis/scans/");
  });
});

describe("proxyResult — determinism", () => {
  test("same input produces same hash (same detailPath)", () => {
    const data = [{ rule: "r", severity: "ERROR", message: "m", line: 1 }];
    const { detailPath: p1 } = proxyResult("semgrep", data);
    const { detailPath: p2 } = proxyResult("semgrep", data);
    expect(p1).toBe(p2);
  });
});
