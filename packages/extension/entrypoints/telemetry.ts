/**
 * Content script entrypoint for PartyBrowser Firefox extension
 * Handles DOM interaction and console log capture
 */

/// <reference path="../src/types/global.d.ts" />

import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import type BrowserNamespace from 'webextension-polyfill';

import { createCommandHandlers } from '../src/content/command-handlers';
import { createRuntimeMessageListener } from '../src/content/message-router';
import { ConsoleCapture } from '../src/session/console-capture';

type TelemetryFields = Record<string, unknown>;
type TelemetryControlMessage = { type?: string };

export default defineUnlistedScript({
  main() {
    const state = globalThis as typeof globalThis & { __partyBrowserTelemetryCleanup?: () => void };

    if (state.__partyBrowserTelemetryCleanup) {
      return;
    }

    // Check before constructing WXT's context: construction invalidates older contexts.
    const ctx = new ContentScriptContext('telemetry');
    let consoleCapture: ConsoleCapture | undefined;
    let stopPageTelemetry: (() => void) | undefined;
    let messageListener: BrowserNamespace.Runtime.OnMessageListener | undefined;

    const stopListener = (message: unknown) => {
      const controlMessage = message as TelemetryControlMessage;

      if (controlMessage.type !== 'stopTelemetry') {
        return undefined;
      }

      cleanup();

      return Promise.resolve({ success: true });
    };

    const onReady = () => logPageTelemetry('content_script_ready');

    const cleanup = () => {
      if (state.__partyBrowserTelemetryCleanup !== cleanup) {
        return;
      }

      delete state.__partyBrowserTelemetryCleanup;
      logPageTelemetry('content_script_invalidated');

      if (messageListener) {
        browser.runtime.onMessage.removeListener(messageListener);
      }

      browser.runtime.onMessage.removeListener(stopListener);
      document.removeEventListener('DOMContentLoaded', onReady);
      stopPageTelemetry?.();
      consoleCapture?.dispose();
    };

    state.__partyBrowserTelemetryCleanup = cleanup;
    ctx.onInvalidated(cleanup);

    try {
      consoleCapture = new ConsoleCapture();
      stopPageTelemetry = installPageTelemetry();
      logPageTelemetry('content_script_attached');

      messageListener = createRuntimeMessageListener(createCommandHandlers(), consoleCapture);
      browser.runtime.onMessage.addListener(stopListener);
      browser.runtime.onMessage.addListener(messageListener);

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
      } else {
        logPageTelemetry('content_script_ready_immediate');
      }
    } catch (error) {
      cleanup();

      throw error;
    }
  },
});

