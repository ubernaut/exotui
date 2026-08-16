// Copyright 2023 Im-Beast. MIT license.

// 036 T3: focus order and announcements are a SPEC, not folklore. Every
// content transition the workbench performs — modal open/close, tiled
// window focus/move, menu open/close, tab switch, tree expand/collapse,
// table sort, virtualized jump — declares where focus lands (one of
// four machine-usable rules) and the announcement template a screen
// reader (browser) or the terminal projection receives. Templates fill
// from a context map and FAIL CLOSED on a missing placeholder, so an
// announcement can never ship half-empty.

/** The transitions the workbench performs. */
export type FocusTransitionKind =
  | "modal-open"
  | "modal-close"
  | "window-focus"
  | "window-move"
  | "menu-open"
  | "menu-close"
  | "tab-switch"
  | "tree-expand"
  | "tree-collapse"
  | "table-sort"
  | "virtual-jump";

/** Where focus lands after a transition. */
export type FocusRule =
  | "first-focusable-in-target"
  | "restore-previous"
  | "container"
  | "preserve";

/** One transition's specification. */
export interface FocusTransitionSpec {
  readonly focus: FocusRule;
  readonly announcement: string;
}

/** The complete specification. */
export const FOCUS_TRANSITION_SPEC: Readonly<Record<FocusTransitionKind, FocusTransitionSpec>> = Object.freeze({
  "modal-open": {
    focus: "first-focusable-in-target",
    announcement: "{title} dialog opened",
  },
  "modal-close": {
    focus: "restore-previous",
    announcement: "{title} dialog closed",
  },
  "window-focus": {
    focus: "first-focusable-in-target",
    announcement: "{title} window focused",
  },
  "window-move": {
    focus: "preserve",
    announcement: "{title} window moved to {position}",
  },
  "menu-open": {
    focus: "first-focusable-in-target",
    announcement: "{title} menu opened, {count} items",
  },
  "menu-close": {
    focus: "restore-previous",
    announcement: "menu closed",
  },
  "tab-switch": {
    focus: "container",
    announcement: "{title} tab, {index} of {count}",
  },
  "tree-expand": {
    focus: "preserve",
    announcement: "{title} expanded, {count} children",
  },
  "tree-collapse": {
    focus: "preserve",
    announcement: "{title} collapsed",
  },
  "table-sort": {
    focus: "preserve",
    announcement: "sorted by {column}, {direction}",
  },
  "virtual-jump": {
    focus: "first-focusable-in-target",
    announcement: "jumped to {title}, item {index} of {count}",
  },
});

/** A resolved transition. */
export interface ResolvedTransition {
  readonly focus: FocusRule;
  readonly announcement: string;
}

/** Resolves one transition; missing placeholders fail closed. */
export function resolveTransition(
  kind: FocusTransitionKind,
  context: Readonly<Record<string, string>>,
): ResolvedTransition {
  const spec = FOCUS_TRANSITION_SPEC[kind];
  const announcement = spec.announcement.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = context[name];
    if (value === undefined) {
      throw new TypeError(`transition "${kind}" announcement needs "{${name}}"`);
    }
    return value;
  });
  return { focus: spec.focus, announcement };
}
