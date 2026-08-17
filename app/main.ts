import { BoxObject } from "../src/canvas/box.ts";
import { TextObject, type TextRectangle } from "../src/canvas/text.ts";
import { ScrollAreaController, scrollbarGlyph, scrollbarThumb } from "../src/components/scroll_area.ts";
import { handleInput } from "../src/input.ts";
import { WindowManagerController, type WindowManagerWindowInspection } from "../src/layout/mod.ts";
import { Computed, Effect, Signal } from "../src/signals/mod.ts";
import { Tui } from "../src/tui.ts";
import { createDefaultAsciiOptions } from "../src/three_ascii/options.ts";
import { textWidth } from "../src/utils/strings.ts";
import { AudioRegistry, buildSourceCatalog, discoverAudioSources, resolveSourceFramesInto } from "./sources.ts";
import {
  accentColor,
  createNeonPanelStyles,
  makeStyle,
  palette,
  requireInteractiveTerminal,
  severityAccent,
} from "./styles.ts";
import { SystemMonitor } from "./system_metrics.ts";
import { FrameView, ListView, MultilineTextView, PanelView } from "./ui.ts";
import {
  type BorderMode,
  borderModes,
  type LayoutId,
  layoutIds,
  type MenuLine,
  type MenuState,
  type Rect,
  type SlotConfig,
  type SlotId,
  slotIds,
  type SourceFrame,
  type ViewportMode,
} from "./types.ts";
import {
  defaultVisualizationForSlot,
  monitorVisualizations,
  orderVisualizationsForSlot,
  renderMonitorVisualization,
} from "./visualizations.ts";
import { crop } from "./visualization_primitives.ts";

const PANEL_SCROLLBAR_LINE_LIMIT = 256;
const MONITOR_WINDOW_CONTROL_TEXT = "[-] [□] [↺] [x]";
const MONITOR_WINDOW_CONTROL_WIDTH = 15;
const MONITOR_WINDOW_CONTROL_MIN_WIDTH = MONITOR_WINDOW_CONTROL_WIDTH + 1;
type MultiPaneLayoutId = Exclude<LayoutId, "single">;
type MonitorHit =
  | { type: "focus"; id: SlotId }
  | { type: "minimize"; id: SlotId }
  | { type: "maximize"; id: SlotId }
  | { type: "restore"; id: SlotId }
  | { type: "close"; id: SlotId }
  | { type: "tab"; id: SlotId }
  | { type: "quit" };

function detectViewportMode(bounds: Rect): ViewportMode {
  if (bounds.width < 90 || bounds.height < 26) return "mobile";
  if (bounds.width < 128 || bounds.height < 34) return "compact";
  return "desktop";
}

function centeredRect(bounds: Rect, width: number, height: number): Rect {
  return {
    column: bounds.column + Math.max(0, Math.floor((bounds.width - width) / 2)),
    row: bounds.row + Math.max(0, Math.floor((bounds.height - height) / 2)),
    width: Math.min(bounds.width, width),
    height: Math.min(bounds.height, height),
  };
}

function fitTextWidth(lines: string[], minWidth = 24, maxWidth = 80) {
  let width = minWidth;
  for (let index = 0; index < lines.length; index += 1) {
    width = Math.max(width, textWidth(lines[index] ?? ""));
  }
  return Math.min(maxWidth, width);
}

requireInteractiveTerminal("deno task viz");

const tui = new Tui({
  style: makeStyle({ bg: palette.void }),
  refreshRate: 1000 / 24,
  enableMouse: true,
});

const audioCatalog = await discoverAudioSources();
const audioRegistry = new AudioRegistry(audioCatalog);
const systemMonitor = new SystemMonitor(60);
await systemMonitor.start(1000);

const slots = new Signal<Record<SlotId, SlotConfig>>(createDefaultSlots(), { deepObserve: true });
const layout = new Signal<LayoutId>("monitor");
const selectedSlotId = new Signal<SlotId>("cpu");
const menu = new Signal<MenuState | null>(null);
const sourceCatalog = new Signal(buildSourceCatalog(audioCatalog));
const phase = new Signal(0);
const restoreLayout = new Signal<MultiPaneLayoutId>("monitor");
const tileDensity = new Signal(0);
const windowManager = new WindowManagerController({
  activeId: "cpu",
  windows: slotIds.map((slotId, index) => ({
    id: slotId,
    title: slotLabel(slotId),
    order: index,
    minWidth: slotId === "cpuLegend" || slotId === "temperature" || slotId === "disk" || slotId === "gpuChip" ||
        slotId === "gpuMemory"
      ? 28
      : 42,
    minHeight: slotId === "temperature" || slotId === "disk" ? 8 : 11,
  })),
  tileOptions: {
    minTileWidth: 42,
    minTileHeight: 11,
    targetAspectRatio: 2.1,
    allowVerticalOverflow: true,
  },
});
let hitTargets: Array<{ rect: Rect; hit: MonitorHit }> = [];

const cycleClock = new Map<SlotId, number>();
const timers = [
  setInterval(() => {
    phase.value += 1;
    const now = Date.now();
    for (const slot of Object.values(slots.peek())) {
      if (!slot.cycleEnabled) {
        continue;
      }
      const lastSwitch = cycleClock.get(slot.id) ?? now;
      if (now - lastSwitch >= slot.cycleIntervalMs) {
        slot.visualizationId = nextVisualization(slot.visualizationId, slot.id);
        cycleClock.set(slot.id, now);
      }
    }
  }, 250),
];

new Effect(() => {
  const ids = new Set<string>();
  for (const slot of Object.values(slots.value)) {
    for (const inputSourceId of slot.inputSourceIds) {
      if (inputSourceId.startsWith("audio:")) {
        ids.add(inputSourceId);
      }
    }
  }
  audioRegistry.setActiveSources([...ids]);
});

const appRect = new Computed<Rect>(() => {
  const bounds = tui.rectangle.value;
  return {
    column: 0,
    row: 0,
    width: bounds.width,
    height: bounds.height,
  };
});

const contentRect = new Computed<Rect>(() => {
  const bounds = appRect.value;
  return {
    column: 1,
    row: 3,
    width: Math.max(0, bounds.width - 2),
    height: Math.max(0, bounds.height - 5),
  };
});

