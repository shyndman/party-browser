import { strict as assert } from 'node:assert';
import test from 'node:test';

import type { NetworkRequest } from '../types/session';
import { InspectionCommands } from './inspection';

interface NetworkRequestDetailsData {
  id: string;
  requestHeaders: Array<{ name: string; value?: string }> | null;
  requestBody: {
    raw?: Array<{ body?: string; file?: string }>;
  } | null;
  responseHeaders: Array<{ name: string; value?: string }> | null;
  responseBody: string | null;
  encoding: string;
}

interface NetworkRequestsData {
  requests: Array<{ id: string }>;
}

function createCommands(request: NetworkRequest): InspectionCommands {
  const sessionManager = {
    resolveTargetTab: async () => 7,
  };
  const networkCapture = {
    getRequest: (tabId: number, id: string) => tabId === 7 && id === request.id ? request : undefined,
    getRequests: (tabId: number) => tabId === 7 ? [request] : [],
  };
  return new InspectionCommands(sessionManager as never, networkCapture as never, {} as never, {} as never);
}

function makeRequest(responseBytes: number[]): NetworkRequest {
  return {
    id: 'request-7',
    requestId: 'firefox-request',
    url: 'https://example.test/data',
    method: 'POST',
    type: 'xmlhttprequest',
    timestamp: 1,
    requestHeaders: [{ name: 'content-type', value: 'text/plain' }],
    requestBody: { raw: [{ bytes: new Uint8Array([104, 105]).buffer }] },
    statusCode: 200,
    responseHeaders: [{ name: 'content-type', value: 'text/plain' }],
    responseBody: new Blob([new Uint8Array(responseBytes)]),
    error: null,
  };
}

test('network request list exposes only the PartyBrowser capture identifier', async () => {
  const commands = createCommands(makeRequest([226, 130, 172]));
  const result = await commands.getNetworkRequests({ sessionId: 'session-1' });
  const data = result.data as NetworkRequestsData;

  assert.deepEqual(data.requests, [{
    id: 'request-7',
    url: 'https://example.test/data',
    method: 'POST',
    type: 'xmlhttprequest',
    status: 200,
    timestamp: 1,
    error: null,
  }]);
  assert.equal('requestId' in data.requests[0], false);
});

test('network request details defaults body decoding to UTF-8', async () => {
  const commands = createCommands(makeRequest([226, 130, 172]));
  const result = await commands.getNetworkRequestDetails({ sessionId: 'session-1', id: 'request-7' });
  const details = result.data as NetworkRequestDetailsData;

  assert.equal(details.encoding, 'utf-8');
  assert.equal('requestId' in details, false);
  assert.equal(details.responseBody, '€');
  assert.equal(details.requestBody?.raw?.[0].body, 'hi');
  assert.deepEqual(details.requestHeaders, [{ name: 'content-type', value: 'text/plain' }]);
  assert.deepEqual(details.responseHeaders, [{ name: 'content-type', value: 'text/plain' }]);
});

test('network request details uses the requested body encoding', async () => {
  const commands = createCommands(makeRequest([99, 97, 102, 233]));
  const result = await commands.getNetworkRequestDetails({
    sessionId: 'session-1',
    id: 'request-7',
    encoding: 'windows-1252',
  });
  const details = result.data as NetworkRequestDetailsData;

  assert.equal(details.encoding, 'windows-1252');
  assert.equal(details.responseBody, 'café');
});

