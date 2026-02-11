# Architecture Patterns

**Domain:** Browser Pre-Scraping MCP Server
**Researched:** February 2026
**Confidence:** HIGH

## Standard Architecture

### System Overview

MCP-style browser pre-scraping systems follow a layered architecture that separates the LLM-driven discovery phase from the procedural extraction phase. This separation is critical for reliability, maintainability, and scaling.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Host (LLM/Agent)                          │
│              ┌──────────────┐    ┌──────────────┐              │
│              │ Discovery    │    │ Extraction   │              │
│              │ Client       │    │ Client       │              │
│              └──────┬───────┘    └──────┬───────┘              │
├─────────────────────┴────────────────────┴──────────────────────┤
│                    MCP Server (browser-mcp)                      │
│  ┌─────────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Session Manager │  │ Page Controller │  │ Selector Store  │ │
│  │                 │  │             │  │                     │ │
│  │ - Context mgmt  │  │ - Navigation │  │ - Persistent refs   │ │
│  │ - Tab lifecycle │  │ - Actions    │  │ - Confidence scores │ │
│  │ - State sync    │  │ - Evaluation │  │ - Version history   │ │
│  └────────┬────────┘  └──────┬──────┘  └──────────┬──────────┘ │
│           │                  │                     │            │
│           └──────────────────┼─────────────────────┘            │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │               Browser Engine (Playwright)                  │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │
│  │  │ Context  │  │  Page    │  │ Accessibility│  │ Console  │   │ │
│  │  │ Manager  │  │  Controller  │  │   Tree     │  │  Monitor │   │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|----------------------|
| **Session Manager** | Manages browser contexts, tab lifecycle, and state persistence | Playwright BrowserContext, storage state management |
| **Page Controller** | Handles page navigation, element interaction, and action execution | Playwright Page API, action queue |
| **Selector Store** | Persists discovered selectors with metadata for reliable extraction | JSON/Database with versioning and confidence scores |
| **Accessibility Tree** | Provides LLM-friendly DOM representation for discovery | Playwright accessibility snapshot |
| **Action Executor** | Executes procedural extraction scripts using stored selectors | Playwright locator API, retry logic |
| **Handoff Manager** | Coordinates the transition from LLM discovery to procedural extraction | State machine, validation layer |

## Data Flow

### Discovery Phase (LLM-Driven)

```
User Request ("Extract product data from site.com")
    ↓
MCP Host → tools/list → Discovery Tools (browser_navigate, browser_snapshot)
    ↓
Page loads → Accessibility tree captured → Serialized snapshot
    ↓
LLM analyzes snapshot → Identifies extraction targets
    ↓
LLM generates selectors → Selector Store (with confidence metadata)
```

### Handoff Phase

```
Discovery Complete → Validate selectors against page
    ↓
Generate extraction plan → Store with selectors
    ↓
Return extraction handle → LLM/Host confirms handoff
    ↓
Mark as "ready for procedural execution"
```

### Extraction Phase (Procedural)

```
Stored extraction handle → Retrieve selectors
    ↓
Procedural executor → Navigate to page
    ↓
Apply selectors → Extract data (retry on failure)
    ↓
Return structured data → No LLM involvement
```

## Key Data Flows

1. **Discovery Flow:** LLM uses `browser_snapshot` (accessibility tree) → analyzes → generates selectors via `browser_evaluate` or action sequences
2. **Validation Flow:** Selectors tested against live page → confidence scores assigned → invalid selectors flagged
3. **Handoff Flow:** Valid selectors + extraction instructions → serialized plan → stored for later execution
4. **Extraction Flow:** Procedural executor reads plan → executes without LLM → returns structured data

## Architectural Patterns

### Pattern 1: Selector-Centric Separation

**What:** The system maintains a clear boundary between selector discovery (LLM-driven) and selector execution (procedural).

**When to use:** When you need reliable repeated extraction from the same site structure, but discovery requires semantic understanding.

**Trade-offs:**
- ✅ Reliable, fast repeated extractions
- ✅ Token-efficient for batch operations
- ⚠️ Requires validation layer to catch selector drift
- ⚠️ Adds complexity for handling dynamic site changes

**Example:**
```typescript
// Discovery phase (LLM-driven)
const selectors = await mcpClient.callTool('browser_evaluate', {
  function: () => {
    // LLM generates this code
    return {
      productName: '[data-testid="product-title"]',
      price: '.price-display > span:first-child'
    };
  }
});

// Store with metadata
await selectorStore.save({
  url: 'site.com/products',
  selectors,
  confidence: 0.95,
  discoveredAt: Date.now()
});

// Extraction phase (procedural - no LLM)
const data = await proceduralExtractor.extract({
  url: 'site.com/products',
  selectorHandle: selectorId
});
```

