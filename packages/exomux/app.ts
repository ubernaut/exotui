// Copyright 2023 Im-Beast. MIT license.

import { createTerminalApp, type TerminalApp, type TerminalAppOptions } from "@ubernaut/deno-tui/app";
import { createSurfaceTransitionAnimator, type SurfaceTransitionOverlay } from "@ubernaut/deno-tui/app";
import type { SurfaceTransition } from "@ubernaut/deno-tui";
import {
  clampContextMenuSelection,
  Component,
  type ComponentOptions,
  Computed,
  contextMenuPlacement,
  createAnsiStyle,
  createAnyMotionTracking,
  DrawObject,
  encodeTerminalKeyPress,
  listWindowFromTop,
  modalActionRects,
  ModalController,
  type PointerInputEvent,
  type Rectangle,
  resolveTerminalCellStyle,
  selectionWindow,
  shiftContextMenuSelection,
  Signal,
  type SignalOfObject,
  softwareCursorRender,
  type Style,
  type TerminalCellStyleOptions,
  type TreeRow,
  windowResizeGlyphAt,
  type WorkbenchWindowChromeProjection,
  type WorkbenchWindowHostCommand,
  type WorkbenchWindowHostProjection,
  type WorkbenchWindowHostProjectionOptions,
} from "@ubernaut/deno-tui";
import type { KeyPressEvent, MousePressEvent, MouseScrollEvent } from "@ubernaut/deno-tui";
import {
  layoutWorkbenchButtonRowInto,
  type WorkbenchButtonRowItem,
  type WorkbenchButtonRowPlacement,
  type WorkbenchButtonRowRenderCommand,
  workbenchButtonRowRenderCommandsInto,
} from "@ubernaut/deno-tui";
import {
  createExomuxController,
  EXOMUX_NETWORK_WINDOW_ID,
  EXOMUX_SESSIONS_WINDOW_ID,
  EXOMUX_SETTINGS_WINDOW_ID,
  ExomuxController,
  type ExomuxControllerOptions,
  exomuxNetworkNodeAction,
  exomuxNetworkNodeHostShellTarget,
  exomuxNetworkNodeHostTarget,
  exomuxNetworkNodeRemoteSession,
  exomuxNetworkNodeSessionId,
  exomuxScpCandidatePath,
  exomuxScpDestinationLabel,
  type ExomuxScpRequest,
  type ExomuxTerminalRuntime,
} from "./controller.ts";
import {
  EXOMUX_BACKGROUND_IDS,
  EXOMUX_BACKGROUND_SETTING_SPECS,
  EXOMUX_GLOBAL_SETTING_SPECS,
  EXOMUX_THEMES,
  EXOMUX_WINDOW_SETTING_SPECS,
  exomuxActiveTitlebarForeground,
  type ExomuxBackgroundId,
  exomuxBackgroundSettingsFor,
  type ExomuxBorderGlyphs,
  exomuxBorderGlyphs,
  exomuxControlOpacity,
  exomuxResolvedOpacity,
  exomuxResolvedScrollLines,
  type ExomuxRgb,
  exomuxSessionIdFromWindow,
  type ExomuxSessionSummary,
  type ExomuxThemeSpec,
  exomuxWindowId,
  type ExomuxWindowSettings,
} from "./model.ts";
import { terminalClipboardSequence, textWidth } from "@ubernaut/deno-tui";
import {
  exomuxBackgroundOvergrows,
  type ExomuxOvergrowthEdges,
  exomuxOvergrowthEdges,
  exomuxOvergrowthRatio,
  ExomuxOvergrowthTracker,
  exomuxOvergrowthVisible,
} from "./overgrowth.ts";
import { ExomuxOperationQueue } from "./operation_queue.ts";
import {
  createExomuxDebugLogger,
  exomuxDebugLog,
  type ExomuxDebugLogger,
  formatExomuxFlushTelemetry,
} from "./debug_log.ts";
import { exomuxPincushionMagnitude, exomuxPointerWarpCell, isRunningInGhostty } from "./ghostty.ts";
import { EXOMUX_PROTOCOL_LIMITS } from "./protocol.ts";
import {
  type ExomuxSettingsButtonCells,
  type ExomuxSettingsButtonSpec,
  ExomuxSettingsWidgets,
} from "./settings_widgets.ts";
import { ExomuxSettingsSurface } from "./settings_surface.ts";
import { type ExomuxOptionControlSpec, ExomuxSettingsOptions } from "./settings_options.ts";
import { ExomuxInputField } from "./input_field.ts";
import { ExomuxBackgroundList } from "./background_list.ts";
import { ExomuxSessionList, type ExomuxSessionListRow } from "./session_list.ts";
import { formatExomuxUptime } from "./sessions.ts";
import { ExomuxNetworkTree } from "./network_tree.ts";
import { ExomuxStartMenu } from "./start_menu.ts";
import { widgetSurfaceCellData } from "./widget_surface.ts";
import {
  exomuxPointerCancellationEvent as pointerCancellationEvent,
  ExomuxTerminalMouseRouter,
} from "./terminal_mouse.ts";
import {
  type ExomuxAnimatedBackground,
  exomuxBackgroundAcceptsPicks,
  type ExomuxBackgroundCell,
  exomuxBackgroundHasOverlay,
  exomuxBackgroundHasPresets,
  releaseExomuxIdleBackgrounds,
} from "./background.ts";
import { ExomuxBiomechField } from "./biomech_background.ts";
import {
  EXOMUX_BUTTERCHURN_GPU_PRESETS,
  EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS,
  ExomuxButterchurnField,
} from "./butterchurn_background.ts";
import { ExomuxImageField, isExomuxImageFile } from "./image_background.ts";
import { destroyExomuxGpuDevice } from "./gpu_device.ts";
import { ExomuxCircuitField } from "./circuit_background.ts";
import { ExomuxJungleField } from "./jungle_background.ts";
import { ExomuxMatrixRainField } from "./matrix_background.ts";
import { ExomuxRainyWindowsField } from "./rainy_windows_background.ts";
import { ExomuxFireField } from "./fire_background.ts";
import { ExomuxIvyField } from "./ivy_background.ts";
import { ExomuxSkullField } from "./skull_background.ts";
import { ExomuxTurbulenceField } from "./turbulence_background.ts";
import { ExomuxVaporwaveField } from "./vaporwave_background.ts";
import {
  EXOMUX_METABALL_FRAME_INTERVAL_MS,
  EXOMUX_METABALL_LEVELS,
  ExomuxMetaballField,
} from "./metaball_background.ts";

/** Actions exposed through the application command registry. */
export type ExomuxAppAction =
  | Readonly<{ type: "exomux.new" }>
  | Readonly<{ type: "exomux.sessions" }>
  | Readonly<{ type: "exomux.theme" }>
  | Readonly<{ type: "exomux.help" }>
  | Readonly<{ type: "exomux.detach" }>
  | Readonly<{ type: "exomux.kill" }>
  | Readonly<{ type: "exomux.quit" }>;

/** Mutable mount slot populated synchronously by TerminalApp setup. */
export interface ExomuxAppMountRef {
  current?: ExomuxAppMount;
}

/** Mounted surfaces and interaction hooks useful to launchers and pilots. */
export interface ExomuxAppMount {
  readonly app: TerminalApp<ExomuxAppAction>;
  readonly controller: ExomuxController;
  readonly bodyRect: Computed<Rectangle>;
  readonly shelfBounds: Computed<Rectangle>;
  readonly windowProjection: Computed<WorkbenchWindowHostProjection>;
  readonly selectedSessionIndex: Signal<number>;
  /** Serializes workbench commands and raw PTY input in their arrival order. */
  enqueue(operation: () => void | Promise<unknown>): Promise<void>;
  /** Routes normalized browser/pen/touch input without compatibility-mouse duplication. */
  handlePointer(event: PointerInputEvent): Promise<boolean>;
  /** Routes physical wheel or trackpad scrolling at one cell coordinate. */
  handleScroll(event: MouseScrollEvent): Promise<boolean>;
  /** Returns the completed background-frame count for diagnostics and pilots. */
  metaballFrameRevision(): number;
  /** Retained-desktop render key; changes exactly when the desktop must repaint. */
  renderRevisionValue(): string;
  /** Window id → background reclaim ratio, for diagnostics and pilots. */
  overgrowthRatios(): ReadonlyMap<string, number>;
  whenIdle(): Promise<void>;
  dispose(): void;
}

/** Controller, app options, and mount reference returned to hosts. */
export interface ExomuxAppDefinition {
  readonly controller: ExomuxController;
  readonly mount: ExomuxAppMountRef;
  readonly terminalOptions: TerminalAppOptions<ExomuxAppAction>;
}

/** Minimal browser/mobile input source accepted by the Exomux pointer bridge. */
export interface ExomuxPointerInputSource {
  on(type: "pointerInput", listener: (event: PointerInputEvent) => void | Promise<void>): () => void;
  on(type: "mouseScroll", listener: (event: MouseScrollEvent) => void | Promise<void>): () => void;
}

/** Dependencies accepted by the definition/runtime factories. */
export interface CreateExomuxAppDefinitionOptions {
  readonly controller?: ExomuxController;
  readonly controllerOptions?: ExomuxControllerOptions;
}

/** Running real-terminal Exomux instance. */
export interface ExomuxTerminalAppRuntime {
  readonly app: TerminalApp<ExomuxAppAction>;
  readonly controller: ExomuxController;
  readonly mount: ExomuxAppMount;
  start(): void;
  destroy(): Promise<void>;
}

// One top bar, no bottom bars: the window taskbar sits inline on the top row
// and every command lives in the start-menu dropdown, so all other rows are
// terminal real estate.
const HEADER_ROWS = 1;
const FOOTER_ROWS = 0;
const SESSION_LIST_START = 3;
/** Start-menu button occupying the top-left, opening the command dropdown. */
const START_BUTTON_IDLE_LABEL = "≡ Exomux ▾";
const START_BUTTON_PREFIX_LABEL = "≡ PREFIX ▾";
const START_BUTTON = Object.freeze({ column: 0, row: 0, width: 14, height: 1 });
const MENU_QUIT_WIDTH = 5;
/** Command items listed in the start-menu dropdown, in display order. */
const START_MENU_ITEMS: readonly { readonly id: ExomuxMenuId; readonly label: string; readonly danger?: boolean }[] =
  Object.freeze([
    { id: "new", label: "New terminal" },
    { id: "network", label: "Network" },
    { id: "sessions", label: "Sessions" },
    { id: "config", label: "Settings" },
    { id: "help", label: "Help" },
    { id: "quit", label: "Quit", danger: true },
  ]);
const NETWORK_LIST_START = 1;
/** How often the block cursor re-asserts any-motion tracking so it can't be downgraded. */
const EXOMUX_ANY_MOTION_KEEPALIVE_MS = 1000;
/** Two title-bar clicks within this window count as a double-click (maximize/restore). */
const EXOMUX_DOUBLE_CLICK_MS = 400;
/** Block-cursor blink half-period — toggling every 250ms is a 2 Hz blink. */
const EXOMUX_CURSOR_BLINK_MS = 250;
/** How often the debug log gets one write-path telemetry line (UX-011). */
export const EXOMUX_FLUSH_TELEMETRY_MS = 5_000;
const MAX_TOUCH_GESTURES = 8;
const CLASSIFIED_INPUT_PIPELINE_DEPTH = 4;
const MAX_CLASSIFIED_INPUT_BYTES = EXOMUX_PROTOCOL_LIMITS.inputBytes * CLASSIFIED_INPUT_PIPELINE_DEPTH;
const MIN_CLASSIFIED_KEY_RESERVATION_BYTES = 64;

/**
 * Animation only yields to in-flight control barriers now. It used to also
 * yield to keyboard recency (with a 200ms stall cap) because every advance
 * forced a ~100ms full desktop repaint that would have wrecked input latency;
 * the cell-style memo made repaints ~10ms, and the surviving gate read as
 * "the background freezes on every keystroke" (user report, Aug 16 2026).
 * The unused parameters keep the exported signature stable.
 */
export function exomuxMetaballsMayAdvance(
  _now: number,
  _lastInputActivityAt: number,
  hasPendingBarrier: boolean,
  _msSinceLastAdvance = 0,
): boolean {
  return !hasPendingBarrier;
}

type ExomuxMenuId = "new" | "network" | "sessions" | "config" | "help" | "quit" | "favorite";

/** One entry in the start menu, before layout assigns it a rect. */
interface ExomuxStartMenuItem {
  readonly id: ExomuxMenuId;
  readonly label: string;
  readonly danger?: boolean;
}

/**
 * The start-menu entries for the current state. Over an active butterchurn
 * background the menu gains one context item — favorite the preset showing when
 * the menu opened (a filled box when it already is) — slotted in just below the
 * "Settings" command it belongs with. The preset name is captured at open time
 * in `startMenuPreset`, so the items are the same wherever the layout is
 * computed (paint, hit-test, keyboard).
 */
export function exomuxStartMenuItems(controller: ExomuxController): readonly ExomuxStartMenuItem[] {
  const preset = controller.startMenuPreset.peek();
  const id = controller.backgroundId.peek();
  const overButterchurn = id === "butterchurn" || id === "butterchurn cpu";
  if (!overButterchurn || preset === undefined) return START_MENU_ITEMS;
  const favorited = controller.isButterchurnFavorite(preset);
  const context: readonly ExomuxStartMenuItem[] = [
    { id: "favorite", label: `Favorite bg ${favorited ? "☑" : "☐"}` },
  ];
  // Below "Settings", not at the top: it reads as an extension of it, not a new
  // primary command. Falls back to appending if the config item ever moves.
  const at = START_MENU_ITEMS.findIndex((item) => item.id === "config");
  const insertAfter = at >= 0 ? at + 1 : START_MENU_ITEMS.length;
  return Object.freeze([
    ...START_MENU_ITEMS.slice(0, insertAfter),
    ...context,
    ...START_MENU_ITEMS.slice(insertAfter),
  ]);
}

function menuQuitRect(bounds: Rectangle): Rectangle {
  return {
    column: bounds.column + Math.max(0, bounds.width - MENU_QUIT_WIDTH),
    row: 0,
    width: Math.min(MENU_QUIT_WIDTH, bounds.width),
    height: 1,
  };
}

/** One command row inside the start-menu dropdown. */
export interface ExomuxStartMenuItemLayout {
  readonly id: ExomuxMenuId;
  readonly label: string;
  readonly danger: boolean;
  readonly rect: Rectangle;
}

/** Placement of the start-menu dropdown; exported for deterministic pointer tests. */
export interface ExomuxStartMenuLayout {
  readonly panelRect: Rectangle;
  readonly items: readonly ExomuxStartMenuItemLayout[];
}

/**
 * Lays out the start-menu dropdown hanging below the top-left button. The
 * entries default to the standard commands; pass `exomuxStartMenuItems(...)` to
 * include the context items an active butterchurn background adds.
 */
export function exomuxStartMenuLayout(
  bounds: Rectangle,
  anchor?: { readonly column: number; readonly row: number },
  entries: readonly ExomuxStartMenuItem[] = START_MENU_ITEMS,
): ExomuxStartMenuLayout {
  const labelWidth = entries.reduce((max, item) => Math.max(max, textWidth(item.label)), 0);
  const width = Math.min(Math.max(18, labelWidth + 4), Math.max(4, bounds.width));
  const height = Math.min(entries.length + 2, Math.max(3, bounds.height - 1));
  // Docked under the start button by default; a right-click anchors it at the
  // cursor, clamped on screen by the library's context-menu placement rule.
  const panelRect: Rectangle = contextMenuPlacement(bounds, width, height, anchor, {
    column: bounds.column,
    row: bounds.row + 1,
  });
  const items = entries.map((item, index) => ({
    id: item.id,
    label: item.label,
    danger: item.danger ?? false,
    rect: { column: panelRect.column + 1, row: panelRect.row + 1 + index, width: panelRect.width - 2, height: 1 },
  }));
  return { panelRect, items };
}

export type ExomuxTerminalBarAction =
  | Readonly<{ kind: "session"; sessionId: string }>
  | Readonly<{ kind: "sessions" }>;

export interface ExomuxTerminalBarProjection {
  readonly bounds: Rectangle;
  readonly collapsed: boolean;
  readonly commands: readonly WorkbenchButtonRowRenderCommand<ExomuxTerminalBarAction>[];
}

/**
 * Projects the persistent terminal taskbar. Every presentation window that is
 * still open participates, including normal, tiled, floating, and minimized
 * terminals. If one row cannot contain every button, the row becomes one
 * selector that opens the existing session manager instead of silently
 * dropping terminals.
 */
export function projectExomuxTerminalBar(
  controller: ExomuxController,
  _projection: WorkbenchWindowHostProjection,
  bounds: Rectangle,
): ExomuxTerminalBarProjection {
  const inspection = controller.windowHost.controller.inspect();
  const windowsById = new Map(inspection.windows.map((window) => [window.id, window]));
  const items: WorkbenchButtonRowItem<ExomuxTerminalBarAction>[] = [];
  for (const session of controller.sessions.peek()) {
    const windowId = exomuxWindowId(session.id);
    const window = windowsById.get(windowId);
    if (!window || window.state === "closed") continue;
    const hiddenPrefix = window.state === "minimized" ? "▁ " : "";
    items.push({
      label: `${hiddenPrefix}${fitText(session.title, 18)}`,
      action: { kind: "session", sessionId: session.id },
      active: inspection.activeWindowId === windowId,
    });
  }

  let collapsed = false;
  let placements: WorkbenchButtonRowPlacement<ExomuxTerminalBarAction>[] = [];
  layoutWorkbenchButtonRowInto(placements, items, bounds, bounds.row, { gap: 1 });
  if (placements.length < items.length) {
    collapsed = true;
    placements = [];
    layoutWorkbenchButtonRowInto(
      placements,
      [{
        label: `Terminals (${items.length}) ▾`,
        action: { kind: "sessions" },
      }],
      bounds,
      bounds.row,
      { gap: 0 },
    );
  }
  const commands: WorkbenchButtonRowRenderCommand<ExomuxTerminalBarAction>[] = [];
  workbenchButtonRowRenderCommandsInto(commands, placements);
  return { bounds: { ...bounds }, collapsed, commands };
}

type ExomuxTouchTarget =
  | Readonly<{ kind: "menu"; id: ExomuxMenuId; hitRect: Rectangle }>
  | Readonly<{ kind: "start-item"; id: ExomuxMenuId; hitRect: Rectangle }>
  | Readonly<{
    kind: "modal";
    action:
      | "close-help"
      | "cancel-kill"
      | "confirm-kill"
      | "cancel-quit"
      | "detach-quit"
      | "terminate-quit"
      | "cancel-scp"
      | "paste-scp"
      | "send-scp";
    sessionId?: string;
    hitRect: Rectangle;
  }>
  | Readonly<{ kind: "window-command"; command: WorkbenchWindowHostCommand; hitRect: Rectangle }>
  | Readonly<{ kind: "terminal-bar"; action: ExomuxTerminalBarAction; hitRect: Rectangle }>
  | Readonly<{ kind: "client"; windowId: string }>;

interface ExomuxTouchGesture {
  readonly target: ExomuxTouchTarget;
  readonly startColumn: number;
  readonly startRow: number;
  readonly startLocalX?: number;
  readonly startLocalY?: number;
  lastColumn: number;
  lastRow: number;
  moved: boolean;
}

interface ExomuxPointerMoveExcursion {
  minColumn?: number;
  maxColumn?: number;
  minRow?: number;
  maxRow?: number;
  minLocalX?: number;
  maxLocalX?: number;
  minLocalY?: number;
  maxLocalY?: number;
}

interface ExomuxPointerMoveSlot {
  event: PointerInputEvent;
  readonly ingressRevision: number;
  readonly excursion: ExomuxPointerMoveExcursion;
  readonly result: Promise<boolean>;
  readonly settle: (handled: boolean) => void;
  started: boolean;
}

type ExomuxManagerSessionHit =
  | { readonly kind: "terminal"; readonly session: ExomuxSessionSummary; readonly index: number }
  | { readonly kind: "host-session"; readonly name: string };

/** One row of the sessions panel: a terminal, a heading, or a host session. */
export type ExomuxManagerRow =
  | {
    readonly kind: "terminal";
    readonly session: ExomuxSessionSummary;
    readonly label: string;
    readonly running: boolean;
  }
  | { readonly kind: "heading"; readonly label: string }
  | {
    readonly kind: "host-session";
    readonly name: string;
    readonly label: string;
    readonly attachable: boolean;
    readonly current: boolean;
  };

/**
 * The sessions panel's combined rows: this session's terminals first, then —
 * when the host has other exomux sessions — a heading and one row per host
 * session with liveness, uptime, and terminal count (UX-006). Terminals come
 * first so `selectedSessionIndex` keeps indexing them directly.
 */
export function exomuxManagerRows(controller: ExomuxController): ExomuxManagerRow[] {
  const rows: ExomuxManagerRow[] = controller.sessions.peek().map((session) => {
    const attached = controller.runtime(session.id)?.attached.peek() ?? false;
    const status = session.running ? (attached ? "LIVE" : "HOLD") : session.status.toUpperCase();
    return {
      kind: "terminal",
      session,
      label: `[${status}] ${session.title} :: ${session.commandLine}`,
      running: session.running,
    };
  });
  const hostSessions = controller.hostSessions.peek();
  if (hostSessions.some((row) => !row.current)) {
    rows.push({
      kind: "heading",
      label: controller.canSwitchSessions ? "HOST SESSIONS · click to switch" : "HOST SESSIONS",
    });
    for (const row of hostSessions) {
      const up = row.upMs !== undefined ? `up ${formatExomuxUptime(row.upMs)}` : row.state;
      const terms = `${row.terminalCount} term${row.terminalCount === 1 ? "" : "s"}`;
      rows.push({
        kind: "host-session",
        name: row.name,
        label: `${row.current ? "· " : ""}${row.name} · ${up} · ${terms}`,
        attachable: row.state === "attachable",
        current: row.current,
      });
    }
  }
  return rows;
}

/**
 * Binds a browser/mobile host's normalized pointer stream. Browser callers
 * must not also bind its compatibility `mousePress` stream.
 */
export function bindExomuxPointerInput(
  mount: ExomuxAppMount,
  source: ExomuxPointerInputSource,
): () => void {
  const stopPointer = source.on("pointerInput", async (event) => {
    await mount.handlePointer(event);
  });
  const stopScroll = source.on("mouseScroll", async (event) => {
    await mount.handleScroll(event);
  });
  return () => {
    stopScroll();
    stopPointer();
  };
}

/** Creates an initialized Exomux app definition around a detached-host controller. */
export async function createExomuxAppDefinition(
  options: CreateExomuxAppDefinitionOptions,
): Promise<ExomuxAppDefinition> {
  const controller = options.controller ??
    (options.controllerOptions ? await createExomuxController(options.controllerOptions) : undefined);
  if (!controller) throw new TypeError("Exomux requires a controller or controllerOptions.");
  await controller.ready;
  const mount: ExomuxAppMountRef = {};
  return {
    controller,
    mount,
    terminalOptions: createExomuxTerminalOptions(controller, mount),
  };
}

/** Creates and mounts the real terminal app without starting its input reader. */
export async function createExomuxTerminalApp(
  options: CreateExomuxAppDefinitionOptions,
): Promise<ExomuxTerminalAppRuntime> {
  const definition = await createExomuxAppDefinition(options);
  const app = createTerminalApp(definition.terminalOptions);
  const mount = definition.mount.current;
  if (!mount) {
    app.destroy();
    await definition.controller.dispose();
    throw new Error("Exomux desktop did not mount.");
  }
  return {
    app,
    controller: definition.controller,
    mount,
    start: () => app.start(),
    destroy: async () => {
      app.destroy();
      await definition.controller.dispose();
    },
  };
}

/** Builds the declarative TerminalApp contract around one controller. */
export function createExomuxTerminalOptions(
  controller: ExomuxController,
  mount: ExomuxAppMountRef = {},
): TerminalAppOptions<ExomuxAppAction> {
  return {
    id: "exomux",
    label: "Exomux",
    exitOnSignal: false,
    // Full raw mode: Ctrl+C and friends arrive as keypresses and route to the
    // focused child terminal instead of the kernel killing the multiplexer.
    // External signals (kill, closing the outer terminal) still shut down.
    input: { captureKeyboardSignals: true },
    tuiOptions: { refreshRate: 1000 / 60 },
    commands: exomuxCommands(),
    onAction: (action) => handleExomuxAction(action, mount),
    setup(app) {
      const mounted = mountExomuxDesktop(app, controller);
      mount.current = mounted;
      return () => {
        if (mount.current === mounted) mount.current = undefined;
        mounted.dispose();
        void controller.dispose();
      };
    },
  };
}

