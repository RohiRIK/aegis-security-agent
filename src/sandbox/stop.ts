import { runCommandCapture, writeStderr, writeStdout } from "../lib/base.ts";

const CONTAINER = "aegis-sandbox";

async function main(): Promise<number> {
  const running = await runCommandCapture(["docker", "ps", "--filter", `name=${CONTAINER}`, "--format", "{{.Names}}"]);
  if (running.stdout.includes(CONTAINER)) {
    const stopResult = await runCommandCapture(["docker", "stop", CONTAINER]);
    if (stopResult.exitCode !== 0) {
      return stopResult.exitCode;
    }

    const removeResult = await runCommandCapture(["docker", "rm", CONTAINER]);
    if (removeResult.exitCode !== 0) {
      return removeResult.exitCode;
    }

    writeStdout(`[sandbox] ${CONTAINER} stopped and removed.\n`);
  } else {
    writeStdout(`[sandbox] ${CONTAINER} not running.\n`);
  }

  return 0;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
