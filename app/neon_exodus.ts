import { runtimeHost } from "../src/runtime/host.ts";
import { BoxObject } from "../src/canvas/box.ts";
import { TextObject, type TextRectangle } from "../src/canvas/text.ts";
import { handleInput } from "../src/input.ts";
import { Computed, Effect, Signal } from "../src/signals/mod.ts";
import { probeCompatibleWebGPUDevice } from "../src/three_ascii/webgpu_compat.ts";
import { Tui } from "../src/tui.ts";
import { adaptiveGridItemRect, adaptiveGridPage } from "../src/layout/mod.ts";
import { createDefaultAsciiOptions, terminalGlyphStyleLabel } from "../src/three_ascii/options.ts";
import {
  cycleDemo,
  demoIndex,
  emptyNeonSuiteRender,
  fitText,
  formatNeonSuiteAlert,
  hiddenRect,
  moveGridSelection,
  neonDemosForSection,
  type NeonSuiteSection,
  neonSuiteSectionLabels,
  neonSuiteSections,
  neonSuiteSummary,
  renderNeonSuiteDemo,
} from "./neon_suite.ts";
import {
  accentColor,
  createNeonPanelStyles,
  makeStyle,
  palette,
  requireInteractiveTerminal,
  titleInk,
} from "./styles.ts";
import { ThreePanelView } from "./three_panel.ts";
import type { AsciiOptions, BorderMode, PanelRender, Rect } from "./types.ts";
import { PanelView } from "./ui.ts";
import { formatCountdown, type NeonDemo } from "./visualizations.ts";

type NeonSuiteSource = "opentui" | "web" | "extended";

const sourceLabels: Record<NeonSuiteSource, string> = {
  opentui: "OPENTUI",
  web: "WEB",
  extended: "EXTENDED",
};

requireInteractiveTerminal("deno task neon-exodus");

const tui = new Tui({
  style: makeStyle({ bg: palette.void }),
  refreshRate: 1000 / 24,
});

handleInput(tui);
tui.dispatch();

const phase = new Signal(0);
const source = new Signal<NeonSuiteSource>("opentui");
const section = new Signal<NeonSuiteSection>(initialSection(runtimeHost.args));
const selectedIndex = new Signal(0);
const maximized = new Signal(runtimeHost.args.includes("--maximized"));
const volume = new Signal(70);
const threeAsciiAvailable = new Signal(await probeCompatibleWebGPUDevice());
const ascii = new Signal<AsciiOptions>({
  ...createDefaultAsciiOptions(),
  preset: "opentui-blocks",
  terminalGlyphStyle: "blocks",
  border: "sharp",
  terminalEdgeBias: 1.35,
  blendWithBase: 0.8,
});

const timer = setInterval(() => {
  phase.value += 1;
}, 120);

const bounds = new Computed<Rect>(() => ({
  column: 0,
  row: 0,
  width: tui.rectangle.value.width,
  height: tui.rectangle.value.height,
}));

const compact = new Computed(() => bounds.value.width < 136 || bounds.value.height < 40);
const visibleDemos = new Computed(() => neonDemosForSection(section.value, { source: source.value }));

new Effect(() => {
  const count = visibleDemos.value.length;
  if (selectedIndex.value >= count) selectedIndex.value = Math.max(0, count - 1);
});

const selectedDemo = new Computed(() => visibleDemos.value[selectedIndex.value] ?? visibleDemos.value[0]);
const summary = new Computed(() => neonSuiteSummary(source.value));

const headerBackground = new BoxObject({
  canvas: tui.canvas,
  zIndex: 100,
  style: makeStyle({ bg: palette.panel }),
  rectangle: new Computed(() => ({ column: 0, row: 0, width: bounds.value.width, height: 4 })),
});

const headerTitle = new TextObject({
  canvas: tui.canvas,
  zIndex: 101,
  style: new Computed(() =>
    makeStyle({ fg: accentColor(selectedDemo.value?.accent ?? "signal"), bg: palette.panel, bold: true })
  ),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({ column: 1, row: 0, width: Math.max(0, bounds.value.width - 2) })),
  value: new Computed(() =>
    fitPad(
      `NEON EXODUS ${sourceLabels[source.value]} SUITE / ${neonSuiteSectionLabels[section.value]} / ${
        formatCountdown(phase.value)
      }`,
      Math.max(0, bounds.value.width - 2),
    )
  ),
});

