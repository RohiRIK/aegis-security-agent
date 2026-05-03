import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  detectPlatform,
  getToolPath,
  mapPlatformToTrivy,
  mapPlatformToTrufflehog,
  resolveDownloadUrl,
} from "./platform.ts";

const originalPlatform = process.platform;
const originalArch = process.arch;
const originalToolsDir = process.env.AEGIS_TOOLS_DIR;

function setProcessTarget(platform: NodeJS.Platform, arch: string) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  Object.defineProperty(process, "arch", { value: arch, configurable: true });
}

afterEach(() => {
  mock.restore();
  setProcessTarget(originalPlatform, originalArch);
  if (originalToolsDir === undefined) {
    delete process.env.AEGIS_TOOLS_DIR;
  } else {
    process.env.AEGIS_TOOLS_DIR = originalToolsDir;
  }
});

describe("detectPlatform", () => {
  test.each([
    ["darwin", "arm64", "darwin-arm64"],
    ["darwin", "x64", "darwin-x64"],
    ["linux", "arm64", "linux-arm64"],
    ["linux", "x64", "linux-x64"],
  ] as const)("maps %s/%s to %s", (platform, arch, expected) => {
    setProcessTarget(platform, arch);
    expect(detectPlatform()).toBe(expected);
  });

  test("throws on unsupported platform", () => {
    setProcessTarget("win32", "x64");
    expect(() => detectPlatform()).toThrow("Unsupported platform: win32-x64");
  });
});

describe("mapPlatformToTrivy", () => {
  test("maps darwin-arm64 to macOS/ARM64", () => {
    expect(mapPlatformToTrivy("darwin-arm64")).toEqual({ os: "macOS", arch: "ARM64" });
  });

  test("maps darwin-x64 to macOS/64bit", () => {
    expect(mapPlatformToTrivy("darwin-x64")).toEqual({ os: "macOS", arch: "64bit" });
  });

  test("maps linux-arm64 to Linux/ARM64", () => {
    expect(mapPlatformToTrivy("linux-arm64")).toEqual({ os: "Linux", arch: "ARM64" });
  });

  test("maps linux-x64 to Linux/64bit", () => {
    expect(mapPlatformToTrivy("linux-x64")).toEqual({ os: "Linux", arch: "64bit" });
  });
});

describe("mapPlatformToTrufflehog", () => {
  test("maps darwin-arm64 to darwin/arm64", () => {
    expect(mapPlatformToTrufflehog("darwin-arm64")).toEqual({ os: "darwin", arch: "arm64" });
  });

  test("maps darwin-x64 to darwin/amd64", () => {
    expect(mapPlatformToTrufflehog("darwin-x64")).toEqual({ os: "darwin", arch: "amd64" });
  });

  test("maps linux-arm64 to linux/arm64", () => {
    expect(mapPlatformToTrufflehog("linux-arm64")).toEqual({ os: "linux", arch: "arm64" });
  });

  test("maps linux-x64 to linux/amd64", () => {
    expect(mapPlatformToTrufflehog("linux-x64")).toEqual({ os: "linux", arch: "amd64" });
  });
});

describe("resolveDownloadUrl", () => {
  test("interpolates trivy template", () => {
    expect(
      resolveDownloadUrl(
        "https://github.com/aquasecurity/trivy/releases/download/v{VERSION}/trivy_{VERSION}_{OS}-{ARCH}.tar.gz",
        "0.50.0",
        "darwin-arm64",
        "trivy",
      ),
    ).toBe("https://github.com/aquasecurity/trivy/releases/download/v0.50.0/trivy_0.50.0_macOS-ARM64.tar.gz");
  });

  test("interpolates trufflehog template", () => {
    expect(
      resolveDownloadUrl(
        "https://github.com/trufflesecurity/trufflehog/releases/download/v{VERSION}/trufflehog_{VERSION}_{OS}_{ARCH}.tar.gz",
        "3.84.0",
        "linux-x64",
        "trufflehog",
      ),
    ).toBe("https://github.com/trufflesecurity/trufflehog/releases/download/v3.84.0/trufflehog_3.84.0_linux_amd64.tar.gz");
  });
});

describe("getToolPath", () => {
  test("uses default tools directory when env is absent", () => {
    delete process.env.AEGIS_TOOLS_DIR;
    expect(getToolPath("semgrep", "1.2.3", "linux-x64")).toBe(
      `${process.env.HOME ?? ""}/.aegis/bin/semgrep/1.2.3/linux-x64/`,
    );
  });

  test("prefers AEGIS_TOOLS_DIR env override", () => {
    process.env.AEGIS_TOOLS_DIR = "/tmp/aegis-tools";
    expect(getToolPath("trivy", "1.0.0", "darwin-x64")).toBe("/tmp/aegis-tools/trivy/1.0.0/darwin-x64/");
  });
});