/** Mounts the retained terminal desktop, window routing, and serialized input queue. */
export function mountExomuxDesktop(
  app: TerminalApp<ExomuxAppAction>,
  controller: ExomuxController,
): ExomuxAppMount {
  const owned: Array<{ dispose(): void }> = [];
  const unsubscribers: Array<() => void> = [];
  const subscriptions = new AbortController();
  const own = <T extends { dispose(): void }>(value: T): T => {
    owned.push(value);
    return value;
  };
  const selectedSessionIndex = own(new Signal(0));
  const metaballRevision = own(new Signal(0));
  const metaballs = new ExomuxMetaballField();
  const backgroundFields = new Map<ExomuxBackgroundId, ExomuxAnimatedBackground>();
  const releaseIdleBackgroundFields = (keep?: ExomuxBackgroundId): void =>
    releaseExomuxIdleBackgrounds(backgroundFields, keep);
  // Fields are rebuilt when their settings change: every knob in the modal is
  // a constructor option, and a rebuild is the one path that applies all of
  // them uniformly.
  let appliedBackgroundSettingsRevision = controller.backgroundSettingsRevision.peek();
  const activeBackgroundField = (): ExomuxAnimatedBackground | undefined => {
    const id = controller.backgroundId.peek();
    const revision = controller.backgroundSettingsRevision.peek();
    if (revision !== appliedBackgroundSettingsRevision) {
      appliedBackgroundSettingsRevision = revision;
      const stale = backgroundFields.get(id);
      if (stale) {
        (stale as { dispose?: () => void }).dispose?.();
        backgroundFields.delete(id);
      }
    }
    if (id === "metaballs") {
      releaseIdleBackgroundFields();
      return undefined;
    }
    let field = backgroundFields.get(id);
    if (!field) {
      const values = exomuxBackgroundSettingsFor(controller.backgroundSettings.peek(), id);
      const density = Number(values.density ?? 1);
      field = id === "matrix"
        ? new ExomuxMatrixRainField({ density })
        : id === "rainy windows"
        ? new ExomuxRainyWindowsField({ density })
        : id === "circuit"
        ? new ExomuxCircuitField({ density })
        : id === "biomech"
        ? new ExomuxBiomechField({ density })
        : id === "vaporwave"
        ? new ExomuxVaporwaveField()
        : id === "skull"
        ? new ExomuxSkullField()
        : id === "ivy"
        ? new ExomuxIvyField({ density })
        : id === "fire"
        ? new ExomuxFireField({ intensity: Number(values.intensity ?? 1) })
        : id === "turbulence"
        ? new ExomuxTurbulenceField()
        : id === "butterchurn"
        ? new ExomuxButterchurnField({
          cycleSeconds: Number(values.cycleSeconds ?? 15),
          updateHz: Number(values.updateHz ?? 60),
          audioMode: values.audioMode === "system" ? "system" : values.audioMode === "synth" ? "synth" : "mic",
          debug: values.debug === true,
          // Cycle only presets that actually draw on the GPU; the third of the
          // catalog that resolves to black there would otherwise dead-skip once a
          // second (a strobe).
          catalog: EXOMUX_BUTTERCHURN_GPU_PRESETS,
          // The GPU background says so when there is no device, rather than
          // limping along on the CPU renderer the "butterchurn cpu" field owns.
          errorWithoutGpu: true,
          favorites: controller.butterchurnFavorites.peek(),
          favoritesOnly: values.favoritesOnly === true,
        })
        : id === "butterchurn cpu"
        ? new ExomuxButterchurnField({
          cycleSeconds: Number(values.cycleSeconds ?? 15),
          updateHz: Number(values.updateHz ?? 60),
          audioMode: values.audioMode === "system" ? "system" : values.audioMode === "synth" ? "synth" : "mic",
          debug: values.debug === true,
          gpu: false,
          catalog: EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS,
          favorites: controller.butterchurnFavorites.peek(),
          favoritesOnly: values.favoritesOnly === true,
        })
        : id === "image"
        ? new ExomuxImageField(typeof values.path === "string" ? { path: values.path } : {})
        : new ExomuxJungleField({ density });
      backgroundFields.set(id, field);
    }
    releaseIdleBackgroundFields(id);
    return field;
  };
  /** Applies one list-row pick: a preset, a directory to enter, or an image. */
  const activateBackgroundConfigRow = (row?: { directory?: boolean; path?: string; presetIndex?: number }): void => {
    if (!row) return;
    if (row.presetIndex !== undefined) {
      const field = activeBackgroundField();
      if (exomuxBackgroundHasPresets(field)) {
        field.selectPreset(row.presetIndex);
        controller.status.value = `Preset ${row.presetIndex + 1}/${field.presetCount}: ${field.presetName}`;
        metaballRevision.value += 1;
      }
      return;
    }
    if (row.directory && row.path) {
      controller.backgroundBrowsePath.value = row.path;
      controller.backgroundConfigListIndex.value = 0;
      return;
    }
    if (row.path) controller.setBackgroundImagePath(row.path);
  };
  /** The butterchurn preset showing now, or undefined when the background isn't one. */
  const currentButterchurnPreset = (): string | undefined => {
    const id = controller.backgroundId.peek();
    if (id !== "butterchurn" && id !== "butterchurn cpu") return undefined;
    const field = activeBackgroundField();
    return exomuxBackgroundHasPresets(field) ? field.presetName : undefined;
  };
  // The last known mouse cell, for the optional block cursor. It updates on any
  // pointer event, including free motion once any-motion tracking is enabled.
  const mousePointer = own(new Signal<{ readonly column: number; readonly row: number } | undefined>(undefined));
  const backgroundSetPointer = (point: { column: number; row: number }): void => {
    metaballs.setPointer(point);
    activeBackgroundField()?.setPointer(point);
    const previous = mousePointer.peek();
    if (!previous || previous.column !== point.column || previous.row !== point.row) mousePointer.value = point;
  };
  const backgroundClearPointer = (): void => {
    metaballs.clearPointer();
    activeBackgroundField()?.clearPointer();
    if (mousePointer.peek() !== undefined) mousePointer.value = undefined;
  };
  // With the pincushion CRT shader on under Ghostty, the terminal grid is
  // visually warped but Ghostty still reports the mouse in raw grid cells. Warp
  // the reported cell through the exact shader map (exomuxPincushionSource) so
  // the block cursor — and clicks/drags/scrolls — land under the OS pointer
  // instead of drifting outward in the distorted regions.
  const runningInGhostty = isRunningInGhostty();
  const pincushionActive = (): boolean => runningInGhostty && controller.shaderConfig.peek().effects.pincushion.enabled;
  const warpPointerCell = (x: number, y: number): { readonly x: number; readonly y: number } => {
    if (!pincushionActive()) return { x, y };
    const rect = app.tui.rectangle.peek();
    return exomuxPointerWarpCell(
      x,
      y,
      Math.max(1, rect.width),
      Math.max(1, rect.height),
      exomuxPincushionMagnitude(controller.shaderConfig.peek()),
    );
  };
  const warpPointerEvent = <T extends { readonly x: number; readonly y: number }>(event: T): T => {
    const warped = warpPointerCell(event.x, event.y);
    return warped.x === event.x && warped.y === event.y ? event : { ...event, x: warped.x, y: warped.y };
  };
  // The block cursor blinks at 2 Hz while it is on.
  const cursorBlinkOn = own(new Signal(true));
  let cursorBlinkTimer: ReturnType<typeof setInterval> | undefined;
  const stopCursorBlink = (): void => {
    if (cursorBlinkTimer === undefined) return;
    clearInterval(cursorBlinkTimer);
    cursorBlinkTimer = undefined;
  };
  // The block cursor needs free-motion mouse events (mode 1003). The library
  // only ever enables button-event tracking (mode 1002) and (re)asserts it
  // from `Tui.run()` — which fires *after* this desktop mounts — so the exotui
  // any-motion helper keeps 1003 re-asserted on a keepalive while the cursor
  // is on and restores the terminal on teardown (WS-009).
  const anyMotion = createAnyMotionTracking({ keepaliveMs: EXOMUX_ANY_MOTION_KEEPALIVE_MS });
  let appliedBlockCursor = false;
  const applyBlockCursorMode = (): void => {
    const enabled = controller.globalSettings.peek().blockCursor;
    if (enabled === appliedBlockCursor) return;
    appliedBlockCursor = enabled;
    anyMotion.setEnabled(enabled);
    if (enabled) {
      stopCursorBlink();
      cursorBlinkOn.value = true;
      cursorBlinkTimer = setInterval(() => {
        cursorBlinkOn.value = !cursorBlinkOn.peek();
      }, EXOMUX_CURSOR_BLINK_MS);
    } else {
      stopCursorBlink();
      cursorBlinkOn.value = true;
      backgroundClearPointer();
    }
  };
  applyBlockCursorMode();
  controller.globalSettings.subscribe(applyBlockCursorMode);
  unsubscribers.push(() => controller.globalSettings.unsubscribe(applyBlockCursorMode));
  // Copy actions (TSM-010) emit OSC 52 through the terminal's own stdout: the
  // desktop cannot reach the OS clipboard, but the hosting terminal can. A
  // terminal without OSC 52 support simply ignores the sequence.
  let lastClipboardNonce = 0;
  controller.clipboardCopy.subscribe((payload) => {
    if (!payload || payload.nonce === lastClipboardNonce) return;
    lastClipboardNonce = payload.nonce;
    try {
      const stdout = app.tui.canvas.stdout as { writeSync?: (bytes: Uint8Array) => number } | undefined;
      stdout?.writeSync?.(new TextEncoder().encode(terminalClipboardSequence(payload.text)));
    } catch {
      // A closed or non-writable stdout must never take the desktop down.
    }
  }, subscriptions.signal);
  // Global debug logging (UX-008): while on, console output, exomuxDebugLog
  // calls, uncaught errors, and unhandled rejections all land in one file the
  // status line names — the evidence channel for anything the TUI would hide.
  let globalDebugLogger: ExomuxDebugLogger | undefined;
  // Terminal write-path telemetry (UX-011): while debug logging is on, drain
  // the sink's counters every few seconds and log one line per window that
  // emitted anything. Stall time and degraded flushes here are frames blocked
  // on a saturated terminal — work no CPU graph shows.
  let flushTelemetryTimer: ReturnType<typeof setInterval> | undefined;
  const stopFlushTelemetry = (): void => {
    if (flushTelemetryTimer === undefined) return;
    clearInterval(flushTelemetryTimer);
    flushTelemetryTimer = undefined;
  };
  const startFlushTelemetry = (): void => {
    const sink = app.tui.canvas.sink;
    // Headless/memory sinks have no terminal write path to measure.
    if (!sink.takeFlushTelemetry || flushTelemetryTimer !== undefined) return;
    exomuxDebugLog("flush", `since launch: ${formatExomuxFlushTelemetry(sink.takeFlushTelemetry())}`);
    flushTelemetryTimer = setInterval(() => {
      const drained = sink.takeFlushTelemetry?.();
      if (drained && (drained.frames > 0 || drained.bytes > 0)) {
        exomuxDebugLog("flush", formatExomuxFlushTelemetry(drained));
      }
    }, EXOMUX_FLUSH_TELEMETRY_MS);
  };
  const applyDebugLogging = (): void => {
    const enabled = controller.globalSettings.peek().debugLogging;
    if (enabled && !globalDebugLogger) {
      globalDebugLogger = createExomuxDebugLogger({ prefix: "exomux", captureGlobalErrors: true });
      exomuxDebugLog("debug", "global debug logging on");
      startFlushTelemetry();
      controller.status.value = `Debug log: ${globalDebugLogger.describe?.() ?? "open"}`;
    } else if (!enabled && globalDebugLogger) {
      stopFlushTelemetry();
      globalDebugLogger.dispose();
      globalDebugLogger = undefined;
      controller.status.value = "Debug logging off";
    }
  };
  applyDebugLogging();
  controller.globalSettings.subscribe(applyDebugLogging);
  unsubscribers.push(() => controller.globalSettings.unsubscribe(applyDebugLogging));
  own({
    dispose: () => {
      stopFlushTelemetry();
      globalDebugLogger?.dispose();
      globalDebugLogger = undefined;
    },
  });
  own({
    dispose: () => {
      stopCursorBlink();
      anyMotion.dispose();
    },
  });
  // Preset stepping is requested on the controller, which does not own the
  // fields, so the delta is applied here to whichever background is on screen.
  let appliedPresetStep = controller.backgroundPresetStep.peek();
  controller.backgroundPresetStep.subscribe((step) => {
    const delta = step - appliedPresetStep;
    appliedPresetStep = step;
    if (delta === 0) return;
    const field = activeBackgroundField();
    if (!exomuxBackgroundHasPresets(field)) {
      controller.status.value = "This background has no presets.";
      return;
    }
    // A shuffling field steps through what it has shown; one without an order
    // of its own falls back to walking the catalog.
    if (field.stepPreset) field.stepPreset(delta);
    else field.selectPreset(field.presetIndex + delta);
    controller.status.value = `Preset ${field.presetIndex + 1}/${field.presetCount} · ${
      describeBackgroundSource(field)
    }: ${field.presetName}`;
    metaballRevision.value += 1;
  }, subscriptions.signal);

  // A fallback to the software renderer is the one thing about this that a
  // user needs told: it happens silently, and its symptom — most presets
  // rendering nothing — is indistinguishable from the background being broken.
  let reportedRenderer: string | undefined;
  const reportBackgroundRenderer = (field: ExomuxAnimatedBackground | undefined): void => {
    const renderer = (field as ExomuxReportingBackground | undefined)?.renderer;
    if (renderer === undefined || renderer === "starting") return;
    if (renderer === reportedRenderer) return;
    const first = reportedRenderer === undefined;
    reportedRenderer = renderer;
    if (renderer === "gpu") {
      if (!first) controller.status.value = "Butterchurn: preset shaders running on the GPU.";
      return;
    }
    controller.status.value = first
      ? "Butterchurn: software renderer — no GPU, so fewer presets render."
      : "Butterchurn: fell back to the software renderer — fewer presets render.";
  };

  let lastInputActivityAt = performance.now();
  // When the background sim last actually advanced, so a sustained-input stall
  // can be capped instead of freezing the field until the user stops.
  let lastBackgroundAdvanceAt = performance.now();
  const bodyRect = own(
    new Computed<Rectangle>(() => ({
      column: 0,
      row: Math.min(HEADER_ROWS, Math.max(0, app.tui.rectangle.value.height - 1)),
      width: Math.max(1, app.tui.rectangle.value.width),
      height: Math.max(1, app.tui.rectangle.value.height - HEADER_ROWS - FOOTER_ROWS),
    })),
  );
  // The window taskbar shares the top bar: it starts just past the start button
  // and stops short of the quick quit control on the right.
  const shelfBounds = own(
    new Computed<Rectangle>(() => {
      const width = app.tui.rectangle.value.width;
      const column = START_BUTTON.width + 1;
      const available = Math.max(0, width - column - MENU_QUIT_WIDTH - 1);
      return { column, row: 0, width: Math.max(1, available), height: 1 };
    }),
  );
  // Live titlebar status tags, projected first-class by the window host
  // (WS-008) instead of being baked into the painted title by hand.
  const windowTitleAdornments = (windowId: string): readonly string[] => {
    const sessionId = exomuxSessionIdFromWindow(windowId);
    if (!sessionId) return [];
    const runtime = controller.runtime(sessionId);
    // Read through .value so the cached projection Computed recomputes when a
    // window enters copy mode or its settings change — the callback runs
    // inside that Computed's evaluation.
    runtime?.renderRevision.value;
    controller.windowSettings.value;
    const adornments: string[] = [];
    if (runtime?.scrollback.mode === "copy") adornments.push("[SCROLL]");
    if (!controller.windowSettingsFor(sessionId).mouseReporting) adornments.push("[NO MOUSE]");
    return adornments;
  };
  const projectionOptions = (): WorkbenchWindowHostProjectionOptions => ({
    separatorHitSize: 3,
    shelfBounds: shelfBounds.peek(),
    doubleClickMaximizeMs: EXOMUX_DOUBLE_CLICK_MS,
    titleAdornments: windowTitleAdornments,
  });
  const windowProjection = own(
    new Computed(() =>
      controller.windowHost.project(bodyRect.value, {
        separatorHitSize: 3,
        shelfBounds: shelfBounds.value,
        titleAdornments: windowTitleAdornments,
      })
    ),
  );

  let disposed = false;
  // Consecutive raw bytes share a bounded, protocol-sized pipeline. Every
  // control/window operation is a barrier: it waits for preceding input ACKs,
  // then blocks later input until the operation is complete.
  const reportInputError = (error: unknown): void => {
    if (!disposed) controller.status.value = `Exomux input failed: ${safeErrorMessage(error)}`;
  };
  const operationQueue = new ExomuxOperationQueue({
    write: (sessionId, data) => controller.writeSession(sessionId, data),
    reportError: reportInputError,
  });
  let ingressRevision = 0;
  const enqueue = (operation: () => void | Promise<unknown>): Promise<void> => {
    ingressRevision += 1;
    return disposed ? operationQueue.whenIdle() : operationQueue.enqueueBarrier(operation);
  };
  const enqueueRaw = (
    data: string | Uint8Array,
    sessionId = controller.activeRuntime()?.sessionId,
  ): Promise<void> => {
    ingressRevision += 1;
    lastInputActivityAt = performance.now();
    return disposed || !sessionId ? operationQueue.whenIdle() : operationQueue.enqueueInput(sessionId, data);
  };
  const enqueueGuardedRaw = (
    data: string | Uint8Array,
    shouldWrite: () => boolean | Promise<boolean>,
    sessionId = controller.activeRuntime()?.sessionId,
  ): Promise<void> => {
    ingressRevision += 1;
    lastInputActivityAt = performance.now();
    return disposed || !sessionId
      ? operationQueue.whenIdle()
      : operationQueue.enqueueGuardedInput(sessionId, data, shouldWrite);
  };
  const syncWindows = async (): Promise<void> => {
    await controller.syncWindowVisibility(bodyRect.peek());
    const projection = controller.windowHost.project(bodyRect.peek(), projectionOptions());
    controller.syncTerminalGeometry(projection);
  };
  const runWindowCommand = async (
    command: WorkbenchWindowHostCommand,
    alreadyExecuted: boolean,
    fallbackWindowId?: string,
  ): Promise<void> => {
    const closeWindowId = command.kind === "close"
      ? command.id ?? fallbackWindowId ?? controller.windowHost.controller.inspect().activeWindowId
      : undefined;
    if (closeWindowId === EXOMUX_SETTINGS_WINDOW_ID) {
      // Closing the settings window tucks it away; there is nothing to kill.
      controller.closeGlobalConfig(bodyRect.peek());
      await syncWindows();
      return;
    }
    const closeSessionId = exomuxSessionIdFromWindow(closeWindowId);
    if (closeSessionId && controller.runtime(closeSessionId)) {
      const killed = await controller.killSession(closeSessionId);
      if (!killed && alreadyExecuted && controller.runtime(closeSessionId)) {
        // Pointer/key chrome has already committed the generic close. Restore
        // the view when the daemon rejects termination so a live PTY never
        // becomes a hidden or frozen orphan.
        controller.windowHost.execute({ kind: "restore", id: closeWindowId }, bodyRect.peek());
        controller.windowHost.execute({ kind: "focus", id: closeWindowId }, bodyRect.peek());
      }
    } else if (!alreadyExecuted) {
      controller.windowHost.execute(command, bodyRect.peek(), projectionOptions());
    }
    await syncWindows();
  };

  // Computed captures its dependency set when it is constructed. A desktop
  // mounted with zero sessions therefore cannot discover render signals for a
  // terminal spawned later. Bridge the changing runtime set through one stable
  // signal so every attached/spawned terminal can invalidate the retained
  // desktop immediately.
  const terminalRenderRevision = own(new Signal(0));
  // Real exotui buttons for the settings window render off-screen and are
  // composited into the desktop. Their draws are async, so a completed render
  // bumps this revision to schedule the repaint that blits the fresh cells.
  const settingsWidgetRevision = own(new Signal(0));
  const settingsWidgets = own(
    new ExomuxSettingsWidgets(() => {
      settingsWidgetRevision.value += 1;
    }),
  );
  // The theme and background selectors are real exotui List widgets, bound
  // two-way to the controller's selection and composited into the window.
  const settingsPickers = own(
    new ExomuxSettingsSurface(() => {
      settingsWidgetRevision.value += 1;
    }),
  );
  settingsPickers.bind({
    themeIndex: () => Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === controller.themeId.peek())),
    setThemeIndex: (index) => {
      const entry = EXOMUX_THEMES[index];
      if (entry) controller.setTheme(entry.id);
    },
    onThemeIndexChanged: (listener) => {
      controller.themeId.subscribe(listener);
      return () => controller.themeId.unsubscribe(listener);
    },
    backgroundIndex: () => Math.max(0, EXOMUX_BACKGROUND_IDS.indexOf(controller.backgroundId.peek())),
    setBackgroundIndex: (index) => {
      const id = EXOMUX_BACKGROUND_IDS[index];
      if (id) controller.setBackground(id);
    },
    onBackgroundIndexChanged: (listener) => {
      controller.backgroundId.subscribe(listener);
      return () => controller.backgroundId.unsubscribe(listener);
    },
  });
  // The option rows render their live values with real Cycler/CheckBox widgets.
  const settingsOptions = own(
    new ExomuxSettingsOptions(() => {
      settingsWidgetRevision.value += 1;
    }),
  );
  // The session-name field is a real exotui Input while a rename is edited; it
  // pushes the draft to the controller and Enter routes through to commit.
  // Directly the reusable ExomuxInputField (WS-010): the session-name alphabet
  // is a validator, and the controller re-applies the same filter on commit.
  const sessionNameField = own(
    new ExomuxInputField({
      requestRepaint: () => {
        settingsWidgetRevision.value += 1;
      },
      onChange: (text) => controller.setSessionRenameDraft(text),
      onSubmit: () => {
        void controller.commitSessionRename().then(() => syncWindows());
      },
      validator: /[A-Za-z0-9._-]/,
    }),
  );
  // The SCP modal's password prompt is a real, composited Input (masked) — the
  // first interactive field migrated off hand-drawn paint onto the reusable
  // ExomuxInputField. It owns typing/cursor/backspace; its value is pushed to
  // the controller. Enter/Escape stay with the modal's key handler.
  const scpPasswordField = own(
    new ExomuxInputField({
      requestRepaint: () => {
        settingsWidgetRevision.value += 1;
      },
      onChange: (value) => controller.setScpPassword(value),
      password: true,
    }),
  );
  // The background-config modal reuses the same real controls: a List for its
  // preset/image pane, Cyclers/CheckBoxes for its options, a Button to close.
  const bumpSettingsWidgets = () => {
    settingsWidgetRevision.value += 1;
  };
  const backgroundList = own(new ExomuxBackgroundList(bumpSettingsWidgets));
  const backgroundOptionControls = own(new ExomuxSettingsOptions(bumpSettingsWidgets));
  const backgroundButtons = own(new ExomuxSettingsWidgets(bumpSettingsWidgets));
  // The per-window config modal renders its value rows through the same real
  // Cycler/CheckBox host. A dedicated instance keeps its snapshot signature
  // stable when the settings window or background modal is open in the same
  // frame — one shared host would thrash re-renders between spec sets.
  const windowConfigOptionControls = own(new ExomuxSettingsOptions(bumpSettingsWidgets));
  // The shader manager modal (UX-009) renders its rows through its own control
  // host (snapshot signatures stay stable against the settings window's), and
  // its add-a-shader path prompt is a real composited Input.
  const shaderManagerControls = own(new ExomuxSettingsOptions(bumpSettingsWidgets));
  const shaderPathField = own(
    new ExomuxInputField({
      requestRepaint: bumpSettingsWidgets,
      onChange: (text) => controller.setShaderPathDraft(text),
      onSubmit: () => {
        controller.commitShaderPathDraft();
      },
    }),
  );
  // The sessions panel's rows as a real composited List (WS-003). The wheel
  // scrolls this viewport top without touching the selection; -1 re-follows it.
  const sessionList = own(new ExomuxSessionList(bumpSettingsWidgets));
  const sessionListScrollTop = own(new Signal(-1));
  // Host-session listing (UX-006): probe once at mount and re-probe (gently
  // throttled) whenever the sessions panel takes focus.
  let lastHostSessionsProbe = 0;
  const maybeRefreshHostSessions = (): void => {
    if (controller.windowHost.controller.inspect().activeWindowId !== EXOMUX_SESSIONS_WINDOW_ID) return;
    const now = Date.now();
    if (now - lastHostSessionsProbe < 5_000) return;
    lastHostSessionsProbe = now;
    void controller.refreshHostSessions();
  };
  controller.windowHost.viewRevision.subscribe(maybeRefreshHostSessions, subscriptions.signal);
  void controller.refreshHostSessions();
  // The network panel's hierarchy as a real composited Tree (WS-004). A tree
  // rebuild (tailnet status, saved hosts) repaints the desktop, which was
  // otherwise only repainted by interaction-driven signals.
  const networkTreeView = own(new ExomuxNetworkTree(bumpSettingsWidgets));
  controller.networkTree.nodes.subscribe(() => {
    settingsWidgetRevision.value += 1;
  }, subscriptions.signal);
  // The kill and quit confirmations ride the library ModalController (WS-005):
  // arrow/tab selection, Enter/Space activation, Escape close. Exomux's own
  // signals stay the source of truth for whether each dialog is open; these
  // model the in-dialog interaction, and the painters read their selection.
  const killModal = own(
    new ModalController({
      title: "Terminate host session?",
      tone: "error",
      actions: [
        { id: "cancel", label: "Cancel" },
        { id: "kill", label: "Kill", destructive: true, default: true },
      ],
    }),
  );
  const quitModal = own(
    new ModalController({
      title: "End Exomux session?",
      tone: "warning",
      actions: [
        { id: "cancel", label: "Cancel" },
        { id: "detach", label: "Detach", default: true },
        { id: "terminate", label: "Terminate", destructive: true },
      ],
    }),
  );
  // The start-menu dropdown as a real composited ContextMenu (WS-007), with
  // keyboard selection the hand-drawn menu never had.
  const startMenuView = own(new ExomuxStartMenu(bumpSettingsWidgets));
  const startMenuSelection = own(new Signal(0));
  controller.startMenuVisible.subscribe(() => {
    if (controller.startMenuVisible.peek()) startMenuSelection.value = 0;
  }, subscriptions.signal);
  const openModalAtDefault = (modal: ModalController) => {
    modal.open();
    const actions = modal.actions.peek();
    const preferred = actions.findIndex((action) => action.default && !action.disabled);
    if (preferred >= 0) modal.setSelectedActionIndex(preferred);
  };
  controller.pendingKillSessionId.subscribe(() => {
    if (controller.pendingKillSessionId.peek()) openModalAtDefault(killModal);
    else killModal.close();
  }, subscriptions.signal);
  controller.quitModalVisible.subscribe(() => {
    if (controller.quitModalVisible.peek()) openModalAtDefault(quitModal);
    else quitModal.close();
  }, subscriptions.signal);
  const sessionListViewportHeight = (): number => {
    const manager = windowProjection.peek().windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID);
    return Math.max(1, (manager?.clientRect.height ?? 1) - SESSION_LIST_START);
  };
  // Arrowing (or attaching) pulls a wheel-scrolled viewport just far enough to
  // show the selection again; a changed session list re-follows it outright.
  selectedSessionIndex.subscribe(() => {
    const top = sessionListScrollTop.peek();
    if (top < 0) return;
    const height = sessionListViewportHeight();
    const length = controller.sessions.peek().length;
    const selected = clampIndex(selectedSessionIndex.peek(), length);
    const start = listWindowFromTop(length, top, height).start;
    if (selected < start) sessionListScrollTop.value = selected;
    else if (selected >= start + height) sessionListScrollTop.value = selected - height + 1;
  }, subscriptions.signal);
  controller.sessions.subscribe(() => {
    sessionListScrollTop.value = -1;
  }, subscriptions.signal);
  const terminalRenderSubscriptions = new Map<
    string,
    { signal: Signal<number>; listener: () => void }
  >();
  const syncTerminalRenderSubscriptions = (
    sessions = controller.sessions.peek(),
  ): void => {
    const liveIds = new Set(sessions.map((session) => session.id));
    for (const [sessionId, subscription] of terminalRenderSubscriptions) {
      const runtime = controller.runtime(sessionId);
      if (liveIds.has(sessionId) && runtime?.renderRevision === subscription.signal) continue;
      subscription.signal.unsubscribe(subscription.listener);
      terminalRenderSubscriptions.delete(sessionId);
    }
    for (const session of sessions) {
      if (terminalRenderSubscriptions.has(session.id)) continue;
      const signal = controller.runtime(session.id)?.renderRevision;
      if (!signal) continue;
      const listener = () => {
        terminalRenderRevision.value += 1;
      };
      signal.subscribe(listener, subscriptions.signal);
      terminalRenderSubscriptions.set(session.id, { signal, listener });
    }
  };
  syncTerminalRenderSubscriptions();
  controller.sessions.subscribe(syncTerminalRenderSubscriptions, subscriptions.signal);
  unsubscribers.push(() => {
    for (const subscription of terminalRenderSubscriptions.values()) {
      subscription.signal.unsubscribe(subscription.listener);
    }
    terminalRenderSubscriptions.clear();
  });

  const overgrowthTracker = new ExomuxOvergrowthTracker();
  let overgrowthRatios: ReadonlyMap<string, number> = new Map();

  /** True when the active background reclaims idle windows and the user wants it. */
  const overgrowthEnabled = (): boolean =>
    controller.globalSettings.peek().overgrowInactive &&
    exomuxBackgroundOvergrows(controller.backgroundId.peek());

  /**
   * True when any window shows the desktop through it.
   *
   * The background stops advancing once windows cover the desktop, which is a
   * real saving — but a transparent window is exactly the case where the
   * background is still on screen while nothing of it is left uncovered, and
   * freezing it there would leave a still image behind every terminal.
   */
  const transparencyEnabled = (): boolean => {
    const global = controller.globalSettings.peek();
    if (global.opacity < 1) return true;
    for (const window of windowProjection.peek().windows) {
      const sessionId = exomuxSessionIdFromWindow(window.id);
      if (sessionId && exomuxResolvedOpacity(global, controller.windowSettingsFor(sessionId)) < 1) return true;
    }
    return false;
  };

  /** Recomputes per-window reclaim ratios; returns true when any of them moved. */
  const syncOvergrowth = (
    projection: WorkbenchWindowHostProjection,
    activeWindowId: string | undefined,
    now: number,
  ): boolean => {
    if (!overgrowthEnabled()) {
      if (overgrowthRatios.size === 0) return false;
      overgrowthTracker.clear();
      overgrowthRatios = new Map();
      return true;
    }
    const fullMs = controller.globalSettings.peek().overgrowFullMs;
    overgrowthTracker.sync(projection.windows.map((window) => window.id), activeWindowId, now);
    const next = new Map<string, number>();
    let changed = overgrowthRatios.size !== 0 && projection.windows.length === 0;
    for (const window of projection.windows) {
      const ratio = exomuxOvergrowthRatio(overgrowthTracker.idleMs(window.id, now), fullMs);
      if (ratio > 0) next.set(window.id, ratio);
      // Quantize the comparison so only visible steps trigger a repaint.
      const before = Math.round((overgrowthRatios.get(window.id) ?? 0) * 64);
      if (before !== Math.round(ratio * 64)) changed = true;
    }
    overgrowthRatios = next;
    return changed;
  };

  const animateMetaballs = (): void => {
    if (disposed || !app.started) return;
    const projection = windowProjection.peek();
    const now = performance.now();
    // Overgrowth keeps advancing even when windows fully occlude the desktop —
    // that is precisely the case where the background is creeping over them.
    const backdropVisible = exomuxMetaballBackgroundVisible(projection, bodyRect.peek()) || transparencyEnabled();
    if (!backdropVisible && !overgrowthEnabled()) {
      // Nothing left to animate, but reclaim state from a previous background
      // must still be retired or those windows stay overgrown forever.
      if (syncOvergrowth(projection, undefined, now)) metaballRevision.value += 1;
      return;
    }
    if (
      !exomuxMetaballsMayAdvance(
        now,
        lastInputActivityAt,
        operationQueue.hasPendingBarrier(),
        now - lastBackgroundAdvanceAt,
      )
    ) return;
    lastBackgroundAdvanceAt = now;
    const activeWindowId = controller.windowHost.controller.inspect().activeWindowId;
    const activeRect = projection.windows.find((window) => window.id === activeWindowId)?.rect;
    // A window the background has begun reclaiming is no longer an obstacle to
    // it: circuits route their traces straight over idle windows so there is
    // something to see once the overgrowth exposes the board underneath.
    const reclaiming = overgrowthEnabled();
    const solidObstacles = projection.windows.map((window) => window.rect);
    // A transparent window must show the background flowing behind it, so it is
    // not a field obstacle: a fluid field like turbulence otherwise treats the
    // whole window rect as solid, leaving a flat void that reads as opaque
    // however low the opacity is set.
    const obstacles = projection.windows
      .filter((window) => reclaiming ? (overgrowthRatios.get(window.id) ?? 0) <= 0 : true)
      .filter((window) => exomuxWindowIsOpaque(controller, window.id))
      .map((window) => window.rect);
    const frame = {
      bounds: bodyRect.peek(),
      obstacles,
      // Routing and physics disagree about a reclaimed window: it is no longer
      // an obstacle to draw around, but it still occupies its rectangle.
      solidObstacles,
      ...(activeRect ? { activeObstacle: activeRect } : {}),
      now,
    };
    const active = activeBackgroundField();
    const advanced = active?.advance(frame) ?? metaballs.advance(frame);
    reportBackgroundRenderer(active);
    // Both sides must run every tick: `||` would short-circuit the overgrowth
    // sync away on the (near-universal) frames where the field also advanced.
    const overgrew = syncOvergrowth(projection, activeWindowId, now);
    if (advanced || overgrew) metaballRevision.value += 1;
  };
  // The desktop ticks at the metaball baseline unless the active background
  // asks for more: butterchurn's update rate is a real setting, and a 60 Hz
  // field driven by a 8 Hz timer would be the knob that does nothing.
  const backgroundTickMs = (): number => {
    const id = controller.backgroundId.peek();
    if (id !== "butterchurn" && id !== "butterchurn cpu") return EXOMUX_METABALL_FRAME_INTERVAL_MS;
    const values = exomuxBackgroundSettingsFor(controller.backgroundSettings.peek(), id);
    const hz = Number(values.updateHz ?? 60);
    return Number.isFinite(hz) && hz > 0 ? Math.max(4, Math.round(1000 / hz)) : EXOMUX_METABALL_FRAME_INTERVAL_MS;
  };
  let metaballTimer = setInterval(animateMetaballs, backgroundTickMs());
  let appliedTickMs = backgroundTickMs();
  const retimeBackground = (): void => {
    const next = backgroundTickMs();
    if (next === appliedTickMs) return;
    appliedTickMs = next;
    clearInterval(metaballTimer);
    metaballTimer = setInterval(animateMetaballs, next);
  };
  controller.backgroundSettingsRevision.subscribe(retimeBackground, subscriptions.signal);
  controller.backgroundId.subscribe(retimeBackground, subscriptions.signal);
  unsubscribers.push(() => clearInterval(metaballTimer));
  // Favoriting a preset updates the live butterchurn field in place rather than
  // rebuilding it (a rebuild would restart the preset on screen). The setting
  // that toggles "Favorites only" still rebuilds via the settings revision; this
  // only keeps the field's favorites list current between those rebuilds.
  const syncButterchurnFavorites = (): void => {
    const id = controller.backgroundId.peek();
    if (id !== "butterchurn" && id !== "butterchurn cpu") return;
    const field = backgroundFields.get(id);
    if (!(field instanceof ExomuxButterchurnField)) return;
    const values = exomuxBackgroundSettingsFor(controller.backgroundSettings.peek(), id);
    field.setFavorites(controller.butterchurnFavorites.peek(), values.favoritesOnly === true);
  };
  controller.butterchurnFavorites.subscribe(syncButterchurnFavorites, subscriptions.signal);
  // Client teardown releases the GPU deterministically: every field with a
  // device-side renderer or a recorder child is disposed, then the shared
  // device itself is destroyed. Relying on process exit is not enough — a
  // shutdown that hangs before `Deno.exit` leaves a live render loop holding
  // the machine's only WebGPU seat.
  unsubscribers.push(() => {
    releaseExomuxIdleBackgrounds(backgroundFields);
    for (const [id, field] of backgroundFields) {
      (field as { dispose?: () => void }).dispose?.();
      backgroundFields.delete(id);
    }
    destroyExomuxGpuDevice();
  });

  // 039: window transitions animate on detached snapshots of the previous
  // frame's cells; app state proceeds immediately while the ghost plays out.
  // Headless mounts (tests, pipes) stay frame-deterministic: ghosts only play
  // on a real terminal.
  const surfaceAnimationsEnabled = (() => {
    try {
      return Deno.stdout.isTerminal();
    } catch {
      return false;
    }
  })();
  const surfaceAnimator = createSurfaceTransitionAnimator({ seed: 39 });
  const animationRevision = new Signal(0);
  const animationStyles = new Map<string, string[][]>();
  let lastDesktopRows: string[][] = [];
  if (surfaceAnimationsEnabled) {
    const animationTicker = setInterval(() => {
      if (surfaceAnimator.animating()) animationRevision.value = animationRevision.peek() + 1;
    }, 33);
    unsubscribers.push(() => clearInterval(animationTicker));
  }

  // Restore-from-minimized flies the window back out of its taskbar button:
  // the window paints once into a scratch frame for its snapshot while the
  // real paint is suppressed, then the ghost expands from the button.
  const pendingFlyInIds = new Set<string>();
  const suppressedWindowIds = new Set<string>();

  const applyAnimationSettings = (): ReturnType<typeof controller.globalSettings.peek> => {
    const global = controller.globalSettings.peek();
    surfaceAnimator.setSettings({
      speed: global.animationSpeed,
      kinds: {
        close: global.animationClose,
        minimize: global.animationMinimize,
        maximize: global.animationMaximize,
        restore: global.animationRestore,
      },
    });
    return global;
  };

  /** Center of the surface a window animates to/from in the top bar: its
   * taskbar button for terminals, the start button for panels. */
  const flyAnchorFor = (windowId: string): { column: number; row: number } => {
    const bar = projectExomuxTerminalBar(controller, windowProjection.peek(), shelfBounds.peek());
    for (const command of bar.commands) {
      const action = command.item.action;
      if (
        action.kind === "session" && exomuxWindowId(action.sessionId) === windowId
      ) {
        return {
          column: command.rect.column + Math.floor(command.rect.width / 2),
          row: command.rect.row,
        };
      }
    }
    return { column: START_BUTTON.column + Math.floor(START_BUTTON.width / 2), row: 0 };
  };

  const beginWindowTransition = (command: WorkbenchWindowHostCommand): void => {
    if (!surfaceAnimationsEnabled) return;
    // The settings pane is the source of truth per event: kind per
    // transition plus a global speed ("off" disables).
    const global = applyAnimationSettings();
    let transition: SurfaceTransition;
    switch (command.kind) {
      case "close":
        transition = "close";
        break;
      case "minimize":
        transition = "minimize";
        break;
      case "maximize":
      case "toggle-maximize":
        transition = "maximize";
        break;
      case "restore":
        transition = "restore";
        break;
      default:
        return;
    }
    const projection = windowProjection.peek();
    const id = "id" in command && command.id !== undefined
      ? command.id
      : projection.windows.find((window) => window.active)?.id;
    if (!id) return;
    const window = projection.windows.find((entry) => entry.id === id);
    if (!window?.rect || window.rect.width <= 0 || window.rect.height <= 0) {
      // A minimized window has no on-screen cells to play out. Restoring
      // one flies it back OUT of its taskbar button instead: capture on
      // the next paint, suppress the real window while the ghost lands.
      if (
        transition === "restore" && global.animationSpeed !== "off" &&
        global.animationRestore !== undefined
      ) {
        pendingFlyInIds.add(id);
        animationRevision.value = animationRevision.peek() + 1;
      }
      return;
    }
    // Restoring a window that is still on screen (un-maximize) is a
    // geometry morph of its old bounds, not a trip to the taskbar.
    if (transition === "restore") transition = "maximize";
    const bounds = app.tui.rectangle.peek();
    const anchor = flyAnchorFor(id);
    const snapshot = snapshotExomuxDesktopRect(lastDesktopRows, window.rect);
    if (!snapshot) return;
    const started = surfaceAnimator.begin({
      surfaceId: id,
      transition,
      rect: { ...window.rect },
      snapshot: snapshot.plain,
      now: performance.now(),
      // Effects roam the whole screen: shrapnel past the edges, melt to
      // the bottom row, minimize streaming into its taskbar button.
      overflow: exomuxOverflowToScreen(window.rect, bounds),
      flyTarget: {
        column: anchor.column - window.rect.column,
        row: anchor.row - window.rect.row,
      },
    });
    if (started) animationStyles.set(id, snapshot.styled);
  };

  /** Called by the desktop painter with a scratch-painted restored window. */
  const captureFlyIn = (windowId: string, rows: string[][], rect: Rectangle): void => {
    pendingFlyInIds.delete(windowId);
    const global = applyAnimationSettings();
    if (global.animationSpeed === "off") return;
    const snapshot = snapshotExomuxDesktopRect(rows, rect);
    if (!snapshot) return;
    const bounds = app.tui.rectangle.peek();
    const anchor = flyAnchorFor(windowId);
    const started = surfaceAnimator.begin({
      surfaceId: windowId,
      transition: "restore",
      rect: { ...rect },
      snapshot: snapshot.plain,
      now: performance.now(),
      direction: "in",
      overflow: exomuxOverflowToScreen(rect, bounds),
      flyTarget: { column: anchor.column - rect.column, row: anchor.row - rect.row },
    });
    if (started) {
      animationStyles.set(windowId, snapshot.styled);
      suppressedWindowIds.add(windowId);
    }
  };

  {
    const hostExecute = controller.windowHost.execute.bind(controller.windowHost);
    controller.windowHost.execute = ((command, bounds) => {
      beginWindowTransition(command);
      return hostExecute(command, bounds);
    }) as typeof controller.windowHost.execute;
  }

  // Menus and modals animate from visibility flips: close plays the surface's
  // last-painted cells out; open plays the cells it is ABOUT to cover out as a
  // reveal (the ghosts composite above modal chrome, so the fresh surface
  // shows through as the old content crumbles).
  const beginTransientSurfaceTransition = (
    surfaceId: string,
    transition: "open" | "close",
    rect: Rectangle | undefined,
  ): void => {
    if (!surfaceAnimationsEnabled || !rect || rect.width <= 0 || rect.height <= 0) return;
    const global = controller.globalSettings.peek();
    surfaceAnimator.setSettings({
      speed: global.animationSpeed,
      kinds: { open: global.animationMenus, close: global.animationMenus },
    });
    const snapshot = snapshotExomuxDesktopRect(lastDesktopRows, rect);
    if (!snapshot) return;
    const started = surfaceAnimator.begin({
      surfaceId,
      transition,
      rect: { ...rect },
      snapshot: snapshot.plain,
      now: performance.now(),
      direction: "out",
      overflow: exomuxOverflowToScreen(rect, app.tui.rectangle.peek()),
    });
    if (started) animationStyles.set(surfaceId, snapshot.styled);
  };

  const watchTransientSurface = (
    surfaceId: string,
    visible: () => boolean,
    subscribe: (listener: () => void) => void,
    rectFor: () => Rectangle | undefined,
  ): void => {
    let last = visible();
    subscribe(() => {
      const next = visible();
      if (next === last) return;
      last = next;
      beginTransientSurfaceTransition(surfaceId, next ? "open" : "close", rectFor());
    });
  };

  if (surfaceAnimationsEnabled) {
    watchTransientSurface(
      "start-menu",
      () => controller.startMenuVisible.peek(),
      (listener) => controller.startMenuVisible.subscribe(listener, subscriptions.signal),
      () =>
        exomuxStartMenuLayout(
          app.tui.rectangle.peek(),
          controller.startMenuAnchor.peek(),
          exomuxStartMenuItems(controller),
        ).panelRect,
    );
    watchTransientSurface(
      "help-modal",
      () => controller.helpVisible.peek(),
      (listener) => controller.helpVisible.subscribe(listener, subscriptions.signal),
      () => exomuxHelpLayout(windowProjection.peek().bounds).rect,
    );
    watchTransientSurface(
      "quit-modal",
      () => controller.quitModalVisible.peek(),
      (listener) => controller.quitModalVisible.subscribe(listener, subscriptions.signal),
      () => exomuxQuitLayout(windowProjection.peek().bounds).rect,
    );
    watchTransientSurface(
      "kill-modal",
      () => controller.pendingKillSessionId.peek() !== undefined,
      (listener) => controller.pendingKillSessionId.subscribe(listener, subscriptions.signal),
      () => exomuxKillLayout(windowProjection.peek().bounds).rect,
    );
  }

  const collectAnimationOverlays = (): ExomuxAnimationOverlayPaint[] => {
    const overlays = surfaceAnimator.framesAt(performance.now());
    const paints: ExomuxAnimationOverlayPaint[] = [];
    for (const overlay of overlays) {
      const styled = animationStyles.get(overlay.surfaceId);
      if (overlay.frame.done) {
        animationStyles.delete(overlay.surfaceId);
        // A landed fly-in hands the cells back to the real window paint.
        suppressedWindowIds.delete(overlay.surfaceId);
      }
      if (!styled || overlay.frame.done) continue;
      paints.push({ overlay, styled });
    }
    return paints;
  };

  const renderRevision = own(
    new Computed(() => {
      const projection = windowProjection.value;
      const sessions = controller.sessions.value;
      const fragments: Array<string | number | boolean | undefined> = [
        animationRevision.value,
        app.tui.rectangle.value.width,
        app.tui.rectangle.value.height,
        projection.windows.length,
        projection.shelf.length,
        controller.themeRevision.value,
        controller.prefixPending.value,
        controller.helpVisible.value,
        controller.pendingKillSessionId.value,
        controller.status.value,
        selectedSessionIndex.value,
        sessionListScrollTop.value,
        controller.hostSessions.value.map((row) => `${row.name}:${row.state}:${row.terminalCount}`).join(","),
        controller.windowHost.viewRevision.value,
        controller.windowHost.commitRevision.value,
        // Every input-driven modal and menu state, so the desktop repaints on
        // interaction even when the background is static (a picture) and no
        // longer forces a repaint every animation tick.
        controller.startMenuVisible.value,
        startMenuSelection.value,
        controller.startMenuAnchor.value?.column,
        controller.startMenuAnchor.value?.row,
        controller.sessionName.value,
        controller.sessionNameDraft.value,
        controller.globalConfigVisible.value,
        controller.globalConfigPane.value,
        controller.globalConfigOptionIndex.value,
        controller.quitModalVisible.value,
        controller.pendingScp.value !== undefined,
        controller.configSessionId.value,
        controller.configRowIndex.value,
        killModal.selectedActionIndex.value,
        quitModal.selectedActionIndex.value,
        controller.networkTree.selectedIndex.value,
        controller.backgroundConfigVisible.value,
        controller.shaderManagerVisible.value,
        controller.shaderManagerIndex.value,
        controller.shaderPathDraft.value,
        JSON.stringify(controller.shaderConfig.value),
        controller.backgroundConfigPane.value,
        controller.backgroundConfigOptionIndex.value,
        controller.backgroundConfigListIndex.value,
        controller.backgroundBrowsePath.value,
        controller.backgroundSettingsRevision.value,
        terminalRenderRevision.value,
        settingsWidgetRevision.value,
        metaballRevision.value,
        // The block cursor follows the mouse, so its position must invalidate the
        // frame. It only changes on free motion when the cursor is enabled.
        mousePointer.value?.column,
        mousePointer.value?.row,
        // The cursor blinks, so each on/off toggle has to repaint.
        cursorBlinkOn.value,
        // Settings reach the painter directly — border glyphs, window opacity —
        // so a change to either has to invalidate the frame. Without this the
        // desktop only repaints because the status line happens to change too.
        JSON.stringify(controller.globalSettings.value),
        JSON.stringify(controller.windowSettings.value),
      ];
      for (const session of sessions) {
        const runtime = controller.runtime(session.id);
        fragments.push(
          session.id,
          session.title,
          session.sequence,
          session.status,
          runtime?.renderRevision.peek(),
          runtime?.attached.peek(),
          runtime?.warning.peek(),
        );
      }
      return fragments.join("|");
    }),
  );

  const desktop = new ExomuxDesktopSurface({
    parent: app.tui,
    theme: { base: identityStyle },
    zIndex: 1,
    rectangle: app.tui.rectangle,
    revision: renderRevision,
    render: () => {
      const rows = renderExomuxDesktop({
        animationOverlays: collectAnimationOverlays(),
        flyIn: {
          pending: pendingFlyInIds,
          suppressed: suppressedWindowIds,
          capture: captureFlyIn,
        },
        bounds: app.tui.rectangle.peek(),
        body: bodyRect.peek(),
        projection: windowProjection.peek(),
        controller,
        selectedSessionIndex: selectedSessionIndex.peek(),
        shelf: shelfBounds.peek(),
        metaballs,
        settingsWidgets,
        settingsPickers,
        settingsOptions,
        sessionNameField,
        scpPasswordField,
        backgroundList,
        backgroundOptionControls,
        backgroundButtons,
        windowConfigOptionControls,
        shaderManagerControls,
        shaderPathField,
        sessionList,
        sessionListScrollTop: sessionListScrollTop.peek(),
        networkTreeView,
        killModalSelection: killModal.selectedAction()?.id,
        quitModalSelection: quitModal.selectedAction()?.id,
        startMenuView,
        startMenuSelection: startMenuSelection.peek(),
        blockCursor: exomuxBlockCursorRender(
          controller.globalSettings.peek().blockCursor && cursorBlinkOn.peek(),
          mousePointer.peek(),
          windowProjection.peek(),
          !modalOpen(),
        ),
        backgroundField: activeBackgroundField(),
        ...(overgrowthRatios.size > 0
          ? {
            overgrowth: {
              ratios: overgrowthRatios,
              edges: exomuxOvergrowthEdges(controller.backgroundId.peek()),
            },
          }
          : {}),
      });
      lastDesktopRows = rows;
      return rows;
    },
  });
  void desktop;

  const terminalMouse = new ExomuxTerminalMouseRouter(controller);
  const touchGestures = new Map<number, ExomuxTouchGesture>();
  let pendingPointerMove: ExomuxPointerMoveSlot | undefined;
  // Global settings are deliberately absent: they live in an ordinary
  // floating window now, so the rest of the desktop stays interactive.
  const modalOpen = (): boolean =>
    controller.helpVisible.peek() || controller.pendingKillSessionId.peek() !== undefined ||
    controller.quitModalVisible.peek() || controller.pendingScp.peek() !== undefined ||
    controller.configSessionId.peek() !== undefined ||
    controller.backgroundConfigVisible.peek() ||
    controller.shaderManagerVisible.peek() ||
    controller.startMenuVisible.peek();

  let exitRequested = false;
  const requestClientExit = (terminateHost: boolean): void => {
    if (exitRequested || disposed) return;
    exitRequested = true;
    controller.cancelQuitModal();
    void (async () => {
      if (terminateHost) {
        try {
          await controller.shutdownHost();
        } catch {
          // The client still exits; an unreachable host cannot block quitting.
        }
      }
      // The launcher's shutdown binding listens for this event; emitting it is
      // the same exit path as SIGINT and must precede the listener teardown
      // that app.destroy() performs.
      app.tui.emit("destroy");
      app.destroy();
    })();
  };

  const performMenu = async (id: ExomuxMenuId): Promise<void> => {
    switch (id) {
      case "new":
        await controller.spawn({ bounds: bodyRect.peek() });
        break;
      case "sessions":
        controller.openSessionManager(bodyRect.peek());
        break;
      case "network":
        controller.toggleNetworkPanel(bodyRect.peek());
        break;
      case "config":
        controller.openGlobalConfig(bodyRect.peek());
        break;
      case "help":
        controller.openHelp();
        break;
      case "quit":
        controller.openQuitModal();
        break;
      case "favorite": {
        // Act on the preset the field is actually showing; the live-favorites
        // subscription then updates the cycle without rebuilding the field.
        const field = activeBackgroundField();
        if (exomuxBackgroundHasPresets(field)) controller.toggleButterchurnFavorite(field.presetName);
        break;
      }
    }
    await syncWindows();
  };

  const activateNetworkNode = async (row: TreeRow, forceNew = false): Promise<void> => {
    const sessionId = exomuxNetworkNodeSessionId(row.id);
    if (sessionId) {
      await controller.openSession(sessionId, bodyRect.peek());
      await syncWindows();
      return;
    }
    // A discovered remote tmux/exomux session attaches in a new window, or
    // focuses the window already attached to it; Shift-Enter forces a second
    // attachment (TSM-013).
    const remote = exomuxNetworkNodeRemoteSession(row.id);
    if (remote) {
      await controller.openRemoteSession(remote.target, remote.kind, remote.name, bodyRect.peek(), { forceNew });
      await syncWindows();
      return;
    }
    const hostShellTarget = exomuxNetworkNodeHostShellTarget(row.id);
    if (hostShellTarget) {
      await controller.spawnNetworkShell(hostShellTarget, hostShellTarget, bodyRect.peek());
      await syncWindows();
      return;
    }
    // Per-machine action rows (TSM-010): monitor over ssh -t, bounded ping,
    // OSC 52 copies. Device actions resolve their target from the live
    // snapshot; saved-host actions carry the target in the node id.
    const action = exomuxNetworkNodeAction(row.id);
    if (action) {
      if ("target" in action) {
        if (action.kind === "host-monitor") {
          await controller.spawnNetworkMonitor(action.target, action.target, bodyRect.peek());
          await syncWindows();
        } else if (action.kind === "host-ping") {
          void controller.pingNetworkTarget(action.target);
        } else {
          controller.copyNetworkText(action.target, "address");
        }
        return;
      }
      const device = controller.networkDevice(`dev:${action.deviceId}`);
      if (!device) return;
      if (action.kind === "copy4") {
        if (device.ipv4) controller.copyNetworkText(device.ipv4, `${device.shortName} IPv4`);
        return;
      }
      if (action.kind === "copydns") {
        if (device.dnsName) controller.copyNetworkText(device.dnsName, `${device.shortName} MagicDNS`);
        return;
      }
      const target = ExomuxController.tailnetSshTarget(device);
      if (!target) {
        controller.status.value = `No reachable SSH target for ${device.shortName}.`;
        return;
      }
      if (action.kind === "ping") {
        void controller.pingNetworkTarget(target);
        return;
      }
      await controller.spawnNetworkMonitor(target, device.shortName, bodyRect.peek());
      await syncWindows();
      return;
    }
    if (!row.id.startsWith("act:shell:")) return;
    const device = controller.networkDevice(row.id);
    if (!device) return;
    const target = ExomuxController.tailnetSshTarget(device);
    if (!target) {
      controller.status.value = `No reachable SSH target for ${device.shortName}.`;
      return;
    }
    await controller.spawnNetworkShell(target, device.shortName, bodyRect.peek());
    await syncWindows();
  };

  const networkRowAt = (column: number, row: number): TreeRow | undefined => {
    const projection = windowProjection.peek();
    const window = projection.windows.find((candidate) => candidate.id === EXOMUX_NETWORK_WINDOW_ID);
    if (!window || !contains(window.clientRect, column, row)) return undefined;
    const relative = row - window.clientRect.row - NETWORK_LIST_START;
    if (relative < 0) return undefined;
    const tree = controller.networkTree;
    const height = Math.max(1, window.clientRect.height - NETWORK_LIST_START);
    const visible = tree.visible(height);
    const target = visible[relative];
    if (!target) return undefined;
    tree.setSelectedIndex(target.index);
    return target;
  };

  const activateNetworkHit = async (row: TreeRow): Promise<void> => {
    if (row.hasChildren) {
      controller.networkTree.toggleActive();
      return;
    }
    await activateNetworkNode(row);
  };

  const activateMenu = (id: ExomuxMenuId): Promise<void> =>
    enqueue(async () => {
      if (modalOpen()) return;
      await performMenu(id);
    });

  const terminalBar = (): ExomuxTerminalBarProjection =>
    projectExomuxTerminalBar(controller, windowProjection.peek(), shelfBounds.peek());
  const terminalBarCommandAt = (column: number, row: number) =>
    terminalBar().commands.find((command) => contains(command.hitRect, column, row));
  const performTerminalBarAction = async (action: ExomuxTerminalBarAction): Promise<void> => {
    if (action.kind === "sessions") {
      controller.openSessionManager(bodyRect.peek());
    } else {
      const windowId = exomuxWindowId(action.sessionId);
      if (controller.windowHost.controller.inspect().activeWindowId === windowId) {
        controller.windowHost.execute({ kind: "minimize", id: windowId }, bodyRect.peek());
      } else {
        await controller.openSession(action.sessionId, bodyRect.peek());
      }
    }
    await syncWindows();
  };

  const cancelActiveWindowGesture = (event?: PointerInputEvent, legacy?: MousePressEvent): boolean => {
    const inspection = controller.windowHost.inspect();
    const pointerId = inspection.interaction.active?.pointerId ?? inspection.separatorResize?.pointerId;
    if (pointerId === undefined) return false;
    const result = controller.windowHost.handlePointer(
      pointerCancellationEvent(pointerId, event, legacy),
      bodyRect.peek(),
      projectionOptions(),
    );
    touchGestures.delete(pointerId);
    return result.handled;
  };

  /** Routes a click inside the settings window's client area to its rows. */
  const activateSettingsHit = (column: number, row: number): boolean => {
    const clientRect = windowProjection.peek().windows.find(
      (candidate) => candidate.id === EXOMUX_SETTINGS_WINDOW_ID,
    )?.clientRect;
    if (!clientRect || !controller.globalConfigVisible.peek()) return false;
    const themeIndex = Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === controller.themeId.peek()));
    const backgroundIndex = Math.max(0, EXOMUX_BACKGROUND_IDS.indexOf(controller.backgroundId.peek()));
    const layout = exomuxGlobalConfigLayout(clientRect, themeIndex, backgroundIndex);
    if (contains(layout.sessionNameRect, column, row)) {
      controller.beginSessionRename();
      return true;
    }
    if (controller.ghosttyDetected.peek() && contains(layout.shadersRect, column, row)) {
      controller.openShaderManager();
      return true;
    }
    if (contains(layout.backgroundConfigRect, column, row)) {
      controller.openBackgroundConfig();
      return true;
    }
    if (contains(layout.closeRect, column, row)) {
      controller.closeGlobalConfig(bodyRect.peek());
      return true;
    }
    // The theme/background selectors are real exotui List widgets: forward the
    // click straight into the List (client-relative), which selects the row and
    // applies it to the controller through the surface's two-way binding.
    if (contains(layout.themeListRect, column, row)) {
      controller.globalConfigPane.value = "theme";
      settingsPickers.handlePointer("theme", column - clientRect.column, row - clientRect.row);
      return true;
    }
    if (contains(layout.backgroundListRect, column, row)) {
      controller.globalConfigPane.value = "background";
      settingsPickers.handlePointer("background", column - clientRect.column, row - clientRect.row);
      return true;
    }
    for (let index = 0; index < layout.optionRows.length; index += 1) {
      if (!contains(layout.optionRows[index]!, column, row)) continue;
      controller.globalConfigPane.value = "options";
      controller.globalConfigOptionIndex.value = index;
      controller.cycleSettingsOption(index, exomuxOptionCycleDirection(layout.optionRows[index]!, column));
      return true;
    }
    return contains(clientRect, column, row);
  };

  const activateManagerHit = async (hit: ExomuxManagerSessionHit): Promise<void> => {
    if (hit.kind === "host-session") {
      controller.switchToSession(hit.name);
      return;
    }
    selectedSessionIndex.value = hit.index;
    await controller.openSession(hit.session.id, bodyRect.peek());
    await syncWindows();
  };

  // A single physical wheel notch (and a trackpad swipe) fans out into many
  // scroll events: the input reader emits a `mouseScroll` and the app layer a
  // derived `pointerInput` wheel for the same motion, and high-resolution wheels
  // and trackpads send a burst per gesture. For the menu-like list windows that
  // made one gesture jump many rows. Throttle the selection to at most one move
  // per window: the clock advances only on an actual move (not on every event),
  // so a burst collapses to one step while a direction flip moves immediately and
  // steady scrolling still advances at the throttle rate rather than sticking.
  let lastListMove: { windowId: string; direction: number; time: number } | undefined;
  const LIST_SCROLL_THROTTLE_MS = 70;
  const listScrollStep = (windowId: string, delta: number): number => {
    const direction = Math.sign(delta);
    const now = Date.now();
    const previous = lastListMove;
    const throttled = previous !== undefined && previous.windowId === windowId &&
      previous.direction === direction && now - previous.time < LIST_SCROLL_THROTTLE_MS;
    if (throttled) return 0;
    lastListMove = { windowId, direction, time: now };
    return direction;
  };

  const scrollClientWindow = (windowId: string, delta: number): boolean => {
    if (!Number.isFinite(delta) || delta === 0 || modalOpen()) return modalOpen();
    if (windowId === EXOMUX_SESSIONS_WINDOW_ID) {
      const managerRowCount = exomuxManagerRows(controller).length;
      if (managerRowCount === 0) return true;
      // A proper listbox wheel: the viewport scrolls one row per notch and the
      // selection stays put; the next arrow key re-anchors the window on it.
      const height = sessionListViewportHeight();
      const currentTop = exomuxSessionListWindowStart(
        managerRowCount,
        selectedSessionIndex.peek(),
        height,
        sessionListScrollTop.peek(),
      );
      const maxTop = Math.max(0, managerRowCount - height);
      sessionListScrollTop.value = Math.max(
        0,
        Math.min(currentTop + listScrollStep(windowId, delta), maxTop),
      );
      return true;
    }
    if (windowId === EXOMUX_NETWORK_WINDOW_ID) {
      controller.networkTree.move(listScrollStep(windowId, delta));
      return true;
    }
    if (windowId === EXOMUX_SETTINGS_WINDOW_ID) {
      controller.moveGlobalConfigSelection(listScrollStep(windowId, delta));
      return true;
    }
    const sessionId = exomuxSessionIdFromWindow(windowId);
    const runtime = sessionId ? controller.runtime(sessionId) : undefined;
    if (!runtime) return false;
    // Full-screen apps own their viewport: translate wheel motion into cursor
    // keys instead of trapping the window in workbench copy mode. Children
    // with mouse tracking already consumed the wheel before this fallback.
    const screenInspection = runtime.screen.inspect();
    if (screenInspection.alternate && runtime.scrollback.mode === "live") {
      if (runtime.attached.peek() && runtime.summary.peek().running) {
        const bytes = wheelFallbackKeyBytes(delta, screenInspection.privateModes.includes(1));
        if (bytes) void enqueueRaw(bytes, runtime.sessionId);
      }
      return true;
    }
    const before = runtime.scrollback.inspectViewport();
    if (before.totalRows <= before.viewportRows) return true;
    if (delta > 0 && before.mode === "live") return true;
    runtime.scrollback.scrollLines(Math.trunc(delta));
    const after = runtime.scrollback.inspectViewport();
    if (delta > 0 && after.offset >= after.maxOffset) runtime.scrollback.exitCopyMode();
    runtime.renderRevision.value += 1;
    const current = runtime.scrollback.inspectViewport();
    controller.status.value = current.mode === "copy"
      ? `Copy mode · row ${current.offset + 1}/${Math.max(1, current.totalRows)} · scroll down for live`
      : `Live terminal · ${runtime.summary.peek().title}`;
    return true;
  };

  // Scrolls whichever settings list sits under the pointer (theme or background)
  // by its viewport, without changing any selection. Over the rest of the
  // settings window the wheel is consumed so it never cycles the active pane.
  const scrollSettingsListAt = (column: number, row: number, delta: number): boolean => {
    const clientRect = windowProjection.peek().windows.find(
      (candidate) => candidate.id === EXOMUX_SETTINGS_WINDOW_ID,
    )?.clientRect;
    if (!clientRect || !controller.globalConfigVisible.peek()) return true;
    const themeIndex = Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === controller.themeId.peek()));
    const backgroundIndex = Math.max(0, EXOMUX_BACKGROUND_IDS.indexOf(controller.backgroundId.peek()));
    const layout = exomuxGlobalConfigLayout(clientRect, themeIndex, backgroundIndex);
    if (contains(layout.themeListRect, column, row)) settingsPickers.handleScroll("theme", delta);
    else if (contains(layout.backgroundListRect, column, row)) settingsPickers.handleScroll("background", delta);
    return true;
  };

  const scrollWindowAt = (column: number, row: number, delta: number): boolean => {
    const window = clientWindowAt(windowProjection.peek(), column, row);
    if (!window) return false;
    if (window.id === EXOMUX_SETTINGS_WINDOW_ID) return scrollSettingsListAt(column, row, delta);
    return scrollClientWindow(window.id, delta);
  };

  /** Wheel notches scale by the target window's resolved scroll speed. */
  const wheelDeltaAt = (column: number, row: number, notches: number): number => {
    const global = controller.globalSettings.peek();
    const window = clientWindowAt(windowProjection.peek(), column, row);
    const sessionId = window ? exomuxSessionIdFromWindow(window.id) : undefined;
    const lines = sessionId
      ? exomuxResolvedScrollLines(global, controller.windowSettingsFor(sessionId))
      : global.scrollLines;
    return notches * lines;
  };

  const performModalActivation = async (column: number, row: number): Promise<boolean> => {
    if (controller.startMenuVisible.peek()) {
      const layout = exomuxStartMenuLayout(
        app.tui.rectangle.peek(),
        controller.startMenuAnchor.peek(),
        exomuxStartMenuItems(controller),
      );
      const item = layout.items.find((candidate) => contains(candidate.rect, column, row));
      if (item) {
        controller.closeStartMenu();
        await performMenu(item.id);
        return true;
      }
      // Anywhere else — including the start button itself — simply dismisses.
      controller.closeStartMenu();
      return true;
    }
    if (controller.helpVisible.peek()) {
      if (contains(exomuxHelpLayout(windowProjection.peek().bounds).closeRect, column, row)) {
        controller.closeHelp();
      }
      return true;
    }
    if (controller.pendingKillSessionId.peek()) {
      const layout = exomuxKillLayout(windowProjection.peek().bounds);
      if (contains(layout.confirmRect, column, row)) {
        await controller.confirmKillSession();
        await syncWindows();
      } else if (contains(layout.cancelRect, column, row)) {
        controller.cancelKillSession();
      }
      return true;
    }
    if (controller.quitModalVisible.peek()) {
      const layout = exomuxQuitLayout(windowProjection.peek().bounds);
      if (contains(layout.terminateRect, column, row)) requestClientExit(true);
      else if (contains(layout.detachRect, column, row)) requestClientExit(false);
      else if (contains(layout.cancelRect, column, row)) controller.cancelQuitModal();
      return true;
    }
    if (controller.shaderManagerVisible.peek()) {
      const rows = controller.shaderManagerRows();
      const layout = exomuxShaderManagerLayout(windowProjection.peek().bounds, rows.length);
      if (contains(layout.closeRect, column, row) || !contains(layout.rect, column, row)) {
        controller.closeShaderManager();
        return true;
      }
      if (contains(layout.addRect, column, row)) {
        if (controller.shaderPathDraft.peek() === undefined) controller.beginAddCustomShader();
        else controller.commitShaderPathDraft();
        return true;
      }
      const hit = layout.rowRects.findIndex((candidate) => contains(candidate, column, row));
      if (hit >= 0 && rows[hit] && rows[hit]!.kind !== "note") {
        controller.shaderManagerIndex.value = hit;
        controller.cycleShaderManagerRow(hit, exomuxOptionCycleDirection(layout.rowRects[hit]!, column));
      }
      return true;
    }
    if (controller.backgroundConfigVisible.peek()) {
      const specs = EXOMUX_BACKGROUND_SETTING_SPECS[controller.backgroundId.peek()] ?? [];
      const list = exomuxBackgroundConfigList(controller);
      const listIndex = Math.min(
        Math.max(0, controller.backgroundConfigListIndex.peek()),
        Math.max(0, list.length - 1),
      );
      const layout = exomuxBackgroundConfigLayout(
        windowProjection.peek().bounds,
        list.length,
        listIndex,
        specs.length,
        controller.backgroundConfigScrollTop.peek(),
      );
      if (contains(layout.closeRect, column, row) || !contains(layout.rect, column, row)) {
        controller.closeBackgroundConfig();
        return true;
      }
      const hitList = layout.listRows.find((candidate) => contains(candidate.rect, column, row));
      if (hitList) {
        controller.backgroundConfigPane.value = "list";
        controller.backgroundConfigListIndex.value = hitList.index;
        controller.backgroundConfigScrollTop.value = -1;
        activateBackgroundConfigRow(list[hitList.index]);
        return true;
      }
      const optionAt = layout.optionRows.findIndex((candidate) => contains(candidate, column, row));
      if (optionAt >= 0 && specs[optionAt]) {
        controller.backgroundConfigPane.value = "options";
        controller.backgroundConfigOptionIndex.value = optionAt;
        controller.cycleBackgroundSetting(
          specs[optionAt]!.id,
          exomuxOptionCycleDirection(layout.optionRows[optionAt]!, column),
        );
      }
      return true;
    }
    const configSessionId = controller.configSessionId.peek();
    if (configSessionId) {
      const layout = exomuxWindowConfigLayout(windowProjection.peek().bounds);
      if (contains(layout.closeRect, column, row)) {
        controller.closeWindowConfig();
      } else if (contains(layout.resetRect, column, row)) {
        controller.resetWindowSettings(configSessionId);
      } else {
        for (let index = 0; index < layout.rowRects.length; index += 1) {
          if (!contains(layout.rowRects[index]!, column, row)) continue;
          controller.configRowIndex.value = index;
          controller.cycleWindowSetting(configSessionId, EXOMUX_WINDOW_SETTING_SPECS[index]!.id, 1);
          break;
        }
      }
      return true;
    }
    const scpRequest = controller.pendingScp.peek();
    if (scpRequest) {
      const layout = exomuxScpLayout(windowProjection.peek().bounds);
      if (contains(layout.sendRect, column, row)) {
        void controller.confirmScpTransfer(bodyRect.peek());
      } else if (contains(layout.pasteRect, column, row)) {
        const text = controller.cancelScpTransfer(true);
        if (text) void controller.writeSession(scpRequest.sessionId, new TextEncoder().encode(text));
      } else if (contains(layout.cancelRect, column, row)) {
        controller.cancelScpTransfer(false);
      }
      return true;
    }
    return false;
  };

  const routeModalActivation = (column: number, row: number): Promise<boolean> => {
    let handled = false;
    return enqueue(async () => {
      if (!modalOpen()) return;
      cancelActiveWindowGesture();
      handled = await performModalActivation(column, row);
    }).then(() => handled);
  };

  const routeWindowPointer = async (event: MousePressEvent): Promise<boolean> => {
    // One rule everywhere (user direction): the block cursor's cell IS the
    // click's cell. Every pointer event maps through the same warp, so what
    // the cursor shows is exactly what a click, drag, or scroll acts on.
    event = warpPointerEvent(event);
    backgroundSetPointer({ column: event.x, row: event.y });
    if (modalOpen()) {
      if (terminalMouse.hasLegacyCapture) {
        const packet = terminalMouse.routeLegacyPress(
          { ...event, drag: false, release: true },
          windowProjection.peek(),
        );
        if (packet) void enqueueRaw(packet.bytes, packet.sessionId);
      }
      let handled = false;
      await enqueue(async () => {
        cancelActiveWindowGesture(undefined, event);
        if (!event.drag && !event.release && event.button === 0) {
          await performModalActivation(event.x, event.y);
        }
        handled = true;
      });
      return handled;
    }

    // The start and quit buttons hit-test on the WARPED cell here rather than
    // through raw-rect router targets, so the distorted top corners stay
    // clickable exactly where they are drawn.
    if (!event.drag && !event.release && event.button === 0) {
      if (contains(START_BUTTON, event.x, event.y)) {
        await enqueue(() => {
          controller.toggleStartMenu(currentButterchurnPreset());
        });
        return true;
      }
      if (contains(menuQuitRect(app.tui.rectangle.peek()), event.x, event.y)) {
        await activateMenu("quit");
        return true;
      }
    }
    // A fresh press while a window gesture is still active means that
    // gesture's release was lost; cancel it so one missed release can never
    // wedge the desktop with a phantom gesture that swallows every click.
    if (!event.drag && !event.release && controller.windowHost.inspect().interaction.active) {
      cancelActiveWindowGesture(undefined, event);
    }
    // The shelf claims presses only. A drag or release passing over the top
    // bar belongs to whatever window gesture is in flight — claiming those
    // here swallowed the release, left the gesture active forever, and made
    // every later window click dead.
    if (!event.drag && !event.release && contains(shelfBounds.peek(), event.x, event.y)) {
      if (event.button === 0) {
        const command = terminalBarCommandAt(event.x, event.y);
        if (command) await enqueue(() => performTerminalBarAction(command.item.action));
      }
      return true;
    }

    // Right-click opens the Exomux menu under the cursor. A terminal with mouse
    // reporting on owns its own right-click, so the menu yields to it there.
    if (event.button === 2 && !event.drag && !event.release && contains(bodyRect.peek(), event.x, event.y)) {
      const overReportingTerminal = (() => {
        const window = clientWindowAt(windowProjection.peek(), event.x, event.y);
        const sessionId = window ? exomuxSessionIdFromWindow(window.id) : undefined;
        return sessionId ? controller.windowSettingsFor(sessionId).mouseReporting : false;
      })();
      if (!overReportingTerminal) {
        await enqueue(() => controller.openStartMenu({ column: event.x, row: event.y }, currentButterchurnPreset()));
        return true;
      }
    }

    // Geometry gestures are local and synchronous. Do not make title-bar
    // motion wait behind PTY ACKs; child bytes retain their own ordered lane.
    const projectionBefore = windowProjection.peek();
    // Any-motion tracking (which the block cursor turns on) streams pure
    // hover-motion — a drag with no held button — that never existed under
    // button-event tracking. It must not enter the window-host interaction
    // router: a hover there leaves an interaction "active", and the very next
    // real click on a titlebar button is then routed into that gesture and
    // swallowed instead of run. The pointer is already updated above (for the
    // block cursor and the background); a held-button drag still forwards to a
    // captured terminal, but a bare hover goes no further.
    const heldButton = event.button === 0 || event.button === 1 || event.button === 2;
    if (event.drag && !event.release && !heldButton) {
      const packet = terminalMouse.routeLegacyPress(event, projectionBefore);
      if (packet) void enqueueRaw(packet.bytes, packet.sessionId);
      return true;
    }
    // The `config` titlebar button carries no built-in window command, so claim
    // its press here before the host treats the title bar as a move gesture.
    if (!event.drag && !event.release && event.button === 0) {
      const configSessionId = configControlSessionAt(projectionBefore, event.x, event.y);
      if (configSessionId) {
        await enqueue(() => {
          controller.openWindowConfig(configSessionId);
        });
        return true;
      }
    }
    // Double-click-to-maximize on title bars is host-owned now (WS-008): the
    // window host detects it from envelope timestamps inside handlePointer.
    const clientWindow = clientWindowAt(projectionBefore, event.x, event.y);
    // Bare desktop: the background gets first refusal, which is how ripe ivy
    // fruit is picked. It only claims the click when something was actually
    // there, so an ordinary desktop click still falls through. A field may also
    // claim specific cells it paints over window chrome — the rain drain plug
    // is on the bottom row, which is usually somebody's window.
    if (!event.drag && !event.release && event.button === 0) {
      const field = activeBackgroundField();
      if (exomuxBackgroundAcceptsPicks(field) && contains(bodyRect.peek(), event.x, event.y)) {
        const reachable = !clientWindow || (field.picksOverWindows?.(event.x, event.y) ?? false);
        if (reachable && field.pick(event.x, event.y)) {
          metaballRevision.value += 1;
          return true;
        }
      }
    }
    const result = controller.windowHost.handleMouse(
      "terminal",
      event,
      bodyRect.peek(),
      projectionOptions(),
    );
    let handled = result.handled;
    if (!result.handled || terminalMouse.hasLegacyCapture) {
      const packet = terminalMouse.routeLegacyPress(event, projectionBefore);
      if (packet) {
        void enqueueRaw(packet.bytes, packet.sessionId);
        handled = true;
      }
    }
    if (!event.drag && !event.release && event.button === 0) {
      const hit = managerSessionAt(
        controller,
        projectionBefore,
        selectedSessionIndex.peek(),
        event.x,
        event.y,
        sessionListScrollTop.peek(),
      );
      if (hit && clientWindow?.id === EXOMUX_SESSIONS_WINDOW_ID) {
        await enqueue(() => activateManagerHit(hit));
        return true;
      }
      if (clientWindow?.id === EXOMUX_NETWORK_WINDOW_ID) {
        const networkRow = networkRowAt(event.x, event.y);
        if (networkRow) {
          await enqueue(() => activateNetworkHit(networkRow));
          return true;
        }
      }
      if (clientWindow?.id === EXOMUX_SETTINGS_WINDOW_ID) {
        let settingsHandled = false;
        await enqueue(() => {
          settingsHandled = activateSettingsHit(event.x, event.y);
        });
        if (settingsHandled) return true;
      }
      if (clientWindow) handled = true;
      if (clientWindow && clientWindow.id !== EXOMUX_SESSIONS_WINDOW_ID) controller.syncActiveSession();
    }
    if (result.handled) controller.syncTerminalGeometry(windowProjection.peek());
    if (result.command) {
      const command = result.command;
      void enqueue(() => runWindowCommand(command, true));
    }
    return handled;
  };

  /**
   * Scrolls the background-config modal's list viewport under the pointer,
   * moving the window without moving the selection (a proper listbox wheel).
   */
  const scrollBackgroundConfigList = (column: number, row: number, direction: number): void => {
    if (direction === 0) return;
    const specs = EXOMUX_BACKGROUND_SETTING_SPECS[controller.backgroundId.peek()] ?? [];
    const list = exomuxBackgroundConfigList(controller);
    if (list.length === 0) return;
    const listIndex = Math.min(Math.max(0, controller.backgroundConfigListIndex.peek()), list.length - 1);
    const layout = exomuxBackgroundConfigLayout(
      windowProjection.peek().bounds,
      list.length,
      listIndex,
      specs.length,
      controller.backgroundConfigScrollTop.peek(),
    );
    if (!contains(layout.listRect, column, row)) return;
    // The window's current top, whether it was following the selection or
    // already scrolled, so a notch steps on from what is shown.
    const currentTop = layout.listRows[0]?.index ?? 0;
    const maxTop = Math.max(0, list.length - layout.listRect.height);
    const lines = Math.max(1, controller.globalSettings.peek().scrollLines);
    const nextTop = Math.min(maxTop, Math.max(0, currentTop + direction * lines));
    if (nextTop !== controller.backgroundConfigScrollTop.peek()) {
      controller.backgroundConfigScrollTop.value = nextTop;
    }
  };

  const routeWindowScroll = (event: MouseScrollEvent): Promise<boolean> => {
    event = warpPointerEvent(event);
    backgroundSetPointer({ column: event.x, row: event.y });
    // The background-config modal owns the wheel over its list pane, scrolling
    // that viewport rather than letting the gesture fall through or die.
    if (controller.backgroundConfigVisible.peek()) {
      scrollBackgroundConfigList(event.x, event.y, Math.sign(event.scroll));
      return Promise.resolve(true);
    }
    if (modalOpen()) return Promise.resolve(true);
    if (contains(shelfBounds.peek(), event.x, event.y)) return Promise.resolve(true);
    const packet = terminalMouse.routeLegacyScroll(event, windowProjection.peek());
    if (packet) {
      void enqueueRaw(packet.bytes, packet.sessionId);
      return Promise.resolve(true);
    }
    return Promise.resolve(scrollWindowAt(event.x, event.y, wheelDeltaAt(event.x, event.y, event.scroll)));
  };

  const routeTerminalPointer = (
    event: PointerInputEvent,
    projection = windowProjection.peek(),
  ): boolean => {
    const packet = terminalMouse.routePointer(event, projection);
    if (!packet) return false;
    void enqueueRaw(packet.bytes, packet.sessionId);
    return true;
  };

  const routeSemanticPointerFast = (event: PointerInputEvent): boolean | undefined => {
    const projection = windowProjection.peek();
    if (modalOpen()) {
      for (const packet of terminalMouse.cancelPointerCaptures(projection, event)) {
        void enqueueRaw(packet.bytes, packet.sessionId);
      }
      return undefined;
    }
    if (terminalMouse.hasPointerCapture(event.pointerId)) {
      routeTerminalPointer(event, projection);
      return true;
    }
    const hostInspection = controller.windowHost.inspect();
    const activePointerId = hostInspection.interaction.active?.pointerId ??
      hostInspection.separatorResize?.pointerId;
    if (activePointerId === event.pointerId) {
      const result = controller.windowHost.handlePointer(event, bodyRect.peek(), projectionOptions());
      if (result.handled) controller.syncTerminalGeometry(windowProjection.peek());
      return result.handled;
    }
    if (
      event.kind === "wheel" ||
      (event.kind === "move" && event.device === "mouse" && event.buttons === 0)
    ) {
      if (routeTerminalPointer(event, projection)) return true;
      const point = event.coordinates.cell;
      const direction = Math.sign(event.wheel?.deltaY ?? 0);
      return event.kind === "wheel" && point && direction !== 0
        ? scrollWindowAt(point.x, point.y, wheelDeltaAt(point.x, point.y, direction)) || undefined
        : undefined;
    }
    const point = event.coordinates.cell;
    if (point && contains(shelfBounds.peek(), point.x, point.y)) {
      if (event.device !== "mouse") return undefined;
      if (event.kind === "down" && primaryPointerActivation(event)) {
        const command = terminalBarCommandAt(point.x, point.y);
        if (command) void enqueue(() => performTerminalBarAction(command.item.action));
      }
      return true;
    }
    if (event.kind !== "down" || !point) return undefined;
    const clientWindow = clientWindowAt(projection, point.x, point.y);
    if (clientWindow && clientWindow.id !== EXOMUX_SESSIONS_WINDOW_ID) {
      controller.windowHost.handlePointer(event, bodyRect.peek(), projectionOptions());
      if (routeTerminalPointer(event, projection) || event.device === "mouse") {
        controller.syncActiveSession();
        return true;
      }
      return undefined;
    }
    if (
      primaryPointerActivation(event) &&
      !touchWindowCommandAt(projection, point.x, point.y)
    ) {
      const result = controller.windowHost.handlePointer(event, bodyRect.peek(), projectionOptions());
      if (result.handled) {
        controller.syncTerminalGeometry(windowProjection.peek());
        return true;
      }
    }
    return undefined;
  };

  const modalTouchTargetAt = (column: number, row: number): ExomuxTouchTarget | undefined => {
    if (controller.startMenuVisible.peek()) {
      const layout = exomuxStartMenuLayout(
        app.tui.rectangle.peek(),
        controller.startMenuAnchor.peek(),
        exomuxStartMenuItems(controller),
      );
      const item = layout.items.find((candidate) => contains(candidate.rect, column, row));
      return item ? { kind: "start-item", id: item.id, hitRect: item.rect } : undefined;
    }
    if (controller.helpVisible.peek()) {
      const hitRect = exomuxHelpLayout(windowProjection.peek().bounds).closeRect;
      return contains(hitRect, column, row) ? { kind: "modal", action: "close-help", hitRect } : undefined;
    }
    const sessionId = controller.pendingKillSessionId.peek();
    if (sessionId) {
      const layout = exomuxKillLayout(windowProjection.peek().bounds);
      if (contains(layout.confirmRect, column, row)) {
        return { kind: "modal", action: "confirm-kill", sessionId, hitRect: layout.confirmRect };
      }
      if (contains(layout.cancelRect, column, row)) {
        return { kind: "modal", action: "cancel-kill", sessionId, hitRect: layout.cancelRect };
      }
      return undefined;
    }
    if (controller.quitModalVisible.peek()) {
      const layout = exomuxQuitLayout(windowProjection.peek().bounds);
      if (contains(layout.terminateRect, column, row)) {
        return { kind: "modal", action: "terminate-quit", hitRect: layout.terminateRect };
      }
      if (contains(layout.detachRect, column, row)) {
        return { kind: "modal", action: "detach-quit", hitRect: layout.detachRect };
      }
      if (contains(layout.cancelRect, column, row)) {
        return { kind: "modal", action: "cancel-quit", hitRect: layout.cancelRect };
      }
      return undefined;
    }
    if (controller.pendingScp.peek()) {
      const layout = exomuxScpLayout(windowProjection.peek().bounds);
      if (contains(layout.sendRect, column, row)) {
        return { kind: "modal", action: "send-scp", hitRect: layout.sendRect };
      }
      if (contains(layout.pasteRect, column, row)) {
        return { kind: "modal", action: "paste-scp", hitRect: layout.pasteRect };
      }
      if (contains(layout.cancelRect, column, row)) {
        return { kind: "modal", action: "cancel-scp", hitRect: layout.cancelRect };
      }
    }
    return undefined;
  };

  const performTouchTarget = async (
    gesture: ExomuxTouchGesture,
    point: { x: number; y: number } | undefined,
  ): Promise<boolean> => {
    if (!point || gesture.moved) return true;
    const target = gesture.target;
    if ("hitRect" in target && !contains(target.hitRect, point.x, point.y)) return true;
    switch (target.kind) {
      case "menu":
        if (!modalOpen()) await performMenu(target.id);
        return true;
      case "start-item":
        if (controller.startMenuVisible.peek()) {
          controller.closeStartMenu();
          await performMenu(target.id);
        }
        return true;
      case "modal":
        if (target.action === "close-help" && controller.helpVisible.peek()) {
          controller.closeHelp();
        } else if (
          target.action === "cancel-kill" && controller.pendingKillSessionId.peek() === target.sessionId
        ) {
          controller.cancelKillSession();
        } else if (
          target.action === "confirm-kill" && controller.pendingKillSessionId.peek() === target.sessionId
        ) {
          await controller.confirmKillSession();
          await syncWindows();
        } else if (target.action === "cancel-quit" && controller.quitModalVisible.peek()) {
          controller.cancelQuitModal();
        } else if (target.action === "detach-quit" && controller.quitModalVisible.peek()) {
          requestClientExit(false);
        } else if (target.action === "terminate-quit" && controller.quitModalVisible.peek()) {
          requestClientExit(true);
        } else if (target.action === "send-scp" && controller.pendingScp.peek()) {
          void controller.confirmScpTransfer(bodyRect.peek());
        } else if (target.action === "paste-scp" && controller.pendingScp.peek()) {
          const scpRequest = controller.pendingScp.peek()!;
          const text = controller.cancelScpTransfer(true);
          if (text) void controller.writeSession(scpRequest.sessionId, new TextEncoder().encode(text));
        } else if (target.action === "cancel-scp" && controller.pendingScp.peek()) {
          controller.cancelScpTransfer(false);
        }
        return true;
      case "window-command":
        if (!modalOpen()) {
          await runWindowCommand(target.command, false);
        }
        return true;
      case "terminal-bar":
        if (!modalOpen()) await performTerminalBarAction(target.action);
        return true;
      case "client": {
        if (modalOpen()) return true;
        const projection = windowProjection.peek();
        const window = clientWindowAt(projection, point.x, point.y);
        if (window?.id !== target.windowId) return true;
        if (window.id === EXOMUX_SESSIONS_WINDOW_ID) {
          const hit = managerSessionAt(
            controller,
            projection,
            selectedSessionIndex.peek(),
            point.x,
            point.y,
            sessionListScrollTop.peek(),
          );
          if (hit) await activateManagerHit(hit);
        } else if (window.id === EXOMUX_NETWORK_WINDOW_ID) {
          const networkRow = networkRowAt(point.x, point.y);
          if (networkRow) await activateNetworkHit(networkRow);
        } else if (window.id === EXOMUX_SETTINGS_WINDOW_ID) {
          activateSettingsHit(point.x, point.y);
        }
        return true;
      }
    }
  };

  const routeSemanticPointerInBarrier = async (
    event: PointerInputEvent,
    excursion?: ExomuxPointerMoveExcursion,
  ): Promise<boolean> => {
    let handled = false;
    const point = event.coordinates.cell;
    const gesture = touchGestures.get(event.pointerId);
    const touchLike = event.device !== "mouse";
    const activation = primaryPointerActivation(event);

    if (modalOpen()) {
      cancelActiveWindowGesture(event);
      if (!touchLike) {
        if (event.kind === "down" && activation && point) {
          await performModalActivation(point.x, point.y);
        }
        return true;
      }
      if (event.kind === "down") {
        if (activation && point) {
          const target = modalTouchTargetAt(point.x, point.y);
          if (target) rememberTouchGesture(touchGestures, event, point, target);
        }
        return true;
      }
      // Start-menu rows complete on release just like any other modal button.
      if (gesture?.target.kind !== "modal" && gesture?.target.kind !== "start-item") {
        touchGestures.delete(event.pointerId);
        return true;
      }
      if (event.kind === "move") updateTouchGesture(gesture, event, point, excursion);
      if (event.kind === "up" || event.kind === "cancel") {
        updateTouchGesture(gesture, event, point);
        touchGestures.delete(event.pointerId);
        if (event.kind === "up") await performTouchTarget(gesture, point);
      }
      return true;
    }

    if (!event.primary && !gesture) return false;
    if (event.kind === "wheel") {
      if (!point) return false;
      const direction = Math.sign(event.wheel?.deltaY ?? 0);
      return direction !== 0 && scrollWindowAt(point.x, point.y, wheelDeltaAt(point.x, point.y, direction));
    }

    if (!point) {
      if (touchLike && gesture) updateTouchGesture(gesture, event, undefined, excursion);
      const result = controller.windowHost.handlePointer(event, bodyRect.peek(), projectionOptions());
      if (event.kind === "up" || event.kind === "cancel") touchGestures.delete(event.pointerId);
      if (result.handled) {
        if (result.command) await runWindowCommand(result.command, true);
        else await syncWindows();
      }
      return result.handled || gesture !== undefined;
    }

    const projectionBefore = windowProjection.peek();
    const inTerminalBar = contains(shelfBounds.peek(), point.x, point.y);
    if (inTerminalBar) {
      if (!touchLike) {
        if (event.kind === "down" && activation) {
          const command = terminalBarCommandAt(point.x, point.y);
          if (command) await performTerminalBarAction(command.item.action);
        }
        return true;
      }
      if (event.kind === "down") {
        if (!activation) return true;
        const command = terminalBarCommandAt(point.x, point.y);
        if (command) {
          rememberTouchGesture(touchGestures, event, point, {
            kind: "terminal-bar",
            action: command.item.action,
            hitRect: command.hitRect,
          });
        }
        return true;
      }
    }
    // The start button is not a command, it toggles the dropdown, so it is
    // resolved before the direct-command menu targets.
    if (event.kind === "down" && activation) {
      const startRect = touchLike ? coarseMenuRect(START_BUTTON) : START_BUTTON;
      if (contains(startRect, point.x, point.y)) {
        controller.toggleStartMenu(currentButterchurnPreset());
        return true;
      }
    }
    if (!touchLike && event.kind === "down" && activation) {
      const menu = menuAt(point.x, point.y, false, app.tui.rectangle.peek());
      if (menu) {
        await performMenu(menu);
        return true;
      }
    }

    if (touchLike && event.kind === "down") {
      if (!activation) return false;
      const menu = menuAt(point.x, point.y, true, app.tui.rectangle.peek());
      if (menu) {
        rememberTouchGesture(touchGestures, event, point, {
          kind: "menu",
          id: menu,
          hitRect: coarseMenuRect(menuRect(menu, app.tui.rectangle.peek())),
        });
        return true;
      }
      const commandTarget = touchWindowCommandAt(projectionBefore, point.x, point.y);
      if (commandTarget) {
        rememberTouchGesture(touchGestures, event, point, commandTarget);
        return true;
      }
    }

    if (touchLike && gesture) {
      if (event.kind === "move") {
        const previousRow = gesture.lastRow;
        updateTouchGesture(gesture, event, point, excursion);
        if (gesture.target.kind === "client") {
          const rowDelta = previousRow - point.y;
          if (rowDelta !== 0) {
            if (gesture.target.windowId === EXOMUX_SESSIONS_WINDOW_ID) {
              const sessions = controller.sessions.peek();
              selectedSessionIndex.value = clampIndex(
                selectedSessionIndex.peek() + rowDelta,
                sessions.length,
              );
            } else {
              scrollClientWindow(gesture.target.windowId, rowDelta);
            }
          }
        }
        return true;
      }
      if (event.kind === "up" || event.kind === "cancel") {
        updateTouchGesture(gesture, event, point);
        touchGestures.delete(event.pointerId);
        if (event.kind === "up") await performTouchTarget(gesture, point);
        return true;
      }
    }

    const clientWindow = clientWindowAt(projectionBefore, point.x, point.y);
    const result = controller.windowHost.handlePointer(event, bodyRect.peek(), projectionOptions());
    handled = result.handled;
    if (!touchLike && event.kind === "down" && activation && clientWindow) {
      const hit = managerSessionAt(
        controller,
        projectionBefore,
        selectedSessionIndex.peek(),
        point.x,
        point.y,
        sessionListScrollTop.peek(),
      );
      if (hit && clientWindow.id === EXOMUX_SESSIONS_WINDOW_ID) await activateManagerHit(hit);
      if (clientWindow.id === EXOMUX_NETWORK_WINDOW_ID) {
        const networkRow = networkRowAt(point.x, point.y);
        if (networkRow) await activateNetworkHit(networkRow);
      }
      handled = true;
    } else if (touchLike && event.kind === "down" && activation && clientWindow) {
      rememberTouchGesture(touchGestures, event, point, { kind: "client", windowId: clientWindow.id });
      handled = true;
    }
    if (result.command) await runWindowCommand(result.command, true);
    else if (result.handled || clientWindow) await syncWindows();
    return handled;
  };

  const routeSemanticPointer = (event: PointerInputEvent): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    const pointerCell = event.coordinates.cell;
    if (event.kind === "cancel") backgroundClearPointer();
    else if (pointerCell) backgroundSetPointer({ column: pointerCell.x, row: pointerCell.y });
    const fastResult = routeSemanticPointerFast(event);
    if (fastResult !== undefined) return Promise.resolve(fastResult);
    if (
      event.kind === "move" && pendingPointerMove && !pendingPointerMove.started &&
      pendingPointerMove.event.pointerId === event.pointerId &&
      pendingPointerMove.ingressRevision === ingressRevision
    ) {
      mergePointerExcursion(pendingPointerMove.excursion, event);
      pendingPointerMove.event = event;
      return pendingPointerMove.result;
    }
    let settle!: (handled: boolean) => void;
    const result = new Promise<boolean>((resolve) => settle = resolve);
    const slot: ExomuxPointerMoveSlot | undefined = event.kind === "move"
      ? {
        event,
        ingressRevision: ingressRevision + 1,
        excursion: pointerExcursion(event),
        result,
        settle,
        started: false,
      }
      : undefined;
    if (slot) pendingPointerMove = slot;
    let ran = false;
    const queued = enqueue(async () => {
      ran = true;
      if (slot) {
        slot.started = true;
        if (pendingPointerMove === slot) pendingPointerMove = undefined;
      }
      try {
        const handled = await routeSemanticPointerInBarrier(slot?.event ?? event, slot?.excursion);
        settle(handled);
      } catch (error) {
        if (!disposed) controller.status.value = `Exomux pointer failed: ${safeErrorMessage(error)}`;
        settle(false);
      }
    });
    const settleSkipped = () => {
      if (ran) return;
      if (slot && pendingPointerMove === slot) pendingPointerMove = undefined;
      settle(false);
    };
    void queued.then(settleSkipped, settleSkipped);
    return result;
  };

  unsubscribers.push(app.mouse.register({
    id: "exomux-window-desktop",
    // Spans the whole screen because the window taskbar now shares the top bar
    // with the start button. The start and quit targets sit at a higher zIndex,
    // so they still win their own cells.
    bounds: () => ({
      column: 0,
      row: 0,
      width: Math.max(1, app.tui.rectangle.peek().width),
      height: Math.max(1, app.tui.rectangle.peek().height),
    }),
    zIndex: 10_000,
    captureDrag: true,
    onPress: routeWindowPointer,
    onDrag: routeWindowPointer,
    onRelease: routeWindowPointer,
    onScroll: routeWindowScroll,
  }));
  // Keeps the block cursor tracking the pointer even while this catcher is live.
  // It sits above the desktop router (zIndex 30k vs 10k) and captures the drag,
  // so it would otherwise swallow the hover-motion that updates mousePointer and
  // freeze the cursor in place the moment a modal or the start menu opens. Warp
  // through the pincushion first so both the cursor and the modal hit-test act on
  // the cell the user visually points at.
  const modalTrackPointer = (event: MousePressEvent): MousePressEvent => {
    const warped = warpPointerEvent(event);
    backgroundSetPointer({ column: warped.x, row: warped.y });
    return warped;
  };
  unsubscribers.push(app.mouse.register({
    id: "exomux-modal",
    bounds: () => app.tui.rectangle.peek(),
    zIndex: 30_000,
    disabled: () => !modalOpen(),
    captureDrag: true,
    onPress: (event) => {
      const warped = modalTrackPointer(event);
      return warped.button === 0 ? routeModalActivation(warped.x, warped.y) : true;
    },
    onDrag: (event) => {
      modalTrackPointer(event);
      return true;
    },
    onRelease: (event) => {
      modalTrackPointer(event);
      return true;
    },
    onScroll: () => true,
  }));
  // The start and quit buttons are handled inside routeWindowPointer on the
  // warped (and control-snapped) cell — dedicated raw-rect router targets
  // would hit-test undistorted coordinates and miss under the pincushion.

  const handleNetworkKey = async (event: KeyPressEvent): Promise<boolean> => {
    if (controller.windowHost.controller.inspect().activeWindowId !== EXOMUX_NETWORK_WINDOW_ID) return false;
    const tree = controller.networkTree;
    // The fuzzy filter (TSM-006): while active it owns printable typing, so
    // `r` refreshes only when no filter is being edited (vim-search style).
    const activeFilter = controller.networkFilter.peek();
    if (activeFilter !== undefined) {
      if (event.key === "escape") {
        controller.clearNetworkFilter();
        return true;
      }
      if (event.key === "backspace") {
        controller.backspaceNetworkFilter();
        return true;
      }
      if (!event.ctrl && !event.meta && event.key.length === 1 && event.key !== "/") {
        controller.appendNetworkFilter(event.shift ? event.key.toUpperCase() : event.key);
        return true;
      }
      // Arrows, Enter, and Del keep their normal meaning below.
    }
    if (event.key === "/" && !event.ctrl && !event.meta) {
      controller.beginNetworkFilter();
      return true;
    }
    if (activeFilter === undefined && event.key.toLowerCase() === "r" && !event.ctrl && !event.meta) {
      void controller.refreshNetwork().catch(() => undefined);
      return true;
    }
    if (event.key === "return") {
      const row = tree.selected();
      if (!row) return true;
      if (row.hasChildren) tree.toggleActive();
      else await activateNetworkNode(row, event.shift);
      return true;
    }
    if (event.key === "delete") {
      const target = exomuxNetworkNodeHostTarget(tree.selected()?.id ?? "");
      if (target) controller.forgetHost(target);
      return true;
    }
    const networkWindow = windowProjection.peek().windows.find(
      (candidate) => candidate.id === EXOMUX_NETWORK_WINDOW_ID,
    );
    const height = Math.max(1, (networkWindow?.clientRect.height ?? 10) - NETWORK_LIST_START);
    return tree.handleKeyPress(event, height) !== undefined;
  };

  const routeKeyInBarrier = async (
    event: KeyPressEvent,
    forwardTerminalInput: (bytes: Uint8Array) => void | Promise<unknown> = (bytes) => controller.writeActive(bytes),
  ): Promise<void> => {
    // F1 toggles the help modal from anywhere. If help is up it closes; the start
    // menu yields to it; any heavier modal (quit/kill/config) is left for the user
    // to dismiss first rather than stacking the key reference on top of it.
    if (event.key === "f1" && !event.ctrl && !event.meta) {
      if (controller.helpVisible.peek()) controller.closeHelp();
      else if (controller.startMenuVisible.peek()) {
        controller.closeStartMenu();
        controller.openHelp();
      } else if (!modalOpen()) controller.openHelp();
      return;
    }
    if (controller.startMenuVisible.peek()) {
      if (event.key === "escape" || event.key.toLowerCase() === "q") {
        controller.closeStartMenu();
        return;
      }
      const menuItems = exomuxStartMenuItems(controller);
      if (event.key === "up" || event.key === "down") {
        startMenuSelection.value = shiftContextMenuSelection(
          menuItems,
          startMenuSelection.peek(),
          event.key === "up" ? -1 : 1,
        );
        return;
      }
      if (event.key === "return" || event.key === "space") {
        const item = menuItems[clampContextMenuSelection(menuItems, startMenuSelection.peek())];
        if (item) {
          controller.closeStartMenu();
          await performMenu(item.id);
        }
        return;
      }
      return;
    }
    if (controller.helpVisible.peek()) {
      if (event.key === "escape" || event.key === "?" || event.key.toLowerCase() === "q") {
        controller.closeHelp();
      }
      return;
    }
    if (controller.pendingKillSessionId.peek()) {
      // Arrows/tab move the selection, Enter/Space activate it, Escape closes
      // (the ModalController owns that grammar); y/n stay as direct shortcuts.
      const result = killModal.handleKeyPress(event);
      if (result && "id" in result) {
        if (result.id === "kill") {
          await controller.confirmKillSession();
          await syncWindows();
        } else {
          controller.cancelKillSession();
        }
        return;
      }
      if (result && "open" in result && !result.open) {
        controller.cancelKillSession();
        return;
      }
      if (result) return; // the selection moved
      if (event.key.toLowerCase() === "y") {
        await controller.confirmKillSession();
        await syncWindows();
      } else if (event.key.toLowerCase() === "n") {
        controller.cancelKillSession();
      }
      return;
    }
    if (controller.quitModalVisible.peek()) {
      const result = quitModal.handleKeyPress(event);
      if (result && "id" in result) {
        if (result.id === "cancel") controller.cancelQuitModal();
        else if (result.id === "detach") requestClientExit(false);
        else requestClientExit(true);
        return;
      }
      if (result && "open" in result && !result.open) {
        controller.cancelQuitModal();
        return;
      }
      if (result) return; // the selection moved
      if (event.key.toLowerCase() === "c") {
        controller.cancelQuitModal();
      } else if (event.key.toLowerCase() === "d") {
        requestClientExit(false);
      } else if (event.key.toLowerCase() === "t") {
        requestClientExit(true);
      }
      return;
    }
    if (controller.shaderManagerVisible.peek()) {
      // While the path input is active it owns typing; Enter (via the field's
      // onSubmit) commits, Escape backs out to the manager.
      if (controller.shaderPathDraft.peek() !== undefined) {
        if (event.key === "escape") {
          controller.cancelShaderPathDraft();
        } else {
          const shifted = !event.ctrl && !event.meta && event.shift && event.key.length === 1;
          shaderPathField.handleKey({
            key: shifted ? event.key.toUpperCase() : event.key,
            ctrl: event.ctrl,
            meta: event.meta,
            shift: event.shift,
          });
        }
        return;
      }
      const index = controller.shaderManagerIndex.peek();
      const row = controller.shaderManagerRows()[index];
      if (event.key === "escape" || event.key.toLowerCase() === "q") {
        controller.closeShaderManager();
      } else if (event.key === "up") {
        controller.moveShaderManagerSelection(-1);
      } else if (event.key === "down") {
        controller.moveShaderManagerSelection(1);
      } else if (event.key === "left") {
        controller.cycleShaderManagerRow(index, -1);
      } else if (event.key === "right" || event.key === "return" || event.key === "space") {
        controller.cycleShaderManagerRow(index, 1);
      } else if (event.key.toLowerCase() === "a") {
        controller.beginAddCustomShader();
      } else if ((event.key === "delete" || event.key === "backspace") && row?.kind === "custom") {
        controller.removeCustomShader(row.customIndex);
      } else if (event.key === "[" && row?.kind === "custom" && row.customIndex > 0) {
        // Selection follows the entry it just moved.
        controller.moveCustomShader(row.customIndex, -1);
        controller.shaderManagerIndex.value = index - 1;
      } else if (event.key === "]" && row?.kind === "custom") {
        if (row.customIndex < controller.shaderConfig.peek().customShaders.length - 1) {
          controller.moveCustomShader(row.customIndex, 1);
          controller.shaderManagerIndex.value = index + 1;
        }
      }
      return;
    }
    if (controller.backgroundConfigVisible.peek()) {
      const specs = EXOMUX_BACKGROUND_SETTING_SPECS[controller.backgroundId.peek()] ?? [];
      const list = exomuxBackgroundConfigList(controller);
      const pane = controller.backgroundConfigPane.peek();
      const inList = pane === "list" && list.length > 0;
      const settingId = specs[controller.backgroundConfigOptionIndex.peek()]?.id;
      const moveList = (delta: number) => {
        const count = Math.max(1, list.length);
        controller.backgroundConfigListIndex.value = (controller.backgroundConfigListIndex.peek() + delta + count) %
          count;
        // Moving the selection re-couples the viewport to it.
        controller.backgroundConfigScrollTop.value = -1;
      };
      if (event.key === "escape" || event.key.toLowerCase() === "q") {
        controller.closeBackgroundConfig();
      } else if (event.key === "tab") {
        controller.backgroundConfigPane.value = pane === "list" ? "options" : list.length > 0 ? "list" : "options";
      } else if (event.key === "up") {
        if (inList) moveList(-1);
        else if (specs.length > 0) {
          controller.backgroundConfigOptionIndex.value =
            (controller.backgroundConfigOptionIndex.peek() - 1 + specs.length) % specs.length;
        }
      } else if (event.key === "down") {
        if (inList) moveList(1);
        else if (specs.length > 0) {
          controller.backgroundConfigOptionIndex.value = (controller.backgroundConfigOptionIndex.peek() + 1) %
            specs.length;
        }
      } else if (event.key === "pageup" && inList) {
        moveList(-10);
      } else if (event.key === "pagedown" && inList) {
        moveList(10);
      } else if (event.key === "left") {
        if (!inList && settingId) controller.cycleBackgroundSetting(settingId, -1);
      } else if (event.key === "right") {
        if (!inList && settingId) controller.cycleBackgroundSetting(settingId, 1);
      } else if (event.key === "return") {
        if (inList) activateBackgroundConfigRow(list[controller.backgroundConfigListIndex.peek()]);
        else if (settingId) controller.cycleBackgroundSetting(settingId, 1);
      } else if (event.key === "space") {
        // Over a butterchurn preset, Space toggles its favorite (Enter still
        // selects); elsewhere it keeps the activate/cycle behaviour.
        const row = inList ? list[controller.backgroundConfigListIndex.peek()] : undefined;
        const butterchurn = controller.backgroundId.peek() === "butterchurn" ||
          controller.backgroundId.peek() === "butterchurn cpu";
        if (row && butterchurn && row.presetIndex !== undefined) {
          controller.toggleButterchurnFavorite(row.label);
        } else if (inList) {
          activateBackgroundConfigRow(list[controller.backgroundConfigListIndex.peek()]);
        } else if (settingId) {
          controller.cycleBackgroundSetting(settingId, 1);
        }
      }
      return;
    }
    if (
      controller.globalConfigVisible.peek() &&
      controller.windowHost.controller.inspect().activeWindowId === EXOMUX_SETTINGS_WINDOW_ID
    ) {
      // Editing the session name captures typing until Enter or Escape. Escape
      // cancels; everything else — typing, backspace, cursor keys, and Enter,
      // which submits and commits — is handled natively by the composited Input.
      if (controller.sessionNameDraft.peek() !== undefined) {
        if (event.key === "escape") {
          controller.cancelSessionRename();
        } else {
          const shifted = !event.ctrl && !event.meta && event.shift && event.key.length === 1;
          sessionNameField.handleKey({
            key: shifted ? event.key.toUpperCase() : event.key,
            ctrl: event.ctrl,
            meta: event.meta,
            shift: event.shift,
          });
        }
        return;
      }
      // A normal window only owns the keyboard while focused; an unfocused
      // settings window lets these keys reach the active terminal instead.
      const optionIndex = controller.globalConfigOptionIndex.peek();
      const inOptions = controller.globalConfigPane.peek() === "options" &&
        optionIndex < controller.settingsOptionCount();
      if (event.key === "escape" || event.key.toLowerCase() === "q") {
        controller.closeGlobalConfig(bodyRect.peek());
      } else if (event.key === "tab") {
        controller.moveGlobalConfigPane(event.shift ? -1 : 1);
      } else if (event.key === "up") {
        controller.moveGlobalConfigSelection(-1);
      } else if (event.key === "down") {
        controller.moveGlobalConfigSelection(1);
      } else if (event.key === "left") {
        if (inOptions) controller.cycleSettingsOption(optionIndex, -1);
        else controller.moveGlobalConfigPane(-1);
      } else if (event.key === "right") {
        if (inOptions) controller.cycleSettingsOption(optionIndex, 1);
        else controller.moveGlobalConfigPane(1);
      } else if ((event.key === "return" || event.key === "space") && inOptions) {
        controller.cycleSettingsOption(optionIndex, 1);
      } else if (event.key.toLowerCase() === "b") {
        controller.openBackgroundConfig();
      } else if (event.key.toLowerCase() === "s") {
        controller.openShaderManager();
      }
      return;
    }
    const configSessionId = controller.configSessionId.peek();
    if (configSessionId) {
      const settingId = EXOMUX_WINDOW_SETTING_SPECS[controller.configRowIndex.peek()]?.id;
      if (event.key === "escape" || event.key.toLowerCase() === "q") {
        controller.closeWindowConfig();
      } else if (event.key === "up") {
        controller.moveWindowConfigRow(-1);
      } else if (event.key === "down") {
        controller.moveWindowConfigRow(1);
      } else if (event.key === "left" && settingId) {
        controller.cycleWindowSetting(configSessionId, settingId, -1);
      } else if ((event.key === "right" || event.key === "return" || event.key === "space") && settingId) {
        controller.cycleWindowSetting(configSessionId, settingId, 1);
      } else if (event.key.toLowerCase() === "r") {
        controller.resetWindowSettings(configSessionId);
      }
      return;
    }
    if (controller.pendingScp.peek()) {
      // The modal hosts a real composited password Input. Enter sends and Escape
      // cancels at the modal level; everything else — typing, backspace, space,
      // cursor keys — is owned natively by the Input, which pushes its value back
      // through onChange.
      if (event.key === "return") {
        void controller.confirmScpTransfer(bodyRect.peek());
      } else if (event.key === "escape") {
        controller.cancelScpTransfer(false);
      } else if (scpPasswordField.active) {
        const shifted = !event.ctrl && !event.meta && event.shift && event.key.length === 1;
        scpPasswordField.handleKey({
          key: shifted ? event.key.toUpperCase() : event.key,
          ctrl: event.ctrl,
          meta: event.meta,
          shift: event.shift,
        });
      } else {
        // The composited Input mounts on the first render after the modal opens.
        // Any keystroke that beats it accumulates on the controller instead; the
        // Input seeds from that password when it mounts, so nothing is lost.
        if (event.key === "backspace") {
          controller.backspaceScpPassword();
        } else if (event.key === "space") {
          controller.appendScpPassword(" ");
        } else if (!event.ctrl && !event.meta && event.key.length === 1) {
          controller.appendScpPassword(event.shift ? event.key.toUpperCase() : event.key);
        }
      }
      return;
    }
    if (event.ctrl && !event.meta && event.key.toLowerCase() === "n") {
      if (controller.prefixPending.peek()) {
        controller.cancelPrefix();
        await forwardTerminalInput(new Uint8Array([14]));
      } else {
        controller.beginPrefix();
      }
      return;
    }
    if (controller.prefixPending.peek()) {
      // Prefix-l: force a clean full repaint. The diff renderer assumes the
      // terminal retained what it last wrote; if the terminal disagrees (a
      // reflow, a glitched range), one keystroke heals — and diagnoses — it.
      if (event.key.toLowerCase() === "l" && !event.ctrl && !event.meta) {
        controller.cancelPrefix();
        app.tui.canvas.rerenderAll();
        return;
      }
      await controller.handlePrefixKey(event.key, bodyRect.peek());
      await syncWindows();
      return;
    }
    // Ctrl+C belongs to the focused child terminal, exactly like tmux. Only
    // when no running terminal can receive it does it fall back to the quit
    // modal, so the chord is never silently swallowed.
    if (event.ctrl && !event.meta && event.key.toLowerCase() === "c") {
      const active = controller.activeRuntime();
      if (!active || !active.attached.peek() || !active.summary.peek().running) {
        controller.openQuitModal();
        return;
      }
      await forwardTerminalInput(new Uint8Array([3]));
      return;
    }
    if (shouldRouteAsWorkbenchKey(controller, event)) {
      const activeWindowId = controller.windowHost.controller.inspect().activeWindowId;
      const hostResult = controller.windowHost.handleKey(event, bodyRect.peek(), projectionOptions());
      if (hostResult.handled) {
        if (hostResult.command) await runWindowCommand(hostResult.command, true, activeWindowId);
        else await syncWindows();
        return;
      }
      if (await handleNetworkKey(event)) {
        await syncWindows();
        return;
      }
      if (await handleManagerKey(controller, selectedSessionIndex, event, bodyRect.peek())) {
        await syncWindows();
        return;
      }
    }
    const bytes = encodeTerminalKeyPress(event);
    if (bytes) await forwardTerminalInput(bytes);
  };

  type ClassifiedInputSegment = {
    readonly sessionId: string;
    readonly parts: Uint8Array[];
    bytes: number;
  };
  type ClassifiedKeyBatch = {
    readonly events: KeyPressEvent[];
    reservedBytes: number;
    started: boolean;
    tailRevision: number;
  };
  let pendingClassifiedKeyBatch: ClassifiedKeyBatch | undefined;
  let classifiedInputBytes = 0;
  const appendClassifiedInput = (
    segments: ClassifiedInputSegment[],
    sessionId: string,
    bytes: Uint8Array,
  ): void => {
    let offset = 0;
    while (offset < bytes.byteLength) {
      let segment = segments.at(-1);
      if (
        !segment || segment.sessionId !== sessionId ||
        segment.bytes >= EXOMUX_PROTOCOL_LIMITS.inputBytes
      ) {
        segment = { sessionId, parts: [], bytes: 0 };
        segments.push(segment);
      }
      const take = Math.min(
        bytes.byteLength - offset,
        EXOMUX_PROTOCOL_LIMITS.inputBytes - segment.bytes,
      );
      segment.parts.push(bytes.slice(offset, offset + take));
      segment.bytes += take;
      offset += take;
    }
  };
  const flushClassifiedInput = async (segments: ClassifiedInputSegment[]): Promise<void> => {
    if (segments.length === 0) return;
    const writes = segments.splice(0).map((segment) => {
      const bytes = new Uint8Array(segment.bytes);
      let offset = 0;
      for (const part of segment.parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      return { sessionId: segment.sessionId, bytes };
    });
    for (let offset = 0; offset < writes.length; offset += CLASSIFIED_INPUT_PIPELINE_DEPTH) {
      await Promise.all(
        writes.slice(offset, offset + CLASSIFIED_INPUT_PIPELINE_DEPTH).map(async (write) => {
          try {
            await controller.writeSession(write.sessionId, write.bytes);
          } catch (error) {
            reportInputError(error);
          }
        }),
      );
    }
  };
  const drainClassifiedKeys = async (batch: ClassifiedKeyBatch): Promise<void> => {
    batch.started = true;
    const segments: ClassifiedInputSegment[] = [];
    const appendToActive = (bytes: Uint8Array): void => {
      const sessionId = controller.activeRuntime()?.sessionId;
      if (sessionId) appendClassifiedInput(segments, sessionId, bytes);
    };
    for (const event of batch.events) {
      const prefixKey = event.ctrl && !event.meta && event.key.toLowerCase() === "n";
      const needsWorkbenchClassification = prefixKey || modalOpen() || controller.prefixPending.peek() ||
        shouldRouteAsWorkbenchKey(controller, event);
      if (needsWorkbenchClassification) {
        await flushClassifiedInput(segments);
        await routeKeyInBarrier(event, appendToActive);
        continue;
      }
      const bytes = encodeTerminalKeyPress(event);
      if (bytes) appendToActive(bytes);
    }
    await flushClassifiedInput(segments);
  };
  const snapshotKeyPress = (event: KeyPressEvent): KeyPressEvent => ({
    ...event,
    buffer: new Uint8Array(event.buffer),
  });
  const classifiedKeyReservationBytes = (event: KeyPressEvent): number => {
    const encodedBytes = event.buffer.byteLength > 0
      ? event.buffer.byteLength
      : encodeTerminalKeyPress(event)?.byteLength ?? 0;
    return Math.max(MIN_CLASSIFIED_KEY_RESERVATION_BYTES, event.key.length * 2, encodedBytes);
  };
  const enqueueClassifiedKey = (event: KeyPressEvent): void => {
    const reservedBytes = classifiedKeyReservationBytes(event);
    if (reservedBytes > MAX_CLASSIFIED_INPUT_BYTES - classifiedInputBytes) {
      reportInputError(
        new RangeError(`raw input buffer limit exceeded (${MAX_CLASSIFIED_INPUT_BYTES} bytes)`),
      );
      return;
    }
    classifiedInputBytes += reservedBytes;
    const current = pendingClassifiedKeyBatch;
    if (current && !current.started && current.tailRevision === ingressRevision) {
      ingressRevision += 1;
      current.tailRevision = ingressRevision;
      current.events.push(event);
      current.reservedBytes += reservedBytes;
      return;
    }
    const batch: ClassifiedKeyBatch = {
      events: [event],
      reservedBytes,
      started: false,
      tailRevision: -1,
    };
    pendingClassifiedKeyBatch = batch;
    const completed = enqueue(() => drainClassifiedKeys(batch));
    batch.tailRevision = ingressRevision;
    void completed.finally(() => {
      classifiedInputBytes = Math.max(0, classifiedInputBytes - batch.reservedBytes);
      if (pendingClassifiedKeyBatch === batch) pendingClassifiedKeyBatch = undefined;
    });
  };
  const enqueueKeyBarrier = (event: KeyPressEvent): void => {
    void enqueue(() => routeKeyInBarrier(event));
  };

  const allowPasteInBarrier = (): boolean => {
    if (modalOpen()) return false;
    // A paste is one atomic terminal payload, not a mux command. If it follows
    // an armed prefix, cancel the prefix before forwarding the complete paste.
    if (controller.prefixPending.peek()) controller.cancelPrefix();
    return true;
  };

  let prefixIngressPending = false;
  unsubscribers.push(app.tui.on("keyPress", (readerEvent) => {
    // InputReader deliberately reuses one KeyPressEvent and aliases its read
    // buffer. Snapshot at the synchronous ingress boundary before any queued
    // prefix/control work can observe the next decoded key instead.
    const event = snapshotKeyPress(readerEvent);
    if (prefixIngressPending) {
      prefixIngressPending = false;
      enqueueKeyBarrier(event);
      return;
    }
    const prefixKey = event.ctrl && !event.meta && event.key.toLowerCase() === "n";
    const classificationBarrier = operationQueue.hasPendingBarrier();
    if (
      prefixKey && !classificationBarrier && !modalOpen() &&
      !controller.prefixPending.peek()
    ) {
      prefixIngressPending = true;
      enqueueKeyBarrier(event);
      return;
    }
    // Ctrl+C rides the raw fast path into a receptive terminal like any other
    // byte, but with nowhere to deliver it the chord must not vanish into a
    // silent no-op write — the barrier route turns it into the quit modal.
    const interruptKey = event.ctrl && !event.meta && event.key.toLowerCase() === "c";
    const activeRuntime = interruptKey ? controller.activeRuntime() : undefined;
    const interruptUndeliverable = interruptKey &&
      (!activeRuntime || !activeRuntime.attached.peek() || !activeRuntime.summary.peek().running);
    if (
      prefixKey || interruptUndeliverable || modalOpen() || controller.prefixPending.peek() ||
      shouldRouteAsWorkbenchKey(controller, event)
    ) {
      enqueueKeyBarrier(event);
      return;
    }
    if (classificationBarrier) {
      enqueueClassifiedKey(event);
      return;
    }
    const bytes = encodeTerminalKeyPress(event);
    if (bytes) void enqueueRaw(bytes);
  }));
  unsubscribers.push(app.tui.on("paste", (event) => {
    // Preserve the reader's raw bytes when available and let the operation
    // queue perform the sole bounded copy/encoding step at ingress.
    const paste = event.buffer.byteLength > 0 ? event.buffer : event.text;
    // A pasted local file path aimed at a network-panel SSH shell becomes a
    // transfer offer instead of literal input; every other paste flows through.
    const activeSessionId = controller.activeRuntime()?.sessionId;
    const scpCandidate = event.text.length > 0 && !modalOpen() &&
      activeSessionId !== undefined && controller.scpEligibleTarget(activeSessionId) !== undefined &&
      exomuxScpCandidatePath(event.text) !== undefined;
    if (scpCandidate) {
      const text = event.text;
      prefixIngressPending = false;
      void enqueue(async () => {
        if (modalOpen()) return;
        if (controller.prefixPending.peek()) controller.cancelPrefix();
        const intercepted = await controller.maybeInterceptScpPaste(text);
        if (!intercepted) void enqueueRaw(paste);
      });
      return;
    }
    if (
      !prefixIngressPending && !operationQueue.hasPendingBarrier() && !modalOpen() &&
      !controller.prefixPending.peek()
    ) {
      void enqueueRaw(paste);
      return;
    }
    prefixIngressPending = false;
    void enqueueGuardedRaw(paste, allowPasteInBarrier);
  }));

  const scheduleGeometry = (): void => {
    if (disposed) return;
    controller.syncTerminalGeometry(windowProjection.peek());
  };
  windowProjection.subscribe(scheduleGeometry, subscriptions.signal);
  // Refit floating windows when the desktop changes shape so a smaller parent
  // never strands one offscreen. Guarded on size so it only fires on a real
  // resize, not on every window move that also republishes bodyRect's readers.
  let lastReflowSize = { width: bodyRect.peek().width, height: bodyRect.peek().height };
  bodyRect.subscribe((bounds) => {
    if (disposed) return;
    if (bounds.width === lastReflowSize.width && bounds.height === lastReflowSize.height) return;
    lastReflowSize = { width: bounds.width, height: bounds.height };
    if (controller.reflowFloatingWindows(bounds)) void syncWindows();
  }, subscriptions.signal);
  controller.sessions.subscribe((sessions) => {
    selectedSessionIndex.value = clampIndex(selectedSessionIndex.peek(), sessions.length);
  }, subscriptions.signal);
  // Fit any restored floating windows to the current view at launch: a layout
  // persisted from a larger terminal must never come back partly offscreen.
  // `bodyRect.subscribe` only fires on a later resize, so the first fit is here.
  if (controller.reflowFloatingWindows(bodyRect.peek())) void syncWindows();
  scheduleGeometry();

  return {
    app,
    controller,
    bodyRect,
    shelfBounds,
    windowProjection,
    selectedSessionIndex,
    enqueue,
    handlePointer: routeSemanticPointer,
    handleScroll: routeWindowScroll,
    metaballFrameRevision: () => metaballRevision.peek(),
    renderRevisionValue: () => renderRevision.peek(),
    overgrowthRatios: () => overgrowthRatios,
    whenIdle: () => operationQueue.whenIdle(),
    dispose() {
      if (disposed) return;
      const projection = windowProjection.peek();
      for (const packet of terminalMouse.cancelAllCaptures(projection)) {
        void controller.writeSession(packet.sessionId, packet.bytes).catch(() => false);
      }
      disposed = true;
      touchGestures.clear();
      terminalMouse.clear();
      if (pendingPointerMove && !pendingPointerMove.started) {
        pendingPointerMove.settle(false);
        pendingPointerMove = undefined;
      }
      operationQueue.dispose();
      releaseIdleBackgroundFields();
      subscriptions.abort();
      for (let index = unsubscribers.length - 1; index >= 0; index -= 1) unsubscribers[index]!();
      for (let index = owned.length - 1; index >= 0; index -= 1) owned[index]!.dispose();
    },
  };
}

