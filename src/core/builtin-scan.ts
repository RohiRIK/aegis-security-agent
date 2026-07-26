import crypto from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import type { AegisEventSeverity, NormalizedFinding } from "../events/types.ts";
import {
  BUILTIN_SCANNERS,
  detectLanguage,
  IGNORE_MARKER,
  looksLikePlaceholder,
  PATH_RULE_EXCLUDE,
  PATH_RULES,
  PATTERN_RULES,
  ruleAppliesTo,
  shannonEntropy,
  type BuiltinScannerName,
  type PatternRule,
} from "./patterns.ts";

/**
 * Regex-based scanners that run in-process — no external binary, no network.
 * They complement the external scanners: TruffleHog verifies live credentials,
 * Semgrep does dataflow, and these catch shapes neither ships a rule for.
 *
 * SECRET-HANDLING INVARIANT: a matched value never leaves this module. Findings
 * carry the rule title and a file:line, never the text that matched. The
 * matched string is used only for entropy/placeholder gating and is then
 * dropped. `builtin-scan.test.ts` asserts this end to end.
 */

export type BuiltinScanOptions = {
  /** Files larger than this are skipped outright (default 2 MiB). */
  maxFileBytes?: number;
  /** Lines longer than this are skipped (minified bundles) (default 2000). */
  maxLineLength?: number;
  /** Cap per rule per file, so one generated file cannot flood the report. */
  maxMatchesPerRulePerFile?: number;
  /** Global cap across the whole walk (default 2000). */
  maxFindings?: number;
  /** Rule families to run. Omitted ⇒ every family. */
  scanners?: BuiltinScannerName[];
  /** Extra gitignore-style excludes, from `aegis-rules.json`. */
  extraIgnorePatterns?: string[];
  /** Pins every finding from a family to a fixed severity. */
  severityOverrides?: Partial<Record<BuiltinScannerName, AegisEventSeverity>>;
  /** Replaces the per-rule entropy gate for a family. */
  entropyOverrides?: Partial<Record<BuiltinScannerName, number>>;
};

const DEFAULTS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxLineLength: 2000,
  maxMatchesPerRulePerFile: 5,
  maxFindings: 2000,
} as const;

/** Directories never worth scanning: vendored code, build output, VCS metadata. */
export const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".aegis",
  ".venv",
  "venv",
  "env",
  "node_modules",
  "bower_components",
  "vendor",
  "site-packages",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".gradle",
  ".terraform",
  "Pods",
  "binaries",
]);

/**
 * Binary / media / archive extensions — no text to match against. `svg` is
 * deliberately absent: it is XML, and it can carry `<script>`, data URIs and
 * embedded credentials that a reviewer would want reported.
 */
const SKIP_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "avif", "tiff",
  "pdf", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "jar", "war",
  "woff", "woff2", "ttf", "eot", "otf",
  "mp3", "mp4", "wav", "mov", "avi", "mkv", "webm", "flac", "ogg",
  "so", "dylib", "dll", "exe", "bin", "o", "a", "class", "wasm", "pyc", "pyo", "node",
  "db", "sqlite", "sqlite3", "parquet", "pack", "idx", "lockb",
]);

/** Lockfiles: machine-generated dependency graphs, all noise for these rules. */
const SKIP_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
  "Pipfile.lock",
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function isMinified(name: string): boolean {
  return /\.min\.(?:js|css|mjs)$/i.test(name) || /\.bundle\.js$/i.test(name);
}

function fingerprint(parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Ignore files
// ---------------------------------------------------------------------------

/**
 * Compiles gitignore-style lines into path matchers. Supports comments, plain
 * names, directory prefixes, `?`, `*` and `**` globs — not the full gitignore
 * grammar (no negation); anything unsupported is treated literally.
 *
 * Globs and regex metacharacters are translated in a single pass: a two-step
 * escape-then-substitute would have to smuggle the glob placeholders through
 * `String.replace`, where `$` sequences in the replacement string are
 * themselves interpreted.
 */
export function compileIgnorePatterns(text: string): RegExp[] {
  const patterns: RegExp[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith("!")) continue;
    // A trailing `/**` is redundant: the emitted suffix already matches both the
    // path itself and everything below it.
    const body = line.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/\*\*$/, "");
    if (body.length === 0) continue;
    const resolved = body.replace(/\*\*\/|\*\*|[*?]|[.+^${}()|[\]\\]/g, (token) => {
      switch (token) {
        case "**/": return "(?:[^/]+/)*"; // zero or more directories
        case "**": return ".*";
        case "*": return "[^/]*";
        case "?": return "[^/]";
        default: return `\\${token}`;
      }
    });
    // Match the path itself, anything under it, or the same name at any depth.
    patterns.push(new RegExp(`(?:^|/)${resolved}(?:/|$)`));
  }
  return patterns;
}

