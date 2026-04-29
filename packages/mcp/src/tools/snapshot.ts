import zodToJsonSchema from "zod-to-json-schema";

import {
  ClickTool,
  DragTool,
  HoverTool,
  SelectOptionTool,
  SnapshotTool,
  TypeTool,
} from "@/protocol/tool-definitions";

import type { Context } from "@/context";
import {
  captureAriaSnapshot,
  extractPageState,
  formatAriaSnapshot,
} from "@/utils/aria-snapshot";

import type { Tool } from "./tool";

export const snapshot: Tool = {
  schema: {
    name: SnapshotTool.shape.name.value,
    description: SnapshotTool.shape.description.value,
    inputSchema: zodToJsonSchema(SnapshotTool.shape.arguments),
  },
  handle: async (context: Context, _params, requestId) => {
    return await captureAriaSnapshot(context, "", requestId);
  },
};

export const click: Tool = {
  schema: {
    name: ClickTool.shape.name.value,
    description: ClickTool.shape.description.value,
    inputSchema: zodToJsonSchema(ClickTool.shape.arguments),
  },
  handle: async (context: Context, params, requestId) => {
    const validatedParams = ClickTool.shape.arguments.parse(params);
    const result = await context.sendSocketMessage("click", validatedParams, { requestId });
    return formatAriaSnapshot(extractPageState(result), `Clicked "${validatedParams.element}"`);
  },
};

export const drag: Tool = {
  schema: {
    name: DragTool.shape.name.value,
    description: DragTool.shape.description.value,
    inputSchema: zodToJsonSchema(DragTool.shape.arguments),
  },
  handle: async (context: Context, params, requestId) => {
    const validatedParams = DragTool.shape.arguments.parse(params);
    const result = await context.sendSocketMessage("drag", validatedParams, { requestId });
    return formatAriaSnapshot(
      extractPageState(result),
      `Dragged "${validatedParams.startElement}" to "${validatedParams.endElement}"`,
    );
  },
};

export const hover: Tool = {
  schema: {
    name: HoverTool.shape.name.value,
    description: HoverTool.shape.description.value,
    inputSchema: zodToJsonSchema(HoverTool.shape.arguments),
  },
  handle: async (context: Context, params, requestId) => {
    const validatedParams = HoverTool.shape.arguments.parse(params);
    const result = await context.sendSocketMessage("hover", validatedParams, { requestId });
    return formatAriaSnapshot(extractPageState(result), `Hovered over "${validatedParams.element}"`);
  },
};

export const type: Tool = {
  schema: {
    name: TypeTool.shape.name.value,
    description: TypeTool.shape.description.value,
    inputSchema: zodToJsonSchema(TypeTool.shape.arguments),
  },
  handle: async (context: Context, params, requestId) => {
    const validatedParams = TypeTool.shape.arguments.parse(params);
    const result = await context.sendSocketMessage("type", validatedParams, { requestId });
    return formatAriaSnapshot(
      extractPageState(result),
      `Typed "${validatedParams.text}" into "${validatedParams.element}"`,
    );
  },
};

export const selectOption: Tool = {
  schema: {
    name: SelectOptionTool.shape.name.value,
    description: SelectOptionTool.shape.description.value,
    inputSchema: zodToJsonSchema(SelectOptionTool.shape.arguments),
  },
  handle: async (context: Context, params, requestId) => {
    const validatedParams = SelectOptionTool.shape.arguments.parse(params);
    const result = await context.sendSocketMessage("select_option", validatedParams, { requestId });
    return formatAriaSnapshot(
      extractPageState(result),
      `Selected option in "${validatedParams.element}"`,
    );
  },
};
