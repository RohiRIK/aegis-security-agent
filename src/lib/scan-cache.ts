import crypto from "node:crypto";
import { join } from "node:path";
import { chmod, readdir, unlink } from "node:fs/promises";

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

/**
 * Scanners whose *raw stdout* may be persisted to disk.
 *
 * A cache entry stores the whole `ScannerResult`, stdout included. Every
 * scanner wired today quotes source back at us — semgrep's `extra.lines`,
 * trivy's secret `Match`, trufflehog's `Raw`/`RawV2` — so a cache write can
 * land a live credential in `.aegis/scan-cache`. Caching raw output is
 * therefore opt-in, and the opt-in requires proving the scanner cannot embed
 * source or secret material. None currently clear that bar, so the allowlist
 * is empty by construction: correctness over a cache hit.
 *
 * To restore caching, cache *normalized findings* (value already stripped by
 * the normalizer) rather than adding a scanner here.
 */
export const CACHEABLE_SCANNERS: ReadonlySet<string> = new Set<string>();

/** True when this scanner's raw stdout is allowed to touch disk at all. */
export function isCacheableScanner(scanner: string): boolean {
  return CACHEABLE_SCANNERS.has(scanner);
}

export function shouldSkipCache(result: ScannerResult, scanner?: string): boolean {
  // No scanner named ⇒ caller cannot prove the output is safe to persist.
  if (scanner === undefined || !isCacheableScanner(scanner)) {
    return true;
  }

  if (result.status !== "ok") {
    return true;
  }

  return result.stdout.includes("CRITICAL");
}

/**
 * Deletes entries written before the allowlist existed. Those files hold raw
 * scanner stdout — the material the allowlist now refuses to persist — so an
 * upgrade has to clear what is already on disk, not merely stop adding to it.
 *
 * Entry filenames are opaque hashes, so an entry cannot be attributed to a
 * scanner after the fact. While the allowlist is empty every entry on disk is
 * by definition unpersistable and goes; adding an allowlist entry means the
 * scanner name has to be recorded in `CacheEntry` for this to stay correct.
 */
export async function purgeUncacheableEntries(cacheDir: string): Promise<number> {
  if (CACHEABLE_SCANNERS.size > 0) {
    return 0;
  }

  let names: string[];
  try {
    names = await readdir(cacheDir);
  } catch {
    return 0; // no cache directory — nothing to purge
  }

  let removed = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      await unlink(join(cacheDir, name));
      removed += 1;
    } catch {
      // already gone or not ours to remove
    }
  }
  return removed;
}

export function getCacheTtl(scanner: string): number {
  return CACHE_TTLS[scanner as keyof typeof CACHE_TTLS] ?? 600_000;
}
