# Feature Landscape

**Domain:** Browser MCP Pre-Scraping Tooling (LLM-Guided Selector Discovery)
**Researched:** February 9, 2026
**Confidence:** HIGH (based on official MCP specs, Playwright MCP implementation, and ecosystem analysis)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **navigate** | Core browser operation—must load pages | LOW | All MCP browser servers implement this; standard across ecosystem |
| **click** | Essential interaction primitive | LOW | Standard tool in Playwright MCP, browser-use, Skyvern |
| **type** | Form input is fundamental | LOW | Included in all browser MCP implementations |
| **snapshot** | LLM needs page state to reason | LOW | Accessibility tree snapshots are table stakes for non-vision approaches (Microsoft Playwright MCP default) |
| **wait_for** | Pages load asynchronously | LOW | Critical for timing—wait for element, text, or timeout |
| **evaluate** | Run JavaScript for custom extraction | MEDIUM | Required for complex data extraction beyond accessibility tree |
| **network_requests** | Debug and monitor HTTP traffic | MEDIUM | Standard in Playwright MCP; essential for API scraping workflows |
| **console_messages** | Debug JavaScript errors | LOW | Included in Microsoft Playwright MCP; useful for troubleshooting |
| **close** | Clean up resources | LOW | Basic lifecycle management |
| **screenshot** | Visual verification and debugging | LOW | Not for actions (use snapshot), but essential for verification |
| **select_option** | Dropdown interaction | LOW | Standard form control operation |
| **press_key** | Keyboard shortcuts and special keys | LOW | Arrow keys, Enter, Escape essential for navigation |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **LLM-guided selector discovery** | Discover robust selectors before writing procedural code—reduces maintenance by 80% when sites change | MEDIUM | Core value prop for pre-scraping phase; Skyvern, Stagehand, and browser-use lead here |
| **Accessibility tree snapshots** | 2-5KB vs 500KB for screenshots—faster inference, works with any LLM (no vision required) | MEDIUM | Microsoft's approach; 80% less context than vision-based alternatives |
| **Shadow DOM piercing** | Access elements inside Web Components (Lit, Shoelace)—critical for modern apps | HIGH | Standard accessibility trees miss these; requires raw JS eval or Playwright's shadow-piercing selectors |
| **Session persistence** | Reuse login state across runs—eliminates re-authentication overhead | MEDIUM | `--user-data-dir` in Playwright MCP; essential for authenticated workflows |
| **Human handoff (pause & attach)** | AI stops at CAPTCHA/MFA, human solves, AI continues—bridges automation gaps | MEDIUM | Only `playwriter` MCP server supports this natively in 2026 |
| **Anti-bot detection evasion** | Stealth headers, fingerprint rotation, proxy rotation—avoid blocks | HIGH | Differentiator for Skyvern, Browserbase, specialized tools |
| **Parallel agent execution** | Run multiple selectors discovery tasks simultaneously—faster at scale | MEDIUM | Cloud solutions (Skyvern, Browserbase) offer this |
| **Hybrid vision mode** | Auto-switch to screenshots for canvas/WebGL when accessibility tree fails | MEDIUM | Playwright MCP 2026 update added `--vision auto` |
| **Natural language element targeting** | "Click the blue submit button" instead of CSS selectors—self-healing when UI changes | HIGH | Stagehand, Skyvern differentiator; reduces brittle selector maintenance |
| **Self-healing selectors** | Auto-adapt when target element moves or changes attributes | HIGH | AI-powered adaptation vs brittle XPath/CSS |
| **Incremental snapshots** | Only send changed page state between actions—further reduce context | MEDIUM | Playwright MCP `--snapshot-mode incremental` |
| **Storage state management** | Save/load cookies, localStorage—restore sessions programmatically | LOW | `--storage-state` in Playwright MCP |
| **Network interception/mocking** | Modify requests/responses—useful for testing and bypassing restrictions | MEDIUM | Playwright core capability |
| **Console-level filtering** | Filter by error/warning/info—reduce noise | LOW | `--console-level` in Playwright MCP |
| **Code generation** | Output TypeScript/JavaScript for discovered workflows | MEDIUM | Playwright MCP `--codegen typescript` |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full CDP (Chrome DevTools Protocol) dependency** | Access to all browser internals | Violates project constraint; locks to Chrome; complex to maintain without Devtools | Use Playwright's abstraction layer; CDP only for extension mode if needed |
| **Vision-only approach** | Works with any visual model | 100x more tokens (500KB screenshot vs 2-5KB snapshot); slower inference; unnecessary cost | Accessibility tree primary, vision fallback for canvas/WebGL only |
| **Brittle XPath selectors** | Precise targeting | Break with every UI update; 19.2% of IT budgets wasted on script maintenance (industry stat) | LLM-guided semantic targeting; natural language element descriptions |
| **Recording-based automation** | Easy creation | Creates brittle scripts; doesn't adapt to changes; high maintenance burden | AI-powered semantic understanding; self-healing workflows |
| **Multi-browser support** | Cover all bases | Adds complexity; Chrome/Chromium covers 95% of use cases; Firefox/WebKit often unnecessary | Start with Chrome; add others only when demand justifies cost |
| **Real-time collaboration** | Multiple users on same session | Complex state synchronization; security concerns; rare use case | Session sharing via storage state export; separate sessions per user |
| **Built-in CAPTCHA solving** | Unattended automation | Arms race with CAPTCHA providers; legal gray area; often unreliable | Human handoff pattern; pause and attach for manual solving |
| **Automatic form submission** | Speed up workflows | Risk of unintended data changes; compliance issues | Explicit confirmation step; dry-run mode for safety |

