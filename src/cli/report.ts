import { resolve } from "node:path";
import { eventsToSarif } from "../sarif/builder.ts";
import type { AegisEvent } from "../events/types.ts";

export type ReportFlags = {
  format: "sarif";
  output?: string;
  input?: string;
};

export function parseReportFlags(args: string[]): ReportFlags {
  let format: "sarif" = "sarif";
  let output: string | undefined;
  let input: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--format" && args[i + 1]) {
      if (args[i + 1] !== "sarif") {
        process.stderr.write(`Unsupported format: ${args[i + 1]}. Only 'sarif' is supported.\n`);
      }
      format = "sarif";
      i++;
    } else if ((arg === "--output" || arg === "-o") && args[i + 1]) {
      output = args[i + 1];
      i++;
    } else if ((arg === "--input" || arg === "-i") && args[i + 1]) {
      input = args[i + 1];
      i++;
    }
  }

  return { format, output, input };
}

async function getPackageVersion(): Promise<string> {
  try {
    const pkg = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function parseNdjson(content: string): AegisEvent[] {
  const events: AegisEvent[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      events.push(JSON.parse(trimmed) as AegisEvent);
    } catch {
      process.stderr.write(`[AEGIS] Skipping unparseable NDJSON line\n`);
    }
  }
  return events;
}

export async function runReport(flags: ReportFlags): Promise<number> {
  const inputPath = flags.input ?? resolve(process.cwd(), ".aegis", "audit.jsonl");
  const file = Bun.file(inputPath);

  let events: AegisEvent[] = [];
  if (await file.exists()) {
    const content = await file.text();
    events = parseNdjson(content);
  }

  const version = await getPackageVersion();
  const sarif = eventsToSarif(events, version);
  const json = JSON.stringify(sarif, null, 2);

  if (flags.output) {
    const outPath = resolve(flags.output);
    await Bun.write(outPath, json);
    process.stderr.write(`SARIF report written to ${outPath}\n`);
  } else {
    process.stdout.write(json);
  }

  return 0;
}
