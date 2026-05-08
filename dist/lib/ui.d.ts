export declare const c: {
    bold: (s: string) => string;
    dim: (s: string) => string;
    green: (s: string) => string;
    red: (s: string) => string;
    yellow: (s: string) => string;
    cyan: (s: string) => string;
    white: (s: string) => string;
    gray: (s: string) => string;
    bgRed: (s: string) => string;
};
export declare const icon: {
    pass: string;
    fail: string;
    warn: string;
    info: string;
    shield: string;
    lock: string;
    fire: string;
};
export declare function print(text: string): void;
export declare function println(text?: string): void;
export declare function clearLine(): void;
export declare function printHeader(): void;
export type StepResult = "ok" | "warn" | "fail" | "skip";
export interface Step {
    label: string;
    run: () => Promise<{
        result: StepResult;
        detail?: string;
    }>;
}
export declare function runSteps(steps: Step[]): Promise<{
    passed: number;
    warned: number;
    failed: number;
}>;
export declare function printStatusTable(rows: Array<{
    label: string;
    value: string;
    ok: boolean;
}>): void;
