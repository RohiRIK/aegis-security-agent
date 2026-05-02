import { writeStderr, writeStdout, runCommandCapture, runCommandInherit } from "../lib/base.ts";

const CONTAINER = "aegis-sandbox";

async function main(): Promise<number> {
  const running = await runCommandCapture([
    "docker",
    "ps",
    "--filter",
    `name=${CONTAINER}`,
    "--filter",
    "status=running",
    "--format",
    "{{.Names}}",
  ]);
  if (running.stdout.includes(CONTAINER)) {
    writeStdout(`[sandbox] Container '${CONTAINER}' already running.\n`);
    return 0;
  }

  const existing = await runCommandCapture(["docker", "ps", "-a", "--filter", `name=${CONTAINER}`, "--format", "{{.Names}}"]);
  if (existing.stdout.includes(CONTAINER)) {
    writeStdout("[sandbox] Removing stale container...\n");
    const removeExitCode = await runCommandCapture(["docker", "rm", "-f", CONTAINER]);
    if (removeExitCode.exitCode !== 0) {
      return removeExitCode.exitCode;
    }
  }

  writeStdout(`[sandbox] Starting ${CONTAINER}...\n`);
  const runExitCode = await runCommandInherit([
    "docker",
    "run",
    "-d",
    "--name",
    CONTAINER,
    "--security-opt",
    "no-new-privileges",
    "--user",
    "65534:65534",
    "--network",
    "none",
    "--memory",
    "2g",
    "--cpus",
    "2",
    "--read-only",
    "--tmpfs",
    "/workspace:rw,size=500m",
    "--tmpfs",
    "/tmp:rw,size=100m",
    "ubuntu:22.04",
    "tail",
    "-f",
    "/dev/null",
  ]);
  if (runExitCode !== 0) {
    return runExitCode;
  }

  writeStdout(`[sandbox] ${CONTAINER} ready.\n`);
  return 0;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
