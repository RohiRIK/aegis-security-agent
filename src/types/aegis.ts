export type AegisTaskType =
  | "full-audit"
  | "deep-scan"
  | "dependency-audit"
  | "auth-review"
  | "pre-merge-review"
  | "audit-override"
  | "infra-review";

export type AegisHandoffEvent = {
  triggerType: AegisTaskType;
  scopePaths: string[];
  auditLogEventIds: string[];
  scannerFindings: {
    semgrep: { count: number; maxSeverity: string } | null;
    trivy: { count: number; maxSeverity: string } | null;
    trufflehog: { count: number } | null;
  };
  branch: string;
  commit: string;
  timestamp: string;
};
