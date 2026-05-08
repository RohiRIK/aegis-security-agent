export type ProxyResultOutput = {
    summary: string;
    detailPath: string;
};
/**
 * Intercepts scanner tool output, writes full details to .aegis/scans/{hash}.json,
 * and returns a lean one-liner summary for the LLM context.
 *
 * The file write is fire-and-forget — this function returns synchronously.
 */
export declare function proxyResult(toolName: string, fullOutput: unknown, options?: {
    filename?: string;
    packageName?: string;
}): ProxyResultOutput;
