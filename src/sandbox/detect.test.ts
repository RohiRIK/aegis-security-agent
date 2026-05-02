import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { detectDockerState, formatDockerWarning, isDockerAvailable, isDegraded } from "./detect.ts";
import * as base from "../lib/base.ts";

function mockRunCommandCapture(results: Array<{ exitCode: number; stdout: string; stderr: string }>) {
  let callIndex = 0;
  return spyOn(base, "runCommandCapture").mockImplementation(async () => {
    const result = results[callIndex] ?? { exitCode: 1, stdout: "", stderr: "" };
    callIndex++;
    return result;
  });
}

describe("detectDockerState", () => {
  afterEach(() => {
    mock.restore();
  });

  test("returns binary_missing when docker command not found", async () => {
    mockRunCommandCapture([{ exitCode: 1, stdout: "", stderr: "docker not found" }]);
    expect(await detectDockerState()).toBe("binary_missing");
  });

  test("returns daemon_unavailable when docker info fails", async () => {
    mockRunCommandCapture([
      { exitCode: 0, stdout: "/usr/local/bin/docker", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "Cannot connect to Docker daemon" },
    ]);
    expect(await detectDockerState()).toBe("daemon_unavailable");
  });

  test("returns running when container is active", async () => {
    mockRunCommandCapture([
      { exitCode: 0, stdout: "/usr/local/bin/docker", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "aegis-sandbox\n", stderr: "" },
    ]);
    expect(await detectDockerState()).toBe("running");
  });

  test("returns container_stopped when container exists but not running", async () => {
    mockRunCommandCapture([
      { exitCode: 0, stdout: "/usr/local/bin/docker", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "aegis-sandbox\n", stderr: "" },
    ]);
    expect(await detectDockerState()).toBe("container_stopped");
  });

  test("returns container_absent when no container exists", async () => {
    mockRunCommandCapture([
      { exitCode: 0, stdout: "/usr/local/bin/docker", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
    ]);
    expect(await detectDockerState()).toBe("container_absent");
  });
});

describe("isDockerAvailable", () => {
  test("returns true only for running", () => {
    expect(isDockerAvailable("running")).toBe(true);
    expect(isDockerAvailable("binary_missing")).toBe(false);
    expect(isDockerAvailable("daemon_unavailable")).toBe(false);
    expect(isDockerAvailable("container_absent")).toBe(false);
    expect(isDockerAvailable("container_stopped")).toBe(false);
    expect(isDockerAvailable("start_failure")).toBe(false);
  });
});

describe("isDegraded", () => {
  test("returns false only for running", () => {
    expect(isDegraded("running")).toBe(false);
    expect(isDegraded("binary_missing")).toBe(true);
    expect(isDegraded("daemon_unavailable")).toBe(true);
    expect(isDegraded("container_absent")).toBe(true);
    expect(isDegraded("container_stopped")).toBe(true);
    expect(isDegraded("start_failure")).toBe(true);
  });
});

describe("formatDockerWarning", () => {
  test("returns empty string for running", () => {
    expect(formatDockerWarning("running")).toBe("");
  });

  test("returns actionable message for binary_missing", () => {
    const msg = formatDockerWarning("binary_missing");
    expect(msg).toContain("DEGRADED");
    expect(msg).toContain("not installed");
  });

  test("returns actionable message for daemon_unavailable", () => {
    const msg = formatDockerWarning("daemon_unavailable");
    expect(msg).toContain("DEGRADED");
    expect(msg).toContain("daemon not running");
  });

  test("returns actionable message for container_absent", () => {
    const msg = formatDockerWarning("container_absent");
    expect(msg).toContain("DEGRADED");
    expect(msg).toContain("not found");
  });

  test("returns actionable message for container_stopped", () => {
    const msg = formatDockerWarning("container_stopped");
    expect(msg).toContain("DEGRADED");
    expect(msg).toContain("stopped");
  });

  test("returns actionable message for start_failure", () => {
    const msg = formatDockerWarning("start_failure");
    expect(msg).toContain("DEGRADED");
    expect(msg).toContain("failed to start");
  });
});
