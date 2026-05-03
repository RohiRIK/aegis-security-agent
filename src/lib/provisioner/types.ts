import { homedir } from "node:os";
import { join } from "node:path";

export type ScannerName = "trivy" | "trufflehog" | "semgrep";

export type Platform = "darwin-arm64" | "darwin-x64" | "linux-arm64" | "linux-x64";

export type ToolState = "installed" | "not_installed" | "outdated" | "system" | "unavailable";

export type ToolInfo = {
  name: ScannerName;
  state: ToolState;
  version: string;
  path: string;
  source: "provisioned" | "system" | "none";
};

export type PlatformEntry = {
  url: string;
  sha256: string;
  binaryName: string;
};

export type BinaryManifestEntry = {
  version: string;
  kind: "binary";
  platforms: Record<Platform, PlatformEntry>;
  checksumUrl?: string;
};

export type PythonToolManifestEntry = {
  version: string;
  kind: "python-tool";
  commands: string[];
};

export type ManifestEntry = BinaryManifestEntry | PythonToolManifestEntry;

export type ScannersManifest = {
  $schema?: string;
  scanners: Record<string, ManifestEntry>;
};

export type ProvisionResult = {
  success: boolean;
  toolPath: string;
  error?: string;
};

export const TOOLS_DIR_DEFAULT = join(homedir(), ".aegis", "bin");

export function getToolsDir(): string {
  return process.env.AEGIS_TOOLS_DIR?.trim() || TOOLS_DIR_DEFAULT;
}
