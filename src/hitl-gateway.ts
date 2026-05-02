import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { appendText, ensureDir, formatTimestamp, writeStderr, writeStdout } from "./lib/base.ts";

const HARNESS_DIR = resolve(import.meta.dir, "..");
const AUDIT_LOG = join(HARNESS_DIR, ".aegis", "audit.log");

type HitlRequest = {
  hitl_request?: {
    id?: string;
    action?: {
      tool?: string;
      command?: string;
      risk_reason?: string;
      reversible?: boolean;
    };
  };
};

async function readDecision(timeoutSeconds: number): Promise<string> {
  const interfaceHandle = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  try {
    const response = await Promise.race<string | symbol>([
      interfaceHandle.question(""),
      new Promise<symbol>((resolvePromise) => {
        setTimeout(() => resolvePromise(Symbol.for("timeout")), timeoutSeconds * 1000);
      }),
    ]);

    if (typeof response !== "string") {
      return "timeout-deny";
    }

    return response === "approve" ? "approve" : "deny";
  } finally {
    interfaceHandle.close();
  }
}

async function main(): Promise<number> {
  const requestJson = Bun.argv[2];
  if (!requestJson) {
    writeStderr("Usage: hitl-gateway.ts '<hitl_request_json>'\n");
    return 1;
  }

  const timeoutSeconds = Number.parseInt(process.env.HITL_TIMEOUT_SECONDS ?? "120", 10);
  let parsed: HitlRequest;
  try {
    parsed = JSON.parse(requestJson) as HitlRequest;
  } catch (e) {
    process.stderr.write(`[hitl-gateway] Invalid JSON input: ${e}\n`);
    process.exit(1);
  }
  const tool = parsed.hitl_request?.action?.tool ?? "";
  const command = parsed.hitl_request?.action?.command ?? "";
  const riskReason = parsed.hitl_request?.action?.risk_reason ?? "";
  const reversible = parsed.hitl_request?.action?.reversible ? "YES" : "NO";

  await ensureDir(join(HARNESS_DIR, ".harness"));
  await ensureDir(join(HARNESS_DIR, ".aegis"));

  writeStdout("+--------------------------------------------------------------+\n");
  writeStdout("|  WARNING: HITL GATEWAY -- HIGH-RISK ACTION REQUIRES APPROVAL |\n");
  writeStdout("+--------------------------------------------------------------+\n");
  writeStdout(`| Tool:       ${tool}\n`);
  writeStdout(`| Command:    ${command}\n`);
  writeStdout(`| Risk:       ${riskReason}\n`);
  writeStdout(`| Reversible: ${reversible}\n`);
  writeStdout("+--------------------------------------------------------------+\n");
  writeStdout("| Type 'approve' to allow, anything else to deny.             |\n");
  writeStdout(`| Auto-deny in ${timeoutSeconds} seconds.${" ".repeat(Math.max(0, 46 - String(timeoutSeconds).length))}|\n`);
  writeStdout("+--------------------------------------------------------------+\n");

  const decision = await readDecision(timeoutSeconds);
  const requestId = parsed.hitl_request?.id ?? "";
  const user = process.env.USER ?? "";
  await appendText(
    AUDIT_LOG,
    `${JSON.stringify({ timestamp: formatTimestamp(), event: "hitl_decision", id: requestId, decision, user })}\n`,
  );

  if (decision === "approve") {
    writeStdout("Approved.\n");
    return 0;
  }

  writeStdout(`Denied (${decision}).\n`);
  return 1;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
