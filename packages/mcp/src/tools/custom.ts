import { zodToJsonSchema } from "zod-to-json-schema";

import { GetConsoleLogsTool, ScreenshotTool } from "@/protocol/tool-definitions";

import { Tool } from "./tool";

export const getConsoleLogs: Tool = {
  schema: {
    name: GetConsoleLogsTool.shape.name.value,
    description: GetConsoleLogsTool.shape.description.value,
    inputSchema: zodToJsonSchema(GetConsoleLogsTool.shape.arguments),
  },
  handle: async (context, _params) => {
    const response = await context.sendSocketMessage(
      "get_console_logs",
      {},
    );

    // Extension returns { success: true, count: number, logs: array }
    // Handle both array (legacy) and object (current) response shapes
    const logs = Array.isArray(response)
      ? response
      : (response?.logs || []);

    const text: string = logs
      .map((log: unknown) => JSON.stringify(log))
      .join("\n");
    return {
      content: [{ type: "text", text }],
    };
  },
};

export const screenshot: Tool = {
  schema: {
    name: ScreenshotTool.shape.name.value,
    description: ScreenshotTool.shape.description.value,
    inputSchema: zodToJsonSchema(ScreenshotTool.shape.arguments),
  },
  handle: async (context, _params) => {
    try {
      // Extension contract: returns base64-encoded PNG string (not Data URL)
      const screenshot = await context.sendSocketMessage(
        "screenshot",
        {},
      );

      // Validate we received data
      if (!screenshot || typeof screenshot !== "string") {
        return {
          content: [{
            type: "text",
            text: "Error: Screenshot returned no data. Ensure the browser extension has permission to capture the active tab.",
          }],
          isError: true,
        };
      }

      // Strip data URL prefix if present (extension should not send this, but handle gracefully)
      let imageData = screenshot;
      if (screenshot.startsWith("data:image/png;base64,")) {
        imageData = screenshot.slice("data:image/png;base64,".length);
      } else if (screenshot.startsWith("data:")) {
        return {
          content: [{
            type: "text",
            text: "Error: Screenshot returned unexpected data URL format. Expected raw base64 PNG data.",
          }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "image",
            data: imageData,
            mimeType: "image/png",
          },
        ],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
};
