import { z } from "zod";

/**
 * Tool argument schemas for MCP browser automation tools
 * These Zod schemas define the shape of tool inputs and provide
 * TypeScript types for type-safe tool implementations.
 */

// Navigate tool - navigate to a URL
export const NavigateTool = z.object({
  name: z.literal("browser_navigate"),
  description: z.literal("Navigate to a URL in the browser"),
  arguments: z.object({
    url: z.string().describe("The URL to navigate to"),
  }),
});

export type NavigateTool = z.infer<typeof NavigateTool>;

// GoBack tool - navigate back in browser history
export const GoBackTool = z.object({
  name: z.literal("browser_go_back"),
  description: z.literal("Go back to the previous page"),
  arguments: z.object({}),
});

export type GoBackTool = z.infer<typeof GoBackTool>;

// GoForward tool - navigate forward in browser history
export const GoForwardTool = z.object({
  name: z.literal("browser_go_forward"),
  description: z.literal("Go forward to the next page"),
  arguments: z.object({}),
});

export type GoForwardTool = z.infer<typeof GoForwardTool>;

// PressKey tool - press a keyboard key
export const PressKeyTool = z.object({
  name: z.literal("browser_press_key"),
  description: z.literal("Press a key on the keyboard"),
  arguments: z.object({
    key: z.string().describe("The key to press (e.g., 'Enter', 'Tab', 'a')"),
  }),
});

export type PressKeyTool = z.infer<typeof PressKeyTool>;

// Wait tool - wait for a specified duration
export const WaitTool = z.object({
  name: z.literal("browser_wait"),
  description: z.literal("Wait for a specified amount of time"),
  arguments: z.object({
    time: z.number().describe("Time to wait in seconds"),
  }),
});

export type WaitTool = z.infer<typeof WaitTool>;

// Snapshot tool - capture accessibility snapshot of current page
export const SnapshotTool = z.object({
  name: z.literal("browser_snapshot"),
  description: z.literal("Get an accessibility snapshot of the current page"),
  arguments: z.object({}),
});

export type SnapshotTool = z.infer<typeof SnapshotTool>;

// Click tool - click on an element
export const ClickTool = z.object({
  name: z.literal("browser_click"),
  description: z.literal("Click on an element by its ref"),
  arguments: z.object({
    element: z.string().describe("The ref of the element to click"),
  }),
});

export type ClickTool = z.infer<typeof ClickTool>;

// Drag tool - drag an element to another element
export const DragTool = z.object({
  name: z.literal("browser_drag"),
  description: z.literal("Drag an element to another element"),
  arguments: z.object({
    startElement: z.string().describe("The ref of the element to drag"),
    endElement: z.string().describe("The ref of the element to drag to"),
  }),
});

export type DragTool = z.infer<typeof DragTool>;

// Hover tool - hover over an element
export const HoverTool = z.object({
  name: z.literal("browser_hover"),
  description: z.literal("Hover over an element by its ref"),
  arguments: z.object({
    element: z.string().describe("The ref of the element to hover over"),
  }),
});

export type HoverTool = z.infer<typeof HoverTool>;

// Type tool - type text into an element
export const TypeTool = z.object({
  name: z.literal("browser_type"),
  description: z.literal("Type text into an element"),
  arguments: z.object({
    element: z.string().describe("The ref of the element to type into"),
    text: z.string().describe("The text to type"),
  }),
});

export type TypeTool = z.infer<typeof TypeTool>;

// SelectOption tool - select an option from a dropdown
export const SelectOptionTool = z.object({
  name: z.literal("browser_select_option"),
  description: z.literal("Select an option from a dropdown"),
  arguments: z.object({
    element: z.string().describe("The ref of the select element"),
    option: z.string().describe("The value or label of the option to select"),
  }),
});

export type SelectOptionTool = z.infer<typeof SelectOptionTool>;

// GetConsoleLogs tool - retrieve browser console logs
export const GetConsoleLogsTool = z.object({
  name: z.literal("browser_get_console_logs"),
  description: z.literal("Get console logs from the browser"),
  arguments: z.object({}),
});

export type GetConsoleLogsTool = z.infer<typeof GetConsoleLogsTool>;

// Screenshot tool - capture screenshot of current page
export const ScreenshotTool = z.object({
  name: z.literal("browser_screenshot"),
  description: z.literal("Take a screenshot of the current page"),
  arguments: z.object({}),
});

