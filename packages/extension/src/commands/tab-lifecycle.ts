import type {
  CommandPhase,
  CommandWorkflowMeta,
} from '../types/commands';
import { CodedError, ErrorCodes } from '../utils/errors';

import { logCommandPhase } from './command-logging';

export type TabState = {
  status?: 'loading' | 'complete';
  url?: string;
  title?: string;
  pendingUrl?: string;
};

export type LoadWaiter = {
  wait(): Promise<void>;
  dispose(): void;
};

export type WorkflowContext = {
  command: string;
  commandId?: string;
  sessionId?: string;
  tabId: number;
};

export class CommandWorkflowError extends CodedError {
  constructor(
    readonly phase: CommandPhase,
    message: string,
    errorCode: typeof ErrorCodes[keyof typeof ErrorCodes] = ErrorCodes.COMMAND_FAILED,
  ) {
    super(message, errorCode);
    this.name = 'CommandWorkflowError';
  }
}

export function readTabState(tabId: number): Promise<TabState> {
  return browser.tabs.get(tabId).then((tab) => ({
    status: tab.status === 'loading' || tab.status === 'complete' ? tab.status : undefined,
    url: tab.url,
    title: tab.title,
    pendingUrl: tab.pendingUrl,
  }));
}

export function isTabLoading(state: TabState): boolean {
  return state.status === 'loading';
}

function toWorkflowError(phase: CommandPhase, error: unknown): CommandWorkflowError {
  if (error instanceof CommandWorkflowError) {
    return error;
  }

  if (error instanceof CodedError) {
    return new CommandWorkflowError(phase, error.message, error.errorCode);
  }

  return new CommandWorkflowError(
    phase,
    error instanceof Error ? error.message : String(error),
    ErrorCodes.COMMAND_FAILED,
  );
}

export function createLoadWaiter(context: WorkflowContext, timeoutMs = 10000): LoadWaiter {
  let cleanup = () => undefined;
  let disposed = false;
  let settled = false;

  const settle = (
    action: () => void,
  ) => {
    if (settled) {
      return;
    }

    settled = true;
    action();
  };

  const promise = new Promise<void>((resolve, reject) => {
    const onCompleted = (details: { tabId: number; frameId: number; url?: string }) => {
      if (details.tabId !== context.tabId || details.frameId !== 0) {
        return;
      }

      settle(() => {
        logCommandPhase('log', 'Command load completed.', {
          command: context.command,
          commandId: context.commandId,
          parentCommandId: context.commandId,
          origin: 'system',
          phase: 'wait_complete',
          sessionId: context.sessionId,
          tabId: context.tabId,
          url: details.url,
        });
        resolve();
      });
    };

    const onErrorOccurred = (details: {
      tabId: number;
      frameId: number;
      url?: string;
      error?: string;
    }) => {
      if (details.tabId !== context.tabId || details.frameId !== 0) {
        return;
      }

      settle(() => {
        reject(
          new CodedError(
            `Navigation failed for tab ${context.tabId}: ${details.error ?? 'unknown error'}.`,
            ErrorCodes.COMMAND_FAILED,
          ),
        );
      });
    };

    const onRemoved = (removedTabId: number) => {
      if (removedTabId !== context.tabId) {
        return;
      }

      settle(() => {
        reject(
          new CodedError(
            `Tab ${context.tabId} closed while waiting for load completion.`,
            ErrorCodes.SESSION_TAB_CLOSED,
          ),
        );
      });
    };

    const timeoutId = setTimeout(() => {
      settle(() => {
        reject(
          new CodedError(
            `Timed out waiting for tab ${context.tabId} to finish loading.`,
            ErrorCodes.COMMAND_FAILED,
          ),
        );
      });
    }, timeoutMs);

    browser.webNavigation.onCompleted.addListener(onCompleted);
    browser.webNavigation.onErrorOccurred.addListener(onErrorOccurred);
    browser.tabs.onRemoved.addListener(onRemoved);

    cleanup = () => {
      if (disposed) {
        return;
      }

      disposed = true;
      clearTimeout(timeoutId);
      browser.webNavigation.onCompleted.removeListener(onCompleted);
      browser.webNavigation.onErrorOccurred.removeListener(onErrorOccurred);
      browser.tabs.onRemoved.removeListener(onRemoved);
    };
  });

  return {
    wait: async () => {
      try {
        await promise;
      } finally {
        cleanup();
      }
    },
    dispose: cleanup,
  };
}

