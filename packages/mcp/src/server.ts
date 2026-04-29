import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@/session";
import type { Resource } from "@/resources/resource";
import type { Tool } from "@/tools/tool";
import { CodedError, generateRequestId } from "@/messaging";
import { MCP_ERROR_CODES } from "@/protocol/constants";
import { infoLog, errorLog } from "@/utils/log";

type Options = {
  name: string;
  version: string;
  tools: Tool[];
  resources: Resource[];
  context?: Context;
};

export async function createServerWithTools(options: Options): Promise<Server> {
  const { name, version, tools, resources } = options;
  const context = options.context ?? new Context();

  const server = new Server(
    { name, version },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: tools.map((tool) => tool.schema) };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resources.map((resource) => resource.schema) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const id = generateRequestId();
    infoLog(`[MCP] [${id}] → ${request.params.name}`, request.params.arguments);

    const tool = tools.find((tool) => tool.schema.name === request.params.name);
    if (!tool) {
      const error = new CodedError(
        `Tool "${request.params.name}" not found`,
        MCP_ERROR_CODES.TOOL_NOT_FOUND,
      );
      return {
        content: [
          { type: "text", text: `[${error.errorCode}] ${error.message}` },
        ],
        isError: true,
      };
    }

    try {
      const result = await tool.handle(context, request.params.arguments, id);
      infoLog(`[MCP] [${id}] ✓ ${request.params.name}`);
      return result;
    } catch (error) {
      // Include errorCode if available from CodedError, otherwise use INTERNAL_TOOL_ERROR fallback
      const errorCode = (error as Error & { errorCode?: string }).errorCode;
      const errorMessage = String(error);

      errorLog(`[MCP] [${id}] ✗ ${request.params.name}: [${errorCode || MCP_ERROR_CODES.INTERNAL_TOOL_ERROR}] ${errorMessage}`);

      return {
        content: [
          {
            type: "text",
            text: `[${errorCode || MCP_ERROR_CODES.INTERNAL_TOOL_ERROR}] ${errorMessage}`,
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
    await context.close();
  };

  return server;
}
