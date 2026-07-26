import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AegisEventSeverity } from "../events/types.ts";
import { BUILTIN_SCANNERS, type BuiltinScannerName } from "./patterns.ts";

/**
 * Optional per-repo scanner configuration, read from `aegis-rules.json` at the
 * scan target's root. Everything is optional: an absent or malformed file
 * yields defaults, because a config parse error must never be the reason a
 * security scan does not run.
 */

export type ScannerConfig = {
  enabled?: boolean;
  /** Forces every finding from this scanner to a fixed severity. */
  severity?: AegisEventSeverity;
  /** Overrides the entropy gate for this scanner's entropy-gated rules. */
  entropy_threshold?: number;
};

export type RulesConfig = {
  /** Extra gitignore-style path patterns excluded from the built-in walk. */
  exclude_paths: string[];
  /** Per-scanner overrides, keyed by scanner name. */
  scanners: Record<string, ScannerConfig>;
};

export const RULES_CONFIG_FILENAME = "aegis-rules.json";

export function defaultRulesConfig(): RulesConfig {
  return { exclude_paths: [], scanners: {} };
}

const SEVERITIES: AegisEventSeverity[] = ["critical", "high", "medium", "low", "info"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseScannerConfig(raw: unknown): ScannerConfig {
  if (!isRecord(raw)) return {};
  const config: ScannerConfig = {};
  if (typeof raw.enabled === "boolean") config.enabled = raw.enabled;
  if (typeof raw.severity === "string" && SEVERITIES.includes(raw.severity as AegisEventSeverity)) {
    config.severity = raw.severity as AegisEventSeverity;
  }
  if (typeof raw.entropy_threshold === "number" && Number.isFinite(raw.entropy_threshold)) {
    config.entropy_threshold = raw.entropy_threshold;
  }
  return config;
}

/** Parses config text. Unknown keys and wrong types are dropped, never fatal. */
export function parseRulesConfig(text: string): RulesConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaultRulesConfig();
  }
  if (!isRecord(raw)) return defaultRulesConfig();

  const exclude_paths = Array.isArray(raw.exclude_paths)
    ? raw.exclude_paths.filter((p): p is string => typeof p === "string")
    : [];

  const scanners: Record<string, ScannerConfig> = {};
  if (isRecord(raw.scanners)) {
    for (const [name, value] of Object.entries(raw.scanners)) {
      scanners[name] = parseScannerConfig(value);
    }
  }

  return { exclude_paths, scanners };
}

/** Loads `aegis-rules.json` from a scan root; returns defaults when absent. */
export async function loadRulesConfig(root: string): Promise<RulesConfig> {
  try {
    return parseRulesConfig(await readFile(join(root, RULES_CONFIG_FILENAME), "utf8"));
  } catch {
    return defaultRulesConfig();
  }
}

// ---------------------------------------------------------------------------
// Scanner selection
// ---------------------------------------------------------------------------

export type ScannerSelection = {
  /** Explicit allowlist from `--scanners`; empty means "all". */
  only: string[];
  /** Names from `--scanner-disable`. */
  disabled: string[];
  /** `--scanner-enable-all` overrides config-level `enabled: false`. */
  enableAll: boolean;
};

export function emptySelection(): ScannerSelection {
  return { only: [], disabled: [], enableAll: false };
}

/**
 * Resolves whether a scanner runs, given CLI selection and file config.
 * Precedence: `--scanner-enable-all` > `--scanners` > `--scanner-disable` >
 * config `enabled` > default on. CLI beats file so an operator can always
 * override a checked-in config without editing the repo.
 */
export function isScannerEnabled(
  name: string,
  selection: ScannerSelection,
  config: RulesConfig,
): boolean {
  if (selection.disabled.includes(name)) return false;
  if (selection.only.length > 0) return selection.only.includes(name);
  if (selection.enableAll) return true;
  return config.scanners[name]?.enabled !== false;
}

/** Built-in families left enabled after selection + config are applied. */
export function enabledBuiltins(
  selection: ScannerSelection,
  config: RulesConfig,
): BuiltinScannerName[] {
  return BUILTIN_SCANNERS.filter((name) => isScannerEnabled(name, selection, config));
}

/** Severity override for a scanner, when the config pins one. */
export function severityOverride(name: string, config: RulesConfig): AegisEventSeverity | undefined {
  return config.scanners[name]?.severity;
}

/** Entropy-gate override for a scanner, when the config sets one. */
export function entropyOverride(name: string, config: RulesConfig): number | undefined {
  return config.scanners[name]?.entropy_threshold;
}
