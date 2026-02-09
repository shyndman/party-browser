# Phase 2: Interactive Selector Discovery - Research

**Researched:** 2026-02-09
**Domain:** MCP browser automation tools for interactive discovery and LLM-guided selector generation
**Confidence:** HIGH

## Summary

Phase 2 requires implementing the full interactive toolset for browser automation that enables users to perform complete discovery interactions and run LLM-guided passes yielding actionable selectors. The current codebase already has foundational patterns in place:

1. **WebSocket-based communication** via `Context.sendSocketMessage()` with typed message maps
2. **Zod schema definitions** in `src/protocol/tool-definitions.ts` for type-safe tool inputs
3. **Tool handler pattern** in `src/tools/` with `Tool` interface (`schema` + `handle`)
4. **Snapshot-based feedback** where interactive tools return updated page state

**Missing for Phase 2:**
- `browser_evaluate` tool for JavaScript execution (DISC-02)
- `browser_take_screenshot` implementation verification (DISC-05)
- LLM-guided selector generation workflow (FLOW-01)

The architecture leverages an **extension-based approach** where the browser extension handles actual DOM operations, while the MCP server acts as a protocol bridge. This is similar to how Playwright MCP operates with its extension mode.

**Primary recommendation:** Implement `browser_evaluate` as the core inspection primitive, ensure `browser_screenshot` returns proper base64-encoded PNG data, and design the LLM-guided workflow as a multi-step prompt chain that progressively narrows selector candidates.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.26.0` | MCP server implementation | Official SDK, stdio transport support |
| `zod` | `^3.24.x` | Runtime validation + type inference | Single source for validation and JSON schema |
| `zod-to-json-schema` | `^3.24.x` | Convert Zod to MCP-compatible JSON schema | Required by MCP tool registration |
| `ws` | `^8.18.1` | WebSocket client for extension communication | Existing transport, battle-tested |
| `typescript` | `^5.6.2` | Type safety | Already configured with path aliases |

### Architecture Alignment
The stack is already established in Phase 1. Phase 2 extends existing patterns without introducing new dependencies.

## Architecture Patterns

### Current Tool Pattern (from codebase analysis)

**Zod Schema Definition:**
```typescript
// src/protocol/tool-definitions.ts
export const EvaluateTool = z.object({
  name: z.literal("browser_evaluate"),
  description: z.literal("Evaluate JavaScript in the browser context"),
  arguments: z.object({
    script: z.string().describe("JavaScript code to execute"),
  }),
});
```

**WebSocket Message Type Extension:**
```typescript
// src/protocol/ws-messages.ts
export interface SocketMessageMap {
  // ...existing messages
  browser_evaluate: { script: string };
  browser_screenshot: Record<string, never>;
}
```

**Tool Handler Implementation:**
```typescript
// src/tools/evaluate.ts (new file)
export const evaluate: Tool = {
  schema: {
    name: EvaluateTool.shape.name.value,
    description: EvaluateTool.shape.description.value,
    inputSchema: zodToJsonSchema(EvaluateTool.shape.arguments),
  },
  handle: async (context, params) => {
    const { script } = EvaluateTool.shape.arguments.parse(params);
    const result = await context.sendSocketMessage("browser_evaluate", { script });
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
};
```

### Pattern 1: Snapshot-Aware Interactive Tools
**What:** Interactive tools (click, type, hover) return both status text AND updated page snapshot
**When to use:** All tools that modify page state
**Current implementation:**
```typescript
// From src/tools/snapshot.ts
export const click: Tool = {
  handle: async (context: Context, params) => {
    const validatedParams = ClickTool.shape.arguments.parse(params);
    await context.sendSocketMessage("browser_click", validatedParams);
    const snapshot = await captureAriaSnapshot(context);  // ← Returns updated state
    return {
      content: [
        { type: "text", text: `Clicked "${validatedParams.element}"` },
        ...snapshot.content,  // ← Include snapshot
      ],
    };
  },
};
```

### Pattern 2: Read-Only Tools
**What:** Tools that don't modify state return only their specific result (no snapshot)
**When to use:** Inspection tools like `browser_evaluate`, `browser_screenshot`
**Example:**
```typescript
export const evaluate: Tool = {
  handle: async (context, params) => {
    const result = await context.sendSocketMessage("browser_evaluate", { script });
    return {
      content: [{
        type: "text", 
        text: `Result:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
      }],
    };
  },
};
```

### Pattern 3: Screenshot as Image Content
**What:** Screenshots return MCP `image` content type with base64 data
**When to use:** `browser_screenshot` tool
**Implementation:**
```typescript
export const screenshot: Tool = {
  handle: async (context, _params) => {
    const screenshot = await context.sendSocketMessage("browser_screenshot", {});
    return {
      content: [{
        type: "image",
        data: screenshot,  // base64-encoded PNG
        mimeType: "image/png",
      }],
    };
  },
};
```

### Anti-Patterns to Avoid

| Anti-Pattern | Why Bad | What to Do Instead |
|--------------|---------|-------------------|
| Execute arbitrary user JavaScript without sandboxing | Security risk | Extension controls execution context, returns structured results |
| Screenshots as text (base64 in text field) | Violates MCP spec, can't display inline | Use `image` content type with proper mimeType |
| Eval returning raw DOM nodes | Not serializable, huge payload | Return JSON-serializable data structures |
| Mixing element refs in evaluate | Extension handles element resolution | Keep evaluate for page-level scripts only |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Element selector generation from scratch | Custom heuristic selector finder | LLM-guided workflow using snapshot + evaluate | LLMs excel at reasoning about DOM structure; custom heuristics break on modern SPAs |
| JavaScript execution engine | Eval-based code runner in MCP server | Extension-managed execution | Extension has access to actual page context, can handle CSP, frames, etc. |
| Screenshot capture | Custom image encoding | Extension's native screenshot API | Extension uses browser's native captureVisibleTab with proper scaling |
| Selector persistence | Custom format | JSON or YAML artifact format | Standard formats, tool-friendly |

**Key insight:** The extension handles the hard parts (CSP, cross-origin frames, shadow DOM). The MCP server should be a thin protocol adapter, not a browser automation engine.

## Common Pitfalls

### Pitfall 1: Eval Results Not Serializable
**What goes wrong:** `browser_evaluate` returns DOM nodes, circular references, or functions that can't be JSON-serialized
**Why it happens:** User-provided JavaScript returns arbitrary values
**How to avoid:** Extension serializes results with safe-stringify; MCP server documents requirement for JSON-serializable return values
**Warning signs:** `JSON.stringify` errors, missing results

### Pitfall 2: Screenshot Data Format Mismatch
**What goes wrong:** Extension returns raw bytes, but MCP expects base64 string; or wrong MIME type
**Why it happens:** Protocol mismatch between extension and MCP server
**How to avoid:** Extension base64-encodes before sending; MCP server documents expected format
**Warning signs:** Broken image previews in MCP clients

### Pitfall 3: LLM-Guided Workflow Without Structure
**What goes wrong:** LLM generates selectors that are too specific (break on site updates) or too generic (match wrong elements)
**Why it happens:** No structured prompting or validation
**How to avoid:** Multi-step workflow: (1) explore page, (2) identify target semantics, (3) generate candidate selectors, (4) validate candidates
**Warning signs:** Selectors work once but fail on re-runs

### Pitfall 4: Missing Timeout Handling in Long Evaluations
**What goes wrong:** JavaScript evaluation hangs indefinitely if script has infinite loop or awaits unresolved promise
**Why it happens:** No timeout in WebSocket message handler
**How to avoid:** Extension implements script timeout; MCP server documents max execution time
**Warning signs:** Tools hang without response

## Code Examples

### Evaluate Tool Implementation

**Tool Definition:**
```typescript
// src/protocol/tool-definitions.ts
export const EvaluateTool = z.object({
  name: z.literal("browser_evaluate"),
  description: z.literal("Evaluate JavaScript in the browser context and return the result"),
  arguments: z.object({
    script: z.string().describe("JavaScript code to execute in the browser context"),
  }),
});
```

**Handler:**
```typescript
// src/tools/evaluate.ts
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
    const result = await context.sendSocketMessage("browser_evaluate", { script });
    
    // Format result based on type
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
```

### Screenshot Tool (Verify Current Implementation)

The current implementation in `src/tools/custom.ts` appears correct:
```typescript
export const screenshot: Tool = {
  handle: async (context, _params) => {
    const screenshot = await context.sendSocketMessage("browser_screenshot", {});
    return {
      content: [{
        type: "image",
        data: screenshot,  // Expects base64 string
        mimeType: "image/png",
      }],
    };
  },
};
```

**Critical:** Verify the extension returns base64-encoded PNG data, not raw bytes or Data URL.

### LLM-Guided Selector Generation Workflow

This is a **prompt workflow**, not a single tool. The LLM uses existing tools iteratively:

```
Step 1: Discovery
├─ browser_navigate → Load target page
├─ browser_snapshot → Get accessibility tree
└─ browser_take_screenshot → Visual reference

Step 2: Inspection (if needed)
├─ browser_evaluate → Get element counts, check for shadow DOM
├─ browser_evaluate → Extract semantic landmarks
└─ browser_click → Navigate to specific section

Step 3: Selector Generation
├─ LLM analyzes snapshot + screenshot
├─ LLM generates candidate selectors with priorities:
│   1. Semantic (role, aria-label)
│   2. Test IDs (data-testid)
│   3. Stable attributes (id, name)
│   4. Structural (nth-child, CSS path)
└─ Output format:
    {
      "target": "Product price element",
      "candidates": [
        {"selector": "[data-testid='price']", "priority": 1, "reason": "test id"},
        {"selector": "span[class*='price']", "priority": 2, "reason": "class contains price"}
      ]
    }

Step 4: Validation
├─ browser_evaluate → document.querySelector(selector) !== null
└─ browser_click/type → Verify interaction works

Step 5: Output
└─ Persist validated selectors to artifact file
```

## State of the Art

### Current Approach (Playwright MCP as Reference)
| Feature | Playwright MCP Approach | Browser MCP Approach |
|---------|------------------------|---------------------|
| Element targeting | `ref` from accessibility snapshot | Same - `element` field with ref |
| JavaScript execution | `browser_evaluate` with function string | Same pattern |
| Screenshots | `browser_take_screenshot` with options | Basic implementation exists |
| Selector generation | LLM reasoning over accessibility tree | Planned for Phase 2 |

### Browser MCP vs Playwright MCP
| Aspect | Playwright MCP | Browser MCP |
|--------|---------------|-------------|
| Browser connection | Launches new browser or CDP | Connects to user's existing browser via extension |
| Authentication | Storage state files | Uses user's logged-in sessions |
| Detection | Fresh profile may trigger bot checks | User's real profile, lower detection risk |
| Isolation | Clean state per session | Shared with user's browsing |

## Recommended Implementation Order

### 1. Evaluate Tool (DISC-02)
**Files to modify/create:**
- `src/protocol/tool-definitions.ts` - Add `EvaluateTool` schema
- `src/protocol/ws-messages.ts` - Add `browser_evaluate` message type
- `src/tools/evaluate.ts` - Create tool handler
- `src/index.ts` - Register tool

**Extension contract:**
- Input: `{ script: string }`
- Output: `{ result: any }` where `result` is JSON-serializable
- Timeout: 30 seconds default
- Error handling: Return `{ error: string }` for execution errors

### 2. Screenshot Verification (DISC-05)
**Files to verify:**
- `src/tools/custom.ts` - Current `screenshot` tool (already implemented)

**Extension contract:**
- Input: `{}`
- Output: Base64-encoded PNG string
- Ensure proper MIME type in response

### 3. LLM-Guided Workflow Documentation (FLOW-01)
**Files to create:**
- `.planning/guides/selector-discovery-workflow.md` - Document the multi-step workflow
- Example prompts for each phase

**Key workflow phases:**
1. **Page exploration** - Navigate and snapshot
2. **Target identification** - LLM identifies what to extract
3. **Candidate generation** - LLM proposes selectors with rationale
4. **Validation** - Test selectors via evaluate/click
5. **Output** - Generate selector artifact

### 4. Tool Registration
**File:** `src/index.ts`

Update tool arrays:
```typescript
const customTools: Tool[] = [
  custom.getConsoleLogs, 
  custom.screenshot,
  evaluate,  // ← Add
];
```

## Extension Requirements

For the extension side (not in this repo but required for Phase 2):

| Tool | Extension Handler Required |
|------|---------------------------|
| `browser_evaluate` | Execute script in page context with timeout, serialize result |
| `browser_screenshot` | Use `chrome.tabs.captureVisibleTab()`, base64 encode |

## Open Questions

1. **Evaluate timeout handling**
   - What we know: Extension should implement script timeout
   - What's unclear: Whether to make timeout configurable via tool parameter
   - Recommendation: Start with fixed 30s timeout, add parameter if needed

2. **Screenshot options**
   - What we know: Basic screenshot tool exists
   - What's unclear: Whether full-page screenshot is needed (Playwright supports this)
   - Recommendation: Start with viewport screenshot only; full-page can be added later via `browser_evaluate` + scroll

3. **Selector artifact format**
   - What we know: Need to persist discovered selectors
   - What's unclear: Schema for the artifact file
   - Recommendation: JSON format with metadata:
     ```json
     {
       "url": "https://example.com",
       "discovered_at": "2026-02-09T...",
       "selectors": [
         {"name": "price", "selector": "...", "type": "css", "validated": true}
       ]
     }
     ```

## Sources

### Primary (HIGH confidence)
- Local codebase inspection (`src/tools/snapshot.ts`, `src/tools/custom.ts`, `src/protocol/ws-messages.ts`)
- Playwright MCP GitHub repository - reference implementation patterns
- MCP SDK documentation (Context7) - tool registration patterns

### Secondary (MEDIUM confidence)
- Web search: LLM-guided selector generation research (2025-2026 papers)
- Web search: MCP browser automation patterns (2025-2026 articles)

### Research Findings
- **Selector generation best practice:** LLM analyzes semantic structure, generates multiple candidates with priorities, validates iteratively
- **Screenshot pattern:** Return base64 PNG via MCP `image` content type
- **Evaluate pattern:** Execute in page context, serialize JSON result, handle errors gracefully

## Metadata

**Confidence breakdown:**
| Area | Level | Reason |
|------|-------|--------|
| Tool patterns | HIGH | Based on existing codebase and Playwright MCP reference |
| Architecture | HIGH | Current patterns are clear and well-established |
| LLM workflow | MEDIUM | Based on research, but requires practical validation |
| Extension contract | MEDIUM | Inferred from existing patterns, needs verification |

**Research date:** 2026-02-09
**Valid until:** 2026-03-11 (30 days for stable patterns)

**Dependencies on other phases:**
- Phase 1: Complete (runtime foundation)
- Phase 2: This research
- Phase 3: Network monitoring (DISC-03, DISC-04)
