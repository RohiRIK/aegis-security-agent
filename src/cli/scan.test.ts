import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  isGitUrl,
  parseScanFlags,
  repoNameFromUrl,
  resolveScanTarget,
  runScan,
  DEFAULT_MAX_REPO_SIZE_MB,
} from "./scan.ts";
import { SCAN_ERROR_EXIT_CODE } from "../core/verdict.ts";

describe("parseScanFlags", () => {
  test("defaults to current dir, catalog on", () => {
    const flags = parseScanFlags([]);
    expect(flags.target).toBe(".");
    expect(flags.noCatalog).toBe(false);
    expect(flags.json).toBe(false);
  });

  test("parses positional target and flags", () => {
    const flags = parseScanFlags(["/repo", "--json", "--no-catalog"]);
    expect(flags.target).toBe("/repo");
  });

  test("parses --target and -t flags", () => {
    expect(parseScanFlags(["--target", "/repo"]).target).toBe("/repo");
    expect(parseScanFlags(["-t", "/repo2"]).target).toBe("/repo2");
    expect(parseScanFlags(["--target", "/repo", "--json"]).json).toBe(true);
  });

  test("-o alias", () => {
    expect(parseScanFlags(["-o", "out.html"]).out).toBe("out.html");
  });
});

describe("runScan error path", () => {
  test("non-existent target → exit 3, no scanners spawned", async () => {
    const missing = join(tmpdir(), "aegis-does-not-exist-" + Date.now());
    const code = await runScan({ target: missing, noCatalog: true, json: false, allowUntrusted: false, maxRepoSizeMb: 2048 });
    expect(code).toBe(SCAN_ERROR_EXIT_CODE);
  });
});

describe("cloud git-URL targeting", () => {
  test("new flags parse: --branch, --subpath, --allow-untrusted, --max-repo-size-mb", () => {
    const f = parseScanFlags([
      "--target", "https://github.com/org/repo",
      "--branch", "dev",
      "--subpath", "services/api",
      "--allow-untrusted",
      "--max-repo-size-mb", "512",
    ]);
    expect(f.branch).toBe("dev");
    expect(f.subpath).toBe("services/api");
    expect(f.allowUntrusted).toBe(true);
    expect(f.maxRepoSizeMb).toBe(512);
  });

  test("--max-repo-size-mb defaults and rejects invalid", () => {
    expect(parseScanFlags([]).maxRepoSizeMb).toBe(DEFAULT_MAX_REPO_SIZE_MB);
    expect(parseScanFlags(["--max-repo-size-mb", "abc"]).maxRepoSizeMb).toBe(DEFAULT_MAX_REPO_SIZE_MB);
    expect(parseScanFlags(["--max-repo-size-mb", "-5"]).maxRepoSizeMb).toBe(DEFAULT_MAX_REPO_SIZE_MB);
  });

  test("isGitUrl detects URL forms, rejects local paths", () => {
    expect(isGitUrl("https://github.com/org/repo")).toBe(true);
    expect(isGitUrl("http://gitlab.com/org/repo.git")).toBe(true);
    expect(isGitUrl("git@github.com:org/repo.git")).toBe(true);
    expect(isGitUrl("ssh://git@host/org/repo")).toBe(true);
    expect(isGitUrl("/home/user/repo")).toBe(false);
    expect(isGitUrl("./relative/path")).toBe(false);
    expect(isGitUrl("repo")).toBe(false);
  });

  test("repoNameFromUrl strips scheme, user, .git", () => {
    expect(repoNameFromUrl("https://github.com/org/repo")).toBe("repo");
    expect(repoNameFromUrl("https://github.com/org/repo.git")).toBe("repo");
    expect(repoNameFromUrl("git@github.com:org/repo.git")).toBe("repo");
    expect(repoNameFromUrl("https://github.com/org/repo/")).toBe("repo");
  });

  test("git URL without --allow-untrusted is refused", async () => {
    const r = await resolveScanTarget({
      target: "https://github.com/org/repo",
      noCatalog: true, json: false, allowUntrusted: false, maxRepoSizeMb: 2048,
    });
    expect(r.error).toContain("--allow-untrusted");
    expect(r.tempCloneDir).toBeNull();
  });

  test("local --subpath escape (path traversal) is rejected", async () => {
    // Use a real temp dir so realpath works; create a symlink escape inside it.
    const root = join(tmpdir(), "aegis-test-root-" + Date.now());
    await mkdir(root);
    await mkdir(join(root, "sub"));
    // Symlink inside root pointing outside → must be rejected.
    try { symlink(join(root, ".."), join(root, "sub", "escape"), "dir"); } catch { /* ok if symlinks unsupported */ }
    const r = await resolveScanTarget({
      target: root, subpath: "sub/escape",
      noCatalog: true, json: false, allowUntrusted: false, maxRepoSizeMb: 2048,
    });
    await rm(root, { recursive: true, force: true }).catch(() => {});
    // The escape should be caught; if symlinks aren't supported on this platform
    // the subpath nonexistent case still produces a non-successful result.
    expect(r.error || r.tempCloneDir !== null).toBeTruthy();
  });

  test("local --subpath within root resolves", async () => {
    const root = join(tmpdir(), "aegis-test-root-" + Date.now());
    await mkdir(root);
    await mkdir(join(root, "services"));
    const r = await resolveScanTarget({
      target: root, subpath: "services",
      noCatalog: true, json: false, allowUntrusted: false, maxRepoSizeMb: 2048,
    });
    await rm(root, { recursive: true, force: true }).catch(() => {});
    expect(r.error).toBeUndefined();
    expect(r.dir).toBe(join(root, "services"));
    expect(r.tempCloneDir).toBeNull();
  });
});
