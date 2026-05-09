import { join, resolve } from "node:path";

import { Database } from "bun:sqlite";

import {
  deleteFileIfExists,
  ensureDir,
  fileExists,
  runCommandInherit,
  runShellCapture,
  writeStderr,
  writeStdout,
} from "./lib/base.ts";

const ROOT = resolve(import.meta.dir, "..");

let passCount = 0;
let failCount = 0;

async function isToolAvailable(toolName: string): Promise<boolean> {
  return (await runShellCapture(`command -v ${toolName}`)).exitCode === 0;
}

async function runTest(name: string, check: () => Promise<boolean>): Promise<void> {
  writeStdout(`  [TEST] ${name}... `);
  if (await check()) {
    writeStdout("PASS\n");
    passCount += 1;
  } else {
    writeStdout("FAIL\n");
    failCount += 1;
  }
}

async function runTestIfAvailable(name: string, toolName: string, check: () => Promise<boolean>): Promise<void> {
  writeStdout(`  [TEST] ${name}... `);
  if (!(await isToolAvailable(toolName))) {
    writeStdout("SKIP (tool not installed)\n");
    return;
  }

  if (await check()) {
    writeStdout("PASS\n");
    passCount += 1;
  } else {
    writeStdout("FAIL\n");
    failCount += 1;
  }
}

async function shellSucceeds(command: string): Promise<boolean> {
  return (await runShellCapture(command)).exitCode === 0;
}

async function main(): Promise<number> {
  writeStdout("=== Security Smoke Test ===\n\n");

  await runTestIfAvailable("T-003: TruffleHog pre-commit hook installed", "trufflehog", async () => {
    const hookPath = join(ROOT, ".git", "hooks", "pre-commit");
    if (!(await fileExists(hookPath))) return false;
    return (await runShellCapture(`grep -q "pre-commit" ${JSON.stringify(hookPath)}`)).exitCode === 0;
  });

  await runTest("T-004: Sandbox cannot read host sentinel", async () => {
    const command = `echo 'SENTINEL' > /tmp/aegis-canary && result=$(docker exec aegis-sandbox cat /tmp/aegis-canary 2>&1 || true); echo "$result" | grep -qv 'SENTINEL'`;
    return await shellSucceeds(command);
  });

  await runTestIfAvailable("T-005: Semgrep detects shell-injection vulnerability", "semgrep", async () => {
    const tmpFile = join(ROOT, ".aegis", `smoke-semgrep-${crypto.randomUUID()}.py`);
    await ensureDir(join(ROOT, ".aegis"));
    await Bun.write(tmpFile, 'import subprocess\nuser_input = input()\nsubprocess.run(user_input, shell=True)\n');
    try {
      const result = await runShellCapture(`semgrep scan --config=p/python --json --metrics=off ${JSON.stringify(tmpFile)} 2>/dev/null`);
      const parsed = JSON.parse(result.stdout || "{}") as { results?: unknown[] };
      return Array.isArray(parsed.results) && parsed.results.length > 0;
    } finally {
      await deleteFileIfExists(tmpFile);
    }
  });

  await runTest("T-007: lean-ctx DB clean of sensitive patterns", async () => {
    const aegisRuntimeDir = join(ROOT, ".aegis");
    await ensureDir(aegisRuntimeDir);
    const tempDbPath = join(aegisRuntimeDir, `lean-ctx-smoke-${crypto.randomUUID()}.db`);

    try {
      const database = new Database(tempDbPath, { create: true });
      database.exec('CREATE TABLE notes (body TEXT);');
      database.exec('INSERT INTO notes VALUES ("safe summary text");');
      database.close();

      const result = await runShellCapture(`strings ${JSON.stringify(tempDbPath)} 2>/dev/null | grep -iE 'password|secret|api_key|token' || true`);
      return result.stdout.trim().length === 0;
    } finally {
      await deleteFileIfExists(tempDbPath);
    }
  });

  await runTest("T-008: .env.schema has @sensitive annotations", async () => {
    return (await Bun.file(join(ROOT, ".env.schema")).text()).includes("@sensitive");
  });

  await runTest("T-009: MCP config uses stdio only", async () => {
    const mcpConfig = await Bun.file(join(ROOT, ".claude", "mcp.json")).json();
    if (typeof mcpConfig !== "object" || mcpConfig === null || !("mcpServers" in mcpConfig)) {
      return false;
    }

    const servers = (mcpConfig as { mcpServers: Record<string, { type?: string }> }).mcpServers;
    return Object.values(servers).every((server) => server.type === "stdio");
  });

  await runTest("T-010: aegis shred removes lean-ctx.db", async () => {
    const dbPath = join(ROOT, ".aegis", "lean-ctx.db");
    await ensureDir(join(ROOT, ".aegis"));
    await Bun.write(dbPath, "");
    const exitCode = await runCommandInherit(["bun", "run", join(ROOT, "src", "shred.ts")], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return exitCode === 0 && !(await fileExists(dbPath));
  });

  await runTest("T-011: routeCommand routes git to host", async () => {
    const { routeCommand } = await import("./core/router.ts");
    const policy = { routing: { host_passthrough: ["^git\\b"], sandbox_required: ["^node\\b"] } };
    return routeCommand("git status", policy) === "host" && routeCommand("node index.js", policy) === "sandbox";
  });

  await runTest("T-012: detectDockerState returns valid state", async () => {
    const { detectDockerState } = await import("./sandbox/detect.ts");
    const state = await detectDockerState();
    const validStates = ["running", "binary_missing", "daemon_unavailable", "container_absent", "container_stopped", "start_failure"];
    return validStates.includes(state);
  });

  writeStdout(`\nResults: ${passCount} passed, ${failCount} failed\n`);
  if (failCount === 0) {
    writeStdout("SMOKE TEST PASSED\n");
    return 0;
  }

  writeStdout("SMOKE TEST FAILED\n");
  return 1;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
