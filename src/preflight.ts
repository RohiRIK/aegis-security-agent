import { join, resolve } from "node:path";

import { fileExists, runCommandCapture, runCommandInherit } from "./lib/base.ts";
import { c, icon, printPreflightSummary, runSteps, type StepResult } from "./lib/ui.ts";

const HARNESS_DIR = resolve(import.meta.dir, "..");

const SENSITIVE_VARS = [
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "STRIPE_SECRET_KEY",
  "GITHUB_TOKEN",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PRIVATE_KEY",
  "SECRET_KEY",
  "PASSWORD",
  "PASSWD",
];

async function main(): Promise<number> {
  const steps = [
    {
      label: "Varlock (via bunx)",
      run: async (): Promise<{ result: StepResult; detail?: string }> => {
        const r = await runCommandCapture(["bunx", "varlock", "--version"]);
        if (r.exitCode !== 0) {
          return { result: "fail", detail: "bunx varlock not available. Ensure bun is installed: https://bun.sh" };
        }
        return { result: "ok" };
      },
    },
    {
      label: ".env.schema present",
      run: async (): Promise<{ result: StepResult; detail?: string }> => {
        if (!(await fileExists(join(process.cwd(), ".env.schema")))) {
          return { result: "fail", detail: ".env.schema not found. Run 'harness install' to create a template." };
        }
        return { result: "ok" };
      },
    },
    {
      label: "Environment clean — no real secrets",
      run: async (): Promise<{ result: StepResult; detail?: string }> => {
        const found = SENSITIVE_VARS.filter((v) => {
          const val = process.env[v];
          return typeof val === "string" && val.length > 0;
        });
        if (found.length > 0) {
          const list = found.map((v) => `  ${icon.fail} ${c.bold(v)} is set`).join("\n");
          return {
            result: "fail",
            detail: `Real secrets detected in environment:\n${list}\n\nUse 'bunx varlock run -- harness start' to inject secrets safely.`,
          };
        }
        return { result: "ok" };
      },
    },
    {
      label: "TruffleHog pre-commit hook",
      run: async (): Promise<{ result: StepResult; detail?: string }> => {
        const configPath = join(process.cwd(), ".pre-commit-config.yaml");
        const present = await fileExists(configPath);
        const hasTruffleHog = present && (await Bun.file(configPath).text()).includes("trufflehog");
        if (!hasTruffleHog) {
          return { result: "warn", detail: "TruffleHog not configured. Run 'harness install'." };
        }
        return { result: "ok" };
      },
    },
    {
      label: "Docker sandbox",
      run: async (): Promise<{ result: StepResult; detail?: string }> => {
        const dockerInfo = await runCommandCapture(["docker", "info"]);
        if (dockerInfo.exitCode !== 0) {
          return { result: "fail", detail: "Docker daemon not running. Start Docker and retry." };
        }
        const dockerPs = await runCommandCapture([
          "docker", "ps",
          "--filter", "name=harness-sandbox",
          "--filter", "status=running",
          "--format", "{{.Names}}",
        ]);
        if (!dockerPs.stdout.includes("harness-sandbox")) {
          const startCode = await runCommandInherit(
            ["bun", "run", join(HARNESS_DIR, "src", "sandbox", "start.ts")],
            { stdout: "ignore", stderr: "ignore" },
          );
          if (startCode !== 0) {
            return { result: "fail", detail: "Failed to start harness-sandbox container." };
          }
          return { result: "ok", detail: "container started" };
        }
        return { result: "ok", detail: "container warm" };
      },
    },
    {
      label: "Varlock scan — staged files",
      run: async (): Promise<{ result: StepResult; detail?: string }> => {
        const r = await runCommandCapture(["bunx", "varlock", "scan", "--staged"]);
        if (r.exitCode !== 0) {
          return { result: "fail", detail: "varlock found potential secrets in staged files." };
        }
        return { result: "ok" };
      },
    },
    {
      label: "Conflicting context tools",
      run: async (): Promise<{ result: StepResult; detail?: string }> => {
        const conflicts: string[] = [];
        if ((await runCommandCapture(["pgrep", "-f", "rtk"])).exitCode === 0) conflicts.push("rtk");
        if ((await runCommandCapture(["pgrep", "-f", "context-mode"])).exitCode === 0) conflicts.push("context-mode");
        if (conflicts.length > 0) {
          return { result: "warn", detail: `Detected: ${conflicts.join(", ")}. lean-ctx is the only supported context manager.` };
        }
        return { result: "ok" };
      },
    },
  ];

  const { passed, warned, failed } = await runSteps(steps);
  printPreflightSummary(passed, warned, failed, steps.length);
  return failed > 0 ? 1 : 0;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
