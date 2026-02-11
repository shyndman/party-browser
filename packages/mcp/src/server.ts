import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { WebSocketServer } from "ws";

import { mcpConfig } from "@/config/mcp.config";
import { Context } from "@/session";
import type { Resource } from "@/resources/resource";
import type { Tool } from "@/tools/tool";
import { CodedError, createWebSocketServer } from "@/messaging";
import { debugLog } from "@/utils/log";

type Options = {
  name: string;
  version: string;
  tools: Tool[];
  resources: Resource[];
};

function formatTransportStartupError(error: Error): string {
  const code = (error as Error & { code?: string }).code;
  if (code === "EADDRINUSE") {
    return `WebSocket port ${mcpConfig.defaultWsPort} is already in use by another process.`;
  }
  return error.message;
}

export async function createServerWithTools(options: Options): Promise<Server> {
  const { name, version, tools, resources } = options;
  const context = new Context();
  let wss: WebSocketServer | undefined;
  let transportStartupError: Error | undefined;

  const server = new Server(
    { name, version },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  const startWebSocketTransport = async () => {
    try {
      const socketServer = await createWebSocketServer();
      wss = socketServer;

      socketServer.on("connection", (websocket) => {
        console.log("Browser extension connected");

        if (context.hasWs()) {
          context.ws.close();
        }
        context.ws = websocket;

        websocket.on("close", () => {
          console.log("Extension disconnected (connection lost)");
          context.ws = undefined;
        });

        websocket.on("error", (error) => {
          console.error("WebSocket error:", error);
          context.ws = undefined;
        });
      });
    } catch (error) {
      transportStartupError =
        error instanceof Error ? error : new Error(String(error));
      console.error(
        `Failed to start Browser MCP WebSocket transport: ${formatTransportStartupError(transportStartupError)}`,
      );
    }
  };

  const wsStartupPromise = startWebSocketTransport();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: tools.map((tool) => tool.schema) };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resources.map((resource) => resource.schema) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    debugLog("[MCP] Tool called:", request.params.name, request.params.arguments);
    const tool = tools.find((tool) => tool.schema.name === request.params.name);
    if (!tool) {
      const error = new CodedError(
        `Tool "${request.params.name}" not found`,
        "TOOL_NOT_FOUND"
      );
      return {
        content: [
          { type: "text", text: `[${error.errorCode}] ${error.message}` },
        ],
        isError: true,
      };
    }

    if (transportStartupError && !context.hasWs()) {
      const code = (transportStartupError as Error & { code?: string }).code;
      const errorCode = code === "EADDRINUSE" ? "EADDRINUSE" : "TRANSPORT_UNAVAILABLE";
      const error = new CodedError(
        `Browser transport unavailable: ${formatTransportStartupError(transportStartupError)} Close other Browser MCP sessions using this port, then restart this MCP process.`,
        errorCode
      );
      return {
        content: [
          {
            type: "text",
            text: `[${error.errorCode}] ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await tool.handle(context, request.params.arguments);
      debugLog("[MCP] Tool result:", request.params.name, result);
      return result;
    } catch (error) {
      debugLog("[MCP] Tool error:", request.params.name, error);
      // Include errorCode if available from CodedError, otherwise use INTERNAL_TOOL_ERROR fallback
      const errorCode = (error as Error & { errorCode?: string }).errorCode;
      const errorMessage = String(error);

      return {
        content: [
          {
            type: "text",
            text: `[${errorCode || "INTERNAL_TOOL_ERROR"}] ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = resources.find(
      (resource) => resource.schema.uri === request.params.uri,
    );
    if (!resource) {
      return { contents: [] };
    }

    const contents = await resource.read(context, request.params.uri);
    return { contents };
  });

  const originalClose = server.close.bind(server);
  server.close = async () => {
    await originalClose();
    await wsStartupPromise;
    if (wss) {
      const socketServer = wss;
      await new Promise<void>((resolve, reject) => {
        socketServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    await context.close();
  };

  return server;
}
