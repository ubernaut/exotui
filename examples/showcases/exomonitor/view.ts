// Mounting the screen: one composed frame of cells, and a settings modal built
// from the library's own controls.
//
// The two halves are deliberately different. Charts need a colour per cell, so
// the monitor itself is composed into a single frame and drawn through one
// VisualizationView. The settings modal is chrome, not data, so it is a Box, a
// Frame, Tabs and a List — the same widgets exomux uses, which is the point of
// building this on exotui at all.

import {
  Box,
  Computed,
  createAnsiStyle,
  Frame,
  List,
  type Rectangle,
  Signal,
  Tabs,
  Text,
  type TextRectangle,
  type Tui,
} from "../../../mod.ts";
import {
  type VisualizationTheme,
  VisualizationView,
  type VizCell,
  type VizFrame,
  type VizRun,
} from "../../../src/viz/mod.ts";

/** An untouched cell: no glyph, no colour, and therefore no run. */
const BLANK: VizCell = { char: " " };
import { layoutWorkbenchModal } from "../../../src/app/workbench_overlay.ts";
import { FEEDS, SOURCE_IDS } from "./feeds.ts";
import type { MonitorPalette } from "./theme.ts";
import {
  itemsFor,
  PAGE_LABELS,
  renderItems,
  SETTINGS_PAGES,
  type SettingsContext,
  type SettingsItem,
  type SettingsState,
} from "./settings.ts";

export interface MonitorView {
  /** Puts a composed screen up. */
  readonly present: (frame: VizFrame) => void;
  /**
   * Draws live tiles' charts over the screen, for feeds faster than the sample
   * tick. Given none it parks, which is what an unselected live feed or a
   * terminal with no room for one needs.
   */
  readonly presentLive: (tiles: readonly { rect: Rectangle; frame: VizFrame }[]) => void;
  /** Shows the settings modal, or hides it when given nothing. */
  readonly presentSettings: (state: SettingsState | undefined, context: SettingsContext) => void;
  /** The width the settings rows are rendered to, so callers can wrap the same way. */
  readonly settingsWidth: () => number;
}

/** Chrome above and below the list: border, title gap, tabs, gap, hint, border. */
const MODAL_CHROME_ROWS = 6;

/**
 * Rows the tallest page could need.
 *
 * The modal is one size for every page rather than sized to each. Resizing it
 * per page looked tidier and was wrong twice over: the list drew against a
 * rectangle from the page before, and the rows the shrinking box left behind
 * were never repainted, so the Sources page bled through the Display page.
 * A window that stays put has neither problem.
 */
const MODAL_CONTENT_ROWS = FEEDS.length + SOURCE_IDS.length + MODAL_CHROME_ROWS;

function modalRectFor(width: number, height: number): Rectangle {
  // The library's own modal geometry: centred, clamped, with the margins every
  // other workbench overlay uses.
  return layoutWorkbenchModal({
    bounds: { column: 0, row: 0, width, height },
    contentHeight: MODAL_CONTENT_ROWS,
    minWidth: 24,
    maxWidth: 74,
    minHeight: 8,
    horizontalMargin: 4,
    verticalMargin: 2,
  }).rect;
}

