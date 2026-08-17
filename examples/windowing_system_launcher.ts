import {
  createFileExplorerTree,
  FileExplorerController,
  type FileExplorerEntry,
  WindowManagerController,
  type WindowManagerWindowInspection,
} from "../mod.ts";
import { requireInteractiveTerminal } from "../app/styles.ts";

export type WorkspaceDemoKind = "app" | "renderer" | "widget" | "report" | "runtime";

export interface WorkspaceDemoItem {
  id: string;
  path: string;
  title: string;
  kind: WorkspaceDemoKind;
  task: string;
  summary: string;
  features: readonly string[];
  preview: readonly string[];
}

export interface WorkspaceDemoState {
  explorer: FileExplorerController;
  manager: WindowManagerController;
  openedIds: Set<string>;
  log: string[];
  quitModalOpen: boolean;
  quitModalAction: "cancel" | "quit";
}

export interface WorkspaceDemoScreenOptions {
  width?: number;
  height?: number;
  frame?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const pendingKeys: string[] = [];

export const workspaceDemoItems: readonly WorkspaceDemoItem[] = [
  {
    id: "system-monitor",
    path: "apps/system-monitor.viz",
    title: "System Monitor",
    kind: "app",
    task: "viz",
    summary: "Live CPU, memory, process, network, audio source, and 3D visualization dashboard.",
    features: ["multi-pane layouts", "selectable sources", "three ASCII panels", "runtime telemetry"],
    preview: [
      "CPU    [████████░░] 78%     NET  42.1 MiB/s",
      "MEM    [██████░░░░] 61%     DISK 13.4 MiB/s",
      "PROC   renderer  worker-pool  deno  compositor",
      "Use L to launch the full monitor with F4 options and live panels.",
    ],
  },
  {
    id: "three-ascii",
    path: "renderers/three-ascii.viz",
    title: "Three ASCII Renderer",
    kind: "renderer",
    task: "three-ascii",
    summary: "Standalone WebGPU/WebGL three.js ASCII renderer with block, glyph, and mixed style controls.",
    features: ["Acerola ASCII backend", "glyph/block/mixed modes", "geometry presets", "edge/fill tuning"],
    preview: [
      // Each art|caption line must fit the preview card (~40 columns) or the
      // wrap breaks the two-column alignment (QA-022).
      "  .-======-.    / torus knot",
      ".-==######==-.  | sphere + cube",
      "==##@@@@@@##==  | glyphs: mixed-best",
      "Use L to run the real interactive renderer.",
    ],
  },
  {
    id: "api-workbench",
    path: "apps/api-workbench.tui",
    title: "API Workbench",
    kind: "app",
    task: "api-workbench",
    summary: "Dense controller-first portfolio with windows, menus, controls, modals, tables, and themes.",
    features: ["window controls", "theme selector", "data table", "modal dialogs", "form controls"],
    preview: [
      "Explorer | Inspector | Data Table | Controls | Logs",
      "Sliders, radio groups, checkboxes, dropdowns, text input, and multiline text boxes.",
      "The workbench uses the same WindowManagerController and FileExplorerController.",
    ],
  },
  {
    id: "exomux",
    path: "apps/exomux.tui",
    title: "Exomux Terminal Multiplexer",
    kind: "app",
    task: "exomux",
    summary: "Persistent local PTY host with detachable, draggable, themeable, and tileable terminal windows.",
    features: [
      "real PTY shells",
      "detach and reattach",
      "drag/resize/snap/tile",
      "xterm-256 and truecolor",
      "durable layouts",
    ],
    preview: [
      'Ctrl-B c creates a terminal; Ctrl-B % and " tile beside or below.',
      "Closing a window detaches its view while the local host keeps the process alive.",
      "Drag floating title bars and borders, resize tiled separators, cycle four themes, and reattach later.",
      "Use L to launch Exomux. Ordinary quit detaches; only a confirmed Kill destroys a session.",
    ],
  },
  {
    id: "showcase",
    path: "apps/showcase.tui",
    title: "Widget Showcase",
    kind: "app",
    task: "showcase",
    summary: "Full widget and Neon Exodus-inspired visualization showcase.",
    features: ["widget wall", "terminal controls", "visual panels", "theme-aware layout"],
    preview: [
      "Buttons  Inputs  Lists  Tables  Tabs  Modals",
      "Gauges   Sparklines  Logs  Menus  Status bars",
      "Built to prove the component surface in one dense app.",
    ],
  },
  {
    id: "component-catalog",
    path: "widgets/component-catalog.report",
    title: "Component Catalog",
    kind: "widget",
    task: "component-catalog",
    summary: "Queryable report of widget metadata, categories, capabilities, and command adapters.",
    features: ["catalog filtering", "capability tags", "command projection", "docs metadata"],
    preview: [
      "input: Button Input Checkbox Radio Combo Slider TextBox",
      "data:  Table DataTable Tree FileExplorer VirtualList",
      "overlay: Modal ContextMenu Toast CommandPalette",
    ],
  },
  {
    id: "table-selection",
    path: "widgets/table-selection.workflow",
    title: "Table Selection",
    kind: "widget",
    task: "table-selection",
    summary: "Data table sorting, paging, keyed rows, and multi-selection workflow.",
    features: ["keyed selection", "paging", "sorting", "command bindings"],
    preview: [
      "Name              CPU    Memory     Status",
      "> worker-pool     39%    260 MiB    ready",
      "  query-index     21%    128 MiB    ready",
    ],
  },
  {
    id: "neon-exodus",
    path: "visualizations/neon-exodus.suite",
    title: "Neon Exodus Suite",
    kind: "app",
    task: "neon-exodus",
    summary: "OpenTUI parity, web ordering, and extended Neon Exodus demo suite.",
    features: ["24-panel deck", "OpenTUI mode", "web mode", "ASCII studio scene"],
    preview: [
      "OpenTUI deck: matrix, rings, waveforms, particle fields, warning panels",
      "Extended mode adds the Acerola ASCII studio and this fork's richer widgets.",
    ],
  },
  {
    id: "runtime-workloads",
    path: "runtime/runtime-workloads.demo",
    title: "Runtime Workloads",
    kind: "runtime",
    task: "runtime-workloads",
    summary: "Scheduler and worker-pool pressure demo for concurrent TUI workloads.",
    features: ["AsyncScheduler", "WorkerPool", "telemetry", "abortable tasks"],
    preview: [
      "queue: high=2 normal=8 low=4",
      "workers: active=3 idle=1 completed=128",
      "profiles: portable | balanced | aggressive",
    ],
  },
] as const;

const itemByPath = new Map(workspaceDemoItems.map((item) => [`/${item.path}`, item]));
const itemById = new Map(workspaceDemoItems.map((item) => [item.id, item]));
const WORKSPACE_KEY_SEQUENCES: readonly [string, string][] = [
  ["\x1b[5~", "pageup"],
  ["\x1b[6~", "pagedown"],
  ["\x1b[1~", "home"],
  ["\x1b[4~", "end"],
  ["\x1b[Z", "backtab"],
  ["\x1b[A", "up"],
  ["\x1b[B", "down"],
  ["\x1b[C", "right"],
  ["\x1b[D", "left"],
  ["\x1b[H", "home"],
  ["\x1b[F", "end"],
  ["\r", "enter"],
  ["\n", "enter"],
  ["\t", "tab"],
  ["\x1b", "escape"],
];

export function createWorkspaceDemoState(
  openIds: readonly string[] = ["system-monitor", "three-ascii"],
): WorkspaceDemoState {
  const explorer = new FileExplorerController({
    root: createFileExplorerTree(workspaceDemoItems.map((item) => item.path)),
  });
  const openedIds = new Set(openIds.filter((id) => itemById.has(id)));
  const windows = [
    { id: "explorer", title: "File Explorer", minWidth: 28, minHeight: 12, closable: false },
    { id: "welcome", title: "Launch Pad", minWidth: 36, minHeight: 10, closable: false },
    ...[...openedIds].map((id) => {
      const item = itemById.get(id)!;
      return { id, title: item.title, minWidth: 38, minHeight: 10 };
    }),
  ];
  return {
    explorer,
    openedIds,
    manager: new WindowManagerController({ activeId: "explorer", windows }),
    log: ["ready: select a demo in the file explorer and press Enter"],
    quitModalOpen: false,
    quitModalAction: "cancel",
  };
}

export function openWorkspaceItem(
  state: WorkspaceDemoState,
  entryOrPath: FileExplorerEntry | string,
): WorkspaceDemoItem | undefined {
  const path = typeof entryOrPath === "string" ? entryOrPath : entryOrPath.path;
  const item = itemByPath.get(path);
  if (!item) return undefined;
  if (!state.openedIds.has(item.id)) {
    state.openedIds.add(item.id);
    state.manager.windows.value = [
      ...state.manager.windows.peek(),
      { id: item.id, title: item.title, minWidth: 38, minHeight: 10, order: state.manager.windows.peek().length },
    ];
  }
  state.manager.focus(item.id);
  state.log.unshift(`open: ${item.title}`);
  state.log.splice(5);
  return item;
}

export function selectedWorkspaceItem(state: WorkspaceDemoState): WorkspaceDemoItem | undefined {
  const selected = state.explorer.selected();
  return selected ? itemByPath.get(selected.path) : undefined;
}

export function activeWorkspaceItem(state: WorkspaceDemoState): WorkspaceDemoItem | undefined {
  const activeId = state.manager.activeId.peek();
  return activeId ? itemById.get(activeId) : undefined;
}

export function openWorkspaceQuitModal(state: WorkspaceDemoState): void {
  state.quitModalOpen = true;
  state.quitModalAction = "cancel";
  state.log.unshift("quit requested");
  state.log.splice(5);
}

export function handleWorkspaceQuitModalKey(state: WorkspaceDemoState, key: string): boolean {
  if (!state.quitModalOpen) return false;
  if (key === "escape" || key === "n" || key === "q") {
    state.quitModalOpen = false;
    state.quitModalAction = "cancel";
    state.log.unshift("quit cancelled");
    state.log.splice(5);
    return false;
  }
  if (key === "left" || key === "right" || key === "tab" || key === "backtab") {
    state.quitModalAction = state.quitModalAction === "cancel" ? "quit" : "cancel";
    return false;
  }
  if (key === "y") return true;
  if (key === "enter") return state.quitModalAction === "quit";
  return false;
}

export function formatWorkspaceDemoScreen(
  state: WorkspaceDemoState,
  options: WorkspaceDemoScreenOptions = {},
): string {
  const width = Math.max(24, options.width ?? 118);
  const height = Math.max(12, options.height ?? 34);
  const frame = options.frame ?? 0;
  const canvas = createCanvas(width, height, " ");
  const topBar = wrapBarLines([
    "WINDOWING SYSTEM LAUNCHER  FileExplorer -> WindowManager",
    "Enter open preview  L launch real task  Tab focus  F fullscreen  M hide  R restore  Q confirm quit",
  ], width);
  writeBarLines(canvas, 0, topBar, width);

  const selected = selectedWorkspaceItem(state);
  const active = activeWorkspaceItem(state);
  const layoutForTabs = state.manager.inspect();
  const bottomPrimary = layoutForTabs.fullscreenId
    ? layoutForTabs.tabs.map((tab) => `${tab.fullscreen ? "[" : " "}${tab.title}${tab.fullscreen ? "]" : " "}`).join(
      " ",
    )
    : `open windows: ${
      [...state.openedIds].map((id) => itemById.get(id)?.title).filter(Boolean).join(" | ") || "none"
    }`;
  const bottomBar = wrapBarLines([
    bottomPrimary,
    `selected ${selected?.title ?? "folder"} | active ${active?.title ?? state.manager.activeId.peek() ?? "none"}`,
  ], width);
  const bottomStart = Math.max(topBar.length, height - bottomBar.length);
  const contentHeight = Math.max(0, bottomStart - topBar.length);
  const layout = state.manager.layout({ bounds: { column: 0, row: 0, width, height: contentHeight } });
  for (const window of layout.visible) {
    if (!window.rect) continue;
    const rect = { ...window.rect, row: window.rect.row + topBar.length };
    drawWindow(canvas, rect, window, state, frame);
  }

  writeBarLines(canvas, bottomStart, bottomBar, width);
  if (state.quitModalOpen) drawQuitModal(canvas, width, height, state.quitModalAction);
  return canvas.map((row) => row.join("")).join("\n");
}

if (import.meta.main) {
  if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
    console.log(formatWorkspaceLauncherHelp());
    Deno.exit(0);
  }
  requireInteractiveTerminal("deno task workspace-launcher");
  const launch = await runInteractiveWorkspace();
  if (launch) await launchTask(launch.task);
}

