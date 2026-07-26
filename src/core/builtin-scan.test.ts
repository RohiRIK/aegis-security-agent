import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  compileIgnorePatterns,
  createPathExcluder,
  runBuiltinScan,
  scanContent,
  scanPath,
} from "./builtin-scan.ts";
import { BUILTIN_SCANNERS } from "./patterns.ts";

/**
 * Fixture credentials. These are syntactically valid *shapes* that no provider
 * ever issued — they exist so the detectors can be exercised. Each definition
 * line carries the inline ignore marker so Aegis scanning its own source does
 * not report this file; the marker is not part of the value, so the scanned
 * content built from these constants still matches.
 */
const FAKE = {
  awsKeyId: "AKIAQYLPMN5HGBQWERTY", // aegis:ignore
  githubToken: "ghp_zQ8vT2mKwRnLyHbC5dFgJsXaPeUiOwQrTvZm", // aegis:ignore
  npmToken: "npm_zQ8vT2mKwRnLyHbC5dFgJsXaPeUiOwQrTvZm", // aegis:ignore
  slackToken: "xoxb-" + "2847362819-3948571026-KpQvXmZnRtYwBc", // aegis:ignore — deliberately non-real, push-protection FP
  apiKeyValue: "R7tQvXmZnKpBcDfGhJwLsYe3", // aegis:ignore
  dbUrl: "postgres://svcacct:Xk9mQpRt2Lw@db.corp.lan:5432/app", // aegis:ignore
  pemHeader: "-----BEGIN RSA PRIVATE KEY-----", // aegis:ignore
} as const;

/** Every fixture value must appear in some finding location, never in text. */
function assertNoValueLeak(serialized: string): void {
  for (const value of Object.values(FAKE)) {
    expect(serialized).not.toContain(value);
  }
}

describe("scanContent — secret patterns", () => {
  test("detects an AWS access key id", () => {
    const findings = scanContent("a.ts", `const id = "${FAKE.awsKeyId}";`);
    expect(findings.map((f) => f.ruleId)).toContain("gitleaks-replacement/aws-access-key-id");
  });

  test("detects a GitHub token as critical", () => {
    const findings = scanContent("a.ts", `token: "${FAKE.githubToken}"`);
    const hit = findings.find((f) => f.ruleId === "gitleaks-replacement/github-token");
    expect(hit?.severity).toBe("critical");
  });

  test("detects npm and slack tokens", () => {
    const ruleIds = scanContent(
      "a.ts",
      `a="${FAKE.npmToken}"\nb="${FAKE.slackToken}"`,
    ).map((f) => f.ruleId);
    expect(ruleIds).toContain("gitleaks-replacement/npm-token");
    expect(ruleIds).toContain("gitleaks-replacement/slack-token");
  });

  test("detects a PEM private key block", () => {
    const findings = scanContent("k.txt", FAKE.pemHeader);
    expect(findings.map((f) => f.ruleId)).toContain("gitleaks-replacement/private-key-block");
  });

  test("detects credentials embedded in a connection URL", () => {
    const findings = scanContent("cfg.ts", `const url = "${FAKE.dbUrl}";`);
    expect(findings.map((f) => f.ruleId)).toContain("gitleaks-replacement/basic-auth-in-url");
  });

  test("detects a high-entropy generic api-key assignment", () => {
    const findings = scanContent("a.ts", `api_key = "${FAKE.apiKeyValue}"`);
    expect(findings.map((f) => f.ruleId)).toContain("gitleaks-replacement/generic-api-key-assignment");
  });

  test("suppresses env-var references and documented placeholders", () => {
    const content = [
      `const key = process.env.AWS_ACCESS_KEY_ID;`,
      `_authToken=\${NPM_TOKEN}`,
      `aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"`,
      `password = "your-password-here"`,
      `api_key: "{{ secrets.DEPLOY_KEY }}"`,
    ].join("\n");
    expect(scanContent("a.ts", content).filter((f) => f.scanner === "gitleaks-replacement")).toHaveLength(0);
  });

  test("low-entropy generic assignments do not fire", () => {
    expect(
      scanContent("a.ts", `api_key = "aaaaaaaaaaaaaaaaaaaa"`).filter(
        (f) => f.ruleId === "gitleaks-replacement/generic-api-key-assignment",
      ),
    ).toHaveLength(0);
  });
});

