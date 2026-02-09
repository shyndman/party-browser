import { zodToJsonSchema } from "zod-to-json-schema";

import {
  CloseTool,
  GoBackTool,
  GoForwardTool,
  NavigateTool,
  PressKeyTool,
  WaitForTool,
  WaitTool,
} from "@/protocol/tool-definitions";

import { captureAriaSnapshot } from "@/utils/aria-snapshot";

import type { Tool, ToolFactory } from "./tool";

export const navigate: ToolFactory = (snapshot) => ({
  schema: {
    name: NavigateTool.shape.name.value,
    description: NavigateTool.shape.description.value,
    inputSchema: zodToJsonSchema(NavigateTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { url } = NavigateTool.shape.arguments.parse(params);
    await context.sendSocketMessage("browser_navigate", { url });
    if (snapshot) {
      return captureAriaSnapshot(context);
    }
    return {
      content: [
        {
          type: "text",
          text: `Navigated to ${url}`,
        },
      ],
    };
  },
});

export const goBack: ToolFactory = (snapshot) => ({
  schema: {
    name: GoBackTool.shape.name.value,
    description: GoBackTool.shape.description.value,
    inputSchema: zodToJsonSchema(GoBackTool.shape.arguments),
  },
  handle: async (context) => {
    await context.sendSocketMessage("browser_go_back", {});
    if (snapshot) {
      return captureAriaSnapshot(context);
    }
    return {
      content: [
        {
          type: "text",
          text: "Navigated back",
        },
      ],
    };
  },
});

export const goForward: ToolFactory = (snapshot) => ({
  schema: {
    name: GoForwardTool.shape.name.value,
    description: GoForwardTool.shape.description.value,
    inputSchema: zodToJsonSchema(GoForwardTool.shape.arguments),
  },
  handle: async (context) => {
    await context.sendSocketMessage("browser_go_forward", {});
    if (snapshot) {
      return captureAriaSnapshot(context);
    }
    return {
      content: [
        {
          type: "text",
          text: "Navigated forward",
        },
      ],
    };
  },
});

export const wait: Tool = {
  schema: {
    name: WaitTool.shape.name.value,
    description: WaitTool.shape.description.value,
    inputSchema: zodToJsonSchema(WaitTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { time } = WaitTool.shape.arguments.parse(params);
    await context.sendSocketMessage("browser_wait", { time });
    return {
      content: [
        {
          type: "text",
          text: `Waited for ${time} seconds`,
        },
      ],
    };
  },
};

export const pressKey: Tool = {
  schema: {
    name: PressKeyTool.shape.name.value,
    description: PressKeyTool.shape.description.value,
    inputSchema: zodToJsonSchema(PressKeyTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { key } = PressKeyTool.shape.arguments.parse(params);
    await context.sendSocketMessage("browser_press_key", { key });
    return {
      content: [
        {
          type: "text",
          text: `Pressed key ${key}`,
        },
      ],
    };
  },
};

export const waitFor: Tool = {
  schema: {
    name: WaitForTool.shape.name.value,
    description: WaitForTool.shape.description.value,
    inputSchema: zodToJsonSchema(WaitForTool.shape.arguments),
  },
  handle: async (context, params) => {
    const args = WaitForTool.shape.arguments.parse(params);
    const { mode, value, timeout } = args;

    await context.sendSocketMessage("browser_wait_for", { mode, value, timeout } as any);

    // Generate deterministic, parseable response based on mode
    let resultText: string;
    switch (mode) {
      case "time":
        resultText = `Waited for ${value} seconds`;
        break;
      case "text":
        resultText = `Waited for text to appear: "${value}"`;
        break;
      case "text_gone":
        resultText = `Waited for text to disappear: "${value}"`;
        break;
      default:
        resultText = `Waited for condition: ${mode}`;
    }

    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  },
};

export const close: Tool = {
  schema: {
    name: CloseTool.shape.name.value,
    description: CloseTool.shape.description.value,
    inputSchema: zodToJsonSchema(CloseTool.shape.arguments),
  },
  handle: async (context) => {
    await context.sendSocketMessage("browser_close", {});
    return {
      content: [
        {
          type: "text",
          text: "Browser session closed successfully",
        },
      ],
    };
  },
};
