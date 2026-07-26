import { describe, expect, test } from "bun:test";
import {
  gitleaksArgv,
  gitleaksToNormalized,
  isScannerAvailable,
  njsscanArgv,
  njsscanToNormalized,
} from "./external-scanners.ts";

/** A plaintext value gitleaks would emit in `Secret`/`Match`; must never propagate. */
const LEAKED_VALUE = "AKIAQYLPMN5HGBQWERTY"; // aegis:ignore

const GITLEAKS_OUTPUT = JSON.stringify([
  {
    Description: "AWS Access Key",
    StartLine: 12,
    EndLine: 12,
    Match: `aws_key = "${LEAKED_VALUE}"`,
    Secret: LEAKED_VALUE,
    File: "src/config.ts",
    RuleID: "aws-access-token",
    Entropy: 3.8,
  },
  {
    Description: "Private Key",
    StartLine: 1,
    File: "certs/server.pem",
    Secret: "-----BEGIN RSA PRIVATE KEY-----",
    RuleID: "private-key",
  },
]);

describe("gitleaksToNormalized", () => {
  test("maps results to normalized findings", () => {
    const findings = gitleaksToNormalized(GITLEAKS_OUTPUT);
    expect(findings).toHaveLength(2);
    expect(findings[0]?.scanner).toBe("gitleaks");
    expect(findings[0]?.ruleId).toBe("gitleaks/aws-access-token");
    expect(findings[0]?.location).toEqual({ file: "src/config.ts", startLine: 12 });
    expect(findings[0]?.fix).toContain("git filter-repo");
  });

  test("never copies the Secret or Match field", () => {
    const serialized = JSON.stringify(gitleaksToNormalized(GITLEAKS_OUTPUT));
    expect(serialized).not.toContain(LEAKED_VALUE);
    expect(serialized).not.toContain("BEGIN RSA PRIVATE KEY");
  });

  test("grades high-value rule ids as critical", () => {
    const findings = gitleaksToNormalized(GITLEAKS_OUTPUT);
    expect(findings.find((f) => f.ruleId === "gitleaks/private-key")?.severity).toBe("critical");
    expect(findings.find((f) => f.ruleId === "gitleaks/aws-access-token")?.severity).toBe("high");
  });

  test("fingerprints are unique per location", () => {
    const findings = gitleaksToNormalized(GITLEAKS_OUTPUT);
    expect(new Set(findings.map((f) => f.fingerprint)).size).toBe(findings.length);
  });

  test.each(["", "not json", "{}", "null", '"a string"'])(
    "returns [] for unusable output %p",
    (input) => {
      expect(gitleaksToNormalized(input)).toEqual([]);
    },
  );

  test("tolerates missing fields", () => {
    const findings = gitleaksToNormalized(JSON.stringify([{}, null, 5]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("gitleaks/unknown");
    expect(findings[0]?.location).toBeUndefined();
  });
});

const NJSSCAN_OUTPUT = JSON.stringify({
  nodejs: {
    node_username: {
      files: [
        { file_path: "/repo/src/db.js", match_lines: [22, 22], match_position: [3, 40] },
        { file_path: "/repo/src/api.js", match_lines: [7, 7] },
      ],
      metadata: {
        cwe: "CWE-798: Use of Hard-coded Credentials",
        description: "A hardcoded username in the source",
        owasp: "A2: Broken Authentication",
        severity: "ERROR",
      },
    },
    express_xss: {
      files: [{ file_path: "/repo/src/render.js", match_lines: [14, 15] }],
      metadata: { description: "Unescaped output", severity: "WARNING" },
    },
  },
  templates: {
    pug_escape: {
      files: [{ file_path: "/repo/views/a.pug", match_lines: [3, 3] }],
      metadata: { description: "Unescaped interpolation", severity: "INFO" },
    },
  },
  errors: [],
});

describe("njsscanToNormalized", () => {
  test("flattens rules across files and sections", () => {
    const findings = njsscanToNormalized(NJSSCAN_OUTPUT);
    expect(findings).toHaveLength(4);
    expect(findings.map((f) => f.ruleId)).toContain("njsscan/node_username");
    expect(findings.map((f) => f.ruleId)).toContain("njsscan/pug_escape");
  });

  test("maps njsscan severities onto the Aegis scale", () => {
    const findings = njsscanToNormalized(NJSSCAN_OUTPUT);
    expect(findings.find((f) => f.ruleId === "njsscan/node_username")?.severity).toBe("high");
    expect(findings.find((f) => f.ruleId === "njsscan/express_xss")?.severity).toBe("medium");
    expect(findings.find((f) => f.ruleId === "njsscan/pug_escape")?.severity).toBe("low");
  });

  test("uses the first match line as the location", () => {
    const finding = njsscanToNormalized(NJSSCAN_OUTPUT).find((f) => f.location?.file === "/repo/src/db.js");
    expect(finding?.location?.startLine).toBe(22);
  });

  test("surfaces CWE/OWASP context in the fix guidance", () => {
    const finding = njsscanToNormalized(NJSSCAN_OUTPUT).find((f) => f.ruleId === "njsscan/node_username");
    expect(finding?.fix).toContain("CWE-798");
    expect(finding?.fix).toContain("A2");
  });

  test.each(["", "not json", "[]", "null"])("returns [] for unusable output %p", (input) => {
    expect(njsscanToNormalized(input)).toEqual([]);
  });

  test("a rule with no files produces no findings", () => {
    const output = JSON.stringify({ nodejs: { r: { metadata: { severity: "ERROR" } } } });
    expect(njsscanToNormalized(output)).toEqual([]);
  });
});

describe("argv builders", () => {
  test("gitleaks scans a directory and does not fail the process on findings", () => {
    const argv = gitleaksArgv("/tmp/repo");
    expect(argv[0]).toBe("gitleaks");
    expect(argv).toContain("/tmp/repo");
    expect(argv).toContain("json");
    expect(argv.join(" ")).toContain("--exit-code 0");
  });

  test("njsscan emits JSON", () => {
    expect(njsscanArgv("/tmp/repo")).toEqual(["njsscan", "--json", "/tmp/repo"]);
  });
});

describe("isScannerAvailable", () => {
  test("reports false for a binary that cannot exist", async () => {
    expect(await isScannerAvailable("aegis-nonexistent-binary-xyz")).toBe(false);
  });

  test("reports true for a binary that always exists", async () => {
    expect(await isScannerAvailable("sh")).toBe(true);
  });
});
