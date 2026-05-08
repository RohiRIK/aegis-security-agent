import type { VerdictEvent } from "../lib/verdict-log.ts";
export type AegisTaskType = "full-audit" | "deep-scan" | "dependency-audit" | "auth-review" | "pre-merge-review" | "audit-override" | "infra-review";
export type AegisHandoffEvent = {
    source: "plugin" | "sisyphus" | "manual";
    trigger: string;
    task: AegisTaskType;
    targetFiles: string[];
    context: {
        pluginFinding?: string;
        overrideId?: string;
        branchName?: string;
        commitRange?: string;
    };
    timestamp: string;
};
export declare function createHandoffEvent(source: AegisHandoffEvent["source"], trigger: string, task: AegisTaskType, targetFiles: string[], context?: AegisHandoffEvent["context"]): AegisHandoffEvent;
export type { VerdictEvent };