function installPageTelemetry(): () => void {
  logPageTelemetry('page_telemetry_installing');

  const removeListeners: Array<() => void> = [];
  let lastActiveElement = describeActiveElement();
  let pendingMutationSummary: {
    mutationCount: number;
    childListMutations: number;
    characterDataMutations: number;
    addedNodes: number;
    removedNodes: number;
    titleChanged: boolean;
    bodyMutated: boolean;
    headMutated: boolean;
  } | null = null;
  let mutationFlushTimer: number | null = null;

  const addListener = <TTarget extends Window | Document>(
    target: TTarget,
    type: string,
    listener: EventListener,
  ) => {
    target.addEventListener(type, listener);
    removeListeners.push(() => target.removeEventListener(type, listener));
  };

  const scheduleMutationFlush = () => {
    if (mutationFlushTimer !== null) {
      return;
    }

    mutationFlushTimer = window.setTimeout(() => {
      mutationFlushTimer = null;

      if (!pendingMutationSummary) {
        return;
      }

      const activeElement = describeActiveElement();
      const activeElementChanged = activeElement !== lastActiveElement;
      const previousActiveElement = lastActiveElement;
      lastActiveElement = activeElement;

      logPageTelemetry('dom_mutation_batch', {
        ...pendingMutationSummary,
        activeElementChanged,
        previousActiveElement,
      });

      pendingMutationSummary = null;
    }, 0);
  };

  const mutationObserver = new MutationObserver((mutations) => {
    const summary = pendingMutationSummary ?? {
      mutationCount: 0,
      childListMutations: 0,
      characterDataMutations: 0,
      addedNodes: 0,
      removedNodes: 0,
      titleChanged: false,
      bodyMutated: false,
      headMutated: false,
    };

    for (const mutation of mutations) {
      summary.mutationCount += 1;
      summary.addedNodes += mutation.addedNodes.length;
      summary.removedNodes += mutation.removedNodes.length;

      if (mutation.type === 'childList') {
        summary.childListMutations += 1;
      }

      if (mutation.type === 'characterData') {
        summary.characterDataMutations += 1;
      }

      if (isTitleMutation(mutation)) {
        summary.titleChanged = true;
      }

      if (isNodeInside(document.body, mutation.target)) {
        summary.bodyMutated = true;
      }

      if (isNodeInside(document.head, mutation.target)) {
        summary.headMutated = true;
      }
    }

    pendingMutationSummary = summary;
    scheduleMutationFlush();
  });

  mutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  const logWindowEvent = (eventName: string, extraFields?: TelemetryFields) => {
    logPageTelemetry(eventName, extraFields);
  };

  addListener(document, 'readystatechange', () => {
    logWindowEvent('readystatechange');
  });
  addListener(document, 'visibilitychange', () => {
    logWindowEvent('visibilitychange');
  });
  addListener(window, 'DOMContentLoaded', () => {
    logWindowEvent('dom_content_loaded');
  });
  addListener(window, 'load', () => {
    logWindowEvent('window_load');
  });
  addListener(window, 'pageshow', (event) => {
    logWindowEvent('pageshow', { persisted: (event as PageTransitionEvent).persisted });
  });
  addListener(window, 'pagehide', (event) => {
    logWindowEvent('pagehide', { persisted: (event as PageTransitionEvent).persisted });
  });
  addListener(window, 'beforeunload', () => {
    logWindowEvent('beforeunload');
  });
  addListener(window, 'popstate', (event) => {
    logWindowEvent('popstate', { state: summarizeValue((event as PopStateEvent).state) });
  });
  addListener(window, 'hashchange', (event) => {
    const hashChangeEvent = event as HashChangeEvent;
    logWindowEvent('hashchange', {
      oldURL: hashChangeEvent.oldURL,
      newURL: hashChangeEvent.newURL,
    });
  });
  addListener(window, 'focus', () => {
    logWindowEvent('window_focus');
  });
  addListener(window, 'blur', () => {
    logWindowEvent('window_blur');
  });

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = ((...args: Parameters<History['pushState']>) => {
    logHistoryTransition('history.pushState.before', args);
    const result = originalPushState(...args);
    logHistoryTransition('history.pushState.after', args);
    return result;
  }) as History['pushState'];

  history.replaceState = ((...args: Parameters<History['replaceState']>) => {
    logHistoryTransition('history.replaceState.before', args);
    const result = originalReplaceState(...args);
    logHistoryTransition('history.replaceState.after', args);
    return result;
  }) as History['replaceState'];

  logPageTelemetry('page_telemetry_installed');

  return () => {
    if (mutationFlushTimer !== null) {
      window.clearTimeout(mutationFlushTimer);
    }

    mutationObserver.disconnect();
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;

    while (removeListeners.length > 0) {
      removeListeners.pop()?.();
    }

    logPageTelemetry('page_telemetry_removed');
  };
}

function logHistoryTransition(
  eventName: string,
  args: Parameters<History['pushState']> | Parameters<History['replaceState']>,
): void {
  logPageTelemetry(eventName, {
    historyState: summarizeValue(args[0]),
    historyTitleArg: args[1],
    historyUrlArg: args[2] === undefined ? undefined : String(args[2]),
  });
}

function logPageTelemetry(event: string, extraFields: TelemetryFields = {}): void {
  console.log('[PartyBrowser] Page telemetry.', {
    event,
    timestampMs: Date.now(),
    performanceMs: Math.round(performance.now()),
    url: window.location.href,
    title: document.title,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
    historyLength: history.length,
    activeElement: describeActiveElement(),
    ...extraFields,
  });
}

function describeActiveElement(): string {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return 'none';
  }

  const tagName = activeElement.tagName.toLowerCase();
  const id = activeElement.id ? `#${activeElement.id}` : '';
  const role = activeElement.getAttribute('role');
  const roleSuffix = role ? `[role=${role}]` : '';
  const text = activeElement.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40);
  const textSuffix = text ? ` text=${JSON.stringify(text)}` : '';

  return `${tagName}${id}${roleSuffix}${textSuffix}`;
}

function isNodeInside(root: ParentNode | null, target: Node): boolean {
  return root instanceof Node && (root === target || root.contains(target));
}

function isTitleMutation(mutation: MutationRecord): boolean {
  const titleElement = document.querySelector('title');
  if (!titleElement) {
    return false;
  }

  if (mutation.target === titleElement) {
    return true;
  }

  const parentNode = mutation.target.parentNode;
  return parentNode === titleElement || mutation.target === titleElement.firstChild;
}

function summarizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
