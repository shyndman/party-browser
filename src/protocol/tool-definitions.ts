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
