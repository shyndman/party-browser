# Technology Stack

**Project:** Browser MCP Core (MCP Server for Browser Automation)
**Researched:** February 2026
**Confidence:** HIGH

## Executive Summary

The Browser MCP Core project bridges a local MCP server to browser extensions via WebSocket. For 2026, the recommended stack prioritizes:

1. **Reliability**: Upgraded MCP SDK with security patches and proper lifecycle handling
2. **Testability**: Vitest + mcp-testing-kit + vitest-websocket-mock for comprehensive testing
3. **Developer Experience**: pnpm for package management, tsx for dev, tsup for production builds
4. **Future-proofing**: Node.js 24 LTS (Active LTS through April 2028)

## Current State Analysis

| Component | Current Version | Recommended | Gap |
|-----------|-----------------|-------------|-----|
| @modelcontextprotocol/sdk | ^1.8.0 | ^1.26.0 | **Security updates, lifecycle fixes** |
| TypeScript | ^5.6.2 | ^5.7.x | Minor version behind |
| ws | ^8.18.1 | ^8.18.1 | Current |
| zod | ^3.24.2 | ^3.24.x | Current |
| Build tool | tsup ^8.4.0 | tsup ^8.4.x | Current |
| Testing | None | Vitest ecosystem | **New capability** |
| Package manager | npm | pnpm | **Recommended migration** |

## Recommended Stack

### Core Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | ^24.0.0 (Active LTS) | Runtime | Active LTS until Oct 2026, security support until Apr 2028. Node 24 includes native WebSocket improvements and better ESM support. |
| TypeScript | ^5.7.0 | Language | Latest stable with enhanced ESM resolution, better performance. Required for proper `moduleResolution: "bundler"` behavior. |

### MCP & Protocol

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @modelcontextprotocol/sdk | ^1.26.0 | MCP protocol implementation | **CRITICAL UPGRADE**: v1.26.0 addresses security advisory GHSA-345p-7cg4-v4c regarding server/transport instance sharing. Also includes improved session management and transport lifecycle handling essential for reliable shutdown/reconnect. |
| zod | ^3.24.x | Runtime validation | Industry standard for TypeScript schema validation. Essential for tool input validation and type safety at runtime. |
| zod-to-json-schema | ^3.24.x | Schema conversion | Required for MCP tool schema generation from Zod types. |

### WebSocket Bridge

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ws | ^8.18.x | WebSocket server | Battle-tested, handles 10K+ concurrent connections. Native Node.js integration. Required for Chrome extension communication. |
| @types/ws | ^8.5.x | Type definitions | Full TypeScript coverage for ws library. |

### Build & Development

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| tsup | ^8.4.x | Production bundler | Zero-config bundler specifically designed for TypeScript libraries. Handles ESM/CJS dual publishing, tree-shaking, and source maps. Already in use - keep it. |
| tsx | ^4.19.x | Development runtime | Fast TypeScript execution without pre-compilation. Better performance than ts-node, perfect for `npm run dev` workflow. |
| shx | ^0.3.x | Cross-platform shell | For chmod +x on Windows during build. Keep existing usage. |

### Testing (New Capability)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| vitest | ^3.0.x | Test framework | Fastest TypeScript test runner, native ESM support, built-in mocking, watch mode. Replaces Jest for new projects in 2026. |
| mcp-testing-kit | ^1.x | MCP server testing | Purpose-built for testing MCP servers. Creates dummy transport layer for direct server testing without HTTP/SSE overhead. |
| vitest-websocket-mock | ^0.5.x | WebSocket mocking | Specialized WebSocket mocking for Vitest. Essential for testing the browser extension bridge without actual browser. |
| @vitest/coverage-v8 | ^3.0.x | Coverage reporting | Native V8 coverage integration for Vitest. |

### Package Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pnpm | ^10.x | Package manager | **RECOMMENDED MIGRATION**: 2-3x faster installs than npm, content-addressable storage (saves 70%+ disk space), built-in monorepo support via workspaces, stricter dependency resolution prevents phantom dependencies. |

### Linting & Code Quality

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @biomejs/biome | ^1.9.x | Linting & formatting | Replaces ESLint + Prettier. Single tool, 10-100x faster, no config conflicts. Built for ESM-first projects. |
| typescript-eslint | ^8.x | Type-aware linting | If Biome insufficient, use for type-aware rules. Otherwise, prefer Biome. |

### CI/CD

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| GitHub Actions | N/A | CI/CD | Native integration, free for open source. Use `actions/setup-node@v4` with `cache: 'pnpm'`. |

## Installation Commands

### Migration to pnpm (one-time)

```bash
# Install pnpm globally
npm install -g pnpm

# Migrate existing lockfile
pnpm import

# Remove old lockfile and node_modules
rm package-lock.json
rm -rf node_modules

# Install with pnpm
pnpm install
```

### Core Dependencies

```bash
# MCP SDK (UPGRADE REQUIRED)
pnpm add @modelcontextprotocol/sdk@^1.26.0

# Validation
pnpm add zod@^3.24.2 zod-to-json-schema@^3.24.3

# WebSocket
pnpm add ws@^8.18.1
```

### Dev Dependencies

