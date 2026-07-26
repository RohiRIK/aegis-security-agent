import type { NormalizedFinding } from "../events/types.ts";
export type PackageEcosystem = "npm" | "pip" | "cargo" | "go";
export type ParsedInstall = {
    ecosystem: PackageEcosystem;
    packageName: string;
    packageVersion: string;
};
export type SemgrepFinding = {
    rule: string;
    severity: string;
    message: string;
    line: number;
    endLine?: number;
    file?: string;
};
export declare function parseSemgrepFindings(stdout: string): SemgrepFinding[];
export declare function semgrepToNormalized(findings: SemgrepFinding[], filePath: string): NormalizedFinding[];
export declare function trivyToNormalized(stdout: string, packageName: string): NormalizedFinding[];
/**
 * Parses TruffleHog `filesystem --json` NDJSON output into normalized findings.
 * Verified secrets are CRITICAL; unverified pattern hits are HIGH.
 * NEVER copies the raw secret value into the finding.
 */
export declare function trufflehogToNormalized(stdout: string): NormalizedFinding[];
export declare const DEFAULT_SENSITIVE_VARS: string[];
/**
 * Returns the first high-risk pattern that matches the command (case-insensitive),
 * or null if no pattern matches.
 */
export declare function matchHighRiskPattern(command: string, patterns: string[]): string | null;
/**
 * Parses npm/pip/cargo/go install commands. Returns null for non-install commands.
 */
export declare function parseInstallCommand(cmd: string): ParsedInstall | null;
/**
 * Generates a minimal lockfile stub for a given package to enable Trivy scanning.
 */
export declare function makeLockfileContent(pkg: ParsedInstall): {
    filename: string;
    content: string;
};
/**
 * Scans a package for HIGH/CRITICAL CVEs using Trivy.
 * Returns { blocked: false, reason: "trivy not installed — scan skipped" } when Trivy is unavailable.
 */
export declare function trivyScan(pkg: ParsedInstall): Promise<{
    blocked: boolean;
    reason: string;
}>;
/**
 * Runs Semgrep on a file and returns structured findings.
 * Returns empty array when Semgrep is unavailable or file does not exist.
 */
export declare function semgrepScan(filePath: string): Promise<SemgrepFinding[]>;
/**
 * Returns true if the filePath matches any of the deny glob patterns.
 */
export declare function checkSensitiveFile(filePath: string, denyPatterns: string[]): boolean;
/**
 * Returns a copy of env with all keys matching sensitiveVars removed.
 * Does not mutate the original object.
 */
export declare function stripSensitiveEnv(env: Record<string, string>, sensitiveVars?: string[]): Record<string, string>;