const headerTabs = new TextObject({
  canvas: tui.canvas,
  zIndex: 101,
  style: makeStyle({ fg: palette.paper, bg: palette.panel }),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({ column: 1, row: 1, width: Math.max(0, bounds.value.width - 2) })),
  value: new Computed(() => {
    const tabs = neonSuiteSections.map((id, index) => {
      const label = `${index + 1} ${neonSuiteSectionLabels[id]}`;
      return id === section.value ? `[${label}]` : label;
    });
    return fitPad(tabs.join("   "), Math.max(0, bounds.value.width - 2));
  }),
});

const headerControls = new TextObject({
  canvas: tui.canvas,
  zIndex: 101,
  style: makeStyle({ fg: palette.dim, bg: palette.panel }),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({ column: 1, row: 2, width: Math.max(0, bounds.value.width - 2) })),
  value: new Computed(() => {
    const controls = maximized.value
      ? "ARROWS CYCLE  ESC,T RETURN  +/- VOL  B/G/M ASCII  O/W/E SUITE  Q EXIT"
      : "ARROWS MOVE  ENTER,F MAX  1-5 FILTER  +/- VOL  B/G/M ASCII  O/W/E SUITE  Q EXIT";
    return fitPad(controls, Math.max(0, bounds.value.width - 2));
  }),
});

const headerStatus = new TextObject({
  canvas: tui.canvas,
  zIndex: 101,
  style: new Computed(() => makeStyle({ fg: palette.dim, bg: palette.panel })),
  overwriteRectangle: true,
  rectangle: new Computed<TextRectangle>(() => ({ column: 1, row: 3, width: Math.max(0, bounds.value.width - 2) })),
  value: new Computed(() => {
    const selected = selectedDemo.value;
    const mode = terminalGlyphStyleLabel(ascii.value.terminalGlyphStyle).toUpperCase();
    const engine = threeAsciiAvailable.value ? "ACEROLA WEBGPU READY" : "TEXT FALLBACK ACTIVE";
    return fitPad(
      `${selected?.badge ?? "NONE"} / ${
        selected?.title.toUpperCase() ?? "NO SELECTION"
      } / ${engine} / STYLE ${mode} / VOL ${volume.value}%`,
      Math.max(0, bounds.value.width - 2),
    );
  }),
});

const deckPanel = new PanelView({
  canvas: tui.canvas,
  rectangle: new Computed(() => deckRect()),
  title: new Computed(() => `${sourceLabels[source.value]} DEMO DECK`),
  alert: new Computed(() => formatNeonSuiteAlert(summary.value, 14)),
  body: new Computed(() => deckBody()),
  footer: new Computed(() => selectedDemo.value?.subtitle ?? ""),
  backgroundStyle: new Signal(makeStyle({ bg: palette.panel })),
  frameStyle: new Computed(() =>
    makeStyle({ fg: accentColor(selectedDemo.value?.accent ?? "signal"), bg: palette.panel })
  ),
  titleStyle: new Computed(() =>
    makeStyle({
      fg: titleInk(selectedDemo.value?.accent ?? "signal"),
      bg: accentColor(selectedDemo.value?.accent ?? "signal"),
      bold: true,
    })
  ),
  alertStyle: new Signal(makeStyle({ fg: palette.void, bg: palette.amber, bold: true })),
  bodyStyle: new Signal(makeStyle({ fg: palette.paper, bg: palette.panel })),
  footerStyle: new Signal(makeStyle({ fg: palette.dim, bg: palette.panel })),
  borderMode: new Signal<BorderMode>("sharp"),
  zIndex: 10,
});