export function formatWorkspaceLauncherHelp(): string {
  return [
    "Workspace Launcher",
    "",
    "Interactive file-explorer-driven mini desktop for opening demos, widgets, and visualizations as windows.",
    "",
    "Keys:",
    "  arrows       navigate the file explorer when it is focused",
    "  Enter        open selected explorer item, or fullscreen the active preview window",
    "  L            launch the active or selected item as its real deno task",
    "  Tab          cycle window focus",
    "  F            toggle fullscreen",
    "  M            hide/minimize the active window",
    "  R            restore hidden windows",
    "  Q/Esc        open quit confirmation",
    "",
    "Included launch targets:",
    ...workspaceDemoItems.map((item) => `  ${item.path.padEnd(36)} deno task ${item.task}`),
  ].join("\n");
}

async function runInteractiveWorkspace(): Promise<WorkspaceDemoItem | undefined> {
  const state = createWorkspaceDemoState();
  let frame = 0;
  let launch: WorkspaceDemoItem | undefined;
  Deno.stdin.setRaw(true, { cbreak: true });
  write("\x1b[?1049h\x1b[?25l\x1b[2J");
  try {
    while (true) {
      const size = Deno.consoleSize();
      write(`\x1b[H${formatWorkspaceDemoScreen(state, { width: size.columns, height: size.rows, frame })}`);
      frame += 1;
      const key = await readKey();
      if (state.quitModalOpen) {
        if (handleWorkspaceQuitModalKey(state, key)) break;
        continue;
      }
      if (key === "q" || key === "escape") {
        openWorkspaceQuitModal(state);
        continue;
      }
      if (key === "tab") state.manager.focusNext();
      else if (key === "backtab") state.manager.focusNext(-1);
      else if (key === "f") state.manager.fullscreen(state.manager.activeId.peek());
      else if (key === "m") state.manager.minimize(state.manager.activeId.peek());
      else if (key === "r") state.manager.restore();
      else if (key === "1") state.manager.focus("explorer");
      else if (key === "2") state.manager.focus("welcome");
      else if (key === "enter") {
        if (state.manager.activeId.peek() === "explorer") {
          openWorkspaceItem(state, state.explorer.selected()?.path ?? "");
        } else state.manager.fullscreen(state.manager.activeId.peek());
      } else if (key === "l") {
        launch = activeWorkspaceItem(state) ?? selectedWorkspaceItem(state);
        if (launch) break;
      } else if (state.manager.activeId.peek() === "explorer") {
        state.explorer.handleKeyPress({ key }, Math.max(1, size.rows - 8));
      }
    }
  } finally {
    Deno.stdin.setRaw(false);
    state.explorer.dispose();
    state.manager.dispose();
    write("\x1b[?25h\x1b[?1049l");
  }
  return launch;
}

