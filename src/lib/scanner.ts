import crypto from "node:crypto";
import { stat } from "node:fs/promises";
import { join } from "node:path";

import {
  CACHE_DIR,
  computeCacheKey,
  computeScopeHash,
  getCacheTtl,
  readCacheEntry,
  shouldSkipCache,
  writeCacheEntry,
} from "./scan-cache.ts";

export async function resolveScanner(scanner: string): Promise<string> {
  try {
    const { ensureLatest, resolveToolPath } = require("./provisioner/manager.ts") as {
      ensureLatest: (scanner: string) => Promise<void>;
      resolveToolPath: (scanner: string) => string | null;
    };
    await ensureLatest(scanner as never);
    return resolveToolPath(scanner as never) ?? scanner;
  } catch {
    return scanner;
  }
}

export type ScannerResult = {
  status: "ok" | "timeout" | "error" | "cached";
  exitCode: number;
  stdout: string;
  stderr: string;
  degraded: boolean;
  durationMs: number;
};

export const SCANNER_BUDGETS = {
  semgrep: 120_000,
  trivy: 60_000,
  trufflehog: 90_000,
} as const;

export async function runScannerWithTimeout(argv: string[], budgetMs: number): Promise<ScannerResult> {
  const startedAt = performance.now();

  try {
    const proc = Bun.spawn(argv, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = new Promise<{ status: "timeout" }>((resolve) => {
      setTimeout(() => resolve({ status: "timeout" }), budgetMs);
    });

    const completion = proc.exited.then((exitCode) => ({ status: "completed" as const, exitCode }));
    const outcome = await Promise.race([completion, timeout]);

    if (outcome.status === "timeout") {
      proc.kill();
      return {
        status: "timeout",
        exitCode: -1,
        stdout: "",
        stderr: "",
        degraded: true,
        durationMs: budgetMs,
      };
    }

    const durationMs = performance.now() - startedAt;
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    return {
      status: "ok",
      exitCode: outcome.exitCode,
      stdout,
      stderr,
      degraded: false,
      durationMs,
    };
  } catch (error) {
    // Binary not found, not executable, or stream read failure — degrade
    // instead of throwing so a missing scanner never aborts the whole scan.
    return {
      status: "error",
      exitCode: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      degraded: true,
      durationMs: performance.now() - startedAt,
    };
  }
}

export const scannerRunner = {
  runScannerWithTimeout,
  getScannerVersion,
};

/** Best-effort scanner version for reporting; returns "unknown" when unavailable. */
export async function getScannerVersionSafe(scanner: string): Promise<string> {
  return getScannerVersion(scanner);
}

const versionCache = new Map<string, string>();

async function getScannerVersion(scanner: string): Promise<string> {
  const cached = versionCache.get(scanner);
  if (cached) {
    return cached;
  }

  try {
    const proc = Bun.spawn([await resolveScanner(scanner), "--version"], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      const version = (await new Response(proc.stdout).text()).trim();
      versionCache.set(scanner, version);
      return version;
    }
  } catch {
    // scanner not available — use fallback
  }

  versionCache.set(scanner, "unknown");
  return "unknown";
}

function hashConfig(config: string): string {
  return crypto.createHash("sha256").update(config).digest("hex").slice(0, 16);
}

async function getMtimeMs(filePath: string): Promise<number> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.mtimeMs;
  } catch {
    return 0;
  }
}

async function readScannerCache(
  scanner: string,
  config: string,
  scopePaths: string[],
): Promise<{ key: string; cached: ScannerResult | null }> {
  const mtimes = await Promise.all(scopePaths.map((filePath) => getMtimeMs(filePath)));
  const scopeHash = computeScopeHash(scopePaths, mtimes);
  const version = await scannerRunner.getScannerVersion(scanner);
  const configHash = hashConfig(config);
  const key = computeCacheKey(scanner, version, configHash, scopeHash);
  const entry = await readCacheEntry(join(process.cwd(), CACHE_DIR), key);

  if (!entry) {
    return { key, cached: null };
  }

  return {
    key,
    cached: {
      ...entry.result,
      status: "cached",
    },
  };
}

async function writeScannerCache(scanner: string, key: string, result: ScannerResult): Promise<void> {
  if (shouldSkipCache(result)) {
    return;
  }

  await writeCacheEntry(join(process.cwd(), CACHE_DIR), {
    key,
    timestamp: Date.now(),
    ttl: getCacheTtl(scanner),
    result,
  });
}

export async function wrapSemgrep(filePath: string): Promise<ScannerResult> {
  const config = "--config=p/security-audit|--config=p/secrets|--json";
  const { key, cached } = await readScannerCache("semgrep", config, [filePath]);

  if (cached) {
    return cached;
  }

  const result = await scannerRunner.runScannerWithTimeout(
    [await resolveScanner("semgrep"), "scan", "--config=p/security-audit", "--config=p/secrets", "--json", filePath],
    SCANNER_BUDGETS.semgrep,
  );

  await writeScannerCache("semgrep", key, result);
  return result;
}

export async function wrapTrivy(args: string[]): Promise<ScannerResult> {
  const config = args.join("|");
  const { key, cached } = await readScannerCache("trivy", config, args);

  if (cached) {
    return cached;
  }

  const result = await scannerRunner.runScannerWithTimeout([await resolveScanner("trivy"), ...args], SCANNER_BUDGETS.trivy);
  await writeScannerCache("trivy", key, result);
  return result;
}

export async function wrapTrufflehog(targetPath: string): Promise<ScannerResult> {
  // SECRETS SCANNER — never cache. TruffleHog's `--json` output embeds the
  // plaintext secret value (Raw/RawV2 fields). Persisting raw stdout to
  // .aegis/scan-cache would write real secrets to disk, violating the
  // no-secret-persistence directive. Only normalized findings (secret stripped)
  // may be stored; the raw stdout stays in memory for the life of the scan.
  return scannerRunner.runScannerWithTimeout(
    [await resolveScanner("trufflehog"), "filesystem", "--json", targetPath],
    SCANNER_BUDGETS.trufflehog,
  );
}
