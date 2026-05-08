export type VerdictEvent = {
    type: "aegis_verdict";
    ts: string;
    task: string;
    verdict: "SAFE" | "RISKY" | "BLOCKED";
    findings: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
    degraded: string[];
    commit: string;
    scope: string;
};
export declare function formatVerdictEvent(event: Omit<VerdictEvent, "type" | "ts">): string;
export declare function appendVerdictEvent(auditLogPath: string, event: Omit<VerdictEvent, "type" | "ts">): Promise<void>;
export declare function readRecentVerdicts(auditLogPath: string, count: number): Promise<VerdictEvent[]>;
