import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  BinaryManifestEntry,
  Platform,
  PlatformEntry,
  PythonToolManifestEntry,
  ScannerName,
  ScannersManifest,
} from "./types.ts";

const MANIFEST_PATH = join(import.meta.dir, "../../../scanners-manifest.json");

export function loadManifest(): ScannersManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ScannersManifest;
}

export function resolveToolEntry(
  manifest: ScannersManifest,
  scanner: ScannerName,
  platform: Platform,
): PlatformEntry | PythonToolManifestEntry {
  const entry = manifest.scanners[scanner];
  if (!entry) {
    throw new Error(`Unknown scanner: ${scanner}`);
  }

  if (entry.kind === "python-tool") {
    return entry;
  }

  const platformEntry = (entry as BinaryManifestEntry).platforms[platform];
  if (!platformEntry) {
    throw new Error(`No manifest entry for ${scanner} on ${platform}`);
  }

  return platformEntry;
}

export function getExpectedVersion(manifest: ScannersManifest, scanner: ScannerName): string {
  const entry = manifest.scanners[scanner];
  if (!entry) {
    throw new Error(`Unknown scanner: ${scanner}`);
  }

  return entry.version;
}
