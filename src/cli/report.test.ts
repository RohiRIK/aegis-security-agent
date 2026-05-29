import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReportFlags, runReport } from "./report.ts";
import { createEvent } from "../events/types.ts";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "aegis-report-test-"));
}

function stableEvent(
  kind: Parameters<typeof createEvent>[0],
  severity: Parameters<typeof createEvent>[1],
  subject: string,
  message: string,
  overrides?: Partial<ReturnType<typeof createEvent>>,
) {
  const event = createEvent(kind, severity, subject, message, overrides);
  event.id = "00000000-0000-0000-0000-000000000000";
  event.ts = "2026-01-01T00:00:00.000Z";
  return event;
}

describe("parseReportFlags", () => {
  test("parses --format sarif", () => {
    const flags = parseReportFlags(["--format", "sarif"]);
    expect(flags.format).toBe("sarif");
  });

  test("parses --output path", () => {
    const flags = parseReportFlags(["--format", "sarif", "--output", "/tmp/report.sarif"]);
    expect(flags.output).toBe("/tmp/report.sarif");
  });

  test("parses -o shorthand", () => {
    const flags = parseReportFlags(["--format", "sarif", "-o", "/tmp/report.sarif"]);
    expect(flags.output).toBe("/tmp/report.sarif");
  });

  test("parses --input path", () => {
    const flags = parseReportFlags(["--format", "sarif", "--input", "/tmp/audit.jsonl"]);
    expect(flags.input).toBe("/tmp/audit.jsonl");
  });

  test("parses -i shorthand", () => {
    const flags = parseReportFlags(["-i", "/tmp/audit.jsonl"]);
    expect(flags.input).toBe("/tmp/audit.jsonl");
  });

  test("defaults format to sarif when no args given", () => {
    const flags = parseReportFlags([]);
    expect(flags.format).toBe("sarif");
  });
});

describe("runReport", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("reads audit.jsonl and outputs valid SARIF JSON", async () => {
    const aegisDir = join(tmpDir, ".aegis");
    mkdirSync(aegisDir, { recursive: true });
    const event = stableEvent("scanner.finding", "high", "src/auth.ts", "Semgrep: 1 finding", {
      source: "plugin",
      outcome: "warn",
      evidence: {
        scanner: "semgrep",
        findings: [
          { scanner: "semgrep", ruleId: "semgrep/test-rule", message: "Test", severity: "high", location: { file: "src/auth.ts", startLine: 10 }, fingerprint: "abc123" },
        ],
      },
    });
    await Bun.write(join(aegisDir, "audit.jsonl"), JSON.stringify(event) + "\n");

    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      const code = await runReport({ format: "sarif", input: join(aegisDir, "audit.jsonl") });
      expect(code).toBe(0);
      const output = chunks.join("");
      const sarif = JSON.parse(output);
      expect(sarif.version).toBe("2.1.0");
      expect(sarif.runs[0].results).toHaveLength(1);
      expect(sarif.runs[0].results[0].ruleId).toBe("semgrep/test-rule");
    } finally {
      process.stdout.write = origWrite;
    }
  });

  test("writes to file when --output specified", async () => {
    const aegisDir = join(tmpDir, ".aegis");
    mkdirSync(aegisDir, { recursive: true });
    await Bun.write(join(aegisDir, "audit.jsonl"), "");

    const outPath = join(tmpDir, "report.sarif");
    const code = await runReport({ format: "sarif", input: join(aegisDir, "audit.jsonl"), output: outPath });
    expect(code).toBe(0);

    const content = await Bun.file(outPath).text();
    const sarif = JSON.parse(content);
    expect(sarif.version).toBe("2.1.0");
  });

  test("returns 0 with empty SARIF when audit log is empty", async () => {
    const aegisDir = join(tmpDir, ".aegis");
    mkdirSync(aegisDir, { recursive: true });
    await Bun.write(join(aegisDir, "audit.jsonl"), "");

    const outPath = join(tmpDir, "report.sarif");
    const code = await runReport({ format: "sarif", input: join(aegisDir, "audit.jsonl"), output: outPath });
    expect(code).toBe(0);

    const sarif = JSON.parse(await Bun.file(outPath).text());
    expect(sarif.runs[0].results).toEqual([]);
  });

  test("returns 0 with empty SARIF when audit log does not exist", async () => {
    const outPath = join(tmpDir, "report.sarif");
    const code = await runReport({
      format: "sarif",
      input: join(tmpDir, "nonexistent", "audit.jsonl"),
      output: outPath,
    });
    expect(code).toBe(0);

    const sarif = JSON.parse(await Bun.file(outPath).text());
    expect(sarif.runs[0].results).toEqual([]);
  });

  test("skips unparseable NDJSON lines", async () => {
    const aegisDir = join(tmpDir, ".aegis");
    mkdirSync(aegisDir, { recursive: true });
    const event = stableEvent("session.start", "info", "test", "Started", { source: "plugin", outcome: "allow" });
    await Bun.write(
      join(aegisDir, "audit.jsonl"),
      `not-json\n${JSON.stringify(event)}\nalso-bad\n`,
    );

    const outPath = join(tmpDir, "report.sarif");
    const code = await runReport({ format: "sarif", input: join(aegisDir, "audit.jsonl"), output: outPath });
    expect(code).toBe(0);

    const sarif = JSON.parse(await Bun.file(outPath).text());
    expect(sarif.runs[0].invocations?.[0]?.startTimeUtc).toBeDefined();
  });
});
