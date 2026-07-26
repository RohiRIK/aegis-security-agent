import type { AegisEventSeverity, InternalScannerName } from "../events/types.ts";

/**
 * Built-in regex scanners. Each family is surfaced as its own scanner in the
 * report so a reader can tell *which* analysis produced a finding.
 *
 * SECRET-HANDLING INVARIANT: nothing in this module ever copies a matched
 * value into a rule title, a message, or a finding. Rules describe the *shape*
 * of what they matched; the matched text stays in the scanner's local scope and
 * is discarded. See `builtin-scan.ts` and its redaction tests.
 */
export type BuiltinScannerName = InternalScannerName;

export const BUILTIN_SCANNERS: BuiltinScannerName[] = [
  "gitleaks-replacement",
  "custom-patterns",
  "path-traversal",
  "hardcoded-ip",
  "weak-crypto",
];

/**
 * Source language a rule applies to. Untagged rules (and rules tagged `any`)
 * run against every file; tagged rules only run when the file's language
 * matches, which keeps Python sinks from firing on TypeScript and vice versa.
 */
export type Language = "javascript" | "python" | "powershell" | "shell" | "any";

const EXTENSION_LANGUAGE: Record<string, Language> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "javascript", tsx: "javascript", mts: "javascript", cts: "javascript",
  vue: "javascript", svelte: "javascript",
  py: "python", pyw: "python", pyi: "python",
  ps1: "powershell", psm1: "powershell", psd1: "powershell",
  sh: "shell", bash: "shell", zsh: "shell", ksh: "shell",
};

