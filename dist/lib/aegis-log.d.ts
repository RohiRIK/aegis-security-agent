import type { PluginInput } from "@opencode-ai/plugin";
export type AegisLogLevel = "info" | "warn" | "error";
export declare function logAegis(client: PluginInput["client"] | undefined, level: AegisLogLevel, message: string): void;
