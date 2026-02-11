import packageJSON from "../../package.json";

/**
 * Application configuration
 * Provides app name and version for MCP server identification
 */
export const appConfig = {
  name: "@browsermcp/mcp",
  version: packageJSON.version,
} as const;