async function launchTask(task: string): Promise<void> {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["task", task],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  Deno.exit(status.code);
}

async function readKey(): Promise<string> {
  const queued = pendingKeys.shift();
  if (queued) return queued;
  const buffer = new Uint8Array(16);
  const size = await Deno.stdin.read(buffer);
  const value = decoder.decode(buffer.subarray(0, size ?? 0));
  pendingKeys.push(...decodeWorkspaceKeys(value));
  return pendingKeys.shift() ?? "";
}

export function decodeWorkspaceKeys(value: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < value.length;) {
    const rest = value.slice(index);
    const sequence = WORKSPACE_KEY_SEQUENCES.find(([code]) => rest.startsWith(code));
    if (sequence) {
      keys.push(sequence[1]);
      index += sequence[0].length;
      continue;
    }
    const char = value[index]!;
    keys.push(char === " " ? "space" : char.toLowerCase());
    index += 1;
  }
  return keys;
}

function drawWindow(
  canvas: string[][],
  rect: { column: number; row: number; width: number; height: number },
  window: WindowManagerWindowInspection,
  state: WorkspaceDemoState,
  frame: number,
): void {
  const active = window.active;
  const horizontal = active ? "=" : "-";
  const vertical = active ? "!" : "|";
  drawBox(canvas, rect, `${active ? "*" : " "} ${window.title}`, horizontal, vertical);
  const inner = {
    column: rect.column + 1,
    row: rect.row + 1,
    width: Math.max(0, rect.width - 2),
    height: Math.max(0, rect.height - 2),
  };
  if (window.id === "explorer") drawExplorer(canvas, inner, state);
  else if (window.id === "welcome") drawWelcome(canvas, inner, state);
  else drawItemPreview(canvas, inner, itemById.get(window.id), frame);
}