describe("scanContent — redaction invariant", () => {
  test("no matched secret value appears anywhere in the findings", () => {
    const content = Object.values(FAKE)
      .map((value, i) => `const v${i} = "${value}";`)
      .join("\n");
    const findings = scanContent("leaky.ts", content);

    expect(findings.length).toBeGreaterThan(0);
    assertNoValueLeak(JSON.stringify(findings));
  });

  test("findings carry only rule title, location and fix guidance", () => {
    const finding = scanContent("a.ts", `const id = "${FAKE.awsKeyId}";`)[0]!;
    expect(finding.message).toBe("AWS access key ID");
    expect(finding.location).toEqual({ file: "a.ts", startLine: 1 });
    expect(finding.fix).toContain("IAM");
  });
});

describe("scanContent — secret detection bypasses closed by review", () => {
  // Fixture values are random, provider-issued by nobody, and only ever appear
  // in the *content* argument — the redaction invariant still covers them.
  const HIGH_ENTROPY = "kP9xLq2ZmVnB4tYwRsCdF7gHjK"; // aegis:ignore
  const HEX_KEY = "9f2c4b1ae7d63508fa41cb9d2e75630a"; // aegis:ignore

  test.each([
    `const token = "${HIGH_ENTROPY}";`,
    `const cred = "${HIGH_ENTROPY}";`,
    `const appSecret = "${HIGH_ENTROPY}";`,
  ])("catches a high-entropy literal on a name the api-key rule never listed: %p", (line) => {
    expect(scanContent("a.ts", line).map((f) => f.ruleId)).toContain(
      "gitleaks-replacement/high-entropy-string-assignment",
    );
  });

  test("the name-agnostic rule reports low so operators tune it, not the pipeline", () => {
    const finding = scanContent("a.ts", `const token = "${HIGH_ENTROPY}";`).find(
      (f) => f.ruleId === "gitleaks-replacement/high-entropy-string-assignment",
    );
    expect(finding?.severity).toBe("low");
  });

  test.each([
    `const label = "Deploy to production cluster";`,
    `import x from "./some/relative/module/path";`,
    `const cls = "flex items-center justify-between gap-2";`,
  ])("ordinary prose and paths stay below the 4.0-bit gate: %p", (line) => {
    expect(scanContent("a.ts", line).filter((f) => f.scanner === "gitleaks-replacement")).toHaveLength(0);
  });

  test("a 32-char hex key still reports high — its 16-symbol alphabet caps below 4.0 bits", () => {
    const finding = scanContent("a.ts", `api_key = "${HEX_KEY}"`).find(
      (f) => f.ruleId === "gitleaks-replacement/generic-api-key-hex-assignment",
    );
    expect(finding?.severity).toBe("high");
  });

  test("protocol-relative connection URLs carry the same credential", () => {
    const findings = scanContent("cfg.ts", `const dsn = "//svc:Xk9mQpRt2Lw@db.internal:5432/db";`);
    expect(findings.map((f) => f.ruleId)).toContain("gitleaks-replacement/basic-auth-in-url");
  });
});

