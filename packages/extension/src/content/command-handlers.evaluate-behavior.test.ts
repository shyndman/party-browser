import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createCommandHandlers } from './command-handlers';

class FakeElement {
  readonly tagName = 'H1';
  readonly id = 'heading';
  readonly className = 'title';
}

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalElement = globalThis.Element;
const originalNodeList = globalThis.NodeList;
const originalHTMLCollection = globalThis.HTMLCollection;

test('evaluate awaits thenables instead of only native Promises', async () => {
  installGlobals();
  try {
    const result = await createCommandHandlers().evaluate({
      script: 'return { then(resolve) { resolve(7); } };',
    });
    assert.deepEqual(result, { success: true, data: { result: 7 } });
  } finally {
    restoreGlobals();
  }
});

test('evaluate preserves primitive thrown messages and Error stacks', async () => {
  installGlobals();
  try {
    const nullResult = await createCommandHandlers().evaluate({ script: 'throw null;' });
    assert.equal(nullResult.success, false);
    assert.equal(nullResult.error, 'null');

    const stringResult = await createCommandHandlers().evaluate({ script: "throw 'rejected';" });
    assert.equal(stringResult.success, false);
    assert.equal(stringResult.error, 'rejected');

    const errorResult = await createCommandHandlers().evaluate({ script: "throw new Error('broken');" });
    assert.equal(errorResult.success, false);
    assert.equal(errorResult.error, 'broken');
    assert.match(errorResult.stack ?? '', /Error: broken/);
  } finally {
    restoreGlobals();
  }
});

test('evaluate serializes nested elements and non-finite numbers', async () => {
  installGlobals();
  try {
    const result = await createCommandHandlers().evaluate({
      script: 'return { element: document.querySelector("h1"), values: [NaN, Infinity, -Infinity] };',
    });
    assert.deepEqual(result, {
      success: true,
      data: {
        result: {
          element: { type: 'Element', tagName: 'H1', id: 'heading', className: 'title' },
          values: ['NaN', 'Infinity', '-Infinity'],
        },
      },
    });

    const dateResult = await createCommandHandlers().evaluate({
      script: 'return new Date("2020-01-02T03:04:05.000Z");',
    });
    assert.deepEqual(dateResult, {
      success: true,
      data: { result: '2020-01-02T03:04:05.000Z' },
    });
  } finally {
    restoreGlobals();
  }
});

function installGlobals(): void {
  globalThis.window = {} as Window & typeof globalThis;
  globalThis.document = {
    querySelector: () => new FakeElement() as unknown as Element,
  } as unknown as Document;
  globalThis.Element = FakeElement as unknown as typeof Element;
  globalThis.NodeList = Array as unknown as typeof NodeList;
  globalThis.HTMLCollection = Array as unknown as typeof HTMLCollection;
}

function restoreGlobals(): void {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.Element = originalElement;
  globalThis.NodeList = originalNodeList;
  globalThis.HTMLCollection = originalHTMLCollection;
}
