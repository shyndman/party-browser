# Codebase Structure

**Analysis Date:** 2026-02-09

## Directory Layout

```
[project-root]/
├── src/                    # Source code
│   ├── tools/             # MCP tool implementations
│   ├── resources/         # MCP resource definitions
│   ├── utils/             # Shared utility functions
│   ├── index.ts           # CLI entry point
│   ├── server.ts          # MCP server implementation
│   ├── context.ts         # Connection state management
│   └── ws.ts              # WebSocket server setup
├── .github/               # GitHub assets
│   └── images/            # Screenshots, banners
├── .planning/             # Planning documentation
│   └── codebase/          # Codebase analysis documents
├── package.json           # Package manifest
├── tsconfig.json          # TypeScript configuration
├── LICENSE                # MIT license
└── README.md              # Project documentation
```

## Directory Purposes

**`src/`:**
- Purpose: All source code
- Contains: TypeScript files implementing MCP server
- Key files: `index.ts`, `server.ts`, `context.ts`

**`src/tools/`:**
- Purpose: Browser automation tool implementations
- Contains: Tool definitions and handlers
- Key files:
  - `tool.ts`: Core Tool type definitions
  - `common.ts`: Navigation, wait, keypress tools
  - `snapshot.ts`: Snapshot, click, hover, type, drag tools
  - `custom.ts`: Screenshot, console logs tools

**`src/resources/`:**
- Purpose: MCP resource definitions (read-only data)
- Contains: Resource interface
- Key files: `resource.ts`
- Note: Currently no resources implemented

**`src/utils/`:**
- Purpose: Shared helper functions
- Contains: ARIA capture, logging, port utilities
- Key files:
  - `aria-snapshot.ts`: Page state capture
  - `log.ts`: Debug logging utility
  - `port.ts`: Port availability and cleanup

## Key File Locations

**Entry Points:**
- `src/index.ts`: CLI entry, tool registration, bootstrap
- `dist/index.js`: Compiled executable (declared in `package.json` bin)

**Configuration:**
- `package.json`: Dependencies, scripts, metadata
- `tsconfig.json`: TypeScript compiler options, path aliases

**Core Logic:**
- `src/server.ts`: MCP protocol handlers, request routing
- `src/context.ts`: WebSocket connection management
- `src/ws.ts`: WebSocket server creation

**Type Definitions:**
- `src/tools/tool.ts`: Tool and ToolFactory interfaces
- `src/resources/resource.ts`: Resource interface

**External Dependencies (Monorepo):**
- `@repo/config`: Application and MCP configuration
- `@repo/types`: Tool and message type definitions
- `@repo/messaging`: Message type utilities
- `@repo/utils`: General utilities (wait function)
- `@r2r/messaging`: WebSocket message sender

## Naming Conventions

**Files:**
- Lowercase with hyphens: `aria-snapshot.ts`, `port.ts`
- Index files for barrel exports: `index.ts`
- Descriptive names matching purpose

**Directories:**
- Lowercase: `tools/`, `utils/`, `resources/`
- Plural for collections: `tools/` not `tool/`

**TypeScript:**
- PascalCase for types/interfaces: `Tool`, `ToolResult`, `Context`
- camelCase for functions: `captureAriaSnapshot`, `isPortInUse`
- UPPER_SNAKE_CASE for constants (not present in this codebase)

## Where to Add New Code

**New Tool:**
1. Add tool definition in appropriate file based on category:
   - Navigation/interaction: `src/tools/common.ts`
   - Page element operations: `src/tools/snapshot.ts`
   - Custom/utility: `src/tools/custom.ts`
2. Import tool Zod schema from `@repo/types/mcp/tool`
3. Add to appropriate tool array in `src/index.ts`

**New Tool Category:**
1. Create new file in `src/tools/`: `src/tools/newcategory.ts`
2. Export tools from new file
3. Import and add to tool arrays in `src/index.ts`

**New Resource:**
1. Define resource in `src/resources/resource.ts` or new file
2. Add to `resources` array in `src/index.ts`

**New Utility:**
- Shared helpers: `src/utils/[name].ts`
- Tool-specific helpers: Keep in tool file or `src/utils/` for reuse

**New Types:**
- Local types: Define in relevant file
- Shared types: Add to monorepo `@repo/types` package (external to this repo)

## Special Directories

**`.opencode/`:**
- Purpose: OpenCode IDE configuration and GSD tooling
- Contains: Workflows, agents, hooks, node_modules
- Generated: No
- Committed: Yes (configuration files)

**`.planning/`:**
- Purpose: Project planning and documentation
- Contains: Codebase analysis documents
- Generated: No
- Committed: Yes

**`dist/`:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by `tsup` build)
- Committed: No (in `.gitignore`)

## Path Aliases

**Configured in `tsconfig.json`:**
```json
"paths": {
  "@/*": ["./src/*"]
}
```

**Usage Examples:**
- `import { Context } from "@/context"`
- `import type { Tool } from "@/tools/tool"`
- `import { captureAriaSnapshot } from "@/utils/aria-snapshot"`

## Build Output

**Target:** `dist/index.js`
- Format: ESM (ES modules)
- Tool: `tsup`
- Entry: `src/index.ts`
- Shebang: Added for CLI execution

---

*Structure analysis: 2026-02-09*
