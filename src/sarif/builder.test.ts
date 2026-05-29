import { describe, expect, test } from "bun:test";
import { eventsToSarif } from "./builder.ts";
import { createEvent, type AegisEvent } from "../events/types.ts";

function stableEvent(
  kind: Parameters<typeof createEvent>[0],
  severity: Parameters<typeof createEvent>[1],
  subject: string,
  message: string,
  overrides?: Partial<AegisEvent>,
): AegisEvent {
  const event = createEvent(kind, severity, subject, message, overrides);
  event.id = "00000000-0000-0000-0000-000000000000";
  event.ts = "2026-01-01T00:00:00.000Z";
  return event;
}

const semgrepEvent = stableEvent(
  "scanner.finding",
  "high",
  "src/auth.ts",
  "Semgrep: 2 finding(s)",
  {
    source: "plugin",
    outcome: "warn",
    evidence: {
      scanner: "semgrep",
      file: "src/auth.ts",
      count: 2,
      findings: [
        {
          scanner: "semgrep",
          ruleId: "semgrep/jwt-hardcoded-secret",
          message: "Hardcoded JWT secret",
          severity: "high",
          location: { file: "src/auth.ts", startLine: 42 },
          fingerprint: "abc123def456",
        },
        {
          scanner: "semgrep",
          ruleId: "semgrep/sql-injection",
          message: "SQL injection via string concat",
          severity: "high",
          location: { file: "src/auth.ts", startLine: 87, endLine: 90 },
          fingerprint: "def456abc123",
        },
      ],
    },
  },
);

const trivyEvent = stableEvent(
  "scanner.finding",
  "high",
  "bun add lodash@4.17.20",
  "Trivy: 1 CVE(s)",
  {
    source: "plugin",
    outcome: "warn",
    evidence: {
      scanner: "trivy",
      findings: [
        {
          scanner: "trivy",
          ruleId: "CVE-2021-23337",
          message: "Lodash command injection",
          severity: "critical",
          package: "lodash",
          fingerprint: "ghi789jkl012",
        },
      ],
    },
  },
);

const sessionStart = stableEvent("session.start", "info", "/projects/myapp", "Session started", {
  source: "plugin",
  outcome: "allow",
});

const sessionEnd = stableEvent("session.end", "info", "/projects/myapp", "Session ended", {
  source: "plugin",
  outcome: "allow",
});

const policyEvent = stableEvent("policy.match", "high", "rm -rf /", "High-risk pattern", {
  source: "hook",
  outcome: "warn",
});

const legacyEvent = stableEvent("scanner.finding", "medium", "src/app.ts", "Semgrep: 3 finding(s)", {
  source: "plugin",
  outcome: "warn",
  evidence: { scanner: "semgrep", file: "src/app.ts", count: 3 },
});

const emptyFindingsEvent = stableEvent("scanner.finding", "medium", "src/clean.ts", "Semgrep: 0 finding(s)", {
  source: "plugin",
  outcome: "warn",
  evidence: { scanner: "semgrep", file: "src/clean.ts", count: 0, findings: [] },
});