describe("scanContent — path traversal", () => {
  test("flags a filesystem read fed by request input", () => {
    const findings = scanContent("srv.js", `fs.readFile(req.query.path, cb);`);
    expect(findings.map((f) => f.ruleId)).toContain("path-traversal/fs-read-from-request");
  });

  test("flags path.join over request params", () => {
    const findings = scanContent("srv.js", `const p = path.join(base, req.params.name);`);
    expect(findings.map((f) => f.ruleId)).toContain("path-traversal/path-join-request-input");
  });

  test("flags URL-encoded traversal sequences", () => {
    const findings = scanContent("t.txt", `GET /files?p=..%2f..%2fetc/passwd`);
    expect(findings.map((f) => f.ruleId)).toContain("path-traversal/encoded-traversal-sequence");
  });

  test("flags python open() on request-controlled paths", () => {
    const findings = scanContent("app.py", `f = open(request.args.get("name"))`);
    expect(findings.map((f) => f.ruleId)).toContain("path-traversal/python-open-request-input");
  });

  test("ignores relative imports", () => {
    const findings = scanContent("a.ts", `import x from "../../../shared/x.ts";`);
    expect(findings.filter((f) => f.scanner === "path-traversal")).toHaveLength(0);
  });

  test.each([
    [`const body = await readFile(join(root, ctx.params.file));`, "path-build-from-ctx-input"], // aegis:ignore
    [`ctx.body = await readFile(ctx.request.body.path);`, "path-build-from-ctx-input"], // aegis:ignore
    [`reply.sendFile(request.params.name);`, "path-build-from-ctx-input"], // aegis:ignore
    [`const raw = readFileSync(context.query.tpl);`, "path-build-from-ctx-input"], // aegis:ignore
  ])("covers Koa/Fastify handler shapes: %p", (line, id) => {
    expect(scanContent("srv.js", line).map((f) => f.ruleId)).toContain(`path-traversal/${id}`);
  });

  test.each<[string, string, string]>([
    ["h.go", `f, err := os.Open(base + r.URL.Query().Get("f"))`, "go-file-open-from-request"], // aegis:ignore
    ["h.go", `data, _ := os.ReadFile(dir + r.FormValue("name"))`, "go-file-open-from-request"], // aegis:ignore
    ["files.rb", `content = File.read(params[:path])`, "ruby-file-read-from-params"], // aegis:ignore
    ["Down.java", `new FileInputStream(request.getParameter("f"))`, "java-file-from-request-parameter"], // aegis:ignore
    ["view.php", `echo file_get_contents($_GET['page']);`, "php-file-read-from-superglobal"], // aegis:ignore
    ["view.php", `include($_REQUEST['tpl']);`, "php-file-read-from-superglobal"], // aegis:ignore
  ])("covers %s traversal sinks: %p", (path, line, id) => {
    expect(scanContent(path, line).map((f) => f.ruleId)).toContain(`path-traversal/${id}`);
  });

  test.each<[string, string]>([
    ["h.go", `f, err := os.Open(filepath.Join(root, cleaned))`],
    ["files.rb", `content = File.read(allowed_path)`],
    ["view.php", `echo file_get_contents(ALLOWED_TEMPLATE);`],
  ])("does not flag %s when the path is not request-derived: %p", (path, line) => {
    expect(scanContent(path, line).filter((f) => f.scanner === "path-traversal")).toHaveLength(0);
  });
});

describe("scanContent — hardcoded IP", () => {
  test("grades a routable address as medium", () => {
    const finding = scanContent("cfg.ts", `const host = "8.8.8.8";`).find(
      (f) => f.ruleId === "hardcoded-ip/hardcoded-ipv4",
    );
    expect(finding?.severity).toBe("medium");
  });

  test("grades RFC1918 space as low", () => {
    const finding = scanContent("cfg.ts", `const host = "10.2.3.4";`).find(
      (f) => f.ruleId === "hardcoded-ip/hardcoded-ipv4",
    );
    expect(finding?.severity).toBe("low");
  });

  test("ignores loopback, unspecified and netmask literals", () => {
    const content = `a="127.0.0.1"\nb="0.0.0.0"\nc="255.255.255.0"`;
    expect(scanContent("cfg.ts", content).filter((f) => f.scanner === "hardcoded-ip")).toHaveLength(0);
  });

  test("ignores version-looking lines", () => {
    const content = `"version": "1.14.30"\nconst v = "10.2.3.4"; // package version bump`;
    const findings = scanContent("cfg.ts", content).filter((f) => f.scanner === "hardcoded-ip");
    expect(findings).toHaveLength(0);
  });

  test.each(["::1", "fe80::1", "2001:db8::1", "2001:0db8:0000:0000:0000:0000:1428:57ab", "ff02::1", "fd00::5"])(
    "drops reserved IPv6 literal %p",
    (ip) => {
      expect(scanContent("cfg.ts", `const host = "${ip}";`).filter((f) => f.scanner === "hardcoded-ip")).toHaveLength(0);
    },
  );

  test.each(["2607:f8b0:4004:800::200e", "2606:4700:4700::1111", "2a00:1450:4001:0815:0000:0000:0000:200e"])( // aegis:ignore
    "detects routable IPv6 literal %p, compressed or not",
    (ip) => {
      const finding = scanContent("cfg.ts", `const host = "${ip}";`).find(
        (f) => f.ruleId === "hardcoded-ip/hardcoded-ipv6",
      );
      expect(finding?.severity).toBe("low");
    },
  );

  test.each([`const at = "12:34:56";`, `Foo::Bad y;`, `std::vector<int> v;`, `const port = "8080:8080";`])(
    "colon-separated text that is not an address is ignored: %p",
    (line) => {
      expect(scanContent("cfg.ts", line).filter((f) => f.scanner === "hardcoded-ip")).toHaveLength(0);
    },
  );
});

