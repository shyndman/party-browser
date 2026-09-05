import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createCommandHandlers } from './command-handlers';
import { getOrAssignElementRef } from './element-refs';

type EventInitLike = {
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
  view?: unknown;
  clientX?: number;
  clientY?: number;
  pointerId?: number;
  pointerType?: string;
  isPrimary?: boolean;
};

class FakeEvent {
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly composed: boolean;
  defaultPrevented = false;
  target: FakeElement | null = null;
  currentTarget: FakeElement | null = null;

  constructor(type: string, init: EventInitLike = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.composed = init.composed ?? false;
  }

  preventDefault(): void {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }
}

class FakeMouseEvent extends FakeEvent {
  readonly view: unknown;
  readonly clientX: number;
  readonly clientY: number;

  constructor(type: string, init: EventInitLike = {}) {
    super(type, init);
    this.view = init.view;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
  }
}

class FakeElement {
  readonly tagName: string;
  textContent = '';
  parentElement: FakeElement | null = null;
  scrollIntoViewCalls = 0;
  private readonly listeners = new Map<string, Array<(event: FakeMouseEvent) => void>>();
  private readonly attrs = new Map<string, string>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  addEventListener(type: string, listener: (event: FakeMouseEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatchEvent(event: FakeMouseEvent): boolean {
    if (!event.target) {
      event.target = this;
    }

    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }

    if (event.bubbles && this.parentElement) {
      this.parentElement.dispatchEvent(event);
    }

    return !event.defaultPrevented;
  }

  getBoundingClientRect(): DOMRect {
    return { left: 20, top: 40, width: 100, height: 30 } as DOMRect;
  }

  scrollIntoView(): void {
    this.scrollIntoViewCalls += 1;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  matches(selector: string): boolean {
    return selector === ':disabled' && this.attrs.has('disabled');
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current) {
      if (selector === 'button:disabled' && current.tagName === 'BUTTON' && current.matches(':disabled')) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
}

test('click triggers one ordering-sensitive JS activation without duplicate clicks', async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalMouseEvent = globalThis.MouseEvent;
  const originalPointerEvent = globalThis.PointerEvent;
  const originalSetTimeout = globalThis.setTimeout;

  const container = new FakeElement('div');
  const target = new FakeElement('button');
  target.textContent = 'Launch';
  target.setAttribute('data-mcp-ref', 'e1');
  target.parentElement = container;

  const eventTypes: string[] = [];
  let phase: 'idle' | 'pressed' | 'released' = 'idle';
  let activationCount = 0;
  let duplicateActivation = false;
  let activationBeforeRelease = false;

  target.addEventListener('pointerdown', (event) => {
    eventTypes.push(event.type);
    if (event.clientX === 70 && event.clientY === 55) {
      phase = 'pressed';
    }
  });
  target.addEventListener('mousedown', (event) => {
    eventTypes.push(event.type);
    if (phase !== 'pressed') {
      phase = 'idle';
    }
  });
  target.addEventListener('pointerup', (event) => {
    eventTypes.push(event.type);
    if (phase !== 'pressed') {
      phase = 'idle';
    }
  });
  target.addEventListener('mouseup', (event) => {
    eventTypes.push(event.type);
    if (phase === 'pressed') {
      phase = 'released';
    }
  });
  target.addEventListener('click', (event) => {
    eventTypes.push(event.type);
    if (phase !== 'released') {
      activationBeforeRelease = true;
      return;
    }

    activationCount += 1;
    duplicateActivation ||= activationCount > 1;
  });

  globalThis.window = {} as Window & typeof globalThis;
  globalThis.MouseEvent = FakeMouseEvent as unknown as typeof MouseEvent;
  globalThis.PointerEvent = undefined as unknown as typeof PointerEvent;
  globalThis.setTimeout = ((callback: (...args: never[]) => void) => {
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  globalThis.document = {
    querySelector(selector: string) {
      return selector === '[data-mcp-ref="e1"]' ? (target as unknown as Element) : null;
    },
  } as Document;
  getOrAssignElementRef(target as unknown as Element, 1);

  try {
    const handlers = createCommandHandlers();
    const result = await handlers.click({ element: 'e1' });

    assert.equal(result.success, true);
    const data = result.data as { element: string; tagName: string; text: string };
    assert.equal(data.element, 'e1');
    assert.equal(data.tagName, 'BUTTON');
    assert.equal(data.text, 'Launch');
    assert.equal(target.scrollIntoViewCalls, 1);
    assert.equal(activationBeforeRelease, false);
    assert.equal(activationCount, 1);
    assert.equal(duplicateActivation, false);
    assert.deepEqual(eventTypes, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.MouseEvent = originalMouseEvent;
    globalThis.PointerEvent = originalPointerEvent;
    globalThis.setTimeout = originalSetTimeout;
  }
});
test('click rejects detached refs with fresh snapshot guidance', async () => {
  const originalDocument = globalThis.document;
  const detached = { isConnected: false } as unknown as Element;
  globalThis.document = {
    querySelector() {
      return detached;
    },
  } as unknown as Document;

  try {
    await assert.rejects(
      () => createCommandHandlers().click({ element: 'e1' }),
      /Element not found or stale: e1; capture a new snapshot and retry/,
    );
  } finally {
    globalThis.document = originalDocument;
  }
});
test('click rejects disabled controls and descendants without dispatching events', async () => {
  const originalDocument = globalThis.document;
  const button = new FakeElement('button');
  const descendant = new FakeElement('span');
  button.setAttribute('disabled', '');
  descendant.parentElement = button;
  const eventTypes: string[] = [];
  descendant.addEventListener('click', (event) => eventTypes.push(event.type));
  button.addEventListener('click', (event) => eventTypes.push(event.type));
  const buttonRef = getOrAssignElementRef(button as unknown as Element, 1).ref;
  const descendantRef = getOrAssignElementRef(descendant as unknown as Element, 1).ref;
  globalThis.document = {
    querySelector(selector: string) {
      if (selector === `[data-mcp-ref="${buttonRef}"]`) return button as unknown as Element;
      return selector === `[data-mcp-ref="${descendantRef}"]` ? (descendant as unknown as Element) : null;
    },
  } as Document;

  try {
    for (const ref of [buttonRef, descendantRef]) {
      await assert.rejects(
        () => createCommandHandlers().click({ element: ref }),
        { message: `Cannot click disabled element: ${ref}` },
      );
    }
    assert.deepEqual(eventTypes, []);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('click rejects a target replaced during scroll delay with fresh snapshot guidance', async () => {
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const target = new FakeElement('button');
  const replacement = new FakeElement('button');
  let currentTarget: FakeElement = target;
  const eventTypes: string[] = [];
  target.addEventListener('click', (event) => eventTypes.push(event.type));
  const ref = getOrAssignElementRef(target as unknown as Element, 1).ref;
  replacement.setAttribute('data-mcp-ref', ref);
  globalThis.document = {
    querySelector(selector: string) {
      return selector === `[data-mcp-ref="${ref}"]` ? (currentTarget as unknown as Element) : null;
    },
  } as Document;
  globalThis.setTimeout = ((callback: (...args: never[]) => void) => {
    currentTarget = replacement;
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;

  try {
    await assert.rejects(
      () => createCommandHandlers().click({ element: ref }),
      { message: `Element not found or stale: ${ref}; capture a new snapshot and retry` },
    );
    assert.deepEqual(eventTypes, []);
    assert.equal(currentTarget, replacement);
    assert.equal(target.scrollIntoViewCalls, 1);
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
  }
});