/**
 * Builds a predicate reporting whether a scanner-reported path is covered by
 * `patterns`. The built-in walker skips ignored files before reading them, but
 * the external scanners (Semgrep, TruffleHog, gitleaks, …) have no knowledge of
 * `exclude_paths` and report absolute paths, so their findings are filtered
 * after the fact against the same rules.
 */
export function createPathExcluder(root: string, patterns: string[]): (file?: string) => boolean {
  const ignore = compileIgnorePatterns(patterns.join("\n"));
  if (ignore.length === 0) return () => false;
  return (file?: string) => {
    if (!file) return false;
    const rel = (isAbsolute(file) ? relative(root, file) : file).split(sep).join("/");
    // Paths outside the scan root are never matched by root-relative rules.
    if (rel.length === 0 || rel === ".." || rel.startsWith("../")) return false;
    return ignore.some((re) => re.test(rel));
  };
}

async function readIgnorePatterns(root: string, extra?: string[]): Promise<RegExp[]> {
  const patterns: RegExp[] = extra?.length ? compileIgnorePatterns(extra.join("\n")) : [];
  for (const name of [".aegisignore", ".gitignore"]) {
    try {
      patterns.push(...compileIgnorePatterns(await readFile(join(root, name), "utf8")));
    } catch {
      // absent or unreadable — nothing to add
    }
  }
  return patterns;
}

// ---------------------------------------------------------------------------
// Content matching
// ---------------------------------------------------------------------------

function matchValue(match: RegExpExecArray): string {
  return match[1] ?? match[0];
}

/** True when the rule should reject this match (path, entropy, placeholder). */
function rejects(
  rule: PatternRule,
  value: string,
  line: string,
  path: string,
  entropyGate?: number,
): boolean {
  if (rule.pathExcludes?.test(path)) return true;
  if (rule.lineExcludes?.test(line)) return true;
  // A configured gate replaces the rule default only where the rule has one;
  // rules without an entropy gate are shape-exact and must not gain one.
  const minEntropy = rule.minEntropy != null ? (entropyGate ?? rule.minEntropy) : undefined;
  if (minEntropy != null && shannonEntropy(value) < minEntropy) return true;
  // Placeholder screening applies to secrets only: a "sample" IP or an
  // "example" MD5 call is still a real finding.
  if (rule.scanner === "gitleaks-replacement" && (looksLikePlaceholder(value) || looksLikePlaceholder(line))) {
    return true;
  }
  return false;
}

const RULES_BY_SCANNER: Record<BuiltinScannerName, PatternRule[]> = Object.fromEntries(
  BUILTIN_SCANNERS.map((scanner) => [scanner, PATTERN_RULES.filter((r) => r.scanner === scanner)]),
) as Record<BuiltinScannerName, PatternRule[]>;

/** Accumulates per-family match time so each scanner reports its own duration. */
export type ScannerTimings = Map<BuiltinScannerName, number>;

/**
 * Applies every content rule to one file's text. `path` is used for the finding
 * location and fingerprint only — it is not read from disk here, which keeps
 * this function pure and directly testable.
 *
 * Iterates family-outer / line-inner so each rule family can be timed with two
 * clock reads per file instead of one per rule per line.
 */
export function scanContent(
  path: string,
  content: string,
  options?: BuiltinScanOptions,
  timings?: ScannerTimings,
): NormalizedFinding[] {
  const maxLineLength = options?.maxLineLength ?? DEFAULTS.maxLineLength;
  const maxPerRule = options?.maxMatchesPerRulePerFile ?? DEFAULTS.maxMatchesPerRulePerFile;

  const findings: NormalizedFinding[] = [];
  const perRuleCount = new Map<string, number>();
  const lines = content.split("\n");
  // Language gates the tagged rules: Python sinks must not fire on TypeScript,
  // and PowerShell cmdlet names are ordinary words in prose.
  const language = detectLanguage(path, lines[0]);

  for (const scanner of options?.scanners ?? BUILTIN_SCANNERS) {
    const startedAt = timings ? performance.now() : 0;
    const rules = RULES_BY_SCANNER[scanner].filter((rule) => ruleAppliesTo(rule, language));
    const entropyGate = options?.entropyOverrides?.[scanner];
    const severityPin = options?.severityOverrides?.[scanner];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] as string;
      if (line.length === 0 || line.length > maxLineLength) continue;
      if (line.includes(IGNORE_MARKER)) continue;

      for (const rule of rules) {
        if ((perRuleCount.get(rule.id) ?? 0) >= maxPerRule) continue;

        rule.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = rule.regex.exec(line)) !== null) {
          // Zero-width match guard — advance or exec() spins forever.
          if (match[0].length === 0) rule.regex.lastIndex++;

          const value = matchValue(match);
          const matched = rejects(rule, value, line, path, entropyGate)
            ? null
            : rule.classify
              ? rule.classify(value)
              : rule.severity;
          // A pinned severity still respects classify() dropping a match.
          const severity = matched === null ? null : (severityPin ?? matched);

          if (severity !== null) {
            const ruleId = `${rule.scanner}/${rule.id}`;
            findings.push({
              scanner: rule.scanner,
              ruleId,
              // Title only — the matched text is intentionally never included.
              message: rule.title,
              severity,
              location: { file: path, startLine: i + 1 },
              fingerprint: fingerprint([rule.scanner, ruleId, path, String(i + 1)]),
              fix: rule.fix,
            });

            const next = (perRuleCount.get(rule.id) ?? 0) + 1;
            perRuleCount.set(rule.id, next);
            if (next >= maxPerRule) break;
          }
        }
      }
    }

    if (timings) {
      timings.set(scanner, (timings.get(scanner) ?? 0) + (performance.now() - startedAt));
    }
  }

  return findings;
}