describe("eventsToSarif", () => {
  test("returns valid SarifLog structure for empty events", () => {
    const sarif = eventsToSarif([], "0.3.0");
    expect(sarif.$schema).toContain("sarif-schema-2.1.0");
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0]?.results).toEqual([]);
    expect(sarif.runs[0]?.tool.driver.rules).toEqual([]);
  });

  test("maps scanner.finding events with findings[] to SARIF results", () => {
    const sarif = eventsToSarif([semgrepEvent], "0.3.0");
    expect(sarif.runs[0]?.results).toHaveLength(2);
    expect(sarif.runs[0]?.results[0]?.ruleId).toBe("semgrep/jwt-hardcoded-secret");
    expect(sarif.runs[0]?.results[0]?.message.text).toBe("Hardcoded JWT secret");
  });

  test("extracts unique rules from findings", () => {
    const sarif = eventsToSarif([semgrepEvent, trivyEvent], "0.3.0");
    const rules = sarif.runs[0]?.tool.driver.rules ?? [];
    expect(rules).toHaveLength(3);
    const ruleIds = rules.map((r) => r.id);
    expect(ruleIds).toContain("semgrep/jwt-hardcoded-secret");
    expect(ruleIds).toContain("semgrep/sql-injection");
    expect(ruleIds).toContain("CVE-2021-23337");
  });

  test("maps severity correctly", () => {
    const sarif = eventsToSarif([semgrepEvent, trivyEvent], "0.3.0");
    const results = sarif.runs[0]?.results ?? [];
    const highResult = results.find((r) => r.ruleId === "semgrep/jwt-hardcoded-secret");
    expect(highResult?.level).toBe("error");
    const criticalResult = results.find((r) => r.ruleId === "CVE-2021-23337");
    expect(criticalResult?.level).toBe("error");
  });

  test("includes location when present", () => {
    const sarif = eventsToSarif([semgrepEvent], "0.3.0");
    const result = sarif.runs[0]?.results[0];
    expect(result?.locations).toHaveLength(1);
    expect(result?.locations?.[0]?.physicalLocation.artifactLocation.uri).toBe("src/auth.ts");
    expect(result?.locations?.[0]?.physicalLocation.region?.startLine).toBe(42);
  });

  test("includes endLine when present", () => {
    const sarif = eventsToSarif([semgrepEvent], "0.3.0");
    const result = sarif.runs[0]?.results[1];
    expect(result?.locations?.[0]?.physicalLocation.region?.endLine).toBe(90);
  });

  test("includes fingerprint when present", () => {
    const sarif = eventsToSarif([semgrepEvent], "0.3.0");
    const result = sarif.runs[0]?.results[0];
    expect(result?.fingerprints?.["aegis/v1"]).toBe("abc123def456");
  });

  test("sets tool.driver.name and semanticVersion", () => {
    const sarif = eventsToSarif([], "0.3.0");
    expect(sarif.runs[0]?.tool.driver.name).toBe("aegis-security-agent");
    expect(sarif.runs[0]?.tool.driver.semanticVersion).toBe("0.3.0");
  });

  test("skips events without evidence.findings (legacy format)", () => {
    const sarif = eventsToSarif([legacyEvent], "0.3.0");
    expect(sarif.runs[0]?.results).toHaveLength(0);
  });

  test("skips non-scanner.finding events", () => {
    const sarif = eventsToSarif([policyEvent, sessionStart], "0.3.0");
    expect(sarif.runs[0]?.results).toHaveLength(0);
  });

  test("handles events with empty findings array", () => {
    const sarif = eventsToSarif([emptyFindingsEvent], "0.3.0");
    expect(sarif.runs[0]?.results).toHaveLength(0);
  });

  test("builds invocation from session.start/session.end events", () => {
    const sarif = eventsToSarif([sessionStart, semgrepEvent, sessionEnd], "0.3.0");
    expect(sarif.runs[0]?.invocations).toHaveLength(1);
    expect(sarif.runs[0]?.invocations?.[0]?.executionSuccessful).toBe(true);
    expect(sarif.runs[0]?.invocations?.[0]?.startTimeUtc).toBe("2026-01-01T00:00:00.000Z");
    expect(sarif.runs[0]?.invocations?.[0]?.endTimeUtc).toBe("2026-01-01T00:00:00.000Z");
  });

  test("omits invocations when no session events present", () => {
    const sarif = eventsToSarif([semgrepEvent], "0.3.0");
    expect(sarif.runs[0]?.invocations).toBeUndefined();
  });

  test("output JSON is valid (round-trip parse)", () => {
    const sarif = eventsToSarif([semgrepEvent, trivyEvent], "0.3.0");
    const json = JSON.stringify(sarif);
    const parsed = JSON.parse(json);
    expect(parsed.$schema).toContain("sarif-schema-2.1.0");
    expect(parsed.version).toBe("2.1.0");
  });

  test("includes package in properties for trivy findings", () => {
    const sarif = eventsToSarif([trivyEvent], "0.3.0");
    const result = sarif.runs[0]?.results[0];
    expect(result?.properties?.package).toBe("lodash");
  });
});
