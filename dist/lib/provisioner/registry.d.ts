import type { Platform, PlatformEntry, PythonToolManifestEntry, ScannerName, ScannersManifest } from "./types.ts";
export declare function loadManifest(): ScannersManifest;
export declare function resolveToolEntry(manifest: ScannersManifest, scanner: ScannerName, platform: Platform): PlatformEntry | PythonToolManifestEntry;
export declare function getExpectedVersion(manifest: ScannersManifest, scanner: ScannerName): string;
