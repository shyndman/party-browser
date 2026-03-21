import { strict as assert } from 'node:assert';
import test from 'node:test';

import { findElement, parseElementRef } from './element-refs';

test('parseElementRef recognizes supported ref prefixes', () => {
  assert.deepEqual(parseElementRef('e12'), { type: 'mcpRef', ref: 'e12' });
  assert.deepEqual(parseElementRef('css:#submit'), { type: 'css', selector: '#submit' });
  assert.deepEqual(parseElementRef('xpath://button'), { type: 'xpath', path: '//button' });
  assert.deepEqual(parseElementRef('Continue'), { type: 'text', text: 'Continue' });
  assert.equal(parseElementRef(''), null);
});

test('findElement resolves eN refs by exact data-mcp-ref match', () => {
  const originalDocument = globalThis.document;
  const matched = { id: 'target' } as unknown as Element;
  let selectorUsed: string | null = null;

  globalThis.document = {
    querySelector(selector: string) {
      selectorUsed = selector;
      return selector === '[data-mcp-ref="e12"]' ? matched : null;
    },
  } as Document;

  try {
    assert.equal(findElement('e12'), matched);
    assert.equal(selectorUsed, '[data-mcp-ref="e12"]');
  } finally {
    globalThis.document = originalDocument;
  }
});