function exomuxCommands(): TerminalAppOptions<ExomuxAppAction>["commands"] {
  return [
    { id: "exomux.new", label: "New terminal", group: "sessions", action: { type: "exomux.new" } },
    {
      id: "exomux.sessions",
      label: "Show session manager",
      group: "sessions",
      action: { type: "exomux.sessions" },
    },
    { id: "exomux.theme", label: "Cycle theme", group: "appearance", action: { type: "exomux.theme" } },
    { id: "exomux.help", label: "Show help", group: "global", action: { type: "exomux.help" } },
    { id: "exomux.detach", label: "Detach active terminal", group: "sessions", action: { type: "exomux.detach" } },
    { id: "exomux.kill", label: "Kill active terminal", group: "sessions", action: { type: "exomux.kill" } },
    { id: "exomux.quit", label: "Quit Exomux", group: "global", action: { type: "exomux.quit" } },
  ];
}

async function handleExomuxAction(action: ExomuxAppAction, mount: ExomuxAppMountRef): Promise<void> {
  const mounted = mount.current;
  if (!mounted) return;
  const { controller, bodyRect } = mounted;
  await mounted.enqueue(async () => {
    switch (action.type) {
      case "exomux.new":
        await controller.spawn({ bounds: bodyRect.peek() });
        break;
      case "exomux.sessions":
        controller.windowHost.execute({ kind: "restore", id: EXOMUX_SESSIONS_WINDOW_ID }, bodyRect.peek());
        controller.windowHost.execute({ kind: "focus", id: EXOMUX_SESSIONS_WINDOW_ID }, bodyRect.peek());
        break;
      case "exomux.theme":
        controller.cycleTheme();
        break;
      case "exomux.help":
        controller.openHelp();
        break;
      case "exomux.detach":
        await controller.closeActive(bodyRect.peek());
        break;
      case "exomux.kill": {
        const runtime = controller.activeRuntime();
        if (runtime) controller.requestKillSession(runtime.sessionId);
        break;
      }
      case "exomux.quit":
        mounted.app.destroy();
        await controller.dispose();
        return;
    }
    await controller.syncWindowVisibility(bodyRect.peek());
    controller.syncTerminalGeometry(mounted.windowProjection.peek());
  });
}

