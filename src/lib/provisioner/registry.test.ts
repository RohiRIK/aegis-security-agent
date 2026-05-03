import { describe, expect, test } from "bun:test";

import { loadManifest, resolveToolEntry } from "./registry.ts";
import type { Platform, ScannerName } from "./types.ts";

describe("registry", () => {
  test("loadManifest reads and parses scanners-manifest.json", () => {
    const manifest = loadManifest();
    const trivy = manifest.scanners.trivy;
    const trufflehog = manifest.scanners.trufflehog;
    const semgrep = manifest.scanners.semgrep;

    expect(Object.keys(manifest.scanners).sort()).toEqual(["semgrep", "trivy", "trufflehog"]);
    expect(trivy).toBeDefined();
    expect(trufflehog).toBeDefined();
    expect(semgrep).toBeDefined();

    if (!trivy || !trufflehog || !semgrep) {
      throw new Error("expected scanners to exist in manifest");
    }

    expect(trivy.version).toBe("0.70.0");
    expect(trufflehog.version).toBe("3.95.2");
    expect(semgrep.version).toBe("1.158.0");
  });

  test.each([
    ["trivy", "darwin-arm64", "trivy"],
    ["trufflehog", "linux-x64", "trufflehog"],
  ] as const)(
    "resolveToolEntry returns platform entry for %s on %s",
    (scanner, platform, binaryName) => {
      const manifest = loadManifest();
      const entry = resolveToolEntry(manifest, scanner, platform);

      expect(entry).toEqual(expect.objectContaining({ binaryName }));
      expect("url" in entry).toBe(true);
      expect("sha256" in entry).toBe(true);
    },
  );

  test("resolveToolEntry returns semgrep python tool manifest entry", () => {
    const manifest = loadManifest();
    const entry = resolveToolEntry(manifest, "semgrep", "darwin-arm64");

    expect("kind" in entry && entry.kind === "python-tool").toBe(true);
    if (!("kind" in entry) || entry.kind !== "python-tool") {
      throw new Error("expected python-tool manifest entry");
    }

    expect(entry.commands).toEqual([
      "pipx install semgrep==1.158.0",
      "uv tool install semgrep==1.158.0",
    ]);
  });

  test("resolveToolEntry throws for invalid scanner name", () => {
    const manifest = loadManifest();

    expect(() => resolveToolEntry(manifest, "nope" as ScannerName, "darwin-arm64" as Platform)).toThrow(
      "Unknown scanner: nope",
    );
  });
});
