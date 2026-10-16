import type {
  ImageContent,
  TextContent,
  Tool as McpTool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { Context } from "@/context";

export type ToolSchema = {
  name: string;
  description: string;
  inputSchema: McpTool["inputSchema"];
};

export type ToolResult = {
  content: (ImageContent | TextContent)[];
  isError?: boolean;
};

export type Tool = {
  schema: ToolSchema;
  handle: (
    context: Context,
    params?: Record<string, any>,
    requestId?: string,
  ) => Promise<ToolResult>;
};

export type ToolFactory = (snapshot: boolean) => Tool;

export function createToolInputSchema(schema: z.ZodObject): ToolSchema["inputSchema"] {
  // These Zod object schemas emit object-valued properties, as the MCP SDK requires.
  const inputSchema = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema instanceof z.ZodObject) {
        jsonSchema.additionalProperties = false;
      }
    },
  }) as ToolSchema["inputSchema"];
  return inputSchema;
}
