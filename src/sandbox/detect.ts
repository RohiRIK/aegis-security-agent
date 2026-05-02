import { runCommandCapture } from "../lib/base.ts";

export type DockerState =
  | "running"
  | "binary_missing"
  | "daemon_unavailable"
  | "container_absent"
  | "container_stopped"
  | "start_failure";

const CONTAINER_NAME = "aegis-sandbox";

export async function detectDockerState(): Promise<DockerState> {
  const whichResult = await runCommandCapture(["which", "docker"]);
  if (whichResult.exitCode !== 0) return "binary_missing";

  const infoResult = await runCommandCapture(["docker", "info"]);
  if (infoResult.exitCode !== 0) return "daemon_unavailable";

  const runningResult = await runCommandCapture([
    "docker", "ps", "--filter", `name=${CONTAINER_NAME}`, "--filter", "status=running", "--format", "{{.Names}}",
  ]);
  if (runningResult.stdout.trim().includes(CONTAINER_NAME)) return "running";

  const existsResult = await runCommandCapture([
    "docker", "ps", "-a", "--filter", `name=${CONTAINER_NAME}`, "--format", "{{.Names}}",
  ]);
  if (existsResult.stdout.trim().includes(CONTAINER_NAME)) return "container_stopped";

  return "container_absent";
}

export function isDockerAvailable(state: DockerState): boolean {
  return state === "running";
}

export function isDegraded(state: DockerState): boolean {
  return state !== "running";
}

const WARNING_MESSAGES: Record<DockerState, string> = {
  running: "",
  binary_missing: "[AEGIS] ⚠️ DEGRADED MODE: Docker not installed — sandbox-required commands will be blocked",
  daemon_unavailable: "[AEGIS] ⚠️ DEGRADED MODE: Docker daemon not running — sandbox-required commands will be blocked",
  container_absent: "[AEGIS] ⚠️ DEGRADED MODE: aegis-sandbox container not found — run 'aegis start' to create it",
  container_stopped: "[AEGIS] ⚠️ DEGRADED MODE: aegis-sandbox container stopped — run 'aegis start' to restart",
  start_failure: "[AEGIS] ⚠️ DEGRADED MODE: aegis-sandbox failed to start — sandbox-required commands will be blocked",
};

export function formatDockerWarning(state: DockerState): string {
  return WARNING_MESSAGES[state];
}
