import { describe, expect, spyOn, test } from "bun:test";

import { isSemgrepAvailable, provisionSemgrep } from "./semgrep.ts";

type SpawnResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

function streamFromText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function makeProcess(result: SpawnResult): any {
  return {
    exited: Promise.resolve(result.exitCode),
    stdout: streamFromText(result.stdout ?? ""),
    stderr: streamFromText(result.stderr ?? ""),
    kill() {},
  };
}

describe("semgrep provisioner", () => {
  test("provisionSemgrep tries pipx install before uv fallback", async () => {
    const spawnSpy = spyOn(Bun, "spawn") as any;

    spawnSpy.mockImplementation((cmd: string[], _opts?: any) => {
      const command = cmd.join(" ");

      if (command === "which semgrep") {
        return makeProcess({ exitCode: 1 });
      }

      if (command === "pipx install semgrep==1.2.3") {
        return makeProcess({ exitCode: 0 });
      }

      if (command === "semgrep --version") {
        return makeProcess({ exitCode: 0, stdout: "1.2.3\n" });
      }

      throw new Error(`Unexpected spawn: ${command}`);
    });

    try {
      const result = await provisionSemgrep("1.2.3");

      expect(result.success).toBe(true);
      expect(result.toolPath).toBe("semgrep");
      expect(spawnSpy.mock.calls.map((call: any[]) => call[0].join(" "))).toEqual([
        "which semgrep",
        "pipx install semgrep==1.2.3",
        "which semgrep",
      ]);
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test("provisionSemgrep falls back to uv when pipx fails", async () => {
    const spawnSpy = spyOn(Bun, "spawn") as any;

    spawnSpy.mockImplementation((cmd: string[], _opts?: any) => {
      const command = cmd.join(" ");

      if (command === "which semgrep") {
        return makeProcess({ exitCode: 1 });
      }

      if (command === "pipx install semgrep==2.0.0") {
        return makeProcess({ exitCode: 1, stderr: "pipx failed" });
      }

      if (command === "uv tool install semgrep==2.0.0") {
        return makeProcess({ exitCode: 0 });
      }

      if (command === "semgrep --version") {
        return makeProcess({ exitCode: 0, stdout: "2.0.0\n" });
      }

      throw new Error(`Unexpected spawn: ${command}`);
    });

    try {
      const result = await provisionSemgrep("2.0.0");

      expect(result.success).toBe(true);
      expect(spawnSpy.mock.calls.map((call: any[]) => call[0].join(" "))).toEqual([
        "which semgrep",
        "pipx install semgrep==2.0.0",
        "uv tool install semgrep==2.0.0",
        "which semgrep",
      ]);
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test("provisionSemgrep returns error when both installers fail", async () => {
    const spawnSpy = spyOn(Bun, "spawn") as any;

    spawnSpy.mockImplementation((cmd: string[], _opts?: any) => {
      const command = cmd.join(" ");

      if (command === "which semgrep") {
        return makeProcess({ exitCode: 1 });
      }

      if (command === "pipx install semgrep==3.1.4") {
        return makeProcess({ exitCode: 1, stderr: "pipx install failed" });
      }

      if (command === "uv tool install semgrep==3.1.4") {
        return makeProcess({ exitCode: 1, stderr: "uv tool install failed" });
      }

      throw new Error(`Unexpected spawn: ${command}`);
    });

    try {
      const result = await provisionSemgrep("3.1.4");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Could not install semgrep. Please install manually: pip install semgrep or pipx install semgrep");
      expect(result.error).toContain("pipx install failed");
      expect(result.error).toContain("uv tool install failed");
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test("isSemgrepAvailable detects an existing semgrep installation", async () => {
    const spawnSpy = spyOn(Bun, "spawn") as any;

    spawnSpy.mockImplementation((cmd: string[], _opts?: any) => {
      const command = cmd.join(" ");

      if (command === "which semgrep") {
        return makeProcess({ exitCode: 0, stdout: "/opt/homebrew/bin/semgrep\n" });
      }

      if (command === "semgrep --version") {
        return makeProcess({ exitCode: 0, stdout: "1.0.0\n" });
      }

      throw new Error(`Unexpected spawn: ${command}`);
    });

    try {
      const result = await isSemgrepAvailable();

      expect(result).toEqual({
        available: true,
        version: "1.0.0",
        path: "/opt/homebrew/bin/semgrep",
      });
    } finally {
      spawnSpy.mockRestore();
    }
  });
});
