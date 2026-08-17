import { DataTableController } from "../src/components/data_table.ts";
import { createFileExplorerTree, FileExplorerController } from "../src/components/file_explorer.ts";
import { MenuBarController } from "../src/components/menu_bar.ts";
import { ScrollAreaController } from "../src/components/scroll_area.ts";
import {
  appendBoundedWorkbenchLogRow,
  blitWorkbenchFrameCells,
  centerCellText as centerText,
  clampWorkbenchTileDensity,
  contrastText,
  dispatchWorkbenchTextPromptInput,
  findWorkbenchWorkspace,
  fitCellText as fit,
  formatWorkbenchDiagnosticStatus,
  HitTargetStack,
  initialWorkbenchDiagnosticLogRows,
  isWorkbenchVisualizationWindowId,
  loadWorkbenchWorkspaceStorage,
  persistWorkbenchWorkspaceStorage,
  prepareWorkbenchFrame,
  renderFrameRow,
  renderFrameSlice,
  resolveWorkbenchGlobalKey,
  resolveWorkbenchMenuFocusKey,
  resolveWorkbenchScreenDropdownKey,
  resolveWorkbenchTerminalOutputKeyAction,
  resolveWorkbenchTerminalShellKeyAction,
  subscribeWorkbenchDiagnosticLog,
  translateHitTargets,
  type WorkbenchAnsiScreenFlushStats,
  WorkbenchAnsiScreenPainter,
  workbenchBuiltInWindowTogglePlan,
  type WorkbenchButtonTone,
  type WorkbenchDropdownOverlayRenderCommand,
  workbenchEmptyWorkspaceMessage,
  type WorkbenchFrame,
  workbenchFullscreenWindowRect,
  type WorkbenchHeaderLayout,
  type WorkbenchMenuBarHitLayout,
  type WorkbenchScrollbarRenderCommand,
  workbenchStandardTopMenuIdForItem,
  workbenchTerminalOutputRowsInto,
  type WorkbenchTerminalOutputToolbarAction,
  type WorkbenchTerminalOutputWindowRow,
  workbenchVisibleWindowRectsInto,
  workbenchVisualizationWindowId,
  workbenchVisualizationWindowRegistrationPlan,
  workbenchVisualizationWindowTogglePlan,
  type WorkbenchWindowOption,
  workbenchWindowOptionMenuLabelsInto,
  workbenchWindowOptionTogglePlan,
  type WorkbenchWorkspace,
  type WorkbenchWorkspaceManagedWindow,
  workbenchWorkspaceScrollbarRenderCommandsInto,
  WorkbenchWorkspaceViewportController,
  type WorkbenchWorkspaceWindow,
  workbenchWorkspaceWindowEntries,
  writeFrame,
} from "../src/app/workbench/mod.ts";
import {
  activeWorkspaceNameAfterWindowMutation,
  API_WORKBENCH_WORKSPACE_STORE_KEY,
  apiWorkbenchWorkspaceStorageLabel,
  apiWorkbenchWorkspaceStorageOptions,
  buildWorkspaceMenuEntriesInto,
  createApiWorkbenchWorkspaceStore,
  currentWorkspaceVisualizationIdsInto as workspaceVisualizationIdsFromWindowsInto,
  currentWorkspaceWindowsInto as currentWorkspaceWindowsFromIdsInto,
  defaultWorkspaceName as defaultWorkspaceNameFromCount,
  deleteWorkspaceModalContent,
  deleteWorkspaceState,
  renameWorkspaceModalContent,
  renameWorkspaceState,
  resolveWorkspaceMenuCommand,
  saveWorkspaceModalContent,
  saveWorkspaceState,
  workbenchWindowClosePlan,
  workspaceDeletedModalContent,
  workspaceLoadClosePlan,
  type WorkspaceMenuEntry,
  workspaceMenuLabelsInto,
  workspaceMissingModalContent,
  workspaceNameModalBody as buildWorkspaceNameModalBody,
  workspaceRenamedModalContent,
  workspaceSavedModalContent,
} from "../src/app/workbench_workspace_menu.ts";
import {
  readWorkbenchVerifiedConsoleSize,
  syncWorkbenchTerminalSize,
  WorkbenchFullRepaintPolicy,
} from "../src/app/workbench_repaint_policy.ts";
import {
  type ApiWorkbenchThreePressureInspection,
  ApiWorkbenchThreeRuntimeController,
  WorkbenchThreeCadenceMeter,
  WorkbenchThreeOverlayPressureGate,
} from "../src/app/workbench_three_runtime.ts";
import {
  apiWorkbenchThreeFrameIntervalForCells,
  createWorkbenchThreeWindowState,
  hideWorkbenchThreeRect,
  resolveWorkbenchThreeFullscreenAsciiOptions,
  resolveWorkbenchThreeLiveAsciiOptions,
  resolveWorkbenchThreeRuntimeBudgetSnapshot,
  resolveWorkbenchThreeRuntimeBudgetSourceId,
  resolveWorkbenchThreeTiledAsciiOptions,
  resolveWorkbenchThreeWindowStateInto,
  sameWorkbenchThreeAsciiOptions,
  setWorkbenchThreeRect,
  setWorkbenchThreeSceneSignal,
  WORKBENCH_THREE_DRAW_INTERVAL_MS,
  WORKBENCH_THREE_FULLSCREEN_MIN_CELLS,
  WORKBENCH_THREE_HIDDEN_RECT,
  WORKBENCH_THREE_INITIAL_CELLS,
  workbenchStudioScene,
  workbenchThreeBodyRect,
  workbenchThreeContentGraphicsRect,
  workbenchThreeLiveRenderCells,
  type WorkbenchThreeScene as SharedWorkbenchThreeScene,
  type WorkbenchThreeWindowState,
  workbenchThreeWindowStateIsInteractive,
  workbenchVisualizationThreeScene,
} from "../src/app/workbench_three_policy.ts";
import {
  WorkbenchController,
  workbenchWindowActionLog,
  type WorkbenchWindowActionLogKind,
} from "../src/app/workbench/controller.ts";
import {
  WorkbenchButtonRowBufferCache,
  WorkbenchModalBufferCache,
  WorkbenchShelfBufferCache,
  WorkbenchTerminalBufferCache,
  WorkbenchTerminalSessionTabBufferCache,
} from "../src/app/workbench_buffers.ts";
import {
  createDefaultWorkbenchAsciiOptions,
  defaultWorkbenchAsciiConfigRows,
  formatWorkbenchAsciiConfigRowText,
  formatWorkbenchAsciiConfigTitle,
  WorkbenchAsciiConfigController,
  type WorkbenchAsciiConfigRow,
  workbenchAsciiRendererModeLabel,
} from "../src/app/workbench_ascii.ts";
import {
  type WorkbenchAsciiConfigModalAction,
  WorkbenchAsciiConfigModalBufferCache,
} from "../src/app/workbench_ascii_modal.ts";
import { handleInput } from "../src/input.ts";
import type { KeyPressEvent, MousePressEvent, MouseScrollEvent, PasteEvent } from "../src/input_reader/types.ts";
import {
  routeTerminalKeyPress,
  routeTerminalMouse,
  routeTerminalPaste,
  type TerminalInputMode,
  terminalMouseRoutingFromPrivateModes,
} from "../src/app/terminal_input.ts";
import { DiagnosticsCollector } from "../src/runtime/diagnostics.ts";
import { formatProcessCommandLine, ProcessSessionController } from "../src/runtime/process_session.ts";
import { FrameScheduler } from "../src/runtime/render_loop.ts";
import type { TerminalBackend } from "../src/runtime/terminal_backend.ts";
import type { TerminalShellController } from "../src/runtime/terminal_shell.ts";
import { TerminalShellWorkspaceController } from "../src/runtime/terminal_shell_workspace.ts";
import { formatTerminalOutputWindowTitle, formatTerminalShellWindowTitle } from "../src/runtime/terminal_status.ts";
import { shellTerminalTemplate } from "../src/runtime/terminal_templates.ts";
import { Computed, Signal } from "../src/signals/mod.ts";
import { probeCompatibleWebGPUDevice } from "../src/three_ascii/webgpu_compat.ts";
import { Tui } from "../src/tui.ts";
import type { Rectangle } from "../src/types.ts";
import {
  TiledWorkspaceController,
  type TiledWorkspaceDockEdge,
  type TiledWorkspaceLayoutInspection,
  type TiledWorkspaceSeparatorAxis,
  type TiledWorkspaceSnapshot,
  type TiledWorkspaceWindow,
} from "../src/layout/tiled_workspace.ts";
import { textWidth } from "../src/utils/strings.ts";
import { maxTextWidth, type VisibleMenuSlice } from "../src/app/workbench_text.ts";
import {
  applyWorkbenchTerminalSearchPromptInput,
  resolveWorkbenchShellBackend,
  resolveWorkbenchTerminalProcessInputModeToggle,
  resolveWorkbenchTerminalShellInputModeToggle,
  workbenchTerminalSearchModalBody,
  type WorkbenchTerminalShellHeaderRow,
  type WorkbenchTerminalToolbarAction,
  workbenchTerminalToolbarStateFromSnapshot,
} from "../src/app/workbench_terminal.ts";
import {
  type ApiWorkbenchBuiltInWindowId,
  apiWorkbenchColumns,
  apiWorkbenchLiveRowsInto,
  apiWorkbenchPanelTitle,
  type ApiWorkbenchProcessRow,
  apiWorkbenchRows,
  type ApiWorkbenchThemeSpec,
  apiWorkbenchVisualizationSupportsThree,
  apiWorkbenchWindowTitle,
  createApiWorkbenchThemes,
  createApiWorkbenchWindowCatalog,
  nextApiWorkbenchTerminalSessionDraft,
  TERMINAL_OUTPUT_WINDOW_ID,
  TERMINAL_SHELL_WINDOW_ID,
} from "./api_workbench_catalog.ts";
import {
  type ApiWorkbenchControlId,
  ApiWorkbenchControlsModel,
  findApiWorkbenchHitTarget,
  isApiWorkbenchTextControlActive,
  isApiWorkbenchTouchOptimizedLayout,
  nextSortableDataColumn,
  resolveApiWorkbenchHitWindowId,
  resolveApiWorkbenchTitlebarHitAction,
  resolveApiWorkbenchWindowHScrollbarOffset,
  resolveApiWorkbenchWindowVScrollbarOffset,
  resolveApiWorkbenchWorkspaceScrollbarOffset,
} from "./api_workbench_controls.ts";
import { HTML_CSS_LAYOUT_WINDOW_ID } from "../src/markup/demo_fixtures.ts";
import { type HtmlCssLayoutRenderCommand, renderApiWorkbenchHtmlCssLayout } from "./html_css_layout_view.ts";
import { asciiDemoPresetIds } from "../src/three_ascii/demo_presets.ts";
import { cloneAsciiOptions, normalizeAsciiOptions, terminalGlyphStyleLabel } from "../src/three_ascii/options.ts";
import { AudioRegistry, resolveSourceFramesInto } from "./sources.ts";
import { makeStyle, requireInteractiveTerminal } from "./styles.ts";
import { SystemMonitor } from "./system_metrics.ts";
import { createWorkbenchThreePanelFrameView, type ThreePanelFrameView } from "./three_panel.ts";
import {
  addApiWorkbenchCpuHexTileHits,
  ApiWorkbenchControlsViewBufferCache,
  explorerTextRowsInto,
  renderApiWorkbenchControls,
  renderApiWorkbenchDataPanel,
  renderApiWorkbenchExplorerPanel,
  renderApiWorkbenchInspectorPanel,
  renderApiWorkbenchLogsPanel,
  renderApiWorkbenchVisualizationMissing,
  renderApiWorkbenchVisualizationTextWindow,
  renderApiWorkbenchVisualizationThreeChrome,
  workbenchDemoModalContent,
  workbenchHelpModalContent,
  workbenchModalConfirmedContent,
  workbenchModalDetailsContent,
  workbenchQuitModalContent,
  workbenchWindowContentSize,
} from "./workbench_panels.ts";
import { WorkbenchThreeGridProjectionCache } from "../src/app/workbench_three_grid.ts";
import {
  formatWorkbenchKittyGraphicsStatus,
  WorkbenchKittyGraphicsController,
} from "../src/runtime/graphics_surface.ts";
import { WorkbenchFramePainter } from "../src/app/workbench_row_render.ts";
import type { RowStyle, ThreeHeaderPerformance } from "../src/app/workbench_rows.ts";
import { shouldCountWorkbenchThreeGridPressure } from "../src/app/workbench_three_terminal_pressure.ts";
import {
  type WorkbenchThreePanelEntry,
  WorkbenchThreePanelRegistry,
  WorkbenchThreeViewportInteractionController,
} from "../src/app/workbench_three_panel_registry.ts";
import type { AsciiOptions, PanelRender, RenderContext, SlotConfig, SourceFrame, ThreeSceneMode } from "./types.ts";
import {
  monitorSourceIds,
  monitorSourceIdsInto,
  syntheticWorkbenchSourcesInto,
  syntheticWorkbenchSystem,
} from "./visualization_primitives.ts";
import {
  cpuHexGridColumnCount,
  type CpuHexNavigationKey,
  type CpuHexTileLayout,
  cpuHexTileLayoutInto,
  cpuHexTileScrollTarget,
  nextCpuHexLabel,
  selectedCpuHexTilesWith,
  topCpuProcessLabelForCpu,
} from "./visualization_system.ts";
import { renderVisualization, visualizations, visualizationUsesThreeRenderer } from "./visualizations.ts";
import type { ComputedLayoutBox } from "../src/layout/mod.ts";
import {
  type ApiWorkbenchDropdownOverlay,
  ApiWorkbenchWindowShellBufferCache,
  renderApiWorkbenchChromeHeader,
  renderApiWorkbenchDropdownOverlay,
  renderApiWorkbenchModalOverlay,
  renderApiWorkbenchShelf,
  renderApiWorkbenchStatus,
  renderApiWorkbenchTerminalOutputBody,
  renderApiWorkbenchTerminalOutputToolbar,
  renderApiWorkbenchTerminalSessionTabs,
  renderApiWorkbenchTerminalShellHeader,
  renderApiWorkbenchTerminalShellPanes,
  renderApiWorkbenchTerminalShellToolbar,
  renderApiWorkbenchThreeConfigModal,
  renderApiWorkbenchThreeFallback,
  renderApiWorkbenchThreeHeader,
  renderApiWorkbenchThreeSurface,
  renderApiWorkbenchWindowFrame,
  renderApiWorkbenchWindowShell,
  renderApiWorkbenchWindowTabs,
} from "./api_workbench_window_view.ts";

type BuiltInWindowId = ApiWorkbenchBuiltInWindowId;
type VisualizationWindowId = `viz:${string}`;
type WindowId = BuiltInWindowId | VisualizationWindowId;
type WorkbenchThreeScene = SharedWorkbenchThreeScene<ThreeSceneMode>;
type ControlId = ApiWorkbenchControlId;
type HitAction =
  | { type: "menu"; index: number }
  | { type: "quit" }
  | { type: "windowTab"; id: WindowId }
  | { type: "focus"; id: WindowId }
  | { type: "windowTitlebar"; id: WindowId }
  | { type: "layoutSeparator"; splitId: string; axis: TiledWorkspaceSeparatorAxis }
  | { type: "minimize"; id: WindowId }
  | { type: "maximize"; id: WindowId }
  | { type: "restore"; id: WindowId }
  | { type: "close"; id: WindowId }
  | { type: "threeConfig"; id: WindowId }
  | { type: "threeViewport"; id: WindowId }
  | { type: "asciiConfig"; index: number; action?: ConfigHitAction }
  | { type: "asciiConfigAction"; action: WorkbenchAsciiConfigModalAction }
  | { type: "asciiConfigBackdrop" }
  | { type: "theme"; index: number }
  | { type: "newWindow"; index: number }
  | { type: "workspace"; index: number }
  | { type: "view"; index: number }
  | { type: "layout"; index: number }
  | { type: "modalAction"; index: number }
  | { type: "control"; id: ControlId; action?: ControlHitAction; index?: number }
  | { type: "terminalOutput"; action: TerminalOutputAction }
  | { type: "terminalShell"; action: TerminalShellAction }
  | { type: "terminalShellPane"; id: string }
  | { type: "terminalShellSession"; id: string }
  | { type: "terminalShellContent" }
  | { type: "terminalShellCopyRow"; index: number }
  | { type: "dataRow"; index: number }
  | { type: "explorerRow"; index: number }
  | { type: "cpuHexTile"; id: VisualizationWindowId; label: string }
  | { type: "windowVScrollbar"; id: WindowId }
  | { type: "windowHScrollbar"; id: WindowId }
  | { type: "workspaceScrollbar" };
type ControlHitAction = "previous" | "next" | "activate" | "set" | "focus" | "toggle";
type ConfigHitAction = "previous" | "next" | "activate";
type TerminalOutputAction = WorkbenchTerminalOutputToolbarAction;
type TerminalShellAction = WorkbenchTerminalToolbarAction;
type ButtonTone = WorkbenchButtonTone;

type ThemeSpec = ApiWorkbenchThemeSpec;
type ProcessRow = ApiWorkbenchProcessRow;

type NewWindowOption = WorkbenchWindowOption;

type SavedWorkspace = WorkbenchWorkspace<AsciiOptions>;
type SavedWorkspaceWindow = WorkbenchWorkspaceWindow<AsciiOptions>;
type SavedWorkspaceManagedWindow = WorkbenchWorkspaceManagedWindow;

type WorkspaceNameMode = "save" | "rename";

type LayoutMenuAction =
  | "toggleMode"
  | "moveEarlier"
  | "moveLater"
  | "growHorizontal"
  | "shrinkHorizontal"
  | "growVertical"
  | "shrinkVertical"
  | "maximize"
  | "reset"
  | "wider"
  | "denser";

interface LayoutMenuEntry {
  label: string;
  action: LayoutMenuAction;
}

interface ViewMenuEntry {
  label: string;
  windowId: BuiltInWindowId;
}

const LAYOUT_MENU_ENTRIES: readonly LayoutMenuEntry[] = [
  { label: "Layout mode (F6)", action: "toggleMode" },
  { label: "Move pane earlier (Shift+Arrow)", action: "moveEarlier" },
  { label: "Move pane later (Shift+Arrow)", action: "moveLater" },
  { label: "Grow horizontally (Ctrl+Right)", action: "growHorizontal" },
  { label: "Shrink horizontally (Ctrl+Left)", action: "shrinkHorizontal" },
  { label: "Grow vertically (Ctrl+Down)", action: "growVertical" },
  { label: "Shrink vertically (Ctrl+Up)", action: "shrinkVertical" },
  { label: "Maximize / restore (Enter)", action: "maximize" },
  { label: "Reset tiled layout", action: "reset" },
  { label: "Wider tiles ([)", action: "wider" },
  { label: "Denser tiles (])", action: "denser" },
];

const VIEW_MENU_ENTRIES: readonly ViewMenuEntry[] = [
  { label: "Three ASCII", windowId: "three" },
  { label: "Explorer", windowId: "explorer" },
  { label: "Inspector", windowId: "inspector" },
  { label: "Activity / Diagnostics", windowId: "logs" },
  { label: "Data Table", windowId: "data" },
  { label: "Component Gallery", windowId: "controls" },
  { label: "HTML/CSS Layout", windowId: HTML_CSS_LAYOUT_WINDOW_ID },
  { label: "Terminal Output", windowId: TERMINAL_OUTPUT_WINDOW_ID },
  { label: "Shell", windowId: TERMINAL_SHELL_WINDOW_ID },
];