function wheelFallbackKeyBytes(delta: number, applicationCursorKeys: boolean): Uint8Array | undefined {
  const lines = Math.min(12, Math.abs(Math.trunc(delta)));
  if (lines === 0) return undefined;
  const key = delta < 0 ? (applicationCursorKeys ? "\x1bOA" : "\x1b[A") : applicationCursorKeys ? "\x1bOB" : "\x1b[B";
  return new TextEncoder().encode(key.repeat(lines));
}

async function handleManagerKey(
  controller: ExomuxController,
  selected: Signal<number>,
  event: KeyPressEvent,
  bounds: Rectangle,
): Promise<boolean> {
  if (controller.windowHost.controller.inspect().activeWindowId !== EXOMUX_SESSIONS_WINDOW_ID) return false;
  const sessions = controller.sessions.peek();
  if (event.key === "up" || event.key === "down") {
    const delta = event.key === "up" ? -1 : 1;
    selected.value = wrapIndex(selected.peek() + delta, sessions.length);
    return true;
  }
  const session = sessions[clampIndex(selected.peek(), sessions.length)];
  if (!session) return event.key === "return" || event.key === "delete";
  if (event.key === "return" || event.key === "space") {
    await controller.openSession(session.id, bounds);
    return true;
  }
  if (event.key === "delete") {
    controller.requestKillSession(session.id);
    return true;
  }
  return false;
}

