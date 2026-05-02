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
import type { HarnessPolicy } from "../index.ts";

export function createBeforeHandler(
  policy: HarnessPolicy,
  getPreflightPromise: () => Promise<void> | null,
  preflightPassed: () => boolean,
): (input: any, output: any) => Promise<void> {
  return async (input: any, output: any) => {
    const pp = getPreflightPromise();
    if (pp === null) throw new Error("Preflight not initialized — tool calls blocked");
    await pp;
    if (!preflightPassed()) throw new Error("Preflight failed — tool calls blocked");

    if (["read", "write", "edit"].includes(input.tool)) {
      const filePath = output.args?.filePath ?? output.args?.path ?? "";
      if (filePath && checkSensitiveFile(filePath, policy.actions?.read_file?.deny_patterns ?? [])) {
        throw new Error(`BLOCKED: access to sensitive file denied — ${basename(filePath)}`);
      }
    }

    if (input.tool !== "bash") return;

    const command = output.args?.command ?? "";
    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);

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
          // Fail-open on timeout — same behavior as "trivy not installed"
          process.stderr.write("[AEGIS] ⚠️ Trivy DEGRADED: dep scan timed out\n");
        } else if (result.status === "ok" && result.exitCode === 1) {
          let vulnCount = 0;
          try {
            const parsed = JSON.parse(result.stdout) as { Results?: Array<{ Vulnerabilities?: unknown[] }> };
            vulnCount = parsed.Results?.reduce((sum, r) => sum + (r.Vulnerabilities?.length ?? 0), 0) ?? 0;
          } catch { /* exit code is authoritative */ }
          throw new Error(`BLOCKED by Trivy: ${pkg.packageName} — ${vulnCount} HIGH/CRITICAL CVE(s) found — upgrade to a patched version`);
        } else if (result.status === "error") {
          // Fail-open on error — scanner unavailable
          process.stderr.write("[AEGIS] ⚠️ Trivy unavailable: dep scan skipped\n");
        }
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    }

    const escaped = command.replace(/'/g, "'\\''");
    output.args ??= {};
    output.args.command = `docker exec aegis-sandbox bash -c '${escaped}'`;

    if (matched) throw new Error(`BLOCKED: HIGH-RISK pattern matched — ${matched}`);
  };
}
