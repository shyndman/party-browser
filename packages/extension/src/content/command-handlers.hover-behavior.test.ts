import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createCommandHandlers } from './command-handlers';

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
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  private readonly attrs = new Map<string, string>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatchEvent(event: FakeEvent): boolean {
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

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
}

test('hover triggers JS hover handlers without bubbling enter events', async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalMouseEvent = globalThis.MouseEvent;
  const originalPointerEvent = globalThis.PointerEvent;

  const container = new FakeElement('div');
  const target = new FakeElement('button');
  target.setAttribute('data-mcp-ref', 'e1');
  target.parentElement = container;

  const status = new FakeElement('div');
  status.textContent = 'idle';

  const eventTypes: string[] = [];
  let parentMouseEnterCount = 0;
  let parentPointerEnterCount = 0;

  target.addEventListener('pointerover', (event) => {
    eventTypes.push(event.type);
  });
  target.addEventListener('pointerenter', (event) => {
    eventTypes.push(event.type);
  });
  target.addEventListener('mouseover', (event) => {
    eventTypes.push(event.type);
  });
  target.addEventListener('mouseenter', (event) => {
    eventTypes.push(event.type);
    status.textContent = 'hovered';
  });
  target.addEventListener('pointermove', (event) => {
    eventTypes.push(event.type);
  });
  target.addEventListener('mousemove', (event) => {
    eventTypes.push(event.type);
  });

  container.addEventListener('mouseenter', () => {
    parentMouseEnterCount += 1;
  });
  container.addEventListener('pointerenter', () => {
    parentPointerEnterCount += 1;
  });

  globalThis.window = {} as Window & typeof globalThis;
  globalThis.MouseEvent = FakeMouseEvent as unknown as typeof MouseEvent;
  globalThis.PointerEvent = undefined as unknown as typeof PointerEvent;
  globalThis.document = {
    querySelector(selector: string) {
      return selector === '[data-mcp-ref="e1"]' ? (target as unknown as Element) : null;
    },
  } as Document;

  try {
    const handlers = createCommandHandlers();
    const result = await handlers.hover({ element: 'e1' });

    assert.equal(result.success, true);
    assert.equal(status.textContent, 'hovered');
    assert.deepEqual(eventTypes, [
      'pointerover',
      'pointerenter',
      'mouseover',
      'mouseenter',
      'pointermove',
      'mousemove',
    ]);
    assert.equal(parentMouseEnterCount, 0);
    assert.equal(parentPointerEnterCount, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.MouseEvent = originalMouseEvent;
    globalThis.PointerEvent = originalPointerEvent;
  }
});
