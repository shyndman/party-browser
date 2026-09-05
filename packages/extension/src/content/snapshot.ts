import { getOrAssignElementRef, pruneElementRefRegistry } from './element-refs';

import type { CommandResult, SnapshotData } from '../types/commands';

const MAX_SNAPSHOT_DEPTH = 50;
const MAX_SNAPSHOT_TEXT_LENGTH = 100;
const INTERACTIVE_ROLES: Readonly<Record<string, true | undefined>> = {
  button: true, link: true, checkbox: true, radio: true, textbox: true, combobox: true, menuitem: true,
};
const BUTTON_INPUT_TYPES: Readonly<Record<string, true | undefined>> = { submit: true, reset: true, button: true };
export interface ElementInfo {
  ref?: string;
  tagName: string;
  role: string | null;
  type: string | null;
  name: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  interactive: boolean;
}

export interface SnapshotCommandParams {
  nextRefStart?: number;
}

export function getSnapshot(params: SnapshotCommandParams = {}): CommandResult<SnapshotData> {
  const { elements: tree, nextRefStart } = buildAccessibilityTree(
    document.body,
    params.nextRefStart ?? 0,
  );

  console.log(`[PartyBrowser] Snapshot captured: ${tree.length} elements`);

  return {
    success: true,
    data: {
      url: window.location.href,
      title: document.title,
      tree,
      nextRefStart,
    },
  };
}

export function buildAccessibilityTree(
  root: HTMLElement,
  nextRefStart = 0,
): { elements: ElementInfo[]; nextRefStart: number } {
  pruneElementRefRegistry();
  const elements: ElementInfo[] = [];
  function traverse(node: Element, depth = 0): void {
    if (depth > MAX_SNAPSHOT_DEPTH || isHidden(node)) return;

    const info = getElementInfo(node);
    if (info) {
      if (info.interactive) {
        const refAllocation = getOrAssignElementRef(node, nextRefStart);
        nextRefStart = refAllocation.nextRefStart;
        elements.push({ ...info, ref: refAllocation.ref });
      } else if (info.role === 'heading' || info.name) {
        elements.push(info);
      }
    }

    for (const child of Array.from(node.children)) traverse(child as HTMLElement, depth + 1);
  }

  traverse(root);
  return { elements, nextRefStart };
}
function isHidden(element: Element): boolean {
  if (element.getAttribute('aria-hidden') === 'true' || element.getAttribute('hidden') !== null) return true;
  if (element.getAttribute('type') === 'hidden') return true;
  const computed = element.ownerDocument?.defaultView?.getComputedStyle(element);
  return computed?.display === 'none' || computed?.visibility === 'hidden';
}

function getAccessibleName(element: Element, tagName: string, ariaLabel: string | null, ariaLabelledBy: string | null, value: string | undefined): string {
  let name = ariaLabel || '';
  if (!name && ariaLabelledBy) name = document.getElementById(ariaLabelledBy)?.textContent || '';
  if (!name && tagName === 'input') name = (element as HTMLInputElement).labels?.[0]?.textContent?.trim() || '';
  if (!name && (element as HTMLElement).parentElement?.tagName.toLowerCase() === 'label') {
    name = (element as HTMLElement).parentElement?.textContent?.trim() || '';
  }
  if (!name && tagName === 'select') name = (element as HTMLSelectElement).selectedOptions?.[0]?.textContent?.trim() || '';
  return name || element.textContent?.trim() || value || element.getAttribute('placeholder') || '';
}

function getNativeRole(element: Element, tagName: string, inputType: string | null): string | null {
  if (/^h[1-6]$/.test(tagName)) return 'heading';
  switch (tagName) {
    case 'option': return 'option';
    case 'button': return 'button';
    case 'select': return 'combobox';
    case 'textarea': return 'textbox';
    case 'a': return element.getAttribute('href') ? 'link' : null;
    case 'input':
      if (BUTTON_INPUT_TYPES[inputType || ''] === true) return 'button';
      if (inputType === 'checkbox' || inputType === 'radio') return inputType;
      return 'textbox';
    default: return null;
  }
}

export function getElementInfo(element: Element): Omit<ElementInfo, 'ref'> | null {

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'script' || tagName === 'style' || tagName === 'template' || tagName === 'noscript') return null;
  const explicitRole = element.getAttribute('role');
  const ariaLabel = element.getAttribute('aria-label');
  const ariaLabelledBy = element.getAttribute('aria-labelledby');

  const inputType = tagName === 'input'
    ? (element as HTMLInputElement).type || element.getAttribute('type') || 'text'
    : null;
  const role = explicitRole || getNativeRole(element, tagName, inputType);

  const nativeInteractive = tagName === 'button' || tagName === 'input' || tagName === 'select' || tagName === 'textarea'
    || (tagName === 'a' && Boolean(element.getAttribute('href')));
  const isInteractive = nativeInteractive
    || INTERACTIVE_ROLES[role || ''] === true
    || (element as HTMLElement).onclick !== null
    || (element as HTMLElement).tabIndex >= 0;
  const isTextContent = !isInteractive && (role === 'heading' || role === 'option'
    || (element.children.length === 0 && Boolean(element.textContent?.trim())));
  if (!isInteractive && !isTextContent) return null;
  const value = tagName === 'input' || tagName === 'textarea' || tagName === 'select'
    || tagName === 'button' || tagName === 'option'
    ? (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement | HTMLOptionElement).value
    : undefined;
  const name = getAccessibleName(element, tagName, ariaLabel, ariaLabelledBy, value);


  return {
    tagName,
    role,
    type: inputType,
    name: name.slice(0, MAX_SNAPSHOT_TEXT_LENGTH),
    value: value?.slice(0, MAX_SNAPSHOT_TEXT_LENGTH),
    placeholder: (element as HTMLInputElement).placeholder,
    disabled: (element as HTMLInputElement).disabled,
    checked: (element as HTMLInputElement).checked,
    selected: tagName === 'option' ? (element as HTMLOptionElement).selected : undefined,
    interactive: isInteractive,
  };
}
