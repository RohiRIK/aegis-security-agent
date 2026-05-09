import { join } from "node:path";

import { ensureDir } from "../lib/base.ts";
import { createEvent } from "../events/types.ts";
import { emitEvent } from "../events/emitter.ts";

const PROJECT_DIR = process.cwd();
const AUDIT_LOG = join(PROJECT_DIR, ".aegis", "audit.jsonl");

try {
  await ensureDir(join(PROJECT_DIR, ".aegis"));
  await emitEvent(
    createEvent("session.end", "info", PROJECT_DIR, "Aegis session ended", {
      source: "hook",
      outcome: "allow",
    }),
    AUDIT_LOG,
  );
} catch {
  // Stop hook must never fail
}
process.exit(0);
