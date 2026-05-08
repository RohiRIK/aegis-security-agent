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

export function println(text = ""): void {
  process.stdout.write(`${text}\n`);
}

export function printHeader(): void {
  println();
  println(`  ${icon.shield}  ${c.bold(c.white("Aegis"))} ${c.dim("· AI-Agent Security")}`);
  println(c.dim("  ─────────────────────────────────────"));
  println();
}
