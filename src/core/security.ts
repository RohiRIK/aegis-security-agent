import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { basename } from "node:path";
import type { AegisEventSeverity, NormalizedFinding } from "../events/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type SemgrepResult = {
  check_id?: string;
  path?: string;
  extra?: {
    severity?: string;
    message?: string;
  };
  start?: {
    line?: number;
  };
  end?: {
    line?: number;
  };
};

export function parseSemgrepFindings(stdout: string): SemgrepFinding[] {
  let parsed: { results?: SemgrepResult[] };
  try {
    parsed = JSON.parse(stdout) as { results?: SemgrepResult[] };
  } catch {
    return [];
  }

  const results = Array.isArray(parsed.results) ? parsed.results : [];
  return results
    .filter((result) => result.extra?.severity === "ERROR")
    .map((result) => ({
      rule: result.check_id ?? "unknown",
      severity: result.extra?.severity ?? "ERROR",
      message: result.extra?.message ?? "",
      line: result.start?.line ?? 0,
      endLine: result.end?.line,
      ...(result.path ? { file: result.path } : {}),
    }));
}

// ---------------------------------------------------------------------------
// Normalized finding converters
// ---------------------------------------------------------------------------

type TrivyVulnerability = {
  VulnerabilityID?: string;
  Severity?: string;
  Title?: string;
  PkgName?: string;
};

type TrivyOutput = {
  Results?: Array<{
    Vulnerabilities?: TrivyVulnerability[];
  }>;
};

function computeFingerprint(parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 12);
}

function mapSemgrepSeverity(severity: string): AegisEventSeverity {
  switch (severity.toUpperCase()) {
    case "ERROR":
      return "high";
    case "WARNING":
      return "medium";
    case "INFO":
      return "low";
    default:
      return "medium";
  }
}

function mapTrivySeverity(severity: string): AegisEventSeverity {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "medium";
  }
}

export function semgrepToNormalized(findings: SemgrepFinding[], filePath: string): NormalizedFinding[] {
  return findings.map((f) => {
    const file = f.file ?? filePath;
    return {
      scanner: "semgrep" as const,
      ruleId: `semgrep/${f.rule}`,
      message: f.message,
      severity: mapSemgrepSeverity(f.severity),
      location: {
        file,
        startLine: f.line,
        endLine: f.endLine,
      },
      fingerprint: computeFingerprint(["semgrep", `semgrep/${f.rule}`, file, String(f.line)]),
    };
  });
}

