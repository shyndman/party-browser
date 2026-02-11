/**
 * Type declarations for Blindflight extension
 */

import type BrowserNamespace from 'webextension-polyfill';

declare global {
  const browser: typeof BrowserNamespace;
}

export {};
