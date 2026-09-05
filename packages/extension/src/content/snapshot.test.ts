import { strict as assert } from 'node:assert';
import test from 'node:test';

import { buildAccessibilityTree } from './snapshot';

type Attrs = Record<string, string>;

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  textContent = '';
  value: string | number = '';
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
      first.elements.filter((element) => element.interactive).map((element) => element.ref),
      ['e0', 'e1'],
    );
    assert.equal(first.elements.some((element) => element.name === 'ignored' && !element.interactive), true);
    assert.equal(button.getAttribute('data-mcp-ref'), 'e0');
    assert.equal(input.getAttribute('data-mcp-ref'), 'e1');
    assert.equal(first.nextRefStart, 2);
    assert.equal(first.elements[0]?.role, 'button');
    assert.equal(first.elements[1]?.role, 'textbox');

    const link = new FakeElement('a');
    link.textContent = 'Later';
    root.append(link);

    const second = buildAccessibilityTree(root as unknown as HTMLElement, first.nextRefStart);
    assert.deepEqual(
      second.elements.filter((element) => element.interactive).map((element) => element.ref),
      ['e0', 'e1'],
    );
    assert.equal(link.getAttribute('data-mcp-ref'), null);
    assert.equal(second.nextRefStart, 2);
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
    const buttonRef = button.getAttribute('data-mcp-ref');
    assert.ok(buttonRef);
    assert.equal(first.nextRefStart, Number(buttonRef.slice(1)) + 1);

    root.remove(button);
    const replacement = new FakeElement('button');
    replacement.textContent = 'Replacement';
    root.append(replacement);

    const second = buildAccessibilityTree(root as unknown as HTMLElement, first.nextRefStart);
    const replacementRef = replacement.getAttribute('data-mcp-ref');
    assert.ok(replacementRef);
    assert.notEqual(replacementRef, buttonRef);
    assert.equal(second.nextRefStart, Number(replacementRef.slice(1)) + 1);

    root.remove(replacement);
    root.append(button);

    const third = buildAccessibilityTree(root as unknown as HTMLElement, second.nextRefStart);
    assert.equal(button.getAttribute('data-mcp-ref'), buttonRef);
    assert.deepEqual(third.elements.map((element) => element.ref), [buttonRef]);
    assert.equal(third.nextRefStart, second.nextRefStart);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('snapshot keeps visible headings and text, omits hidden nodes, and assigns native roles accurately', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { getElementById() { return null; } } as unknown as Document;

  try {
    const root = new FakeElement('div');
    const heading = new FakeElement('h1');
    heading.textContent = 'Welcome';
    const hidden = new FakeElement('input', { type: 'hidden' });
    const submit = new FakeElement('input', { type: 'submit' });
    const anchor = new FakeElement('a');
    anchor.textContent = 'Not a link';
    const select = new FakeElement('select');
    const option = Object.assign(new FakeElement('option'), { selected: true });
    option.textContent = 'Second';
    option.value = 'Second';
    select.append(option);
    root.append(select);
    root.append(heading, hidden, submit, anchor);

    const result = buildAccessibilityTree(root as unknown as HTMLElement);
    assert.equal(result.elements.some((entry) => entry.name === 'Welcome' && entry.role === 'heading'), true);
    assert.equal(result.elements.some((entry) => entry.role === 'button' && entry.type === 'submit'), true);
    assert.equal(result.elements.some((entry) => entry.name === 'Not a link' && entry.role === 'link'), false);
    assert.equal(result.elements.some((entry) => entry.type === 'hidden'), false);
    assert.equal(result.elements.some((entry) => entry.role === 'combobox' && entry.ref !== undefined), true);
    assert.equal(result.elements.some((entry) => entry.role === 'option' && entry.selected === true && entry.ref === undefined), true);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('snapshot ignores numeric list values and keeps string control values', () => {
  const root = new FakeElement('div');
  const listItem = new FakeElement('li');
  listItem.value = 3;
  listItem.textContent = 'Prices vary by country';
  const emptyListItem = new FakeElement('li', { role: 'button' });
  emptyListItem.value = 4;
  const input = new FakeElement('input');
  input.value = 'Search extensions';
  root.append(listItem, emptyListItem, input);

  const { elements } = buildAccessibilityTree(root as unknown as HTMLElement);
  assert.equal(elements[0]?.name, 'Prices vary by country');
  assert.equal(elements[0]?.value, undefined);
  assert.equal(elements[1]?.name, '');
  assert.equal(elements[1]?.value, undefined);
  assert.equal(elements[2]?.name, 'Search extensions');
  assert.equal(elements[2]?.value, 'Search extensions');
});