const terminalOutputButtonBuffers = new WorkbenchButtonRowBufferCache<TerminalOutputAction>();
const terminalShellButtonBuffers = new WorkbenchButtonRowBufferCache<TerminalShellAction>();
const terminalShellSessionTabBuffers = new WorkbenchTerminalSessionTabBufferCache();
const terminalShellBuffers = new WorkbenchTerminalBufferCache();
const terminalShellHeaderRows: WorkbenchTerminalShellHeaderRow[] = [];
const controlViewBuffers = new ApiWorkbenchControlsViewBufferCache();
const modalBuffers = new WorkbenchModalBufferCache<number>();
const themes: ThemeSpec[] = createApiWorkbenchThemes();
const themeLabels = themes.map((entry) => entry.label);
const themeMenuWidth = Math.max(20, maxTextWidth(themeLabels) + 6);
const rows: ProcessRow[] = apiWorkbenchRows;
const liveRowsBuffer: ProcessRow[] = [];
const columns = apiWorkbenchColumns;
const htmlCssLayoutBoxes: ComputedLayoutBox[] = [];
const htmlCssLayoutRenderCommands: HtmlCssLayoutRenderCommand[] = [];
const dataTableTextRows: string[] = [];
const dataTableBodyRows: RowStyle[] = [];
const dataTableRenderRows: RowStyle[] = [];
const explorerRenderRows: RowStyle[] = [];
const explorerContentTextRows: string[] = [];
const inspectorRenderRows: RowStyle[] = [];
const inspectorActionTextRows: string[] = [];
const inspectorWrappedTextRows: string[] = [];
const visualizationTextRows: string[] = [];
const visualizationRenderRows: RowStyle[] = [];
const threeFallbackRowsBuffer: RowStyle[] = [];
const threeStatusRowsBuffer: RowStyle[] = [];
const logRenderRows: RowStyle[] = [];
const terminalOutputContentRows: string[] = [];
const terminalOutputWindowRows: WorkbenchTerminalOutputWindowRow[] = [];
const ASCII_DEMO_PRESET_IDS = asciiDemoPresetIds();
const explorerKeys = new Set(["up", "down", "left", "right", "pageup", "pagedown", "home", "end", "space", "return"]);
const windowCatalog = createApiWorkbenchWindowCatalog(visualizations);
const builtInWindowOrder = windowCatalog.builtInWindowOrder;
const visualizationWindowOptionIds = windowCatalog.visualizationWindowOptionIds;
const visualizationWindowOptionById = windowCatalog.visualizationWindowOptionById;
const newWindowOptions: NewWindowOption[] = windowCatalog.newWindowOptions;
const WORKSPACE_STORE_KEY = API_WORKBENCH_WORKSPACE_STORE_KEY;

requireInteractiveTerminal("deno task api-workbench");

const workbenchDiagnostics = new DiagnosticsCollector(120);
const systemMonitor = new SystemMonitor({ historyLength: 72, diagnostics: workbenchDiagnostics });
await systemMonitor.start(1000);
const workbenchAudioRegistry = new AudioRegistry([]);
const workspaceStore = createApiWorkbenchWorkspaceStore();
const savedWorkspaces = new Signal<SavedWorkspace[]>(await loadWorkbenchWorkspaceStorage(workspaceStorageOptions()), {
  deepObserve: true,
});
const threeAsciiAvailable = new Signal(await probeCompatibleWebGPUDevice());
const asciiConfigs = new WorkbenchAsciiConfigController<WindowId>("three");
const ascii = asciiConfigs.root;
const threeConfigOpen = asciiConfigs.editorOpen;
const threeConfigSelected = asciiConfigs.editorSelectedIndex;

const tui = new Tui({
  style: makeStyle({ bg: themes[0]!.background }),
  refreshRate: 1000 / 24,
  enableMouse: true,
});
const kittyTextEncoder = new TextEncoder();
const kittyGraphics = await WorkbenchKittyGraphicsController.create({
  writer: {
    write: (data) => {
      tui.stdout.writeSync(kittyTextEncoder.encode(data));
    },
  },
  diagnostics: workbenchDiagnostics,
});
const terminalOutputSession = new ProcessSessionController({
  command: Deno.execPath(),
  args: [
    "eval",
    [
      "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
      "console.log('deno_tui terminal output window');",
      "console.log('press I in the workbench to enter raw input mode; Escape returns to workbench mode');",
      "const reader = Deno.stdin.readable.getReader();",
      "const decoder = new TextDecoder();",
      "for (let index = 1; index <= 20; index += 1) {",
      "  console.log(`stdout frame ${index}  ${new Date().toISOString()}`);",
      "  if (index % 3 === 0) console.error(`stderr checkpoint ${index}`);",
      "  const input = await Promise.race([reader.read(), sleep(250).then(() => undefined)]);",
      "  if (input?.value) console.log(`stdin bytes ${Array.from(input.value).join(',')}  text=${JSON.stringify(decoder.decode(input.value))}`);",
      "  if (input?.done) break;",
      "}",
      "console.log('process complete');",
    ].join("\n"),
  ],
  limit: 400,
  diagnostics: workbenchDiagnostics,
});
const terminalInputMode = new Signal<TerminalInputMode>("workbench");
const terminalShell = new TerminalShellWorkspaceController({
  backendFactory: createWorkbenchShellBackend,
  columns: 80,
  rows: 24,
  scrollbackLimit: 2000,
  diagnostics: workbenchDiagnostics,
  onUpdate: scheduleDraw,
});
terminalShell.add(shellTerminalTemplate({ id: "shell-1", title: "Shell 1" }), { activate: true });
const terminalShellInputMode = new Signal<TerminalInputMode>("raw");
terminalOutputSession.status.subscribe((status) => {
  if (status !== "running" && terminalInputMode.peek() === "raw") {
    terminalInputMode.value = "workbench";
  }
  scheduleDraw();
});
terminalOutputSession.exit.subscribe(scheduleDraw);
terminalOutputSession.output.lines.subscribe(scheduleDraw);
terminalOutputSession.output.follow.subscribe(scheduleDraw);
terminalInputMode.subscribe(scheduleDraw);
terminalShell.workspace.activeId.subscribe(scheduleDraw);
terminalShell.workspace.sessions.subscribe(scheduleDraw);
terminalShellInputMode.subscribe(scheduleDraw);

async function createWorkbenchShellBackend(): Promise<TerminalBackend> {
  const resolution = await resolveWorkbenchShellBackend({
    onFallback: (reason) => pushLog(`shell PTY unavailable; using process fallback: ${reason}`),
  });
  return resolution.backend;
}

handleInput(tui);
tui.dispatch();

const themeIndex = new Signal(0);
const workspaceNameDraft = new Signal("");
const workspaceNameMode = new Signal<WorkspaceNameMode | null>(null);
const workspaceTargetName = new Signal<string | null>(null);
const activeWorkspaceName = new Signal<string | null>(null);
const terminalShellSearchDraft = new Signal("");
const terminalShellSearchPromptOpen = new Signal(false);
const workbenchController = new WorkbenchController<"theme" | "newWindow" | "workspace" | "view" | "layout">({
  activeId: "three",
  windows: [
    { id: "explorer", title: apiWorkbenchPanelTitle("explorer"), minWidth: 26, minHeight: 12, state: "closed" },
    { id: "inspector", title: apiWorkbenchPanelTitle("inspector"), minWidth: 32, minHeight: 11, state: "closed" },
    { id: "data", title: apiWorkbenchPanelTitle("data"), minWidth: 42, minHeight: 12, state: "closed" },
    { id: "controls", title: apiWorkbenchPanelTitle("controls"), minWidth: 40, minHeight: 18, state: "closed" },
    { id: "logs", title: apiWorkbenchPanelTitle("logs"), minWidth: 36, minHeight: 12, state: "closed" },
    { id: "three", title: apiWorkbenchPanelTitle("three"), minWidth: 42, minHeight: 16 },
    {
      id: HTML_CSS_LAYOUT_WINDOW_ID,
      title: apiWorkbenchPanelTitle(HTML_CSS_LAYOUT_WINDOW_ID),
      minWidth: 46,
      minHeight: 16,
      state: "closed",
    },
    { id: TERMINAL_OUTPUT_WINDOW_ID, title: "Terminal Output", minWidth: 48, minHeight: 14, state: "closed" },
    { id: TERMINAL_SHELL_WINDOW_ID, title: "Shell", minWidth: 54, minHeight: 16, state: "closed" },
  ],
});
const topMenus = workbenchController.menus;
const windowManager = workbenchController.windows;
const tileDensity = new Signal(0);
const tiledWorkspace = new TiledWorkspaceController({ windows: tiledWindowInventory(), activeWindowId: "three" });
const genericModalBlocksThree = new Signal(false);
const controlsModel = new ApiWorkbenchControlsModel({
  themeLabels,
  commandText: "deno task health",
  commandPlaceholder: "type command",
  notesText:
    "Editable notes\nclick controls or type here. This text box keeps newline breaks and wraps long lines inside the control.",
  modalBody: [
    "Modal windows sit above the workspace and can contain text, menus, warnings, errors, and buttons.",
    "Use Tab or arrow keys to move between actions; Enter activates the selected action.",
  ],
  pushLog,
  openModal: openWorkbenchModal,
  applyModalAction,
  setTheme,
  onDropdownSelect: (item) => pushLog(`dropdown selected: ${item}`),
  onCommandSubmit: (value) => pushLog(`input submitted: ${value}`),
  onModalOpenChange: (open) => {
    genericModalBlocksThree.value = open && !threeConfigOpen.peek();
  },
});
const { density, livePreview, compactRows, modal, progress, activeControl } = controlsModel;
const commandLog = new Signal<string[]>(
  initialWorkbenchDiagnosticLogRows(workbenchDiagnostics, ["ready: API workbench mounted"], { maxLogEntries: 8 }),
  { deepObserve: true },
);
const unsubscribeWorkbenchDiagnostics = subscribeWorkbenchDiagnosticLog(workbenchDiagnostics, (message) => {
  pushLog(message);
  scheduleDraw();
});
const dynamicVisualizationWindows = new Signal<Record<VisualizationWindowId, string>>({}, { deepObserve: true });
const selectedCpuHexTiles = new Signal<Record<VisualizationWindowId, string>>({}, { deepObserve: true });
const screenPainter = new WorkbenchAnsiScreenPainter(tui.stdout);
const repaintPolicy = new WorkbenchFullRepaintPolicy();
let workbenchScreenSizeObserved = false;
const hitTargets = new HitTargetStack<HitAction>();
const screenFrame: Frame = [];
const workspaceVirtualFrame: Frame = [];
const windowContentFrames = new Map<WindowId, Frame>();
const themeMenuSlice: VisibleMenuSlice = { items: [], indexes: [] };
const newWindowMenuSlice: VisibleMenuSlice = { items: [], indexes: [] };
const newWindowMenuLabels: string[] = [];
const workspaceMenuSlice: VisibleMenuSlice = { items: [], indexes: [] };
const workspaceMenuEntryBuffer: WorkspaceMenuEntry[] = [];
const workspaceMenuLabelBuffer: string[] = [];
const viewMenuSlice: VisibleMenuSlice = { items: [], indexes: [] };
const viewMenuLabelBuffer: string[] = [];
const layoutMenuSlice: VisibleMenuSlice = { items: [], indexes: [] };
const layoutMenuLabelBuffer: string[] = [];
const realSourceIdBuffer: string[] = [];
const realSourceFrameBuffer: SourceFrame[] = [];
const syntheticSourceFrameBuffer: SourceFrame[] = [];
const cpuHexHitTileBuffer: CpuHexTileLayout[] = [];
const cpuHexRevealTileBuffer: CpuHexTileLayout[] = [];
const threeGridProjectionCache = new WorkbenchThreeGridProjectionCache();
const menuBarHitLayouts: WorkbenchMenuBarHitLayout[] = [];
const headerLayout: WorkbenchHeaderLayout = { menu: { column: 0, row: 0, width: 0, height: 1 } };
const shelfBuffers = new WorkbenchShelfBufferCache<WindowId>();
const windowShellBuffers = new ApiWorkbenchWindowShellBufferCache<WindowId>();
const workspaceScrollbarRenderCommands: WorkbenchScrollbarRenderCommand[] = [];
const dropdownOverlayRenderCommands: WorkbenchDropdownOverlayRenderCommand[] = [];
const visibleWindowRects = new Map<WindowId, Rectangle>();
const frameWidthHints = new WeakMap<Frame, number>();
const currentWorkspaceWindowBuffer: SavedWorkspaceWindow[] = [];
const currentWorkspaceVisualizationIdBuffer: string[] = [];
const workbenchThreeWindowState = createWorkbenchThreeWindowState<WindowId>("three");
const workbenchThreeRuntime = new ApiWorkbenchThreeRuntimeController({
  hasLiveThreeWindow: () => workbenchThreeWindowState.live,
  hasFullscreenThreeWindow: () => workbenchThreeWindowState.fullscreenThree,
  onPressureChange: pushLog,
});
const workbenchThreeLiveMaxCells = workbenchThreeRuntime.liveMaxCells;
const workbenchThreeFullscreenMaxCells = workbenchThreeRuntime.fullscreenMaxCells;
const workbenchThreeFrameInterval = workbenchThreeRuntime.frameInterval;
const workbenchThreePressureDetails: ApiWorkbenchThreePressureInspection = workbenchThreeRuntime
  .inspectPressureDetails();
const workbenchThreeHeaderPerformance: ThreeHeaderPerformance = {
  totalMs: 0,
  initMs: 0,
  sceneMs: 0,
  readbackMs: 0,
  assemblyMs: 0,
  cells: 0,
};
const workbenchThreeHeaderRows: RowStyle[] = [];
const WORKBENCH_THREE_OVERLAY_PRESSURE_COOLDOWN_FRAMES = 6;
const workbenchThreeOverlayPressureGate = new WorkbenchThreeOverlayPressureGate(
  WORKBENCH_THREE_OVERLAY_PRESSURE_COOLDOWN_FRAMES,
);
let dropdownOverlay: DropdownOverlay | null = null;
let tiledLayoutProjection: TiledWorkspaceLayoutInspection | null = null;
const tiledVisibleWindowIdBuffer = new Set<string>();
let layoutPointerSession: LayoutPointerSession | null = null;
let windowRenderContext: WindowRenderContext | null = null;
let workspacePlacementContext: WorkspacePlacementContext | null = null;
const drawScheduler = new FrameScheduler({ intervalMs: WORKBENCH_THREE_DRAW_INTERVAL_MS });
const renderedVisualizationThreePanels = new Set<VisualizationWindowId>();
const workbenchThreeIdleFrameInterval = apiWorkbenchThreeFrameIntervalForCells(WORKBENCH_THREE_INITIAL_CELLS, {
  live: false,
});
type Frame = WorkbenchFrame;
const framePainter = new WorkbenchFramePainter<Frame, ThemeSpec>({
  width: (target) => frameWidthHints.get(target) ?? currentWidth(),
  theme,
  style: makeStyle,
  contrastText,
  fit,
  write: writeFrame,
});
type DropdownOverlay = ApiWorkbenchDropdownOverlay;
type DynamicThreePanel = WorkbenchThreePanelEntry<ThreePanelFrameView, WorkbenchThreeScene>;
interface WorkbenchThreeRuntimeBudgetSource {
  id: WindowId;
  ascii: AsciiOptions;
  liveViewport: Pick<Rectangle, "width" | "height">;
}
interface WindowRenderContext {
  viewport: Rectangle;
  offset: { columns: number; rows: number };
}
interface WorkspacePlacementContext {
  rowDelta: number;
  columnDelta: number;
  clip: Rectangle;
}

interface WorkbenchScreenGeometry {
  workspace: Rectangle;
  auxiliaryRow?: number;
  statusRow?: number;
}

type LayoutPointerSession =
  | { kind: "separator"; splitId: string; axis: TiledWorkspaceSeparatorAxis }
  | { kind: "window"; sourceId: WindowId; startX: number; startY: number; moved: boolean };

const menu = new MenuBarController({
  items: [
    { id: "workspace", label: "File" },
    { id: "new", label: "Panels" },
    { id: "view", label: "View" },
    { id: "layout", label: "Layout" },
    { id: "theme", label: "Theme" },
    { id: "help", label: "Help" },
  ],
  onSelect: (item) => {
    if (item.id === "new") {
      workbenchController.toggleMenu("newWindow", newWindowOptions.length);
      pushLog(`${topMenus.isOpen("newWindow") ? "open" : "close"} new window menu`);
      return;
    }
    if (item.id === "theme") {
      topMenus.toggle("theme");
      pushLog(`${topMenus.isOpen("theme") ? "open" : "close"} theme menu`);
      return;
    }
    if (item.id === "workspace") {
      workbenchController.toggleMenu("workspace", workspaceMenuItemCount());
      pushLog(`${topMenus.isOpen("workspace") ? "open" : "close"} workspace menu`);
      return;
    }
    if (item.id === "view") {
      workbenchController.toggleMenu("view", VIEW_MENU_ENTRIES.length);
      pushLog(`${topMenus.isOpen("view") ? "open" : "close"} view menu`);
      return;
    }
    if (item.id === "layout") {
      workbenchController.toggleMenu("layout", LAYOUT_MENU_ENTRIES.length);
      pushLog(`${topMenus.isOpen("layout") ? "open" : "close"} layout menu`);
      return;
    }
    if (item.id === "help") {
      topMenus.close();
      openHelpModal();
      return;
    }
    topMenus.close(false);
    topMenus.focus();
    pushLog(`menu selected: ${item.label}`);
  },
});
const layoutMode = new Signal(false);
const workspaceScroll = new ScrollAreaController({ showScrollbar: true });
const workspaceViewport = new WorkbenchWorkspaceViewportController<WindowId>({ scroll: workspaceScroll });
const windowScrolls = new Map<WindowId, ScrollAreaController>(
  builtInWindowOrder.map((id) => [id, new ScrollAreaController({ showScrollbar: true })]),
);
const explorer = new FileExplorerController({
  root: createFileExplorerTree([
    "/README.md",
    "/mod.ts",
    "/app/api_workbench.ts",
    "/app/neon_exodus.ts",
    "/src/components/file_explorer.ts",
    "/src/components/tree.ts",
    "/src/components/modal.ts",
    "/src/components/data_table.ts",
    "/src/layout/window_manager.ts",
    "/src/layout/responsive.ts",
    "/src/app/commands.ts",
    "/src/runtime/worker_pool.ts",
    "/tests/widget_helpers.test.ts",
    "/tests/responsive_layout.test.ts",
  ]),
  onOpen: (entry) => pushLog(`open ${entry.path}`),
});
const table = new DataTableController<ProcessRow>({
  rows,
  columns,
  rowKey: (row) => row.id,
  initialState: { pageSize: 5, sort: { columnId: "latency", direction: "asc" } },
});
const threeBodyRect = new Signal<Rectangle>({ column: 0, row: 0, width: 0, height: 0 }, { deepObserve: true });
const threeGraphicsRect = new Signal<Rectangle>({ column: 0, row: 0, width: 0, height: 0 }, { deepObserve: true });
const workbenchThreeFullscreenTargetCells = new Signal(WORKBENCH_THREE_FULLSCREEN_MIN_CELLS);
const workbenchThreeEffectiveMaxCells = new Signal(WORKBENCH_THREE_INITIAL_CELLS);
const threeCadence = new WorkbenchThreeCadenceMeter();
const threeRuntimeAscii = new Signal<AsciiOptions>(ascii.peek());
const threeScene = new Computed<WorkbenchThreeScene | null>(() =>
  workbenchStudioScene({
    blocked: false,
    minimized: isWindowMinimized("three", windowManager.windows.value),
    available: threeAsciiAvailable.value,
    density: density.value.value,
    progress: progress.value.value,
    progressRatio: progress.ratio(),
    compactRows: compactRows.checked.value,
    livePreview: livePreview.checked.value,
    active: windowManager.activeId.value === "three",
    pressed: activeControl.value === "button",
  })
);
const threePanel = createWorkbenchThreePanelFrameView({
  rectangle: threeBodyRect,
  graphicsRectangle: threeGraphicsRect,
  scene: threeScene,
  ascii: threeRuntimeAscii,
  enabled: threeAsciiAvailable,
  graphicsSurface: () => kittyGraphics.surfaceFor(ascii.peek()),
  frameInterval: workbenchThreeFrameInterval,
  idleFrameInterval: workbenchThreeIdleFrameInterval,
  interactive: () => workbenchThreeWindowStateIsInteractive(workbenchThreeWindowState, "three"),
  maxRenderCells: workbenchThreeEffectiveMaxCells,
  diagnostics: workbenchDiagnostics,
  onFrame: () => {
    threeCadence.record();
    scheduleDraw();
  },
  onUpdate: scheduleDraw,
});
const visualizationThreePanels = new WorkbenchThreePanelRegistry<
  VisualizationWindowId,
  ThreePanelFrameView,
  WorkbenchThreeScene
