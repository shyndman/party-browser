/**
 * Type declarations for PartyBrowser extension
 */

import type Browser from 'webextension-polyfill';

declare global {
  const browser: typeof Browser;

  namespace browser {
    export import Runtime = Browser.Runtime;
    export import WebRequest = Browser.WebRequest;
  }
}

export {};
