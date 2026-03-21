export interface ParsedRef {
  type: 'index' | 'css' | 'xpath' | 'text';
  index?: number;
  selector?: string;
  path?: string;
  text?: string;
}

export function parseElementRef(ref: string): ParsedRef | null {
  if (!ref) {
    return null;
  }

  if (ref.match(/^e\d+$/)) {
    return { type: 'index', index: parseInt(ref.slice(1), 10) };
  }

  if (ref.startsWith('css:')) {
    return { type: 'css', selector: ref.slice(4) };
  }

  if (ref.startsWith('xpath:')) {
    return { type: 'xpath', path: ref.slice(6) };
  }

  return { type: 'text', text: ref };
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
    return null;
  }

  switch (parsed.type) {
    case 'index': {
      const elements = document.querySelectorAll(
        '[data-mcp-ref], a, button, input, select, textarea, [role="button"], [role="link"]',
      );
      return elements[parsed.index!] || null;
    }
    case 'css':
      return document.querySelector(parsed.selector!);
    case 'xpath':
      return findByXPath(parsed.path!);
    case 'text':
      return findByText(parsed.text!);
    default:
      return null;
  }
}
