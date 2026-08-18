import {
  appendBoundedWorkbenchLogRow,
  BoxObject,
  clampWorkbenchTileDensity,
  Computed,
  type ComputedLayoutBox,
  contrastText,
  createAnsiStyle,
  createFileExplorerTree,
  createRuntimeStore,
  createTerminalWorkspaceController,
  createWebTui,
  DataTableController,
  FileExplorerController,
  fitCellText,
  formatWorkbenchDiagnosticStatus,
  hydrateWorkbenchPanelWorkspaceStore,
  initialWorkbenchDiagnosticLogRows,
  layoutWorkbenchTitlebar,
  loadWorkbenchPanelWorkspaceCache,
  maxTextWidth,
  MenuBarController,
  normalizeTerminalWorkspaceSnapshot,
  normalizeTiledWorkspaceSnapshot,
  normalizeWorkbenchPanelWorkspaceState,
  parseHexColor,
  persistWorkbenchPanelWorkspaceState,
  prepareWorkbenchRows,
  resolveWorkbenchScreenDropdownKey,
  ScrollAreaController,
  scrollbarGlyph,
  scrollbarOffsetForPointer,
  Signal,
  snapshotTerminalWorkspace,
  subscribeWorkbenchDiagnosticLog,
  TerminalScreenController,
  TerminalScrollbackController,
  type TerminalWorkspaceSnapshot,
  TextObject,
  type TextRectangle,
  TiledWorkspaceController,
  type TiledWorkspaceDockEdge,
  type TiledWorkspaceLayoutInspection,
  type TiledWorkspaceSeparatorAxis,
  type TiledWorkspaceSnapshot,
  type TiledWorkspaceWindow,
  updateWorkbenchStringLineSignals,
  type WorkbenchButtonTone,
  type WorkbenchDropdownOverlayRenderCommand,
  workbenchEmptyWorkspaceMessage,
  type WorkbenchFrameBoxLine,
  type WorkbenchHeaderLayout,
  type WorkbenchMenuBarHitLayout,
  type WorkbenchPanelWorkspaceState,
  type WorkbenchScrollbarRenderCommand,
  workbenchTerminalCopyRowsInto,
  type WorkbenchTerminalPaneProjection,
  workbenchTerminalPaneProjectionsInto,
  type WorkbenchTerminalPaneTitleRenderCommand,
  workbenchTerminalPaneTitleRenderCommandsInto,
  workbenchTerminalProtocolHeaderRowsInto,
  type WorkbenchTerminalToolbarAction,
  workbenchTerminalToolbarStateFromSnapshot,
  type WorkbenchTopMenuVisibleSlice,
  workbenchVisibleWindowRectsInto,
  workbenchWorkspaceScrollbarRenderCommandsInto,
  WorkbenchWorkspaceViewportController,
  writeStringFrameRow,
} from "../../mod.web.ts";
import { type HitTarget, HitTargetStack, translateHitTargets } from "../../app/api_workbench_hit_targets.ts";
import {
  WorkbenchButtonRowBufferCache,
  WorkbenchModalBufferCache,
  WorkbenchShelfBufferCache,
  WorkbenchTerminalBufferCache,
  WorkbenchTerminalSessionTabBufferCache,
  WorkbenchTitlebarBufferCache,
} from "../../src/app/workbench_buffers.ts";
import {
  apiWorkbenchColumns,
  apiWorkbenchLiveRowsInto,
  apiWorkbenchPanelTitle,
  type ApiWorkbenchProcessRow,
  apiWorkbenchRows,
  apiWorkbenchShortPanelTitle,
  type ApiWorkbenchThemeSpec,
  createApiWorkbenchThemes,
  nextApiWorkbenchTerminalSessionDraft,
} from "../../app/api_workbench_catalog.ts";
import {
  type ApiWorkbenchControlId,
  ApiWorkbenchControlsModel,
  findApiWorkbenchHitTarget,
  isApiWorkbenchTextControlActive,
  isApiWorkbenchTouchOptimizedLayout,
  nextSortableDataColumn,
  resolveApiWorkbenchTitlebarHitAction,
} from "../../app/api_workbench_controls.ts";
import { renderApiWorkbenchHtmlCssLayout } from "../../app/html_css_layout_view.ts";
import {
  type ApiWorkbenchDropdownOverlay,
  renderApiWorkbenchButtonRow,
  renderApiWorkbenchChromeHeader,
  renderApiWorkbenchDropdownOverlay,
  renderApiWorkbenchModalOverlay,
  renderApiWorkbenchShelf,
  renderApiWorkbenchStatus,
  renderApiWorkbenchTerminalSessionTabs,
  renderApiWorkbenchTerminalShellToolbar,
  renderApiWorkbenchThreeConfigModal,
  renderApiWorkbenchWindowTabs,
  renderApiWorkbenchWindowTitlebar,
} from "../../app/api_workbench_window_view.ts";
import type { HtmlCssLayoutRenderCommand } from "../../app/html_css_layout_view.ts";
import {
  ApiWorkbenchControlsViewBufferCache,
  renderApiWorkbenchControls,
  renderApiWorkbenchDataPanel,
  renderApiWorkbenchExplorerPanel,
  renderApiWorkbenchInspectorPanel,
  workbenchDemoModalContent,
  workbenchHelpModalContent,
  workbenchLogRowsFromSourcesInto,
  workbenchModalConfirmedContent,
  workbenchModalDetailsContent,
  workbenchQuitModalContent,
} from "../../app/workbench_panels.ts";
import {
  type WorkbenchFrameRenderCommand,
  workbenchFrameRenderCommandsInto,
} from "../../src/app/workbench_frame_render.ts";
import { WorkbenchFramePainter } from "../../src/app/workbench_row_render.ts";
import type { RowStyle } from "../../src/app/workbench_rows.ts";
import {
  type WorkbenchMobileCommandAction,
  workbenchMobileCommandStripItemsInto,
} from "../../src/app/workbench_control_layout.ts";
import {
  defaultWebTerminalWorkspaceSnapshot,
  normalizeWebTerminalWorkspaceSnapshot as normalizeWebTerminalWorkspaceSnapshotSource,
} from "./api_workbench_terminal_workspace.ts";
import {
  createDefaultWorkbenchAsciiOptions,
  defaultWorkbenchAsciiConfigRows,
  formatWorkbenchAsciiConfigRowText,
  WorkbenchAsciiConfigController,
  type WorkbenchAsciiConfigRow,
} from "../../src/app/workbench_ascii.ts";
import {
  type WorkbenchAsciiConfigModalAction,
  WorkbenchAsciiConfigModalBufferCache,
} from "../../src/app/workbench_ascii_modal.ts";
import {
  applyWorkbenchWindowSignalState,
  inspectWorkbenchWindowSignalState,
  WorkbenchController,
} from "../../src/app/workbench/controller.ts";
import { DiagnosticsCollector } from "../../src/runtime/diagnostics.ts";
import { StorageFallbackDiagnostics } from "../../src/runtime/storage_diagnostics.ts";
import { asciiDemoPresetIds } from "../../src/three_ascii/demo_presets.ts";
import {
  asciiPresetLabel,
  cloneAsciiOptions,
  normalizeAsciiOptions,
  terminalGlyphStyleLabel,
  type ThreeAsciiConfigOptions,
} from "../../src/three_ascii/options.ts";
import type { Rectangle } from "../../src/types.ts";
import { makeStyle } from "../../app/styles.ts";

type PanelId = "explorer" | "inspector" | "data" | "controls" | "logs" | "three" | "htmlLayout" | "terminal";
type ControlId = ApiWorkbenchControlId;
type Hit =
  | { type: "menu"; index: number }
  | { type: "mobileAction"; action: MobileAction }
  | { type: "quit" }
  | { type: "focus"; id: PanelId }
  | { type: "minimize"; id: PanelId }
  | { type: "maximize"; id: PanelId }
  | { type: "restore"; id?: PanelId }
  | { type: "close"; id: PanelId }
  | { type: "threeConfig"; id: PanelId }
  | { type: "asciiConfig"; index: number; action?: ConfigHitAction }
  | { type: "asciiConfigAction"; action: WorkbenchAsciiConfigModalAction }
  | { type: "asciiConfigBackdrop" }
  | { type: "theme"; index: number }
  | { type: "modalAction"; index: number }
  | { type: "control"; id: ControlId; action?: ControlHitAction; index?: number }
  | { type: "dataRow"; index: number }
  | { type: "explorerRow"; index: number }
  | { type: "logScrollbar" }
  | { type: "layout"; index: number }
  | { type: "layoutSeparator"; splitId: string; axis: TiledWorkspaceSeparatorAxis }
  | { type: "windowTitlebar"; id: PanelId }
  | { type: "terminalAction"; action: WebTerminalAction }
  | { type: "terminalPane"; id: string }
  | { type: "terminalContent"; sessionId?: string; paneId?: string }
  | { type: "terminalSession"; id: string }
  | { type: "workspaceScrollbar" };
type ControlHitAction = "previous" | "next" | "activate" | "set" | "focus" | "toggle";
type ConfigHitAction = "previous" | "next" | "activate";
type ButtonTone = WorkbenchButtonTone;
type MobileAction = WorkbenchMobileCommandAction;
type WebTerminalAction = WorkbenchTerminalToolbarAction;
type AsciiOptions = ThreeAsciiConfigOptions;
type AsciiConfigRow = WorkbenchAsciiConfigRow;
type WebPanelWindowState = "normal" | "minimized" | "closed";

type ThemeSpec = ApiWorkbenchThemeSpec;

const THEME_STORAGE_KEY = "deno-tui.web-workbench.theme";
const WORKSPACE_STORAGE_KEY = "deno-tui.web-workbench.workspace";

const LAYOUT_MENU_LABELS = [
  "Toggle layout mode (F6)",
  "Focus previous pane",
  "Focus next pane",
  "Move pane earlier",
  "Move pane later",
  "Grow pane width",
  "Shrink pane width",
  "Grow pane height",
  "Shrink pane height",
  "Reset tiled layout",
] as const;

type Row = ApiWorkbenchProcessRow;

const root = document.querySelector<HTMLElement>("#api-workbench");
if (!root) throw new Error("Missing #api-workbench mount element.");
const mount = root;

