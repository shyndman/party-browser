import { zodToJsonSchema } from "zod-to-json-schema";

import { ExportSelectorsTool } from "@/protocol/tool-definitions";
import type { SelectorArtifact, AnyStep } from "@/types/artifact";

import { Tool } from "./tool";

/**
 * Export discovered selectors as a JSON artifact for downstream scraping.
 * 
 * This tool packages workflow steps into a machine-readable format that can be
 * executed by procedural scrapers without LLM involvement.
 */
export const exportSelectors: Tool = {
  schema: {
    name: ExportSelectorsTool.shape.name.value,
    description: ExportSelectorsTool.shape.description.value,
    inputSchema: zodToJsonSchema(ExportSelectorsTool.shape.arguments),
  },
  handle: async (context, params) => {
    try {
      // Validate params exist
      if (!params) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Missing required parameters for export_selectors",
            },
          ],
          isError: true,
        };
      }

      const { name, steps, includeMetadata, includeConsole, includeNetwork } =
        params as {
          name: string;
          steps: Array<{
            action: string;
            target?: string;
            value?: string;
            description?: string;
          }>;
          includeMetadata?: boolean;
          includeConsole?: boolean;
          includeNetwork?: boolean;
        };

      // Validate required fields
      if (!name || typeof name !== "string") {
        return {
          content: [
            {
              type: "text",
              text: "Error: 'name' parameter is required and must be a string",
            },
          ],
          isError: true,
        };
      }

      if (!Array.isArray(steps)) {
        return {
          content: [
            {
              type: "text",
              text: "Error: 'steps' parameter is required and must be an array",
            },
          ],
          isError: true,
        };
      }

      // Validate step actions
      const validActions = [
        "navigate",
        "click",
        "type",
        "select",
        "wait",
        "extract",
      ];
      const invalidSteps = steps.filter(
        (step) => !validActions.includes(step.action)
      );
      if (invalidSteps.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Invalid action types in steps: ${invalidSteps
                .map((s) => s.action)
                .join(", ")}. Valid actions: ${validActions.join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // Call extension to generate artifact
      // Cast steps to proper type - validation already done above
      const response = await context.sendSocketMessage(
        "browser_export_selectors",
        {
          name,
          steps: steps as Array<{
            action: "navigate" | "click" | "type" | "select" | "wait" | "extract";
            target?: string;
            value?: string;
            description?: string;
          }>,
          includeMetadata: includeMetadata ?? true,
          includeConsole: includeConsole ?? false,
          includeNetwork: includeNetwork ?? false,
        }
      );

      if (!response.success) {
        return {
          content: [
            {
              type: "text",
              text: `Export failed: ${response.error || "Unknown error"}${
                response.errorCode ? ` [${response.errorCode}]` : ""
              }`,
            },
          ],
          isError: true,
        };
      }

      const artifact = response.artifact as SelectorArtifact;

      // Format JSON with indentation for readability
      const json = JSON.stringify(artifact, null, 2);

      // Build summary
      const summary = [
        `✅ Exported workflow: **${artifact.title}**`,
        "",
        "**Artifact Details:**",
        `- Version: ${artifact.version}`,
        `- Session ID: \`${artifact.sessionId}\``,
        `- Created: ${artifact.createdAt}`,
        `- Steps: ${artifact.steps.length}`,
        "",
        "**Steps:**",
        ...artifact.steps.map(
          (step: AnyStep, i: number) =>
            `${i + 1}. ${step.type}${
              step.description ? ` - ${step.description}` : ""
            }`
        ),
        "",
        "**Metadata:**",
        `- Network requests: ${artifact.metadata.networkRequestCount}`,
        `- Console errors: ${artifact.metadata.consoleErrorCount}`,
        `- Console warnings: ${artifact.metadata.consoleWarnCount}`,
        `- Session duration: ${artifact.metadata.sessionDuration}ms`,
      ];

      if (artifact.console) {
        summary.push(
          "",
          `**Console Logs:** ${artifact.console.length} entries included`
        );
      }

      if (artifact.network) {
        summary.push(
          "",
          `**Network Requests:** ${artifact.network.length} entries included`
        );
      }

      summary.push(
        "",
        "**JSON Output:**",
        "```json",
        json,
        "```"
      );

      return {
        content: [
          {
            type: "text",
            text: summary.join("\n"),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Export selectors failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  },
};
