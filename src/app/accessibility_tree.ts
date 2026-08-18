// Copyright 2023 Im-Beast. MIT license.

// 036 T3: ONE semantic tree, two honest projections. Accessibility
// nodes carry a role, an accessible name, and explicit states; the
// browser projection serializes them to real ARIA attributes
// (role/aria-label/aria-selected/aria-expanded/aria-disabled/
// aria-checked/aria-activedescendant), while the terminal projection is
// deliberately SMALLER and documented as such: terminal protocols can
// expose a window title, a bell, and a linear announcement string —
// nothing else — and TERMINAL_EXPOSABLE_SEMANTICS is the canonical
// statement of that limit, so terminal documentation can never imply
// screen-reader parity it does not have.

/** Supported semantic roles. */
export type AccessibilityRole =
  | "button"
  | "textbox"
  | "list"
  | "listitem"
  | "tree"
  | "treeitem"
  | "grid"
  | "row"
  | "cell"
  | "tablist"
  | "tab"
  | "tabpanel"
  | "dialog"
  | "menu"
  | "menuitem"
  | "status"
  | "log"
  | "group";

/** One semantic node. */
export interface AccessibilityNode {
  readonly role: AccessibilityRole;
  /** The accessible name. */
  readonly label?: string;
  readonly states?: {
    readonly focused?: boolean;
    readonly selected?: boolean;
    readonly expanded?: boolean;
    readonly disabled?: boolean;
    readonly checked?: boolean;
  };
  readonly children?: readonly AccessibilityNode[];
}

/**
 * The documented terminal limit: these are the ONLY semantics terminal
 * protocols can expose. Everything else is browser-only, and terminal
 * docs must not claim more.
 */
export const TERMINAL_EXPOSABLE_SEMANTICS: Readonly<{
  windowTitle: string;
  bell: string;
  announcement: string;
  notExposable: readonly string[];
}> = Object.freeze({
  windowTitle: "OSC 0/2 — one line of context, no structure",
  bell: "BEL — a single attention signal, no content",
  announcement: "printed text — a linear string the shell/screen-reader may read",
  notExposable: Object.freeze([
    "roles",
    "states",
    "relationships",
    "focus order metadata",
    "live regions",
  ]),
});

/** Browser projection: real ARIA attributes per node. */
export function toAriaAttributes(node: AccessibilityNode): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = { role: node.role };
  if (node.label !== undefined) attributes["aria-label"] = node.label;
  const states = node.states ?? {};
  if (states.selected !== undefined) attributes["aria-selected"] = String(states.selected);
  if (states.expanded !== undefined) attributes["aria-expanded"] = String(states.expanded);
  if (states.disabled !== undefined) attributes["aria-disabled"] = String(states.disabled);
  if (states.checked !== undefined) attributes["aria-checked"] = String(states.checked);
  return attributes;
}

/** Serializes a whole tree to nested ARIA descriptors. */
export function toAriaTree(node: AccessibilityNode): {
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly ReturnType<typeof toAriaTree>[];
} {
  return {
    attributes: toAriaAttributes(node),
    children: (node.children ?? []).map(toAriaTree),
  };
}

/** The terminal projection — the smaller, documented subset. */
export interface TerminalAccessibilityProjection {
  /** From the outermost dialog/status label, when one exists. */
  readonly title?: string;
  /** A linear announcement describing the focused path. */
  readonly announcement?: string;
}

function focusedPath(node: AccessibilityNode, path: AccessibilityNode[]): AccessibilityNode[] | undefined {
  const nextPath = [...path, node];
  if (node.states?.focused) return nextPath;
  for (const child of node.children ?? []) {
    const found = focusedPath(child, nextPath);
    if (found) return found;
  }
  return undefined;
}

/** Projects a tree onto what a terminal can actually expose. */
export function toTerminalProjection(root: AccessibilityNode): TerminalAccessibilityProjection {
  const title = root.role === "dialog" || root.role === "status" ? root.label : undefined;
  const path = focusedPath(root, []);
  const announcement = path
    ?.filter((node) => node.label !== undefined)
    .map((node) => `${node.label} (${node.role})`)
    .join(", ");
  return {
    ...(title !== undefined ? { title } : {}),
    ...(announcement ? { announcement } : {}),
  };
}
