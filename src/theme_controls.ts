// Copyright 2023 Im-Beast. MIT license.

// Plan 042 slice A. A theme has always been able to say what its accent is;
// it has never been able to say what an active title bar looks like. That gap
// is why picking a palette by hand kept going wrong: the seven core tokens are
// a statement of intent, and the thing on screen is a control.
//
// This module names the controls. Every name is a namespaced token declared on
// the open registry in theme_tokens.ts, and every one falls back — through a
// small chrome tier and then to a core token — so a theme that defines nothing
// but the original seven still resolves all of them. Overriding is therefore
// always optional and never breaks an existing theme.

import type { Rgb } from "./theme_expressions.ts";
import { createSemanticTokenRegistry, type SemanticTokenRegistry } from "./theme_tokens.ts";

/** What a control token is for, which decides how the editor treats it. */
export type ControlTokenRole = "foreground" | "background" | "line";

/** One named control colour. */
export interface ControlTokenSpec {
  /** Namespaced token name; stable, because themes on disk reference it. */
  readonly name: string;
  /** Editor group this belongs to. */
  readonly group: ControlTokenGroupId;
  /** Human label shown in the editor. */
  readonly label: string;
  /** An already-known token this resolves to when a theme omits it. */
  readonly fallback: string;
  readonly role: ControlTokenRole;
  /**
   * For a foreground: the background token it is normally read against. The
   * editor uses this to compute a contrast verdict, which is precisely the
   * check that a hand-picked palette skips — a bright accent used as text on a
   * light ground measures 2.7:1 and looks fine right up until you read it.
   */
  readonly against?: string;
  readonly description?: string;
}

/** Editor groups, in the order the editor shows them. */
export const CONTROL_TOKEN_GROUP_IDS = [
  "chrome",
  "window",
  "button",
  "menu",
  "control",
  "scrollbar",
  "desktop",
  "status",
] as const;

/** Public type alias for a control token group id. */
export type ControlTokenGroupId = (typeof CONTROL_TOKEN_GROUP_IDS)[number];

/** Human labels for the groups. */
export const CONTROL_TOKEN_GROUP_LABELS: Readonly<Record<ControlTokenGroupId, string>> = Object.freeze({
  chrome: "Chrome basics",
  window: "Windows",
  button: "Buttons",
  menu: "Menus",
  control: "Controls",
  scrollbar: "Scrollbars",
  desktop: "Desktop",
  status: "Status",
});

/**
 * The chrome tier: six colours every control falls back through. Setting one
 * of these moves every control that has not been overridden, which is what
 * makes a whole theme editable in six picks before touching anything finer.
 */
const CHROME_TOKENS: readonly ControlTokenSpec[] = [
  {
    name: "chrome:background",
    group: "chrome",
    label: "Panel background",
    fallback: "surface",
    role: "background",
    description: "The ground every panel, window body and control sits on.",
  },
  {
    // The ground the whole desktop sits on. Grouped with the basics rather
    // than with the desktop furniture: it is the first colour anyone wants to
    // change, and it was previously the thirty-third row of the list.
    name: "desktop:background",
    group: "chrome",
    label: "Desktop background",
    fallback: "surface",
    role: "background",
    description: "Behind every window, where the wallpaper or animation shows.",
  },
  {
    name: "chrome:foreground",
    group: "chrome",
    label: "Text",
    fallback: "foreground",
    role: "foreground",
    against: "chrome:background",
    description: "Body text on a panel.",
  },
  {
    name: "chrome:muted",
    group: "chrome",
    label: "Secondary text",
    fallback: "muted",
    role: "foreground",
    against: "chrome:background",
    description: "Labels, hints and anything meant to sit behind the body text.",
  },
  {
    name: "chrome:line",
    group: "chrome",
    label: "Lines and borders",
    fallback: "muted",
    role: "line",
    against: "chrome:background",
    description: "Frames, separators and rules.",
  },
  {
    name: "chrome:accent",
    group: "chrome",
    label: "Accent fill",
    fallback: "accent",
    role: "background",
    description: "The colour that marks what is focused, selected or active.",
  },
  {
    name: "chrome:on-accent",
    group: "chrome",
    label: "Text on accent",
    fallback: "surface",
    role: "foreground",
    against: "chrome:accent",
    description: "Text drawn on top of an accent fill.",
  },
];

