/**
 * Navigation Commands for Blindflight extension
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
    let targetTabId: number;

    if (!this.sessionManager.hasSession()) {
      console.log('[Blindflight] Creating session tab at about:blank');
      targetTabId = await this.sessionManager.createSession();
      this.networkCapture.startCapture(targetTabId);
    } else {
      targetTabId = this.sessionManager.getSessionTabId()!;

      try {
        await browser.tabs.get(targetTabId);
      } catch {
        console.log('[Blindflight] Prior session tab closed; creating new session tab');
        targetTabId = await this.sessionManager.createSession();
      }
    }

    await browser.tabs.update(targetTabId, { url });
    await this.waitForTabLoad(targetTabId);

    try {
      await browser.tabs.executeScript(targetTabId, {
        code: `document.title = 'OC | ' + document.title`
      });
    } catch (error) {
      console.log('[Blindflight] Could not update tab title:', (error as Error).message);
    }

    return { success: true, data: { url, tabId: targetTabId } };
  }

  /**
   * Navigate back in history
   */
  async goBack(params: GoBackParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    await browser.tabs.goBack(targetTabId);
    return { success: true };
  }

  /**
   * Navigate forward in history
   */
  async goForward(params: GoForwardParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    await browser.tabs.goForward(targetTabId);
    return { success: true };
  }

  /**
   * Wait for tab to finish loading
   */
  private waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          browser.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(listener);

      setTimeout(() => {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });
  }
}