for (let index = 0; index < 25; index += 1) {
  const demo = new Computed(() => visibleDemos.value[index] ?? null);
  const rect = new Computed(() => cardRect(index));
  const selected = new Computed(() => selectedIndex.value === index && !!demo.value);
  const render = new Computed(() => {
    const current = demo.value;
    if (!current || rect.value.width <= 0 || rect.value.height <= 0) return emptyNeonSuiteRender();
    return renderCard(current, rect.value, selected.value);
  });

  const panel = new PanelView({
    canvas: tui.canvas,
    rectangle: rect,
    title: new Computed(() => {
      const current = demo.value;
      if (!current) return "";
      const prefix = selected.value ? "SELECTED" : current.section.toUpperCase();
      return `${prefix} / ${current.code} / ${current.title}`.toUpperCase();
    }),
    alert: new Computed(() => render.value.alert),
    body: new Computed(() => render.value.body),
    bodyPadToWidth: new Computed(() => !(render.value.three && selected.value && threeAsciiAvailable.value)),
    footer: new Computed(() => render.value.footer),
    ...createNeonPanelStyles(render, selected),
    borderMode: new Computed<BorderMode>(() => selected.value ? "sharp" : "rounded"),
    zIndex: 10,
  });

  new ThreePanelView({
    canvas: tui.canvas,
    rectangle: panel.bodyRect,
    scene: new Computed(() => selected.value ? render.value.three ?? null : null),
    ascii,
    enabled: threeAsciiAvailable,
    zIndex: 20,
    frameInterval: 1000 / 12,
  });

  panel.draw();
}

for (const object of [headerBackground, headerTitle, headerTabs, headerControls, headerStatus]) {
  object.draw();
}
deckPanel.draw();

tui.on("keyPress", (event) => {
  if (event.ctrl && event.key === "c") return;

  switch (event.key) {
    case "q":
      tui.emit("destroy");
      return;
    case "escape":
    case "t":
      maximized.value = false;
      return;
    case "return":
    case "f":
      maximized.value = !maximized.value;
      playCue();
      return;
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
      setSection(neonSuiteSections[Number(event.key) - 1] ?? "all");
      return;
    case "o":
      setSource("opentui");
      return;
    case "w":
      setSource("web");
      return;
    case "e":
      setSource("extended");
      return;
    case "b":
      setAsciiStyle("blocks");
      return;
    case "g":
      setAsciiStyle("glyphs");
      return;
    case "m":
      setAsciiStyle("mixed");
      return;
    case "+":
    case "=":
      volume.value = clampVolume(volume.peek() + 5);
      return;
    case "-":
    case "_":
      volume.value = clampVolume(volume.peek() - 5);
      return;
    case "left":
    case "right":
    case "up":
    case "down":
      moveSelectionForKey(event.key);
      return;
  }
});

tui.on("destroy", () => {
  clearInterval(timer);
});

tui.run();

function initialSection(args: readonly string[]): NeonSuiteSection {
  const value = args.find((arg) => arg.startsWith("--section="))?.slice("--section=".length);
  return neonSuiteSections.includes(value as NeonSuiteSection) ? value as NeonSuiteSection : "all";
}

function setSource(next: NeonSuiteSource) {
  if (source.peek() === next) return;
  source.value = next;
  selectedIndex.value = Math.max(0, demoIndex(selectedDemo.peek()?.id ?? "", section.peek(), next));
  maximized.value = false;
}

function setSection(next: NeonSuiteSection) {
  if (section.peek() === next) return;
  const currentId = selectedDemo.peek()?.id ?? "";
  section.value = next;
  selectedIndex.value = Math.max(0, demoIndex(currentId, next, source.peek()));
  maximized.value = false;
}

function setAsciiStyle(style: AsciiOptions["terminalGlyphStyle"]) {
  ascii.value = { ...ascii.peek(), terminalGlyphStyle: style, preset: "custom" };
}

function moveSelectionForKey(key: string) {
  const visible = visibleDemos.peek();
  if (visible.length === 0) {
    selectedIndex.value = 0;
    return;
  }

  if (maximized.peek()) {
    const direction: -1 | 1 = key === "left" || key === "up" ? -1 : 1;
    const nextId = cycleDemo(section.peek(), selectedDemo.peek()?.id ?? "", direction, source.peek());
    selectedIndex.value = Math.max(0, demoIndex(nextId, section.peek(), source.peek()));
    return;
  }

  selectedIndex.value = moveGridSelection(
    selectedIndex.peek(),
    key,
    gridColumns(),
    visible.length,
  );
}