>(createVisualizationThreePanel);
const visualizationThreeSupport = new Map<string, boolean>();
const threeViewportInteraction = new WorkbenchThreeViewportInteractionController<WindowId>({
  findHit,
  panelForWindow: (id) =>
    id === "three" ? threePanel : isVisualizationWindow(id) ? visualizationThreePanels.get(id)?.panel : undefined,
  focusWindow: (id) => void windowManager.focus(id),
});

tui.canvas.size.subscribe(() => {
  repaintPolicy.inspectScreenSize(tui.canvas.size.peek());
  screenPainter.clearScreen();
  repaintPolicy.resetFullRepaintClock();
  requestResizeFullRepaintWindowAfterInitialObservation();
  scheduleDraw();
});

tui.on("keyPress", (event) => {
  if (event.ctrl && event.key === "c" && !shellShouldReceiveCtrlC()) return;
  if (threeConfigOpen.peek()) {
    handleThreeConfigKey(event);
    draw();
    return;
  }
  if (modal.openState.peek()) {
    if (terminalShellSearchPromptOpen.peek() && handleTerminalShellSearchKey(event)) {
      draw();
      return;
    }
    if (workspaceNameMode.peek() && handleWorkspaceNameKey(event)) {
      draw();
      return;
    }
    modal.handleKeyPress(event);
    draw();
    return;
  }
  const menuState = topMenus.inspect();
  if (menuState.openId !== null) {
    handleScreenDropdownKey(event);
    draw();
    return;
  }
  if (menuState.focused) {
    handleMenuFocusKey(event);
    draw();
    return;
  }
  if (isTextControlActive() && event.key === "escape") {
    blurTextControl();
    draw();
    return;
  }
  if (isTextControlActive() && event.key === "tab") {
    focusNextControl(event.shift ? -1 : 1);
    draw();
    return;
  }
  if (isTextControlActive()) {
    handleControlsKey(event);
    draw();
    return;
  }
  handleWorkbenchKey(event);
  draw();
});

tui.on("paste", (event) => {
  if (handleTerminalShellPaste(event)) draw();
});

tui.on("mousePress", (event) => {
  if (handleLayoutPointerPress(event)) {
    draw();
    return;
  }
  const shellHit = findHit(event.x, event.y);
  if (shellHit?.action.type === "terminalShellContent" && handleTerminalShellMouse(event, shellHit.rect)) {
    draw();
    return;
  }
  if (event.release) {
    threeViewportInteraction.handlePress(event);
    return;
  }
  const threePress = threeViewportInteraction.handlePress(event);
  if (threePress.handled) {
    draw();
    return;
  }
  const hit = findHit(event.x, event.y);
  if (hit) applyHit(hit, event.x, event.y);
  draw();
});

tui.on("mouseScroll", (event) => {
  const shellHit = findHit(event.x, event.y);
  if (shellHit?.action.type === "terminalShellContent" && handleTerminalShellMouse(event, shellHit.rect)) {
    draw();
    return;
  }
  if (shellHit?.action.type === "terminalShellContent" && handleTerminalShellScroll(event)) {
    draw();
    return;
  }
  if (threeViewportInteraction.handleScroll(event)) {
    draw();
    return;
  }
  const hoveredHit = findHit(event.x, event.y);
  const hovered = hoveredHit
    ? resolveApiWorkbenchHitWindowId<WindowId>(hoveredHit.action, {
      terminalShell: TERMINAL_SHELL_WINDOW_ID,
      controls: "controls",
      data: "data",
      explorer: "explorer",
    })
    : undefined;
  if (hovered) {
    scrollWindow(hovered, event.shift ? event.scroll * 4 : 0, event.shift ? 0 : event.scroll);
  } else {
    workspaceScroll.scrollBy(0, event.scroll);
  }
  draw();
});

const liveTimer = setInterval(() => {
  if (livePreview.checked.peek()) {
    table.rows.value = apiWorkbenchLiveRowsInto(liveRowsBuffer, rows, density.value.peek(), 17);
    draw();
  }
}, 500);
const resizeTimer = setInterval(() => {
  if (syncTerminalSize() || repaintPolicy.fullRepaintWindowActive()) draw();
}, 100);

tui.on("destroy", () => {
  clearInterval(liveTimer);
  clearInterval(resizeTimer);
  menu.dispose();
  workspaceScroll.dispose();
  for (const scroll of windowScrolls.values()) {
    scroll.dispose();
  }
  controlsModel.dispose();
  workspaceNameDraft.dispose();
  workspaceNameMode.dispose();
  workspaceTargetName.dispose();
  activeWorkspaceName.dispose();
  terminalShellSearchDraft.dispose();
  terminalShellSearchPromptOpen.dispose();
  savedWorkspaces.dispose();
  threeRuntimeAscii.dispose();
  workbenchThreeFullscreenTargetCells.dispose();
  workbenchThreeEffectiveMaxCells.dispose();
  genericModalBlocksThree.dispose();
  dynamicVisualizationWindows.dispose();
  selectedCpuHexTiles.dispose();
  tileDensity.dispose();
  layoutMode.dispose();
  tiledWorkspace.dispose();
  explorer.dispose();
  table.dispose();
  threePanel.dispose();
  visualizationThreePanels.clear();
  threeScene.dispose();
  windowManager.dispose();
  threeBodyRect.dispose();
  threeGraphicsRect.dispose();
  void kittyGraphics.clear("visible");
  void terminalOutputSession.dispose();
  void terminalShell.dispose();
  terminalInputMode.dispose();
  terminalShellInputMode.dispose();
  unsubscribeWorkbenchDiagnostics();
  systemMonitor.stop();
  workbenchAudioRegistry.dispose();
  asciiConfigs.dispose();
  threeAsciiAvailable.dispose();
  workbenchThreeRuntime.dispose();
  drawScheduler.cancel();
});

tui.run();
syncTerminalSize();
draw();

function draw(): void {
  syncTerminalSize();
  const forceFullRepaint = repaintPolicy.shouldForceFullRepaint(performance.now());
  const width = currentWidth();
  const height = currentHeight();
  hitTargets.clear();
  dropdownOverlay = null;
  syncWorkbenchThreeWindowState();
  workbenchThreeRuntime.resetPressureSample();
  const frame = prepareWorkbenchFrame(screenFrame, height);
  renderHeader(frame);
  renderWorkspace(frame);
  syncWorkbenchThreeRuntimeBudgetForViewport(width, height, activeWorkbenchThreeRuntimeBudgetSource());
  workbenchThreeRuntime.syncFrameInterval();
  renderStatus(frame);
  renderActiveDropdownOverlay(frame);
  renderModalOverlay(frame);
  if (forceFullRepaint) screenPainter.reset();
  const flushStats = screenPainter.flush(frame, width, height, renderFrameRow, renderFrameSlice);
  updateThreeTerminalPressure(flushStats, { ignoreSample: forceFullRepaint });
}

function syncWorkbenchThreeRuntimeBudgetForViewport(
  width: number,
  height: number,
  source: WorkbenchThreeRuntimeBudgetSource,
): void {
  const snapshot = resolveWorkbenchThreeRuntimeBudgetSnapshot({
    id: source.id,
    fullscreenId: fullscreenWindowId(),
    ascii: source.ascii,
    liveMaxCells: workbenchThreeLiveMaxCells.peek(),
    liveViewport: source.liveViewport,
    fullscreenMaxCells: workbenchThreeFullscreenMaxCells.peek(),
    viewport: { width, height },
    fullscreenViewportPadding: { columns: 6, rows: 10 },
    isThreeWindow: (id) => isThreeRenderedWindow(id),
  });
  const fullscreenThree = workbenchThreeWindowState.fullscreenThree;
  const syncedFullscreenMaxCells = workbenchThreeRuntime.syncFullscreenTargetCells(
    snapshot.fullscreenTargetCells,
    fullscreenThree,
    snapshot.fullscreenViewportCells,
  );
  const liveViewportCells = Math.max(
    1,
    Math.floor(source.liveViewport.width) * Math.floor(source.liveViewport.height),
  );
  const syncedLiveMaxCells = workbenchThreeRuntime.syncLiveTargetCells(
    workbenchThreeLiveRenderCells(source.liveViewport),
    workbenchThreeWindowState.live && !fullscreenThree,
    liveViewportCells,
  );
  if (workbenchThreeFullscreenTargetCells.peek() !== snapshot.fullscreenTargetCells) {
    workbenchThreeFullscreenTargetCells.value = snapshot.fullscreenTargetCells;
  }
  const effectiveMaxCells = fullscreenThree
    ? syncedFullscreenMaxCells
    : Math.max(syncedLiveMaxCells, snapshot.effectiveMaxCells);
  if (workbenchThreeEffectiveMaxCells.peek() !== effectiveMaxCells) {
    workbenchThreeEffectiveMaxCells.value = effectiveMaxCells;
  }
  const runtimeAscii = fullscreenThree
    ? snapshot.runtimeAscii
    : resolveWorkbenchThreeLiveAsciiOptions(source.ascii, effectiveMaxCells);
  if (source.id === "three" && !sameWorkbenchThreeAsciiOptions(threeRuntimeAscii.peek(), runtimeAscii)) {
    threeRuntimeAscii.value = runtimeAscii;
  }
}

function updateThreeTerminalPressure(
  stats: WorkbenchAnsiScreenFlushStats,
  options: { ignoreSample?: boolean } = {},
): void {
  const overlayOpen = modal.openState.peek() || topMenus.inspect().openId !== null || threeConfigOpen.peek();
  const pressureGate = workbenchThreeOverlayPressureGate.resolve(overlayOpen);
  if (pressureGate.resetCadence) {
    threeCadence.reset();
  }
  if (pressureGate.resetPressureCounters) {
    workbenchThreeRuntime.resetPressureCounters();
  }
  if (!pressureGate.updatePressure) {
    return;
  }
  if (options.ignoreSample) {
    workbenchThreeRuntime.resetPressureSample();
    return;
  }
  workbenchThreeRuntime.updatePressureFromCadence(stats, threeCadence.inspect());
}

function scheduleDraw(): void {
  drawScheduler.schedule(draw);
}

function renderHeader(frame: Frame): void {
  const width = currentWidth();
  const menuState = topMenus.inspect();
  const openMenuId = menuState.openId;
  dropdownOverlay = renderApiWorkbenchChromeHeader({
    frame,
    width,
    menuItems: menu.items.peek(),
    // Highlight the active menu label only while the menu bar is engaged;
    // otherwise the bracket lingers as a fake focus indicator (QA-016).
    menuActiveIndex: menuState.focused || openMenuId !== null ? menu.activeIndex.peek() : -1,
    openMenuId,
    dropdownEntries: openMenuId === "theme"
      ? {
        theme: {
          visible: themeMenuSlice,
          labels: themeLabels,
          selectedIndex: themeIndex.peek(),
          preferredWidth: themeMenuWidth,
        },
      }
      : openMenuId === "newWindow"
      ? {
        newWindow: {
          visible: newWindowMenuSlice,
          labels: workbenchWindowOptionMenuLabelsInto(newWindowMenuLabels, newWindowOptions, windowManager.ids()),
          selectedIndex: workbenchController.menuIndex("newWindow"),
          preferredWidth: 28,
          maxVisibleItems: Math.max(6, currentHeight() - 5),
        },
      }
      : openMenuId === "workspace"
      ? {
        workspace: {
          visible: workspaceMenuSlice,
          labels: workspaceMenuLabelsInto(workspaceMenuLabelBuffer, workspaceMenuEntries()),
          selectedIndex: workbenchController.menuIndex("workspace"),
          preferredWidth: 30,
          maxVisibleItems: Math.max(6, currentHeight() - 5),
        },
      }
      : openMenuId === "view"
      ? {
        view: {
          visible: viewMenuSlice,
          labels: viewMenuLabels(),
          selectedIndex: workbenchController.menuIndex("view"),
          preferredWidth: 34,
          maxVisibleItems: Math.max(6, currentHeight() - 3),
        },
      }
      : openMenuId === "layout"
      ? {
        layout: {
          visible: layoutMenuSlice,
          labels: layoutMenuLabels(),
          selectedIndex: workbenchController.menuIndex("layout"),
          preferredWidth: 42,
          maxVisibleItems: Math.max(6, currentHeight() - 3),
        },
      }
      : {},
    showHelp: false,
    headerLayout,
    menuHitLayouts: menuBarHitLayouts,
    theme: theme(),
    paint,
    write,
    fillRow,
    writeButton,
    addHit,
  });
}

function renderWorkspace(frame: Frame): void {
  const geometry = workbenchScreenGeometry();
  const bounds = geometry.workspace;
  fillRect(frame, bounds, theme().backgroundSoft);
  renderedVisualizationThreePanels.clear();
  if (bounds.width < 2 || bounds.height < 1) {
    hideBuiltinThreeRects();
    hideVisualizationThreePanelsExcept(renderedVisualizationThreePanels);
    return;
  }
  const layout = workspaceLayout({ column: 0, row: 0, width: Math.max(1, bounds.width - 1), height: bounds.height });
  const offset = workspaceViewport.update({ layout, viewportHeight: bounds.height, activeId: activeWindowId() });
  const virtual = prepareWorkbenchFrame(workspaceVirtualFrame, Math.max(bounds.height, layout.contentHeight));
  frameWidthHints.set(virtual, layout.bounds.width);
  fillRect(virtual, layout.bounds, theme().backgroundSoft);
  const hitStart = hitTargets.length;
  const max = fullscreenWindowId();
  if (max) {
    const fullscreenRect = workbenchFullscreenWindowRect(layout.bounds);
    withWorkspacePlacement(bounds, 0, () => renderWindow(virtual, max, fullscreenRect));
    if (max !== "three") {
      hideBuiltinThreeRects();
    }
    hideVisualizationThreePanelsExcept(renderedVisualizationThreePanels);
    translateHitTargets(hitTargets, { startIndex: hitStart, rowDelta: bounds.row, clip: bounds });
    blitWorkbenchFrameCells(frame, virtual, { ...bounds, width: layout.bounds.width }, { columns: 0, rows: 0 });
    if (geometry.auxiliaryRow !== undefined) renderWindowTabs(frame, geometry.auxiliaryRow);
    return;
  }

  if (layout.rects.size === 0) {
    hideBuiltinThreeRects();
    hideVisualizationThreePanelsExcept(renderedVisualizationThreePanels);
    write(
      frame,
      bounds.row + 1,
      2,
      paint(workbenchEmptyWorkspaceMessage({ windows: windowManager.inspect().windows }), {
        fg: theme().warn,
      }),
    );
    if (geometry.auxiliaryRow !== undefined) renderShelf(frame, geometry.auxiliaryRow);
    return;
  }

  let renderedThree = false;
  const visibleRects = workbenchVisibleWindowRectsInto(visibleWindowRects, layout.rects, {
    viewport: { column: layout.bounds.column, row: offset, width: layout.bounds.width, height: bounds.height },
  });
  withWorkspacePlacement(bounds, offset, () => {
    for (const [id, rect] of visibleRects) {
      renderWindow(virtual, id, rect);
      if (id === "three") {
        renderedThree = true;
      }
    }
  });
  renderTiledSeparators(virtual);
  if (!renderedThree) {
    hideBuiltinThreeRects();
  }
  hideVisualizationThreePanelsExcept(renderedVisualizationThreePanels);
  translateHitTargets(hitTargets, { startIndex: hitStart, rowDelta: bounds.row - offset, clip: bounds });
  blitWorkbenchFrameCells(frame, virtual, { ...bounds, width: layout.bounds.width }, { columns: 0, rows: offset });
  renderWorkspaceScrollbar(frame, bounds);
  if (geometry.auxiliaryRow !== undefined) renderShelf(frame, geometry.auxiliaryRow);
}

function renderWindow(frame: Frame, id: WindowId, rect: Rectangle): void {
  renderApiWorkbenchWindowShell<WindowId, HitAction>({
    frame,
    id,
    rect,
    minimized: false,
    active: activeWindowId() === id,
    maximized: fullscreenWindowId() === id,
    title: windowTitle(id),
    showConfig: isThreeRenderedWindow(id),
    theme: theme(),
    buffers: windowShellBuffers,
    scroll: windowScroll(id),
    contentSizeForInner: (inner) => windowContentSize(id, inner),
    contentFrameForRows: (rows) => windowContentFrame(id, rows),
    setFrameWidthHint: (target, width) => frameWidthHints.set(target, width),
    hitTargetCount: () => hitTargets.length,
    renderContent: (contentFrame, contentRect, context) => {
      const previousWindowRenderContext = windowRenderContext;
      windowRenderContext = context;
      try {
        renderWindowContent(contentFrame, id, contentRect);
      } finally {
        windowRenderContext = previousWindowRenderContext;
      }
    },
    afterRenderContent: ({ contentHitStart, viewport, offset }) => {
      if (id === "controls" && dropdownOverlay?.coordinate === "workspace" && dropdownOverlay.kind === "control") {
        dropdownOverlay = {
          ...dropdownOverlay,
          rect: {
            ...dropdownOverlay.rect,
            column: viewport.column + dropdownOverlay.rect.column - offset.columns,
            row: viewport.row + dropdownOverlay.rect.row - offset.rows,
          },
        };
      }
      translateHitTargets(hitTargets, {
        startIndex: contentHitStart,
        columnDelta: viewport.column - offset.columns,
        rowDelta: viewport.row - offset.rows,
        clip: viewport,
      });
    },
    focusAction: (targetId): HitAction => ({ type: "focus", id: targetId }),
    titlebarAction: (targetId, kind) => resolveApiWorkbenchTitlebarHitAction(targetId, kind),
    titlebarDragAction: (targetId): HitAction => ({ type: "windowTitlebar", id: targetId }),
    scrollbarAction: (targetId, axis): HitAction =>
      axis === "vertical" ? { type: "windowVScrollbar", id: targetId } : { type: "windowHScrollbar", id: targetId },
    paint,
    write,
    fillRect,
    writeButton,
    addHit,
  });
}

function windowContentFrame(id: WindowId, rows: number): Frame {
  let frame = windowContentFrames.get(id);
  if (!frame) {
    frame = [];
    windowContentFrames.set(id, frame);
  }
  return prepareWorkbenchFrame(frame, rows);
}

