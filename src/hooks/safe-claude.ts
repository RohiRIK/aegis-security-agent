import { readStdinText, writeStderr, writeStdout } from "../lib/base.ts";

export async function safeClaude(
  hookFn: (input: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<never> {
  let inputText = "";
  try {
    inputText = await readStdinText();
    const parsed = JSON.parse(inputText) as Record<string, unknown>;
    const result = await hookFn(parsed);
    writeStdout(JSON.stringify(result) + "\n");
    process.exit(0);
  } catch (err) {
    if (inputText) {
      try {
        JSON.parse(inputText.trim());
        writeStdout(inputText.trim() + "\n");
      } catch {
        writeStdout("{}\n");
      }
    } else {
      writeStdout("{}\n");
    }
    writeStderr(`[AEGIS] hook error (swallowed): ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(0);
  }
}
