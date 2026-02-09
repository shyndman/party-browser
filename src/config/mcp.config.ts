/**
 * MCP runtime configuration
 * Provides websocket port defaults and error constants
 */
export const mcpConfig = {
  defaultWsPort: 3456,
  errors: {
    noConnectedTab: "No connected tab",
  },
} as const;
