import { join } from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { DEFAULT_SENSITIVE_VARS } from "../../core/security.ts";
import { detectDockerState, formatDockerWarning, isDegraded } from "../../sandbox/detect.ts";
import { logAegis } from "../../lib/aegis-log.ts";
import { ensureDir, fileExists, runCommandCapture } from "../../lib/base.ts";

/**
 * Bootstrap the `.aegis/` directory in the project root.
 * Runs on every session start — idempotent, never throws.
 *  - Creates `.aegis/`, `.aegis/scans/`, `.aegis/audit.log`
 *  - Patches `.gitignore` with `.aegis/` if missing
 *  - Warns if the project has no `.git` directory
 */
export async function bootstrapAegisDir(
  directory: string,
  client?: PluginInput["client"],
): Promise<void> {
  try {
    await ensureDir(join(directory, ".aegis", "scans"));

    const auditLogPath = join(directory, ".aegis", "audit.log");
    if (!(await fileExists(auditLogPath))) {
      await Bun.write(auditLogPath, "");
    }

    const gitignorePath = join(directory, ".gitignore");
    if (await fileExists(gitignorePath)) {
      const content = await Bun.file(gitignorePath).text();
      if (!content.includes(".aegis/")) {
        const separator = content.endsWith("\n") ? "" : "\n";
        await Bun.write(gitignorePath, `${content}${separator}\n# Aegis runtime (auto-added)\n.aegis/\n`);
        logAegis(client, "info", "[AEGIS] added .aegis/ to .gitignore");
      }
    } else {
      await Bun.write(gitignorePath, "# Aegis runtime (auto-added)\n.aegis/\n");
      logAegis(client, "info", "[AEGIS] created .gitignore with .aegis/ entry");
    }

    const hasGit = await fileExists(join(directory, ".git"));
    if (!hasGit) {
      logAegis(client, "warn", "[AEGIS] no .git directory found — consider using git for audit trail integrity");
    }
  } catch (err) {
    logAegis(client, "warn", `[AEGIS] .aegis/ bootstrap failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runDefaultPreflight(
  directory: string,
  setDegraded: (val: boolean) => void,
  client?: PluginInput["client"],
): Promise<void> {
  const varlockAvailable = (await runCommandCapture(["bunx", "varlock", "--version"])).exitCode === 0;
  if (!varlockAvailable) {
    logAegis(client, "warn", "[AEGIS] varlock not found — secret scanning disabled. Run 'bun add -d varlock' to install.");
  }

  if (!(await Bun.file(join(directory, ".env.schema")).exists())) {
    logAegis(client, "warn", "[AEGIS] .env.schema missing — run 'aegis install' to scaffold");
  }

  // Secrets can leak into the shell env without a .env file on disk — always check process.env.
  const found = DEFAULT_SENSITIVE_VARS.filter(v => (process.env[v] ?? "").length > 0);
  if (found.length > 0) logAegis(client, "warn", `[AEGIS] ⚠️ live secrets detected in env: ${found.join(", ")}`);

  const configPath = join(directory, ".pre-commit-config.yaml");
  try {
    const text = await Bun.file(configPath).text();
    if (!text.includes("trufflehog")) {
      logAegis(client, "warn", "[AEGIS] trufflehog hook not found in .pre-commit-config.yaml");
    }
  } catch {
    logAegis(client, "warn", "[AEGIS] .pre-commit-config.yaml missing — run 'aegis install' to scaffold");
  }

  const dockerState = await detectDockerState();
  if (isDegraded(dockerState)) {
    const warning = formatDockerWarning(dockerState);
    logAegis(client, "warn", warning);
    setDegraded(true);
  }

  if (varlockAvailable) {
    const scan = await runCommandCapture(["bunx", "varlock", "scan", "--staged"]);
    if (scan.exitCode !== 0) logAegis(client, "warn", "[AEGIS] ⚠️ varlock detected staged secrets — review before committing");
  }
}

export function createSessionHandler(
  directory: string,
  setPreflightPassed: (val: boolean) => void,
  setPreflightPromise?: (p: Promise<void>) => void,
  runPreflight?: (setDegraded: (val: boolean) => void) => Promise<void>,
  setDegraded?: (val: boolean) => void,
  setPreflightRan?: (val: boolean) => void,
  client?: PluginInput["client"],
): { handler: (input: { event: { type: string; sessionID?: string } }) => Promise<void> } {
  let preflightStarted = false;

  const handler = async (input: { event: { type: string; sessionID?: string } }) => {
    if (input.event.type !== "session.created") return;
    // Guard against session.created firing multiple times — only run preflight once.
    // Re-firing mid-session would reset preflightPromise to a pending promise and
    // cause all concurrent tool calls to block on "Preflight not initialized".
    if (preflightStarted) return;
    preflightStarted = true;

    const promise = (async () => {
      await bootstrapAegisDir(directory, client);
      setPreflightRan?.(true);
      try {
        if (runPreflight) {
          await runPreflight(setDegraded ?? (() => {}));
        } else {
          await runDefaultPreflight(directory, setDegraded ?? (() => {}), client);
        }
        setPreflightPassed(true);
      } catch (err) {
        const message = `[AEGIS] preflight failed: ${err instanceof Error ? err.message : String(err)}`;
        logAegis(client, "error", message);
        setPreflightPassed(false);
      }
    })();

    setPreflightPromise?.(promise);
    await promise;
  };
  return { handler };
}