### Pattern 2: Snapshot-Based Interaction

**What:** Uses accessibility tree snapshots instead of screenshots for LLM interaction. Playwright's accessibility tree provides a serialized representation of interactive elements that's token-efficient and LLM-friendly.

**When to use:** For all LLM-driven discovery phases. Avoids vision model costs and provides semantic element descriptions.

**Trade-offs:**
- ✅ Much more token-efficient than screenshots
- ✅ Provides semantic element descriptions
- ✅ No vision model needed
- ⚠️ Loses visual layout context
- ⚠️ Some dynamic content may not be captured

**Example:**
```typescript
// Capture accessibility snapshot
const snapshot = await page.accessibility.snapshot({
  interestingOnly: true  // Only interactive elements
});

// LLM receives structured data like:
// - role: "button", name: "Add to Cart", ref: "e42"
// - role: "link", name: "Product Details", ref: "e43"
```

### Pattern 3: Capability-Based Tool Exposure

**What:** MCP server exposes tools based on configured capabilities (core, vision, pdf, devtools). Host negotiates capabilities during initialization.

**When to use:** For security and feature control. Different use cases need different tool sets.

**Trade-offs:**
- ✅ Fine-grained security control
- ✅ Clear contract between host and server
- ⚠️ Requires capability negotiation logic
- ⚠️ Feature discovery complexity

**Example:**
```typescript
// Server configuration
const server = new McpServer({
  capabilities: {
    tools: {
      listChanged: true
    },
    // Only expose core + vision tools
    enabledTools: ['core', 'vision']
  }
});

// Host discovers available tools
const tools = await session.listTools();
// Only receives tools matching enabled capabilities
```

### Pattern 4: Non-CDP Browser Control

**What:** Uses Playwright's high-level APIs rather than Chrome DevTools Protocol directly. Provides cross-browser support and cleaner abstraction.

**When to use:** For all browser automation unless you specifically need low-level CDP features.

**Trade-offs:**
- ✅ Cross-browser support (Chromium, Firefox, WebKit)
- ✅ More stable API surface
- ✅ Automatic waiting and retry logic
- ⚠️ Less control over low-level browser behavior
- ⚠️ May miss some CDP-specific features

**Example:**
```typescript
// Playwright high-level approach (recommended)
const element = await page.locator('[data-testid="submit"]').first();
await element.click();  // Auto-waits, auto-retries

// CDP approach (avoid unless necessary)
// await client.send('Input.dispatchMouseEvent', {...});
```

## Recommended Project Structure

```
src/
├── mcp/                      # MCP protocol layer
│   ├── server.ts             # Main MCP server setup
│   ├── tools/                # Tool implementations
│   │   ├── navigation.ts     # browser_navigate, etc.
│   │   ├── interaction.ts    # browser_click, browser_fill, etc.
│   │   ├── extraction.ts     # browser_evaluate, browser_snapshot
│   │   └── extraction-plan.ts # Procedural extraction tools
│   └── resources/            # MCP resources (if any)
├── browser/                  # Browser automation layer
│   ├── session-manager.ts    # Context and tab lifecycle
│   ├── page-controller.ts    # Page-level operations
│   ├── snapshot-manager.ts   # Accessibility tree handling
│   └── action-executor.ts    # Procedural action execution
├── selectors/                # Selector management
│   ├── store.ts              # Selector persistence
│   ├── validator.ts          # Selector validation
│   └── resolver.ts           # Dynamic selector resolution
├── extraction/               # Procedural extraction
│   ├── planner.ts            # Extraction plan generation
│   ├── executor.ts           # Procedural execution engine
│   └── scheduler.ts          # Batch extraction scheduling
└── types/                    # Shared type definitions
```

### Structure Rationale

- **mcp/:** Contains MCP-specific protocol handling. Separation allows testing transport layer independently.
- **browser/:** Encapsulates Playwright interactions. Can be swapped for other automation frameworks.
- **selectors/:** Centralizes selector lifecycle management. Critical for handoff reliability.
- **extraction/:** Pure procedural execution. No LLM dependencies, enabling fast batch operations.

## Build Order and Dependencies

### Phase 1: Foundation (Weeks 1-2)
**Build order:**
1. **MCP Server skeleton** - Basic server setup, transport layer
2. **Browser session manager** - Context creation, tab management
3. **Core navigation tools** - browser_navigate, browser_close
4. **Basic snapshot tool** - browser_snapshot returning accessibility tree

**Dependencies:** None (external).
**Enables:** Discovery phase functionality.

