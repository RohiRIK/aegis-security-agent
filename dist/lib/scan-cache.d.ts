import type { ScannerResult } from "./scanner.ts";
export type CacheEntry = {
    key: string;
    timestamp: number;
    ttl: number;
    result: ScannerResult;
};
export declare const CACHE_DIR = ".aegis/scan-cache";
export declare const CACHE_TTLS: {
    readonly semgrep: 600000;
    readonly trivy: 3600000;
    readonly trufflehog: 600000;
};
export declare function computeCacheKey(scanner: string, version: string, config: string, scopeHash: string): string;
export declare function computeScopeHash(filePaths: string[], mtimes: number[]): string;
export declare function readCacheEntry(cacheDir: string, key: string): Promise<CacheEntry | null>;
export declare function writeCacheEntry(cacheDir: string, entry: CacheEntry): Promise<void>;
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
export declare const CACHEABLE_SCANNERS: ReadonlySet<string>;
/** True when this scanner's raw stdout is allowed to touch disk at all. */
export declare function isCacheableScanner(scanner: string): boolean;
export declare function shouldSkipCache(result: ScannerResult, scanner?: string): boolean;
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
export declare function purgeUncacheableEntries(cacheDir: string): Promise<number>;
export declare function getCacheTtl(scanner: string): number;
