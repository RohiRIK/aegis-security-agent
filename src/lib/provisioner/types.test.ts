import { readFileSync } from "node:fs";

import { afterEach, describe, expect, test } from "bun:test";

import type {
  BinaryManifestEntry,
  ManifestEntry,
  Platform,
  PlatformEntry,
  ScannersManifest,
} from "./types.ts";
import { TOOLS_DIR_DEFAULT, getToolsDir } from "./types.ts";

const MANIFEST_URL = new URL("../../../scanners-manifest.json", import.meta.url);
const REQUIRED_PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"] as const satisfies Platform[];
const originalToolsDir = process.env.AEGIS_TOOLS_DIR;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlatformEntry(value: unknown): value is PlatformEntry {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.url === "string"
    && typeof value.sha256 === "string"
    && typeof value.binaryName === "string";
}

function isBinaryManifestEntry(value: unknown): value is BinaryManifestEntry {
  return isRecord(value) && value.kind === "binary" && isRecord(value.platforms);
}

function parseManifest(): ScannersManifest {
  const manifest = JSON.parse(readFileSync(MANIFEST_URL, "utf8")) as unknown;
  expect(isRecord(manifest)).toBe(true);
  expect("scanners" in (manifest as Record<string, unknown>)).toBe(true);

  const candidate = manifest as Record<string, unknown>;
  expect(isRecord(candidate.scanners)).toBe(true);

  return candidate as unknown as ScannersManifest;
}

afterEach(() => {
  if (originalToolsDir === undefined) {
    delete process.env.AEGIS_TOOLS_DIR;
    return;
  }

  process.env.AEGIS_TOOLS_DIR = originalToolsDir;
});

describe("scanners-manifest.json", () => {
  test("is valid JSON matching schema", () => {
    const manifest = parseManifest();

    expect(manifest.$schema === undefined || typeof manifest.$schema === "string").toBe(true);
    expect(Object.keys(manifest.scanners).sort()).toEqual(["semgrep", "trivy", "trufflehog"]);
  });

  test("trivy and trufflehog define all supported platforms", () => {
    const manifest = parseManifest();

    for (const scannerName of ["trivy", "trufflehog"] as const) {
      const entry = manifest.scanners[scannerName];
      expect(entry?.kind).toBe("binary");
      expect(isBinaryManifestEntry(entry)).toBe(true);

      if (!entry || !isBinaryManifestEntry(entry)) {
        continue;
      }

      expect(Object.keys(entry.platforms).sort()).toEqual([...REQUIRED_PLATFORMS].sort());
    }
  });

  test("every binary entry has url, sha256, and binaryName fields", () => {
    const manifest = parseManifest();

    for (const scannerName of ["trivy", "trufflehog"] as const) {
      const entry = manifest.scanners[scannerName];
      expect(entry?.kind).toBe("binary");

      if (!entry || !isBinaryManifestEntry(entry)) {
        continue;
      }

      for (const platform of REQUIRED_PLATFORMS) {
        expect(isPlatformEntry(entry.platforms[platform])).toBe(true);
      }
    }
  });

  test("semgrep uses python-tool manifest shape", () => {
    const manifest = parseManifest();
    const entry = manifest.scanners.semgrep;

    expect(entry?.kind).toBe("python-tool");
    if (!entry || entry.kind !== "python-tool") {
      return;
    }

    expect(Array.isArray(entry.commands)).toBe(true);
    expect(entry.commands.length).toBeGreaterThan(0);
    expect(entry.commands.every((command) => typeof command === "string" && command.length > 0)).toBe(true);
  });
});

describe("getToolsDir", () => {
  test("uses the default tools directory when env is absent", () => {
    delete process.env.AEGIS_TOOLS_DIR;
    expect(getToolsDir()).toBe(TOOLS_DIR_DEFAULT);
  });

  test("prefers AEGIS_TOOLS_DIR when present", () => {
    process.env.AEGIS_TOOLS_DIR = "/tmp/aegis-tools";
    expect(getToolsDir()).toBe("/tmp/aegis-tools");
  });
});
