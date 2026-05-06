import { join } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import { createBeforeHandler } from "./handlers/before.ts";
import { createAfterHandler } from "./handlers/after.ts";
import { createSessionHandler } from "./handlers/session.ts";
import { createCompactionHandler } from "./handlers/compaction.ts";
import { createEnvHandler } from "./handlers/env.ts";
import { createPermissionHandler } from "./handlers/permission.ts";
import { DEFAULT_SENSITIVE_VARS } from "../core/security.ts";

export type AegisPolicy = {
  high_risk_patterns?: string[];
  hitl_timeout_seconds?: number;
  routing?: {
    host_passthrough?: string[];
    sandbox_required?: string[];
  };
  degraded_mode?: {
    allow_host_passthrough?: boolean;
    block_sandbox_required?: boolean;
    warn_on_degraded?: boolean;
  };
  actions?: {
    read_file?: { default?: string; deny_patterns?: string[] };
    edit_file?: { default?: string; allow_patterns?: string[]; deny_patterns?: string[] };
    run_shell?: { default?: string; high_risk_patterns?: string[] };
    fetch_domain?: { default?: string; allow_list?: string[] };
    use_secret?: { default?: string; allowed_via?: string };
    approve_deploy?: { default?: string; hitl_timeout_seconds?: number };
  };
};

type AnyHandler = (...args: unknown[]) => Promise<void>;

/**
 * Wrap a handler so it NEVER throws — Aegis is advisory-only.
 * All errors are swallowed and logged to stderr for debugging.
 */
function safe(handler: AnyHandler, opts?: { onError?: () => void }): AnyHandler {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      console.error("[AEGIS] handler error (swallowed):", err instanceof Error ? err.message : String(err));
      opts?.onError?.();
    }
  };
}

export const AegisSecurityPlugin: Plugin = async ({ directory, client }) => {
  let policy: AegisPolicy = {};
  try {
    policy = JSON.parse(
      await Bun.file(join(directory, "aegis-policy.json")).text(),
    ) as AegisPolicy;
  } catch {
    console.error("[AEGIS] aegis-policy.json not found or invalid — running with empty policy");
  }

  let preflightPassed = false;
  let preflightRan = false;
  let preflightPromise: Promise<void> | null = null;
  let degraded = false;

  const { handler: sessionHandler } = createSessionHandler(
    directory,
    (val) => { preflightPassed = val; },
    (p) => { preflightPromise = p; },
    undefined,
    (val) => { degraded = val; },
    (val) => { preflightRan = val; },
    client,
  );

  const beforeHandler = createBeforeHandler(
    policy,
    () => preflightPromise,
    () => preflightPassed,
    client,
  );

  const afterHandler = createAfterHandler();
  const compactionHandler = createCompactionHandler(
    () => (preflightRan ? (preflightPassed ? "passed" : "failed") : "not-run"),
    () => degraded,
    policy,
  );
  const envHandler = createEnvHandler(DEFAULT_SENSITIVE_VARS);
  const permissionHandler = createPermissionHandler(policy);

  return {
    "tool.execute.before": safe(beforeHandler as AnyHandler),
    "tool.execute.after": safe(afterHandler as AnyHandler),
    "experimental.session.compacting": safe(compactionHandler as AnyHandler),
    "event": safe(sessionHandler as AnyHandler, { onError: () => { preflightPassed = false; } }),
    "shell.env": safe(envHandler as AnyHandler),
    "permission.ask": safe(permissionHandler as AnyHandler),
  };
};

export default AegisSecurityPlugin;
