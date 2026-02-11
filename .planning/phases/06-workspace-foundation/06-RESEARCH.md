# Phase 6: Workspace Foundation - Research

**Researched:** 2026-02-11
**Domain:** pnpm workspaces, WXT extension framework, MCP development tooling
**Confidence:** HIGH

## Summary

This phase establishes a pnpm workspace foundation for the blindflight project with exactly two packages: `packages/mcp` (the MCP server) and `packages/extension` (the Firefox extension). The workspace must support root-level install/build/test entrypoints while maintaining package-first development flexibility.

**Primary recommendation:** Use pnpm workspaces with `workspace:` protocol, WXT for extension development (replacing custom XPI build script), and mcptools for MCP development workflows. Root scripts should follow action-first naming with verb-by-package filters.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Root command surface uses **action-first naming** (e.g., `build`, `test`)
- Root entrypoints must cover **install/build/test milestone flows**
- Use **verb-by-package naming** for targeted commands (e.g., `build:mcp`, `build:extension`)
- Default output style is **verbose logs**
- **No separate canonical workspace health-check command** as required surface
- Day-to-day development can be **package-first** for local work
- Documentation presents **root-first commands** for full-stack workflows
- One **umbrella dev command** that delegates to package dev scripts, launching **both MCP and extension dev flows by default**
- Include **`mcptools`** in phase research for MCP dev workflow
- In dev mode, **preconfigure extension** to connect to MCP server started by `mcptools`
- **Multi-package root/umbrella flows fail fast** on first failing task
- Keep **successful package outputs/artifacts** when another package fails
- Failure messaging includes **actionable package-level summary**
- If **known setup/wiring issues detected up front**, abort immediately before starting package tasks
- Keep **shared tooling defaults centralized at repo root**
- **Allow direct source imports** across package boundaries during this phase

### Claude's Discretion
- Choose strictness level for exit behavior details (CI-oriented vs local-dev ergonomics per command)
- Choose whether old root-level path handling is clean-cut or transitional

### Deferred Ideas (OUT OF SCOPE)
- Potential expansion beyond two workspace packages (shared types/utils) - noted for future roadmap, NOT a Phase 6 requirement

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | 10.x | Package manager & workspace orchestration | Industry standard for monorepos, used by Vite, Next.js, Vue |
| WXT | ^0.20.x | Web extension build framework | Purpose-built for browser extensions, supports Firefox MV2, TypeScript-native |
| TypeScript | ^5.6+ | Type checking | Required for both packages, already in use |
| mcptools | latest | MCP development CLI | Swiss Army Knife for MCP servers - web UI, shell, scaffolding |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsup | ^8.x | MCP server bundling | Already in use, fast ESM builds |
| @modelcontextprotocol/inspector | latest | MCP debugging | Alternative to mcptools web interface |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WXT | web-ext + custom scripts | WXT handles HMR, manifest generation, cross-browser builds automatically |
| pnpm workspaces | npm workspaces + turbo | pnpm has better deduplication, workspace protocol, filtering |
| mcptools | @modelcontextprotocol/inspector | mcptools has web UI, proxy mode, shell - more comprehensive |

**Installation:**
```bash
# Global tooling
npm install -g pnpm

# Or use corepack
corepack enable
corepack prepare pnpm@latest --activate

# Root workspace dependencies managed via pnpm-workspace.yaml
```

---

## Architecture Patterns

### Recommended Project Structure
```
blindflight/                      # Workspace root
├── pnpm-workspace.yaml          # Workspace definition
├── package.json                 # Root scripts & shared devDependencies
├── tsconfig.json               # Root TypeScript config (shared base)
├── packages/
│   ├── mcp/                    # MCP server package
│   │   ├── package.json
│   │   ├── tsconfig.json       # Extends root
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── dist/               # Build output
│   └── extension/              # Firefox extension package
│       ├── package.json
│       ├── tsconfig.json       # Extends ./.wxt/tsconfig.json
│       ├── wxt.config.ts       # WXT configuration
│       ├── src/
│       │   ├── background.ts   # Background script
│       │   ├── content.ts      # Content script
│       │   └── popup/
│       │       ├── index.html
│       │       └── main.ts
│       └── public/             # Static assets
└── dist/                       # Root build outputs (optional)
```

### Pattern 1: pnpm Workspace Configuration
**What:** Define workspace packages in `pnpm-workspace.yaml`
**When to use:** Required for all pnpm monorepos
**Example:**
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'

# Optional: Catalog for shared dependency versions
catalog:
  typescript: ^5.6.2
  
