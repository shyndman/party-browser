/**
 * Navigation Commands for PartyBrowser extension
 * Handles navigation-related browser commands
 */

/// <reference path="../types/global.d.ts" />

import type {
  CommandResult,
  NavigateParams,
  GoBackParams,
  GoForwardParams
} from '../types/commands';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';

/**
 * Navigation command implementations
 */
export class NavigationCommands {
  constructor(
    private sessionManager: SessionManager,
    private networkCapture: NetworkCapture
  ) {}

  /**
   * Navigate to a URL in the session tab
   */
  async navigate(params: NavigateParams): Promise<CommandResult> {
    const { url } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    if (this.networkCapture.getCapturingTabId() !== targetTabId) {
      this.networkCapture.startCapture(targetTabId);
    }

    await browser.tabs.update(targetTabId, { url });
    await this.waitForTabLoad(targetTabId);

    return { success: true, data: { url, tabId: targetTabId } };
  }

  /**
   * Navigate back in history
   */
  async goBack(params: GoBackParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    await browser.tabs.goBack(targetTabId);
    await this.waitForTabLoad(targetTabId);
    return { success: true };
  }

  /**
   * Navigate forward in history
   */
  async goForward(params: GoForwardParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    await browser.tabs.goForward(targetTabId);
    await this.waitForTabLoad(targetTabId);
    return { success: true };
  }

  /**
   * Wait for tab to finish loading
   */
  private async waitForTabLoad(tabId: number): Promise<void> {
    try {
      const [readyState] = await browser.tabs.executeScript(tabId, {
        code: 'document.readyState',
      });

      if (readyState === 'complete') {
        return;
      }
    } catch {
      // Fall back to the load listener when the readiness probe is unavailable.
    }

    await new Promise<void>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        browser.tabs.onUpdated.removeListener(listener);
      };

      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeoutId);
          cleanup();
          resolve();
        }
      };

      browser.tabs.onUpdated.addListener(listener);

      timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, 10000);
    });
  }
}
