import type { AegisPolicy } from "../index.ts";
type CompactionOutput = {
    context: string[];
    prompt?: string;
};
export declare function createCompactionHandler(policy: AegisPolicy): (output: CompactionOutput) => Promise<void>;
export {};