```bash
# TypeScript ecosystem
pnpm add -D typescript@^5.7.0 @types/ws@^8.5.14

# Build tools
pnpm add -D tsup@^8.4.0 tsx@^4.19.0 shx@^0.3.4

# Testing (NEW)
pnpm add -D vitest@^3.0.0 mcp-testing-kit@latest vitest-websocket-mock@^0.5.0 @vitest/coverage-v8@^3.0.0

# Code quality
pnpm add -D @biomejs/biome@^1.9.0

# CLI framework (keep existing)
pnpm add commander@^13.1.0
```

## Package.json Configuration

```json
{
  "type": "module",
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=10.0.0"
  },
  "packageManager": "pnpm@10.2.0",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsup src/index.ts --format esm && shx chmod +x dist/*.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "test:ui": "vitest --ui",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "prepare": "pnpm run build",
    "inspector": "CLIENT_PORT=9001 SERVER_PORT=9002 pnpx @modelcontextprotocol/inspector node dist/index.js"
  }
}
```

## tsconfig.json Recommendations

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Key changes from current:**
- `"module": "NodeNext"` instead of `"esnext"` - better ESM compatibility with Node.js
- `"target": "ES2024"` - leverage latest JavaScript features supported by Node 24
- `"lib": ["ES2024"]` - proper type definitions
- Added `declaration` and `declarationMap` for better IDE support
- `"moduleResolution": "NodeNext"` aligns with `"module": "NodeNext"`

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Test Framework | Vitest | Jest | Jest has slower ESM support, requires more config. Vitest is purpose-built for modern TypeScript/ESM projects. |
| Package Manager | pnpm | npm | npm lacks content-addressable storage, slower install times, less strict dependency resolution. Acceptable if team resistance to pnpm. |
| Linting | Biome | ESLint + Prettier | ESLint + Prettier requires complex config management, slower. Biome is 10-100x faster but has fewer rules. Choose ESLint if you need custom rule authoring. |
| Build Tool | tsup | Rollup | Rollup requires more configuration. tsup is zero-config for TypeScript libraries and already in use. |
| Runtime | Node.js 24 LTS | Node.js 22 LTS | Node 22 is in Maintenance LTS (good until Apr 2027). Node 24 provides 18 extra months of support and newer WebSocket APIs. Both acceptable. |

## Version Upgrade Path

### Phase 1: Critical Security (Immediate)
```bash
# Upgrade MCP SDK - addresses GHSA-345p-7cg4-v4c
pnpm add @modelcontextprotocol/sdk@^1.26.0
```

### Phase 2: Testing Infrastructure (Week 1-2)
```bash
# Add testing dependencies
pnpm add -D vitest@^3.0.0 mcp-testing-kit vitest-websocket-mock @vitest/coverage-v8

# Create vitest.config.ts
# Write first tests for existing tools
```

### Phase 3: Developer Experience (Week 2-3)
```bash
# Migrate to pnpm
pnpm import && rm package-lock.json && rm -rf node_modules && pnpm install

# Add tsx for dev workflow
pnpm add -D tsx@^4.19.0

# Add Biome for linting
pnpm add -D @biomejs/biome
```

### Phase 4: TypeScript Modernization (Week 3-4)
```bash
# Upgrade TypeScript
pnpm add -D typescript@^5.7.0

# Update tsconfig.json to target ES2024/NodeNext
# Update Node.js requirement to ^24.0.0
```

## Testing Strategy

### Unit Tests
- **Tools**: Test individual tool handlers with mocked context
- **Resources**: Test resource providers
- **Utilities**: Test port detection, ARIA snapshot parsing

### Integration Tests
- **MCP Protocol**: Use `mcp-testing-kit` to test full tool invocation flow
- **WebSocket Bridge**: Use `vitest-websocket-mock` to simulate browser extension connections
- **Lifecycle**: Test shutdown/reconnect scenarios

### Example Test Structure
```
src/
  tools/
    common.ts
    common.test.ts          # Unit tests
    snapshot.ts
    snapshot.test.ts        # Unit tests
  __tests__/
    integration.test.ts     # MCP integration tests
    websocket.test.ts       # WebSocket lifecycle tests
  test/
    fixtures/               # Test data
    helpers/                # Test utilities
```

## CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22, 24]
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run lint
      - run: pnpm run test:coverage
```

## Sources

- MCP SDK v1.26.0 Release Notes: https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v1.26.0
- Node.js Release Schedule: https://nodejs.org/en/about/previous-releases
- Vitest Documentation: https://vitest.dev/
- mcp-testing-kit: https://github.com/thoughtspot/mcp-testing-kit
- vitest-websocket-mock: https://github.com/akiomik/vitest-websocket-mock
- pnpm vs npm comparison (2026): https://dev.to/pockit_tools/pnpm-vs-npm-vs-yarn-vs-bun-the-2026-package-manager-showdown-51dc
- Biome vs ESLint: https://biomejs.dev/
- Context7 MCP TypeScript SDK Documentation: /modelcontextprotocol/typescript-sdk

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| MCP SDK Upgrade | HIGH | Official security advisory and release notes verified |
| Testing Stack | HIGH | Multiple community sources confirm Vitest + mcp-testing-kit pattern |
| Node.js Version | HIGH | Official Node.js LTS schedule |
| Package Manager | MEDIUM-HIGH | pnpm adoption is strong but npm remains viable; preference based on ecosystem trends |
| Build Tools | HIGH | tsup already in use, validated by continued community adoption |