const host = createWebTui({
  root: mount,
  refreshRate: 1000 / 30,
  sinkOptions: {
    cellWidth: 9,
    cellHeight: 16,
    foreground: "#eff7ff",
    background: "#05070d",
    font: "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
});

const themes: ThemeSpec[] = createApiWorkbenchThemes();
const themeLabels = themes.map((entry) => entry.label);
const themeMenuWidth = Math.max(22, maxTextWidth(themeLabels) + 6);
const layoutMenuWidth = Math.max(34, maxTextWidth(LAYOUT_MENU_LABELS) + 6);
const rows: Row[] = apiWorkbenchRows;
const liveRowsBuffer: Row[] = [];
const columns = apiWorkbenchColumns;
const ASCII_DEMO_PRESET_IDS = asciiDemoPresetIds();
const asciiConfigRows: readonly AsciiConfigRow[] = defaultWorkbenchAsciiConfigRows;
const panelIds: readonly PanelId[] = [
  "explorer",
  "inspector",
  "data",
  "controls",
  "logs",
  "three",
  "htmlLayout",
  "terminal",
];

function createWebPanelWindow(id: PanelId, order: number) {
  return { id, title: apiWorkbenchPanelTitle(id), order, minWidth: 26, minHeight: 10 };
}

const explorerKeys = new Set(["up", "down", "left", "right", "pageup", "pagedown", "home", "end", "space", "return"]);

const webWorkspaceStore = createRuntimeStore<WebWorkspaceState>({
  databaseName: "deno-tui-web-workbench",
  storeName: "workspace",
  scope: globalThis,
});
const webDiagnostics = new DiagnosticsCollector(80);
const storageDiagnostics = new StorageFallbackDiagnostics(webDiagnostics);
const initialWorkspace = loadCachedWebWorkspaceState();
const themeIndex = new Signal(initialThemeIndex());
const workbenchController = new WorkbenchController<"theme" | "layout">({
  activeId: initialWorkspace.active ?? "three",
  fullscreenId: initialWorkspace.maximized,
  windows: panelIds.map((id, order) => ({
    ...createWebPanelWindow(id, order),
    state: initialWebPanelWindowState(initialWorkspace, id),
  })),
});
const topMenus = workbenchController.menus;
const webWindows = workbenchController.windows;
const tileDensity = new Signal(Math.max(-3, Math.min(3, Math.floor(initialWorkspace.tileDensity ?? 0))));
const tiledWorkspace = new TiledWorkspaceController({
  windows: tiledWindowInventory(),
  layout: initialWorkspace.tiledLayout?.layout,
  gap: initialWorkspace.tiledLayout?.gap ?? workbenchTiledGap(),
  activeWindowId: initialWorkspace.active ?? "three",
});
const layoutMode = new Signal(false);
const asciiConfigs = new WorkbenchAsciiConfigController<PanelId>(
  "three",
  normalizeAsciiOptions(initialWorkspace.ascii, createDefaultWorkbenchAsciiOptions()),
);
const ascii = asciiConfigs.root;
const threeConfigOpen = asciiConfigs.editorOpen;
const threeConfigSelected = asciiConfigs.editorSelectedIndex;
const lineSignals: Signal<string>[] = [];
const log = new Signal<string[]>(
  initialWorkbenchDiagnosticLogRows(webDiagnostics, ["ready: web api workbench mounted"], { maxLogEntries: 40 }),
  { deepObserve: true },
);
subscribeWorkbenchDiagnosticLog(webDiagnostics, push);
const webTerminalWorkspace = createTerminalWorkspaceController({
  ...(initialWorkspace.terminal ?? defaultWebTerminalWorkspaceSnapshot()),
});
webTerminalWorkspace.activeId.subscribe(persistWebWorkspaceState);
webTerminalWorkspace.sessions.subscribe(persistWebWorkspaceState);
webTerminalWorkspace.layout.subscribe(persistWebWorkspaceState);
const webTerminalScreens = new Map<string, TerminalScreenController>();
const webTerminalScrollbacks = new Map<string, TerminalScrollbackController>();
const webTerminalScreenKeys = new Map<string, string>();
const webTerminalBuffers = new WorkbenchTerminalBufferCache();
const hitTargets = new HitTargetStack<Hit>();
const titlebarBuffers = new WorkbenchTitlebarBufferCache<PanelId>();
const screenRows: string[] = [];
const workspaceVirtualRows: string[] = [];
const threePreviewRows: string[] = [];
const threePreviewOrbRows: string[] = [];
const dataTableTextRows: string[] = [];
const dataTableBodyRows: RowStyle[] = [];
const dataTableRenderRows: RowStyle[] = [];
const explorerRenderRows: RowStyle[] = [];
const inspectorRenderRows: RowStyle[] = [];
const inspectorActionTextRows: string[] = [];
const inspectorWrappedTextRows: string[] = [];
const logRenderRows: RowStyle[] = [];
const htmlCssLayoutBoxes: ComputedLayoutBox[] = [];
const htmlCssLayoutRenderCommands: HtmlCssLayoutRenderCommand[] = [];
const shelfBuffers = new WorkbenchShelfBufferCache<PanelId>();
const menuBarHitLayouts: WorkbenchMenuBarHitLayout[] = [];
const headerLayout: WorkbenchHeaderLayout = { menu: { column: 0, row: 0, width: 0, height: 1 } };
const windowFrameBoxLines: WorkbenchFrameBoxLine[] = [];
const windowFrameRenderCommands: WorkbenchFrameRenderCommand[] = [];
const framePainter = new WorkbenchFramePainter<string[], ThemeSpec>({
  width: () => cols(),
  theme,
  style: makeStyle,
  contrastText,
  fit,
  write: writeStringFrameRow,
});
const workspaceScrollbarRenderCommands: WorkbenchScrollbarRenderCommand[] = [];
const visiblePanelRects = new Map<PanelId, Rectangle>();
const webTerminalActions: readonly WebTerminalAction[] = [
  "new",
  "previous",
  "next",
  "close",
  "splitRow",
  "splitColumn",
  "zoomPane",
  "closePane",
  "restart",
  "search",
  "previousMatch",
  "nextMatch",
];
const webTerminalButtonBuffers = new WorkbenchButtonRowBufferCache<WebTerminalAction>();
const asciiConfigBuffers = new WorkbenchAsciiConfigModalBufferCache<AsciiConfigRow>();
const mobileCommandButtonBuffers = new WorkbenchButtonRowBufferCache<MobileAction>();
const webTerminalSessionTabBuffers = new WorkbenchTerminalSessionTabBufferCache();
const webTerminalHeaderRows: string[] = [];
const controlViewBuffers = new ApiWorkbenchControlsViewBufferCache();
const webControlViewOverrides = {
  combo: {
    title: "Theme combo",
    expandedGlyph: "v",
    collapsedGlyph: ">",
    previous: true,
    next: true,
  },
  dropdown: { expandedGlyph: "v", collapsedGlyph: ">" },
  input: { cursorGlyph: "|" },
  textbox: { renderOptions: { cursorGlyph: "|", continuationGlyph: ">" } },
} as const;
const modalBuffers = new WorkbenchModalBufferCache<number>();
const dropdownOverlayRenderCommands: WorkbenchDropdownOverlayRenderCommand[] = [];
const themeMenuSlice: WorkbenchTopMenuVisibleSlice = { items: [], indexes: [] };
const layoutMenuSlice: WorkbenchTopMenuVisibleSlice = { items: [], indexes: [] };
const layoutMenuLabelBuffer: string[] = [];
let dropdownOverlay: ApiWorkbenchDropdownOverlay | null = null;
let pointerDrag: {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  workspaceRows: number;
  logRows: number;
  target?: HitTarget<Hit>;
  moved: boolean;
  layout?:
    | { kind: "separator"; splitId: string; axis: TiledWorkspaceSeparatorAxis }
    | { kind: "window"; sourceId: PanelId };
} | null = null;
let tiledLayoutProjection: TiledWorkspaceLayoutInspection | null = null;
let workspaceScreenBounds: Rectangle = { column: 0, row: 1, width: 1, height: 1 };
let workspaceOffsetRows = 0;
let applyingWebWorkspaceState = false;
let lastSemanticLabel = "";

themeIndex.subscribe((index) => persistThemeIndex(index));
webWindows.activeId.subscribe(persistWebWorkspaceState);
webWindows.fullscreenId.subscribe(persistWebWorkspaceState);
webWindows.windows.subscribe(persistWebWorkspaceState);
tileDensity.subscribe(persistWebWorkspaceState);
ascii.subscribe(persistWebWorkspaceState);
void hydrateWebWorkspaceState();

const menu = new MenuBarController({
  items: ["Layout", "Theme", "Help"].map((label) => ({ id: label.toLowerCase(), label })),
  onSelect: (item) => {
    if (item.id === "layout") {
      topMenus.toggle("layout");
      push(`${topMenus.isOpen("layout") ? "open" : "close"} layout menu`);
      return;
    }
    if (item.id === "theme") {
      topMenus.toggle("theme");
      push(`${topMenus.isOpen("theme") ? "open" : "close"} theme menu`);
      return;
    }
    topMenus.close(false);
    if (item.id === "help") {
      openHelpModal();
      return;
    }
    push(`menu ${item.label}`);
  },
});
const workspaceScroll = new ScrollAreaController({ showScrollbar: true });
const workspaceViewport = new WorkbenchWorkspaceViewportController<PanelId>({ scroll: workspaceScroll });
const logScroll = new ScrollAreaController({ showScrollbar: true });
const controlsModel = new ApiWorkbenchControlsModel({
  themeLabels,
  commandText: "deno task web:demo:check",
  commandPlaceholder: "command",
  notesText: "Browser notes\nsame controllers, same wrapped multiline text area, same keyboard editing.",
  modalBody: [
    "The web workbench uses the same ModalController shape as the terminal app.",
    "Use Tab or arrows to move actions, Enter to activate, Escape to close.",
  ],
  pushLog: push,
  openModal: openWorkbenchModal,
  applyModalAction,
  setTheme,
  onDropdownSelect: (item) => push(`dropdown ${item}`),
});
const { density: slider, livePreview: live, modal, activeControl } = controlsModel;
const explorer = new FileExplorerController({
  root: createFileExplorerTree([
    "/README.md",
    "/mod.web.ts",
    "/examples/web/api_workbench_page.ts",
    "/examples/web/neon_exodus_page.ts",
    "/examples/web/three_ascii_page.ts",
    "/src/markup/demo_fixtures.ts",
    "/src/web/host.ts",
    "/src/web/platform.ts",
    "/src/web/remote_terminal.ts",
    "/src/markup/css.ts",
    "/src/markup/html.ts",
    "/src/layout/solvers/simple.ts",
    "/src/layout/solvers/yoga.ts",
    "/src/components/modal.ts",
    "/src/components/file_explorer.ts",
    "/src/layout/responsive.ts",
    "/tests/web_runtime.test.ts",
  ]),
  onOpen: (entry) => push(`open ${entry.path}`),
});
const table = new DataTableController<Row>({
  rows,
  columns,
  rowKey: (row) => row.id,
  initialState: { pageSize: 4, sort: { columnId: "latency", direction: "asc" } },
});

new BoxObject({
  canvas: host.canvas,
  rectangle: new Computed(() => ({ column: 0, row: 0, width: cols(), height: rowsCount() })),
  filler: " ",
  style: new Computed(() => createAnsiStyle({ background: parseHexColor(theme().background) ?? [0, 0, 0] })),
  zIndex: -2,
}).draw();

ensureLines();
host.platform.size.subscribe(() => {
  ensureLines();
  draw();
});

host.on("keyPress", (event) => {
  const key = event.key.toLowerCase();
  if (threeConfigOpen.peek()) {
    handleThreeConfigKey(event);
    draw();
    return;
  }
  if (modal.openState.peek()) {
    modal.handleKeyPress(event);
    draw();
    return;
  }
  if (key === "f6") {
    toggleLayoutMode();
    draw();
    return;
  }
  if (topMenus.inspect().openId) {
    handleWorkbenchTopMenuKey(event);
    draw();
    return;
  }
  if (isTextControlActive() && (key === "escape" || key === "tab")) {
    blurTextControl();
    draw();
    return;
  }
  if (isTextControlActive()) {
    handleControlsKey(event);
    draw();
    return;
  }
  if (layoutMode.peek()) {
    handleLayoutModeKey(event);
    draw();
    return;
  }
  if (key === "tab" && activePanel() === "controls") focusNextControl(event.shift ? -1 : 1);
  else if (key === "tab") event.shift ? focusPrevious() : focusNext();
  else if (focusPanelByNumber(key)) return draw();
  else if (key === "h" || key === "?") openHelpModal();
  else if (key === "q") openQuitModal();
  else if (key === "m") minimize(activePanel());
  else if (key === "f" || key === "return") toggleMax(activePanel());
  else if (key === "r" || key === "escape") restore();
  else if (key === "t") toggleThemeMenu();
  else if (key === "[") adjustTileDensity(-1);
  else if (key === "]") adjustTileDensity(1);
  else if (activePanel() === "controls") handleControlsKey(event);
  else if (activePanel() === "explorer" && explorerKeys.has(key)) {
    explorer.handleKeyPress(event, Math.max(1, rowsCount() - 8));
  } else if (activePanel() === "data" && key.toLowerCase() === "s") {
    cycleDataSortColumn(event.shift ? -1 : 1);
  } else if (activePanel() === "data") table.handleKeyPress(event as never);
  else if (key === "+" || key === "=") slider.increment();
  else if (key === "-") slider.decrement();
  else if (key === "space") live.toggle();
  else if (key === "left" || key === "right") {
    menu.handleKeyPress({ key, ctrl: false, meta: false, shift: false });
  }
  draw();
});

host.on("mousePress", (event) => {
  if (event.release) {
    const drag = pointerDrag;
    pointerDrag = null;
    if (drag?.layout?.kind === "window" && drag.moved) {
      finishWindowDock(drag.layout.sourceId, event.x, event.y);
    } else if (drag?.layout?.kind === "separator" && drag.moved) {
      persistWebWorkspaceState();
    }
    draw();
    return;
  }
  const target = findHit(event.x, event.y);
  if (handlePointerDrag(event, target)) {
    draw();
    return;
  }
  if (!pointerDrag) {
    pointerDrag = {
      x: event.x,
      y: event.y,
      lastX: event.x,
      lastY: event.y,
      workspaceRows: workspaceScroll.offset.peek().rows,
      logRows: logScroll.offset.peek().rows,
      target,
      moved: false,
      layout: target?.action.type === "layoutSeparator"
        ? {
          kind: "separator",
          splitId: target.action.splitId,
          axis: target.action.axis,
        }
        : target?.action.type === "windowTitlebar" && !fullscreenPanel()
        ? { kind: "window", sourceId: target.action.id }
        : undefined,
    };
  }
  if (target?.action.type === "windowTitlebar") {
    focus(target.action.id);
    draw();
    return;
  }
  if (target?.action.type === "layoutSeparator") {
    draw();
    return;
  }
  if (target) applyHit(target, event.x, event.y);
  draw();
});

host.on("mouseScroll", (event) => {
  const target = findHit(event.x, event.y);
  if (target?.action.type === "terminalContent" && handleWebTerminalScroll(target.action, event.scroll)) {
    draw();
    return;
  }
  if (activePanel() === "logs") logScroll.scrollBy(0, event.scroll);
  else workspaceScroll.scrollBy(0, event.scroll);
  draw();
});

host.start();
draw();
const timer = setInterval(() => {
  if (live.checked.peek()) {
    table.rows.value = apiWorkbenchLiveRowsInto(liveRowsBuffer, rows, slider.value.peek(), 18);
    draw();
  }
}, 650);
globalThis.addEventListener("beforeunload", () => {
  persistWebWorkspaceState();
  clearInterval(timer);
  workspaceScroll.dispose();
  logScroll.dispose();
  controlsModel.dispose();
  explorer.dispose();
  workbenchController.dispose();
  tileDensity.dispose();
  tiledWorkspace.dispose();
  layoutMode.dispose();
  asciiConfigs.dispose();
  host.destroy();
});

function draw(): void {
  hitTargets.clear();
  dropdownOverlay = null;
  const width = cols();
  const height = rowsCount();
  const frame = prepareWorkbenchRows(
    screenRows,
    height,
    () => "",
    () => paint(" ".repeat(width), theme().text, theme().background),
  );
  const currentTheme = theme();
  const openMenuId = topMenus.inspect().openId;
  dropdownOverlay = renderApiWorkbenchChromeHeader<string[]>({
    frame,
    width,
    menuItems: menu.items.peek(),
    menuActiveIndex: menu.activeIndex.peek(),
    openMenuId,
    dropdownEntries: {
      layout: {
        visible: layoutMenuSlice,
        labels: layoutMenuLabels(),
        selectedIndex: workbenchController.menuIndex("layout"),
        preferredWidth: layoutMenuWidth,
      },
      theme: {
        visible: themeMenuSlice,
        labels: themeLabels,
        selectedIndex: themeIndex.peek(),
        preferredWidth: themeMenuWidth,
      },
    },
    titleColumn: 1,
    closeMinWidth: 22,
    reserveCloseWhenHidden: true,
    showHelp: false,
    headerLayout,
    menuHitLayouts: menuBarHitLayouts,
    theme: currentTheme,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    fillRow: (target, row, bg) => write(target, row, 0, paint(" ".repeat(width), currentTheme.text, bg)),
    writeButton,
    addHit: (rect, action) => hitTargets.add(rect, action),
  });
  renderMobileCommandStrip(frame);
  const fullscreen = fullscreenPanel();
  const showMobileStrip = shouldRenderMobileCommandStrip();
  const showWindowStrip = fullscreen !== null || webWindows.inspect().windows.some((entry) => entry.minimized);
  const bodyRow = showMobileStrip ? 3 : 1;
  const bottomChromeRows = 1 + (showWindowStrip ? 1 : 0);
  const body = {
    column: 1,
    row: bodyRow,
    width: Math.max(10, width - 2),
    height: Math.max(1, height - bodyRow - bottomChromeRows),
  };
  workspaceScreenBounds = { ...body };
  const layout = workspaceLayout({
    column: 0,
    row: 0,
    width: Math.max(1, body.width - 1),
    height: body.height,
  });
  const offset = workspaceViewport.update({ layout, viewportHeight: body.height, activeId: activePanel() });
  workspaceOffsetRows = offset;
  const virtual = prepareWorkbenchRows(
    workspaceVirtualRows,
    Math.max(body.height, layout.contentHeight),
    () => "",
    () => paint(" ".repeat(layout.bounds.width), theme().text, theme().backgroundSoft),
  );
  fillRect(virtual, layout.bounds, theme().backgroundSoft);
  const hitStart = hitTargets.length;
  if (fullscreen) {
    renderPanel(virtual, fullscreen, layout.bounds);
  } else {
    if (layout.rects.size === 0) {
      write(
        virtual,
        1,
        2,
        paint(
          workbenchEmptyWorkspaceMessage({
            windows: webWindows.inspect().windows,
            labels: { minimized: "All panels minimized. Press R or click restore." },
          }),
        ),
      );
      hitTargets.add({ ...layout.bounds, row: 0 }, { type: "restore" });
    } else {
      const visibleRects = workbenchVisibleWindowRectsInto(visiblePanelRects, layout.rects, {
        viewport: { column: layout.bounds.column, row: offset, width: layout.bounds.width, height: body.height },
      });
      for (const [id, rect] of visibleRects) {
        renderPanel(virtual, id, rect);
      }
      renderTiledSeparators(virtual);
    }
  }
  translateHitTargets(hitTargets, {
    startIndex: hitStart,
    columnDelta: body.column,
    rowDelta: body.row - offset,
    clip: body,
  });
  blitWorkspace(frame, virtual, body, offset, layout.bounds.width);
  renderWorkspaceScrollbar(frame, body);
  if (showWindowStrip) fullscreen ? renderWindowTabs(frame) : renderShelf(frame);
  renderDropdownOverlay(frame, body, offset);
  renderThreeConfigModal(frame);
  renderModalOverlay(frame);
  renderApiWorkbenchStatus<string[]>({
    frame,
    row: height - 1,
    width,
    focus: `${layoutMode.peek() ? "LAYOUT · " : ""}${activePanel()}`,
    themeLabel: currentTheme.label,
    tileDensity: tileDensity.peek(),
    diagnostics: formatWorkbenchDiagnosticStatus(webDiagnostics),
    shortcutProfile: "web",
    theme: currentTheme,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
  });
  updateWebCanvasSemantics();
  updateWorkbenchStringLineSignals(lineSignals, frame, width, height);
}

function renderShelf(frame: string[]): void {
  const row = rowsCount() - 2;
  renderApiWorkbenchShelf<PanelId, string[]>({
    frame,
    row,
    column: 2,
    width: Math.max(0, cols() - 2),
    windows: webWindows.inspect().windows,
    buffers: shelfBuffers,
    theme: theme(),
    titleForId: panelTitle,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    writeButton,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
  });
}

function renderMobileCommandStrip(frame: string[]): void {
  if (!shouldRenderMobileCommandStrip()) return;
  workbenchMobileCommandStripItemsInto(mobileCommandButtonBuffers.items, {
    activeTitle: shortPanelTitle(activePanel()),
    controlsActive: activePanel() === "controls",
    themeActive: topMenus.isOpen("theme"),
  });
  renderApiWorkbenchButtonRow<string[], MobileAction, Hit>({
    frame,
    rect: { column: 1, row: 1, width: Math.max(0, cols() - 2), height: 2 },
    startRow: 1,
    items: mobileCommandButtonBuffers.items,
    placements: mobileCommandButtonBuffers.placements,
    commands: mobileCommandButtonBuffers.commands,
    theme: theme(),
    contrastText,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
    hitAction: (action) => ({ type: "mobileAction", action }),
  });
}

function shouldRenderMobileCommandStrip(): boolean {
  return isTouchOptimizedLayout() && rowsCount() >= 8;
}

function renderWindowTabs(frame: string[]): void {
  const row = rowsCount() - 2;
  renderApiWorkbenchWindowTabs<PanelId, string[], Hit>({
    frame,
    row,
    column: 2,
    width: Math.max(0, cols() - 2),
    tabs: webWindows.inspect().tabs,
    buffers: shelfBuffers,
    theme: theme(),
    titleForId: panelTitle,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    writeButton,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
    hitAction: (id) => ({ type: "restore", id }),
  });
}

function renderPanel(frame: string[], id: PanelId, rect: Rectangle): void {
  if (rect.width < 10 || rect.height < 4) return;
  hitTargets.add(rect, { type: "focus", id });
  const selected = activePanel() === id;
  drawFrame(frame, rect, panelTitle(id), selected);
  renderApiWorkbenchWindowTitlebar<PanelId, Hit, string[]>({
    frame,
    id,
    rect,
    title: panelTitle(id),
    showConfig: id === "three",
    maximized: fullscreenPanel() === id,
    buffers: titlebarBuffers,
    writeButton,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
    titlebarAction: (targetId, kind) => resolveApiWorkbenchTitlebarHitAction(targetId, kind),
    titlebarDragAction: (targetId) => ({ type: "windowTitlebar", id: targetId }),
  });
  const inner = {
    column: rect.column + 2,
    row: rect.row + 1,
    width: Math.max(0, rect.width - 4),
    height: Math.max(0, rect.height - 2),
  };
  fillRect(frame, inner, theme().surface);
  if (id === "explorer") renderExplorer(frame, inner);
  else if (id === "inspector") renderInspector(frame, inner);
  else if (id === "controls") renderControls(frame, inner);
  else if (id === "logs") renderLogs(frame, inner);
  else if (id === "data") renderData(frame, inner);
  else if (id === "three") renderThreePreview(frame, inner);
  else if (id === "htmlLayout") renderHtmlCssLayout(frame, inner);
  else if (id === "terminal") renderTerminalProtocol(frame, inner);
}

function panelTitle(id: PanelId): string {
  return apiWorkbenchPanelTitle(id, id[0]!.toUpperCase() + id.slice(1));
}

function shortPanelTitle(id: PanelId): string {
  return apiWorkbenchShortPanelTitle(id, panelTitle(id));
}

function renderLogs(frame: string[], rect: Rectangle): void {
  const logRows = log.peek();
  const lineCount = logRows.length;
  logScroll.setViewportSize(rect.width, rect.height);
  logScroll.setContentSize(rect.width, lineCount);
  const offset = logScroll.offset.peek().rows;
  const overflow = logScroll.inspectOverflow();
  const bodyWidth = Math.max(0, rect.width - 1);
  const t = theme();
  const rows = workbenchLogRowsFromSourcesInto(logRenderRows, [logRows], t);
  writeStyledRows(frame, { ...rect, width: bodyWidth }, rows, offset);
  if (!overflow.rows.scrollbarVisible || rect.width < 1) return;
  const column = rect.column + rect.width - 1;
  const thumb = overflow.rows.thumb;
  hitTargets.add({ column, row: rect.row, width: 1, height: rect.height }, { type: "logScrollbar" });
  for (let row = 0; row < rect.height; row += 1) {
    write(frame, rect.row + row, column, paint(scrollbarGlyph(row, thumb), t.accent, t.surface, true));
  }
}

function renderExplorer(frame: string[], rect: Rectangle): void {
  const visible = explorer.tree.visibleRows();
  renderApiWorkbenchExplorerPanel({
    frame,
    rect,
    rows: visible,
    selectedIndex: explorer.tree.selectedIndex.peek(),
    theme: theme(),
    renderRows: explorerRenderRows,
    contrastText,
    writeRows: writeStyledRows,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
  });
}

function renderInspector(frame: string[], rect: Rectangle): void {
  const t = theme();
  renderApiWorkbenchInspectorPanel({
    frame,
    rect,
    themeLabel: t.label,
    focusTitle: panelTitle(activePanel()),
    focusState: fullscreenPanel() === activePanel() ? "fullscreen" : "normal",
    layoutSummary: `${webWindows.inspect().visible.length} visible pane(s)`,
    logs: log.peek(),
    renderRows: inspectorRenderRows,
    theme: t,
    fit,
    actionTextRows: inspectorActionTextRows,
    wrappedTextRows: inspectorWrappedTextRows,
    writeRows: writeStyledRows,
  });
}

function renderData(frame: string[], rect: Rectangle): void {
  const t = theme();
  renderApiWorkbenchDataPanel({
    frame,
    rect,
    columns,
    view: () => table.view.peek(),
    sort: () => table.state.peek().sort,
    setPageSize: (pageSize) => table.setPageSize(pageSize),
    buffers: {
      renderRows: dataTableRenderRows,
      textRows: dataTableTextRows,
      bodyRows: dataTableBodyRows,
    },
    theme: t,
    fit,
    contrastText,
    writeRows: writeStyledRows,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
  });
}

function renderThreePreview(frame: string[], rect: Rectangle): void {
  const t = theme();
  const phase = Math.floor(performance.now() / 90);
  const rows = workbenchThreePreviewRowsInto(threePreviewRows, {
    width: rect.width,
    height: rect.height,
    phase,
    tileDensity: tileDensity.peek(),
    themeLabel: t.label,
    asciiOptions: ascii.peek(),
    orbRows: threePreviewOrbRows,
  });
  for (let index = 0; index < rows.length && index < rect.height; index += 1) {
    const header = index === 0;
    const accent = index % 3 === 0 ? t.accent : index % 3 === 1 ? t.good : t.warn;
    write(
      frame,
      rect.row + index,
      rect.column,
      paint(
        fit(rows[index]!, rect.width),
        header ? contrastText(t.accent, t.background, t.text) : accent,
        header ? t.accent : t.surface,
        header || index > 3,
      ),
    );
  }
}

function workbenchThreePreviewRowsInto(
  target: string[],
  options: {
    width: number;
    height: number;
    phase: number;
    tileDensity: number;
    themeLabel: string;
    asciiOptions?: Pick<AsciiOptions, "preset" | "terminalGlyphStyle" | "kittyGraphics" | "kittyDisableAscii">;
    orbRows?: string[];
  },
): string[] {
  const mode = options.asciiOptions
    ? terminalGlyphStyleLabel(options.asciiOptions.terminalGlyphStyle).toUpperCase()
    : workbenchThreePreviewMode(options.tileDensity);
  const preset = options.asciiOptions?.preset ?? "mixed-best";
  const transport = options.asciiOptions?.kittyGraphics
    ? options.asciiOptions.kittyDisableAscii ? "kitty only" : "kitty + ascii"
    : "ascii";
  target.length = 0;
  target.push(
    ` ACEROLA THREE ASCII · ${mode} · GENERATED PREVIEW `,
    "This pane is a lightweight canvas ASCII preview, not the live WebGPU renderer.",
    "Open the standalone Three demo for live WebGPU output; controls and state are mirrored here.",
    "",
  );
  const bodyHeight = Math.max(3, Math.floor(options.height) - 6);
  const orbRows = asciiOrbInto(options.orbRows ?? [], options.width, bodyHeight, options.phase);
  for (let index = 0; index < orbRows.length; index += 1) {
    if (target.length >= options.height) return target;
    target.push(orbRows[index]!);
  }
  if (target.length < options.height) target.push("");
  if (target.length < options.height) {
    target.push(
      `preset ${preset}  glyph ${mode.toLowerCase()}  ${transport}  density ${
        Math.trunc(options.tileDensity)
      }  theme ${options.themeLabel}`,
    );
  }
  return target;
}

function workbenchThreePreviewMode(tileDensity: number): string {
  return ["BLOCKS", "GLYPHS", "MIXED"][Math.abs(Math.trunc(tileDensity)) % 3] ?? "MIXED";
}

function asciiOrbInto(target: string[], width: number, height: number, phase: number): string[] {
  const columns = Math.max(8, Math.floor(width));
  const rows = Math.max(3, Math.floor(height));
  const glyphs = " .:-=+*#%@";
  return prepareWorkbenchRows(target, rows, () => "", (_line, row) => {
    let line = "";
    for (let column = 0; column < columns; column += 1) {
      const x = (column / Math.max(1, columns - 1)) * 2 - 1;
      const y = (row / Math.max(1, rows - 1)) * 2 - 1;
      const ring = Math.abs(Math.sqrt(x * x * 2.8 + y * y * 1.8) - 0.62);
      const wave = Math.sin(column * 0.32 + phase * 0.18) + Math.cos(row * 0.7 - phase * 0.14);
      const value = Math.max(0, Math.min(1, 1 - ring * 3.5 + wave * 0.15));
      line += glyphs[Math.floor(value * (glyphs.length - 1))] ?? " ";
    }
    return line;
  });
}

function renderHtmlCssLayout(frame: string[], rect: Rectangle): void {
  renderApiWorkbenchHtmlCssLayout<string[]>({
    frame,
    rect,
    boxes: htmlCssLayoutBoxes,
    commands: htmlCssLayoutRenderCommands,
    summaryProfile: "web",
    theme: theme(),
    contrastText,
    fit,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    fillRect,
  });
}

function renderTerminalProtocol(frame: string[], rect: Rectangle): void {
  const t = theme();
  if (rect.height <= 0 || rect.width <= 0) return;
  const screenHeight = Math.max(3, rect.height - 6);
  const screenRect = {
    column: rect.column,
    row: rect.row + 4,
    width: rect.width,
    height: Math.min(screenHeight, Math.max(0, rect.height - 5)),
  };
  const workspace = webTerminalWorkspace.inspect();
  const activeScreen = syncWebTerminalScreen(workspace.activeId, screenRect.width, screenRect.height);
  const inspection = activeScreen.inspect();
  const headerRows = workbenchTerminalProtocolHeaderRowsInto(webTerminalHeaderRows, {
    activeTitle: workspace.active?.title,
    columns: inspection.columns,
    rows: inspection.rows,
    cursorColumn: inspection.cursor.column,
    cursorRow: inspection.cursor.row,
    sessionCount: workspace.count,
    paneCount: workspace.layout.count,
  });
  const headerRowCount = Math.min(2, rect.height);
  for (let index = 0; index < headerRowCount; index += 1) {
    const line = headerRows[index]!;
    const bg = index === 0 ? t.accentDeep : t.panelSoft;
    const fg = index === 0 ? contrastText(t.accentDeep, t.background, t.text) : index === 1 ? t.warn : t.soft;
    write(frame, rect.row + index, rect.column, paint(fit(line, rect.width), fg, bg, index === 0));
  }
  renderApiWorkbenchTerminalSessionTabs<string[], "terminalSession">({
    frame,
    rect: { column: rect.column, row: rect.row + 2, width: rect.width, height: 1 },
    startRow: rect.row + 2,
    inspection: workspace,
    buffers: webTerminalSessionTabBuffers,
    theme: t,
    contrastText,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
    hitType: "terminalSession",
  });
  renderApiWorkbenchTerminalShellToolbar<string[], "terminalAction">({
    frame,
    rect: { column: rect.column, row: rect.row + 3, width: rect.width, height: 1 },
    startRow: rect.row + 3,
    state: workbenchTerminalToolbarStateFromSnapshot({
      activeId: workspace.activeId,
      sessionCount: workspace.sessions.length,
      paneCount: workspace.layout.count,
      zoomedPaneId: workspace.layout.zoomedPaneId,
      scrollback: activeWebTerminalScrollback()?.inspect(),
    }),
    buffers: webTerminalButtonBuffers,
    actions: webTerminalActions,
    theme: t,
    contrastText,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
    hitType: "terminalAction",
  });

  fillRect(frame, screenRect, t.background);
  renderWebTerminalPanes(frame, screenRect, workspace);

  const footerRow = rect.row + rect.height - 1;
  if (footerRow >= screenRect.row) {
    const footer =
      "GitHub Pages uses this safe mock; hosted apps attach a PTY/process backend over the remote protocol.";
    write(frame, footerRow, rect.column, paint(fit(footer, rect.width), t.muted, t.surface));
  }
}

function renderWebTerminalPanes(
  frame: string[],
  rect: Rectangle,
  workspace = webTerminalWorkspace.inspect(),
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const projections = workbenchTerminalPaneProjectionsInto(
    webTerminalBuffers.paneProjections,
    workspace.layout,
    rect,
    {
      gap: 1,
      fallbackSessionId: workspace.activeId,
      titleForSession: (sessionId) => workspace.sessions.find((entry) => entry.id === sessionId)?.title,
    },
  );
  const titleCommands = workbenchTerminalPaneTitleRenderCommandsInto(
    webTerminalBuffers.paneTitleCommands,
    projections,
    theme(),
    contrastText,
  );
  let titleIndex = 0;
  for (const projection of projections) {
    const titleCommand = projection.titleVisible ? titleCommands[titleIndex++] : undefined;
    renderWebTerminalPane(frame, projection, titleCommand);
  }
}

function renderWebTerminalPane(
  frame: string[],
  projection: WorkbenchTerminalPaneProjection,
  titleCommand?: WorkbenchTerminalPaneTitleRenderCommand,
): void {
  const rect = projection.rect;
  if (rect.width <= 0 || rect.height <= 0) return;
  const t = theme();
  const activePane = projection.active;
  fillRect(frame, rect, activePane ? t.background : t.surface);
  const content = projection.contentRect;
  if (titleCommand) {
    write(
      frame,
      titleCommand.rect.row,
      titleCommand.rect.column,
      paint(titleCommand.text, titleCommand.style.fg, titleCommand.style.bg, titleCommand.style.bold),
    );
    if (titleCommand.paneId) {
      hitTargets.add(titleCommand.hitRect, {
        type: "terminalPane",
        id: titleCommand.paneId,
      });
    }
  }
  const sessionId = projection.sessionId;
  const screen = syncWebTerminalScreen(sessionId, content.width, content.height);
  const scrollback = syncWebTerminalScrollback(sessionId, screen, content.height);
  hitTargets.add(content, { type: "terminalContent", sessionId, paneId: projection.paneId });
  const inspection = scrollback.inspect();
  if (inspection.mode === "copy") {
    const copyRows = workbenchTerminalCopyRowsInto(webTerminalBuffers.copyRows, {
      visibleRows: inspection.visibleRows,
      offset: inspection.offset,
      height: content.height,
      selection: inspection.selection,
      prefixWidth: 5,
    });
    for (const row of copyRows) {
      write(
        frame,
        content.row + row.screenRow,
        content.column,
        paint(
          fit(row.text, content.width),
          row.selected ? t.background : t.text,
          row.selected ? t.warn : activePane ? t.background : t.surface,
          row.selected,
        ),
      );
    }
  } else {
    const rows = screen.textRows();
    const screenRowCount = Math.min(rows.length, content.height);
    for (let index = 0; index < screenRowCount; index += 1) {
      write(
        frame,
        content.row + index,
        content.column,
        paint(
          fit(rows[index]!, content.width),
          t.text,
          activePane ? t.background : t.surface,
          false,
        ),
      );
    }
  }
  if (inspection.mode === "copy") {
    const status = inspection.query
      ? `search "${inspection.query}" ${inspection.matches.length} hit(s)`
      : `copy rows ${inspection.offset + 1}-${
        Math.min(inspection.offset + inspection.viewportRows, inspection.totalRows)
      }`;
    write(
      frame,
      content.row + Math.max(0, content.height - 1),
      content.column,
      paint(fit(status, content.width), t.warn, t.panelSoft, true),
    );
    return;
  }
  const cursor = screen.cursor;
  if (activePane && cursor.row < content.height && cursor.column < content.width) {
    write(
      frame,
      content.row + cursor.row,
      content.column + cursor.column,
      paint(" ", t.background, t.accent, true),
    );
  }
}

function activeWebTerminalScrollback(): TerminalScrollbackController | undefined {
  const sessionId = webTerminalWorkspace.inspect().activeId;
  if (!sessionId) return undefined;
  const screen = webTerminalScreens.get(sessionId) ?? syncWebTerminalScreen(sessionId, 80, 20);
  return syncWebTerminalScrollback(sessionId, screen, screen.rows);
}

function handleWebTerminalScroll(
  target: Extract<Hit, { type: "terminalContent" }>,
  delta: number,
): boolean {
  if (target.paneId) webTerminalWorkspace.activatePane(target.paneId);
  else if (target.sessionId) webTerminalWorkspace.activate(target.sessionId);
  const sessionId = target.sessionId ?? webTerminalWorkspace.inspect().activeId;
  const screen = webTerminalScreens.get(sessionId ?? "");
  if (!screen) return false;
  const scrollback = syncWebTerminalScrollback(sessionId, screen, screen.rows);
  const inspection = scrollback.inspect();
  if (inspection.totalRows <= inspection.viewportRows) return false;
  scrollback.scrollLines(delta);
  activatePanel("terminal");
  if (inspection.mode === "live") push("terminal copy mode on");
  return true;
}

function syncWebTerminalScrollback(
  sessionId: string | undefined,
  screen: TerminalScreenController,
  viewportRows: number,
): TerminalScrollbackController {
  const safeId = sessionId ?? "none";
  let scrollback = webTerminalScrollbacks.get(safeId);
  if (!scrollback) {
    scrollback = new TerminalScrollbackController({ screen, viewportRows });
    webTerminalScrollbacks.set(safeId, scrollback);
  } else {
    scrollback.setViewportRows(viewportRows);
  }
  return scrollback;
}

function syncWebTerminalScreen(sessionId: string | undefined, width: number, height: number): TerminalScreenController {
  const columns = Math.max(20, Math.floor(width));
  const rows = Math.max(3, Math.floor(height));
  const safeId = sessionId ?? "none";
  let screen = webTerminalScreens.get(safeId);
  if (!screen) {
    screen = new TerminalScreenController({ columns, rows, scrollbackLimit: 64 });
    webTerminalScreens.set(safeId, screen);
  }
  const key = `${columns}x${rows}:${theme().id}:${safeId}`;
  if (key === webTerminalScreenKeys.get(safeId)) return screen;
  webTerminalScreenKeys.set(safeId, key);
  screen.resize(columns, rows);
  screen.clear();
  const transcript = safeId === "remote-attach"
    ? [
      "\x1b[1mremote-attach\x1b[0m:\x1b[34m~/deno_tui\x1b[0m$ connect ws://localhost:8787/terminal",
      "\x1b[33mwaiting for explicit endpoint\x1b[0m",
      "RemoteTerminalClient would stream browser input to a server TerminalSessionHandle.",
      "The server side can attach a PTY, process backend, tmux session, or remote bridge.",
      "",
      "No local OS shell is exposed from this static Pages build.",
      "",
      "\x1b[1mremote-attach\x1b[0m$ _",
    ]
    : safeId === "ci-task"
    ? [
      "\x1b[1mci-task\x1b[0m:\x1b[34m~/deno_tui\x1b[0m$ deno task health",
      "Check scripts/health.ts",
      "\x1b[32mok\x1b[0m api inventory  \x1b[32mok\x1b[0m web pages build  \x1b[32mok\x1b[0m e2e",
      "\x1b[33mtemplate only\x1b[0m: start this through a hosted backend to run real commands.",
      "",
      "\x1b[1mci-task\x1b[0m$ _",
    ]
    : [
      "\x1b[1mweb-shell\x1b[0m:\x1b[34m~/deno_tui\x1b[0m$ deno task web:demo:check",
      "\x1b[32mok\x1b[0m mod.web.ts import graph is browser-safe",
      "\x1b[32mok\x1b[0m pointer, wheel, paste, focus, resize adapters active",
      "\x1b[32mok\x1b[0m HTML/CSS layout boxes shared with terminal renderer",
      "",
      "\x1b[1mweb-shell\x1b[0m:\x1b[34m~/deno_tui\x1b[0m$ connect ws://localhost:8787/terminal",
      "\x1b[33mremote endpoint required\x1b[0m: local OS shells stay server-side by design",
      "transport would stream output bytes into TerminalScreenController",
      "keyboard and paste events encode through the same terminal input helpers",
      "",
      "\x1b[1mweb-shell\x1b[0m:\x1b[34m~/deno_tui\x1b[0m$ _",
    ];
  screen.write(transcript.join("\r\n"));
  return screen;
}

function applyWebTerminalAction(action: WebTerminalAction): void {
  const inspection = webTerminalWorkspace.inspect();
  if (action === "new") {
    const draft = nextApiWorkbenchTerminalSessionDraft(webTerminalWorkspace.inspect().sessions, {
      prefix: "pages-shell",
      label: "Pages Shell",
    });
    webTerminalWorkspace.add({
      id: draft.id,
      title: draft.title,
      kind: "command",
      command: "web-shell",
      metadata: { source: "browser-demo" },
    }, {
      activate: true,
      backendId: "browser-mock",
      status: "running",
      running: true,
    });
    push(`terminal new ${draft.title}`);
  } else if (action === "previous") {
    const descriptor = webTerminalWorkspace.activateRelative(-1);
    push(descriptor ? `terminal session ${descriptor.title}` : "terminal previous unavailable");
  } else if (action === "next") {
    const descriptor = webTerminalWorkspace.activateRelative(1);
    push(descriptor ? `terminal session ${descriptor.title}` : "terminal next unavailable");
  } else if (action === "close") {
    if (inspection.activeId && inspection.sessions.length > 1) {
      webTerminalWorkspace.remove(inspection.activeId);
      push("terminal session closed");
    }
  } else if (action === "splitRow" || action === "splitColumn") {
    const draft = nextApiWorkbenchTerminalSessionDraft(webTerminalWorkspace.inspect().sessions, {
      prefix: "pages-shell",
      label: "Pages Shell",
    });
    const descriptor = webTerminalWorkspace.add({
      id: draft.id,
      title: draft.title,
      kind: "command",
      command: "web-shell",
      metadata: { source: "browser-demo" },
    }, {
      activate: false,
      backendId: "browser-mock",
      status: "running",
      running: true,
    });
    webTerminalWorkspace.splitActive(action === "splitRow" ? "row" : "column", descriptor.id, {
      title: descriptor.title,
    });
    webTerminalWorkspace.activate(descriptor.id);
    push(`terminal split ${draft.title}`);
  } else if (action === "zoomPane") {
    const paneId = webTerminalWorkspace.inspect().layout.activePaneId;
    if (paneId) {
      webTerminalWorkspace.toggleZoomPane(paneId);
      push("terminal pane zoom");
    }
  } else if (action === "closePane") {
    const layout = webTerminalWorkspace.inspect().layout;
    if (layout.activePaneId && layout.count > 1) {
      webTerminalWorkspace.closePane(layout.activePaneId);
      push("terminal pane closed");
    }
  } else if (action === "restart") {
    if (inspection.activeId) {
      webTerminalWorkspace.restart(inspection.activeId);
      push(`terminal restart ${webTerminalWorkspace.active?.title ?? inspection.activeId}`);
    }
  } else if (action === "search") {
    const scrollback = activeWebTerminalScrollback();
    if (scrollback) {
      const current = scrollback.inspect().query ?? "terminal";
      const query = prompt("Search terminal scrollback", current) ?? "";
      const matches = scrollback.search(query);
      push(matches.length > 0 ? `terminal search ${matches.length} hits` : "terminal search no matches");
    }
  } else if (action === "previousMatch" || action === "nextMatch") {
    const scrollback = activeWebTerminalScrollback();
    const row = scrollback?.nextMatch(action === "previousMatch" ? -1 : 1);
    push(row === undefined ? "terminal search no matches" : `terminal search row ${row + 1}`);
  }
  webTerminalScreenKeys.clear();
  activatePanel("terminal");
}

function ensureLines(): void {
  for (let row = lineSignals.length; row < rowsCount(); row++) {
    const signal = new Signal("");
    lineSignals.push(signal);
    const rowIndex = row;
    new TextObject({
      canvas: host.canvas,
      rectangle: new Computed<TextRectangle>(() => ({ column: 0, row: rowIndex, width: cols() })),
      value: signal,
      overwriteRectangle: true,
      multiCodePointSupport: true,
      style: (text) => text,
      zIndex: 2,
    }).draw();
  }
}

function applyHit(target: HitTarget<Hit>, x: number, y: number): void {
  const hit = target.action;
  if (hit.type === "menu") {
    menu.setActive(hit.index);
    menu.selectActive();
  } else if (hit.type === "mobileAction") {
    applyMobileAction(hit.action);
  } else if (hit.type === "quit") openQuitModal();
  else if (hit.type === "focus") focus(hit.id);
  else if (hit.type === "minimize") minimize(hit.id);
  else if (hit.type === "maximize") toggleMax(hit.id);
  else if (hit.type === "close") closePanel(hit.id);
  else if (hit.type === "threeConfig") openThreeConfigModal(hit.id);
  else if (hit.type === "asciiConfig") applyThreeConfigHit(hit.index, hit.action ?? "activate");
  else if (hit.type === "asciiConfigAction") applyThreeConfigModalAction(hit.action);
  else if (hit.type === "asciiConfigBackdrop") {
    restoreThreeConfigBaseline();
    closeThreeConfigModal();
  } else if (hit.type === "restore") hit.id ? restorePanel(hit.id) : restore();
  else if (hit.type === "control") applyControlHit(hit.id, hit.action ?? "activate", target.rect, x, hit.index);
  else if (hit.type === "modalAction" && hit.index >= 0) modal.activateAction(hit.index);
  else if (hit.type === "dataRow") selectDataRow(hit.index);
  else if (hit.type === "explorerRow") selectExplorerRow(hit.index);
  else if (hit.type === "logScrollbar") {
    const lines = log.peek().length;
    logScroll.scrollTo(0, scrollbarOffsetForPointer(lines, target.rect.height, y - target.rect.row));
    activatePanel("logs");
  } else if (hit.type === "layout") {
    applyLayoutMenuItem(hit.index);
  } else if (hit.type === "windowTitlebar") {
    focus(hit.id);
  } else if (hit.type === "terminalSession") {
    webTerminalWorkspace.activate(hit.id);
    webTerminalScreenKeys.clear();
    activatePanel("terminal");
    push(`terminal session ${hit.id}`);
  } else if (hit.type === "terminalPane") {
    if (webTerminalWorkspace.activatePane(hit.id)) {
      webTerminalScreenKeys.clear();
      activatePanel("terminal");
      push("terminal pane active");
    }
  } else if (hit.type === "terminalContent") {
    if (hit.paneId) webTerminalWorkspace.activatePane(hit.paneId);
    else if (hit.sessionId) webTerminalWorkspace.activate(hit.sessionId);
    const screen = webTerminalScreens.get(hit.sessionId ?? "");
    if (screen) {
      const scrollback = syncWebTerminalScrollback(hit.sessionId, screen, target.rect.height);
      scrollback.selectVisibleRow(y - target.rect.row);
      push("terminal row selected");
    }
    activatePanel("terminal");
  } else if (hit.type === "terminalAction") {
    applyWebTerminalAction(hit.action);
  } else if (hit.type === "workspaceScrollbar") {
    workspaceScroll.scrollTo(
      0,
      scrollbarOffsetForPointer(workspaceScroll.contentHeight.peek(), target.rect.height, y - target.rect.row),
    );
  } else if (hit.type === "theme") setTheme(hit.index);
}

function applyMobileAction(action: MobileAction): void {
  if (action === "next") {
    closeThemeMenu();
    focusNext();
  } else if (action === "controls") {
    closeThemeMenu();
    focus("controls");
  } else if (action === "theme") {
    toggleThemeMenu();
  } else if (action === "help") {
    openHelpModal();
  } else if (action === "restore") {
    restore();
  } else if (action === "wide") {
    adjustTileDensity(-1);
  } else if (action === "dense") {
    adjustTileDensity(1);
  }
}

function handlePointerDrag(
  event: { x: number; y: number; drag?: boolean; movementX?: number; movementY?: number },
  target: HitTarget<Hit> | undefined,
): boolean {
  if (!event.drag || !pointerDrag) return false;
  if (pointerDrag.layout?.kind === "separator") {
    const projection = tiledLayoutProjection;
    const delta = pointerDrag.layout.axis === "column" ? event.x - pointerDrag.lastX : event.y - pointerDrag.lastY;
    pointerDrag.lastX = event.x;
    pointerDrag.lastY = event.y;
    if (projection && delta !== 0) {
      pointerDrag.moved = tiledWorkspace.resizeSplit(
        pointerDrag.layout.splitId,
        delta,
        projection.bounds,
        {
          gap: workbenchTiledGap(),
          separatorHitSize: 3,
          visibleWindowIds: visiblePanelIds(),
        },
      ) || pointerDrag.moved;
    }
    return true;
  }
  if (pointerDrag.layout?.kind === "window") {
    pointerDrag.moved ||= event.x !== pointerDrag.x || event.y !== pointerDrag.y;
    pointerDrag.lastX = event.x;
    pointerDrag.lastY = event.y;
    return true;
  }
  const deltaColumns = pointerDrag.x - event.x;
  const deltaRows = pointerDrag.y - event.y;
  const moved = Math.abs(deltaRows) >= 1 || Math.abs(deltaColumns) >= 2 ||
    Math.abs(event.movementY ?? 0) >= 8 || Math.abs(event.movementX ?? 0) >= 12;
  if (!moved) return false;

  if (target?.action.type === "control" && target.action.id === "slider") {
    applyHit(target, event.x, event.y);
    pointerDrag.moved = true;
    return true;
  }

  const origin = pointerDrag.target?.action;
  const logOrigin = origin?.type === "logScrollbar" || origin?.type === "focus" && origin.id === "logs" ||
    activePanel() === "logs" && origin?.type !== "workspaceScrollbar";
  if (logOrigin) {
    logScroll.scrollTo(0, pointerDrag.logRows + deltaRows);
    activatePanel("logs");
  } else {
    workspaceScroll.scrollTo(0, pointerDrag.workspaceRows + deltaRows);
  }
  pointerDrag.moved = true;
  return true;
}

function activePanel(): PanelId {
  return (webWindows.activeId.peek() as PanelId | undefined) ?? "three";
}

function fullscreenPanel(): PanelId | null {
  return (webWindows.fullscreenId.peek() as PanelId | undefined) ?? null;
}

function activatePanel(id: PanelId): void {
  webWindows.restore(id);
  workbenchController.focusWindow(id);
  tiledWorkspace.focus(id);
  persistWebWorkspaceState();
}

function focus(id: PanelId): void {
  activatePanel(id);
  push(`focus ${id}`);
}
function focusNext(): void {
  focusRelativePanel(1);
}
function focusPrevious(): void {
  focusRelativePanel(-1);
}

function focusRelativePanel(delta: -1 | 1): void {
  const visible = visiblePanelIds();
  if (visible.length === 0) {
    push("no visible panels");
    return;
  }
  const currentIndex = visible.indexOf(activePanel());
  const index = currentIndex < 0 ? 0 : currentIndex;
  const id = visible[(index + delta + visible.length) % visible.length]!;
  workbenchController.focusWindow(id);
  tiledWorkspace.focus(id);
  persistWebWorkspaceState();
  push(`focus ${id}`);
}

function visiblePanelIds(): PanelId[] {
  return webWindows.inspect().windows
    .filter((entry) => entry.state === "normal")
    .map((entry) => entry.id as PanelId);
}
function minimize(id: PanelId): void {
  workbenchController.minimizeWindow(id);
  push(`minimize ${id}`);
}
function closePanel(id: PanelId): void {
  workbenchController.closeWindow(id);
  push(`close ${id}`);
}
function toggleMax(id: PanelId): void {
  workbenchController.toggleFullscreenWindow(id);
  push(`${fullscreenPanel() ? "maximize" : "restore"} ${id}`);
}
function restorePanel(id: PanelId): void {
  workbenchController.restoreWindows(id);
  push(`restore ${id}`);
}
function restore(): void {
  workbenchController.restoreWindows();
  push("restore all");
}
function setTheme(index: number): void {
  themeIndex.value = ((index % themes.length) + themes.length) % themes.length;
  closeTopMenus();
  push(`theme ${theme().label}`);
}

function handleWorkbenchTopMenuKey(
  event: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean },
): void {
  const action = resolveWorkbenchScreenDropdownKey({
    event,
    openId: topMenus.inspect().openId,
    indexes: {
      layout: workbenchController.menuIndex("layout"),
      theme: themeIndex.peek(),
    },
    counts: { layout: LAYOUT_MENU_LABELS.length, theme: themes.length },
  });
  switch (action.kind) {
    case "ignore":
      return;
    case "quit":
      openQuitModal();
      return;
    case "help":
      closeTopMenus();
      openHelpModal();
      return;
    case "close":
      closeTopMenus();
      return;
    case "focusWindow":
      closeTopMenus();
      action.delta < 0 ? focusPrevious() : focusNext();
      return;
    case "moveTopMenu": {
      const item = menu.move(action.delta);
      if (item?.id === "theme" || item?.id === "layout") topMenus.open(item.id);
      else topMenus.close(false);
      return;
    }
    case "menuItem": {
      if (action.menuId === "theme") {
        themeIndex.value = action.index;
        if (action.activate) setTheme(action.index);
      } else if (action.menuId === "layout") {
        workbenchController.setMenuIndex("layout", action.index, LAYOUT_MENU_LABELS.length);
        if (action.activate) applyLayoutMenuItem(action.index);
      }
      return;
    }
  }
}

