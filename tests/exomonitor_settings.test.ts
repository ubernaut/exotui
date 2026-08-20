// The settings model: pages, toggling, pinning, and what must not be possible.

import { assert, assertEquals } from "./deps.ts";
import {
  activate,
  AUTOMATIC,
  enabledFeeds,
  itemsFor,
  moveSelection,
  reconcile,
  renderItems,
  type SettingsContext,
  type SettingsState,
  switchPage,
} from "../examples/showcases/exomonitor/settings.ts";
import { feedById, FEEDS } from "../examples/showcases/exomonitor/feeds.ts";
import type { VizFit } from "../src/viz/mod.ts";

const FITS: VizFit[] = [
  { id: "area", score: 1.1, crowding: 1, reason: "fits comfortably" },
  { id: "sparkline", score: 0.7, crowding: 1, reason: "fits comfortably" },
];

const context: SettingsContext = {
  feeds: [...FEEDS],
  fitsFor: () => FITS,
  themes: [{ id: "midnight", label: "Midnight" }, { id: "paper", label: "Paper" }],
  omitted: new Set(),
};

function state(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    page: "sources",
    index: 0,
    enabled: new Set(["cpu:overall", "memory:used"]),
    overrides: new Map(),
    themeId: "midnight",
    ...overrides,
  };
}

Deno.test("the selection never lands on a heading", () => {
  let current = state();
  const items = itemsFor(current, context);
  for (let step = 0; step < items.length * 2; step += 1) {
    current = moveSelection(current, context, 1);
    assert(items[current.index]!.kind !== "heading", `landed on a heading at ${current.index}`);
  }
});

Deno.test("the last feed cannot be switched off", () => {
  const items = itemsFor(state(), context);
  const only = items.findIndex((item) => item.kind === "feed" && item.feed.id === "cpu:overall");
  const single = state({ enabled: new Set(["cpu:overall"]), index: only });
  assertEquals(activate(single, context).enabled.size, 1, "a monitor showing nothing looks like a crash");
});

Deno.test("pinning a visualisation records it, and returning to auto forgets it", () => {
  const display = switchPage(state(), context, 1);
  assertEquals(display.page, "display");
  const pinned = activate(display, context, 1);
  assertEquals(pinned.overrides.get("cpu:overall"), "area");
  // Forward through every option comes back to auto, which is stored as absence.
  let current = pinned;
  for (let step = 0; step < FITS.length; step += 1) current = activate(current, context, 1);
  assertEquals(current.overrides.has("cpu:overall"), false);
});

Deno.test("the display page explains its choice rather than just naming it", () => {
  const display = switchPage(state(), context, 1);
  const items = itemsFor(display, context);
  const row = items.find((item) => item.kind === "visualization");
  assert(row && row.kind === "visualization");
  assertEquals(row.current, "area");
  assertEquals(row.pinned, AUTOMATIC);
  assertEquals(row.note, "fits comfortably");
});

Deno.test("a feed with no room says so on both pages", () => {
  const crowded: SettingsContext = { ...context, fitsFor: () => [], omitted: new Set(["memory:used"]) };
  const sources = itemsFor(state(), crowded).find((item) => item.kind === "feed" && item.feed.id === "memory:used");
  assert(sources && sources.kind === "feed");
  assertEquals(sources.note, "no room");
  const display = itemsFor(switchPage(state(), crowded, 1), crowded).find((item) =>
    item.kind === "visualization" && item.feed.id === "memory:used"
  );
  assert(display && display.kind === "visualization");
  assertEquals(display.note, "no room");
});

Deno.test("pages wrap in both directions", () => {
  assertEquals(switchPage(state(), context, -1).page, "theme");
  assertEquals(switchPage(state({ page: "theme" }), context, 1).page, "sources");
});

Deno.test("a feed the machine cannot supply today is kept, not erased", () => {
  // The bug this pins cost a real configuration: reconcile filtered by what was
  // available that run, and the next save wrote the loss to disk. One run
  // without permission to read /proc permanently deleted CPU, memory and
  // network from the user's settings.
  const stored = state({
    enabled: new Set(["cpu:overall", "audio:spectrum"]),
    overrides: new Map([["audio:spectrum", "waterfall"]]),
  });
  const settled = reconcile(stored);
  assertEquals([...settled.enabled].sort(), ["audio:spectrum", "cpu:overall"]);
  assertEquals(settled.overrides.size, 1);
  // Only what the catalogue no longer knows about goes.
  const obsolete = reconcile(state({ enabled: new Set(["cpu:overall", "cores"]) }));
  assertEquals([...obsolete.enabled], ["cpu:overall"]);
});

Deno.test("an unavailable feed still shows on the Sources page, marked", () => {
  const withoutAudio: SettingsContext = { ...context, feeds: FEEDS.filter((feed) => feed.source !== "audio") };
  const shown = itemsFor(state({ enabled: new Set(["audio:spectrum"]) }), withoutAudio)
    .find((item) => item.kind === "feed" && item.feed.id === "audio:spectrum");
  assert(shown && shown.kind === "feed");
  assertEquals(shown.checked, true, "a feed cannot be switched off if it is not on the page");
  assertEquals(shown.note, "unavailable");
});

Deno.test("rows fit the width they are given", () => {
  const items = itemsFor(state(), context);
  for (const width of [12, 30, 64]) {
    for (const row of renderItems(items, width)) {
      assert(row.length <= width, `"${row}" is ${row.length} wide, not ${width}`);
    }
  }
});

Deno.test("enabled feeds come back in catalogue order, not selection order", () => {
  const scrambled = state({ enabled: new Set(["memory:used", "cpu:overall"]) });
  assertEquals(enabledFeeds(scrambled, [...FEEDS]).map((feed) => feed.id), ["cpu:overall", "memory:used"]);
  assert(feedById("cpu:overall"));
});