describe("scanContent — weak crypto", () => {
  test.each([
    [`crypto.createHash("md5").update(x)`, "weak-crypto/weak-hash-md5"],
    [`hashlib.sha1(data)`, "weak-crypto/weak-hash-sha1"],
    [`cipher = AES.new(key, AES.MODE_ECB)`, "weak-crypto/ecb-mode"],
    [`const token = Math.random().toString(36)`, "weak-crypto/insecure-random-for-secret"],
    [`const agent = new https.Agent({ rejectUnauthorized: false })`, "weak-crypto/tls-verification-disabled"],
    [`jwt.sign(payload, key, { algorithm: "none" })`, "weak-crypto/jwt-algorithm-none"],
    [`generateKeyPair("rsa", { modulusLength: 1024 })`, "weak-crypto/weak-rsa-key-size"],
    [`crypto.pseudoRandomBytes(16)`, "weak-crypto/pseudo-random-bytes"],
  ])("flags %p", (line, expected) => {
    expect(scanContent("a.ts", line).map((f) => f.ruleId)).toContain(expected);
  });

  test.each<[string, string, string]>([
    ["Digest.java", `MessageDigest.getInstance("MD5")`, "weak-hash-md5-broad"], // aegis:ignore
    ["hash.php", `$h = md5($input);`, "weak-hash-md5-broad"], // aegis:ignore
    ["Hash.cs", `using var h = MD5.Create();`, "weak-hash-md5-broad"], // aegis:ignore
    ["hash.rs", `let mut h = Md5::new();`, "weak-hash-md5-broad"], // aegis:ignore
    ["Digest.java", `MessageDigest.getInstance("SHA-1")`, "weak-hash-sha1-broad"], // aegis:ignore
    ["hash.php", `$h = sha1($input);`, "weak-hash-sha1-broad"], // aegis:ignore
    ["Hash.cs", `using var h = SHA1.Create();`, "weak-hash-sha1-broad"], // aegis:ignore
    ["hash.rs", `let mut h = Sha1::new();`, "weak-hash-sha1-broad"], // aegis:ignore
  ])("catches broken hashes outside JS/Python — %s %p", (path, line, id) => {
    expect(scanContent(path, line).map((f) => f.ruleId)).toContain(`weak-crypto/${id}`);
  });

  test("does not flag SHA-256", () => {
    const findings = scanContent("a.ts", `crypto.createHash("sha256")`);
    expect(findings.filter((f) => f.scanner === "weak-crypto")).toHaveLength(0);
  });

  test("prose mentioning ECB is not a cipher selection", () => {
    const findings = scanContent("doc.md", `Avoid ECB because it leaks structure.`);
    expect(findings.filter((f) => f.scanner === "weak-crypto")).toHaveLength(0);
  });
});

