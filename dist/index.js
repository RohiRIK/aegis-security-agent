// @bun
// src/opencode/index.ts
import { join as join6 } from "path";

// src/core/security.ts
import { basename } from "path";
function parseSemgrepFindings(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  return results.filter((result) => result.extra?.severity === "ERROR").map((result) => ({
    rule: result.check_id ?? "unknown",
    severity: result.extra?.severity ?? "ERROR",
    message: result.extra?.message ?? "",
    line: result.start?.line ?? 0
  }));
}
var DEFAULT_SENSITIVE_VARS = [
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "STRIPE_SECRET_KEY",
  "GITHUB_TOKEN",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PRIVATE_KEY",
  "SECRET_KEY",
  "PASSWORD",
  "PASSWD"
];
function matchHighRiskPattern(command, patterns) {
  if (!command || !patterns.length)
    return null;
  return patterns.find((pattern) => new RegExp(pattern, "i").test(command)) ?? null;
}
function parseInstallCommand(cmd) {
  const npmMatch = cmd.match(/^npm (?:install|i) (?:--save(?:-dev)? )?(@?[^\s@]+)(?:@([^\s]+))?/);
  if (npmMatch)
    return { ecosystem: "npm", packageName: npmMatch[1] ?? "", packageVersion: npmMatch[2] ?? "latest" };
  const pipMatch = cmd.match(/^pip3? install (?:--[^\s]+ )*([^\s=<>!]+)(?:[=<>!]+([^\s]+))?/);
  if (pipMatch)
    return { ecosystem: "pip", packageName: pipMatch[1] ?? "", packageVersion: pipMatch[2] ?? "latest" };
  const cargoMatch = cmd.match(/^cargo add ([^\s@]+)(?:@([^\s]+))?/);
  if (cargoMatch)
    return { ecosystem: "cargo", packageName: cargoMatch[1] ?? "", packageVersion: cargoMatch[2] ?? "latest" };
  const goMatch = cmd.match(/^go get ([^\s@]+)(?:@([^\s]+))?/);
  if (goMatch)
    return { ecosystem: "go", packageName: goMatch[1] ?? "", packageVersion: goMatch[2] ?? "latest" };
  return null;
}
function makeLockfileContent(pkg) {
  const ver = pkg.packageVersion === "latest" ? "0.0.1" : pkg.packageVersion;
  switch (pkg.ecosystem) {
    case "npm":
      return {
        filename: "package-lock.json",
        content: JSON.stringify({
          name: "aegis-scan",
          lockfileVersion: 2,
          packages: {
            [`node_modules/${pkg.packageName}`]: {
              version: ver,
              resolved: `https://registry.npmjs.org/${pkg.packageName}/-/${pkg.packageName}-${ver}.tgz`,
              integrity: "sha512-placeholder"
            }
          }
        })
      };
    case "pip":
      return { filename: "requirements.txt", content: `${pkg.packageName}==${ver}
` };
    case "cargo":
      return {
        filename: "Cargo.lock",
        content: `[[package]]
name = "${pkg.packageName}"
version = "${ver}"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "placeholder"
`
      };
    case "go":
      return {
        filename: "go.sum",
        content: `${pkg.packageName} v${ver} h1:placeholder=
`
      };
  }
}
function checkSensitiveFile(filePath, denyPatterns) {
  return denyPatterns.some((pattern) => {
    if (pattern === filePath)
      return true;
    if (pattern.startsWith("**/")) {
      const suffix = pattern.slice(3);
      const suffixRe = new RegExp(`^${suffix.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")}$`);
      return suffixRe.test(basename(filePath)) || suffixRe.test(filePath);
    }
    const re = new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`);
    return re.test(filePath);
  });
}

// src/core/router.ts
var CHAIN_OPERATOR_PATTERN = /&&|\|\||;|\|/;
var SAFE_CHAIN_COMMANDS = new Set(["exit", "head"]);
function splitCommandSegments(command) {
  return command.split(CHAIN_OPERATOR_PATTERN).map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}
function extractBaseCommand(segment) {
  return segment.trim().split(/\s+/, 1)[0] ?? "";
}
function matchesRoutingPatterns(segment, patterns) {
  const baseCommand = extractBaseCommand(segment);
  const normalizedBaseCommand = baseCommand ? `${baseCommand} ` : "";
  return patterns.some((pattern) => {
    const matcher = new RegExp(pattern);
    return matcher.test(segment) || matcher.test(baseCommand) || matcher.test(normalizedBaseCommand);
  });
}
function isSafeChainCommand(segment) {
  return SAFE_CHAIN_COMMANDS.has(extractBaseCommand(segment));
}
function routeSingleSegment(segment, policy) {
  const highRiskPatterns = Array.isArray(policy.high_risk_patterns) ? policy.high_risk_patterns : [];
  if (matchHighRiskPattern(segment, highRiskPatterns) !== null)
    return "hitl";
  const sandboxRequired = policy.routing?.sandbox_required ?? [];
  if (matchesRoutingPatterns(segment, sandboxRequired))
    return "sandbox";
  const hostPassthrough = policy.routing?.host_passthrough ?? [];
  if (matchesRoutingPatterns(segment, hostPassthrough))
    return "host";
  return "sandbox";
}
function routeCommand(command, policy) {
  if (!command)
    return "sandbox";
  const segments = splitCommandSegments(command);
  if (segments.length === 0)
    return "sandbox";
  const hasChainOperators = segments.length > 1;
  const decisions = segments.map((segment) => {
    if (hasChainOperators && isSafeChainCommand(segment))
      return "host";
    return routeSingleSegment(segment, policy);
  });
  if (decisions.includes("hitl"))
    return "hitl";
  if (decisions.includes("sandbox"))
    return "sandbox";
  if (decisions.every((decision) => decision === "host"))
    return "host";
  return "sandbox";
}

// src/lib/base.ts
function buildEnv(extraEnv) {
  const merged = { ...process.env, ...extraEnv };
  const env = {};
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}
async function streamToText(stream) {
  if (!stream) {
    return "";
  }
  return await new Response(stream).text();
}
async function runCommandCapture(argv, options) {
  const stdin = options?.stdinText === undefined ? undefined : new TextEncoder().encode(options.stdinText);
  const proc = Bun.spawn(argv, {
    cwd: options?.cwd,
    env: buildEnv(options?.env),
    stdin,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    streamToText(proc.stdout),
    streamToText(proc.stderr)
  ]);
  return { exitCode, stdout, stderr };
}
async function ensureDir(dirPath) {
  const result = await runCommandCapture(["mkdir", "-p", dirPath]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to create directory: ${dirPath}`);
  }
}
async function fileExists(filePath) {
  return await Bun.file(filePath).exists();
}

