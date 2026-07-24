import { basename, join, resolve } from "node:path";
import { chmod, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

import { runCommandCapture } from "../lib/base.ts";
import {
  parseSemgrepFindings,
  semgrepToNormalized,
  trivyToNormalized,
  trufflehogToNormalized,
} from "../core/security.ts";
import { wrapSemgrep, wrapTrivy, wrapTrufflehog, type ScannerResult } from "../lib/scanner.ts";
import { getScannerVersionSafe } from "../lib/scanner.ts";
import {
  computeVerdict,
  tallySeverities,
  VERDICT_EXIT_CODE,
  SCAN_ERROR_EXIT_CODE,
} from "../core/verdict.ts";
import { findingsToSarif } from "../sarif/builder.ts";
import { renderReportHtml } from "../report/html.ts";
import { writeReportCatalog } from "../report/catalog.ts";
import type { ScanReport, ScannerRun } from "../report/types.ts";
import type { NormalizedFinding } from "../events/types.ts";

export type ScanFlags = {
  target: string;
  out?: string;
  noCatalog: boolean;
  json: boolean;
  branch?: string;
  subpath?: string;
  allowUntrusted: boolean;
  maxRepoSizeMb: number;
};

/** Default cap on cloned repo size (MB) to bound disk/scan time. */
export const DEFAULT_MAX_REPO_SIZE_MB = 2048;

export function parseScanFlags(args: string[]): ScanFlags {
  let target = ".";
  let out: string | undefined;
  let noCatalog = false;
  let json = false;
  let branch: string | undefined;
  let subpath: string | undefined;
  let allowUntrusted = false;
  let maxRepoSizeMb = DEFAULT_MAX_REPO_SIZE_MB;

  const takeValue = (i: number): string | undefined => args[i + 1];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--target" || arg === "-t") {
      const next = takeValue(i);
      if (next !== undefined) { target = next; i++; }
    } else if (arg === "--out" || arg === "-o") {
      const next = takeValue(i);
      if (next !== undefined) { out = next; i++; }
    } else if (arg === "--branch") {
      const next = takeValue(i);
      if (next !== undefined) { branch = next; i++; }
    } else if (arg === "--subpath") {
      const next = takeValue(i);
      if (next !== undefined) { subpath = next; i++; }
    } else if (arg === "--allow-untrusted") {
      allowUntrusted = true;
    } else if (arg === "--max-repo-size-mb") {
      const next = takeValue(i);
      const parsed = next !== undefined ? Number.parseInt(next, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) { maxRepoSizeMb = parsed; i++; }
    } else if (arg === "--no-catalog") {
      noCatalog = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg && !arg.startsWith("-")) {
      target = arg;
    }
  }

  return { target, out, noCatalog, json, branch, subpath, allowUntrusted, maxRepoSizeMb };
}

