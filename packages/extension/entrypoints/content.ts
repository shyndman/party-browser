import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx: ContentScriptContext) {
    console.log('[Blindflight] Content script loaded on', window.location.href);
  }
});
