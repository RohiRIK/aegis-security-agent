import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogDir, sanitizeRepoName, writeReportCatalog } from "./catalog.ts";

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("sanitizeRepoName", () => {
  test("strips unsafe chars", () => {
    expect(sanitizeRepoName("acme/My Repo!.git")).toBe("acme-My-Repo-.git");
  });
  test("empty → repo", () => {
    expect(sanitizeRepoName("///")).toBe("repo");
  });
});

describe("catalogDir", () => {
  test("builds <root>/<repo>/<date>/<verdict>", () => {
    expect(catalogDir("/root", "demo", "2026-07-24", "SAFE")).toBe("/root/demo/2026-07-24/SAFE");
  });
});

describe("writeReportCatalog", () => {
  test("writes three artifacts into the verdict dir", async () => {
    const root = mkdtempSync(join(tmpdir(), "aegis-catalog-test-"));
    created.push(root);

    const dir = await writeReportCatalog(
      { repo: "demo", date: "2026-07-24", verdict: "BLOCKED" },
      { html: "<html></html>", sarif: { version: "2.1.0" }, verdict: { verdict: "BLOCKED" } },
      { root },
    );

    expect(dir).toBe(join(root, "demo", "2026-07-24", "BLOCKED"));
    expect(existsSync(join(dir, "report.html"))).toBe(true);
    expect(existsSync(join(dir, "report.sarif"))).toBe(true);
    expect(existsSync(join(dir, "verdict.json"))).toBe(true);

    const sarif = await Bun.file(join(dir, "report.sarif")).json();
    expect(sarif.version).toBe("2.1.0");
  });

  test("locks every catalog level to 0o700 and files to 0o600", async () => {
    const root = mkdtempSync(join(tmpdir(), "aegis-catalog-perm-"));
    created.push(root);

    const dir = await writeReportCatalog(
      { repo: "demo", date: "2026-07-24", verdict: "RISKY" },
      { html: "<html></html>", sarif: { version: "2.1.0" }, verdict: { verdict: "RISKY" } },
      { root },
    );

    // Intermediate dir names leak repo identity + verdict — all must be owner-only.
    const levels = [root, join(root, "demo"), join(root, "demo", "2026-07-24"), dir];
    for (const level of levels) {
      expect(statSync(level).mode & 0o777).toBe(0o700);
    }
    for (const name of ["report.html", "report.sarif", "verdict.json"]) {
      expect(statSync(join(dir, name)).mode & 0o777).toBe(0o600);
    }
  });
});