describe("scanContent — controls", () => {
  test("inline aegis:ignore suppresses a line", () => {
    const findings = scanContent("a.ts", `const id = "${FAKE.awsKeyId}"; // aegis:ignore`);
    expect(findings).toHaveLength(0);
  });

  test("very long lines (minified output) are skipped", () => {
    const line = `x`.repeat(2500) + FAKE.awsKeyId;
    expect(scanContent("a.js", line)).toHaveLength(0);
  });

  test("per-rule matches are capped per file", () => {
    const content = Array.from({ length: 40 }, () => `id = "${FAKE.awsKeyId}"`).join("\n");
    const hits = scanContent("a.ts", content, { maxMatchesPerRulePerFile: 3 }).filter(
      (f) => f.ruleId === "gitleaks-replacement/aws-access-key-id",
    );
    expect(hits).toHaveLength(3);
  });

  test("line numbers are 1-based", () => {
    const finding = scanContent("a.ts", `line one\nline two\nid = "${FAKE.awsKeyId}"`)[0]!;
    expect(finding.location?.startLine).toBe(3);
  });

  test("fingerprints are stable across runs and unique per location", () => {
    const content = `a = "${FAKE.awsKeyId}"\nfiller\nb = "${FAKE.awsKeyId}"`;
    const first = scanContent("a.ts", content);
    const second = scanContent("a.ts", content);
    expect(first.map((f) => f.fingerprint)).toEqual(second.map((f) => f.fingerprint));
    expect(new Set(first.map((f) => f.fingerprint)).size).toBe(first.length);
  });
});

describe("scanPath", () => {
  test.each([
    ["deploy/server.pem", "gitleaks-replacement/committed-private-key-file"],
    ["config/.env", "gitleaks-replacement/committed-env-file"],
    ["config/.env.production", "gitleaks-replacement/committed-env-file"],
    ["infra/credentials.json", "gitleaks-replacement/committed-credentials-file"],
    ["ops/kubeconfig", "gitleaks-replacement/committed-credentials-file"],
  ])("flags %p", (path, expected) => {
    expect(scanPath(path).map((f) => f.ruleId)).toContain(expected);
  });

  test.each([".env.example", ".env.schema", "credentials.json.template", "server.pem.sample"])(
    "does not flag documented template %p",
    (path) => {
      expect(scanPath(path)).toHaveLength(0);
    },
  );

  test("ordinary source files produce nothing", () => {
    expect(scanPath("src/index.ts")).toHaveLength(0);
  });
});

describe("compileIgnorePatterns", () => {
  test("skips comments, blanks and negations", () => {
    expect(compileIgnorePatterns("# comment\n\n!keep\n")).toHaveLength(0);
  });

  test("matches a directory and everything under it", () => {
    const [re] = compileIgnorePatterns("build/");
    expect(re?.test("build/out.js")).toBe(true);
    expect(re?.test("src/build/out.js")).toBe(true);
    expect(re?.test("rebuilt/out.js")).toBe(false);
  });

  test("supports single-segment globs", () => {
    const [re] = compileIgnorePatterns("*.snap");
    expect(re?.test("src/x.snap")).toBe(true);
    expect(re?.test("src/x.ts")).toBe(false);
  });

  test("dots are literal, not wildcards", () => {
    const [re] = compileIgnorePatterns(".env");
    expect(re?.test(".env")).toBe(true);
    expect(re?.test("xenv")).toBe(false);
  });

  test("a trailing /** matches the directory and everything under it", () => {
    const [re] = compileIgnorePatterns("node_modules/**");
    expect(re?.test("node_modules")).toBe(true);
    expect(re?.test("node_modules/pkg/index.js")).toBe(true);
    expect(re?.test("src/node_modules/pkg/index.js")).toBe(true);
    expect(re?.test("node_modules_backup")).toBe(false);
  });

  test("a leading **/ spans zero or more directories", () => {
    const [re] = compileIgnorePatterns("**/*.min.js");
    expect(re?.test("app.min.js")).toBe(true);
    expect(re?.test("a/b/app.min.js")).toBe(true);
    expect(re?.test("a/b/app.js")).toBe(false);
  });

  test("an interior ** spans zero or more directories", () => {
    const [re] = compileIgnorePatterns("src/**/fixtures");
    expect(re?.test("src/fixtures")).toBe(true);
    expect(re?.test("src/a/b/fixtures/data.json")).toBe(true);
    expect(re?.test("src/a/notfixtures")).toBe(false);
  });

  test("nested literal paths match against the relative path", () => {
    const [re] = compileIgnorePatterns("src/core/custom-patterns.test.ts");
    expect(re?.test("src/core/custom-patterns.test.ts")).toBe(true);
    expect(re?.test("src/core/custom-patterns.ts")).toBe(false);
  });

  test("? matches a single non-separator character", () => {
    const [re] = compileIgnorePatterns("log?.txt");
    expect(re?.test("log1.txt")).toBe(true);
    expect(re?.test("log.txt")).toBe(false);
    expect(re?.test("log/.txt")).toBe(false);
  });
});

