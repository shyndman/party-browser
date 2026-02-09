# Selector Discovery Workflow

A comprehensive guide for LLM-guided selector discovery using Browser MCP tools. This workflow enables interactive exploration, identification, generation, and validation of CSS selectors for web scraping and automation.

---

## Overview

### What is Selector Discovery?

Selector discovery is the process of identifying the correct CSS selectors (or XPath expressions) that target specific elements on a web page. These selectors are essential for:

- **Web scraping**: Extracting data from websites programmatically
- **Browser automation**: Interacting with elements for testing or workflow automation
- **Data extraction**: Pulling structured information from unstructured web pages

### Why LLM-Guided Approach?

Traditional selector discovery requires manual inspection of HTML source code, which is:

- **Time-consuming**: Manually traversing DOM structures
- **Error-prone**: Easy to miss dynamic content or subtle page variations
- **Brittle**: Selectors may break when websites update

The LLM-guided approach leverages:

- **Accessibility snapshots**: Structured view of page elements with semantic information
- **Visual screenshots**: See the page as users see it
- **Interactive evaluation**: Test selectors in real-time against the live page
- **Iterative refinement**: Adjust selectors based on validation results

### Expected Outcome

A **selector artifact** — a structured JSON file containing validated, prioritized selectors with metadata:

```json
{
  "url": "https://example.com/products",
  "discovered_at": "2026-02-09T12:00:00Z",
  "selectors": [
    {
      "name": "product_title",
      "selector": "[data-testid='product-title']",
      "type": "css",
      "description": "Product name/title",
      "validated": true,
      "priority": 1
    }
  ]
}
```

---

## Prerequisites

Before starting a selector discovery session, ensure:

1. **Browser MCP Server Running**
   ```bash
   node dist/index.js
   ```

2. **Browser Extension Installed and Connected**
   - Chrome extension installed from the Chrome Web Store
   - Extension shows "Connected" status
   - At least one browser tab is open

3. **Target URL Ready**
   - Have the URL you want to scrape
   - Understand what data you need to extract

4. **LLM Client with MCP Support**
   - VS Code with MCP extension, Claude Desktop, Cursor, or Windsurf
   - Browser MCP server configured as an MCP tool provider

---

## The 5-Step Workflow

### Step 1: Page Exploration

**Goal**: Understand the page structure and identify potential target elements.

**Tools**: `browser_navigate`, `browser_screenshot`, `browser_snapshot`

**Process**:

1. **Navigate** to the target page:
   ```
   browser_navigate({ url: "https://example.com/products" })
   ```

2. **Take a screenshot** to see the visual layout:
   ```
   browser_screenshot()
   ```

3. **Get a snapshot** to see the accessibility tree with semantic structure:
   ```
   browser_snapshot()
   ```

**Example prompt chain for the LLM**:
```
1. Navigate to https://example.com/products
2. Take a screenshot to see the visual layout  
3. Get a snapshot to see the accessibility tree
```

**What to look for**:
- Visual layout and element positioning
- Semantic landmarks (main, article, navigation regions)
- Interactive elements (buttons, links, forms)
- Data-rich regions (product listings, tables, cards)

---

### Step 2: Target Identification

**Goal**: Identify what elements to extract and understand their semantic meaning.

**Tool**: `browser_evaluate` for custom JavaScript inspection

**Process**:

Use `browser_evaluate` to run inspection scripts that reveal page structure:

**Count elements of a type**:
```javascript
browser_evaluate({ script: "document.querySelectorAll('.product').length" })
```

**Check for shadow DOM** (affects selector strategy):
```javascript
browser_evaluate({ script: "!!document.querySelector('*').shadowRoot" })
```

**Find semantic landmarks**:
```javascript
browser_evaluate({ script: "document.querySelectorAll('[role=main], [role=article]').length" })
```

**List all data attributes**:
```javascript
browser_evaluate({ script: "
  const elements = document.querySelectorAll('[data-*]');
  const attributes = new Set();
  elements.forEach(el => {
    el.getAttributeNames().forEach(attr => {
      if (attr.startsWith('data-')) attributes.add(attr);
    });
  });
  return Array.from(attributes);
" })
```

