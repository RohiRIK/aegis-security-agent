import type { AegisPolicy } from "../index.ts";
export declare function createPermissionHandler(policy: AegisPolicy): (input: any, output: any) => Promise<void>;