describe("createPathExcluder", () => {
  const root = "/repo";

  test("matches absolute paths reported by external scanners", () => {
    const excluded = createPathExcluder(root, ["src/core/patterns.test.ts", "docs/agents/**"]);
    expect(excluded("/repo/src/core/patterns.test.ts")).toBe(true);
    expect(excluded("/repo/docs/agents/reviewer.md")).toBe(true);
    expect(excluded("/repo/src/core/patterns.ts")).toBe(false);
  });

  test("matches root-relative paths too", () => {
    const excluded = createPathExcluder(root, ["dist/**"]);
    expect(excluded("dist/cli/index.js")).toBe(true);
    expect(excluded("src/cli/index.ts")).toBe(false);
  });

  test("never excludes paths outside the scan root", () => {
    const excluded = createPathExcluder(root, ["src/**"]);
    expect(excluded("/elsewhere/src/secret.ts")).toBe(false);
  });

  test("an empty pattern list excludes nothing", () => {
    const excluded = createPathExcluder(root, []);
    expect(excluded("/repo/anything.ts")).toBe(false);
    expect(excluded(undefined)).toBe(false);
  });
});

describe("runBuiltinScan", () => {
  async function fixtureRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "aegis-builtin-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });

    await writeFile(join(root, "src", "app.ts"), `const id = "${FAKE.awsKeyId}";\nconst host = "8.8.8.8";\n`);
    await writeFile(join(root, "src", "hash.ts"), `crypto.createHash("md5");\n`);
    await writeFile(join(root, "server.pem"), "not-actually-key-material\n");
    await writeFile(join(root, "node_modules", "pkg", "leak.js"), `const id = "${FAKE.awsKeyId}";\n`);
    await writeFile(join(root, "dist", "leak.js"), `const id = "${FAKE.awsKeyId}";\n`);
    await writeFile(join(root, "logo.png"), "PNG binary-ish");
    return root;
  }

  test("walks a repo, honours skip dirs, and reports per-family timings", async () => {
    const root = await fixtureRepo();
    try {
      const outcome = await runBuiltinScan(root);
      const files = outcome.findings.map((f) => f.location?.file ?? "");

      expect(files).toContain("src/app.ts");
      expect(files).toContain("src/hash.ts");
      expect(files).toContain("server.pem");
      // Vendored and build output are never scanned.
      expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
      expect(files.some((f) => f.startsWith("dist/"))).toBe(false);
      // Binary extensions are skipped outright.
      expect(files.some((f) => f.endsWith(".png"))).toBe(false);

      for (const scanner of BUILTIN_SCANNERS) {
        expect(outcome.durationByScanner[scanner]).toBeGreaterThanOrEqual(0);
      }
      expect(outcome.filesScanned).toBeGreaterThan(0);
      assertNoValueLeak(JSON.stringify(outcome.findings));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("honours .aegisignore", async () => {
    const root = await fixtureRepo();
    try {
      await writeFile(join(root, ".aegisignore"), "src/app.ts\n");
      const outcome = await runBuiltinScan(root);
      expect(outcome.findings.map((f) => f.location?.file)).not.toContain("src/app.ts");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("respects the global finding cap", async () => {
    const root = await fixtureRepo();
    try {
      const outcome = await runBuiltinScan(root, { maxFindings: 1 });
      expect(outcome.findings).toHaveLength(1);
      expect(outcome.truncated).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a missing directory yields an empty result rather than throwing", async () => {
    const outcome = await runBuiltinScan(join(tmpdir(), "aegis-does-not-exist-xyz"));
    expect(outcome.findings).toHaveLength(0);
    expect(outcome.filesScanned).toBe(0);
  });
});