function toggleThemeMenu(): void {
  topMenus.toggle("theme");
  push(`${topMenus.isOpen("theme") ? "open" : "close"} theme menu`);
}

function closeThemeMenu(): void {
  closeTopMenus();
}

function closeTopMenus(): void {
  topMenus.close(false);
}

function layoutMenuLabels(): string[] {
  layoutMenuLabelBuffer.length = LAYOUT_MENU_LABELS.length;
  for (let index = 0; index < LAYOUT_MENU_LABELS.length; index += 1) {
    const label = LAYOUT_MENU_LABELS[index]!;
    layoutMenuLabelBuffer[index] = index === 0 ? `${layoutMode.peek() ? "[x]" : "[ ]"} ${label}` : label;
  }
  return layoutMenuLabelBuffer;
}

function applyLayoutMenuItem(index: number): void {
  closeTopMenus();
  switch (index) {
    case 0:
      toggleLayoutMode();
      return;
    case 1:
      focusPrevious();
      return;
    case 2:
      focusNext();
      return;
    case 3:
      moveActiveTile(-1);
      return;
    case 4:
      moveActiveTile(1);
      return;
    case 5:
      resizeActiveTile(2, 0);
      return;
    case 6:
      resizeActiveTile(-2, 0);
      return;
    case 7:
      resizeActiveTile(0, 1);
      return;
    case 8:
      resizeActiveTile(0, -1);
      return;
    case 9:
      resetTiledLayout();
  }
}

