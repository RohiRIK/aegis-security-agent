import { describe, expect, test } from "bun:test";
import { scanContent, type BuiltinScanOptions } from "./builtin-scan.ts";
import { detectLanguage, PATTERN_RULES, ruleAppliesTo, type Language } from "./patterns.ts";

/** Rule ids reported by the `custom-patterns` family for this content. */
function customRuleIds(path: string, content: string, options?: BuiltinScanOptions): string[] {
  return scanContent(path, content, options)
    .filter((f) => f.scanner === "custom-patterns")
    .map((f) => f.ruleId);
}

describe("detectLanguage", () => {
  test.each<[string, Language]>([
    ["src/app.ts", "javascript"],
    ["src/app.tsx", "javascript"],
    ["src/app.mjs", "javascript"],
    ["main.py", "python"],
    ["Deploy.ps1", "powershell"],
    ["scripts/install.sh", "shell"],
    ["README.md", "any"],
    ["Makefile", "any"],
    ["archive.tar.gz", "any"],
  ])("resolves %p by extension", (path, expected) => {
    expect(detectLanguage(path)).toBe(expected);
  });

  test.each<[string, Language]>([
    ["#!/usr/bin/env python3", "python"],
    ["#!/bin/bash", "shell"],
    ["#!/usr/bin/env node", "javascript"],
    ["#!/usr/bin/pwsh", "powershell"],
  ])("falls back to shebang %p", (shebang, expected) => {
    expect(detectLanguage("scripts/run", shebang)).toBe(expected);
  });

  test("extension wins over shebang", () => {
    expect(detectLanguage("run.py", "#!/bin/bash")).toBe("python");
  });

  test("a dotfile with no extension is not misread", () => {
    expect(detectLanguage(".gitignore")).toBe("any");
  });
});

describe("ruleAppliesTo", () => {
  const tagged = PATTERN_RULES.find((r) => r.languages?.includes("python"));
  const untagged = PATTERN_RULES.find((r) => !r.languages);

  test("untagged rules run everywhere", () => {
    expect(ruleAppliesTo(untagged!, "powershell")).toBe(true);
    expect(ruleAppliesTo(untagged!, "any")).toBe(true);
  });

  test("tagged rules run only on their language", () => {
    expect(ruleAppliesTo(tagged!, "python")).toBe(true);
    expect(ruleAppliesTo(tagged!, "javascript")).toBe(false);
  });
});

describe("python rules", () => {
  test.each([
    [`result = eval(user_input)`, "custom-patterns/python-eval-exec"], // aegis:ignore
    [`data = pickle.loads(payload)`, "custom-patterns/python-pickle-load"],
    [`os.system("ls " + name)`, "custom-patterns/python-os-system"],
    [`subprocess.run(cmd, shell=True)`, "custom-patterns/python-subprocess-shell-true"],
    [`cfg = yaml.load(stream)`, "custom-patterns/python-yaml-unsafe-load"],
    [`cur.execute(f"SELECT * FROM t WHERE id={uid}")`, "custom-patterns/python-fstring-sql"],
    [`    assert request.user.is_admin`, "custom-patterns/python-assert-as-validation"],
    [`path = tempfile.mktemp()`, "custom-patterns/python-tempfile-mktemp"],
  ])("flags %p", (line, expected) => {
    expect(customRuleIds("app.py", line)).toContain(expected);
  });

  test.each([
    `cfg = yaml.safe_load(stream)`,
    `cfg = yaml.load(stream, Loader=yaml.SafeLoader)`,
    `subprocess.run(["ls", name])`,
    `cur.execute("SELECT * FROM t WHERE id=%s", (uid,))`,
  ])("does not flag safe form %p", (line) => {
    expect(customRuleIds("app.py", line)).toHaveLength(0);
  });

  test("python rules do not fire on TypeScript", () => {
    expect(customRuleIds("app.ts", `os.system("ls")\npickle.loads(x)`)).toHaveLength(0);
  });
});

describe("javascript rules", () => {
  test.each([
    [`el.innerHTML = req.query.name;`, "custom-patterns/js-innerhtml-from-input"], // aegis:ignore
    [`node.innerHTML = "<b>" + userData + "</b>";`, "custom-patterns/js-innerhtml-from-input"], // aegis:ignore
    [`document.write(banner);`, "custom-patterns/js-document-write"], // aegis:ignore
    [`document.writeln(banner);`, "custom-patterns/js-document-write"], // aegis:ignore
    [`<div dangerouslySetInnerHTML={{ __html: html }} />`, "custom-patterns/react-dangerously-set-inner-html"], // aegis:ignore
    [`eval(userCode);`, "custom-patterns/js-eval-on-runtime-value"], // aegis:ignore
    [`const f = new Function(body);`, "custom-patterns/js-eval-on-runtime-value"], // aegis:ignore
    ["execSync(`git log ${branch}`)", "custom-patterns/js-child-process-template-string"], // aegis:ignore
  ])("flags %p", (line, expected) => {
    expect(customRuleIds("ui.tsx", line)).toContain(expected);
  });

  test.each([
    `el.textContent = req.query.name;`,
    `el.innerHTML = SAFE_STATIC_MARKUP;`,
    `execFile("git", ["log", branch]);`,
  ])("does not flag safe form %p", (line) => {
    expect(customRuleIds("ui.tsx", line)).toHaveLength(0);
  });

  test("javascript rules do not fire on Python", () => {
    expect(customRuleIds("app.py", `document.write(x)\nnew Function(body)`)).toHaveLength(0); // aegis:ignore
  });
});

