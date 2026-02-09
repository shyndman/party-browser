---
phase: 02-interactive-selector-discovery
plan: 04
subsystem: documentation

tags:
  - documentation
  - workflow
  - selector-discovery
  - llm-guided
  - web-scraping

requires:
  - phase: 02-interactive-selector-discovery
    plan: 01
    provides: browser_evaluate tool for selector testing
  - phase: 02-interactive-selector-discovery
    plan: 02
    provides: browser_screenshot tool for visual verification

provides:
  - Complete LLM-guided selector discovery workflow documentation
  - User-facing guide with 5-step discovery process
  - Example prompts for common scenarios
  - README integration with usage section

affects:
  - User onboarding and discovery workflow adoption
  - Downstream procedural scraping implementation

tech-stack:
  added: []
  patterns:
    - "Documentation-driven workflow design"
    - "Example-driven user guidance"

key-files:
  created:
    - .planning/guides/selector-discovery-workflow.md - Complete workflow documentation (579 lines)
    - .planning/guides/discovery-examples.md - Example prompts for 4 scenarios (638 lines)
  modified:
    - README.md - Added Usage section with selector discovery workflow

key-decisions:
  - "Created comprehensive standalone guide rather than inline README documentation"
  - "Included 4 concrete examples: e-commerce, forms, dynamic content, tables"
  - "Documented selector artifact JSON format for downstream tooling"
  - "Added troubleshooting section for common selector issues"

patterns-established:
  - "User workflow documentation: 5-step process with clear prerequisites"
  - "Example-driven documentation with copy-paste prompts"
  - "Selector artifact format for standardized discovery output"

duration: 2min
completed: 2026-02-09
---

# Phase 02 Plan 04: Selector Discovery Workflow Documentation

**Complete LLM-guided selector discovery workflow with comprehensive guide, 4 concrete examples, and README integration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T23:30:46Z
- **Completed:** 2026-02-09T23:33:20Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

1. **Created comprehensive workflow guide** (579 lines)
   - 5-step LLM-guided discovery process (Explore → Identify → Generate → Validate → Export)
   - Complete prerequisites and setup instructions
   - Detailed tool usage for each phase
   - Full example discovery session with e-commerce site
   - Selector artifact JSON format specification
   - Best practices and troubleshooting guide

2. **Updated README with Usage section**
   - Added "Selector Discovery Workflow" overview
   - Documented 5-step process at high level
   - Added table of available discovery tools
   - Linked to comprehensive guide

3. **Created example prompts file** (638 lines)
   - E-commerce product discovery with pagination
   - Form interaction (search and results)
   - Dynamic content (shadow DOM, infinite scroll)
   - Table extraction with sorting/pagination
   - Each example includes: prompt, tool sequence, sample output, adaptation tips

## Task Commits

Each task was committed atomically:

1. **Task 1: Create workflow guide** - `1a23b26` (docs)
2. **Task 2: Add quick reference to README** - `890e0b2` (docs)
3. **Task 3: Create example prompts file** - `65b230b` (docs)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `.planning/guides/selector-discovery-workflow.md` — Complete workflow documentation with 5-step process, examples, best practices
- `.planning/guides/discovery-examples.md` — 4 concrete discovery scenarios with prompts and outputs
- `README.md` — Added Usage section with selector discovery overview and tool reference

## Decisions Made

1. **Separate guide vs inline README**: Chose to create a standalone comprehensive guide in `.planning/guides/` rather than expanding README inline. This keeps README concise while allowing detailed documentation.

2. **Example coverage**: Selected 4 diverse scenarios that cover most common use cases: e-commerce (basic extraction), forms (interaction), dynamic content (complex JS), tables (structured data).

3. **Selector artifact format**: Documented a standardized JSON format for discovery output to enable downstream procedural scraping tools to consume discovery results consistently.

4. **Priority-based selector ranking**: Established 4-tier priority system (semantic > test IDs > stable attributes > structural) to guide LLM toward robust selectors.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 2 complete**: All 4 plans finished
- **Documentation foundation**: Users can now follow the guide to run complete discovery passes
- **Ready for Phase 3**: Phase 3 work can reference documented workflow and build on established patterns

---

## Self-Check: PASSED

- [x] `.planning/guides/selector-discovery-workflow.md` exists (579 lines)
- [x] `.planning/guides/discovery-examples.md` exists (638 lines)
- [x] `README.md` updated with Usage section
- [x] `02-04-SUMMARY.md` created with frontmatter
- [x] All 3 task commits present: 1a23b26, 890e0b2, 65b230b
- [x] Summary commit present: ed9fa05

---

*Phase: 02-interactive-selector-discovery*
*Completed: 2026-02-09*
