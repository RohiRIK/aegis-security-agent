import crypto from "node:crypto";
import { join } from "node:path";
import { chmod } from "node:fs/promises";

import { ensureDir, fileExists } from "./base.ts";
import type { ScannerResult } from "./scanner.ts";

export type CacheEntry = {
  key: string;
  timestamp: number;
  ttl: number;
  result: ScannerResult;
};

export const CACHE_DIR = ".aegis/scan-cache";

export const CACHE_TTLS = {
  semgrep: 600_000,
  trivy: 3_600_000,
  trufflehog: 600_000,
} as const;

export function computeCacheKey(scanner: string, version: string, config: string, scopeHash: string): string {
  return crypto.createHash("sha256").update([scanner, version, config, scopeHash].join("|")).digest("hex").slice(0, 16);
}

export function computeScopeHash(filePaths: string[], mtimes: number[]): string {
  const normalized = filePaths
    .map((filePath, index) => ({ filePath, mtime: mtimes[index] ?? 0 }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));

  const payload = normalized.map(({ filePath, mtime }) => `${filePath}:${mtime}`).join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === "string" &&
    typeof entry.timestamp === "number" &&
    typeof entry.ttl === "number" &&
    typeof entry.result === "object" &&
    entry.result !== null
  );
}

export async function readCacheEntry(cacheDir: string, key: string): Promise<CacheEntry | null> {
  const filePath = join(cacheDir, `${key}.json`);

  if (!(await fileExists(filePath))) {
    return null;
  }

  try {
    const parsed = await Bun.file(filePath).json();
    if (!isCacheEntry(parsed)) {
      return null;
    }

    if (Date.now() - parsed.timestamp >= parsed.ttl) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function writeCacheEntry(cacheDir: string, entry: CacheEntry): Promise<void> {
  await ensureDir(cacheDir);
  // Cached stdout may hold code snippets / vuln detail — restrict to owner.
  await chmod(cacheDir, 0o700).catch(() => {});
  const filePath = join(cacheDir, `${entry.key}.json`);
  await Bun.write(filePath, JSON.stringify(entry));
  await chmod(filePath, 0o600).catch(() => {});
}

export function shouldSkipCache(result: ScannerResult): boolean {
  if (result.status !== "ok") {
    return true;
  }

  return result.stdout.includes("CRITICAL");
}

export function getCacheTtl(scanner: string): number {
  return CACHE_TTLS[scanner as keyof typeof CACHE_TTLS] ?? 600_000;
}