const viewportMode = new Computed<ViewportMode>(() => detectViewportMode(contentRect.value));
const workspaceLayout = new Computed(() => {
  // WindowManagerController.layout() peeks its own state by design; track the
  // signals that change the layout so fullscreen/minimize/close re-tile
  // immediately instead of waiting for an unrelated recompute (QA-008).
  windowManager.windows.value;
  windowManager.activeId.value;
  windowManager.fullscreenId.value;
  return windowManager.layout({
    bounds: contentRect.value,
    tileOptions: {
      maxColumns: maxMonitorColumns(contentRect.value, layout.value),
      minTileWidth: Math.max(28, 46 - tileDensity.value * 3),
      minTileHeight: Math.max(7, 12 - tileDensity.value),
      targetAspectRatio: 2.1 + tileDensity.value * 0.12,
    },
  });
});
const activeLayout = new Computed<LayoutId>(() => windowManager.fullscreenId.value ? "single" : layout.value);
const visibleSlots = new Computed(() => {
  const source = workspaceLayout.value.fullscreenId ? workspaceLayout.value.tabs : workspaceLayout.value.visible;
  return source.map((entry) => entry.id as SlotId).filter((id) => slotIds.includes(id));
});

new Effect(() => {
  if (layout.value !== "single") {
    restoreLayout.value = layout.value;
  }
});

new Effect(() => {
  const activeId = windowManager.activeId.value as SlotId | undefined;
  if (activeId && slotIds.includes(activeId)) selectedSlotId.value = activeId;
});

new Effect(() => {
  const current = selectedSlotId.value;
  if (!visibleSlots.value.includes(current)) {
    focusSlot(visibleSlots.value[0] ?? "cpu");
  }
});

const shellObjects: Array<{ draw: () => void }> = [];

const alertBackground = new BoxObject({
  canvas: tui.canvas,
  zIndex: 100,
  style: new Computed(() => {
    const alert = systemMonitor.snapshot.value.alerts[0];
    const accent = alert ? accentColor(severityAccent(alert.severity)) : palette.panel;
    return makeStyle({ bg: accent, fg: alert ? palette.void : palette.paper, bold: true });
  }),
  rectangle: new Computed(() => ({
    column: 0,
    row: 0,
    width: appRect.value.width,
    height: appRect.value.height > 0 ? 1 : 0,
  })),
});
shellObjects.push(alertBackground);

const alertText = new TextObject({
  canvas: tui.canvas,
  zIndex: 101,
  style: new Computed(() => {
    const alert = systemMonitor.snapshot.value.alerts[0];
    return makeStyle({
      bg: alert ? accentColor(severityAccent(alert.severity)) : palette.panel,
      fg: alert ? palette.void : palette.paper,
      bold: true,
    });
  }),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({
    column: 0,
    row: 0,
    width: appRect.value.width,
  })),
  value: new Computed(() => {
    const width = appRect.value.width;
    const alert = systemMonitor.snapshot.value.alerts[0];
    const message = alert
      ? (phase.value % 6 < 3
        ? `${alert.title} / ${alert.detail}`
        : `ALERT BUS / ${systemMonitor.snapshot.value.alerts.length} ACTIVE CONDITION(S)`)
      : "NEON VISUALIZATION APP / GENERIC SOURCE ROUTING / F1 HELP";
    return crop(message, width).padEnd(width, " ");
  }),
});
shellObjects.push(alertText);

const quitText = new TextObject({
  canvas: tui.canvas,
  zIndex: 102,
  style: makeStyle({ fg: palette.void, bg: accentColor("alarm"), bold: true }),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({
    column: Math.max(0, appRect.value.width - 5),
    row: 0,
    width: appRect.value.width >= 12 ? 5 : 0,
  })),
  value: new Computed<string>(() => appRect.value.width >= 12 ? " [x] " : ""),
});
shellObjects.push(quitText);

const statusBackground = new BoxObject({
  canvas: tui.canvas,
  zIndex: 100,
  style: makeStyle({ bg: palette.panel }),
  rectangle: new Computed(() => ({
    column: 0,
    row: 1,
    width: appRect.value.width,
    height: appRect.value.height > 1 ? 1 : 0,
  })),
});
shellObjects.push(statusBackground);

const statusText = new TextObject({
  canvas: tui.canvas,
  zIndex: 101,
  style: makeStyle({ bg: palette.panel, fg: palette.paper, bold: true }),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({
    column: 0,
    row: 1,
    width: appRect.value.width,
  })),
  value: new Computed(() => {
    const slot = slots.value[selectedSlotId.value];
    const width = appRect.value.width;
    const layoutLabel = activeLayout.value === layout.value
      ? activeLayout.value.toUpperCase()
      : `${activeLayout.value.toUpperCase()}(${layout.value.toUpperCase()})`;
    const message = [
      `LAYOUT ${layoutLabel}`,
      `VIEW ${viewportMode.value.toUpperCase()}`,
      `FOCUS ${slot.name.toUpperCase()}`,
      `VIS ${slot.visualizationId.toUpperCase()}`,
      `INPUTS ${slot.inputSourceIds.length}`,
      `CYCLE ${slot.cycleEnabled ? `${Math.round(slot.cycleIntervalMs / 1000)}S` : "OFF"}`,
    ].join("  /  ");
    return crop(message, width).padEnd(width, " ");
  }),
});
shellObjects.push(statusText);

const windowBarBackground = new BoxObject({
  canvas: tui.canvas,
  zIndex: 100,
  style: makeStyle({ bg: palette.void }),
  rectangle: new Computed(() => ({
    column: 0,
    row: 2,
    width: appRect.value.width,
    height: appRect.value.height > 2 ? 1 : 0,
  })),
});
shellObjects.push(windowBarBackground);

const windowBarText = new TextObject({
  canvas: tui.canvas,
  zIndex: 101,
  style: makeStyle({ bg: palette.void, fg: palette.dim }),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({
    column: 0,
    row: 2,
    width: appRect.value.width,
  })),
  value: new Computed(() => {
    const tabs = workspaceLayout.value.tabs
      .filter((entry) => !entry.closed)
      .map((entry) => {
        const label = slotLabel(entry.id as SlotId).replace(" Panel", "");
        if (entry.active) return `[${label}]`;
        if (entry.minimized) return `(${label})`;
        return ` ${label} `;
      })
      .join(" ");
    const help = appRect.value.width >= 108
      ? "  Tab/Arrows focus  Enter/F max  M min  R restore  X close  [/] tiles"
      : "  Tab focus  F max  M min  R restore";
    return crop(`${tabs}${help}`, appRect.value.width).padEnd(appRect.value.width, " ");
  }),
});
shellObjects.push(windowBarText);

