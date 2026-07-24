import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  BinaryManifestEntry,
  Platform,
  PlatformEntry,
  PythonToolManifestEntry,
  ScannerName,
  ScannersManifest,
} from "./types.ts";

let manifestPathCache: string | null = null;

/**
 * Locates `scanners-manifest.json` by walking upward from this module's
 * directory. A fixed relative depth breaks after bundling: `src/lib/provisioner`
 * is three levels below the repo root, but the bundled `dist/cli/index.js` is
 * only two — so `../../../` overshoots. The manifest ships at the package root
 * (see package.json `files`), so an upward search resolves correctly in both
 * the source tree and any bundled/installed layout.
 */
function resolveManifestPath(): string {
  if (manifestPathCache) return manifestPathCache;
  let dir = import.meta.dir;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "scanners-manifest.json");
    if (existsSync(candidate)) return (manifestPathCache = candidate);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`scanners-manifest.json not found (searched upward from ${import.meta.dir})`);
}

export function loadManifest(): ScannersManifest {
  return JSON.parse(readFileSync(resolveManifestPath(), "utf8")) as ScannersManifest;
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
