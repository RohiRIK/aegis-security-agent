import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chmod } from "node:fs/promises";

import { ensureDir } from "../lib/base.ts";
import type { Verdict } from "../core/verdict.ts";

/** Aegis catalog root: `~/.aegis`, overridable via AEGIS_HOME. */
export function aegisHome(): string {
  return process.env.AEGIS_HOME?.trim() || join(homedir(), ".aegis");
}

/** Sanitizes a repo identity into a filesystem-safe path segment. */
export function sanitizeRepoName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "repo";
}

/** Pure: `<root>/<repo>/<date>/<verdict>`. */
export function catalogDir(root: string, repo: string, date: string, verdict: Verdict): string {
  return join(root, sanitizeRepoName(repo), date, verdict);
}

export type CatalogArtifacts = {
  html: string;
  sarif: unknown;
  verdict: unknown;
};

/**
 * Writes report.html / report.sarif / verdict.json into
 * `<root>/<repo>/<date>/<verdict>/` and returns the directory path.
 */
export async function writeReportCatalog(
  input: { repo: string; date: string; verdict: Verdict },
  artifacts: CatalogArtifacts,
  opts?: { root?: string },
): Promise<string> {
  const root = opts?.root ?? aegisHome();
  const dir = catalogDir(root, input.repo, input.date, input.verdict);
  await ensureDir(dir);
  // Scan output may contain secret/vuln findings — restrict to owner only.
  // Lock every level from the leaf up to (and including) root: the repo name,
  // date, and verdict live in the *directory names*, so leaving intermediate
  // dirs at umask-default (0o755) would leak the identity and risk verdict of
  // scanned repos to other local users via a simple `ls`.
  for (let cur = dir; cur.startsWith(root); cur = dirname(cur)) {
    await chmod(cur, 0o700);
    if (cur === root) break;
  }

  const files: [string, string][] = [
    ["report.html", artifacts.html],
    ["report.sarif", JSON.stringify(artifacts.sarif, null, 2)],
    ["verdict.json", JSON.stringify(artifacts.verdict, null, 2)],
  ];
  for (const [name, contents] of files) {
    const p = join(dir, name);
    await Bun.write(p, contents);
    await chmod(p, 0o600);
  }

  return dir;
}