const footerBackground = new BoxObject({
  canvas: tui.canvas,
  zIndex: 100,
  style: makeStyle({ bg: palette.panel }),
  rectangle: new Computed(() => ({
    column: 0,
    row: Math.max(0, appRect.value.height - 1),
    width: appRect.value.width,
    height: appRect.value.height > 2 ? 1 : 0,
  })),
});
shellObjects.push(footerBackground);

const footerText = new TextObject({
  canvas: tui.canvas,
  zIndex: 101,
  style: makeStyle({ bg: palette.panel, fg: palette.dim }),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({
    column: 0,
    row: Math.max(0, appRect.value.height - 1),
    width: appRect.value.width,
  })),
  value: new Computed(() => {
    if (workspaceLayout.value.fullscreenId) {
      const tabs = workspaceLayout.value.tabs
        .filter((entry) => !entry.closed)
        .map((entry, index) =>
          `${entry.active ? "[" : " "}${index + 1}:${slotLabel(entry.id as SlotId)}${entry.active ? "]" : " "}`
        )
        .join(" ");
      return crop(`FULLSCREEN TABS  ${tabs}  /  R RESTORE  Q EXIT`, appRect.value.width).padEnd(
        appRect.value.width,
        " ",
      );
    }
    const mobileFooter = "MOBILE  /  ENTER FULLSCREEN  ,/. WINDOW  </> VIZ  F2 ROUTING  F4 OPTIONS  Q EXIT";
    const desktopFooter =
      "F1 HELP  F2 ROUTING  F3 LAYOUT  F4 OPTIONS  ENTER/F FULLSCREEN  ,/. WINDOW  </> VIZ  F5 CYCLE  Q EXIT";
    return crop(viewportMode.value === "mobile" ? mobileFooter : desktopFooter, appRect.value.width).padEnd(
      appRect.value.width,
      " ",
    );
  }),
});
shellObjects.push(footerText);

const slotPanels = new Map<SlotId, PanelView>();
const slotScrolls = new Map<SlotId, ScrollAreaController>();
const slotSourceFrameBuffers = new Map<SlotId, SourceFrame[]>();
const scrollTeardowns: Array<() => void> = [];

for (const slotId of slotIds) {
  const scroll = new ScrollAreaController({ showScrollbar: true });
  slotScrolls.set(slotId, scroll);
  const rect = new Computed(() => slotWindowRect(slotId));
  const render = new Computed(() => {
    if (rect.value.width <= 0 || rect.value.height <= 0) {
      return {
        title: "",
        body: "",
        footer: "",
        alert: "",
        accent: "signal" as const,
        severity: "info" as const,
        three: undefined,
      };
    }
    const slot = slots.value[slotId];
    let sourceBuffer = slotSourceFrameBuffers.get(slotId);
    if (!sourceBuffer) {
      sourceBuffer = [];
      slotSourceFrameBuffers.set(slotId, sourceBuffer);
    }
    const sources = resolveSourceFramesInto(
      sourceBuffer,
      slot.inputSourceIds,
      systemMonitor.snapshot.value,
      audioRegistry,
      phase.value,
    );
    return renderMonitorVisualization({
      slot,
      system: systemMonitor.snapshot.value,
      sources,
      phase: phase.value,
      width: Math.max(8, rect.value.width - 2),
      height: Math.max(4, rect.value.height - 4),
    });
  });
  const selected = new Computed(() => windowManager.activeId.value === slotId);

  const panel = new PanelView({
    canvas: tui.canvas,
    rectangle: rect,
    title: new Computed(() => {
      const renderValue = render.value;
      const slot = slots.value[slotId];
      const title = renderValue.title ?? slot.visualizationId.toUpperCase();
      return rect.value.width > 0 ? `${slot.name.toUpperCase()} / ${title}` : "";
    }),
    alert: new Computed(() => render.value.alert),
    body: new Computed(() => render.value.body),
    bodyLineOffset: new Computed(() => scroll.offset.value.rows),
    footer: new Computed(() => {
      const renderValue = render.value;
      const slot = slots.value[slotId];
      const cycle = slot.cycleEnabled ? ` / CYCLE ${Math.round(slot.cycleIntervalMs / 1000)}S` : "";
      const scrollState = scroll.inspect();
      const overflow = scrollState.maxOffset.rows > 0
        ? ` / SCROLL ${scroll.offset.value.rows + 1}-${
          Math.min(scroll.contentHeight.value, scroll.offset.value.rows + scroll.viewportHeight.value)
        }/${scroll.contentHeight.value}`
        : "";
      return `${renderValue.footer}${cycle}${overflow}`;
    }),
    ...createNeonPanelStyles(render, selected, { emphasizeSeverity: true }),
    borderMode: new Computed(() => slots.value[slotId].ascii.border),
    zIndex: 10,
  });

  slotPanels.set(slotId, panel);
  const syncPanelScroll = () => {
    const bodyRect = panel.bodyRect.peek();
    const body = render.peek().body;
    const bodyLineCount = body.length === 0 ? 0 : body.split("\n").length;
    if (scroll.viewportWidth.peek() !== bodyRect.width || scroll.viewportHeight.peek() !== bodyRect.height) {
      scroll.setViewportSize(bodyRect.width, bodyRect.height);
    }
    if (scroll.contentWidth.peek() !== bodyRect.width || scroll.contentHeight.peek() !== bodyLineCount) {
      scroll.setContentSize(bodyRect.width, bodyLineCount);
    }
  };
  syncPanelScroll();
  panel.bodyRect.subscribe(syncPanelScroll);
  render.subscribe(syncPanelScroll);
  scrollTeardowns.push(() => {
    panel.bodyRect.unsubscribe(syncPanelScroll);
    render.unsubscribe(syncPanelScroll);
  });
}

const panelScrollbarText: TextObject[] = slotIds.flatMap((slotId) =>
  Array.from({ length: PANEL_SCROLLBAR_LINE_LIMIT }, (_, index) =>
    new TextObject({
      canvas: tui.canvas,
      zIndex: 27,
      style: new Computed(() => {
        const active = windowManager.activeId.value === slotId;
        return makeStyle({
          fg: active ? accentColor("signal") : palette.dim,
          bg: active ? palette.panelSoft : palette.panel,
          bold: active,
        });
      }),
      overwriteRectangle: true,
      rectangle: new Computed<TextRectangle>(() => {
        const panel = slotPanels.get(slotId);
        const scroll = slotScrolls.get(slotId);
        const rect = panel?.bodyRect.value ?? { column: 0, row: 0, width: 0, height: 0 };
        const visible = Boolean(
          scroll?.showScrollbar.value && scroll.maxOffset().rows > 0 && index < rect.height && rect.width > 0,
        );
        return {
          column: visible ? rect.column + Math.max(0, rect.width - 1) : 0,
          row: visible ? rect.row + index : 0,
          width: visible ? 1 : 0,
        };
      }),
      value: new Computed(() => {
        const panel = slotPanels.get(slotId);
        const scroll = slotScrolls.get(slotId);
        const rect = panel?.bodyRect.value;
        if (!scroll || !rect || scroll.maxOffset().rows <= 0 || index >= rect.height) return "";
        return scrollbarGlyph(index, scrollbarThumb(scroll.contentHeight.value, rect.height, scroll.offset.value.rows));
      }),
    }))
);

