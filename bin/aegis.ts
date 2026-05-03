#!/usr/bin/env bun
import { join } from "node:path";

await import(join(import.meta.dir, "..", "dist", "cli", "index.js"));
