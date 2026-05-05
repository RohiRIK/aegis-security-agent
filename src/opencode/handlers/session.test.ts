import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapAegisDir, createSessionHandler } from "./session.ts";
import * as detect from "../../sandbox/detect.ts";

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

describe("runDefaultPreflight — warn vs block", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aegis-preflight-"));
    spyOn(detect, "detectDockerState").mockResolvedValue("running");
    spyOn(detect, "isDegraded").mockReturnValue(false);
    // varlock unavailable in test environment — that's fine, it's advisory
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    mock.restore();
    delete process.env["GITHUB_TOKEN"];
  });

  function runPreflight(dir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let passed = false;
      const { handler } = createSessionHandler(
        dir,
        (val) => { passed = val; },
        undefined,
        undefined,
        undefined,
        undefined,
      );
      handler({ event: { type: "session.created" } })
        .then(() => passed ? resolve() : reject(new Error("preflight set passed=false")))
        .catch(reject);
    });
  }

  test("missing .env.schema does not block preflight", async () => {
    // tempDir has no .env.schema — should warn, not throw
    await expect(runPreflight(tempDir)).resolves.toBeUndefined();
  });

  test("missing .pre-commit-config.yaml does not block preflight", async () => {
    await Bun.write(join(tempDir, ".env.schema"), "# schema\n");
    // no .pre-commit-config.yaml — advisory warn only
    await expect(runPreflight(tempDir)).resolves.toBeUndefined();
  });

  test("live secrets in process.env warn but do not block preflight", async () => {
    process.env["GITHUB_TOKEN"] = "ghp_fakesecretfortesting";
    // Advisory only — warns but does not throw
    await expect(runPreflight(tempDir)).resolves.toBeUndefined();
  });

  test(".pre-commit-config.yaml without trufflehog warns but does not block", async () => {
    await Bun.write(join(tempDir, ".env.schema"), "# schema\n");
    await Bun.write(join(tempDir, ".pre-commit-config.yaml"), "repos: []\n");
    await expect(runPreflight(tempDir)).resolves.toBeUndefined();
  });
});