const SHEBANG_LANGUAGE: [RegExp, Language][] = [
  [/^#!.*\b(?:python[\d.]*)\b/, "python"],
  [/^#!.*\b(?:bash|sh|zsh|ksh|dash)\b/, "shell"],
  [/^#!.*\b(?:node|bun|deno)\b/, "javascript"],
  [/^#!.*\bpwsh\b/, "powershell"],
];

/**
 * Resolves a file's language from its extension, falling back to the shebang
 * for extensionless executables. Unknown files resolve to `any`, which runs
 * only the language-agnostic rules.
 */
export function detectLanguage(path: string, firstLine?: string): Language {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot > slash + 1) {
    const byExtension = EXTENSION_LANGUAGE[path.slice(dot + 1).toLowerCase()];
    if (byExtension) return byExtension;
  }
  if (firstLine?.startsWith("#!")) {
    for (const [pattern, language] of SHEBANG_LANGUAGE) {
      if (pattern.test(firstLine)) return language;
    }
  }
  return "any";
}

export type PatternRule = {
  scanner: BuiltinScannerName;
  /** Stable id; the finding's ruleId is `<scanner>/<id>`. */
  id: string;
  /** Human-readable description of the *shape* matched — never the match. */
  title: string;
  severity: AegisEventSeverity;
  /** Always constructed with the `g` flag; `lastIndex` is reset before use. */
  regex: RegExp;
  /** Remediation guidance rendered in the report's Fix Guide column. */
  fix: string;
  /** Languages this rule applies to. Omitted ⇒ every file. */
  languages?: Language[];
  /** Minimum Shannon entropy (bits/char) of capture group 1, when present. */
  minEntropy?: number;
  /** Rejects a match when the surrounding line matches (false-positive guard). */
  lineExcludes?: RegExp;
  /** Rejects a match when the *file path* matches — tests, fixtures, examples. */
  pathExcludes?: RegExp;
  /** Re-classifies (or drops, via null) a match at scan time. */
  classify?: (match: string) => AegisEventSeverity | null;
};

/**
 * Paths whose contents are deliberately unrealistic: test fixtures, examples and
 * generated snapshots. Rules prone to firing on illustrative code opt out of
 * these via `pathExcludes`.
 */
export const TEST_OR_EXAMPLE_PATH =
  /(?:^|\/)(?:tests?|__tests__|__mocks__|__fixtures__|fixtures?|examples?|samples?|spec|specs|e2e|testdata|mocks?)(?:\/|$)|\.(?:test|spec|snap|stories)\.[a-z]+$|(?:^|\/)conftest\.py$|_test\.[a-z]+$/i;

/**
 * `TEST_OR_EXAMPLE_PATH` plus the places a security *marker* is narrative rather
 * than actionable: release notes, contributor/security docs, and build output.
 * Composed from the source above so the two never drift apart.
 */
export const DOC_OR_GENERATED_PATH = new RegExp(
  `${TEST_OR_EXAMPLE_PATH.source}|(?:^|/)(?:CHANGELOG|CONTRIBUTING|SECURITY|HISTORY|RELEASE[-_]?NOTES)[^/]*$|(?:^|/)(?:generated|out|dist)/`,
  "i",
);

/** True when a rule should run against a file of this language. */
export function ruleAppliesTo(rule: PatternRule, language: Language): boolean {
  if (!rule.languages || rule.languages.includes("any")) return true;
  return rule.languages.includes(language);
}

// ---------------------------------------------------------------------------
// Entropy + placeholder heuristics
// ---------------------------------------------------------------------------

/** Shannon entropy in bits per character. Empty string is 0. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of value) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * True when text looks like a documented placeholder or an *indirect* reference
 * (env var, template variable, CI secret) rather than a literal credential.
 * Applied to both the matched value and its line for the `secrets` family.
 */
const PLACEHOLDER_RE =
  /(?:example|placeholder|redacted|dummy|sample|changeme|fake|not[_-]?a[_-]?real|your[_-]?[a-z]*|xxx{2,}|\byyy+\b|<[a-z0-9_ -]+>|\$\{[^}]*\}|\$[A-Z][A-Z0-9_]{2,}|process\.env|import\.meta\.env|os\.environ|os\.getenv|ENV\[|secrets\.[A-Za-z]|vars\.[A-Za-z]|\{\{[^}]*\}\}|0{6,}|1234567|abcdef0)/i;

export function looksLikePlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}

/** Inline suppression: a line carrying this marker is skipped by all rules. */
export const IGNORE_MARKER = "aegis:ignore";

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

function octets(ip: string): number[] {
  return ip.split(".").map((part) => Number.parseInt(part, 10));
}

/**
 * Grades a literal IPv4 address. Reserved/loopback/documentation addresses and
 * netmasks are dropped (null) — they are configuration constants, not
 * environment coupling. RFC1918 space is low; routable space is medium.
 */
export function classifyIpv4(ip: string): AegisEventSeverity | null {
  const [a, b] = octets(ip) as [number, number, number, number];
  if (a === 0 || a === 127) return null; // unspecified / loopback
  if (a === 255) return null; // broadcast + netmask literals (255.255.255.0)
  if (a >= 224) return null; // multicast + reserved
  if (a === 169 && b === 254) return null; // link-local
  if (a === 192 && b === 0) return null; // 192.0.2.0/24 TEST-NET-1 + IETF protocol space
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return null; // benchmark + TEST-NET-2
  if (a === 203 && b === 0) return null; // TEST-NET-3
  if (a === 10) return "low";
  if (a === 192 && b === 168) return "low";
  if (a === 172 && b >= 16 && b <= 31) return "low";
  if (a === 100 && b >= 64 && b <= 127) return "low"; // CGNAT
  return "medium";
}

/**
 * Expands a possibly `::`-compressed IPv6 literal into its 8 numeric groups.
 * Returns null when the text is not a well-formed address, which is how the
 * classifier drops near-misses the regex swept up.
 */
function expandIpv6(ip: string): number[] | null {
  const halves = ip.toLowerCase().split("::");
  if (halves.length > 2) return null; // "::" may appear at most once
  const groups = (part: string | undefined) => (part ? part.split(":") : []);
  const left = groups(halves[0]);
  const right = groups(halves[1]);

  if (halves.length === 1) {
    if (left.length !== 8) return null;
    return left.map((group) => Number.parseInt(group, 16));
  }

  const filled = 8 - left.length - right.length;
  if (filled < 1) return null; // "::" must stand for at least one zero group
  const all = [...left, ...Array.from({ length: filled }, () => "0"), ...right];
  return all.map((group) => Number.parseInt(group, 16));
}

/**
 * Grades a literal IPv6 address. Mirrors `classifyIpv4`: addresses that cannot
 * describe a real deployment target — loopback, link-local, unique-local,
 * multicast, and the documentation prefix — are dropped; anything routable is
 * low (an IPv6 literal in source is weaker environment coupling than IPv4,
 * which is usually an internal endpoint).
 */
export function classifyIpv6(ip: string): AegisEventSeverity | null {
  const groups = expandIpv6(ip);
  if (!groups) return null;

  const [first, second] = groups as [number, number, ...number[]];
  if (groups.every((group) => group === 0)) return null; // :: unspecified
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return null; // ::1 loopback
  if ((first & 0xffc0) === 0xfe80) return null; // fe80::/10 link-local
  if ((first & 0xfe00) === 0xfc00) return null; // fc00::/7 unique-local
  if ((first & 0xff00) === 0xff00) return null; // ff00::/8 multicast
  if (first === 0x2001 && second === 0x0db8) return null; // 2001:db8::/32 documentation
  return "low";
}

// ---------------------------------------------------------------------------
// Secret rules
// ---------------------------------------------------------------------------

/**
 * Regex secret detection layered *on top of* TruffleHog. TruffleHog verifies
 * live credentials against provider APIs; these rules catch the same shapes
 * offline plus formats TruffleHog does not ship a detector for (npmrc auth
 * tokens, docker config auth blobs, credentials embedded in URLs, generic
 * assignment patterns gated by entropy).
 */
const SECRET_RULES: PatternRule[] = [
  {
    scanner: "gitleaks-replacement",
    id: "aws-access-key-id",
    title: "AWS access key ID",
    severity: "high",
    regex: /\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b/g,
    fix: "Deactivate the key in IAM, rotate it, and load it from the environment or AWS SSO instead of source.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "aws-secret-access-key",
    title: "AWS secret access key assignment",
    severity: "critical",
    regex:
      /(?:aws)?_?(?:secret|private)_?(?:access)?_?key\s*[:=]\s*["'`]([A-Za-z0-9/+=]{40})["'`]/gi,
    fix: "Rotate the key pair in IAM immediately and purge it from git history (git filter-repo).",
    minEntropy: 3.5,
  },
  {
    scanner: "gitleaks-replacement",
    id: "github-token",
    title: "GitHub personal access / OAuth token",
    severity: "critical",
    regex: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36})\b/g,
    fix: "Revoke the token at github.com/settings/tokens and issue a fine-grained replacement stored in a secret manager.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "github-fine-grained-token",
    title: "GitHub fine-grained personal access token",
    severity: "critical",
    regex: /\b(github_pat_[A-Za-z0-9_]{30,})\b/g,
    fix: "Revoke the token at github.com/settings/tokens and re-issue it with the narrowest repo scope needed.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "gitlab-token",
    title: "GitLab personal access token",
    severity: "critical",
    regex: /\b(glpat-[A-Za-z0-9_-]{20,})\b/g,
    fix: "Revoke the token in GitLab user settings and replace it with a project CI/CD variable.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "npm-token",
    title: "npm access token",
    severity: "critical",
    regex: /\b(npm_[A-Za-z0-9]{36})\b/g,
    fix: "Revoke via `npm token revoke` and inject the replacement as NPM_TOKEN at publish time.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "npmrc-auth-token",
    title: "npm registry auth token in .npmrc syntax",
    severity: "critical",
    regex: /_authToken\s*=\s*([A-Za-z0-9._~+/-]{16,}=*)/g,
    fix: "Replace the literal with an env reference (`_authToken=${NPM_TOKEN}`) and revoke the exposed token.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "slack-token",
    title: "Slack API token",
    severity: "critical",
    regex: /\b(xox[baprse]-[A-Za-z0-9-]{10,})\b/g,
    fix: "Revoke the token in the Slack app admin console and rotate the app credentials.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "slack-webhook",
    title: "Slack incoming webhook URL",
    severity: "high",
    regex: /https:\/\/hooks\.slack\.com\/services\/([A-Za-z0-9+/]{18,})/g,
    fix: "Delete the webhook in Slack — anyone holding the URL can post as the app — and re-create it as a secret.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "stripe-live-key",
    title: "Stripe live secret key",
    severity: "critical",
    regex: /\b((?:sk|rk)_live_[A-Za-z0-9]{20,})\b/g,
    fix: "Roll the key in the Stripe dashboard now; live keys move money.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "stripe-test-key",
    title: "Stripe test secret key",
    severity: "low",
    regex: /\b((?:sk|rk)_test_[A-Za-z0-9]{20,})\b/g,
    fix: "Test keys are low risk but still belong in the environment, not in source.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "google-api-key",
    title: "Google API key",
    severity: "high",
    regex: /\b(AIza[0-9A-Za-z_-]{35})\b/g,
    fix: "Regenerate the key in the GCP console and add HTTP-referrer or IP restrictions.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "gcp-service-account-key",
    title: "GCP service-account key material",
    severity: "critical",
    regex: /"type"\s*:\s*"(service_account)"/g,
    fix: "Delete the service-account key in IAM and switch to workload identity federation.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "openai-api-key",
    title: "OpenAI API key",
    severity: "critical",
    regex: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/g,
    fix: "Revoke at platform.openai.com/api-keys and read the replacement from OPENAI_API_KEY.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "anthropic-api-key",
    title: "Anthropic API key",
    severity: "critical",
    regex: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g,
    fix: "Revoke in the Anthropic console and read the replacement from ANTHROPIC_API_KEY.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "huggingface-token",
    title: "Hugging Face access token",
    severity: "high",
    regex: /\b(hf_[A-Za-z0-9]{30,})\b/g,
    fix: "Revoke in Hugging Face account settings and use `huggingface-cli login` or HF_TOKEN.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "sendgrid-api-key",
    title: "SendGrid API key",
    severity: "critical",
    regex: /\b(SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})\b/g,
    fix: "Delete the key in the SendGrid dashboard — it can send mail as your domain.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "twilio-api-key",
    title: "Twilio API key SID",
    severity: "high",
    regex: /\b(SK[0-9a-fA-F]{32})\b/g,
    fix: "Delete the key in the Twilio console and store the replacement in a secret manager.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "azure-storage-account-key",
    title: "Azure storage account key",
    severity: "critical",
    regex: /AccountKey\s*=\s*([A-Za-z0-9+/]{40,}={0,2})/gi,
    fix: "Rotate the storage key in Azure and prefer SAS tokens or managed identity.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "private-key-block",
    title: "PEM private key block",
    severity: "critical",
    regex: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE KEY-----/g,
    fix: "Treat the key as compromised: re-issue the key pair, purge from git history, and store keys outside the repo.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "docker-config-auth",
    title: "Docker registry auth blob (base64 user:password)",
    severity: "critical",
    regex: /"auth"\s*:\s*"([A-Za-z0-9+/]{20,}={0,2})"/g,
    fix: "Registry auth blobs are plain base64, not encryption. Rotate the registry password and use a credential helper.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "docker-login-password",
    title: "Docker login password on the command line",
    severity: "critical",
    regex: /docker\s+login\b[^\n]*?(?:-p|--password)[= ]+(\S{6,})/g,
    fix: "Use `--password-stdin`; a CLI password lands in shell history and process listings. Rotate the credential.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "basic-auth-in-url",
    title: "Credentials embedded in a connection URL",
    severity: "high",
    // Scheme is optional: protocol-relative URLs (`//user:pass@host`) carry the
    // same credential and are how this rule was bypassed.
    regex: /(?:\b[a-z][a-z0-9+.-]{2,}:)?\/\/[^/\s:@"']+:([^/\s:@"']{4,})@/g,
    fix: "Move the password out of the URL into an env var or connection-secret, and rotate it.",
    minEntropy: 2.0,
  },
  {
    scanner: "gitleaks-replacement",
    id: "jwt-token",
    title: "JSON Web Token literal",
    severity: "medium",
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    fix: "JWT payloads are readable by anyone. If it is a live session or service token, revoke and re-issue it.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "generic-api-key-assignment",
    title: "High-entropy value assigned to an api-key/secret/token name",
    severity: "high",
    regex:
      /\b(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?token)\s*[:=]\s*["'`]([A-Za-z0-9_\-+/.=]{16,})["'`]/gi,
    fix: "Read the value from the environment at runtime and rotate the exposed credential.",
    // Raised from 3.2: the name anchor alone let low-entropy config values
    // through. Hex-charset keys cap at 4.0 bits/char, so they are covered by
    // `generic-api-key-hex-assignment` below rather than by loosening this gate.
    minEntropy: 4.0,
  },
  {
    scanner: "gitleaks-replacement",
    id: "generic-api-key-hex-assignment",
    title: "Hex-encoded key assigned to an api-key/secret/token name",
    severity: "high",
    // A 32-char hex key is a very common issuance format, and its 16-symbol
    // alphabet caps Shannon entropy just under 4.0 — the shape carries the
    // signal here, so the gate only has to reject runs of a few characters.
    regex:
      /\b(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?token)\s*[:=]\s*["'`]([0-9a-f]{32,})["'`]/gi,
    fix: "Read the value from the environment at runtime and rotate the exposed credential.",
    minEntropy: 3.0,
    pathExcludes: TEST_OR_EXAMPLE_PATH,
  },
  {
    scanner: "gitleaks-replacement",
    id: "generic-password-assignment",
    title: "Literal password assignment",
    severity: "medium",
    regex: /\b(?:password|passwd|pwd|passphrase)\s*[:=]\s*["'`]([^"'`\n]{8,})["'`]/gi,
    fix: "Load the password from a secret store; if it is a real credential, rotate it.",
    // 2.2 bits/char is deliberately low: real passwords are short and word-like
    // ("Tr0ub4dor&3" scores ~3.3, "hunter22" ~2.5). Reviewed and kept as-is —
    // raising it here trades a whole class of real findings for little noise.
    minEntropy: 2.2,
    pathExcludes: TEST_OR_EXAMPLE_PATH,
  },
  {
    scanner: "gitleaks-replacement",
    id: "high-entropy-string-assignment",
    title: "High-entropy string assigned to a variable",
    // Low by design: entropy is the only signal here, so the operator raises it
    // per-repo via aegis-rules.json rather than eating the noise everywhere.
    severity: "low",
    // Name-agnostic backstop for the rules above, which enumerate variable
    // names and so miss `const token = "..."` / `const appSecret = "..."`.
    regex: /\b\w+\s*[:=]\s*["'`]([A-Za-z0-9_\-+/.=]{20,})["'`]/g,
    fix: "Verify this value is a placeholder or move it to a secret manager and rotate it.",
    minEntropy: 4.0,
    pathExcludes: TEST_OR_EXAMPLE_PATH,
  },
];

// ---------------------------------------------------------------------------
// Path-traversal rules
// ---------------------------------------------------------------------------

const PATH_TRAVERSAL_RULES: PatternRule[] = [
  {
    scanner: "path-traversal",
    id: "fs-read-from-request",
    title: "Filesystem call takes a path derived from request input",
    severity: "high",
    regex:
      /\b(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|createWriteStream|unlink|unlinkSync|sendFile|appendFile|openSync)\s*\([^)]{0,160}\b(?:req|request)\.(?:query|params|body|headers|url)\b/g,
    fix: "Resolve the path and assert it stays under an allowed root (path.resolve + startsWith), or map input through an allowlist of ids.",
  },
  {
    scanner: "path-traversal",
    id: "path-join-request-input",
    title: "Path join with unvalidated request input",
    severity: "high",
    regex:
      /\b(?:path\.(?:join|resolve)|os\.path\.join)\s*\([^)]{0,160}\b(?:req|request)\.(?:query|params|body|args|form|values|headers)\b/g,
    fix: "path.join does not prevent traversal. Normalize first, then reject any result outside the base directory.",
  },
  {
    scanner: "path-traversal",
    id: "python-open-request-input",
    title: "Python open() on request-controlled path",
    severity: "high",
    regex: /\bopen\s*\(\s*[^)]{0,120}\brequest\.(?:args|form|json|values|GET|POST)\b/g,
    fix: "Use werkzeug.utils.secure_filename or resolve against a fixed root and verify with os.path.commonpath.",
  },
  {
    scanner: "path-traversal",
    id: "encoded-traversal-sequence",
    title: "URL-encoded directory traversal sequence",
    severity: "high",
    regex: /(?:%2e%2e(?:%2f|%5c|\/|\\)|\.\.%2f|\.\.%5c)/gi,
    fix: "Decode once, then canonicalize and re-validate. Double-decoding is how traversal filters get bypassed.",
  },
  {
    scanner: "path-traversal",
    id: "literal-traversal-path",
    title: "Literal ../../.. traversal in a path string",
    severity: "medium",
    regex: /["'`][^"'`\n]*(?:\.\.[\\/]){3,}[^"'`\n]*["'`]/g,
    fix: "Deep relative paths break when the working directory moves. Anchor to a module-relative or configured root.",
    lineExcludes: /(?:^\s*(?:\/\/|#|\*))|(?:import|require|from)\s/,
  },
  {
    scanner: "path-traversal",
    id: "archive-entry-path-join",
    title: "Archive entry name joined onto a path (zip-slip)",
    severity: "medium",
    regex:
      /\b(?:path\.join|path\.resolve|os\.path\.join)\s*\([^)]{0,120}\b(?:entry|zipEntry|zip_entry|member|tarinfo|archiveEntry)\b/g,
    fix: "Archive entries can contain `../`. Resolve each entry and skip any that escapes the extraction root.",
  },
  {
    scanner: "path-traversal",
    id: "path-build-from-ctx-input",
    title: "Filesystem call takes a path from Koa/Express ctx or Fastify request",
    severity: "high",
    // `fs-read-from-request` anchors on `req`/`request` *and* a fixed property
    // list; Koa's `ctx`, Fastify's handler argument and any destructuring of
    // either walked straight past it.
    regex:
      /\b(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|unlink|unlinkSync|sendFile|appendFile|openSync)\s*\([^)]{0,160}\b(?:ctx|context|request)\s*\./g,
    fix: "Resolve the path and assert it stays under an allowed root (path.resolve + startsWith).",
  },
  {
    scanner: "path-traversal",
    id: "go-file-open-from-request",
    title: "Go file open on a request-controlled path",
    severity: "high",
    regex:
      /\b(?:os\.Open(?:File)?|os\.ReadFile|ioutil\.ReadFile|os\.Create|os\.Remove)\s*\([^)]{0,160}\b(?:r\.URL\.Query|r\.Form|r\.PostForm|r\.FormValue|mux\.Vars)\b/g,
    fix: "Use filepath.Clean, then verify the result is still under the base directory before opening it.",
  },
  {
    scanner: "path-traversal",
    id: "ruby-file-read-from-params",
    title: "Ruby File operation on a params-controlled path",
    severity: "high",
    regex: /\bFile\.(?:read|open|join|delete|binread)\s*\([^)]{0,160}\b(?:params|request)\b/g,
    fix: "Reject the input unless it matches an allowlist, or use File.expand_path and check it stays under the root.",
  },
  {
    scanner: "path-traversal",
    id: "java-file-from-request-parameter",
    title: "Java file stream opened on a request parameter",
    severity: "high",
    regex:
      /\bnew\s+File(?:InputStream|Reader|OutputStream|Writer)?\s*\([^)]{0,160}\b(?:request|req)\.getParameter\b/g,
    fix: "Canonicalize with File.getCanonicalPath() and assert the result starts with the allowed base directory.",
  },
  {
    scanner: "path-traversal",
    id: "php-file-read-from-superglobal",
    title: "PHP file read from a request superglobal",
    severity: "high",
    regex:
      /\b(?:file_get_contents|fopen|readfile|include|include_once|require|require_once|unlink)\s*\(?[^;\n]{0,160}\$_(?:GET|POST|REQUEST|COOKIE)\b/g,
    fix: "Map the input through an allowlist of ids; realpath() alone still resolves outside the web root.",
  },
];

// ---------------------------------------------------------------------------
// Hardcoded-IP rules
// ---------------------------------------------------------------------------

const IPV4_RE =
  /\b((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})\b/g;

const HARDCODED_IP_RULES: PatternRule[] = [
  {
    scanner: "hardcoded-ip",
    id: "hardcoded-ipv4",
    title: "Hardcoded IPv4 address",
    severity: "medium",
    regex: IPV4_RE,
    fix: "Move the address to configuration. Baked-in IPs break on redeploy and leak internal topology.",
    // Version strings, semver ranges and dotted numeric IDs dominate the false
    // positives; drop the whole line when it reads like versioning metadata.
    lineExcludes:
      /(?:version|semver|\bv\d+\.\d+|@\d+\.\d+\.\d+|\bchangelog\b|\breleases?\b|copyright|©)/i,
    classify: classifyIpv4,
  },
  {
    scanner: "hardcoded-ip",
    id: "hardcoded-ipv6",
    title: "Hardcoded IPv6 address",
    severity: "low",
    // Three shapes: the fully expanded form, a `::`-compressed form with a head,
    // and one that starts at `::`. The lookaround pair keeps the match from
    // starting mid-token, which is what stops C++/Ruby scope resolution
    // (`Foo::Bad`) and clock times (`12:34:56`) from reading as addresses.
    regex:
      /(?<![:.\w])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?|::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6}))(?![:.\w])/g,
    fix: "Move the address to configuration rather than embedding it in source.",
    classify: classifyIpv6,
  },
];

// ---------------------------------------------------------------------------
// Weak-crypto rules
// ---------------------------------------------------------------------------

const WEAK_CRYPTO_RULES: PatternRule[] = [
  {
    scanner: "weak-crypto",
    id: "weak-hash-md5",
    title: "MD5 hash construction",
    severity: "medium",
    regex: /(?:createHash\s*\(\s*["'`]md5["'`]|hashlib\.md5\s*\(|MD5\.new\s*\(|md5\.New\s*\()/gi,
    fix: "MD5 is collision-broken. Use SHA-256 for integrity, or argon2id/bcrypt for passwords.",
  },
  {
    scanner: "weak-crypto",
    id: "weak-hash-sha1",
    title: "SHA-1 hash construction",
    severity: "medium",
    regex: /(?:createHash\s*\(\s*["'`]sha-?1["'`]|hashlib\.sha1\s*\(|SHA1\.new\s*\(|sha1\.New\s*\()/gi,
    fix: "SHA-1 is collision-broken. Move to SHA-256 or SHA-3.",
  },
  {
    scanner: "weak-crypto",
    id: "weak-cipher-des",
    title: "DES / 3DES cipher",
    severity: "high",
    regex: /(?:["'`](?:des|des3|des-ede3?)(?:-[a-z0-9]+)*["'`]|\bDES\.new\s*\(|\btriple.?des\b)/gi,
    fix: "DES and 3DES are retired (64-bit blocks, Sweet32). Use AES-256-GCM.",
  },
  {
    scanner: "weak-crypto",
    id: "weak-cipher-rc4",
    title: "RC4 cipher",
    severity: "high",
    regex: /(?:["'`]rc4(?:-[a-z0-9]+)?["'`]|\bARC4\b|\bRC4\.new\s*\()/gi,
    fix: "RC4 has practical keystream biases. Use AES-256-GCM or ChaCha20-Poly1305.",
  },
  {
    scanner: "weak-crypto",
    id: "ecb-mode",
    title: "ECB block-cipher mode",
    severity: "high",
    // Deliberately not a bare `\bECB\b` — that matches prose in security docs
    // far more often than it matches a cipher selection.
    regex: /(?:["'`][a-z0-9-]*-ecb["'`]|MODE_ECB)/gi,
    fix: "ECB leaks plaintext structure block by block. Use GCM (authenticated) instead.",
  },
  {
    scanner: "weak-crypto",
    id: "deprecated-create-cipher",
    title: "crypto.createCipher (MD5-derived key, no IV)",
    severity: "high",
    regex: /\bcrypto\.createCipher(?:iv)?\s*\(\s*["'`](?:des|rc4|[a-z0-9-]*-ecb)/gi,
    fix: "Use crypto.createCipheriv with AES-256-GCM and a random 12-byte IV per message.",
  },
  {
    scanner: "weak-crypto",
    id: "insecure-random-for-secret",
    title: "Math.random() used to build a token/secret/nonce",
    severity: "high",
    regex:
      /\b(?:token|secret|password|passwd|apikey|api_key|nonce|salt|iv|session[_-]?id|otp)\b[^\n]{0,60}Math\.random\s*\(/gi,
    fix: "Math.random is not a CSPRNG. Use crypto.randomBytes / crypto.getRandomValues.",
  },
  {
    scanner: "weak-crypto",
    id: "pseudo-random-bytes",
    title: "crypto.pseudoRandomBytes (non-cryptographic)",
    severity: "high",
    regex: /\bcrypto\.pseudoRandomBytes\s*\(/g,
    fix: "Replace with crypto.randomBytes.",
  },
  {
    scanner: "weak-crypto",
    id: "tls-verification-disabled",
    title: "TLS certificate verification disabled",
    severity: "high",
    regex:
      /(?:NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*["'`]?0|rejectUnauthorized\s*:\s*false|InsecureSkipVerify\s*:\s*true|ssl\._?create_unverified_context|ssl\.CERT_NONE|verify\s*=\s*False|--insecure\b|curl\b[^\n]*\s-k\b)/g,
    fix: "Disabling verification defeats TLS entirely. Trust a pinned CA bundle instead.",
  },
  {
    scanner: "weak-crypto",
    id: "jwt-algorithm-none",
    title: "JWT algorithm set to none",
    severity: "critical",
    regex: /["'`]?alg(?:orithm)?["'`]?\s*[:=]\s*["'`]none["'`]/gi,
    fix: "`alg: none` means unsigned tokens anyone can forge. Pin an explicit allowlist (RS256/EdDSA).",
  },
  {
    scanner: "weak-crypto",
    id: "weak-rsa-key-size",
    title: "RSA key size below 2048 bits",
    severity: "high",
    regex: /(?:modulusLength|key_?size|rsa_keygen_bits|-b\s)\s*[:=]?\s*(?:512|1024)\b/g,
    fix: "Generate at least 2048-bit RSA, or prefer Ed25519.",
  },
  {
    scanner: "weak-crypto",
    id: "static-initialization-vector",
    title: "Static / hardcoded initialization vector",
    severity: "medium",
    regex: /\biv\s*[:=]\s*(?:Buffer\.from\s*\(\s*)?["'`]([A-Za-z0-9+/=]{8,})["'`]/g,
    fix: "Reusing an IV across messages breaks CTR/GCM confidentiality. Generate a fresh random IV per encryption.",
  },
  {
    scanner: "weak-crypto",
    id: "hardcoded-crypto-salt",
    title: "Hardcoded password-hashing salt",
    severity: "medium",
    regex: /\bsalt\s*[:=]\s*["'`]([^"'`\n]{4,})["'`]/gi,
    fix: "A shared salt lets one rainbow table cover every user. Generate a random per-user salt.",
    pathExcludes: TEST_OR_EXAMPLE_PATH,
  },
  {
    scanner: "weak-crypto",
    id: "weak-hash-md5-broad",
    title: "MD5 hash construction (language-agnostic)",
    severity: "medium",
    // `weak-hash-md5` only knows the JS/Python/Ruby/Go constructors. This covers
    // Java MessageDigest, PHP's md5 builtin, C# MD5.Create and Rust's Md5 type.
    regex: /(?:["'`]MD5["'`]|\.getInstance\s*\(\s*["'`]MD5["'`]|md5\s*\(|MD5\.Create\s*\(|Md5::new\s*\()/gi,
    fix: "MD5 is collision-broken. Use SHA-256 for integrity, argon2id/bcrypt for passwords.",
    pathExcludes: /(?:node_modules|\.test\.[a-z]+$|spec\.[a-z]+$)/i,
  },
  {
    scanner: "weak-crypto",
    id: "weak-hash-sha1-broad",
    title: "SHA-1 hash construction (language-agnostic)",
    severity: "medium",
    regex: /(?:["'`]SHA-?1["'`]|\.getInstance\s*\(\s*["'`]SHA-?1["'`]|sha1\s*\(|SHA1\.Create\s*\(|Sha1::new\s*\()/gi,
    fix: "SHA-1 is collision-broken. Move to SHA-256 or SHA-3.",
    pathExcludes: /(?:node_modules|\.test\.[a-z]+$|spec\.[a-z]+$)/i,
  },
];

// ---------------------------------------------------------------------------
// Custom multi-language rules
// ---------------------------------------------------------------------------

/**
 * Language-tagged rules for sinks the external scanners cover unevenly.
 * Semgrep's free rule packs are strongest on JS/Python; PowerShell and shell
 * get almost nothing, which is exactly where operational scripts live.
 */
const CUSTOM_PATTERN_RULES: PatternRule[] = [
  // --- Python -------------------------------------------------------------
  {
    scanner: "custom-patterns",
    id: "python-eval-exec",
    title: "Python eval()/exec() on a runtime value",
    severity: "high",
    languages: ["python"],
    regex: /\b(?:eval|exec)\s*\(\s*(?!["'](?:[^"']*)["']\s*\))/g,
    fix: "eval/exec grant arbitrary code execution. Use ast.literal_eval for data, or a dispatch dict for behaviour.",
  },
  {
    scanner: "custom-patterns",
    id: "python-pickle-load",
    title: "Python pickle deserialization",
    severity: "high",
    languages: ["python"],
    regex: /\b(?:pickle|cPickle|dill|shelve)\.(?:loads?|Unpickler)\s*\(/g,
    fix: "Unpickling executes constructor code. Use JSON, or sign the payload and verify before loading.",
  },
  {
    scanner: "custom-patterns",
    id: "python-os-system",
    title: "Python os.system / os.popen command execution",
    severity: "high",
    languages: ["python"],
    regex: /\bos\.(?:system|popen[234]?)\s*\(/g,
    fix: "Use subprocess.run([...]) with an argument list so the shell never parses your string.",
  },
  {
    scanner: "custom-patterns",
    id: "python-subprocess-shell-true",
    title: "Python subprocess with shell=True",
    severity: "high",
    languages: ["python"],
    regex: /\bsubprocess\.(?:run|call|check_output|check_call|Popen)\s*\([^)]{0,200}shell\s*=\s*True/g,
    fix: "Drop shell=True and pass an argument list; with a shell, any interpolated value becomes code.",
  },
  {
    scanner: "custom-patterns",
    id: "python-yaml-unsafe-load",
    title: "Python yaml.load without SafeLoader",
    severity: "high",
    languages: ["python"],
    regex: /\byaml\.load\s*\((?![^)]*(?:SafeLoader|safe_load))/g,
    fix: "Use yaml.safe_load — the default loader can instantiate arbitrary Python objects.",
  },
  {
    scanner: "custom-patterns",
    id: "python-fstring-sql",
    title: "SQL statement built by f-string / concatenation",
    severity: "high",
    languages: ["python"],
    regex:
      /(?:execute|executemany|raw|cursor\.execute)\s*\(\s*(?:f["']|["'][^"']*["']\s*(?:%|\+|\.format))/gi,
    fix: "Pass parameters as the second argument (`cur.execute(sql, params)`) so the driver binds them.",
  },
  {
    scanner: "custom-patterns",
    id: "python-assert-as-validation",
    title: "assert used for runtime validation",
    severity: "medium",
    languages: ["python"],
    regex: /^\s*assert\s+(?:request|user|token|auth|is_|has_|permission)/gm,
    fix: "`python -O` strips asserts. Raise an explicit exception for security checks.",
    // Asserting on request/user objects is the whole point of a test suite.
    pathExcludes: TEST_OR_EXAMPLE_PATH,
  },
  {
    scanner: "custom-patterns",
    id: "python-tempfile-mktemp",
    title: "Predictable temp file (tempfile.mktemp)",
    severity: "medium",
    languages: ["python"],
    regex: /\btempfile\.mktemp\s*\(/g,
    fix: "Use tempfile.mkstemp / NamedTemporaryFile — mktemp races between the name check and the open.",
  },

  // --- JavaScript / TypeScript --------------------------------------------
  {
    scanner: "custom-patterns",
    id: "js-innerhtml-from-input",
    title: "innerHTML assigned from request/user data",
    severity: "high",
    languages: ["javascript"],
    // Two shapes: assigned straight from a request-ish expression (no string
    // literal in the way), or concatenated / interpolated into markup — the
    // second is the common one and a literal-free pattern walks past it.
    regex:
      /\binnerHTML\s*=\s*(?:[^"'`\n]{0,80}?\b(?:req|request|input|data|user|payload|params|query|body)\b|[^\n]{0,120}?(?:\+|\$\{)\s*[\w.]{0,40}(?:req|input|user|payload|param|quer|body|data))/gi,
    fix: "Assign through textContent, or sanitize with DOMPurify before it reaches innerHTML.",
  },
  {
    scanner: "custom-patterns",
    id: "js-document-write",
    title: "document.write()",
    severity: "medium",
    languages: ["javascript"],
    // An empty argument list is prose ("avoid document.write()"), not a call.
    regex: /\bdocument\.write(?:ln)?\s*\((?!\s*\))/g,
    fix: "document.write parses its argument as HTML and blocks the parser. Build nodes and append them instead.",
  },
  {
    scanner: "custom-patterns",
    id: "react-dangerously-set-inner-html",
    title: "React dangerouslySetInnerHTML",
    severity: "medium",
    languages: ["javascript"],
    regex: /\bdangerouslySetInnerHTML\s*=\s*\{/g,
    fix: "Render the value as text, or sanitize it (DOMPurify) at the boundary and note why raw HTML is required.",
  },
  {
    scanner: "custom-patterns",
    id: "js-eval-on-runtime-value",
    title: "JavaScript eval() / new Function() on a runtime value",
    severity: "high",
    languages: ["javascript"],
    // Skips a constant-string argument (already-known code) and empty parens,
    // which is how both appear in documentation and in rule titles.
    regex: /\beval\s*\((?!\s*\)|\s*["'`][^"'`]*["'`]\s*\))|\bnew\s+Function\s*\((?!\s*\))/g,
    fix: "eval and new Function compile whatever string reaches them. Use a dispatch object or JSON.parse for data.",
  },
  {
    scanner: "custom-patterns",
    id: "js-child-process-template-string",
    title: "Shell command built from a template string",
    severity: "high",
    languages: ["javascript"],
    regex: /\b(?:exec|execSync|spawn|spawnSync|execFile)\s*\(\s*`[^`]*\$\{/g,
    fix: "Interpolation makes the value part of the command. Pass an argument array to execFile/spawn instead.",
  },

  // --- PowerShell ---------------------------------------------------------
  {
    scanner: "custom-patterns",
    id: "powershell-invoke-expression",
    title: "PowerShell Invoke-Expression / IEX",
    severity: "high",
    languages: ["powershell"],
    regex: /(?:\bInvoke-Expression\b|\bIEX\b)/gi,
    fix: "IEX executes whatever string reaches it. Call the cmdlet directly or use a scriptblock with & .",
  },
  {
    scanner: "custom-patterns",
    id: "powershell-download-execute",
    title: "PowerShell download-and-execute chain",
    severity: "critical",
    languages: ["powershell"],
    regex:
      /(?:Net\.WebClient|Invoke-WebRequest|Invoke-RestMethod|curl|wget)[^\n]{0,120}\|\s*(?:IEX|Invoke-Expression)/gi,
    fix: "Download to a file, verify a signature or hash, then execute. Never pipe remote content into an evaluator.",
  },
  {
    scanner: "custom-patterns",
    id: "powershell-skip-certificate-check",
    title: "PowerShell certificate validation disabled",
    severity: "high",
    languages: ["powershell"],
    regex:
      /(?:-SkipCertificateCheck\b|ServerCertificateValidationCallback\s*=\s*\{?\s*\$?true|\[System\.Net\.ServicePointManager\]::ServerCertificateValidationCallback)/gi,
    fix: "Trust the correct CA or pin the thumbprint instead of accepting every certificate.",
  },
  {
    scanner: "custom-patterns",
    id: "powershell-plaintext-secure-string",
    title: "ConvertTo-SecureString -AsPlainText",
    severity: "high",
    languages: ["powershell"],
    regex: /ConvertTo-SecureString\b[^\n]{0,120}-AsPlainText/gi,
    fix: "A SecureString built from a literal is not secret. Read the credential from a vault or Get-Credential.",
  },
  {
    scanner: "custom-patterns",
    id: "powershell-plaintext-password-variable",
    title: "PowerShell password variable assigned a literal",
    severity: "high",
    languages: ["powershell"],
    regex: /\$(?:password|passwd|pwd|secret|apikey|token)\s*=\s*["'][^"'\n]{6,}["']/gi,
    fix: "Pull the value from Get-Credential, SecretManagement, or an environment variable.",
  },
  {
    scanner: "custom-patterns",
    id: "powershell-assembly-load",
    title: "Reflective assembly load",
    severity: "high",
    languages: ["powershell"],
    regex: /\[(?:System\.)?Reflection\.Assembly\]::Load(?:File|WithPartialName)?\s*\(/gi,
    fix: "Loading assemblies from bytes at runtime is a common in-memory execution technique. Reference a signed assembly instead.",
  },
  {
    scanner: "custom-patterns",
    id: "powershell-runkey-persistence",
    title: "Registry Run-key persistence",
    severity: "high",
    languages: ["powershell"],
    regex: /(?:HKCU|HKLM|HKEY_[A-Z_]+):?\\+(?:SOFTWARE\\+)?Microsoft\\+Windows\\+CurrentVersion\\+Run/gi,
    fix: "Auto-start registration belongs in an installer with user consent, not inline in a script.",
  },

  // --- Shell --------------------------------------------------------------
  {
    scanner: "custom-patterns",
    id: "shell-pipe-to-interpreter",
    title: "Remote content piped straight into a shell",
    severity: "critical",
    languages: ["shell", "any"],
    regex: /(?:curl|wget)\b[^\n|]{0,160}\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b/g,
    fix: "Download, checksum, review, then run. A piped installer executes whatever the server returns at that moment.",
  },
  {
    scanner: "custom-patterns",
    id: "shell-eval-command-substitution",
    title: "eval over command substitution",
    severity: "high",
    languages: ["shell"],
    regex: /\beval\s+["']?\$\(/g,
    fix: "Assign the output to a variable and branch on it; eval re-parses the result as code.",
  },
  {
    scanner: "custom-patterns",
    id: "shell-predictable-temp-file",
    title: "Predictable /tmp path",
    severity: "medium",
    languages: ["shell"],
    regex: /(?:>|>>|=|\s)\/tmp\/[A-Za-z0-9._-]+(?:\$\$)?(?:\s|$|")/g,
    fix: "Use mktemp so an attacker cannot pre-create or symlink the path.",
    lineExcludes: /mktemp/,
  },
  {
    scanner: "custom-patterns",
    id: "shell-recursive-force-remove-root",
    title: "rm -rf against a root-anchored or unquoted path",
    severity: "high",
    languages: ["shell", "any"],
    regex: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+)*-?[a-zA-Z]*f?[a-zA-Z]*\s+(?:\/|"?\$\{?\w+)/g,
    fix: "Guard the target: `[ -n \"$dir\" ] && [ -d \"$dir\" ] || exit 1`. An empty variable turns this into `rm -rf /`.",
  },
  {
    scanner: "custom-patterns",
    id: "shell-world-writable-chmod",
    title: "chmod granting world write/execute",
    severity: "medium",
    languages: ["shell", "any"],
    regex: /\bchmod\s+(?:-R\s+)?(?:777|776|766|666|a\+rwx|o\+w)\b/g,
    fix: "Grant the narrowest mode that works — 755 for executables, 644 for data, 600 for secrets.",
  },

  // --- Language-agnostic --------------------------------------------------
  {
    scanner: "custom-patterns",
    id: "long-base64-blob",
    title: "Long base64 blob embedded in source",
    severity: "low",
    regex: /["'`]([A-Za-z0-9+/]{120,}={0,2})["'`]/g,
    fix: "Embedded blobs hide payloads and credentials from review. Store the artifact as a file with a checksum.",
    minEntropy: 4.5,
    pathExcludes: TEST_OR_EXAMPLE_PATH,
    // Uniqueness guard independent of the entropy gate: an operator who lowers
    // the custom-patterns gate through aegis-rules.json would otherwise start
    // matching runs of a few repeated characters. Real base64 of compressed or
    // random bytes spans most of the alphabet; a 120-char blob built from ≤8
    // distinct characters is padding or an encoded pattern, not an artifact.
    classify: (value: string): AegisEventSeverity | null => (new Set(value).size <= 8 ? null : "low"),
  },
  {
    scanner: "custom-patterns",
    id: "security-todo-marker",
    title: "Unresolved security TODO/FIXME/HACK",
    severity: "info",
    regex:
      /(?:TODO|FIXME|HACK|XXX)\b[^\n]{0,80}?\b(?:secur|auth|authz|vulnerab|inject|sanitiz|escap|encrypt|permission|exploit|csrf|xss)/gi,
    fix: "Track it as an issue with an owner; an inline marker is not a plan.",
    // Beyond the test/example paths: a changelog entry describing a *fixed* auth
    // bug, contributor docs telling people to report vulnerabilities, and
    // generated output are all markers nobody can action here.
    pathExcludes: DOC_OR_GENERATED_PATH,
  },
  {
    scanner: "custom-patterns",
    id: "disabled-security-control",
    title: "Security control disabled inline",
    severity: "medium",
    regex:
      /(?:nosec|nosemgrep|eslint-disable(?:-next)?-line\s+security|type:\s*ignore\[.*security|#\s*noqa:\s*S\d|SkipSecurity|disableSecurity|allow_insecure\s*=\s*(?:true|True))/g,
    fix: "Suppressions need a written justification next to them, or they outlive the reason they were added.",
  },
];

// ---------------------------------------------------------------------------
// Path-based rules (matched against the file path, not the contents)
// ---------------------------------------------------------------------------

export type PathRule = {
  scanner: BuiltinScannerName;
  id: string;
  title: string;
  severity: AegisEventSeverity;
  regex: RegExp;
  fix: string;
};

export const PATH_RULES: PathRule[] = [
  {
    scanner: "gitleaks-replacement",
    id: "committed-private-key-file",
    title: "Private key / keystore file committed to the repo",
    severity: "high",
    regex: /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx|jks|keystore|ppk))$/i,
    fix: "Remove the file, purge it from git history, re-issue the key pair, and keep keys outside the working tree.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "committed-env-file",
    title: "Environment file committed to the repo",
    severity: "medium",
    regex: /(?:^|\/)\.env(?:\.[A-Za-z0-9_-]+)?$/,
    fix: "Delete from the repo, add `.env*` to .gitignore, and keep only a committed `.env.example` / `.env.schema`.",
  },
  {
    scanner: "gitleaks-replacement",
    id: "committed-credentials-file",
    title: "Credentials file committed to the repo",
    severity: "high",
    regex:
      /(?:^|\/)(?:\.netrc|\.pypirc|\.dockercfg|credentials(?:\.json|\.yml|\.yaml)?|service[-_]account[^/]*\.json|kubeconfig)$/i,
    fix: "Remove the file and purge from history; rotate every credential it contained.",
  },
];

/** Path rules exclude documented templates — `.env.example` teaches, it does not leak. */
export const PATH_RULE_EXCLUDE = /(?:\.example$|\.sample$|\.template$|\.schema$|\.dist$)/i;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const PATTERN_RULES: PatternRule[] = [
  ...SECRET_RULES,
  ...CUSTOM_PATTERN_RULES,
  ...PATH_TRAVERSAL_RULES,
  ...HARDCODED_IP_RULES,
  ...WEAK_CRYPTO_RULES,
];

/** Rule ids owned by a scanner family, for the report's Scanner Detail section. */
export function rulesForScanner(scanner: BuiltinScannerName): string[] {
  return [
    ...PATTERN_RULES.filter((r) => r.scanner === scanner).map((r) => r.id),
    ...PATH_RULES.filter((r) => r.scanner === scanner).map((r) => r.id),
  ];
}

/** Fix guidance by full ruleId (`<scanner>/<id>`), for the report's Fix Guide. */
export const RULE_FIX_INDEX: Record<string, string> = Object.fromEntries([
  ...PATTERN_RULES.map((r) => [`${r.scanner}/${r.id}`, r.fix] as const),
  ...PATH_RULES.map((r) => [`${r.scanner}/${r.id}`, r.fix] as const),
]);
