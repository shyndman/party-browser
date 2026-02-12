import { zodToJsonSchema } from "zod-to-json-schema";

import { EvaluateTool } from "@/protocol/tool-definitions";

import type { Tool } from "./tool";

export const evaluate: Tool = {
  schema: {
    name: EvaluateTool.shape.name.value,
    description: EvaluateTool.shape.description.value,
    inputSchema: zodToJsonSchema(EvaluateTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { script } = EvaluateTool.shape.arguments.parse(params);
    const result = await context.sendSocketMessage("evaluate", { script });

    // Format result based on type for readable output
    let resultText: string;
    if (result === undefined) {
      resultText = "undefined";
    } else if (result === null) {
      resultText = "null";
    } else if (typeof result === "object") {
      resultText = JSON.stringify(result, null, 2);
    } else {
      resultText = String(result);
    }

    return {
      content: [{
        type: "text",
        text: `\`\`\`\n${resultText}\n\`\`\``,
      }],
    };
  },
};
