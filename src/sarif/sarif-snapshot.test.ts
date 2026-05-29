import { describe, expect, test } from "bun:test";
import { eventsToSarif } from "./builder.ts";
import { MIXED_SEMGREP_TRIVY_SESSION, EMPTY_SESSION, LEGACY_EVENTS } from "./fixtures.ts";

describe("SARIF golden output", () => {
  test("mixed Semgrep + Trivy session", () => {
    const sarif = eventsToSarif(MIXED_SEMGREP_TRIVY_SESSION, "0.3.0");
    expect(sarif).toMatchSnapshot();
  });

  test("empty session — valid SARIF with no results", () => {
    const sarif = eventsToSarif(EMPTY_SESSION, "0.3.0");
    expect(sarif).toMatchSnapshot();
  });

  test("legacy events — gracefully skipped", () => {
    const sarif = eventsToSarif(LEGACY_EVENTS, "0.3.0");
    expect(sarif.runs[0]?.results).toHaveLength(0);
    expect(sarif).toMatchSnapshot();
  });

  test("SARIF structure validity", () => {
    const sarif = eventsToSarif(MIXED_SEMGREP_TRIVY_SESSION, "0.3.0");

    expect(sarif.$schema).toContain("sarif-schema-2.1.0");
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);

    const run = sarif.runs[0]!;
    expect(run.tool.driver.name).toBe("aegis-security-agent");
    expect(run.tool.driver.semanticVersion).toBe("0.3.0");

    expect(run.results).toHaveLength(3);
    expect(run.tool.driver.rules).toHaveLength(3);

    const ruleIds = run.tool.driver.rules.map((r) => r.id);
    expect(ruleIds).toContain("semgrep/jwt-hardcoded-secret");
    expect(ruleIds).toContain("semgrep/sql-injection");
    expect(ruleIds).toContain("CVE-2021-23337");
  });

  test("severity mapping in SARIF output", () => {
    const sarif = eventsToSarif(MIXED_SEMGREP_TRIVY_SESSION, "0.3.0");
    const results = sarif.runs[0]!.results;

    const trivyResult = results.find((r) => r.ruleId === "CVE-2021-23337");
    expect(trivyResult?.level).toBe("error");

    const semgrepResult = results.find((r) => r.ruleId === "semgrep/jwt-hardcoded-secret");
    expect(semgrepResult?.level).toBe("error");
  });

  test("invocation timestamps from session events", () => {
    const sarif = eventsToSarif(MIXED_SEMGREP_TRIVY_SESSION, "0.3.0");
    const invocations = sarif.runs[0]?.invocations;
    expect(invocations).toHaveLength(1);
    expect(invocations?.[0]?.executionSuccessful).toBe(true);
    expect(invocations?.[0]?.startTimeUtc).toBe("2026-01-01T00:00:00.000Z");
    expect(invocations?.[0]?.endTimeUtc).toBe("2026-01-01T00:00:00.000Z");
  });
});
