import type { PluginInput } from "@opencode-ai/plugin";
import type { AegisPolicy } from "../index.ts";
export declare function createBeforeHandler(policy: AegisPolicy, client?: PluginInput["client"]): (input: any, output: any) => Promise<void>;