function shouldRouteAsWorkbenchKey(controller: ExomuxController, event: KeyPressEvent): boolean {
  // F1 is the global help shortcut, whichever window is active — pull it out of
  // the terminal byte stream so routeKeyInBarrier can open the modal.
  if (event.key === "f1" && !event.ctrl && !event.meta) return true;
  if (event.meta || controller.windowHost.inspect().switcherOpen) return true;
  const activeWindowId = controller.windowHost.controller.inspect().activeWindowId;
  if (activeWindowId === EXOMUX_NETWORK_WINDOW_ID) {
    // An active fuzzy filter captures all typing until Escape.
    if (controller.networkFilter.peek() !== undefined) return true;
    return event.key === "up" || event.key === "down" || event.key === "left" || event.key === "right" ||
      event.key === "return" || event.key === "space" || event.key === "delete" || event.key === "pageup" ||
      event.key === "pagedown" || event.key === "home" || event.key === "end" ||
      event.key.toLowerCase() === "r" || event.key === "/";
  }
  if (activeWindowId === EXOMUX_SETTINGS_WINDOW_ID) {
    // While editing the session name the field captures every printable key.
    if (controller.sessionNameDraft.peek() !== undefined) return true;
    return event.key === "up" || event.key === "down" || event.key === "left" || event.key === "right" ||
      event.key === "return" || event.key === "space" || event.key === "tab" || event.key === "escape" ||
      event.key.toLowerCase() === "q" || event.key.toLowerCase() === "b" ||
      (event.key.toLowerCase() === "s" && controller.ghosttyDetected.peek());
  }
  if (activeWindowId !== EXOMUX_SESSIONS_WINDOW_ID) return false;
  return event.key === "up" || event.key === "down" || event.key === "return" || event.key === "space" ||
    event.key === "delete";
}

/** One playing transition ghost with the styled cells it samples from. */
interface ExomuxAnimationOverlayPaint {
  overlay: SurfaceTransitionOverlay;
  /** Rect-local styled source cells captured at transition start. */
  styled: string[][];
}

/** Restore-fly-in hooks: scratch-capture a restored window, then hide it
 * while its ghost flies out of the taskbar button. */
interface ExomuxFlyInHooks {
  readonly pending: ReadonlySet<string>;
  readonly suppressed: ReadonlySet<string>;
  capture(windowId: string, rows: string[][], rect: Rectangle): void;
}

interface RenderExomuxDesktopOptions {
  /** Window-transition ghosts composited above windows (039). */
  animationOverlays?: readonly ExomuxAnimationOverlayPaint[];
  /** Restore-from-minimized capture/suppression (039 fly-in). */
  flyIn?: ExomuxFlyInHooks;
  bounds: Rectangle;
  body: Rectangle;
  projection: WorkbenchWindowHostProjection;
  controller: ExomuxController;
  selectedSessionIndex: number;
  /** Top-bar region the window taskbar is laid out into. */
  shelf: Rectangle;
  metaballs: ExomuxMetaballField;
  backgroundField?: ExomuxAnimatedBackground;
  overgrowth?: ExomuxOvergrowthPass;
  /** Hosts the settings window's action buttons as real composited widgets. */
  settingsWidgets?: ExomuxSettingsWidgets;
  /** Hosts the settings window's theme/background selectors as real composited Lists. */
  settingsPickers?: ExomuxSettingsSurface;
  /** Hosts the settings window's option controls as real composited Cyclers/CheckBoxes. */
  settingsOptions?: ExomuxSettingsOptions;
  /** Hosts the session-name editor as a real composited Input while renaming. */
  sessionNameField?: ExomuxInputField;
  /** Hosts the SCP modal's password prompt as a real composited (masked) Input. */
  scpPasswordField?: ExomuxInputField;
  /** Hosts the background-config modal's list pane as a real composited List. */
  backgroundList?: ExomuxBackgroundList;
  /** Hosts the background-config modal's option controls as real Cyclers/CheckBoxes. */
  backgroundOptionControls?: ExomuxSettingsOptions;
  /** Hosts the background-config modal's Close button as a real Button. */
  backgroundButtons?: ExomuxSettingsWidgets;
  /** Hosts the per-window config modal's value rows as real Cyclers/CheckBoxes. */
  windowConfigOptionControls?: ExomuxSettingsOptions;
  /** Hosts the shader manager modal's rows as real Cyclers/CheckBoxes. */
  shaderManagerControls?: ExomuxSettingsOptions;
  /** Hosts the shader manager's add-a-shader path prompt as a real Input. */
  shaderPathField?: ExomuxInputField;
  /** Hosts the sessions panel's rows as a real composited List. */
  sessionList?: ExomuxSessionList;
  /** Hosts the network panel's hierarchy as a real composited Tree. */
  networkTreeView?: ExomuxNetworkTree;
  /** Selected action id of the kill confirmation's ModalController. */
  killModalSelection?: string;
  /** Selected action id of the end-session modal's ModalController. */
  quitModalSelection?: string;
  /** Hosts the start menu's rows as a real composited ContextMenu. */
  startMenuView?: ExomuxStartMenu;
  /** Keyboard selection inside the start menu. */
  startMenuSelection?: number;
  /** Sessions viewport top set by the wheel; -1 follows the selection. */
  sessionListScrollTop?: number;
  /** When the block cursor is enabled, the mouse cell to draw it at. */
  blockCursor?: { readonly column: number; readonly row: number; readonly glyph: string };
}

/** The desktop effect remains visible unless a terminal owns the maximized surface. */
export function exomuxMetaballBackgroundVisible(
  projection: WorkbenchWindowHostProjection,
  bounds: Rectangle = projection.bounds,
): boolean {
  if (exomuxSessionIdFromWindow(projection.core.maximizedWindowId) !== undefined) return false;
  const covers = [
    ...projection.windows.map((window) => window.rect),
    ...projection.separators.map((item) => item.rect),
  ];
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    for (let column = bounds.column; column < bounds.column + bounds.width; column += 1) {
      if (!covers.some((rect) => contains(rect, column, row))) return true;
    }
  }
  return false;
}

/**
 * Approximate ink coverage of a background glyph.
 *
 * A terminal cell holds one background colour, so showing the desktop through a
 * window means collapsing the background's glyph-plus-colour into a single
 * colour. The shade ramp the fields use is a coverage ramp already; everything
 * else — box drawing, letters, streaks — is treated as roughly half covered.
 */
const BACKDROP_COVERAGE: Readonly<Record<string, number>> = Object.freeze({
  " ": 0,
  "░": 0.25,
  "▒": 0.5,
  "▓": 0.75,
  "█": 1,
});
const DEFAULT_BACKDROP_COVERAGE = 0.55;

/** The single colour a background cell reads as beneath a transparent window. */
function exomuxBackdropColor(cell: ExomuxBackgroundCell | undefined, theme: ExomuxThemeSpec): ExomuxRgb {
  if (!cell) return theme.background;
  const coverage = BACKDROP_COVERAGE[cell.char] ?? DEFAULT_BACKDROP_COVERAGE;
  return mixExomuxRgb(theme.background, cell.foreground, coverage);
}

/** Reads the desktop background colour behind one absolute desktop cell. */
type ExomuxBackdrop = (column: number, row: number) => ExomuxRgb;

/**
 * The colour impression one painted cell leaves for whatever renders above it:
 * its background carrying the foreground by the glyph's ink coverage — the
 * same reduction the circuit backdrop uses, applied to windows as scene
 * content. A blank cell is pure ground; ink-free glyphs must not tint it.
 */
function exomuxDepositColor(glyph: string, foreground: ExomuxRgb, background: ExomuxRgb): ExomuxRgb {
  if (glyph === " " || glyph === "") return background;
  const coverage = BACKDROP_COVERAGE[glyph] ?? DEFAULT_BACKDROP_COVERAGE;
  return mixExomuxRgb(background, foreground, coverage);
}

/**
 * Per-frame record of the colour impression every painted window cell leaves,
 * so a translucent window higher in the stack blends against the real scene
 * beneath it — background field *and* windows — instead of the bare field.
 *
 * Two layers keep a window from blending against itself: deposits land in a
 * pending layer while the window paints, and `commitWindow()` publishes them
 * once it is done, so sampling during a window's own paint only ever sees the
 * scene *below* it. Buffers are generation-stamped and reused across frames.
 */
class ExomuxSceneGround {
  #originColumn = 0;
  #originRow = 0;
  #width = 0;
  #height = 0;
  #committed = new Uint32Array(0);
  #committedStamp = new Uint32Array(0);
  #pending = new Uint32Array(0);
  #pendingStamp = new Uint32Array(0);
  #pendingIndices: number[] = [];
  #generation = 0;
  /** Monotonic per-commit batch id, so each window's deposits enqueue afresh. */
  #batch = 0;

  /** Starts a frame: adopts the desktop bounds and invalidates old deposits. */
  reset(bounds: Rectangle): void {
    this.#originColumn = bounds.column;
    this.#originRow = bounds.row;
    this.#width = Math.max(0, bounds.width);
    this.#height = Math.max(0, bounds.height);
    const size = this.#width * this.#height;
    if (this.#committed.length < size) {
      this.#committed = new Uint32Array(size);
      this.#committedStamp = new Uint32Array(size);
      this.#pending = new Uint32Array(size);
      this.#pendingStamp = new Uint32Array(size);
    }
    this.#pendingIndices.length = 0;
    this.#generation += 1;
    this.#batch += 1;
  }

  #index(column: number, row: number): number {
    const localColumn = column - this.#originColumn;
    const localRow = row - this.#originRow;
    if (localColumn < 0 || localColumn >= this.#width || localRow < 0 || localRow >= this.#height) return -1;
    return localRow * this.#width + localColumn;
  }

  /** Records one painted cell's colour impression (pending until commit). */
  deposit(column: number, row: number, color: ExomuxRgb): void {
    const index = this.#index(column, row);
    if (index < 0) return;
    // The dedupe stamp is per commit batch, not per frame: a later window
    // repainting a cell an earlier one already covered must enqueue it again,
    // or its deposit would silently never publish.
    if (this.#pendingStamp[index] !== this.#batch) {
      this.#pendingStamp[index] = this.#batch;
      this.#pendingIndices.push(index);
    }
    this.#pending[index] = (color[0] << 16) | (color[1] << 8) | color[2];
  }

  /** Publishes the finished window's deposits to windows painted after it. */
  commitWindow(): void {
    const generation = this.#generation;
    for (const index of this.#pendingIndices) {
      this.#committed[index] = this.#pending[index]!;
      this.#committedStamp[index] = generation;
    }
    this.#pendingIndices.length = 0;
    this.#batch += 1;
  }

