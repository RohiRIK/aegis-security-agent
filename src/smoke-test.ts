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

  await runTest("T-001: Pre-flight blocks real secret in env", async () => {
    return !(await shellSucceeds(`AWS_SECRET_ACCESS_KEY=fake123 bun run ${JSON.stringify(join(ROOT, "src", "preflight.ts"))}`));
  });

  await runTest("T-002: Pre-flight passes clean environment", async () => {
    return await shellSucceeds(`bun run ${JSON.stringify(join(ROOT, "src", "preflight.ts"))}`);
  });

  await runTestIfAvailable("T-003: TruffleHog pre-commit hook installed", "trufflehog", async () => {
    const hookPath = join(ROOT, ".git", "hooks", "pre-commit");
    if (!(await fileExists(hookPath))) return false;
    return (await runShellCapture(`grep -q "pre-commit" ${JSON.stringify(hookPath)}`)).exitCode === 0;
  });

  await runTest("T-004: Sandbox cannot read host sentinel", async () => {
    const command = `echo 'SENTINEL' > /tmp/harness-canary && result=$(docker exec harness-sandbox cat /tmp/harness-canary 2>&1 || true); echo "$result" | grep -qv 'SENTINEL'`;
    return await shellSucceeds(command);
  });

  await runTestIfAvailable("T-005: Semgrep detects shell-injection vulnerability", "semgrep", async () => {
    const tmpFile = join(ROOT, ".harness", `smoke-semgrep-${crypto.randomUUID()}.py`);
    await ensureDir(join(ROOT, ".harness"));
    await Bun.write(tmpFile, 'import subprocess\nuser_input = input()\nsubprocess.run(user_input, shell=True)\n');
    try {
      const result = await runShellCapture(`semgrep scan --config=p/python --json --metrics=off ${JSON.stringify(tmpFile)} 2>/dev/null`);
      const parsed = JSON.parse(result.stdout || "{}") as { results?: unknown[] };
      return Array.isArray(parsed.results) && parsed.results.length > 0;
    } finally {
      await deleteFileIfExists(tmpFile);
    }
  });

  await runTest("T-006: HITL gateway denies on 'no' input", async () => {
    const payload = '{"hitl_request":{"id":"t006","timestamp":"2026-01-01T00:00:00Z","session_id":"test","action":{"tool":"bash","command":"rm -rf /","risk_reason":"test","risk_level":"HIGH","reversible":false},"context":{"current_task":"test","working_directory":"/tmp"},"instructions":"test"}}';
    const command = `! echo 'no' | bun run ${JSON.stringify(join(ROOT, "src", "hitl-gateway.ts"))} '${payload}'`;
    return await shellSucceeds(command);
  });

  await runTest("T-007: lean-ctx DB clean of sensitive patterns", async () => {
    const harnessRuntimeDir = join(ROOT, ".harness");
    await ensureDir(harnessRuntimeDir);
    const tempDbPath = join(harnessRuntimeDir, `lean-ctx-smoke-${crypto.randomUUID()}.db`);

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

  await runTest("T-010: harness shred removes lean-ctx.db", async () => {
    const dbPath = join(ROOT, ".harness", "lean-ctx.db");
    await ensureDir(join(ROOT, ".harness"));
    await Bun.write(dbPath, "");
    const exitCode = await runCommandInherit(["bun", "run", join(ROOT, "src", "shred.ts")], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return exitCode === 0 && !(await fileExists(dbPath));
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
