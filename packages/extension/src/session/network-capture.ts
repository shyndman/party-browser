/**
 * Network Capture module for PartyBrowser extension
 * Captures network requests via webRequest API
 */

/// <reference path="../types/global.d.ts" />

import type BrowserNamespace from 'webextension-polyfill';
import type { NetworkRequest } from '../types/session';

export const MAX_LOG_SIZE = 1000;

export interface NetworkCaptureListener {
  tabId: number;
  onBeforeRequest: (details: BrowserNamespace.WebRequest.OnBeforeRequestDetailsType) => void;
  onCompleted: (details: BrowserNamespace.WebRequest.OnCompletedDetailsType) => void;
  onErrorOccurred: (details: BrowserNamespace.WebRequest.OnErrorOccurredDetailsType) => void;
}

/**
 * Manages network request capture for browser automation sessions
 */
export class NetworkCapture {
  private sessionNetworkLogs = new Map<number, NetworkRequest[]>();
  private networkCaptureListener: NetworkCaptureListener | null = null;

  /**
   * Start capturing network requests for a specific tab
   * @param tabId The tab ID to capture requests for
   */
  startCapture(tabId: number): void {
    this.stopCapture();

    console.log(`[PartyBrowser] Starting network capture for tab ${tabId}`);
    this.sessionNetworkLogs.set(tabId, []);

    const onBeforeRequest = (details: BrowserNamespace.WebRequest.OnBeforeRequestDetailsType): void => {
      if (details.tabId !== tabId) return;

      const logs = this.sessionNetworkLogs.get(tabId);
      if (!logs) return;

      const requestEntry: NetworkRequest = {
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        type: details.type,
        timestamp: details.timeStamp,
        requestBody: details.requestBody || null,
        statusCode: null,
        responseHeaders: null,
        error: null
      };

      logs.push(requestEntry);
      if (logs.length > MAX_LOG_SIZE) {
        logs.shift();
      }
    };

    const onCompleted = (details: BrowserNamespace.WebRequest.OnCompletedDetailsType): void => {
      if (details.tabId !== tabId) return;

      const logs = this.sessionNetworkLogs.get(tabId);
      if (!logs) return;

      const entry = logs.find((r) => r.requestId === details.requestId);
      if (entry) {
        entry.statusCode = details.statusCode;
        entry.responseHeaders = (details.responseHeaders as unknown as Record<string, string>[]) || null;
      }
    };

    const onErrorOccurred = (details: BrowserNamespace.WebRequest.OnErrorOccurredDetailsType): void => {
      if (details.tabId !== tabId) return;

      const logs = this.sessionNetworkLogs.get(tabId);
      if (!logs) return;

      const entry = logs.find((r) => r.requestId === details.requestId);
      if (entry) {
        entry.error = details.error;
      }
    };

    browser.webRequest.onBeforeRequest.addListener(
      onBeforeRequest as Parameters<typeof browser.webRequest.onBeforeRequest.addListener>[0],
      { urls: ['<all_urls>'], tabId },
      ['requestBody']
    );

    browser.webRequest.onCompleted.addListener(
      onCompleted as Parameters<typeof browser.webRequest.onCompleted.addListener>[0],
      { urls: ['<all_urls>'], tabId },
      ['responseHeaders']
    );

    browser.webRequest.onErrorOccurred.addListener(
      onErrorOccurred as Parameters<typeof browser.webRequest.onErrorOccurred.addListener>[0],
      { urls: ['<all_urls>'], tabId }
    );

    this.networkCaptureListener = { tabId, onBeforeRequest, onCompleted, onErrorOccurred };
  }

  /**
   * Stop capturing network requests
   */
  stopCapture(): void {
    if (this.networkCaptureListener) {
      const { onBeforeRequest, onCompleted, onErrorOccurred } = this.networkCaptureListener;

      try {
        browser.webRequest.onBeforeRequest.removeListener(
          onBeforeRequest as Parameters<typeof browser.webRequest.onBeforeRequest.removeListener>[0]
        );
      } catch {
        // Listener may not exist
      }

      try {
        browser.webRequest.onCompleted.removeListener(
          onCompleted as Parameters<typeof browser.webRequest.onCompleted.removeListener>[0]
        );
      } catch {
        // Listener may not exist
      }

      try {
        browser.webRequest.onErrorOccurred.removeListener(
          onErrorOccurred as Parameters<typeof browser.webRequest.onErrorOccurred.removeListener>[0]
        );
      } catch {
        // Listener may not exist
      }

      console.log(`[PartyBrowser] Stopped network capture for tab ${this.networkCaptureListener.tabId}`);
      this.networkCaptureListener = null;
    }
  }

  /**
   * Get captured network requests for a tab
   * @param tabId The tab ID to get requests for
   * @param filter Optional filter for types or URL pattern
   * @returns Array of network requests
   */
  getRequests(tabId: number, filter?: { types?: string[]; urlPattern?: string }): NetworkRequest[] {
    let logs = this.sessionNetworkLogs.get(tabId) || [];

    if (filter?.types && filter.types.length > 0) {
      logs = logs.filter((r) => filter.types!.includes(r.type));
    }

    if (filter?.urlPattern) {
      const pattern = filter.urlPattern.toLowerCase();
      logs = logs.filter((r) => r.url.toLowerCase().includes(pattern));
    }

    return [...logs];
  }

  /**
   * Clear network logs for a specific tab or all tabs
   * @param tabId Optional tab ID to clear (clears all if not provided)
   */
  clearLogs(tabId?: number): void {
    if (tabId !== undefined) {
      this.sessionNetworkLogs.delete(tabId);
    } else {
      this.sessionNetworkLogs.clear();
    }
  }

  /**
   * Check if capture is currently active
   */
  isCapturing(): boolean {
    return this.networkCaptureListener !== null;
  }

  /**
   * Get the currently captured tab ID (if any)
   */
  getCapturingTabId(): number | null {
    return this.networkCaptureListener?.tabId ?? null;
  }

  /**
   * Get all captured request counts by tab
   */
  getLogCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const [tabId, logs] of this.sessionNetworkLogs.entries()) {
      counts.set(tabId, logs.length);
    }
    return counts;
  }
}
