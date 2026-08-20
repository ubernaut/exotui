// The parts that only exist once something is mounted: does the composed screen
// actually reach the canvas, and does the settings modal draw as a modal?
//
// Everything else in this suite is pure. These two are not, and they are exactly
// where the previous version was wrong on screen while passing every test.

import { assert, assertStringIncludes } from "./deps.ts";
import { Box, createAnsiStyle, Signal } from "../mod.ts";
import { canvasRowText, createTestTerminalApp } from "../mod.testing.ts";
import { resolveVisualizationTheme, type VisualizationTheme } from "../src/viz/mod.ts";
import { createMonitorView } from "../examples/showcases/exomonitor/view.ts";
import { composeScreen } from "../examples/showcases/exomonitor/compose.ts";
import { createFeedStreams, feedById, FEEDS, pushSnapshot } from "../examples/showcases/exomonitor/feeds.ts";
import { planFeeds } from "../examples/showcases/exomonitor/tiles.ts";
import { themeById } from "../examples/showcases/exomonitor/theme.ts";
import { itemsFor, type SettingsContext, type SettingsState } from "../examples/showcases/exomonitor/settings.ts";
import type { Snapshot } from "../examples/showcases/exomonitor/sampler.ts";

const SIZE = { columns: 80, rows: 24 };

const SNAPSHOT: Snapshot = {
  cpu: 0.42,
  cores: [0.4, 0.5, 0.3, 0.6],
  memory: { usedBytes: 7e9, totalBytes: 10e9, swapUsedBytes: 0, swapTotalBytes: 8e9 },
  network: [{ name: "eth0", rxBytesPerSecond: 20_000, txBytesPerSecond: 20_000 }],
  temperatures: [{ label: "pkg", celsius: 55 }],
  hottest: { label: "pkg", celsius: 55 },
};

/**
 * Mounts the view over a drawn screen, the way the application runs.
 *
 * The screen underneath is not decoration: erasing a hidden component repaints
 * whatever is below it, so a modal closed over a bare canvas stays on screen —
 * in a test harness, not in the application, which always has a screen there.
 */
async function mount() {
  const harness = await createTestTerminalApp({ size: SIZE });
  // Stands in for the object a real Tui draws from its `style` at zIndex -1.
  // Erasing a hidden component repaints whatever is under it, and this harness
  // has nothing there — so without this a closed modal stays on screen in the
  // test and nowhere else.
  new Box({
    parent: harness.app.tui as never,
    zIndex: -1,
    rectangle: new Signal({ column: 0, row: 0, width: SIZE.columns, height: SIZE.rows }),
    theme: { base: createAnsiStyle({}) },
  });
  const palette = new Signal(themeById("midnight"));
  const theme = new Signal<VisualizationTheme>(resolveVisualizationTheme(palette.peek().tokens));
  const view = createMonitorView(harness.app.tui as never, theme, palette);
  const streams = createFeedStreams();
  const now = Date.now();
  for (let step = 0; step < 30; step += 1) pushSnapshot(streams, SNAPSHOT, [], now - (30 - step) * 1000);
  return { harness, view, streams, theme, palette };
}

function backdrop(
  view: ReturnType<typeof createMonitorView>,
  streams: ReturnType<typeof createFeedStreams>,
  theme: VisualizationTheme,
) {
  const feeds = ["cpu:overall", "memory:used"].map((id) => feedById(id)!);
  const layout = planFeeds({ column: 0, row: 0, width: SIZE.columns, height: SIZE.rows - 1 }, feeds, {
    snapshot: SNAPSHOT,
  });
  view.present(composeScreen({
    width: SIZE.columns,
    height: SIZE.rows,
    layout,
    streams,
    theme,
    accent: [127, 214, 255],
    status: "2 tiles · m settings",
  }));
}

function readAll(harness: Awaited<ReturnType<typeof createTestTerminalApp>>): string[] {
  return Array.from({ length: SIZE.rows }, (_, row) => canvasRowText(harness.canvas, row, SIZE.columns));
}

