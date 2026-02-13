/**
 * MCP runtime configuration
 * Provides websocket port defaults and error constants
 */
export const mcpConfig = {
  defaultWsPort: 3456,
  hubWebSocketUrl: process.env.PARTYBROWSER_HUB_WS_URL || "ws://127.0.0.1:3456",
  errors: {
    noConnectedTab: "No connected tab",
  },
} as const;
