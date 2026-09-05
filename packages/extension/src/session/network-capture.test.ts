import { strict as assert } from 'node:assert';
import test from 'node:test';
import type BrowserNamespace from 'webextension-polyfill';

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

class FakeResponseFilter {
  ondata?: BrowserNamespace.WebRequest.StreamFilter['ondata'];
  onstop?: BrowserNamespace.WebRequest.StreamFilter['onstop'];
  onerror?: BrowserNamespace.WebRequest.StreamFilter['onerror'];
  error = '';
  readonly writes: ArrayBuffer[] = [];
  closed = false;
  disconnected = false;

  write(data: ArrayBuffer): void { this.writes.push(data); }
  close(): void { this.closed = true; }
  disconnect(): void { this.disconnected = true; }
}

test('network capture keeps independent tab histories and repeat starts', () => {
  const runtime = globalThis as { browser?: unknown };
  const originalBrowser = runtime.browser;
  const beforeRequest = makeWebRequestEvent();
  const beforeRedirect = makeWebRequestEvent();
  const completed = makeWebRequestEvent();
  const errors = makeWebRequestEvent();
  runtime.browser = { webRequest: { onBeforeRequest: beforeRequest, onBeforeRedirect: beforeRedirect, onCompleted: completed, onErrorOccurred: errors, filterResponseData: () => new FakeResponseFilter() } };

  try {
    const capture = new NetworkCapture();
    const allRequests = capture.sessionNetworkLogs;
    assert.equal(allRequests.size, 0);
    capture.startCapture(1);
    capture.startCapture(2);
    beforeRequest.listeners[0]({ tabId: 1, requestId: 'a', url: 'https://a.test/data', method: 'GET', type: 'xmlhttprequest', timeStamp: 1 });
    beforeRequest.listeners[1]({ tabId: 2, requestId: 'b', url: 'https://b.test/script.js', method: 'GET', type: 'script', timeStamp: 2 });
    capture.startCapture(1);

    assert.equal(capture.getRequests(1).length, 1);
    assert.equal(capture.getRequests(2).length, 1);
    assert.deepEqual([...allRequests.values()].map((requests) => requests.map((request) => request.url)), [
      ['https://a.test/data'],
      ['https://b.test/script.js'],
    ]);
    assert.equal(capture.getRequests(1, { types: ['xmlhttprequest'] }).length, 1);
    assert.equal(capture.getRequests(1, { types: ['xhr'] }).length, 0);
    assert.equal(capture.getRequests(1, { urlPattern: '/data' }).length, 1);
    capture.stopCapture(1);
    assert.equal(capture.getRequests(2).length, 1);
    assert.equal(capture.isCapturingTab(1), false);
    assert.equal(capture.isCapturingTab(2), true);
    capture.clearLogs(2);
    assert.equal(capture.getRequests(2).length, 0);
    assert.equal(allRequests.has(2), false);
    assert.equal(allRequests.size, 1);
    capture.clearLogs();
    assert.equal(allRequests.size, 0);
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
  runtime.browser = { webRequest: { onBeforeRequest: beforeRequest, onBeforeRedirect: beforeRedirect, onCompleted: completed, onErrorOccurred: errors, filterResponseData: () => new FakeResponseFilter() } };

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

function installCaptureRuntime() {
  const runtime = globalThis as { browser?: unknown };
  const originalBrowser = runtime.browser;
  const beforeRequest = makeWebRequestEvent();
  const errors = makeWebRequestEvent();
  const filters = new Map<string, FakeResponseFilter>();
  runtime.browser = {
    webRequest: {
      onBeforeRequest: beforeRequest,
      onBeforeRedirect: makeWebRequestEvent(),
      onCompleted: makeWebRequestEvent(),
      onErrorOccurred: errors,
      filterResponseData(requestId: string) {
        const filter = new FakeResponseFilter();
        filters.set(requestId, filter);
        return filter;
      },
    },
  };
  const capture = new NetworkCapture();
  return {
    capture,
    filters,
    errors,
    start(tabId: number, requestId: string, type: string) {
      capture.startCapture(tabId);
      for (const listener of beforeRequest.listeners) {
        listener({ tabId, requestId, type, url: `https://example.test/${requestId}`, method: 'GET', timeStamp: 1 });
      }
    },
    restore() {
      capture.stopCapture();
      runtime.browser = originalBrowser;
    },
  };
}

test('response capture preserves streamed bytes only for XMLHttpRequest entries', async () => {
  const fixture = installCaptureRuntime();
  try {
    fixture.start(1, 'xhr', 'xmlhttprequest');
    fixture.start(1, 'page', 'main_frame');
    fixture.start(1, 'script', 'script');
    fixture.start(1, 'image', 'image');
    assert.deepEqual([...fixture.filters.keys()], ['xhr']);
    const filter = fixture.filters.get('xhr')!;
    const chunks = [new Uint8Array([0, 255, 226]).buffer, new Uint8Array([130, 172]).buffer];
    for (const data of chunks) filter.ondata!({ data });
    assert.deepEqual(filter.writes, chunks);
    assert.strictEqual(filter.writes[0], chunks[0]);
    const [xhr, ...otherRequests] = fixture.capture.getRequests(1);
    assert.equal(xhr.responseBody, null);
    filter.onstop!({ data: new ArrayBuffer(0) });
    assert.equal(filter.closed, true);
    const body = fixture.capture.getRequests(1)[0].responseBody;
    assert.ok(body instanceof Blob);
    assert.deepEqual(new Uint8Array(await body.arrayBuffer()), new Uint8Array([0, 255, 226, 130, 172]));
    assert.ok(otherRequests.every((request) => request.responseBody === null));
    fixture.capture.stopCapture(1);
    assert.equal(filter.disconnected, false);
  } finally {
    fixture.restore();
  }
});

test('response capture distinguishes empty bodies from incomplete bodies', async () => {
  const fixture = installCaptureRuntime();
  try {
    fixture.start(1, 'empty', 'xmlhttprequest');
    fixture.filters.get('empty')!.onstop!({ data: new ArrayBuffer(0) });
    const entry = fixture.capture.getRequests(1)[0];
    assert.ok(entry.responseBody instanceof Blob);
    assert.equal(await entry.responseBody.text(), '');
  } finally {
    fixture.restore();
  }
});

test('stopping a tab disconnects its active responses without interrupting other tabs', () => {
  const fixture = installCaptureRuntime();
  try {
    fixture.start(1, 'first', 'xmlhttprequest');
    fixture.start(2, 'second', 'xmlhttprequest');
    fixture.filters.get('first')!.ondata!({ data: new Uint8Array([1]).buffer });
    fixture.capture.stopCapture(1);
    assert.equal(fixture.filters.get('first')!.disconnected, true);
    assert.equal(fixture.filters.get('first')!.closed, false);
    assert.equal(fixture.capture.getRequests(1)[0].responseBody, null);
    assert.equal(fixture.filters.get('second')!.disconnected, false);
    fixture.capture.stopCapture();
    assert.equal(fixture.filters.get('second')!.disconnected, true);
  } finally {
    fixture.restore();
  }
});

test('failed response captures do not publish partial bodies', () => {
  const fixture = installCaptureRuntime();
  try {
    fixture.start(1, 'aborted', 'xmlhttprequest');
    const aborted = fixture.filters.get('aborted')!;
    aborted.ondata!({ data: new Uint8Array([1]).buffer });
    fixture.errors.listeners[0]({ tabId: 1, requestId: 'aborted', error: 'NS_BINDING_ABORTED' });
    assert.equal(aborted.disconnected, true);
    assert.equal(fixture.capture.getRequests(1)[0].responseBody, null);

    fixture.start(1, 'filter-error', 'xmlhttprequest');
    const failed = fixture.filters.get('filter-error')!;
    failed.error = 'Invalid request ID';
    failed.onerror!({ data: new ArrayBuffer(0) });
    fixture.capture.stopCapture(1);
    assert.equal(failed.disconnected, false);
    assert.equal(fixture.capture.getRequests(1)[1].responseBody, null);
  } finally {
    fixture.restore();
  }
});