function toggleLayoutMode(): void {
  layoutMode.value = !layoutMode.peek();
  closeTopMenus();
  if (isTextControlActive()) blurTextControl();
  push(`layout mode ${layoutMode.peek() ? "on" : "off"}`);
}

function handleLayoutModeKey(
  event: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean },
): void {
  const key = event.key.toLowerCase();
  if (key === "escape") {
    toggleLayoutMode();
    return;
  }
  if (key === "return") {
    toggleMax(activePanel());
    return;
  }
  if (event.meta || !["left", "right", "up", "down"].includes(key)) return;
  const delta: -1 | 1 = key === "left" || key === "up" ? -1 : 1;
  if (event.ctrl) {
    resizeActiveTile(
      key === "left" || key === "right" ? delta * 2 : 0,
      key === "up" || key === "down" ? delta : 0,
    );
  } else if (event.shift) {
    moveActiveTile(delta);
  } else {
    focusRelativePanel(delta);
  }
}

function moveActiveTile(delta: -1 | 1): void {
  const visible = visiblePanelIds();
  const source = activePanel();
  const index = visible.indexOf(source);
  const targetIndex = Math.max(0, Math.min(visible.length - 1, index + delta));
  const target = visible[targetIndex];
  if (index < 0 || !target || target === source || !tiledWorkspace.swap(source, target)) return;
  tiledWorkspace.focus(source);
  syncWindowManagerOrderFromTiles();
  persistWebWorkspaceState();
  push(`move ${source} ${delta < 0 ? "earlier" : "later"}`);
}