  /** The scene colour beneath a cell, when any window below has painted it. */
  sample(column: number, row: number): ExomuxRgb | undefined {
    const index = this.#index(column, row);
    if (index < 0 || this.#committedStamp[index] !== this.#generation) return undefined;
    const packed = this.#committed[index]!;
    return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
  }
}

/** Reused across frames; the desktop renders on one thread. */
const exomuxSceneGround = new ExomuxSceneGround();

/** Resolves a window cell's ground: its surface, or the desktop showing through. */
type ExomuxGround = (column: number, row: number) => ExomuxRgb;

/**
 * Ground for a control cell: blends the cell's own base colour against the
 * scene at the window's *control* opacity — half the window's transparency
 * (user rule, 032) — so what the user reads and clicks stays more legible
 * than the body it sits on.
 */
type ExomuxControlGround = (column: number, row: number, base: ExomuxRgb) => ExomuxRgb;

/** Control ground for one window, or undefined when controls render opaque. */
function exomuxControlGroundFor(
  backdrop: ExomuxBackdrop | undefined,
  windowOpacity: number,
): ExomuxControlGround | undefined {
  const controlOpacity = exomuxControlOpacity(windowOpacity);
  if (!backdrop || controlOpacity >= 1) return undefined;
  return (column, row, base) => mixExomuxRgb(backdrop(column, row), base, controlOpacity);
}

/**
 * Blits one composited control cell. With a control ground, the cell's own
 * background blends against the scene at control opacity; without one it
 * lands verbatim. Wide-glyph follower cells ("") are skipped — the glyph to
 * their left already covers them.
 */
function blitControlCell(
  painter: DesktopPainter,
  column: number,
  row: number,
  cell: string | Uint8Array | undefined,
  theme: ExomuxThemeSpec,
  controlGround?: ExomuxControlGround,
): void {
  if (cell === undefined) return;
  if (!controlGround) {
    painter.rawCell(column, row, cell);
    return;
  }
  const data = widgetSurfaceCellData(cell);
  if (!data) {
    painter.rawCell(column, row, cell);
    return;
  }
  if (data.glyph === "") return;
  const base = data.background ?? theme.surfaceStrong;
  painter.write(column, row, data.glyph, {
    foreground: data.foreground ?? theme.text,
    background: controlGround(column, row, base),
    bold: data.bold,
  });
}

/** Draws a box frame like `DesktopPainter.borderBox`, on a per-cell ground. */
function borderBoxOnGround(
  painter: DesktopPainter,
  rect: Rectangle,
  glyphs: ExomuxBorderGlyphs,
  foreground: ExomuxRgb,
  ground: ExomuxGround,
  bold: boolean,
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const right = rect.column + rect.width - 1;
  const bottom = rect.row + rect.height - 1;
  const cellOn = (column: number, row: number, glyph: string) => {
    painter.cell(column, row, glyph, { foreground, background: ground(column, row), bold });
  };
  for (let column = rect.column + 1; column < right; column += 1) {
    cellOn(column, rect.row, glyphs.top);
    cellOn(column, bottom, glyphs.bottom);
  }
  for (let row = rect.row + 1; row < bottom; row += 1) {
    cellOn(rect.column, row, glyphs.left);
    cellOn(right, row, glyphs.right);
  }
  cellOn(rect.column, rect.row, glyphs.topLeft);
  cellOn(right, rect.row, glyphs.topRight);
  cellOn(rect.column, bottom, glyphs.bottomLeft);
  cellOn(right, bottom, glyphs.bottomRight);
}

/**
 * Ground for a window body at a given opacity.
 *
 * The sessions and network panels used to fill their body with `theme.surface`
 * unconditionally, so they stayed opaque at every opacity setting while the
 * terminals around them went see-through.
 */
/** True when a window paints its own surface fully; only these block the field. */
function exomuxWindowIsOpaque(controller: ExomuxController, windowId: string): boolean {
  const global = controller.globalSettings.peek();
  const sessionId = exomuxSessionIdFromWindow(windowId);
  // Panels (sessions, network, settings) follow the desktop-wide opacity.
  const resolved = sessionId
    ? exomuxResolvedOpacity(global, controller.windowSettingsFor(sessionId))
    : exomuxResolvedOpacity(global);
  return resolved >= 1;
}

function exomuxWindowGround(theme: ExomuxThemeSpec, opacity: number, backdrop?: ExomuxBackdrop): ExomuxGround {
  if (!backdrop || opacity >= 1) return () => theme.surface;
  return (column, row) => mixExomuxRgb(backdrop(column, row), theme.surface, opacity);
}

/** Writes text cell by cell so each one keeps its own blended ground. */
function writeOnGround(
  painter: DesktopPainter,
  column: number,
  row: number,
  text: string,
  style: { foreground: ExomuxRgb; bold?: boolean },
  ground: ExomuxGround,
): void {
  const glyphs = [...text];
  for (let index = 0; index < glyphs.length; index += 1) {
    painter.write(column + index, row, glyphs[index]!, {
      foreground: style.foreground,
      background: ground(column + index, row),
      bold: style.bold,
    });
  }
}

/** Fills a rect cell by cell so each one can take its own blended ground. */
function fillWithGround(painter: DesktopPainter, rect: Rectangle, theme: ExomuxThemeSpec, ground: ExomuxGround): void {
  for (let row = 0; row < rect.height; row += 1) {
    for (let column = 0; column < rect.width; column += 1) {
      const x = rect.column + column;
      const y = rect.row + row;
      painter.write(x, y, " ", { foreground: theme.text, background: ground(x, y) });
    }
  }
}

/**
 * A background that can say which renderer and audio source it is using.
 *
 * Both are worth reporting: the software renderer resolves far fewer presets
 * than the GPU one, and a field listening to a silent monitor rather than a
 * microphone looks broken in exactly the same way as one that has frozen.
 */
interface ExomuxReportingBackground {
  readonly renderer?: "gpu" | "software" | "starting";
  readonly audioLabel?: string;
}

/** One short phrase naming the renderer and audio source, for the status line. */
function describeBackgroundSource(field: unknown): string {
  const reporting = field as ExomuxReportingBackground | undefined;
  const parts: string[] = [];
  if (reporting?.renderer === "software") parts.push("software renderer");
  else if (reporting?.renderer === "gpu") parts.push("gpu");
  if (reporting?.audioLabel) parts.push(reporting.audioLabel);
  return parts.length > 0 ? parts.join(" · ") : "background";
}

/** Paints one complete desktop into pre-styled terminal-cell strings. */
function renderExomuxDesktop(options: RenderExomuxDesktopOptions): string[][] {
  const { bounds, body, projection, controller } = options;
  const theme = controller.theme.peek();
  const painter = new DesktopPainter(bounds, theme);
  painter.fill(bounds, " ", { foreground: theme.text, background: theme.background });
  // Single top bar: start-menu button, then the window taskbar, then quit.
  painter.fill({ column: 0, row: 0, width: bounds.width, height: 1 }, " ", {
    foreground: theme.text,
    background: theme.surfaceStrong,
  });
  const prefixPending = controller.prefixPending.peek();
  const startLabel = prefixPending ? START_BUTTON_PREFIX_LABEL : START_BUTTON_IDLE_LABEL;
  painter.write(START_BUTTON.column, 0, fitText(startLabel, START_BUTTON.width), {
    foreground: theme.background,
    // The prefix cue lives on the start button now that the status bars are gone.
    background: prefixPending ? theme.warning : theme.accent,
    bold: true,
  });
  paintTerminalBar(
    painter,
    projectExomuxTerminalBar(controller, projection, options.shelf),
    theme,
  );
  const quitRect = menuQuitRect(bounds);
  painter.write(quitRect.column, 0, "[ ✕ ]", {
    foreground: theme.background,
    background: theme.danger,
    bold: true,
  });
  painter.fill(body, " ", { foreground: theme.text, background: theme.background });
  // One rasterization serves both the desktop backdrop and the overgrowth pass,
  // so reclaimed cells line up exactly with the background behind the window.
  const backgroundGrid = options.backgroundField?.rasterizeCells(body, theme);
  // The default background is the metaball field, which paints solid cells
  // rather than a glyph grid. Rasterize its levels once so a transparent window
  // shows the same glow it sits on instead of a flat theme background.
  const metaballLevels = backgroundGrid ? undefined : options.metaballs.rasterize(body, EXOMUX_METABALL_LEVELS);
  const metaballPalette = metaballLevels ? exomuxMetaballPalette(theme) : undefined;
  // Transparent windows read the same source the backdrop is painted from, so
  // what shows through a window is exactly what surrounds it. Windows painted
  // earlier deposit their own colour impressions into the scene ground, so a
  // translucent window shows the windows beneath it, not just the field (032).
  exomuxSceneGround.reset(bounds);
  const backdrop: ExomuxBackdrop = (column, row) => {
    const scene = exomuxSceneGround.sample(column, row);
    if (scene) return scene;
    if (backgroundGrid) {
      return exomuxBackdropColor(backgroundGrid[row - body.row]?.[column - body.column], theme);
    }
    if (metaballLevels && metaballPalette) {
      return exomuxMetaballBackdropColor(metaballLevels, metaballPalette, body, column, row, theme);
    }
    return theme.background;
  };
  if (exomuxMetaballBackgroundVisible(projection, body)) {
    if (backgroundGrid) paintBackgroundGrid(painter, body, backgroundGrid, theme);
    else if (metaballLevels && metaballPalette) {
      paintMetaballLevels(painter, body, metaballLevels, metaballPalette);
    }
  }

  // Deposits are on only while windows (and their separators) paint: overlays,
  // modals, and the cursor sit above every window and must not tint grounds.
  // Each window commits before the next paints, so a window never blends
  // against its own cells — only against the scene below it.
  const paintOneWindow = (window: WorkbenchWindowChromeProjection): void => {
    const flyIn = options.flyIn;
    // A restoring window is hidden while its ghost flies out of the
    // taskbar button; its first frame paints into a scratch grid so the
    // ghost has real cells to fly with.
    if (flyIn?.suppressed.has(window.id)) return;
    if (flyIn?.pending.has(window.id) && window.rect) {
      const scratch = new DesktopPainter(bounds, theme);
      paintWindow(
        scratch,
        window,
        controller,
        options.selectedSessionIndex,
        backdrop,
        options.settingsWidgets,
        options.settingsPickers,
        options.settingsOptions,
        options.sessionNameField,
        options.sessionList,
        options.sessionListScrollTop,
        options.networkTreeView,
      );
      flyIn.capture(window.id, scratch.rows, window.rect);
      if (flyIn.suppressed.has(window.id)) return;
    }
    paintWindow(
      painter,
      window,
      controller,
      options.selectedSessionIndex,
      backdrop,
      options.settingsWidgets,
      options.settingsPickers,
      options.settingsOptions,
      options.sessionNameField,
      options.sessionList,
      options.sessionListScrollTop,
      options.networkTreeView,
    );
    exomuxSceneGround.commitWindow();
  };
  painter.beginGroundDeposits(exomuxSceneGround, theme.surface);
  for (const window of projection.tiledWindows) {
    paintOneWindow(window);
  }
  const borderGlyphs = exomuxBorderGlyphs(controller.globalSettings.peek().borderStyle);
  for (const separator of projection.separators) {
    painter.fill(
      separator.rect,
      separator.direction === "row" ? borderGlyphs.verticalSeparator : borderGlyphs.horizontalSeparator,
      { foreground: theme.border, background: theme.background },
    );
  }
  exomuxSceneGround.commitWindow();
  for (const window of projection.floatingWindows) {
    paintOneWindow(window);
  }
  painter.endGroundDeposits();
  // Post-window overlay: effects that sit on top of window chrome (puddles,
  // drizzle, splashes) so they remain visible even in tiled layouts.
  if (options.backgroundField && exomuxBackgroundHasOverlay(options.backgroundField)) {
    for (const entry of options.backgroundField.rasterizeOverlayCells(body, theme)) {
      painter.write(body.column + entry.column, body.row + entry.row, entry.cell.char, {
        foreground: entry.cell.foreground,
        background: theme.background,
        ...(entry.cell.bold ? { bold: true } : {}),
      });
    }
  }
  if (backgroundGrid && options.overgrowth) {
    paintOvergrowth(painter, body, backgroundGrid, theme, projection, options.overgrowth);
  }
  if (projection.snapPreview) {
    painter.frame(projection.snapPreview.rect, ".", {
      foreground: theme.accent,
      background: theme.background,
      bold: true,
    });
  }
  if (projection.switcher) paintSwitcher(painter, projection, theme);
  if (controller.startMenuVisible.peek()) {
    paintStartMenu(painter, bounds, theme, controller, options.startMenuView, options.startMenuSelection ?? 0);
  }
  if (controller.helpVisible.peek()) paintHelp(painter, projection, theme);
  if (controller.quitModalVisible.peek()) paintQuitModal(painter, projection, theme, options.quitModalSelection);
  const scpRequest = controller.pendingScp.peek();
  if (scpRequest) {
    paintScpModal(painter, projection, theme, scpRequest, options.scpPasswordField);
  } else {
    // Modal closed: tear the composited Input down (the spec is unused here).
    options.scpPasswordField?.sync(false, "", {
      column: 0,
      row: 0,
      width: 1,
      foreground: theme.text,
      background: theme.background,
      cursorForeground: theme.text,
      cursorBackground: theme.background,
    });
  }
  const configSessionId = controller.configSessionId.peek();
  if (configSessionId) {
    paintWindowConfigModal(painter, projection, theme, controller, configSessionId, options.windowConfigOptionControls);
  }
  if (controller.backgroundConfigVisible.peek()) {
    paintBackgroundConfigModal(painter, projection, theme, controller, options.backgroundField, {
      list: options.backgroundList,
      options: options.backgroundOptionControls,
      buttons: options.backgroundButtons,
    });
  }
  if (controller.shaderManagerVisible.peek()) {
    paintShaderManagerModal(
      painter,
      projection,
      theme,
      controller,
      options.shaderManagerControls,
      options.shaderPathField,
    );
  }
  const pendingKillSessionId = controller.pendingKillSessionId.peek();
  if (pendingKillSessionId) {
    paintKillConfirmation(painter, projection, controller, pendingKillSessionId, options.killModalSelection);
  }

  // Transition ghosts composite above windows AND modal chrome: a menu's
  // open-reveal needs the freshly painted surface beneath it, and a closing
  // window's snapshot dissolves over whatever replaced it.
  for (const paint of options.animationOverlays ?? []) {
    paintAnimationOverlay(painter, paint, theme);
  }

  // The optional block cursor sits on top of everything, at the mouse cell —
  // a solid block, or a resize/move glyph when it is over a window's drag edge.
  if (options.blockCursor) {
    const { column, row, glyph } = options.blockCursor;
    if (
      column >= bounds.column && column < bounds.column + bounds.width && row >= bounds.row &&
      row < bounds.row + bounds.height
    ) {
      painter.cell(column, row, glyph, { foreground: theme.accent, background: theme.background });
    }
  }

  return painter.rows;
}

/**
 * Captures a desktop rect from the previous frame's styled cells: plain
 * glyph rows for the animation engine plus the styled originals so the
 * ghost keeps each cell's colors.
 */
function snapshotExomuxDesktopRect(
  rows: string[][],
  rect: Rectangle,
): { plain: string[]; styled: string[][] } | undefined {
  if (rows.length === 0) return undefined;
  const plain: string[] = [];
  const styled: string[][] = [];
  for (let row = 0; row < rect.height; row += 1) {
    const sourceRow = rows[rect.row + row];
    const styledRow: string[] = [];
    let line = "";
    for (let column = 0; column < rect.width; column += 1) {
      const cell = sourceRow?.[rect.column + column] ?? " ";
      styledRow.push(cell);
      const glyph = cell === " " ? " " : widgetSurfaceCellData(cell)?.glyph ?? " ";
      // Wide glyphs and followers animate as single-column blanks; the
      // engine's grid is strictly one glyph per column.
      line += exomuxGlyphColumns(glyph) === 1 ? glyph : " ";
    }
    plain.push(line);
    styled.push(styledRow);
  }
  return { plain, styled };
}

/** Paints one transition ghost, sampling colors from its styled snapshot. */
function paintAnimationOverlay(
  painter: DesktopPainter,
  paint: ExomuxAnimationOverlayPaint,
  theme: ExomuxThemeSpec,
): void {
  const { overlay, styled } = paint;
  const { rect, frame } = overlay;
  // Cells are snapshot-relative and may land anywhere on the desktop
  // (debris off the window edges); the painter clips at the screen.
  for (const cell of frame.cells) {
    const source = styled[cell.sourceRow]?.[cell.sourceColumn];
    const data = source && source !== " " ? widgetSurfaceCellData(source) : undefined;
    const background = data?.background ?? theme.background;
    let foreground = data?.foreground ?? theme.text;
    if (cell.heat !== undefined) {
      // Embers glow from deep red toward the warning tone as heat rises.
      foreground = mixExomuxRgb(theme.danger, theme.warning, cell.heat);
    }
    painter.cell(rect.column + cell.column, rect.row + cell.row, cell.char, { foreground, background });
  }
}

/** Travel room from a surface rect to just past every screen edge. */
function exomuxOverflowToScreen(rect: Rectangle, bounds: Rectangle): {
  left: number;
  right: number;
  up: number;
  down: number;
} {
  return {
    left: Math.max(0, rect.column - bounds.column) + 2,
    right: Math.max(0, bounds.column + bounds.width - (rect.column + rect.width)) + 2,
    up: Math.max(0, rect.row - bounds.row) + 2,
    down: Math.max(0, bounds.row + bounds.height - (rect.row + rect.height)) + 2,
  };
}

/** Paints the start-menu dropdown below the top-left button. */
function paintStartMenu(
  painter: DesktopPainter,
  bounds: Rectangle,
  theme: ExomuxThemeSpec,
  controller: ExomuxController,
  startMenuView?: ExomuxStartMenu,
  selectedIndex = 0,
): void {
  const entries = exomuxStartMenuItems(controller);
  const { panelRect, items } = exomuxStartMenuLayout(bounds, controller.startMenuAnchor.peek(), entries);
  painter.fill(panelRect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.borderBox(panelRect, exomuxBorderGlyphs("thin"), {
    foreground: theme.accent,
    background: theme.surfaceStrong,
    bold: true,
  });
  const inner: Rectangle = {
    column: panelRect.column + 1,
    row: panelRect.row + 1,
    width: Math.max(0, panelRect.width - 2),
    height: Math.max(0, panelRect.height - 2),
  };
  startMenuView?.sync({
    width: Math.max(1, inner.width),
    height: Math.max(1, inner.height),
    items: entries.map((item) => ({ id: item.id, label: item.label, danger: item.danger ?? false })),
    selectedIndex,
    foreground: theme.text,
    background: theme.surfaceStrong,
    dangerForeground: theme.danger,
    selectedForeground: theme.background,
    selectedBackground: theme.accent,
  });
  if (startMenuView?.ready()) {
    for (let row = 0; row < inner.height; row += 1) {
      for (let column = 0; column < inner.width; column += 1) {
        const cell = startMenuView.cellAt(row, column);
        if (cell !== undefined && cell !== "") painter.rawCell(inner.column + column, inner.row + row, cell);
      }
    }
    return;
  }
  // Hand-drawn fallback until the composited snapshot lands.
  for (const item of items) {
    if (item.rect.row >= panelRect.row + panelRect.height - 1) break;
    painter.write(item.rect.column, item.rect.row, fitText(item.label, item.rect.width), {
      foreground: item.danger ? theme.danger : theme.text,
      background: theme.surfaceStrong,
      bold: item.danger,
    });
  }
}

/** Per-window reclaim ratios handed to the overgrowth pass. */
export interface ExomuxOvergrowthPass {
  /** Window id → reclaim ratio in [0, 1]; absent or 0 leaves the window intact. */
  readonly ratios: ReadonlyMap<string, number>;
  /** Which window borders the frontier advances from; defaults to every edge. */
  readonly edges?: ExomuxOvergrowthEdges;
}

/**
 * Redraws background cells over windows that have lost focus. Only the client
 * area is reclaimed — chrome stays legible so an overgrown window can still be
 * found and clicked back to life.
 */
function paintOvergrowth(
  painter: DesktopPainter,
  bounds: Rectangle,
  grid: ReturnType<ExomuxAnimatedBackground["rasterizeCells"]>,
  theme: ExomuxThemeSpec,
  projection: WorkbenchWindowHostProjection,
  pass: ExomuxOvergrowthPass,
): void {
  // Same order the windows were painted in, so anything later in the list is
  // stacked above and must not be drawn over.
  const stack = [...projection.tiledWindows, ...projection.floatingWindows];
  for (let index = 0; index < stack.length; index += 1) {
    const window = stack[index]!;
    const ratio = pass.ratios.get(window.id) ?? 0;
    if (ratio <= 0) continue;
    const client = window.clientRect;
    const above = stack.slice(index + 1).map((other) => other.rect);
    for (let row = client.row; row < client.row + client.height; row += 1) {
      const gridRow = grid[row - bounds.row];
      if (!gridRow) continue;
      for (let column = client.column; column < client.column + client.width; column += 1) {
        const cell = gridRow[column - bounds.column];
        if (!cell) continue;
        // An idle window's overgrowth stops at whatever is stacked on top of it,
        // so reclaiming a window below never bleeds onto the focused one.
        if (!exomuxOvergrowthVisible(column, row, client, ratio, above, pass.edges)) continue;
        painter.write(column, row, cell.char, {
          foreground: cell.foreground,
          background: theme.background,
          ...(cell.bold ? { bold: true } : {}),
        });
      }
    }
  }
}

function paintBackgroundGrid(
  painter: DesktopPainter,
  bounds: Rectangle,
  grid: ReturnType<ExomuxAnimatedBackground["rasterizeCells"]>,
  theme: ExomuxThemeSpec,
): void {
  for (let row = 0; row < grid.length; row += 1) {
    const cells = grid[row]!;
    for (let column = 0; column < cells.length; column += 1) {
      const cell = cells[column];
      if (!cell) continue;
      painter.write(bounds.column + column, bounds.row + row, cell.char, {
        foreground: cell.foreground,
        background: theme.background,
        ...(cell.bold ? { bold: true } : {}),
      });
    }
  }
}

/** The colour the metaball field paints at one cell, or undefined for bare desktop. */
function exomuxMetaballCellColor(
  levels: Uint8Array | readonly number[],
  palette: readonly ExomuxRgb[],
  bounds: Rectangle,
  column: number,
  row: number,
): ExomuxRgb | undefined {
  const localColumn = column - bounds.column;
  const localRow = row - bounds.row;
  if (localColumn < 0 || localRow < 0 || localColumn >= bounds.width || localRow >= bounds.height) return undefined;
  const level = levels[localRow * bounds.width + localColumn] ?? 0;
  if (level === 0) return undefined;
  return palette[level];
}

/** Backdrop colour behind a transparent window over the metaball field. */
function exomuxMetaballBackdropColor(
  levels: Uint8Array | readonly number[],
  palette: readonly ExomuxRgb[],
  bounds: Rectangle,
  column: number,
  row: number,
  theme: ExomuxThemeSpec,
): ExomuxRgb {
  return exomuxMetaballCellColor(levels, palette, bounds, column, row) ?? theme.background;
}

function paintMetaballLevels(
  painter: DesktopPainter,
  bounds: Rectangle,
  levels: Uint8Array | readonly number[],
  palette: readonly ExomuxRgb[],
): void {
  for (let row = bounds.row; row < bounds.row + bounds.height; row += 1) {
    for (let column = bounds.column; column < bounds.column + bounds.width; column += 1) {
      const color = exomuxMetaballCellColor(levels, palette, bounds, column, row);
      if (color) painter.cell(column, row, " ", { foreground: color, background: color });
    }
  }
}

/** Relative luminance of a colour, for contrast comparisons. */
function exomuxLuminance(color: ExomuxRgb): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

/** HSV chroma (max−min): how vivid a colour is, 0 for any grey. */
function exomuxChroma(color: ExomuxRgb): number {
  return Math.max(color[0], color[1], color[2]) - Math.min(color[0], color[1], color[2]);
}

/** Hue angle in degrees, or undefined for a grey with no hue. */
function exomuxHue(color: ExomuxRgb): number | undefined {
  const [r, g, b] = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return undefined;
  let hue: number;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Shortest angular distance between two hues, 0–180. */
function exomuxHueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Squared RGB distance; the fallback when a theme has no vivid colours. */
function exomuxColorDistanceSq(a: ExomuxRgb, b: ExomuxRgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * The two most extreme theme colours — the vivid, high-contrast pair the
 * metaballs shade between, brighter one first. Anchored on the theme's most
 * saturated colour, then paired with the colour furthest from it in hue and
 * still vivid, so T2 resolves to hot pink and blue rather than two near-greys
 * a plain RGB-distance search would pick. Falls back to maximum RGB distance
 * for a theme with no real hue.
 */
export function exomuxMetaballGradientColors(theme: ExomuxThemeSpec): readonly [ExomuxRgb, ExomuxRgb] {
  const candidates: readonly ExomuxRgb[] = [
    theme.accent,
    theme.success,
    theme.warning,
    theme.danger,
    theme.text,
    theme.muted,
    theme.surfaceStrong,
    theme.border,
  ];
  // Anchor: the most vivid colour in the theme.
  let anchor = candidates[0]!;
  for (const color of candidates) {
    if (exomuxChroma(color) > exomuxChroma(anchor)) anchor = color;
  }
  const anchorHue = exomuxHue(anchor);
  if (anchorHue === undefined) {
    // A greyscale theme: fall back to the widest plain RGB gap.
    let best: [ExomuxRgb, ExomuxRgb] = [theme.text, theme.surfaceStrong];
    let bestDistance = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const distance = exomuxColorDistanceSq(candidates[i]!, candidates[j]!);
        if (distance > bestDistance) {
          bestDistance = distance;
          best = [candidates[i]!, candidates[j]!];
        }
      }
    }
    return exomuxLuminance(best[0]) >= exomuxLuminance(best[1]) ? best : [best[1], best[0]];
  }
  // Partner: furthest from the anchor in hue, weighted by its own vividness.
  let partner = anchor;
  let bestScore = -1;
  for (const color of candidates) {
    const hue = exomuxHue(color);
    if (hue === undefined) continue;
    const score = (exomuxHueDistance(anchorHue, hue) / 180) * exomuxChroma(color);
    if (score > bestScore) {
      bestScore = score;
      partner = color;
    }
  }
  // A theme with one lonely hue keeps a real gradient by using its ground.
  if (partner === anchor) partner = theme.surfaceStrong;
  return exomuxLuminance(anchor) >= exomuxLuminance(partner) ? [anchor, partner] : [partner, anchor];
}

function exomuxMetaballPalette(theme: ExomuxThemeSpec): readonly ExomuxRgb[] {
  const [center, edge] = exomuxMetaballGradientColors(theme);
  const top = EXOMUX_METABALL_LEVELS - 1;
  return Array.from({ length: EXOMUX_METABALL_LEVELS }, (_, level) => {
    if (level === 0) return theme.background;
    // Level 1 is the blob edge, the top level its centre: a smooth gradient
    // between two high-contrast theme colours, with no scanline banding.
    const progress = top <= 1 ? 1 : (level - 1) / (top - 1);
    return mixExomuxRgb(edge, center, progress);
  });
}

function mixExomuxRgb(from: ExomuxRgb, to: ExomuxRgb, amount: number): ExomuxRgb {
  const progress = Math.max(0, Math.min(1, amount));
  return [
    Math.round(from[0] + (to[0] - from[0]) * progress),
    Math.round(from[1] + (to[1] - from[1]) * progress),
    Math.round(from[2] + (to[2] - from[2]) * progress),
  ];
}

function paintWindow(
  painter: DesktopPainter,
  window: WorkbenchWindowChromeProjection,
  controller: ExomuxController,
  selectedSessionIndex: number,
  backdrop?: ExomuxBackdrop,
  settingsWidgets?: ExomuxSettingsWidgets,
  settingsPickers?: ExomuxSettingsSurface,
  settingsOptions?: ExomuxSettingsOptions,
  sessionNameField?: ExomuxInputField,
  sessionList?: ExomuxSessionList,
  sessionListScrollTop = -1,
  networkTreeView?: ExomuxNetworkTree,
): void {
  const theme = controller.theme.peek();
  const global = controller.globalSettings.peek();
  const sessionId = exomuxSessionIdFromWindow(window.id);
  // Panels carry no per-window override, so they follow the desktop setting;
  // terminals resolve their own.
  const windowOpacity = sessionId
    ? exomuxResolvedOpacity(global, controller.windowSettingsFor(sessionId))
    : exomuxResolvedOpacity(global);
  // Chrome is a control surface: it blends at half the window's transparency
  // (032), so the border, title, and buttons stay more legible than the body.
  const chromeOpacity = exomuxControlOpacity(windowOpacity);
  const chromeGround = (base: ExomuxRgb): ExomuxGround =>
    backdrop && chromeOpacity < 1 ? (x, y) => mixExomuxRgb(backdrop(x, y), base, chromeOpacity) : () => base;
  const border = window.active ? theme.accent : theme.border;
  painter.fill(window.rect, " ", { foreground: theme.text, background: theme.surface });
  // Focus reads through colour and weight, so both states share one frame
  // vocabulary rather than swapping the glyphs out underneath the window.
  borderBoxOnGround(
    painter,
    window.rect,
    exomuxBorderGlyphs(global.borderStyle),
    border,
    chromeGround(theme.surfaceStrong),
    window.active,
  );
  const titleBarGround = chromeGround(window.active ? theme.accent : theme.surfaceStrong);
  fillWithGround(painter, window.titleBarRect, theme, titleBarGround);
  const firstControl = window.controls.reduce(
    (minimum, control) => Math.min(minimum, control.rect.column),
    window.titleBarRect.column + window.titleBarRect.width,
  );
  const titleWidth = Math.max(0, firstControl - window.titleBarRect.column - 2);
  const runtime = sessionId ? controller.runtime(sessionId) : undefined;
  // Status tags ([SCROLL], [NO MOUSE]) arrive on the projection first-class.
  const adornments = window.titleAdornments.map((tag) => ` ${tag}`).join("");
  writeOnGround(
    painter,
    window.titleBarRect.column + 1,
    window.titleBarRect.row,
    fitText(
      `${window.placement === "floating" ? "~" : "="} ${runtime?.summary.peek().title ?? window.title}${adornments}`,
      titleWidth,
    ),
    {
      // Active bars sit on the accent colour, so their text contrasts it
      // (black on bright accents, white on the light themes' dark accents);
      // inactive bars keep the main theme foreground (supersedes UX-004).
      foreground: window.active ? exomuxActiveTitlebarForeground(theme) : theme.text,
      bold: window.active,
    },
    titleBarGround,
  );
  for (const control of window.controls) {
    writeOnGround(painter, control.rect.column, control.rect.row, fitText(control.text, control.rect.width), {
      foreground: window.active ? exomuxActiveTitlebarForeground(theme) : theme.text,
      bold: control.tone === "danger" || window.active,
    }, titleBarGround);
  }
  const ground = exomuxWindowGround(theme, windowOpacity, backdrop);
  if (windowOpacity < 1 && backdrop) fillWithGround(painter, window.clientRect, theme, ground);
  else painter.fill(window.clientRect, " ", { foreground: theme.text, background: theme.surface });
  if (window.id === EXOMUX_SESSIONS_WINDOW_ID) {
    paintSessionManager(
      painter,
      window.clientRect,
      controller,
      selectedSessionIndex,
      window.active,
      ground,
      sessionList,
      sessionListScrollTop,
    );
    return;
  }
  if (window.id === EXOMUX_NETWORK_WINDOW_ID) {
    paintNetworkPanel(painter, window.clientRect, controller, window.active, ground, networkTreeView);
    return;
  }
  if (window.id === EXOMUX_SETTINGS_WINDOW_ID) {
    paintGlobalSettingsWindow(
      painter,
      window.clientRect,
      controller,
      settingsWidgets,
      settingsPickers,
      settingsOptions,
      sessionNameField,
      backdrop,
      windowOpacity,
    );
    return;
  }
  if (runtime && sessionId) {
    const settings = controller.windowSettingsFor(sessionId);
    paintTerminal(
      painter,
      window.clientRect,
      runtime,
      theme,
      window.active,
      settings,
      exomuxResolvedOpacity(controller.globalSettings.peek(), settings),
      backdrop,
    );
  }
}

function paintNetworkPanel(
  painter: DesktopPainter,
  rect: Rectangle,
  controller: ExomuxController,
  active: boolean,
  ground: ExomuxGround = () => controller.theme.peek().surface,
  networkTreeView?: ExomuxNetworkTree,
): void {
  const theme = controller.theme.peek();
  writeOnGround(
    painter,
    rect.column + 1,
    rect.row,
    fitText("Enter open · ←/→ fold · Del forget · r refresh", Math.max(0, rect.width - 2)),
    { foreground: theme.muted },
    ground,
  );
  const tree = controller.networkTree;
  const height = Math.max(0, rect.height - NETWORK_LIST_START);
  networkTreeView?.sync({
    width: Math.max(1, rect.width),
    height: Math.max(1, height),
    nodes: tree.nodes.peek(),
    selectedIndex: tree.selectedIndex.peek(),
    active,
    foreground: theme.text,
    mutedForeground: theme.muted,
    headingForeground: theme.accent,
    background: theme.surface,
    selectedForeground: theme.background,
    selectedBackground: theme.accent,
    scrollbarTrack: theme.surfaceStrong,
    scrollbarThumb: theme.muted,
  });
  if (networkTreeView?.ready()) {
    // Blit the real Tree's cells, re-grounding cells that kept the base
    // surface background so a translucent panel shows the desktop through its
    // rows; deliberate colour (the accent selection, the scrollbar) stays.
    for (let visibleIndex = 0; visibleIndex < height; visibleIndex += 1) {
      const row = rect.row + NETWORK_LIST_START + visibleIndex;
      for (let column = 0; column < rect.width; column += 1) {
        const x = rect.column + column;
        const cell = widgetSurfaceCellData(networkTreeView.cellAt(visibleIndex, column));
        if (!cell || cell.glyph === "") {
          painter.write(x, row, " ", { foreground: theme.text, background: ground(x, row) });
          continue;
        }
        const keepBackground = cell.background !== undefined &&
          !exomuxRgbEquals(cell.background, theme.surface);
        painter.write(x, row, cell.glyph, {
          foreground: cell.foreground ?? theme.text,
          background: keepBackground ? cell.background! : ground(x, row),
          bold: cell.bold,
        });
        column += Math.max(0, exomuxGlyphColumns(cell.glyph) - 1);
      }
    }
    return;
  }
  // Hand-drawn fallback until the composited snapshot lands.
  const visible = tree.visible(height);
  const selected = tree.selected();
  for (let visibleIndex = 0; visibleIndex < visible.length; visibleIndex += 1) {
    const row = visible[visibleIndex]!;
    const paintRow = rect.row + NETWORK_LIST_START + visibleIndex;
    const width = Math.max(0, rect.width - 2);
    const isSelected = active && selected?.index === row.index;
    const note = row.node.note === true;
    const heading = row.depth === 0;
    const offline = row.node.status === "offline";
    const foreground = isSelected
      ? theme.background
      : heading
      ? theme.accent
      : note || offline
      ? theme.muted
      : theme.text;
    if (isSelected) {
      painter.fill({ column: rect.column, row: paintRow, width: rect.width, height: 1 }, " ", {
        foreground,
        background: theme.accent,
        bold: true,
      });
    }
    painter.write(rect.column + 1, paintRow, fitText(row.text, width), {
      foreground,
      background: isSelected ? theme.accent : theme.surface,
      bold: isSelected || heading,
    });
  }
}

function paintSessionManager(
  painter: DesktopPainter,
  rect: Rectangle,
  controller: ExomuxController,
  selectedSessionIndex: number,
  active: boolean,
  ground: ExomuxGround = () => controller.theme.peek().surface,
  sessionList?: ExomuxSessionList,
  sessionListScrollTop = -1,
): void {
  const theme = controller.theme.peek();
  // Both header lines clamp to the window so a narrow session panel never spills
  // text past its border.
  const headerWidth = Math.max(0, rect.width - 2);
  writeOnGround(painter, rect.column + 1, rect.row, fitText("Detached host sessions", headerWidth), {
    foreground: theme.accent,
    bold: true,
  }, ground);
  writeOnGround(painter, rect.column + 1, rect.row + 1, fitText("Enter attach | Del kill", headerWidth), {
    foreground: theme.muted,
  }, ground);
  const managerRows = exomuxManagerRows(controller);
  if (managerRows.length === 0) {
    writeOnGround(
      painter,
      rect.column + 1,
      rect.row + SESSION_LIST_START,
      fitText("No terminals. Ctrl-N c creates one.", headerWidth),
      { foreground: theme.muted },
      ground,
    );
    return;
  }
  const selected = clampIndex(selectedSessionIndex, Math.max(1, controller.sessions.peek().length));
  const available = Math.max(0, rect.height - SESSION_LIST_START);
  // Headings and the current session's row recede like stopped terminals; an
  // attachable host session reads as live.
  const rows: ExomuxSessionListRow[] = managerRows.map((row) => ({
    label: row.label,
    running: row.kind === "terminal"
      ? row.running
      : row.kind === "host-session"
      ? row.attachable && !row.current
      : false,
  }));
  sessionList?.sync({
    width: Math.max(1, rect.width),
    height: Math.max(1, available),
    rows,
    selectedIndex: selected,
    scrollTop: sessionListScrollTop,
    active,
    foreground: theme.text,
    mutedForeground: theme.muted,
    background: theme.surface,
    selectedForeground: theme.background,
    selectedBackground: theme.accent,
    scrollbarTrack: theme.surfaceStrong,
    scrollbarThumb: theme.muted,
  });
  if (sessionList?.ready()) {
    // Blit the real List's cells, re-grounding each cell that kept the base
    // surface background so a translucent panel shows the desktop through its
    // rows — the same only-default-backgrounds-see-through rule the terminal
    // uses. Deliberate colour (the accent selection block, the scrollbar) stays.
    for (let visibleIndex = 0; visibleIndex < available; visibleIndex += 1) {
      const row = rect.row + SESSION_LIST_START + visibleIndex;
      for (let column = 0; column < rect.width; column += 1) {
        const x = rect.column + column;
        const cell = widgetSurfaceCellData(sessionList.cellAt(visibleIndex, column));
        if (!cell || cell.glyph === "") {
          painter.write(x, row, " ", { foreground: theme.text, background: ground(x, row) });
          continue;
        }
        const keepBackground = cell.background !== undefined &&
          !exomuxRgbEquals(cell.background, theme.surface);
        painter.write(x, row, cell.glyph, {
          foreground: cell.foreground ?? theme.text,
          background: keepBackground ? cell.background! : ground(x, row),
          bold: cell.bold,
        });
        column += Math.max(0, exomuxGlyphColumns(cell.glyph) - 1);
      }
    }
    return;
  }
  // Hand-drawn fallback until the composited snapshot lands, on the same
  // window math as the List so the swap never shifts a row.
  const offset = exomuxSessionListWindowStart(rows.length, selected, available, sessionListScrollTop);
  for (let visibleIndex = 0; visibleIndex < available; visibleIndex += 1) {
    const index = offset + visibleIndex;
    const entry = rows[index];
    if (!entry) break;
    const isSelected = active && index === selected && managerRows[index]?.kind === "terminal";
    const row = rect.row + SESSION_LIST_START + visibleIndex;
    const rowRect = { column: rect.column, row, width: rect.width, height: 1 };
    const foreground = isSelected ? theme.background : entry.running ? theme.text : theme.muted;
    const label = fitText(
      `${isSelected ? ">" : " "} ${entry.label}`,
      Math.max(0, rect.width - 2),
    );
    // The selected row is a deliberate block of colour and stays opaque; the
    // rest take the window ground, so the desktop shows through them.
    if (isSelected) {
      painter.fill(rowRect, " ", { foreground, background: theme.accent, bold: true });
      painter.write(rect.column + 1, row, label, { foreground, background: theme.accent, bold: true });
    } else {
      fillWithGround(painter, rowRect, theme, ground);
      writeOnGround(painter, rect.column + 1, row, label, { foreground }, ground);
    }
  }
}

/** True when two theme colours are the same RGB triple. */
function exomuxRgbEquals(a: ExomuxRgb, b: ExomuxRgb): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Unthemed terminal defaults used when a window opts out of theme recoloring. */
const RAW_TERMINAL_BACKGROUND: ExomuxRgb = [0, 0, 0];
const RAW_TERMINAL_FOREGROUND: ExomuxRgb = [229, 229, 229];

function paintTerminal(
  painter: DesktopPainter,
  rect: Rectangle,
  runtime: ExomuxTerminalRuntime,
  theme: ExomuxThemeSpec,
  active: boolean,
  settings: ExomuxWindowSettings,
  opacity = 1,
  backdrop?: ExomuxBackdrop,
): void {
  const inspection = runtime.screen.inspect();
  const scrollback = runtime.scrollback.inspectViewport();
  const rows = scrollback.mode === "copy"
    ? runtime.screen.cellRowsRange(scrollback.offset, scrollback.viewportRows)
    : runtime.screen.cellRows();
  const cursorActive = scrollback.mode === "live" && active && runtime.attached.peek() &&
    runtime.summary.peek().running && inspection.cursorVisible;
  // Theme-off keeps the child's true ANSI colors over a plain terminal ground;
  // theme-on maps unset colors onto the theme and lifts ANSI text to contrast.
  // Palette resolution, contrast lift, translucent grounds, cursor inversion,
  // and dim fading all live in the shared exotui resolver (WS-002).
  const themed = settings.themed;
  const cellOptions: TerminalCellStyleOptions = {
    defaultBackground: themed ? theme.surface : RAW_TERMINAL_BACKGROUND,
    defaultForeground: themed ? theme.text : RAW_TERMINAL_FOREGROUND,
    contrastLift: themed,
    dimToward: settings.dimInactive && !active ? theme.surface : undefined,
    ground: backdrop,
    opacity,
    cursorForeground: theme.background,
    cursorBackground: theme.accent,
  };
  for (let row = 0; row < rect.height; row += 1) {
    const cells = rows[row] ?? [];
    for (let column = 0; column < rect.width; column += 1) {
      const cell = cells[column] ?? { char: " " };
      // The screen model marks the column a double-width glyph also occupies.
      // Skipping it here — rather than re-deriving the pairing by measuring the
      // glyph — is what keeps the render in step with the model when something
      // has overwritten or shifted one half of a pair.
      if (cell.continuation) continue;
      const cursor = cursorActive && inspection.cursor.row === row && inspection.cursor.column === column;
      const resolved = resolveTerminalCellStyle(
        cell,
        rect.column + column,
        rect.row + row,
        cursor,
        cellOptions,
      );
      // A double-width glyph on the last content column would put its follower
      // on the window border, so it degrades to a blank inside the client area.
      const glyph = exomuxGlyphColumns(resolved.glyph) === 2 && column + 1 >= rect.width ? " " : resolved.glyph;
      painter.cell(rect.column + column, rect.row + row, glyph, {
        foreground: resolved.foreground,
        background: resolved.background,
        bold: resolved.bold,
      });
    }
  }
  const warning = runtime.warning.peek();
  if (warning && rect.height > 0) {
    painter.write(rect.column, rect.row + rect.height - 1, fitText(`! ${warning}`, rect.width), {
      foreground: theme.warning,
      background: theme.surfaceStrong,
      bold: true,
    });
  }
}

function paintTerminalBar(
  painter: DesktopPainter,
  projection: ExomuxTerminalBarProjection,
  theme: ExomuxThemeSpec,
): void {
  painter.fill(projection.bounds, " ", {
    foreground: theme.text,
    background: theme.surfaceStrong,
  });
  for (const command of projection.commands) {
    const active = command.state === "active";
    painter.fill(command.rect, " ", {
      foreground: active ? theme.background : theme.text,
      background: active ? theme.accent : theme.surfaceStrong,
      bold: active,
    });
    painter.write(command.rect.column, command.rect.row, command.text, {
      foreground: active ? theme.background : theme.text,
      background: active ? theme.accent : theme.surfaceStrong,
      bold: active,
    });
  }
}

function paintSwitcher(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
): void {
  const switcher = projection.switcher!;
  const width = fitModalSpan(projection.bounds.width, 20, 48, 8);
  const height = Math.min(
    switcher.items.length + 2,
    fitModalSpan(projection.bounds.height, 3, projection.bounds.height, 4),
  );
  const rect = {
    column: projection.bounds.column + Math.max(0, Math.floor((projection.bounds.width - width) / 2)),
    row: projection.bounds.row + Math.max(0, Math.floor((projection.bounds.height - height) / 2)),
    width,
    height,
  };
  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "#", { foreground: theme.accent, background: theme.surfaceStrong, bold: true });
  for (let index = 0; index < Math.min(switcher.items.length, Math.max(0, height - 2)); index += 1) {
    const item = switcher.items[index]!;
    painter.write(
      rect.column + 1,
      rect.row + 1 + index,
      fitText(`${item.selected ? ">" : " "} ${item.title}`, width - 2),
      {
        foreground: item.selected ? theme.background : theme.text,
        background: item.selected ? theme.accent : theme.surfaceStrong,
        bold: item.selected,
      },
    );
  }
}

function paintHelp(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
): void {
  const lines = [
    "EXOMUX KEY REFERENCE",
    'Ctrl-N c        new floating term  Ctrl-N % / "   split right / below',
    "Ctrl-N f/Space  float or tile      Ctrl-N z         maximize / restore",
    "Ctrl-N arrows   snap to edge       Ctrl-N m         minimize to shelf",
    "Ctrl-N n / p    next / previous    Ctrl-N w         window switcher",
    "Ctrl-N s        session manager    Ctrl-N r         refresh and recover",
    "Ctrl-N t        cycle theme        Ctrl-N Ctrl-N    send literal prefix",
    "Ctrl-N b        cycle background   Ctrl-N [ / ]     previous / next preset",
    "Click desktop   skip preset        Ctrl-N l         force full redraw",
    "Ctrl-N d / x    detach window      Ctrl-N &         request terminal kill",
    "Wheel terminals or swipe vertically for styled history; [SCROLL] marks copy mode.",
    "Title-bar X / Meta-C kills that terminal; Ctrl-N d/x and quitting only detach.",
    "Ctrl-N & asks before killing. Drag title bars; drag borders to resize.",
    "Top bar: start menu at the left, open terminals beside it, quit at the right.",
    "F1 opens/closes help. Escape, q, or ? close it; mouse and touch use Close.",
  ];
  const { rect, closeRect } = exomuxHelpLayout(projection.bounds);
  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "#", { foreground: theme.accent, background: theme.surfaceStrong, bold: true });
  for (let index = 0; index < Math.min(lines.length, Math.max(0, rect.height - 3)); index += 1) {
    painter.write(rect.column + 1, rect.row + 1 + index, fitText(lines[index]!, rect.width - 2), {
      foreground: index === 0 ? theme.accent : theme.text,
      background: theme.surfaceStrong,
      bold: index === 0,
    });
  }
  painter.write(closeRect.column, closeRect.row, "[ Close ]", {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });
}

/** Marks the modal button the keyboard selection rests on. */
function paintModalSelectionMarker(
  painter: DesktopPainter,
  rect: Rectangle,
  theme: ExomuxThemeSpec,
  selected: boolean,
): void {
  if (!selected) return;
  painter.write(rect.column - 2, rect.row, ">", {
    foreground: theme.accent,
    background: theme.surfaceStrong,
    bold: true,
  });
}

function paintKillConfirmation(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  controller: ExomuxController,
  sessionId: string,
  selectedActionId?: string,
): void {
  const theme = controller.theme.peek();
  const title = controller.runtime(sessionId)?.summary.peek().title ?? sessionId;
  const { rect, cancelRect, confirmRect } = exomuxKillLayout(projection.bounds);
  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "!", { foreground: theme.danger, background: theme.surfaceStrong, bold: true });
  painter.write(rect.column + 2, rect.row + 1, fitText("TERMINATE HOST SESSION?", rect.width - 4), {
    foreground: theme.danger,
    background: theme.surfaceStrong,
    bold: true,
  });
  painter.write(
    rect.column + 2,
    rect.row + Math.min(3, Math.max(1, rect.height - 2)),
    fitText(`${title} (${sessionId})`, rect.width - 4),
    {
      foreground: theme.text,
      background: theme.surfaceStrong,
    },
  );
  painter.write(cancelRect.column, cancelRect.row, "[ Cancel ]", {
    foreground: theme.text,
    background: theme.surface,
    bold: true,
  });
  painter.write(confirmRect.column, confirmRect.row, "[ Kill ]", {
    foreground: theme.background,
    background: theme.danger,
    bold: true,
  });
  paintModalSelectionMarker(painter, cancelRect, theme, selectedActionId === "cancel");
  paintModalSelectionMarker(painter, confirmRect, theme, selectedActionId === "kill");
}

function paintQuitModal(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
  selectedActionId?: string,
): void {
  const { rect, cancelRect, detachRect, terminateRect } = exomuxQuitLayout(projection.bounds);
  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "!", { foreground: theme.warning, background: theme.surfaceStrong, bold: true });
  painter.write(rect.column + 2, rect.row + 1, fitText("END EXOMUX SESSION?", rect.width - 4), {
    foreground: theme.warning,
    background: theme.surfaceStrong,
    bold: true,
  });
  painter.write(
    rect.column + 2,
    rect.row + Math.min(3, Math.max(1, rect.height - 2)),
    fitText("Detach keeps terminals running · Terminate kills the host and every terminal", rect.width - 4),
    {
      foreground: theme.text,
      background: theme.surfaceStrong,
    },
  );
  painter.write(cancelRect.column, cancelRect.row, "[ Cancel ]", {
    foreground: theme.text,
    background: theme.surface,
    bold: true,
  });
  painter.write(detachRect.column, detachRect.row, "[ Detach ]", {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });
  painter.write(terminateRect.column, terminateRect.row, "[ Terminate ]", {
    foreground: theme.background,
    background: theme.danger,
    bold: true,
  });
  paintModalSelectionMarker(painter, cancelRect, theme, selectedActionId === "cancel");
  paintModalSelectionMarker(painter, detachRect, theme, selectedActionId === "detach");
  paintModalSelectionMarker(painter, terminateRect, theme, selectedActionId === "terminate");
}

interface ExomuxHelpLayout {
  readonly rect: Rectangle;
  readonly closeRect: Rectangle;
}

function exomuxHelpLayout(bounds: Rectangle): ExomuxHelpLayout {
  const width = fitModalSpan(bounds.width, 24, 84, 4);
  const height = fitModalSpan(bounds.height, 3, 15, 2);
  const rect = centeredRect(bounds, width, height);
  return { rect, closeRect: rightAlignedButton(rect, 9) };
}

/** A button pinned to a modal's bottom-right, clamped to stay inside the box. */
function rightAlignedButton(rect: Rectangle, width: number): Rectangle {
  const fitted = Math.max(1, Math.min(width, rect.width - 2));
  return {
    column: Math.max(rect.column + 1, rect.column + rect.width - 1 - fitted),
    row: rect.row + Math.max(1, rect.height - 2),
    width: fitted,
    height: 1,
  };
}

interface ExomuxKillLayout {
  readonly rect: Rectangle;
  readonly cancelRect: Rectangle;
  readonly confirmRect: Rectangle;
}

function exomuxKillLayout(bounds: Rectangle): ExomuxKillLayout {
  const width = fitModalSpan(bounds.width, 24, 62, 6);
  const rect = centeredRect(bounds, width, fitModalSpan(bounds.height, 3, 8, 2));
  const [cancelRect, confirmRect] = modalButtonRects(rect, [10, 8]);
  return { rect, cancelRect: cancelRect!, confirmRect: confirmRect! };
}

export interface ExomuxQuitLayout {
  readonly rect: Rectangle;
  readonly cancelRect: Rectangle;
  readonly detachRect: Rectangle;
  readonly terminateRect: Rectangle;
}

/** Layout for the end-session modal; exported for deterministic pointer tests. */
export function exomuxQuitLayout(bounds: Rectangle): ExomuxQuitLayout {
  const width = fitModalSpan(bounds.width, 40, 82, 6);
  // Enough rows to stack the three buttons if the box has to go narrow.
  const rect = centeredRect(bounds, width, fitModalSpan(bounds.height, 5, 8, 2));
  const [cancelRect, detachRect, terminateRect] = modalButtonRects(rect, [10, 10, 13]);
  return { rect, cancelRect: cancelRect!, detachRect: detachRect!, terminateRect: terminateRect! };
}

/** Layout for the global config modal; exported for deterministic pointer tests. */
export interface ExomuxGlobalConfigLayout {
  readonly rect: Rectangle;
  /** Visible theme rows, paired with the theme index each row shows. */
  readonly themeRows: readonly { readonly rect: Rectangle; readonly index: number }[];
  /** Visible background rows, paired with the background index each row shows. */
  readonly backgroundRows: readonly { readonly rect: Rectangle; readonly index: number }[];
  /** The whole theme-picker region (the composited theme List occupies this). */
  readonly themeListRect: Rectangle;
  /** The whole background-picker region (the composited background List occupies this). */
  readonly backgroundListRect: Rectangle;
  /** One hit row per entry in EXOMUX_GLOBAL_SETTING_SPECS, in declaration order. */
  readonly optionRows: readonly Rectangle[];
  readonly closeRect: Rectangle;
  /** Opens the background config modal for the selected background. */
  readonly backgroundConfigRect: Rectangle;
  /** Opens the Ghostty shader manager (UX-009); only painted/hit under Ghostty. */
  readonly shadersRect: Rectangle;
  /** The editable session-name field at the top of the window. */
  readonly sessionNameRect: Rectangle;
  /** "Theme" column header. */
  readonly themeHeaderRect: Rectangle;
  /** "Background" column header. */
  readonly backgroundHeaderRect: Rectangle;
  /** True when the window is too narrow for side-by-side pickers (UX-002). */
  readonly stacked: boolean;
}

/** Below this window width the settings pickers stack vertically (UX-002). */
export const EXOMUX_STACKED_SETTINGS_WIDTH = 52;

/** Scrolls a select list so the selected row stays visible. */
function selectListStart(selected: number, total: number, visible: number): number {
  if (total <= visible) return 0;
  return clampNumber(selected - Math.floor(visible / 2), 0, total - visible);
}

