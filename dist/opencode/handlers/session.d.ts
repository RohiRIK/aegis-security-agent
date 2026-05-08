import type { PluginInput } from "@opencode-ai/plugin";
/**
 * Bootstrap the `.aegis/` directory in the project root.
 * Idempotent, never throws.
 */
export declare function bootstrapAegisDir(directory: string, client?: PluginInput["client"]): Promise<void>;