function renderWindowContent(frame: Frame, id: WindowId, rect: Rectangle): void {
  if (id === "explorer") renderExplorer(frame, rect);
  else if (id === "inspector") renderInspector(frame, rect);
  else if (id === "data") renderData(frame, rect);
  else if (id === "controls") renderControls(frame, rect);
  else if (id === "logs") renderLogs(frame, rect);
  else if (id === "htmlLayout") renderHtmlCssLayout(frame, rect);
  else if (id === TERMINAL_OUTPUT_WINDOW_ID) renderTerminalOutput(frame, rect);
  else if (id === TERMINAL_SHELL_WINDOW_ID) renderTerminalShell(frame, rect);
  else if (isVisualizationWindow(id)) renderVisualizationWindow(frame, id, rect);
  else renderThree(frame, rect);
}

function renderVisualizationWindow(frame: Frame, id: VisualizationWindowId, rect: Rectangle): void {
  const visualizationId = dynamicVisualizationWindows.peek()[id];
  const option = visualizationOption(visualizationId);
  const t = theme();
  if (!visualizationId || !option) {
    renderApiWorkbenchVisualizationMissing({ frame, rect, theme: t, writeRows });
    return;
  }
  const context = buildVisualizationContext(visualizationId, rect, { windowId: id });
  const rendered = renderVisualization(context);
  const accent = rendered.accent === "alarm"
    ? t.danger
    : rendered.accent === "amber"
    ? t.warn
    : rendered.accent === "phosphor"
    ? t.good
    : rendered.accent === "violet"
    ? t.borderStrong
    : t.accent;
  const threeScene = workbenchVisualizationThreeScene({
    scene: rendered.three ?? null,
    available: threeAsciiAvailable.peek(),
    blocked: false,
    width: rect.width,
    height: rect.height,
  });
  if (threeScene) {
    const sceneRect = renderApiWorkbenchVisualizationThreeChrome({
      frame,
      rect,
      option,
      rendered,
      ascii: context.slot.ascii,
      accent,
      theme: t,
      contrastText,
      fit,
      paint,
      write,
      writeRows,
    });
    addHit(sceneRect, { type: "threeViewport", id });
    const entry = visualizationThreePanels.ensure(id);
    const resized = setWorkbenchThreeRect(entry.rectangle, {
      column: 0,
      row: 0,
      width: sceneRect.width,
      height: sceneRect.height,
    });
    setWorkbenchThreeRect(entry.graphicsRectangle, contentRectToGraphicsRect(sceneRect));
    setWorkbenchThreeSceneSignal(entry.scene, threeScene);
    renderedVisualizationThreePanels.add(id);
    const grid = entry.panel.grid.peek();
    if (resized) {
      renderApiWorkbenchThreeSurface({
        frame,
        rect: sceneRect,
        grid,
        theme: t,
        projectionCache: threeGridProjectionCache,
        statusRows: threeStatusRowsBuffer,
        paint,
        center: centerText,
        writeRows,
        scale: true,
        countForPressure: false,
        statusMessage: "renderer resizing",
        onPressureRows: (rows) => workbenchThreeRuntime.recordRenderedGridForPressure(rows),
      });
      handleWorkbenchThreeViewportResize();
      return;
    }
    renderApiWorkbenchThreeSurface({
      frame,
      rect: sceneRect,
      grid,
      theme: t,
      projectionCache: threeGridProjectionCache,
      statusRows: threeStatusRowsBuffer,
      paint,
      center: centerText,
      writeRows,
      scale: true,
      countForPressure: shouldCountWorkbenchThreeGridPressure(grid, entry.panel.inspectPerformance()),
      statusMessage: threeAsciiAvailable.peek() ? "renderer warming up" : "renderer unavailable",
      onPressureRows: (rows) => workbenchThreeRuntime.recordRenderedGridForPressure(rows),
    });
    return;
  }
  visualizationThreePanels.hide(id);
  renderApiWorkbenchVisualizationTextWindow({
    frame,
    rect,
    option,
    rendered,
    accent,
    rows: visualizationRenderRows,
    textRows: visualizationTextRows,
    theme: t,
    contrastText,
    writeRows,
  });
  if (visualizationId === "cpu-hex-grid") {
    addApiWorkbenchCpuHexTileHits({
      id,
      rect,
      cores: context.system.cpuCores,
      width: context.width,
      height: context.height,
      tiles: cpuHexHitTileBuffer,
      addHit,
    });
  }
}

function renderThree(frame: Frame, rect: Rectangle): void {
  const t = theme();
  const mode = workbenchAsciiRendererModeLabel(ascii.peek(), terminalGlyphStyleLabel).toUpperCase();
  if (threeAsciiAvailable.peek()) {
    const sceneRect = workbenchThreeBodyRect(rect, { headerRows: 3 });
    const resized = setThreeBodyRect(sceneRect);
    const performance = threePanel.inspectPerformance();
    const pressure = workbenchThreeRuntime.inspectPressureDetailsInto(workbenchThreePressureDetails);
    renderApiWorkbenchThreeHeader({
      frame,
      rect,
      mode,
      theme: t,
      rows: workbenchThreeHeaderRows,
      performanceTarget: workbenchThreeHeaderPerformance,
      rendererPerformance: performance,
      sourceMaxCells: workbenchThreeEffectiveMaxCells.peek(),
      frameIntervalMs: workbenchThreeFrameInterval.peek(),
      measuredFps: threeCadence.measuredFps(),
      pressure,
      writeRows,
    });
    addHit(sceneRect, { type: "threeViewport", id: "three" });
    setWorkbenchThreeRect(threeGraphicsRect, contentRectToGraphicsRect(sceneRect));
    const grid = threePanel.grid.peek();
    if (resized) {
      renderApiWorkbenchThreeSurface({
        frame,
        rect: sceneRect,
        grid,
        theme: t,
        projectionCache: threeGridProjectionCache,
        statusRows: threeStatusRowsBuffer,
        paint,
        center: centerText,
        writeRows,
        scale: true,
        countForPressure: false,
        statusMessage: "renderer resizing",
        onPressureRows: (rows) => workbenchThreeRuntime.recordRenderedGridForPressure(rows),
      });
      return;
    }
    renderApiWorkbenchThreeSurface({
      frame,
      rect: sceneRect,
      grid,
      theme: t,
      projectionCache: threeGridProjectionCache,
      statusRows: threeStatusRowsBuffer,
      paint,
      center: centerText,
      writeRows,
      scale: true,
      countForPressure: shouldCountWorkbenchThreeGridPressure(grid, performance),
      statusMessage: threeAsciiAvailable.peek() ? "renderer warming up" : "renderer unavailable",
      onPressureRows: (rows) => workbenchThreeRuntime.recordRenderedGridForPressure(rows),
    });
    return;
  }

  hideBuiltinThreeRects();
  renderApiWorkbenchThreeFallback({
    frame,
    rect,
    terminalGlyphStyle: ascii.peek().terminalGlyphStyle,
    rendererAvailable: threeAsciiAvailable.peek(),
    theme: t,
    rows: threeFallbackRowsBuffer,
    center: centerText,
    writeRows,
  });
}

function renderExplorer(frame: Frame, rect: Rectangle): void {
  const visible = explorer.tree.visibleRows();
  renderApiWorkbenchExplorerPanel({
    frame,
    rect,
    rows: visible,
    selectedIndex: explorer.tree.selectedIndex.peek(),
    renderRows: explorerRenderRows,
    theme: theme(),
    contrastText,
    writeRows,
    addHit,
  });
}

function renderInspector(frame: Frame, rect: Rectangle): void {
  const active = windowManager.inspect().windows.find((entry) => entry.id === activeWindowId());
  renderApiWorkbenchInspectorPanel({
    frame,
    rect,
    themeLabel: themes[themeIndex.peek()]!.label,
    focusTitle: windowTitle(activeWindowId()),
    focusState: active?.fullscreen ? "fullscreen" : active?.state ?? "closed",
    layoutSummary: `${tiledWorkspace.inspect().count} pane(s) · ${layoutMode.peek() ? "editing" : "docked"}`,
    logs: commandLog.peek(),
    renderRows: inspectorRenderRows,
    actionTextRows: inspectorActionTextRows,
    wrappedTextRows: inspectorWrappedTextRows,
    theme: theme(),
    fit,
    writeRows,
  });
}

function renderData(frame: Frame, rect: Rectangle): void {
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
    theme: theme(),
    fit,
    contrastText,
    writeRows,
    addHit,
  });
}

function renderControls(frame: Frame, rect: Rectangle): void {
  const result = renderApiWorkbenchControls({
    frame,
    rect,
    state: controlsModel.viewState(),
    buffers: controlViewBuffers,
    theme: theme(),
    contrastText,
    fit,
    paint,
    write,
    addHit,
  });
  if (result.dropdownOverlay) dropdownOverlay = result.dropdownOverlay;
}

function renderLogs(frame: Frame, rect: Rectangle): void {
  renderApiWorkbenchLogsPanel({
    frame,
    rect,
    sources: [commandLog.peek()],
    renderRows: logRenderRows,
    theme: theme(),
    writeRows,
  });
}

function renderTerminalOutput(frame: Frame, rect: Rectangle): void {
  const t = theme();
  fillRect(frame, rect, t.surface);
  const inspection = terminalOutputSession.inspect();
  let row = rect.row;
  row = renderTerminalOutputToolbar(frame, rect, row);
  if (row >= rect.row + rect.height) return;

  const outputHeight = Math.max(0, rect.row + rect.height - row - 2);
  renderApiWorkbenchTerminalOutputBody({
    frame,
    rect,
    startRow: row,
    inspection,
    inputMode: terminalInputMode.peek(),
    lines: terminalOutputSession.output.visible(outputHeight),
    rows: terminalOutputWindowRows,
    theme: t,
    contrastText,
    fit,
    paint,
    write,
  });
}

function renderTerminalOutputToolbar(frame: Frame, rect: Rectangle, startRow: number): number {
  return renderApiWorkbenchTerminalOutputToolbar({
    frame,
    rect,
    startRow,
    state: {
      running: terminalOutputSession.running,
      outputLineCount: terminalOutputSession.output.lines.peek().length,
      follow: terminalOutputSession.output.follow.peek(),
      inputMode: terminalInputMode.peek(),
    },
    buffers: terminalOutputButtonBuffers,
    theme: theme(),
    contrastText,
    paint,
    write,
    addHit,
  });
}

function toggleTerminalInputMode(): void {
  const next = resolveWorkbenchTerminalProcessInputModeToggle({
    mode: terminalInputMode.peek(),
    running: terminalOutputSession.running,
  });
  if (next.changed) terminalInputMode.value = next.mode;
  pushLog(next.message);
}

function renderTerminalShell(frame: Frame, rect: Rectangle): void {
  const t = theme();
  fillRect(frame, rect, t.surface);
  let row = rect.row;
  row = renderTerminalShellToolbar(frame, rect, row);
  if (row >= rect.row + rect.height) return;

  const shell = activeTerminalShell();
  const inspection = shell?.inspect();
  if (!inspection || !shell) {
    write(
      frame,
      row,
      rect.column,
      paint(fit("No active shell session. Press [New] to create one.", rect.width), {
        fg: t.muted,
        bg: t.surface,
      }),
    );
    return;
  }
  const copyMode = inspection.scrollback.mode === "copy";
  row = renderApiWorkbenchTerminalShellHeader({
    frame,
    rect,
    startRow: row,
    inspection,
    inputMode: terminalShellInputMode.peek(),
    copyMode,
    rows: terminalShellHeaderRows,
    theme: t,
    contrastText,
    fit,
    paint,
    write,
  });

  const bodyRect = {
    column: rect.column,
    row,
    width: rect.width,
    height: Math.max(0, rect.row + rect.height - row),
  };
  if (inspection.error) {
    write(
      frame,
      row,
      rect.column,
      paint(fit(`shell error: ${inspection.error}`, rect.width), {
        fg: t.danger,
        bg: t.surface,
        bold: true,
      }),
    );
    return;
  }
  if (inspection.status === "idle") {
    write(
      frame,
      row,
      rect.column,
      paint(fit("Press [Start] or P to open your login shell in a PTY.", rect.width), {
        fg: t.muted,
        bg: t.surface,
      }),
    );
    return;
  }

  renderApiWorkbenchTerminalShellPanes({
    frame,
    rect: bodyRect,
    inspection: terminalShell.inspect(),
    activeShell: activeTerminalShell(),
    shellForSession: (sessionId) => terminalShell.shell(sessionId),
    copyMode,
    rawInputActive: activeWindowId() === TERMINAL_SHELL_WINDOW_ID && terminalShellInputMode.peek() === "raw",
    buffers: terminalShellBuffers,
    theme: t,
    contrastText,
    fit,
    paint,
    write,
    fillRect,
    addHit,
  });
}

function renderTerminalShellToolbar(frame: Frame, rect: Rectangle, startRow: number): number {
  const workspaceInspection = terminalShell.inspect();
  const shell = activeTerminalShell();
  const shellInspection = shell?.inspect();
  const nextRow = renderApiWorkbenchTerminalShellToolbar({
    frame,
    rect,
    startRow,
    state: workbenchTerminalToolbarStateFromSnapshot({
      activeId: workspaceInspection.activeId,
      sessionCount: workspaceInspection.sessions.length,
      paneCount: workspaceInspection.workspace.layout.count,
      zoomedPaneId: workspaceInspection.workspace.layout.zoomedPaneId,
      shellRunning: shell?.running,
      shellStarting: shell?.status.peek() === "starting",
      inputMode: terminalShellInputMode.peek(),
      copyMode: shell?.scrollback.mode === "copy",
      scrollback: shellInspection?.scrollback,
    }),
    buffers: terminalShellButtonBuffers,
    theme: theme(),
    contrastText,
    paint,
    write,
    addHit,
  });
  return renderTerminalShellSessionTabs(frame, rect, nextRow, workspaceInspection);
}

function toggleTerminalShellInputMode(): void {
  const next = resolveWorkbenchTerminalShellInputModeToggle({
    mode: terminalShellInputMode.peek(),
    running: activeTerminalShell()?.running === true,
  });
  if (next.changed) terminalShellInputMode.value = next.mode;
  pushLog(next.message);
}

function openTerminalShellSearchModal(): void {
  const shell = activeTerminalShell();
  if (!shell) {
    pushLog("shell search unavailable");
    return;
  }
  focus(TERMINAL_SHELL_WINDOW_ID);
  terminalShellInputMode.value = "workbench";
  terminalShellSearchDraft.value = shell.scrollback.inspect().query ?? terminalShellSearchDraft.peek();
  terminalShellSearchPromptOpen.value = true;
  modal.open({
    title: "Search Shell Scrollback",
    tone: "info",
    body: terminalShellSearchModalBody(),
    actions: [
      { id: "terminal-search-cancel", label: "Cancel" },
      { id: "terminal-search-run", label: "Search", default: true },
    ],
  });
  pushLog("shell search prompt");
}

function terminalShellSearchModalBody(): string[] {
  const shell = activeTerminalShell();
  return workbenchTerminalSearchModalBody({
    query: terminalShellSearchDraft.peek(),
    scrollback: shell?.scrollback.inspect(),
  });
}

function refreshTerminalShellSearchModal(): void {
  if (!terminalShellSearchPromptOpen.peek() || !modal.openState.peek()) return;
  modal.update({ body: terminalShellSearchModalBody() });
}

function closeTerminalShellSearchModal(): void {
  terminalShellSearchPromptOpen.value = false;
  modal.close();
}

function handleTerminalShellSearchKey(event: { key: string; ctrl?: boolean; meta?: boolean }): boolean {
  const input = applyWorkbenchTerminalSearchPromptInput({
    event,
    value: terminalShellSearchDraft.peek(),
  });
  switch (input.action) {
    case "ignore":
      return false;
    case "cancel":
      closeTerminalShellSearchModal();
      pushLog("shell search cancelled");
      return true;
    case "submit":
      runTerminalShellSearch();
      return true;
    case "update":
      terminalShellSearchDraft.value = input.value;
      refreshTerminalShellSearchModal();
      return true;
  }
}

function runTerminalShellSearch(): void {
  const shell = activeTerminalShell();
  const query = terminalShellSearchDraft.peek();
  if (!shell) {
    closeTerminalShellSearchModal();
    pushLog("shell search unavailable");
    return;
  }
  const matches = shell.scrollback.search(query);
  terminalShellInputMode.value = "workbench";
  terminalShellSearchPromptOpen.value = false;
  modal.close();
  pushLog(matches.length > 0 ? `shell search ${matches.length} hits` : "shell search no matches");
  scheduleDraw();
}

function moveTerminalShellSearchMatch(delta: number): void {
  const shell = activeTerminalShell();
  if (!shell) return;
  const row = shell.scrollback.nextMatch(delta);
  terminalShellInputMode.value = "workbench";
  pushLog(row === undefined ? "shell search no matches" : `shell search row ${row + 1}`);
  scheduleDraw();
}

function activeTerminalShell(): TerminalShellController | undefined {
  return terminalShell.activeShell;
}

function addSplitTerminalShell(direction: "row" | "column") {
  const draft = nextApiWorkbenchTerminalSessionDraft(terminalShell.inspect().sessions);
  const descriptor = terminalShell.add(shellTerminalTemplate(draft), {
    activate: false,
  });
  terminalShell.workspace.splitActive(direction, descriptor.id, { title: descriptor.title });
  terminalShell.activate(descriptor.id);
  void terminalShell.start(descriptor.id).then(() => scheduleDraw());
  return descriptor;
}

function renderTerminalShellSessionTabs(
  frame: Frame,
  rect: Rectangle,
  startRow: number,
  inspection = terminalShell.inspect(),
): number {
  return renderApiWorkbenchTerminalSessionTabs({
    frame,
    rect,
    startRow,
    inspection,
    buffers: terminalShellSessionTabBuffers,
    theme: theme(),
    contrastText,
    paint,
    write,
    addHit,
  });
}

function renderHtmlCssLayout(frame: Frame, rect: Rectangle): void {
  renderApiWorkbenchHtmlCssLayout({
    frame,
    rect,
    boxes: htmlCssLayoutBoxes,
    commands: htmlCssLayoutRenderCommands,
    theme: theme(),
    contrastText,
    fit,
    paint,
    write,
    fillRect,
  });
}

function renderShelf(frame: Frame, row: number): void {
  renderApiWorkbenchShelf({
    frame,
    row,
    column: 1,
    width: Math.max(0, currentWidth() - 1),
    windows: windowManager.inspect().windows,
    buffers: shelfBuffers,
    theme: theme(),
    titleForId: windowTitle,
    paint,
    write,
    writeButton,
    addHit,
  });
}

function renderWindowTabs(frame: Frame, row: number): void {
  renderApiWorkbenchWindowTabs({
    frame,
    row,
    column: 1,
    width: Math.max(0, currentWidth() - 1),
    tabs: windowManager.inspect().tabs,
    buffers: shelfBuffers,
    theme: theme(),
    titleForId: windowTitle,
    paint,
    write,
    fillRow,
    writeButton,
    addHit,
  });
}

function renderStatus(frame: Frame): void {
  const width = currentWidth();
  const row = workbenchScreenGeometry().statusRow;
  if (row === undefined) return;
  renderApiWorkbenchStatus({
    frame,
    row,
    width,
    focus: `${layoutMode.peek() ? "LAYOUT · " : ""}${windowTitle(activeWindowId())}`,
    themeLabel: theme().label,
    tileDensity: tileDensity.peek(),
    diagnostics: formatWorkbenchDiagnosticStatus(workbenchDiagnostics),
    theme: theme(),
    paint,
    write,
  });
}

