import { zodToJsonSchema } from "zod-to-json-schema";

import {
  CloseTool,
  GoBackTool,
  GoForwardTool,
  JoinSessionTool,
  NavigateTool,
  PressKeyTool,
  WaitForTool,
  WaitTool,
} from "@/protocol/tool-definitions";

import { captureAriaSnapshot } from "@/utils/aria-snapshot";

import type { Tool, ToolFactory } from "./tool";

export const joinSession: Tool = {
  schema: {
    name: JoinSessionTool.shape.name.value,
    description: JoinSessionTool.shape.description.value,
    inputSchema: zodToJsonSchema(JoinSessionTool.shape.arguments),
  },
  handle: async (context, params) => {
    const request = JoinSessionTool.shape.arguments.parse(params);
    const sessionId = await context.joinSession(request);
    return {
      content: [
        {
          type: "text",
          text: `Session approved: ${sessionId}`,
        },
      ],
    };
  },
};

export const navigate: ToolFactory = (snapshot) => ({
  schema: {
    name: NavigateTool.shape.name.value,
    description: NavigateTool.shape.description.value,
    inputSchema: zodToJsonSchema(NavigateTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { url } = NavigateTool.shape.arguments.parse(params);
    await context.sendSocketMessage("navigate", { url });
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
    await context.sendSocketMessage("go_back", {});
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
    await context.sendSocketMessage("go_forward", {});
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
    await context.sendSocketMessage("wait", { time });
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
    await context.sendSocketMessage("press_key", { key });
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

// Unified schema for wait_for - compatible with strict MCP validators
// Uses consistent field structure across all modes with runtime validation
const waitForInputSchema = {
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["time", "text", "text_gone"],
      description: "Wait mode: fixed time, text appears, or text disappears",
    },
    value: {
      description:
        "For mode=time use a number (seconds). For text/text_gone use the text string.",
    },
    timeout: {
      type: "number",
      description:
        "Maximum wait time in seconds. Optional for mode=time (defaults to value). Required for text/text_gone modes.",
    },
  },
  required: ["mode", "value"],
  additionalProperties: false,
} as const;

export const waitFor: Tool = {
  schema: {
    name: WaitForTool.shape.name.value,
    description: WaitForTool.shape.description.value,
    inputSchema: waitForInputSchema,
  },
  handle: async (context, params) => {
    const args = WaitForTool.shape.arguments.parse(params);
    const { mode, value, timeout } = args;

    // Runtime validation for mode-specific requirements
    if (mode === "time") {
      if (typeof value !== "number") {
        throw new Error(`Invalid value type for mode=time: expected number, got ${typeof value}`);
      }
    } else {
      // text or text_gone mode
      if (typeof value !== "string") {
        throw new Error(`Invalid value type for mode=${mode}: expected string, got ${typeof value}`);
      }
      if (timeout === undefined) {
        throw new Error(`timeout is required for mode=${mode}`);
      }
    }

    if (mode === "time") {
      await context.sendSocketMessage("wait_for", { mode, value, timeout });
    } else if (mode === "text") {
      await context.sendSocketMessage("wait_for", { mode, value, timeout });
    } else {
      await context.sendSocketMessage("wait_for", { mode, value, timeout });
    }

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
    await context.sendSocketMessage("close", {});
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