export type ScreenshotTool = z.infer<typeof ScreenshotTool>;

// WaitFor tool - deterministic wait with multiple condition modes
export const WaitForTool = z.object({
  name: z.literal("browser_wait_for"),
  description: z.literal(
    "Wait for a condition to be met: time duration, text to appear, or text to disappear"
  ),
  arguments: z.discriminatedUnion("mode", [
    // Time-based wait
    z.object({
      mode: z.literal("time"),
      value: z.number().describe("Time to wait in seconds"),
      timeout: z.number().optional().describe("Maximum wait time in seconds (defaults to value)"),
    }),
    // Text appearance wait
    z.object({
      mode: z.literal("text"),
      value: z.string().describe("Text to wait for (appears in page content)"),
      timeout: z.number().describe("Maximum wait time in seconds"),
    }),
    // Text disappearance wait
    z.object({
      mode: z.literal("text_gone"),
      value: z.string().describe("Text to wait for (disappears from page content)"),
      timeout: z.number().describe("Maximum wait time in seconds"),
    }),
  ]),
});

export type WaitForTool = z.infer<typeof WaitForTool>;

// Close tool - close the browser session
export const CloseTool = z.object({
  name: z.literal("browser_close"),
  description: z.literal("Close the active browser session and clean up resources"),
  arguments: z.object({}),
});

export type CloseTool = z.infer<typeof CloseTool>;

// Evaluate tool - execute JavaScript in browser context
export const EvaluateTool = z.object({
  name: z.literal("browser_evaluate"),
  description: z.literal("Evaluate JavaScript in the browser context and return the result"),
  arguments: z.object({
    script: z.string().describe("JavaScript code to execute in the browser context"),
  }),
});

export type EvaluateTool = z.infer<typeof EvaluateTool>;

// NetworkRequests tool - get captured network requests for current session
export const NetworkRequestsTool = z.object({
  name: z.literal("browser_network_requests"),
  description: z.literal(
    "Get network requests captured during the current browser session"
  ),
  arguments: z.object({
    filter: z
      .object({
        types: z
          .array(z.string())
          .optional()
          .describe("Filter by request types (e.g., 'main_frame', 'script', 'xhr')"),
        urlPattern: z
          .string()
          .optional()
          .describe("Filter URLs containing this substring"),
      })
      .optional()
      .describe("Optional filters for network requests"),
  }),
});

export type NetworkRequestsTool = z.infer<typeof NetworkRequestsTool>;

// ConsoleMessages tool - get captured console messages for current session
export const ConsoleMessagesTool = z.object({
  name: z.literal("browser_console_messages"),
  description: z.literal(
    "Get console messages captured during the current browser session"
  ),
  arguments: z.object({
    level: z
      .enum(["all", "log", "warn", "error"])
      .optional()
      .describe("Filter by log level (default: 'all')"),
    since: z
      .number()
      .optional()
      .describe("Only return logs after this timestamp (Unix ms)"),
  }),
});

export type ConsoleMessagesTool = z.infer<typeof ConsoleMessagesTool>;

// ExportSelectors tool - export discovered selectors as JSON artifact
export const ExportSelectorsTool = z.object({
  name: z.literal("browser_export_selectors"),
  description: z.literal(
    "Export discovered selectors as a JSON artifact for downstream procedural scraping"
  ),
  arguments: z.object({
    name: z.string().describe("Name/title for the workflow"),
    steps: z
      .array(
        z.object({
          action: z
            .enum(["navigate", "click", "type", "select", "wait", "extract"])
            .describe("Type of action to perform"),
          target: z
            .string()
            .optional()
            .describe("Target selector (for click, type, select, extract)"),
          value: z
            .string()
            .optional()
            .describe("Value to type or select (for type, select actions)"),
          description: z
            .string()
            .optional()
            .describe("Human-readable description of this step"),
        })
      )
      .describe("Array of workflow steps"),
    includeMetadata: z
      .boolean()
      .optional()
      .describe("Include session metadata (default: true)"),
    includeConsole: z
      .boolean()
      .optional()
      .describe("Include recent console logs (default: false)"),
    includeNetwork: z
      .boolean()
      .optional()
      .describe("Include recent network requests (default: false)"),
  }),
});

export type ExportSelectorsTool = z.infer<typeof ExportSelectorsTool>;
