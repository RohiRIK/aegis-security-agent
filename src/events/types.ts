export type AegisEventKind =
  | "policy.match"
  | "scanner.finding"
  | "scanner.summary"
  | "env.redaction"
  | "permission.warning"
  | "session.start"
  | "session.end"
  | "install.warning";

export type AegisEventSeverity = "critical" | "high" | "medium" | "low" | "info";

export type AegisEvent = {
  schema: "aegis/v1";
  id: string;
  ts: string;
  source: "plugin" | "hook" | "agent" | "cli";
  kind: AegisEventKind;
  severity: AegisEventSeverity;
  subject: string;
  outcome: "allow" | "warn" | "block" | "skip";
  message: string;
  evidence?: Record<string, unknown>;
  policy?: {
    rule?: string;
    action?: string;
  };
  correlation?: {
    sessionId?: string;
    toolCall?: string;
  };
  degraded?: boolean;
};

export function createEvent(
  kind: AegisEventKind,
  severity: AegisEventSeverity,
  subject: string,
  message: string,
  overrides?: Partial<AegisEvent>,
): AegisEvent {
  return {
    schema: "aegis/v1",
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    source: "plugin",
    kind,
    severity,
    subject,
    outcome: "warn",
    message,
    ...overrides,
  };
}
