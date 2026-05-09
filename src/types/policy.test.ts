import { describe, expect, test } from "bun:test";
import { validatePolicy } from "./policy.ts";

describe("validatePolicy", () => {
  test("returns empty policy with warning for null input", () => {
    const { policy, warnings } = validatePolicy(null);
    expect(policy.high_risk_patterns).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("not an object");
  });

  test("returns empty policy with warning for undefined input", () => {
    const { policy, warnings } = validatePolicy(undefined);
    expect(policy.high_risk_patterns).toEqual([]);
    expect(warnings[0]).toContain("not an object");
  });

  test("returns empty policy with warning for non-object input", () => {
    const { policy, warnings } = validatePolicy("string");
    expect(policy.high_risk_patterns).toEqual([]);
    expect(warnings[0]).toContain("not an object");
  });

  test("valid policy returns no warnings", () => {
    const { policy, warnings } = validatePolicy({
      high_risk_patterns: ["rm\\s+-rf"],
      routing: { host_passthrough: ["^git "] },
    });
    expect(warnings).toHaveLength(0);
    expect(policy.high_risk_patterns).toEqual(["rm\\s+-rf"]);
  });

  test("warns on unknown keys", () => {
    const { warnings } = validatePolicy({
      high_risk_patterns: [],
      unknown_field: true,
      another_bad_key: 42,
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("unknown_field");
    expect(warnings[1]).toContain("another_bad_key");
  });

  test("warns on removed hitl_timeout_seconds as unknown key", () => {
    const { warnings } = validatePolicy({
      hitl_timeout_seconds: 30,
    });
    expect(warnings.some((w) => w.includes("hitl_timeout_seconds") && w.includes("Unknown"))).toBe(true);
  });

  test("warns on invalid regex in high_risk_patterns", () => {
    const { warnings } = validatePolicy({
      high_risk_patterns: ["valid", "[invalid("],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("[invalid(");
  });

  test("warns on invalid regex in routing.host_passthrough", () => {
    const { warnings } = validatePolicy({
      routing: { host_passthrough: ["^git ", "[bad(regex"] },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("routing.host_passthrough");
  });

  test("warns on invalid regex in routing.sandbox_required", () => {
    const { warnings } = validatePolicy({
      routing: { sandbox_required: ["(unclosed"] },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("routing.sandbox_required");
  });

  test("still returns usable policy even with warnings", () => {
    const { policy, warnings } = validatePolicy({
      high_risk_patterns: ["valid-pattern", "[bad("],
      fake_key: true,
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(policy.high_risk_patterns).toEqual(["valid-pattern", "[bad("]);
  });
});