const windowControlText: TextObject[] = slotIds.map((slotId) =>
  new TextObject({
    canvas: tui.canvas,
    zIndex: 26,
    style: new Computed(() => {
      const active = windowManager.activeId.value === slotId;
      return makeStyle({
        fg: active ? palette.void : palette.paper,
        bg: active ? accentColor("signal") : palette.panel,
        bold: active,
      });
    }),
    overwriteRectangle: true,
    rectangle: new Computed<TextRectangle>(() => {
      const rect = slotWindowRect(slotId);
      return monitorWindowControlRect(rect);
    }),
    value: new Computed<string>(() => {
      const rect = slotWindowRect(slotId);
      return monitorWindowControlsVisible(rect) ? MONITOR_WINDOW_CONTROL_TEXT : "";
    }),
  })
);

const menuOverlay = new BoxObject({
  canvas: tui.canvas,
  zIndex: 200,
  style: new Computed(() => menu.value ? makeStyle({ bg: palette.shade }) : makeStyle({})),
  rectangle: new Computed(() =>
    menu.value
      ? ({
        column: 0,
        row: 0,
        width: appRect.value.width,
        height: appRect.value.height,
      })
      : ({
        column: 0,
        row: 0,
        width: 0,
        height: 0,
      })
  ),
});

const menuModel = new Computed(() =>
  buildMenuModel(menu.value, slots.value, sourceCatalog.value, layout.value, activeLayout.value, viewportMode.value)
);

const menuRect = new Computed<Rect>(() => {
  if (!menu.value) {
    return { column: 0, row: 0, width: 0, height: 0 };
  }
  const descriptionWidth = fitTextWidth(menuModel.value.descriptionLines, 30, Math.max(40, appRect.value.width - 6));
  const listWidth = fitTextWidth(
    menuModel.value.lines.map((line) => line.text),
    26,
    Math.max(36, appRect.value.width - 6),
  );
  // Borders + one padding column each side cost 4; +2 clipped every line's
  // last two characters ("...VISUALIZATION ORDE").
  const width = Math.min(appRect.value.width - 4, Math.max(descriptionWidth, listWidth, 36) + 4);
  const height = Math.min(
    appRect.value.height - 4,
    Math.max(8, menuModel.value.descriptionLines.length + Math.max(3, menuModel.value.lines.length) + 5),
  );
  return centeredRect(appRect.value, width, height);
});

const menuFrame = new FrameView({
  canvas: tui.canvas,
  rectangle: menuRect,
  style: new Computed(() => makeStyle({ fg: accentColor(menuModel.value.accent), bg: palette.panel, bold: true })),
  borderMode: new Computed<BorderMode>(() => menu.value?.kind === "help" ? "rounded" : "sharp"),
  zIndex: 202,
});

const menuBackground = new BoxObject({
  canvas: tui.canvas,
  zIndex: 201,
  style: makeStyle({ bg: palette.panel }),
  rectangle: new Computed(() => ({
    column: menuRect.value.column + 1,
    row: menuRect.value.row + 1,
    width: Math.max(0, menuRect.value.width - 2),
    height: Math.max(0, menuRect.value.height - 2),
  })),
});

// The title overlays only its own characters; padding it to the full header
// width blanked the top border between the title and the right corner.
const menuTitleText = new Computed(() =>
  crop(menuModel.value.title.toUpperCase(), Math.max(0, menuRect.value.width - 4))
);
const menuTitle = new TextObject({
  canvas: tui.canvas,
  zIndex: 203,
  style: new Computed(() => makeStyle({ fg: accentColor(menuModel.value.accent), bg: palette.void, bold: true })),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({
    column: menuRect.value.column + 2,
    row: menuRect.value.row,
    width: menuTitleText.value.length,
  })),
  value: menuTitleText,
});

const menuDescription = new MultilineTextView({
  canvas: tui.canvas,
  rectangle: new Computed(() => ({
    column: menuRect.value.column + 2,
    row: menuRect.value.row + 1,
    width: Math.max(0, menuRect.value.width - 4),
    height: Math.max(0, menuModel.value.descriptionLines.length),
  })),
  text: new Computed(() => menuModel.value.descriptionLines.join("\n")),
  style: new Computed(() => makeStyle({ fg: palette.paper, bg: palette.panel })),
  zIndex: 203,
  lineLimit: 8,
});

const menuList = new ListView({
  canvas: tui.canvas,
  rectangle: new Computed(() => ({
    column: menuRect.value.column + 2,
    row: menuRect.value.row + 1 + menuModel.value.descriptionLines.length,
    width: Math.max(0, menuRect.value.width - 4),
    height: Math.max(0, menuRect.value.height - 4 - menuModel.value.descriptionLines.length),
  })),
  lines: new Computed(() => menuModel.value.lines),
  emptyStyle: makeStyle({ bg: palette.panel }),
  zIndex: 203,
});

const menuFooter = new TextObject({
  canvas: tui.canvas,
  zIndex: 203,
  style: new Computed(() => makeStyle({ fg: palette.dim, bg: palette.panel })),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({
    column: menuRect.value.column + 2,
    row: menuRect.value.row + Math.max(0, menuRect.value.height - 2),
    width: Math.max(0, menuRect.value.width - 4),
  })),
  value: new Computed(() =>
    crop(menuModel.value.footer, Math.max(0, menuRect.value.width - 4)).padEnd(
      Math.max(0, menuRect.value.width - 4),
      " ",
    )
  ),
});

