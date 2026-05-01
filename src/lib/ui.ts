const ESC = "\x1b[";
const RESET = "\x1b[0m";

export const c = {
  bold: (s: string) => `\x1b[1m${s}${RESET}`,
  dim: (s: string) => `\x1b[2m${s}${RESET}`,
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  red: (s: string) => `${ESC}31m${s}${RESET}`,
  yellow: (s: string) => `${ESC}33m${s}${RESET}`,
  cyan: (s: string) => `${ESC}36m${s}${RESET}`,
  white: (s: string) => `${ESC}97m${s}${RESET}`,
  gray: (s: string) => `${ESC}90m${s}${RESET}`,
  bgRed: (s: string) => `${ESC}41m${s}${RESET}`,
};

export const icon = {
  pass: c.green("✓"),
  fail: c.red("✗"),
  warn: c.yellow("⚠"),
  info: c.cyan("›"),
  shield: "🛡",
  lock: "🔒",
  fire: "🔥",
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

export function print(text: string): void {
  process.stdout.write(text);
}

export function println(text = ""): void {
  process.stdout.write(`${text}\n`);
}

export function clearLine(): void {
  if (isTTY()) process.stdout.write("\r\x1b[K");
}

export function printHeader(): void {
  println();
  println(`  ${icon.shield}  ${c.bold(c.white("Harness"))} ${c.dim("· AI-Agent Security Harness")}`);
  println(c.dim("  ─────────────────────────────────────"));
  println();
}

export type StepResult = "ok" | "warn" | "fail" | "skip";

export interface Step {
  label: string;
  run: () => Promise<{ result: StepResult; detail?: string }>;
}

export async function runSteps(
  steps: Step[],
): Promise<{ passed: number; warned: number; failed: number }> {
  let passed = 0;
  let warned = 0;
  let failed = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const prefix = c.dim(`  [${i + 1}/${steps.length}]`);
    const label = ` ${step.label}`;

    let frame = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    if (isTTY()) {
      interval = setInterval(() => {
        const spinner = c.cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length] ?? "⠋");
        process.stdout.write(`\r${prefix}${label} ${spinner} `);
        frame++;
      }, 80);
    } else {
      print(`${prefix}${label} `);
    }

    const { result, detail } = await step.run();

    if (interval !== undefined) {
      clearInterval(interval);
      clearLine();
    }

    let badge: string;
    switch (result) {
      case "ok":
        badge = icon.pass;
        passed++;
        break;
      case "warn":
        badge = icon.warn;
        warned++;
        break;
      case "fail":
        badge = icon.fail;
        failed++;
        break;
      case "skip":
        badge = c.dim("–");
        break;
    }

    println(`${prefix}${label} ${badge}`);
    if (detail) {
      for (const line of detail.trim().split("\n")) {
        println(`        ${c.dim(line)}`);
      }
    }
  }

  return { passed, warned, failed };
}

export function printPreflightSummary(passed: number, warned: number, failed: number, total: number): void {
  println();
  if (failed > 0) {
    println(`  ${icon.fail}  ${c.bold(c.red("Pre-flight FAILED"))}  ${c.dim(`${failed} error(s) — agent session blocked`)}`);
  } else if (warned > 0) {
    println(`  ${icon.warn}  ${c.bold(c.yellow("Pre-flight passed with warnings"))}  ${c.dim(`${warned} warning(s)`)}`);
    println(`  ${c.dim("Agent session will start — fix warnings when possible")}`);
  } else {
    println(`  ${icon.pass}  ${c.bold(c.green(`All ${total} checks passed`))}  ${c.dim("Agent session starting…")}`);
  }
  println();
}

export function printStatusTable(rows: Array<{ label: string; value: string; ok: boolean }>): void {
  println();
  println(`  ${c.bold("Component")}${" ".repeat(16)}${c.bold("Status")}`);
  println(c.dim("  " + "─".repeat(36)));
  for (const row of rows) {
    const label = row.label.padEnd(22);
    const badge = row.ok ? icon.pass : icon.fail;
    println(`  ${label}${badge}  ${row.ok ? c.green(row.value) : c.red(row.value)}`);
  }
  println();
}
