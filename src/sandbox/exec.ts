import { join, resolve } from "node:path";

import { runCommandInherit, writeStderr } from "../lib/base.ts";

const CONTAINER = "aegis-sandbox";
const AEGIS_DIR = resolve(import.meta.dir, "..", "..");

async function main(): Promise<number> {
  const command = Bun.argv[2];
  if (!command) {
    writeStderr('Usage: exec.ts "<command>"\n');
    return 1;
  }

  const executionExitCode = await runCommandInherit(["docker", "exec", CONTAINER, "bash", "-c", command]);
  await runCommandInherit(["bun", "run", join(AEGIS_DIR, "src", "sandbox", "reset.ts")], {
    stdout: "ignore",
    stderr: "ignore",
  });

  return executionExitCode;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
