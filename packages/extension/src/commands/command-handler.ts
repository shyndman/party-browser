/**
 * Command Handler for PartyBrowser extension
 * Routes commands to appropriate command modules
 */

/// <reference path="../types/global.d.ts" />

import type {
  CommandResult,
  CommandName,
  NavigateParams,
  ClickParams,
  TypeParams,
  EvaluateParams,
  ScreenshotParams,
  SnapshotParams,
  SelectOptionParams,
  WaitParams,
  GetNetworkRequestsParams,
  GetConsoleMessagesParams,
  GoBackParams,
  GoForwardParams,
  PressKeyParams,
  WaitForParams,
  DragParams,
  HoverParams,
  CloseParams,
  GetUrlParams,
  GetTitleParams,
  GetConsoleLogsParams
} from '../types/commands';
import { ErrorCodes, type ErrorCode, CodedError } from '../utils/errors';
import type { SessionManager } from '../session/session-manager';
import type { NetworkCapture } from '../session/network-capture';
import type { ContentBridge } from '../messaging/content-bridge';
import { NavigationCommands } from './navigation';
import { InteractionCommands } from './interaction';
import { InspectionCommands } from './inspection';

/**
 * Command handler that routes commands to category modules
 */
export class CommandHandler {
  private navigation: NavigationCommands;
  private interaction: InteractionCommands;
  private inspection: InspectionCommands;

  constructor(
    private sessionManager: SessionManager,
    private networkCapture: NetworkCapture,
    private contentBridge: ContentBridge
  ) {
    this.navigation = new NavigationCommands(sessionManager, networkCapture);
    this.interaction = new InteractionCommands(sessionManager, contentBridge);
    this.inspection = new InspectionCommands(sessionManager, networkCapture, contentBridge);
  }

  /**
   * Execute a command by name
   * @param command The command name
   * @param params Command parameters
   * @returns Promise resolving to command result
   */
  async execute(
    command: CommandName,
    params: Record<string, unknown>,
    sessionId: string,
  ): Promise<CommandResult> {
    const sessionScopedParams = {
      ...params,
      sessionId,
    };

    console.log('[PartyBrowser] Handling command:', command, sessionScopedParams);

    try {
      await this.sessionManager.resolveTargetTab(
        sessionScopedParams as { sessionId?: string; tabId?: number },
      );

      switch (command) {
        // Navigation commands
        case 'navigate':
          return await this.navigation.navigate(sessionScopedParams as unknown as NavigateParams);
        case 'go_back':
          return await this.navigation.goBack(sessionScopedParams as unknown as GoBackParams);
        case 'go_forward':
          return await this.navigation.goForward(sessionScopedParams as unknown as GoForwardParams);

        // Interaction commands
        case 'click':
          return await this.interaction.click(sessionScopedParams as unknown as ClickParams);
        case 'type':
          return await this.interaction.type(sessionScopedParams as unknown as TypeParams);
        case 'select_option':
          return await this.interaction.selectOption(sessionScopedParams as unknown as SelectOptionParams);
        case 'press_key':
          return await this.interaction.pressKey(sessionScopedParams as unknown as PressKeyParams);
        case 'drag':
          return await this.interaction.drag(sessionScopedParams as unknown as DragParams);
        case 'hover':
          return await this.interaction.hover(sessionScopedParams as unknown as HoverParams);
        case 'wait':
          return await this.interaction.wait(sessionScopedParams as unknown as WaitParams);
        case 'wait_for':
          return await this.interaction.waitFor(sessionScopedParams as unknown as WaitForParams);

        // Inspection commands
        case 'screenshot':
          return await this.inspection.screenshot(sessionScopedParams as unknown as ScreenshotParams);
        case 'snapshot':
          return await this.inspection.snapshot(sessionScopedParams as unknown as SnapshotParams);
        case 'getUrl':
          return await this.inspection.getUrl(sessionScopedParams as unknown as GetUrlParams);
        case 'getTitle':
          return await this.inspection.getTitle(sessionScopedParams as unknown as GetTitleParams);
        case 'getConsoleLogs':
          return await this.inspection.getConsoleLogs(sessionScopedParams as unknown as GetConsoleLogsParams);
        case 'getNetworkRequests':
          return await this.inspection.getNetworkRequests(sessionScopedParams as unknown as GetNetworkRequestsParams);
        case 'getConsoleMessages':
          return await this.inspection.getConsoleMessages(sessionScopedParams as unknown as GetConsoleMessagesParams);
        case 'evaluate':
          return await this.inspection.evaluate(sessionScopedParams as unknown as EvaluateParams);
        case 'close':
          return await this.inspection.close(sessionScopedParams as unknown as CloseParams);
        case 'getTabs':
          return await this.inspection.getTabs();

        default:
          throw new Error(`Unknown command: ${command}`);
      }
    } catch (error) {
      console.error('[PartyBrowser] Command failed:', error);

      // Pass through CodedError as-is
      if (error instanceof CodedError) {
        return {
          success: false,
          error: error.message,
          errorCode: error.errorCode,
          stack: error.stack
        };
      }

      return {
        success: false,
        error: (error as Error).message,
        errorCode: (error as { errorCode?: ErrorCode }).errorCode || ErrorCodes.COMMAND_FAILED,
        stack: (error as Error).stack
      };
    }
  }
}
