import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendVerdictEvent, formatVerdictEvent, readRecentVerdicts, type VerdictEvent } from "./verdict-log";

const baseEvent: Omit<VerdictEvent, "type" | "ts"> = {
  task: "full-audit",
  verdict: "SAFE",
  findings: { critical: 0, high: 0, medium: 1, low: 2, info: 3 },
  degraded: [],
  commit: "abc1234",
  scope: "full repo",
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "verdict-log-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

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

describe("appendVerdictEvent", () => {
  test("appends a newline-terminated JSON line to a file", async () => {
    const logPath = join(tmpDir, "audit.log");
    await appendVerdictEvent(logPath, baseEvent);
    const content = await Bun.file(logPath).text();
    expect(content.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(content.trim()) as VerdictEvent;
    expect(parsed.type).toBe("aegis_verdict");
    expect(parsed.task).toBe("full-audit");
  });

  test("creates parent directory if missing", async () => {
    const logPath = join(tmpDir, "nested", "deep", "audit.log");
    await appendVerdictEvent(logPath, baseEvent);
    const exists = await Bun.file(logPath).exists();
    expect(exists).toBe(true);
  });
});

describe("readRecentVerdicts", () => {
  test("reads last N verdict events from file", async () => {
    const logPath = join(tmpDir, "audit.log");
    for (let i = 0; i < 5; i++) {
      await appendVerdictEvent(logPath, { ...baseEvent, commit: `commit${i}` });
    }
    const results = await readRecentVerdicts(logPath, 3);
    expect(results).toHaveLength(3);
    expect(results[2]!.commit).toBe("commit4");
    expect(results[0]!.commit).toBe("commit2");
  });

  test("returns empty array for missing file", async () => {
    const logPath = join(tmpDir, "nonexistent.log");
    const results = await readRecentVerdicts(logPath);
    expect(results).toEqual([]);
  });

  test("returns empty array for empty file", async () => {
    const logPath = join(tmpDir, "empty.log");
    await Bun.write(logPath, "");
    const results = await readRecentVerdicts(logPath);
    expect(results).toEqual([]);
  });

  test("skips malformed lines", async () => {
    const logPath = join(tmpDir, "audit.log");
    const goodLine = formatVerdictEvent(baseEvent);
    await Bun.write(logPath, `not-json\n{broken\n${goodLine}`);
    const results = await readRecentVerdicts(logPath);
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe("aegis_verdict");
  });
});