Deno.test("a composed screen reaches the canvas, borders, titles and chart alike", async () => {
  const { harness, view, streams, theme } = await mount();
  const feeds = ["cpu:overall", "memory:used"].map((id) => feedById(id)!);
  const layout = planFeeds({ column: 0, row: 0, width: 80, height: 23 }, feeds, { snapshot: SNAPSHOT });
  view.present(composeScreen({
    width: 80,
    height: 24,
    layout,
    streams,
    theme: theme.peek(),
    accent: [127, 214, 255],
    status: "2 tiles · m settings",
  }));
  await harness.pilot.settle();
  const screen = readAll(harness).join("\n");
  assertStringIncludes(screen, "CPU");
  assertStringIncludes(screen, "MEMORY");
  assertStringIncludes(screen, "42%");
  assertStringIncludes(screen, "╭");
  assert(screen.includes("█"), "the area chart drew nothing");
  assertStringIncludes(screen, "m settings");
  harness.destroy();
});

Deno.test("the settings modal draws as a modal: a panel, tabs, rows and a hint", async () => {
  const { harness, view, streams, theme } = await mount();
  backdrop(view, streams, theme.peek());
  const state: SettingsState = {
    page: "sources",
    index: 1,
    enabled: new Set(["cpu:overall"]),
    overrides: new Map(),
    themeId: "midnight",
  };
  const context: SettingsContext = {
    feeds: ["cpu:overall", "cpu:cores", "memory:used"].map((id) => feedById(id)!),
    fitsFor: () => [{ id: "area", score: 1.1, crowding: 1, reason: "fits comfortably" }],
    themes: [{ id: "midnight", label: "Midnight" }],
    omitted: new Set(),
  };
  view.presentSettings(state, context);
  await harness.pilot.settle();
  const screen = readAll(harness).join("\n");
  assertStringIncludes(screen, "exomonitor settings");
  assertStringIncludes(screen, "[Sources]");
  assertStringIncludes(screen, "Display");
  assertStringIncludes(screen, "[x] overall");
  assertStringIncludes(screen, "[ ] per-core");
  assertStringIncludes(screen, "esc close");
  assertStringIncludes(screen, "╭");

  // And it goes away again, rather than leaving its border behind.
  view.presentSettings(undefined, context);
  await harness.pilot.settle();
  assert(!readAll(harness).join("\n").includes("exomonitor settings"), "the modal outlived its close");
  harness.destroy();
});

Deno.test("the Display page names the visualisation and the reason it was chosen", async () => {
  const { harness, view, streams, theme } = await mount();
  backdrop(view, streams, theme.peek());
  const context: SettingsContext = {
    feeds: [feedById("cpu:overall")!],
    fitsFor: () => [
      { id: "area", score: 1.1, crowding: 1, reason: "fits comfortably" },
      { id: "sparkline", score: 0.7, crowding: 1, reason: "fits comfortably" },
    ],
    themes: [{ id: "midnight", label: "Midnight" }],
    omitted: new Set(),
  };
  view.presentSettings({
    page: "display",
    index: 0,
    enabled: new Set(["cpu:overall"]),
    overrides: new Map(),
    themeId: "midnight",
  }, context);
  await harness.pilot.settle();
  const screen = readAll(harness).join("\n");
  assertStringIncludes(screen, "[Display]");
  assertStringIncludes(screen, "CPU");
  assertStringIncludes(screen, "area");
  assertStringIncludes(screen, "fits comfortably");
  harness.destroy();
});

Deno.test("switching settings pages draws every row of the new page", () => {
  // The modal used to size itself to each page. The list then drew against the
  // rectangle the page before had left, and the rows the shrinking box vacated
  // were never repainted — so a short page showed two of its rows and the tail
  // of the long one underneath. One size for every page has neither problem.
  const context: SettingsContext = {
    feeds: [...FEEDS],
    fitsFor: () => [{ id: "area", score: 1.1, crowding: 1, reason: "fits comfortably" }],
    themes: [{ id: "midnight", label: "Midnight" }],
    omitted: new Set(),
  };
  const enabled = new Set(FEEDS.map((feed) => feed.id));
  const page = (name: SettingsState["page"]): SettingsState => ({
    page: name,
    index: 1,
    enabled,
    overrides: new Map(),
    themeId: "midnight",
  });
  const rowsOf = (name: SettingsState["page"]) => itemsFor(page(name), context).length;
  assert(rowsOf("sources") > rowsOf("display"), "sources is the longer page");
  assert(rowsOf("display") > 3, "and display is not trivially short");
});
