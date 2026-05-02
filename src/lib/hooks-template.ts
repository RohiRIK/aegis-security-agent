export const HOOKS_TEMPLATE = `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun run \\\"__AEGIS_DIR__/src/hooks/pre-tool-use.ts\\\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun run \\\"__AEGIS_DIR__/src/hooks/post-tool-use.ts\\\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo \\\"{\\\\\\\"timestamp\\\\\\\":\\\\\\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\\\\\",\\\\\\\"event\\\\\\\":\\\\\\\"session_end\\\\\\\"}\\\" >> \\\"__AEGIS_DIR__/.aegis/audit.log\\\""
          }
        ]
      }
    ]
  }
}
`;
