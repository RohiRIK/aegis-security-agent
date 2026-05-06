#!/usr/bin/env bun

/**
 * Version Sync Verification
 *
 * Ensures all files that reference the aegis-security-agent version
 * match the canonical version in package.json.
 *
 * Usage: bun run scripts/verify-version-sync.ts
 *
 * Source of truth: package.json → version field
 *
 * Checked locations:
 *   - .opencode/package.json  → aegis-security-agent dependency version
 *   - README.md               → "The current version is X.Y.Z"
 *   - docs/ARCHITECTURE.md    → "> Version X.Y.Z" header line
 */

import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

interface VersionCheck {
  file: string;
  description: string;
  extract: (content: string) => string | null;
}

const checks: VersionCheck[] = [
  {
    file: ".opencode/package.json",
    description: "aegis-security-agent dependency",
    extract: (content) => {
      const pkg = JSON.parse(content) as { dependencies?: Record<string, string> };
      return pkg.dependencies?.["aegis-security-agent"] ?? null;
    },
  },
  {
    file: "README.md",
    description: '"current version" statement',
    extract: (content) => {
      const match = content.match(/current version is (\d+\.\d+\.\d+)/i);
      return match?.[1] ?? null;
    },
  },
  {
    file: "docs/ARCHITECTURE.md",
    description: "header version line",
    extract: (content) => {
      const match = content.match(/^> Version (\d+\.\d+\.\d+)/m);
      return match?.[1] ?? null;
    },
  },
];

async function main(): Promise<void> {
  const pkgPath = join(ROOT, "package.json");
  const pkg = (await Bun.file(pkgPath).json()) as { version: string };
  const expected = pkg.version;

  console.log(`\n  Source of truth: package.json → ${expected}\n`);

  let failures = 0;

  for (const check of checks) {
    const filePath = join(ROOT, check.file);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      console.log(`  ⚠  SKIP  ${check.file} (file not found)`);
      continue;
    }

    const content = await file.text();
    const found = check.extract(content);

    if (found === null) {
      console.log(`  ⚠  SKIP  ${check.file} — ${check.description} (pattern not found)`);
      continue;
    }

    if (found === expected) {
      console.log(`  ✓  OK    ${check.file} → ${found}`);
    } else {
      console.log(`  ✗  FAIL  ${check.file} → ${found} (expected ${expected}) — ${check.description}`);
      failures++;
    }
  }

  console.log();

  if (failures > 0) {
    console.log(`  ${failures} version mismatch(es) found. Update files to match package.json v${expected}.\n`);
    process.exit(1);
  }

  console.log(`  All versions in sync.\n`);
}

await main();