export function trivyToNormalized(stdout: string, packageName: string): NormalizedFinding[] {
  let parsed: TrivyOutput;
  try {
    parsed = JSON.parse(stdout) as TrivyOutput;
  } catch {
    return [];
  }

  const findings: NormalizedFinding[] = [];
  for (const result of parsed.Results ?? []) {
    for (const vuln of result.Vulnerabilities ?? []) {
      const ruleId = vuln.VulnerabilityID ?? "unknown";
      const pkg = vuln.PkgName ?? packageName;
      findings.push({
        scanner: "trivy" as const,
        ruleId,
        message: vuln.Title ?? "",
        severity: mapTrivySeverity(vuln.Severity ?? "UNKNOWN"),
        package: pkg,
        fingerprint: computeFingerprint(["trivy", ruleId, pkg]),
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// TruffleHog normalizer
// ---------------------------------------------------------------------------

type TrufflehogResult = {
  DetectorName?: string;
  Verified?: boolean;
  SourceMetadata?: {
    Data?: {
      Filesystem?: { file?: string; line?: number };
      Git?: { file?: string; line?: number };
    };
  };
};

function extractTrufflehogLocation(result: TrufflehogResult): { file: string; line?: number } | null {
  const data = result.SourceMetadata?.Data;
  const source = data?.Filesystem ?? data?.Git;
  if (!source?.file) return null;
  return { file: source.file, line: typeof source.line === "number" ? source.line : undefined };
}

/**
 * Parses TruffleHog `filesystem --json` NDJSON output into normalized findings.
 * Verified secrets are CRITICAL; unverified pattern hits are HIGH.
 * NEVER copies the raw secret value into the finding.
 */
export function trufflehogToNormalized(stdout: string): NormalizedFinding[] {
  const findings: NormalizedFinding[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    let result: TrufflehogResult;
    try {
      result = JSON.parse(trimmed) as TrufflehogResult;
    } catch {
      continue;
    }
    if (!result.DetectorName) continue;

    const verified = result.Verified === true;
    const detector = result.DetectorName;
    const location = extractTrufflehogLocation(result);
    const ruleId = `trufflehog/${detector}`;
    const fingerprintParts = ["trufflehog", ruleId, location?.file ?? "", String(location?.line ?? 0), String(verified)];

    findings.push({
      scanner: "trufflehog" as const,
      ruleId,
      message: `${verified ? "Verified" : "Unverified"} secret detected: ${detector}`,
      severity: verified ? "critical" : "high",
      ...(location
        ? { location: { file: location.file, ...(location.line != null ? { startLine: location.line } : {}) } }
        : {}),
      fingerprint: computeFingerprint(fingerprintParts),
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Default sensitive vars
// ---------------------------------------------------------------------------

export const DEFAULT_SENSITIVE_VARS = [
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "STRIPE_SECRET_KEY",
  "GITHUB_TOKEN",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PRIVATE_KEY",
  "SECRET_KEY",
  "PASSWORD",
  "PASSWD",
];

// ---------------------------------------------------------------------------
// matchHighRiskPattern
// ---------------------------------------------------------------------------

/**
 * Returns the first high-risk pattern that matches the command (case-insensitive),
 * or null if no pattern matches.
 */
export function matchHighRiskPattern(command: string, patterns: string[]): string | null {
  if (!command || !patterns.length) return null;
  return patterns.find((pattern) => new RegExp(pattern, "i").test(command)) ?? null;
}

// ---------------------------------------------------------------------------
// parseInstallCommand
// ---------------------------------------------------------------------------

/**
 * Parses npm/pip/cargo/go install commands. Returns null for non-install commands.
 */
export function parseInstallCommand(cmd: string): ParsedInstall | null {
  const npmMatch = cmd.match(/^npm (?:install|i) (?:--save(?:-dev)? )?(@?[^\s@]+)(?:@([^\s]+))?/);
  if (npmMatch) return { ecosystem: "npm", packageName: npmMatch[1] ?? "", packageVersion: npmMatch[2] ?? "latest" };

  const pipMatch = cmd.match(/^pip3? install (?:--[^\s]+ )*([^\s=<>!]+)(?:[=<>!]+([^\s]+))?/);
  if (pipMatch) return { ecosystem: "pip", packageName: pipMatch[1] ?? "", packageVersion: pipMatch[2] ?? "latest" };

  const cargoMatch = cmd.match(/^cargo add ([^\s@]+)(?:@([^\s]+))?/);
  if (cargoMatch) return { ecosystem: "cargo", packageName: cargoMatch[1] ?? "", packageVersion: cargoMatch[2] ?? "latest" };

  const goMatch = cmd.match(/^go get ([^\s@]+)(?:@([^\s]+))?/);
  if (goMatch) return { ecosystem: "go", packageName: goMatch[1] ?? "", packageVersion: goMatch[2] ?? "latest" };

  return null;
}

// ---------------------------------------------------------------------------
// makeLockfileContent
// ---------------------------------------------------------------------------

/**
 * Generates a minimal lockfile stub for a given package to enable Trivy scanning.
 */
export function makeLockfileContent(pkg: ParsedInstall): { filename: string; content: string } {
  const ver = pkg.packageVersion === "latest" ? "0.0.1" : pkg.packageVersion;
  switch (pkg.ecosystem) {
    case "npm":
      return {
        filename: "package-lock.json",
        content: JSON.stringify({
          name: "aegis-scan",
          lockfileVersion: 2,
          packages: {
            [`node_modules/${pkg.packageName}`]: {
              version: ver,
              resolved: `https://registry.npmjs.org/${pkg.packageName}/-/${pkg.packageName}-${ver}.tgz`,
              integrity: "sha512-placeholder",
            },
          },
        }),
      };
    case "pip":
      return { filename: "requirements.txt", content: `${pkg.packageName}==${ver}\n` };
    case "cargo":
      return {
        filename: "Cargo.lock",
        content: `[[package]]\nname = "${pkg.packageName}"\nversion = "${ver}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "placeholder"\n`,
      };
    case "go":
      return {
        filename: "go.sum",
        content: `${pkg.packageName} v${ver} h1:placeholder=\n`,
      };
  }
}

// ---------------------------------------------------------------------------
// trivyScan
// ---------------------------------------------------------------------------

/**
 * Scans a package for HIGH/CRITICAL CVEs using Trivy.
 * Returns { blocked: false, reason: "trivy not installed — scan skipped" } when Trivy is unavailable.
 */
export async function trivyScan(pkg: ParsedInstall): Promise<{ blocked: boolean; reason: string }> {
  const trivyCheck = Bun.spawn(["bash", "-c", "command -v trivy"], { stdout: "pipe", stderr: "ignore" });
  const trivyExitCode = await trivyCheck.exited;
  if (trivyExitCode !== 0) return { blocked: false, reason: "trivy not installed — scan skipped" };

  const { filename, content } = makeLockfileContent(pkg);
  const scanDir = mkdtempSync(joinPath(tmpdir(), "aegis-trivy-"));

  try {
    await Bun.write(joinPath(scanDir, filename), content);

    const result = Bun.spawn([
      "trivy", "fs",
      "--scanners", "vuln",
      "--severity", "HIGH,CRITICAL",
      "--exit-code", "1",
      "--quiet",
      "--format", "json",
      scanDir,
    ], { stdout: "pipe", stderr: "ignore" });

    const exitCode = await result.exited;
    const stdout = await new Response(result.stdout).text();

    if (exitCode === 1) {
      let vulnCount = 0;
      try {
        const parsed = JSON.parse(stdout) as { Results?: Array<{ Vulnerabilities?: unknown[] }> };
        vulnCount = parsed.Results?.reduce((sum, r) => sum + (r.Vulnerabilities?.length ?? 0), 0) ?? 0;
      } catch { /* ignore parse errors — exit code is authoritative */ }
      return { blocked: true, reason: `${vulnCount} HIGH/CRITICAL CVE(s) found — upgrade to a patched version` };
    }

    return { blocked: false, reason: "clean" };
  } finally {
    rmSync(scanDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// semgrepScan
// ---------------------------------------------------------------------------

/**
 * Runs Semgrep on a file and returns structured findings.
 * Returns empty array when Semgrep is unavailable or file does not exist.
 */
export async function semgrepScan(filePath: string): Promise<SemgrepFinding[]> {
  if (!(await Bun.file(filePath).exists())) return [];

  const semgrep = Bun.spawn([
    "semgrep",
    "scan",
    "--config=p/security-audit",
    "--config=p/secrets",
    "--json",
    filePath,
  ], {
    stdout: "pipe",
    stderr: "ignore",
  });

  const exitCode = await semgrep.exited;
  if (exitCode !== 0 && exitCode !== 1) return []; // non-zero exit other than findings = semgrep error

  const output = await new Response(semgrep.stdout).text();
  return parseSemgrepFindings(output);
}

// ---------------------------------------------------------------------------
// checkSensitiveFile
// ---------------------------------------------------------------------------

/**
 * Returns true if the filePath matches any of the deny glob patterns.
 */
export function checkSensitiveFile(filePath: string, denyPatterns: string[]): boolean {
  return denyPatterns.some((pattern) => {
    if (pattern === filePath) return true;
    if (pattern.startsWith("**/")) {
      const suffix = pattern.slice(3);
      const suffixRe = new RegExp(`^${suffix.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")}$`);
      return suffixRe.test(basename(filePath)) || suffixRe.test(filePath);
    }
    const re = new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`);
    return re.test(filePath);
  });
}

// ---------------------------------------------------------------------------
// stripSensitiveEnv
// ---------------------------------------------------------------------------

/**
 * Returns a copy of env with all keys matching sensitiveVars removed.
 * Does not mutate the original object.
 */
export function stripSensitiveEnv(
  env: Record<string, string>,
  sensitiveVars: string[] = DEFAULT_SENSITIVE_VARS,
): Record<string, string> {
  const sensitiveSet = new Set(sensitiveVars);
  return Object.fromEntries(Object.entries(env).filter(([key]) => !sensitiveSet.has(key)));
}
