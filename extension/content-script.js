/**
 * Content script for Browser MCP Firefox extension
 * Handles DOM interaction and accessibility tree generation
 */

console.log('[Browser MCP] Content script loaded on', window.location.href);

// ============================================================
// SESSION-SCOPED CONSOLE CAPTURE (Phase 03.1)
// ============================================================

const MAX_CONSOLE_LOGS = 1000; // Maximum entries (ring buffer)

// Ring buffer for console logs
const consoleLogs = [];

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

/**
 * Push log entry to ring buffer
 * @param {string} level - Log level (log, error, warn, info)
 * @param {Array} args - Original console arguments
 */
function pushConsoleLog(level, args) {
  const entry = {
    level,
    message: args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' '),
    timestamp: Date.now(),
    stack: level === 'error' ? new Error().stack : undefined
  };

  consoleLogs.push(entry);

  // Ring buffer: remove oldest if over limit
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift();
  }
}

// Override console methods with ring buffer
console.log = function(...args) {
  pushConsoleLog('log', args);
  originalConsole.log.apply(console, args);
};

console.error = function(...args) {
  pushConsoleLog('error', args);
  originalConsole.error.apply(console, args);
};

console.warn = function(...args) {
  pushConsoleLog('warn', args);
  originalConsole.warn.apply(console, args);
};

console.info = function(...args) {
  pushConsoleLog('info', args);
  originalConsole.info.apply(console, args);
};

// Capture uncaught errors
window.onerror = function(message, source, lineno, colno, error) {
  pushConsoleLog('error', [`Uncaught: ${message} at ${source}:${lineno}:${colno}`]);
  return false; // Let default handler run
};

// Capture unhandled promise rejections
window.onunhandledrejection = function(event) {
  pushConsoleLog('error', [`Unhandled Promise Rejection: ${event.reason}`]);
};

/**
 * Get console logs with optional clear
 * @param {boolean} clear - Whether to clear the buffer after reading
 * @returns {Array} Console log entries
 */
function getConsoleLogs(clear = false) {
  const logs = [...consoleLogs];
  if (clear) {
    consoleLogs.length = 0;
  }
  return logs;
}

/**
 * Clear all console logs
 */
function clearConsoleLogs() {
  consoleLogs.length = 0;
}

// ============================================================

/**
 * Parse element reference string into selector info
 */
function parseElementRef(ref) {
  if (!ref) return null;

  // Handle numeric refs (e.g., "e42")
  if (ref.match(/^e\d+$/)) {
    const index = parseInt(ref.slice(1), 10);
    return { type: 'index', index };
  }

  // Handle CSS selectors
  if (ref.startsWith('css:')) {
    return { type: 'css', selector: ref.slice(4) };
  }

  // Handle XPath
  if (ref.startsWith('xpath:')) {
    return { type: 'xpath', path: ref.slice(6) };
  }

  // Default: treat as text content
  return { type: 'text', text: ref };
}

/**
 * Find element by reference
 */
function findElement(ref) {
  const parsed = parseElementRef(ref);

  switch (parsed.type) {
    case 'index':
      const elements = document.querySelectorAll('[data-mcp-ref], a, button, input, select, textarea, [role="button"], [role="link"]');
      return elements[parsed.index] || null;

    case 'css':
      return document.querySelector(parsed.selector);

    case 'xpath':
      return findByXPath(parsed.path);

    case 'text':
      return findByText(parsed.text);

    default:
      return null;
  }
}

/**
 * Find element by XPath
 */
function findByXPath(path) {
  try {
    const result = document.evaluate(
      path,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  } catch (e) {
    console.error('[Browser MCP] XPath error:', e);
    return null;
  }
}

/**
 * Find element by text content
 */
function findByText(text) {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null,
    false
  );

  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.trim().includes(text)) {
      return node;
    }
  }
  return null;
}

/**
 * Click element
 */
async function clickElement(params) {
  const { element: ref } = params;
  const element = findElement(ref);

  if (!element) {
    throw new Error(`Element not found: ${ref}`);
  }

  // Scroll into view
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(resolve => setTimeout(resolve, 100));

  // Click
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  element.dispatchEvent(clickEvent);

  // Also trigger native click
  element.click();

  return {
    success: true,
    element: ref,
    tagName: element.tagName,
    text: element.textContent?.trim().slice(0, 50)
  };
}

/**
 * Type text into element
 */
