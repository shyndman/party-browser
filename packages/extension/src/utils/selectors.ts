/**
 * Selector utilities for Blindflight extension
 * Parses and handles element selector formats
 */

/**
 * Selector definition types
 */
export type SelectorType = 'index' | 'css' | 'xpath' | 'text';

export interface SelectorDefinition {
  type: SelectorType;
  index?: number;
  selector?: string;
  path?: string;
  text?: string;
}

/**
 * Parse an element reference string into a selector definition
 * Supports formats: eN (index), css:, xpath:, text
 * @param ref The element reference string
 * @returns Selector definition or null if invalid
 */
export function parseSelector(ref: string): SelectorDefinition | null {
  if (!ref) return null;

  // eN format (element index)
  if (ref.match(/^e\d+$/)) {
    return { type: 'index', index: parseInt(ref.slice(1), 10) };
  }

  // CSS selector
  if (ref.startsWith('css:')) {
    return { type: 'css', selector: ref.slice(4) };
  }

  // XPath selector
  if (ref.startsWith('xpath:')) {
    return { type: 'xpath', path: ref.slice(6) };
  }

  // Text content search
  return { type: 'text', text: ref };
}

/**
 * Validate a selector reference
 * @param ref The reference string to validate
 * @returns True if valid
 */
export function isValidSelector(ref: string): boolean {
  return parseSelector(ref) !== null;
}

/**
 * Format a selector back to string representation
 * @param selector The selector definition
 * @returns String representation
 */
export function formatSelector(selector: SelectorDefinition): string {
  switch (selector.type) {
    case 'index':
      return `e${selector.index}`;
    case 'css':
      return `css:${selector.selector}`;
    case 'xpath':
      return `xpath:${selector.path}`;
    case 'text':
      return selector.text || '';
    default:
      return '';
  }
}
