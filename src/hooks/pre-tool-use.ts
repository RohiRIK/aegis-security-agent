import { join, resolve } from "node:path";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

import {
  ensureDir,
  formatTimestamp,
  getString,
  isRecord,
  readStdinText,
  runCommandCapture,
  runCommandInherit,
  shellQuote,
  writeStderr,
  writeStdout,
} from "../lib/base.ts";

const HARNESS_DIR = resolve(import.meta.dir, "..", "..");
const POLICY_PATH = join(HARNESS_DIR, "harness-policy.json");

type HarnessPolicy = {
  high_risk_patterns?: string[];
  hitl_timeout_seconds?: number;
};

type PackageEcosystem = "npm" | "pip" | "cargo" | "go";

type ParsedInstall = {
  ecosystem: PackageEcosystem;
  packageName: string;
  packageVersion: string;
};

function parseInstallCommand(cmd: string): ParsedInstall | null {
  const npmMatch = cmd.match(/^npm (?:install|i) (?:--save(?:-dev)? )?(@?[^\s@]+)(?:@([^\s]+))?/);
  if (npmMatch) return { ecosystem: "npm", packageName: npmMatch[1] ?? "", packageVersion: npmMatch[2] ?? "latest" };

  const pipMatch = cmd.match(/^pip3? install (?:--[^\s]+ )*([^\s=<>!]+)(?:[=<>!]+([^\s]+))?/);
  if (pipMatch) return { ecosystem: "pip", packageName: pipMatch[1] ?? "", packageVersion: pipMatch[2] ?? "latest" };

  const cargoMatch = cmd.match(/^cargo add ([^\s@]+)(?:@([^\s]+))?/);
  if (cargoMatch) return { ecosystem: "cargo", packageName: cargoMatch[1] ?? "", packageVersion: cargoMatch[2] ?? "latest" };

  const goMatch = cmd.match(/^go get ([^\s@]+)(?:@([^\s]+))?/);
  if (goMatch) return { ecosystem: "go", packageName: goMatch[1] ?? "", packageVersion: goMatch[2] ?? "latest" };

  return null;
}

function makeLockfileContent(pkg: ParsedInstall): { filename: string; content: string } {
  const ver = pkg.packageVersion === "latest" ? "0.0.1" : pkg.packageVersion;
  switch (pkg.ecosystem) {
    case "npm":
      return {
        filename: "package-lock.json",
        content: JSON.stringify({
          name: "harness-scan",
          lockfileVersion: 2,
          packages: {
            [`node_modules/${pkg.packageName}`]: {
              version: ver,
              resolved: `https://registry.npmjs.org/${pkg.packageName}/-/${pkg.packageName}-${ver}.tgz`,
              integrity: "sha512-placeholder",
            },
          },
        }),
      };
    case "pip":
      return { filename: "requirements.txt", content: `${pkg.packageName}==${ver}\n` };
    case "cargo":
      return {
        filename: "Cargo.lock",
        content: `[[package]]\nname = "${pkg.packageName}"\nversion = "${ver}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "placeholder"\n`,
      };
    case "go":
      return {
        filename: "go.sum",
        content: `${pkg.packageName} v${ver} h1:placeholder=\n`,
      };
  }
}