function drawExplorer(
  canvas: string[][],
  rect: { column: number; row: number; width: number; height: number },
  state: WorkspaceDemoState,
): void {
  const entries = state.explorer.inspect(rect.height).entries.slice(
    state.explorer.inspect(rect.height).window.start,
    state.explorer.inspect(rect.height).window.end,
  );
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const selected = entry.id === state.explorer.selected()?.id;
    const item = itemByPath.get(entry.path);
    const badge = item ? ` ${item.kind}` : "";
    writeText(canvas, rect.column, rect.row + index, fit(`${selected ? ">" : " "} ${entry.text}${badge}`, rect.width));
  }
}

function drawWelcome(
  canvas: string[][],
  rect: { column: number; row: number; width: number; height: number },
  state: WorkspaceDemoState,
): void {
  const lines = [
    "Use the File Explorer pane to browse runnable demos and widgets.",
    "Enter opens the selected item as a managed window.",
    "L launches the active or selected item as the real Deno task.",
    "",
    "Recommended path:",
    "1. apps/system-monitor.viz",
    "2. renderers/three-ascii.viz",
    "3. widgets/component-catalog.report",
    "",
    ...state.log.map((line) => `log: ${line}`),
  ];
  writeLines(canvas, rect, lines);
}

function drawItemPreview(
  canvas: string[][],
  rect: { column: number; row: number; width: number; height: number },
  item: WorkspaceDemoItem | undefined,
  frame: number,
): void {
  if (!item) return;
  const pulse = "▁▂▃▄▅▆▇█".slice(frame % 8) + "▁▂▃▄▅▆▇█".slice(0, frame % 8);
  const lines = [
    `${item.kind.toUpperCase()}  deno task ${item.task}`,
    item.summary,
    "",
    `features: ${item.features.join(" / ")}`,
    "",
    ...item.preview,
    "",
    `activity ${pulse}`,
  ];
  writeLines(canvas, rect, lines);
}

