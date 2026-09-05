import { strict as assert } from 'node:assert';
import test from 'node:test';

import { NetworkCapture } from './network-capture';

type Listener = (details: Record<string, unknown>) => void;

function makeWebRequestEvent() {
  const listeners: Listener[] = [];
  return {
    listeners,
    addListener(listener: Listener) { listeners.push(listener); },
    removeListener(listener: Listener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
}

test('network capture keeps independent tab histories and repeat starts', () => {
  const runtime = globalThis as { browser?: unknown };
  const originalBrowser = runtime.browser;
  const beforeRequest = makeWebRequestEvent();
  const beforeRedirect = makeWebRequestEvent();
  const completed = makeWebRequestEvent();
  const errors = makeWebRequestEvent();
  runtime.browser = { webRequest: { onBeforeRequest: beforeRequest, onBeforeRedirect: beforeRedirect, onCompleted: completed, onErrorOccurred: errors } };

  try {
    const capture = new NetworkCapture();
    capture.startCapture(1);
    capture.startCapture(2);
    beforeRequest.listeners[0]({ tabId: 1, requestId: 'a', url: 'https://a.test/data', method: 'GET', type: 'xmlhttprequest', timeStamp: 1 });
    beforeRequest.listeners[1]({ tabId: 2, requestId: 'b', url: 'https://b.test/script.js', method: 'GET', type: 'script', timeStamp: 2 });
    capture.startCapture(1);

    assert.equal(capture.getRequests(1).length, 1);
    assert.equal(capture.getRequests(2).length, 1);
    assert.equal(capture.getRequests(1, { types: ['xmlhttprequest'] }).length, 1);
    assert.equal(capture.getRequests(1, { types: ['xhr'] }).length, 0);
    assert.equal(capture.getRequests(1, { urlPattern: '/data' }).length, 1);
    capture.stopCapture(1);
    assert.equal(capture.getRequests(2).length, 1);
    assert.equal(capture.isCapturingTab(1), false);
    assert.equal(capture.isCapturingTab(2), true);
    capture.clearLogs(2);
    assert.equal(capture.getRequests(2).length, 0);
  } finally {
    runtime.browser = originalBrowser;
  }
});

test('network capture completes the latest redirect hop and records errors', () => {
  const runtime = globalThis as { browser?: unknown };
  const originalBrowser = runtime.browser;
  const beforeRequest = makeWebRequestEvent();
  const beforeRedirect = makeWebRequestEvent();
  const completed = makeWebRequestEvent();
  const errors = makeWebRequestEvent();
  runtime.browser = { webRequest: { onBeforeRequest: beforeRequest, onBeforeRedirect: beforeRedirect, onCompleted: completed, onErrorOccurred: errors } };

  try {
    const capture = new NetworkCapture();
    capture.startCapture(3);
    beforeRequest.listeners[0]({ tabId: 3, requestId: 'redirect', url: 'https://example.test/redirect', method: 'GET', type: 'main_frame', timeStamp: 1 });
    beforeRedirect.listeners[0]({ tabId: 3, requestId: 'redirect', url: 'https://example.test/redirect', redirectUrl: 'https://example.test/ok', statusCode: 302, responseHeaders: [] });
    beforeRequest.listeners[0]({ tabId: 3, requestId: 'redirect', url: 'https://example.test/ok', method: 'GET', type: 'main_frame', timeStamp: 2 });
    completed.listeners[0]({ tabId: 3, requestId: 'redirect', url: 'https://example.test/ok', statusCode: 200, responseHeaders: [] });
    const requests = capture.getRequests(3);
    assert.deepEqual(requests.map((request) => [request.url, request.statusCode]), [['https://example.test/redirect', 302], ['https://example.test/ok', 200]]);

    beforeRequest.listeners[0]({ tabId: 3, requestId: 'failed', url: 'https://example.test/fail', method: 'GET', type: 'xmlhttprequest', timeStamp: 3 });
    errors.listeners[0]({ tabId: 3, requestId: 'failed', url: 'https://example.test/fail', error: 'blocked' });
    assert.equal(capture.getRequests(3).at(-1)?.error, 'blocked');
  } finally {
    runtime.browser = originalBrowser;
  }
});