# Optional: Shared dev dependencies
catalogs:
  dev:
    '@types/node': ^20.0.0
```
**Source:** https://pnpm.io/pnpm-workspace_yaml

### Pattern 2: Workspace Protocol
**What:** Use `workspace:` protocol for internal dependencies
**When to use:** Referencing other workspace packages
**Example:**
```json
{
  "dependencies": {
    "@blindflight/mcp": "workspace:*"
  }
}
```
**Benefit:** pnpm will refuse to resolve to anything other than local workspace packages, ensuring consistency.
**Source:** https://pnpm.io/workspaces#workspace-protocol-workspace

### Pattern 3: Root Script Delegation
**What:** Root scripts delegate to package scripts using pnpm filtering
**When to use:** Running commands across multiple packages
**Example:**
```json
{
  "scripts": {
    "build": "pnpm run -r build",
    "build:mcp": "pnpm --filter ./packages/mcp build",
    "build:extension": "pnpm --filter ./packages/extension build",
    "dev": "pnpm run --parallel dev",
    "dev:mcp": "pnpm --filter ./packages/mcp dev",
    "dev:extension": "pnpm --filter ./packages/extension dev"
  }
}
```
**Source:** https://pnpm.io/cli/run

### Pattern 4: WXT Extension Development
**What:** File-based entrypoints with automatic manifest generation
**When to use:** All browser extension development
**Example:**
```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Blindflight',
    permissions: ['activeTab', 'tabs', 'storage'],
    browser_specific_settings: {
      gecko: {
        id: 'blindflight@blindflight.io',
        strict_min_version: '109.0'
      }
    }
  },
  runner: {
    startUrls: ['about:debugging']
  }
});
```
**Source:** https://wxt.dev/guide/essentials/config/manifest

### Pattern 5: WXT Entrypoint Structure
**What:** Convention-based entrypoint discovery
**When to use:** Organizing extension code
**Example:**
```
packages/extension/entrypoints/
├── background.ts          # Background script (persistent/event)
├── content.ts            # Content script
├── popup/
│   ├── index.html
│   └── main.ts
└── options/
    ├── index.html
    └── main.ts
```
**Source:** https://wxt.dev/guide/essentials/entrypoints

### Pattern 6: Shared TypeScript Config
**What:** Root tsconfig as base, packages extend it
**When to use:** Maintaining consistent TypeScript settings
**Example:**
```json
// tsconfig.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}

// packages/mcp/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

### Anti-Patterns to Avoid

**Don't use npm in workspace packages**
- ❌ Running `npm install` inside package directories
- ✅ Always use `pnpm install` from root

**Don't commit lockfiles in packages**
- ❌ `packages/mcp/package-lock.json`
- ✅ Only root `pnpm-lock.yaml`

**Don't use relative paths for cross-package imports**
- ❌ `import { foo } from '../../../packages/mcp/src/foo'`
- ✅ Use `workspace:` protocol or build artifacts

**Don't duplicate devDependencies**
- ❌ Installing TypeScript in every package
- ✅ Install shared devDependencies at root

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extension bundling | Custom XPI build script (current) | WXT | HMR, manifest auto-generation, cross-browser support, MV2/MV3 conversion |
| Workspace task orchestration | Custom bash scripts | pnpm run -r, --filter | Built-in parallel/sequential execution, filtering, caching |
| MCP dev server | Custom WebSocket setup | mcptools web | Web UI for testing tools, resources, prompts; proxy mode; mock server |
| Extension reloading | Manual reload in Firefox | WXT dev mode | Automatic extension reload on file change |
| Manifest management | Manual manifest.json editing | WXT manifest config | Type-safe manifest, automatic MV2/MV3 conversion |

**Key insight:** The current `scripts/build-xpi.mjs` (454 lines of manual ZIP creation) is entirely replaced by `wxt build` which handles TypeScript compilation, bundling, and packaging automatically.

---

## Common Pitfalls

### Pitfall 1: pnpm Lockfile Conflicts
**What goes wrong:** Team members using different pnpm versions cause lockfile churn
**Why it happens:** pnpm lockfile format changes between major versions
**How to avoid:** Specify pnpm version in `packageManager` field and use Corepack
```json
{
  "packageManager": "pnpm@10.4.1"
}
```
**Warning signs:** Large lockfile diffs after `pnpm install` on unchanged dependencies

### Pitfall 2: Workspace Protocol Not Updated on Publish
**What goes wrong:** Published packages contain `workspace:*` dependencies
**Why it happens:** Forgetting to replace workspace protocol before publish
**How to avoid:** pnpm automatically converts `workspace:*` to actual versions during `pnpm publish`
**Warning signs:** npm install fails with "workspace protocol not supported"