// src/sandbox/detect.ts
var CONTAINER_NAME = "aegis-sandbox";
async function detectDockerState() {
  const whichResult = await runCommandCapture(["which", "docker"]);
  if (whichResult.exitCode !== 0)
    return "binary_missing";
  const infoResult = await runCommandCapture(["docker", "info"]);
  if (infoResult.exitCode !== 0)
    return "daemon_unavailable";
  const runningResult = await runCommandCapture([
    "docker",
    "ps",
    "--filter",
    `name=${CONTAINER_NAME}`,
    "--filter",
    "status=running",
    "--format",
    "{{.Names}}"
  ]);
  if (runningResult.stdout.trim().includes(CONTAINER_NAME))
    return "running";
  const existsResult = await runCommandCapture([
    "docker",
    "ps",
    "-a",
    "--filter",
    `name=${CONTAINER_NAME}`,
    "--format",
    "{{.Names}}"
  ]);
  if (existsResult.stdout.trim().includes(CONTAINER_NAME))
    return "container_stopped";
  return "container_absent";
}
function isDockerAvailable(state) {
  return state === "running";
}
function isDegraded(state) {
  return state !== "running";
}
var WARNING_MESSAGES = {
  running: "",
  binary_missing: "[AEGIS] \u26A0\uFE0F DEGRADED MODE: Docker not installed \u2014 sandbox-required commands will be blocked",
  daemon_unavailable: "[AEGIS] \u26A0\uFE0F DEGRADED MODE: Docker daemon not running \u2014 sandbox-required commands will be blocked",
  container_absent: "[AEGIS] \u26A0\uFE0F DEGRADED MODE: aegis-sandbox container not found \u2014 run 'aegis start' to create it",
  container_stopped: "[AEGIS] \u26A0\uFE0F DEGRADED MODE: aegis-sandbox container stopped \u2014 run 'aegis start' to restart",
  start_failure: "[AEGIS] \u26A0\uFE0F DEGRADED MODE: aegis-sandbox failed to start \u2014 sandbox-required commands will be blocked"
};
function formatDockerWarning(state) {
  return WARNING_MESSAGES[state];
}

