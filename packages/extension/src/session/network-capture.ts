/**
 * Network Capture module for PartyBrowser extension
 * Captures network requests via webRequest API
 */

/// <reference path="../types/global.d.ts" />

import type BrowserNamespace from 'webextension-polyfill';
import type { NetworkRequest } from '../types/session';

export const MAX_LOG_SIZE = 1000;
const NETWORK_REQUEST_ID_PREFIX = 'request-';


export interface NetworkCaptureListener {
  tabId: number;
  onBeforeRequest: (details: BrowserNamespace.WebRequest.OnBeforeRequestDetailsType) => void;
  onBeforeSendHeaders: (details: BrowserNamespace.WebRequest.OnBeforeSendHeadersDetailsType) => void;
  onBeforeRedirect: (details: BrowserNamespace.WebRequest.OnBeforeRedirectDetailsType) => void;
  onCompleted: (details: BrowserNamespace.WebRequest.OnCompletedDetailsType) => void;
  onErrorOccurred: (details: BrowserNamespace.WebRequest.OnErrorOccurredDetailsType) => void;
}

export class NetworkCapture {
  readonly sessionNetworkLogs = new Map<number, NetworkRequest[]>();
  private networkCaptureListeners = new Map<number, NetworkCaptureListener>();
  private nextNetworkRequestId = 1;

  private responseFilters = new Map<NetworkRequest, {
    tabId: number;
    filter: BrowserNamespace.WebRequest.StreamFilter;
    chunks: ArrayBuffer[];
  }>();

  private logNetworkEvent(
    level: 'log' | 'warn' | 'error',
    message: string,
    tabId: number,
    fields: Record<string, unknown>,
  ): void {
    console[level](`[PartyBrowser] ${message}`, { tabId, ...fields });
  }

  private findLatestPending(logs: NetworkRequest[], requestId: string): NetworkRequest | undefined {
    for (let index = logs.length - 1; index >= 0; index -= 1) {
      const request = logs[index];
      if (request.requestId === requestId && request.statusCode === null) return request;
    }
    return undefined;
  }

  private captureResponseBody(tabId: number, entry: NetworkRequest): void {
    let filter: BrowserNamespace.WebRequest.StreamFilter;
    try {
      filter = browser.webRequest.filterResponseData(entry.requestId);
    } catch (error) {
      this.logNetworkEvent('error', 'Response body capture failed to start.', tabId, {
        requestId: entry.requestId, url: entry.url, error,
      });
      return;
    }

    const chunks: ArrayBuffer[] = [];
    this.responseFilters.set(entry, { tabId, filter, chunks });
    filter.ondata = ({ data }) => {
      filter.write(data);
      chunks.push(data);
    };
    filter.onstop = () => {
      filter.close();
      entry.responseBody = new Blob(chunks);
      chunks.length = 0;
      this.responseFilters.delete(entry);
    };
    filter.onerror = () => {
      chunks.length = 0;
      this.responseFilters.delete(entry);
      this.logNetworkEvent('error', 'Response body capture failed.', tabId, {
        requestId: entry.requestId, url: entry.url, error: filter.error,
      });
    };
  }

  private disconnectResponseBody(entry: NetworkRequest): void {
    const capture = this.responseFilters.get(entry);
    if (!capture) return;
    capture.filter.disconnect();
    capture.chunks.length = 0;
    this.responseFilters.delete(entry);
  }

