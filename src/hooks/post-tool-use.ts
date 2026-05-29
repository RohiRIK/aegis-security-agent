import { join } from "node:path";
import { basename } from "node:path";

import {
  ensureDir,
  getString,
  isRecord,
  writeStderr,
} from "../lib/base.ts";
import { wrapSemgrep } from "../lib/scanner.ts";
import { parseSemgrepFindings, semgrepToNormalized } from "../core/security.ts";
import { proxyResult } from "../lib/output-proxy.ts";
import { safeClaude } from "./safe-claude.ts";
import { createEvent } from "../events/types.ts";
import { emitEvent } from "../events/emitter.ts";

const PROJECT_DIR = process.cwd();
const AUDIT_LOG = join(PROJECT_DIR, ".aegis", "audit.jsonl");

async function hookLogic(parsedInput: Record<string, unknown>): Promise<Record<string, unknown>> {
  const toolName = getString(parsedInput, "tool_name") ?? getString(parsedInput, "tool") ?? "";
  const toolInput = isRecord(parsedInput.tool_input) ? parsedInput.tool_input : undefined;
  const writtenFile = toolInput ? getString(toolInput, "path") ?? getString(toolInput, "file_path") ?? "" : "";

  await ensureDir(join(PROJECT_DIR, ".aegis"));

  if (["Write", "Edit", "write", "edit"].includes(toolName) && writtenFile.length > 0 && (await Bun.file(writtenFile).exists())) {
    const semgrepResult = await wrapSemgrep(writtenFile);
    const errorResults = semgrepResult.status === "ok" ? parseSemgrepFindings(semgrepResult.stdout) : [];

    if (errorResults.length > 0) {
      for (const result of errorResults) {
        writeStderr(`[AEGIS] ${JSON.stringify({
          rule: result.rule,
          severity: result.severity,
          message: result.message,
          line: result.line,
        })}\n`);
      }

      const { summary, detailPath } = proxyResult("semgrep", errorResults, { filename: basename(writtenFile) });
      const normalized = semgrepToNormalized(errorResults, writtenFile);

      await emitEvent(
        createEvent("scanner.finding", "medium", writtenFile, `Semgrep: ${errorResults.length} finding(s)`, {
          source: "hook",
          outcome: "warn",
          evidence: {
            scanner: "semgrep",
            file: writtenFile,
            count: errorResults.length,
            findings: normalized,
            detailPath,
            summary,
          },
          correlation: {
            sessionId: process.env.AEGIS_SESSION_ID ?? process.pid.toString(),
          },
        }),
        AUDIT_LOG,
      );
    }
  }

  return parsedInput;
}

if (import.meta.main) {
  await safeClaude(hookLogic);
}

export { hookLogic };
