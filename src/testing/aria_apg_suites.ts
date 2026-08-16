// Copyright 2023 Im-Beast. MIT license.

// QAL-004: reusable ARIA APG suites over the T3 semantic tree. Each
// supported pattern (tablist, tree, grid, listbox, menu, dialog) runs
// role/structure checks, accessible-name checks, state checks (exactly
// one selected tab, expanded flags on branch nodes, at most one focused
// node), and a keyboard check that the pattern's transitions are
// specified in FOCUS_TRANSITION_SPEC. A check named in the pattern's
// DECLARED deviations records as a visible deviation instead of a
// failure — undeclared breaks fail, silent deviations are impossible.

import type { AccessibilityNode } from "../app/accessibility_tree.ts";
import { FOCUS_TRANSITION_SPEC } from "../app/focus_announcements.ts";

/** Supported APG patterns. */
export type AriaPattern = "tablist" | "tree" | "grid" | "listbox" | "menu" | "dialog";

/** One suite check outcome. */
export interface AriaCheck {
  readonly name: string;
  readonly status: "passed" | "failed" | "deviation";
  readonly detail?: string;
}

/** One pattern report. */
export interface AriaPatternReport {
  readonly pattern: AriaPattern;
  readonly checks: readonly AriaCheck[];
  readonly deviations: readonly string[];
  /** true when nothing failed (declared deviations allowed). */
  readonly conformant: boolean;
}

function walk(node: AccessibilityNode, visit: (node: AccessibilityNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function collect(node: AccessibilityNode, role: string): AccessibilityNode[] {
  const found: AccessibilityNode[] = [];
  walk(node, (candidate) => {
    if (candidate.role === role) found.push(candidate);
  });
  return found;
}

const PATTERN_RULES: Readonly<
  Record<AriaPattern, readonly { readonly name: string; check(root: AccessibilityNode): true | string }[]>
> = {
  tablist: [
    { name: "root role is tablist", check: (root) => root.role === "tablist" || `root is "${root.role}"` },
    {
      name: "contains only tab children",
      check: (root) => (root.children ?? []).every((child) => child.role === "tab") || "non-tab child present",
    },
    {
      name: "exactly one tab is selected",
      check: (root) => {
        const selected = (root.children ?? []).filter((child) => child.states?.selected).length;
        return selected === 1 || `${selected} tabs selected`;
      },
    },
    {
      name: "every tab has an accessible name",
      check: (root) => (root.children ?? []).every((child) => !!child.label) || "unnamed tab",
    },
    {
      name: "keyboard: tab-switch transition is specified",
      check: () => "tab-switch" in FOCUS_TRANSITION_SPEC || "missing spec",
    },
  ],
  tree: [
    { name: "root role is tree", check: (root) => root.role === "tree" || `root is "${root.role}"` },
    {
      name: "items are treeitems with names",
      check: (root) => collect(root, "treeitem").every((item) => !!item.label) || "unnamed treeitem",
    },
    {
      name: "branch nodes declare expanded state",
      check: (root) =>
        collect(root, "treeitem")
          .filter((item) => (item.children ?? []).length > 0)
          .every((item) => item.states?.expanded !== undefined) || "branch without expanded state",
    },
    {
      name: "keyboard: tree-expand/collapse transitions are specified",
      check: () =>
        ("tree-expand" in FOCUS_TRANSITION_SPEC && "tree-collapse" in FOCUS_TRANSITION_SPEC) || "missing spec",
    },
  ],
  grid: [
    {
      name: "root role is grid with a name",
      check: (root) => (root.role === "grid" && !!root.label) || "unnamed or wrong role",
    },
    {
      name: "rows contain cells",
      check: (root) =>
        collect(root, "row").every((row) => (row.children ?? []).every((cell) => cell.role === "cell")) ||
        "row with non-cell child",
    },
  ],
  listbox: [
    { name: "root role is list", check: (root) => root.role === "list" || `root is "${root.role}"` },
    {
      name: "items are named listitems",
      check: (root) => collect(root, "listitem").every((item) => !!item.label) || "unnamed listitem",
    },
    {
      name: "at most one node is focused",
      check: (root) => {
        let focused = 0;
        walk(root, (node) => {
          if (node.states?.focused) focused += 1;
        });
        return focused <= 1 || `${focused} focused nodes`;
      },
    },
  ],
  menu: [
    {
      name: "root role is menu with a name",
      check: (root) => (root.role === "menu" && !!root.label) || "unnamed or wrong role",
    },
    {
      name: "items are named menuitems",
      check: (root) => collect(root, "menuitem").every((item) => !!item.label) || "unnamed menuitem",
    },
    {
      name: "keyboard: menu-open/close transitions are specified",
      check: () => ("menu-open" in FOCUS_TRANSITION_SPEC && "menu-close" in FOCUS_TRANSITION_SPEC) || "missing spec",
    },
  ],
  dialog: [
    {
      name: "root role is dialog with a name",
      check: (root) => (root.role === "dialog" && !!root.label) || "unnamed or wrong role",
    },
    {
      name: "keyboard: modal transitions restore focus",
      check: () => FOCUS_TRANSITION_SPEC["modal-close"].focus === "restore-previous" || "focus not restored",
    },
  ],
};

/** Runs one pattern suite with declared deviations. */
export function runAriaPatternSuite(
  pattern: AriaPattern,
  root: AccessibilityNode,
  options: { readonly deviations?: readonly string[] } = {},
): AriaPatternReport {
  const declared = options.deviations ?? [];
  const checks: AriaCheck[] = PATTERN_RULES[pattern].map((rule) => {
    const outcome = rule.check(root);
    if (outcome === true) return { name: rule.name, status: "passed" };
    if (declared.includes(rule.name)) {
      return { name: rule.name, status: "deviation", detail: outcome };
    }
    return { name: rule.name, status: "failed", detail: outcome };
  });
  return {
    pattern,
    checks,
    deviations: checks.filter((check) => check.status === "deviation").map((check) => check.name),
    conformant: checks.every((check) => check.status !== "failed"),
  };
}
