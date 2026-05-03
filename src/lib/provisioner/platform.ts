import { homedir } from "node:os";
import { join } from "node:path";
import type { ScannerName, Platform } from "./types";

type PlatformInfo = { os: string; arch: string };

function splitPlatform(platform: Platform): { host: "darwin" | "linux"; arch: "arm64" | "x64" } {
  const [host, arch] = platform.split("-") as ["darwin" | "linux" | undefined, "arm64" | "x64" | undefined];
  if (host === undefined || arch === undefined) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return { host: host as "darwin" | "linux", arch: arch as "arm64" | "x64" };
}

export function detectPlatform(): Platform {
  const platform = `${process.platform}-${process.arch}`;
  if (platform === "darwin-arm64" || platform === "darwin-x64" || platform === "linux-arm64" || platform === "linux-x64") {
    return platform;
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

export function mapPlatformToTrivy(platform: Platform): PlatformInfo {
  const { host, arch } = splitPlatform(platform);
  return {
    os: host === "darwin" ? "macOS" : "Linux",
    arch: arch === "x64" ? "64bit" : "ARM64",
  };
}

export function mapPlatformToTrufflehog(platform: Platform): PlatformInfo {
  const { host, arch } = splitPlatform(platform);
  return {
    os: host,
    arch: arch === "x64" ? "amd64" : "arm64",
  };
}

function mapPlatformToScanner(platform: Platform, scanner: ScannerName): PlatformInfo {
  const { host, arch } = splitPlatform(platform);
  if (scanner === "trivy") return mapPlatformToTrivy(platform);
  if (scanner === "trufflehog") return mapPlatformToTrufflehog(platform);
  return { os: host, arch };
}

export function resolveDownloadUrl(urlTemplate: string, version: string, platform: Platform, scanner: ScannerName): string {
  const { os, arch } = mapPlatformToScanner(platform, scanner);
  return urlTemplate.replaceAll("{VERSION}", version).replaceAll("{OS}", os).replaceAll("{ARCH}", arch);
}

export function getToolPath(scanner: ScannerName, version: string, platform: Platform): string {
  const toolsDir = process.env.AEGIS_TOOLS_DIR?.trim() || join(homedir(), ".aegis", "bin");
  return `${join(toolsDir, scanner, version, platform)}/`;
}
