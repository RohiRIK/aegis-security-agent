import { type ProvisionResult, type ScannerName, type ToolInfo } from "./types.ts";
export declare function getToolStatus(scanner: ScannerName): Promise<ToolInfo>;
export declare function installTool(scanner: ScannerName, _options?: {
    ci?: boolean;
}): Promise<ProvisionResult>;
export declare function removeTool(scanner: ScannerName): Promise<void>;
export declare function listTools(): Promise<ToolInfo[]>;
export declare function resolveToolPath(scanner: ScannerName): string | null;
export declare function _resetAutoUpdateCache(): void;
/**
 * Reads the auto-update flag from the policy file. Extracted as an exported,
 * overridable seam so tests can stub the policy read instead of depending on
 * the real `aegis-policy.json` (which may set `tools.auto_update:false`).
 * Default-on when the file is missing/unparseable.
 */
export declare function _readAutoUpdatePolicy(): boolean;
/** Test-only: force the auto-update flag (pass undefined to restore real read). */
export declare function _setAutoUpdateOverride(value: boolean | undefined): void;
export declare function ensureLatest(scanner: ScannerName): Promise<void>;