tui.on("keyPress", (event) => {
  if (event.ctrl && event.key === "c") {
    return;
  }

  const currentMenu = menu.peek();
  if (currentMenu) {
    handleMenuKey(event.key, currentMenu);
    return;
  }

  switch (event.key) {
    case "q":
      tui.emit("destroy");
      return;
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
    case "7":
      focusSlot(slotIds[Number(event.key) - 1] ?? selectedSlotId.peek());
      return;
    case "return":
    case "f":
      toggleFullscreen(selectedSlotId.peek());
      return;
    case "m":
      windowManager.minimize(selectedSlotId.peek());
      return;
    case "r":
    case "escape":
      windowManager.restore();
      return;
    case "x":
      windowManager.close(selectedSlotId.peek());
      return;
    case "[":
      tileDensity.value = Math.max(-2, tileDensity.value - 1);
      return;
    case "]":
      tileDensity.value = Math.min(4, tileDensity.value + 1);
      return;
    case "pageup":
      scrollSlot(selectedSlotId.peek(), -Math.max(1, panelBodyHeight(selectedSlotId.peek()) - 1));
      return;
    case "pagedown":
      scrollSlot(selectedSlotId.peek(), Math.max(1, panelBodyHeight(selectedSlotId.peek()) - 1));
      return;
    case "home":
      slotScrolls.get(selectedSlotId.peek())?.scrollTo(0, 0);
      return;
    case "end": {
      const scroll = slotScrolls.get(selectedSlotId.peek());
      scroll?.scrollTo(0, scroll.maxOffset().rows);
      return;
    }
    case "tab":
      selectNextSlot(event.shift ? -1 : 1);
      return;
    case "left":
    case "right":
    case "up":
    case "down":
      moveSelection(event.key);
      return;
    case "f1":
      menu.value = { kind: "help", column: 0, index: 0, targetSlotId: selectedSlotId.value };
      return;
    case "f2":
      menu.value = {
        kind: "routing",
        column: 0,
        index: slotIds.indexOf(selectedSlotId.value),
        targetSlotId: selectedSlotId.value,
      };
      return;
    case "f3":
      menu.value = {
        kind: "layout",
        column: 0,
        index: layoutIds.indexOf(layout.value),
        targetSlotId: selectedSlotId.value,
      };
      return;
    case "f4":
      menu.value = { kind: "options", column: 0, index: 0, targetSlotId: selectedSlotId.value };
      return;
    case "f5":
    case "c": {
      const slot = slots.value[selectedSlotId.value];
      slot.cycleEnabled = !slot.cycleEnabled;
      cycleClock.set(slot.id, Date.now());
      return;
    }
    case ",":
      shiftSelectedOutput(-1);
      return;
    case ".":
      shiftSelectedOutput(1);
      return;
    case "<":
      shiftSelectedVisualization(-1);
      return;
    case ">":
      shiftSelectedVisualization(1);
      return;
  }
});

tui.on("mousePress", (event) => {
  if (event.release) return;
  if (menu.peek()) return;
  rebuildHitTargets();
  const target = findHit(event.x, event.y);
  if (!target) return;
  applyHit(target.hit);
});

tui.on("mouseScroll", (event) => {
  if (menu.peek()) return;
  const hovered = slotAt(event.x, event.y);
  scrollSlot(hovered ?? selectedSlotId.peek(), event.scroll);
});

function handleMenuKey(key: string, currentMenu: MenuState) {
  if (key === "q") {
    tui.emit("destroy");
    return;
  }
  if (key === "escape") {
    menu.value = null;
    return;
  }

  if (key === "f1") {
    menu.value = { kind: "help", column: 0, index: 0, targetSlotId: currentMenu.targetSlotId };
    return;
  }
  if (key === "f2") {
    menu.value = {
      kind: "routing",
      column: 0,
      index: slotIds.indexOf(currentMenu.targetSlotId),
      targetSlotId: currentMenu.targetSlotId,
    };
    return;
  }
  if (key === "f3") {
    menu.value = {
      kind: "layout",
      column: 0,
      index: layoutIds.indexOf(layout.value),
      targetSlotId: currentMenu.targetSlotId,
    };
    return;
  }
  if (key === "f4") {
    menu.value = { kind: "options", column: 0, index: 0, targetSlotId: currentMenu.targetSlotId };
    return;
  }

  const model = buildMenuModel(
    currentMenu,
    slots.peek(),
    sourceCatalog.peek(),
    layout.peek(),
    activeLayout.peek(),
    viewportMode.peek(),
  );
  if (model.sections.length === 0) {
    return;
  }

  if (key === "left") {
    currentMenu.column = (currentMenu.column - 1 + model.sections.length) % model.sections.length;
    currentMenu.index = 0;
    menu.value = { ...currentMenu };
    return;
  }

  if (key === "right" || key === "tab") {
    currentMenu.column = (currentMenu.column + 1) % model.sections.length;
    currentMenu.index = 0;
    menu.value = { ...currentMenu };
    return;
  }

  const currentSection = model.sections[currentMenu.column] ?? model.sections[0];
  if (!currentSection) {
    return;
  }

  if (key === "up") {
    currentMenu.index = (currentMenu.index - 1 + currentSection.items.length) % currentSection.items.length;
    menu.value = { ...currentMenu };
    return;
  }

  if (key === "down") {
    currentMenu.index = (currentMenu.index + 1) % currentSection.items.length;
    menu.value = { ...currentMenu };
    return;
  }

  if (key === "return" || key === "space") {
    applyMenuSelection(currentMenu, currentSection.items[currentMenu.index]?.id ?? "");
    return;
  }
}

function applyMenuSelection(currentMenu: MenuState, itemId: string) {
  switch (currentMenu.kind) {
    case "layout":
      if (layoutIds.includes(itemId as LayoutId)) {
        applyMonitorLayout(itemId as LayoutId);
        menu.value = null;
      }
      return;
    case "routing": {
      if (currentMenu.column === 0 && slotIds.includes(itemId as SlotId)) {
        currentMenu.targetSlotId = itemId as SlotId;
        selectedSlotId.value = itemId as SlotId;
        currentMenu.index = 0;
        menu.value = { ...currentMenu };
        return;
      }
      const slot = slots.value[currentMenu.targetSlotId];
      if (currentMenu.column === 1) {
        slot.visualizationId = itemId;
        cycleClock.set(slot.id, Date.now());
        return;
      }
      if (currentMenu.column === 2) {
        if (slot.inputSourceIds.includes(itemId)) {
          slot.inputSourceIds = slot.inputSourceIds.filter((value) => value !== itemId);
        } else {
          slot.inputSourceIds = [...slot.inputSourceIds, itemId];
        }
        return;
      }
      return;
    }
    case "options": {
      const slot = slots.value[currentMenu.targetSlotId];
      switch (currentMenu.column) {
        case 0:
          if (borderModes.includes(itemId as BorderMode)) {
            slot.ascii.border = itemId as BorderMode;
          }
          return;
        case 1:
          slot.cycleEnabled = itemId === "on";
          cycleClock.set(slot.id, Date.now());
          return;
        case 2:
          slot.cycleIntervalMs = Number(itemId);
          cycleClock.set(slot.id, Date.now());
          return;
      }
      return;
    }
    case "help":
      menu.value = null;
      return;
  }
}