## Feature Dependencies

```
[LLM-guided selector discovery]
    └──requires──> [snapshot]
        └──requires──> [navigate]

[Shadow DOM piercing]
    └──requires──> [evaluate]
        └──requires──> [snapshot]

[Session persistence]
    └──requires──> [close]
        └──requires──> [navigate]

[Human handoff]
    └──requires──> [headed mode]
        └──enhances──> [session persistence]

[Anti-bot evasion]
    └──enhances──> [navigate]
    └──conflicts──> [headless mode] (some detect headless)

[Hybrid vision mode]
    └──requires──> [snapshot]
    └──requires──> [screenshot]
        └──fallback──> [evaluate] (for canvas/WebGL)

[Natural language targeting]
    └──requires──> [LLM-guided selector discovery]
        └──requires──> [snapshot]

[Self-healing selectors]
    └──requires──> [natural language targeting]
        └──requires──> [LLM-guided selector discovery]
```

### Dependency Notes

- **LLM-guided selector discovery requires snapshot:** The LLM needs current page state (accessibility tree or DOM) to identify and suggest selectors
- **Shadow DOM piercing requires evaluate:** Standard snapshots miss shadow DOM; need JavaScript execution to access `shadowRoot`
- **Session persistence requires close:** Must properly close/save browser context to persist state to disk
- **Human handoff requires headed mode:** User needs visible browser to interact with; can't handoff in headless
- **Anti-bot conflicts with headless:** Many bot detection systems specifically check for headless indicators
- **Hybrid vision requires both snapshot and screenshot:** Need accessibility tree for efficiency, screenshot fallback for visual content

## MVP Definition

### Launch With (v1)

Minimum viable product—what's needed to validate the concept.

1. **navigate** — Core primitive; can't do anything without loading pages
2. **snapshot** — Essential for LLM to see page state; use accessibility tree approach
3. **click** — Basic interaction for selector discovery validation
4. **type** — Form input for testing discovered selectors
5. **wait_for** — Handle async page loads and transitions
6. **evaluate** — JavaScript execution for custom extraction and Shadow DOM access
7. **LLM-guided selector discovery** — Core differentiator; discover selectors procedurally before committing
8. **close** — Resource cleanup

### Add After Validation (v1.x)

Features to add once core is working.

1. **screenshot** — Visual verification; trigger when specifically requested
2. **network_requests** — Debug API calls; useful for advanced scraping workflows
3. **console_messages** — Troubleshooting JavaScript errors
4. **session persistence** — Reuse logins; high value for authenticated workflows
5. **press_key** — Keyboard navigation; special keys (Escape, Tab, Arrows)
6. **select_option** — Dropdown interaction; common in forms

### Future Consideration (v2+)

Features to defer until product-market fit is established.

1. **Human handoff** — Complex UX; solve CAPTCHA/MFA blockers
2. **Anti-bot evasion** — Specialized need; adds significant complexity
3. **Parallel execution** — Scale feature; needs infrastructure
4. **Natural language targeting** — Requires mature selector discovery first
5. **Self-healing selectors** — Advanced adaptation; build on solid base
6. **Hybrid vision mode** — Fallback for canvas/WebGL edge cases
7. **Code generation** — Export to Playwright/Puppeteer scripts

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| navigate | HIGH | LOW | P1 |
| snapshot | HIGH | LOW | P1 |
| click | HIGH | LOW | P1 |
| type | HIGH | LOW | P1 |
| wait_for | HIGH | LOW | P1 |
| evaluate | HIGH | MEDIUM | P1 |
| LLM-guided selector discovery | HIGH | MEDIUM | P1 |
| close | HIGH | LOW | P1 |
| screenshot | MEDIUM | LOW | P2 |
| network_requests | MEDIUM | MEDIUM | P2 |
| console_messages | LOW | LOW | P2 |
| session persistence | HIGH | MEDIUM | P2 |
| press_key | MEDIUM | LOW | P2 |
| select_option | MEDIUM | LOW | P2 |
| Shadow DOM piercing | MEDIUM | HIGH | P2 |
| human handoff | MEDIUM | MEDIUM | P3 |
| anti-bot evasion | MEDIUM | HIGH | P3 |
| parallel execution | MEDIUM | HIGH | P3 |
| natural language targeting | HIGH | HIGH | P3 |
| self-healing selectors | HIGH | HIGH | P3 |

