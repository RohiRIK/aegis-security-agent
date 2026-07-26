import type { AegisEventSeverity, NormalizedFinding } from "../events/types.ts";
import { buildRecommendations, fixGuidance } from "./fix-guide.ts";
import type { ScanReport, ScannerRun } from "./types.ts";

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

const SEVERITY_ORDER: AegisEventSeverity[] = ["critical", "high", "medium", "low", "info"];

/** RGB triplets so the same hue works as a solid fill and as a translucent cell. */
const SEVERITY_RGB: Record<AegisEventSeverity, string> = {
  critical: "207,34,46",
  high: "225,111,36",
  medium: "191,135,0",
  low: "9,105,218",
  info: "101,109,118",
};

function locationText(finding: NormalizedFinding): string {
  if (finding.location) {
    const line = finding.location.startLine != null ? `:${finding.location.startLine}` : "";
    return `${finding.location.file}${line}`;
  }
  if (finding.package) return finding.package;
  return "—";
}

function severityRank(severity: AegisEventSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

function countBySeverity(findings: NormalizedFinding[]): Record<AegisEventSeverity, number> {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

// ---------------------------------------------------------------------------
// Findings — grouped, collapsible, no JavaScript
// ---------------------------------------------------------------------------

function renderFindingRows(findings: NormalizedFinding[]): string {
  const sorted = [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return sorted
    .map(
      (f) => `        <tr>
          <td><span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
          <td class="rule">${escapeHtml(f.ruleId)}</td>
          <td>${escapeHtml(locationText(f))}<div class="msg">${escapeHtml(f.message)}</div></td>
          <td class="fix">${escapeHtml(fixGuidance(f))}</td>
        </tr>`,
    )
    .join("\n");
}

/** Stacked severity strip: each segment sized by its share of the group. */
function renderSeverityStrip(findings: NormalizedFinding[]): string {
  const counts = countBySeverity(findings);
  const total = findings.length;
  if (total === 0) return "";
  const segments = SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .map(
      (s) =>
        `<span class="strip-seg" style="width:${((counts[s] / total) * 100).toFixed(2)}%;background:rgb(${SEVERITY_RGB[s]})" title="${escapeHtml(s)}: ${counts[s]}"></span>`,
    )
    .join("");
  return `<span class="strip">${segments}</span>`;
}

/**
 * One collapsible block per scanner. Groups holding a critical or high finding
 * start expanded; quieter groups stay folded so the page opens on what matters.
 */
function renderFindingGroups(report: ScanReport): string {
  if (report.findings.length === 0) {
    return `  <p class="empty-card">No findings.</p>`;
  }

  const byScanner = new Map<string, NormalizedFinding[]>();
  for (const finding of report.findings) {
    const bucket = byScanner.get(finding.scanner);
    if (bucket) bucket.push(finding);
    else byScanner.set(finding.scanner, [finding]);
  }

  const groups = [...byScanner.entries()].sort((a, b) => {
    const worst = (list: NormalizedFinding[]) => Math.min(...list.map((f) => severityRank(f.severity)));
    return worst(a[1]) - worst(b[1]) || b[1].length - a[1].length;
  });

  return groups
    .map(([scanner, findings]) => {
      const expanded = findings.some((f) => f.severity === "critical" || f.severity === "high");
      return `  <details class="group"${expanded ? " open" : ""}>
    <summary>
      <span class="group-name">${escapeHtml(scanner)}</span>
      <span class="group-count">${findings.length}</span>
      ${renderSeverityStrip(findings)}
    </summary>
    <table>
      <thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Fix Guide</th></tr></thead>
      <tbody>
${renderFindingRows(findings)}
      </tbody>
    </table>
  </details>`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Severity heatmap
// ---------------------------------------------------------------------------

/**
 * Severity distribution as a share of all findings. Non-zero severities keep a
 * floor width so a single CRITICAL among hundreds of LOWs stays visible.
 */
function renderSeverityBars(report: ScanReport): string {
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + report.counts[s], 0);

  return SEVERITY_ORDER.map((severity) => {
    const count = report.counts[severity];
    const share = total === 0 ? 0 : (count / total) * 100;
    const width = count === 0 ? 0 : Math.max(share, 1.5);
    const pct = total === 0 ? "" : `${share.toFixed(1)}%`;
    return `      <div class="bar-row">
        <span class="bar-label">${escapeHtml(severity)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${width.toFixed(2)}%;background:rgb(${SEVERITY_RGB[severity]})"></span></span>
        <span class="bar-count">${count}</span>
        <span class="bar-share">${pct}</span>
      </div>`;
  }).join("\n");
}

/**
 * Scanner × severity matrix. Cell shading is scaled to the largest cell so the
 * densest problem area is visible at a glance rather than read off a table.
 */
function renderHeatmapMatrix(report: ScanReport): string {
  const scanners = report.scanners.map((s) => s.name);
  if (scanners.length === 0) return "";

  const cell = (scanner: string, severity: AegisEventSeverity): number =>
    report.findings.filter((f) => f.scanner === scanner && f.severity === severity).length;

  const max = Math.max(1, ...scanners.flatMap((s) => SEVERITY_ORDER.map((sev) => cell(s, sev))));

  const head = `<tr><th>Scanner</th>${SEVERITY_ORDER.map((s) => `<th class="num">${escapeHtml(s)}</th>`).join("")}<th class="num">total</th></tr>`;
  const rows = scanners
    .map((scanner) => {
      let total = 0;
      const cells = SEVERITY_ORDER.map((severity) => {
        const count = cell(scanner, severity);
        total += count;
        const alpha = count === 0 ? 0 : 0.15 + 0.85 * (count / max);
        const style = count === 0 ? "" : ` style="background:rgba(${SEVERITY_RGB[severity]},${alpha.toFixed(2)})"`;
        const cls = count === 0 ? "heat zero" : alpha > 0.55 ? "heat strong" : "heat";
        return `<td class="${cls}"${style}>${count}</td>`;
      }).join("");
      return `      <tr><td>${escapeHtml(scanner)}</td>${cells}<td class="num">${total}</td></tr>`;
    })
    .join("\n");

  return `  <h2>Severity Heatmap</h2>
  <div class="card bars">
${renderSeverityBars(report)}
  </div>
  <table class="matrix">
    <thead>${head}</thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

// ---------------------------------------------------------------------------
// Scanner detail + recommendations
// ---------------------------------------------------------------------------

function renderScannerRows(report: ScanReport): string {
  return report.scanners
    .map((s: ScannerRun) => {
      const rules = s.ruleCount != null ? String(s.ruleCount) : "—";
      const duration = s.status === "skipped" ? "—" : formatDuration(s.durationMs);
      return `      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.version)}</td>
        <td><span class="status status-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span></td>
        <td class="num">${rules}</td>
        <td class="num">${escapeHtml(duration)}</td>
        <td class="detail">${escapeHtml(s.detail ?? "—")}</td>
      </tr>`;
    })
    .join("\n");
}

function renderRecommendations(report: ScanReport): string {
  const items = buildRecommendations(report);
  if (items.length === 0) return "";
  return `  <h2>Recommendations</h2>
  <ul class="card recs">
${items
  .map((r) => `    <li><span class="rec-scanner">${escapeHtml(r.scanner)}</span>${escapeHtml(r.text)}</li>`)
  .join("\n")}
  </ul>`;
}

function renderFooter(report: ScanReport): string {
  const parts = [
    `aegis-security-agent${report.toolVersion ? ` v${report.toolVersion}` : ""}`,
    `${report.scanners.length} scanners`,
    report.filesScanned != null ? `${report.filesScanned} files scanned` : null,
    report.durationMs != null ? `${formatDuration(report.durationMs)} total` : null,
    `${report.findings.length} findings`,
  ].filter((part): part is string => part !== null);
  return `  <div class="meta footer">${escapeHtml(parts.join(" · "))}</div>`;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * Renders a self-contained HTML report: inline CSS only, no scripts, no
 * external requests, no `url()` references. Every interpolated value passes
 * through `escapeHtml`, so scanner-controlled text (rule ids, file paths,
 * messages) cannot inject markup. Collapsible sections use `<details>` so the
 * report stays interactive without JavaScript.
 */
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
  :root {
    color-scheme: light dark;
    --bg: #f6f8fa; --surface: #ffffff; --text: #1f2328; --muted: #656d76;
    --border: #eaeef2; --chip: #eaeef2; --track: #eaeef2;
    --shadow: 0 1px 3px rgba(0,0,0,.08);
    --warn-bg: #fff8c5; --warn-border: #eac54f;
    --ok-bg: #dafbe1; --ok-text: #1a7f37;
    --bad-bg: #ffebe9; --bad-text: #cf222e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117; --surface: #161b22; --text: #e6edf3; --muted: #9198a1;
      --border: #30363d; --chip: #21262d; --track: #21262d;
      --shadow: 0 1px 3px rgba(0,0,0,.4);
      --warn-bg: #341a00; --warn-border: #9e6a03;
      --ok-bg: #0f2f18; --ok-text: #3fb950;
      --bad-bg: #3c1618; --bad-text: #f85149;
    }
  }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 2rem; background: var(--bg); color: var(--text); }
  .wrap { max-width: 1100px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  .verdict { font-weight: 700; font-size: 1.5rem; padding: .25rem .9rem; border-radius: 8px; color: #fff; background: ${color}; }
  h1 { font-size: 1.25rem; margin: 0; }
  h2 { font-size: .95rem; margin: 1.5rem 0 .5rem; }
  .meta { color: var(--muted); font-size: .85rem; }
  .footer { margin-top: 2rem; padding-top: .75rem; border-top: 1px solid var(--border); }
  .counts { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1rem 0 1.5rem; }
  .pill { padding: .35rem .7rem; border-radius: 999px; font-size: .8rem; font-weight: 600; background: var(--chip); }
  .card { background: var(--surface); border-radius: 8px; box-shadow: var(--shadow); }
  .empty-card { background: var(--surface); border-radius: 8px; box-shadow: var(--shadow); padding: 1.25rem; text-align: center; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; box-shadow: var(--shadow); margin-bottom: 1.5rem; }
  th, td { text-align: left; padding: .6rem .8rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: var(--bg); font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .rule { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
  .msg { color: var(--muted); font-size: .8rem; margin-top: .2rem; }
  .fix { font-size: .8rem; max-width: 22rem; }
  .detail { font-size: .78rem; color: var(--muted); }
  .empty { color: var(--muted); text-align: center; }
  .sev { font-weight: 700; text-transform: uppercase; font-size: .72rem; padding: .1rem .45rem; border-radius: 4px; color: #fff; }
  .sev-critical { background: #cf222e; } .sev-high { background: #e16f24; }
  .sev-medium { background: #bf8700; } .sev-low { background: #0969da; } .sev-info { background: #656d76; }
  .status { font-size: .72rem; font-weight: 600; padding: .1rem .45rem; border-radius: 4px; background: var(--chip); color: var(--text); }
  .status-ok, .status-cached { background: var(--ok-bg); color: var(--ok-text); }
  .status-timeout, .status-error { background: var(--bad-bg); color: var(--bad-text); }
  .status-skipped { background: var(--chip); color: var(--muted); }
  .degraded { background: var(--warn-bg); border: 1px solid var(--warn-border); padding: .5rem .8rem; border-radius: 6px; margin-bottom: 1rem; font-size: .85rem; }
  .bars { padding: .9rem 1rem; margin-bottom: 1rem; }
  .bar-row { display: flex; align-items: center; gap: .6rem; margin: .25rem 0; }
  .bar-label { width: 5rem; font-size: .78rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  .bar-track { flex: 1; height: .7rem; background: var(--track); border-radius: 999px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 999px; }
  .bar-count { width: 3rem; text-align: right; font-variant-numeric: tabular-nums; font-size: .8rem; font-weight: 600; }
  .bar-share { width: 3.5rem; text-align: right; font-variant-numeric: tabular-nums; font-size: .75rem; color: var(--muted); }
  .matrix td.heat { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .matrix td.zero { color: var(--muted); opacity: .55; font-weight: 400; }
  .matrix td.strong { color: #fff; }
  .group { background: var(--surface); border-radius: 8px; box-shadow: var(--shadow); margin-bottom: .6rem; overflow: hidden; }
  .group > summary { display: flex; align-items: center; gap: .75rem; padding: .6rem .8rem; cursor: pointer; font-size: .85rem; }
  .group > summary::marker { color: var(--muted); }
  .group-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
  .group-count { font-size: .75rem; font-weight: 600; padding: .05rem .45rem; border-radius: 999px; background: var(--chip); color: var(--muted); }
  .strip { flex: 1; display: flex; height: .5rem; border-radius: 999px; overflow: hidden; background: var(--track); max-width: 22rem; }
  .strip-seg { display: block; height: 100%; }
  .group table { box-shadow: none; border-radius: 0; margin-bottom: 0; }
  .recs { padding: .9rem 1rem .9rem 2rem; margin-bottom: 1.5rem; }
  .recs li { font-size: .85rem; margin: .35rem 0; }
  .rec-scanner { display: inline-block; min-width: 8.5rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .76rem; color: var(--muted); }
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
${renderHeatmapMatrix(report)}
  <h2>Findings (${report.findings.length})</h2>
${renderFindingGroups(report)}
  <h2>Scanner Detail</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Version</th><th>Status</th><th class="num">Rules</th><th class="num">Duration</th><th>Patterns / Configuration</th></tr></thead>
    <tbody>
${renderScannerRows(report)}
    </tbody>
  </table>
${renderRecommendations(report)}
${renderFooter(report)}
</div>
</body>
</html>
`;
}
