# Phase 8: Clean-Break Rename + Rebrand - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 delivers a clean-break rename + rebrand for existing maintained surfaces only: unprefixed MCP tool names and consistent PartyBrowser branding, with no legacy compatibility aliases and no net-new capabilities.

</domain>

<decisions>
## Implementation Decisions

### Tool Naming Shape
- Public tool names are flat, unprefixed verbs/nouns (for example: `navigate`, `click`, `snapshot`).
- Naming convention is `snake_case`.
- Naming must be strictly consistent, even if some names are longer.
- Any naming collision discovered during planning is a fatal planning issue and must be escalated immediately.

### Legacy-Call Failure Experience
- Assume zero existing clients; do a hard clean break.
- Do not provide explanatory migration text for removed `browser_` names.
- Do not provide replacement mappings or suggestions.
- Do not add transitional/grace behavior.
- Legacy calls should fail with the standard generic tool-not-found style response only.

### Branding Surface Priority
- Canonical brand target is `PartyBrowser` everywhere in this phase (supersedes prior `blindflight` target wording).
- All maintained listed surfaces are mandatory in this phase (runtime/package/binary/docs surfaces as applicable).
- Zero active legacy `browsermcp` identifiers in maintained files.
- Execute branding updates as a single coordinated sweep.
- Rebrand operator-visible generated outputs as part of this phase.
- In maintained docs, avoid legacy historical naming notes.

### Claude's Discretion
- Exact file-by-file sequencing inside the single coordinated sweep.
- Exact internal identifier normalization where user-facing branding remains PartyBrowser.

</decisions>

<specifics>
## Specific Ideas

- "There are ZERO existing clients. we should build any of this. just change the names, and be done with it."
- "No explanatory text, no name mappings."
- "I don't want Blindflight anymore. I want it to be called PartyBrowser."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-clean-break-rename-rebrand*
*Context gathered: 2026-02-11*