function drawQuitModal(canvas: string[][], width: number, height: number, selected: "cancel" | "quit"): void {
  const modalWidth = Math.min(Math.max(44, Math.floor(width * 0.48)), Math.max(20, width - 4));
  const modalHeight = 9;
  const rect = {
    column: Math.max(0, Math.floor((width - modalWidth) / 2)),
    row: Math.max(2, Math.floor((height - modalHeight) / 2)),
    width: modalWidth,
    height: modalHeight,
  };
  fillRect(canvas, rect, " ");
  drawBox(canvas, rect, "* Confirm Quit", "=", "!");
  const inner = {
    column: rect.column + 2,
    row: rect.row + 2,
    width: Math.max(0, rect.width - 4),
    height: Math.max(0, rect.height - 4),
  };
  writeLines(canvas, inner, [
    "Are you sure you want to quit the workspace launcher?",
    "",
    "Use Left/Right or Tab to choose. Enter applies the selected action.",
  ]);
  const cancel = selected === "cancel" ? "[ Cancel ]" : "  Cancel  ";
  const quit = selected === "quit" ? "[ Quit ]" : "  Quit  ";
  writeText(
    canvas,
    inner.column,
    rect.row + rect.height - 2,
    fit(`${cancel}    ${quit}    Y confirm / N cancel`, inner.width),
  );
}

