import { join, resolve } from "node:path";

import {
  appendText,
  ensureDir,
  formatTimestamp,
  getString,
  isRecord,
  readStdinText,
  writeStderr,
  writeStdout,
} from "../lib/base.ts";
import { wrapSemgrep } from "../lib/scanner.ts";
import { parseSemgrepFindings, type SemgrepFinding } from "../core/security.ts";

const HARNESS_DIR = resolve(import.meta.dir, "..", "..");
const AUDIT_LOG = join(HARNESS_DIR, ".aegis", "audit.log");

async function main(): Promise<number> {
  const inputText = await readStdinText();
  const parsedInput = JSON.parse(inputText) as unknown;
  if (!isRecord(parsedInput)) {
    throw new Error("Invalid hook input.");
  }

  const toolName = getString(parsedInput, "tool_name") ?? getString(parsedInput, "tool") ?? "";
  const toolInput = isRecord(parsedInput.tool_input) ? parsedInput.tool_input : undefined;
  const writtenFile = toolInput ? getString(toolInput, "path") ?? getString(toolInput, "file_path") ?? "" : "";

  await ensureDir(join(HARNESS_DIR, ".harness"));
  await ensureDir(join(HARNESS_DIR, ".aegis"));

  if (["Write", "Edit", "write", "edit"].includes(toolName) && writtenFile.length > 0 && (await Bun.file(writtenFile).exists())) {
    const semgrepResult = await wrapSemgrep(writtenFile);
    const errorResults = semgrepResult.status === "ok" ? parseSemgrepFindings(semgrepResult.stdout) : [];

    if (errorResults.length > 0) {
      for (const result of errorResults) {
        writeStdout(`${JSON.stringify({
          rule: result.rule,
          severity: result.severity,
          message: result.message,
          line: result.line,
        })}\n`);
      }

      await appendText(
        AUDIT_LOG,
        `${JSON.stringify({ timestamp: formatTimestamp(), event: "semgrep_finding", file: writtenFile, errors: errorResults.length })}\n`,
      );
    }
  }

  writeStdout(`${JSON.stringify(parsedInput)}\n`);
  return 0;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
