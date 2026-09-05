const MCP_REF_ATTRIBUTE = 'data-mcp-ref';

export interface ElementRefAllocation {
  ref: string;
  nextRefStart: number;
}
export interface ParsedRef {
  type: 'mcpRef' | 'css' | 'xpath' | 'text';
  ref?: string;
  selector?: string;
  path?: string;
  text?: string;
}

const refByElement = new WeakMap<Element, string>();
const elementByRef = new Map<string, WeakRef<Element>>();

export function pruneElementRefRegistry(): void {
  for (const [ref, elementRef] of elementByRef) {
    if (!elementRef.deref()) {
      elementByRef.delete(ref);
    }
  }
}

export function getOrAssignElementRef(element: Element, nextRefStart: number): ElementRefAllocation {
  const existingRef = refByElement.get(element);
  if (existingRef) {
    const number = Number.parseInt(existingRef.slice(1), 10);
    return { ref: existingRef, nextRefStart: Math.max(nextRefStart, number + 1) };
  }

  let ref: string;
  do {
    ref = `e${nextRefStart}`;
    nextRefStart += 1;
  } while (elementByRef.get(ref)?.deref());

  refByElement.set(element, ref);
  elementByRef.set(ref, new WeakRef(element));
  element.setAttribute(MCP_REF_ATTRIBUTE, ref);
  return { ref, nextRefStart };
}

export function parseElementRef(ref: string): ParsedRef | null {
  if (!ref) {
    return null;
  }

  if (ref.match(/^e\d+$/)) {
    return { type: 'mcpRef', ref };
  }

  if (ref.startsWith('css:')) {
    return { type: 'css', selector: ref.slice(4) };
  }

  if (ref.startsWith('xpath:')) {
    return { type: 'xpath', path: ref.slice(6) };
  }

  return { type: 'text', text: ref };
}

function findByMcpRef(ref: string): Element | null {
  const element = document.querySelector(`[data-mcp-ref="${ref}"]`);
  if (!element || elementByRef.get(ref)?.deref() !== element) {
    return null;
  }
  return element;
}

export function findByXPath(path: string): Element | null {
  try {
    const result = document.evaluate(
      path,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );

    return result.singleNodeValue as Element | null;
  } catch (error) {
    console.error('[PartyBrowser] XPath error:', error);
    return null;
  }
}

export function findByText(text: string): Element | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const element = node as Element;
    if (element.textContent?.trim().includes(text)) {
      return element;
    }
  }

  return null;
}

export function findElement(ref: string): Element | null {
  const parsed = parseElementRef(ref);
  if (!parsed) {
    console.error(`[PartyBrowser] Invalid element ref: ${ref}`);
    return null;
  }

  const element = (() => {
    switch (parsed.type) {
      case 'mcpRef':
        return findByMcpRef(parsed.ref!);
      case 'css':
        return document.querySelector(parsed.selector!);
      case 'xpath':
        return findByXPath(parsed.path!);
      case 'text':
        return findByText(parsed.text!);
      default:
        return null;
    }
  })();

  if (element && 'isConnected' in element && element.isConnected === false) {
    console.error(`[PartyBrowser] Element is detached for ref: ${ref}`);
    return null;
  }

  if (!element) {
    console.error(`[PartyBrowser] Element not found: ${ref}`);
  }
  return element;
}
