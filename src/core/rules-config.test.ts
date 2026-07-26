import { describe, expect, test } from "bun:test";
import {
  defaultRulesConfig,
  enabledBuiltins,
  entropyOverride,
  isScannerEnabled,
  loadRulesConfig,
  parseRulesConfig,
  severityOverride,
  type RulesConfig,
  type ScannerSelection,
} from "./rules-config.ts";

// ---------------------------------------------------------------------------
// parseRulesConfig
// ---------------------------------------------------------------------------

describe("parseRulesConfig", () => {
  test("valid JSON with all fields", () => {
    const config = parseRulesConfig(
      JSON.stringify({
        exclude_paths: ["vendor", "node_modules"],
        scanners: {
          "gitleaks-replacement": { enabled: false, severity: "high" },
          "custom-patterns": { enabled: true, entropy_threshold: 4.2 },
        },
      }),
    );
    expect(config.exclude_paths).toEqual(["vendor", "node_modules"]);
    expect(config.scanners["gitleaks-replacement"]).toEqual({
      enabled: false,
      severity: "high",
    });
    expect(config.scanners["custom-patterns"]).toEqual({
      enabled: true,
      entropy_threshold: 4.2,
    });
  });

  test("malformed JSON returns defaults", () => {
    const config = parseRulesConfig("not json {{{");
    expect(config).toEqual(defaultRulesConfig());
  });

  test("null JSON value returns defaults", () => {
    const config = parseRulesConfig("null");
    expect(config).toEqual(defaultRulesConfig());
  });

  test("non-object JSON (string) returns defaults", () => {
    const config = parseRulesConfig('"hello"');
    expect(config).toEqual(defaultRulesConfig());
  });

  test("non-object JSON (array) returns defaults", () => {
    const config = parseRulesConfig("[]");
    expect(config).toEqual(defaultRulesConfig());
  });

  test("unknown keys at root are dropped", () => {
    const config = parseRulesConfig(
      JSON.stringify({ color: "blue", scanners: {} }),
    );
    expect(config).toEqual(defaultRulesConfig());
    expect((config as Record<string, unknown>).color).toBeUndefined();
  });

  test("partial scanner config with only some fields", () => {
    const config = parseRulesConfig(
      JSON.stringify({ scanners: { "path-traversal": { enabled: false } } }),
    );
    expect(config.scanners["path-traversal"]).toEqual({ enabled: false });
    expect(config.scanners["path-traversal"]?.severity).toBeUndefined();
    expect(config.scanners["path-traversal"]?.entropy_threshold).toBeUndefined();
  });

  test("non-string elements in exclude_paths are filtered out", () => {
    const config = parseRulesConfig(
      JSON.stringify({
        exclude_paths: ["safe", 42, null, true, "also-safe"],
      }),
    );
    expect(config.exclude_paths).toEqual(["safe", "also-safe"]);
  });

  test("wrong types in scanner config are silently ignored", () => {
    const config = parseRulesConfig(
      JSON.stringify({
        scanners: {
          test: {
            enabled: "yes",
            severity: 5,
            entropy_threshold: "high",
          },
        },
      }),
    );
    expect(config.scanners["test"]).toEqual({});
  });

  test("NaN entropy_threshold is rejected", () => {
    const config = parseRulesConfig(
      JSON.stringify({
        scanners: { test: { entropy_threshold: NaN } },
      }),
    );
    // JSON.stringify converts NaN to null, so this tests null handling
    expect(config.scanners["test"]).toEqual({});
  });

  test("Infinity entropy_threshold is rejected", () => {
    const config = parseRulesConfig(
      JSON.stringify({
        scanners: { test: { entropy_threshold: Infinity } },
      }),
    );
    // JSON.stringify converts Infinity to null
    expect(config.scanners["test"]).toEqual({});
  });

  test("valid finite entropy_threshold is accepted", () => {
    const config = parseRulesConfig(
      JSON.stringify({
        scanners: { test: { entropy_threshold: 3.5 } },
      }),
    );
    expect(config.scanners["test"]?.entropy_threshold).toBe(3.5);
  });

  test("unknown severity values are dropped", () => {
    const config = parseRulesConfig(
      JSON.stringify({
        scanners: { test: { severity: "critical-plus" } },
      }),
    );
    expect(config.scanners["test"]?.severity).toBeUndefined();
  });

  test("valid severity values are accepted", () => {
    const config = parseRulesConfig(
      JSON.stringify({
        scanners: { test: { severity: "critical" } },
      }),
    );
    expect(config.scanners["test"]?.severity).toBe("critical");
  });

  test("empty scanners object", () => {
    const config = parseRulesConfig(
      JSON.stringify({ exclude_paths: [], scanners: {} }),
    );
    expect(config.scanners).toEqual({});
    expect(config.exclude_paths).toEqual([]);
  });

  test("empty string input returns defaults", () => {
    // JSON.parse("") throws, so this returns defaults
    const config = parseRulesConfig("");
    expect(config).toEqual(defaultRulesConfig());
  });
});