describe("powershell rules", () => {
  test.each([
    [`IEX $payload`, "custom-patterns/powershell-invoke-expression"],
    [`Invoke-Expression $cmd`, "custom-patterns/powershell-invoke-expression"],
    [
      `(New-Object Net.WebClient).DownloadString($u) | IEX`,
      "custom-patterns/powershell-download-execute",
    ],
    [`Invoke-WebRequest $u -SkipCertificateCheck`, "custom-patterns/powershell-skip-certificate-check"],
    [
      `$s = ConvertTo-SecureString "hunter2value" -AsPlainText -Force`,
      "custom-patterns/powershell-plaintext-secure-string",
    ],
    [`$Password = "Wint3rIsC0ming"`, "custom-patterns/powershell-plaintext-password-variable"],
    [`[Reflection.Assembly]::Load($bytes)`, "custom-patterns/powershell-assembly-load"],
    [
      `Set-ItemProperty HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run -Name x`,
      "custom-patterns/powershell-runkey-persistence",
    ],
  ])("flags %p", (line, expected) => {
    expect(customRuleIds("Deploy.ps1", line)).toContain(expected);
  });

  test("PowerShell cmdlet names in prose are not flagged", () => {
    expect(customRuleIds("README.md", `Avoid Invoke-Expression in scripts.`)).toHaveLength(0);
  });
});

describe("shell rules", () => {
  test.each([
    [`curl -sSL https://get.example.com | bash`, "custom-patterns/shell-pipe-to-interpreter"],
    [`wget -qO- https://x.test/i.sh | sudo sh`, "custom-patterns/shell-pipe-to-interpreter"],
    [`eval "$(command-that-prints-code)"`, "custom-patterns/shell-eval-command-substitution"],
    [`echo hi > /tmp/build.log`, "custom-patterns/shell-predictable-temp-file"],
    [`rm -rf $BUILD_DIR`, "custom-patterns/shell-recursive-force-remove-root"],
    [`chmod -R 777 /srv/app`, "custom-patterns/shell-world-writable-chmod"],
  ])("flags %p", (line, expected) => {
    expect(customRuleIds("install.sh", line)).toContain(expected);
  });

  test("mktemp is the recommended form and is not flagged", () => {
    const ids = customRuleIds("install.sh", `f=$(mktemp /tmp/build.XXXXXX)`);
    expect(ids).not.toContain("custom-patterns/shell-predictable-temp-file");
  });

  test("pipe-to-shell is caught in any file type (CI configs, docs, Dockerfiles)", () => {
    expect(customRuleIds("Dockerfile", `RUN curl -fsSL https://x.test/i.sh | sh`)).toContain(
      "custom-patterns/shell-pipe-to-interpreter",
    );
  });
});

describe("language-agnostic rules", () => {
  test("flags a long high-entropy base64 blob", () => {
    // Real base64 of random bytes — entropy ~5.7, above the 4.5 gate. Entropy
    // is bounded by log2(distinct chars), so a blob cycling a few characters
    // cannot reach the gate at all; the uniqueness guard below covers the case
    // where an operator lowers the gate by configuration.
    const blob =
      "pU3KGCUwux1tEyze1iN7LtkeP3IfyxlxF0SU1kk8nVw0YL4xIB5p/tqg7ui5mX9cfCmZ/a/lkyU81lSvTfrXFCegrrP+6SMvivIhH57kkcWxC+y1Vjv8Hm+TQn7LyP4pVeXNjkbcjtS3wnZNKlpNdncG+F2GkAJK";
    expect(customRuleIds("payload.ts", `const p = "${blob}";`)).toContain(
      "custom-patterns/long-base64-blob",
    );
  });

  test("flags an unresolved security TODO", () => {
    expect(customRuleIds("a.ts", `// TODO: sanitize this before release`)).toContain(
      "custom-patterns/security-todo-marker",
    );
  });

  test("an ordinary TODO is not a security finding", () => {
    expect(customRuleIds("a.ts", `// TODO: rename this variable`)).toHaveLength(0);
  });

  test.each(["CHANGELOG.md", "docs/CONTRIBUTING.md", "SECURITY.md", "docs/generated/api.md", "out/bundle.js"])(
    "a security marker in %p is documentation or generated output, not an action item",
    (path) => {
      expect(customRuleIds(path, `TODO: sanitize input before release`)).not.toContain(
        "custom-patterns/security-todo-marker",
      );
    },
  );

  test("a long blob built from a handful of characters is not an embedded artifact", () => {
    // Uniqueness guard: independent of the entropy gate, so it still holds when
    // an operator lowers the custom-patterns gate through aegis-rules.json.
    const homogeneous = "ABCD".repeat(40);
    const ids = customRuleIds("payload.ts", `const p = "${homogeneous}";`, {
      entropyOverrides: { "custom-patterns": 0.5 },
    });
    expect(ids).not.toContain("custom-patterns/long-base64-blob");
  });

  test("a high-entropy blob still reports with the gate lowered", () => {
    const blob =
      "pU3KGCUwux1tEyze1iN7LtkeP3IfyxlxF0SU1kk8nVw0YL4xIB5p/tqg7ui5mX9cfCmZ/a/lkyU81lSvTfrXFCegrrP+6SMvivIhH57kkcWxC+y1Vjv8Hm+TQn7LyP4pVeXNjkbcjtS3wnZNKlpNdncG+F2GkAJK";
    const ids = customRuleIds("payload.ts", `const p = "${blob}";`, {
      entropyOverrides: { "custom-patterns": 0.5 },
    });
    expect(ids).toContain("custom-patterns/long-base64-blob");
  });

  test.each([
    `subprocess.call(cmd)  # nosec`,
    `const x = y; // nosemgrep`,
    `allow_insecure = True`,
  ])("flags inline suppression %p", (line) => {
    expect(customRuleIds("a.py", line)).toContain("custom-patterns/disabled-security-control");
  });
});
