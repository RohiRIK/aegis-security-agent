import {
  checkSensitiveFile,
  makeLockfileContent,
  matchHighRiskPattern,
  parseInstallCommand,
} from "../../core/security.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { wrapTrivy } from "../../lib/scanner.ts";
import { logAegis } from "../../lib/aegis-log.ts";
import { proxyResult } from "../../lib/output-proxy.ts";
import type { PluginInput } from "@opencode-ai/plugin";
import type { AegisPolicy } from "../index.ts";

export function createBeforeHandler(
  policy: AegisPolicy,
  getPreflightPromise: () => Promise<void> | null,
  preflightPassed: () => boolean,
  client?: PluginInput["client"],
): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    let pp = getPreflightPromise();
    if (pp === null) {
      for (let i = 0; i < 10 && pp === null; i++) {
        await new Promise(r => setTimeout(r, 50));
        pp = getPreflightPromise();
      }
      if (pp === null) throw new Error("Preflight not initialized — tool calls blocked");
    }
    await pp;
    if (!preflightPassed()) logAegis(client, "warn", "[AEGIS] preflight checks incomplete — proceeding in degraded mode");

    if (["read", "write", "edit"].includes(input.tool)) {
      const filePath = output.args?.filePath ?? output.args?.path ?? "";
      if (filePath && checkSensitiveFile(filePath, policy.actions?.read_file?.deny_patterns ?? [])) {
        throw new Error(`BLOCKED: access to sensitive file denied — ${basename(filePath)}`);
      }
    }

    if (input.tool !== "bash") return;

    const command = output.args?.command ?? "";

    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);
    if (matched) throw new Error(`BLOCKED: HIGH-RISK pattern matched — ${matched}`);

    const pkg = parseInstallCommand(command);
    if (pkg) {
      const { filename, content } = makeLockfileContent(pkg);
      const scanDir = mkdtempSync(join(tmpdir(), "aegis-trivy-"));
      try {
        await Bun.write(join(scanDir, filename), content);
        const result = await wrapTrivy([
          "fs", "--scanners", "vuln",
          "--severity", "HIGH,CRITICAL",
          "--exit-code", "1",
          "--quiet", "--format", "json",
          scanDir,
        ]);

        if (result.degraded) {
          logAegis(client, "warn", "[AEGIS] ⚠️ Trivy DEGRADED: dep scan timed out");
        } else if (result.status === "ok" && result.exitCode === 1) {
          let parsed: { Results?: Array<{ Vulnerabilities?: unknown[] }> } = {};
          try {
            parsed = JSON.parse(result.stdout) as { Results?: Array<{ Vulnerabilities?: unknown[] }> };
          } catch { /* exit code is authoritative */ }
          const { summary } = proxyResult("trivy", parsed, { packageName: pkg.packageName });
          throw new Error(`BLOCKED by Trivy: ${summary}`);
        } else if (result.status === "error") {
          logAegis(client, "warn", "[AEGIS] ⚠️ Trivy unavailable: dep scan skipped");
        }
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    }
  };
}
