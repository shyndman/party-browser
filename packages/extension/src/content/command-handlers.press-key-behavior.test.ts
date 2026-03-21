import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createCommandHandlers } from './command-handlers';

type EventInitLike = {
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
  key?: string;
  data?: string | null;
  inputType?: string;
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

class FakeKeyboardEvent extends FakeEvent {
  readonly key: string;

  constructor(type: string, init: EventInitLike = {}) {
    super(type, init);
    this.key = init.key ?? '';
  }
}

class FakeInputEvent extends FakeEvent {
  readonly data: string | null;
  readonly inputType: string;

  constructor(type: string, init: EventInitLike = {}) {
    super(type, init);
    this.data = init.data ?? null;
    this.inputType = init.inputType ?? '';
  }
}

class FakeElement {
  readonly tagName: string;
  ownerDocument: FakeDocument | null = null;
  parentElement: FakeElement | null = null;
  textContent = '';
  isContentEditable = false;
  tabIndex = 0;
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

  focus(): void {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }

  blur(): void {
    if (this.ownerDocument?.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
}

class FakeInputElement extends FakeElement {
  type = 'text';
  value = '';
  selectionStart: number | null = 0;
  selectionEnd: number | null = 0;

  constructor() {
    super('input');
  }

  setRangeText(replacement: string, start: number, end: number, selectionMode?: string): void {
    this.value = `${this.value.slice(0, start)}${replacement}${this.value.slice(end)}`;
    const nextCursor = start + replacement.length;
    if (selectionMode === 'end') {
      this.selectionStart = nextCursor;
      this.selectionEnd = nextCursor;
      return;
    }

    this.selectionStart = start;
    this.selectionEnd = nextCursor;
  }
}

type FakeDocument = {
  body: FakeElement;
  activeElement: FakeElement | null;
  querySelectorAll: (selector: string) => FakeElement[];
};

type InstalledGlobals = {
  document: typeof globalThis.document;
  window: typeof globalThis.window;
  HTMLElement: typeof globalThis.HTMLElement;
  HTMLInputElement: typeof globalThis.HTMLInputElement;
  HTMLTextAreaElement: typeof globalThis.HTMLTextAreaElement;
  KeyboardEvent: typeof globalThis.KeyboardEvent;
  InputEvent: typeof globalThis.InputEvent;
};

function installFakeDom(document: FakeDocument): InstalledGlobals {
  const originals: InstalledGlobals = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    KeyboardEvent: globalThis.KeyboardEvent,
    InputEvent: globalThis.InputEvent,
  };

  globalThis.document = document as unknown as Document;
  globalThis.window = { getSelection: () => null } as Window & typeof globalThis;
  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement;
  globalThis.HTMLInputElement = FakeInputElement as unknown as typeof HTMLInputElement;
  globalThis.HTMLTextAreaElement = class FakeTextAreaElement extends FakeElement {} as unknown as typeof HTMLTextAreaElement;
  globalThis.KeyboardEvent = FakeKeyboardEvent as unknown as typeof KeyboardEvent;
  globalThis.InputEvent = FakeInputEvent as unknown as typeof InputEvent;

  return originals;
}

function restoreGlobals(originals: InstalledGlobals): void {
  globalThis.document = originals.document;
  globalThis.window = originals.window;
  globalThis.HTMLElement = originals.HTMLElement;
  globalThis.HTMLInputElement = originals.HTMLInputElement;
  globalThis.HTMLTextAreaElement = originals.HTMLTextAreaElement;
  globalThis.KeyboardEvent = originals.KeyboardEvent;
  globalThis.InputEvent = originals.InputEvent;
}

test('press_key inserts printable text into the focused editable element', async () => {
  const body = new FakeElement('body');
  const input = new FakeInputElement();
  const document: FakeDocument = {
    body,
    activeElement: input,
    querySelectorAll: () => [],
  };

  body.ownerDocument = document;
  input.ownerDocument = document;
  input.parentElement = body;
  input.focus();

  const observed: string[] = [];
  input.addEventListener('keydown', (event) => {
    observed.push(`${event.type}:${(event as FakeKeyboardEvent).key}:${input.value}`);
  });
  input.addEventListener('keypress', (event) => {
    observed.push(`${event.type}:${(event as FakeKeyboardEvent).key}:${input.value}`);
  });
  input.addEventListener('beforeinput', (event) => {
    observed.push(`${event.type}:${(event as FakeInputEvent).data}:${input.value}`);
  });
  input.addEventListener('input', (event) => {
    observed.push(`${event.type}:${(event as FakeInputEvent).data}:${input.value}`);
  });
  input.addEventListener('keyup', (event) => {
    observed.push(`${event.type}:${(event as FakeKeyboardEvent).key}:${input.value}`);
  });

  const originals = installFakeDom(document);

  try {
    const handlers = createCommandHandlers();
    const result = await handlers.pressKey({ key: 'a' });

    assert.equal(result.success, true);
    assert.equal(result.data?.key, 'a');
    assert.equal(input.value, 'a');
    assert.deepEqual(observed, [
      'keydown:a:',
      'keypress:a:',
      'beforeinput:a:',
      'input:a:a',
      'keyup:a:a',
    ]);
  } finally {
    restoreGlobals(originals);
  }
});

test('press_key sends non-text keys to the focused target without text insertion', async () => {
  const body = new FakeElement('body');
  const target = new FakeElement('div');
  const document: FakeDocument = {
    body,
    activeElement: target,
    querySelectorAll: () => [],
  };

  body.ownerDocument = document;
  target.ownerDocument = document;
  target.focus();

  const observed: string[] = [];
  target.addEventListener('keydown', (event) => {
    observed.push(`${event.type}:${(event as FakeKeyboardEvent).key}`);
  });
  target.addEventListener('keyup', (event) => {
    observed.push(`${event.type}:${(event as FakeKeyboardEvent).key}`);
  });
  target.addEventListener('beforeinput', () => {
    observed.push('beforeinput');
  });
  target.addEventListener('input', () => {
    observed.push('input');
  });

  const originals = installFakeDom(document);

  try {
    const handlers = createCommandHandlers();
    const result = await handlers.pressKey({ key: 'Escape' });

    assert.equal(result.success, true);
    assert.equal(result.data?.key, 'Escape');
    assert.equal(target.textContent, '');
    assert.deepEqual(observed, ['keydown:Escape', 'keyup:Escape']);
  } finally {
    restoreGlobals(originals);
  }
});