  startCapture(tabId: number): void {
    if (this.networkCaptureListeners.has(tabId)) return;
    console.log(`[PartyBrowser] Starting network capture for tab ${tabId}`);
    if (!this.sessionNetworkLogs.has(tabId)) this.sessionNetworkLogs.set(tabId, []);

    const onBeforeRequest = (details: BrowserNamespace.WebRequest.OnBeforeRequestDetailsType): void => {
      if (details.tabId !== tabId) return;
      const logs = this.sessionNetworkLogs.get(tabId);
      if (!logs) return;
      const id = `${NETWORK_REQUEST_ID_PREFIX}${this.nextNetworkRequestId}`;
      this.nextNetworkRequestId += 1;
      const entry: NetworkRequest = {
        id,
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        type: details.type,
        timestamp: details.timeStamp,
        requestHeaders: null,
        requestBody: details.requestBody || null,
        statusCode: null,
        responseHeaders: null,
        responseBody: null,
        error: null,
      };
      logs.push(entry);
      if (entry.type === 'xmlhttprequest') this.captureResponseBody(tabId, entry);
      if (logs.length > MAX_LOG_SIZE) logs.shift();
      this.logNetworkEvent('log', 'Network request started.', tabId, {
        requestId: details.requestId, url: details.url, method: details.method,
        resourceType: details.type, hasRequestBody: details.requestBody !== undefined,
      });
    };

    const onBeforeSendHeaders = (details: BrowserNamespace.WebRequest.OnBeforeSendHeadersDetailsType): void => {
      if (details.tabId !== tabId) return;
      const logs = this.sessionNetworkLogs.get(tabId);
      if (!logs) return;
      const entry = this.findLatestPending(logs, details.requestId);
      if (entry) entry.requestHeaders = details.requestHeaders || null;
    };

    const onBeforeRedirect = (details: BrowserNamespace.WebRequest.OnBeforeRedirectDetailsType): void => {
      if (details.tabId !== tabId) return;
      const logs = this.sessionNetworkLogs.get(tabId);
      if (!logs) return;
      const entry = this.findLatestPending(logs, details.requestId);
      if (entry) {
        entry.statusCode = details.statusCode;
        entry.responseHeaders = details.responseHeaders || null;
      }
      this.logNetworkEvent('log', 'Network request redirected.', tabId, {
        requestId: details.requestId, url: details.url, redirectUrl: details.redirectUrl,
        statusCode: details.statusCode,
      });
    };

    const onCompleted = (details: BrowserNamespace.WebRequest.OnCompletedDetailsType): void => {
      if (details.tabId !== tabId) return;
      const logs = this.sessionNetworkLogs.get(tabId);
      if (!logs) return;
      const entry = this.findLatestPending(logs, details.requestId);
      if (entry) {
        entry.statusCode = details.statusCode;
        entry.responseHeaders = details.responseHeaders || null;
      }
      this.logNetworkEvent('log', 'Network request completed.', tabId, {
        requestId: details.requestId, url: details.url, statusCode: details.statusCode,
        fromCache: details.fromCache, ip: details.ip,
      });
    };

    const onErrorOccurred = (details: BrowserNamespace.WebRequest.OnErrorOccurredDetailsType): void => {
      if (details.tabId !== tabId) return;
      const logs = this.sessionNetworkLogs.get(tabId);
      if (!logs) return;
      const entry = (() => {
        for (let index = logs.length - 1; index >= 0; index -= 1) {
          const request = logs[index];
          if (request.requestId === details.requestId && request.error === null) return request;
        }
        return undefined;
      })();
      if (entry) {
        entry.error = details.error;
        this.disconnectResponseBody(entry);
      }
      this.logNetworkEvent('error', 'Network request failed.', tabId, {
        requestId: details.requestId, url: details.url, error: details.error,
      });
    };

    browser.webRequest.onBeforeRequest.addListener(onBeforeRequest as Parameters<typeof browser.webRequest.onBeforeRequest.addListener>[0], { urls: ['<all_urls>'], tabId }, ['requestBody', 'blocking']);
    browser.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders as Parameters<typeof browser.webRequest.onBeforeSendHeaders.addListener>[0], { urls: ['<all_urls>'], tabId }, ['requestHeaders']);
    browser.webRequest.onBeforeRedirect.addListener(onBeforeRedirect as Parameters<typeof browser.webRequest.onBeforeRedirect.addListener>[0], { urls: ['<all_urls>'], tabId }, ['responseHeaders']);
    browser.webRequest.onCompleted.addListener(onCompleted as Parameters<typeof browser.webRequest.onCompleted.addListener>[0], { urls: ['<all_urls>'], tabId }, ['responseHeaders']);
    browser.webRequest.onErrorOccurred.addListener(onErrorOccurred as Parameters<typeof browser.webRequest.onErrorOccurred.addListener>[0], { urls: ['<all_urls>'], tabId });
    this.networkCaptureListeners.set(tabId, { tabId, onBeforeRequest, onBeforeSendHeaders, onBeforeRedirect, onCompleted, onErrorOccurred });
  }

  stopCapture(tabId?: number): void {
    for (const [capturedTabId, listener] of this.networkCaptureListeners.entries()) {
      if (tabId !== undefined && capturedTabId !== tabId) continue;
      const { onBeforeRequest, onBeforeSendHeaders, onBeforeRedirect, onCompleted, onErrorOccurred } = listener;
      browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest as Parameters<typeof browser.webRequest.onBeforeRequest.removeListener>[0]);
      browser.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeaders as Parameters<typeof browser.webRequest.onBeforeSendHeaders.removeListener>[0]);
      browser.webRequest.onBeforeRedirect.removeListener(onBeforeRedirect as Parameters<typeof browser.webRequest.onBeforeRedirect.removeListener>[0]);
      browser.webRequest.onCompleted.removeListener(onCompleted as Parameters<typeof browser.webRequest.onCompleted.removeListener>[0]);
      browser.webRequest.onErrorOccurred.removeListener(onErrorOccurred as Parameters<typeof browser.webRequest.onErrorOccurred.removeListener>[0]);
      console.log(`[PartyBrowser] Stopped network capture for tab ${capturedTabId}`);
      this.networkCaptureListeners.delete(capturedTabId);
    }
    for (const [entry, capture] of this.responseFilters) {
      if (tabId === undefined || capture.tabId === tabId) this.disconnectResponseBody(entry);
    }
  }

  getRequests(tabId: number, filter?: { types?: string[]; urlPattern?: string }): NetworkRequest[] {
    let logs = this.sessionNetworkLogs.get(tabId) || [];
    if (filter?.types && filter.types.length > 0) logs = logs.filter((request) => filter.types!.includes(request.type));
    if (filter?.urlPattern) {
      const pattern = filter.urlPattern.toLowerCase();
      logs = logs.filter((request) => request.url.toLowerCase().includes(pattern));
    }
    return [...logs];
  }

  getRequest(tabId: number, id: string): NetworkRequest | undefined {
    return this.sessionNetworkLogs.get(tabId)?.find((request) => request.id === id);
  }

  clearLogs(tabId?: number): void {
    if (tabId === undefined) this.sessionNetworkLogs.clear();
    else this.sessionNetworkLogs.delete(tabId);
  }

  isCapturingTab(tabId: number): boolean { return this.networkCaptureListeners.has(tabId); }
  isCapturing(): boolean { return this.networkCaptureListeners.size > 0; }

  getLogCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const [tabId, logs] of this.sessionNetworkLogs.entries()) counts.set(tabId, logs.length);
    return counts;
  }
}
