# Project Research Summary

**Project:** Browser MCP Pre-Scraping Interface
**Domain:** MCP-compatible browser pre-scraping and selector discovery
**Researched:** 2026-02-09
**Confidence:** MEDIUM

## Executive Summary

This is a selector-first browser automation product: an LLM explores live pages, discovers robust selectors from accessibility snapshots, and then hands off to deterministic procedural extraction. The consistent pattern across research is to treat discovery and extraction as separate systems, connected by a validated selector/extraction-plan handoff. Teams that ship this reliably keep LLM usage in discovery only and avoid LLM-in-the-loop production extraction.

The recommended approach is a Playwright + MCP SDK stack using WebDriver BiDi-oriented browser control and MCP-native tool boundaries (`navigate`, `snapshot`, `wait_for`, `click`, `type`, `evaluate`, etc.). The stack should be tree-first (accessibility snapshots) with explicit fallback paths for hard cases (for example Shadow DOM and visual-only content), while preserving the project constraint to avoid CDP-dependent core features.

The highest execution risks are selector drift, flaky timing, silent bad data, and resource leaks under sustained load. Mitigation is architectural, not cosmetic: store multiple selectors with confidence metadata, enforce condition-based waits (never fixed sleeps), validate extracted data schemas on every run, and instrument browser lifecycle/resource controls from day one.

## Key Findings

### Recommended Stack

`STACK.md` supports a conservative, production-oriented stack centered on MCP SDK v1.26.0 and Playwright v1.51.0. This aligns with protocol compliance, cross-browser automation, and the repo constraint to avoid CDP-first implementation patterns.

**Core technologies:**
- **`@modelcontextprotocol/server@^1.26.0`**: MCP protocol layer - stable v1 API with strong tool/resource abstractions and compatibility with current MCP ecosystem.
- **`playwright@^1.51.0`**: Browser automation layer - mature high-level APIs, cross-browser support, and better operational ergonomics than low-level protocol handling.
- **`zod@^3.25.4`**: Schema/typing layer - stable runtime validation for tool inputs/outputs and extraction schemas.
- **`ws@^8.19.0`**: Transport layer - battle-tested WebSocket implementation for MCP/browser connectivity.
- **`cheerio@^1.0.0`**: Snapshot/DOM post-processing - fast semantic extraction and compression before LLM analysis.

**Critical version requirements:**
- Keep MCP packages on `1.26.x` for stability; do not move to v2 pre-alpha.
- Keep Node runtime at `>=18` for `ws@8` compatibility.
- Prefer stable Zod path (`3.25.x`) unless MCP dependency constraints force explicit v4 migration.

### Expected Features

`FEATURES.md` is clear that v1 must feel like a real browser MCP surface, not a demo: core navigation/interactions plus discovery-specific capabilities are non-negotiable.

**Must have (table stakes):**
- `navigate`, `snapshot`, `click`, `type`, `wait_for`, `evaluate`, `close`.
- Operational debugging primitives expected by users: `network_requests`, `console_messages`, `screenshot`, `select_option`, `press_key`.
- Core product differentiator in v1: LLM-guided selector discovery.

**Should have (post-launch differentiators):**
- Session persistence/storage state management.
- Shadow DOM-capable discovery via evaluate-assisted strategies.
- Incremental snapshots and code generation once base workflow is reliable.

**Defer (v2+):**
- Human handoff UX for CAPTCHA/MFA.
- Anti-bot evasion stack (proxy/fingerprint sophistication).
- Natural language targeting and self-healing selectors at scale.
- Parallel multi-agent execution infrastructure.

### Architecture Approach

`ARCHITECTURE.md` strongly recommends selector-centric separation: discovery (LLM) -> validation/handoff -> procedural extraction (no LLM). The architecture should keep MCP protocol layer, browser control layer, selector lifecycle, and extraction executor as distinct components with explicit boundaries.

**Major components:**
1. **Session Manager** - owns browser contexts, tab lifecycle, and state persistence/recovery.
2. **Page Controller** - handles deterministic actions (`navigate`, `click`, `type`, `wait`, `evaluate`) with retry/timeout policy.
3. **Selector Store + Validator** - stores selector candidates, confidence, provenance, and validates them against live DOM state.
4. **Handoff Manager / Plan Store** - converts discovered selectors into a versioned extraction plan and marks readiness state.
5. **Procedural Executor** - runs extraction plans without LLM involvement for repeatability, speed, and cost control.

### Critical Pitfalls

`PITFALLS.md` identifies recurring failure modes that should directly shape phase acceptance criteria.

1. **Selector fragility** - avoid single brittle selectors; generate multiple semantic candidates with confidence and fallback order.
2. **Implicit wait flakiness** - ban fixed sleeps; require condition-based waits (network/visibility/interactability).
3. **Browser resource explosion** - enforce cleanup in `finally`, context pooling, and lifecycle circuit breakers.
4. **Silent success data corruption** - validate schema/completeness, not just action success or HTTP status.
5. **LLM token explosion** - preprocess/compress snapshots and avoid raw full-page HTML to keep latency/cost bounded.

