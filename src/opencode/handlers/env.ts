export function createEnvHandler(sensitiveVars: string[]): (input: any, output: any) => Promise<void> {
  return async (_input: any, output: any) => {
    for (const varName of sensitiveVars) {
      if (output.env && varName in output.env) {
        delete output.env[varName];
      }
    }
  };
}