async function trivyScan(pkg: ParsedInstall): Promise<{ blocked: boolean; reason: string }> {
  const trivyAvailable = (await runCommandCapture(["bash", "-c", "command -v trivy"])).exitCode === 0;
  if (!trivyAvailable) return { blocked: false, reason: "trivy not installed — scan skipped" };

  const { filename, content } = makeLockfileContent(pkg);
  const scanDir = mkdtempSync(joinPath(tmpdir(), "harness-trivy-"));

  try {
    await Bun.write(joinPath(scanDir, filename), content);

    const result = await runCommandCapture([
      "trivy", "fs",
      "--scanners", "vuln",
      "--severity", "HIGH,CRITICAL",
      "--exit-code", "1",
      "--quiet",
      "--format", "json",
      scanDir,
    ]);

    if (result.exitCode === 1) {
      let vulnCount = 0;
      try {
        const parsed = JSON.parse(result.stdout) as { Results?: Array<{ Vulnerabilities?: unknown[] }> };
        vulnCount = parsed.Results?.reduce((sum, r) => sum + (r.Vulnerabilities?.length ?? 0), 0) ?? 0;
      } catch { /* ignore parse errors — exit code is authoritative */ }
      return { blocked: true, reason: `${vulnCount} HIGH/CRITICAL CVE(s) found — upgrade to a patched version` };
    }

    return { blocked: false, reason: "clean" };
  } finally {
    rmSync(scanDir, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const inputText = await readStdinText();
  const parsedInput = JSON.parse(inputText) as unknown;
  if (!isRecord(parsedInput)) {
    throw new Error("Invalid hook input.");
  }

  const toolName = getString(parsedInput, "tool_name") ?? getString(parsedInput, "tool") ?? "";
  const toolInput = isRecord(parsedInput.tool_input) ? parsedInput.tool_input : undefined;
  const bashCommand = toolInput ? getString(toolInput, "command") ?? "" : "";

  await ensureDir(join(HARNESS_DIR, ".harness"));

  if ((toolName === "Bash" || toolName === "bash") && bashCommand.length > 0) {
    const policy = (await Bun.file(POLICY_PATH).json()) as HarnessPolicy;
    const highRiskPatterns = Array.isArray(policy.high_risk_patterns) ? policy.high_risk_patterns : [];
    const matchedPattern = highRiskPatterns.find((pattern) => new RegExp(pattern, "i").test(bashCommand)) ?? "";

    if (matchedPattern.length > 0) {
      const timeoutSeconds = typeof policy.hitl_timeout_seconds === "number" ? policy.hitl_timeout_seconds : 120;
      const requestId = crypto.randomUUID();
      const hitlJson = JSON.stringify({
        hitl_request: {
          id: requestId,
          timestamp: formatTimestamp(),
          session_id: "harness",
          action: {
            tool: "bash",
            command: bashCommand,
            risk_reason: `Matches HIGH-RISK pattern: ${matchedPattern}`,
            risk_level: "HIGH",
            reversible: false,
          },
          context: {
            current_task: "Agent-initiated shell command",
            working_directory: process.cwd(),
          },
          instructions: `Type 'approve' to allow, anything else to deny. Auto-deny in ${timeoutSeconds}s.`,
        },
      });

      const hitlExitCode = await runCommandInherit(
        ["bun", "run", join(HARNESS_DIR, "src", "hitl-gateway.ts"), hitlJson],
        { env: { HITL_TIMEOUT_SECONDS: String(timeoutSeconds) } },
      );
      if (hitlExitCode !== 0) {
        writeStderr("BLOCKED by HITL gateway: HIGH-RISK command denied.\n");
        return 1;
      }
    }

    const parsedInstall = parseInstallCommand(bashCommand);
    if (parsedInstall !== null) {
      const { blocked, reason } = await trivyScan(parsedInstall);
      if (blocked) {
        writeStderr(`BLOCKED by Trivy: '${parsedInstall.packageName}' — ${reason}\n`);
        return 1;
      }
    }

    const rewrittenInput: Record<string, unknown> = structuredClone(parsedInput);
    const rewrittenToolInput = isRecord(rewrittenInput.tool_input) ? rewrittenInput.tool_input : {};
    rewrittenToolInput.command = `bun run \"${join(HARNESS_DIR, "src", "sandbox", "exec.ts")}\" ${shellQuote(bashCommand)}`;
    rewrittenInput.tool_input = rewrittenToolInput;
    writeStdout(`${JSON.stringify(rewrittenInput)}\n`);
    return 0;
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
