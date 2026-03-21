import { strict as assert } from 'node:assert';
import test from 'node:test';

import { buildAccessibilityTree } from './snapshot';

type Attrs = Record<string, string>;

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  textContent = '';
  value = '';
  placeholder = '';
  disabled = false;
  checked = false;
  onclick: ((...args: unknown[]) => void) | null = null;
  tabIndex = -1;
  private attrs: Attrs;

  constructor(tagName: string, attrs: Attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  remove(child: FakeElement): void {
    this.children = this.children.filter((candidate) => candidate !== child);
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
}

test('buildAccessibilityTree assigns refs once and labels only new interactive nodes', () => {
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById() {
      return null;
    },
  } as unknown as Document;

  try {
    const root = new FakeElement('div');
    const button = new FakeElement('button');
    button.textContent = 'First';
    const input = new FakeElement('input');
    input.value = 'Search';
    const ignored = new FakeElement('div');
    ignored.textContent = 'ignored';
    root.append(button, input, ignored);

    const first = buildAccessibilityTree(root as unknown as HTMLElement, 0);
    assert.deepEqual(
      first.elements.map((element) => element.ref),
      ['e0', 'e1'],
    );
    assert.equal(button.getAttribute('data-mcp-ref'), 'e0');
    assert.equal(input.getAttribute('data-mcp-ref'), 'e1');
    assert.equal(first.nextRefStart, 2);

    const link = new FakeElement('a');
    link.textContent = 'Later';
    root.append(link);

    const second = buildAccessibilityTree(root as unknown as HTMLElement, first.nextRefStart);
    assert.deepEqual(
      second.elements.map((element) => element.ref),
      ['e0', 'e1', 'e2'],
    );
    assert.equal(link.getAttribute('data-mcp-ref'), 'e2');
    assert.equal(second.nextRefStart, 3);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('buildAccessibilityTree never reuses removed refs and preserves surviving node refs', () => {
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById() {
      return null;
    },
  } as unknown as Document;

  try {
    const root = new FakeElement('div');
    const button = new FakeElement('button');
    button.textContent = 'Persistent';
    root.append(button);

    const first = buildAccessibilityTree(root as unknown as HTMLElement, 0);
    assert.equal(button.getAttribute('data-mcp-ref'), 'e0');
    assert.equal(first.nextRefStart, 1);

    root.remove(button);
    const replacement = new FakeElement('button');
    replacement.textContent = 'Replacement';
    root.append(replacement);

    const second = buildAccessibilityTree(root as unknown as HTMLElement, first.nextRefStart);
    assert.equal(replacement.getAttribute('data-mcp-ref'), 'e1');
    assert.equal(second.nextRefStart, 2);

    root.remove(replacement);
    root.append(button);

    const third = buildAccessibilityTree(root as unknown as HTMLElement, second.nextRefStart);
    assert.equal(button.getAttribute('data-mcp-ref'), 'e0');
    assert.deepEqual(third.elements.map((element) => element.ref), ['e0']);
    assert.equal(third.nextRefStart, 2);
  } finally {
    globalThis.document = originalDocument;
  }
});