function clampNumber(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Cycle direction for a click on a `< value >` option row. The control is
 * right-aligned in the row; a click on its left half (the `<`) steps the value
 * back, the right half (the `>`) forward — matching the `Cycler` widget, so the
 * arrows are not just decoration. Booleans render a checkbox and toggle either
 * way, so the direction is harmless there.
 */
export function exomuxOptionCycleDirection(rowRect: Rectangle, column: number): -1 | 1 {
  const controlWidth = Math.min(16, Math.max(6, rowRect.width - 4));
  const controlColumn = rowRect.column + Math.max(0, rowRect.width - controlWidth);
  return column < controlColumn + Math.max(1, Math.floor(controlWidth / 2)) ? -1 : 1;
}

/** Layout for the global config modal; exported for deterministic pointer tests. */
/**
 * Lays the settings content out inside the settings window's client area. The
 * window host owns position and size — this only apportions whatever rect the
 * user has dragged the window to.
 */
export function exomuxGlobalConfigLayout(
  rect: Rectangle,
  themeIndex: number,
  backgroundIndex: number,
  extraOptionCount = 0,
): ExomuxGlobalConfigLayout {
  const optionCount = EXOMUX_GLOBAL_SETTING_SPECS.length + Math.max(0, extraOptionCount);
  // Session name + headers + lists + options + button row.
  const sessionNameRect: Rectangle = {
    column: rect.column + 1,
    row: rect.row,
    width: Math.max(0, rect.width - 2),
    height: 1,
  };
  if (rect.width < EXOMUX_STACKED_SETTINGS_WIDTH) {
    return stackedGlobalConfigLayout(rect, themeIndex, backgroundIndex, optionCount, sessionNameRect);
  }
  const listTop = rect.row + 2;
  const visibleRows = Math.max(1, rect.height - optionCount - 4);
  const columnWidth = Math.max(8, Math.floor((rect.width - 3) / 2));
  const themeStart = selectListStart(themeIndex, EXOMUX_THEMES.length, visibleRows);
  const backgroundStart = selectListStart(backgroundIndex, EXOMUX_BACKGROUND_IDS.length, visibleRows);
  const themeRows: { rect: Rectangle; index: number }[] = [];
  const backgroundRows: { rect: Rectangle; index: number }[] = [];
  for (let offset = 0; offset < visibleRows; offset += 1) {
    const row = listTop + offset;
    if (themeStart + offset < EXOMUX_THEMES.length) {
      themeRows.push({
        rect: { column: rect.column + 1, row, width: columnWidth, height: 1 },
        index: themeStart + offset,
      });
    }
    if (backgroundStart + offset < EXOMUX_BACKGROUND_IDS.length) {
      backgroundRows.push({
        rect: { column: rect.column + 2 + columnWidth, row, width: columnWidth, height: 1 },
        index: backgroundStart + offset,
      });
    }
  }
  const optionTop = rect.row + rect.height - optionCount - 1;
  const optionRows: Rectangle[] = [];
  for (let index = 0; index < optionCount; index += 1) {
    optionRows.push({ column: rect.column + 1, row: optionTop + index, width: Math.max(0, rect.width - 2), height: 1 });
  }
  const closeRect = {
    column: Math.max(rect.column, rect.column + rect.width - 9),
    row: rect.row + rect.height - 1,
    width: Math.max(1, Math.min(9, rect.width)),
    height: 1,
  };
  const backgroundConfigRect: Rectangle = {
    column: Math.max(rect.column, closeRect.column - 23),
    row: closeRect.row,
    width: Math.max(1, Math.min(22, closeRect.column - rect.column - 1)),
    height: 1,
  };
  return {
    rect,
    themeRows,
    backgroundRows,
    themeListRect: { column: rect.column + 1, row: listTop, width: columnWidth, height: visibleRows },
    backgroundListRect: {
      column: rect.column + 2 + columnWidth,
      row: listTop,
      width: columnWidth,
      height: visibleRows,
    },
    optionRows,
    closeRect,
    sessionNameRect,
    backgroundConfigRect,
    shadersRect: {
      column: Math.max(rect.column, backgroundConfigRect.column - 15),
      row: closeRect.row,
      width: Math.max(1, Math.min(14, backgroundConfigRect.column - rect.column - 1)),
      height: 1,
    },
    themeHeaderRect: { column: rect.column + 1, row: rect.row + 1, width: columnWidth, height: 1 },
    backgroundHeaderRect: { column: rect.column + 2 + columnWidth, row: rect.row + 1, width: columnWidth, height: 1 },
    stacked: false,
  };
}

/**
 * The narrow-window settings layout: the pickers stack vertically (Theme above
 * Background, each full width under its own header), and the background-config
 * button sits directly below the background list (UX-002, user direction).
 */
function stackedGlobalConfigLayout(
  rect: Rectangle,
  themeIndex: number,
  backgroundIndex: number,
  optionCount: number,
  sessionNameRect: Rectangle,
): ExomuxGlobalConfigLayout {
  const innerColumn = rect.column + 1;
  const innerWidth = Math.max(8, rect.width - 2);
  // Name + two headers + the background-config row + options + the bottom row.
  const listBudget = Math.max(2, rect.height - optionCount - 5);
  const themeVisible = Math.max(1, Math.floor(listBudget / 2));
  const backgroundVisible = Math.max(1, listBudget - themeVisible);
  const themeTop = rect.row + 2;
  const backgroundHeaderRow = themeTop + themeVisible;
  const backgroundTop = backgroundHeaderRow + 1;
  const themeStart = selectListStart(themeIndex, EXOMUX_THEMES.length, themeVisible);
  const backgroundStart = selectListStart(backgroundIndex, EXOMUX_BACKGROUND_IDS.length, backgroundVisible);
  const themeRows: { rect: Rectangle; index: number }[] = [];
  const backgroundRows: { rect: Rectangle; index: number }[] = [];
  for (let offset = 0; offset < themeVisible; offset += 1) {
    if (themeStart + offset >= EXOMUX_THEMES.length) break;
    themeRows.push({
      rect: { column: innerColumn, row: themeTop + offset, width: innerWidth, height: 1 },
      index: themeStart + offset,
    });
  }
  for (let offset = 0; offset < backgroundVisible; offset += 1) {
    if (backgroundStart + offset >= EXOMUX_BACKGROUND_IDS.length) break;
    backgroundRows.push({
      rect: { column: innerColumn, row: backgroundTop + offset, width: innerWidth, height: 1 },
      index: backgroundStart + offset,
    });
  }
  const backgroundConfigRect: Rectangle = {
    column: innerColumn,
    row: backgroundTop + backgroundVisible,
    width: Math.max(1, Math.min(22, innerWidth)),
    height: 1,
  };
  const optionTop = rect.row + rect.height - optionCount - 1;
  const optionRows: Rectangle[] = [];
  for (let index = 0; index < optionCount; index += 1) {
    optionRows.push({ column: innerColumn, row: optionTop + index, width: innerWidth, height: 1 });
  }
  const closeRect: Rectangle = {
    column: Math.max(rect.column, rect.column + rect.width - 9),
    row: rect.row + rect.height - 1,
    width: Math.max(1, Math.min(9, rect.width)),
    height: 1,
  };
  return {
    rect,
    themeRows,
    backgroundRows,
    themeListRect: { column: innerColumn, row: themeTop, width: innerWidth, height: themeVisible },
    backgroundListRect: { column: innerColumn, row: backgroundTop, width: innerWidth, height: backgroundVisible },
    optionRows,
    closeRect,
    sessionNameRect,
    backgroundConfigRect,
    shadersRect: {
      column: Math.max(rect.column, closeRect.column - 15),
      row: closeRect.row,
      width: Math.max(1, Math.min(14, closeRect.column - rect.column - 1)),
      height: 1,
    },
    themeHeaderRect: { column: innerColumn, row: rect.row + 1, width: innerWidth, height: 1 },
    backgroundHeaderRect: { column: innerColumn, row: backgroundHeaderRow, width: innerWidth, height: 1 },
    stacked: true,
  };
}

/** One row of the background config modal's list pane. */
interface ExomuxBackgroundConfigListRow {
  readonly label: string;
  /** True for the browser's directories, which descend instead of selecting. */
  readonly directory?: boolean;
  /** Absolute path the row selects or descends into, for the image browser. */
  readonly path?: string;
  /** Preset index the row selects, for the butterchurn picker. */
  readonly presetIndex?: number;
  readonly active?: boolean;
}

/** Cache of the one directory the image browser is showing. */
let browseCache: { path: string; rows: ExomuxBackgroundConfigListRow[] } | undefined;

/** Rows for the image browser: parent, subdirectories, then image files. */
function exomuxBrowseRows(path: string): ExomuxBackgroundConfigListRow[] {
  if (browseCache?.path === path) return browseCache.rows;
  const rows: ExomuxBackgroundConfigListRow[] = [];
  const parent = path.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
  if (path !== "/") rows.push({ label: "../", directory: true, path: parent });
  const directories: ExomuxBackgroundConfigListRow[] = [];
  const files: ExomuxBackgroundConfigListRow[] = [];
  try {
    for (const entry of Deno.readDirSync(path)) {
      if (entry.name.startsWith(".")) continue;
      const full = `${path.replace(/\/+$/, "")}/${entry.name}`;
      if (entry.isDirectory) directories.push({ label: `${entry.name}/`, directory: true, path: full });
      else if (isExomuxImageFile(entry.name)) files.push({ label: entry.name, path: full });
    }
  } catch {
    rows.push({ label: "(unreadable directory)" });
  }
  const byLabel = (a: ExomuxBackgroundConfigListRow, b: ExomuxBackgroundConfigListRow) =>
    a.label.localeCompare(b.label);
  rows.push(...directories.sort(byLabel), ...files.sort(byLabel));
  browseCache = { path, rows };
  return rows;
}

/** The list pane's rows for the active background, or empty when it has none. */
function exomuxBackgroundConfigList(controller: ExomuxController): ExomuxBackgroundConfigListRow[] {
  const id = controller.backgroundId.peek();
  // Each field cycles its own catalog, so the picker lists that same catalog by
  // index: the GPU-drawable subset for the GPU field, the CPU-drawable subset for
  // software.
  const catalog = id === "butterchurn"
    ? EXOMUX_BUTTERCHURN_GPU_PRESETS
    : id === "butterchurn cpu"
    ? EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS
    : undefined;
  if (catalog) return catalog.map((preset, index) => ({ label: preset.name, presetIndex: index }));
  if (id === "image") return exomuxBrowseRows(controller.backgroundBrowsePath.peek() || "/");
  return [];
}

/** Layout for the background config modal; exported for pointer tests. */
export interface ExomuxBackgroundConfigLayout {
  readonly rect: Rectangle;
  /** Visible list rows, paired with the list index each row shows. */
  readonly listRows: readonly { readonly rect: Rectangle; readonly index: number }[];
  /** The whole list-pane region (the composited List widget occupies this). */
  readonly listRect: Rectangle;
  /** One hit row per setting spec of the active background. */
  readonly optionRows: readonly Rectangle[];
  readonly closeRect: Rectangle;
}

/** Layout for the background config modal. */
export function exomuxBackgroundConfigLayout(
  bounds: Rectangle,
  listLength: number,
  listIndex: number,
  optionCount: number,
  scrollTop = -1,
): ExomuxBackgroundConfigLayout {
  const width = fitModalSpan(bounds.width, 46, 84, 6);
  const wantsList = listLength > 0;
  const desired = (wantsList ? 18 : 0) + optionCount + 6;
  const height = Math.min(Math.max(desired, 8), fitModalSpan(bounds.height, 8, bounds.height, 2));
  const rect = centeredRect(bounds, width, height);
  const listTop = rect.row + 2;
  const visibleRows = wantsList ? Math.max(1, rect.height - optionCount - 5) : 0;
  // An explicit `scrollTop` scrolls the viewport independently of the selection
  // (the wheel sets it); otherwise the window follows the selection.
  const start = scrollTop >= 0
    ? Math.min(Math.max(0, Math.floor(scrollTop)), Math.max(0, listLength - visibleRows))
    : selectListStart(listIndex, listLength, visibleRows);
  const listRows: { rect: Rectangle; index: number }[] = [];
  for (let offset = 0; offset < visibleRows && start + offset < listLength; offset += 1) {
    listRows.push({
      rect: { column: rect.column + 2, row: listTop + offset, width: Math.max(1, rect.width - 4), height: 1 },
      index: start + offset,
    });
  }
  const optionTop = rect.row + rect.height - optionCount - 2;
  const optionRows: Rectangle[] = [];
  for (let index = 0; index < optionCount; index += 1) {
    optionRows.push({ column: rect.column + 2, row: optionTop + index, width: Math.max(0, rect.width - 4), height: 1 });
  }
  return {
    rect,
    listRows,
    listRect: { column: rect.column + 2, row: listTop, width: Math.max(1, rect.width - 4), height: visibleRows },
    optionRows,
    closeRect: {
      column: Math.max(rect.column + 1, rect.column + rect.width - 10),
      row: rect.row + rect.height - 1,
      width: Math.max(1, Math.min(9, rect.width - 2)),
      height: 1,
    },
  };
}

interface ExomuxBackgroundConfigHosts {
  readonly list?: ExomuxBackgroundList;
  readonly options?: ExomuxSettingsOptions;
  readonly buttons?: ExomuxSettingsWidgets;
}

function paintBackgroundConfigModal(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
  controller: ExomuxController,
  backgroundField: ExomuxAnimatedBackground | undefined,
  hosts?: ExomuxBackgroundConfigHosts,
): void {
  const id = controller.backgroundId.peek();
  const specs = EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? [];
  const list = exomuxBackgroundConfigList(controller);
  const listIndex = Math.min(Math.max(0, controller.backgroundConfigListIndex.peek()), Math.max(0, list.length - 1));
  const layout = exomuxBackgroundConfigLayout(
    projection.bounds,
    list.length,
    listIndex,
    specs.length,
    controller.backgroundConfigScrollTop.peek(),
  );
  const { rect, listRows, optionRows, closeRect } = layout;
  const pane = controller.backgroundConfigPane.peek();
  const values = exomuxBackgroundSettingsFor(controller.backgroundSettings.peek(), id);
  const optionIndex = controller.backgroundConfigOptionIndex.peek();
  // Butterchurn preset rows carry a favorite star (filled when favorited); the
  // image browser and other backgrounds render their label as-is.
  const favable = id === "butterchurn" || id === "butterchurn cpu";
  const rowLabel = (row: ExomuxBackgroundConfigListRow): string =>
    favable && row.presetIndex !== undefined
      ? `${controller.isButterchurnFavorite(row.label) ? "★" : "☆"} ${row.label}`
      : row.directory
      ? `${row.label}/`
      : row.label;

  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "#", { foreground: theme.accent, background: theme.surfaceStrong, bold: true });
  painter.write(rect.column + 2, rect.row, ` Background · ${id} `, {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });

  const header = favable
    ? `Preset (${list.length}) · ★ Space · current: ${
      exomuxBackgroundHasPresets(backgroundField) ? backgroundField.presetName : "…"
    }`
    : id === "image"
    ? `Pick an image · ${controller.backgroundBrowsePath.peek() || "/"}`
    : specs.length > 0
    ? "Settings"
    : "This background has nothing to configure.";
  painter.write(rect.column + 2, rect.row + 1, fitText(header, Math.max(0, rect.width - 4)), {
    foreground: pane === "list" ? theme.accent : theme.muted,
    background: theme.surfaceStrong,
    bold: pane === "list",
  });

  const activePreset = exomuxBackgroundHasPresets(backgroundField) ? backgroundField.presetIndex : -1;
  for (const { rect: rowRect, index } of listRows) {
    const row = list[index]!;
    const focused = pane === "list" && index === listIndex;
    const current = row.presetIndex !== undefined && row.presetIndex === activePreset;
    painter.write(
      rowRect.column,
      rowRect.row,
      fitText(`${focused ? ">" : current ? "·" : " "} ${rowLabel(row)}`, rowRect.width),
      {
        foreground: focused ? theme.background : row.directory ? theme.accent : current ? theme.accent : theme.text,
        background: focused ? theme.accent : theme.surfaceStrong,
        bold: focused || current,
      },
    );
  }
  // The hand-drawn rows above are the fallback; the real exotui List (a `·`
  // marking the active preset, `>` the cursor) is composited over the pane.
  if (hosts?.list && listRows.length > 0) {
    hosts.list.sync({
      width: layout.listRect.width,
      height: layout.listRect.height,
      items: list.map(rowLabel),
      selectedIndex: listIndex,
      activeIndex: list.findIndex((row) => row.presetIndex !== undefined && row.presetIndex === activePreset),
      scrollTop: controller.backgroundConfigScrollTop.peek(),
      foreground: theme.text,
      background: theme.surfaceStrong,
      selectedForeground: theme.background,
      selectedBackground: theme.accent,
      scrollbarTrack: theme.surface,
      scrollbarThumb: theme.muted,
    });
    if (hosts.list.ready()) {
      for (let row = 0; row < layout.listRect.height; row += 1) {
        for (let column = 0; column < layout.listRect.width; column += 1) {
          const cell = hosts.list.cellAt(row, column);
          if (cell !== undefined) painter.rawCell(layout.listRect.column + column, layout.listRect.row + row, cell);
        }
      }
    }
  }

  // Each background setting is rendered by a real Cycler/CheckBox composited over
  // the value column, matching the settings window; the existing routing drives it.
  const controlWidth = Math.min(16, Math.max(6, (optionRows[0]?.width ?? 16) - 4));
  const controlSpecs: ExomuxOptionControlSpec[] = specs.map((spec, index) => {
    const focused = pane === "options" && index === optionIndex;
    const foreground = focused ? theme.background : theme.accent;
    const background = focused ? theme.accent : theme.surfaceStrong;
    if (spec.values.length > 0 && typeof spec.values[0] === "boolean") {
      return { kind: "checkbox", key: spec.id, width: 3, foreground, background, checked: Boolean(values[spec.id]) };
    }
    return {
      kind: "cycler",
      key: spec.id,
      width: controlWidth,
      foreground,
      background,
      options: spec.values.map((value) => spec.format(value)),
      activeIndex: Math.max(0, spec.values.findIndex((value) => value === values[spec.id])),
    };
  });
  const controlCells = hosts?.options?.cellsFor(controlSpecs) ?? [];

  for (let index = 0; index < optionRows.length; index += 1) {
    const rowRect = optionRows[index]!;
    const spec = specs[index]!;
    const focused = pane === "options" && index === optionIndex;
    const cells = controlCells[index];
    const width = controlSpecs[index]!.width;
    const controlColumn = rowRect.column + Math.max(0, rowRect.width - width);
    const value = spec.format(values[spec.id]!);
    const valueColumn = cells ? controlColumn : rowRect.column + Math.max(0, rowRect.width - textWidth(value) - 1);
    painter.fill(rowRect, " ", {
      foreground: focused ? theme.background : theme.text,
      background: focused ? theme.accent : theme.surfaceStrong,
      bold: focused,
    });
    painter.write(
      rowRect.column,
      rowRect.row,
      fitText(`${focused ? ">" : " "} ${spec.label}`, Math.max(0, valueColumn - rowRect.column - 1)),
      {
        foreground: focused ? theme.background : theme.text,
        background: focused ? theme.accent : theme.surfaceStrong,
        bold: focused,
      },
    );
    if (cells) {
      for (let column = 0; column < Math.min(width, cells.width); column += 1) {
        const cell = cells.cells[column];
        if (cell !== undefined) painter.rawCell(controlColumn + column, rowRect.row, cell);
      }
    } else {
      painter.write(valueColumn, rowRect.row, value, {
        foreground: focused ? theme.background : theme.accent,
        background: focused ? theme.accent : theme.surfaceStrong,
        bold: true,
      });
    }
  }

  // Close as a real composited Button, with the hand-drawn fallback until ready.
  const closeCells = hosts?.buttons?.cellsFor(
    [{ key: "close", label: "Close", width: closeRect.width, foreground: theme.background, background: theme.accent }],
    "close",
  );
  if (closeCells) {
    blitSettingsButtonCells(painter, closeRect, closeCells);
  } else {
    painter.write(closeRect.column, closeRect.row, "[ Close ]", {
      foreground: theme.background,
      background: theme.accent,
      bold: true,
    });
  }
}

/** Composites one real button's styled cells into its window rect. */
function blitSettingsButtonCells(
  painter: DesktopPainter,
  rect: Rectangle,
  snapshot: ExomuxSettingsButtonCells,
  theme?: ExomuxThemeSpec,
  controlGround?: ExomuxControlGround,
): void {
  const width = Math.min(rect.width, snapshot.width);
  for (let index = 0; index < width; index += 1) {
    const cell = snapshot.cells[index];
    if (cell === undefined) continue;
    if (theme && controlGround) blitControlCell(painter, rect.column + index, rect.row, cell, theme, controlGround);
    else painter.rawCell(rect.column + index, rect.row, cell);
  }
}

/** Composites a picker List's rendered region (in client-relative cells) into its window rect. */
function blitPickerRegion(
  painter: DesktopPainter,
  region: Rectangle,
  clientRect: Rectangle,
  surface: ExomuxSettingsSurface,
  theme?: ExomuxThemeSpec,
  controlGround?: ExomuxControlGround,
): void {
  for (let row = 0; row < region.height; row += 1) {
    for (let column = 0; column < region.width; column += 1) {
      const cell = surface.cellAt(region.row - clientRect.row + row, region.column - clientRect.column + column);
      if (cell === undefined) continue;
      if (theme && controlGround) {
        blitControlCell(painter, region.column + column, region.row + row, cell, theme, controlGround);
      } else {
        painter.rawCell(region.column + column, region.row + row, cell);
      }
    }
  }
}

function paintGlobalSettingsWindow(
  painter: DesktopPainter,
  rect: Rectangle,
  controller: ExomuxController,
  settingsWidgets?: ExomuxSettingsWidgets,
  settingsPickers?: ExomuxSettingsSurface,
  settingsOptions?: ExomuxSettingsOptions,
  sessionNameField?: ExomuxInputField,
  backdrop?: ExomuxBackdrop,
  windowOpacity = 1,
): void {
  const theme = controller.theme.peek();
  // Every row here is a control, so the whole surface renders at control
  // opacity — half the window's transparency (032). Opaque windows keep the
  // exact constant grounds they had.
  const controlGround = exomuxControlGroundFor(backdrop, windowOpacity);
  const g = (base: ExomuxRgb): ExomuxGround => controlGround ? (x, y) => controlGround(x, y, base) : () => base;
  const themeIndex = Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === controller.themeId.peek()));
  const backgroundIndex = Math.max(0, EXOMUX_BACKGROUND_IDS.indexOf(controller.backgroundId.peek()));
  const layout = exomuxGlobalConfigLayout(rect, themeIndex, backgroundIndex);
  const { themeRows, backgroundRows, optionRows, closeRect } = layout;
  const pane = controller.globalConfigPane.peek();
  const settings = controller.globalSettings.peek();
  const optionIndex = controller.globalConfigOptionIndex.peek();

  // Editable session name across the top of the window.
  const draft = controller.sessionNameDraft.peek();
  const editing = draft !== undefined;
  const nameLabel = controller.canRenameSession
    ? (editing ? "Session ↵ save · Esc cancel: " : "Session (click to rename): ")
    : "Session: ";
  const nameRect = layout.sessionNameRect;
  const nameBase = editing ? theme.accent : theme.surfaceStrong;
  fillWithGround(painter, nameRect, theme, g(nameBase));
  const labelWidth = Math.min(nameRect.width, textWidth(nameLabel));
  writeOnGround(painter, nameRect.column, nameRect.row, fitText(nameLabel, labelWidth), {
    foreground: editing ? theme.background : theme.accent,
    bold: editing,
  }, g(nameBase));
  // The value after the label is a real exotui Input while editing (composited
  // over the region), falling back to a hand-drawn draft until it renders; when
  // not editing it is the plain current name.
  const valueColumn = nameRect.column + labelWidth;
  const valueWidth = Math.max(0, nameRect.width - labelWidth);
  sessionNameField?.sync(editing, draft ?? "", {
    column: 0,
    row: 0,
    width: Math.max(1, valueWidth),
    foreground: theme.background,
    background: theme.accent,
    cursorForeground: theme.accent,
    cursorBackground: theme.background,
  });
  if (editing && sessionNameField?.ready()) {
    for (let column = 0; column < valueWidth; column += 1) {
      blitControlCell(
        painter,
        valueColumn + column,
        nameRect.row,
        sessionNameField.cellAt(0, column),
        theme,
        controlGround,
      );
    }
  } else {
    writeOnGround(
      painter,
      valueColumn,
      nameRect.row,
      fitText(editing ? `${draft}▏` : controller.sessionName.peek(), valueWidth),
      {
        foreground: editing ? theme.background : theme.accent,
        bold: editing,
      },
      g(nameBase),
    );
  }

  const header = (at: Rectangle, text: string, focused: boolean) => {
    writeOnGround(painter, at.column, at.row, fitText(text, at.width), {
      foreground: focused ? theme.accent : theme.muted,
      bold: focused,
    }, g(theme.surfaceStrong));
  };
  header(layout.themeHeaderRect, "Theme", pane === "theme");
  header(layout.backgroundHeaderRect, "Background", pane === "background");

  const paintRow = (rowRect: Rectangle, label: string, selected: boolean, focused: boolean) => {
    const rowBase = selected ? (focused ? theme.accent : theme.surface) : theme.surfaceStrong;
    fillWithGround(painter, rowRect, theme, g(rowBase));
    writeOnGround(painter, rowRect.column, rowRect.row, fitText(`${selected ? ">" : " "} ${label}`, rowRect.width), {
      foreground: selected ? (focused ? theme.background : theme.accent) : theme.text,
      bold: selected,
    }, g(rowBase));
  };
  for (const row of themeRows) {
    paintRow(row.rect, EXOMUX_THEMES[row.index]!.label, row.index === themeIndex, pane === "theme");
  }
  for (const row of backgroundRows) {
    const id = EXOMUX_BACKGROUND_IDS[row.index]!;
    const grows = exomuxBackgroundOvergrows(id) ? " *" : "";
    paintRow(row.rect, `${id}${grows}`, row.index === backgroundIndex, pane === "background");
  }

  // The theme and background rows above are the hand-drawn fallback; the real
  // exotui List widgets are composited over the same regions once they render.
  if (settingsPickers) {
    settingsPickers.sync(
      {
        column: layout.themeListRect.column - rect.column,
        row: layout.themeListRect.row - rect.row,
        width: layout.themeListRect.width,
        height: layout.themeListRect.height,
        items: EXOMUX_THEMES.map((entry) => entry.label),
        foreground: theme.text,
        background: theme.surfaceStrong,
        selectedForeground: theme.background,
        selectedBackground: theme.accent,
        scrollbarTrack: theme.surface,
        scrollbarThumb: theme.muted,
      },
      {
        column: layout.backgroundListRect.column - rect.column,
        row: layout.backgroundListRect.row - rect.row,
        width: layout.backgroundListRect.width,
        height: layout.backgroundListRect.height,
        items: EXOMUX_BACKGROUND_IDS.map((id) => `${id}${exomuxBackgroundOvergrows(id) ? " *" : ""}`),
        foreground: theme.text,
        background: theme.surfaceStrong,
        selectedForeground: theme.background,
        selectedBackground: theme.accent,
        scrollbarTrack: theme.surface,
        scrollbarThumb: theme.muted,
      },
    );
    if (settingsPickers.ready()) {
      blitPickerRegion(painter, layout.themeListRect, rect, settingsPickers, theme, controlGround);
      blitPickerRegion(painter, layout.backgroundListRect, rect, settingsPickers, theme, controlGround);
    }
  }

  // The options pane lists the global settings; the Ghostty shader rows moved
  // to the shader manager window (UX-009), opened by the Shaders button below.
  const optionEntries: { label: string; value: string }[] = EXOMUX_GLOBAL_SETTING_SPECS.map((spec) => ({
    label: spec.label,
    value: spec.format(settings[spec.id]),
  }));
  // Every option is rendered by a real exotui control composited over the value
  // column: a CheckBox for booleans, a `< value >` Cycler for discrete values.
  const cyclerWidth = Math.min(16, Math.max(6, (optionRows[0]?.width ?? 16) - 4));
  const controlSpecs: ExomuxOptionControlSpec[] = optionEntries.map((_entry, index) => {
    const focused = pane === "options" && index === optionIndex;
    const foreground = focused ? theme.background : theme.accent;
    const background = focused ? theme.accent : theme.surfaceStrong;
    const spec = EXOMUX_GLOBAL_SETTING_SPECS[index]!;
    if (spec.values.length > 0 && typeof spec.values[0] === "boolean") {
      return {
        kind: "checkbox",
        key: spec.id,
        width: 3,
        foreground,
        background,
        checked: Boolean(settings[spec.id]),
      };
    }
    return {
      kind: "cycler",
      key: spec.id,
      width: cyclerWidth,
      foreground,
      background,
      options: spec.values.map((value) => spec.format(value)),
      activeIndex: Math.max(0, spec.values.findIndex((value) => value === settings[spec.id])),
    };
  });
  const controlCells = settingsOptions?.cellsFor(controlSpecs) ?? [];

  for (let index = 0; index < optionRows.length; index += 1) {
    const rowRect = optionRows[index]!;
    const entry = optionEntries[index];
    if (!entry) continue;
    const focused = pane === "options" && index === optionIndex;
    const cells = controlCells[index];
    const controlWidth = controlSpecs[index]?.width ?? 0;
    const controlColumn = rowRect.column + Math.max(0, rowRect.width - controlWidth);
    const valueColumn = cells
      ? controlColumn
      : rowRect.column + Math.max(0, rowRect.width - textWidth(entry.value) - 1);

    const rowBase = focused ? theme.accent : theme.surfaceStrong;
    fillWithGround(painter, rowRect, theme, g(rowBase));
    writeOnGround(
      painter,
      rowRect.column,
      rowRect.row,
      fitText(`${focused ? ">" : " "} ${entry.label}`, Math.max(0, valueColumn - rowRect.column - 1)),
      {
        foreground: focused ? theme.background : theme.text,
        bold: focused,
      },
      g(rowBase),
    );
    if (cells) {
      for (let column = 0; column < Math.min(controlWidth, cells.width); column += 1) {
        blitControlCell(painter, controlColumn + column, rowRect.row, cells.cells[column], theme, controlGround);
      }
    } else {
      writeOnGround(painter, valueColumn, rowRect.row, entry.value, {
        foreground: focused ? theme.background : theme.accent,
        bold: true,
      }, g(rowBase));
    }
  }

  const showShaders = controller.ghosttyDetected.peek();
  const hintLimit = showShaders && !layout.stacked ? layout.shadersRect.column : layout.backgroundConfigRect.column;
  writeOnGround(
    painter,
    rect.column + 1,
    rect.row + rect.height - 1,
    fitText(" * overgrows idle windows ", Math.max(0, hintLimit - rect.column - 2)),
    { foreground: theme.muted },
    g(theme.surfaceStrong),
  );
  // The background-config button is the doorway to a whole second settings
  // surface, so it wears the theme's warning hue — derived from the theme but
  // deliberately not the accent everything else uses and never the desktop
  // background — to stay visible at a glance. Both action buttons are real
  // exotui `Button` widgets rendered off-screen and composited in; until a
  // matching snapshot is ready they fall back to hand-drawn labels so a button
  // is never blank.
  const buttonSpecs: readonly ExomuxSettingsButtonSpec[] = [
    {
      key: "background",
      label: "Background config",
      width: layout.backgroundConfigRect.width,
      foreground: theme.background,
      background: theme.warning,
    },
    ...(showShaders
      ? [
        {
          key: "shaders",
          label: "s Shaders",
          width: layout.shadersRect.width,
          foreground: theme.background,
          background: theme.warning,
        } satisfies ExomuxSettingsButtonSpec,
      ]
      : []),
    {
      key: "close",
      label: "Close",
      width: closeRect.width,
      foreground: theme.background,
      background: theme.accent,
    },
  ];
  // The shader manager button only exists under Ghostty — the shaders it
  // manages are Ghostty custom-shader config entries.
  if (showShaders) {
    const shaderCells = settingsWidgets?.cellsFor(buttonSpecs, "shaders");
    if (shaderCells) {
      blitSettingsButtonCells(painter, layout.shadersRect, shaderCells, theme, controlGround);
    } else {
      writeOnGround(painter, layout.shadersRect.column, layout.shadersRect.row, "[ s Shaders ]", {
        foreground: theme.background,
        bold: true,
      }, g(theme.warning));
    }
  }
  const backgroundCells = settingsWidgets?.cellsFor(buttonSpecs, "background");
  if (backgroundCells) {
    blitSettingsButtonCells(painter, layout.backgroundConfigRect, backgroundCells, theme, controlGround);
  } else {
    writeOnGround(
      painter,
      layout.backgroundConfigRect.column,
      layout.backgroundConfigRect.row,
      "[ b Background config ]",
      {
        foreground: theme.background,
        bold: true,
      },
      g(theme.warning),
    );
  }
  const closeCells = settingsWidgets?.cellsFor(buttonSpecs, "close");
  if (closeCells) {
    blitSettingsButtonCells(painter, closeRect, closeCells, theme, controlGround);
  } else {
    writeOnGround(painter, closeRect.column, closeRect.row, "[ Close ]", {
      foreground: theme.background,
      bold: true,
    }, g(theme.accent));
  }
}

/** Layout for the per-window config modal; exported for deterministic pointer tests. */
export interface ExomuxWindowConfigLayout {
  readonly rect: Rectangle;
  /** One hit row per entry in EXOMUX_WINDOW_SETTING_SPECS, in declaration order. */
  readonly rowRects: readonly Rectangle[];
  readonly resetRect: Rectangle;
  readonly closeRect: Rectangle;
}

/** Layout for the per-window config modal; exported for deterministic pointer tests. */
export function exomuxWindowConfigLayout(bounds: Rectangle): ExomuxWindowConfigLayout {
  const width = fitModalSpan(bounds.width, 44, 72, 6);
  const rowCount = EXOMUX_WINDOW_SETTING_SPECS.length;
  // Frame + title + blank + rows + blank + buttons + frame.
  const height = Math.min(rowCount + 6, fitModalSpan(bounds.height, 8, bounds.height, 2));
  const rect = centeredRect(bounds, width, height);
  const firstRow = rect.row + 2;
  const usableRows = Math.max(0, rect.height - 5);
  const rowRects: Rectangle[] = [];
  for (let index = 0; index < Math.min(rowCount, usableRows); index += 1) {
    rowRects.push({ column: rect.column + 2, row: firstRow + index, width: Math.max(0, rect.width - 4), height: 1 });
  }
  const buttonRow = rect.row + Math.max(1, rect.height - 2);
  return {
    rect,
    rowRects,
    resetRect: { column: rect.column + 2, width: 9, row: buttonRow, height: 1 },
    closeRect: {
      column: Math.max(rect.column + 1, rect.column + rect.width - 10),
      width: Math.max(1, Math.min(9, rect.width - 2)),
      row: buttonRow,
      height: 1,
    },
  };
}

function paintWindowConfigModal(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
  controller: ExomuxController,
  sessionId: string,
  optionControls?: ExomuxSettingsOptions,
): void {
  const { rect, rowRects, resetRect, closeRect } = exomuxWindowConfigLayout(projection.bounds);
  const settings = controller.windowSettingsFor(sessionId);
  const selected = controller.configRowIndex.peek();
  const title = controller.runtime(sessionId)?.summary.peek().title ?? sessionId;
  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "#", { foreground: theme.accent, background: theme.surfaceStrong, bold: true });
  painter.write(rect.column + 2, rect.row, fitText(` ${title} settings `, Math.max(0, rect.width - 4)), {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });
  // Each value row is rendered by a real Cycler/CheckBox composited over the
  // value column, exactly like the settings window and background modal; the
  // modal's existing routing (click/arrow/wheel cycles the value) drives it.
  const controlWidth = Math.min(18, Math.max(6, (rowRects[0]?.width ?? 18) - 4));
  const controlSpecs: ExomuxOptionControlSpec[] = rowRects.map((_rowRect, index) => {
    const spec = EXOMUX_WINDOW_SETTING_SPECS[index]!;
    const active = index === selected;
    const foreground = active ? theme.background : theme.accent;
    const background = active ? theme.accent : theme.surfaceStrong;
    if (spec.values.length > 0 && typeof spec.values[0] === "boolean") {
      return {
        kind: "checkbox",
        key: spec.id,
        width: 3,
        foreground,
        background,
        checked: Boolean(settings[spec.id]),
      };
    }
    return {
      kind: "cycler",
      key: spec.id,
      width: controlWidth,
      foreground,
      background,
      options: spec.values.map((value) => spec.format(value)),
      activeIndex: Math.max(0, spec.values.findIndex((value) => value === settings[spec.id])),
    };
  });
  const controlCells = optionControls?.cellsFor(controlSpecs) ?? [];
  for (let index = 0; index < rowRects.length; index += 1) {
    const rowRect = rowRects[index]!;
    const spec = EXOMUX_WINDOW_SETTING_SPECS[index]!;
    const active = index === selected;
    const value = spec.format(settings[spec.id]);
    const label = `${active ? ">" : " "} ${spec.label}`;
    const cells = controlCells[index];
    const width = controlSpecs[index]!.width;
    const controlColumn = rowRect.column + Math.max(0, rowRect.width - width);
    // Right-align the value so the column of settings reads as a table; until
    // the composited snapshot is ready the hand-drawn value keeps the row full.
    const valueColumn = cells ? controlColumn : rowRect.column + Math.max(0, rowRect.width - textWidth(value) - 1);
    painter.fill(rowRect, " ", {
      foreground: active ? theme.background : theme.text,
      background: active ? theme.accent : theme.surfaceStrong,
      bold: active,
    });
    painter.write(rowRect.column, rowRect.row, fitText(label, Math.max(0, valueColumn - rowRect.column - 1)), {
      foreground: active ? theme.background : theme.text,
      background: active ? theme.accent : theme.surfaceStrong,
      bold: active,
    });
    if (cells) {
      for (let column = 0; column < Math.min(width, cells.width); column += 1) {
        const cell = cells.cells[column];
        if (cell !== undefined) painter.rawCell(controlColumn + column, rowRect.row, cell);
      }
    } else {
      painter.write(valueColumn, rowRect.row, value, {
        foreground: active ? theme.background : theme.accent,
        background: active ? theme.accent : theme.surfaceStrong,
        bold: true,
      });
    }
  }
  const detail = EXOMUX_WINDOW_SETTING_SPECS[selected]?.detail ?? "";
  const detailRow = rect.row + Math.max(1, rect.height - 3);
  painter.write(rect.column + 2, detailRow, fitText(detail, Math.max(0, rect.width - 4)), {
    foreground: theme.muted,
    background: theme.surfaceStrong,
  });
  painter.write(resetRect.column, resetRect.row, "[ Reset ]", {
    foreground: theme.text,
    background: theme.surface,
    bold: true,
  });
  painter.write(closeRect.column, closeRect.row, "[ Close ]", {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });
}

/** Layout for the shader manager modal; exported for deterministic pointer tests. */
export interface ExomuxShaderManagerLayout {
  readonly rect: Rectangle;
  /** One hit row per entry in `controller.shaderManagerRows()`, in order. */
  readonly rowRects: readonly Rectangle[];
  /** The add-a-shader path prompt (doubles as the hint line when idle). */
  readonly pathRect: Rectangle;
  readonly addRect: Rectangle;
  readonly closeRect: Rectangle;
}

/** Layout for the shader manager modal; exported for deterministic pointer tests. */
export function exomuxShaderManagerLayout(bounds: Rectangle, rowCount: number): ExomuxShaderManagerLayout {
  const width = fitModalSpan(bounds.width, 44, 76, 6);
  // Frame + blank + rows + path/hint row + buttons + frame.
  const height = Math.min(rowCount + 5, fitModalSpan(bounds.height, 9, bounds.height, 2));
  const rect = centeredRect(bounds, width, height);
  const firstRow = rect.row + 2;
  const usableRows = Math.max(0, rect.height - 5);
  const rowRects: Rectangle[] = [];
  for (let index = 0; index < Math.min(rowCount, usableRows); index += 1) {
    rowRects.push({ column: rect.column + 2, row: firstRow + index, width: Math.max(0, rect.width - 4), height: 1 });
  }
  const buttonRow = rect.row + Math.max(1, rect.height - 2);
  return {
    rect,
    rowRects,
    pathRect: { column: rect.column + 2, row: buttonRow - 1, width: Math.max(0, rect.width - 4), height: 1 },
    addRect: { column: rect.column + 2, width: 16, row: buttonRow, height: 1 },
    closeRect: {
      column: Math.max(rect.column + 1, rect.column + rect.width - 10),
      width: Math.max(1, Math.min(9, rect.width - 2)),
      row: buttonRow,
      height: 1,
    },
  };
}