### Phase 2: Discovery Tools (Weeks 3-4)
**Build order:**
1. **Interaction tools** - browser_click, browser_fill, browser_type
2. **Evaluation tool** - browser_evaluate for custom scripts
3. **Selector capture** - Tooling to record and store selectors
4. **Selector store** - Persistence layer

**Dependencies:** Phase 1 complete.
**Enables:** Full LLM-driven discovery workflow.

### Phase 3: Handoff Layer (Weeks 5-6)
**Build order:**
1. **Selector validator** - Validate selectors against live page
2. **Extraction planner** - Generate extraction plans from validated selectors
3. **Plan store** - Persist extraction plans
4. **Handoff API** - Tools for LLM to confirm and trigger handoff

**Dependencies:** Phase 2 complete, Selector store operational.
**Enables:** Discovery-to-extraction transition.

### Phase 4: Procedural Extraction (Weeks 7-8)
**Build order:**
1. **Procedural executor** - Execute stored plans without LLM
2. **Batch scheduler** - Handle multiple extractions
3. **Retry logic** - Handle transient failures and selector drift
4. **Result formatter** - Structured output

**Dependencies:** Phase 3 complete.
**Enables:** Production extraction workflows.

### Phase 5: Production Hardening (Weeks 9-10)
**Build order:**
1. **Error recovery** - Handle partial failures
2. **Monitoring** - Track success rates, selector drift
3. **Rate limiting** - Respect target sites
4. **Documentation** - API docs, usage patterns

**Dependencies:** All previous phases.
**Enables:** Production deployment.

## Critical Implementation Path

The core architectural dependency chain is:

```
MCP Transport Layer
        ↓
Browser Session Management
        ↓
Snapshot/Discovery Tools ←─ Can test standalone
        ↓
Selector Store + Validation
        ↓
Handoff Manager
        ↓
Procedural Executor ←─ Independent of LLM
```

**Critical path:** Transport → Session → Discovery → Handoff → Executor

Each layer must be functional before the next can be properly tested.

## Anti-Patterns to Avoid

### Anti-Pattern 1: CDP-First Implementation

**What people do:** Implement browser control using Chrome DevTools Protocol directly.

**Why it's wrong:**
- Ties you to Chromium
- Loses Playwright's automatic waiting and retry logic
- More brittle, requires handling low-level browser quirks

**Instead:** Use Playwright's high-level APIs. Only use CDP for specific features not exposed in Playwright.

### Anti-Pattern 2: Screenshot-Based Discovery

**What people do:** Use `browser_screenshot` for LLM analysis instead of accessibility snapshots.

**Why it's wrong:**
- Massive token costs
- Requires vision model (more expensive, slower)
- Loses semantic element information

**Instead:** Use `browser_snapshot` with accessibility tree. Only use screenshots for visual validation.

### Anti-Pattern 3: Tight Coupling of Discovery and Extraction

**What people do:** LLM directly controls extraction in production, or extraction logic embedded in discovery code.

**Why it's wrong:**
- Unreliable for batch operations
- Expensive (LLM tokens for every extraction)
- Slow (LLM latency per extraction)

**Instead:** Explicit handoff. Discovery produces a declarative plan. Extraction executes procedurally.

### Anti-Pattern 4: Storing Selectors Without Metadata

**What people do:** Store just the selector strings without context.

**Why it's wrong:**
- Can't detect selector drift
- Can't rank selectors by reliability
- Can't retry with alternatives

**Instead:** Store with confidence scores, discovery timestamp, page context, alternative selectors.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Playwright** | Direct library use | Core browser automation |
| **MCP SDK** | Server/Client SDK | Protocol implementation |
| **Browser CDP** | Avoid direct use | Use via Playwright unless absolutely necessary |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **MCP Layer ↔ Browser Layer** | Direct function calls | Keep thin, delegate to browser layer |
| **Browser Layer ↔ Selector Store** | Async I/O | Could be database or file system |
| **Selector Store ↔ Executor** | Read-only after handoff | Executor should not write to store |
| **Discovery Tools ↔ Extraction Tools** | Handoff via stored plan | Explicit state transition |

## Sources

- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture) - Official MCP architecture docs
- [MCP TypeScript SDK](https://context7.com/modelcontextprotocol/typescript-sdk/llms.txt) - SDK implementation patterns
- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) - Reference implementation
- [Browser Automation MCP Servers Guide](https://www.skyvern.com/blog/browser-automation-mcp-servers-guide/) - Ecosystem overview
- [Stagehand Breakdown](https://memo.d.foundation/breakdown/stagehand) - Accessibility tree processing patterns
- [DOM Downsampling for LLM-Based Web Agents](https://www.webfuse.com/blog/dom-downsampling-for-llm-based-web-agents) - Snapshot optimization