export function createMonitorView(
  tui: Tui,
  theme: Signal<VisualizationTheme>,
  palette: Signal<MonitorPalette>,
): MonitorView {
  const colour = (name: string, spare: [number, number, number]) => palette.value.tokens[name] ?? spare;

  const screen = new VisualizationView({
    parent: tui,
    zIndex: 1,
    rectangle: new Computed<Rectangle>(() => ({
      column: 0,
      row: 0,
      width: tui.rectangle.value.width,
      height: tui.rectangle.value.height,
    })),
    // A screen of charts is far more runs than one panel was; the pool grows to
    // what a frame asks for rather than clipping the bottom of a heatmap.
    initialRuns: 900,
    maxRuns: 6000,
    // A run with no background keeps none: substituting the theme's ground here
    // would make every cell opaque again, one layer below where it was fixed.
    styleFor: (run: VizRun) =>
      createAnsiStyle({
        foreground: run.foreground ?? theme.peek().foreground,
        ...(run.background ? { background: run.background } : {}),
      }),
  });

  // A live tile is redrawn on its own data rather than on the sample tick, so
  // it sits above the screen and repaints only its own rectangle. Sixty frames
  // a second of one chart is affordable; sixty of the whole screen is not.
  // One view for all of them, positioned at the origin and handed frames whose
  // cells already carry their absolute place. A view per live tile would need a
  // pool per tile, and a live feed can come and go with a menu keystroke.
  const liveOrigin = new Signal<Rectangle>({ column: 0, row: 0, width: 0, height: 0 });
  const live = new VisualizationView({
    parent: tui,
    zIndex: 2,
    rectangle: liveOrigin,
    initialRuns: 900,
    maxRuns: 6000,
    // A run with no background keeps none: substituting the theme's ground here
    // would make every cell opaque again, one layer below where it was fixed.
    styleFor: (run: VizRun) =>
      createAnsiStyle({
        foreground: run.foreground ?? theme.peek().foreground,
        ...(run.background ? { background: run.background } : {}),
      }),
  });

  // ---- the settings modal ----------------------------------------------
  const open = new Signal(false);
  const rows = new Signal<string[]>([]);
  const kinds = new Signal<SettingsItem["kind"][]>([]);
  const selected = new Signal(0);
  const activePage = new Signal(0);
  const hint = new Signal("");
  const modal = new Computed<Rectangle>(() => {
    const { width, height } = tui.rectangle.value;
    return modalRectFor(width, height);
  });

  const panelStyle = new Computed(() =>
    createAnsiStyle({
      background: colour("panel", [20, 27, 40]),
      foreground: colour("foreground", [213, 226, 245]),
    })
  );

  new Box({
    parent: tui,
    zIndex: 20,
    rectangle: modal,
    visible: open,
    theme: { base: panelStyle.peek() },
  }).style = panelStyle;

  const border = new Frame({
    parent: tui,
    zIndex: 21,
    charMap: "rounded",
    visible: open,
    rectangle: new Computed<Rectangle>(() => ({
      column: modal.value.column + 1,
      row: modal.value.row + 1,
      width: Math.max(1, modal.value.width - 2),
      height: Math.max(1, modal.value.height - 2),
    })),
    theme: { base: createAnsiStyle({}) },
  });
  border.style = new Computed(() =>
    createAnsiStyle({
      foreground: colour("border", [60, 74, 100]),
      background: colour("panel", [20, 27, 40]),
    })
  );

  const title = new Text({
    parent: tui,
    zIndex: 22,
    visible: open,
    text: new Signal(" exomonitor settings "),
    overwriteWidth: true,
    rectangle: new Computed<TextRectangle>(() => ({
      column: modal.value.column + 3,
      row: modal.value.row,
      width: 21,
    })),
    theme: { base: createAnsiStyle({}) },
  });
  title.style = new Computed(() =>
    createAnsiStyle({
      foreground: colour("accent", [127, 214, 255]),
      background: colour("panel", [20, 27, 40]),
    })
  );

  const tabs = new Tabs({
    parent: tui,
    zIndex: 22,
    visible: open,
    tabs: SETTINGS_PAGES.map((page) => ({ id: page, label: PAGE_LABELS[page] })),
    activeIndex: activePage,
    rectangle: new Computed<Rectangle>(() => ({
      column: modal.value.column + 3,
      row: modal.value.row + 2,
      width: Math.max(1, modal.value.width - 6),
      height: 1,
    })),
    theme: { base: createAnsiStyle({}) },
  });
  tabs.style = new Computed(() =>
    createAnsiStyle({
      foreground: colour("accent", [127, 214, 255]),
      background: colour("panel", [20, 27, 40]),
    })
  );

  const list = new List({
    parent: tui,
    zIndex: 22,
    visible: open,
    items: rows,
    selectedIndex: selected,
    rectangle: new Computed<Rectangle>(() => ({
      column: modal.value.column + 3,
      row: modal.value.row + 4,
      width: Math.max(1, modal.value.width - 6),
      height: Math.max(1, modal.value.height - 6),
    })),
    theme: { base: createAnsiStyle({}) },
    scrollbar: {
      track: createAnsiStyle({ foreground: [40, 48, 64], background: [20, 27, 40] }),
      thumb: createAnsiStyle({ foreground: [100, 120, 160], background: [20, 27, 40] }),
    },
    // A heading is not a row you can land on, so it must not look like one.
    markerFor: (index: number, isSelected: boolean) => {
      const kind = kinds.value[index];
      if (kind === "heading" || kind === "note") return " ";
      return isSelected ? "›" : " ";
    },
    rowStyle: (index: number, isSelected: boolean) => {
      const kind = kinds.value[index];
      const panel = colour("panel", [20, 27, 40]);
      if (isSelected && kind !== "heading" && kind !== "note") {
        return createAnsiStyle({
          foreground: colour("surface", [11, 15, 23]),
          background: colour("accent", [127, 214, 255]),
        });
      }
      if (kind === "heading") {
        return createAnsiStyle({ foreground: colour("border", [60, 74, 100]), background: panel });
      }
      if (kind === "note") return createAnsiStyle({ foreground: colour("muted", [92, 107, 135]), background: panel });
      return createAnsiStyle({ foreground: colour("foreground", [213, 226, 245]), background: panel });
    },
  });
  list.style = new Computed(() =>
    createAnsiStyle({
      foreground: colour("foreground", [213, 226, 245]),
      background: colour("panel", [20, 27, 40]),
    })
  );

  const hintText = new Text({
    parent: tui,
    zIndex: 22,
    visible: open,
    text: hint,
    overwriteWidth: true,
    rectangle: new Computed<TextRectangle>(() => ({
      column: modal.value.column + 3,
      row: modal.value.row + modal.value.height - 2,
      width: Math.max(1, modal.value.width - 6),
    })),
    theme: { base: createAnsiStyle({}) },
  });
  hintText.style = new Computed(() =>
    createAnsiStyle({
      foreground: colour("muted", [92, 107, 135]),
      background: colour("panel", [20, 27, 40]),
    })
  );

  const HINTS: Readonly<Record<string, string>> = {
    sources: "↑↓ move · ←→ page · space toggle · esc close",
    display: "↑↓ move · ←→ page · space cycles the chart · esc close",
    theme: "↑↓ move · ←→ page · space picks · esc close",
  };

  function settingsWidth(): number {
    // Six for the border and inset, two the List spends on its marker and the
    // space after it, one for the scrollbar down the right edge.
    return Math.max(1, modal.peek().width - 9);
  }

  return {
    present: (frame: VizFrame) => screen.present(frame),
    presentLive: (tiles) => {
      const drawable = tiles.filter((tile) => tile.rect.width > 0 && tile.rect.height > 0);
      if (drawable.length === 0) {
        live.present([]);
        return;
      }
      // Composited into one sparse frame spanning the terminal: rows nobody
      // draws stay empty, and an empty row costs no runs at all.
      const { width, height } = tui.rectangle.peek();
      const canvas: VizCell[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => BLANK));
      for (const tile of drawable) {
        for (let row = 0; row < tile.frame.length; row += 1) {
          const target = canvas[tile.rect.row + row];
          const source = tile.frame[row]!;
          if (!target) continue;
          for (let column = 0; column < source.length; column += 1) {
            const at = tile.rect.column + column;
            if (at >= 0 && at < target.length) target[at] = source[column]!;
          }
        }
      }
      live.present(canvas);
    },
    settingsWidth,
    presentSettings: (state, context) => {
      if (!state) {
        open.value = false;
        return;
      }
      const items = itemsFor(state, context);
      rows.value = renderItems(items, settingsWidth());
      kinds.value = items.map((item) => item.kind);
      selected.value = Math.min(state.index, Math.max(0, items.length - 1));
      activePage.value = SETTINGS_PAGES.indexOf(state.page);
      hint.value = HINTS[state.page] ?? "";
      open.value = true;
    },
  };
}
