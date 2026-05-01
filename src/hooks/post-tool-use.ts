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

const HARNESS_DIR = resolve(import.meta.dir, "..", "..");
const AUDIT_LOG = join(HARNESS_DIR, ".harness", "audit.log");

type SemgrepResult = {
  check_id?: string;
  extra?: {
    severity?: string;
    message?: string;
  };
  start?: {
    line?: number;
  };
};

type SemgrepPayload = {
  results?: SemgrepResult[];
};

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

  if (["Write", "Edit", "write", "edit"].includes(toolName) && writtenFile.length > 0 && (await Bun.file(writtenFile).exists())) {
    const semgrep = Bun.spawn([
      "semgrep",
      "scan",
      "--config=p/security-audit",
      "--config=p/secrets",
      "--json",
      writtenFile,
    ], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const semgrepExitCode = await semgrep.exited;
    const semgrepOutput = semgrepExitCode === 0 ? await new Response(semgrep.stdout).text() : '{"results":[]}';
    const parsedSemgrep = JSON.parse(semgrepOutput) as SemgrepPayload;
    const results = Array.isArray(parsedSemgrep.results) ? parsedSemgrep.results : [];
    const errorResults = results.filter((result) => result.extra?.severity === "ERROR");

    if (errorResults.length > 0) {
      for (const result of errorResults) {
        writeStdout(`${JSON.stringify({
          rule: result.check_id,
          severity: result.extra?.severity,
          message: result.extra?.message,
          line: result.start?.line,
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
