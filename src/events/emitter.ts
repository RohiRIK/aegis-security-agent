import { join } from "node:path";

import { appendText, ensureDir } from "../lib/base.ts";
import type { AegisEvent } from "./types.ts";

export async function emitEvent(event: AegisEvent, logPath?: string): Promise<void> {
  const targetPath = logPath ?? join(process.cwd(), ".aegis", "audit.jsonl");
  const dir = targetPath.substring(0, targetPath.lastIndexOf("/"));
  await ensureDir(dir);
  await appendText(targetPath, JSON.stringify(event) + "\n");
}
