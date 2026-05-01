import { describe, expect, spyOn, test } from "bun:test";

import {
  checkSensitiveFile,
  makeLockfileContent,
  matchHighRiskPattern,
  parseInstallCommand,
  semgrepScan,
  stripSensitiveEnv,
  trivyScan,
  type ParsedInstall,
} from "./security";

const highRiskPatterns = [
  "DROP TABLE",
  "DROP DATABASE",
  "DELETE FROM",
  "ALTER TABLE",
  "TRUNCATE",
  "rm -rf",
  "kubectl apply",
  "kubectl delete",
  "terraform apply",
  "terraform destroy",
  "git push --force",
  "npm publish",
  "docker push",
  "ssh ",
  "curl.*--upload",
];

const denyPatterns = [".env", "**/*.pem", "**/*.key", "**/*_rsa"];

const fakePackage: ParsedInstall = {
  ecosystem: "npm",
  packageName: "test-pkg",
  packageVersion: "1.0.0",
};

const missingFilePath = `${import.meta.dir}/__does_not_exist__/missing.ts`;

const makeUnavailableSpawnResult = (): ReturnType<typeof Bun.spawn> => {
  return {
    exited: Promise.resolve(1),
    stdout: new ReadableStream<Uint8Array>(),
  } as unknown as ReturnType<typeof Bun.spawn>;
};

describe("matchHighRiskPattern", () => {
  test("matches rm -rf pattern", () => {
    expect(matchHighRiskPattern("rm -rf /", ["rm -rf"])).toBe("rm -rf");
  });

  test("returns null when no patterns match", () => {
    expect(matchHighRiskPattern("ls -la", ["rm -rf", "DROP TABLE"])).toBeNull();
  });

  test("matches case-insensitively", () => {
    expect(matchHighRiskPattern("drop table users", ["DROP TABLE"])).toBe("DROP TABLE");
  });

  test("returns null for empty patterns", () => {
    expect(matchHighRiskPattern("rm -rf /", [])).toBeNull();
  });

  test("returns null for empty command", () => {
    expect(matchHighRiskPattern("", ["rm -rf"])).toBeNull();
  });
});

describe("parseInstallCommand", () => {
  test("parses npm install with latest version", () => {
    expect(parseInstallCommand("npm install express")).toEqual({
      ecosystem: "npm",
      packageName: "express",
      packageVersion: "latest",
    });
  });

  test("parses npm shorthand install for scoped package", () => {
    expect(parseInstallCommand("npm i @types/node@18.0.0")).toEqual({
      ecosystem: "npm",
      packageName: "@types/node",
      packageVersion: "18.0.0",
    });
  });

  test("parses pip install with pinned version", () => {
    expect(parseInstallCommand("pip install requests==2.31.0")).toEqual({
      ecosystem: "pip",
      packageName: "requests",
      packageVersion: "2.31.0",
    });
  });

  test("parses cargo add command", () => {
    expect(parseInstallCommand("cargo add serde@1.0")).toEqual({
      ecosystem: "cargo",
      packageName: "serde",
      packageVersion: "1.0",
    });
  });

  test("parses go get command", () => {
    expect(parseInstallCommand("go get github.com/gin-gonic/gin@v1.9.0")).toEqual({
      ecosystem: "go",
      packageName: "github.com/gin-gonic/gin",
      packageVersion: "v1.9.0",
    });
  });

  test("returns null for non-install command", () => {
    expect(parseInstallCommand("echo hello")).toBeNull();
  });

  test("parses npm install with save-dev flag", () => {
    expect(parseInstallCommand("npm install --save-dev typescript")).toEqual({
      ecosystem: "npm",
      packageName: "typescript",
      packageVersion: "latest",
    });
  });
});

describe("checkSensitiveFile", () => {
  test("matches exact .env deny pattern", () => {
    expect(checkSensitiveFile(".env", [".env", "**/*.pem"])).toBe(true);
  });

  test("matches pem file via glob", () => {
    expect(checkSensitiveFile("certs/server.pem", ["**/*.pem"])).toBe(true);
  });

  test("matches rsa file via glob", () => {
    expect(checkSensitiveFile("ssh/id_rsa", ["**/*_rsa"])).toBe(true);
  });

  test("returns false for normal source file", () => {
    expect(checkSensitiveFile("src/index.ts", denyPatterns)).toBe(false);
  });

  test("matches key file via glob", () => {
    expect(checkSensitiveFile("certs/server.key", denyPatterns)).toBe(true);
  });
});