// src/opencode/handlers/before.ts
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { basename as basename2, join as join4 } from "path";

// src/lib/scanner.ts
import crypto2 from "crypto";
import { stat } from "fs/promises";
import { join as join2 } from "path";

// src/lib/scan-cache.ts
import crypto from "crypto";
import { join } from "path";
var CACHE_DIR = ".aegis/scan-cache";
var CACHE_TTLS = {
  semgrep: 600000,
  trivy: 3600000,
  trufflehog: 600000
};
function computeCacheKey(scanner, version, config, scopeHash) {
  return crypto.createHash("sha256").update([scanner, version, config, scopeHash].join("|")).digest("hex").slice(0, 16);
}
function computeScopeHash(filePaths, mtimes) {
  const normalized = filePaths.map((filePath, index) => ({ filePath, mtime: mtimes[index] ?? 0 })).sort((left, right) => left.filePath.localeCompare(right.filePath));
  const payload = normalized.map(({ filePath, mtime }) => `${filePath}:${mtime}`).join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
function isCacheEntry(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value;
  return typeof entry.key === "string" && typeof entry.timestamp === "number" && typeof entry.ttl === "number" && typeof entry.result === "object" && entry.result !== null;
}
async function readCacheEntry(cacheDir, key) {
  const filePath = join(cacheDir, `${key}.json`);
  if (!await fileExists(filePath)) {
    return null;
  }
  try {
    const parsed = await Bun.file(filePath).json();
    if (!isCacheEntry(parsed)) {
      return null;
    }
    if (Date.now() - parsed.timestamp >= parsed.ttl) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
async function writeCacheEntry(cacheDir, entry) {
  await ensureDir(cacheDir);
  await Bun.write(join(cacheDir, `${entry.key}.json`), JSON.stringify(entry));
}
function shouldSkipCache(result) {
  if (result.status !== "ok") {
    return true;
  }
  return result.stdout.includes("CRITICAL");
}
function getCacheTtl(scanner) {
  return CACHE_TTLS[scanner] ?? 600000;
}

// src/lib/scanner.ts
var SCANNER_BUDGETS = {
  semgrep: 120000,
  trivy: 60000,
  trufflehog: 90000
};
async function runScannerWithTimeout(argv, budgetMs) {
  const startedAt = performance.now();
  const proc = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe"
  });
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve({ status: "timeout" }), budgetMs);
  });
  const completion = proc.exited.then((exitCode) => ({ status: "completed", exitCode }));
  const outcome = await Promise.race([completion, timeout]);
  if (outcome.status === "timeout") {
    proc.kill();
    return {
      status: "timeout",
      exitCode: -1,
      stdout: "",
      stderr: "",
      degraded: true,
      durationMs: budgetMs
    };
  }
  const durationMs = performance.now() - startedAt;
  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ]);
    return {
      status: "ok",
      exitCode: outcome.exitCode,
      stdout,
      stderr,
      degraded: false,
      durationMs
    };
  } catch (error) {
    return {
      status: "error",
      exitCode: outcome.exitCode,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      degraded: false,
      durationMs
    };
  }
}
var scannerRunner = {
  runScannerWithTimeout,
  getScannerVersion
};
var versionCache = new Map;
async function getScannerVersion(scanner) {
  const cached = versionCache.get(scanner);
  if (cached) {
    return cached;
  }
  try {
    const proc = Bun.spawn([scanner, "--version"], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      const version = (await new Response(proc.stdout).text()).trim();
      versionCache.set(scanner, version);
      return version;
    }
  } catch {}
  versionCache.set(scanner, "unknown");
  return "unknown";
}
function hashConfig(config) {
  return crypto2.createHash("sha256").update(config).digest("hex").slice(0, 16);
}
async function getMtimeMs(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.mtimeMs;
  } catch {
    return 0;
  }
}
async function readScannerCache(scanner, config, scopePaths) {
  const mtimes = await Promise.all(scopePaths.map((filePath) => getMtimeMs(filePath)));
  const scopeHash = computeScopeHash(scopePaths, mtimes);
  const version = await scannerRunner.getScannerVersion(scanner);
  const configHash = hashConfig(config);
  const key = computeCacheKey(scanner, version, configHash, scopeHash);
  const entry = await readCacheEntry(join2(process.cwd(), CACHE_DIR), key);
  if (!entry) {
    return { key, cached: null };
  }
  return {
    key,
    cached: {
      ...entry.result,
      status: "cached"
    }
  };
}
async function writeScannerCache(scanner, key, result) {
  if (shouldSkipCache(result)) {
    return;
  }
  await writeCacheEntry(join2(process.cwd(), CACHE_DIR), {
    key,
    timestamp: Date.now(),
    ttl: getCacheTtl(scanner),
    result
  });
}
async function wrapSemgrep(filePath) {
  const config = "--config=p/security-audit|--config=p/secrets|--json";
  const { key, cached } = await readScannerCache("semgrep", config, [filePath]);
  if (cached) {
    return cached;
  }
  const result = await scannerRunner.runScannerWithTimeout(["semgrep", "scan", "--config=p/security-audit", "--config=p/secrets", "--json", filePath], SCANNER_BUDGETS.semgrep);
  await writeScannerCache("semgrep", key, result);
  return result;
}
async function wrapTrivy(args) {
  const config = args.join("|");
  const { key, cached } = await readScannerCache("trivy", config, args);
  if (cached) {
    return cached;
  }
  const result = await scannerRunner.runScannerWithTimeout(["trivy", ...args], SCANNER_BUDGETS.trivy);
  await writeScannerCache("trivy", key, result);
  return result;
}

