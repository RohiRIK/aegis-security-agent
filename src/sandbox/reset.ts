import { runCommandCapture, writeStderr, writeStdout } from "../lib/base.ts";

const CONTAINER = "aegis-sandbox";

async function main(): Promise<number> {
  const result = await runCommandCapture(["docker", "exec", CONTAINER, "bash", "-c", "rm -rf /workspace/*"]);
  if (result.exitCode !== 0) {
    return result.exitCode;
  }

  writeStdout("[sandbox] /workspace reset.\n");
  return 0;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
