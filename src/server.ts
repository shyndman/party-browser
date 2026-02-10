import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { WebSocketServer } from "ws";

import { mcpConfig } from "@/config/mcp.config";
import { Context } from "@/context";
import type { Resource } from "@/resources/resource";
import type { Tool } from "@/tools/tool";
import { createWebSocketServer } from "@/ws";

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
      wss = await createWebSocketServer();
      wss.on("connection", (websocket) => {
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
    const tool = tools.find((tool) => tool.schema.name === request.params.name);
    if (!tool) {
      return {
        content: [
          { type: "text", text: `Tool "${request.params.name}" not found` },
        ],
        isError: true,
      };
    }

    if (transportStartupError && !context.hasWs()) {
      return {
        content: [
          {
            type: "text",
            text: `Browser transport unavailable: ${formatTransportStartupError(transportStartupError)} Close other Browser MCP sessions using this port, then restart this MCP process.`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await tool.handle(context, request.params.arguments);
      return result;
    } catch (error) {
      // Include errorCode if available from CodedError
      const errorCode = (error as Error & { errorCode?: string }).errorCode;
      const errorMessage = String(error);

      return {
        content: [
          {
            type: "text",
            text: errorCode ? `[${errorCode}] ${errorMessage}` : errorMessage,
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
