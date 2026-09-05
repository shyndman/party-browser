import { strict as assert } from 'node:assert';
import test from 'node:test';

import { findElement, getOrAssignElementRef, parseElementRef } from './element-refs';

test('parseElementRef recognizes supported ref prefixes', () => {
  assert.deepEqual(parseElementRef('e12'), { type: 'mcpRef', ref: 'e12' });
  assert.deepEqual(parseElementRef('css:#submit'), { type: 'css', selector: '#submit' });
  assert.deepEqual(parseElementRef('xpath://button'), { type: 'xpath', path: '//button' });
  assert.deepEqual(parseElementRef('Continue'), { type: 'text', text: 'Continue' });
  assert.equal(parseElementRef(''), null);
});

test('findElement resolves eN refs by exact data-mcp-ref match', () => {
  const originalDocument = globalThis.document;
  const matched = {
    id: 'target',
    setAttribute() {},
  } as unknown as Element;
  let selectorUsed: string | null = null;

  globalThis.document = {
    querySelector(selector: string) {
      selectorUsed = selector;
      return selector === '[data-mcp-ref="e12"]' ? matched : null;
    },
  } as Document;

  try {
    getOrAssignElementRef(matched, 12);
    assert.equal(findElement('e12'), matched);
    assert.equal(selectorUsed, '[data-mcp-ref="e12"]');
  } finally {
    globalThis.document = originalDocument;
  }
});
test('findElement rejects detached nodes instead of returning stale refs', () => {
  const originalDocument = globalThis.document;
  const detached = { isConnected: false } as unknown as Element;

  globalThis.document = {
    querySelector() {
      return detached;
    },
  } as unknown as Document;

  try {
    assert.equal(findElement('e12'), null);
  } finally {
    globalThis.document = originalDocument;
  }
});
test('findElement rejects a replacement node that copied an existing ref', () => {
  const originalDocument = globalThis.document;
  const original = { setAttribute() {} } as unknown as Element;
  const replacement = { isConnected: true } as unknown as Element;
  getOrAssignElementRef(original, 20);
  globalThis.document = {
    querySelector() {
      return replacement;
    },
  } as unknown as Document;

  try {
    assert.equal(findElement('e20'), null);
  } finally {
    globalThis.document = originalDocument;
  }
});
