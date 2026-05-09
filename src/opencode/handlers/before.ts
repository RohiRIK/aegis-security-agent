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
import { createEvent } from "../../events/types.ts";
import { emitEvent } from "../../events/emitter.ts";
import type { PluginInput } from "@opencode-ai/plugin";
import type { AegisPolicy } from "../index.ts";

export function createBeforeHandler(
  policy: AegisPolicy,
  client?: PluginInput["client"],
): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    if (["read", "write", "edit"].includes(input.tool)) {
      const filePath = output.args?.filePath ?? output.args?.path ?? "";
      if (filePath && checkSensitiveFile(filePath, policy.actions?.read_file?.deny_patterns ?? [])) {
        logAegis(client, "warn", `[AEGIS] ⚠️ sensitive file access — ${basename(filePath)}`);
        await emitEvent(
          createEvent("policy.match", "medium", filePath, `Sensitive file access: ${basename(filePath)}`, {
            source: "plugin",
            outcome: "warn",
            policy: { rule: "deny_patterns", action: input.tool },
          }),
        );
      }
    }

    if (input.tool !== "bash") return;

    const command = output.args?.command ?? "";

    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);
    if (matched) {
      logAegis(client, "warn", `[AEGIS] ⚠️ high-risk pattern detected — ${matched}`);
      await emitEvent(
        createEvent("policy.match", "high", command, `High-risk pattern: ${matched}`, {
          source: "plugin",
          outcome: "warn",
          policy: { rule: matched, action: "run_shell" },
        }),
      );
    }

    const pkg = parseInstallCommand(command);
    if (pkg) {
      await emitEvent(
        createEvent("install.warning", "info", command, `Install detected: ${pkg.packageName}`, {
          source: "plugin",
          evidence: { ecosystem: pkg.ecosystem, package: pkg.packageName },
        }),
      );

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
          await emitEvent(
            createEvent("scanner.summary", "medium", command, "Trivy scan timed out", {
              source: "plugin",
              outcome: "skip",
              degraded: true,
              evidence: { scanner: "trivy", package: pkg.packageName },
            }),
          );
        } else if (result.status === "ok" && result.exitCode === 1) {
          let parsed: { Results?: Array<{ Vulnerabilities?: unknown[] }> } = {};
          try {
            parsed = JSON.parse(result.stdout) as { Results?: Array<{ Vulnerabilities?: unknown[] }> };
          } catch { /* exit code is authoritative */ }
          const { summary } = proxyResult("trivy", parsed, { packageName: pkg.packageName });
          logAegis(client, "warn", `[AEGIS] ⚠️ Trivy found vulnerabilities — ${summary}`);
          await emitEvent(
            createEvent("scanner.finding", "high", command, `Trivy: ${pkg.packageName} — ${summary}`, {
              source: "plugin",
              outcome: "warn",
              evidence: { scanner: "trivy", package: pkg.packageName, summary },
            }),
          );
        } else if (result.status === "error") {
          logAegis(client, "warn", "[AEGIS] ⚠️ Trivy unavailable: dep scan skipped");
          await emitEvent(
            createEvent("scanner.summary", "low", command, "Trivy unavailable — scan skipped", {
              source: "plugin",
              outcome: "skip",
              evidence: { scanner: "trivy", status: "unavailable" },
            }),
          );
        }
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    }
  };
}