### Pitfall 3: Extension Development Mode WebSocket Connection
**What goes wrong:** Extension can't connect to MCP server in dev mode
**Why it happens:** Hardcoded localhost:3456 but mcptools runs on different port
**How to avoid:** Configure extension to use mcptools default port or pass port via WXT config
```typescript
// wxt.config.ts
export default defineConfig({
  manifest: {
    permissions: ['ws://localhost:6277/*']  // mcptools default port
  }
});
```
**Warning signs:** Extension shows "disconnected" status during dev

### Pitfall 4: TypeScript Path Mapping Breaks in Workspace
**What goes wrong:** `paths` in tsconfig.json don't resolve correctly after moving to packages/
**Why it happens:** Root paths no longer valid from package subdirectories
**How to avoid:** Use relative imports or workspace protocol, update paths per-package

### Pitfall 5: Filter Order in pnpm Commands
**What goes wrong:** `pnpm run build --filter ./packages/mcp` doesn't filter as expected
**Why it happens:** Options must come before the command, not after
**How to avoid:** `pnpm --filter ./packages/mcp run build` or `pnpm --filter ./packages/mcp build`

### Pitfall 6: WXT Firefox MV2 Support
**What goes wrong:** Extension built for MV3 doesn't work in Firefox (pre-Android)
**Why it happens:** WXT defaults to MV3, older Firefox requires MV2
**How to avoid:** Explicitly configure for MV2 in Firefox
```typescript
export default defineConfig({
  manifestVersion: 2,
  runner: {
    chromiumBinary: undefined,
    firefoxBinary: 'firefox-developer-edition'
  }
});
```

---

## Code Examples

### Root package.json Scripts
```json
{
  "name": "@blindflight/root",
  "private": true,
  "packageManager": "pnpm@10.4.1",
  "scripts": {
    "install:all": "pnpm install",
    "build": "pnpm run -r build",
    "build:mcp": "pnpm --filter ./packages/mcp build",
    "build:extension": "pnpm --filter ./packages/extension build",
    "dev": "pnpm run --parallel dev",
    "dev:mcp": "pnpm --filter ./packages/mcp dev",
    "dev:extension": "pnpm --filter ./packages/extension dev",
    "test": "pnpm run -r test",
    "test:mcp": "pnpm --filter ./packages/mcp test",
    "test:extension": "pnpm --filter ./packages/extension test",
    "typecheck": "pnpm run -r typecheck",
    "lint": "pnpm run -r lint",
    "clean": "pnpm run -r clean && rm -rf node_modules"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.6.2"
  }
}
```

### packages/mcp/package.json
```json
{
  "name": "@blindflight/mcp",
  "version": "0.1.3",
  "type": "module",
  "bin": {
    "blindflight-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm && shx chmod +x dist/*.js",
    "dev": "mcp web node dist/index.js --port 6277",
    "watch": "tsup src/index.ts --format esm --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "commander": "^13.1.0",
    "ws": "^8.18.1",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/ws": "^8.18.0",
    "shx": "^0.3.4",
    "tsup": "^8.4.0",
    "typescript": "^5.6.2"
  }
}
```

### packages/extension/package.json
```json
{
  "name": "@blindflight/extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "wxt -b firefox",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build -b firefox",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip -b firefox",
    "compile": "tsc --noEmit",
    "postinstall": "wxt prepare",
    "clean": "rm -rf .output .wxt"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.6.2",
    "wxt": "^0.20.15"
  }
}
```

### packages/extension/wxt.config.ts
```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 2,  // Firefox MV2 for broad compatibility
  manifest: {
    name: 'Blindflight',
    description: 'Browser automation for AI agents',
    permissions: [
      'activeTab',
      'tabs',
      'storage',
      'webRequest',
      '<all_urls>'
    ],
    browser_specific_settings: {
      gecko: {
        id: 'blindflight@blindflight.io',
        strict_min_version: '109.0'
      }
    }
  },
  runner: {
    firefoxBinary: 'firefox-developer-edition',
    startUrls: ['about:debugging']
  }
});
```

