import type BrowserNamespace from 'webextension-polyfill';
import type { CommandPhase, CommandWorkflowMeta } from '../types/commands';
import { CodedError, ErrorCodes } from '../utils/errors';
import { logCommandPhase } from './command-logging';

const DOM_CONTENT_LOADED_TIMEOUT_MS = 30_000;
const NAVIGATION_LOAD_TIMEOUT_MS = 5_000;
const ACTION_LOAD_TIMEOUT_MS = 10_000;
const REQUEST_COMPLETION_TIMEOUT_MS = 5_000;
const ACTION_SETTLE_MS = 500;
const MAIN_FRAME_ID = 0;
const BODY_RESOURCE_TYPES: Record<string, true | undefined> = {
  main_frame: true,
  sub_frame: true,
  stylesheet: true,
  script: true,
  xmlhttprequest: true,
};

type NavigationDetails = Pick<BrowserNamespace.WebNavigation.OnBeforeNavigateDetailsType, 'tabId' | 'frameId' | 'url'> & { documentId?: string };
type RequestDetails = BrowserNamespace.WebRequest.OnBeforeRequestDetailsType;
type RequestEndDetails = BrowserNamespace.WebRequest.OnCompletedDetailsType;
type RequestErrorDetails = BrowserNamespace.WebRequest.OnErrorOccurredDetailsType;
type RequestResponseDetails = BrowserNamespace.WebRequest.OnResponseStartedDetailsType;
type NavigationErrorDetails = BrowserNamespace.WebNavigation.OnErrorOccurredDetailsType;

export type TabState = {
  status?: 'loading' | 'complete';
  url?: string;
  title?: string;
  pendingUrl?: string;
};
export type LoadWaiter = { wait(): Promise<void>; dispose(): void };
export type WorkflowContext = { command: string; commandId?: string; sessionId?: string; tabId: number };

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
  if (error instanceof CommandWorkflowError) return error;
  if (error instanceof CodedError) return new CommandWorkflowError(phase, error.message, error.errorCode);
  return new CommandWorkflowError(phase, error instanceof Error ? error.message : String(error));
}