function moveSelection(direction: "left" | "right" | "up" | "down") {
  const visible = workspaceLayout.peek().visible
    .filter((entry) => slotIds.includes(entry.id as SlotId) && entry.rect)
    .map((entry) => entry as WindowManagerWindowInspection & { id: SlotId; rect: Rect });
  if (visible.length === 0) {
    return;
  }
  const current = visible.find((entry) => entry.id === selectedSlotId.peek()) ?? visible[0]!;
  const currentRect = current.rect;
  const currentCenter = {
    x: currentRect.column + currentRect.width / 2,
    y: currentRect.row + currentRect.height / 2,
  };

  let bestSlot: SlotId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of visible) {
    if (entry.id === current.id) {
      continue;
    }
    const rect = entry.rect;
    const center = {
      x: rect.column + rect.width / 2,
      y: rect.row + rect.height / 2,
    };

    const dx = center.x - currentCenter.x;
    const dy = center.y - currentCenter.y;

    if (direction === "left" && dx >= 0) {
      continue;
    }
    if (direction === "right" && dx <= 0) {
      continue;
    }
    if (direction === "up" && dy >= 0) {
      continue;
    }
    if (direction === "down" && dy <= 0) {
      continue;
    }

    const distance = Math.hypot(dx, dy) +
      (direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx)) * 0.4;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlot = entry.id;
    }
  }

  if (bestSlot) {
    focusSlot(bestSlot);
  }
}

function selectNextSlot(step: number) {
  const visible = visibleSlots.peek();
  if (visible.length === 0) {
    return;
  }
  const currentIndex = Math.max(0, visible.indexOf(selectedSlotId.peek()));
  focusSlot(visible[(currentIndex + step + visible.length) % visible.length] ?? visible[0]!);
}

function shiftSelectedVisualization(step: number) {
  const slot = slots.value[selectedSlotId.peek()];
  slot.visualizationId = shiftVisualizationForSlot(slot.id, slot.visualizationId, step, monitorVisualizations);
  cycleClock.set(slot.id, Date.now());
}

function shiftSelectedOutput(step: number) {
  selectNextSlot(step);
}

function scrollSlot(slotId: SlotId, rows: number): void {
  if (rows === 0) return;
  const scroll = slotScrolls.get(slotId);
  scroll?.scrollBy(0, rows);
}

function panelBodyHeight(slotId: SlotId): number {
  return Math.max(1, slotPanels.get(slotId)?.bodyRect.value.height ?? 1);
}

function slotAt(x: number, y: number): SlotId | undefined {
  for (let index = workspaceLayout.peek().visible.length - 1; index >= 0; index -= 1) {
    const entry = workspaceLayout.peek().visible[index]!;
    const slotId = entry.id as SlotId;
    if (slotIds.includes(slotId) && entry.rect && contains(entry.rect, x, y)) return slotId;
  }
}

function slotWindowRect(slotId: SlotId): Rect {
  const rect = workspaceLayout.value.windows.find((entry) => entry.id === slotId)?.rect;
  return rect ?? { column: 0, row: 0, width: 0, height: 0 };
}

function focusSlot(slotId: SlotId): void {
  windowManager.focus(slotId);
  selectedSlotId.value = slotId;
}

function toggleFullscreen(slotId: SlotId): void {
  focusSlot(slotId);
  windowManager.fullscreen(slotId);
}

function applyMonitorLayout(nextLayout: LayoutId): void {
  layout.value = nextLayout;
  if (nextLayout === "single") {
    windowManager.fullscreen(selectedSlotId.peek());
  } else {
    windowManager.restore();
  }
}

function maxMonitorColumns(bounds: Rect, requestedLayout: LayoutId): number {
  if (requestedLayout === "horizontal") return 1;
  if (requestedLayout === "vertical") return 2;
  if (requestedLayout === "quad") return 2;
  if (bounds.width >= 180) return 4;
  if (bounds.width >= 118) return 3;
  if (bounds.width >= 74) return 2;
  return 1;
}

function rebuildHitTargets(): void {
  hitTargets = [];
  if (appRect.peek().width >= 12) {
    hitTargets.push({
      rect: { column: Math.max(0, appRect.peek().width - 5), row: 0, width: 5, height: 1 },
      hit: { type: "quit" },
    });
  }
  for (const entry of workspaceLayout.peek().visible) {
    const slotId = entry.id as SlotId;
    if (!slotIds.includes(slotId) || !entry.rect) continue;
    const rect = entry.rect;
    hitTargets.push({ rect, hit: { type: "focus", id: slotId } });
    if (monitorWindowControlsVisible(rect)) {
      const column = monitorWindowControlRect(rect).column;
      hitTargets.push({ rect: { column, row: rect.row, width: 3, height: 1 }, hit: { type: "minimize", id: slotId } });
      hitTargets.push({
        rect: { column: column + 4, row: rect.row, width: 3, height: 1 },
        hit: { type: "maximize", id: slotId },
      });
      hitTargets.push({
        rect: { column: column + 8, row: rect.row, width: 3, height: 1 },
        hit: { type: "restore", id: slotId },
      });
      hitTargets.push({
        rect: { column: column + 12, row: rect.row, width: 3, height: 1 },
        hit: { type: "close", id: slotId },
      });
    }
  }
  if (workspaceLayout.peek().fullscreenId) {
    let column = 17;
    const row = Math.max(0, appRect.peek().height - 1);
    for (const entry of workspaceLayout.peek().tabs.filter((tab) => !tab.closed)) {
      const slotId = entry.id as SlotId;
      if (!slotIds.includes(slotId)) continue;
      const label = `${entry.active ? "[" : " "}${slotLabel(slotId)}${entry.active ? "]" : " "}`;
      hitTargets.push({ rect: { column, row, width: label.length + 2, height: 1 }, hit: { type: "tab", id: slotId } });
      column += label.length + 5;
    }
  }
}

function findHit(x: number, y: number): { rect: Rect; hit: MonitorHit } | undefined {
  for (let index = hitTargets.length - 1; index >= 0; index -= 1) {
    const target = hitTargets[index]!;
    if (contains(target.rect, x, y)) return target;
  }
}

