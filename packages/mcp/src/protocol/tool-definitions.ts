import { z } from "zod";

/**
 * Tool argument schemas for MCP browser automation tools
 * These Zod schemas define the shape of tool inputs and provide
 * TypeScript types for type-safe tool implementations.
 */

// Navigate tool - navigate to a URL
export const NavigateTool = z.object({
  name: z.literal("navigate"),
  description: z.literal("Navigate to a URL in the browser"),
  arguments: z.object({
    url: z.string().describe("The URL to navigate to"),
  }),
});

export type NavigateTool = z.infer<typeof NavigateTool>;

// JoinSession tool - request operator approval and create session route
const SessionLeaseKind = z.enum(["workspace", "takeover"]);

/**
 * IMPORTANT: Do not remove this note.
 *
 * These Zod tool definitions are the runtime validation layer, not the final MCP
 * input schema contract. Some MCP clients in our stack mis-handle richer JSON
 * Schema features produced by zod-to-json-schema for conditional or union-shaped
 * inputs.
 *
 * When that happens, keep the Zod schema here for parsing/validation and point the
 * exported tool at a hand-written flat JSON schema in packages/mcp/src/tools.
 * Current examples:
 * - join_session → packages/mcp/src/tools/common.ts (joinSessionInputSchema)
 * - wait_for → packages/mcp/src/tools/common.ts (waitForInputSchema)
 */

const joinSessionUrl = z.preprocess(
  (value) => {
    if (value === null || value === "") {
      return undefined;
    }

    return value;
  },
  z.string().min(1).optional(),
);

export const JoinSessionTool = z.object({
  name: z.literal("join_session"),
  description: z.literal(
    "Request an operator-approved browser session. Use workspace with a URL for browsing/search jobs, or takeover without a URL to help in the user's currently focused tab. Blocks until approved or rejected. Clients should use a timeout of at least 5 minutes for this tool call.",
  ),
  arguments: z
    .object({
      name: z.string().min(1).describe("Human-friendly name for this session"),
      reason: z.string().min(1).describe("Why this session needs browser access"),
      leaseKind: SessionLeaseKind.describe(
        "workspace opens a new PartyBrowser-owned window at url; takeover borrows the user's currently focused tab when they approve",
      ),
      url: joinSessionUrl.describe(
        "Required for leaseKind=workspace; omit for leaseKind=takeover. Compatibility callers may pass null or an empty string for takeover.",
      ),
    })
    .superRefine((value, ctx) => {
      if (value.leaseKind === "workspace" && !value.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "workspace sessions require url",
          path: ["url"],
        });
      }

      if (value.leaseKind === "takeover" && value.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "takeover sessions must omit url",
          path: ["url"],
        });
      }
    }),
});

export type JoinSessionTool = z.infer<typeof JoinSessionTool>;

// GoBack tool - navigate back in browser history
export const GoBackTool = z.object({
  name: z.literal("go_back"),
  description: z.literal("Go back to the previous page"),
  arguments: z.object({}),
});

export type GoBackTool = z.infer<typeof GoBackTool>;

// GoForward tool - navigate forward in browser history
export const GoForwardTool = z.object({
  name: z.literal("go_forward"),
  description: z.literal("Go forward to the next page"),
  arguments: z.object({}),
});

export type GoForwardTool = z.infer<typeof GoForwardTool>;

// PressKey tool - press a keyboard key
export const PressKeyTool = z.object({
  name: z.literal("press_key"),
  description: z.literal("Press a key on the keyboard"),
  arguments: z.object({
    key: z.string().describe("The key to press (e.g., 'Enter', 'Tab', 'a')"),
  }),
});

export type PressKeyTool = z.infer<typeof PressKeyTool>;

// Wait tool - wait for a specified duration
export const WaitTool = z.object({
  name: z.literal("wait"),
  description: z.literal("Wait for a specified amount of time"),
  arguments: z.object({
    time: z.number().describe("Time to wait in seconds"),
  }),
});

export type WaitTool = z.infer<typeof WaitTool>;

// Snapshot tool - capture accessibility snapshot of current page
export const SnapshotTool = z.object({
  name: z.literal("snapshot"),
  description: z.literal("Get an accessibility snapshot of the current page"),
  arguments: z.object({}),
});