function wrapBarLines(lines: readonly string[], width: number): string[] {
  return lines.flatMap((line) => wrapLine(line, width));
}

function writeBarLines(canvas: string[][], startRow: number, lines: readonly string[], width: number): void {
  for (let index = 0; index < lines.length; index += 1) {
    writeText(canvas, 0, startRow + index, fit(lines[index]!, width));
  }
}

function writeLines(
  canvas: string[][],
  rect: { column: number; row: number; width: number; height: number },
  lines: readonly string[],
): void {
  let row = 0;
  for (const line of lines) {
    for (const wrapped of wrapLine(line, rect.width)) {
      if (row >= rect.height) return;
      writeText(canvas, rect.column, rect.row + row, fit(wrapped, rect.width));
      row += 1;
    }
  }
}

function drawBox(
  canvas: string[][],
  rect: { column: number; row: number; width: number; height: number },
  title: string,
  horizontal: string,
  vertical: string,
): void {
  if (rect.width <= 1 || rect.height <= 1) return;
  writeText(canvas, rect.column, rect.row, `+${horizontal.repeat(Math.max(0, rect.width - 2))}+`);
  for (let row = 1; row < rect.height - 1; row += 1) {
    writeText(canvas, rect.column, rect.row + row, vertical);
    writeText(canvas, rect.column + rect.width - 1, rect.row + row, vertical);
  }
  writeText(canvas, rect.column, rect.row + rect.height - 1, `+${horizontal.repeat(Math.max(0, rect.width - 2))}+`);
  writeText(canvas, rect.column + 2, rect.row, fit(` ${title} `, Math.max(0, rect.width - 4)));
}

function fillRect(
  canvas: string[][],
  rect: { column: number; row: number; width: number; height: number },
  fill: string,
): void {
  for (let row = 0; row < rect.height; row += 1) {
    writeText(canvas, rect.column, rect.row + row, fill.repeat(Math.max(0, rect.width)));
  }
}

function createCanvas(width: number, height: number, fill: string): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function writeText(canvas: string[][], column: number, row: number, text: string): void {
  if (row < 0 || row >= canvas.length) return;
  const line = canvas[row]!;
  for (let index = 0; index < text.length; index += 1) {
    const x = column + index;
    if (x >= 0 && x < line.length) line[x] = text[index]!;
  }
}

function wrapLine(value: string, width: number): string[] {
  if (width <= 0) return [];
  if (value.length <= width) return [value];
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + word.length + 1 <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.flatMap((line) => line.length <= width ? [line] : chunks(line, width));
}

function chunks(value: string, width: number): string[] {
  const result: string[] = [];
  for (let index = 0; index < value.length; index += width) result.push(value.slice(index, index + width));
  return result;
}

function fit(value: string, width: number): string {
  if (width <= 0) return "";
  return value.length > width ? `${value.slice(0, Math.max(0, width - 1))}…` : value.padEnd(width);
}

function write(value: string): void {
  Deno.stdout.writeSync(encoder.encode(value));
}