// ---------------------------------------------------------------------------
// isScannerEnabled — precedence
// ---------------------------------------------------------------------------

const emptyCfg: RulesConfig = { exclude_paths: [], scanners: {} };
const selection = (
  overrides: Partial<ScannerSelection>,
): ScannerSelection => ({
  only: [],
  disabled: [],
  enableAll: false,
  ...overrides,
});

describe("isScannerEnabled", () => {
  test("disabled list overrides everything — name is disabled", () => {
    const sel = selection({ disabled: ["secret-scan"] });
    expect(isScannerEnabled("secret-scan", sel, emptyCfg)).toBe(false);
  });

  test("disabled wins over enableAll", () => {
    const sel = selection({ disabled: ["secret-scan"], enableAll: true });
    expect(isScannerEnabled("secret-scan", sel, emptyCfg)).toBe(false);
  });

  test("disabled wins over only", () => {
    const sel = selection({
      only: ["secret-scan", "other"],
      disabled: ["secret-scan"],
    });
    expect(isScannerEnabled("secret-scan", sel, emptyCfg)).toBe(false);
  });

  test("only list — included returns true", () => {
    const sel = selection({ only: ["custom-patterns"] });
    expect(isScannerEnabled("custom-patterns", sel, emptyCfg)).toBe(true);
  });

  test("only list — not included returns false", () => {
    const sel = selection({ only: ["custom-patterns"] });
    expect(isScannerEnabled("path-traversal", sel, emptyCfg)).toBe(false);
  });

  test("enableAll when no only/disabled returns true", () => {
    const sel = selection({ enableAll: true });
    expect(isScannerEnabled("any-scanner", sel, emptyCfg)).toBe(true);
  });

  test("config enabled:false disables by default", () => {
    const cfg: RulesConfig = {
      exclude_paths: [],
      scanners: { "gitleaks-replacement": { enabled: false } },
    };
    expect(isScannerEnabled("gitleaks-replacement", selection({}), cfg)).toBe(
      false,
    );
  });

  test("config enabled:true with no CLI overrides", () => {
    const cfg: RulesConfig = {
      exclude_paths: [],
      scanners: { "weak-crypto": { enabled: true } },
    };
    expect(isScannerEnabled("weak-crypto", selection({}), cfg)).toBe(true);
  });

  test("no config entry at all — default on", () => {
    expect(isScannerEnabled("hardcoded-ip", selection({}), emptyCfg)).toBe(
      true,
    );
  });

  test("config enabled:false but enableAll overrides", () => {
    const cfg: RulesConfig = {
      exclude_paths: [],
      scanners: { "weak-crypto": { enabled: false } },
    };
    const sel = selection({ enableAll: true });
    expect(isScannerEnabled("weak-crypto", sel, cfg)).toBe(true);
  });

  test("config enabled:false but on only list", () => {
    const cfg: RulesConfig = {
      exclude_paths: [],
      scanners: { "weak-crypto": { enabled: false } },
    };
    const sel = selection({ only: ["weak-crypto"] });
    expect(isScannerEnabled("weak-crypto", sel, cfg)).toBe(true);
  });

  test("scanner not in config.scanners map — default on", () => {
    const cfg: RulesConfig = {
      exclude_paths: [],
      scanners: { "gitleaks-replacement": { enabled: false } },
    };
    // "path-traversal" has no entry at all
    expect(isScannerEnabled("path-traversal", selection({}), cfg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// enabledBuiltins
// ---------------------------------------------------------------------------

describe("enabledBuiltins", () => {
  test("all builtin scanners enabled by default", () => {
    const enabled = enabledBuiltins(selection({}), emptyCfg);
    expect(enabled).toEqual([
      "gitleaks-replacement",
      "custom-patterns",
      "path-traversal",
      "hardcoded-ip",
      "weak-crypto",
    ]);
  });

  test("disabled list filters out selected scanners", () => {
    const enabled = enabledBuiltins(
      selection({ disabled: ["path-traversal", "hardcoded-ip"] }),
      emptyCfg,
    );
    expect(enabled).toEqual([
      "gitleaks-replacement",
      "custom-patterns",
      "weak-crypto",
    ]);
  });

  test("only list restricts to selected scanners", () => {
    const enabled = enabledBuiltins(
      selection({ only: ["weak-crypto", "custom-patterns"] }),
      emptyCfg,
    );
    expect(enabled).toEqual(["custom-patterns", "weak-crypto"]);
  });

  test("config disables some scanners", () => {
    const cfg: RulesConfig = {
      exclude_paths: [],
      scanners: {
        "gitleaks-replacement": { enabled: false },
        "custom-patterns": { enabled: false },
      },
    };
    const enabled = enabledBuiltins(selection({}), cfg);
    expect(enabled).toEqual([
      "path-traversal",
      "hardcoded-ip",
      "weak-crypto",
    ]);
  });

  test("disabled list combined with config", () => {
    const cfg: RulesConfig = {
      exclude_paths: [],
      scanners: { "weak-crypto": { enabled: false } },
    };
    const enabled = enabledBuiltins(
      selection({ disabled: ["custom-patterns"] }),
      cfg,
    );
    expect(enabled).toEqual([
      "gitleaks-replacement",
      "path-traversal",
      "hardcoded-ip",
    ]);
  });

  test("empty selection with everything configured off returns empty", () => {
    const cfg: RulesConfig = {
      exclude_paths: [],
      scanners: {
        "gitleaks-replacement": { enabled: false },
        "custom-patterns": { enabled: false },
        "path-traversal": { enabled: false },
        "hardcoded-ip": { enabled: false },
        "weak-crypto": { enabled: false },
      },
    };
    expect(enabledBuiltins(selection({}), cfg)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// severityOverride / entropyOverride
// ---------------------------------------------------------------------------

const overrideCfg: RulesConfig = {
  exclude_paths: [],
  scanners: {
    "gitleaks-replacement": { severity: "critical", entropy_threshold: 4.0 },
    "custom-patterns": { severity: "low" },
    "path-traversal": { entropy_threshold: 3.0 },
  },
};

describe("severityOverride", () => {
  test("returns severity when configured", () => {
    expect(severityOverride("gitleaks-replacement", overrideCfg)).toBe(
      "critical",
    );
  });

  test("returns undefined when scanner has no severity", () => {
    expect(severityOverride("path-traversal", overrideCfg)).toBeUndefined();
  });

  test("returns undefined for missing scanner", () => {
    expect(severityOverride("nonexistent", overrideCfg)).toBeUndefined();
  });

  test("returns undefined when config has no scanners at all", () => {
    expect(severityOverride("any", emptyCfg)).toBeUndefined();
  });
});

describe("entropyOverride", () => {
  test("returns threshold when configured", () => {
    expect(entropyOverride("gitleaks-replacement", overrideCfg)).toBe(4.0);
  });

  test("returns undefined when scanner has no threshold", () => {
    expect(entropyOverride("custom-patterns", overrideCfg)).toBeUndefined();
  });

  test("returns undefined for missing scanner", () => {
    expect(entropyOverride("nonexistent", overrideCfg)).toBeUndefined();
  });

  test("returns undefined when config has no scanners at all", () => {
    expect(entropyOverride("any", emptyCfg)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// loadRulesConfig — integration with tempdir
// ---------------------------------------------------------------------------

describe("loadRulesConfig", () => {
  test("absent file returns defaults", async () => {
    const dir = "/tmp/aegis-test-nonexistent-" + Date.now();
    const config = await loadRulesConfig(dir);
    expect(config).toEqual(defaultRulesConfig());
  });

  test("valid file returns parsed config", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const dir = await mkdtemp("/tmp/aegis-test-");
    try {
      await writeFile(
        join(dir, "aegis-rules.json"),
        JSON.stringify({
          exclude_paths: ["build"],
          scanners: {
            "hardcoded-ip": { enabled: false },
          },
        }),
      );
      const config = await loadRulesConfig(dir);
      expect(config.exclude_paths).toEqual(["build"]);
      expect(config.scanners["hardcoded-ip"]?.enabled).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// defaultRulesConfig
// ---------------------------------------------------------------------------

describe("defaultRulesConfig", () => {
  test("returns empty exclude_paths and scanners", () => {
    expect(defaultRulesConfig()).toEqual({
      exclude_paths: [],
      scanners: {},
    });
  });

  test("returns a fresh object each call", () => {
    expect(defaultRulesConfig()).not.toBe(defaultRulesConfig());
  });
});
