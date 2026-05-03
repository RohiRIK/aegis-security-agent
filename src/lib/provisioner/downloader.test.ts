import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import crypto from "node:crypto";
import { chmod, mkdtemp, mkdir, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import * as downloader from "./downloader.ts";

const originalGithubToken = process.env.GITHUB_TOKEN;
const originalGhToken = process.env.GH_TOKEN;

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function sha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function writeExecutable(filePath: string, contents: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await Bun.write(filePath, contents);
  await chmod(filePath, 0o755);
}

async function createTarGzWithFile(baseDir: string, fileName: string, contents: string): Promise<{ archivePath: string; sourceDir: string }> {
  const sourceDir = join(baseDir, "source");
  const archivePath = join(baseDir, "archive.tar.gz");
  const sourceFile = join(sourceDir, fileName);

  await writeExecutable(sourceFile, contents);

  const proc = Bun.spawn(["tar", "czf", archivePath, "-C", sourceDir, "."], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(await new Response(proc.stderr).text());
  }

  return { archivePath, sourceDir };
}

beforeEach(() => {
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
});

afterEach(() => {
  mock.restore();
  if (originalGithubToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalGithubToken;
  }

  if (originalGhToken === undefined) {
    delete process.env.GH_TOKEN;
  } else {
    process.env.GH_TOKEN = originalGhToken;
  }
});

describe("verifyChecksum", () => {
  test("returns true for matching sha256", async () => {
    const tempDir = await createTempDir("downloader-checksum-ok-");
    const filePath = join(tempDir, "tool.bin");

    try {
      await Bun.write(filePath, "scanner-bytes");

      await expect(downloader.verifyChecksum(filePath, sha256("scanner-bytes"))).resolves.toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns false for mismatched sha256", async () => {
    const tempDir = await createTempDir("downloader-checksum-bad-");
    const filePath = join(tempDir, "tool.bin");

    try {
      await Bun.write(filePath, "scanner-bytes");

      await expect(downloader.verifyChecksum(filePath, sha256("different"))).resolves.toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("downloadFile", () => {
  test("writes downloaded content to disk", async () => {
    const tempDir = await createTempDir("downloader-download-");
    const destPath = join(tempDir, "scanner.bin");
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
    );

    try {
      await downloader.downloadFile("https://example.test/tool", destPath);

      expect(fetchSpy).toHaveBeenCalledWith("https://example.test/tool", { headers: {} });
      expect(Buffer.from(await Bun.file(destPath).arrayBuffer())).toEqual(Buffer.from([1, 2, 3, 4]));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("uses GITHUB_TOKEN for authorization header", async () => {
    process.env.GITHUB_TOKEN = "github-token";
    const tempDir = await createTempDir("downloader-github-token-");
    const destPath = join(tempDir, "scanner.bin");
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("payload", { status: 200 }));

    try {
      await downloader.downloadFile("https://example.test/tool", destPath);

      expect(fetchSpy).toHaveBeenCalledWith("https://example.test/tool", {
        headers: { Authorization: "token github-token" },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("falls back to GH_TOKEN when GITHUB_TOKEN is unset", async () => {
    process.env.GH_TOKEN = "gh-token";
    const tempDir = await createTempDir("downloader-gh-token-");
    const destPath = join(tempDir, "scanner.bin");
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("payload", { status: 200 }));

    try {
      await downloader.downloadFile("https://example.test/tool", destPath);

      expect(fetchSpy).toHaveBeenCalledWith("https://example.test/tool", {
        headers: { Authorization: "token gh-token" },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("extractTarGz", () => {
  test("extracts archive contents into target directory", async () => {
    const tempDir = await createTempDir("downloader-extract-");

    try {
      const { archivePath } = await createTarGzWithFile(tempDir, "trivy", "binary-data");
      const extractDir = join(tempDir, "extract");

      const extracted = await downloader.extractTarGz(archivePath, extractDir);

      expect(extracted).toContain("trivy");
      expect(await Bun.file(join(extractDir, "trivy")).text()).toBe("binary-data");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("atomicDownload", () => {
  test("downloads verifies and renames direct binaries atomically", async () => {
    const tempDir = await createTempDir("downloader-atomic-bin-");
    const payload = "#!/bin/sh\necho scanner\n";
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload, { status: 200 }));

    try {
      const result = await downloader.atomicDownload(
        "https://example.test/semgrep",
        tempDir,
        "semgrep",
        sha256(payload),
      );

      expect(result).toEqual({ success: true, toolPath: join(tempDir, "semgrep") });
      expect(await Bun.file(join(tempDir, "semgrep")).text()).toBe(payload);
      expect(await Bun.file(join(tempDir, "semgrep.tmp")).exists()).toBe(false);
      expect((await stat(join(tempDir, "semgrep"))).mode & 0o111).toBeGreaterThan(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("extracts tar.gz payloads and moves target binary into place", async () => {
    const tempDir = await createTempDir("downloader-atomic-tar-");
    const fixtureDir = await createTempDir("downloader-atomic-tar-fixture-");

    try {
      const { archivePath } = await createTarGzWithFile(fixtureDir, "trivy", "archive-binary");
      const archiveBytes = Buffer.from(await Bun.file(archivePath).arrayBuffer());
      const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(archiveBytes, { status: 200 }));

      const result = await downloader.atomicDownload(
        "https://example.test/trivy.tar.gz",
        tempDir,
        "trivy",
        sha256(archiveBytes),
      );

      expect(result).toEqual({ success: true, toolPath: join(tempDir, "trivy") });
      expect(await Bun.file(join(tempDir, "trivy")).text()).toBe("archive-binary");
      expect(await Bun.file(join(tempDir, "trivy.tmp")).exists()).toBe(false);
      expect(await Bun.file(join(tempDir, ".extract", "trivy")).exists()).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  test("cleans up temp file and returns error on sha256 mismatch", async () => {
    const tempDir = await createTempDir("downloader-atomic-mismatch-");
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("unexpected-bytes", { status: 200 }));

    try {
      const result = await downloader.atomicDownload(
        "https://example.test/semgrep",
        tempDir,
        "semgrep",
        sha256("expected-bytes"),
      );

      expect(result).toEqual({ success: false, toolPath: "", error: "SHA256 mismatch" });
      expect(await Bun.file(join(tempDir, "semgrep.tmp")).exists()).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns structured error result on network failure", async () => {
    const tempDir = await createTempDir("downloader-atomic-network-");
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    try {
      const result = await downloader.atomicDownload(
        "https://example.test/semgrep",
        tempDir,
        "semgrep",
        sha256("irrelevant"),
      );

      expect(result.success).toBe(false);
      expect(result.toolPath).toBe("");
      expect(result.error).toContain("network down");
      expect(await Bun.file(join(tempDir, "semgrep.tmp")).exists()).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("skips when a recent temp file indicates another process is provisioning", async () => {
    const tempDir = await createTempDir("downloader-atomic-lock-");
    const tmpPath = join(tempDir, "semgrep.tmp");
    const fetchSpy = spyOn(globalThis, "fetch");

    try {
      await Bun.write(tmpPath, "busy");

      const result = await downloader.atomicDownload(
        "https://example.test/semgrep",
        tempDir,
        "semgrep",
        sha256("irrelevant"),
      );

      expect(result).toEqual({
        success: false,
        toolPath: "",
        error: "Provisioning already in progress",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await Bun.file(tmpPath).exists()).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("removes stale temp file before retrying download", async () => {
    const tempDir = await createTempDir("downloader-atomic-stale-");
    const tmpPath = join(tempDir, "semgrep.tmp");
    const finalPath = join(tempDir, "semgrep");
    const payload = "fresh-binary";
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload, { status: 200 }));

    try {
      await Bun.write(tmpPath, "stale-binary");
      const staleTime = new Date(Date.now() - 11 * 60 * 1000);
      await utimes(tmpPath, staleTime, staleTime);

      const result = await downloader.atomicDownload(
        "https://example.test/semgrep",
        tempDir,
        "semgrep",
        sha256(payload),
      );

      expect(result).toEqual({ success: true, toolPath: finalPath });
      expect(await Bun.file(finalPath).text()).toBe(payload);
      expect(await Bun.file(tmpPath).exists()).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