function resizeActiveTile(columns: number, rows: number): void {
  const projection = tiledLayoutProjection;
  const active = activePanel();
  const pane = projection?.panes.find((entry) => entry.windowId === active);
  if (!projection || !pane) return;
  const axis: TiledWorkspaceSeparatorAxis = columns !== 0 ? "column" : "row";
  const requested = columns !== 0 ? columns : rows;
  const separator = projection.separators
    .filter((entry) => entry.axis === axis && rectangleContains(entry.bounds, pane.rect))
    .sort((left, right) => rectangleArea(left.bounds) - rectangleArea(right.bounds))[0];
  if (!separator) {
    push(`resize ${active} unavailable on ${axis} axis`);
    return;
  }
  const inFirst = rectangleContains(separator.firstRect, pane.rect);
  if (
    tiledWorkspace.resizeSplit(separator.splitId, inFirst ? requested : -requested, projection.bounds, {
      gap: workbenchTiledGap(),
      separatorHitSize: 3,
      visibleWindowIds: visiblePanelIds(),
    })
  ) {
    persistWebWorkspaceState();
    push(`resize ${active} ${columns}:${rows}`);
  }
}

function resetTiledLayout(): void {
  tileDensity.value = 0;
  tiledWorkspace.state.value = {};
  tiledWorkspace.reconcile(tiledWindowInventory(), { activeWindowId: activePanel() });
  tiledWorkspace.focus(activePanel());
  syncWindowManagerOrderFromTiles();
  workspaceScroll.scrollTo(0, 0);
  persistWebWorkspaceState();
  push("layout reset");
}

