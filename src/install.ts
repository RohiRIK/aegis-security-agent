import { join, resolve } from "node:path";

import { ensureDir, fileExists, writeStderr, writeStdout } from "./lib/base.ts";
import { HOOKS_TEMPLATE } from "./lib/hooks-template.ts";

const HARNESS_DIR = resolve(import.meta.dir, "..");

async function copyIfMissing(sourcePath: string, destinationPath: string): Promise<void> {
  if (await fileExists(destinationPath)) {
    writeStdout(`  [SKIP] ${destinationPath} already exists\n`);
    return;
  }

  await Bun.write(destinationPath, Bun.file(sourcePath));
  writeStdout(`  [CREATED] ${destinationPath}\n`);
}

async function runAndWait(argv: string[]): Promise<number> {
  const proc = Bun.spawn(argv, {
    stdout: "inherit",
    stderr: "inherit",
  });

  return await proc.exited;
}

async function createPluginLink(sourcePath: string, destinationPath: string): Promise<void> {
  if (await fileExists(destinationPath)) {
    writeStdout(`  [SKIP] ${destinationPath} already exists\n`);
    return;
  }

  let exitCode = await runAndWait(["ln", "-sf", sourcePath, destinationPath]);
  if (exitCode !== 0) {
    exitCode = await runAndWait(["cp", "-r", sourcePath, destinationPath]);
  }

  if (exitCode !== 0) {
    throw new Error(`Failed to install plugin link: ${destinationPath}`);
  }

  writeStdout(`  [CREATED] ${destinationPath}\n`);
}

async function patchOpencodeConfig(targetDir: string): Promise<void> {
  const configPath = join(targetDir, "opencode.json");
  const exists = await fileExists(configPath);
  let config: Record<string, unknown> = {};

  if (exists) {
    try {
      const parsed = await Bun.file(configPath).json();
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        config = parsed as Record<string, unknown>;
      }
    } catch {
      config = {};
    }
  }

  const pluginEntry = ".opencode/plugins/harness-security/index.ts";
  const pluginValue = config.plugin;
  const plugins = Array.isArray(pluginValue) ? [...pluginValue] : [];

  if (!plugins.includes(pluginEntry)) {
    plugins.push(pluginEntry);
  }

  config.plugin = plugins;
  await Bun.write(configPath, `${JSON.stringify(config, null, 2)}\n`);
  writeStdout(`  [${exists ? "UPDATED" : "CREATED"}] opencode.json\n`);
}

async function main(): Promise<number> {
  const targetDir = process.cwd();
  const opencode = Bun.argv.includes("--opencode");

  writeStdout(`[harness install] Scaffolding into: ${targetDir}\n`);

  await copyIfMissing(join(HARNESS_DIR, ".env.schema"), join(targetDir, ".env.schema"));
  await copyIfMissing(join(HARNESS_DIR, "harness-policy.json"), join(targetDir, "harness-policy.json"));
  await copyIfMissing(join(HARNESS_DIR, "CLAUDE.md"), join(targetDir, "CLAUDE.md"));

  const gitignorePath = join(targetDir, ".gitignore");
  const gitignoreExists = await fileExists(gitignorePath);
  const gitignoreText = gitignoreExists ? await Bun.file(gitignorePath).text() : "";
  if (!gitignoreText.includes(".harness/")) {
    const prefix = gitignoreText.length > 0 ? `${gitignoreText}\n` : "\n";
    const updatedGitignore = `${prefix}# Harness runtime (added by harness install)\n.harness/\n.aegis/\n.env\n.env.*\n!.env.schema\n`;
    await Bun.write(gitignorePath, updatedGitignore);
    writeStdout(`  [UPDATED] ${gitignorePath} (added harness entries)\n`);
  } else {
    writeStdout(`  [SKIP] ${gitignorePath} already has harness entries\n`);
  }

  await ensureDir(join(targetDir, ".harness"));
  writeStdout(`  [CREATED] ${join(targetDir, ".harness")}/\n`);

  await ensureDir(join(targetDir, ".harness", "scan-cache"));
  writeStdout(`  [CREATED] ${join(targetDir, ".harness", "scan-cache")}/\n`);

  await ensureDir(join(targetDir, ".aegis"));
  writeStdout(`  [CREATED] ${join(targetDir, ".aegis")}/\n`);

  const auditLogPath = join(targetDir, ".aegis", "audit.log");
  if (!(await fileExists(auditLogPath))) {
    await Bun.write(auditLogPath, "");
    writeStdout(`  [CREATED] ${auditLogPath}\n`);
  }

  await ensureDir(join(targetDir, ".claude"));
  writeStdout(`  [CREATED] ${join(targetDir, ".claude")}/\n`);

  const hooksDestinationPath = join(targetDir, ".claude", "hooks.json");
  if (await fileExists(hooksDestinationPath)) {
    writeStdout(`  [SKIP] ${hooksDestinationPath} already exists\n`);
  } else {
    await Bun.write(hooksDestinationPath, HOOKS_TEMPLATE.replaceAll("__HARNESS_DIR__", HARNESS_DIR));
    writeStdout(`  [CREATED] ${hooksDestinationPath} (paths stamped for ${HARNESS_DIR})\n`);
  }

  await copyIfMissing(join(HARNESS_DIR, ".claude", "mcp.json"), join(targetDir, ".claude", "mcp.json"));
  await copyIfMissing(join(HARNESS_DIR, ".claudeignore"), join(targetDir, ".claudeignore"));
  await copyIfMissing(join(HARNESS_DIR, ".pre-commit-config.yaml"), join(targetDir, ".pre-commit-config.yaml"));

  if (opencode) {
    await ensureDir(join(targetDir, ".opencode", "plugins"));
    writeStdout(`  [CREATED] ${join(targetDir, ".opencode", "plugins")}/\n`);

    await createPluginLink(
      join(HARNESS_DIR, "src", "opencode"),
      join(targetDir, ".opencode", "plugins", "harness-security"),
    );

    await createPluginLink(join(HARNESS_DIR, "src", "core"), join(targetDir, ".opencode", "plugins", "core"));

    await patchOpencodeConfig(targetDir);
  }

  writeStdout("\n[harness install] Done. Next: run 'harness start' to launch.\n");
  return 0;
}

try {
  const exitCode = await main();
  process.exit(exitCode);
} catch (error) {
  writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