/** Observes one command's tab. Subscriptions start before the command dispatches. */
class CompletionObserver {
  navigation = false;
  private domLoaded = false;
  private loaded = false;
  private navigationUrl: string | undefined;
  private readonly previousDocuments = new Set<string>();
  private currentDocumentId: string | undefined;
  private failure: CodedError | undefined;
  private collectingRequests = true;
  private readonly pendingRequests = new Map<string, string>();
  private requestCount = 0;
  private readonly changed = new Set<() => void>();
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly context: WorkflowContext,
    watchRequests: boolean,
    acceptExisting = false,
    previousDocumentId?: string,
  ) {
    this.navigation = acceptExisting;
    this.currentDocumentId = previousDocumentId;
    this.subscribeNavigation();
    if (watchRequests) this.subscribeRequests();
    this.log('log', 'Command completion observers armed before dispatch.', 'wait_armed');
  }

  private log(level: 'log' | 'warn' | 'error', message: string, phase: string): void {
    logCommandPhase(level, message, { ...this.context, origin: 'system', phase });
  }

  private notify(): void {
    for (const callback of this.changed) callback();
  }

  private matches(details: { tabId: number; frameId: number }): boolean {
    return details.tabId === this.context.tabId && details.frameId === MAIN_FRAME_ID;
  }

  private matchesDocument(details: NavigationDetails): boolean {
    return this.matches(details) && this.navigation
      && (details.documentId === undefined || !this.previousDocuments.has(details.documentId))
      && (this.navigationUrl === undefined || details.url === this.navigationUrl);
  }

  private readonly onBeforeNavigate = (details: NavigationDetails): void => {
    if (!this.matches(details)) return;
    if (this.currentDocumentId !== undefined) this.previousDocuments.add(this.currentDocumentId);
    this.currentDocumentId = undefined;
    this.navigation = true;
    this.navigationUrl = details.url;
    this.domLoaded = false;
    this.loaded = false;
    this.notify();
  };

  private readonly onCommitted = (details: NavigationDetails): void => {
    if (!this.matches(details) || !this.navigation) return;
    this.navigationUrl = details.url;
    this.currentDocumentId = details.documentId;
  };

  private readonly onDomLoaded = (details: NavigationDetails): void => {
    if (!this.matchesDocument(details)) return;
    this.domLoaded = true;
    this.notify();
  };

  private readonly onCompleted = (details: NavigationDetails): void => {
    if (!this.matchesDocument(details)) return;
    this.domLoaded = true;
    this.loaded = true;
    this.notify();
  };

  private readonly onSameDocument = (details: NavigationDetails): void => {
    if (!this.matches(details) || !isNavigationCommand(this.context.command)) return;
    this.navigation = true;
    this.navigationUrl = details.url;
    this.domLoaded = true;
    this.loaded = true;
    this.notify();
  };

  private readonly onNavigationError = (details: NavigationErrorDetails): void => {
    const documentId = (details as NavigationDetails).documentId;
    if (documentId !== undefined && this.previousDocuments.has(documentId)) {
      this.log('log', `Ignored navigation error from previous document ${documentId}.`, 'wait_previous_document');
      return;
    }
    if (!this.matchesDocument(details)) return;
    // Firefox supplies error, but the installed polyfill types omit it.
    const { error } = details as NavigationErrorDetails & { error: string };
    this.fail(new CodedError(`Navigation failed for tab ${this.context.tabId}: ${error}.`, ErrorCodes.COMMAND_FAILED));
  };

  private readonly onRemoved = (tabId: number): void => {
    if (tabId !== this.context.tabId) return;
    this.fail(new CodedError(`Tab ${tabId} closed while waiting for command completion.`, ErrorCodes.SESSION_TAB_CLOSED));
  };

  private fail(error: CodedError): void {
    this.failure = error;
    this.log('error', error.message, 'wait_error');
    this.notify();
  }

  private subscribeNavigation(): void {
    const events = browser.webNavigation;
    events.onBeforeNavigate.addListener(this.onBeforeNavigate);
    events.onCommitted.addListener(this.onCommitted);
    events.onDOMContentLoaded.addListener(this.onDomLoaded);
    events.onCompleted.addListener(this.onCompleted);
    events.onErrorOccurred.addListener(this.onNavigationError);
    events.onReferenceFragmentUpdated.addListener(this.onSameDocument);
    events.onHistoryStateUpdated.addListener(this.onSameDocument);
    browser.tabs.onRemoved.addListener(this.onRemoved);
    this.cleanups.push(() => {
      events.onBeforeNavigate.removeListener(this.onBeforeNavigate);
      events.onCommitted.removeListener(this.onCommitted);
      events.onDOMContentLoaded.removeListener(this.onDomLoaded);
      events.onCompleted.removeListener(this.onCompleted);
      events.onErrorOccurred.removeListener(this.onNavigationError);
      events.onReferenceFragmentUpdated.removeListener(this.onSameDocument);
      events.onHistoryStateUpdated.removeListener(this.onSameDocument);
      browser.tabs.onRemoved.removeListener(this.onRemoved);
    });
  }

  private readonly onRequestStart = (details: RequestDetails): void => {
    if (details.tabId !== this.context.tabId || !this.collectingRequests) return;
    this.requestCount++;
    this.pendingRequests.set(details.requestId, details.type);
  };

  private readonly onRequestEnd = (details: RequestEndDetails | RequestErrorDetails): void => {
    if (details.tabId !== this.context.tabId) return;
    if (!this.pendingRequests.delete(details.requestId)) return;
    if ('error' in details) this.log('warn', `Observed request failed: ${details.url}: ${details.error}.`, 'request_error');
    this.notify();
  };

  private readonly onResponse = (details: RequestResponseDetails): void => {
    if (details.tabId !== this.context.tabId) return;
    const type = this.pendingRequests.get(details.requestId);
    if (type === undefined || BODY_RESOURCE_TYPES[type] === true) return;
    this.pendingRequests.delete(details.requestId);
    this.notify();
  };

  private subscribeRequests(): void {
    const events = browser.webRequest;
    const filter = { urls: ['<all_urls>'], tabId: this.context.tabId };
    events.onBeforeRequest.addListener(this.onRequestStart, filter);
    events.onCompleted.addListener(this.onRequestEnd, filter);
    events.onErrorOccurred.addListener(this.onRequestEnd, filter);
    events.onResponseStarted.addListener(this.onResponse, filter);
    this.cleanups.push(() => {
      events.onBeforeRequest.removeListener(this.onRequestStart);
      events.onCompleted.removeListener(this.onRequestEnd);
      events.onErrorOccurred.removeListener(this.onRequestEnd);
      events.onResponseStarted.removeListener(this.onResponse);
    });
  }

  private waitFor(predicate: () => boolean, timeoutMs: number, phase: string, required: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.changed.delete(check);
      };
      const check = (): void => {
        if (this.failure) { cleanup(); reject(this.failure); }
        else if (predicate()) { cleanup(); resolve(); }
      };
      const timer = setTimeout(() => {
        cleanup();
        if (phase === 'settle') { resolve(); return; }
        const message = `Timed out after ${timeoutMs}ms waiting for ${phase} in tab ${this.context.tabId}.`;
        this.log(required ? 'error' : 'warn', message, 'wait_timeout');
        if (required) reject(new CodedError(message, ErrorCodes.COMMAND_FAILED));
        else resolve();
      }, timeoutMs);
      this.changed.add(check);
      check();
    });
  }

  async waitForLoad(timeoutMs: number, required: boolean): Promise<void> {
    await this.waitFor(() => this.loaded, timeoutMs, 'load', required);
  }

  async waitForNavigation(): Promise<void> {
    await this.waitFor(() => this.domLoaded, DOM_CONTENT_LOADED_TIMEOUT_MS, 'DOMContentLoaded', true);
    await this.waitForLoad(NAVIGATION_LOAD_TIMEOUT_MS, false);
  }

  async waitForAction(): Promise<void> {
    await this.waitFor(() => false, ACTION_SETTLE_MS, 'settle', false);
    this.collectingRequests = false;
    if (this.navigation) {
      await this.waitForLoad(ACTION_LOAD_TIMEOUT_MS, false);
      return;
    }
    await this.waitFor(() => this.pendingRequests.size === 0, REQUEST_COMPLETION_TIMEOUT_MS, 'requests', false);
    if (this.requestCount) await this.waitFor(() => false, ACTION_SETTLE_MS, 'settle', false);
  }

  get workflow(): CommandWorkflowMeta {
    return { waitRequired: this.navigation || this.requestCount > 0, postActionLoading: this.navigation };
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }
}

