# WebMCP source directory

Collected: 2026-09-05. This collection uses original specification, browser, and project sources.
Search results served only to find pages. They are not evidence for the technical notes.

## Specification and design sources

| Source | Purpose | Local copy |
| --- | --- | --- |
| [Published draft](https://webmachinelearning.github.io/webmcp/) | Complete Draft Community Group Report, dated 2026-09-04 | [HTML](snapshots/specification.html) |
| [Pinned specification source](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/index.bs) | Interfaces, algorithms, and unresolved specification sections | [Bikeshed](snapshots/index.bs) |
| [Pinned explainer](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/README.md) | Motivation, scope, examples, and best practices | [Markdown](snapshots/README.md) |
| [Declarative explainer](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/declarative-api-explainer.md) | HTML forms and proposed response behavior | [Markdown](snapshots/declarative-api-explainer.md) |
| [Service-worker proposal](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/docs/service-workers.md) | Background tools and discovery beyond an open page | [Markdown](snapshots/docs/service-workers.md) |
| [Security questionnaire](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/security-privacy-questionnaire.md) | Authors' security self-review | [Markdown](snapshots/security-privacy-questionnaire.md) |
| [Implementation status](https://github.com/webmachinelearning/webmcp/blob/50c4b7fd6c4402731271649bc544b662b061ed44/implementation-status.md) | Upstream browser and agent claims | [Markdown](snapshots/implementation-status.md) |

The service-worker explainer describes a supplemental proposal first published on 2025-08-28.
Its presence in the repository does not add service-worker interfaces to the current specification.

## Iteration and standards discussion

- [Commit history](https://github.com/webmachinelearning/webmcp/commits/main/): All upstream changes. The [local ledger](snapshots/commit-history.tsv) preserves 144 commits.
- [Issues](https://github.com/webmachinelearning/webmcp/issues): Design questions and problem reports.
- [Pull requests](https://github.com/webmachinelearning/webmcp/pulls): Proposed changes and reviews. The [local timeline](changes.md) links specific merged changes.
- [Web Machine Learning Community Group](https://www.w3.org/community/webmachinelearning/): Standards community responsible for the report.
- [Web Platform Tests results](https://wpt.fyi/results/webmcp): Browser test results linked by the specification. Results are live, not an archived support claim.
- [Mozilla position request](https://github.com/mozilla/standards-positions/issues/1412): Firefox standards discussion.
- [Firefox implementation tracker](https://bugzilla.mozilla.org/show_bug.cgi?id=2018306): Bugzilla link supplied by the upstream status page.
- [WebKit position request](https://github.com/WebKit/standards-positions/issues/670): WebKit standards discussion and concerns.

## Browser documentation

| Source | Page date observed | Contents |
| --- | --- | --- |
| [Chrome overview](https://developer.chrome.com/docs/ai/webmcp) | Updated 2026-08-07 | Access, limitations, permissions, and demos |
| [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api) | Updated 2026-09-01 | Registration, annotations, cancellation, discovery, and execution |
| [Chrome declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api) | Published 2026-05-18 | Form annotations, submission, events, and visual states |
| [Chrome best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices) | Published 2026-05-18 | Tool strategy, schemas, state, and evaluation |
| [Chrome tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools) | Updated 2026-09-01 | Prompt injection, hints, origin exposure, and tool design |
| [Chrome origin-trial announcement](https://developer.chrome.com/blog/ai-webmcp-origin-trial) | Published 2026-06-09 | Trial announcement and access |

Live implementation trackers:

- [Chrome Status](https://chromestatus.com/feature/5117755740913664)
- [Chrome trial registration](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241)
- [Chromium Intent to Experiment](https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8/m/OJxuQRP3AAAJ)
- [Edge trial](https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a)

Tracker links come from the original documentation. This collection does not archive trial eligibility or expiry dates.

## Frameworks, tools, and websites

The [ecosystem page](ecosystem.md) explains each project's role and limits.
These are the principal original sources:

- [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools): Demos, evaluation tools, and a demonstration polyfill.
- [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector): Browser extension for inspection and manual execution.
- [webmcp-evals](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals): Evaluation framework, distinct from browser conformance tests.
- [webmcp-types](https://github.com/webmachinelearning/webmcp-types): TypeScript declarations. The [npm registry](https://registry.npmjs.org/webmcp-types) supplies package metadata.
- [MCP-B documentation](https://docs.mcp-b.ai/): Third-party browser tooling and integration documentation.
- [MCP-B package repository](https://github.com/WebMCP-org/npm-packages): Bridges, polyfills, frameworks, and related packages.
- [React WebMCP package](https://github.com/WebMCP-org/npm-packages/tree/main/packages/react-webmcp): React registration hooks and lifecycle handling.
- [MCP-UI and WebMCP](https://github.com/WebMCP-org/mcp-ui-webmcp): Combined integration examples, not a browser standard.

## Known source disagreements

1. **Execution inputs:** The current draft accepts an object in `executeTool()`.
   Chrome's imperative guide still describes and demonstrates a JSON string under “Execute tool”.
   The [2026-08-17 change](https://github.com/webmachinelearning/webmcp/commit/a724ab1ddb7ea770f425934de4d9424e85599940) records the specification transition.
2. **Cancellation event names:** The declarative explainer uses `toolcanceled`.
   Chrome's declarative guide uses `toolcancel`.
   The draft still links unresolved event work. These names are not interchangeable evidence of browser behavior.
3. **User interaction:** Chrome's security guide references `requestUserInteraction()` and an old `model-context-client` section.
   The current draft has no `ModelContextClient` interface.
   The [2026-06-11 removal](https://github.com/webmachinelearning/webmcp/commit/067a1c90b5364b02742ef6ce40e5cf5a6497b445) explains that difference.
4. **Consequential actions:** The security questionnaire says a consequential-action hint is planned.
   The current draft already includes `consequentialHint`, added on [2026-09-03](https://github.com/webmachinelearning/webmcp/commit/7b3f50f31848b529e69bedbbdf8da0edccba055f).
   A hint is metadata, not proof of mandatory confirmation.
5. **Execution lifecycle:** Chrome's imperative guide assigns preservation of in-flight executions after unregistration to Chrome 153.
   The draft already specifies that behavior. Its presence in the draft does not establish support in earlier Chrome versions.

## Provenance and collection limits

The [manifest](snapshots/manifest.json) identifies each copied source with a pinned URL and a SHA-256 hash.
The rendered document's revision metadata matches the same source commit.
The [notices](snapshots/NOTICE.md) retain attribution and license terms.

The [commit ledger](snapshots/commit-history.tsv) records committer timestamps with their original UTC offsets.
A branch commit date can precede the date its pull request merged.
The timeline summarizes selected changes. The ledger includes editorial and maintenance commits too.

This collection does not install packages, run browser conformance tests, or prove framework compatibility.
It distinguishes source-reported support from directly tested behavior.
Live pages and package metadata can change after collection.

## Refresh procedure

1. Record the new upstream commit and published draft revision.
2. Read the commit range after `50c4b7fd6c4402731271649bc544b662b061ed44`.
3. Update the timeline with dates, source links, and resolved versus unresolved status.
4. Replace source snapshots from one revision and update their manifest hashes.
5. Read browser and framework sources again before changing support claims.
6. Check local links, specification anchors, and commit references.