function gridColumns() {
  return gridPage().grid.columns;
}

function deckRect(): Rect {
  if (maximized.value || bounds.value.height < 14) return hiddenRect();
  return {
    column: 1,
    row: 5,
    width: Math.max(0, bounds.value.width - 2),
    height: compact.value ? 5 : 6,
  };
}

function contentRect(): Rect {
  const top = maximized.peek() || bounds.peek().height < 14 ? 5 : compact.peek() ? 11 : 12;
  return {
    column: 1,
    row: top,
    width: Math.max(0, bounds.peek().width - 2),
    height: Math.max(0, bounds.peek().height - top - 1),
  };
}

function cardRect(index: number): Rect {
  const current = visibleDemos.value[index];
  if (!current) return hiddenRect();

  const area = contentRect();
  if (maximized.value) {
    return selectedIndex.value === index ? area : hiddenRect();
  }

  const page = gridPage();
  const pageStart = page.pageStart;
  const local = index - pageStart;
  if (local < 0 || local >= page.grid.pageSize) return hiddenRect();

  return adaptiveGridItemRect(area, page.grid, local);
}

function renderCard(demo: NeonDemo, rect: Rect, selected: boolean): PanelRender {
  return renderNeonSuiteDemo({
    demo,
    phase: phase.value,
    selected,
    ascii: ascii.value,
    width: Math.max(8, rect.width - 2),
    height: Math.max(4, rect.height - 4),
    renderMode: maximized.value ? "max" : section.value === "all" ? "dense" : "card",
  });
}

function deckBody() {
  const counts = summary.value.sections;
  const selected = selectedDemo.value;
  const lines = [
    `SELECTED ${selected?.title.toUpperCase() ?? "NONE"} / VIEW ${neonSuiteSectionLabels[section.value]} / SOURCE ${
      sourceLabels[source.value]
    }`,
    `OVERVIEW ${counts.overview}  SIGNALS ${counts.signals}  CONTROL ${counts.control}  THREE ${counts.three}`,
    `OPEN TUI PARITY: ${neonSuiteSummary("opentui").count} DEMOS  /  WEB ORDERING: ${
      neonSuiteSummary("web").count
    } DEMOS  /  EXTENDED: ${neonSuiteSummary("extended").count} DEMOS`,
  ];
  return lines.join("\n");
}

function gridPage() {
  const area = contentRect();
  return adaptiveGridPage(area, selectedIndex.peek(), {
    itemCount: visibleDemos.peek().length,
    minColumnWidth: minCardWidth(area.width, section.peek()),
    minRowHeight: neonSceneHeight(area.width, area.height, section.peek()) + 5,
    maxColumns: neonColumnsForWidth(area.width, section.peek()),
    gap: 1,
  });
}

function minCardWidth(width: number, currentSection: NeonSuiteSection) {
  if (currentSection === "three") return 48;
  if (currentSection === "all") return width >= 176 ? 56 : 38;
  return width >= 116 ? 56 : 38;
}

function neonColumnsForWidth(width: number, currentSection: NeonSuiteSection): number {
  if (currentSection === "all") return width >= 236 ? 4 : width >= 176 ? 3 : width >= 112 ? 2 : 1;
  if (currentSection === "three") return width >= 150 ? 3 : width >= 100 ? 2 : 1;
  return width >= 176 ? 3 : width >= 116 ? 2 : 1;
}

function neonSceneHeight(width: number, height: number, currentSection: NeonSuiteSection): number {
  if (currentSection === "all") return width >= 236 ? 6 : width >= 176 ? 7 : height < 42 ? 6 : 8;
  if (currentSection === "three") return height < 40 ? 8 : 10;
  return height < 40 ? 6 : 8;
}

function fitPad(text: string, width: number) {
  return fitText(text, width).padEnd(Math.max(0, width), " ");
}

function clampVolume(value: number) {
  return Math.max(0, Math.min(100, value));
}

function playCue() {
  if (volume.peek() <= 0) return;
  runtimeHost.stdout.writeSync(new Uint8Array([7]));
}
