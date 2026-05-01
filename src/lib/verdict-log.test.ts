import { describe, expect, test } from "bun:test";

import { formatVerdictEvent, type VerdictEvent } from "./verdict-log";

const baseEvent: Omit<VerdictEvent, "type" | "ts"> = {
  task: "full-audit",
  verdict: "SAFE",
  findings: { critical: 0, high: 0, medium: 1, low: 2, info: 3 },
  degraded: [],
  commit: "abc1234",
  scope: "full repo",
};

describe("formatVerdictEvent", () => {
  test("returns valid NDJSON string with all required fields", () => {
    const line = formatVerdictEvent(baseEvent);
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line.trim()) as VerdictEvent;
    expect(parsed.type).toBe("aegis_verdict");
    expect(typeof parsed.ts).toBe("string");
    expect(parsed.task).toBe(baseEvent.task);
    expect(parsed.verdict).toBe(baseEvent.verdict);
    expect(parsed.findings).toEqual(baseEvent.findings);
    expect(parsed.degraded).toEqual(baseEvent.degraded);
    expect(parsed.commit).toBe(baseEvent.commit);
    expect(parsed.scope).toBe(baseEvent.scope);
  });

  test("includes type aegis_verdict, ISO timestamp, and all event fields", () => {
    const line = formatVerdictEvent({ ...baseEvent, verdict: "BLOCKED", degraded: ["trivy"] });
    const parsed = JSON.parse(line.trim()) as VerdictEvent;
    expect(parsed.type).toBe("aegis_verdict");
    // ISO 8601 check
    expect(() => new Date(parsed.ts).toISOString()).not.toThrow();
    expect(parsed.verdict).toBe("BLOCKED");
    expect(parsed.degraded).toEqual(["trivy"]);
  });
});