function isNavigationCommand(command: string): boolean {
  return command === 'navigate' || command === 'go_back' || command === 'go_forward';
}

export function createLoadWaiter(context: WorkflowContext, timeoutMs = ACTION_LOAD_TIMEOUT_MS): LoadWaiter {
  const observer = new CompletionObserver(context, false, true);
  return {
    wait: async () => {
      try { await observer.waitForLoad(timeoutMs, true); }
      finally { observer.dispose(); }
    },
    dispose: () => observer.dispose(),
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
  constructor(private readonly loadWaiterFactory: (context: WorkflowContext) => LoadWaiter = createLoadWaiter) {}

  async waitForTabToSettle(context: WorkflowContext): Promise<void> {
    const waiter = this.loadWaiterFactory(context);
    try {
      if (isTabLoading(await readTabState(context.tabId))) await waiter.wait();
    } catch (error) {
      throw toWorkflowError('wait', error);
    } finally {
      waiter.dispose();
    }
  }

  async runCommand<TAction, TReadback>(params: RunCommandLifecycleParams<TAction, TReadback>): Promise<RunCommandLifecycleResult<TAction, TReadback>> {
    const before = await readTabState(params.tabId);
    if (params.requireStableBeforeDispatch && isTabLoading(before)) {
      throw new CommandWorkflowError('precondition', `Tab ${params.tabId} is already loading before ${params.command}.`);
    }
    const frame = await browser.webNavigation.getFrame({ tabId: params.tabId, frameId: MAIN_FRAME_ID }) as { documentId?: string } | null;
    const observer = new CompletionObserver(params, !isNavigationCommand(params.command), false, frame?.documentId);
    let phase: CommandPhase = 'dispatch';
    try {
      const actionResult = await params.dispatch();
      phase = 'wait';
      if (isNavigationCommand(params.command)) await observer.waitForNavigation();
      else await observer.waitForAction();
      phase = 'readback';
      const readbackResult = await params.readback();
      return { actionResult, readbackResult, workflow: observer.workflow };
    } catch (error) {
      logCommandPhase('error', `Command failed during ${phase}: ${error instanceof Error ? error.message : String(error)}`, {
        ...params, origin: 'system', phase,
      });
      throw toWorkflowError(phase, error);
    } finally {
      observer.dispose();
    }
  }
}