describe("stripSensitiveEnv", () => {
  test("strips AWS_SECRET_ACCESS_KEY from env", () => {
    const env = {
      AWS_SECRET_ACCESS_KEY: "secret",
      HOME: "/tmp/test-user",
      PATH: "/usr/bin",
    };

    expect(stripSensitiveEnv(env)).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
  });

  test("preserves HOME and PATH", () => {
    const env = {
      AWS_SECRET_ACCESS_KEY: "secret",
      HOME: "/tmp/test-user",
      PATH: "/usr/bin",
    };

    expect(stripSensitiveEnv(env)).toEqual({
      HOME: "/tmp/test-user",
      PATH: "/usr/bin",
    });
  });

  test("returns empty object for empty input", () => {
    expect(stripSensitiveEnv({})).toEqual({});
  });

  test("does not mutate the original env object", () => {
    const env = {
      AWS_SECRET_ACCESS_KEY: "secret",
      HOME: "/tmp/test-user",
    };

    const result = stripSensitiveEnv(env);

    expect(env).toEqual({
      AWS_SECRET_ACCESS_KEY: "secret",
      HOME: "/tmp/test-user",
    });
    expect(result).toEqual({ HOME: "/tmp/test-user" });
  });

  test("supports custom sensitive vars", () => {
    const env = {
      CUSTOM_SECRET: "secret",
      HOME: "/tmp/test-user",
    };

    expect(stripSensitiveEnv(env, ["CUSTOM_SECRET"])).toEqual({ HOME: "/tmp/test-user" });
  });
});

describe("trivyScan", () => {
  test("returns skipped result when trivy is unavailable", async () => {
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => makeUnavailableSpawnResult());

    try {
      await expect(trivyScan(fakePackage)).resolves.toEqual({
        blocked: false,
        reason: "trivy not installed — scan skipped",
      });
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test("returns an object with blocked boolean and reason string", async () => {
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => makeUnavailableSpawnResult());

    try {
      const result = await trivyScan(fakePackage);

      expect(typeof result.blocked).toBe("boolean");
      expect(typeof result.reason).toBe("string");
    } finally {
      spawnSpy.mockRestore();
    }
  });
});

describe("semgrepScan", () => {
  test("returns empty array for non-existent file path", async () => {
    await expect(semgrepScan(missingFilePath)).resolves.toEqual([]);
  });

  test("returns an array", async () => {
    const result = await semgrepScan(`${import.meta.dir}/__does_not_exist__/missing-again.ts`);

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("makeLockfileContent", () => {
  test("creates npm lockfile content containing harness-scan", () => {
    const result = makeLockfileContent({
      ecosystem: "npm",
      packageName: "pkg",
      packageVersion: "1.0.0",
    });

    expect(result.filename).toBe("package-lock.json");
    expect(result.content).toContain("harness-scan");
  });

  test("creates pip requirements content", () => {
    expect(makeLockfileContent({
      ecosystem: "pip",
      packageName: "pkg",
      packageVersion: "1.0.0",
    })).toEqual({
      filename: "requirements.txt",
      content: "pkg==1.0.0\n",
    });
  });

  test("creates cargo lockfile content", () => {
    const result = makeLockfileContent({
      ecosystem: "cargo",
      packageName: "serde",
      packageVersion: "1.0.0",
    });

    expect(result.filename).toBe("Cargo.lock");
    expect(result.content).toContain('name = "serde"');
  });

  test("creates go sum content", () => {
    const result = makeLockfileContent({
      ecosystem: "go",
      packageName: "github.com/gin-gonic/gin",
      packageVersion: "1.9.0",
    });

    expect(result.filename).toBe("go.sum");
    expect(result.content).toContain("github.com/gin-gonic/gin v1.9.0");
  });
});

describe("export coverage sanity", () => {
  test("uses policy high risk patterns in command matching", () => {
    expect(matchHighRiskPattern("terraform apply", highRiskPatterns)).toBe("terraform apply");
  });
});