function applyHit(hit: MonitorHit): void {
  switch (hit.type) {
    case "focus":
      focusSlot(hit.id);
      return;
    case "minimize":
      focusSlot(hit.id);
      windowManager.minimize(hit.id);
      return;
    case "maximize":
      toggleFullscreen(hit.id);
      return;
    case "restore":
      windowManager.restore(hit.id);
      return;
    case "close":
      focusSlot(hit.id);
      windowManager.close(hit.id);
      return;
    case "tab":
      windowManager.selectTab(hit.id);
      return;
    case "quit":
      tui.emit("destroy");
      return;
  }
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.column && y >= rect.row && x < rect.column + rect.width && y < rect.row + rect.height;
}

function buildMenuModel(
  currentMenu: MenuState | null,
  slotMap: Record<SlotId, SlotConfig>,
  catalog: ReturnType<typeof buildSourceCatalog>,
  requestedLayout: LayoutId,
  currentLayout: LayoutId,
  currentViewportMode: ViewportMode,
) {
  if (!currentMenu) {
    return {
      title: "",
      accent: "signal" as const,
      descriptionLines: [] as string[],
      footer: "",
      sections: [] as Array<{ title: string; items: Array<{ id: string; label: string; selected: boolean }> }>,
      lines: [] as MenuLine[],
    };
  }

  if (currentMenu.kind === "help") {
    const lines = [
      "ARROWS/TAB MOVE BETWEEN VISIBLE PANES.",
      "ENTER TOGGLES THE FOCUSED PANE INTO AND OUT OF FULLSCREEN.",
      ", AND . STEP THE SELECTED OUTPUT TARGET THROUGH AVAILABLE PANES.",
      "< AND > STEP THE FOCUSED PANE THROUGH ITS CURATED VISUALIZATION ORDER.",
      "F2 ROUTES INPUTS AND VISUALIZATIONS TO OUTPUT TARGETS.",
      "F3 SWITCHES BETWEEN THE BOTTOM-STYLE MONITOR AND SPLIT LAYOUTS.",
      "F4 CONFIGURES PANEL BORDERS AND METRIC-VIEW CYCLING.",
      "SYSTEM AUDIO MONITORS AND LIVE MICROPHONE INPUTS APPEAR IN ROUTING.",
      "F5 OR C TOGGLES CYCLE MODE ON THE SELECTED PANE.",
      "Q OR ESC CLOSES WINDOWS OR EXITS THE APP.",
    ];
    return {
      title: "Help",
      accent: "signal" as const,
      descriptionLines: [],
      footer: "ESC CLOSES THIS WINDOW",
      sections: [],
      lines: lines.map((text) => ({
        text,
        style: makeStyle({ fg: palette.paper, bg: palette.panel }),
      })),
    };
  }

  if (currentMenu.kind === "layout") {
    const sections = [{
      title: "Layouts",
      items: [
        { id: "monitor", label: "Monitor Wall", selected: requestedLayout === "monitor" },
        { id: "single", label: "Single Pane", selected: requestedLayout === "single" },
        { id: "vertical", label: "Vertical Split", selected: requestedLayout === "vertical" },
        { id: "horizontal", label: "Horizontal Split", selected: requestedLayout === "horizontal" },
        { id: "quad", label: "Quad Deck", selected: requestedLayout === "quad" },
      ],
    }];
    const responsiveLine = currentLayout === requestedLayout
      ? `VIEW ${currentViewportMode.toUpperCase()} / ACTIVE ${currentLayout.toUpperCase()}`
      : `VIEW ${currentViewportMode.toUpperCase()} / ACTIVE ${currentLayout.toUpperCase()} / REQUESTED ${requestedLayout.toUpperCase()}`;
    return decorateMenu(currentMenu, {
      title: "Layout Select",
      accent: "signal",
      descriptionLines: [
        "CHOOSE THE ACTIVE SCREEN LAYOUT.",
        "THE DEFAULT MONITOR WALL MIRRORS THE LOCAL BOTTOM PANEL ARRANGEMENT.",
        responsiveLine,
      ],
      footer: "ENTER SELECTS  /  ESC CLOSES",
      sections,
    });
  }

  if (currentMenu.kind === "routing") {
    const targetSlot = slotMap[currentMenu.targetSlotId];
    const sections = [
      {
        title: "Output Target",
        items: slotIds.map((slotId) => ({
          id: slotId,
          label: `${slotLabel(slotId)}${visibleSlots.peek().includes(slotId) ? " (visible)" : ""}`,
          selected: currentMenu.targetSlotId === slotId,
        })),
      },
      {
        title: "Visualization",
        items: orderVisualizationsForSlot(targetSlot.id, monitorVisualizations).map((entry) => ({
          id: entry.id,
          label: entry.name,
          selected: targetSlot.visualizationId === entry.id,
        })),
      },
      {
        title: "Input Sources",
        items: catalog.map((entry) => ({
          id: entry.id,
          label: `[${entry.group}] ${entry.name}`,
          selected: targetSlot.inputSourceIds.includes(entry.id),
        })),
      },
    ];
    return decorateMenu(currentMenu, {
      title: "Routing",
      accent: "amber",
      descriptionLines: [
        `OUTPUT ${slotLabel(currentMenu.targetSlotId).toUpperCase()}`,
        `VIS ${targetSlot.visualizationId.toUpperCase()} / INPUTS ${targetSlot.inputSourceIds.length}`,
        "LEFT/RIGHT CHANGES SECTION. ENTER SELECTS OR TOGGLES.",
      ],
      footer: "ROUTING MENU  /  ESC CLOSES",
      sections,
    });
  }

  const targetSlot = slotMap[currentMenu.targetSlotId];
  const sections = [
    {
      title: "Border",
      items: borderModes.map((mode) => ({
        id: mode,
        label: mode.toUpperCase(),
        selected: targetSlot.ascii.border === mode,
      })),
    },
    {
      title: "Cycle",
      items: [
        { id: "off", label: "OFF", selected: !targetSlot.cycleEnabled },
        { id: "on", label: "ON", selected: targetSlot.cycleEnabled },
      ],
    },
    {
      title: "Interval",
      items: [5000, 10000, 15000, 30000].map((value) => ({
        id: String(value),
        label: `${Math.round(value / 1000)}s`,
        selected: targetSlot.cycleIntervalMs === value,
      })),
    },
  ];

  return decorateMenu(currentMenu, {
    title: "Visualization Options",
    accent: "violet",
    descriptionLines: [
      `TARGET ${slotLabel(currentMenu.targetSlotId).toUpperCase()}`,
      `VIEW ${targetSlot.visualizationId.toUpperCase()} / BORDER ${targetSlot.ascii.border.toUpperCase()}`,
      `CYCLE ${targetSlot.cycleEnabled ? "ON" : "OFF"} / INTERVAL ${Math.round(targetSlot.cycleIntervalMs / 1000)}S`,
    ],
    footer: "OPTIONS MENU  /  F5 ALSO TOGGLES CYCLE",
    sections,
  });
}