function renderActiveDropdownOverlay(frame: Frame): void {
  const bounds = workbenchScreenGeometry().workspace;
  renderApiWorkbenchDropdownOverlay({
    frame,
    overlay: dropdownOverlay,
    workspaceBounds: bounds,
    screenBounds: { column: 0, row: 0, width: currentWidth(), height: currentHeight() },
    workspaceOffsetRows: workspaceScroll.offset.peek().rows,
    commands: dropdownOverlayRenderCommands,
    theme: theme(),
    paint,
    write,
    fillRect,
    addHit,
  });
}

function workbenchScreenGeometry(): WorkbenchScreenGeometry {
  const width = Math.max(0, currentWidth());
  const height = Math.max(0, currentHeight());
  const statusRows = height >= 2 ? 1 : 0;
  const inspection = windowManager.inspect();
  const needsAuxiliaryRow = height >= 3 &&
    (inspection.fullscreenId !== undefined || inspection.windows.some((entry) => entry.minimized));
  const auxiliaryRows = needsAuxiliaryRow ? 1 : 0;
  const workspaceHeight = Math.max(0, height - Math.min(1, height) - statusRows - auxiliaryRows);
  return {
    workspace: { column: 0, row: height > 0 ? 1 : 0, width, height: workspaceHeight },
    auxiliaryRow: needsAuxiliaryRow ? height - statusRows - 1 : undefined,
    statusRow: statusRows > 0 ? height - 1 : undefined,
  };
}

function renderModalOverlay(frame: Frame): void {
  if (threeConfigOpen.peek()) {
    renderThreeConfigModal(frame);
    return;
  }
  if (!modal.openState.peek()) return;

  const screen = { column: 0, row: 0, width: currentWidth(), height: currentHeight() };
  renderApiWorkbenchModalOverlay({
    frame,
    bounds: screen,
    inspection: modal.inspect(),
    buffers: modalBuffers,
    theme: theme(),
    contrastText,
    fit,
    paint,
    write,
    fillRect,
    drawFrame,
    addHit,
  });
}

type ThreeConfigRow = WorkbenchAsciiConfigRow;

const threeConfigRows: readonly ThreeConfigRow[] = defaultWorkbenchAsciiConfigRows;
const threeConfigBuffers = new WorkbenchAsciiConfigModalBufferCache<ThreeConfigRow>();

function renderThreeConfigModal(frame: Frame): void {
  const screen = { column: 0, row: 0, width: currentWidth(), height: currentHeight() };
  const current = asciiConfigs.editorSignal().peek();
  renderApiWorkbenchThreeConfigModal({
    frame,
    bounds: screen,
    rows: threeConfigRows,
    selectedIndex: threeConfigSelected.peek(),
    title: formatWorkbenchAsciiConfigTitle(windowTitle(asciiConfigs.editorWindow()), current),
    buffers: threeConfigBuffers,
    theme: theme(),
    contrastText,
    fit,
    paint,
    write,
    fillRect,
    drawFrame,
    rowText: threeConfigRowText,
    addHit,
  });
}

function threeConfigRowText(row: ThreeConfigRow): string {
  const current = asciiConfigs.editorSignal().peek();
  return formatWorkbenchAsciiConfigRowText(row, current, {
    kittyStatus: formatWorkbenchKittyGraphicsStatus({
      selected: current,
      tmux: kittyGraphics.tmux,
      tmuxPassthroughAllowed: kittyGraphics.tmuxPassthroughAllowed,
      surface: kittyGraphics.surfaceFor(current).inspect(),
    }),
  });
}

function applyThreeConfigRow(index: number, action: ConfigHitAction = "activate"): void {
  if (index < 0) {
    applyThreeConfigModalAction("cancel");
    return;
  }
  const next = asciiConfigs.applyEditorRow(
    index,
    action,
    threeConfigRows,
    ASCII_DEMO_PRESET_IDS,
  );
  if (next) recordConfiguredAscii(`three config ${next.message}`, { persist: false });
}

function drawFrame(frame: Frame, rect: Rectangle, title: string, active: boolean): void {
  renderApiWorkbenchWindowFrame({
    frame,
    rect,
    title,
    active,
    theme: theme(),
    buffers: windowShellBuffers,
    paint,
    write,
    fillRect,
  });
}

function workspaceLayout(bounds: Rectangle): {
  bounds: Rectangle;
  contentHeight: number;
  rects: Map<WindowId, Rectangle>;
} {
  const active = activeWindowId();
  tiledWorkspace.reconcile(tiledWindowInventory(), { activeWindowId: active });
  tiledWorkspace.focus(active);
  const gap = workbenchTiledGap();
  if (tiledWorkspace.gap.peek() !== gap) tiledWorkspace.gap.value = gap;
  const projection = tiledWorkspace.layout(bounds, {
    gap,
    separatorHitSize: 3,
    visibleWindowIds: tiledVisibleWindowIds(),
  });
  const rects = new Map<WindowId, Rectangle>();
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
  for (const pane of tiledLayoutProjection.panes) {
    rects.set(pane.windowId as WindowId, pane.rect);
  }
  return { bounds, contentHeight: bounds.height, rects };
}

function tiledWindowInventory(): TiledWorkspaceWindow[] {
  const windows: TiledWorkspaceWindow[] = [];
  const densityOffset = tileDensity.peek() * 3;
  for (const entry of windowManager.inspect().windows) {
    if (entry.state === "closed") continue;
    windows.push({
      id: entry.id,
      minWidth: Math.max(20, (entry.minWidth ?? 20) - densityOffset),
      minHeight: entry.minHeight,
    });
  }
  return windows;
}

function tiledVisibleWindowIds(): ReadonlySet<string> {
  tiledVisibleWindowIdBuffer.clear();
  for (const entry of windowManager.inspect().windows) {
    if (entry.state === "normal") tiledVisibleWindowIdBuffer.add(entry.id);
  }
  return tiledVisibleWindowIdBuffer;
}

function workbenchTiledGap(): number {
  const density = tileDensity.peek();
  return density <= -2 ? 2 : density >= 2 ? 0 : 1;
}

function renderTiledSeparators(frame: Frame): void {
  if (fullscreenWindowId() || !tiledLayoutProjection || tiledLayoutProjection.separators.length === 0) return;
  const color = layoutMode.peek() ? theme().borderStrong : theme().backgroundSoft;
  for (const separator of tiledLayoutProjection.separators) {
    if (separator.rect.width > 0 && separator.rect.height > 0) fillRect(frame, separator.rect, color);
    addHit(separator.hitRect, {
      type: "layoutSeparator",
      splitId: separator.splitId,
      axis: separator.axis,
    });
  }
}

function windowScroll(id: WindowId): ScrollAreaController {
  let scroll = windowScrolls.get(id);
  if (!scroll) {
    scroll = new ScrollAreaController({ showScrollbar: true });
    windowScrolls.set(id, scroll);
  }
  return scroll;
}

function windowContentSize(id: WindowId, viewport: Rectangle): { width: number; height: number } {
  const outputLines = terminalOutputSession.output.lines.peek();
  return workbenchWindowContentSize({
    id,
    viewport,
    docs: commandLog.peek(),
    explorerRows: explorerTextRowsInto(explorerContentTextRows, explorer.entries(), (entry) => entry.text),
    dataColumns: columns,
    dataRowCount: rows.length,
    terminalOutputLines: workbenchTerminalOutputRowsInto(terminalOutputContentRows, outputLines, {
      sourcePrefix: true,
    }),
    terminalOutputWindowId: TERMINAL_OUTPUT_WINDOW_ID,
    terminalShellWindowId: TERMINAL_SHELL_WINDOW_ID,
    isVisualizationWindow: (candidate) => isVisualizationWindow(candidate as WindowId),
    visualizationContentSize: (candidate, bounds, baseWidth, baseHeight) =>
      visualizationWindowContentSize(candidate as VisualizationWindowId, bounds, baseWidth, baseHeight),
  });
}

function visualizationWindowContentSize(
  id: VisualizationWindowId,
  viewport: Rectangle,
  baseWidth: number,
  baseHeight: number,
): { width: number; height: number } {
  const visualizationId = dynamicVisualizationWindows.peek()[id];
  const option = visualizationOption(visualizationId);
  if (!visualizationId || !option) return { width: baseWidth, height: baseHeight };
  if (threeAsciiAvailable.peek() && visualizationUsesThreeRenderer(visualizationId)) {
    return { width: baseWidth, height: baseHeight };
  }

  const rendered = renderVisualization(buildVisualizationContext(visualizationId, {
    ...viewport,
    width: baseWidth,
    height: baseHeight,
  }, { windowId: id }));
  if (rendered.three && threeAsciiAvailable.peek()) {
    return {
      width: baseWidth,
      height: baseHeight,
    };
  }
  return visualizationTextContentSize(rendered, baseWidth, baseHeight);
}

function visualizationTextContentSize(
  rendered: PanelRender,
  baseWidth: number,
  baseHeight: number,
): { width: number; height: number } {
  let rowCount = 3;
  let width = Math.max(baseWidth, rendered.footer.trimEnd().length);
  let start = 0;
  for (let index = 0; index <= rendered.body.length; index += 1) {
    if (index < rendered.body.length && rendered.body[index] !== "\n") continue;
    width = Math.max(width, rendered.body.slice(start, index).trimEnd().length);
    rowCount += 1;
    start = index + 1;
  }
  return {
    width,
    height: Math.max(baseHeight, rowCount),
  };
}

function buildVisualizationContext(
  visualizationId: string,
  rect: Rectangle,
  options: { windowId?: VisualizationWindowId } = {},
): RenderContext {
  const option = visualizationOption(visualizationId);
  const phase = Math.floor(performance.now() / 80);
  const usesRealSystem = option?.group === "Monitor";
  const system = usesRealSystem
    ? systemMonitor.snapshot.peek()
    : syntheticWorkbenchSystem(phase, option?.group ?? "Monitor");
  const sources = usesRealSystem
    ? resolveSourceFramesInto(
      realSourceFrameBuffer,
      monitorSourceIdsInto(realSourceIdBuffer, visualizationId),
      system,
      workbenchAudioRegistry,
      phase,
    )
    : syntheticWorkbenchSourcesInto(
      syntheticSourceFrameBuffer,
      visualizationId,
      option?.group ?? "Monitor",
      phase,
    );
  const slot: SlotConfig = {
    id: "cpu",
    name: option?.label ?? visualizationId,
    visualizationId,
    inputSourceIds: usesRealSystem
      ? monitorSourceIds(visualizationId)
      : ["workbench:primary", "workbench:secondary", "workbench:noise"],
    cycleEnabled: false,
    cycleIntervalMs: 10000,
    ascii: options.windowId ? asciiForWindow(options.windowId).peek() : ascii.peek(),
  };
  return {
    slot,
    system,
    sources,
    phase,
    width: Math.max(8, rect.width),
    height: Math.max(4, rect.height - 3),
    selectedCpuLabel: visualizationId === "cpu-hex-grid" && options.windowId
      ? selectedCpuHexTiles.peek()[options.windowId]
      : undefined,
  };
}

function createVisualizationThreePanel(id: VisualizationWindowId): DynamicThreePanel {
  const rectangle = new Signal<Rectangle>({ column: 0, row: 0, width: 0, height: 0 }, { deepObserve: true });
  const graphicsRectangle = new Signal<Rectangle>({ column: 0, row: 0, width: 0, height: 0 }, { deepObserve: true });
  const scene = new Signal<WorkbenchThreeScene | null>(null);
  const runtimeAscii = new Computed<AsciiOptions>(() => {
    const savedAscii = asciiForWindow(id).value;
    const fullscreenId = windowManager.fullscreenId.value as WindowId | undefined;
    if (fullscreenId === id) {
      return resolveWorkbenchThreeFullscreenAsciiOptions({
        id,
        fullscreenId,
        ascii: savedAscii,
        fullscreenMinCells: workbenchThreeFullscreenTargetCells.value,
      });
    }
    return resolveWorkbenchThreeTiledAsciiOptions({
      ascii: savedAscii,
      liveViewport: rectangle.value,
      liveMaxCells: workbenchThreeLiveMaxCells.value,
    });
  });
  const panel = createWorkbenchThreePanelFrameView({
    rectangle,
    graphicsRectangle,
    scene,
    ascii: runtimeAscii,
    enabled: threeAsciiAvailable,
    graphicsSurface: () => kittyGraphics.surfaceFor(asciiForWindow(id).peek()),
    frameInterval: workbenchThreeFrameInterval,
    idleFrameInterval: workbenchThreeIdleFrameInterval,
    interactive: () => workbenchThreeWindowStateIsInteractive(workbenchThreeWindowState, id),
    maxRenderCells: workbenchThreeEffectiveMaxCells,
    diagnostics: workbenchDiagnostics,
    onFrame: () => {
      threeCadence.record();
      scheduleDraw();
    },
    onUpdate: scheduleDraw,
  });
  return { rectangle, graphicsRectangle, scene, panel, resources: [runtimeAscii] };
}

function syncWorkbenchThreeWindowState(): WorkbenchThreeWindowState<WindowId> {
  return resolveWorkbenchThreeWindowStateInto(workbenchThreeWindowState, {
    activeId: activeWindowId(),
    fullscreenId: windowManager.fullscreenId.peek() as WindowId | undefined,
    windows: windowManager.orderedWindows(),
    isThreeWindow: (id) => isThreeRenderedWindow(id as WindowId),
    blocked: genericModalBlocksThree.peek(),
  });
}

function activeWorkbenchThreeRuntimeBudgetSource(): WorkbenchThreeRuntimeBudgetSource {
  const id = resolveWorkbenchThreeRuntimeBudgetSourceId({
    fallbackId: "three" as WindowId,
    fullscreenId: workbenchThreeWindowState.fullscreenId,
    interactiveIds: workbenchThreeWindowState.interactiveIds,
    isThreeWindow: isThreeRenderedWindow,
  });
  return {
    id,
    ascii: asciiForWindow(id).peek(),
    liveViewport: workbenchThreeRuntimeViewportForWindow(id),
  };
}

function workbenchThreeRuntimeViewportForWindow(id: WindowId): Pick<Rectangle, "width" | "height"> {
  if (id === "three") return threeBodyRect.peek();
  if (isVisualizationWindow(id)) {
    return visualizationThreePanels.get(id)?.rectangle.peek() ?? WORKBENCH_THREE_HIDDEN_RECT;
  }
  return WORKBENCH_THREE_HIDDEN_RECT;
}

function hideVisualizationThreePanelsExcept(visibleIds: ReadonlySet<VisualizationWindowId>): void {
  visualizationThreePanels.hideExcept(visibleIds);
}

function disposeVisualizationThreePanel(id: VisualizationWindowId): void {
  visualizationThreePanels.dispose(id);
}

function setThreeBodyRect(rect: Rectangle): boolean {
  const changed = setWorkbenchThreeRect(threeBodyRect, {
    column: 0,
    row: 0,
    width: rect.width,
    height: rect.height,
  });
  if (!changed) return false;
  handleWorkbenchThreeViewportResize();
  return true;
}

function handleWorkbenchThreeViewportResize(): void {
  threeCadence.reset();
  workbenchThreeRuntime.resetPressureCounters();
  scheduleDraw();
}

function hideBuiltinThreeRects(): void {
  hideWorkbenchThreeRect(threeBodyRect);
  hideWorkbenchThreeRect(threeGraphicsRect);
}

function asciiForWindow(id: WindowId): Signal<AsciiOptions> {
  return asciiConfigs.signalForWindow(id);
}

function setAsciiForWindow(id: WindowId, options: AsciiOptions): void {
  asciiConfigs.setForWindow(id, normalizeAsciiOptions(options, createDefaultWorkbenchAsciiOptions()));
}

function disposeAsciiForWindow(id: WindowId): void {
  asciiConfigs.disposeWindow(id);
}

function recordConfiguredAscii(
  message: string,
  options: { persist?: boolean } = {},
): void {
  const id = asciiConfigs.editorWindow();
  if (options.persist !== false && isVisualizationWindow(id)) void persistActiveWorkspaceState();
  pushLog(`${message} (${windowTitle(id)})`);
}

function applyThreeConfigModalAction(action: WorkbenchAsciiConfigModalAction): void {
  if (action === "cancel") {
    if (asciiConfigs.restoreEditor()) recordConfiguredAscii("three config cancelled");
    closeThreeConfigModal();
    return;
  }

  asciiConfigs.commitEditor();
  recordConfiguredAscii(action === "apply" ? "three config applied" : "three config ok");
  if (action === "ok") closeThreeConfigModal();
}

function isThreeRenderedWindow(id: WindowId): boolean {
  if (id === "three") return true;
  return isVisualizationWindow(id) && visualizationWindowSupportsThree(id);
}

function visualizationWindowSupportsThree(id: VisualizationWindowId): boolean {
  const visualizationId = dynamicVisualizationWindows.peek()[id];
  if (!visualizationId) return false;
  return apiWorkbenchVisualizationSupportsThree(
    visualizationThreeSupport,
    visualizationId,
    probeVisualizationThreeSupport,
  );
}

function probeVisualizationThreeSupport(visualizationId: string): PanelRender {
  return renderVisualization(
    buildVisualizationContext(visualizationId, {
      column: 0,
      row: 0,
      width: 48,
      height: 16,
    }),
  );
}

function withWorkspacePlacement(bounds: Rectangle, offset: number, render: () => void): void {
  const previous = workspacePlacementContext;
  workspacePlacementContext = {
    rowDelta: bounds.row - offset,
    columnDelta: bounds.column,
    clip: bounds,
  };
  try {
    render();
  } finally {
    workspacePlacementContext = previous;
  }
}

function contentRectToGraphicsRect(rect: Rectangle): Rectangle {
  return workbenchThreeContentGraphicsRect(rect, {
    window: windowRenderContext,
    workspace: workspacePlacementContext,
  });
}

function renderWorkspaceScrollbar(frame: Frame, bounds: Rectangle): void {
  const overflow = workspaceScroll.inspectOverflow();
  const t = theme();
  const commands = workbenchWorkspaceScrollbarRenderCommandsInto(workspaceScrollbarRenderCommands, {
    bounds,
    visible: overflow.rows.scrollbarVisible,
    thumb: overflow.rows.thumb,
  });
  for (const command of commands) {
    addHit(command.rect, { type: "workspaceScrollbar" });
    for (const cell of command.cells) {
      write(frame, cell.row, cell.column, paint(cell.glyph, { fg: t.accent, bg: t.backgroundSoft, bold: true }));
    }
  }
}

function scrollWindow(id: WindowId, columns: number, rows: number): void {
  windowScroll(id).scrollBy(columns, rows);
}

function focus(id: WindowId): void {
  windowManager.focus(id);
  logWindowAction("focus", id);
}

function focusNext(): void {
  const next = windowManager.focusNext(1)?.id as WindowId | undefined;
  if (next) logWindowAction("focus", next);
}

function focusPrevious(): void {
  const next = windowManager.focusNext(-1)?.id as WindowId | undefined;
  if (next) logWindowAction("focus", next);
}

function minimize(id: WindowId): void {
  windowManager.minimize(id);
  void persistActiveWorkspaceState();
  logWindowAction("minimize", id);
}

function toggleMaximize(id: WindowId): void {
  windowManager.fullscreen(id);
  void persistActiveWorkspaceState();
  pushLog(workbenchWindowActionLog(fullscreenWindowId() === id ? "maximize" : "restore", windowTitle(id)));
}

