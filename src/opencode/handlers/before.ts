import {
  checkSensitiveFile,
  makeLockfileContent,
  matchHighRiskPattern,
  parseInstallCommand,
} from "../../core/security.ts";
import { basename } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessPolicy } from "../index.ts";
import { runCommandCapture } from "../../lib/base.ts";
import { wrapTrivy } from "../../lib/scanner.ts";

async function scanPackageWithTrivy(pkg: ReturnType<typeof parseInstallCommand> extends Promise<infer _T> ? never : NonNullable<ReturnType<typeof parseInstallCommand>>): Promise<{ blocked: boolean; reason: string; degraded: boolean }> {
  const trivyCheck = await runCommandCapture(["bash", "-c", "command -v trivy"]);
  if (trivyCheck.exitCode !== 0) {
    return { blocked: false, reason: "trivy not installed — scan skipped", degraded: false };
  }

  const { filename, content } = makeLockfileContent(pkg);
  const scanDir = await mkdtemp(join(tmpdir(), "harness-trivy-"));

  try {
    await Bun.write(join(scanDir, filename), content);

    const result = await wrapTrivy([
      "fs",
      "--scanners", "vuln",
      "--severity", "HIGH,CRITICAL",
      "--exit-code", "1",
      "--quiet",
      "--format", "json",
      scanDir,
    ]);

    if (result.degraded) {
      return { blocked: false, reason: "trivy scan timed out", degraded: true };
    }

    if (result.status === "ok" && result.exitCode === 1) {
      let vulnCount = 0;
      try {
        const parsed = JSON.parse(result.stdout) as { Results?: Array<{ Vulnerabilities?: unknown[] }> };
        vulnCount = parsed.Results?.reduce((sum, item) => sum + (item.Vulnerabilities?.length ?? 0), 0) ?? 0;
      } catch {
        // ignore parse errors — exit code is authoritative
      }

      return {
        blocked: true,
        reason: `${vulnCount} HIGH/CRITICAL CVE(s) found — upgrade to a patched version`,
        degraded: false,
      };
    }

    return { blocked: false, reason: "clean", degraded: false };
  } finally {
    await rm(scanDir, { recursive: true, force: true });
  }
}

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
      const { blocked, reason, degraded } = await scanPackageWithTrivy(pkg);
      if (degraded) {
        process.stderr.write("[HARNESS] ⚠️ Trivy DEGRADED: scan timed out after 60s; continuing without blocking\n");
      }
      if (blocked) throw new Error(`BLOCKED by Trivy: ${pkg.packageName} — ${reason}`);
    }

    const escaped = command.replace(/'/g, "'\\''");
    output.args ??= {};
    output.args.command = `docker exec harness-sandbox bash -c '${escaped}'`;

    if (matched) throw new Error(`BLOCKED: HIGH-RISK pattern matched — ${matched}`);
  };
}