// src/lib/aegis-log.ts
function logAegis(client, level, message) {
  client?.app.log({ body: { service: "aegis", level, message } });
  if (!client?.app.log)
    process.stderr.write(`${message}
`);
}

// src/lib/output-proxy.ts
import crypto3 from "crypto";
import { join as join3 } from "path";
import { mkdirSync } from "fs";
var SCANS_DIR = ".aegis/scans";
function computeHash(content) {
  return crypto3.createHash("sha256").update(content).digest("hex").slice(0, 12);
}
function ensureScansDirSync() {
  try {
    mkdirSync(SCANS_DIR, { recursive: true });
  } catch {}
}
function writeDetailAsync(hash, fullOutput) {
  const detailPath = join3(SCANS_DIR, `${hash}.json`);
  Promise.resolve().then(async () => {
    try {
      ensureScansDirSync();
      await Bun.write(detailPath, JSON.stringify(fullOutput, null, 2));
    } catch {}
  });
  return detailPath;
}
function buildSemgrepSummary(findings, filename, hash, detailPath) {
  const severities = [...new Set(findings.map((f) => (f.severity ?? "UNKNOWN").toUpperCase()))].join(", ");
  const base = filename ? ` in ${filename}` : "";
  return `[AEGIS] Semgrep: ${findings.length} finding(s)${base} (${severities}). Details: ${detailPath}`;
}
function buildTrivySummary(parsed, packageName, hash, detailPath) {
  const vulnCount = parsed.Results?.reduce((sum, r) => sum + (r.Vulnerabilities?.length ?? 0), 0) ?? 0;
  const pkg = packageName ? ` in ${packageName}` : "";
  return `[AEGIS] Trivy: ${vulnCount} CVE(s)${pkg}. Details: ${detailPath}`;
}
function proxyResult(toolName, fullOutput, options) {
  const serialized = JSON.stringify(fullOutput);
  const hash = computeHash(serialized);
  const detailPath = writeDetailAsync(hash, fullOutput);
  const tool = toolName.toLowerCase();
  if (tool === "semgrep") {
    const findings = Array.isArray(fullOutput) ? fullOutput : [];
    const summary = buildSemgrepSummary(findings, options?.filename ?? "", hash, detailPath);
    return { summary, detailPath };
  }
  if (tool === "trivy") {
    const parsed = typeof fullOutput === "object" && fullOutput !== null ? fullOutput : {};
    const summary = buildTrivySummary(parsed, options?.packageName ?? "", hash, detailPath);
    return { summary, detailPath };
  }
  return {
    summary: `[AEGIS] ${toolName}: result saved. Details: ${detailPath}`,
    detailPath
  };
}

