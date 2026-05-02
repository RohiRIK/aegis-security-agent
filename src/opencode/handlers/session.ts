import { join } from "node:path";
import { DEFAULT_SENSITIVE_VARS } from "../../core/security.ts";

async function runDefaultPreflight(directory: string): Promise<void> {
  const c = Bun.spawn(["bunx", "varlock", "--version"], { stdout: "ignore", stderr: "ignore" });
  if ((await c.exited) !== 0) throw new Error("varlock unavailable");

  if (!(await Bun.file(join(directory, ".env.schema")).exists())) throw new Error(".env.schema missing");

  const found = DEFAULT_SENSITIVE_VARS.filter(v => (process.env[v] ?? "").length > 0);
  if (found.length > 0) throw new Error("live secrets in env");

  const configPath = join(directory, ".pre-commit-config.yaml");
  if (!(await Bun.file(configPath).exists())) throw new Error(".pre-commit-config.yaml missing");
  const text = await Bun.file(configPath).text();
  if (!text.includes("trufflehog")) throw new Error("trufflehog hook missing");

  const d = Bun.spawn(["docker", "info"], { stdout: "ignore", stderr: "ignore" });
  if ((await d.exited) !== 0) throw new Error("docker daemon not running");

  const ps = Bun.spawn(["docker", "ps", "--filter", "name=aegis-sandbox", "--format", "{{.Names}}"], { stdout: "pipe", stderr: "ignore" });
  await ps.exited;
  const out = await new Response(ps.stdout).text();
  if (!out.includes("aegis-sandbox")) throw new Error("aegis-sandbox container not running");

  const vs = Bun.spawn(["bunx", "varlock", "scan", "--staged"], { stdout: "ignore", stderr: "ignore" });
  if ((await vs.exited) !== 0) throw new Error("varlock scan failed");
}

export function createSessionHandler(
  directory: string,
  setPreflightPassed: (val: boolean) => void,
  setPreflightPromise?: (p: Promise<void>) => void,
  runPreflight?: () => Promise<void>
): { handler: (input: { event: { type: string; sessionID?: string } }) => Promise<void> } {
  const handler = async (input: { event: { type: string; sessionID?: string } }) => {
    if (input.event.type !== "session.created") return;

    const promise = (async () => {
      try {
        if (runPreflight) {
          await runPreflight();
        } else {
          await runDefaultPreflight(directory);
        }
        setPreflightPassed(true);
      } catch (err) {
        process.stderr.write(`[AEGIS] preflight failed: ${err instanceof Error ? err.message : String(err)}\n`);
        setPreflightPassed(false);
      }
    })();

    setPreflightPromise?.(promise);
    await promise;
  };
  return { handler };
}
