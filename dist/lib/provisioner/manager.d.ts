import { type ProvisionResult, type ScannerName, type ToolInfo } from "./types.ts";
export declare function getToolStatus(scanner: ScannerName): Promise<ToolInfo>;
export declare function installTool(scanner: ScannerName, _options?: {
    ci?: boolean;
}): Promise<ProvisionResult>;
export declare function removeTool(scanner: ScannerName): Promise<void>;
export declare function listTools(): Promise<ToolInfo[]>;
export declare function resolveToolPath(scanner: ScannerName): string | null;
export declare function _resetAutoUpdateCache(): void;
export declare function ensureLatest(scanner: ScannerName): Promise<void>;
