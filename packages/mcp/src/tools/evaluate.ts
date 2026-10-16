import { createToolInputSchema } from "./tool";

import { MCP_ERROR_CODES } from "@/protocol/constants";
import { CodedError } from "@/protocol/ws-sender";
import { EvaluateTool } from "@/protocol/tool-definitions";

import type { Tool } from "./tool";

export const evaluate: Tool = {
  schema: {
    name: EvaluateTool.shape.name.value,
    description: EvaluateTool.shape.description.value,
    inputSchema: createToolInputSchema(EvaluateTool.shape.arguments),
  },
  handle: async (context, params, requestId) => {
    const { script } = EvaluateTool.shape.arguments.parse(params);
    const commandResult = await context.sendSocketMessage("evaluate", { script }, { requestId });
    const { success, value, error, errorCode } = unwrapEvaluateResult(commandResult);

    if (!success) {
      throw new CodedError(
        error || "Evaluation failed",
        errorCode || MCP_ERROR_CODES.INTERNAL_TOOL_ERROR,
      );
    }

    // Format result based on type for readable output
    let resultText: string;
    if (value === undefined) {
      resultText = "undefined";
    } else if (value === null) {
      resultText = "null";
    } else if (typeof value === "object") {
      resultText = JSON.stringify(value, null, 2);
    } else {
      resultText = String(value);
    }

    return {
      content: [{
        type: "text",
        text: `\`\`\`\n${resultText}\n\`\`\``,
      }],
    };
  },
};

type EvaluateCommandResultEnvelope = {
  success: boolean;
  data?: { result?: unknown };
  error?: string;
  errorCode?: string;
  stack?: string;
};

type UnwrappedEvaluateResult = {
  success: boolean;
  value: unknown;
  error?: string;
  errorCode?: string;
};

function unwrapEvaluateResult(payload: unknown): UnwrappedEvaluateResult {
  if (isEvaluateCommandResultEnvelope(payload)) {
    return {
      success: payload.success,
      value: payload.data?.result,
      error: payload.error,
      errorCode: payload.errorCode,
    };
  }

  return {
    success: true,
    value: payload,
  };
}

function isEvaluateCommandResultEnvelope(value: unknown): value is EvaluateCommandResultEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as EvaluateCommandResultEnvelope;
  if (typeof candidate.success !== "boolean") {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(candidate, "data")
    || Object.prototype.hasOwnProperty.call(candidate, "error")
    || Object.prototype.hasOwnProperty.call(candidate, "errorCode")
    || Object.prototype.hasOwnProperty.call(candidate, "stack")
  );
}
