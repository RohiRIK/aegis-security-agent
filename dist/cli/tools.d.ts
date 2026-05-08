import type { ScannerName } from "../lib/provisioner/types.ts";
export type ToolsFlags = {
    tool?: ScannerName;
    all: boolean;
    ci: boolean;
};
export declare function parseToolsFlags(args: string[]): ToolsFlags;
export declare function runToolsInstall(flags: ToolsFlags): Promise<number>;
export declare function runToolsStatus(flags: ToolsFlags): Promise<number>;
export declare function runToolsRemove(flags: ToolsFlags): Promise<number>;
export declare function runToolsCommand(subcommand: string, args: string[]): Promise<number>;
