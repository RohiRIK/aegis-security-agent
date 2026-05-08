import type { ProvisionResult } from "./types.ts";
type AvailabilityResult = {
    available: boolean;
    version: string;
    path: string;
};
export declare function isSemgrepAvailable(): Promise<AvailabilityResult>;
export declare function provisionSemgrep(version: string): Promise<ProvisionResult>;
export {};
