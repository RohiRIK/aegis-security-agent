export type CommandResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
};
export declare function writeStdout(text: string): void;
export declare function writeStderr(text: string): void;
export declare function runCommandCapture(argv: string[], options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdinText?: string;
}): Promise<CommandResult>;
export declare function runCommandInherit(argv: string[], options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdout?: "inherit" | "ignore";
    stderr?: "inherit" | "ignore";
}): Promise<number>;
export declare function runShellCapture(command: string, options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdinText?: string;
}): Promise<CommandResult>;
export declare function ensureDir(dirPath: string): Promise<void>;
export declare function fileExists(filePath: string): Promise<boolean>;
export declare function deleteFileIfExists(filePath: string): Promise<void>;
export declare function appendText(filePath: string, text: string): Promise<void>;
export declare function formatTimestamp(): string;
export declare function shellQuote(value: string): string;
export declare function readStdinText(): Promise<string>;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function getString(record: Record<string, unknown>, key: string): string | undefined;
