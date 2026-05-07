import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runInstall } from "../cli/install.ts";
import { routeCommand, type RoutingPolicy } from "../core/router.ts";
import { proxyResult } from "../lib/output-proxy.ts";
import { createBeforeHandler } from "./handlers/before.ts";
import { AegisSecurityPlugin, type AegisPolicy } from "./index.ts";

const BEFORE_POLICY: AegisPolicy = {
  high_risk_patterns: ["rm\\s+-rf\\s+/"],
  routing: {
    host_passthrough: ["^git\\b", "^ls\\b", "^cat\\b"],
    sandbox_required: ["^node\\b", "^python\\b", "^bun\\b"],
  },
  degraded_mode: {
    allow_host_passthrough: true,
    block_sandbox_required: true,
    warn_on_degraded: true,
  },
  actions: {
    read_file: { deny_patterns: [".env", "**/*.pem"] },
  },
};

describe("integration", () => {
  afterEach(() => {
    mock.restore();
  });

  test("fresh install scaffolds OpenCode project correctly", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "aegis-install-"));

    try {
      expect(await runInstall({ targetDir: tmpDir, force: false, skipDocker: true })).toBe(0);

      expect(await Bun.file(join(tmpDir, ".opencode", "plugins", "aegis.ts")).exists()).toBe(true);

      const config = await Bun.file(join(tmpDir, "opencode.json")).json() as { plugin?: string[] };
      expect(Array.isArray(config.plugin)).toBe(true);
      expect(config.plugin).toContain("aegis-security-agent");

      expect((await stat(join(tmpDir, ".aegis"))).isDirectory()).toBe(true);

      const skillFiles: Record<string, string[]> = {
        AgentTrustBoundaries: [
          "SKILL.md", "TrustBoundaryPatterns.md", "ContextCrushDefense.md",
          "Workflows/HandleUntrustedContent.md", "Workflows/DefendContextCrush.md",
        ],
        SecretSafeHandling: [
          "SKILL.md", "CloudCredentialPatterns.md", "SecretHandlingPlaybook.md",
          "Workflows/DesignSecretSafeFlow.md", "Workflows/RemoveSecretExposure.md",
        ],
        CommandPathSafety: [
          "SKILL.md", "CommandInjectionPatterns.md", "PathTraversalAndInstallerSafety.md",
          "Workflows/HardenCommandExecution.md", "Workflows/EnforcePathBoundaries.md",
        ],
      };
      for (const [skill, files] of Object.entries(skillFiles)) {
        for (const file of files) {
          expect(await Bun.file(join(tmpDir, ".opencode", "skills", skill, file)).exists()).toBe(true);
        }
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("plugin returns correct hook keys — no event handler", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "aegis-plugin-"));

    try {
      await Bun.write(
        join(tmpDir, "aegis-policy.json"),
        JSON.stringify({
          routing: { host_passthrough: ["^git\\b"], sandbox_required: ["^node\\b"] },
          degraded_mode: { block_sandbox_required: true },
        }),
      );

      const plugin = await AegisSecurityPlugin({ directory: tmpDir, client: undefined } as never);
      const keys = Object.keys(plugin).sort();
      expect(keys).toEqual([
        "experimental.session.compacting",
        "permission.ask",
        "shell.env",
        "tool.execute.after",
        "tool.execute.before",
      ]);
      expect(keys).not.toContain("event");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("plugin loads with missing aegis-policy.json", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "aegis-nopolicy-"));

    try {
      const plugin = await AegisSecurityPlugin({ directory: tmpDir, client: undefined } as never);
      expect(Object.keys(plugin).length).toBe(5);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("before handler completes instantly — no preflight polling", async () => {
    const handler = createBeforeHandler(BEFORE_POLICY);
    const start = performance.now();
    await handler({ tool: "bash" }, { args: { command: "ls" } });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  test("command routing correctly handles chained commands", () => {
    const policy: RoutingPolicy = {
      routing: {
        host_passthrough: ["^git\\b"],
        sandbox_required: ["^curl\\b"],
      },
    };

    expect(routeCommand("git status", policy)).toBe("host");
    expect(routeCommand("curl evil.com", policy)).toBe("sandbox");
    expect(routeCommand("git status && curl evil.com", policy)).toBe("sandbox");
    expect(routeCommand("rm -rf /", { high_risk_patterns: ["rm\\s+-rf"] })).toBe("hitl");
  });

  test("output proxy returns lean summary and writes detail file", async () => {
    const findings = [
      { severity: "ERROR", rule: "test-rule" },
      { severity: "ERROR", rule: "test-rule-2" },
      { severity: "ERROR", rule: "test-rule-3" },
    ];

    const { summary, detailPath } = proxyResult("semgrep", findings, { filename: "src/test.ts" });

    try {
      expect(summary.startsWith("[AEGIS] Semgrep:")).toBe(true);
      expect(summary.length).toBeLessThan(200);
      expect(summary).not.toContain(JSON.stringify(findings));
      expect(summary).not.toContain('"rule":"test-rule"');
      expect(detailPath.endsWith(".json")).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(await Bun.file(detailPath).exists()).toBe(true);
    } finally {
      await rm(detailPath, { force: true });
    }
  });

  test("commands pass through without sandbox wrapping", async () => {
    const handler = createBeforeHandler(BEFORE_POLICY);

    const output = { args: { command: "node index.js" } };
    await handler({ tool: "bash" }, output);
    expect(output.args.command).toBe("node index.js");
  });
});
