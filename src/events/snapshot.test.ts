import { describe, expect, test } from "bun:test";
import { createEvent, type AegisEventKind, type AegisEventSeverity } from "./types.ts";

function stableEvent(
  kind: AegisEventKind,
  severity: AegisEventSeverity,
  subject: string,
  message: string,
  overrides?: Partial<ReturnType<typeof createEvent>>,
) {
  const event = createEvent(kind, severity, subject, message, overrides);
  event.id = "00000000-0000-0000-0000-000000000000";
  event.ts = "2026-01-01T00:00:00.000Z";
  return event;
}

describe("AegisEvent format snapshots", () => {
  test("policy.match — high-risk pattern", () => {
    const event = stableEvent("policy.match", "high", "rm -rf /", "High-risk pattern: rm\\s+-rf", {
      source: "hook",
      outcome: "warn",
      policy: { rule: "rm\\s+-rf", action: "run_shell" },
    });
    expect(event).toMatchSnapshot();
  });

  test("policy.match — sensitive file access", () => {
    const event = stableEvent("policy.match", "medium", ".env.local", "Sensitive file access: .env.local", {
      source: "plugin",
      outcome: "warn",
      policy: { rule: "deny_patterns", action: "read" },
    });
    expect(event).toMatchSnapshot();
  });

  test("scanner.finding — semgrep", () => {
    const event = stableEvent("scanner.finding", "medium", "src/api/auth.ts", "Semgrep: auth.ts — 3 finding(s)", {
      source: "plugin",
      outcome: "warn",
      evidence: { scanner: "semgrep", file: "src/api/auth.ts", count: 3, summary: "3 findings" },
    });
    expect(event).toMatchSnapshot();
  });

  test("scanner.finding — trivy CVE", () => {
    const event = stableEvent("scanner.finding", "high", "bun add lodash", "Trivy: lodash — CVE-2021-23337", {
      source: "hook",
      outcome: "warn",
      evidence: { scanner: "trivy", package: "lodash", reason: "CVE-2021-23337" },
    });
    expect(event).toMatchSnapshot();
  });

  test("scanner.summary — degraded", () => {
    const event = stableEvent("scanner.summary", "medium", "bun add express", "Trivy scan timed out", {
      source: "plugin",
      outcome: "skip",
      degraded: true,
      evidence: { scanner: "trivy", package: "express" },
    });
    expect(event).toMatchSnapshot();
  });

  test("scanner.summary — verdict", () => {
    const event = stableEvent("scanner.summary", "info", "full repo", "full-audit: SAFE — C:0 H:0 M:1 L:2 I:3", {
      source: "agent",
      outcome: "allow",
      evidence: {
        verdict: "SAFE",
        task: "full-audit",
        findings: { critical: 0, high: 0, medium: 1, low: 2, info: 3 },
        degraded: [],
        commit: "abc1234",
        scope: "full repo",
      },
    });
    expect(event).toMatchSnapshot();
  });

  test("env.redaction", () => {
    const event = stableEvent("env.redaction", "info", "shell.env", "Redacted 2 sensitive var(s): AWS_SECRET_ACCESS_KEY, GITHUB_TOKEN", {
      source: "plugin",
      outcome: "allow",
      evidence: { redacted_vars: ["AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN"] },
    });
    expect(event).toMatchSnapshot();
  });

  test("permission.warning", () => {
    const event = stableEvent("permission.warning", "high", "kubectl apply -f deploy.yaml", "Permission escalation: kubectl apply", {
      source: "plugin",
      outcome: "warn",
      policy: { rule: "kubectl apply", action: "permission.ask" },
    });
    expect(event).toMatchSnapshot();
  });

  test("install.warning", () => {
    const event = stableEvent("install.warning", "info", "bun add axios", "Install detected: axios", {
      source: "hook",
      evidence: { ecosystem: "npm", package: "axios" },
    });
    expect(event).toMatchSnapshot();
  });

  test("session.start", () => {
    const event = stableEvent("session.start", "info", "/projects/myapp", "Aegis session started — .aegis/ bootstrapped", {
      source: "plugin",
      outcome: "allow",
      evidence: { directory: "/projects/myapp", hasGit: true },
    });
    expect(event).toMatchSnapshot();
  });

  test("session.end", () => {
    const event = stableEvent("session.end", "info", "/projects/myapp", "Aegis session ended", {
      source: "plugin",
      outcome: "allow",
    });
    expect(event).toMatchSnapshot();
  });
});
