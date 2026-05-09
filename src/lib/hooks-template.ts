export const HOOKS_TEMPLATE = `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun run \\\"__AEGIS_DIR__/dist/hooks/pre-tool-use.js\\\""
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
            "command": "bun run \\\"__AEGIS_DIR__/dist/hooks/post-tool-use.js\\\""
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
            "command": "bun run \\\"__AEGIS_DIR__/dist/hooks/stop.js\\\""
          }
        ]
      }
    ]
  }
}
`;
