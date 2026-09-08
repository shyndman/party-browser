# WebMCP ecosystem

Research snapshot: 2026-09-05. WebMCP is a proposed web-platform API, not the same thing as MCP servers or browser automation. The upstream explainer describes page-owned tools exposed through `document.modelContext`, with imperative JavaScript and declarative HTML-form approaches; it explicitly positions WebMCP as complementary to backend MCP integrations ([upstream README](https://github.com/webmachinelearning/webmcp/blob/main/README.md)).

## Primary implementation and specification material

- [WebMCP explainer and source](https://github.com/webmachinelearning/webmcp) — the upstream proposal and its living design discussion. Treat API details as draft: the repository is not a versioned browser compatibility guarantee.
- [WebMCP specification draft](https://webmachinelearning.github.io/webmcp/) — a **Draft Community Group Report** URL linked by the Mozilla and WebKit standards-position requests. It is not a W3C Standard or Standards Track guarantee, and does not imply implementation or standardization.
- [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp) — Chrome's developer-facing introduction, limitations, origin isolation and `tools` Permissions Policy requirements, demos, and inspector workflow. Chrome labels the feature an Origin Trial and says the page was updated 2026-08-07.

Chrome's focused guides: [Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api), [Best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices), and [secure tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools). These are implementation guidance for the experimental Chrome surface, not cross-browser standards conformance tests.

## Frameworks, wrappers, and bridges

- [MCP-B npm packages](https://github.com/WebMCP-org/npm-packages) — a third-party MIT-licensed package collection that describes itself as a polyfill and MCP bridge for `document.modelContext`. Its README lists `@mcp-b/webmcp-polyfill` (core polyfill), `@mcp-b/global` (polyfill plus MCP extensions), `@mcp-b/transports`, `@mcp-b/webmcp-extension`, `@mcp-b/webmcp-local-relay`, `@mcp-b/webmcp-types`, and `usewebmcp`. It explicitly says it is **not an official W3C or MCP project**. Treat its extension, relay, prompts/resources, and transport features as MCP-B additions rather than native WebMCP.
- [`@mcp-b/react-webmcp`](https://github.com/WebMCP-org/npm-packages/tree/main/packages/react-webmcp) — React 17–19 hooks, including `useWebMCP`, for registering tools and (when using its client pieces) consuming MCP servers. The package README says provider hooks call `document.modelContext.registerTool`, abort registration on unmount, and retain a `navigator.modelContext` fallback for older preview runtimes; it calls `document.modelContext` canonical. Its `outputSchema`, prompts, resources, and client/transport hooks are MCP-B extensions, not claims about the native Chrome API.
- [`usewebmcp`](https://github.com/WebMCP-org/npm-packages/tree/main/packages/usewebmcp) — the same package collection lists this as a React hook for strict core WebMCP only. The collection's README documents it as distinct from `@mcp-b/react-webmcp`; inspect its current package reference before assuming parity with native behavior.
- [MCP-UI + WebMCP](https://github.com/WebMCP-org/mcp-ui-webmcp) — a larger React/TypeScript example that embeds apps in iframes and bridges MCP UI resources to WebMCP-style tools. Its README identifies `@mcp-b/global`, `@mcp-b/react-webmcp`, and `@mcp-b/transports`, and describes `postMessage` iframe transports plus a Tic-Tac-Toe demo. This is an MCP-B application/bridge architecture, not a native-browser implementation.

### Historical API naming

Some framework documentation and older previews use `navigator.modelContext`. Current Chrome documentation and the draft surface use `document.modelContext`; MCP-B's React README explicitly documents a fallback for older preview runtimes. Search results or package examples using the historical name should not be silently presented as the current native API. Verify the package version and source before copying examples.

## Developer utilities and learning material

- [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools) — a collection of demos and developer utilities. Its README lists imperative demos (React flight search, pizza maker, maze, ticket booking, hotel chain, and others) and declarative demos (French bistro, order tracking, and others). These are demonstrations, not evidence that the sites are interoperable across browsers. The repository says it is **not an officially supported Google product**.
- [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector) — a Chrome extension for inspecting, monitoring, and manually executing page tools, optionally with Gemini. Its README requires the “WebMCP for testing” flag in Chrome `150.0.7861.0` or later, and documents Chrome Web Store and unpacked-source installation. It is a debugging client, not a WebMCP browser implementation, and its README carries the same “not officially supported Google product” disclaimer. [Chrome Web Store listing](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd).
- [webmcp-evals](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals) — experimental TypeScript/CLI evaluation tooling. Its README documents local schema evaluation, live browser evaluation through Puppeteer, deterministic `smoke` calls without an LLM, Gemini/Ollama/Vercel backends, and JSON/HTML reports. This evaluates tool calling and workflows; it is not a conformance test suite.

## Compatibility helpers and packages

- [WebMCP polyfill source](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/demos/shared/webmcp-polyfill.js) — a demo helper shipped inside the tools repository, not a separately versioned standards implementation. The source creates a `document.modelContext` substitute when absent, stores imperative registrations, derives schemas from forms, and uses `postMessage` to bridge remote frames. Because it emulates behavior in page JavaScript and includes its own cross-window protocol, do not report polyfill behavior as native browser support; review its source before relying on security or lifecycle semantics.
- [`webmcp-types` on npm](https://www.npmjs.com/package/webmcp-types) and [source repository](https://github.com/webmachinelearning/webmcp-types) — TypeScript declarations only. The npm registry identifies the package as “TypeScript type definitions for WebMCP”, MIT licensed, maintained by `fbeaufort`, with latest tag `0.1.6` in this snapshot. Types improve authoring but do not add runtime APIs or browser support.

## Demos and websites

- [WebMCP explainer demo](https://googlechromelabs.github.io/webmcp-tools/demos/explainer/) — Chrome's guide links this as a side-by-side comparison of DOM scraping versus calling a declared tool.
- [Pizza maker demo](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/pizza-maker) — imperative tool demo (called “zaMaker” in Chrome's guide).
- [React flight-search demo](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/react-flightsearch) — imperative React example.
- [French bistro demo](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/french-bistro) — declarative form example.

The demo index is intentionally more reliable than a generic search for “WebMCP”: it links source, labels imperative/declarative style, and identifies the polyfill as a helper. Names shared by unrelated “MCP” products, browser-agent frameworks, or server packages should not be treated as WebMCP support without a direct source showing `document.modelContext` or the WebMCP form attributes.

## How to read maturity claims

“Native” means a browser exposes the platform API behind its own implementation/flag/origin trial. “Polyfill” means page code imitates the API. “Inspector” and “evals” are tooling around an implementation. “Types” are compile-time declarations. None of the latter three establishes browser conformance. The upstream implementation-status page and the support table in [browser-support.md](browser-support.md) are the authority for browser status in this snapshot.
