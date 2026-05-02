import { matchHighRiskPattern } from "./security.ts";

export type RouteDecision = "host" | "sandbox" | "hitl";

const CHAIN_OPERATOR_PATTERN = /&&|\|\||;|\|/;
const SAFE_CHAIN_COMMANDS = new Set(["exit", "head"]);

export type RoutingPolicy = {
  high_risk_patterns?: string[];
  routing?: {
    host_passthrough?: string[];
    sandbox_required?: string[];
  };
};

function splitCommandSegments(command: string): string[] {
  return command
    .split(CHAIN_OPERATOR_PATTERN)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function extractBaseCommand(segment: string): string {
  return segment.trim().split(/\s+/, 1)[0] ?? "";
}

function matchesRoutingPatterns(segment: string, patterns: string[]): boolean {
  const baseCommand = extractBaseCommand(segment);
  const normalizedBaseCommand = baseCommand ? `${baseCommand} ` : "";

  return patterns.some((pattern) => {
    const matcher = new RegExp(pattern);
    return matcher.test(segment) || matcher.test(baseCommand) || matcher.test(normalizedBaseCommand);
  });
}

function isSafeChainCommand(segment: string): boolean {
  return SAFE_CHAIN_COMMANDS.has(extractBaseCommand(segment));
}

function routeSingleSegment(segment: string, policy: RoutingPolicy): RouteDecision {
  const highRiskPatterns = Array.isArray(policy.high_risk_patterns) ? policy.high_risk_patterns : [];
  if (matchHighRiskPattern(segment, highRiskPatterns) !== null) return "hitl";

  const sandboxRequired = policy.routing?.sandbox_required ?? [];
  if (matchesRoutingPatterns(segment, sandboxRequired)) return "sandbox";

  const hostPassthrough = policy.routing?.host_passthrough ?? [];
  if (matchesRoutingPatterns(segment, hostPassthrough)) return "host";

  return "sandbox";
}

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

  const segments = splitCommandSegments(command);
  if (segments.length === 0) return "sandbox";

  const hasChainOperators = segments.length > 1;
  const decisions = segments.map((segment) => {
    if (hasChainOperators && isSafeChainCommand(segment)) return "host";
    return routeSingleSegment(segment, policy);
  });

  if (decisions.includes("hitl")) return "hitl";
  if (decisions.includes("sandbox")) return "sandbox";
  if (decisions.every((decision) => decision === "host")) return "host";

  return "sandbox";
}