function restoreAll(): void {
  windowManager.restore();
  void persistActiveWorkspaceState();
  pushLog("restore all windows");
}

function logWindowAction(kind: WorkbenchWindowActionLogKind, id: WindowId): void {
  pushLog(workbenchWindowActionLog(kind, windowTitle(id)));
}

function activeWindowId(): WindowId {
  return (windowManager.activeId.peek() as WindowId | undefined) ?? "three";
}

function fullscreenWindowId(): WindowId | undefined {
  return windowManager.fullscreenId.peek() as WindowId | undefined;
}

function isWindowMinimized(id: WindowId, windows = windowManager.windows.peek()): boolean {
  for (let index = 0; index < windows.length; index++) {
    const window = windows[index]!;
    if (window.id === id) return window.state === "minimized";
  }
  return false;
}

function adjustTileDensity(delta: number): void {
  tileDensity.value = clampWorkbenchTileDensity(tileDensity.peek() + delta);
  void persistActiveWorkspaceState();
  pushLog(`tile density ${tileDensity.peek()}`);
}

function setTheme(index: number): void {
  themeIndex.value = (index + themes.length) % themes.length;
  closeTopMenus();
  pushLog(`theme ${theme().label}`);
}

function openSaveWorkspaceModal(): void {
  closeTopMenus();
  workspaceNameMode.value = "save";
  workspaceTargetName.value = null;
  workspaceNameDraft.value = defaultWorkspaceNameFromCount(savedWorkspaces.peek().length);
  modal.open(saveWorkspaceModalContent(workspaceNameModalBody()));
  pushLog("save workspace prompt");
}

function openRenameWorkspaceModal(workspace: SavedWorkspace): void {
  closeTopMenus();
  workspaceNameMode.value = "rename";
  workspaceTargetName.value = workspace.name;
  workspaceNameDraft.value = workspace.name;
  modal.open(renameWorkspaceModalContent(workspaceNameModalBody()));
  pushLog(`rename workspace prompt ${workspace.name}`);
}

function openDeleteWorkspaceModal(workspace: SavedWorkspace): void {
  closeTopMenus();
  workspaceNameMode.value = null;
  workspaceTargetName.value = workspace.name;
  modal.open(deleteWorkspaceModalContent(workspace));
  pushLog(`delete workspace prompt ${workspace.name}`);
}

function workspaceNameModalBody(): string[] {
  const mode = workspaceNameMode.peek();
  return buildWorkspaceNameModalBody({
    mode: mode === "rename" ? "rename" : "save",
    draftName: workspaceNameDraft.peek(),
    cursor: mode ? "▌" : "",
    loadedVisualizationIds: workspaceVisualizationIdsFromWindowsInto(
      currentWorkspaceVisualizationIdBuffer,
      currentWorkspaceWindows(),
    ),
    storageLabel: apiWorkbenchWorkspaceStorageLabel(),
    targetName: workspaceTargetName.peek(),
    targetWorkspace: workspaceByName(workspaceTargetName.peek()) ?? null,
  });
}

function refreshWorkspaceNameModal(): void {
  if (!workspaceNameMode.peek() || !modal.openState.peek()) return;
  modal.update({ body: workspaceNameModalBody() });
}

function handleWorkspaceNameKey(event: { key: string; ctrl?: boolean; meta?: boolean }): boolean {
  return dispatchWorkbenchTextPromptInput({
    event,
    value: workspaceNameDraft.peek(),
    maxLength: 48,
    measureText: textWidth,
  }, {
    onCancel: () => {
      clearWorkspaceModalState();
      modal.close();
    },
    onSubmit: () => {
      if (workspaceNameMode.peek() === "rename") void renameWorkspace();
      else void saveCurrentWorkspace();
    },
    onUpdate: (value) => {
      workspaceNameDraft.value = value;
      refreshWorkspaceNameModal();
    },
  });
}

async function saveCurrentWorkspace(): Promise<void> {
  const result = saveWorkspaceState({
    workspaces: savedWorkspaces.peek(),
    draftName: workspaceNameDraft.peek(),
    windows: currentWorkspaceWindows(),
    ...currentWorkspaceLayoutState(),
  });
  savedWorkspaces.value = result.workspaces;
  await persistSavedWorkspaces();
  activeWorkspaceName.value = result.name;
  clearWorkspaceModalState();
  modal.open(
    workspaceSavedModalContent(result.name, result.workspace.managedWindows?.length ?? result.visualizationIds.length),
  );
  pushLog(`workspace saved ${result.name}`);
}

async function renameWorkspace(): Promise<void> {
  const result = renameWorkspaceState({
    workspaces: savedWorkspaces.peek(),
    targetName: workspaceTargetName.peek(),
    draftName: workspaceNameDraft.peek(),
    activeWorkspaceName: activeWorkspaceName.peek(),
  });
  if (result.status === "missing") {
    clearWorkspaceModalState();
    modal.open(workspaceMissingModalContent(result.targetName));
    return;
  }

  savedWorkspaces.value = result.workspaces;
  await persistSavedWorkspaces();
  activeWorkspaceName.value = result.activeWorkspaceName ?? null;
  clearWorkspaceModalState();
  modal.open(workspaceRenamedModalContent(result.previousName, result.name, result.visualizationCount));
  pushLog(`workspace renamed ${result.previousName} -> ${result.name}`);
}

async function deleteWorkspace(): Promise<void> {
  const result = deleteWorkspaceState({
    workspaces: savedWorkspaces.peek(),
    targetName: workspaceTargetName.peek(),
    activeWorkspaceName: activeWorkspaceName.peek(),
  });
  if (result.status === "missing") {
    clearWorkspaceModalState();
    modal.close();
    return;
  }
  savedWorkspaces.value = result.workspaces;
  await persistSavedWorkspaces();
  activeWorkspaceName.value = result.activeWorkspaceName ?? null;
  clearWorkspaceModalState();
  modal.open(workspaceDeletedModalContent(result.name));
  pushLog(`workspace deleted ${result.name}`);
}

function clearWorkspaceModalState(): void {
  workspaceNameMode.value = null;
  workspaceTargetName.value = null;
}

function updateActiveWorkspaceAfterWindowMutation(options: { preserveWorkspace?: boolean } = {}): void {
  const current = activeWorkspaceName.peek();
  const next = activeWorkspaceNameAfterWindowMutation(current, options);
  if (next !== current) activeWorkspaceName.value = next;
}

function applyWorkspaceMenuItem(index: number): void {
  const command = resolveWorkspaceMenuCommand(workspaceMenuEntries()[index], workspaceByName);
  switch (command.action) {
    case "save":
      return openSaveWorkspaceModal();
    case "open":
      return loadWorkspace(command.workspace);
    case "rename":
      return openRenameWorkspaceModal(command.workspace);
    case "delete":
      return openDeleteWorkspaceModal(command.workspace);
    case "none":
      return;
  }
}

function viewMenuLabels(): string[] {
  const loaded = new Set(windowManager.ids());
  viewMenuLabelBuffer.length = VIEW_MENU_ENTRIES.length;
  for (let index = 0; index < VIEW_MENU_ENTRIES.length; index += 1) {
    const entry = VIEW_MENU_ENTRIES[index]!;
    viewMenuLabelBuffer[index] = `${loaded.has(entry.windowId) ? "[x]" : "[ ]"} ${entry.label}`;
  }
  return viewMenuLabelBuffer;
}

function layoutMenuLabels(): string[] {
  layoutMenuLabelBuffer.length = LAYOUT_MENU_ENTRIES.length;
  for (let index = 0; index < LAYOUT_MENU_ENTRIES.length; index += 1) {
    const entry = LAYOUT_MENU_ENTRIES[index]!;
    layoutMenuLabelBuffer[index] = index === 0 ? `${layoutMode.peek() ? "[x]" : "[ ]"} ${entry.label}` : entry.label;
  }
  return layoutMenuLabelBuffer;
}

function applyViewMenuItem(index: number): void {
  const entry = VIEW_MENU_ENTRIES[index];
  if (!entry) return;
  toggleBuiltInWindow(entry.windowId, { keepMenuOpen: true });
}

function applyLayoutMenuItem(index: number): void {
  const entry = LAYOUT_MENU_ENTRIES[index];
  if (!entry) return;
  switch (entry.action) {
    case "toggleMode":
      toggleLayoutMode();
      return;
    case "moveEarlier":
      moveActiveWindow(-1);
      return;
    case "moveLater":
      moveActiveWindow(1);
      return;
    case "growHorizontal":
      resizeActiveTile(2, 0);
      return;
    case "shrinkHorizontal":
      resizeActiveTile(-2, 0);
      return;
    case "growVertical":
      resizeActiveTile(0, 1);
      return;
    case "shrinkVertical":
      resizeActiveTile(0, -1);
      return;
    case "maximize":
      toggleMaximize(activeWindowId());
      return;
    case "reset":
      resetTiledLayout();
      return;
    case "wider":
      adjustTileDensity(-1);
      return;
    case "denser":
      adjustTileDensity(1);
      return;
  }
}

function toggleLayoutMode(): void {
  layoutMode.value = !layoutMode.peek();
  closeTopMenus();
  pushLog(`layout mode ${layoutMode.peek() ? "on" : "off"}`);
}

function moveActiveWindow(delta: -1 | 1): void {
  const id = activeWindowId();
  const visible = tiledVisibleWindowIds();
  const windowIds = tiledWorkspace.windowIds().filter((windowId) => visible.has(windowId));
  const index = windowIds.indexOf(id);
  const targetIndex = Math.max(0, Math.min(windowIds.length - 1, index + delta));
  if (index < 0 || targetIndex === index || !tiledWorkspace.swap(id, windowIds[targetIndex]!)) return;
  syncWindowManagerOrderFromTiles();
  void persistActiveWorkspaceState();
  pushLog(`move ${windowTitle(id)} ${delta < 0 ? "earlier" : "later"}`);
}

function resizeActiveTile(columns: number, rows: number): void {
  const projection = tiledLayoutProjection;
  const active = activeWindowId();
  const pane = projection?.panes.find((entry) => entry.windowId === active);
  if (!projection || !pane) return;
  const axis: TiledWorkspaceSeparatorAxis = columns !== 0 ? "column" : "row";
  const requested = columns !== 0 ? columns : rows;
  const candidates = projection.separators
    .filter((separator) => separator.axis === axis && rectangleContains(separator.bounds, pane.rect))
    .sort((left, right) => rectangleArea(left.bounds) - rectangleArea(right.bounds));
  const separator = candidates[0];
  if (!separator) {
    pushLog(`resize ${windowTitle(active)} unavailable on ${axis} axis`);
    return;
  }
  const inFirst = rectangleContains(separator.firstRect, pane.rect);
  const delta = inFirst ? requested : -requested;
  if (
    tiledWorkspace.resizeSplit(separator.splitId, delta, projection.bounds, {
      gap: workbenchTiledGap(),
      separatorHitSize: 3,
      visibleWindowIds: tiledVisibleWindowIds(),
    })
  ) {
    void persistActiveWorkspaceState();
    pushLog(`resize ${windowTitle(active)} ${columns}:${rows}`);
  }
}

function resetTiledLayout(): void {
  tileDensity.value = 0;
  tiledWorkspace.state.value = {};
  tiledWorkspace.reconcile(tiledWindowInventory(), { activeWindowId: activeWindowId() });
  syncWindowManagerOrderFromTiles();
  workspaceScroll.scrollTo(0, 0);
  void persistActiveWorkspaceState();
  pushLog("layout reset");
}

function syncWindowManagerOrderFromTiles(): void {
  const order = new Map(tiledWorkspace.windowIds().map((id, index) => [id, index]));
  const current = windowManager.windows.peek();
  windowManager.windows.value = current.map((entry, fallback) => ({
    ...entry,
    order: order.get(entry.id) ?? entry.order ?? order.size + fallback,
  }));
}

function rectangleContains(outer: Rectangle, inner: Rectangle): boolean {
  return inner.column >= outer.column && inner.row >= outer.row &&
    inner.column + inner.width <= outer.column + outer.width &&
    inner.row + inner.height <= outer.row + outer.height;
}

function rectangleArea(rect: Rectangle): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function loadWorkspace(workspace: SavedWorkspace): void {
  closeTopMenus();
  closeAllWindowsForWorkspaceLoad();
  for (const entry of workspaceWindowEntries(workspace)) {
    addVisualizationWindow(visualizationOption(entry.visualizationId), { ascii: entry.ascii, preserveWorkspace: true });
  }
  restoreWorkspaceLayoutState(workspace);
  activeWorkspaceName.value = workspace.name;
  workspaceScroll.scrollTo(0, 0);
  pushLog(`workspace loaded ${workspace.name}`);
}

function closeAllWindowsForWorkspaceLoad(): void {
  const plan = workspaceLoadClosePlan({
    windowIds: windowManager.ids() as WindowId[],
    isVisualizationWindow,
    selectedVisualizationTiles: selectedCpuHexTiles.peek(),
  });
  if (plan.windowIds.length === 0) return;

  for (const id of plan.visualizationWindowIds) {
    disposeVisualizationThreePanel(id);
    disposeAsciiForWindow(id);
  }
  for (const id of plan.windowIds) {
    windowManager.close(id);
    windowContentFrames.delete(id);
  }
  if (plan.selectedVisualizationTilesChanged) {
    selectedCpuHexTiles.value = plan.selectedVisualizationTiles as Record<VisualizationWindowId, string>;
  }
  pushLog(`closed ${plan.windowIds.length} window(s) for workspace load`);
}

function workspaceMenuEntries(): WorkspaceMenuEntry[] {
  return buildWorkspaceMenuEntriesInto(workspaceMenuEntryBuffer, savedWorkspaces.peek());
}

function workspaceMenuItemCount(): number {
  return workspaceMenuEntries().length;
}

function currentWorkspaceWindows(): SavedWorkspaceWindow[] {
  const dynamicWindows = dynamicVisualizationWindows.peek();
  return currentWorkspaceWindowsFromIdsInto(currentWorkspaceWindowBuffer, {
    windowIds: windowManager.ids() as WindowId[],
    isVisualizationWindow,
    visualizationIdForWindow: (windowId) => isVisualizationWindow(windowId) ? dynamicWindows[windowId] : undefined,
    asciiForWindow: (windowId) => cloneAsciiOptions(asciiForWindow(windowId).peek()),
  });
}

function currentWorkspaceManagedWindows(): SavedWorkspaceManagedWindow[] {
  return windowManager.inspect().windows
    .filter((entry) => !entry.closed)
    .map((entry, index) => ({
      id: entry.id,
      state: entry.minimized ? "minimized" as const : "normal" as const,
      order: entry.order ?? index,
    }));
}

function currentWorkspaceLayoutState(): {
  managedWindows: SavedWorkspaceManagedWindow[];
  activeWindowId?: string;
  fullscreenWindowId?: string;
  tileDensity: number;
  tiledLayout: TiledWorkspaceSnapshot;
} {
  tiledWorkspace.reconcile(tiledWindowInventory(), { activeWindowId: activeWindowId() });
  return {
    managedWindows: currentWorkspaceManagedWindows(),
    activeWindowId: windowManager.activeId.peek(),
    fullscreenWindowId: windowManager.fullscreenId.peek(),
    tileDensity: tileDensity.peek(),
    tiledLayout: tiledWorkspace.snapshot(),
  };
}

function restoreWorkspaceLayoutState(workspace: SavedWorkspace): void {
  if (workspace.managedWindows) {
    const saved = new Map(workspace.managedWindows.map((entry) => [entry.id, entry]));
    windowManager.windows.value = windowManager.windows.peek().map((entry, fallbackOrder) => {
      const state = saved.get(entry.id);
      return {
        ...entry,
        state: state?.state ?? "closed",
        order: state?.order ?? fallbackOrder,
      };
    });
    const normalIds = new Set(
      windowManager.windows.peek().filter((entry) => entry.state === "normal").map((entry) => entry.id),
    );
    const activeId = workspace.activeWindowId && normalIds.has(workspace.activeWindowId)
      ? workspace.activeWindowId
      : normalIds.values().next().value;
    windowManager.activeId.value = activeId;
    windowManager.fullscreenId.value = workspace.fullscreenWindowId && normalIds.has(workspace.fullscreenWindowId)
      ? workspace.fullscreenWindowId
      : undefined;
  }
  if (workspace.tileDensity !== undefined) tileDensity.value = workspace.tileDensity;
  if (workspace.tiledLayout) tiledWorkspace.restore(workspace.tiledLayout, tiledWindowInventory());
  else {
    tiledWorkspace.state.value = {};
    tiledWorkspace.reconcile(tiledWindowInventory(), { activeWindowId: activeWindowId() });
  }
  syncWindowManagerOrderFromTiles();
}

function workspaceByName(name: string | null | undefined): SavedWorkspace | undefined {
  return findWorkbenchWorkspace(savedWorkspaces.peek(), name);
}

function workspaceWindowEntries(workspace: SavedWorkspace): SavedWorkspaceWindow[] {
  return workbenchWorkspaceWindowEntries(workspace, {
    validVisualizationIds: visualizationWindowOptionIds,
    normalizeAscii: (value) =>
      value ? normalizeAsciiOptions(value as AsciiOptions, createDefaultWorkbenchAsciiOptions()) : undefined,
  });
}

async function persistActiveWorkspaceState(): Promise<void> {
  const name = activeWorkspaceName.peek();
  const workspace = workspaceByName(name);
  if (!workspace) return;
  savedWorkspaces.value = saveWorkspaceState({
    workspaces: savedWorkspaces.peek(),
    draftName: workspace.name,
    windows: currentWorkspaceWindows(),
    ...currentWorkspaceLayoutState(),
  }).workspaces;
  await persistSavedWorkspaces();
}

async function persistSavedWorkspaces(): Promise<void> {
  await persistWorkbenchWorkspaceStorage(savedWorkspaces.peek(), workspaceStorageOptions());
}

function workspaceStorageOptions() {
  return apiWorkbenchWorkspaceStorageOptions<AsciiOptions>({
    key: WORKSPACE_STORE_KEY,
    store: workspaceStore,
    validVisualizationIds: visualizationWindowOptionIds,
    normalizeAscii: (candidate) =>
      candidate ? normalizeAsciiOptions(candidate as AsciiOptions, createDefaultWorkbenchAsciiOptions()) : undefined,
    diagnostics: workbenchDiagnostics,
  });
}

function openWorkbenchModal(): void {
  modal.open(workbenchDemoModalContent({ profile: "terminal" }));
  pushLog("modal opened");
}

function openQuitModal(): void {
  closeTopMenus();
  asciiConfigs.closeEditor();
  modal.open(workbenchQuitModalContent({ profile: "terminal" }));
  pushLog("quit confirmation");
}

function openHelpModal(): void {
  modal.open(workbenchHelpModalContent({ profile: "terminal" }));
  pushLog("help opened");
}

function applyModalAction(actionId: string): void {
  if (actionId === "workspace-save") {
    void saveCurrentWorkspace();
    return;
  }
  if (actionId === "workspace-rename") {
    void renameWorkspace();
    return;
  }
  if (actionId === "workspace-delete") {
    void deleteWorkspace();
    return;
  }
  if (actionId === "workspace-cancel") {
    clearWorkspaceModalState();
    modal.close();
    pushLog("workspace action cancelled");
    return;
  }
  if (actionId === "terminal-search-run") {
    runTerminalShellSearch();
    return;
  }
  if (actionId === "terminal-search-cancel") {
    closeTerminalShellSearchModal();
    pushLog("shell search cancelled");
    return;
  }
  if (actionId === "details") {
    modal.open(workbenchModalDetailsContent({ profile: "terminal" }));
    pushLog("modal details");
    return;
  }
  if (actionId === "back") {
    openWorkbenchModal();
    return;
  }
  if (actionId === "confirm") {
    modal.open(workbenchModalConfirmedContent({ profile: "terminal" }));
    pushLog("modal confirmed");
    return;
  }
  if (actionId === "controls") {
    modal.close();
    focus("controls");
    return;
  }
  if (actionId === "quit") {
    tui.emit("destroy");
    return;
  }

  modal.close();
  pushLog(`modal ${actionId}`);
}