async function getPackageVersion(): Promise<string> {
  try {
    const pkg = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

async function getCommit(dir: string): Promise<string> {
  try {
    const result = await runCommandCapture(["git", "-C", dir, "rev-parse", "--short", "HEAD"]);
    return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : "no-git";
  } catch {
    return "no-git";
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type ScannerOutcome = {
  run: ScannerRun;
  findings: NormalizedFinding[];
  degraded: boolean;
};

function isDegraded(result: ScannerResult): boolean {
  return result.degraded || result.status === "timeout" || result.status === "error";
}

async function runSemgrep(dir: string): Promise<ScannerOutcome> {
  const result = await wrapSemgrep(dir);
  const findings = result.status === "error" || result.status === "timeout"
    ? []
    : semgrepToNormalized(parseSemgrepFindings(result.stdout), dir);
  return {
    run: { name: "semgrep", version: await getScannerVersionSafe("semgrep"), status: result.status, durationMs: result.durationMs },
    findings,
    degraded: isDegraded(result),
  };
}

async function runTrivy(dir: string): Promise<ScannerOutcome> {
  const result = await wrapTrivy(["fs", "--scanners", "vuln", "--severity", "HIGH,CRITICAL", "--format", "json", dir]);
  const findings = result.status === "error" || result.status === "timeout"
    ? []
    : trivyToNormalized(result.stdout, "");
  return {
    run: { name: "trivy", version: await getScannerVersionSafe("trivy"), status: result.status, durationMs: result.durationMs },
    findings,
    degraded: isDegraded(result),
  };
}

async function runTrufflehog(dir: string): Promise<ScannerOutcome> {
  const result = await wrapTrufflehog(dir);
  const findings = result.status === "error" || result.status === "timeout"
    ? []
    : trufflehogToNormalized(result.stdout);
  return {
    run: { name: "trufflehog", version: await getScannerVersionSafe("trufflehog"), status: result.status, durationMs: result.durationMs },
    findings,
    degraded: isDegraded(result),
  };
}

/** Orchestrates all scanners against a local directory and builds a report. */
export async function scanDirectory(dir: string): Promise<ScanReport> {
  const outcomes = await Promise.all([runSemgrep(dir), runTrivy(dir), runTrufflehog(dir)]);

  const findings = outcomes.flatMap((o) => o.findings);
  const counts = tallySeverities(findings);
  const verdict = computeVerdict(counts);
  const degraded = outcomes.filter((o) => o.degraded).map((o) => o.run.name);

  return {
    repo: basename(dir),
    target: dir,
    date: today(),
    commit: await getCommit(dir),
    verdict,
    counts,
    findings,
    degraded,
    scanners: outcomes.map((o) => o.run),
  };
}

function printSummary(report: ScanReport, catalogPath: string | null): void {
  const { counts } = report;
  process.stderr.write(
    `[AEGIS] ${report.verdict} — ${report.repo} (${report.commit}) ` +
      `C:${counts.critical} H:${counts.high} M:${counts.medium} L:${counts.low} I:${counts.info}` +
      `${report.degraded.length > 0 ? ` | DEGRADED: ${report.degraded.join(",")}` : ""}\n`,
  );
  if (catalogPath) {
    process.stderr.write(`[AEGIS] Report cataloged at ${catalogPath}\n`);
  }
}

type ResolvedTarget = {
  dir: string;
  repoName?: string;
  tempCloneDir: string | null;
  error?: string;
};

/** True for http(s)/ssh/git URLs, false for local filesystem paths. */
export function isGitUrl(target: string): boolean {
  return /^(https?|git|ssh):\/\//.test(target) || /^git@[^:]+:.+/.test(target);
}

/** Derives a catalog-safe repo identity from a git URL (strips scheme, .git, trailing slashes). */
export function repoNameFromUrl(url: string): string {
  let s = url.trim();
  s = s.replace(/^[a-z]+:\/\//i, ""); // strip scheme
  s = s.replace(/^[^@/]+@/, ""); // strip user@
  s = s.replace(/:/, "/"); // scp-style git@host:org/repo → host/org/repo
  const parts = s.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "repo";
  return last.replace(/\.git$/i, "") || "repo";
}

/**
 * Resolves the scan target to a concrete directory.
 * - Local path → used in place.
 * - Git URL → requires --allow-untrusted (untrusted code on host); shallow-cloned
 *   (depth 1) into a 0700 temp dir; optional --branch and --subpath (confined to
 *   the clone root); size-guarded by --max-repo-size-mb.
 * Returns the dir to scan plus temp-clone cleanup info.
 */
export async function resolveScanTarget(flags: ScanFlags): Promise<ResolvedTarget> {
  const { target } = flags;

  if (!isGitUrl(target)) {
    // Local path. --subpath may scope within it (confined below).
    const base = resolve(target);
    const dir = confineSubpath(base, flags.subpath);
    if (!dir) {
      return { dir: base, tempCloneDir: null, error: `--subpath escapes target root: ${flags.subpath}` };
    }
    return { dir, tempCloneDir: null };
  }

  // Git URL — untrusted code path.
  if (!flags.allowUntrusted) {
    return {
      dir: target,
      tempCloneDir: null,
      error:
        `Refusing to scan untrusted remote repo without --allow-untrusted: ${target}\n` +
        `  Cloning runs scanner tools over attacker-controlled files on this host. ` +
        `Re-run with --allow-untrusted to accept the risk.`,
    };
  }

  const cloneRoot = await mkdtemp(join(tmpdir(), "aegis-clone-"));
  await chmod(cloneRoot, 0o700);

  const repoName = repoNameFromUrl(target);
  const cloneArgs = ["git", "clone", "--depth", "1", "--quiet"];
  if (flags.branch) {
    cloneArgs.push("--branch", flags.branch, "--single-branch");
  }
  cloneArgs.push(target, cloneRoot);

  const clone = await runCommandCapture(cloneArgs);
  if (clone.exitCode !== 0) {
    await rm(cloneRoot, { recursive: true, force: true }).catch(() => {});
    return {
      dir: target,
      tempCloneDir: null,
      error: `git clone failed (exit ${clone.exitCode}): ${clone.stderr.trim() || "unknown error"}`,
    };
  }

  // Size guard — post-clone disk usage, before scanning.
  const sizeMb = await dirSizeMb(cloneRoot);
  if (sizeMb > flags.maxRepoSizeMb) {
    await rm(cloneRoot, { recursive: true, force: true }).catch(() => {});
    return {
      dir: target,
      tempCloneDir: null,
      error: `Repo exceeds size guard: ${sizeMb}MB > ${flags.maxRepoSizeMb}MB (--max-repo-size-mb to raise)`,
    };
  }

  const dir = confineSubpath(cloneRoot, flags.subpath);
  if (!dir) {
    await rm(cloneRoot, { recursive: true, force: true }).catch(() => {});
    return { dir: cloneRoot, tempCloneDir: null, error: `--subpath escapes clone root: ${flags.subpath}` };
  }

  // Catalog identity: repo name (+ subpath slug when scoped).
  const catalogName = flags.subpath
    ? `${repoName}-${flags.subpath.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}`
    : repoName;

  return { dir, repoName: catalogName, tempCloneDir: cloneRoot };
}

/** Resolves subpath under root and rejects escapes (path traversal). Returns null on escape. */
function confineSubpath(root: string, subpath?: string): string | null {
  if (!subpath) return root;
  const resolvedSub = resolve(root, subpath);
  const rootWithSep = root.endsWith("/") ? root : root + "/";
  return resolvedSub === root || resolvedSub.startsWith(rootWithSep) ? resolvedSub : null;
}

/** Directory size in whole MB (du -sm), 0 on error. */
async function dirSizeMb(dir: string): Promise<number> {
  const res = await runCommandCapture(["du", "-sm", dir]);
  if (res.exitCode !== 0) return 0;
  const mb = Number.parseInt(res.stdout.trim().split(/\s+/)[0] ?? "0", 10);
  return Number.isFinite(mb) ? mb : 0;
}

/** Removes stale clone temp dirs (>24h) left by interrupted runs. */
export async function cleanupStaleClones(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  let removed = 0;
  try {
    const entries = await readdir(tmpdir(), { withFileTypes: true });
    const now = Date.now();
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith("aegis-clone-")) continue;
      const full = join(tmpdir(), e.name);
      try {
        const s = await stat(full);
        if (now - s.mtimeMs > maxAgeMs) {
          await rm(full, { recursive: true, force: true });
          removed++;
        }
      } catch { /* ignore per-entry errors */ }
    }
  } catch { /* tmpdir unreadable — nothing to do */ }
  return removed;
}

export async function runScan(flags: ScanFlags): Promise<number> {
  let tempCloneDir: string | null = null;
  try {
    const resolved = await resolveScanTarget(flags);
    if (resolved.error) {
      process.stderr.write(`[AEGIS] ${resolved.error}\n`);
      return SCAN_ERROR_EXIT_CODE;
    }
    tempCloneDir = resolved.tempCloneDir;
    const dir = resolved.dir;
    if (!(await isDirectory(dir))) {
      process.stderr.write(`[AEGIS] Scan target is not a directory: ${dir}\n`);
      return SCAN_ERROR_EXIT_CODE;
    }

    const report = await scanDirectory(dir);
    // Prefer the git-derived repo identity (org/repo or repo name) for the catalog.
    if (resolved.repoName) {
      report.repo = resolved.repoName;
    }
    const version = await getPackageVersion();
    const sarif = findingsToSarif(report.findings, version);
    const html = renderReportHtml(report);
    const verdictJson = {
      repo: report.repo,
      target: report.target,
      date: report.date,
      commit: report.commit,
      verdict: report.verdict,
      findings: report.counts,
      degraded: report.degraded,
    };

    let catalogPath: string | null = null;
    if (!flags.noCatalog) {
      catalogPath = await writeReportCatalog(
        { repo: report.repo, date: report.date, verdict: report.verdict },
        { html, sarif, verdict: verdictJson },
      );
    }

    if (flags.out) {
      await Bun.write(resolve(flags.out), html);
    }

    if (flags.json) {
      process.stdout.write(JSON.stringify({ ...verdictJson, findings: report.findings, counts: report.counts }, null, 2) + "\n");
    } else {
      printSummary(report, catalogPath);
    }

    return VERDICT_EXIT_CODE[report.verdict];
  } catch (error) {
    process.stderr.write(`[AEGIS] Scan error: ${error instanceof Error ? error.message : String(error)}\n`);
    return SCAN_ERROR_EXIT_CODE;
  } finally {
    if (tempCloneDir) {
      await rm(tempCloneDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
