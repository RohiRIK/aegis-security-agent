import type { ScannerName, Platform } from "./types";
type PlatformInfo = {
    os: string;
    arch: string;
};
export declare function detectPlatform(): Platform;
export declare function mapPlatformToTrivy(platform: Platform): PlatformInfo;
export declare function mapPlatformToTrufflehog(platform: Platform): PlatformInfo;
export declare function resolveDownloadUrl(urlTemplate: string, version: string, platform: Platform, scanner: ScannerName): string;
export declare function getToolPath(scanner: ScannerName, version: string, platform: Platform): string;
export {};