export type SnapshotTool = z.infer<typeof SnapshotTool>;

// Click tool - click on an element
export const ClickTool = z.object({
  name: z.literal("click"),
  description: z.literal("Click on an element by its ref"),
  arguments: z.object({
    element: z.string().describe("The ref of the element to click"),
  }),
});

export type ClickTool = z.infer<typeof ClickTool>;

// Drag tool - drag an element to another element
export const DragTool = z.object({
  name: z.literal("drag"),
  description: z.literal("Drag an element to another element"),
  arguments: z.object({
    startElement: z.string().describe("The ref of the element to drag"),
    endElement: z.string().describe("The ref of the element to drag to"),
  }),
});

export type DragTool = z.infer<typeof DragTool>;

// Hover tool - hover over an element
export const HoverTool = z.object({
  name: z.literal("hover"),
  description: z.literal("Hover over an element by its ref"),
  arguments: z.object({
    element: z.string().describe("The ref of the element to hover over"),
  }),
});

export type HoverTool = z.infer<typeof HoverTool>;

// Type tool - type text into an element
export const TypeTool = z.object({
  name: z.literal("type"),
  description: z.literal("Type text into an element"),
  arguments: z.object({
    element: z.string().describe("The ref of the element to type into"),
    text: z.string().describe("The text to type"),
  }),
});

export type TypeTool = z.infer<typeof TypeTool>;

// SelectOption tool - select an option from a dropdown
export const SelectOptionTool = z.object({
  name: z.literal("select_option"),
  description: z.literal("Select an option from a dropdown"),
  arguments: z.object({
    element: z.string().describe("The ref of the select element"),
    value: z.string().describe("The value or label of the option to select"),
  }),
});

export type SelectOptionTool = z.infer<typeof SelectOptionTool>;

// Screenshot tool - capture screenshot of current page
export const ScreenshotTool = z.object({
  name: z.literal("screenshot"),
  description: z.literal("Take a screenshot of the current page"),
  arguments: z.object({}),
});

export type ScreenshotTool = z.infer<typeof ScreenshotTool>;

// WaitFor tool - deterministic wait with multiple condition modes
// IMPORTANT: Keep the note above in place. This discriminated union validates runtime
// input, but MCP tool registration must keep using the hand-written waitForInputSchema
// in packages/mcp/src/tools/common.ts.
export const WaitForTool = z.object({
  name: z.literal("wait_for"),
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
  name: z.literal("close"),
  description: z.literal("Close the active browser session and clean up resources"),
  arguments: z.object({}),
});

export type CloseTool = z.infer<typeof CloseTool>;

// Evaluate tool - execute JavaScript in browser context
export const EvaluateTool = z.object({
  name: z.literal("evaluate"),
  description: z.literal("Execute JavaScript as a function body in the browser context. An explicit return statement is required to return a value."),
  arguments: z.object({
    script: z.string().describe("JavaScript function body. Use an explicit return statement, for example: return document.title; Without return, the result is undefined."),
  }),
});

export type EvaluateTool = z.infer<typeof EvaluateTool>;

// NetworkRequests tool - get captured network requests for current session
export const NetworkRequestsTool = z.object({
  name: z.literal("network_requests"),
  description: z.literal(
    "Get network requests captured during the current browser session"
  ),
  arguments: z.object({
    filter: z
      .object({
        types: z
          .array(z.string())
          .optional()
          .describe("Filter by request types (e.g., 'main_frame', 'script', 'xmlhttprequest')"),
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

// NetworkRequestDetails tool - get complete captured data for one network request
export const NetworkRequestDetailsTool = z.object({
  name: z.literal("network_request_details"),
  description: z.literal(
    "Get headers, bodies, status, and other captured data for one network request"
  ),
  arguments: z.object({
    id: z
      .string()
      .min(1)
      .describe("Request identifier returned by network_requests"),
    encoding: z
      .string()
      .min(1)
      .default("utf-8")
      .describe("Text encoding used to decode request and response bodies"),
  }),
});

export type NetworkRequestDetailsTool = z.infer<typeof NetworkRequestDetailsTool>;

// ConsoleMessages tool - get captured console messages for current session
export const ConsoleMessagesTool = z.object({
  name: z.literal("console_messages"),
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
