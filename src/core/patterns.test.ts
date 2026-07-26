import { describe, expect, test } from "bun:test";
import {
  BUILTIN_SCANNERS,
  classifyIpv4,
  classifyIpv6,
  looksLikePlaceholder,
  PATH_RULES,
  PATTERN_RULES,
  RULE_FIX_INDEX,
  rulesForScanner,
  shannonEntropy,
} from "./patterns.ts";

describe("shannonEntropy", () => {
  test("empty string is zero", () => {
    expect(shannonEntropy("")).toBe(0);
  });

  test("single repeated character is zero", () => {
    expect(shannonEntropy("aaaaaaaa")).toBe(0);
  });

  test("random-looking strings score above natural language", () => {
    expect(shannonEntropy("R7tQvXmZnKpBcDfGhJwLsYe3")).toBeGreaterThan(
      shannonEntropy("passwordpassword"),
    );
  });

  test("two equally frequent symbols is exactly 1 bit", () => {
    expect(shannonEntropy("abab")).toBeCloseTo(1, 10);
  });
});

describe("looksLikePlaceholder", () => {
  test.each([
    "AKIAIOSFODNN7EXAMPLE",
    "your-api-key-here",
    "${NPM_TOKEN}",
    "$GITHUB_TOKEN",
    "process.env.SECRET",
    "{{ secrets.DEPLOY_KEY }}",
    "changeme",
    "xxxxxxxxxx",
    "<my-token>",
    "000000000000",
  ])("flags %p", (value) => {
    expect(looksLikePlaceholder(value)).toBe(true);
  });

  test.each(["R7tQvXmZnKpBcDfGhJwLsYe3", "AKIAQYLPMN5HGBQWERTY"])(
    "does not flag %p",
    (value) => {
      expect(looksLikePlaceholder(value)).toBe(false);
    },
  );
});

describe("classifyIpv4", () => {
  test.each(["127.0.0.1", "0.0.0.0", "255.255.255.0", "169.254.169.254", "224.0.0.1", "192.0.2.5", "203.0.113.9"])(
    "drops reserved address %p",
    (ip) => {
      expect(classifyIpv4(ip)).toBeNull();
    },
  );

  test.each(["10.0.0.5", "192.168.1.1", "172.16.4.2", "172.31.255.254", "100.64.0.1"])(
    "grades private address %p as low",
    (ip) => {
      expect(classifyIpv4(ip)).toBe("low");
    },
  );

  test.each(["8.8.8.8", "1.1.1.1", "52.94.236.248", "172.32.0.1"])(
    "grades routable address %p as medium",
    (ip) => {
      expect(classifyIpv4(ip)).toBe("medium");
    },
  );
});

describe("classifyIpv6", () => {
  test.each([
    "::",
    "::1",
    "0000:0000:0000:0000:0000:0000:0000:0001",
    "fe80::1",
    "fe80:0000:0000:0000:0204:61ff:fe9d:f156",
    "fc00::1",
    "fd12:3456:789a::1",
    "ff02::1",
    "2001:db8::1",
    "2001:0db8:0000:0000:0000:0000:1428:57ab",
  ])("drops reserved address %p", (ip) => {
    expect(classifyIpv6(ip)).toBeNull();
  });

  test.each([
    "2607:f8b0:4004:800::200e", // aegis:ignore
    "2606:4700:4700::1111", // aegis:ignore
    "2a00:1450:4001:0815:0000:0000:0000:200e", // aegis:ignore
    "2001:4860:4860::8888", // aegis:ignore
  ])("grades routable address %p as low", (ip) => {
    expect(classifyIpv6(ip)).toBe("low");
  });

  test.each(["1:2:3", "1::2::3", "1:2:3:4:5:6:7:8:9", "not-an-address"])(
    "drops malformed literal %p",
    (ip) => {
      expect(classifyIpv6(ip)).toBeNull();
    },
  );

  test("compressed and expanded forms of the same address agree", () => {
    expect(classifyIpv6("2001:4860:4860::8888")).toBe( // aegis:ignore
      classifyIpv6("2001:4860:4860:0000:0000:0000:0000:8888"), // aegis:ignore
    );
  });
});

describe("rule catalog integrity", () => {
  const allRules = [...PATTERN_RULES, ...PATH_RULES];

  test("rule ids are unique within each scanner", () => {
    const ids = allRules.map((r) => `${r.scanner}/${r.id}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every content rule regex is global (lastIndex loops depend on it)", () => {
    for (const rule of PATTERN_RULES) {
      expect(rule.regex.flags).toContain("g");
    }
  });

  test("every rule carries actionable fix guidance", () => {
    for (const rule of allRules) {
      expect(rule.fix.length).toBeGreaterThan(20);
      expect(RULE_FIX_INDEX[`${rule.scanner}/${rule.id}`]).toBe(rule.fix);
    }
  });

  test("every rule belongs to a declared scanner family", () => {
    for (const rule of allRules) {
      expect(BUILTIN_SCANNERS).toContain(rule.scanner);
    }
  });

  test("every scanner family owns at least one rule", () => {
    for (const scanner of BUILTIN_SCANNERS) {
      expect(rulesForScanner(scanner).length).toBeGreaterThan(0);
    }
  });

  test("rule titles never look like captured values", () => {
    // Titles are rendered verbatim into reports; they must describe a shape.
    for (const rule of allRules) {
      expect(rule.title).not.toMatch(/AKIA|ghp_|xox[bp]-|BEGIN [A-Z ]*PRIVATE KEY/);
    }
  });
});
