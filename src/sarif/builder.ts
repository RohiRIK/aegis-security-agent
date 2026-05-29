import type { AegisEvent, AegisEventSeverity, NormalizedFinding } from "../events/types.ts";
import type {
  SarifLog,
  SarifResult,
  SarifLevel,
  SarifReportingDescriptor,
  SarifInvocation,
  SarifLocation,
} from "./types.ts";

const SARIF_SCHEMA =
  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json";

function aegisSeverityToSarifLevel(severity: AegisEventSeverity): SarifLevel {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    case "info":
      return "note";
  }
}

function findingToResult(finding: NormalizedFinding): SarifResult {
  const result: SarifResult = {
    ruleId: finding.ruleId,
    level: aegisSeverityToSarifLevel(finding.severity),
    message: { text: finding.message },
  };

  if (finding.location) {
    const loc: SarifLocation = {
      physicalLocation: {
        artifactLocation: { uri: finding.location.file },
        ...(finding.location.startLine != null
          ? {
              region: {
                startLine: finding.location.startLine,
                ...(finding.location.endLine != null ? { endLine: finding.location.endLine } : {}),
              },
            }
          : {}),
      },
    };
    result.locations = [loc];
  }

  if (finding.fingerprint) {
    result.fingerprints = { "aegis/v1": finding.fingerprint };
  }

  if (finding.package) {
    result.properties = { package: finding.package };
  }

  return result;
}

function extractFindings(event: AegisEvent): NormalizedFinding[] {
  if (event.kind !== "scanner.finding") return [];
  const evidence = event.evidence as Record<string, unknown> | undefined;
  if (!evidence) return [];
  const findings = evidence.findings;
  if (!Array.isArray(findings) || findings.length === 0) return [];
  return findings as NormalizedFinding[];
}

function buildRules(findings: NormalizedFinding[]): SarifReportingDescriptor[] {
  const seen = new Map<string, SarifReportingDescriptor>();
  for (const f of findings) {
    if (!seen.has(f.ruleId)) {
      seen.set(f.ruleId, {
        id: f.ruleId,
        shortDescription: { text: f.message },
        defaultConfiguration: { level: aegisSeverityToSarifLevel(f.severity) },
      });
    }
  }
  return [...seen.values()];
}

function buildInvocations(events: AegisEvent[]): SarifInvocation[] | undefined {
  const start = events.find((e) => e.kind === "session.start");
  const end = events.find((e) => e.kind === "session.end");
  if (!start && !end) return undefined;
  return [
    {
      executionSuccessful: true,
      ...(start ? { startTimeUtc: start.ts } : {}),
      ...(end ? { endTimeUtc: end.ts } : {}),
    },
  ];
}

export function eventsToSarif(events: AegisEvent[], packageVersion: string): SarifLog {
  const allFindings: NormalizedFinding[] = [];
  for (const event of events) {
    allFindings.push(...extractFindings(event));
  }

  const results = allFindings.map(findingToResult);
  const rules = buildRules(allFindings);
  const invocations = buildInvocations(events);

  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "aegis-security-agent",
            semanticVersion: packageVersion,
            informationUri: "https://github.com/RohiRIK/aegis-security-agent",
            rules,
          },
        },
        results,
        ...(invocations ? { invocations } : {}),
      },
    ],
  };
}
