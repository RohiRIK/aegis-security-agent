import { describe, expect, test } from "bun:test";
import {
  parseSemgrepFindings,
  semgrepToNormalized,
  trufflehogToNormalized,
} from "./security.ts";

describe("trufflehogToNormalized", () => {
  test("verified secret → critical, no raw value leaked", () => {
    const line = JSON.stringify({
      DetectorName: "AWS",
      Verified: true,
      Raw: "AKIAEXAMPLE-should-not-appear",
      SourceMetadata: { Data: { Filesystem: { file: "src/config.ts", line: 12 } } },
    });
    const [f] = trufflehogToNormalized(line);
    expect(f?.severity).toBe("critical");
    expect(f?.ruleId).toBe("trufflehog/AWS");
    expect(f?.location).toEqual({ file: "src/config.ts", startLine: 12 });
    expect(JSON.stringify(f)).not.toContain("AKIAEXAMPLE");
  });

  test("unverified → high", () => {
    const line = JSON.stringify({ DetectorName: "Generic", Verified: false });
    const [f] = trufflehogToNormalized(line);
    expect(f?.severity).toBe("high");
  });

  test("ignores blank lines and non-JSON", () => {
    const out = "\ngarbage\n" + JSON.stringify({ DetectorName: "Stripe", Verified: true }) + "\n";
    expect(trufflehogToNormalized(out)).toHaveLength(1);
  });

  test("skips objects without a detector", () => {
    expect(trufflehogToNormalized(JSON.stringify({ Verified: true }))).toHaveLength(0);
  });
});

describe("semgrepToNormalized per-file path", () => {
  test("uses result.path from a directory scan", () => {
    const stdout = JSON.stringify({
      results: [
        { check_id: "rule.a", path: "a/one.ts", extra: { severity: "ERROR", message: "x" }, start: { line: 3 } },
        { check_id: "rule.b", path: "b/two.ts", extra: { severity: "ERROR", message: "y" }, start: { line: 7 } },
      ],
    });
    const findings = semgrepToNormalized(parseSemgrepFindings(stdout), "/scan/root");
    expect(findings.map((f) => f.location?.file)).toEqual(["a/one.ts", "b/two.ts"]);
  });

  test("falls back to filePath when result.path absent", () => {
    const stdout = JSON.stringify({
      results: [{ check_id: "r", extra: { severity: "ERROR", message: "x" }, start: { line: 1 } }],
    });
    const [f] = semgrepToNormalized(parseSemgrepFindings(stdout), "single.ts");
    expect(f?.location?.file).toBe("single.ts");
  });
});
