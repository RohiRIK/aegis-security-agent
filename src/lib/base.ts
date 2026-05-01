import { appendFileSync } from "node:fs";
import { dirname } from "node:path";

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export function writeStdout(text: string): void {
  process.stdout.write(text);
}

export function writeStderr(text: string): void {
  process.stderr.write(text);
}

function buildEnv(extraEnv?: Record<string, string | undefined>): Record<string, string> {
  const merged = { ...process.env, ...extraEnv };
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }

  return env;
}

async function streamToText(stream: ReadableStream<Uint8Array> | null | undefined): Promise<string> {
  if (!stream) {
    return "";
  }

  return await new Response(stream).text();
}

export async function runCommandCapture(
  argv: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdinText?: string;
  },
): Promise<CommandResult> {
  const stdin = options?.stdinText === undefined ? undefined : new TextEncoder().encode(options.stdinText);
  const proc = Bun.spawn(argv, {
    cwd: options?.cwd,
    env: buildEnv(options?.env),
    stdin,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    streamToText(proc.stdout),
    streamToText(proc.stderr),
  ]);

  return { exitCode, stdout, stderr };
}

export async function runCommandInherit(
  argv: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdout?: "inherit" | "ignore";
    stderr?: "inherit" | "ignore";
  },
): Promise<number> {
  const proc = Bun.spawn(argv, {
    cwd: options?.cwd,
    env: buildEnv(options?.env),
    stdout: options?.stdout ?? "inherit",
    stderr: options?.stderr ?? "inherit",
  });

  return await proc.exited;
}

export async function runShellCapture(
  command: string,
  options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdinText?: string;
  },
): Promise<CommandResult> {
  return await runCommandCapture(["bash", "-lc", command], options);
}

export async function ensureDir(dirPath: string): Promise<void> {
  const result = await runCommandCapture(["mkdir", "-p", dirPath]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to create directory: ${dirPath}`);
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  return await Bun.file(filePath).exists();
}

export async function deleteFileIfExists(filePath: string): Promise<void> {
  if (await fileExists(filePath)) {
    await Bun.file(filePath).delete();
  }
}

export async function appendText(filePath: string, text: string): Promise<void> {
  await ensureDir(dirname(filePath));
  appendFileSync(filePath, text, { encoding: "utf-8" });
}

export function formatTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export async function readStdinText(): Promise<string> {
  return await Bun.stdin.text();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}
