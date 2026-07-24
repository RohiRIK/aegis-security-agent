import { describe, expect, test } from "bun:test";
import {
  computeVerdict,
  emptyCounts,
  tallySeverities,
  VERDICT_EXIT_CODE,
} from "./verdict.ts";
import type { NormalizedFinding } from "../events/types.ts";

function finding(severity: NormalizedFinding["severity"]): NormalizedFinding {
  return { scanner: "semgrep", ruleId: "r", message: "m", severity };
}

describe("computeVerdict", () => {
  test("clean → SAFE", () => {
    expect(computeVerdict(emptyCounts())).toBe("SAFE");
  });
  test("low/info only → SAFE", () => {
    expect(computeVerdict({ critical: 0, high: 0, medium: 0, low: 5, info: 9 })).toBe("SAFE");
  });
  test("medium → RISKY", () => {
    expect(computeVerdict({ critical: 0, high: 0, medium: 1, low: 0, info: 0 })).toBe("RISKY");
  });
  test("high → RISKY", () => {
    expect(computeVerdict({ critical: 0, high: 2, medium: 0, low: 0, info: 0 })).toBe("RISKY");
  });
  test("critical dominates → BLOCKED", () => {
    expect(computeVerdict({ critical: 1, high: 9, medium: 9, low: 9, info: 9 })).toBe("BLOCKED");
  });
});

describe("tallySeverities", () => {
  test("counts by severity", () => {
    const counts = tallySeverities([finding("high"), finding("high"), finding("low"), finding("critical")]);
    expect(counts).toEqual({ critical: 1, high: 2, medium: 0, low: 1, info: 0 });
  });
});

describe("VERDICT_EXIT_CODE", () => {
  test("maps to headless contract", () => {
    expect(VERDICT_EXIT_CODE).toEqual({ SAFE: 0, RISKY: 1, BLOCKED: 2 });
  });
});
