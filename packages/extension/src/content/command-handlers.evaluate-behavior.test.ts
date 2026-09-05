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


const expressionCases: ReadonlyArray<{
  name: string;
  script: string;
  expected: unknown;
}> = [
  { name: 'single expression', script: '1 + 2', expected: 3 },
  { name: 'parenthesized expression', script: '((1 + 2)); // trailing comment', expected: 3 },
  { name: 'object literal', script: '{ value: await Promise.resolve(7) };', expected: { value: 7 } },
  { name: 'empty object', script: '{}', expected: {} },
  { name: 'top-level await', script: 'await Promise.resolve(7)', expected: 7 },
  {
    name: 'multiple statements with await',
    script: 'const text = await (await Promise.resolve({ text: async () => "hello" })).text();\ntext',
    expected: 'hello',
  },
  { name: 'explicit return', script: 'return await Promise.resolve(7);', expected: 7 },
  { name: 'declarations only', script: 'const value = 7;', expected: undefined },
  { name: 'final control flow', script: 'if (true) { 7; }', expected: undefined },
  { name: 'empty input', script: '// comment only', expected: undefined },
  { name: 'trailing semicolons', script: 'const value = 7; (value);; // done', expected: 7 },
  {
    name: 'comments and expression punctuation',
    script: 'const value = 7;\n/* before */ ({ text: `value: ${value};`, match: /[;)]/.test(";") }) // after',
    expected: { text: 'value: 7;', match: true },
  },
  { name: 'multiline expression', script: 'const value = 7;\n(\nvalue + 1\n)', expected: 8 },
  { name: 'window receiver', script: 'this === window', expected: true },
];

for (const { name, script, expected } of expressionCases) {
  test(`evaluate returns ${name}`, async () => {
    installGlobals();
    try {
      const result = await createCommandHandlers().evaluate({ script });
      assert.deepEqual(result, { success: true, data: { result: expected } });
    } finally {
      restoreGlobals();
    }
  });
}

test('evaluate discards local bindings but retains page changes', async () => {
  installGlobals();
  try {
    const handlers = createCommandHandlers();
    const script = 'const localValue = 7; var localVar = 8; function localFn() {} document.title = "changed"; localValue';
    assert.deepEqual(await handlers.evaluate({ script }), { success: true, data: { result: 7 } });
    assert.deepEqual(await handlers.evaluate({ script }), { success: true, data: { result: 7 } });
    assert.deepEqual(await handlers.evaluate({
      script: '[typeof localValue, typeof localVar, typeof localFn, document.title]',
    }), {
      success: true,
      data: { result: ['undefined', 'undefined', 'undefined', 'changed'] },
    });
  } finally {
    restoreGlobals();
  }
});

test('evaluate reports syntax locations without executing partial input', async () => {
  installGlobals();
  try {
    document.title = 'original';
    const result = await createCommandHandlers().evaluate({
      script: 'document.title = "changed";\nconst value = ;',
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'COMMAND_FAILED');
    assert.match(result.error ?? '', /Unexpected token \(2:14\)/);
    assert.equal(document.title, 'original');
  } finally {
    restoreGlobals();
  }
});

test('evaluate does not retry code after a runtime failure', async () => {
  installGlobals();
  try {
    document.title = '';
    const result = await createCommandHandlers().evaluate({
      script: 'document.title += "once"; await Promise.reject(new Error("failed"));',
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'COMMAND_FAILED');
    assert.equal(result.error, 'failed');
    assert.equal(document.title, 'once');
  } finally {
    restoreGlobals();
  }
});
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