function focusPanelByNumber(key: string): boolean {
  const index = Number.parseInt(key, 10);
  if (!Number.isInteger(index) || index < 1) return false;
  const id = panelIds[index - 1];
  if (!id) return false;
  focus(id);
  return true;
}

function cycleDataSortColumn(delta: number): void {
  const current = table.state.peek().sort?.columnId;
  const next = nextSortableDataColumn(table.columns.peek(), current, delta);
  if (!next) return;
  table.toggleSort(next.id);
  push(`sort data by ${next.label}`);
}

function selectExplorerRow(index: number): void {
  activatePanel("explorer");
  explorer.tree.setSelectedIndex(index);
  const entry = explorer.selected();
  if (entry?.kind === "file") explorer.openActive();
  else if (entry?.kind === "directory") explorer.tree.toggleActive();
  push(`explorer ${entry?.path ?? index}`);
}
function adjustTileDensity(delta: number): void {
  tileDensity.value = clampWorkbenchTileDensity(tileDensity.peek() + delta);
  push(`tile density ${tileDensity.peek()}`);
}

function workspaceLayout(bounds: Rectangle): {
  bounds: Rectangle;
  contentHeight: number;
  rects: Map<PanelId, Rectangle>;
} {
  const active = activePanel();
  tiledWorkspace.reconcile(tiledWindowInventory(), { activeWindowId: active });
  tiledWorkspace.focus(active);
  const gap = workbenchTiledGap();
  if (tiledWorkspace.gap.peek() !== gap) tiledWorkspace.gap.value = gap;
  const projection = tiledWorkspace.layout(bounds, {
    gap,
    separatorHitSize: 3,
    visibleWindowIds: visiblePanelIds(),
  });
  const compactFocus = !projection.fitsMinimumSize;
  const focusedPane = compactFocus
    ? projection.panes.find((pane) => pane.windowId === active) ?? projection.panes[0]
    : undefined;
  tiledLayoutProjection = compactFocus
    ? {
      ...projection,
      activePaneId: focusedPane?.pane.id,
      activeWindowId: focusedPane?.windowId,
      panes: focusedPane ? [{ ...focusedPane, rect: { ...bounds }, active: true }] : [],
      separators: [],
    }
    : projection;
  const rects = new Map<PanelId, Rectangle>();
  for (const pane of tiledLayoutProjection.panes) {
    rects.set(pane.windowId as PanelId, pane.rect);
  }
  return { bounds, contentHeight: bounds.height, rects };
}

