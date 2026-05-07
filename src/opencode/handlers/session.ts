import { join } from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { logAegis } from "../../lib/aegis-log.ts";
import { ensureDir, fileExists } from "../../lib/base.ts";

/**
 * Bootstrap the `.aegis/` directory in the project root.
 * Idempotent, never throws.
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
