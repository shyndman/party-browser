/**
 * Type declarations for PartyBrowser extension
 */

import type Browser from 'webextension-polyfill';
import type { NetworkRequest } from './session';

declare global {
  const browser: typeof Browser;
  var networkRequests: Map<number, NetworkRequest[]>;

  namespace browser {
    export import Runtime = Browser.Runtime;
    export import WebRequest = Browser.WebRequest;
  }
}

export {};