**Example prompt for the LLM**:
```
Explore the page structure to identify:
1. How many product cards are on the page
2. What data attributes are available for targeting
3. Whether there are test IDs (data-testid attributes)
4. If shadow DOM is being used
```

---

### Step 3: Candidate Generation

**Goal**: Generate selector candidates using the information gathered.

**Process**:

The LLM analyzes the snapshot and screenshot to propose selector candidates. Use this **priority order** when choosing selectors:

1. **Semantic selectors** (highest priority)
   - ARIA roles: `[role="button"]`, `[role="article"]`
   - ARIA labels: `[aria-label="Add to cart"]`
   - ARIA labelledby: `[aria-labelledby="product-name"]`

2. **Test IDs** (high priority)
   - `data-testid` attributes: `[data-testid="product-title"]`
   - `data-test-id` attributes: `[data-test-id="price"]`

3. **Stable attributes** (medium priority)
   - IDs: `#product-list`
   - Names: `[name="search"]`
   - Types: `input[type="email"]`

4. **Structural selectors** (lowest priority — most brittle)
   - CSS paths: `.product-list > .product:nth-child(1)`
   - Child combinators: `.card > .title`

**Selector artifact structure**:

```json
{
  "url": "https://example.com/products",
  "discovered_at": "2026-02-09T12:00:00Z",
  "selectors": [
    {
      "name": "product_title",
      "selector": "[data-testid='product-title']",
      "type": "css",
      "description": "Product name/title text",
      "validated": true,
      "priority": 1,
      "rationale": "data-testid is stable and specific"
    },
    {
      "name": "product_price",
      "selector": ".product-price .amount",
      "type": "css", 
      "description": "Product price amount",
      "validated": true,
      "priority": 2,
      "rationale": "Class-based selector, verified across multiple products"
    }
  ]
}
```

---

### Step 4: Validation

**Goal**: Verify that selectors match the expected elements and return correct data.

**Tool**: `browser_evaluate` to test selectors

**Process**:

**Test selector matches**:
```javascript
browser_evaluate({ script: "
  const elements = document.querySelectorAll('[data-testid=\"price\"]');
  return {
    count: elements.length,
    sample: elements[0]?.textContent?.substring(0, 50) || null
  };
" })
```

**Verify element content**:
```javascript
browser_evaluate({ script: "
  const titles = Array.from(document.querySelectorAll('.product-title'))
    .map(el => el.textContent.trim())
    .slice(0, 5);
  return titles;
" })
```

**Check selector specificity**:
```javascript
browser_evaluate({ script: "
  // Verify selector only matches intended elements
  const allMatches = document.querySelectorAll('.price');
  const inProductCards = document.querySelectorAll('.product .price');
  return {
    totalMatches: allMatches.length,
    matchesInProducts: inProductCards.length
  };
" })
```

**Example validation workflow**:
```
1. Test if [data-testid="product-title"] finds all product titles
2. Verify the first 3 titles match expected content
3. Confirm the selector is specific (doesn't match unintended elements)
4. Document any variations (different selectors for sale vs regular prices)
```

---

### Step 5: Interaction Verification (if needed)

**Goal**: Verify that interactive elements work correctly for data extraction workflows.

**Tools**: `browser_click`, `browser_type`, `browser_select_option`, `browser_wait_for`

**Process**:

**Test "Load More" buttons**:
```
1. Record current product count: browser_evaluate({ script: "document.querySelectorAll('.product').length" })
2. Click "Load More": browser_click({ element: "e123" })  // ref from snapshot
3. Wait for new content: browser_wait_for({ mode: "time", value: 2 })
4. Verify count increased: browser_evaluate({ script: "document.querySelectorAll('.product').length" })
```

**Test search forms**:
```
1. Type search term: browser_type({ element: "e456", text: "laptop" })
2. Submit search: browser_press_key({ key: "Enter" })
3. Wait for results: browser_wait_for({ mode: "text", value: "results", timeout: 5 })
4. Verify results loaded: browser_evaluate({ script: "document.querySelectorAll('.search-result').length" })
```

