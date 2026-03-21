import type { CommandResult } from '../types/commands';

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

export function getSnapshot(): CommandResult {
  const tree = buildAccessibilityTree(document.body);
  return {
    success: true,
    data: {
      url: window.location.href,
      title: document.title,
      tree,
    },
  };
}

export function buildAccessibilityTree(root: HTMLElement): ElementInfo[] {
  const elements: ElementInfo[] = [];
  let refCounter = 0;

  function traverse(node: Element, depth = 0): void {
    if (depth > 50) {
      return;
    }

    const info = getElementInfo(node, refCounter++);
    if (info && info.interactive) {
      elements.push(info);
    }

    for (const child of Array.from(node.children)) {
      traverse(child as HTMLElement, depth + 1);
    }
  }

  traverse(root);
  return elements;
}

export function getElementInfo(element: Element, ref: number): ElementInfo | null {
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

  element.setAttribute('data-mcp-ref', `e${ref}`);

  return {
    ref: `e${ref}`,
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
