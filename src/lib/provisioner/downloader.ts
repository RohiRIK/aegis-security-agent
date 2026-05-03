import crypto from "node:crypto";
import { chmod, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import type { ProvisionResult } from "./types.ts";

const LOCK_MAX_AGE_MS = 10 * 60 * 1000;

class ActiveProvisioningError extends Error {}

function getToken(explicitToken?: string): string | undefined {
  return explicitToken?.trim() || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function cleanupPath(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

async function ensureNoActiveTempFile(tempPath: string): Promise<void> {
  try {
    const tempStat = await stat(tempPath);
    if (Date.now() - tempStat.mtimeMs < LOCK_MAX_AGE_MS) {
      throw new ActiveProvisioningError("Provisioning already in progress");
    }

    await cleanupPath(tempPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }
}

async function findBinary(extractDir: string, binaryName: string): Promise<string | null> {
  const entries = await readdir(extractDir, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || basename(entry.name) !== binaryName) {
      continue;
    }

    const relativePath = "parentPath" in entry && typeof entry.parentPath === "string"
      ? join(entry.parentPath, entry.name)
      : join(extractDir, entry.name);
    return relativePath;
  }

  return null;
}

export async function verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
  const buffer = Buffer.from(await Bun.file(filePath).arrayBuffer());
  return crypto.createHash("sha256").update(buffer).digest("hex") === expectedSha256;
}

export async function downloadFile(url: string, destPath: string, options?: { token?: string }): Promise<void> {
  const token = getToken(options?.token);
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `token ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await Bun.write(destPath, buffer);
}

export async function extractTarGz(archivePath: string, extractDir: string): Promise<string[]> {
  await mkdir(extractDir, { recursive: true });

  const proc = Bun.spawn(["tar", "xzf", archivePath, "-C", extractDir], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error((await new Response(proc.stderr).text()).trim() || `tar exited with code ${exitCode}`);
  }

  const entries = await readdir(extractDir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

export async function atomicDownload(
  url: string,
  destDir: string,
  binaryName: string,
  expectedSha256: string,
): Promise<ProvisionResult> {
  const tempPath = join(destDir, `${binaryName}.tmp`);
  const finalPath = join(destDir, binaryName);
  const extractDir = join(destDir, ".extract");

  try {
    await mkdir(destDir, { recursive: true });
    await ensureNoActiveTempFile(tempPath);
    await cleanupPath(extractDir);

    await downloadFile(url, tempPath);

    const isValid = await verifyChecksum(tempPath, expectedSha256);
    if (!isValid) {
      await cleanupPath(tempPath);
      return { success: false, toolPath: "", error: "SHA256 mismatch" };
    }

    await cleanupPath(finalPath);

    if (url.endsWith(".tar.gz")) {
      await extractTarGz(tempPath, extractDir);
      const extractedBinary = await findBinary(extractDir, binaryName);

      if (!extractedBinary) {
        throw new Error(`Extracted archive did not contain ${binaryName}`);
      }

      await rename(extractedBinary, finalPath);
      await cleanupPath(extractDir);
      await cleanupPath(tempPath);
    } else {
      await rename(tempPath, finalPath);
    }

    await chmod(finalPath, 0o755);

    return { success: true, toolPath: finalPath };
  } catch (error) {
    if (error instanceof ActiveProvisioningError) {
      return {
        success: false,
        toolPath: "",
        error: error.message,
      };
    }

    await Promise.all([cleanupPath(tempPath), cleanupPath(extractDir)]);
    return {
      success: false,
      toolPath: "",
      error: toErrorMessage(error),
    };
  }
}
