import { strict as assert } from 'node:assert';
import test from 'node:test';

import { ConsoleCapture, MAX_CONSOLE_LOGS } from './console-capture';

test('console capture keeps a larger ring buffer and drops oldest entries', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  (globalThis as { window: WindowEventHandlers }).window = {
    onerror: null,
    onunhandledrejection: null,
  } as unknown as WindowEventHandlers;

  console.log = () => undefined;
  console.error = () => undefined;
  console.warn = () => undefined;
  console.info = () => undefined;

  const capture = new ConsoleCapture();

  try {
    for (let index = 0; index < MAX_CONSOLE_LOGS + 2; index += 1) {
      console.log(`message ${index}`);
    }

    const logs = capture.getLogs();
    assert.equal(logs.length, MAX_CONSOLE_LOGS);
    assert.equal(logs[0]?.message, 'message 2');
    assert.equal(logs.at(-1)?.message, `message ${MAX_CONSOLE_LOGS + 1}`);
  } finally {
    capture.dispose();
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;

    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window: unknown }).window = originalWindow;
    }
  }
});