/** Applies path-shape rules (committed key files, env files, credential dumps). */
export function scanPath(path: string): NormalizedFinding[] {
  if (PATH_RULE_EXCLUDE.test(path)) return [];
  const findings: NormalizedFinding[] = [];
  for (const rule of PATH_RULES) {
    rule.regex.lastIndex = 0;
    if (!rule.regex.test(path)) continue;
    const ruleId = `${rule.scanner}/${rule.id}`;
    findings.push({
      scanner: rule.scanner,
      ruleId,
      message: rule.title,
      severity: rule.severity,
      location: { file: path },
      fingerprint: fingerprint([rule.scanner, ruleId, path]),
      fix: rule.fix,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

export type BuiltinScanOutcome = {
  findings: NormalizedFinding[];
  filesScanned: number;
  truncated: boolean;
  durationMs: number;
  /** Match time attributable to each rule family (excludes the shared I/O). */
  durationByScanner: Record<BuiltinScannerName, number>;
};

async function collectFiles(
  root: string,
  ignore: RegExp[],
  maxFileBytes: number,
): Promise<string[]> {
  const files: string[] = [];
  const queue: string[] = [root];

  while (queue.length > 0) {
    const dir = queue.pop() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable directory — skip, never abort the scan
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join("/");
      if (rel.length === 0) continue;
      if (ignore.some((re) => re.test(rel))) continue;

      // Symlinks are never followed: they can leave the target root entirely
      // and can form cycles. isDirectory() is false for links, so an explicit
      // check is required.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_FILENAMES.has(entry.name)) continue;
      if (SKIP_EXTENSIONS.has(extensionOf(entry.name))) continue;
      if (isMinified(entry.name)) continue;

      try {
        if ((await stat(full)).size > maxFileBytes) continue;
      } catch {
        continue;
      }
      files.push(full);
    }
  }

  return files.sort();
}

/**
 * Runs every built-in rule family over `root` in a single filesystem pass.
 * Never throws: unreadable files and directories are skipped.
 */
export async function runBuiltinScan(root: string, options?: BuiltinScanOptions): Promise<BuiltinScanOutcome> {
  const startedAt = performance.now();
  const maxFileBytes = options?.maxFileBytes ?? DEFAULTS.maxFileBytes;
  const maxFindings = options?.maxFindings ?? DEFAULTS.maxFindings;

  const ignore = await readIgnorePatterns(root, options?.extraIgnorePatterns);
  const files = await collectFiles(root, ignore, maxFileBytes);

  const findings: NormalizedFinding[] = [];
  const timings: ScannerTimings = new Map();
  let filesScanned = 0;
  let truncated = false;

  for (const full of files) {
    if (findings.length >= maxFindings) {
      truncated = true;
      break;
    }
    const rel = relative(root, full).split(sep).join("/");

    findings.push(...scanPath(rel));

    let content: string;
    try {
      content = await readFile(full, "utf8");
    } catch {
      continue;
    }
    // NUL byte ⇒ binary despite a text-looking extension.
    if (content.includes("\u0000")) continue;

    filesScanned++;
    findings.push(...scanContent(rel, content, options, timings));
  }

  return {
    findings: findings.slice(0, maxFindings),
    filesScanned,
    truncated: truncated || findings.length > maxFindings,
    durationMs: performance.now() - startedAt,
    durationByScanner: Object.fromEntries(
      (options?.scanners ?? BUILTIN_SCANNERS).map((s) => [s, timings.get(s) ?? 0]),
    ) as Record<BuiltinScannerName, number>,
  };
}

/** Splits a builtin outcome into per-family finding lists, preserving order. */
export function groupByScanner(
  findings: NormalizedFinding[],
): Record<BuiltinScannerName, NormalizedFinding[]> {
  const grouped = Object.fromEntries(BUILTIN_SCANNERS.map((s) => [s, [] as NormalizedFinding[]])) as Record<
    BuiltinScannerName,
    NormalizedFinding[]
  >;
  for (const finding of findings) {
    const bucket = grouped[finding.scanner as BuiltinScannerName];
    if (bucket) bucket.push(finding);
  }
  return grouped;
}
