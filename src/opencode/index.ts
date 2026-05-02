import { join } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import { createBeforeHandler } from "./handlers/before.ts";
import { createAfterHandler } from "./handlers/after.ts";
import { createSessionHandler } from "./handlers/session.ts";
import { createEnvHandler } from "./handlers/env.ts";
import { createPermissionHandler } from "./handlers/permission.ts";
import { DEFAULT_SENSITIVE_VARS } from "../core/security.ts";

export type HarnessPolicy = {
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

function safe(handler: AnyHandler, opts?: { swallow?: boolean; onError?: () => void }): AnyHandler {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      if (opts?.swallow) {
        opts.onError?.();
      } else {
        throw err;
      }
    }
  };
}

export const HarnessSecurityPlugin: Plugin = async ({ directory }) => {
  const policy = JSON.parse(
    await Bun.file(join(directory, "aegis-policy.json")).text(),
  ) as HarnessPolicy;

  let preflightPassed = false;
  let preflightPromise: Promise<void> | null = null;

  const { handler: sessionHandler } = createSessionHandler(
    directory,
    (val) => { preflightPassed = val; },
    (p) => { preflightPromise = p; },
  );

  const beforeHandler = createBeforeHandler(
    policy,
    () => preflightPromise,
    () => preflightPassed,
  );

  const afterHandler = createAfterHandler();
  const envHandler = createEnvHandler(DEFAULT_SENSITIVE_VARS);
  const permissionHandler = createPermissionHandler(policy);

  return {
    "tool.execute.before": safe(beforeHandler as AnyHandler),
    "tool.execute.after": safe(afterHandler as AnyHandler),
    "event": safe(sessionHandler as AnyHandler, { swallow: true, onError: () => { preflightPassed = false; } }),
    "shell.env": safe(envHandler as AnyHandler),
    "permission.ask": safe(permissionHandler as AnyHandler),
  };
};

export default HarnessSecurityPlugin;
