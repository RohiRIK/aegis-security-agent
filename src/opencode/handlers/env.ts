import { createEvent } from "../../events/types.ts";
import { emitEvent } from "../../events/emitter.ts";

export function createEnvHandler(sensitiveVars: string[]): (input: any, output: any) => Promise<void> {
  return async (_input: any, output: any) => {
    const redacted: string[] = [];
    for (const varName of sensitiveVars) {
      if (output.env && varName in output.env) {
        delete output.env[varName];
        redacted.push(varName);
      }
    }
    if (redacted.length > 0) {
      await emitEvent(
        createEvent("env.redaction", "info", "shell.env", `Redacted ${redacted.length} sensitive var(s): ${redacted.join(", ")}`, {
          source: "plugin",
          outcome: "allow",
          evidence: { redacted_vars: redacted },
        }),
      );
    }
  };
}
