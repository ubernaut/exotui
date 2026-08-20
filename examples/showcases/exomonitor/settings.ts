// The settings model: what the pages contain and what acting on a row does.
//
// Pure, so the awkward cases can be tested without a terminal — switching off
// the last feed, pinning a visualisation that stops fitting when the terminal
// shrinks, cycling past the end of a list. Drawing it is src/view.ts's problem.

import type { VizFit } from "../../../src/viz/mod.ts";
import { type Feed, feedById, FEEDS } from "./feeds.ts";

export const SETTINGS_PAGES = ["sources", "display", "theme"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

export const PAGE_LABELS: Readonly<Record<SettingsPage, string>> = {
  sources: "Sources",
  display: "Display",
  theme: "Theme",
};

/** Chosen automatically, and the head of every visualisation cycle. */
export const AUTOMATIC = "auto";

export interface SettingsState {
  readonly page: SettingsPage;
  readonly index: number;
  readonly enabled: ReadonlySet<string>;
  /** Feed id to visualisation id, where the user overrode the automatic choice. */
  readonly overrides: ReadonlyMap<string, string>;
  readonly themeId: string;
}

export interface ThemeChoice {
  readonly id: string;
  readonly label: string;
}

export interface SettingsContext {
  /** Feeds this machine can actually supply. */
  readonly feeds: readonly Feed[];
  /** The ranked candidates for a feed's current tile; empty when it has none. */
  readonly fitsFor: (feedId: string) => readonly VizFit[];
  readonly themes: readonly ThemeChoice[];
  /** Feeds that are enabled but had no room, so the page can say why. */
  readonly omitted: ReadonlySet<string>;
}

export type SettingsItem =
  | { readonly kind: "heading"; readonly label: string }
  | { readonly kind: "feed"; readonly feed: Feed; readonly checked: boolean; readonly note: string }
  | {
    readonly kind: "visualization";
    readonly feed: Feed;
    /** What is drawn now, resolved through the override. */
    readonly current: string;
    /** The user's pin, or `auto`. */
    readonly pinned: string;
    readonly options: readonly string[];
    readonly note: string;
  }
  | { readonly kind: "theme"; readonly id: string; readonly label: string; readonly checked: boolean }
  | { readonly kind: "note"; readonly label: string };

function selectable(item: SettingsItem): boolean {
  return item.kind !== "heading" && item.kind !== "note";
}

/** Every row of the current page, headings included. */
export function itemsFor(state: SettingsState, context: SettingsContext): SettingsItem[] {
  if (state.page === "theme") {
    return context.themes.map((theme) => ({
      kind: "theme" as const,
      id: theme.id,
      label: theme.label,
      checked: theme.id === state.themeId,
    }));
  }

  if (state.page === "sources") {
    const items: SettingsItem[] = [];
    let heading = "";
    for (const feed of FEEDS) {
      // Every feed in the catalogue, including the ones this machine cannot
      // supply today. A feed that vanishes from the list is a feed the user
      // cannot tell is switched on, which is how "where did my CPU go" happens.
      const offered = context.feeds.some((candidate) => candidate.id === feed.id);
      if (feed.sourceLabel !== heading) {
        heading = feed.sourceLabel;
        items.push({ kind: "heading", label: heading });
      }
      items.push({
        kind: "feed",
        feed,
        checked: state.enabled.has(feed.id),
        note: !offered ? "unavailable" : context.omitted.has(feed.id) ? "no room" : "",
      });
    }
    return items;
  }

  const items: SettingsItem[] = [];
  for (const feed of FEEDS) {
    if (!state.enabled.has(feed.id)) continue;
    const offered = context.feeds.some((candidate) => candidate.id === feed.id);
    const fits = offered ? context.fitsFor(feed.id) : [];
    const stored = state.overrides.get(feed.id) ?? AUTOMATIC;
    const resolved = fits.find((fit) => fit.id === stored) ?? fits[0];
    // A pin the registry no longer offers is not in effect, so it is not shown
    // as one. Marking it pinned beside a different chart reads as a bug in the
    // pin rather than as the planner refusing a choice that stopped fitting.
    const pinned = resolved?.id === stored ? stored : AUTOMATIC;
    items.push({
      kind: "visualization",
      feed,
      current: resolved?.id ?? "—",
      pinned,
      options: [AUTOMATIC, ...fits.map((fit) => fit.id)],
      // The reason the registry gave, so the page explains its choice rather
      // than presenting it as a preference.
      note: resolved?.reason ??
        (!offered ? "unavailable" : context.omitted.has(feed.id) ? "no room" : "no data"),
    });
  }
  if (items.length === 0) items.push({ kind: "note", label: "No feeds selected — see the Sources page." });
  return items;
}

/** Text rows, for a List to draw. */
export function renderItems(items: readonly SettingsItem[], width: number): string[] {
  return items.map((item) => renderItem(item, width));
}

function renderItem(item: SettingsItem, width: number): string {
  const room = Math.max(0, width);
  switch (item.kind) {
    case "heading":
      return `─ ${item.label} `.padEnd(room, "─").slice(0, room);
    case "note":
      return item.label.slice(0, room);
    case "feed": {
      const box = item.checked ? "[x]" : "[ ]";
      const note = item.note ? `  ${item.note}` : "";
      return pad(`${box} ${item.feed.label}`, item.feed.sourceLabel + note, room);
    }
    case "visualization": {
      const pin = item.pinned === AUTOMATIC ? "" : "•";
      return pad(`${item.feed.title}`, `${pin}${item.current}  ${item.note}`, room);
    }
    case "theme":
      return `${item.checked ? "(•)" : "( )"} ${item.label}`.slice(0, room);
  }
}

/** Left text and right text on one row, truncating the right first. */
function pad(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  const head = left.slice(0, width);
  const room = width - head.length - 1;
  if (room <= 0 || right.length === 0) return head;
  const tail = right.length > room ? right.slice(right.length - room) : right;
  return `${head}${" ".repeat(width - head.length - tail.length)}${tail}`;
}

/** Moves the selection, skipping headings and wrapping at both ends. */
export function moveSelection(state: SettingsState, context: SettingsContext, step: number): SettingsState {
  const items = itemsFor(state, context);
  if (items.length === 0) return state;
  for (let attempt = 1; attempt <= items.length; attempt += 1) {
    const candidate = (state.index + step * attempt + items.length * attempt) % items.length;
    if (selectable(items[candidate]!)) return { ...state, index: candidate };
  }
  return state;
}

/** Moves to another page, landing on its first selectable row. */
export function switchPage(state: SettingsState, context: SettingsContext, step: number): SettingsState {
  const at = SETTINGS_PAGES.indexOf(state.page);
  const page = SETTINGS_PAGES[(at + step + SETTINGS_PAGES.length) % SETTINGS_PAGES.length]!;
  const moved: SettingsState = { ...state, page, index: 0 };
  const items = itemsFor(moved, context);
  const first = items.findIndex(selectable);
  return { ...moved, index: Math.max(0, first) };
}

/**
 * Acts on the selected row.
 *
 * A feed toggles, a theme is chosen, a visualisation cycles forward. Switching
 * off the last feed is refused: a monitor showing nothing looks like a crash,
 * and the fix — an empty screen with a menu over it — is not discoverable.
 */
export function activate(state: SettingsState, context: SettingsContext, step = 1): SettingsState {
  const items = itemsFor(state, context);
  const item = items[state.index];
  if (!item) return state;

  if (item.kind === "theme") return { ...state, themeId: item.id };

  if (item.kind === "feed") {
    const enabled = new Set(state.enabled);
    if (enabled.has(item.feed.id)) {
      if (enabled.size === 1) return state;
      enabled.delete(item.feed.id);
    } else {
      enabled.add(item.feed.id);
    }
    return { ...state, enabled };
  }

  if (item.kind === "visualization") {
    const options = item.options;
    if (options.length <= 1) return state;
    const at = Math.max(0, options.indexOf(item.pinned));
    const next = options[(at + step + options.length) % options.length]!;
    const overrides = new Map(state.overrides);
    // `auto` is the absence of a pin, not a pin named auto: stored that way it
    // would survive a version that ranks differently and quietly freeze the
    // choice made today.
    if (next === AUTOMATIC) overrides.delete(item.feed.id);
    else overrides.set(item.feed.id, next);
    return { ...state, overrides };
  }
  return state;
}

/** The feeds a plan should be given, in catalogue order. */
export function enabledFeeds(state: SettingsState, available: readonly Feed[]): Feed[] {
  return FEEDS.filter((feed) => state.enabled.has(feed.id) && available.some((candidate) => candidate.id === feed.id));
}

/**
 * Drops what is no longer in the catalogue, and nothing else.
 *
 * Deliberately not filtered by what this machine offers today. A feed absent
 * for a run — a GPU that is not there, a `/proc` this process was refused — is
 * still a feed the user chose, and dropping it here means the next save writes
 * the loss to disk permanently. `enabledFeeds` already filters for tiling, so
 * an unavailable feed simply does not draw until it comes back.
 */
export function reconcile(state: SettingsState): SettingsState {
  const enabled = new Set([...state.enabled].filter((id) => feedById(id)));
  const overrides = new Map([...state.overrides].filter(([id]) => feedById(id)));
  return { ...state, enabled, overrides };
}