// src/opencode/handlers/before.ts
function createBeforeHandler(policy, getPreflightPromise, preflightPassed, getDegraded, client) {
  return async (input, output) => {
    const pp = getPreflightPromise();
    if (pp === null)
      throw new Error("Preflight not initialized \u2014 tool calls blocked");
    await pp;
    if (!preflightPassed())
      throw new Error("Preflight failed \u2014 tool calls blocked");
    if (["read", "write", "edit"].includes(input.tool)) {
      const filePath = output.args?.filePath ?? output.args?.path ?? "";
      if (filePath && checkSensitiveFile(filePath, policy.actions?.read_file?.deny_patterns ?? [])) {
        throw new Error(`BLOCKED: access to sensitive file denied \u2014 ${basename2(filePath)}`);
      }
    }
    if (input.tool !== "bash")
      return;
    const command = output.args?.command ?? "";
    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);
    if (matched)
      throw new Error(`BLOCKED: HIGH-RISK pattern matched \u2014 ${matched}`);
    const route = routeCommand(command, policy);
    if (route === "host")
      return;
    const pkg = parseInstallCommand(command);
    if (pkg) {
      const { filename, content } = makeLockfileContent(pkg);
      const scanDir = mkdtempSync(join4(tmpdir(), "aegis-trivy-"));
      try {
        await Bun.write(join4(scanDir, filename), content);
        const result = await wrapTrivy([
          "fs",
          "--scanners",
          "vuln",
          "--severity",
          "HIGH,CRITICAL",
          "--exit-code",
          "1",
          "--quiet",
          "--format",
          "json",
          scanDir
        ]);
        if (result.degraded) {
          logAegis(client, "warn", "[AEGIS] \u26A0\uFE0F Trivy DEGRADED: dep scan timed out");
        } else if (result.status === "ok" && result.exitCode === 1) {
          let parsed = {};
          try {
            parsed = JSON.parse(result.stdout);
          } catch {}
          const { summary } = proxyResult("trivy", parsed, { packageName: pkg.packageName });
          throw new Error(`BLOCKED by Trivy: ${summary}`);
        } else if (result.status === "error") {
          logAegis(client, "warn", "[AEGIS] \u26A0\uFE0F Trivy unavailable: dep scan skipped");
        }
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    }
    const degraded = getDegraded?.() ?? false;
    let dockerAvailable = !degraded;
    if (!degraded) {
      const dockerState = await detectDockerState();
      dockerAvailable = isDockerAvailable(dockerState);
      if (!dockerAvailable) {
        const warnOnDegraded = policy.degraded_mode?.warn_on_degraded !== false;
        if (warnOnDegraded) {
          logAegis(client, "warn", formatDockerWarning(dockerState));
        }
      }
    }
    if (!dockerAvailable) {
      const blockSandbox = policy.degraded_mode?.block_sandbox_required !== false;
      if (blockSandbox) {
        throw new Error("[AEGIS] BLOCKED: sandbox-required command cannot run \u2014 Docker unavailable");
      }
      return;
    }
    const escaped = command.replace(/'/g, "'\\''");
    output.args ??= {};
    output.args.command = `docker exec aegis-sandbox bash -c '${escaped}'`;
  };
}

// src/opencode/handlers/after.ts
import { basename as basename3 } from "path";
function createAfterHandler() {
  return async (input, output) => {
    if (!["write", "edit"].includes(input.tool))
      return;
    const filePath = input.args?.filePath ?? input.args?.path ?? "";
    if (!filePath)
      return;
    const result = await wrapSemgrep(filePath);
    const findings = result.status === "ok" ? parseSemgrepFindings(result.stdout) : [];
    if (findings.length > 0) {
      const { summary } = proxyResult("semgrep", findings, { filename: basename3(filePath) });
      output.output += `

${summary}`;
    }
    if (result.degraded) {
      output.output += `

[AEGIS] \u26A0\uFE0F Semgrep DEGRADED: scan timed out after 120s`;
    }
  };
}

// src/opencode/handlers/session.ts
import { join as join5 } from "path";
async function runDefaultPreflight(directory, setDegraded, client) {
  const c = Bun.spawn(["bunx", "varlock", "--version"], { stdout: "ignore", stderr: "ignore" });
  if (await c.exited !== 0)
    throw new Error("varlock unavailable");
  if (!await Bun.file(join5(directory, ".env.schema")).exists())
    throw new Error(".env.schema missing");
  const found = DEFAULT_SENSITIVE_VARS.filter((v) => (process.env[v] ?? "").length > 0);
  if (found.length > 0)
    throw new Error("live secrets in env");
  const configPath = join5(directory, ".pre-commit-config.yaml");
  if (!await Bun.file(configPath).exists())
    throw new Error(".pre-commit-config.yaml missing");
  const text = await Bun.file(configPath).text();
  if (!text.includes("trufflehog"))
    throw new Error("trufflehog hook missing");
  const dockerState = await detectDockerState();
  if (isDegraded(dockerState)) {
    const warning = formatDockerWarning(dockerState);
    logAegis(client, "warn", warning);
    setDegraded(true);
  }
  const vs = Bun.spawn(["bunx", "varlock", "scan", "--staged"], { stdout: "ignore", stderr: "ignore" });
  if (await vs.exited !== 0)
    throw new Error("varlock scan failed");
}
function createSessionHandler(directory, setPreflightPassed, setPreflightPromise, runPreflight, setDegraded, setPreflightRan, client) {
  const handler = async (input) => {
    if (input.event.type !== "session.created")
      return;
    const promise = (async () => {
      setPreflightRan?.(true);
      try {
        if (runPreflight) {
          await runPreflight(setDegraded ?? (() => {}));
        } else {
          await runDefaultPreflight(directory, setDegraded ?? (() => {}), client);
        }
        setPreflightPassed(true);
      } catch (err) {
        const message = `[AEGIS] preflight failed: ${err instanceof Error ? err.message : String(err)}`;
        logAegis(client, "error", message);
        setPreflightPassed(false);
      }
    })();
    setPreflightPromise?.(promise);
    await promise;
  };
  return { handler };
}

// src/opencode/handlers/compaction.ts
function createCompactionHandler(getPreflightStatus, getDegraded, policy) {
  return async (output) => {
    const mode = getDegraded() ? "DEGRADED" : "full";
    const preflight = getPreflightStatus();
    const blockedPatterns = policy.high_risk_patterns?.length ?? 0;
    output.context.push(`[AEGIS] Security: routing=${mode}, preflight=${preflight}, blocked_patterns=${blockedPatterns}`);
  };
}

// src/opencode/handlers/env.ts
function createEnvHandler(sensitiveVars) {
  return async (_input, output) => {
    for (const varName of sensitiveVars) {
      if (output.env && varName in output.env) {
        delete output.env[varName];
      }
    }
  };
}

// src/opencode/handlers/permission.ts
function createPermissionHandler(policy) {
  return async (input, output) => {
    const command = input.command ?? input.title ?? "";
    if (!command)
      return;
    const matched = matchHighRiskPattern(command, policy.high_risk_patterns ?? []);
    if (matched) {
      output.status = "ask";
    }
  };
}

// src/opencode/index.ts
function safe(handler, opts) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      if (opts?.swallow) {
        opts.onError?.();
      } else {
        throw err;
      }
    }
  };
}
var AegisSecurityPlugin = async ({ directory, client }) => {
  const policy = JSON.parse(await Bun.file(join6(directory, "aegis-policy.json")).text());
  let preflightPassed = false;
  let preflightRan = false;
  let preflightPromise = null;
  let degraded = false;
  const { handler: sessionHandler } = createSessionHandler(directory, (val) => {
    preflightPassed = val;
  }, (p) => {
    preflightPromise = p;
  }, undefined, (val) => {
    degraded = val;
  }, (val) => {
    preflightRan = val;
  }, client);
  const beforeHandler = createBeforeHandler(policy, () => preflightPromise, () => preflightPassed, () => degraded, client);
  const afterHandler = createAfterHandler();
  const compactionHandler = createCompactionHandler(() => preflightRan ? preflightPassed ? "passed" : "failed" : "not-run", () => degraded, policy);
  const envHandler = createEnvHandler(DEFAULT_SENSITIVE_VARS);
  const permissionHandler = createPermissionHandler(policy);
  return {
    "tool.execute.before": safe(beforeHandler),
    "tool.execute.after": safe(afterHandler),
    "experimental.session.compacting": safe(compactionHandler),
    event: safe(sessionHandler, { swallow: true, onError: () => {
      preflightPassed = false;
    } }),
    "shell.env": safe(envHandler),
    "permission.ask": safe(permissionHandler)
  };
};
var opencode_default = AegisSecurityPlugin;
export {
  opencode_default as default,
  AegisSecurityPlugin
};
