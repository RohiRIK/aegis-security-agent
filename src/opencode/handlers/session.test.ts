import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapAegisDir } from "./session.ts";

let tempDir: string;

async function makeTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "aegis-bootstrap-"));
}

describe("bootstrapAegisDir", () => {
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("creates .aegis/ directory structure", async () => {
    tempDir = await makeTempDir();
    await bootstrapAegisDir(tempDir);

    expect(await Bun.file(join(tempDir, ".aegis", "audit.log")).exists()).toBe(true);
    expect(await Bun.file(join(tempDir, ".aegis", "scans")).exists()).toBe(false);
    const stat = Bun.spawnSync(["test", "-d", join(tempDir, ".aegis", "scans")]);
    expect(stat.exitCode).toBe(0);
  });

  test("creates .gitignore with .aegis/ when none exists", async () => {
    tempDir = await makeTempDir();
    await bootstrapAegisDir(tempDir);

    const content = await Bun.file(join(tempDir, ".gitignore")).text();
    expect(content).toContain(".aegis/");
  });

  test("patches existing .gitignore if .aegis/ missing", async () => {
    tempDir = await makeTempDir();
    await Bun.write(join(tempDir, ".gitignore"), "node_modules/\n");
    await bootstrapAegisDir(tempDir);

    const content = await Bun.file(join(tempDir, ".gitignore")).text();
    expect(content).toContain("node_modules/");
    expect(content).toContain(".aegis/");
  });

  test("does not duplicate .aegis/ in existing .gitignore", async () => {
    tempDir = await makeTempDir();
    await Bun.write(join(tempDir, ".gitignore"), "node_modules/\n.aegis/\n");
    await bootstrapAegisDir(tempDir);

    const content = await Bun.file(join(tempDir, ".gitignore")).text();
    const matches = content.match(/\.aegis\//g);
    expect(matches?.length).toBe(1);
  });

  test("is idempotent — safe to call twice", async () => {
    tempDir = await makeTempDir();
    await bootstrapAegisDir(tempDir);
    await bootstrapAegisDir(tempDir);

    const content = await Bun.file(join(tempDir, ".gitignore")).text();
    const matches = content.match(/\.aegis\//g);
    expect(matches?.length).toBe(1);
    expect(await Bun.file(join(tempDir, ".aegis", "audit.log")).exists()).toBe(true);
  });

  test("never throws — even on invalid directory", async () => {
    await expect(bootstrapAegisDir("/nonexistent/path/that/cannot/exist")).resolves.toBeUndefined();
  });
});
