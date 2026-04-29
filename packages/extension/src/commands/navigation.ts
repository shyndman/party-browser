/**
 * Navigation Commands for PartyBrowser extension
 * Handles navigation-related browser commands
 */

/// <reference path="../types/global.d.ts" />

import type {
  CommandResult,
  NavigateParams,
  GoBackParams,
  GoForwardParams,
  PageState,
} from '../types/commands';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';

import { PageStateReader } from './page-state-reader';
import { TabLifecycle } from './tab-lifecycle';

type CommandOptions = {
  commandId?: string;
};

/**
 * Navigation command implementations
 */
export class NavigationCommands {
  constructor(
    private sessionManager: SessionManager,
    private networkCapture: NetworkCapture,
    private pageStateReader: PageStateReader,
    private lifecycle: TabLifecycle = new TabLifecycle(),
  ) {}

  /**
   * Navigate to a URL in the session tab
   */
  async navigate(
    params: NavigateParams,
    options: CommandOptions = {},
  ): Promise<CommandResult<{ url: string; tabId: number; pageState: PageState }>> {
    const { url } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    if (this.networkCapture.getCapturingTabId() !== targetTabId) {
      this.networkCapture.startCapture(targetTabId);
    }

    const result = await this.lifecycle.runCommand({
      command: 'navigate',
      commandId: options.commandId,
      sessionId: params.sessionId,
      tabId: targetTabId,
      requireStableBeforeDispatch: false,
      dispatch: async () => {
        await browser.tabs.update(targetTabId, { url });
        return { url, tabId: targetTabId };
      },
      readback: () => this.pageStateReader.read(targetTabId),
    });

    return {
      success: true,
      data: {
        ...result.actionResult,
        pageState: result.readbackResult,
      },
      meta: {
        workflow: result.workflow,
      },
    };
  }

  /**
   * Navigate back in history
   */
  async goBack(
    params: GoBackParams,
    options: CommandOptions = {},
  ): Promise<CommandResult<{ pageState: PageState }>> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    const result = await this.lifecycle.runCommand({
      command: 'go_back',
      commandId: options.commandId,
      sessionId: params.sessionId,
      tabId: targetTabId,
      requireStableBeforeDispatch: false,
      dispatch: async () => {
        await browser.tabs.goBack(targetTabId);
        return {};
      },
      readback: () => this.pageStateReader.read(targetTabId),
    });

    return {
      success: true,
      data: {
        pageState: result.readbackResult,
      },
      meta: {
        workflow: result.workflow,
      },
    };
  }

  /**
   * Navigate forward in history
   */
  async goForward(
    params: GoForwardParams,
    options: CommandOptions = {},
  ): Promise<CommandResult<{ pageState: PageState }>> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    const result = await this.lifecycle.runCommand({
      command: 'go_forward',
      commandId: options.commandId,
      sessionId: params.sessionId,
      tabId: targetTabId,
      requireStableBeforeDispatch: false,
      dispatch: async () => {
        await browser.tabs.goForward(targetTabId);
        return {};
      },
      readback: () => this.pageStateReader.read(targetTabId),
    });

    return {
      success: true,
      data: {
        pageState: result.readbackResult,
      },
      meta: {
        workflow: result.workflow,
      },
    };
  }
}
