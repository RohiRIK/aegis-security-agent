import type { ProvisionResult } from "./types.ts";
export declare function verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean>;
export declare function downloadFile(url: string, destPath: string, options?: {
    token?: string;
}): Promise<void>;
export declare function extractTarGz(archivePath: string, extractDir: string): Promise<string[]>;
export declare function atomicDownload(url: string, destDir: string, binaryName: string, expectedSha256: string): Promise<ProvisionResult>;
