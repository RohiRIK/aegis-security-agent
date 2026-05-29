# SIEM Integration Guide

Aegis Security Agent provides a structured audit trail designed for ingestion by Security Information and Event Management (SIEM) systems. All security decisions, scanner findings, and policy matches are recorded in a machine-readable format.

## NDJSON Format Reference

Aegis emits events in Newline Delimited JSON (NDJSON) format using the `aegis/v1` schema. Each line in the audit log is a self-contained JSON object.

### Event Schema

| Field | Type | Description |
|-------|------|-------------|
| `schema` | string | Always `aegis/v1`. |
| `id` | string | Unique UUID for the event. |
| `ts` | string | ISO 8601 timestamp of the event. |
| `source` | string | Origin of the event: `plugin`, `hook`, `agent`, or `cli`. |
| `kind` | string | The type of event (e.g., `policy.match`, `scanner.finding`). |
| `severity` | string | Event severity: `critical`, `high`, `medium`, `low`, or `info`. |
| `subject` | string | The primary object of the event (e.g., a file path or command). |
| `outcome` | string | The action taken: `allow`, `warn`, `block`, or `skip`. |
| `message` | string | Human-readable summary of the event. |
| `evidence` | object | (Optional) Supporting data such as scanner findings or raw output. |
| `policy` | object | (Optional) The policy rule and action that triggered the event. |
| `correlation`| object | (Optional) IDs to link events to a `sessionId` or `toolCall`. |
| `degraded` | boolean | (Optional) True if Aegis is running in a degraded state. |

### Annotated Example

```json
{
  "schema": "aegis/v1",
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "ts": "2026-05-09T14:30:00.123Z",
  "source": "plugin",
  "kind": "scanner.finding",
  "severity": "high",
  "subject": "src/server.ts",
  "outcome": "warn",
  "message": "Semgrep found a potential SQL injection vulnerability",
  "evidence": {
    "scanner": "semgrep",
    "ruleId": "typescript.node.security.audit.sql-injection"
  },
  "correlation": {
    "sessionId": "ses_abc123",
    "toolCall": "call_xyz789"
  }
}
```

## File Location

The audit log is written to:

`${PROJECT_ROOT}/.aegis/audit.jsonl`

- **Append-only**: Aegis only appends to this file.
- **Concurrency**: The file is safe for concurrent reads as NDJSON is append-safe.
- **Rotation**: Aegis does not perform log rotation. See the [Log Rotation](#log-rotation) section for recommendations.

## Shipper Configurations

### Vector (Recommended)

Vector is a high-performance observability data pipeline. Use this configuration to parse the NDJSON and send it to Splunk HEC.

```toml
[sources.aegis_audit]
type = "file"
include = ["${PROJECT_ROOT}/.aegis/audit.jsonl"]
read_from = "beginning"

[transforms.parse_aegis]
type = "remap"
inputs = ["aegis_audit"]
source = ". = parse_json!(.message)"

[sinks.splunk_hec]
type = "splunk_hec_logs"
inputs = ["parse_aegis"]
endpoint = "https://splunk-hec.example.com:8088"
token = "${SPLUNK_HEC_TOKEN}"
index = "security"
```

### Fluent Bit

Fluent Bit is a lightweight log processor and forwarder.

```ini
[INPUT]
    Name        tail
    Path        ${PROJECT_ROOT}/.aegis/audit.jsonl
    Parser      json
    Tag         aegis.audit

[OUTPUT]
    Name        datadog
    Match       aegis.audit
    Host        http-intake.logs.datadoghq.com
    TLS         On
    compress    gzip
    apikey      ${DD_API_KEY}
    dd_service  aegis-security-agent
    dd_source   aegis
```

### Splunk Universal Forwarder

Add this to your `inputs.conf` to monitor the audit log.

```ini
[monitor://${PROJECT_ROOT}/.aegis/audit.jsonl]
index = security
sourcetype = _json
disabled = 0
```

### Datadog Agent

Add a configuration file to `conf.d/aegis.yaml`.

```yaml
logs:
  - type: file
    path: ${PROJECT_ROOT}/.aegis/audit.jsonl
    service: aegis-security-agent
    source: aegis
    sourcecategory: security
```

## Log Rotation

Since Aegis does not rotate logs, use `logrotate` to manage file size.

Example `/etc/logrotate.d/aegis`:

```text
${PROJECT_ROOT}/.aegis/audit.jsonl {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

Note: `copytruncate` is recommended to ensure the file handle remains valid for the Aegis process.

## Querying the Audit Log

Use `jq` to query the local audit log for quick analysis.

### Filter by severity
```bash
jq 'select(.severity == "high")' .aegis/audit.jsonl
```

### Filter by kind
```bash
jq 'select(.kind == "scanner.finding")' .aegis/audit.jsonl
```

### Count findings per session
```bash
jq -s 'group_by(.correlation.sessionId) | map({session: .[0].correlation.sessionId, count: length})' .aegis/audit.jsonl
```

### List unique rules triggered
```bash
jq -r 'select(.evidence.ruleId != null) | .evidence.ruleId' .aegis/audit.jsonl | sort | uniq
```
