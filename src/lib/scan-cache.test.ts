import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  computeCacheKey,
  getCacheTtl,
  readCacheEntry,
  shouldSkipCache,
  writeCacheEntry,
  type CacheEntry,
} from "./scan-cache.ts";
import type { ScannerResult } from "./scanner.ts";

const okResult: ScannerResult = {
  status: "ok",
  exitCode: 0,
  stdout: "all clear",
  stderr: "",
  degraded: false,
  durationMs: 25,
};

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "scan-cache-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("computeCacheKey", () => {
  test("returns deterministic SHA-256 hash from scanner name + version + config + scope", () => {
    expect(computeCacheKey("semgrep", "1", "p/security-audit,p/secrets", "scope-123")).toBe("a5bd21bd2ad4fa4c");
  });

  test("with different inputs produces different hashes", () => {
    const first = computeCacheKey("semgrep", "1", "config-a", "scope-a");
    const second = computeCacheKey("semgrep", "2", "config-a", "scope-a");

    expect(first).not.toBe(second);
  });
});

describe("cache IO", () => {
  test("writeCacheEntry writes valid JSON to <cacheDir>/<key>.json", async () => {
    const entry: CacheEntry = {
      key: "cache-key",
      timestamp: Date.now(),
      ttl: 1_000,
      result: okResult,
    };

    await writeCacheEntry(tempDir, entry);

    const content = await readFile(join(tempDir, "cache-key.json"), "utf8");
    expect(JSON.parse(content)).toEqual(entry);
  });

  test("readCacheEntry returns cached result when within TTL", async () => {
    const entry: CacheEntry = {
      key: "fresh-entry",
      timestamp: Date.now() - 100,
      ttl: 1_000,
      result: okResult,
    };

    await writeCacheEntry(tempDir, entry);

    await expect(readCacheEntry(tempDir, entry.key)).resolves.toEqual(entry);
  });

  test("readCacheEntry returns null when TTL expired", async () => {
    const entry: CacheEntry = {
      key: "expired-entry",
      timestamp: Date.now() - 2_000,
      ttl: 1_000,
      result: okResult,
    };

    await writeCacheEntry(tempDir, entry);

    await expect(readCacheEntry(tempDir, entry.key)).resolves.toBeNull();
  });

  test("readCacheEntry returns null for missing cache file", async () => {
    await expect(readCacheEntry(tempDir, "missing-entry")).resolves.toBeNull();
  });
});

describe("shouldSkipCache", () => {
  test("returns true for timed-out scans", () => {
    expect(shouldSkipCache({ ...okResult, status: "timeout", degraded: true })).toBe(true);
  });

  test("returns true for error scans", () => {
    expect(shouldSkipCache({ ...okResult, status: "error", stderr: "boom" })).toBe(true);
  });

  test('returns true when stdout contains "CRITICAL"', () => {
    expect(shouldSkipCache({ ...okResult, stdout: "1 CRITICAL finding" })).toBe(true);
  });

  test("returns false for clean ok results", () => {
    expect(shouldSkipCache(okResult)).toBe(false);
  });
});

describe("getCacheTtl", () => {
  test("returns 600_000 (10 min) for semgrep and trufflehog", () => {
    expect(getCacheTtl("semgrep")).toBe(600_000);
    expect(getCacheTtl("trufflehog")).toBe(600_000);
  });

  test("returns 3_600_000 (60 min) for trivy", () => {
    expect(getCacheTtl("trivy")).toBe(3_600_000);
  });
});
