export declare function resolveScanner(scanner: string): Promise<string>;
export type ScannerResult = {
    status: "ok" | "timeout" | "error" | "cached";
    exitCode: number;
    stdout: string;
    stderr: string;
    degraded: boolean;
    durationMs: number;
};
export declare const SCANNER_BUDGETS: {
    readonly semgrep: 120000;
    readonly trivy: 60000;
    readonly trufflehog: 90000;
};
export declare function runScannerWithTimeout(argv: string[], budgetMs: number): Promise<ScannerResult>;
export declare const scannerRunner: {
    runScannerWithTimeout: typeof runScannerWithTimeout;
    getScannerVersion: typeof getScannerVersion;
};
/** Best-effort scanner version for reporting; returns "unknown" when unavailable. */
export declare function getScannerVersionSafe(scanner: string): Promise<string>;
declare function getScannerVersion(scanner: string): Promise<string>;
export declare function wrapSemgrep(filePath: string): Promise<ScannerResult>;
export declare function wrapTrivy(args: string[]): Promise<ScannerResult>;
export declare function wrapTrufflehog(targetPath: string): Promise<ScannerResult>;
export {};