function decorateMenu(
  currentMenu: MenuState,
  options: {
    title: string;
    accent: "alarm" | "amber" | "phosphor" | "signal" | "violet";
    descriptionLines: string[];
    footer: string;
    sections: Array<{ title: string; items: Array<{ id: string; label: string; selected: boolean }> }>;
  },
) {
  const section = options.sections[currentMenu.column] ?? options.sections[0];
  const lines = section
    ? [
      {
        text: `${section.title.toUpperCase()} ${
          section.items.length > 0 ? `(${currentMenu.index + 1}/${section.items.length})` : ""
        }`,
        style: makeStyle({ fg: accentColor(options.accent), bg: palette.panel, bold: true }),
      },
      ...section.items.map((item, index) => {
        const active = index === currentMenu.index;
        const marker = item.selected ? "■" : "·";
        return {
          text: `${marker} ${item.label}`,
          style: makeStyle({
            fg: active ? palette.void : item.selected ? palette.paper : palette.dim,
            bg: active ? accentColor(options.accent) : palette.panel,
            bold: active || item.selected,
          }),
        };
      }),
    ]
    : [];

  return {
    ...options,
    lines,
  };
}

function nextVisualization(currentId: string, slotId: SlotId) {
  return shiftVisualizationForSlot(slotId, currentId, 1, monitorVisualizations);
}

function shiftVisualizationForSlot<T extends { id: string }>(
  slotId: SlotId,
  currentId: string,
  step: number,
  entries: readonly T[],
): string {
  const ordered = orderVisualizationsForSlot(slotId, entries);
  if (ordered.length === 0) return currentId;

  const currentIndex = ordered.findIndex((entry) => entry.id === currentId);
  const baseIndex = currentIndex === -1 ? 0 : currentIndex;
  const normalizedStep = ((step % ordered.length) + ordered.length) % ordered.length;
  return ordered[(baseIndex + normalizedStep) % ordered.length]!.id;
}

function monitorWindowControlsVisible(rect: Pick<Rect, "width" | "height">): boolean {
  return rect.width >= MONITOR_WINDOW_CONTROL_MIN_WIDTH && rect.height >= 1;
}

function monitorWindowControlRect(rect: Rect): Rect {
  const visible = monitorWindowControlsVisible(rect);
  return {
    column: visible ? rect.column + Math.max(0, rect.width - MONITOR_WINDOW_CONTROL_MIN_WIDTH) : 0,
    row: visible ? rect.row : 0,
    width: visible ? MONITOR_WINDOW_CONTROL_WIDTH : 0,
    height: visible ? 1 : 0,
  };
}

function slotLabel(slotId: SlotId) {
  switch (slotId) {
    case "cpu":
      return "CPU Panel";
    case "cpuLegend":
      return "CPU Legend";
    case "gpu":
      return "GPU Fusion";
    case "gpuChip":
      return "GPU Chip";
    case "gpuMemory":
      return "GPU Memory";
    case "memory":
      return "Memory Panel";
    case "temperature":
      return "Temp Panel";
    case "disk":
      return "Disk Panel";
    case "network":
      return "Network Panel";
    case "processes":
      return "Process Panel";
  }
}

function createDefaultSlots(): Record<SlotId, SlotConfig> {
  return {
    cpu: {
      id: "cpu",
      name: "CPU",
      visualizationId: defaultVisualizationForSlot("cpu"),
      inputSourceIds: ["sys:cpu", "sys:load"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    cpuLegend: {
      id: "cpuLegend",
      name: "CPU Legend",
      visualizationId: defaultVisualizationForSlot("cpuLegend"),
      inputSourceIds: ["sys:cpu-cores"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    gpu: {
      id: "gpu",
      name: "GPU Fusion",
      visualizationId: defaultVisualizationForSlot("gpu"),
      inputSourceIds: ["sys:gpu", "sys:gpu-chip", "sys:gpu-memory"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    gpuChip: {
      id: "gpuChip",
      name: "GPU Chip",
      visualizationId: defaultVisualizationForSlot("gpuChip"),
      inputSourceIds: ["sys:gpu-chip"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    gpuMemory: {
      id: "gpuMemory",
      name: "GPU Memory",
      visualizationId: defaultVisualizationForSlot("gpuMemory"),
      inputSourceIds: ["sys:gpu-memory"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    memory: {
      id: "memory",
      name: "Memory",
      visualizationId: defaultVisualizationForSlot("memory"),
      inputSourceIds: ["sys:memory", "sys:swap"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    temperature: {
      id: "temperature",
      name: "Temp",
      visualizationId: defaultVisualizationForSlot("temperature"),
      inputSourceIds: ["sys:temperature"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    disk: {
      id: "disk",
      name: "Disk",
      visualizationId: defaultVisualizationForSlot("disk"),
      inputSourceIds: ["sys:disk"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    network: {
      id: "network",
      name: "Network",
      visualizationId: defaultVisualizationForSlot("network"),
      inputSourceIds: ["sys:network"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
    processes: {
      id: "processes",
      name: "Processes",
      visualizationId: defaultVisualizationForSlot("processes"),
      inputSourceIds: ["sys:processes", "sys:cpu"],
      cycleEnabled: false,
      cycleIntervalMs: 10000,
      ascii: createDefaultAsciiOptions(),
    },
  };
}

void handleInput(tui);
tui.dispatch();
tui.on("destroy", () => {
  systemMonitor.stop();
  audioRegistry.dispose();
  windowManager.dispose();
  tileDensity.dispose();
  for (const teardown of scrollTeardowns) {
    teardown();
  }
  for (const scroll of slotScrolls.values()) {
    scroll.dispose();
  }
  for (const timer of timers) {
    clearInterval(timer);
  }
});
tui.run();

for (const object of shellObjects) {
  object.draw();
}
for (const panel of slotPanels.values()) {
  panel.draw();
}
for (const scrollbar of panelScrollbarText) {
  scrollbar.draw();
}
for (const controls of windowControlText) {
  controls.draw();
}
menuOverlay.draw();
menuBackground.draw();
menuFrame.draw();
menuTitle.draw();
menuDescription.draw();
menuList.draw();
menuFooter.draw();
