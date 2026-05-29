export type SarifLevel = "error" | "warning" | "note" | "none";

export type SarifLocation = {
  physicalLocation: {
    artifactLocation: { uri: string };
    region?: { startLine: number; endLine?: number };
  };
};

export type SarifResult = {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations?: SarifLocation[];
  fingerprints?: Record<string, string>;
  properties?: Record<string, unknown>;
};

export type SarifReportingDescriptor = {
  id: string;
  shortDescription?: { text: string };
  defaultConfiguration?: { level: SarifLevel };
};

export type SarifToolComponent = {
  name: string;
  semanticVersion: string;
  informationUri?: string;
  rules: SarifReportingDescriptor[];
};

export type SarifTool = {
  driver: SarifToolComponent;
};

export type SarifInvocation = {
  executionSuccessful: boolean;
  startTimeUtc?: string;
  endTimeUtc?: string;
};

export type SarifRun = {
  tool: SarifTool;
  results: SarifResult[];
  invocations?: SarifInvocation[];
};

export type SarifLog = {
  $schema: string;
  version: "2.1.0";
  runs: SarifRun[];
};
