import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendVerdictEvent,
  formatVerdictEvent,
  readRecentVerdicts,
  type VerdictEvent,
} from "./verdict-log";

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
    expect(() => new Date(parsed.ts).toISOString()).not.toThrow();
    expect(parsed.verdict).toBe("BLOCKED");
    expect(parsed.degraded).toEqual(["trivy"]);
  });
});

describe("appendVerdictEvent", () => {
  test("creates directory and appends to new file", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "sub", "audit.log");

    try {
      await appendVerdictEvent(logPath, baseEvent);
      const content = await Bun.file(logPath).text();
      const parsed = JSON.parse(content.trim()) as VerdictEvent;
      expect(parsed.type).toBe("aegis_verdict");
      expect(parsed.verdict).toBe("SAFE");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("appends multiple events as NDJSON", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "audit.log");

    try {
      await appendVerdictEvent(logPath, baseEvent);
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "RISKY" });
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "BLOCKED" });

      const content = await Bun.file(logPath).text();
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(3);

      const verdicts = lines.map((l) => (JSON.parse(l) as VerdictEvent).verdict);
      expect(verdicts).toEqual(["SAFE", "RISKY", "BLOCKED"]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("readRecentVerdicts", () => {
  test("returns empty array when file does not exist", async () => {
    const result = await readRecentVerdicts("/tmp/nonexistent-verdict-log.log", 10);
    expect(result).toEqual([]);
  });

  test("reads last N verdicts", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "audit.log");

    try {
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "SAFE", commit: "aaa" });
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "RISKY", commit: "bbb" });
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "BLOCKED", commit: "ccc" });

      const last2 = await readRecentVerdicts(logPath, 2);
      expect(last2).toHaveLength(2);
      expect(last2[0]?.verdict).toBe("RISKY");
      expect(last2[1]?.verdict).toBe("BLOCKED");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("skips non-verdict lines in mixed log", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "audit.log");

    try {
      const mixedContent = [
        JSON.stringify({ type: "aegis_verdict", ts: "2026-01-01T00:00:00Z", ...baseEvent }),
        JSON.stringify({ type: "hitl_decision", id: "123", decision: "approve" }),
        JSON.stringify({ type: "aegis_verdict", ts: "2026-01-02T00:00:00Z", ...baseEvent, verdict: "RISKY" }),
        "invalid json line",
      ].join("\n") + "\n";

      await Bun.write(logPath, mixedContent);

      const verdicts = await readRecentVerdicts(logPath, 10);
      expect(verdicts).toHaveLength(2);
      expect(verdicts[0]?.verdict).toBe("SAFE");
      expect(verdicts[1]?.verdict).toBe("RISKY");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