const CONTROL_SURFACE_TOKENS: readonly ControlTokenSpec[] = [
  // Windows.
  {
    name: "window:background",
    group: "window",
    label: "Window body",
    fallback: "chrome:background",
    role: "background",
  },
  {
    name: "window:foreground",
    group: "window",
    label: "Window text",
    fallback: "chrome:foreground",
    role: "foreground",
    against: "window:background",
  },
  { name: "window:border", group: "window", label: "Border", fallback: "chrome:line", role: "line" },
  {
    name: "window:border-active",
    group: "window",
    label: "Active border",
    fallback: "chrome:accent",
    role: "line",
    description: "The frame around the window with focus.",
  },
  {
    name: "window:titlebar-background",
    group: "window",
    label: "Title bar",
    fallback: "chrome:background",
    role: "background",
  },
  {
    name: "window:titlebar-foreground",
    group: "window",
    label: "Title bar text",
    fallback: "chrome:foreground",
    role: "foreground",
    against: "window:titlebar-background",
  },
  {
    name: "window:titlebar-background-active",
    group: "window",
    label: "Active title bar",
    fallback: "chrome:accent",
    role: "background",
  },
  {
    name: "window:titlebar-foreground-active",
    group: "window",
    label: "Active title bar text",
    fallback: "chrome:on-accent",
    role: "foreground",
    against: "window:titlebar-background-active",
  },
  // Buttons.
  { name: "button:background", group: "button", label: "Button", fallback: "chrome:background", role: "background" },
  {
    name: "button:foreground",
    group: "button",
    label: "Button text",
    fallback: "chrome:foreground",
    role: "foreground",
    against: "button:background",
  },
  { name: "button:border", group: "button", label: "Button border", fallback: "chrome:line", role: "line" },
  {
    name: "button:background-active",
    group: "button",
    label: "Pressed button",
    fallback: "chrome:accent",
    role: "background",
  },
  {
    name: "button:foreground-active",
    group: "button",
    label: "Pressed button text",
    fallback: "chrome:on-accent",
    role: "foreground",
    against: "button:background-active",
  },
  {
    name: "button:background-disabled",
    group: "button",
    label: "Disabled button",
    fallback: "chrome:background",
    role: "background",
  },
  {
    name: "button:foreground-disabled",
    group: "button",
    label: "Disabled button text",
    fallback: "chrome:muted",
    role: "foreground",
    against: "button:background-disabled",
  },
  // Menus.
  { name: "menu:background", group: "menu", label: "Menu", fallback: "chrome:background", role: "background" },
  {
    name: "menu:foreground",
    group: "menu",
    label: "Menu item",
    fallback: "chrome:foreground",
    role: "foreground",
    against: "menu:background",
  },
  {
    name: "menu:background-selected",
    group: "menu",
    label: "Highlighted item",
    fallback: "chrome:accent",
    role: "background",
  },
  {
    name: "menu:foreground-selected",
    group: "menu",
    label: "Highlighted item text",
    fallback: "chrome:on-accent",
    role: "foreground",
    against: "menu:background-selected",
  },
  { name: "menu:border", group: "menu", label: "Menu border", fallback: "chrome:line", role: "line" },
  {
    name: "menu:shortcut",
    group: "menu",
    label: "Shortcut hint",
    fallback: "chrome:muted",
    role: "foreground",
    against: "menu:background",
  },
  // Generic controls: inputs, lists, tables, trees.
  { name: "control:background", group: "control", label: "Control", fallback: "chrome:background", role: "background" },
  {
    name: "control:foreground",
    group: "control",
    label: "Control text",
    fallback: "chrome:foreground",
    role: "foreground",
    against: "control:background",
  },
  {
    name: "control:background-selected",
    group: "control",
    label: "Selected row",
    fallback: "chrome:accent",
    role: "background",
  },
  {
    name: "control:foreground-selected",
    group: "control",
    label: "Selected row text",
    fallback: "chrome:on-accent",
    role: "foreground",
    against: "control:background-selected",
  },
  {
    name: "control:background-selected-unfocused",
    group: "control",
    label: "Selected row, unfocused",
    // A muted surface, not the accent: the row is still the collection's current
    // item, but the collection is not where typing goes. Falling back to
    // chrome:muted means a theme that has never heard of this token paints the
    // same as it always did until it chooses otherwise.
    fallback: "chrome:muted",
    role: "background",
    description: "The current row of a list that does not hold the keyboard.",
  },
  {
    name: "control:foreground-selected-unfocused",
    group: "control",
    label: "Selected row text, unfocused",
    fallback: "chrome:foreground",
    role: "foreground",
    against: "control:background-selected-unfocused",
  },
  {
    name: "control:border-focused",
    group: "control",
    label: "Focus ring",
    fallback: "chrome:accent",
    role: "line",
  },
  {
    name: "control:placeholder",
    group: "control",
    label: "Placeholder text",
    fallback: "chrome:muted",
    role: "foreground",
    against: "control:background",
  },
  {
    name: "control:selection-background",
    group: "control",
    label: "Text selection",
    fallback: "chrome:accent",
    role: "background",
  },
  {
    name: "control:selection-foreground",
    group: "control",
    label: "Selected text",
    fallback: "chrome:on-accent",
    role: "foreground",
    against: "control:selection-background",
  },
  // Scrollbars.
  { name: "scrollbar:track", group: "scrollbar", label: "Track", fallback: "chrome:background", role: "background" },
  {
    name: "scrollbar:thumb",
    group: "scrollbar",
    label: "Thumb",
    fallback: "chrome:muted",
    role: "foreground",
    against: "scrollbar:track",
  },
  {
    name: "scrollbar:thumb-active",
    group: "scrollbar",
    label: "Dragged thumb",
    fallback: "chrome:accent",
    role: "foreground",
    against: "scrollbar:track",
  },
  // The desktop around the windows.
  {
    name: "desktop:topbar-background",
    group: "desktop",
    label: "Top bar",
    fallback: "chrome:background",
    role: "background",
  },
  {
    name: "desktop:topbar-foreground",
    group: "desktop",
    label: "Top bar text",
    fallback: "chrome:foreground",
    role: "foreground",
    against: "desktop:topbar-background",
  },
  {
    name: "desktop:statusbar-background",
    group: "desktop",
    label: "Status bar",
    fallback: "chrome:background",
    role: "background",
  },
  {
    name: "desktop:statusbar-foreground",
    group: "desktop",
    label: "Status bar text",
    fallback: "chrome:muted",
    role: "foreground",
    against: "desktop:statusbar-background",
  },
  // Status colours, kept distinct from the accent on purpose.
  {
    name: "status:success",
    group: "status",
    label: "Success",
    fallback: "success",
    role: "foreground",
    against: "chrome:background",
  },
  {
    name: "status:warning",
    group: "status",
    label: "Warning",
    fallback: "warning",
    role: "foreground",
    against: "chrome:background",
  },
  {
    name: "status:danger",
    group: "status",
    label: "Danger",
    fallback: "danger",
    role: "foreground",
    against: "chrome:background",
  },
  {
    name: "status:info",
    group: "status",
    label: "Info",
    fallback: "chrome:accent",
    role: "foreground",
    against: "chrome:background",
  },
];

