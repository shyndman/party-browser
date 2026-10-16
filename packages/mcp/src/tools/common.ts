import { errorLog } from "@/utils/log";

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

import {
  captureAriaSnapshot,
  extractPageState,
  formatAriaSnapshot,
} from "@/utils/aria-snapshot";

import type { Tool, ToolFactory } from "./tool";
import { createToolInputSchema } from "./tool";

// Keep the hand-written MCP schema instead of converting JoinSessionTool.shape.arguments.
// The runtime validator lives in packages/mcp/src/protocol/tool-definitions.ts, but MCP clients in
// our stack need this flatter shape for join_session.
const joinSessionInputSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      minLength: 1,
      description: "Human-friendly name for this session",
    },
    reason: {
      type: "string",
      minLength: 1,
      description: "Why this session needs browser access",
    },
    leaseKind: {
      type: "string",
      enum: ["workspace", "takeover"],
      description:
        "workspace opens a new PartyBrowser-owned window at url; takeover borrows the user's currently focused tab when they approve",
    },
    url: {
      type: ["string", "null"],
      description:
        "Required for leaseKind=workspace. For takeover, omit it when possible; compatibility callers may pass null or an empty string.",
    },
  },
  required: ["name", "reason", "leaseKind"],
  additionalProperties: false,
} satisfies Tool["schema"]["inputSchema"];

export const joinSession: Tool = {
  schema: {
    name: JoinSessionTool.shape.name.value,
    description: JoinSessionTool.shape.description.value,
    inputSchema: joinSessionInputSchema,
  },
  handle: async (context, params, requestId) => {
    const request = JoinSessionTool.shape.arguments.parse(params);
    const sessionId = await context.joinSession(request);
    try {
      return await captureAriaSnapshot(context, `Session approved: ${sessionId}`, requestId);
    } catch (error) {
      errorLog(`[MCP] Initial snapshot failed after session approval (sessionId=${sessionId}):`, error);
      throw error;
    }
  },
};

export const navigate: ToolFactory = (snapshot) => ({
  schema: {
    name: NavigateTool.shape.name.value,
    description: NavigateTool.shape.description.value,
    inputSchema: createToolInputSchema(NavigateTool.shape.arguments),
  },
  handle: async (context, params, requestId) => {
    const { url } = NavigateTool.shape.arguments.parse(params);
    const result = await context.sendSocketMessage("navigate", { url }, { requestId });
    if (snapshot) {
      return formatAriaSnapshot(extractPageState(result));
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
    inputSchema: createToolInputSchema(GoBackTool.shape.arguments),
  },
  handle: async (context, _params, requestId) => {
    const result = await context.sendSocketMessage("go_back", {}, { requestId });
    if (snapshot) {
      return formatAriaSnapshot(extractPageState(result));
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
    inputSchema: createToolInputSchema(GoForwardTool.shape.arguments),
  },
  handle: async (context, _params, requestId) => {
    const result = await context.sendSocketMessage("go_forward", {}, { requestId });
    if (snapshot) {
      return formatAriaSnapshot(extractPageState(result));
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
    inputSchema: createToolInputSchema(WaitTool.shape.arguments),
  },
  handle: async (context, params, requestId) => {
    const { time } = WaitTool.shape.arguments.parse(params);
    await context.sendSocketMessage("wait", { time }, { requestId });
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
    inputSchema: createToolInputSchema(PressKeyTool.shape.arguments),
  },
  handle: async (context, params, requestId) => {
    const { key } = PressKeyTool.shape.arguments.parse(params);
    await context.sendSocketMessage("press_key", { key }, { requestId });
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
// Do not convert WaitForTool.shape.arguments. Keep the runtime validator
// in packages/mcp/src/protocol/tool-definitions.ts and this flatter MCP-facing schema here.
const waitForInputSchema = {
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["time", "text", "text_gone"],
      description: "Wait mode: fixed time, text appears, or text disappears",
    },
    value: {
      type: ["number", "string"],
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
} satisfies Tool["schema"]["inputSchema"];

export const waitFor: Tool = {
  schema: {
    name: WaitForTool.shape.name.value,
    description: WaitForTool.shape.description.value,
    inputSchema: waitForInputSchema,
  },
  handle: async (context, params, requestId) => {
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
      await context.sendSocketMessage("wait_for", { mode, value, timeout }, { requestId });
    } else if (mode === "text") {
      await context.sendSocketMessage("wait_for", { mode, value, timeout }, { requestId });
    } else {
      await context.sendSocketMessage("wait_for", { mode, value, timeout }, { requestId });
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
    inputSchema: createToolInputSchema(CloseTool.shape.arguments),
  },
  handle: async (context, _params, requestId) => {
    await context.sendSocketMessage("close", {}, { requestId });
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
