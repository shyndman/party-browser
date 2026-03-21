import type { CommandResult } from '../types/commands';

const MCP_REF_ATTRIBUTE = 'data-mcp-ref';

export interface ElementInfo {
  ref: string;
  tagName: string;
  role: string | null;
  type: string | null;
  name: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  interactive: boolean;
}

export interface SnapshotCommandParams {
  nextRefStart?: number;
}

export interface SnapshotData {
  url: string;
  title: string;
  tree: ElementInfo[];
  nextRefStart: number;
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
  const elements: ElementInfo[] = [];

  function traverse(node: Element, depth = 0): void {
    if (depth > 50) {
      return;
    }

    const info = getElementInfo(node);
    if (info && info.interactive) {
      const refAllocation = getOrAssignElementRef(node, nextRefStart);
      nextRefStart = refAllocation.nextRefStart;
      elements.push({ ...info, ref: refAllocation.ref });
    }

    for (const child of Array.from(node.children)) {
      traverse(child as HTMLElement, depth + 1);
    }
  }

  traverse(root);
  return { elements, nextRefStart };
}

export function getElementInfo(element: Element): Omit<ElementInfo, 'ref'> | null {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const ariaLabel = element.getAttribute('aria-label');
  const ariaLabelledBy = element.getAttribute('aria-labelledby');

  const interactiveTypes = ['a', 'button', 'input', 'select', 'textarea'];
  const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'menuitem'];

  const isInteractive = interactiveTypes.includes(tagName)
    || interactiveRoles.includes(role || '')
    || (element as HTMLElement).onclick !== null
    || (element as HTMLElement).tabIndex >= 0;

  if (!isInteractive) {
    return null;
  }

  let name = ariaLabel || '';
  if (!name && ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    if (labelElement) {
      name = labelElement.textContent || '';
    }
  }

  if (!name) {
    name = element.textContent?.trim()
      || (element as HTMLInputElement).value
      || (element as HTMLInputElement).placeholder
      || '';
  }

  let inputType: string | null = null;
  if (tagName === 'input') {
    inputType = (element as HTMLInputElement).type || 'text';
  }

  return {
    tagName,
    role,
    type: inputType,
    name: name.slice(0, 100),
    value: (element as HTMLInputElement).value?.slice(0, 100),
    placeholder: (element as HTMLInputElement).placeholder,
    disabled: (element as HTMLInputElement).disabled,
    checked: (element as HTMLInputElement).checked,
    interactive: true,
  };
}

function getOrAssignElementRef(
  element: Element,
  nextRefStart: number,
): { ref: string; nextRefStart: number } {
  const existingRef = element.getAttribute(MCP_REF_ATTRIBUTE);
  const existingRefNumber = parseElementRefNumber(existingRef);

  if (existingRef && existingRefNumber !== null) {
    return {
      ref: existingRef,
      nextRefStart: Math.max(nextRefStart, existingRefNumber + 1),
    };
  }

  const ref = `e${nextRefStart}`;
  element.setAttribute(MCP_REF_ATTRIBUTE, ref);
  return { ref, nextRefStart: nextRefStart + 1 };
}

function parseElementRefNumber(ref: string | null): number | null {
  if (!ref || !/^e\d+$/.test(ref)) {
    return null;
  }

  return Number.parseInt(ref.slice(1), 10);
}