async function typeIntoElement(params) {
  const { element: ref, value } = params;
  const element = findElement(ref);

  if (!element) {
    throw new Error(`Element not found: ${ref}`);
  }

  // Focus the element
  element.focus();
  await new Promise(resolve => setTimeout(resolve, 50));

  // Clear existing value for inputs
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Type each character
  for (const char of value) {
    // Keydown
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: char,
      bubbles: true
    }));

    // Input
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Keyup
    element.dispatchEvent(new KeyboardEvent('keyup', {
      key: char,
      bubbles: true
    }));

    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Final change event
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.blur();

  return {
    success: true,
    element: ref,
    value: value.slice(0, 50)
  };
}

/**
 * Execute JavaScript
 */
async function evaluateScript(params) {
  const { script } = params;

  try {
    // Use Function constructor for safer evaluation
    const fn = new Function(script);
    const result = fn.call(window);

    // Handle async results
    if (result instanceof Promise) {
      const resolved = await result;
      return {
        success: true,
        result: serializeResult(resolved)
      };
    }

    return {
      success: true,
      result: serializeResult(result)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Serialize evaluation result
 */
function serializeResult(result) {
  if (result === null) return null;
  if (result === undefined) return undefined;

  const type = typeof result;

  switch (type) {
    case 'boolean':
    case 'number':
    case 'string':
      return result;

    case 'object':
      if (Array.isArray(result)) {
        return result.map(serializeResult);
      }
      if (result instanceof Element) {
        return {
          type: 'Element',
          tagName: result.tagName,
          id: result.id,
          className: result.className
        };
      }
      if (result instanceof NodeList || result instanceof HTMLCollection) {
        return Array.from(result).map(serializeResult);
      }
      try {
        return JSON.parse(JSON.stringify(result));
      } catch {
        return String(result);
      }

    case 'function':
      return `[Function: ${result.name || 'anonymous'}]`;

    default:
      return String(result);
  }
}

/**
 * Get accessibility tree snapshot
 */
function getSnapshot() {
  const tree = buildAccessibilityTree(document.body);
  return {
    success: true,
    url: window.location.href,
    title: document.title,
    tree
  };
}

/**
 * Build accessibility tree
 */
function buildAccessibilityTree(root) {
  const elements = [];
  let refCounter = 0;

  function traverse(node, depth = 0) {
    if (depth > 50) return; // Prevent infinite recursion

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node;
      const info = getElementInfo(element, refCounter++);

      if (info && info.interactive) {
        elements.push(info);
      }

      // Traverse children
      for (const child of element.children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(root);
  return elements;
}

/**
 * Get element info for snapshot
 */
function getElementInfo(element, ref) {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const ariaLabel = element.getAttribute('aria-label');
  const ariaLabelledBy = element.getAttribute('aria-labelledby');

  // Determine if element is interactive
  const interactiveTypes = ['a', 'button', 'input', 'select', 'textarea'];
  const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'menuitem'];

  const isInteractive = interactiveTypes.includes(tagName) ||
                       interactiveRoles.includes(role) ||
                       element.onclick !== null ||
                       element.tabIndex >= 0;

  if (!isInteractive) return null;

  // Get name/text
  let name = ariaLabel;
  if (!name && ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    if (labelElement) {
      name = labelElement.textContent;
    }
  }
  if (!name) {
    name = element.textContent?.trim() || element.value || element.placeholder || '';
  }

  // Get input type
  let inputType = null;
  if (tagName === 'input') {
    inputType = element.type || 'text';
  }

  // Add data attribute for reference
  element.setAttribute('data-mcp-ref', `e${ref}`);

  return {
    ref: `e${ref}`,
    tagName,
    role,
    type: inputType,
    name: name.slice(0, 100),
    value: element.value?.slice(0, 100),
    placeholder: element.placeholder,
    disabled: element.disabled,
    checked: element.checked,
    interactive: true
  };
}

/**
 * Select option from dropdown
 */
async function selectOption(params) {
  const { element: ref, value } = params;
  const element = findElement(ref);

  if (!element) {
    throw new Error(`Element not found: ${ref}`);
  }

  if (element.tagName !== 'SELECT') {
    throw new Error(`Element is not a select: ${ref}`);
  }

  // Find option
  const options = Array.from(element.options);
  const option = options.find(opt =>
    opt.value === value ||
    opt.textContent.trim() === value
  );

  if (!option) {
    throw new Error(`Option not found: ${value}`);
  }

  element.value = option.value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('input', { bubbles: true }));

  return {
    success: true,
    element: ref,
    selectedValue: option.value,
    selectedText: option.textContent.trim()
  };
}

/**
 * Press a key (keyboard event simulation)
 */
async function pressKey(params) {
  const { key } = params;

  // Dispatch keydown and keyup events
  const keydownEvent = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(keydownEvent);

  const keyupEvent = new KeyboardEvent('keyup', {
    key,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(keyupEvent);

  return { success: true, key };
}

/**
 * Wait for condition (time, text appearance, or text disappearance)
 */
async function waitForCondition(params) {
  const { mode, value, timeout = 30000 } = params;
  const startTime = Date.now();

  if (mode === 'time') {
    // TIMEOUT CONTRACT: API value is in SECONDS, setTimeout expects MILLISECONDS
    const seconds = parseInt(value, 10) || 1;
    const ms = seconds * 1000;
    await new Promise(resolve => setTimeout(resolve, ms));
    return { success: true, mode, waited: ms };
  }

  if (mode === 'text') {
    // Wait for text to appear in DOM
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const bodyText = document.body.innerText || '';
        const elapsed = Date.now() - startTime;

        if (bodyText.includes(value)) {
          clearInterval(checkInterval);
          resolve({ success: true, mode, waited: elapsed });
        }

        if (elapsed >= timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout waiting for text: ${value}`));
        }
      }, 100);
    });
  }

  if (mode === 'text_gone') {
    // Wait for text to disappear from DOM
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const bodyText = document.body.innerText || '';
        const elapsed = Date.now() - startTime;

        if (!bodyText.includes(value)) {
          clearInterval(checkInterval);
          resolve({ success: true, mode, waited: elapsed });
        }

        if (elapsed >= timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout waiting for text to disappear: ${value}`));
        }
      }, 100);
    });
  }

  throw new Error(`Unknown wait mode: ${mode}`);
}