function handleLayoutPointerPress(event: MousePressEvent): boolean {
  if (event.release) {
    const session = layoutPointerSession;
    layoutPointerSession = null;
    if (!session) return false;
    if (session.kind === "window" && session.moved) finishWindowDock(session.sourceId, event.x, event.y);
    if (session.kind === "separator") void persistActiveWorkspaceState();
    return true;
  }

  const session = layoutPointerSession;
  if (session) {
    if (session.kind === "separator") {
      const projection = tiledLayoutProjection;
      const delta = session.axis === "column" ? event.movementX : event.movementY;
      if (projection && delta !== 0) {
        tiledWorkspace.resizeSplit(session.splitId, delta, projection.bounds, {
          gap: workbenchTiledGap(),
          separatorHitSize: 3,
          visibleWindowIds: tiledVisibleWindowIds(),
        });
      }
    } else if (event.drag) {
      session.moved ||= event.x !== session.startX || event.y !== session.startY;
    }
    return true;
  }

  const hit = findHit(event.x, event.y);
  if (hit?.action.type === "layoutSeparator") {
    layoutPointerSession = {
      kind: "separator",
      splitId: hit.action.splitId,
      axis: hit.action.axis,
    };
    return true;
  }
  if (hit?.action.type === "windowTitlebar" && !fullscreenWindowId()) {
    focus(hit.action.id);
    layoutPointerSession = {
      kind: "window",
      sourceId: hit.action.id,
      startX: event.x,
      startY: event.y,
      moved: event.drag,
    };
    return true;
  }
  return false;
}

function finishWindowDock(sourceId: WindowId, screenColumn: number, screenRow: number): void {
  const projection = tiledLayoutProjection;
  if (!projection) return;
  const geometry = workbenchScreenGeometry();
  const column = screenColumn - geometry.workspace.column;
  const row = screenRow - geometry.workspace.row + workspaceScroll.offset.peek().rows;
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
  windowManager.focus(sourceId);
  void persistActiveWorkspaceState();
  pushLog(
    `${edge ? `dock ${edge}` : "swap"} ${windowTitle(sourceId)} with ${windowTitle(target.windowId as WindowId)}`,
  );
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
  return column >= rect.column && row >= rect.row && column < rect.column + rect.width && row < rect.row + rect.height;
}

function applyHit(target: { rect: Rectangle; action: HitAction }, x: number, y: number): void {
  const action = target.action;
  if (action.type === "menu") {
    menu.setActive(action.index);
    menu.selectActive();
  } else if (action.type === "quit") openQuitModal();
  else if (action.type === "windowTab") {
    windowManager.selectTab(action.id);
    logWindowAction("fullscreenTab", action.id);
  } else if (action.type === "focus") focus(action.id);
  else if (action.type === "windowTitlebar") focus(action.id);
  else if (action.type === "minimize") minimize(action.id);
  else if (action.type === "maximize") toggleMaximize(action.id);
  else if (action.type === "close") closeWindow(action.id);
  else if (action.type === "threeViewport") focus(action.id);
  else if (action.type === "threeConfig") openThreeConfigModal(action.id);
  else if (action.type === "asciiConfig") applyThreeConfigRow(action.index, action.action ?? "activate");
  else if (action.type === "asciiConfigAction") applyThreeConfigModalAction(action.action);
  else if (action.type === "asciiConfigBackdrop") return;
  else if (action.type === "restore") {
    windowManager.restore(action.id);
    void persistActiveWorkspaceState();
    pushLog(`restore ${windowTitle(action.id)}`);
  } else if (action.type === "control") {
    applyControlHit(action.id, action.action ?? "activate", target.rect, x, action.index);
  } else if (action.type === "terminalOutput") {
    void applyTerminalOutputAction(action.action);
  } else if (action.type === "terminalShell") {
    void applyTerminalShellAction(action.action);
  } else if (action.type === "terminalShellPane") {
    if (terminalShell.workspace.activatePane(action.id)) {
      terminalShellInputMode.value = activeTerminalShell()?.running ? "raw" : "workbench";
      focus(TERMINAL_SHELL_WINDOW_ID);
      pushLog("shell pane active");
    }
  } else if (action.type === "terminalShellSession") {
    if (terminalShell.activate(action.id)) {
      const session = terminalShell.inspect().sessions.find((entry) => entry.id === action.id);
      terminalShellInputMode.value = session?.shell.running ? "raw" : "workbench";
      focus(TERMINAL_SHELL_WINDOW_ID);
      pushLog(`shell active ${session?.title ?? action.id}`);
    }
  } else if (action.type === "terminalShellCopyRow") {
    const shell = activeTerminalShell();
    if (shell?.scrollback.setSelection(action.index)) {
      terminalShellInputMode.value = "workbench";
      focus(TERMINAL_SHELL_WINDOW_ID);
      pushLog(`shell selected row ${action.index + 1}`);
    }
  } else if (action.type === "modalAction") {
    if (action.index >= 0) modal.activateAction(action.index);
  } else if (action.type === "dataRow") selectDataRow(action.index);
  else if (action.type === "explorerRow") selectExplorerRow(action.index);
  else if (action.type === "cpuHexTile") selectCpuHexTile(action.id, action.label);
  else if (action.type === "newWindow") {
    toggleNewWindowOption(newWindowOptions[action.index], { keepMenuOpen: true });
  } else if (action.type === "workspace") applyWorkspaceMenuItem(action.index);
  else if (action.type === "view") applyViewMenuItem(action.index);
  else if (action.type === "layout") applyLayoutMenuItem(action.index);
  else if (action.type === "windowVScrollbar") {
    const scroll = windowScroll(action.id);
    const next = resolveApiWorkbenchWindowVScrollbarOffset({
      contentHeight: scroll.contentHeight.peek(),
      viewportHeight: scroll.viewportHeight.peek(),
      currentColumns: scroll.offset.peek().columns,
      pointerRow: y - target.rect.row,
    });
    scroll.scrollTo(next.columns, next.rows);
    windowManager.focus(action.id);
  } else if (action.type === "windowHScrollbar") {
    const scroll = windowScroll(action.id);
    const next = resolveApiWorkbenchWindowHScrollbarOffset({
      contentWidth: scroll.contentWidth.peek(),
      viewportWidth: scroll.viewportWidth.peek(),
      currentRows: scroll.offset.peek().rows,
      pointerColumn: x - target.rect.column,
    });
    scroll.scrollTo(next.columns, next.rows);
    windowManager.focus(action.id);
  } else if (action.type === "workspaceScrollbar") {
    const next = resolveApiWorkbenchWorkspaceScrollbarOffset({
      contentHeight: workspaceScroll.contentHeight.peek(),
      viewportHeight: target.rect.height,
      pointerRow: y - target.rect.row,
    });
    workspaceScroll.scrollTo(next.columns, next.rows);
  } else if (action.type === "theme") setTheme(action.index);
}

async function applyTerminalOutputAction(action: TerminalOutputAction): Promise<void> {
  focus(TERMINAL_OUTPUT_WINDOW_ID);
  if (action === "run") {
    await terminalOutputSession.start();
    pushLog("terminal run");
  } else if (action === "stop") {
    await terminalOutputSession.stop();
    pushLog("terminal stop");
  } else if (action === "restart") {
    await terminalOutputSession.restart();
    pushLog("terminal restart");
  } else if (action === "clear") {
    terminalOutputSession.clearOutput();
    pushLog("terminal clear");
  } else if (action === "follow") {
    const follow = terminalOutputSession.output.toggleFollow();
    pushLog(`terminal follow ${follow ? "on" : "off"}`);
  } else if (action === "raw") {
    toggleTerminalInputMode();
  } else if (action === "copy") {
    pushLog(`terminal command ${formatProcessCommandLine(terminalOutputSession.command.peek())}`);
  }
  scheduleDraw();
}

async function applyTerminalShellAction(action: TerminalShellAction): Promise<void> {
  focus(TERMINAL_SHELL_WINDOW_ID);
  const shell = activeTerminalShell();
  if (action === "new") {
    const descriptor = terminalShell.add(
      shellTerminalTemplate(nextApiWorkbenchTerminalSessionDraft(terminalShell.inspect().sessions)),
      {
        activate: true,
        start: true,
      },
    );
    terminalShellInputMode.value = "raw";
    pushLog(`shell add ${descriptor.title}`);
  } else if (action === "previous") {
    const descriptor = terminalShell.activateRelative(-1);
    pushLog(descriptor ? `shell active ${descriptor.title}` : "shell previous unavailable");
  } else if (action === "next") {
    const descriptor = terminalShell.activateRelative(1);
    pushLog(descriptor ? `shell active ${descriptor.title}` : "shell next unavailable");
  } else if (action === "close") {
    const activeId = terminalShell.inspect().activeId;
    if (activeId) {
      await terminalShell.remove(activeId);
      terminalShellInputMode.value = activeTerminalShell()?.running ? "raw" : "workbench";
      pushLog("shell session closed");
    }
  } else if (action === "splitRow" || action === "splitColumn") {
    const descriptor = addSplitTerminalShell(action === "splitRow" ? "row" : "column");
    if (descriptor) {
      terminalShellInputMode.value = "raw";
      pushLog(`shell split ${descriptor.title}`);
    }
  } else if (action === "zoomPane") {
    const paneId = terminalShell.workspace.inspectLayout().activePaneId;
    if (paneId) {
      terminalShell.workspace.toggleZoomPane(paneId);
      pushLog("shell pane zoom");
    }
  } else if (action === "closePane") {
    const paneId = terminalShell.workspace.inspectLayout().activePaneId;
    if (paneId && terminalShell.workspace.inspectLayout().count > 1) {
      terminalShell.workspace.closePane(paneId);
      terminalShellInputMode.value = activeTerminalShell()?.running ? "raw" : "workbench";
      pushLog("shell pane closed");
    }
  } else if (action === "start") {
    await terminalShell.start();
    activeTerminalShell()?.scrollback.exitCopyMode();
    terminalShellInputMode.value = "raw";
    pushLog("shell start");
  } else if (action === "stop") {
    await terminalShell.stop();
    terminalShellInputMode.value = "workbench";
    pushLog("shell stop");
  } else if (action === "restart") {
    await terminalShell.restart();
    activeTerminalShell()?.scrollback.exitCopyMode();
    terminalShellInputMode.value = "raw";
    pushLog("shell restart");
  } else if (action === "clear") {
    shell?.clear();
    shell?.scrollback.exitCopyMode();
    pushLog("shell clear");
  } else if (action === "raw") {
    toggleTerminalShellInputMode();
  } else if (action === "copy") {
    if (shell?.scrollback.mode === "copy") {
      shell.scrollback.exitCopyMode();
      pushLog("shell copy mode off");
    } else if (shell) {
      shell.scrollback.enterCopyMode();
      terminalShellInputMode.value = "workbench";
      pushLog("shell copy mode on");
    }
  } else if (action === "search") {
    openTerminalShellSearchModal();
  } else if (action === "previousMatch") {
    moveTerminalShellSearchMatch(-1);
  } else if (action === "nextMatch") {
    moveTerminalShellSearchMatch(1);
  } else if (action === "top") {
    shell?.scrollback.toTop();
    terminalShellInputMode.value = "workbench";
    pushLog("shell scroll top");
  } else if (action === "bottom") {
    shell?.scrollback.toBottom();
    terminalShellInputMode.value = "workbench";
    pushLog("shell scroll bottom");
  }
  scheduleDraw();
}

function openThreeConfigModal(id: WindowId): void {
  if (!isThreeRenderedWindow(id)) return;
  modal.close();
  closeTopMenus();
  asciiConfigs.openEditor(id, isThreeRenderedWindow);
  focus(id);
  pushLog(`configure ${windowTitle(id)}`);
}

function closeThreeConfigModal(): void {
  asciiConfigs.closeEditor();
  pushLog("three config closed");
}

function handleWorkbenchKey(event: KeyPressEvent): void {
  const active = activeWindowId();
  const global = resolveWorkbenchGlobalKey(event, { activeWindowId: active, layoutMode: layoutMode.peek() });
  if (event.key.toLowerCase() === "f6" || layoutMode.peek()) {
    if (applyWorkbenchGlobalKeyAction(global, { phase: "primary" })) return;
    return;
  }
  if (active === TERMINAL_SHELL_WINDOW_ID && handleTerminalShellKey(event)) return;
  if (active === TERMINAL_OUTPUT_WINDOW_ID && handleTerminalOutputKey(event)) return;
  const globalHandled = applyWorkbenchGlobalKeyAction(global, { phase: "primary" });
  if (globalHandled) return;
  if (event.ctrl || event.meta) return;

  if (handleCpuHexGridKey(event)) return;
  if (applyWorkbenchGlobalKeyAction(global, { phase: "preWindow" })) return;
  if (active === "explorer" && explorerKeys.has(event.key)) {
    explorer.handleKeyPress(event, Math.max(1, currentHeight() - 8));
  } else if (active === "controls") handleControlsKey(event);
  else if (active === "data" && event.key.toLowerCase() === "s") {
    const current = table.state.peek().sort?.columnId;
    const next = nextSortableDataColumn(columns, current, event.shift ? -1 : 1);
    if (next) {
      table.toggleSort(next.id);
      pushLog(`sort data by ${next.label}`);
    }
  } else if (active === "data") table.handleKeyPress(event as never);
  else applyWorkbenchGlobalKeyAction(global, { phase: "postWindow" });
}

function applyWorkbenchGlobalKeyAction(
  action: ReturnType<typeof resolveWorkbenchGlobalKey>,
  options: { phase: "primary" | "preWindow" | "postWindow" },
): boolean {
  const id = activeWindowId();
  switch (action.kind) {
    case "ignore":
      return false;
    case "quit":
      openQuitModal();
      return true;
    case "focusMenu":
      focusMenu();
      return true;
    case "help":
      openHelpModal();
      return true;
    case "openNewWindowMenu":
      openNewWindowMenu();
      return true;
    case "openThemeMenu":
      openThemeMenu();
      return true;
    case "cycleTheme":
      setTheme(themeIndex.peek() + 1);
      return true;
    case "openThreeConfig":
      openThreeConfigModal(id);
      return true;
    case "closeWindow":
      closeWindow(id);
      return true;
    case "minimizeWindow":
      minimize(id);
      return true;
    case "toggleMaximize":
      toggleMaximize(id);
      return true;
    case "restoreAll":
      restoreAll();
      return true;
    case "focusControl":
      focusNextControl(action.delta);
      return true;
    case "focusWindow":
      action.delta < 0 ? focusPrevious() : focusNext();
      return true;
    case "focusWindowNumber": {
      const target = (windowManager.ids() as WindowId[])[action.index];
      if (!target) return false;
      focus(target);
      return true;
    }
    case "restoreNextMinimized":
      {
        const restored = windowManager.restoreNextMinimized();
        if (!restored) {
          pushLog("no minimized windows");
          return true;
        }
        void persistActiveWorkspaceState();
        pushLog(`restore ${windowTitle(restored.id as WindowId)}`);
      }
      return true;
    case "toggleLayoutMode":
      toggleLayoutMode();
      return true;
    case "moveWindow":
      moveActiveWindow(action.delta);
      return true;
    case "resizeWindow":
      resizeActiveTile(action.columns, action.rows);
      return true;
    case "adjustTileDensity":
      adjustTileDensity(action.delta);
      return true;
    case "scrollPage":
      if (options.phase !== "preWindow") return false;
      scrollWindow(id, 0, action.delta * Math.max(1, windowScroll(id).viewportHeight.peek() - 1));
      return true;
    case "scrollHome":
      if (options.phase !== "preWindow") return false;
      windowScrolls.get(id)?.scrollTo(0, 0);
      return true;
    case "scrollEnd": {
      if (options.phase !== "preWindow") return false;
      const scroll = windowScrolls.get(id);
      scroll?.scrollTo(scroll.offset.peek().columns, scroll.maxOffset().rows);
      return true;
    }
    case "scrollHorizontal":
      if (options.phase !== "preWindow") return false;
      scrollWindow(id, action.delta, 0);
      return true;
    case "incrementDensity":
      if (options.phase !== "postWindow") return false;
      action.delta > 0 ? density.increment() : density.decrement();
      return true;
    case "toggleLivePreview":
      if (options.phase !== "postWindow") return false;
      livePreview.toggle();
      return true;
    case "scrollLine":
      if (options.phase !== "postWindow") return false;
      scrollWindow(id, action.columns, action.rows);
      return true;
  }
}

function handleTerminalShellKey(event: KeyPressEvent): boolean {
  const shell = activeTerminalShell();
  if (!shell) return false;
  if (shell.scrollback.mode === "copy") {
    if (event.key === "escape" || event.key.toLowerCase() === "i") {
      shell.scrollback.exitCopyMode();
      terminalShellInputMode.value = shell.running ? "raw" : "workbench";
      pushLog("shell copy mode off");
      return true;
    }
    if (event.ctrl || event.meta) return false;
    if (event.key === "pageup") shell.scrollback.page(-1);
    else if (event.key === "pagedown") shell.scrollback.page(1);
    else if (event.key === "home") shell.scrollback.toTop();
    else if (event.key === "end") shell.scrollback.toBottom();
    else if (event.key === "space") {
      shell.scrollback.selectVisibleRow(0);
      pushLog("shell selection started");
    } else if (event.key === "up" && event.shift) shell.scrollback.moveSelection(-1);
    else if (event.key === "down" && event.shift) shell.scrollback.moveSelection(1);
    else if (event.key === "up") shell.scrollback.scrollLines(-1);
    else if (event.key === "down") shell.scrollback.scrollLines(1);
    else if (event.key === "/") openTerminalShellSearchModal();
    else if (event.key === "n" && event.shift) moveTerminalShellSearchMatch(-1);
    else if (event.key.toLowerCase() === "n") moveTerminalShellSearchMatch(1);
    else if (event.key.toLowerCase() === "c") {
      const text = shell.scrollback.copySelection();
      pushLog(text ? `shell copied ${text.length} chars` : "shell selection empty");
    } else return false;
    scheduleDraw();
    return true;
  }

  if (terminalShellInputMode.peek() === "raw") {
    if (event.key === "escape") {
      terminalShellInputMode.value = "workbench";
      pushLog("shell input workbench mode");
      return true;
    }
    if (event.meta || event.key === "f10") return false;
    void routeTerminalKeyPress(shell, event, {
      mode: "raw",
      reservedKeys: ["f10", "escape"],
      reservedCtrlKeys: [],
    }).then((decision) => {
      if (!decision.routed && decision.reason !== "reserved") {
        pushLog(`shell input ${decision.reason}`);
      }
      scheduleDraw();
    });
    return true;
  }

  if (event.ctrl || event.meta) return false;
  const action = resolveWorkbenchTerminalShellKeyAction(event);
  if (action === "copyPageUp" || action === "copyPageDown") {
    shell.scrollback.enterCopyMode();
    shell.scrollback.page(action === "copyPageUp" ? -1 : 1);
    terminalShellInputMode.value = "workbench";
    scheduleDraw();
    return true;
  }
  if (!action) return false;
  void applyTerminalShellAction(action);
  return true;
}

