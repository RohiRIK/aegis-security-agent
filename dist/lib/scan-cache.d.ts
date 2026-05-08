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
export declare function shouldSkipCache(result: ScannerResult): boolean;
export declare function getCacheTtl(scanner: string): number;