**Test dropdown filters**:
```
1. Select option: browser_select_option({ element: "e789", option: "Price: Low to High" })
2. Wait for resort: browser_wait_for({ mode: "time", value: 1 })
3. Verify order changed: browser_evaluate({ script: "/* check price sorting */" })
```

---

## Example: Complete Discovery Session

Here's a complete example showing the full workflow on an e-commerce site:

### Scenario: Extract product data from example-shop.com

**Step 1 - Exploration**:
```
User: Navigate to https://example-shop.com/electronics and explore the product listing page.

LLM: 
1. browser_navigate({ url: "https://example-shop.com/electronics" })
2. browser_screenshot()  → Shows grid of 12 product cards
3. browser_snapshot()    → Shows accessibility tree with product refs
```

**Step 2 - Inspection**:
```
User: Inspect the page structure to understand how products are organized.

LLM:
browser_evaluate({ script: "document.querySelectorAll('[data-testid]').map(el => el.getAttribute('data-testid'))" })
→ Returns: ["product-card", "product-image", "product-title", "product-price", "add-to-cart"]

browser_evaluate({ script: "document.querySelectorAll('.product-card').length" })
→ Returns: 12
```

**Step 3 - Candidate Generation**:
```
Based on inspection, I propose these selectors:

1. Product title: [data-testid="product-title"] (Priority 1 - test ID)
2. Product price: [data-testid="product-price"] (Priority 1 - test ID)
3. Product image: [data-testid="product-image"] img (Priority 1 - test ID)
4. Add to cart button: [data-testid="add-to-cart"] (Priority 1 - test ID)
```

**Step 4 - Validation**:
```
LLM:
browser_evaluate({ script: "
  const cards = document.querySelectorAll('[data-testid=\"product-card\"]');
  return Array.from(cards).slice(0, 3).map(card => ({
    title: card.querySelector('[data-testid=\"product-title\"]')?.textContent?.trim(),
    price: card.querySelector('[data-testid=\"product-price\"]')?.textContent?.trim()
  }));
"})

→ Returns:
[
  { title: "Wireless Headphones", price: "$79.99" },
  { title: "USB-C Cable", price: "$12.99" },
  { title: "Bluetooth Speaker", price: "$45.99" }
]
```

**Step 5 - Interaction Test**:
```
User: Test the "Load More" functionality.

LLM:
1. browser_evaluate({ script: "document.querySelectorAll('.product-card').length" })
   → Returns: 12
2. browser_click({ element: "e55" })  // Load More button ref
3. browser_wait_for({ mode: "time", value: 2 })
4. browser_evaluate({ script: "document.querySelectorAll('.product-card').length" })
   → Returns: 24 (success!)
```

**Final Selector Artifact**:
```json
{
  "url": "https://example-shop.com/electronics",
  "discovered_at": "2026-02-09T14:30:00Z",
  "requires_interaction": true,
  "interactions": [
    {
      "name": "load_more",
      "description": "Click to load additional products",
      "selector": "[data-testid=\"load-more\"]",
      "type": "css",
      "repeat_until": "no_new_products"
    }
  ],
  "selectors": [
    {
      "name": "product_card",
      "selector": "[data-testid=\"product-card\"]",
      "type": "css",
      "description": "Container for each product",
      "validated": true,
      "priority": 1
    },
    {
      "name": "product_title",
      "selector": "[data-testid=\"product-title\"]",
      "type": "css",
      "description": "Product name/title",
      "validated": true,
      "priority": 1
    },
    {
      "name": "product_price",
      "selector": "[data-testid=\"product-price\"]",
      "type": "css",
      "description": "Product price text",
      "validated": true,
      "priority": 1
    }
  ]
}
```

---

## Selector Artifact Format

The standard output format for discovered selectors:

