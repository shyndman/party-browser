# Selector Discovery Examples

Concrete example prompts for common selector discovery scenarios. Copy and adapt these for your own discovery sessions.

---

## Table of Contents

1. [E-commerce Product Discovery](#example-1-e-commerce-product-discovery)
2. [Form Interaction](#example-2-form-interaction)
3. [Dynamic Content](#example-3-dynamic-content)
4. [Table Extraction](#example-4-table-extraction)

---

## Example 1: E-commerce Product Discovery

**Scenario**: Extract product information from an online store with pagination.

### User Prompt

```
I need to extract product data from https://example-shop.com/electronics. 
The page shows a grid of product cards with:
- Product name/title
- Price (current and possibly original/sale price)
- Product image URL
- Rating/stars

Please:
1. Navigate to the page and explore the structure
2. Identify selectors for each data field
3. Handle the "Load More" button to get all products
4. Validate selectors work on multiple products
5. Provide a JSON artifact with all discovered selectors
```

### Expected Tool Sequence

```
browser_navigate({ url: "https://example-shop.com/electronics" })
browser_screenshot()
browser_snapshot()

// Inspection phase
browser_evaluate({ script: "document.querySelectorAll('[data-testid]').length" })
browser_evaluate({ script: "document.querySelectorAll('.product, .product-card').length" })

// Test candidate selectors
browser_evaluate({ script: `
  const cards = document.querySelectorAll('[data-testid="product-card"]');
  return Array.from(cards).slice(0, 3).map(card => ({
    title: card.querySelector('[data-testid="product-title"]')?.textContent?.trim(),
    price: card.querySelector('[data-testid="price"]')?.textContent?.trim(),
    image: card.querySelector('[data-testid="product-image"] img')?.src
  }));
`})

// Test pagination
browser_evaluate({ script: "document.querySelectorAll('[data-testid=\"product-card\"]').length" })
browser_click({ element: "e123" }) // Load More button ref from snapshot
browser_wait_for({ mode: "time", value: 2 })
browser_evaluate({ script: "document.querySelectorAll('[data-testid=\"product-card\"]').length" })
```

### Sample Output

```json
{
  "url": "https://example-shop.com/electronics",
  "discovered_at": "2026-02-09T14:30:00Z",
  "requires_interaction": true,
  "selectors": {
    "product_card": {
      "selector": "[data-testid='product-card']",
      "type": "css",
      "description": "Individual product container",
      "priority": 1
    },
    "product_title": {
      "selector": "[data-testid='product-title']",
      "type": "css", 
      "description": "Product name",
      "priority": 1
    },
    "product_price": {
      "selector": "[data-testid='price'] .current",
      "type": "css",
      "description": "Current price (excludes strikethrough original)",
      "priority": 1
    },
    "product_image": {
      "selector": "[data-testid='product-image'] img",
      "type": "css",
      "description": "Product image URL",
      "priority": 1
    },
    "load_more_button": {
      "selector": "[data-testid='load-more']",
      "type": "css",
      "description": "Button to load additional products",
      "priority": 1
    }
  }
}
```

### Tips for Adaptation

- **No data-testid?** Look for semantic roles: `[role="article"]`, `[role="listitem"]`
- **Dynamic loading?** Increase wait time or wait for specific text to appear
- **Multiple price formats?** Test for both `$19.99` and `19.99 USD` patterns
- **Lazy images?** Check `data-src` attribute in addition to `src`

---

## Example 2: Form Interaction

**Scenario**: Fill out a search form, submit it, and extract results.

### User Prompt

```
I need to search for "laptop" on https://example-search.com and extract the results.

The search page has:
- A search input field
- Category dropdown (optional)
- A submit button
- Results appear on a new page or dynamically

Please:
1. Navigate to the search page
2. Identify the search input and submit button
3. Fill in "laptop" and submit
4. Wait for results to load
5. Extract result titles and URLs
6. Document the complete interaction flow
```

### Expected Tool Sequence

```
// Exploration
browser_navigate({ url: "https://example-search.com" })
browser_screenshot()
browser_snapshot()

// Identify form elements
browser_evaluate({ script: `
  const searchInput = document.querySelector('input[type="search"], input[name="q"]');
  const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
  return {
    hasSearchInput: !!searchInput,
    searchInputSelector: searchInput ? 'input[type="search"]' : null,
    hasSubmitButton: !!submitBtn,
    submitButtonSelector: submitBtn ? 'button[type="submit"]' : null
  };
`})

// Fill and submit
browser_type({ element: "e45", text: "laptop" })  // Search input ref
browser_click({ element: "e67" })  // Submit button ref

// Wait for results (adjust mode based on behavior)
browser_wait_for({ mode: "text", value: "laptop", timeout: 5 })
// OR for SPAs without URL change:
browser_wait_for({ mode: "time", value: 2 })

// Extract results
browser_evaluate({ script: `
  const results = document.querySelectorAll('.search-result, [data-testid="search-result"]');
  return Array.from(results).slice(0, 5).map(result => ({
    title: result.querySelector('h2, .title, [data-testid="title"]')?.textContent?.trim(),
    url: result.querySelector('a')?.href,
    snippet: result.querySelector('.snippet, .description')?.textContent?.trim()
  }));
`})
```

### Sample Output

```json
{
  "url": "https://example-search.com",
  "discovered_at": "2026-02-09T14:45:00Z",
  "interaction_type": "form_submission",
  "workflow": [
    {
      "step": 1,
      "action": "type",
      "target": "search_input",
      "selector": "input[type='search']",
      "value": "laptop"
    },
    {
      "step": 2,
      "action": "click",
      "target": "submit_button",
      "selector": "button[type='submit']"
    },
    {
      "step": 3,
      "action": "wait",
      "mode": "text",
      "value": "laptop",
      "timeout": 5
    }
  ],
  "selectors": {
    "search_input": {
      "selector": "input[type='search']",
      "type": "css",
      "priority": 1
    },
    "submit_button": {
      "selector": "button[type='submit']",
      "type": "css",
      "priority": 1
    },
    "result_item": {
      "selector": "[data-testid='search-result']",
      "type": "css",
      "priority": 1
    },
    "result_title": {
      "selector": "[data-testid='search-result'] h2",
      "type": "css",
      "priority": 1
    },
    "result_url": {
      "selector": "[data-testid='search-result'] a",
      "type": "css",
      "priority": 1
    }
  }
}
```

### Tips for Adaptation

- **Enter key vs button click**: Some forms submit on Enter, others require button click
- **AJAX results**: Use `browser_wait_for({ mode: "text", ... })` to detect when results appear
- **Pagination**: Check for both numbered pages and "Next" buttons
- **Filters**: Document any additional form fields (date range, category, etc.)

---

## Example 3: Dynamic Content

**Scenario**: Handle JavaScript-rendered content, modals, and infinite scroll.

### User Prompt

```
I need to extract data from https://example-dynamic.com which loads content via JavaScript.

Challenges:
- Content loads after page load (AJAX/fetch)
- Some data is behind a "Show More" modal
- There's an infinite scroll that loads more items
- Some elements are in a shadow DOM

Please:
1. Navigate and wait for initial content
2. Identify if shadow DOM is used
3. Handle the modal interaction to reveal hidden content
4. Test infinite scroll functionality
5. Extract all available data
```

### Expected Tool Sequence

```
// Initial navigation with wait
browser_navigate({ url: "https://example-dynamic.com" })
browser_wait_for({ mode: "time", value: 3 })  // Wait for JS to render

// Check for shadow DOM
browser_evaluate({ script: `
  const allElements = document.querySelectorAll('*');
  const shadowHosts = Array.from(allElements).filter(el => el.shadowRoot);
  return {
    hasShadowDOM: shadowHosts.length > 0,
    shadowHostCount: shadowHosts.length,
    hostTags: shadowHosts.slice(0, 3).map(el => el.tagName.toLowerCase())
  };
`})

// Check initial content
browser_evaluate({ script: "document.querySelectorAll('.item, [data-testid=\"item\"]').length" })

// Trigger modal to show more
browser_click({ element: "e89" })  // "Show More" button
browser_wait_for({ mode: "time", value: 1 })

// Check modal content
browser_evaluate({ script: `
  const modal = document.querySelector('[role="dialog"], .modal, [data-testid="modal"]');
  return {
    modalFound: !!modal,
    modalContent: modal ? modal.textContent.substring(0, 200) : null
  };
`})

// Close modal and test infinite scroll
browser_click({ element: "e90" })  // Close button
browser_wait_for({ mode: "time", value: 1 })

// Scroll to trigger lazy loading
browser_evaluate({ script: "window.scrollTo(0, document.body.scrollHeight);" })
browser_wait_for({ mode: "time", value: 2 })

// Check if more items loaded
browser_evaluate({ script: "document.querySelectorAll('.item, [data-testid=\"item\"]').length" })

// Extract from shadow DOM if present
browser_evaluate({ script: `
  const host = document.querySelector('custom-component');
  if (host && host.shadowRoot) {
    return Array.from(host.shadowRoot.querySelectorAll('.item')).map(item => ({
      title: item.querySelector('.title')?.textContent,
      value: item.querySelector('.value')?.textContent
    }));
  }
  return [];
`})
```

### Sample Output

```json
{
  "url": "https://example-dynamic.com",
  "discovered_at": "2026-02-09T15:00:00Z",
  "dynamic_behavior": {
    "has_shadow_dom": true,
    "lazy_loading": true,
    "infinite_scroll": true,
    "modal_content": true
  },
  "workflow": [
    {
      "step": "initial_load",
      "wait": { "mode": "time", "value": 3 },
      "validation": "document.querySelectorAll('.item').length > 0"
    },
    {
      "step": "reveal_modal_content",
      "action": "click",
      "target": "show_more_button",
      "selector": "[data-testid='show-more']",
      "then_wait": { "mode": "time", "value": 1 }
    },
    {
      "step": "infinite_scroll",
      "action": "evaluate",
      "script": "window.scrollTo(0, document.body.scrollHeight);",
      "then_wait": { "mode": "time", "value": 2 },
      "repeat": "until_no_new_items"
    }
  ],
  "selectors": {
    "items": {
      "description": "Handles both regular DOM and shadow DOM",
      "regular_dom": ".item",
      "shadow_dom": {
        "host": "custom-component",
        "selector": ".item"
      }
    },
    "show_more_button": {
      "selector": "[data-testid='show-more']",
      "type": "css"
    },
    "modal": {
      "selector": "[role='dialog']",
      "type": "css"
    },
    "modal_content": {
      "selector": "[role='dialog'] .content",
      "type": "css"
    }
  }
}
```

### Tips for Adaptation

- **Shadow DOM**: Always check both `document.querySelector` and `host.shadowRoot.querySelector`
- **Lazy loading**: Use `browser_wait_for({ mode: "text", ... })` if you know what text will appear
- **Infinite scroll**: Scroll, wait, check count, repeat until count stops increasing
- **SPAs**: Watch for URL changes or specific DOM mutations to detect navigation

---

## Example 4: Table Extraction

**Scenario**: Extract structured data from HTML tables with sorting and filtering.

### User Prompt

```
I need to extract data from a table on https://example-data.com/financials.

The table has:
- Sortable columns (clicking headers sorts data)
- Filterable by date range
- Multiple pages of data
- Some cells have tooltips with additional info

Please:
1. Navigate and explore the table structure
2. Extract column headers
3. Extract all visible rows
4. Test sorting functionality
5. Handle pagination if present
6. Provide selectors for reliable extraction
```

### Expected Tool Sequence

```
// Initial exploration
browser_navigate({ url: "https://example-data.com/financials" })
browser_screenshot()
browser_snapshot()

// Analyze table structure
browser_evaluate({ script: `
  const table = document.querySelector('table, [role="table"]');
  if (!table) return { error: 'No table found' };
  
  const headers = Array.from(table.querySelectorAll('th, [role="columnheader"]'))
    .map(th => ({
      text: th.textContent.trim(),
      sortable: th.classList.contains('sortable') || !!th.querySelector('.sort-icon')
    }));
    
  const rows = table.querySelectorAll('tbody tr, [role="row"]');
  
  return {
    headerCount: headers.length,
    headers: headers,
    rowCount: rows.length,
    hasPagination: !!document.querySelector('.pagination, [data-testid="pagination"]')
  };
`})

// Extract headers with stable selectors
browser_evaluate({ script: `
  const table = document.querySelector('table.data-table');
  return Array.from(table.querySelectorAll('th')).map((th, index) => ({
    index: index,
    text: th.textContent.trim(),
    selector: th.getAttribute('data-column') || th.className || `th:nth-child(${index + 1})`,
    isSortable: th.hasAttribute('data-sortable')
  }));
`})

// Extract sample rows
browser_evaluate({ script: `
  const table = document.querySelector('table.data-table');
  const rows = table.querySelectorAll('tbody tr');
  return Array.from(rows).slice(0, 5).map(row => {
    const cells = row.querySelectorAll('td');
    return Array.from(cells).map((cell, index) => ({
      column: index,
      text: cell.textContent.trim(),
      hasTooltip: !!cell.querySelector('[data-tooltip], .tooltip')
    }));
  });
`})

// Test sorting (sort by first sortable column)
browser_evaluate({ script: `
  const sortableHeader = document.querySelector('th[data-sortable], th.sortable');
  return sortableHeader ? sortableHeader.textContent.trim() : null;
`})

browser_click({ element: "e55" })  // Sortable header ref
browser_wait_for({ mode: "time", value: 1 })

// Verify sort worked by checking first row changed
browser_evaluate({ script: `
  const firstRow = document.querySelector('table tbody tr:first-child');
  return firstRow ? firstRow.textContent.substring(0, 100) : null;
`})

// Check pagination
browser_evaluate({ script: `
  const pagination = document.querySelector('.pagination, [data-testid="pagination"]');
  if (!pagination) return { hasPagination: false };
  
  const pages = pagination.querySelectorAll('a, button, [data-page]');
  const currentPage = pagination.querySelector('.active, [aria-current="page"]')?.textContent;
  
  return {
    hasPagination: true,
    totalPages: pages.length,
    currentPage: currentPage
  };
`})

// Navigate to next page if exists
browser_click({ element: "e78" })  // Next page button
browser_wait_for({ mode: "time", value: 2 })

// Verify new data loaded
browser_evaluate({ script: "document.querySelector('table tbody tr:first-child td:first-child')?.textContent" })
```

### Sample Output

```json
{
  "url": "https://example-data.com/financials",
  "discovered_at": "2026-02-09T15:15:00Z",
  "table_structure": {
    "container": {
      "selector": "table.data-table",
      "type": "css"
    },
    "headers": {
      "selector": "thead th",
      "type": "css",
      "count": 5,
      "columns": [
        { "name": "Date", "selector": "th[data-column='date']", "sortable": true },
        { "name": "Symbol", "selector": "th[data-column='symbol']", "sortable": true },
        { "name": "Price", "selector": "th[data-column='price']", "sortable": true },
        { "name": "Volume", "selector": "th[data-column='volume']", "sortable": true },
        { "name": "Change", "selector": "th[data-column='change']", "sortable": false }
      ]
    },
    "rows": {
      "selector": "tbody tr",
      "type": "css"
    },
    "cells": {
      "selector": "td",
      "type": "css"
    }
  },
  "interaction": {
    "sorting": {
      "enabled": true,
      "selector": "th[data-sortable]",
      "type": "css"
    },
    "pagination": {
      "enabled": true,
      "next_button": {
        "selector": "[data-testid='pagination-next']",
        "type": "css"
      },
      "page_numbers": {
        "selector": ".pagination [data-page]",
        "type": "css"
      }
    }
  },
  "extraction_script": `
    const table = document.querySelector('table.data-table');
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => ({
      name: th.textContent.trim(),
      key: th.getAttribute('data-column') || th.textContent.trim().toLowerCase()
    }));
    
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => {
      const cells = row.querySelectorAll('td');
      const rowData = {};
      headers.forEach((header, index) => {
        rowData[header.key] = cells[index]?.textContent?.trim();
      });
      return rowData;
    });
    
    return { headers: headers.map(h => h.name), rows };
  `
}
```

### Tips for Adaptation

- **Dynamic tables**: Some tables render rows on scroll — use the infinite scroll approach
- **Nested data**: Cells may contain multiple values — document the internal structure
- **Tooltips**: Hover to reveal additional data — use `browser_hover` then extract
- **Export buttons**: Many tables have CSV/Excel export — consider using that instead
- **API fallback**: Check browser Network tab for XHR requests that fetch table data

---

## Quick Reference

### Common Evaluation Scripts

**Count elements**:
```javascript
document.querySelectorAll('.item').length
```

**Extract text content**:
```javascript
Array.from(document.querySelectorAll('.title')).map(el => el.textContent.trim())
```

**Extract attributes**:
```javascript
Array.from(document.querySelectorAll('img')).map(img => ({
  src: img.src,
  alt: img.alt
}))
```

**Check element visibility**:
```javascript
const el = document.querySelector('.target');
el && el.offsetParent !== null  // true if visible
```

**Find by text content**:
```javascript
Array.from(document.querySelectorAll('button'))
  .find(btn => btn.textContent.includes('Submit'))
```

**Test selector specificity**:
```javascript
{
  total: document.querySelectorAll('.price').length,
  inProducts: document.querySelectorAll('.product .price').length
}
```

---

*Last updated: 2026-02-09*
