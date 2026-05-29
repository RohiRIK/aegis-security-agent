import { createEvent, type AegisEvent } from "../events/types.ts";

function stableEvent(
  kind: Parameters<typeof createEvent>[0],
  severity: Parameters<typeof createEvent>[1],
  subject: string,
  message: string,
  overrides?: Partial<AegisEvent>,
): AegisEvent {
  const event = createEvent(kind, severity, subject, message, overrides);
  event.id = "00000000-0000-0000-0000-000000000000";
  event.ts = "2026-01-01T00:00:00.000Z";
  return event;
}

export const MIXED_SEMGREP_TRIVY_SESSION: AegisEvent[] = [
  stableEvent("session.start", "info", "/projects/myapp", "Aegis session started", {
    source: "plugin",
    outcome: "allow",
    evidence: { directory: "/projects/myapp", hasGit: true },
  }),

  stableEvent("scanner.finding", "high", "src/auth.ts", "Semgrep: auth.ts — 2 finding(s)", {
    source: "plugin",
    outcome: "warn",
    evidence: {
      scanner: "semgrep",
      file: "src/auth.ts",
      count: 2,
      findings: [
        {
          scanner: "semgrep",
          ruleId: "semgrep/jwt-hardcoded-secret",
          message: "Hardcoded JWT secret",
          severity: "high",
          location: { file: "src/auth.ts", startLine: 42 },
          fingerprint: "a1b2c3d4e5f6",
        },
        {
          scanner: "semgrep",
          ruleId: "semgrep/sql-injection",
          message: "SQL injection via string concat",
          severity: "high",
          location: { file: "src/auth.ts", startLine: 87, endLine: 90 },
          fingerprint: "f6e5d4c3b2a1",
        },
      ],
      detailPath: ".aegis/scans/abc123.json",
    },
    correlation: { sessionId: "test-session-001", toolCall: "call-001" },
  }),

  stableEvent("scanner.finding", "high", "bun add lodash@4.17.20", "Trivy: 1 CVE(s)", {
    source: "plugin",
    outcome: "warn",
    evidence: {
      scanner: "trivy",
      findings: [
        {
          scanner: "trivy",
          ruleId: "CVE-2021-23337",
          message: "Lodash command injection",
          severity: "critical",
          package: "lodash",
          fingerprint: "g7h8i9j0k1l2",
        },
      ],
      detailPath: ".aegis/scans/def456.json",
    },
    correlation: { sessionId: "test-session-001" },
  }),

  stableEvent("session.end", "info", "/projects/myapp", "Aegis session ended", {
    source: "plugin",
    outcome: "allow",
  }),
];

export const EMPTY_SESSION: AegisEvent[] = [
  stableEvent("session.start", "info", "/projects/myapp", "Aegis session started", {
    source: "plugin",
    outcome: "allow",
  }),
  stableEvent("session.end", "info", "/projects/myapp", "Aegis session ended", {
    source: "plugin",
    outcome: "allow",
  }),
];

export const LEGACY_EVENTS: AegisEvent[] = [
  stableEvent("scanner.finding", "medium", "src/app.ts", "Semgrep: 3 finding(s)", {
    source: "plugin",
    outcome: "warn",
    evidence: { scanner: "semgrep", file: "src/app.ts", count: 3 },
  }),
];
