#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";

const targets = [
  {
    target: "bun-darwin-arm64",
    output: "binaries/aegis-darwin-arm64",
  },
  {
    target: "bun-darwin-x64",
    output: "binaries/aegis-darwin-x64",
  },
  {
    target: "bun-linux-x64",
    output: "binaries/aegis-linux-x64",
  },
  {
    target: "bun-linux-arm64",
    output: "binaries/aegis-linux-arm64",
  },
] as const;

await mkdir("binaries", { recursive: true });

for (const { target, output } of targets) {
  console.log(`Building ${target}...`);
  const result = Bun.spawnSync({
    cmd: [
      "bun",
      "build",
      "--compile",
      "--target",
      target,
      "src/cli/index.ts",
      "--outfile",
      output,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}