/**
 * Every control token, chrome tier first. Declaration order is also fallback
 * order: a token may only fall back to one already declared, which is what
 * makes the chains acyclic without anyone having to check.
 */
export const CONTROL_TOKENS: readonly ControlTokenSpec[] = Object.freeze([
  ...CHROME_TOKENS,
  ...CONTROL_SURFACE_TOKENS,
]);

const CONTROL_TOKENS_BY_NAME: ReadonlyMap<string, ControlTokenSpec> = new Map(
  CONTROL_TOKENS.map((token) => [token.name, token]),
);

/** One editor group with its tokens, in declaration order. */
export interface ControlTokenGroup {
  readonly id: ControlTokenGroupId;
  readonly label: string;
  readonly tokens: readonly ControlTokenSpec[];
}

/** The control tokens grouped for display; every token appears exactly once. */
export function controlTokenGroups(): readonly ControlTokenGroup[] {
  return CONTROL_TOKEN_GROUP_IDS.map((id) => ({
    id,
    label: CONTROL_TOKEN_GROUP_LABELS[id],
    tokens: CONTROL_TOKENS.filter((token) => token.group === id),
  }));
}

/** Looks one token up by name. */
export function controlToken(name: string): ControlTokenSpec | undefined {
  return CONTROL_TOKENS_BY_NAME.get(name);
}

let registry: SemanticTokenRegistry<string> | undefined;

/**
 * The registry with every control token declared. Built once: declaring is
 * pure and returns a new registry each time, so the cost is only paid on the
 * first call and every caller shares the same chains.
 */
export function controlTokenRegistry(): SemanticTokenRegistry<string> {
  if (registry) return registry;
  let next = createSemanticTokenRegistry() as SemanticTokenRegistry<string>;
  for (const token of CONTROL_TOKENS) {
    next = next.declare(token.name as `${string}:${string}`, {
      fallback: token.fallback,
      ...(token.description !== undefined ? { description: token.description } : {}),
    });
  }
  registry = next;
  return registry;
}

/**
 * The fallback chain for a token, from itself down to a core token. The editor
 * shows this so an inherited colour says where it came from.
 */
export function controlTokenChain(name: string): readonly string[] {
  const known = controlTokenRegistry();
  return known.has(name) ? known.chain(name) : [name];
}

/**
 * Resolves one token against a document's colours: the token itself when the
 * document sets it, otherwise the first ancestor it does set. Undefined only
 * when the document defines nothing in the whole chain, which for a valid
 * theme means it is missing one of the seven core colours.
 */
export function resolveControlToken(
  name: string,
  colors: Readonly<Record<string, Rgb>>,
): Rgb | undefined {
  for (const candidate of controlTokenChain(name)) {
    const color = colors[candidate];
    if (color) return color;
  }
  return undefined;
}

/** Every control token resolved at once, for painting. */
export function resolveControlTokens(
  colors: Readonly<Record<string, Rgb>>,
): Readonly<Record<string, Rgb>> {
  const resolved: Record<string, Rgb> = {};
  for (const token of CONTROL_TOKENS) {
    const color = resolveControlToken(token.name, colors);
    if (color) resolved[token.name] = color;
  }
  return Object.freeze(resolved);
}
