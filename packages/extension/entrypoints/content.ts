/**
 * Content script entrypoint for PartyBrowser Firefox extension
 * Handles DOM interaction and console log capture
 */

/// <reference path="../src/types/global.d.ts" />

import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

import { createCommandHandlers } from '../src/content/command-handlers';
import { createRuntimeMessageListener } from '../src/content/message-router';
import { ConsoleCapture } from '../src/session/console-capture';

export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx: ContentScriptContext) {
    console.log('[PartyBrowser] Content script loaded on', window.location.href);

    const consoleCapture = new ConsoleCapture();
    const commandHandlers = createCommandHandlers();
    const messageListener = createRuntimeMessageListener(commandHandlers, consoleCapture);

    browser.runtime.onMessage.addListener(messageListener);

    ctx.onInvalidated(() => {
      console.log('[PartyBrowser] Content script invalidated');
      browser.runtime.onMessage.removeListener(messageListener);
      consoleCapture.dispose();
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[PartyBrowser] Content script ready');
      });
      return;
    }

    console.log('[PartyBrowser] Content script ready (document already loaded)');
  },
});
