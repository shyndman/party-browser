/**
 * Tools module for MCP server
 * Re-exports all tool modules for convenient access
 */

// Tool base
export { type Tool, type ToolSchema, type ToolResult, type ToolFactory } from "./tool";

// Common tools
export {
  navigate,
  goBack,
  goForward,
  pressKey,
  wait,
  waitFor,
} from "./common";

// Snapshot tools
export {
  snapshot,
  click,
  hover,
  type,
  selectOption,
} from "./snapshot";

// Inspection tools
export {
  networkRequests,
  consoleMessages,
} from "./inspection";

// Custom tools
export {
  getConsoleLogs,
  screenshot,
} from "./custom";

export { evaluate } from "./evaluate";
