import { describe, expect, test } from "bun:test";
import { join } from "node:path";
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
    const r = await resolveScanTarget({
      target: "/home/user/repo", subpath: "../../etc",
      noCatalog: true, json: false, allowUntrusted: false, maxRepoSizeMb: 2048,
    });
    expect(r.error).toContain("escapes");
    expect(r.tempCloneDir).toBeNull();
  });

  test("local --subpath within root resolves", async () => {
    const r = await resolveScanTarget({
      target: "/home/user/repo", subpath: "services/api",
      noCatalog: true, json: false, allowUntrusted: false, maxRepoSizeMb: 2048,
    });
    expect(r.error).toBeUndefined();
    expect(r.dir).toBe("/home/user/repo/services/api");
    expect(r.tempCloneDir).toBeNull();
  });
});
