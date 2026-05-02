import { join, resolve } from "node:path";

import {
  deleteFileIfExists,
  fileExists,
  runShellCapture,
  writeStderr,
  writeStdout,
} from "./lib/base.ts";

const AEGIS_DIR = join(resolve(import.meta.dir, ".."), ".aegis");

async function main(): Promise<number> {
  const auditFlag = Bun.argv[2] ?? "";
  const leanCtxPath = join(AEGIS_DIR, "lean-ctx.db");
  const auditLogPath = join(AEGIS_DIR, "audit.log");

  if (auditFlag === "--audit") {
    writeStdout("[shred] Scanning .aegis/ for sensitive patterns before deletion...\n");
    const scan = await runShellCapture(`strings ${JSON.stringify(leanCtxPath)} 2>/dev/null | grep -iE 'password|secret|api_key|token' || true`);
    if (scan.stdout.trim().length > 0) {
      writeStdout(scan.stdout);
      if (!scan.stdout.endsWith("\n")) {
        writeStdout("\n");
      }
      writeStdout("[shred] WARNING: Potential sensitive data found in lean-ctx.db (above). Proceeding with shred.\n");
    } else {
      writeStdout("[shred] Scan clean — no sensitive patterns detected.\n");
    }
  }

  if (await fileExists(leanCtxPath)) {
    await deleteFileIfExists(leanCtxPath);
    writeStdout("[shred] Removed lean-ctx.db\n");
  }
  if (await fileExists(auditLogPath)) {
    await deleteFileIfExists(auditLogPath);
    writeStdout("[shred] Removed audit.log\n");
  }

  writeStdout("[shred] Done.\n");
  return 0;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
