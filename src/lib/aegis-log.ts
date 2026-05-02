import type { PluginInput } from "@opencode-ai/plugin";

export type AegisLogLevel = "info" | "warn" | "error";

export function logAegis(
  client: PluginInput["client"] | undefined,
  level: AegisLogLevel,
  message: string,
): void {
  client?.app.log({ body: { service: "aegis", level, message } });
  if (!client?.app.log) process.stderr.write(`${message}\n`);
}
