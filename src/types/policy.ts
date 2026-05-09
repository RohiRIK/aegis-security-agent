export type AegisPolicy = {
  $schema?: string;
  version?: string;
  actions?: {
    read_file?: { default?: string; deny_patterns?: string[] };
    edit_file?: { default?: string; allow_patterns?: string[]; deny_patterns?: string[] };
    run_shell?: { default?: string; high_risk_patterns?: string[] };
    fetch_domain?: { default?: string; allow_list?: string[] };
    use_secret?: { default?: string; allowed_via?: string };
  };
  high_risk_patterns?: string[];
  routing?: {
    host_passthrough?: string[];
    sandbox_required?: string[];
  };
  degraded_mode?: {
    allow_host_passthrough?: boolean;
    block_sandbox_required?: boolean;
    warn_on_degraded?: boolean;
  };
  tools?: {
    enabled?: string[];
    auto_update?: boolean;
  };
};

export type PolicyDecision = {
  action: string;
  effect: "allow" | "warn" | "log";
  reason: string;
  pattern?: string;
};

const KNOWN_KEYS = new Set([
  "$schema", "version", "actions", "high_risk_patterns",
  "routing", "degraded_mode", "tools",
]);

const DEPRECATED_KEYS: Record<string, string> = {};

export function validatePolicy(raw: unknown): { policy: AegisPolicy; warnings: string[] } {
  const warnings: string[] = [];

  if (raw === null || raw === undefined || typeof raw !== "object") {
    warnings.push("Policy is not an object — using empty defaults");
    return { policy: { high_risk_patterns: [] }, warnings };
  }

  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      warnings.push(`Unknown policy key: "${key}" — ignored`);
    }
    if (key in DEPRECATED_KEYS) {
      warnings.push(DEPRECATED_KEYS[key]!);
    }
  }

  const patterns = obj.high_risk_patterns;
  if (Array.isArray(patterns)) {
    for (const pattern of patterns) {
      if (typeof pattern !== "string") continue;
      try {
        new RegExp(pattern);
      } catch {
        warnings.push(`Invalid regex in high_risk_patterns: "${pattern}"`);
      }
    }
  }

  const routing = obj.routing as Record<string, unknown> | undefined;
  if (routing && typeof routing === "object") {
    for (const field of ["host_passthrough", "sandbox_required"] as const) {
      const arr = routing[field];
      if (!Array.isArray(arr)) continue;
      for (const pattern of arr) {
        if (typeof pattern !== "string") continue;
        try {
          new RegExp(pattern);
        } catch {
          warnings.push(`Invalid regex in routing.${field}: "${pattern}"`);
        }
      }
    }
  }

  return { policy: obj as AegisPolicy, warnings };
}
