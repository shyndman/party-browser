import { zodToJsonSchema } from "zod-to-json-schema";

import {
  ConsoleMessagesTool,
  NetworkRequestsTool,
  NetworkRequestDetailsTool,
} from "@/protocol/tool-definitions";
import { CodedError } from "@/protocol/ws-sender";
import { errorLog } from "@/utils/log";

import { Tool } from "./tool";

/**
 * Format timestamp as HH:MM:SS.mmm
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString().split("T")[1].replace("Z", "");
}

type CommandEnvelope = {
  success?: boolean;
  error?: string;
  errorCode?: string;
  data?: unknown;
};

type NetworkRequestEntry = {
  id: string;
  url?: string;
  method?: string;
  type?: string;
  status?: number;
  timestamp?: number;
  error?: string;
};

type NetworkRequestsPayload = {
  requests?: NetworkRequestEntry[];
};

type ConsoleLogEntry = {
  level?: string;
  message?: string;
  timestamp?: number;
  stack?: string;
};

function unwrapCommandPayload<T>(result: unknown): T {
  if (
    result
    && typeof result === "object"
    && "data" in result
    && (result as { data?: unknown }).data !== undefined
  ) {
    return (result as { data: T }).data;
  }

  return result as T;
}

function extractConsoleLogs(result: unknown): ConsoleLogEntry[] {
  const payload = unwrapCommandPayload<{ logs?: unknown }>(result);
  return Array.isArray(payload.logs) ? payload.logs as ConsoleLogEntry[] : [];
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
  handle: async (context, params = {}, requestId) => {
    try {
      const response = await context.sendSocketMessage(
        "get_network_requests",
        { filter: params?.filter },
        { requestId },
      );

        if (!response.success) {
          throw new CodedError(
            response.error || "Failed to retrieve network requests",
            response.errorCode || "REQUEST_FAILED",
          );
        }

      const payload = unwrapCommandPayload<NetworkRequestsPayload>(response);
      const requests = payload.requests || [];

      if (requests.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No matching network requests captured in the current session.",
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
          const numericStatus = req.status;
          const status = numericStatus ?? (req.error ? "ERR" : "---");
          const statusBadge =
            (typeof numericStatus === "number" && numericStatus >= 400) || req.error
              ? `[${status}]`
              : typeof numericStatus === "number" && numericStatus >= 300
                ? `[${status}]`
                : `[${status}]`;
          const method = (req.method ?? "GET").padEnd(6);
          const rawUrl = req.url ?? "(unknown url)";
          const url = rawUrl.length > 80 ? rawUrl.slice(0, 77) + "..." : rawUrl;
          lines.push(`${statusBadge} ${method} ${url}`);
          lines.push(`    ID: ${req.id}`);
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
 * Network request details tool - retrieve all captured data for one request
 */
export const networkRequestDetails: Tool = {
  schema: {
    name: NetworkRequestDetailsTool.shape.name.value,
    description: NetworkRequestDetailsTool.shape.description.value,
    inputSchema: zodToJsonSchema(NetworkRequestDetailsTool.shape.arguments),
  },
  handle: async (context, params = {}, requestId) => {
    try {
      const { id, encoding } = NetworkRequestDetailsTool.shape.arguments.parse(params);
      const response = await context.sendSocketMessage(
        "get_network_request_details",
        { id, encoding },
        { requestId },
      );

      if (!response.success) {
        throw new CodedError(
          response.error || "Failed to retrieve network request details",
          response.errorCode || "REQUEST_FAILED",
        );
      }

      const details = unwrapCommandPayload<Record<string, unknown>>(response);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    } catch (error) {
      errorLog("[PartyBrowser] Failed to get network request details.", {
        id: params.id,
        error,
      });
      if (error instanceof CodedError) throw error;
      throw new CodedError(
        `Failed to get network request details: ${error instanceof Error ? error.message : String(error)}`,
        "NETWORK_REQUEST_DETAILS_FAILED",
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
  handle: async (context, params = {}, requestId) => {
    try {
      const response = await context.sendSocketMessage(
        "get_console_messages",
        {
          level: params?.level || "all",
          since: params?.since,
        },
        { requestId },
      );

        if (!response.success) {
          throw new CodedError(
            response.error || "Failed to retrieve console messages",
            response.errorCode || "REQUEST_FAILED",
          );
        }

      const logs = extractConsoleLogs(response);

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
        const time = formatTime(log.timestamp ?? 0);
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