## Implications for Roadmap

Based on combined research, the roadmap should be dependency-first and reliability-gated.

### Phase 1: Foundation and Deterministic Core Tools
**Rationale:** Everything depends on stable transport, session lifecycle, and deterministic browser primitives.
**Delivers:** MCP server skeleton, session manager, `navigate`, `wait_for`, `snapshot`, `close`, baseline observability.
**Addresses:** Table-stakes core operations and discovery input generation.
**Avoids:** Implicit wait failures and resource leaks by setting hard engineering rules early.

### Phase 2: Selector Discovery Engine
**Rationale:** Core product value is selector discovery, so it should be first major capability after foundation.
**Delivers:** `click`, `type`, `select_option`, `press_key`, `evaluate`, selector capture pipeline, multi-candidate selector output, confidence scoring, snapshot preprocessing.
**Addresses:** v1 differentiator (LLM-guided discovery) and remaining core interaction features.
**Avoids:** Selector fragility, silent-success validation gaps, and token-cost blowups.

### Phase 3: Handoff and Plan Validation
**Rationale:** Discovery is not production-ready until selectors are validated and converted into executable plans.
**Delivers:** Selector validator, extraction-plan generation, plan persistence/versioning, explicit handoff APIs/state transitions.
**Addresses:** Discovery-to-procedural transition required by project core value.
**Avoids:** Tight coupling anti-pattern and unvalidated selector execution.

### Phase 4: Procedural Extraction and Reliability
**Rationale:** Once plans are trustworthy, procedural execution unlocks scalable repeated scraping.
**Delivers:** Plan executor, retries/backoff, schema validation on outputs, `network_requests` and `console_messages` tooling, failure classification.
**Addresses:** Deterministic repeated extraction and operational debugging expectations.
**Avoids:** Silent data corruption and unstable production behavior.

### Phase 5: Hardening and Advanced Capabilities
**Rationale:** Add complexity only after core workflow is stable and measurable.
**Delivers:** Session persistence polish, monitoring/alerts, rate limiting, optional anti-bot architecture hooks, optional vision fallback/human handoff exploration.
**Addresses:** Post-validation differentiators and scale.
**Avoids:** Premature investment in expensive v2 features before PMF.

### Phase Ordering Rationale

- Discovery depends on foundation primitives (`navigate` + `snapshot` + reliable waits), so it cannot be front-loaded.
- Handoff must precede procedural executor to preserve the architecture boundary and keep extraction deterministic.
- Reliability controls are introduced in each phase, then expanded in Phase 4/5 to prevent late-stage rewrites.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Snapshot preprocessing strategy and selector-confidence calibration (quality/cost trade-offs).
- **Phase 5:** Anti-bot and human handoff strategy (legal, operational, and UX complexity).

Phases with standard patterns (can likely skip extra research pass):
- **Phase 1:** MCP server setup + Playwright session/wait primitives are well-documented.
- **Phase 3:** Selector validation and plan handoff are well-established from architecture references.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strong official-source coverage (MCP docs/SDK, Playwright docs, version verification). |
| Features | HIGH | Broad agreement across MCP ecosystem references and concrete competitor comparisons. |
| Architecture | HIGH | Consistent with official MCP architecture and existing browser MCP implementations. |
| Pitfalls | MEDIUM | Strong practical signal, but many sources are community blogs and need context-specific validation. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Runtime constraints in this repo:** Local operational limits (memory/throughput/concurrency targets) are not yet benchmarked; define SLOs in roadmap phase planning.
- **Target-site profile:** No concrete target domains yet; anti-bot/session requirements may shift significantly once targets are known.
- **Schema standards:** Output schema contracts for extraction are not finalized; define per-domain schema versioning strategy before large-scale execution.
- **Security boundaries for `evaluate`:** Needs explicit guardrails and policy (allowed script scope, timeout, output sanitization).

## Sources

### Primary (HIGH confidence)
- `STACK.md` sources: Context7 (`/modelcontextprotocol/typescript-sdk`, `/microsoft/playwright`, `/puppeteer/puppeteer`), official MCP and W3C WebDriver BiDi documentation, npm version verification.
- `ARCHITECTURE.md` sources: MCP architecture docs, MCP TypeScript SDK docs, Microsoft Playwright MCP reference implementation.

### Secondary (MEDIUM confidence)
- `FEATURES.md` sources: Microsoft Playwright MCP docs/repo, browser-use and Stagehand docs, ecosystem surveys (Builder.io, Skyvern guide, No Hacks landscape).
- `PITFALLS.md` sources: Browserless, BrowserStack, Zyte, ScrapeGraphAI, and practitioner writeups on scraping reliability.

### Tertiary (LOW confidence)
- Industry statistics and competitive claims from non-peer-reviewed articles (for example maintenance-cost and relative-performance claims) should be validated with repo-specific telemetry.

---
*Research completed: 2026-02-09*
*Ready for roadmap: yes*
