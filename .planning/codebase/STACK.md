# Technology Stack

**Analysis Date:** 2026-02-09

## Languages

**Primary:**
- TypeScript 5.6.2 - All source code, ESM modules
- Node.js ES2022 - Runtime target

## Runtime

**Environment:**
- Node.js (ES2022 target)
- ES Modules (`"type": "module"` in package.json)

**Package Manager:**
- PNPM workspace (monorepo context)
- Lockfile: Bun lock present in `.opencode/bun.lock`

**CLI Binary:**
- Entry: `dist/index.js` (built from `src/index.ts`)
- Command: `mcp-server-browsermcp`

## Frameworks

**Core:**
- MCP (Model Context Protocol) SDK 1.8.0 - Protocol implementation
- Commander 13.1.0 - CLI argument parsing and command structure

**Communication:**
- WS (WebSocket) 8.18.1 - Browser extension communication

**Validation:**
- Zod 3.24.2 - Runtime type validation and schema definitions
- Zod-to-JSON-Schema 3.24.3 - Schema conversion for MCP

**Build:**
- Tsup 8.4.0 - TypeScript bundler (ESM output)
- TypeScript 5.6.2 - Type checking and compilation

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` ^1.8.0 - Core MCP protocol implementation
  - Server lifecycle management
  - Request/response handlers (ListTools, CallTool, ListResources, ReadResource)
  - Stdio transport for MCP communication

**Browser Automation:**
- `ws` ^8.18.1 - WebSocket server for browser extension communication
  - Creates local WebSocket server on configurable port
  - Handles bidirectional messaging with browser extension
  - Port management utilities (kill existing processes, check availability)

**Type Safety:**
- `zod` ^3.24.2 - Schema validation for tool inputs
- `zod-to-json-schema` ^3.24.3 - Convert Zod schemas to MCP-compatible JSON Schema

**CLI:**
- `commander` ^13.1.0 - CLI framework for binary distribution

**Workspace Dependencies (Monorepo):**
- `@repo/config` - Application and MCP configuration
- `@repo/types` - Shared type definitions including tool schemas
- `@repo/messaging` - WebSocket message types and protocols
- `@r2r/messaging` - Message sender utilities
- `@repo/utils` - Shared utility functions

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2022
- Module: ESNext with Bundler resolution
- Path mapping: `@/*` → `./src/*`
- Strict mode enabled

**Build:**
- Entry: `src/index.ts`
- Output: `dist/index.js` (ESM format)
- Build command: `tsup src/index.ts --format esm`
- Executable bit set on output via `shx chmod +x`

**Development:**
- Watch mode: `tsup --watch`
- Type checking: `tsc --noEmit`
- MCP Inspector: `@modelcontextprotocol/inspector` on ports 9001/9002

## Platform Requirements

**Development:**
- Node.js with ESM support
- PNPM (for workspace dependencies)
- TypeScript 5.6+

**Production:**
- Node.js runtime
- No persistent storage requirements
- Local WebSocket port access (default: configured in `@repo/config`)
- Browser extension installation (Browser MCP Chrome extension)

**Cross-Platform:**
- Port management utilities support Windows (`netstat`) and Unix (`lsof`)
- Uses `node:child_process` and `node:net` for port operations

---

*Stack analysis: 2026-02-09*