```json
{
  "url": "string - the page URL where selectors were discovered",
  "discovered_at": "ISO 8601 timestamp",
  "requires_interaction": "boolean - whether manual interaction is needed",
  "interactions": [
    {
      "name": "string - identifier for the interaction",
      "description": "string - what this interaction does",
      "selector": "string - CSS selector for the interactive element",
      "type": "css | xpath",
      "repeat_until": "string - condition to stop repeating (optional)"
    }
  ],
  "selectors": [
    {
      "name": "string - descriptive identifier",
      "selector": "string - the actual CSS/XPath selector",
      "type": "css | xpath",
      "description": "string - what this selector targets",
      "validated": "boolean - whether tested on live page",
      "priority": "number - 1 (best) to 4 (brittle)",
      "rationale": "string - why this selector was chosen (optional)"
    }
  ]
}
```

---

## Best Practices

### Selector Selection

1. **Prefer semantic over structural**
   - ✅ `[data-testid="product-title"]`
   - ❌ `.product-list > div:nth-child(3) > span.title`

2. **Validate on multiple page variations**
   - Test on different product categories
   - Check both populated and empty states
   - Verify behavior with filters applied

3. **Document rationale**
   - Why was this selector chosen?
   - What alternatives were considered?
   - Under what conditions might it break?

4. **Test interactions before finalizing**
   - Click through pagination
   - Test search functionality
   - Verify form submissions work

### Workflow Efficiency

1. **Start broad, then narrow**
   - First understand overall page structure
   - Then focus on specific target elements

2. **Use screenshots for visual confirmation**
   - Verify selectors target visible elements
   - Check for overlays or modals that might interfere

3. **Combine tools strategically**
   - Snapshot for structure
   - Screenshot for visual context
   - Evaluate for testing selectors

4. **Iterate quickly**
   - Test selector variations in rapid succession
   - Use `browser_evaluate` to test multiple selectors at once

---

## Troubleshooting

### Common Issues and Solutions

**Selector returns wrong element**
- **Symptom**: Selector matches, but extracts wrong data
- **Cause**: Selector too broad, matches multiple element types
- **Solution**: Add more specific criteria
  ```javascript
  // Too broad
  document.querySelector('.price')
  
  // More specific
  document.querySelector('.product-card .price.current')
  ```

**Selector breaks on page update**
- **Symptom**: Was working, now returns null or wrong element
- **Cause**: Website changed class names or structure
- **Solution**: Prefer stable attributes over classes
  ```javascript
  // Brittle (class names change often)
  document.querySelector('.ProductCard_title__abc123')
  
  // Stable (data attributes are intentional)
  document.querySelector('[data-testid="product-title"]')
  ```

**Element not found**
- **Symptom**: Selector returns null
- **Cause**: Lazy loading, delayed rendering, or wrong selector
- **Solutions**:
  1. Wait for content to load:
     ```
     browser_wait_for({ mode: "time", value: 2 })
     ```
  2. Check if element is in shadow DOM
  3. Verify selector syntax (typos, wrong quotes)

**Inconsistent results**
- **Symptom**: Sometimes works, sometimes doesn't
- **Cause**: Dynamic content, A/B testing, or race conditions
- **Solution**: Add explicit waits and retries
  ```javascript
  // Check multiple times
  for (let i = 0; i < 3; i++) {
    const el = document.querySelector('.dynamic-content');
    if (el) return el.textContent;
    await new Promise(r => setTimeout(r, 500));
  }
  ```

**Shadow DOM elements**
- **Symptom**: Standard selectors don't find elements you can see
- **Cause**: Content inside Shadow DOM
- **Solution**: Access via shadowRoot
  ```javascript
  const host = document.querySelector('custom-element');
  const shadowContent = host?.shadowRoot?.querySelector('.target');
  ```

---

## Next Steps

After completing selector discovery:

1. **Export the artifact** — Save the JSON selector artifact for use in scraping scripts
2. **Document edge cases** — Note any special conditions or variations
3. **Set up monitoring** — Plan to re-validate selectors periodically as websites change
4. **See examples** — Check [discovery-examples.md](./discovery-examples.md) for more scenarios

---

*Last updated: 2026-02-09*