### mcptools Development Workflow
```bash
# Start MCP server with web interface (default port 41999)
mcp web node packages/mcp/dist/index.js

# Or use specific port
mcp web --port 6277 node packages/mcp/dist/index.js

# Interactive shell mode
mcp shell node packages/mcp/dist/index.js

# List available tools
mcp tools node packages/mcp/dist/index.js

# Call a tool directly
mcp call browser_navigate --params '{"url": "https://example.com"}' node packages/mcp/dist/index.js
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| npm workspaces (v7+) | pnpm workspaces | 2021+ | Better deduplication, workspace protocol, stricter dependency management |
| web-ext + custom scripts | WXT | 2023+ | TypeScript-first, HMR, file-based entrypoints, auto manifest |
| Manual MCP testing | mcptools | 2025 | Web UI, shell, proxy mode, mock server, scaffolding |
| manifest.json editing | WXT manifest config | 2023+ | Type-safe, auto MV2/MV3 conversion |

**Deprecated/outdated:**
- Custom XPI build scripts (replaced by WXT built-in packaging)
- Manual browser extension reload (replaced by WXT HMR)
- npm for monorepos (pnpm is now industry standard)

---

## Open Questions

1. **MCP Server Port in Dev Mode**
   - What we know: mcptools defaults to port 41999 for web UI, MCP proxy runs on port 6277
   - What's unclear: Whether to use mcptools proxy or direct server connection
   - Recommendation: Configure extension to connect to mcptools proxy port 6277 in dev mode

2. **Test Strategy for Extension**
   - What we know: WXT has built-in support for Playwright
   - What's unclear: Whether to add E2E tests in Phase 6 or defer
   - Recommendation: Defer comprehensive tests; add smoke test that verifies build output

3. **Extension Storage Migration**
   - What we know: Extension currently uses `storage` API with "browser_mcp_" prefix
   - What's unclear: Whether to migrate storage keys during rebrand to "blindflight_"
   - Recommendation: Handle storage migration in separate phase; Phase 6 focuses on structure only

4. **Shared Types Between Packages**
   - What we know: User deferred expansion beyond two packages
   - What's unclear: How to share types between MCP and extension without third package
   - Recommendation: Use direct source imports (per user decision) or duplicate minimal types

---

## Sources

### Primary (HIGH confidence)
- [/pnpm/pnpm.io](https://context7.com/pnpm/pnpm.io) - Workspace configuration, filtering, workspace protocol
- [/pnpm/pnpm](https://context7.com/pnpm/pnpm) - CLI commands, run, exec
- [/websites/wxt_dev_guide](https://context7.com/websites/wxt_dev_guide) - WXT configuration, manifest, entrypoints
- [/websites/wxt_dev](https://context7.com/websites/wxt_dev) - WXT API reference
- [pnpm.io/workspaces](https://pnpm.io/workspaces) - Official workspace documentation
- [f/mcptools](https://github.com/f/mcptools) - MCP development CLI

### Secondary (MEDIUM confidence)
- Web search for mcptools usage patterns and best practices
- WXT documentation for Firefox MV2 compatibility

### Tertiary (LOW confidence)
- None - all key claims verified with official sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools verified with official docs and Context7
- Architecture: HIGH - Based on pnpm official patterns and WXT conventions
- Pitfalls: MEDIUM-HIGH - Derived from common monorepo issues, some project-specific

**Research date:** 2026-02-11
**Valid until:** 2026-05-11 (90 days - stable ecosystem)

---

## Migration Notes from Current State

### Current Structure (Pre-Phase 6)
```
browser-mcp/
├── src/                    # MCP server source
├── extension/              # Firefox extension (vanilla JS)
│   ├── manifest.json       # MV2
│   ├── background.js
│   ├── content-script.js
│   └── popup.html
├── scripts/
│   └── build-xpi.mjs       # Custom XPI builder (454 lines)
├── package.json            # Root, uses npm
└── tsconfig.json
```

### Target Structure (Post-Phase 6)
```
blindflight/
├── packages/
│   ├── mcp/                # Moved from root src/
│   │   ├── src/
│   │   ├── dist/
│   │   └── package.json
│   └── extension/          # Migrated from extension/
│       ├── src/            # TypeScript entrypoints
│       ├── public/         # Static assets
│       ├── wxt.config.ts
│       └── package.json
├── pnpm-workspace.yaml
├── package.json            # Root with workspace scripts
└── pnpm-lock.yaml          # Unified lockfile
```

### Key Migration Tasks
1. Initialize pnpm workspace with `pnpm-workspace.yaml`
2. Move `src/` to `packages/mcp/src/`
3. Migrate extension to WXT structure under `packages/extension/`
4. Replace `scripts/build-xpi.mjs` with WXT build
5. Update root package.json with workspace scripts
6. Add mcptools to MCP package dev workflow
7. Verify Firefox MV2 compatibility in WXT config
8. Test root-level `pnpm install`, `pnpm build`, `pnpm test`
