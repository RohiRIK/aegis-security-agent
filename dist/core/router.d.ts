import type { AegisPolicy } from "../types/policy.ts";
export type RouteDecision = "host" | "sandbox" | "hitl";
/**
 * Determines where a command should execute based on policy patterns.
 *
 * Priority order:
 * 1. HITL (high-risk patterns) — always checked first
 * 2. Sandbox (sandbox_required patterns)
 * 3. Host (host_passthrough patterns)
 * 4. Default: sandbox (unknown commands are sandboxed)
 */
export declare function routeCommand(command: string, policy: Pick<AegisPolicy, "high_risk_patterns" | "routing">): RouteDecision;
