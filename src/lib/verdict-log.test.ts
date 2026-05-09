import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendVerdictEvent,
  createVerdictEvent,
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

describe("createVerdictEvent", () => {
  test("returns a valid AegisEvent object", () => {
    const event = createVerdictEvent(baseEvent);
    expect(event.schema).toBe("aegis/v1");
    expect(event.kind).toBe("scanner.summary");
    expect(event.source).toBe("agent");
    expect(typeof event.id).toBe("string");
    expect(typeof event.ts).toBe("string");
    expect((event.evidence as Record<string, unknown>).verdict).toBe("SAFE");
  });

  test("maps severity and outcome for each verdict level", () => {
    const blocked = createVerdictEvent({ ...baseEvent, verdict: "BLOCKED" });
    expect(blocked.severity).toBe("critical");
    expect(blocked.outcome).toBe("block");

    const risky = createVerdictEvent({ ...baseEvent, verdict: "RISKY" });
    expect(risky.severity).toBe("high");
    expect(risky.outcome).toBe("warn");

    const safe = createVerdictEvent(baseEvent);
    expect(safe.severity).toBe("info");
    expect(safe.outcome).toBe("allow");
  });
});

describe("formatVerdictEvent", () => {
  test("returns valid NDJSON string in AegisEvent format", () => {
    const line = formatVerdictEvent(baseEvent);
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line.trim()) as Record<string, unknown>;
    expect(parsed.schema).toBe("aegis/v1");
    expect(parsed.kind).toBe("scanner.summary");
    expect(parsed.source).toBe("agent");
    expect(typeof parsed.ts).toBe("string");
    expect(typeof parsed.id).toBe("string");
    const evidence = parsed.evidence as Record<string, unknown>;
    expect(evidence.verdict).toBe("SAFE");
    expect(evidence.task).toBe("full-audit");
    expect(evidence.findings).toEqual(baseEvent.findings);
    expect(evidence.commit).toBe("abc1234");
    expect(evidence.scope).toBe("full repo");
  });

  test("maps verdict severity correctly: BLOCKED → critical, RISKY → high, SAFE → info", () => {
    const blocked = JSON.parse(formatVerdictEvent({ ...baseEvent, verdict: "BLOCKED" }).trim());
    expect(blocked.severity).toBe("critical");
    expect(blocked.outcome).toBe("block");

    const risky = JSON.parse(formatVerdictEvent({ ...baseEvent, verdict: "RISKY" }).trim());
    expect(risky.severity).toBe("high");
    expect(risky.outcome).toBe("warn");

    const safe = JSON.parse(formatVerdictEvent(baseEvent).trim());
    expect(safe.severity).toBe("info");
    expect(safe.outcome).toBe("allow");
  });

  test("sets degraded flag when degraded scanners present", () => {
    const line = formatVerdictEvent({ ...baseEvent, degraded: ["trivy"] });
    const parsed = JSON.parse(line.trim());
    expect(parsed.degraded).toBe(true);
  });
});

describe("appendVerdictEvent", () => {
  test("creates directory and appends to new file", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "sub", "audit.jsonl");

    try {
      await appendVerdictEvent(logPath, baseEvent);
      const content = await Bun.file(logPath).text();
      const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
      expect(parsed.schema).toBe("aegis/v1");
      expect(parsed.kind).toBe("scanner.summary");
      const evidence = parsed.evidence as Record<string, unknown>;
      expect(evidence.verdict).toBe("SAFE");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("appends multiple events as NDJSON", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "audit.jsonl");

    try {
      await appendVerdictEvent(logPath, baseEvent);
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "RISKY" });
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "BLOCKED" });

      const content = await Bun.file(logPath).text();
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(3);

      const verdicts = lines.map((l) => {
        const parsed = JSON.parse(l) as Record<string, unknown>;
        const evidence = parsed.evidence as Record<string, unknown>;
        return evidence.verdict;
      });
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

  test("reads last N verdicts from new format", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "audit.jsonl");

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

  test("reads legacy format (type: aegis_verdict)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "audit.jsonl");

    try {
      const legacyLine = JSON.stringify({
        type: "aegis_verdict",
        ts: "2026-01-01T00:00:00Z",
        task: "full-audit",
        verdict: "RISKY",
        findings: { critical: 1, high: 2, medium: 0, low: 0, info: 0 },
        degraded: ["trivy"],
        commit: "legacy123",
        scope: "src/",
      }) + "\n";
      await Bun.write(logPath, legacyLine);

      const verdicts = await readRecentVerdicts(logPath, 10);
      expect(verdicts).toHaveLength(1);
      expect(verdicts[0]?.verdict).toBe("RISKY");
      expect(verdicts[0]?.commit).toBe("legacy123");
      expect(verdicts[0]?.degraded).toEqual(["trivy"]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("reads mixed format log (legacy + new)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "audit.jsonl");

    try {
      const legacyLine = JSON.stringify({
        type: "aegis_verdict",
        ts: "2026-01-01T00:00:00Z",
        task: "pre-merge",
        verdict: "SAFE",
        findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        degraded: [],
        commit: "old-commit",
        scope: "full repo",
      });
      const nonVerdictLine = JSON.stringify({
        schema: "aegis/v1",
        id: "evt-001",
        ts: "2026-01-01T12:00:00Z",
        source: "hook",
        kind: "policy.match",
        severity: "high",
        subject: "rm -rf /",
        outcome: "warn",
        message: "High-risk pattern",
      });

      await Bun.write(logPath, legacyLine + "\n" + nonVerdictLine + "\n");
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "BLOCKED", commit: "new-commit" });

      const verdicts = await readRecentVerdicts(logPath, 10);
      expect(verdicts).toHaveLength(2);
      expect(verdicts[0]?.verdict).toBe("SAFE");
      expect(verdicts[0]?.commit).toBe("old-commit");
      expect(verdicts[1]?.verdict).toBe("BLOCKED");
      expect(verdicts[1]?.commit).toBe("new-commit");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("skips non-verdict lines and invalid JSON", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "verdict-"));
    const logPath = join(tmpDir, "audit.jsonl");

    try {
      const mixedContent = [
        JSON.stringify({ type: "aegis_verdict", ts: "2026-01-01T00:00:00Z", ...baseEvent }),
        JSON.stringify({ type: "hitl_decision", id: "123", decision: "approve" }),
        JSON.stringify({ schema: "aegis/v1", kind: "policy.match", severity: "low", subject: "ls", outcome: "allow", message: "ok" }),
        "invalid json line",
      ].join("\n") + "\n";

      await Bun.write(logPath, mixedContent);
      await appendVerdictEvent(logPath, { ...baseEvent, verdict: "RISKY" });

      const verdicts = await readRecentVerdicts(logPath, 10);
      expect(verdicts).toHaveLength(2);
      expect(verdicts[0]?.verdict).toBe("SAFE");
      expect(verdicts[1]?.verdict).toBe("RISKY");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