export type RunCommandLifecycleParams<TAction, TReadback> = WorkflowContext & {
  requireStableBeforeDispatch: boolean;
  dispatch(): Promise<TAction>;
  readback(): Promise<TReadback>;
};

export type RunCommandLifecycleResult<TAction, TReadback> = {
  actionResult: TAction;
  readbackResult: TReadback;
  workflow: CommandWorkflowMeta;
};

export class TabLifecycle {
  constructor(
    private readonly loadWaiterFactory: (context: WorkflowContext) => LoadWaiter = createLoadWaiter,
  ) {}

  async waitForTabToSettle(context: WorkflowContext): Promise<void> {
    const waiter = this.loadWaiterFactory(context);

    try {
      const state = await readTabState(context.tabId);
      if (!isTabLoading(state)) {
        return;
      }

      logCommandPhase('log', 'Command waiting for existing load to settle.', {
        command: context.command,
        commandId: context.commandId,
        parentCommandId: context.commandId,
        origin: 'system',
        phase: 'wait_begin',
        sessionId: context.sessionId,
        tabId: context.tabId,
        status: state.status,
        pendingUrl: state.pendingUrl,
      });
      await waiter.wait();
    } catch (error) {
      throw toWorkflowError('wait', error);
    } finally {
      waiter.dispose();
    }
  }

  async runCommand<TAction, TReadback>(
    params: RunCommandLifecycleParams<TAction, TReadback>,
  ): Promise<RunCommandLifecycleResult<TAction, TReadback>> {
    let waiter: LoadWaiter | undefined;

    try {
      const before = await readTabState(params.tabId);
      logCommandPhase('log', 'Command precondition inspected.', {
        command: params.command,
        commandId: params.commandId,
        origin: 'user',
        phase: 'precondition',
        sessionId: params.sessionId,
        tabId: params.tabId,
        status: before.status,
        pendingUrl: before.pendingUrl,
      });

      if (params.requireStableBeforeDispatch && isTabLoading(before)) {
        throw new CommandWorkflowError(
          'precondition',
          `Tab ${params.tabId} is already loading before ${params.command}.`,
        );
      }

      let actionResult: TAction;
      try {
        actionResult = await params.dispatch();
      } catch (error) {
        throw toWorkflowError('dispatch', error);
      }

      logCommandPhase('log', 'Command action dispatched.', {
        command: params.command,
        commandId: params.commandId,
        origin: 'user',
        phase: 'dispatch',
        sessionId: params.sessionId,
        tabId: params.tabId,
      });

      waiter = this.loadWaiterFactory(params);
      const after = await readTabState(params.tabId);
      const waitRequired = isTabLoading(after);
      if (waitRequired) {
        logCommandPhase('log', 'Command detected post-action loading.', {
          command: params.command,
          commandId: params.commandId,
          parentCommandId: params.commandId,
          origin: 'system',
          phase: 'wait_begin',
          sessionId: params.sessionId,
          tabId: params.tabId,
          status: after.status,
          pendingUrl: after.pendingUrl,
        });

        try {
          await waiter.wait();
        } catch (error) {
          throw toWorkflowError('wait', error);
        }
      }

      let readbackResult: TReadback;
      try {
        logCommandPhase('log', 'Command readback starting.', {
          command: params.command,
          commandId: params.commandId,
          parentCommandId: params.commandId,
          origin: 'system',
          phase: 'readback_begin',
          sessionId: params.sessionId,
          tabId: params.tabId,
        });
        readbackResult = await params.readback();
      } catch (error) {
        throw toWorkflowError('readback', error);
      }

      logCommandPhase('log', 'Command readback completed.', {
        command: params.command,
        commandId: params.commandId,
        parentCommandId: params.commandId,
        origin: 'system',
        phase: 'readback_complete',
        sessionId: params.sessionId,
        tabId: params.tabId,
      });

      return {
        actionResult,
        readbackResult,
        workflow: {
          waitRequired,
          postActionLoading: waitRequired,
        },
      };
    } finally {
      waiter?.dispose();
    }
  }
}
