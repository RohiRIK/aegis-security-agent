import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as manager from "./provisioner/manager.ts";
import {
  SCANNER_BUDGETS,
  scannerRunner,
  runScannerWithTimeout,
  resolveScanner,
  wrapSemgrep,
  wrapTrivy,
  wrapTrufflehog,
  type ScannerResult,
} from "./scanner.ts";

const okResult: ScannerResult = {
  status: "ok",
  exitCode: 0,
  stdout: "",
  stderr: "",
  degraded: false,
  durationMs: 1,
};

async function processExists(pid: number): Promise<boolean> {
  const proc = Bun.spawn(["kill", "-0", String(pid)], {
    stdout: "ignore",
    stderr: "ignore",
  });

  return (await proc.exited) === 0;
}

describe("runScannerWithTimeout", () => {
  test("returns ok result when process completes within budget", async () => {
    const result = await runScannerWithTimeout(
      ["bash", "-c", "printf 'scanner-stdout'; printf 'scanner-stderr' >&2; exit 7"],
      1_000,
    );

    expect(result.status).toBe("ok");
    expect(result.stdout).toBe("scanner-stdout");
    expect(result.stderr).toBe("scanner-stderr");
    expect(result.exitCode).toBe(7);
    expect(result.degraded).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("degrades instead of throwing when the binary is missing", async () => {
    const result = await runScannerWithTimeout(["aegis-nonexistent-binary-xyz", "--version"], 1_000);

    expect(result.status).toBe("error");
    expect(result.degraded).toBe(true);
    expect(result.exitCode).toBe(-1);
  });

  test("returns timeout result when process exceeds budget", async () => {
    const result = await runScannerWithTimeout(["bash", "-c", "sleep 10"], 200);

    expect(result).toEqual({
      status: "timeout",
      exitCode: -1,
      stdout: "",
      stderr: "",
      degraded: true,
      durationMs: 200,
    });
  });

  test("kills the child process on timeout", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "scanner-timeout-"));
    const pidFile = join(tempDir, "scanner.pid");

    try {
      const startedAt = performance.now();
      const result = await runScannerWithTimeout(
        ["bash", "-c", `echo $$ > ${JSON.stringify(pidFile)}; exec sleep 10`],
        200,
      );
      const elapsedMs = performance.now() - startedAt;

      expect(result.status).toBe("timeout");
      expect(elapsedMs).toBeLessThan(2_000);

      const pidText = (await readFile(pidFile, "utf8")).trim();
      const pid = Number(pidText);

      expect(Number.isFinite(pid)).toBe(true);

      const deadline = Date.now() + 1_000;
      let alive = true;
      while (Date.now() < deadline) {
        alive = await processExists(pid);
        if (!alive) {
          break;
        }
        await Bun.sleep(25);
      }

      expect(alive).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("timeout result includes degraded marker", async () => {
    const result = await runScannerWithTimeout(["bash", "-c", "sleep 10"], 200);

    expect(result.degraded).toBe(true);
  });
});

describe("scanner wrappers", () => {
  let ensureSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    ensureSpy = spyOn(manager, "ensureLatest").mockResolvedValue(undefined);
  });

  afterEach(() => {
    ensureSpy.mockRestore();
  });

  test("wrapSemgrep uses 120000ms budget", async () => {
    const runnerSpy = spyOn(scannerRunner, "runScannerWithTimeout").mockResolvedValue(okResult);
    const versionSpy = spyOn(scannerRunner, "getScannerVersion").mockResolvedValue("1.0.0");
    const targetPath = `src/example-${crypto.randomUUID()}.py`;

    try {
      await wrapSemgrep(targetPath);

      expect(runnerSpy).toHaveBeenCalledWith(
        [await resolveScanner("semgrep"), "scan", "--config=p/security-audit", "--config=p/secrets", "--json", targetPath],
        SCANNER_BUDGETS.semgrep,
      );
    } finally {
      runnerSpy.mockRestore();
      versionSpy.mockRestore();
    }
  });

  test("wrapTrivy uses 60000ms budget", async () => {
    const runnerSpy = spyOn(scannerRunner, "runScannerWithTimeout").mockResolvedValue(okResult);
    const versionSpy = spyOn(scannerRunner, "getScannerVersion").mockResolvedValue("0.50.0");
    const targetPath = `/tmp/scan-dir-${crypto.randomUUID()}`;

    try {
      await wrapTrivy(["fs", "--format", "json", targetPath]);

      expect(runnerSpy).toHaveBeenCalledWith(
        [await resolveScanner("trivy"), "fs", "--format", "json", targetPath],
        SCANNER_BUDGETS.trivy,
      );
    } finally {
      runnerSpy.mockRestore();
      versionSpy.mockRestore();
    }
  });

  test("wrapTrufflehog never caches raw stdout (secrets scanner)", async () => {
    // Raw trufflehog output embeds plaintext secrets — it must never be
    // persisted to the on-disk scan cache, so every call re-runs the scanner
    // (no cache read/write path).
    const secretStdout = JSON.stringify({ DetectorName: "AWS", Verified: true, Raw: "AKIA-should-never-persist" });
    const runnerSpy = spyOn(scannerRunner, "runScannerWithTimeout").mockResolvedValue({
      ...okResult,
      stdout: secretStdout,
    });
    const versionSpy = spyOn(scannerRunner, "getScannerVersion").mockResolvedValue("3.0.0");
    const targetPath = `/tmp/scan-dir-${crypto.randomUUID()}`;

    try {
      const first = await wrapTrufflehog(targetPath);
      const second = await wrapTrufflehog(targetPath);

      // Runner invoked on both calls — proves no cache hit served the second.
      expect(runnerSpy).toHaveBeenCalledTimes(2);
      expect(first.stdout).toBe(secretStdout);
      expect(second.stdout).toBe(secretStdout);
      expect(runnerSpy).toHaveBeenCalledWith(
        [await resolveScanner("trufflehog"), "filesystem", "--json", targetPath],
        SCANNER_BUDGETS.trufflehog,
      );
    } finally {
      runnerSpy.mockRestore();
      versionSpy.mockRestore();
    }
  });
});

describe("resolveScanner", () => {
  test("returns provisioned path or bare name for known scanner", async () => {
    const result = await resolveScanner("trivy");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("returns bare scanner name as fallback for unknown scanner", async () => {
    const result = await resolveScanner("unknown-scanner-xyz");
    expect(result).toBe("unknown-scanner-xyz");
  });
});