function paintShaderManagerModal(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
  controller: ExomuxController,
  optionControls?: ExomuxSettingsOptions,
  pathField?: ExomuxInputField,
): void {
  const rows = controller.shaderManagerRows();
  const { rect, rowRects, pathRect, addRect, closeRect } = exomuxShaderManagerLayout(projection.bounds, rows.length);
  const selected = controller.shaderManagerIndex.peek();
  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "#", { foreground: theme.accent, background: theme.surfaceStrong, bold: true });
  painter.write(rect.column + 2, rect.row, fitText(" Ghostty shaders ", Math.max(0, rect.width - 4)), {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });
  // Each actionable row is rendered by a real Cycler/CheckBox composited over
  // the value column, the same host pattern every settings surface uses.
  const controlWidth = Math.min(18, Math.max(6, (rowRects[0]?.width ?? 18) - 4));
  const controlSpecs: ExomuxOptionControlSpec[] = rowRects.map((_rowRect, index) => {
    const row = rows[index]!;
    const active = index === selected && row.kind !== "note";
    const foreground = active ? theme.background : theme.accent;
    const background = active ? theme.accent : theme.surfaceStrong;
    if (row.control.kind === "checkbox") {
      return { kind: "checkbox", key: row.id, width: 3, foreground, background, checked: row.control.checked };
    }
    return {
      kind: "cycler",
      key: row.id,
      width: controlWidth,
      foreground,
      background,
      options: [...row.control.options],
      activeIndex: row.control.activeIndex,
    };
  });
  const controlCells = optionControls?.cellsFor(controlSpecs) ?? [];
  for (let index = 0; index < rowRects.length; index += 1) {
    const rowRect = rowRects[index]!;
    const row = rows[index]!;
    if (row.kind === "note") {
      painter.fill(rowRect, " ", { foreground: theme.muted, background: theme.surfaceStrong });
      painter.write(rowRect.column, rowRect.row, fitText(row.label, rowRect.width), {
        foreground: theme.muted,
        background: theme.surfaceStrong,
      });
      continue;
    }
    const active = index === selected;
    const cells = controlCells[index];
    const width = controlSpecs[index]!.width;
    const controlColumn = rowRect.column + Math.max(0, rowRect.width - width);
    const valueColumn = cells ? controlColumn : rowRect.column + Math.max(0, rowRect.width - textWidth(row.value) - 1);
    painter.fill(rowRect, " ", {
      foreground: active ? theme.background : theme.text,
      background: active ? theme.accent : theme.surfaceStrong,
      bold: active,
    });
    painter.write(
      rowRect.column,
      rowRect.row,
      fitText(`${active ? ">" : " "} ${row.label}`, Math.max(0, valueColumn - rowRect.column - 1)),
      {
        foreground: active ? theme.background : theme.text,
        background: active ? theme.accent : theme.surfaceStrong,
        bold: active,
      },
    );
    if (cells) {
      for (let column = 0; column < Math.min(width, cells.width); column += 1) {
        const cell = cells.cells[column];
        if (cell !== undefined) painter.rawCell(controlColumn + column, rowRect.row, cell);
      }
    } else {
      painter.write(valueColumn, rowRect.row, row.value, {
        foreground: active ? theme.background : theme.accent,
        background: active ? theme.accent : theme.surfaceStrong,
        bold: true,
      });
    }
  }
  // The path prompt is a real composited Input while adding; otherwise the row
  // carries the key hints.
  const draft = controller.shaderPathDraft.peek();
  const adding = draft !== undefined;
  painter.fill(pathRect, " ", { foreground: theme.text, background: adding ? theme.accent : theme.surfaceStrong });
  if (adding) {
    const label = "GLSL path: ";
    const labelWidth = Math.min(pathRect.width, textWidth(label));
    painter.write(pathRect.column, pathRect.row, fitText(label, labelWidth), {
      foreground: theme.background,
      background: theme.accent,
      bold: true,
    });
    const valueWidth = Math.max(0, pathRect.width - labelWidth);
    pathField?.sync(true, draft, {
      column: 0,
      row: 0,
      width: Math.max(1, valueWidth),
      foreground: theme.background,
      background: theme.accent,
      cursorForeground: theme.accent,
      cursorBackground: theme.background,
    });
    if (pathField?.ready()) {
      for (let column = 0; column < valueWidth; column += 1) {
        const cell = pathField.cellAt(0, column);
        if (cell !== undefined) painter.rawCell(pathRect.column + labelWidth + column, pathRect.row, cell);
      }
    } else {
      painter.write(pathRect.column + labelWidth, pathRect.row, fitText(`${draft}\u258f`, valueWidth), {
        foreground: theme.background,
        background: theme.accent,
        bold: true,
      });
    }
  } else {
    pathField?.sync(false, "", {
      column: 0,
      row: 0,
      width: 1,
      foreground: theme.background,
      background: theme.accent,
      cursorForeground: theme.accent,
      cursorBackground: theme.background,
    });
    painter.write(
      pathRect.column,
      pathRect.row,
      fitText(
        "\u2191\u2193 choose \u00b7 \u2190\u2192 change \u00b7 a add \u00b7 Del remove \u00b7 [ ] reorder",
        pathRect.width,
      ),
      { foreground: theme.muted, background: theme.surfaceStrong },
    );
  }
  painter.write(addRect.column, addRect.row, adding ? "[ \u21b5 Add path ]" : "[ a Add shader ]", {
    foreground: theme.text,
    background: theme.surface,
    bold: true,
  });
  painter.write(closeRect.column, closeRect.row, "[ Close ]", {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });
}

interface ExomuxScpLayout {
  readonly rect: Rectangle;
  readonly cancelRect: Rectangle;
  readonly pasteRect: Rectangle;
  readonly sendRect: Rectangle;
}

/** Layout for the paste-to-scp modal; exported for deterministic pointer tests. */
export function exomuxScpLayout(bounds: Rectangle): ExomuxScpLayout {
  const width = fitModalSpan(bounds.width, 44, 84, 6);
  const rect = centeredRect(bounds, width, fitModalSpan(bounds.height, 6, 9, 2));
  const [cancelRect, pasteRect, sendRect] = modalButtonRects(rect, [10, 14, 8]);
  return { rect, cancelRect: cancelRect!, pasteRect: pasteRect!, sendRect: sendRect! };
}

function paintScpModal(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
  request: ExomuxScpRequest,
  passwordField?: ExomuxInputField,
): void {
  const { rect, cancelRect, pasteRect, sendRect } = exomuxScpLayout(projection.bounds);
  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "=", { foreground: theme.accent, background: theme.surfaceStrong, bold: true });
  painter.write(rect.column + 2, rect.row + 1, fitText("SEND FILE OVER SCP?", rect.width - 4), {
    foreground: theme.accent,
    background: theme.surfaceStrong,
    bold: true,
  });
  painter.write(
    rect.column + 2,
    rect.row + 2,
    fitText(`${request.localPath} → ${exomuxScpDestinationLabel(request)}`, rect.width - 4),
    {
      foreground: theme.text,
      background: theme.surfaceStrong,
    },
  );
  const passwordRow = rect.row + Math.max(3, rect.height - 3);
  const label = "Password: ";
  painter.write(rect.column + 2, passwordRow, label, { foreground: theme.muted, background: theme.surfaceStrong });
  const fieldColumn = rect.column + 2 + label.length;
  const fieldWidth = Math.max(1, rect.width - 4 - label.length);
  // The value is a real masked exotui Input composited over the region, with a
  // hand-drawn fallback until its first snapshot renders.
  passwordField?.sync(true, request.password, {
    column: 0,
    row: 0,
    width: fieldWidth,
    foreground: theme.text,
    background: theme.surfaceStrong,
    cursorForeground: theme.surfaceStrong,
    cursorBackground: theme.accent,
  });
  if (passwordField?.ready()) {
    for (let column = 0; column < fieldWidth; column += 1) {
      const cell = passwordField.cellAt(0, column);
      if (cell !== undefined) painter.rawCell(fieldColumn + column, passwordRow, cell);
    }
  } else {
    const masked = request.password.length > 0 ? "*".repeat(Math.min(request.password.length, fieldWidth)) : "";
    painter.write(fieldColumn, passwordRow, fitText(masked || "(key/agent auth)", fieldWidth), {
      foreground: request.password.length > 0 ? theme.text : theme.muted,
      background: theme.surfaceStrong,
    });
  }
  painter.write(cancelRect.column, cancelRect.row, "[ Cancel ]", {
    foreground: theme.text,
    background: theme.surface,
    bold: true,
  });
  painter.write(pasteRect.column, pasteRect.row, "[ Paste path ]", {
    foreground: theme.text,
    background: theme.surface,
    bold: true,
  });
  painter.write(sendRect.column, sendRect.row, "[ Send ]", {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });
}

function centeredRect(bounds: Rectangle, width: number, height: number): Rectangle {
  // A modal can never be wider or taller than its host, so clamp before
  // centering; otherwise an oversized box spills past the right/bottom edge.
  const fittedWidth = Math.max(1, Math.min(width, bounds.width));
  const fittedHeight = Math.max(1, Math.min(height, bounds.height));
  return {
    column: bounds.column + Math.max(0, Math.floor((bounds.width - fittedWidth) / 2)),
    row: bounds.row + Math.max(0, Math.floor((bounds.height - fittedHeight) / 2)),
    width: fittedWidth,
    height: fittedHeight,
  };
}

/**
 * Fits a modal span to the space available. On a roomy desktop it yields the
 * preferred [min, max] size; on a cramped one it collapses to the room left
 * after the margin and never exceeds it — so a modal's minimum size can never
 * push it off a small screen.
 */
function fitModalSpan(available: number, min: number, max: number, margin: number): number {
  const room = Math.max(1, Math.floor(available) - margin);
  return Math.max(1, Math.min(room, Math.min(max, Math.max(min, room))));
}

/**
 * Lays out a modal's action buttons so they always stay inside the box. When
 * the box is wide enough they spread across the bottom row; when it is too
 * narrow they stack vertically instead of overlapping, which matters for
 * destructive choices where a mis-hit is costly. Buttons keep their declared
 * order, and each is clamped to the box width.
 */
/** Modal button geometry, from the library's responsive-stacking layout (WS-005). */
function modalButtonRects(rect: Rectangle, widths: readonly number[], gap = 2): Rectangle[] {
  return modalActionRects(rect, widths, gap).rects;
}

interface PaintedStyle {
  foreground: ExomuxRgb;
  background: ExomuxRgb;
  bold?: boolean;
}

/** Small paint buffer that caches ANSI style functions by exact cell style. */
/**
 * Marks the second column of a double-width glyph. An empty cell makes the ANSI
 * sink emit nothing there, which is exactly right: the glyph itself already
 * moved the real cursor across both columns.
 */
const EXOMUX_WIDE_GLYPH_FOLLOWER = "";

/** Decodes the occasional pre-encoded cell handed back by a composited widget. */
const exomuxCellDecoder = new TextDecoder();

/**
 * Terminal columns one glyph occupies. The desktop is modelled one column per
 * cell, so a double-width glyph that is not accounted for shifts every later
 * cell on the row and — because the canvas repaints differentially — the damage
 * persists until something forces a full repaint.
 */
export function exomuxGlyphColumns(glyph: string): 1 | 2 {
  const code = glyph.codePointAt(0);
  if (code === undefined || code < 0x80) return 1;
  // Measured once per distinct glyph. A background paints tens of thousands of
  // non-ASCII cells a second and they come from a handful of glyph sets, so the
  // uncached form spent more time measuring widths than drawing.
  const cached = glyphColumnCache.get(glyph);
  if (cached !== undefined) return cached;
  const columns = textWidth(glyph) > 1 ? 2 : 1;
  if (glyphColumnCache.size >= MAX_GLYPH_COLUMN_CACHE) glyphColumnCache.clear();
  glyphColumnCache.set(glyph, columns);
  return columns;
}

const MAX_GLYPH_COLUMN_CACHE = 4096;
const glyphColumnCache = new Map<string, 1 | 2>();

/**
 * Packs one painted style into a single exact integer key: 24 bits of
 * foreground, 24 of background, one of bold, well inside the 53 bits a Number
 * holds. The string form this replaced allocated three throwaway strings for
 * every cell painted, which at desktop scale was the single largest cost in the
 * frame.
 */
function paintedStyleKey(spec: PaintedStyle): number {
  const foreground = (spec.foreground[0] << 16) | (spec.foreground[1] << 8) | spec.foreground[2];
  const background = (spec.background[0] << 16) | (spec.background[1] << 8) | spec.background[2];
  return foreground * 33_554_432 + background * 2 + (spec.bold ? 1 : 0);
}

// Butterchurn's quantized palette alone can reach ~10k distinct keys
// (17 levels per channel x bold) on a fullscreen 383x101 desktop, so the
// cap must sit ABOVE the worst single-frame palette or the cache clears
// itself mid-frame and every cell re-runs createAnsiStyle — measured at
// ~38ms/frame of styling against a 16.7ms budget (034 UX-015).
const MAX_PAINT_STYLE_CACHE = 32768;
/**
 * Shared across painters and frames. A painter is rebuilt every repaint, so a
 * per-instance cache re-ran `createAnsiStyle` for every colour on every frame —
 * and an animated background paints hundreds of distinct colours per frame.
 */
const paintStyleCache = new Map<number, Style>();

function paintedStyle(spec: PaintedStyle): Style {
  const key = paintedStyleKey(spec);
  let style = paintStyleCache.get(key);
  if (style) return style;
  style = createAnsiStyle({ foreground: spec.foreground, background: spec.background, bold: spec.bold });
  // A long-lived session cannot grow this without limit — but overflow
  // evicts only the OLDEST half (Map iteration is insertion order), so a
  // pathological palette can never wipe the whole desktop's styles
  // mid-frame the way clear-all did.
  if (paintStyleCache.size >= MAX_PAINT_STYLE_CACHE) {
    let toEvict = MAX_PAINT_STYLE_CACHE >> 1;
    for (const staleKey of paintStyleCache.keys()) {
      if (toEvict <= 0) break;
      paintStyleCache.delete(staleKey);
      toEvict -= 1;
    }
  }
  paintStyleCache.set(key, style);
  return style;
}

class DesktopPainter {
  readonly rows: string[][];
  /** While set, every painted cell also deposits its scene-ground impression. */
  #depositGround?: ExomuxSceneGround;
  /** Ground deposited for a blitted cell whose colours cannot be decoded. */
  #depositFallback: ExomuxRgb = [0, 0, 0];

  constructor(readonly bounds: Rectangle, readonly theme: ExomuxThemeSpec) {
    const width = Math.max(0, bounds.width);
    this.rows = Array.from({ length: Math.max(0, bounds.height) }, () => new Array<string>(width).fill(" "));
  }

  /**
   * Turns on scene-ground deposits: while enabled (the window paint phase),
   * every painted cell records the colour impression it leaves so translucent
   * windows painted later blend against the real scene beneath them.
   */
  beginGroundDeposits(ground: ExomuxSceneGround, fallback: ExomuxRgb): void {
    this.#depositGround = ground;
    this.#depositFallback = fallback;
  }

  endGroundDeposits(): void {
    this.#depositGround = undefined;
  }

  cell(column: number, row: number, char: string, style: PaintedStyle): void {
    const localColumn = Math.floor(column - this.bounds.column);
    const localRow = Math.floor(row - this.bounds.row);
    if (localRow < 0 || localRow >= this.rows.length || localColumn < 0 || localColumn >= this.bounds.width) return;
    const target = this.rows[localRow]!;
    const glyph = char || " ";
    const paint = this.#style(style);
    // Overwriting either half of an existing double-width glyph has to retire
    // the other half, or its two-column render desynchronises every later cell.
    this.#retireWideGlyphAt(target, localColumn);
    if (exomuxGlyphColumns(glyph) === 1) {
      target[localColumn] = paint(glyph);
      this.#depositGround?.deposit(column, row, exomuxDepositColor(glyph, style.foreground, style.background));
      return;
    }
    // A double-width glyph on the final column has nowhere to put its follower,
    // so it degrades to a blank rather than spilling past the desktop edge.
    if (localColumn + 1 >= this.bounds.width) {
      target[localColumn] = paint(" ");
      this.#depositGround?.deposit(column, row, style.background);
      return;
    }
    // The follower is left empty so the sink emits nothing for it and the real
    // cursor, already advanced two columns by the glyph, stays in step.
    this.#retireWideGlyphAt(target, localColumn + 1);
    target[localColumn] = paint(glyph);
    target[localColumn + 1] = EXOMUX_WIDE_GLYPH_FOLLOWER;
    if (this.#depositGround) {
      // A wide glyph covers both columns, so both take its impression.
      const impression = exomuxDepositColor(glyph, style.foreground, style.background);
      this.#depositGround.deposit(column, row, impression);
      this.#depositGround.deposit(column + 1, row, impression);
    }
  }

  write(column: number, row: number, text: string, style: PaintedStyle): void {
    let cursor = column;
    for (const char of text) {
      this.cell(cursor, row, char, style);
      cursor += exomuxGlyphColumns(char);
    }
  }

  /**
   * Blits an already-styled cell verbatim. Composited widget surfaces hand back
   * fully-styled cells (their own SGR-wrapped glyph), so they bypass the style
   * pipeline `cell()` runs and land straight in the grid.
   */
  rawCell(column: number, row: number, cell: string | Uint8Array): void {
    const localColumn = Math.floor(column - this.bounds.column);
    const localRow = Math.floor(row - this.bounds.row);
    if (localRow < 0 || localRow >= this.rows.length || localColumn < 0 || localColumn >= this.bounds.width) return;
    const target = this.rows[localRow]!;
    this.#retireWideGlyphAt(target, localColumn);
    target[localColumn] = typeof cell === "string" ? cell : exomuxCellDecoder.decode(cell);
    if (this.#depositGround) {
      // Structured decode instead of SGR string surgery; a cell that cannot be
      // decoded still deposits the window's nominal ground so nothing stale
      // survives beneath a blitted widget.
      const data = widgetSurfaceCellData(target[localColumn]);
      const background = data?.background ?? this.#depositFallback;
      const impression = data
        ? exomuxDepositColor(data.glyph, data.foreground ?? background, background)
        : this.#depositFallback;
      this.#depositGround.deposit(column, row, impression);
    }
  }

  /** Blanks whichever half of a straddling double-width glyph touches `column`. */
  #retireWideGlyphAt(target: string[], column: number): void {
    if (target[column] === EXOMUX_WIDE_GLYPH_FOLLOWER) {
      if (column > 0) target[column - 1] = " ";
    } else if (target[column + 1] === EXOMUX_WIDE_GLYPH_FOLLOWER) {
      target[column + 1] = " ";
    }
  }

  writeRight(row: number, text: string, style: PaintedStyle): void {
    const fitted = fitText(text, this.bounds.width);
    this.write(this.bounds.column + Math.max(0, this.bounds.width - fitted.length), row, fitted, style);
  }

  fill(rect: Rectangle, char: string, style: PaintedStyle): void {
    const rowEnd = rect.row + rect.height;
    const columnEnd = rect.column + rect.width;
    // A single-column glyph is the overwhelmingly common case, and it is the one
    // that covers the whole desktop body every frame. Resolving the style and
    // the painted string once for the whole rect turns tens of thousands of
    // cache lookups per frame into one.
    if (exomuxGlyphColumns(char || " ") === 1) {
      const painted = this.#style(style)(char || " ");
      const firstRow = Math.max(0, Math.floor(rect.row - this.bounds.row));
      const lastRow = Math.min(this.rows.length, Math.floor(rowEnd - this.bounds.row));
      const firstColumn = Math.max(0, Math.floor(rect.column - this.bounds.column));
      const lastColumn = Math.min(this.bounds.width, Math.floor(columnEnd - this.bounds.column));
      // One impression serves the whole rect: same glyph, same style.
      const impression = this.#depositGround
        ? exomuxDepositColor(char || " ", style.foreground, style.background)
        : undefined;
      for (let row = firstRow; row < lastRow; row += 1) {
        const target = this.rows[row]!;
        for (let column = firstColumn; column < lastColumn; column += 1) {
          // Still has to retire a straddling wide glyph, or its follower would
          // survive underneath and desynchronise the rest of the row.
          this.#retireWideGlyphAt(target, column);
          target[column] = painted;
          if (impression) {
            this.#depositGround!.deposit(this.bounds.column + column, this.bounds.row + row, impression);
          }
        }
      }
      return;
    }
    for (let row = rect.row; row < rowEnd; row += 1) {
      for (let column = rect.column; column < columnEnd; column += 1) {
        this.cell(column, row, char, style);
      }
    }
  }

  /** Draws a box frame with distinct corner and edge glyphs. */
  borderBox(rect: Rectangle, glyphs: ExomuxBorderGlyphs, style: PaintedStyle): void {
    if (rect.width <= 0 || rect.height <= 0) return;
    const right = rect.column + rect.width - 1;
    const bottom = rect.row + rect.height - 1;
    for (let column = rect.column + 1; column < right; column += 1) {
      this.cell(column, rect.row, glyphs.top, style);
      this.cell(column, bottom, glyphs.bottom, style);
    }
    for (let row = rect.row + 1; row < bottom; row += 1) {
      this.cell(rect.column, row, glyphs.left, style);
      this.cell(right, row, glyphs.right, style);
    }
    this.cell(rect.column, rect.row, glyphs.topLeft, style);
    this.cell(right, rect.row, glyphs.topRight, style);
    this.cell(rect.column, bottom, glyphs.bottomLeft, style);
    this.cell(right, bottom, glyphs.bottomRight, style);
  }

  frame(rect: Rectangle, char: string, style: PaintedStyle): void {
    if (rect.width <= 0 || rect.height <= 0) return;
    for (let column = rect.column; column < rect.column + rect.width; column += 1) {
      this.cell(column, rect.row, char, style);
      this.cell(column, rect.row + rect.height - 1, char, style);
    }
    for (let row = rect.row; row < rect.row + rect.height; row += 1) {
      this.cell(rect.column, row, char, style);
      this.cell(rect.column + rect.width - 1, row, char, style);
    }
  }

  #style(spec: PaintedStyle): Style {
    return paintedStyle(spec);
  }
}

interface ExomuxDesktopSurfaceOptions extends ComponentOptions {
  readonly revision: Computed<string>;
  readonly render: () => string[][];
}

/** One component/one draw object for the complete dynamic multiplexer desktop. */
class ExomuxDesktopSurface extends Component {
  declare drawnObjects: { desktop: ExomuxDesktopDrawObject };

  constructor(private readonly options: ExomuxDesktopSurfaceOptions) {
    super(options);
  }

  override draw(): void {
    super.draw();
    const desktop = new ExomuxDesktopDrawObject({
      canvas: this.tui.canvas,
      view: this.view,
      style: this.style,
      zIndex: this.zIndex,
      rectangle: this.rectangle,
      revision: this.options.revision,
      render: this.options.render,
    });
    this.drawnObjects.desktop = desktop;
    desktop.draw();
  }
}

interface ExomuxDesktopDrawObjectOptions {
  canvas: DrawObject["canvas"];
  view: DrawObject["view"];
  style: DrawObject["style"];
  zIndex: DrawObject["zIndex"];
  rectangle: SignalOfObject<Rectangle>;
  revision: Computed<string>;
  render: () => string[][];
}

/** Retained canvas primitive that updates the desktop as coalesced row ranges. */
class ExomuxDesktopDrawObject extends DrawObject<"exomux-desktop"> {
  declare rectangle: SignalOfObject<Rectangle>;
  readonly #revision: Computed<string>;
  readonly #renderDesktop: () => string[][];
  readonly #lifecycle = new AbortController();
  #previousRows: string[][] = [];
  #forceFullPaint = true;

  constructor(options: ExomuxDesktopDrawObjectOptions) {
    super("exomux-desktop", options);
    this.rectangle = options.rectangle;
    this.#revision = options.revision;
    this.#renderDesktop = options.render;
  }

  override draw(): void {
    this.rectangle.subscribe(() => this.#invalidate(true), this.#lifecycle.signal);
    this.#revision.subscribe(() => this.#invalidate(false), this.#lifecycle.signal);
    super.draw();
  }

  override erase(): void {
    this.#lifecycle.abort();
    super.erase();
  }

  override render(): void {
    this.#forceFullPaint = true;
    this.rerender();
  }

  override rerender(): void {
    const rectangle = this.rectangle.peek();
    const rows = this.#renderDesktop();
    const previousRows = this.#previousRows;
    const canvasSize = this.canvas.size.peek();
    const rowEnd = Math.min(canvasSize.rows, rectangle.row + rectangle.height);
    const columnEnd = Math.min(canvasSize.columns, rectangle.column + rectangle.width);
    for (let row = Math.max(0, rectangle.row); row < rowEnd; row += 1) {
      const source = rows[row - rectangle.row] ?? [];
      const previous = previousRows[row - rectangle.row] ?? [];
      const frameRow = this.canvas.frameBuffer[row] ??= [];
      const omitted = this.omitCells[row];
      const forced = this.rerenderCells[row];
      let rangeStart = -1;
      for (let column = Math.max(0, rectangle.column); column < columnEnd; column += 1) {
        const sourceColumn = column - rectangle.column;
        const value = source[sourceColumn] ?? " ";
        const changed = this.#forceFullPaint || forced?.has(column) || previous[sourceColumn] !== value;
        if (!changed || omitted?.has(column)) {
          if (rangeStart !== -1) {
            (this.canvas.rerenderRanges[row] ??= []).push({ row, startColumn: rangeStart, endColumn: column });
            rangeStart = -1;
          }
          continue;
        }
        frameRow[column] = value;
        if (rangeStart === -1) rangeStart = column;
      }
      if (rangeStart !== -1) {
        (this.canvas.rerenderRanges[row] ??= []).push({ row, startColumn: rangeStart, endColumn: columnEnd });
      }
      forced?.clear();
    }
    this.#previousRows = rows;
    this.#forceFullPaint = false;
  }

  #invalidate(moved: boolean): void {
    if (moved) {
      this.moved = true;
      this.#forceFullPaint = true;
    }
    if (!this.updated) return;
    this.updated = false;
    this.canvas.updateObjects.push(this);
    for (const objectUnder of this.objectsUnder) {
      if (!objectUnder.updated) continue;
      objectUnder.updated = false;
      this.canvas.updateObjects.push(objectUnder);
    }
  }
}

/**
 * Top item index of the sessions list viewport: an explicit wheel-scrolled top,
 * or the selection-following window otherwise. One function serves painting,
 * hit-testing, and wheel stepping — and matches the composited List's own
 * window math — so they can never disagree.
 */
export function exomuxSessionListWindowStart(
  length: number,
  selectedIndex: number,
  height: number,
  scrollTop: number,
): number {
  const safeHeight = Math.max(0, Math.floor(height));
  if (scrollTop < 0) return selectionWindow(length, clampIndex(selectedIndex, length), safeHeight).start;
  return listWindowFromTop(length, scrollTop, safeHeight).start;
}

function managerSessionAt(
  controller: ExomuxController,
  projection: WorkbenchWindowHostProjection,
  selectedSessionIndex: number,
  column: number,
  row: number,
  scrollTop = -1,
): ExomuxManagerSessionHit | undefined {
  const manager = projection.windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID);
  if (!manager || !contains(manager.clientRect, column, row)) return undefined;
  const rows = exomuxManagerRows(controller);
  const available = Math.max(0, manager.clientRect.height - SESSION_LIST_START);
  const relativeRow = row - manager.clientRect.row;
  if (relativeRow < SESSION_LIST_START || relativeRow >= SESSION_LIST_START + available) return undefined;
  const offset = exomuxSessionListWindowStart(rows.length, selectedSessionIndex, available, scrollTop);
  const target = rows[offset + relativeRow - SESSION_LIST_START];
  if (!target || target.kind === "heading") return undefined;
  if (target.kind === "host-session") return { kind: "host-session", name: target.name };
  const index = controller.sessions.peek().findIndex((session) => session.id === target.session.id);
  return index >= 0 ? { kind: "terminal", session: target.session, index } : undefined;
}

function clientWindowAt(
  projection: WorkbenchWindowHostProjection,
  column: number,
  row: number,
): WorkbenchWindowChromeProjection | undefined {
  for (let index = projection.floatingWindows.length - 1; index >= 0; index -= 1) {
    const window = projection.floatingWindows[index]!;
    if (!contains(window.rect, column, row)) continue;
    return contains(window.clientRect, column, row) ? window : undefined;
  }
  for (let index = projection.tiledWindows.length - 1; index >= 0; index -= 1) {
    const window = projection.tiledWindows[index]!;
    if (!contains(window.rect, column, row)) continue;
    return contains(window.clientRect, column, row) ? window : undefined;
  }
  return undefined;
}

/**
 * Widens a top-bar target for touch without growing it vertically. The header
 * is a single row now, so a vertical expansion would reach into the window
 * title bars immediately beneath it and swallow their controls.
 */
function coarseMenuRect(rect: Rectangle): Rectangle {
  return { column: rect.column - 1, row: rect.row, width: rect.width + 2, height: rect.height };
}

function menuAt(column: number, row: number, coarse: boolean, bounds: Rectangle): ExomuxMenuId | undefined {
  // Only quit is still a direct top-bar command; the rest live in the dropdown.
  const entries = [["quit", menuQuitRect(bounds)]] as const;
  for (const [id, rect] of entries) {
    if (contains(coarse ? coarseMenuRect(rect) : rect, column, row)) return id;
  }
  return undefined;
}

function menuRect(id: ExomuxMenuId, bounds: Rectangle): Rectangle {
  switch (id) {
    case "quit":
      return menuQuitRect(bounds);
    default:
      return START_BUTTON;
  }
}

/** Returns the session whose `config` titlebar button covers one cell, when any. */
function configControlSessionAt(
  projection: WorkbenchWindowHostProjection,
  column: number,
  row: number,
): string | undefined {
  const windows = [...projection.tiledWindows, ...projection.floatingWindows];
  for (let index = windows.length - 1; index >= 0; index -= 1) {
    const window = windows[index]!;
    if (!contains(window.rect, column, row)) continue;
    for (const control of window.controls) {
      if (control.kind === "config" && contains(control.hitRect, column, row)) {
        return exomuxSessionIdFromWindow(window.id);
      }
    }
    return undefined;
  }
  return undefined;
}

/**
 * The block cursor's glyph when it sits on a floating window's draggable border:
 * the title-bar row moves the window, the side/bottom edges and bottom corners
 * resize it. Returns `undefined` over content or bare desktop (a solid block).
 */
/** The contextual drag glyph for one desktop cell (now the exotui helper). */
export const resizeGlyphAt = windowResizeGlyphAt;

/** Block-cursor render descriptor (now the exotui software-cursor helper). */
const exomuxBlockCursorRender = softwareCursorRender;

/**
 * Returns the window whose title bar covers one cell, when any. The title bar is
 * the window's top row off its client area and off its titlebar controls, so a
 * double-click there can toggle maximize without stealing a button's own click.
 */
function touchWindowCommandAt(
  projection: WorkbenchWindowHostProjection,
  column: number,
  row: number,
): Extract<ExomuxTouchTarget, { kind: "window-command" }> | undefined {
  for (let index = projection.shelf.length - 1; index >= 0; index -= 1) {
    const item = projection.shelf[index]!;
    if (item.rect && contains(item.rect, column, row)) {
      return { kind: "window-command", command: item.command, hitRect: item.rect };
    }
  }
  const windows = [...projection.tiledWindows, ...projection.floatingWindows];
  for (let index = windows.length - 1; index >= 0; index -= 1) {
    const window = windows[index]!;
    if (!contains(window.rect, column, row)) continue;
    for (let controlIndex = window.controls.length - 1; controlIndex >= 0; controlIndex -= 1) {
      const control = window.controls[controlIndex]!;
      if (control.command && contains(control.hitRect, column, row)) {
        return { kind: "window-command", command: control.command, hitRect: control.hitRect };
      }
    }
    return undefined;
  }
  return undefined;
}

function rememberTouchGesture(
  gestures: Map<number, ExomuxTouchGesture>,
  event: PointerInputEvent,
  point: { x: number; y: number },
  target: ExomuxTouchTarget,
): void {
  if (!gestures.has(event.pointerId) && gestures.size >= MAX_TOUCH_GESTURES) {
    const oldest = gestures.keys().next().value;
    if (oldest !== undefined) gestures.delete(oldest);
  }
  gestures.set(event.pointerId, {
    target,
    startColumn: point.x,
    startRow: point.y,
    startLocalX: event.coordinates.local?.x,
    startLocalY: event.coordinates.local?.y,
    lastColumn: point.x,
    lastRow: point.y,
    moved: false,
  });
}

function updateTouchGesture(
  gesture: ExomuxTouchGesture,
  event: PointerInputEvent,
  point: { x: number; y: number } | undefined,
  excursion?: ExomuxPointerMoveExcursion,
): void {
  if (point) {
    if (point.x !== gesture.startColumn || point.y !== gesture.startRow) gesture.moved = true;
    gesture.lastColumn = point.x;
    gesture.lastRow = point.y;
  }
  const local = event.coordinates.local;
  if (
    local && gesture.startLocalX !== undefined && gesture.startLocalY !== undefined &&
    Math.hypot(local.x - gesture.startLocalX, local.y - gesture.startLocalY) >= 8
  ) {
    gesture.moved = true;
  }
  if (
    excursion?.minColumn !== undefined && excursion.maxColumn !== undefined &&
    (excursion.minColumn !== gesture.startColumn || excursion.maxColumn !== gesture.startColumn)
  ) {
    gesture.moved = true;
  }
  if (
    excursion?.minRow !== undefined && excursion.maxRow !== undefined &&
    (excursion.minRow !== gesture.startRow || excursion.maxRow !== gesture.startRow)
  ) {
    gesture.moved = true;
  }
  if (
    gesture.startLocalX !== undefined && excursion?.minLocalX !== undefined && excursion.maxLocalX !== undefined &&
    Math.max(
        Math.abs(excursion.minLocalX - gesture.startLocalX),
        Math.abs(excursion.maxLocalX - gesture.startLocalX),
      ) >= 8
  ) {
    gesture.moved = true;
  }
  if (
    gesture.startLocalY !== undefined && excursion?.minLocalY !== undefined && excursion.maxLocalY !== undefined &&
    Math.max(
        Math.abs(excursion.minLocalY - gesture.startLocalY),
        Math.abs(excursion.maxLocalY - gesture.startLocalY),
      ) >= 8
  ) {
    gesture.moved = true;
  }
}

function pointerExcursion(event: PointerInputEvent): ExomuxPointerMoveExcursion {
  const excursion: ExomuxPointerMoveExcursion = {};
  mergePointerExcursion(excursion, event);
  return excursion;
}

function mergePointerExcursion(excursion: ExomuxPointerMoveExcursion, event: PointerInputEvent): void {
  const cell = event.coordinates.cell;
  if (cell) {
    excursion.minColumn = Math.min(excursion.minColumn ?? cell.x, cell.x);
    excursion.maxColumn = Math.max(excursion.maxColumn ?? cell.x, cell.x);
    excursion.minRow = Math.min(excursion.minRow ?? cell.y, cell.y);
    excursion.maxRow = Math.max(excursion.maxRow ?? cell.y, cell.y);
  }
  const local = event.coordinates.local;
  if (local) {
    excursion.minLocalX = Math.min(excursion.minLocalX ?? local.x, local.x);
    excursion.maxLocalX = Math.max(excursion.maxLocalX ?? local.x, local.x);
    excursion.minLocalY = Math.min(excursion.minLocalY ?? local.y, local.y);
    excursion.maxLocalY = Math.max(excursion.maxLocalY ?? local.y, local.y);
  }
}

function primaryPointerActivation(event: PointerInputEvent): boolean {
  return event.primary && (event.button === 0 || (event.device !== "mouse" && event.button === null));
}

function contains(rect: Rectangle, column: number, row: number): boolean {
  return column >= rect.column && row >= rect.row && column < rect.column + rect.width && row < rect.row + rect.height;
}

/**
 * Truncates to a terminal-column budget, not a code-unit count. Measuring by
 * `length` let a double-width title overflow its region, and slicing by index
 * could cut a surrogate pair in half; iterating by code point avoids both.
 */
function fitText(value: string, width: number): string {
  const safeWidth = Math.max(0, Math.floor(width));
  if (safeWidth === 0) return "";
  let columns = 0;
  for (const char of value) columns += exomuxGlyphColumns(char);
  if (columns <= safeWidth) return value;
  const ellipsis = safeWidth > 3 ? "..." : "";
  const budget = safeWidth - ellipsis.length;
  let fitted = "";
  let used = 0;
  for (const char of value) {
    const glyphWidth = exomuxGlyphColumns(char);
    if (used + glyphWidth > budget) break;
    fitted += char;
    used += glyphWidth;
  }
  return fitted + ellipsis;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(index)));
}

function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((Math.floor(index) % length) + length) % length;
}

function identityStyle(value: string): string {
  return value;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
