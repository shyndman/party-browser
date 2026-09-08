# WebMCP specification reference

Snapshot basis: published Community Group Draft dated 4 September 2026, generated from upstream commit [`50c4b7fd6c4402731271649bc544b662b061ed44`](https://github.com/webmachinelearning/webmcp/commit/50c4b7fd6c4402731271649bc544b662b061ed44). The normative source is [`index.bs`](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/index.bs); the rendered draft is [webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/). This is a CG-DRAFT, not a W3C Standard or Standards Track document.

## Purpose and scope

WebMCP lets a page expose JavaScript functions as named tools with natural-language descriptions and structured input schemas. A browser agent, an in-page agent, or assistive technology can discover and invoke those tools while the page retains its application state, UI, credentials, and client-side logic ([Introduction](https://webmachinelearning.github.io/webmcp/#intro)). The proposal complements backend MCP/OpenAPI integrations; it does not replace them or the human interface ([repository README](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/README.md)).

The draft also contains a declarative WebMCP section for HTML forms, but its detailed schema synthesis and response behavior remain proposal material; see [Declarative WebMCP](https://webmachinelearning.github.io/webmcp/#declarative-api) and the [declarative explainer](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/declarative-api-explainer.md).

## Core model

A `Document` has an associated `ModelContext` (`document.modelContext`). Internally, a model context maintains a tool map and a local pending-executions map. A tool definition contains:

* `name`: 1–128 characters, restricted to ASCII alphanumeric characters, `_`, `-`, and `.`; unique within the context.
* `title`: optional display label (a `USVString`).
* `description`: required string for agent selection and use.
* `input schema`: a stringified JSON Schema representation of the supplied `inputSchema` object.
* execute steps and optional annotations; registrations also track explicitly exposed origins.

The normative definitions are in [Supporting concepts](https://webmachinelearning.github.io/webmcp/#supporting-concepts). `inputSchema` is serialized at registration. Serialization failures reject registration rather than being silently repaired ([registration algorithm](https://webmachinelearning.github.io/webmcp/#dom-modelcontext-registertool)).

## Imperative API

The current WebIDL surface is:

```webidl
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool,
                                   optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(
      optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(RegisteredTool tool,
                                 optional object inputObject = {},
                                 optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange;
};
```

See the normative [IDL and method definitions](https://webmachinelearning.github.io/webmcp/#model-context). A tool is registered with, for example:

```js
await document.modelContext.registerTool({
  name: "add-todo",
  title: "Add todo",
  description: "Add an item to the active todo list",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"]
  },
  execute: async ({text}, {signal}) => {
    await addTodoItemToCollection(text, {signal});
    return {content: [{type: "text", text: `Added ${text}`} ]};
  }
});
```

### Registration and lifecycle

`registerTool(tool, options)` returns a promise. The draft rejects it with `InvalidStateError` for an inactive document, duplicate name, empty/invalid name or description; `NotAllowedError` when the `tools` Permissions Policy disallows the feature; `SecurityError` for an untrustworthy `exposedTo` origin; and the serialization exception (normally `TypeError`) when `inputSchema` cannot be JSON-serialized. An already-aborted registration signal rejects with its abort reason. Registration changes notify eligible contexts through `toolchange` ([algorithm](https://webmachinelearning.github.io/webmcp/#dom-modelcontext-registertool)).

There is no separate current `unregisterTool()` method. Pass an `AbortSignal` in `ModelContextRegisterToolOptions`; aborting it unregisters the tool. In-flight executions are deliberately preserved after unregistration, as recorded by [commit `fca7462`](https://github.com/webmachinelearning/webmcp/commit/fca7462d703c628f4cf110ddadd51e8e5b52a579). Dynamic registration is useful when page state changes, but authors should avoid flooding an agent with overlapping tools ([README best practices](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/README.md)).

The normative source snapshot is available at [`snapshots/index.bs`](snapshots/index.bs); the captured source inventory is [`snapshots/README.md`](snapshots/README.md).

### Discovery and execution

`getTools({fromOrigins})` returns `RegisteredTool` dictionaries from the caller's document tree. Same-origin documents are included by default; cross-origin documents require explicit secure origins in `fromOrigins`, and those documents must also have opted into exposure. A `RegisteredTool` carries the name, title, description, deep-copied input schema, owner `window`, origin, and annotations ([discovery options](https://webmachinelearning.github.io/webmcp/#dictdef-modelcontextgettooloptions), [RegisteredTool](https://webmachinelearning.github.io/webmcp/#registered-tool)).

`executeTool(tool, inputObject, options)` mediates execution in the owner document's realm and returns a promise for the stringified result. The browser checks the registered tool's owner/origin and the caller's requested origins before execution; however, the draft explicitly notes that rapid unregister/re-register can race with execution and is not fully protected, so callers must not assume same-name replacement is rejected in every race ([execution algorithm](https://webmachinelearning.github.io/webmcp/#dom-modelcontext-executetool)). `inputObject` is the current object form; older examples using a JSON string are historical and were corrected in [commit `a724ab1`](https://github.com/webmachinelearning/webmcp/commit/a724ab1ddb7ea770f425934de4d9424e85599940).

An `AbortSignal` in `executeTool` cancels a pending invocation. The callback receives execution options containing a signal, allowing page code to stop work. Cancellation and document-unload handling use browser-level pending-execution bookkeeping; natural completion can race cancellation, in which case the abort rejection wins ([AbortSignal integration](https://github.com/webmachinelearning/webmcp/commit/83e893ac3eaa8d72610062933c33a79494bf4fb5), [pending executions](https://webmachinelearning.github.io/webmcp/#pending-tool-executions)).

`toolchange` is an `EventTarget` event for an in-page agent to refresh its registry. Its cross-document ordering relative to unrelated task sources is intentionally not guaranteed. A proposed `toolcanceled` event is linked to [issue #146](https://github.com/webmachinelearning/webmcp/issues/146), so do not treat it as a stable current event contract.

## Annotations

The `ToolAnnotations` dictionary currently exposes optional hints: `readOnlyHint`, `untrustedContentHint`, and `consequentialHint`. They are metadata, not enforcement: a user agent or agent may use them when presenting or confirming an invocation. The consequential hint was added in [commit `7b3f50f`](https://github.com/webmachinelearning/webmcp/commit/7b3f50f31848b529e69bedbbdf8da0edccba055f). Do not infer that any hint guarantees confirmation or prevents side effects.

## Declarative forms (proposal status)

The companion explainer proposes `toolname`, `tooldescription`, and `toolautosubmit` on `<form>`, plus `toolparamdescription` on form controls. Forms would synthesize a JSON Schema from names, requiredness, types, choices, ranges, and related control attributes. With `toolautosubmit`, the agent may submit after filling; without it, the browser leaves the submit control for user review. The explainer proposes `SubmitEvent.agentInvoked`, `SubmitEvent.respondWith(Promise)`, `toolactivated`/`toolcanceled`, and CSS `:tool-form-active`/`:tool-submit-active` ([explainer](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/declarative-api-explainer.md)).

Important limitations: exact synthesis algorithms are explicitly TBD; form response handling is under debate in [issue #135](https://github.com/webmachinelearning/webmcp/issues/135); event target/bubbling is open in [issue #126](https://github.com/webmachinelearning/webmcp/issues/126); and how declarative tools participate in `getTools()`/`executeTool()` and `outputSchema` is unresolved. The explainer's earlier JSON-LD response example uses `application/ld+json`; its media type was corrected in [commit `3204721`](https://github.com/webmachinelearning/webmcp/commit/3204721c91b8a3e6aaac48bae7dce488e6eb91d7). Treat this as a proposal, not interoperable conformance guidance.

## Permissions, origins, and security

The `tools` Permissions Policy gates use. By default, top-level and same-origin descendants can participate; cross-origin iframe access requires both policy permission and explicit `exposedTo` origin opt-in. `exposedTo` accepts secure origins and controls which documents in the current tree may discover a tool. The built-in browser agent's default exposure and a future keyword such as `native-agent` remain under discussion ([README discussion](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/README.md), [issue #179](https://github.com/webmachinelearning/webmcp/issues/179)).

The specification's **non-normative** security section identifies prompt injection, malicious/untrusted tool content, tools as attack targets, privacy leakage through over-parameterization, same-origin-boundary risks, and private-browsing interactions ([Security and Privacy](https://webmachinelearning.github.io/webmcp/#security-privacy)). The draft notes that tools can wrap privileged actions and that authors/agents must not treat descriptions or annotations as trustworthy authorization. Same-origin-boundary analysis is still marked TODO.

The upstream [security questionnaire](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/security-privacy-questionnaire.md) records that registrations are document-lifetime state, callbacks run in the existing realm, and no new script-loading mechanism is introduced.

## What is not implied

This draft does not establish broad browser availability, autonomous-agent guarantees, persistent registrations, or a stable declarative-form API. Consult the separate [browser-support and ecosystem reference](browser-support.md) for implementation claims and the [change history](changes.md) for the distinction between merged specification changes and open proposals.