**Priority key:**
- **P1:** Must have for launch—core functionality
- **P2:** Should have—add after validation
- **P3:** Nice to have—future consideration

## Competitor Feature Analysis

| Feature | Microsoft Playwright MCP | browser-use | Skyvern | Stagehand | Our Approach |
|---------|-------------------------|-------------|---------|-----------|--------------|
| **Core automation** (click, type, navigate) | ✅ 25+ tools | ✅ | ✅ | ✅ | ✅ P1 |
| **Accessibility tree snapshots** | ✅ Default | ❌ Vision-based | ✅ | ✅ | ✅ P1 (tree default) |
| **LLM-guided selector discovery** | ❌ | ✅ Core feature | ✅ | ✅ | ✅ P1 (core value) |
| **Shadow DOM support** | ⚠️ Limited | ✅ Full API | ✅ | ✅ | ✅ P2 (via evaluate) |
| **Session persistence** | ✅ `--user-data-dir` | ✅ | ✅ Cloud | ✅ | ✅ P2 |
| **Human handoff** | ❌ Manual only | ❌ | ❌ | ❌ | ⚠️ P3 (nice to have) |
| **Anti-bot evasion** | ❌ | ⚠️ Stealth | ✅ Built-in | ⚠️ Partial | ⚠️ P3 (defer) |
| **Natural language targeting** | ❌ | ✅ | ✅ | ✅ | ⚠️ P3 (build on base) |
| **Code generation** | ✅ TypeScript | ❌ | ❌ | ❌ | ⚠️ P3 |
| **No CDP required** | ✅ | ✅ | ⚠️ Uses CDP | ✅ | ✅ (constraint) |

**Legend:** ✅ Full support | ⚠️ Partial/limited | ❌ Not supported

## Key Insights from Research

### Industry Trends (2025-2026)

1. **MCP is the winning standard** — OpenAI, Google, and Microsoft all adopted MCP in 2025. Anthropic donated it to Linux Foundation December 2025. Custom protocols are legacy.

2. **Accessibility trees beat screenshots for most use cases** — Microsoft's Playwright MCP proved 2-5KB structured data outperforms 500KB screenshots for LLM reasoning. Vision reserved for edge cases (canvas, WebGL).

3. **Selector brittleness is the #1 pain point** — Industry data shows 19.2% of IT budgets wasted maintaining brittle XPath/CSS scripts. LLM-guided discovery is the solution.

4. **Session persistence separates toys from tools** — Production workflows require authenticated access. Re-authenticating on every run doesn't scale.

5. **Shadow DOM is the silent killer** — Modern design systems (Lit, Shoelace, Stencil) hide elements in shadow roots. Accessibility trees miss them. Raw JavaScript access essential.

### Architecture Implications

- **No CDP for core features** — Project constraint aligns with Playwright MCP approach (accessibility tree). CDP only needed for extension mode.
- **Prioritize selector discovery over execution** — Pre-scraping phase focuses on finding robust selectors, not just running them.
- **Tree-first, vision-fallback** — Follow Microsoft's proven approach for efficiency.

## Sources

- Microsoft Playwright MCP (github.com/microsoft/playwright-mcp) — Official implementation, 25+ browser tools, accessibility tree approach
- "6 most popular Playwright MCP servers for AI testing in 2026" (Bug0, January 2026) — Competitive analysis of MCP servers
- "Browser Automation MCP Servers Guide" (Skyvern, October 2025) — Enterprise patterns, anti-bot, CAPTCHA handling
- "The Agentic Browser Landscape in 2026" (No Hacks Podcast, January 2026) — Consumer and developer ecosystem overview
- "The Best MCP Servers for Developers in 2026" (Builder.io, December 2025) — MCP ecosystem survey, security best practices
- browser-use documentation (browser-use.com) — Open-source agent library patterns
- Stagehand documentation (stagehand.dev) — Natural language automation approach
- Web scraping industry reports — 19.2% maintenance cost statistic

---
*Feature research for: Browser MCP Pre-Scraping Tooling*
*Researched: February 9, 2026*
