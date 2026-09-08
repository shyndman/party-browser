# WebMCP reference library

Collected: **2026-09-05**. Source revision: [`50c4b7f`](https://github.com/webmachinelearning/webmcp/commit/50c4b7fd6c4402731271649bc544b662b061ed44).
The published draft is dated **2026-09-04**.

WebMCP lets websites expose page functions and HTML forms as tools for agents.
It complements backend Model Context Protocol (MCP) integrations rather than replacing them.
The [draft](https://webmachinelearning.github.io/webmcp/) is a **Draft Community Group Report**, not a W3C Standard or Standards Track document.

## Local index

| Page | Contents |
| --- | --- |
| [Specification reference](specification.md) | Current interfaces, tool registration, discovery, execution, cancellation, forms, and security |
| [Change history](changes.md) | Dated changes from 2025 through September 2026, with commit and pull-request links |
| [Browser support](browser-support.md) | Chrome and Edge trials, Firefox and WebKit positions, agent integrations, and debugging |
| [Ecosystem](ecosystem.md) | Frameworks, React wrappers, polyfills, bridges, type declarations, inspectors, demos, and guides |
| [Source directory](sources.md) | Primary websites, source provenance, known disagreements, and update procedure |
| [Full rendered specification](snapshots/specification.html) | Local copy of the complete published draft, with its original contents and section links |
| [Specification source](snapshots/index.bs) | Complete upstream Bikeshed source at the pinned revision |
| [Upstream explainer](snapshots/README.md) | Motivation, use cases, API examples, and authoring guidance |
| [Declarative explainer](snapshots/declarative-api-explainer.md) | Form attributes, schema synthesis, submission, and unresolved design questions |
| [Service-worker explainer](snapshots/docs/service-workers.md) | Historical supplemental proposal, not the current document-scoped API |
| [Security questionnaire](snapshots/security-privacy-questionnaire.md) | Upstream security self-review, including some stale descriptions |
| [Implementation status snapshot](snapshots/implementation-status.md) | Upstream browser and agent status claims |
| [Complete commit ledger](snapshots/commit-history.tsv) | All 144 commits reachable from the pinned revision, with dates and subjects |
| [Snapshot manifest](snapshots/manifest.json) | Source URLs, revision, byte counts, and SHA-256 hashes |
| [Source notices](snapshots/NOTICE.md) | Attribution and license terms for copied material |

## Important distinctions

- **Current draft versus older examples:** The current draft uses `document.modelContext`, promise-based registration, and object inputs to `executeTool()`.
  Older material uses `navigator.modelContext`, `provideContext()`, `unregisterTool()`, or JSON-string execution inputs.
  The [change history](changes.md) records these changes.
- **Draft versus implementation:** Chrome's guides and the current draft do not always agree.
  The [source directory](sources.md#known-source-disagreements) records concrete differences instead of silently choosing one.
- **Native versus emulated:** A framework, polyfill, browser extension, or MCP bridge does not establish native browser support.
  The [ecosystem](ecosystem.md) labels each kind.
- **Published versus complete:** The draft still contains unresolved declarative and security work.
  A merged specification change does not prove that browsers ship it.

The local HTML preserves the published document without changes.
Its main text is local, but external styles, scripts, logos, and linked references can require network access.
The source snapshots preserve upstream wording, examples, and unfinished sections. They are reference material, not PartyBrowser implementation code.
