import { zodToJsonSchema } from "zod-to-json-schema";

import {
  ConsoleMessagesTool,
  NetworkRequestsTool,
} from "@/protocol/tool-definitions";
import { CodedError } from "@/protocol/ws-sender";

import { Tool } from "./tool";

/**
 * Format timestamp as HH:MM:SS.mmm
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString().split("T")[1].replace("Z", "");
}

/**
 * Network requests tool - retrieve captured network activity from current session
 */
export const networkRequests: Tool = {
  schema: {
    name: NetworkRequestsTool.shape.name.value,
    description: NetworkRequestsTool.shape.description.value,
    inputSchema: zodToJsonSchema(NetworkRequestsTool.shape.arguments),
  },
  handle: async (context, params = {}) => {
    try {
      const response = await context.sendSocketMessage(
        "browser_get_network_requests",
        { filter: params?.filter }
      );

      if (!response.success) {
        throw new CodedError(
          response.errorCode || "REQUEST_FAILED",
          response.error || "Failed to retrieve network requests"
        );
      }

      const requests = response.requests || [];

      if (requests.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No network requests captured in current session.\n\nNote: Network capture starts when you navigate to a page.",
            },
          ],
        };
      }

      // Group by type
      const byType: Record<string, typeof requests> = {};
      for (const req of requests) {
        const type = req.type || "unknown";
        if (!byType[type]) byType[type] = [];
        byType[type].push(req);
      }

      // Format output
      const lines: string[] = [
        `## Network Requests (${requests.length} total)\n`,
      ];

      for (const [type, reqs] of Object.entries(byType)) {
        lines.push(`### ${type} (${reqs.length})`);
        for (const req of reqs) {
          const status = req.status || (req.error ? "ERR" : "---");
          const statusBadge =
            req.status >= 400 || req.error
              ? `[${status}]`
              : req.status >= 300
                ? `[${status}]`
                : `[${status}]`;
          const method = req.method.padEnd(6);
          const url = req.url.length > 80 ? req.url.slice(0, 77) + "..." : req.url;
          lines.push(`${statusBadge} ${method} ${url}`);
          if (req.error) {
            lines.push(`    Error: ${req.error}`);
          }
        }
        lines.push("");
      }

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n"),
          },
        ],
      };
    } catch (error) {
      if (error instanceof CodedError) {
        throw error;
      }
      throw new CodedError(
        "NETWORK_REQUESTS_FAILED",
        `Failed to get network requests: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

/**
 * Console messages tool - retrieve captured console output from current session
 */
export const consoleMessages: Tool = {
  schema: {
    name: ConsoleMessagesTool.shape.name.value,
    description: ConsoleMessagesTool.shape.description.value,
    inputSchema: zodToJsonSchema(ConsoleMessagesTool.shape.arguments),
  },
  handle: async (context, params = {}) => {
    try {
      const response = await context.sendSocketMessage(
        "browser_get_console_messages",
        {
          level: params?.level || "all",
          since: params?.since,
        }
      );

      if (!response.success) {
        throw new CodedError(
          response.errorCode || "REQUEST_FAILED",
          response.error || "Failed to retrieve console messages"
        );
      }

      const logs = response.logs || [];

      if (logs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No console messages captured in current session.\n\nNote: Console capture starts when you navigate to a page.",
            },
          ],
        };
      }

      // Format output with color coding
      const lines: string[] = [
        `## Console Messages (${logs.length} total)\n`,
      ];

      for (const log of logs) {
        const time = formatTime(log.timestamp);
        const level = (log.level || "log").toUpperCase().padEnd(5);
        const message = log.message || "";

        // Prefix with emoji for visual distinction
        const emoji =
          log.level === "error"
            ? "🔴"
            : log.level === "warn"
              ? "🟡"
              : log.level === "info"
                ? "🔵"
                : "⚪";

        lines.push(`${emoji} [${time}] ${level} ${message}`);

        // Include stack trace for errors if available
        if (log.stack && log.level === "error") {
          const stackLines = log.stack.split("\n").slice(1, 4); // First 3 stack frames
          for (const line of stackLines) {
            lines.push(`    ${line.trim()}`);
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n"),
          },
        ],
      };
    } catch (error) {
      if (error instanceof CodedError) {
        throw error;
      }
      throw new CodedError(
        "CONSOLE_MESSAGES_FAILED",
        `Failed to get console messages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
