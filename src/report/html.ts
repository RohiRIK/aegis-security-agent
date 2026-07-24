import type { NormalizedFinding } from "../events/types.ts";
import type { ScanReport } from "./types.ts";

/** Escapes a string for safe interpolation into HTML text/attribute context. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const VERDICT_COLOR: Record<ScanReport["verdict"], string> = {
  SAFE: "#1a7f37",
  RISKY: "#bf8700",
  BLOCKED: "#cf222e",
};

const SEVERITY_ORDER: NormalizedFinding["severity"][] = ["critical", "high", "medium", "low", "info"];

function locationText(finding: NormalizedFinding): string {
  if (finding.location) {
    const line = finding.location.startLine != null ? `:${finding.location.startLine}` : "";
    return `${finding.location.file}${line}`;
  }
  if (finding.package) return finding.package;
  return "—";
}

function renderFindingRows(findings: NormalizedFinding[]): string {
  if (findings.length === 0) {
    return `<tr><td colspan="4" class="empty">No findings.</td></tr>`;
  }
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  return sorted
    .map(
      (f) => `      <tr>
        <td><span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
        <td>${escapeHtml(f.scanner)}</td>
        <td class="rule">${escapeHtml(f.ruleId)}</td>
        <td>${escapeHtml(locationText(f))}<div class="msg">${escapeHtml(f.message)}</div></td>
      </tr>`,
    )
    .join("\n");
}

function renderScannerRows(report: ScanReport): string {
  return report.scanners
    .map(
      (s) => `      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.version)}</td>
        <td>${escapeHtml(s.status)}</td>
        <td>${Math.round(s.durationMs)} ms</td>
      </tr>`,
    )
    .join("\n");
}

/** Renders a self-contained HTML report. Pure — no I/O, no external assets. */
export function renderReportHtml(report: ScanReport): string {
  const color = VERDICT_COLOR[report.verdict];
  const c = report.counts;
  const degraded =
    report.degraded.length > 0
      ? `<div class="degraded">⚠️ DEGRADED: ${escapeHtml(report.degraded.join(", "))}</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aegis Scan — ${escapeHtml(report.repo)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 2rem; background: #f6f8fa; color: #1f2328; }
  .wrap { max-width: 960px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  .verdict { font-weight: 700; font-size: 1.5rem; padding: .25rem .9rem; border-radius: 8px; color: #fff; background: ${color}; }
  h1 { font-size: 1.25rem; margin: 0; }
  .meta { color: #656d76; font-size: .85rem; }
  .counts { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1rem 0 1.5rem; }
  .pill { padding: .35rem .7rem; border-radius: 999px; font-size: .8rem; font-weight: 600; background: #eaeef2; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 1.5rem; }
  th, td { text-align: left; padding: .6rem .8rem; border-bottom: 1px solid #eaeef2; vertical-align: top; }
  th { background: #f6f8fa; font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: #656d76; }
  .rule { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
  .msg { color: #656d76; font-size: .8rem; margin-top: .2rem; }
  .empty { color: #656d76; text-align: center; }
  .sev { font-weight: 700; text-transform: uppercase; font-size: .72rem; padding: .1rem .45rem; border-radius: 4px; color: #fff; }
  .sev-critical { background: #cf222e; } .sev-high { background: #e16f24; }
  .sev-medium { background: #bf8700; } .sev-low { background: #0969da; } .sev-info { background: #656d76; }
  .degraded { background: #fff8c5; border: 1px solid #eac54f; padding: .5rem .8rem; border-radius: 6px; margin-bottom: 1rem; font-size: .85rem; }
  h2 { font-size: .95rem; margin: 1.5rem 0 .5rem; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="verdict">${escapeHtml(report.verdict)}</span>
    <div>
      <h1>${escapeHtml(report.repo)}</h1>
      <div class="meta">${escapeHtml(report.target)} · ${escapeHtml(report.date)} · ${escapeHtml(report.commit)}</div>
    </div>
  </header>
  ${degraded}
  <div class="counts">
    <span class="pill">critical ${c.critical}</span>
    <span class="pill">high ${c.high}</span>
    <span class="pill">medium ${c.medium}</span>
    <span class="pill">low ${c.low}</span>
    <span class="pill">info ${c.info}</span>
  </div>
  <h2>Findings (${report.findings.length})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Scanner</th><th>Rule</th><th>Location</th></tr></thead>
    <tbody>
${renderFindingRows(report.findings)}
    </tbody>
  </table>
  <h2>Scanners</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Version</th><th>Status</th><th>Duration</th></tr></thead>
    <tbody>
${renderScannerRows(report)}
    </tbody>
  </table>
  <div class="meta">Generated by aegis-security-agent</div>
</div>
</body>
</html>
`;
}
