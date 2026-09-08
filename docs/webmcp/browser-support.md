# WebMCP browser support

Research snapshot: 2026-09-05. WebMCP is experimental and the API is still a proposal. “Supported” below means the cited source reports an implementation, trial, flag, or agent integration; it does **not** mean stable cross-browser conformance.

## At a glance

| Browser/agent | Evidence in the upstream status page | Practical reading |
| --- | --- | --- |
| Chrome | Origin Trial in **Chrome 149**; local development through `about:flags#enable-webmcp-testing`; Chrome Status and Intent to Experiment links | The clearest native browser implementation, but still trial/flag-gated rather than a stable baseline. |
| Microsoft Edge | Origin Trial in **Edge 150**; Edge trial page points readers to Chrome implementation status | Chromium-derived trial claim; do not infer stable Edge support from the trial. |
| Brave | Experimental support added to Leo AI chat; upstream status links Brave issue #55232 | Agent integration claim, not evidence that every Brave page exposes the platform API. |
| ChatGPT Desktop | Upstream status says WebMCP is supported in ChatGPT Desktop | Product/agent support claim; the status entry does not establish a general-purpose WebMCP browser API or version. |
| Firefox | Mozilla standards-position issue #1412 and Bugzilla #2018306 | No shipped support is reported. Mozilla's issue is labeled `position: neutral` and its project metadata says “Position is proposed”; this is a standards discussion, not an implementation signal. |
| Safari/WebKit | WebKit standards-position issue #670 | No shipped support is reported. The issue was opened 2026-05-28 and its page has concern labels but no affirmative implementation/version claim. |

Primary status source: [upstream implementation-status.md](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md). The status page is maintained by the proposal project and can change independently of release channels.

## Chrome: flags, trial, and tools

- Chrome's [WebMCP guide](https://developer.chrome.com/docs/ai/webmcp) says the API is available for local development by opening `chrome://flags/#enable-webmcp-testing`, setting it to **Enabled**, and relaunching. The same page links the [WebMCP Origin Trial](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241), says the trial is in Chrome 149, and links [Chrome Status](https://chromestatus.com/feature/5117755740913664), the [Intent to Experiment](https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8/m/OJxuQRP3AAAJ), and the early preview program.
- Chrome's [origin-trial announcement](https://developer.chrome.com/blog/ai-webmcp-origin-trial), published 2026-06-09, describes origin trials as time-limited early access and repeats Chrome 149. A trial is not a promise of eventual standardization or stable availability.
- The Chrome guide distinguishes an imperative JavaScript API and declarative HTML-form API, and documents origin isolation plus the `tools` Permissions Policy. In particular, it says WebMCP is disabled when `document.domain` is enabled; `tools` defaults to `self`; cross-origin iframes require `allow="tools"`. These are implementation prerequisites, not universal browser behavior.
- [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector) is a separate Chrome extension for observing schemas and manually executing tools. Its README says the “WebMCP for testing” flag is required in Chrome `150.0.7861.0` or higher. This version statement belongs to the extension README and should not be generalized into a Chrome stable WebMCP support claim.

## Edge, Brave, and agent products

- The upstream status page links Microsoft's [Edge Origin Trial entry](https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a) and records Edge 150. Verify current eligibility and dates at Microsoft's trial page before planning deployment.
- The upstream page links [Brave issue #55232](https://github.com/brave/brave-browser/issues/55232) for experimental Leo support. The wording is deliberately narrow: experimental support in Leo AI chat, not a claim that Brave has shipped all WebMCP APIs to ordinary web content.
- The upstream page records WebMCP support in [ChatGPT Desktop](https://chatgpt.com/download/). This describes an agent product integration and supplies no browser engine version or web-platform compatibility matrix.

## Firefox and WebKit positions

- [Mozilla standards-position #1412](https://github.com/mozilla/standards-positions/issues/1412) links the WebMCP draft and explainer, was opened 2026-05-28, is labeled `position: neutral`, and shows project metadata “Position is proposed”. It discusses two use cases: built-in browser agents and JavaScript agents (including cross-origin iframe scenarios). The page has no MDN, Can I Use, or Firefox implementation link filled in. The linked [Bugzilla #2018306](https://bugzilla.mozilla.org/show_bug.cgi?id=2018306) is therefore worth monitoring, not evidence of shipping support.
- [WebKit standards-position #670](https://github.com/WebKit/standards-positions/issues/670) was opened 2026-05-28 and links the draft, source repository, issue tracker, TAG review, and Mozilla issue. Its page lists concern labels (including API design, portability, security, and meaningful user consent) and no Safari/WebKit version or implementation. The upstream status page links this issue under Safari; that is a position request, not a Safari support statement.

## Testing and debugging options

1. For a local Chrome experiment, enable the WebMCP testing flag, relaunch, then use a WebMCP page/demo.
2. Use the [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector) to list registered tools, inspect input schemas, manually call a tool, and view structured results/errors. It is an extension, not a conformance harness.
3. For repeatable tool-calling experiments, [webmcp-evals](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals) documents `local`, `browser`, and deterministic `smoke` CLI modes. Its README calls the framework experimental; its outputs evaluate schemas/calls/workflows and do not certify browser support.
4. Use the [Chrome demos/source collection](https://github.com/GoogleChromeLabs/webmcp-tools) to compare imperative and declarative examples. Demos may rely on the repository's JavaScript polyfill, so inspect each demo before attributing behavior to native WebMCP.

## Support caveats

- No source read for this snapshot supports a stable, unflagged, multi-engine WebMCP baseline.
- Origin Trial, Early Preview, and browser flags are temporary access mechanisms; versions and behavior can change.
- Agent products and extensions can consume or emulate WebMCP without making the host browser a conforming implementation.
- A page-level polyfill can provide a compatibility-shaped API in browsers that lack WebMCP, but it cannot establish native security, permissions, lifecycle, or agent integration semantics. See [ecosystem.md](ecosystem.md) for the sourced polyfill and package distinction.