function tiledWindowInventory(): TiledWorkspaceWindow[] {
  const densityOffset = tileDensity.peek() * 3;
  return webWindows.inspect().windows
    .filter((entry) => entry.state !== "closed")
    .map((entry) => ({
      id: entry.id,
      minWidth: Math.max(20, (entry.minWidth ?? 20) - densityOffset),
      minHeight: entry.minHeight,
    }));
}

function workbenchTiledGap(): number {
  const density = tileDensity.peek();
  return density <= -2 ? 2 : density >= 2 ? 0 : 1;
}

function renderTiledSeparators(frame: string[]): void {
  if (fullscreenPanel() || !tiledLayoutProjection) return;
  const color = layoutMode.peek() ? theme().borderStrong : theme().backgroundSoft;
  for (const separator of tiledLayoutProjection.separators) {
    if (separator.rect.width > 0 && separator.rect.height > 0) fillRect(frame, separator.rect, color);
    hitTargets.add(separator.hitRect, {
      type: "layoutSeparator",
      splitId: separator.splitId,
      axis: separator.axis,
    });
  }
}

function syncWindowManagerOrderFromTiles(): void {
  const order = new Map(tiledWorkspace.windowIds().map((id, index) => [id, index]));
  const current = webWindows.windows.peek();
  webWindows.windows.value = current.map((entry, fallback) => ({
    ...entry,
    order: order.get(entry.id) ?? entry.order ?? order.size + fallback,
  }));
}

function finishWindowDock(sourceId: PanelId, screenColumn: number, screenRow: number): void {
  const projection = tiledLayoutProjection;
  if (!projection || !pointInRectangle(screenColumn, screenRow, workspaceScreenBounds)) return;
  const column = screenColumn - workspaceScreenBounds.column;
  const row = screenRow - workspaceScreenBounds.row + workspaceOffsetRows;
  const target = projection.panes.find((pane) =>
    pane.windowId !== sourceId && pointInRectangle(column, row, pane.rect)
  );
  if (!target) return;
  const edge = tiledDockEdgeAt(target.rect, column, row);
  const changed = edge
    ? tiledWorkspace.dock(sourceId, target.windowId, edge, { ratio: 0.5 })
    : tiledWorkspace.swap(sourceId, target.windowId);
  if (!changed) return;
  tiledWorkspace.focus(sourceId);
  syncWindowManagerOrderFromTiles();
  workbenchController.focusWindow(sourceId);
  persistWebWorkspaceState();
  push(`${edge ? `dock ${edge}` : "swap"} ${sourceId} with ${target.windowId}`);
}

function tiledDockEdgeAt(rect: Rectangle, column: number, row: number): TiledWorkspaceDockEdge | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.max(0, Math.min(1, (column - rect.column) / rect.width));
  const y = Math.max(0, Math.min(1, (row - rect.row) / rect.height));
  const distances: Array<{ edge: TiledWorkspaceDockEdge; distance: number }> = [
    { edge: "left", distance: x },
    { edge: "right", distance: 1 - x },
    { edge: "top", distance: y },
    { edge: "bottom", distance: 1 - y },
  ];
  distances.sort((left, right) => left.distance - right.distance);
  return distances[0]!.distance <= 0.3 ? distances[0]!.edge : null;
}

function pointInRectangle(column: number, row: number, rect: Rectangle): boolean {
  return column >= rect.column && row >= rect.row &&
    column < rect.column + rect.width && row < rect.row + rect.height;
}

function rectangleContains(outer: Rectangle, inner: Rectangle): boolean {
  return inner.column >= outer.column && inner.row >= outer.row &&
    inner.column + inner.width <= outer.column + outer.width &&
    inner.row + inner.height <= outer.row + outer.height;
}

function rectangleArea(rect: Rectangle): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function blitWorkspace(frame: string[], virtual: string[], bounds: Rectangle, offset: number, width: number): void {
  for (let row = 0; row < bounds.height; row += 1) {
    write(frame, bounds.row + row, bounds.column, fit(virtual[offset + row] ?? "", width));
  }
}

function renderWorkspaceScrollbar(frame: string[], bounds: Rectangle): void {
  const overflow = workspaceScroll.inspectOverflow();
  const commands = workbenchWorkspaceScrollbarRenderCommandsInto(workspaceScrollbarRenderCommands, {
    bounds,
    visible: overflow.rows.scrollbarVisible,
    thumb: overflow.rows.thumb,
  });
  for (const command of commands) {
    hitTargets.add(command.rect, { type: "workspaceScrollbar" });
    for (const cell of command.cells) {
      write(frame, cell.row, cell.column, paint(cell.glyph, theme().accent, theme().backgroundSoft, true));
    }
  }
}

function renderDropdownOverlay(frame: string[], workspaceBounds: Rectangle, workspaceOffsetRows: number): void {
  renderApiWorkbenchDropdownOverlay<string[]>({
    frame,
    overlay: dropdownOverlay,
    workspaceBounds,
    screenBounds: { column: 0, row: 0, width: cols(), height: rowsCount() },
    workspaceOffsetRows,
    commands: dropdownOverlayRenderCommands,
    theme: theme(),
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    fillRect,
    addHit: (rect, action) => {
      if (action.type === "theme" || action.type === "layout" || action.type === "control") {
        hitTargets.add(rect, action);
      }
    },
  });
}

function renderThreeConfigModal(frame: string[]): void {
  if (!threeConfigOpen.peek()) return;
  const currentTheme = theme();
  const options = asciiConfigs.editorSignal().peek();
  const header = ` ${asciiPresetLabel(options.preset)} · ${
    terminalGlyphStyleLabel(options.terminalGlyphStyle)
  } · web preview `;
  renderApiWorkbenchThreeConfigModal({
    frame,
    bounds: { column: 0, row: 0, width: cols(), height: rowsCount() },
    rows: asciiConfigRows,
    selectedIndex: threeConfigSelected.peek(),
    title: header,
    frameTitle: "Three ASCII Config",
    titleStyle: { fg: currentTheme.background, bg: currentTheme.accent, bold: true },
    helpText: "Use arrows/clicks to adjust. A apply, Enter OK, Esc cancel.",
    footerText: "This editor persists to the web workspace snapshot.",
    footerStyle: { fg: currentTheme.soft, bg: currentTheme.panelSoft },
    rowSplitMinWidth: 1,
    activateRowHits: true,
    buffers: asciiConfigBuffers,
    theme: currentTheme,
    contrastText,
    fit,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    fillRect,
    drawFrame,
    rowText: (row, layout) =>
      formatWorkbenchAsciiConfigRowText(row, options, {
        kittyStatus: "browser preview",
        trackWidth: Math.max(8, Math.min(18, layout.inner.width - 42)),
      }),
    rowStyle: (selected, nextTheme) =>
      selected
        ? { fg: contrastText(nextTheme.warn, nextTheme.background, nextTheme.text), bg: nextTheme.warn, bold: true }
        : { fg: nextTheme.text, bg: nextTheme.panelSoft },
    addHit: (rect, action) => hitTargets.add(rect, action),
  });
}

function renderModalOverlay(frame: string[]): void {
  if (!modal.openState.peek()) return;
  renderApiWorkbenchModalOverlay({
    frame,
    bounds: { column: 0, row: 0, width: cols(), height: rowsCount() },
    inspection: modal.inspect(),
    buffers: modalBuffers,
    theme: theme(),
    contrastText,
    fit,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    fillRect,
    drawFrame,
    maxWidth: 74,
    addHit: (rect, action) => hitTargets.add(rect, action),
  });
}

function push(message: string): void {
  log.value = appendBoundedWorkbenchLogRow(log.peek(), `${new Date().toLocaleTimeString()} ${message}`, 40);
}

function openWorkbenchModal(): void {
  closeThemeMenu();
  closeThreeConfigModal();
  modal.open(workbenchDemoModalContent({ profile: "web" }));
  push("modal opened");
}

function openHelpModal(): void {
  closeThemeMenu();
  closeThreeConfigModal();
  modal.open(workbenchHelpModalContent({ profile: "web" }));
  push("help opened");
}

function openQuitModal(): void {
  closeThemeMenu();
  closeThreeConfigModal();
  modal.open(workbenchQuitModalContent({ profile: "web" }));
  push("quit confirmation");
}

function openThreeConfigModal(id: PanelId): void {
  closeThemeMenu();
  modal.close();
  activatePanel(id);
  asciiConfigs.openEditor("three");
  push("three config opened");
}

function closeThreeConfigModal(): void {
  asciiConfigs.closeEditor();
}

function restoreThreeConfigBaseline(): void {
  if (!asciiConfigs.restoreEditor()) return;
  persistWebWorkspaceState();
  push("three config canceled");
}

function applyThreeConfigModalAction(action: WorkbenchAsciiConfigModalAction): void {
  if (action === "cancel") {
    restoreThreeConfigBaseline();
    closeThreeConfigModal();
    return;
  }
  asciiConfigs.commitEditor();
  persistWebWorkspaceState();
  push("three config applied");
  if (action === "ok") closeThreeConfigModal();
}

function handleThreeConfigKey(event: { key: string; shift?: boolean }): void {
  asciiConfigs.handleEditorKey(event, asciiConfigRows.length, applyThreeConfigModalAction, applyThreeConfigHit);
}

function applyThreeConfigHit(index: number, action: ConfigHitAction): void {
  const next = asciiConfigs.applyEditorRow(
    index,
    action,
    asciiConfigRows,
    ASCII_DEMO_PRESET_IDS,
  );
  if (next) push(`three ${next.message}`);
}

function applyModalAction(actionId: string): void {
  if (actionId === "details") {
    modal.open(workbenchModalDetailsContent({ profile: "web" }));
    push("modal details");
    return;
  }
  if (actionId === "back") {
    openWorkbenchModal();
    return;
  }
  if (actionId === "confirm") {
    modal.open(workbenchModalConfirmedContent({ profile: "web" }));
    push("modal confirmed");
    return;
  }
  if (actionId === "controls") {
    modal.close();
    focus("controls");
    return;
  }
  if (actionId === "three-focus") {
    modal.close();
    focus("three");
    return;
  }
  if (actionId === "quit") {
    mount.style.display = "none";
    modal.close();
    push("web workbench hidden");
    return;
  }
  modal.close();
  push(`modal ${actionId}`);
}

function renderControls(frame: string[], rect: Rectangle): void {
  const t = theme();
  const result = renderApiWorkbenchControls({
    frame,
    rect,
    state: controlsModel.viewState(webControlViewOverrides),
    buffers: controlViewBuffers,
    theme: t,
    contrastText,
    fit,
    paint: (value, style) => paint(value, style.fg, style.bg, style.bold),
    write,
    addHit: (hitRect, action) => hitTargets.add(hitRect, action),
  });
  if (result.dropdownOverlay) dropdownOverlay = result.dropdownOverlay;
}

function applyControlHit(
  id: ControlId,
  action: ControlHitAction,
  rect?: Rectangle,
  x?: number,
  index?: number,
): void {
  activatePanel("controls");
  controlsModel.applyHit(id, action, rect, x, index);
  push(`control ${id} ${action}`);
}

