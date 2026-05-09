import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { createEvent, type AegisEvent } from "./types.ts";
import { emitEvent } from "./emitter.ts";

describe("createEvent", () => {
  test("produces a valid AegisEvent with required fields", () => {
    const event = createEvent("policy.match", "high", "Bash", "High-risk pattern detected");
    expect(event.schema).toBe("aegis/v1");
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.source).toBe("plugin");
    expect(event.kind).toBe("policy.match");
    expect(event.severity).toBe("high");
    expect(event.subject).toBe("Bash");
    expect(event.outcome).toBe("warn");
    expect(event.message).toBe("High-risk pattern detected");
  });

  test("allows overriding default fields", () => {
    const event = createEvent("scanner.finding", "medium", "test.ts", "Semgrep finding", {
      source: "hook",
      outcome: "allow",
      evidence: { rule: "xss-check" },
    });
    expect(event.source).toBe("hook");
    expect(event.outcome).toBe("allow");
    expect(event.evidence).toEqual({ rule: "xss-check" });
  });

  test("generates unique IDs per invocation", () => {
    const a = createEvent("session.start", "info", "session", "start");
    const b = createEvent("session.start", "info", "session", "start");
    expect(a.id).not.toBe(b.id);
  });
});

describe("emitEvent", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("writes NDJSON to the specified log path", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aegis-emit-"));
    const logPath = join(tempDir, ".aegis", "audit.jsonl");

    const event = createEvent("policy.match", "high", "Bash", "test event", { source: "hook" });
    await emitEvent(event, logPath);

    const content = await Bun.file(logPath).text();
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!) as AegisEvent;
    expect(parsed.schema).toBe("aegis/v1");
    expect(parsed.kind).toBe("policy.match");
    expect(parsed.source).toBe("hook");
  });

  test("appends multiple events as separate lines", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aegis-emit-"));
    const logPath = join(tempDir, ".aegis", "audit.jsonl");

    await emitEvent(createEvent("policy.match", "high", "cmd1", "first"), logPath);
    await emitEvent(createEvent("scanner.finding", "medium", "file.ts", "second"), logPath);

    const content = await Bun.file(logPath).text();
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!) as AegisEvent;
    const second = JSON.parse(lines[1]!) as AegisEvent;
    expect(first.kind).toBe("policy.match");
    expect(second.kind).toBe("scanner.finding");
  });
});
