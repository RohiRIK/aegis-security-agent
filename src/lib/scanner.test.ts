import { describe, expect, spyOn, test } from "bun:test";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SCANNER_BUDGETS,
  scannerRunner,
  runScannerWithTimeout,
  wrapSemgrep,
  wrapTrivy,
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
  test("wrapSemgrep uses 120000ms budget", async () => {
    const runnerSpy = spyOn(scannerRunner, "runScannerWithTimeout").mockResolvedValue(okResult);
    const versionSpy = spyOn(scannerRunner, "getScannerVersion").mockResolvedValue("1.0.0");
    const targetPath = `src/example-${crypto.randomUUID()}.py`;

    try {
      await wrapSemgrep(targetPath);

      expect(runnerSpy).toHaveBeenCalledWith(
        ["semgrep", "scan", "--config=p/security-audit", "--config=p/secrets", "--json", targetPath],
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
        ["trivy", "fs", "--format", "json", targetPath],
        SCANNER_BUDGETS.trivy,
      );
    } finally {
      runnerSpy.mockRestore();
      versionSpy.mockRestore();
    }
  });
});
