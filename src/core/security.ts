import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { basename } from "node:path";

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
};

type SemgrepResult = {
  check_id?: string;
  extra?: {
    severity?: string;
    message?: string;
  };
  start?: {
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
    }));
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
