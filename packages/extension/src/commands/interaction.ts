/**
 * Interaction Commands for PartyBrowser extension
 * Handles DOM interaction commands (click, type, drag, hover, etc.)
 */

/// <reference path="../types/global.d.ts" />

import type {
  CommandResult,
  ClickParams,
  TypeParams,
  SelectOptionParams,
  PressKeyParams,
  DragParams,
  HoverParams,
  WaitParams,
  WaitForParams,
  WaitForPayload,
  PageState,
} from '../types/commands';
import type { SessionManager } from '../session/session-manager';
import type { ContentBridge } from '../messaging/content-bridge';

import { requireSuccessfulCommandResult } from './command-result';
import { PageStateReader } from './page-state-reader';
import { TabLifecycle } from './tab-lifecycle';


type CommandOptions = {
  commandId?: string;
};

/**
 * Interaction command implementations
 */
export class InteractionCommands {
  constructor(
    private sessionManager: SessionManager,
    private contentBridge: ContentBridge,
    private pageStateReader: PageStateReader = new PageStateReader(contentBridge, sessionManager),
    private lifecycle: TabLifecycle = new TabLifecycle(),
  ) {}

  /**
   * Click on an element
   */
  async click(params: ClickParams, options: CommandOptions = {}): Promise<CommandResult> {
    const { element } = params;
    return await this.runActionLifecycle('click', params, options, async (targetTabId) => {
      return requireSuccessfulCommandResult<{ element?: string }>(
        await this.contentBridge.sendCommand(targetTabId, 'click', { element }),
        `Click failed for ${element}.`,
      ).data ?? { element };
    });
  }

  /**
   * Type text into an element
   */
  async type(params: TypeParams, options: CommandOptions = {}): Promise<CommandResult> {
    const { element, text } = params;
    return await this.runActionLifecycle('type', params, options, async (targetTabId) => {
      return requireSuccessfulCommandResult<{ element?: string; text?: string }>(
        await this.contentBridge.sendCommand(targetTabId, 'type', { element, text }),
        `Type failed for ${element}.`,
      ).data ?? { element, text };
    });
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(
    params: SelectOptionParams,
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    const { element, value } = params;
    return await this.runActionLifecycle('select_option', params, options, async (targetTabId) => {
      return requireSuccessfulCommandResult<{ element?: string; value?: string }>(
        await this.contentBridge.sendCommand(targetTabId, 'select_option', { element, value }),
        `Select option failed for ${element}.`,
      ).data ?? { element, value };
    });
  }

  /**
   * Press a key
   */
  async pressKey(params: PressKeyParams, options: CommandOptions = {}): Promise<CommandResult> {
    const { key } = params;
    return await this.runActionLifecycle('press_key', params, options, async (targetTabId) => {
      return requireSuccessfulCommandResult<{ key?: string }>(
        await this.contentBridge.sendCommand(targetTabId, 'press_key', { key }),
        `Press key failed for ${key}.`,
      ).data ?? { key };
    });
  }

  /**
   * Drag an element from start to end
   */
  async drag(params: DragParams, options: CommandOptions = {}): Promise<CommandResult> {
    const { startElement, endElement } = params;
    return await this.runActionLifecycle('drag', params, options, async (targetTabId) => {
      return requireSuccessfulCommandResult<{ startElement?: string; endElement?: string }>(
        await this.contentBridge.sendCommand(targetTabId, 'drag', { startElement, endElement }),
        `Drag failed for ${startElement} -> ${endElement}.`,
      ).data ?? { startElement, endElement };
    });
  }

  /**
   * Hover over an element
   */
  async hover(params: HoverParams, options: CommandOptions = {}): Promise<CommandResult> {
    const { element } = params;
    return await this.runActionLifecycle('hover', params, options, async (targetTabId) => {
      return requireSuccessfulCommandResult<{ element?: string }>(
        await this.contentBridge.sendCommand(targetTabId, 'hover', { element }),
        `Hover failed for ${element}.`,
      ).data ?? { element };
    });
  }

  /**
   * Wait for a specified time
   */
  async wait(params: WaitParams): Promise<CommandResult> {
    const { time } = params;
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    return await this.contentBridge.sendCommand(targetTabId, 'wait', { time }) as CommandResult;
  }

  /**
   * Wait for a condition to be met
   */
  async waitFor(params: WaitForParams): Promise<CommandResult> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    let payload: WaitForPayload;

    if (params.mode === 'time') {
      payload = { mode: 'time', value: params.value, timeout: params.timeout };
    } else if (params.mode === 'text') {
      payload = { mode: 'text', value: params.value, timeout: params.timeout };
    } else {
      payload = { mode: 'text_gone', value: params.value, timeout: params.timeout };
    }

    return await this.contentBridge.sendCommand(targetTabId, 'wait_for', payload) as CommandResult;
  }

  private async runActionLifecycle<TActionData>(
    command: 'click' | 'type' | 'select_option' | 'press_key' | 'drag' | 'hover',
    params: { sessionId: string },
    options: CommandOptions,
    dispatch: (targetTabId: number) => Promise<TActionData>,
  ): Promise<CommandResult<TActionData & { pageState: PageState }>> {
    const targetTabId = await this.sessionManager.resolveTargetTab(params);
    const result = await this.lifecycle.runCommand({
      command,
      commandId: options.commandId,
      sessionId: params.sessionId,
      tabId: targetTabId,
      requireStableBeforeDispatch: command !== 'click',
      dispatch: () => dispatch(targetTabId),
      readback: () => this.pageStateReader.read(targetTabId),
    });

    return {
      success: true,
      data: {
        ...(result.actionResult as Record<string, unknown>),
        pageState: result.readbackResult,
      } as TActionData & { pageState: PageState },
      meta: {
        workflow: result.workflow,
      },
    };
  }
}

