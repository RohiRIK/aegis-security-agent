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

  try {
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
    return {
      status: "error",
      exitCode: outcome.exitCode,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      degraded: false,
      durationMs,
    };
  }
}

export const scannerRunner = {
  runScannerWithTimeout,
  getScannerVersion,
};

const versionCache = new Map<string, string>();

async function getScannerVersion(scanner: string): Promise<string> {
  const cached = versionCache.get(scanner);
  if (cached) {
    return cached;
  }

  try {
    const proc = Bun.spawn([scanner, "--version"], { stdout: "pipe", stderr: "pipe" });
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
    ["semgrep", "scan", "--config=p/security-audit", "--config=p/secrets", "--json", filePath],
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

  const result = await scannerRunner.runScannerWithTimeout(["trivy", ...args], SCANNER_BUDGETS.trivy);
  await writeScannerCache("trivy", key, result);
  return result;
}

export async function wrapTrufflehog(targetPath: string): Promise<ScannerResult> {
  const config = "--json|filesystem";
  const { key, cached } = await readScannerCache("trufflehog", config, [targetPath]);

  if (cached) {
    return cached;
  }

  const result = await scannerRunner.runScannerWithTimeout(
    ["trufflehog", "filesystem", "--json", targetPath],
    SCANNER_BUDGETS.trufflehog,
  );

  await writeScannerCache("trufflehog", key, result);
  return result;
}
