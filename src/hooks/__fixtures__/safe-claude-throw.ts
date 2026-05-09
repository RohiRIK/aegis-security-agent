import { safeClaude } from "../safe-claude.ts";

await safeClaude(async (_input) => {
  throw new Error("intentional test error");
});
