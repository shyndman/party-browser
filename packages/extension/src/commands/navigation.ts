/**
 * Navigation Commands for PartyBrowser extension
 * Handles navigation-related browser commands
 */

/// <reference path="../types/global.d.ts" />

import type {
  CommandResult,
  CommandWorkflowMeta,
  NavigateParams,
  GoBackParams,
  GoForwardParams,
  PageState,
} from '../types/commands';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';
import type { ErrorCode } from '../utils/errors';

import { PageStateReader } from './page-state-reader';
import { TabLifecycle } from './tab-lifecycle';

type CommandOptions = {
  commandId?: string;
};

type NavigationReadback = {
  pageState: PageState;
  workflow: Pick<CommandWorkflowMeta, 'readbackError' | 'readbackErrorCode'>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown): ErrorCode | undefined {
  return typeof error === 'object' && error !== null && 'errorCode' in error
    ? (error as { errorCode?: ErrorCode }).errorCode
    : undefined;
}

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

  private async readPageStateAfterNavigation(tabId: number): Promise<NavigationReadback> {
    try {
      return { pageState: await this.pageStateReader.read(tabId), workflow: {} };
    } catch (error) {
      console.error('[PartyBrowser] Navigation readback failed.', { tabId, error: getErrorMessage(error), errorCode: getErrorCode(error) });
      throw error;
    }
  }

  /**
   * Navigate to a URL in the session tab
   */
  async navigate(
    params: NavigateParams,
    options: CommandOptions = {},
  ): Promise<CommandResult<{ url: string; tabId: number; pageState: PageState }>> {
    const { url } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);

    if (!this.networkCapture.isCapturingTab(targetTabId)) {
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
      readback: () => this.readPageStateAfterNavigation(targetTabId),
    });

    return {
      success: true,
      data: {
        ...result.actionResult,
        pageState: result.readbackResult.pageState,
      },
      meta: {
        workflow: {
          ...result.workflow,
          ...result.readbackResult.workflow,
        },
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
      command: 'goBack',
      commandId: options.commandId,
      sessionId: params.sessionId,
      tabId: targetTabId,
      requireStableBeforeDispatch: false,
      dispatch: async () => {
        await browser.tabs.goBack(targetTabId);
        return {};
      },
      readback: () => this.readPageStateAfterNavigation(targetTabId),
    });

    return {
      success: true,
      data: {
        pageState: result.readbackResult.pageState,
      },
      meta: {
        workflow: {
          ...result.workflow,
          ...result.readbackResult.workflow,
        },
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
      command: 'goForward',
      commandId: options.commandId,
      sessionId: params.sessionId,
      tabId: targetTabId,
      requireStableBeforeDispatch: false,
      dispatch: async () => {
        await browser.tabs.goForward(targetTabId);
        return {};
      },
      readback: () => this.readPageStateAfterNavigation(targetTabId),
    });

    return {
      success: true,
      data: {
        pageState: result.readbackResult.pageState,
      },
      meta: {
        workflow: {
          ...result.workflow,
          ...result.readbackResult.workflow,
        },
      },
    };
  }
}
