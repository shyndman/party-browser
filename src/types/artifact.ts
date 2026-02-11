/**
 * Selector artifact type definitions
 * 
 * Defines the JSON format for exporting discovered selectors that can be
 * consumed by downstream procedural scraping systems. Format inspired by
 * Chrome DevTools Recorder for broad compatibility.
 */

/**
 * Selector definition - how to identify elements on the page
 */
export interface SelectorDefinition {
  /** Type of selector */
  type: 'css' | 'xpath' | 'text' | 'ref';
  /** The actual selector value */
  value: string;
  /** Whether to extract multiple elements (default: false) */
  multiple?: boolean;
  /** Extract specific attribute instead of text content */
  attribute?: string;
  /** For structured extraction - nested field definitions */
  fields?: Record<string, SelectorDefinition>;
}

/**
 * A single step in the workflow
 */
export interface SelectorStep {
  /** Type of action to perform */
  type: 'navigate' | 'click' | 'type' | 'select' | 'wait' | 'extract' | 'screenshot';
  /** Human-readable description of what this step does */
  description?: string;
}

/**
 * Navigate to a URL
 */
export interface NavigateStep extends SelectorStep {
  type: 'navigate';
  /** URL to navigate to */
  url: string;
}

/**
 * Click on element(s)
 */
export interface ClickStep extends SelectorStep {
  type: 'click';
  /** Selectors targeting the element(s) to click */
  selectors: SelectorDefinition[];
}

/**
 * Type text into an element
 */
export interface TypeStep extends SelectorStep {
  type: 'type';
  /** Selectors targeting the input element */
  selectors: SelectorDefinition[];
  /** Text to type */
  value: string;
}

/**
 * Select an option from a dropdown
 */
export interface SelectStep extends SelectorStep {
  type: 'select';
  /** Selectors targeting the select element */
  selectors: SelectorDefinition[];
  /** Option value or text to select */
  option: string;
}

/**
 * Wait for a condition
 */
export interface WaitStep extends SelectorStep {
  type: 'wait';
  /** What to wait for */
  mode: 'time' | 'selector';
  /** Time in ms or selector to wait for */
  value: number | string;
}

/**
 * Extract data from the page
 */
export interface ExtractStep extends SelectorStep {
  type: 'extract';
  /** Name for this extraction (used as key in results) */
  name: string;
  /** Selectors defining what to extract */
  selectors: SelectorDefinition[];
}

/**
 * Take a screenshot
 */
export interface ScreenshotStep extends SelectorStep {
  type: 'screenshot';
}

/**
 * Union type for all step types
 */
export type AnyStep = NavigateStep | ClickStep | TypeStep | SelectStep | WaitStep | ExtractStep | ScreenshotStep;

/**
 * Session metadata included in artifacts
 */
export interface SessionMetadata {
  /** Number of network requests captured */
  networkRequestCount: number;
  /** Number of console errors */
  consoleErrorCount: number;
  /** Number of console warnings */
  consoleWarnCount: number;
  /** Session duration in milliseconds */
  sessionDuration: number;
}

/**
 * Console log entry
 */
export interface ConsoleLogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  stack?: string;
}

/**
 * Network request entry
 */
export interface NetworkRequestEntry {
  requestId: string;
  url: string;
  method: string;
  type: string;
  timestamp: number;
  statusCode: number | null;
  error: string | null;
}

/**
 * The complete selector artifact export format
 */
export interface SelectorArtifact {
  /** Artifact format version */
  version: '1.0';
  /** Human-readable title/name of this workflow */
  title: string;
  /** ISO 8601 timestamp when created */
  createdAt: string;
  /** Unique session identifier */
  sessionId: string;
  /** Initial URL of the session */
  initialUrl: string;
  /** Steps in the workflow */
  steps: AnyStep[];
  /** Session metadata */
  metadata: SessionMetadata;
  /** Optional: Recent console logs (last 50) */
  console?: ConsoleLogEntry[];
  /** Optional: Recent network requests (last 50) */
  network?: NetworkRequestEntry[];
}

/**
 * Options for export operation
 */
export interface ExportOptions {
  /** Name/title for the workflow */
  name: string;
  /** Include session metadata (default: true) */
  includeMetadata?: boolean;
  /** Include console logs (default: false) */
  includeConsole?: boolean;
  /** Include network requests (default: false) */
  includeNetwork?: boolean;
}

/**
 * Result of export operation
 */
export interface ExportResult {
  /** The generated artifact */
  artifact: SelectorArtifact;
  /** JSON string representation */
  json: string;
  /** Suggested filename */
  filename: string;
}

/**
 * Input step format from user (simplified)
 */
export interface InputStep {
  /** Action type */
  action: 'navigate' | 'click' | 'type' | 'select' | 'wait' | 'extract';
  /** Target selector (if applicable) */
  target?: string;
  /** Value to type/select (if applicable) */
  value?: string;
  /** Human-readable description */
  description?: string;
}