function selectDataRow(index: number): void {
  activatePanel("data");
  table.select(index);
  push(`data row ${table.selectedKey() ?? index}`);
}

function handleControlsKey(event: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): void {
  controlsModel.handleKey(event, applyControlHit);
}

function blurTextControl(): void {
  const previous = activeControl.peek();
  activatePanel("controls");
  controlsModel.moveActive(1);
  push(`control ${previous} blur`);
}

function focusNextControl(delta = 1): void {
  activatePanel("controls");
  const next = controlsModel.moveActiveAtEdge(delta);
  if (next) {
    push(`control ${activeControl.peek()} focus`);
    return;
  }
  delta < 0 ? focusPrevious() : focusNext();
}
function isTextControlActive(): boolean {
  return isApiWorkbenchTextControlActive(activePanel(), "controls", activeControl.peek());
}
function write(frame: string[], row: number, column: number, value: string): void {
  framePainter.write(frame, row, column, value);
}

function writeStyledRows(frame: string[], rect: Rectangle, rows: readonly RowStyle[], sourceStart = 0): void {
  framePainter.writeRows(frame, rect, rows, sourceStart);
}

function fit(value: string, width: number): string {
  return fitCellText(value, width);
}
function fillRect(frame: string[], rect: Rectangle, bg: string): void {
  framePainter.fillRect(frame, rect, bg);
}

function drawFrame(frame: string[], rect: Rectangle, title: string, selected: boolean): void {
  const commands = workbenchFrameRenderCommandsInto(windowFrameRenderCommands, windowFrameBoxLines, {
    rect,
    title,
    active: selected,
    theme: theme(),
  });
  for (const command of commands) {
    if (command.kind === "fill") {
      fillRect(frame, command.rect, command.bg);
    } else {
      write(
        frame,
        command.row,
        command.column,
        paint(command.text, command.style.fg, command.style.bg, command.style.bold),
      );
    }
  }
}

function writeButton(
  frame: string[],
  row: number,
  column: number,
  label: string,
  options: {
    state?: "base" | "active" | "disabled";
    tone?: ButtonTone;
    compact?: boolean;
    maxWidth?: number;
  } = {},
): number {
  return framePainter.writeButton(frame, row, column, label, options);
}

function paint(value: string, fg = theme().text, bg = theme().background, bold = false): string {
  return framePainter.paint(value, { fg, bg, bold });
}
function findHit(x: number, y: number): HitTarget<Hit> | undefined {
  return findApiWorkbenchHitTarget({
    targets: hitTargets,
    x,
    y,
    bounds: { column: 0, row: 0, width: cols(), height: rowsCount() },
    touchOptimized: isTouchOptimizedLayout(),
  });
}

function isTouchOptimizedLayout(): boolean {
  const coarsePointer = globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return isApiWorkbenchTouchOptimizedLayout({
    coarsePointer,
    columns: cols(),
    rows: rowsCount(),
  });
}

function updateWebCanvasSemantics(): void {
  const active = activePanel();
  const titlebar = layoutWorkbenchTitlebar({
    rect: { column: 0, row: 0, width: 80, height: 1 },
    title: panelTitle(active),
    showConfig: active === "three",
    maximized: fullscreenPanel() === active,
  });
  const controls = titlebar.buttons.map((button) =>
    `${button.accessibilityLabel}${button.shortcut ? ` (${button.shortcut})` : ""}`
  ).join(", ");
  const label = `API Workbench canvas. Active panel: ${panelTitle(active)}. ${
    layoutMode.peek() ? "Layout mode active. " : ""
  }Titlebar controls: ${controls}. Press F6 to toggle layout mode.`;
  if (label === lastSemanticLabel) return;
  lastSemanticLabel = label;
  mount.setAttribute("role", "application");
  mount.setAttribute("aria-label", label);
  mount.setAttribute("aria-keyshortcuts", "F6");
}

function initialThemeIndex(): number {
  try {
    const saved = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    const index = themes.findIndex((entry) => entry.id === saved || entry.label === saved);
    return index >= 0 ? index : 0;
  } catch (error) {
    reportWebStorageDiagnostic("theme-read", "localStorage", error);
    return 0;
  }
}

type WebWorkspaceState = WorkbenchPanelWorkspaceState<PanelId> & {
  terminal?: TerminalWorkspaceSnapshot;
  ascii?: ThreeAsciiConfigOptions;
  windowStates?: Partial<Record<PanelId, WebPanelWindowState>>;
  tiledLayout?: TiledWorkspaceSnapshot;
};

function initialWebPanelWindowState(state: WebWorkspaceState, id: PanelId): WebPanelWindowState {
  const saved = state.windowStates?.[id];
  if (saved === "normal" || saved === "minimized" || saved === "closed") return saved;
  return state.minimized?.[id] ? "minimized" : "normal";
}

function loadCachedWebWorkspaceState(): WebWorkspaceState {
  return loadWorkbenchPanelWorkspaceCache({
    key: WORKSPACE_STORAGE_KEY,
    normalize: normalizeWebWorkspaceState,
    fallback: {
      active: "three",
      minimized: {
        explorer: true,
        inspector: true,
        data: true,
        controls: true,
        logs: true,
        htmlLayout: true,
        terminal: true,
      },
    },
    diagnostics: storageDiagnostics,
    diagnosticSource: "web-workbench",
  });
}

async function hydrateWebWorkspaceState(): Promise<void> {
  await hydrateWorkbenchPanelWorkspaceStore({
    key: "default",
    store: webWorkspaceStore,
    normalize: normalizeWebWorkspaceState,
    apply: applyWebWorkspaceState,
    diagnostics: storageDiagnostics,
    diagnosticSource: "web-workbench",
  });
}

function applyWebWorkspaceState(state: WebWorkspaceState): void {
  applyingWebWorkspaceState = true;
  try {
    const current = inspectWorkbenchWindowSignalState<PanelId>(webWindows, {
      windowIds: panelIds,
      defaultActiveId: "three",
    });
    applyWorkbenchWindowSignalState<PanelId>(webWindows, {
      activeId: state.active ?? current.activeId,
      fullscreenId: state.maximized === undefined ? current.fullscreenId : state.maximized,
      minimized: state.minimized ? { ...current.minimized, ...state.minimized } : current.minimized,
    }, {
      windowIds: panelIds,
      createWindow: createWebPanelWindow,
    });
    webWindows.windows.value = webWindows.windows.peek().map((entry) => ({
      ...entry,
      state: initialWebPanelWindowState(state, entry.id as PanelId),
    }));
    webWindows.activeId.value = state.active;
    webWindows.fullscreenId.value = state.maximized ?? undefined;
    if (state.tileDensity !== undefined) tileDensity.value = Math.max(-3, Math.min(3, Math.floor(state.tileDensity)));
    if (state.ascii) asciiConfigs.setForWindow("three", state.ascii);
    if (state.terminal) applyWebTerminalWorkspaceSnapshot(state.terminal);
    if (state.tiledLayout) tiledWorkspace.restore(state.tiledLayout, tiledWindowInventory());
    else tiledWorkspace.reconcile(tiledWindowInventory(), { activeWindowId: state.active });
    tiledWorkspace.focus(state.active ?? activePanel());
    syncWindowManagerOrderFromTiles();
  } finally {
    applyingWebWorkspaceState = false;
  }
  persistWebWorkspaceState();
  draw();
}

function normalizeWebWorkspaceState(value: unknown): WebWorkspaceState {
  const candidate = value && typeof value === "object" ? value as WebWorkspaceState : undefined;
  const state = normalizeWorkbenchPanelWorkspaceState(candidate, {
    panelIds,
    defaultActive: "three",
    minTileDensity: -3,
    maxTileDensity: 3,
  });
  const terminal = normalizeWebTerminalWorkspaceSnapshot(candidate?.terminal);
  const asciiOptions = candidate?.ascii
    ? normalizeAsciiOptions(candidate.ascii, createDefaultWorkbenchAsciiOptions())
    : undefined;
  const windowStates = {} as Record<PanelId, WebPanelWindowState>;
  const rawWindowStates = candidate?.windowStates;
  for (const id of panelIds) {
    const saved = rawWindowStates?.[id];
    windowStates[id] = saved === "normal" || saved === "minimized" || saved === "closed"
      ? saved
      : state.minimized?.[id]
      ? "minimized"
      : "normal";
  }
  const normalIds = panelIds.filter((id) => windowStates[id] === "normal");
  const active = state.active && windowStates[state.active] === "normal" ? state.active : normalIds[0] ?? state.active;
  const maximized = state.maximized && windowStates[state.maximized] === "normal" ? state.maximized : null;
  const minimized = {} as Record<PanelId, boolean>;
  for (const id of panelIds) minimized[id] = windowStates[id] === "minimized";
  const tiledLayout = normalizeWebTiledLayout(candidate?.tiledLayout);
  return {
    ...state,
    active,
    maximized,
    minimized,
    windowStates,
    ...(terminal ? { terminal } : {}),
    ...(asciiOptions ? { ascii: asciiOptions } : {}),
    ...(tiledLayout ? { tiledLayout } : {}),
  };
}

function persistWebWorkspaceState(): void {
  if (applyingWebWorkspaceState) return;
  const windows = inspectWorkbenchWindowSignalState<PanelId>(webWindows, {
    windowIds: panelIds,
    defaultActiveId: "three",
  });
  tiledWorkspace.reconcile(tiledWindowInventory(), { activeWindowId: windows.activeId });
  if (windows.activeId) tiledWorkspace.focus(windows.activeId);
  const windowStates = {} as Record<PanelId, WebPanelWindowState>;
  for (const entry of webWindows.inspect().windows) {
    windowStates[entry.id as PanelId] = entry.state === "closed"
      ? "closed"
      : entry.state === "minimized"
      ? "minimized"
      : "normal";
  }
  persistWorkbenchPanelWorkspaceState({
    active: windows.activeId,
    maximized: windows.fullscreenId,
    minimized: windows.minimized,
    tileDensity: tileDensity.peek(),
    windowStates,
    tiledLayout: tiledWorkspace.snapshot(),
    ascii: cloneAsciiOptions(ascii.peek()),
    terminal: snapshotTerminalWorkspace(webTerminalWorkspace),
  }, {
    cacheKey: WORKSPACE_STORAGE_KEY,
    storeKey: "default",
    store: webWorkspaceStore,
    diagnostics: storageDiagnostics,
    diagnosticSource: "web-workbench",
  });
}

function normalizeWebTiledLayout(value: unknown): TiledWorkspaceSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  try {
    return normalizeTiledWorkspaceSnapshot(value as TiledWorkspaceSnapshot);
  } catch (error) {
    reportWebStorageDiagnostic("tiled-layout-normalize", "workspace-state", error);
    return undefined;
  }
}

function normalizeWebTerminalWorkspaceSnapshot(value: unknown): TerminalWorkspaceSnapshot | undefined {
  return normalizeWebTerminalWorkspaceSnapshotSource(value, {
    onError: (error) => reportWebStorageDiagnostic("terminal-workspace-normalize", "workspace-state", error),
  });
}

function applyWebTerminalWorkspaceSnapshot(snapshot: TerminalWorkspaceSnapshot): void {
  const restored = normalizeTerminalWorkspaceSnapshot(snapshot);
  webTerminalWorkspace.sessions.value = restored.sessions;
  webTerminalWorkspace.activeId.value = restored.activeId;
  webTerminalWorkspace.layout.value = restored.layout;
  webTerminalScreenKeys.clear();
}

function persistThemeIndex(index: number): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, themes[index]?.id ?? themes[0]!.id);
  } catch (error) {
    reportWebStorageDiagnostic("theme-persist", "localStorage", error);
  }
}

function reportWebStorageDiagnostic(operation: string, storage: string, error: unknown): void {
  storageDiagnostics.report({
    source: "web-workbench",
    storage,
    operation,
    error,
  });
}

function theme(): ThemeSpec {
  return themes[themeIndex.value]!;
}
function cols(): number {
  return host.platform.size.value.columns;
}
function rowsCount(): number {
  return host.platform.size.value.rows;
}
