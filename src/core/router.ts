import { matchHighRiskPattern } from "./security.ts";

export type RouteDecision = "host" | "sandbox" | "hitl";

export type RoutingPolicy = {
  high_risk_patterns?: string[];
  routing?: {
    host_passthrough?: string[];
    sandbox_required?: string[];
  };
};

/**
 * Determines where a command should execute based on policy patterns.
 *
 * Priority order:
 * 1. HITL (high-risk patterns) — always checked first
 * 2. Sandbox (sandbox_required patterns)
 * 3. Host (host_passthrough patterns)
 * 4. Default: sandbox (unknown commands are sandboxed)
 */
export function routeCommand(command: string, policy: RoutingPolicy): RouteDecision {
  if (!command) return "sandbox";

  const highRiskPatterns = Array.isArray(policy.high_risk_patterns) ? policy.high_risk_patterns : [];
  if (matchHighRiskPattern(command, highRiskPatterns) !== null) return "hitl";

  for (const pattern of policy.routing?.sandbox_required ?? []) {
    if (new RegExp(pattern).test(command)) return "sandbox";
  }

  for (const pattern of policy.routing?.host_passthrough ?? []) {
    if (new RegExp(pattern).test(command)) return "host";
  }

  return "sandbox";
}