function handleTerminalShellPaste(event: PasteEvent): boolean {
  if (activeWindowId() !== TERMINAL_SHELL_WINDOW_ID || terminalShellInputMode.peek() !== "raw") return false;
  const shell = activeTerminalShell();
  if (!shell) return false;
  void routeTerminalPaste(shell, event, {
    mode: "raw",
    bracketedPaste: shell.inspect().screen.privateModes.includes(2004),
  }).then((decision) => {
    if (!decision.routed) pushLog(`shell paste ${decision.reason}`);
    scheduleDraw();
  });
  return true;
}

function handleTerminalShellMouse(event: MousePressEvent | MouseScrollEvent, rect: Rectangle): boolean {
  if (activeWindowId() !== TERMINAL_SHELL_WINDOW_ID || terminalShellInputMode.peek() !== "raw") return false;
  const shell = activeTerminalShell();
  if (!shell) return false;
  const mouseRouting = terminalMouseRoutingFromPrivateModes(shell.inspect().screen.privateModes);
  if (mouseRouting.mouseTracking === "none" || !mouseRouting.sgrMouse) return false;
  void routeTerminalMouse(shell, event, {
    mode: "raw",
    ...mouseRouting,
    mouseOrigin: { column: rect.column, row: rect.row },
  }).then((decision) => {
    if (!decision.routed && decision.reason !== "unencodable") pushLog(`shell mouse ${decision.reason}`);
    scheduleDraw();
  });
  return true;
}

function handleTerminalShellScroll(event: MouseScrollEvent): boolean {
  if (activeWindowId() !== TERMINAL_SHELL_WINDOW_ID) return false;
  const shell = activeTerminalShell();
  if (!shell) return false;
  const inspection = shell.scrollback.inspect();
  if (inspection.totalRows <= inspection.viewportRows) return false;
  shell.scrollback.scrollLines(event.scroll);
  terminalShellInputMode.value = "workbench";
  if (inspection.mode === "live") pushLog("shell copy mode on");
  return true;
}

function shellShouldReceiveCtrlC(): boolean {
  return activeWindowId() === TERMINAL_SHELL_WINDOW_ID && terminalShellInputMode.peek() === "raw" &&
    activeTerminalShell()?.running === true;
}

function handleTerminalOutputKey(event: KeyPressEvent): boolean {
  if (terminalInputMode.peek() === "raw") {
    if (event.key === "escape") {
      terminalInputMode.value = "workbench";
      pushLog("terminal input workbench mode");
      return true;
    }
    if (event.meta || event.key === "f10" || (event.ctrl && event.key === "c")) return false;
    void routeTerminalKeyPress(terminalOutputSession, event, { mode: "raw" }).then((decision) => {
      if (!decision.routed && decision.reason !== "reserved") {
        pushLog(`terminal input ${decision.reason}`);
      }
      scheduleDraw();
    });
    return true;
  }
  if (event.ctrl || event.meta) return false;
  const action = resolveWorkbenchTerminalOutputKeyAction(event);
  if (!action) return false;
  void applyTerminalOutputAction(action);
  return true;
}

function handleCpuHexGridKey(event: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): boolean {
  if (event.ctrl || event.meta || event.shift) return false;
  const key = event.key;
  if (key !== "left" && key !== "right" && key !== "up" && key !== "down" && key !== "home" && key !== "end") {
    return false;
  }

  const id = activeWindowId();
  if (!isVisualizationWindow(id) || dynamicVisualizationWindows.peek()[id] !== "cpu-hex-grid") return false;

  const system = systemMonitor.snapshot.peek();
  const cores = system.cpuCores;
  if (cores.length === 0) return true;

  const scroll = windowScroll(id);
  const columns = cpuHexGridColumnCount(
    cores,
    Math.max(8, scroll.contentWidth.peek()),
    Math.max(4, scroll.viewportHeight.peek()),
  );
  const nextLabel = nextCpuHexLabel(cores, selectedCpuHexTiles.peek()[id], key as CpuHexNavigationKey, columns);
  if (nextLabel) selectCpuHexTile(id, nextLabel);
  return true;
}

function handleMenuFocusKey(event: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): void {
  const action = resolveWorkbenchMenuFocusKey(event);
  switch (action.kind) {
    case "ignore":
      return;
    case "close":
      closeTopMenus();
      return;
    case "focusWindow":
      closeTopMenus();
      action.delta < 0 ? focusPrevious() : focusNext();
      return;
    case "moveMenu":
      menu.handleKeyPress(event);
      return;
    case "selectActive":
      menu.selectActive();
      return;
  }
}

function handleScreenDropdownKey(event: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): void {
  const action = resolveWorkbenchScreenDropdownKey({
    event,
    openId: topMenus.inspect().openId,
    indexes: {
      theme: themeIndex.peek(),
      newWindow: workbenchController.menuIndex("newWindow"),
      workspace: workbenchController.menuIndex("workspace"),
      view: workbenchController.menuIndex("view"),
      layout: workbenchController.menuIndex("layout"),
    },
    counts: {
      theme: themes.length,
      newWindow: newWindowOptions.length,
      workspace: workspaceMenuItemCount(),
      view: VIEW_MENU_ENTRIES.length,
      layout: LAYOUT_MENU_ENTRIES.length,
    },
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
    case "moveTopMenu":
      menu.move(action.delta);
      openActiveTopMenu();
      return;
    case "menuItem":
      if (action.menuId === "theme") {
        themeIndex.value = action.index;
        if (action.activate) setTheme(action.index);
      } else if (action.menuId === "newWindow") {
        workbenchController.setMenuIndex("newWindow", action.index, newWindowOptions.length);
        if (action.activate) {
          toggleNewWindowOption(newWindowOptions[action.index], { keepMenuOpen: true });
        }
      } else if (action.menuId === "workspace") {
        workbenchController.setMenuIndex("workspace", action.index, workspaceMenuItemCount());
        if (action.activate) applyWorkspaceMenuItem(action.index);
      } else if (action.menuId === "view") {
        workbenchController.setMenuIndex("view", action.index, VIEW_MENU_ENTRIES.length);
        if (action.activate) applyViewMenuItem(action.index);
      } else {
        workbenchController.setMenuIndex("layout", action.index, LAYOUT_MENU_ENTRIES.length);
        if (action.activate) applyLayoutMenuItem(action.index);
      }
  }
}

function focusMenu(): void {
  topMenus.focus();
  topMenus.close(false);
  pushLog("menu focus");
}

function openActiveTopMenu(): void {
  switch (workbenchStandardTopMenuIdForItem(menu.active()?.id)) {
    case "theme":
      openThemeMenu();
      return;
    case "newWindow":
      openNewWindowMenu();
      return;
    case "workspace":
      {
        const index = menu.items.peek().findIndex((item) => item.id === "workspace");
        if (index >= 0) menu.setActive(index);
        workbenchController.openMenu("workspace", workspaceMenuItemCount());
        pushLog("open workspace menu");
      }
      return;
    case "view":
      openViewMenu();
      return;
    case "layout":
      openLayoutMenu();
      return;
  }
  topMenus.close(false);
}

function openThemeMenu(): void {
  const index = menu.items.peek().findIndex((item) => item.id === "theme");
  if (index >= 0) menu.setActive(index);
  topMenus.open("theme");
  pushLog("open theme menu");
}

function openNewWindowMenu(): void {
  const index = menu.items.peek().findIndex((item) => item.id === "new");
  if (index >= 0) menu.setActive(index);
  workbenchController.openMenu("newWindow", newWindowOptions.length);
  pushLog("open new window menu");
}

function openViewMenu(): void {
  const index = menu.items.peek().findIndex((item) => item.id === "view");
  if (index >= 0) menu.setActive(index);
  workbenchController.openMenu("view", VIEW_MENU_ENTRIES.length);
  pushLog("open view menu");
}

function openLayoutMenu(): void {
  const index = menu.items.peek().findIndex((item) => item.id === "layout");
  if (index >= 0) menu.setActive(index);
  workbenchController.openMenu("layout", LAYOUT_MENU_ENTRIES.length);
  pushLog("open layout menu");
}

function closeTopMenus(clearFocus = true): void {
  topMenus.close(clearFocus);
}

function handleThreeConfigKey(event: { key: string; shift?: boolean }): void {
  asciiConfigs.handleEditorKey(event, threeConfigRows.length, applyThreeConfigModalAction, applyThreeConfigRow);
}

function closeWindow(id: WindowId, options: { preserveWorkspace?: boolean } = {}): void {
  const plan = workbenchWindowClosePlan({
    windowId: id,
    isVisualizationWindow,
    isTerminalShellWindow: (candidate) => candidate === TERMINAL_SHELL_WINDOW_ID,
    selectedVisualizationTiles: selectedCpuHexTiles.peek(),
  });
  if (plan.visualizationWindowId) {
    updateActiveWorkspaceAfterWindowMutation(options);
    disposeVisualizationThreePanel(plan.visualizationWindowId);
    disposeAsciiForWindow(plan.visualizationWindowId);
    if (plan.selectedVisualizationTilesChanged) {
      selectedCpuHexTiles.value = plan.selectedVisualizationTiles as Record<VisualizationWindowId, string>;
    }
  }
  if (plan.stopTerminalShell) {
    void activeTerminalShell()?.stop();
    terminalShellInputMode.value = "workbench";
  }
  windowManager.close(id);
  if (!plan.visualizationWindowId) void persistActiveWorkspaceState();
  windowContentFrames.delete(id);
  pushLog(`close ${windowTitle(id)}`);
}

function toggleNewWindowOption(
  option: NewWindowOption | undefined,
  options: { keepMenuOpen?: boolean; ascii?: AsciiOptions; preserveWorkspace?: boolean } = {},
): void {
  const plan = workbenchWindowOptionTogglePlan<BuiltInWindowId>(option);
  if (plan.action === "builtIn") return toggleBuiltInWindow(plan.id, options);
  if (plan.action === "visualization") return toggleVisualizationWindow(plan.option, options);
}

function toggleBuiltInWindow(
  id: BuiltInWindowId,
  options: { keepMenuOpen?: boolean } = {},
): void {
  const plan = workbenchBuiltInWindowTogglePlan({
    id,
    loadedWindowIds: windowManager.ids(),
    keepMenuOpen: options.keepMenuOpen,
    terminalShellWindowId: TERMINAL_SHELL_WINDOW_ID,
  });
  if (plan.action === "close") {
    closeWindow(id);
    if (!plan.keepMenuOpen) closeTopMenus();
    else topMenus.focus();
    return;
  }
  if (!plan.keepMenuOpen) closeTopMenus();
  windowManager.restore(id);
  focus(id);
  void persistActiveWorkspaceState();
  const shell = activeTerminalShell();
  if (plan.startTerminalShell && shell && !shell.running && shell.status.peek() !== "starting") {
    void terminalShell.start().then((started) => {
      if (started) terminalShellInputMode.value = "raw";
      scheduleDraw();
    });
  }
  if (plan.focusTopMenuAfterAction) topMenus.focus();
  pushLog(`add window ${windowTitle(id)}`);
}

function toggleVisualizationWindow(
  option: NewWindowOption | undefined,
  options: { keepMenuOpen?: boolean; ascii?: AsciiOptions; preserveWorkspace?: boolean } = {},
): void {
  const plan = workbenchVisualizationWindowTogglePlan({
    option,
    loadedWindowIds: windowManager.ids(),
  });
  if (plan.action === "close") {
    closeWindow(plan.id as VisualizationWindowId);
    if (!options.keepMenuOpen) closeTopMenus();
    else topMenus.focus();
    return;
  }
  if (plan.action === "add") addVisualizationWindow(plan.option, options);
}

function addVisualizationWindow(
  option: NewWindowOption | undefined,
  options: { keepMenuOpen?: boolean; ascii?: AsciiOptions; preserveWorkspace?: boolean } = {},
): void {
  if (!option) return;
  const id = workbenchVisualizationWindowId(option.id) as VisualizationWindowId;
  updateActiveWorkspaceAfterWindowMutation(options);
  if (!options.keepMenuOpen) closeTopMenus();
  if (options.ascii) setAsciiForWindow(id, options.ascii);
  else asciiForWindow(id);
  const plan = workbenchVisualizationWindowRegistrationPlan({
    option,
    existingWindowIds: windowManager.ids({ includeClosed: true }),
    currentWindowCount: windowManager.windows.peek().length,
  });
  if (plan.action === "create") {
    dynamicVisualizationWindows.value = { ...dynamicVisualizationWindows.peek(), [id]: plan.visualizationId };
    windowScrolls.set(id, new ScrollAreaController({ showScrollbar: true }));
    windowManager.windows.value = [...windowManager.windows.peek(), plan.registration!];
  } else {
    windowManager.restore(id);
  }
  focus(id);
  if (options.keepMenuOpen) topMenus.focus();
  pushLog(`add window ${option.label}`);
}

function applyControlHit(
  id: ControlId,
  action: ControlHitAction,
  rect?: Rectangle,
  x?: number,
  index?: number,
): void {
  windowManager.focus("controls");
  controlsModel.applyHit(id, action, rect, x, index);
  pushLog(`control ${id} ${action}`);
}

function selectDataRow(index: number): void {
  windowManager.focus("data");
  table.select(index);
  const selected = table.selectedKey() ?? `${index}`;
  pushLog(`data row selected: ${selected}`);
}

function selectExplorerRow(index: number): void {
  windowManager.focus("explorer");
  explorer.tree.setSelectedIndex(index);
  const entry = explorer.selected();
  if (entry?.kind === "file") explorer.openActive();
  else if (entry?.kind === "directory") explorer.tree.toggleActive();
  pushLog(`explorer ${entry?.path ?? index}`);
}

function selectCpuHexTile(id: VisualizationWindowId, label: string): void {
  if (dynamicVisualizationWindows.peek()[id] !== "cpu-hex-grid") return;
  selectedCpuHexTiles.value = selectedCpuHexTilesWith(selectedCpuHexTiles.peek(), id, label);
  windowManager.focus(id);
  ensureCpuHexTileVisible(id, label);
  pushLog(`cpu ${label} selected: ${topCpuProcessLabelForCpu(label, systemMonitor.snapshot.peek().processes)}`);
}

function ensureCpuHexTileVisible(id: VisualizationWindowId, label: string): void {
  const scroll = windowScrolls.get(id);
  if (!scroll) return;
  const system = systemMonitor.snapshot.peek();
  const tiles = cpuHexTileLayoutInto(
    cpuHexRevealTileBuffer,
    system.cpuCores,
    Math.max(8, scroll.contentWidth.peek()),
    Math.max(4, scroll.viewportHeight.peek()),
  );
  const offset = scroll.offset.peek();
  const target = cpuHexTileScrollTarget({
    label,
    tiles,
    offset,
    viewportHeight: scroll.viewportHeight.peek(),
  });
  if (target) scroll.scrollTo(target.columns, target.rows);
}

function handleControlsKey(event: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): void {
  controlsModel.handleKey(event, applyControlHit);
}

function blurTextControl(): void {
  const previous = activeControl.peek();
  windowManager.focus("controls");
  controlsModel.moveActive(1);
  pushLog(`control ${previous} blur`);
}

function focusNextControl(delta = 1): void {
  windowManager.focus("controls");
  const next = controlsModel.moveActiveAtEdge(delta);
  if (next) {
    pushLog(`control ${activeControl.peek()} focus`);
    return;
  }
  delta < 0 ? focusPrevious() : focusNext();
}

function isTextControlActive(): boolean {
  return isApiWorkbenchTextControlActive(activeWindowId(), "controls", activeControl.peek());
}

function pushLog(message: string): void {
  commandLog.value = appendBoundedWorkbenchLogRow(
    commandLog.peek(),
    `${new Date().toLocaleTimeString()} ${message}`,
    8,
  );
}

function writeRows(frame: Frame, rect: Rectangle, rows: readonly RowStyle[]): void {
  framePainter.writeRows(frame, rect, rows);
}

function write(frame: Frame, row: number, column: number, value: string): void {
  framePainter.write(frame, row, column, value);
}

function fillRow(frame: Frame, row: number, bg: string): void {
  framePainter.fillRow(frame, row, bg);
}

function fillRect(frame: Frame, rect: Rectangle, bg: string): void {
  framePainter.fillRect(frame, rect, bg);
}

function paint(text: string, options: { fg?: string; bg?: string; bold?: boolean } = {}): string {
  return framePainter.paint(text, options);
}

function writeButton(
  frame: Frame,
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

function addHit(rect: Rectangle, action: HitAction): void {
  hitTargets.add(rect, action);
}

function findHit(x: number, y: number): { rect: Rectangle; action: HitAction } | undefined {
  return findApiWorkbenchHitTarget({
    targets: hitTargets,
    x,
    y,
    bounds: { column: 0, row: 0, width: currentWidth(), height: currentHeight() },
    touchOptimized: isApiWorkbenchTouchOptimizedLayout({
      columns: currentWidth(),
      rows: currentHeight(),
    }),
  });
}

function windowTitle(id: WindowId): string {
  const visualizationLabel = isVisualizationWindow(id)
    ? visualizationOption(dynamicVisualizationWindows.peek()[id])?.label ?? ""
    : undefined;
  const terminalOutputTitle = id === TERMINAL_OUTPUT_WINDOW_ID
    ? formatTerminalOutputWindowTitle(terminalOutputSession.inspect(), {
      mode: terminalInputMode.peek() === "raw" ? "RAW" : "WB",
    })
    : undefined;
  let terminalShellTitle: string | undefined;
  if (id === TERMINAL_SHELL_WINDOW_ID) {
    const mode = terminalShellInputMode.peek() === "raw" ? "RAW" : "WB";
    const shell = activeTerminalShell();
    terminalShellTitle = shell ? formatTerminalShellWindowTitle(shell.inspect(), { mode }) : `Shell ${mode} EMPTY`;
  }
  return apiWorkbenchWindowTitle({
    id,
    visualizationLabel,
    terminalOutputId: TERMINAL_OUTPUT_WINDOW_ID,
    terminalOutputTitle,
    terminalShellId: TERMINAL_SHELL_WINDOW_ID,
    terminalShellTitle,
    fallback: "Three ASCII",
  });
}

function isVisualizationWindow(id: WindowId): id is VisualizationWindowId {
  return isWorkbenchVisualizationWindowId(id);
}

function visualizationOption(visualizationId: string | undefined): NewWindowOption | undefined {
  return visualizationId ? visualizationWindowOptionById.get(visualizationId) : undefined;
}

function theme(): ThemeSpec {
  return themes[themeIndex.value] ?? themes[0]!;
}

function currentWidth(): number {
  return Math.max(1, Math.floor(tui.canvas.size.peek().columns));
}

function currentHeight(): number {
  return Math.max(1, Math.floor(tui.canvas.size.peek().rows));
}

function syncTerminalSize(): boolean {
  const result = syncWorkbenchTerminalSize(tui.canvas.size, readWorkbenchVerifiedConsoleSize);
  const observed = repaintPolicy.inspectScreenSize(tui.canvas.size.peek());
  if (!result.changed && !observed.changed) return false;
  screenPainter.clearScreen();
  repaintPolicy.resetFullRepaintClock();
  requestResizeFullRepaintWindowAfterInitialObservation();
  return true;
}

function requestResizeFullRepaintWindowAfterInitialObservation(): void {
  if (!workbenchScreenSizeObserved) {
    workbenchScreenSizeObserved = true;
    return;
  }
  repaintPolicy.requestFullRepaintWindow();
}