/**
 * Drag element from source to target
 */
async function dragElement(params) {
  const { startElement, endElement } = params;

  const startEl = findElement(startElement);
  const endEl = findElement(endElement);

  if (!startEl) {
    throw new Error(`Start element not found: ${startElement}`);
  }
  if (!endEl) {
    throw new Error(`End element not found: ${endElement}`);
  }

  const startRect = startEl.getBoundingClientRect();
  const endRect = endEl.getBoundingClientRect();

  // Calculate center points
  const startX = startRect.left + startRect.width / 2;
  const startY = startRect.top + startRect.height / 2;
  const endX = endRect.left + endRect.width / 2;
  const endY = endRect.top + endRect.height / 2;

  // Simulate drag: mousedown on start, mousemove to end, mouseup on end
  startEl.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    clientX: startX,
    clientY: startY
  }));

  await new Promise(resolve => setTimeout(resolve, 50));

  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX: endX,
    clientY: endY
  }));

  await new Promise(resolve => setTimeout(resolve, 50));

  endEl.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true,
    clientX: endX,
    clientY: endY
  }));

  return { success: true, startElement, endElement };
}

/**
 * Hover over element
 */
async function hoverElement(params) {
  const { element } = params;
  const el = findElement(element);

  if (!el) {
    throw new Error(`Element not found: ${element}`);
  }

  // Dispatch mouseover and mouseenter events
  el.dispatchEvent(new MouseEvent('mouseover', {
    bubbles: true,
    cancelable: true
  }));

  el.dispatchEvent(new MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true
  }));

  return { success: true, element };
}

/**
 * Execute command handler
 */
async function executeCommand(message) {
  const { command, params } = message;

  switch (command) {
    case 'click':
      return await clickElement(params);

    case 'type':
      return await typeIntoElement(params);

    case 'evaluate':
      return await evaluateScript(params);

    case 'snapshot':
      return getSnapshot();

    case 'select_option':
      return await selectOption(params);

    case 'press_key':
      return await pressKey(params);

    case 'wait_for':
      return await waitForCondition(params);

    case 'drag':
      return await dragElement(params);

    case 'hover':
      return await hoverElement(params);

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

/**
 * Listen for messages from background script
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Browser MCP] Content script received:', message);

  if (message.type === 'executeCommand') {
    executeCommand(message)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: error.message,
        stack: error.stack
      }));
    return true; // Keep channel open for async
  }

  // Handle console log requests
  if (message.type === 'getConsoleLogs') {
    const logs = getConsoleLogs(message.clear);
    sendResponse({
      success: true,
      logs: logs
    });
    return false;
  }

  return false;
});

// Signal that content script is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Browser MCP] Content script ready');
  });
} else {
  console.log('[Browser MCP] Content script ready (document already loaded)');
}
