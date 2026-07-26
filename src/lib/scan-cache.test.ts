import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CACHEABLE_SCANNERS,
  computeCacheKey,
  getCacheTtl,
  isCacheableScanner,
  purgeUncacheableEntries,
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

  test("returns true for a clean ok result when no scanner is named", () => {
    // The caller cannot prove the output is safe to persist ⇒ do not persist.
    expect(shouldSkipCache(okResult)).toBe(true);
  });

  test.each(["semgrep", "trivy", "trufflehog"])(
    "never persists raw stdout for %s — its output can embed source or secrets",
    (scanner) => {
      expect(isCacheableScanner(scanner)).toBe(false);
      expect(shouldSkipCache(okResult, scanner)).toBe(true);
      expect(
        shouldSkipCache({ ...okResult, stdout: '{"extra":{"lines":"const k = \\"AKIA...\\""}}' }, scanner),
      ).toBe(true);
    },
  );

  test("an unknown scanner is not cacheable by default", () => {
    expect(shouldSkipCache(okResult, "some-future-scanner")).toBe(true);
  });

  test("the raw-stdout allowlist is empty — caching raw output is opt-in", () => {
    expect([...CACHEABLE_SCANNERS]).toEqual([]);
  });
});

describe("purgeUncacheableEntries", () => {
  test("removes entries written before the allowlist existed", async () => {
    await writeCacheEntry(tempDir, { key: "legacy-a", timestamp: Date.now(), ttl: 1_000, result: okResult });
    await writeCacheEntry(tempDir, { key: "legacy-b", timestamp: Date.now(), ttl: 1_000, result: okResult });

    expect(await purgeUncacheableEntries(tempDir)).toBe(2);
    await expect(readCacheEntry(tempDir, "legacy-a")).resolves.toBeNull();
    await expect(readCacheEntry(tempDir, "legacy-b")).resolves.toBeNull();
  });

  test("leaves unrelated files alone", async () => {
    await Bun.write(join(tempDir, "notes.txt"), "keep me");
    await purgeUncacheableEntries(tempDir);

    expect(await Bun.file(join(tempDir, "notes.txt")).text()).toBe("keep me");
  });

  test("a missing cache directory is not an error", async () => {
    await expect(purgeUncacheableEntries(join(tempDir, "absent"))).resolves.toBe(0);
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
