// Copyright 2023 Im-Beast. MIT license.

import { createTerminalApp, type TerminalApp, type TerminalAppOptions } from "@ubernaut/deno-tui/app";
import {
  Component,
  type ComponentOptions,
  Computed,
  createAnsiStyle,
  DrawObject,
  encodeTerminalKeyPress,
  type PointerInputEvent,
  type Rectangle,
  Signal,
  type SignalOfObject,
  type Style,
  type TreeRow,
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
  exomuxNetworkNodeHostShellTarget,
  exomuxNetworkNodeHostTarget,
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
  type ExomuxBackgroundId,
  exomuxBackgroundSettingsFor,
  type ExomuxBorderGlyphs,
  exomuxBorderGlyphs,
  exomuxResolvedOpacity,
  exomuxResolvedScrollLines,
  type ExomuxRgb,
  exomuxSessionIdFromWindow,
  type ExomuxSessionSummary,
  type ExomuxThemeSpec,
  exomuxWindowId,
  type ExomuxWindowSettings,
} from "./model.ts";
import { textWidth } from "@ubernaut/deno-tui";
import {
  exomuxBackgroundOvergrows,
  type ExomuxOvergrowthEdges,
  exomuxOvergrowthEdges,
  exomuxOvergrowthRatio,
  ExomuxOvergrowthTracker,
  exomuxOvergrowthVisible,
} from "./overgrowth.ts";
import { ExomuxOperationQueue } from "./operation_queue.ts";
import { EXOMUX_PROTOCOL_LIMITS } from "./protocol.ts";
import {
  type ExomuxSettingsButtonCells,
  type ExomuxSettingsButtonSpec,
  ExomuxSettingsWidgets,
} from "./settings_widgets.ts";
import { ExomuxSettingsSurface } from "./settings_surface.ts";
import { type ExomuxOptionControlSpec, ExomuxSettingsOptions } from "./settings_options.ts";
import { ExomuxSessionNameField } from "./session_name_field.ts";
import {
  exomuxPointerCancellationEvent as pointerCancellationEvent,
  ExomuxTerminalMouseRouter,
} from "./terminal_mouse.ts";
import { exomuxTerminalForegroundRgb, exomuxTerminalRgb } from "./terminal_palette.ts";
import {
  type ExomuxAnimatedBackground,
  exomuxBackgroundAcceptsPicks,
  type ExomuxBackgroundCell,
  exomuxBackgroundHasOverlay,
  exomuxBackgroundHasPresets,
  releaseExomuxIdleBackgrounds,
} from "./background.ts";
import { ExomuxBiomechField } from "./biomech_background.ts";
import { EXOMUX_BUTTERCHURN_PRESETS, ExomuxButterchurnField } from "./butterchurn_background.ts";
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
const MAX_TOUCH_GESTURES = 8;
const CLASSIFIED_INPUT_PIPELINE_DEPTH = 4;
const MAX_CLASSIFIED_INPUT_BYTES = EXOMUX_PROTOCOL_LIMITS.inputBytes * CLASSIFIED_INPUT_PIPELINE_DEPTH;
const MIN_CLASSIFIED_KEY_RESERVATION_BYTES = 64;

/** Keeps animation behind explicit input and control work without treating child output as interaction. */
export function exomuxMetaballsMayAdvance(
  now: number,
  lastInputActivityAt: number,
  hasPendingBarrier: boolean,
): boolean {
  return !hasPendingBarrier && now - lastInputActivityAt >= EXOMUX_METABALL_FRAME_INTERVAL_MS;
}

type ExomuxMenuId = "new" | "network" | "sessions" | "config" | "help" | "quit";

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

/** Lays out the start-menu dropdown hanging below the top-left button. */
export function exomuxStartMenuLayout(
  bounds: Rectangle,
  anchor?: { readonly column: number; readonly row: number },
): ExomuxStartMenuLayout {
  const labelWidth = START_MENU_ITEMS.reduce((max, item) => Math.max(max, textWidth(item.label)), 0);
  const width = Math.min(Math.max(18, labelWidth + 4), Math.max(4, bounds.width));
  const height = Math.min(START_MENU_ITEMS.length + 2, Math.max(3, bounds.height - 1));
  // Docked under the start button by default; a right-click anchors it at the
  // cursor, clamped so the whole panel stays on screen.
  const column = anchor
    ? Math.max(bounds.column, Math.min(anchor.column, bounds.column + bounds.width - width))
    : bounds.column;
  const row = anchor ? Math.max(bounds.row, Math.min(anchor.row, bounds.row + bounds.height - height)) : bounds.row + 1;
  const panelRect: Rectangle = { column, row, width, height };
  const items = START_MENU_ITEMS.map((item, index) => ({
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

interface ExomuxManagerSessionHit {
  readonly session: ExomuxSessionSummary;
  readonly index: number;
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
  const backgroundSetPointer = (point: { column: number; row: number }): void => {
    metaballs.setPointer(point);
    activeBackgroundField()?.setPointer(point);
  };
  const backgroundClearPointer = (): void => {
    metaballs.clearPointer();
    activeBackgroundField()?.clearPointer();
  };
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
  const projectionOptions = (): WorkbenchWindowHostProjectionOptions => ({
    separatorHitSize: 3,
    shelfBounds: shelfBounds.peek(),
  });
  const windowProjection = own(
    new Computed(() =>
      controller.windowHost.project(bodyRect.value, {
        separatorHitSize: 3,
        shelfBounds: shelfBounds.value,
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
  const sessionNameField = own(
    new ExomuxSessionNameField(
      () => {
        settingsWidgetRevision.value += 1;
      },
      (text) => controller.setSessionRenameDraft(text),
      () => {
        void controller.commitSessionRename().then(() => syncWindows());
      },
    ),
  );
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
    if (!exomuxMetaballsMayAdvance(now, lastInputActivityAt, operationQueue.hasPendingBarrier())) return;
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
    if (controller.backgroundId.peek() !== "butterchurn") return EXOMUX_METABALL_FRAME_INTERVAL_MS;
    const values = exomuxBackgroundSettingsFor(controller.backgroundSettings.peek(), "butterchurn");
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

  const renderRevision = own(
    new Computed(() => {
      const projection = windowProjection.value;
      const sessions = controller.sessions.value;
      const fragments: Array<string | number | boolean | undefined> = [
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
        controller.windowHost.viewRevision.value,
        controller.windowHost.commitRevision.value,
        // Every input-driven modal and menu state, so the desktop repaints on
        // interaction even when the background is static (a picture) and no
        // longer forces a repaint every animation tick.
        controller.startMenuVisible.value,
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
        controller.networkTree.selectedIndex.value,
        controller.backgroundConfigVisible.value,
        controller.backgroundConfigPane.value,
        controller.backgroundConfigOptionIndex.value,
        controller.backgroundConfigListIndex.value,
        controller.backgroundBrowsePath.value,
        controller.backgroundSettingsRevision.value,
        terminalRenderRevision.value,
        settingsWidgetRevision.value,
        metaballRevision.value,
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
    render: () =>
      renderExomuxDesktop({
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
        backgroundField: activeBackgroundField(),
        ...(overgrowthRatios.size > 0
          ? {
            overgrowth: {
              ratios: overgrowthRatios,
              edges: exomuxOvergrowthEdges(controller.backgroundId.peek()),
            },
          }
          : {}),
      }),
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
    }
    await syncWindows();
  };

  const activateNetworkNode = async (row: TreeRow): Promise<void> => {
    const sessionId = exomuxNetworkNodeSessionId(row.id);
    if (sessionId) {
      await controller.openSession(sessionId, bodyRect.peek());
      await syncWindows();
      return;
    }
    const hostShellTarget = exomuxNetworkNodeHostShellTarget(row.id);
    if (hostShellTarget) {
      await controller.spawnNetworkShell(hostShellTarget, hostShellTarget, bodyRect.peek());
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
      await controller.openSession(action.sessionId, bodyRect.peek());
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
    const layout = exomuxGlobalConfigLayout(
      clientRect,
      themeIndex,
      backgroundIndex,
      controller.shaderOptionRows().length,
    );
    if (contains(layout.sessionNameRect, column, row)) {
      controller.beginSessionRename();
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
      controller.cycleSettingsOption(index, 1);
      return true;
    }
    return contains(clientRect, column, row);
  };

  const activateManagerHit = async (hit: ExomuxManagerSessionHit): Promise<void> => {
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
      const sessions = controller.sessions.peek();
      if (sessions.length === 0) return true;
      // Lists move one selection per notch regardless of scroll speed, which is
      // the natural feel for a menu.
      selectedSessionIndex.value = clampIndex(
        selectedSessionIndex.peek() + listScrollStep(windowId, delta),
        sessions.length,
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

  const scrollWindowAt = (column: number, row: number, delta: number): boolean => {
    const window = clientWindowAt(windowProjection.peek(), column, row);
    return window ? scrollClientWindow(window.id, delta) : false;
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
      const layout = exomuxStartMenuLayout(app.tui.rectangle.peek(), controller.startMenuAnchor.peek());
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
    if (controller.backgroundConfigVisible.peek()) {
      const specs = EXOMUX_BACKGROUND_SETTING_SPECS[controller.backgroundId.peek()] ?? [];
      const list = exomuxBackgroundConfigList(controller);
      const listIndex = Math.min(
        Math.max(0, controller.backgroundConfigListIndex.peek()),
        Math.max(0, list.length - 1),
      );
      const layout = exomuxBackgroundConfigLayout(windowProjection.peek().bounds, list.length, listIndex, specs.length);
      if (contains(layout.closeRect, column, row) || !contains(layout.rect, column, row)) {
        controller.closeBackgroundConfig();
        return true;
      }
      const hitList = layout.listRows.find((candidate) => contains(candidate.rect, column, row));
      if (hitList) {
        controller.backgroundConfigPane.value = "list";
        controller.backgroundConfigListIndex.value = hitList.index;
        activateBackgroundConfigRow(list[hitList.index]);
        return true;
      }
      const optionAt = layout.optionRows.findIndex((candidate) => contains(candidate, column, row));
      if (optionAt >= 0 && specs[optionAt]) {
        controller.backgroundConfigPane.value = "options";
        controller.backgroundConfigOptionIndex.value = optionAt;
        controller.cycleBackgroundSetting(specs[optionAt]!.id, 1);
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

    if (contains(shelfBounds.peek(), event.x, event.y)) {
      if (!event.drag && !event.release && event.button === 0) {
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
        await enqueue(() => controller.openStartMenu({ column: event.x, row: event.y }));
        return true;
      }
    }

    // Geometry gestures are local and synchronous. Do not make title-bar
    // motion wait behind PTY ACKs; child bytes retain their own ordered lane.
    const projectionBefore = windowProjection.peek();
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

  const routeWindowScroll = (event: MouseScrollEvent): Promise<boolean> => {
    backgroundSetPointer({ column: event.x, row: event.y });
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
      const layout = exomuxStartMenuLayout(app.tui.rectangle.peek(), controller.startMenuAnchor.peek());
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
        controller.toggleStartMenu();
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
  unsubscribers.push(app.mouse.register({
    id: "exomux-modal",
    bounds: () => app.tui.rectangle.peek(),
    zIndex: 30_000,
    disabled: () => !modalOpen(),
    captureDrag: true,
    onPress: (event) => event.button === 0 ? routeModalActivation(event.x, event.y) : true,
    onDrag: () => true,
    onRelease: () => true,
    onScroll: () => true,
  }));
  // Only two always-live top-bar controls remain: the start button and quit.
  // Everything else is a row inside the dropdown, handled by the modal catcher.
  unsubscribers.push(
    registerMenuTarget(app, "start", START_BUTTON, () =>
      enqueue(() => {
        controller.toggleStartMenu();
      }), modalOpen),
  );
  unsubscribers.push(
    registerMenuTarget(
      app,
      "quit",
      () => menuQuitRect(app.tui.rectangle.peek()),
      () => activateMenu("quit"),
      modalOpen,
    ),
  );

  const handleNetworkKey = async (event: KeyPressEvent): Promise<boolean> => {
    if (controller.windowHost.controller.inspect().activeWindowId !== EXOMUX_NETWORK_WINDOW_ID) return false;
    const tree = controller.networkTree;
    if (event.key.toLowerCase() === "r" && !event.ctrl && !event.meta) {
      void controller.refreshNetwork().catch(() => undefined);
      return true;
    }
    if (event.key === "return") {
      const row = tree.selected();
      if (!row) return true;
      if (row.hasChildren) tree.toggleActive();
      else await activateNetworkNode(row);
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
    if (controller.startMenuVisible.peek()) {
      if (event.key === "escape" || event.key.toLowerCase() === "q") controller.closeStartMenu();
      return;
    }
    if (controller.helpVisible.peek()) {
      if (event.key === "escape" || event.key === "?" || event.key.toLowerCase() === "q") {
        controller.closeHelp();
      }
      return;
    }
    if (controller.pendingKillSessionId.peek()) {
      if (event.key === "return" || event.key.toLowerCase() === "y") {
        await controller.confirmKillSession();
        await syncWindows();
      } else if (event.key === "escape" || event.key.toLowerCase() === "n") {
        controller.cancelKillSession();
      }
      return;
    }
    if (controller.quitModalVisible.peek()) {
      if (event.key === "escape" || event.key.toLowerCase() === "c") {
        controller.cancelQuitModal();
      } else if (event.key === "return" || event.key.toLowerCase() === "d") {
        requestClientExit(false);
      } else if (event.key.toLowerCase() === "t") {
        requestClientExit(true);
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
      } else if (event.key === "return" || event.key === "space") {
        if (inList) activateBackgroundConfigRow(list[controller.backgroundConfigListIndex.peek()]);
        else if (settingId) controller.cycleBackgroundSetting(settingId, 1);
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
      // The modal hosts a password field, so printable keys type into it;
      // only Enter/Escape/Backspace act. "Paste path" stays on its button.
      if (event.key === "return") {
        void controller.confirmScpTransfer(bodyRect.peek());
      } else if (event.key === "escape") {
        controller.cancelScpTransfer(false);
      } else if (event.key === "backspace") {
        controller.backspaceScpPassword();
      } else if (event.key === "space") {
        controller.appendScpPassword(" ");
      } else if (!event.ctrl && !event.meta && event.key.length === 1) {
        controller.appendScpPassword(event.shift ? event.key.toUpperCase() : event.key);
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

function registerMenuTarget(
  app: TerminalApp<ExomuxAppAction>,
  id: string,
  bounds: Rectangle | (() => Rectangle),
  activate: () => void | Promise<void>,
  disabled: () => boolean,
): () => void {
  return app.mouse.register({
    id: `exomux-menu-${id}`,
    bounds,
    zIndex: 20_000,
    disabled,
    onPress: (event) => {
      if (event.button !== 0 || event.release) return false;
      void activate();
      return true;
    },
  });
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
  if (event.meta || controller.windowHost.inspect().switcherOpen) return true;
  const activeWindowId = controller.windowHost.controller.inspect().activeWindowId;
  if (activeWindowId === EXOMUX_NETWORK_WINDOW_ID) {
    return event.key === "up" || event.key === "down" || event.key === "left" || event.key === "right" ||
      event.key === "return" || event.key === "space" || event.key === "delete" || event.key === "pageup" ||
      event.key === "pagedown" || event.key === "home" || event.key === "end" || event.key.toLowerCase() === "r";
  }
  if (activeWindowId === EXOMUX_SETTINGS_WINDOW_ID) {
    // While editing the session name the field captures every printable key.
    if (controller.sessionNameDraft.peek() !== undefined) return true;
    return event.key === "up" || event.key === "down" || event.key === "left" || event.key === "right" ||
      event.key === "return" || event.key === "space" || event.key === "tab" || event.key === "escape" ||
      event.key.toLowerCase() === "q" || event.key.toLowerCase() === "b";
  }
  if (activeWindowId !== EXOMUX_SESSIONS_WINDOW_ID) return false;
  return event.key === "up" || event.key === "down" || event.key === "return" || event.key === "space" ||
    event.key === "delete";
}

interface RenderExomuxDesktopOptions {
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
  sessionNameField?: ExomuxSessionNameField;
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

/** Resolves a window cell's ground: its surface, or the desktop showing through. */
type ExomuxGround = (column: number, row: number) => ExomuxRgb;

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
  // what shows through a window is exactly what surrounds it.
  const backdrop: ExomuxBackdrop = (column, row) => {
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

  for (const window of projection.tiledWindows) {
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
    );
  }
  const borderGlyphs = exomuxBorderGlyphs(controller.globalSettings.peek().borderStyle);
  for (const separator of projection.separators) {
    painter.fill(
      separator.rect,
      separator.direction === "row" ? borderGlyphs.verticalSeparator : borderGlyphs.horizontalSeparator,
      { foreground: theme.border, background: theme.background },
    );
  }
  for (const window of projection.floatingWindows) {
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
    );
  }
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
  if (controller.startMenuVisible.peek()) paintStartMenu(painter, bounds, theme, controller);
  if (controller.helpVisible.peek()) paintHelp(painter, projection, theme);
  if (controller.quitModalVisible.peek()) paintQuitModal(painter, projection, theme);
  const scpRequest = controller.pendingScp.peek();
  if (scpRequest) paintScpModal(painter, projection, theme, scpRequest);
  const configSessionId = controller.configSessionId.peek();
  if (configSessionId) paintWindowConfigModal(painter, projection, theme, controller, configSessionId);
  if (controller.backgroundConfigVisible.peek()) {
    paintBackgroundConfigModal(painter, projection, theme, controller, options.backgroundField);
  }
  const pendingKillSessionId = controller.pendingKillSessionId.peek();
  if (pendingKillSessionId) paintKillConfirmation(painter, projection, controller, pendingKillSessionId);

  return painter.rows;
}

/** Paints the start-menu dropdown below the top-left button. */
function paintStartMenu(
  painter: DesktopPainter,
  bounds: Rectangle,
  theme: ExomuxThemeSpec,
  controller: ExomuxController,
): void {
  const { panelRect, items } = exomuxStartMenuLayout(bounds, controller.startMenuAnchor.peek());
  painter.fill(panelRect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.borderBox(panelRect, exomuxBorderGlyphs("thin"), {
    foreground: theme.accent,
    background: theme.surfaceStrong,
    bold: true,
  });
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
  sessionNameField?: ExomuxSessionNameField,
): void {
  const theme = controller.theme.peek();
  const border = window.active ? theme.accent : theme.border;
  painter.fill(window.rect, " ", { foreground: theme.text, background: theme.surface });
  // Focus reads through colour and weight, so both states share one frame
  // vocabulary rather than swapping the glyphs out underneath the window.
  painter.borderBox(window.rect, exomuxBorderGlyphs(controller.globalSettings.peek().borderStyle), {
    foreground: border,
    background: theme.surfaceStrong,
    bold: window.active,
  });
  painter.fill(window.titleBarRect, " ", {
    foreground: window.active ? theme.background : theme.text,
    background: window.active ? theme.accent : theme.surfaceStrong,
    bold: window.active,
  });
  const firstControl = window.controls.reduce(
    (minimum, control) => Math.min(minimum, control.rect.column),
    window.titleBarRect.column + window.titleBarRect.width,
  );
  const titleWidth = Math.max(0, firstControl - window.titleBarRect.column - 2);
  const sessionId = exomuxSessionIdFromWindow(window.id);
  const runtime = sessionId ? controller.runtime(sessionId) : undefined;
  const copyMode = runtime?.scrollback.mode === "copy" ? " [SCROLL]" : "";
  // Mouse reporting off is otherwise invisible and looks exactly like broken
  // passthrough, so the window says so rather than leaving you to guess.
  const noMouse = sessionId && !controller.windowSettingsFor(sessionId).mouseReporting ? " [NO MOUSE]" : "";
  painter.write(
    window.titleBarRect.column + 1,
    window.titleBarRect.row,
    fitText(
      `${window.placement === "floating" ? "~" : "="} ${
        runtime?.summary.peek().title ?? window.title
      }${copyMode}${noMouse}`,
      titleWidth,
    ),
    {
      foreground: window.active ? theme.background : theme.text,
      background: window.active ? theme.accent : theme.surfaceStrong,
      bold: window.active,
    },
  );
  for (const control of window.controls) {
    const danger = control.kind === "close";
    painter.write(control.rect.column, control.rect.row, fitText(control.text, control.rect.width), {
      foreground: danger ? theme.danger : window.active ? theme.background : theme.text,
      background: window.active ? theme.accent : theme.surfaceStrong,
      bold: danger || window.active,
    });
  }
  // These two carry no per-window override of their own, so they follow the
  // desktop setting.
  const panelOpacity = exomuxResolvedOpacity(controller.globalSettings.peek());
  const ground = exomuxWindowGround(theme, panelOpacity, backdrop);
  if (panelOpacity < 1 && backdrop) fillWithGround(painter, window.clientRect, theme, ground);
  else painter.fill(window.clientRect, " ", { foreground: theme.text, background: theme.surface });
  if (window.id === EXOMUX_SESSIONS_WINDOW_ID) {
    paintSessionManager(painter, window.clientRect, controller, selectedSessionIndex, window.active, ground);
    return;
  }
  if (window.id === EXOMUX_NETWORK_WINDOW_ID) {
    paintNetworkPanel(painter, window.clientRect, controller, window.active, ground);
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
  const visible = tree.visible(height);
  const selected = tree.selected();
  for (let visibleIndex = 0; visibleIndex < visible.length; visibleIndex += 1) {
    const row = visible[visibleIndex]!;
    const paintRow = rect.row + NETWORK_LIST_START + visibleIndex;
    const width = Math.max(0, rect.width - 2);
    const isSelected = active && selected?.index === row.index;
    const note = row.id.startsWith("note:");
    const heading = row.depth === 0;
    const offline = controller.networkDevice(row.id)?.online === false;
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
  const sessions = controller.sessions.peek();
  if (sessions.length === 0) {
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
  const selected = clampIndex(selectedSessionIndex, sessions.length);
  const available = Math.max(0, rect.height - SESSION_LIST_START);
  const offset = Math.max(0, Math.min(selected - Math.floor(available / 2), sessions.length - available));
  for (let visibleIndex = 0; visibleIndex < available; visibleIndex += 1) {
    const index = offset + visibleIndex;
    const session = sessions[index];
    if (!session) break;
    const runtime = controller.runtime(session.id);
    const isSelected = active && index === selected;
    const attached = runtime?.attached.peek() ?? false;
    const status = session.running ? (attached ? "LIVE" : "HOLD") : session.status.toUpperCase();
    const row = rect.row + SESSION_LIST_START + visibleIndex;
    const rowRect = { column: rect.column, row, width: rect.width, height: 1 };
    const foreground = isSelected ? theme.background : session.running ? theme.text : theme.muted;
    const label = fitText(
      `${isSelected ? ">" : " "} [${status}] ${session.title} :: ${session.commandLine}`,
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

/** Unthemed terminal defaults used when a window opts out of theme recoloring. */
const RAW_TERMINAL_BACKGROUND: ExomuxRgb = [0, 0, 0];
const RAW_TERMINAL_FOREGROUND: ExomuxRgb = [229, 229, 229];

/** Fades one color toward the surface so unfocused windows recede. */
function dimTowards(color: ExomuxRgb, towards: ExomuxRgb): ExomuxRgb {
  return [
    Math.round(color[0] + (towards[0] - color[0]) * 0.45),
    Math.round(color[1] + (towards[1] - color[1]) * 0.45),
    Math.round(color[2] + (towards[2] - color[2]) * 0.45),
  ];
}

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
  const themed = settings.themed;
  const defaultBackground = themed ? theme.surface : RAW_TERMINAL_BACKGROUND;
  const defaultForeground = themed ? theme.text : RAW_TERMINAL_FOREGROUND;
  const dim = settings.dimInactive && !active;
  // Only cells the program left at its default background become see-through.
  // A program that painted a background chose that colour, and a transparent
  // window would otherwise erase every deliberate block of colour on screen.
  const transparent = backdrop !== undefined && opacity < 1;
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
      const explicit = exomuxTerminalRgb(cell.background, true);
      const ground = explicit ??
        (transparent
          ? mixExomuxRgb(backdrop(rect.column + column, rect.row + row), defaultBackground, opacity)
          : defaultBackground);
      let background = cursor ? theme.accent : ground;
      let foreground = cursor
        ? theme.background
        : cell.background === undefined && themed
        ? exomuxTerminalForegroundRgb(cell.foreground, theme.surface, theme.text) ?? defaultForeground
        : exomuxTerminalRgb(cell.foreground, false) ?? defaultForeground;
      if (dim) {
        background = dimTowards(background, theme.surface);
        foreground = dimTowards(foreground, theme.surface);
      }
      const rawGlyph = cell.char || " ";
      // A double-width glyph on the last content column would put its follower
      // on the window border, so it degrades to a blank inside the client area.
      const glyph = exomuxGlyphColumns(rawGlyph) === 2 && column + 1 >= rect.width ? " " : rawGlyph;
      painter.cell(rect.column + column, rect.row + row, glyph, {
        foreground,
        background,
        bold: cursor || cell.bold,
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
    "Click desktop   skip preset        Start menu       every command lives there",
    "Ctrl-N d / x    detach window      Ctrl-N &         request terminal kill",
    "Wheel terminals or swipe vertically for styled history; [SCROLL] marks copy mode.",
    "Title-bar X / Meta-C kills that terminal; Ctrl-N d/x and quitting only detach.",
    "Ctrl-N & asks before killing. Drag title bars; drag borders to resize.",
    "Top bar: start menu at the left, open terminals beside it, quit at the right.",
    "Press Escape, q, or ? to close help. Mouse and touch can use Close.",
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

function paintKillConfirmation(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  controller: ExomuxController,
  sessionId: string,
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
}

function paintQuitModal(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
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
  /** The editable session-name field at the top of the window. */
  readonly sessionNameRect: Rectangle;
}

/** Scrolls a select list so the selected row stays visible. */
function selectListStart(selected: number, total: number, visible: number): number {
  if (total <= visible) return 0;
  return clampNumber(selected - Math.floor(visible / 2), 0, total - visible);
}

function clampNumber(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
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
    backgroundConfigRect: {
      column: Math.max(rect.column, closeRect.column - 23),
      row: closeRect.row,
      width: Math.max(1, Math.min(22, closeRect.column - rect.column - 1)),
      height: 1,
    },
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
  if (id === "butterchurn") {
    return EXOMUX_BUTTERCHURN_PRESETS.map((preset, index) => ({ label: preset.name, presetIndex: index }));
  }
  if (id === "image") return exomuxBrowseRows(controller.backgroundBrowsePath.peek() || "/");
  return [];
}

/** Layout for the background config modal; exported for pointer tests. */
export interface ExomuxBackgroundConfigLayout {
  readonly rect: Rectangle;
  /** Visible list rows, paired with the list index each row shows. */
  readonly listRows: readonly { readonly rect: Rectangle; readonly index: number }[];
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
): ExomuxBackgroundConfigLayout {
  const width = fitModalSpan(bounds.width, 46, 84, 6);
  const wantsList = listLength > 0;
  const desired = (wantsList ? 18 : 0) + optionCount + 6;
  const height = Math.min(Math.max(desired, 8), fitModalSpan(bounds.height, 8, bounds.height, 2));
  const rect = centeredRect(bounds, width, height);
  const listTop = rect.row + 2;
  const visibleRows = wantsList ? Math.max(1, rect.height - optionCount - 5) : 0;
  const start = selectListStart(listIndex, listLength, visibleRows);
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
    optionRows,
    closeRect: {
      column: Math.max(rect.column + 1, rect.column + rect.width - 10),
      row: rect.row + rect.height - 1,
      width: Math.max(1, Math.min(9, rect.width - 2)),
      height: 1,
    },
  };
}

function paintBackgroundConfigModal(
  painter: DesktopPainter,
  projection: WorkbenchWindowHostProjection,
  theme: ExomuxThemeSpec,
  controller: ExomuxController,
  backgroundField: ExomuxAnimatedBackground | undefined,
): void {
  const id = controller.backgroundId.peek();
  const specs = EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? [];
  const list = exomuxBackgroundConfigList(controller);
  const listIndex = Math.min(Math.max(0, controller.backgroundConfigListIndex.peek()), Math.max(0, list.length - 1));
  const layout = exomuxBackgroundConfigLayout(projection.bounds, list.length, listIndex, specs.length);
  const { rect, listRows, optionRows, closeRect } = layout;
  const pane = controller.backgroundConfigPane.peek();
  const values = exomuxBackgroundSettingsFor(controller.backgroundSettings.peek(), id);
  const optionIndex = controller.backgroundConfigOptionIndex.peek();

  painter.fill(rect, " ", { foreground: theme.text, background: theme.surfaceStrong });
  painter.frame(rect, "#", { foreground: theme.accent, background: theme.surfaceStrong, bold: true });
  painter.write(rect.column + 2, rect.row, ` Background · ${id} `, {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });

  const header = id === "butterchurn"
    ? `Preset (${list.length}) — current: ${
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
      fitText(`${focused ? ">" : current ? "·" : " "} ${row.label}`, rowRect.width),
      {
        foreground: focused ? theme.background : row.directory ? theme.accent : current ? theme.accent : theme.text,
        background: focused ? theme.accent : theme.surfaceStrong,
        bold: focused || current,
      },
    );
  }

  for (let index = 0; index < optionRows.length; index += 1) {
    const rowRect = optionRows[index]!;
    const spec = specs[index]!;
    const focused = pane === "options" && index === optionIndex;
    const value = spec.format(values[spec.id]!);
    const valueColumn = rowRect.column + Math.max(0, rowRect.width - textWidth(value) - 1);
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
    painter.write(valueColumn, rowRect.row, value, {
      foreground: focused ? theme.background : theme.accent,
      background: focused ? theme.accent : theme.surfaceStrong,
      bold: true,
    });
  }

  painter.write(closeRect.column, closeRect.row, "[ Close ]", {
    foreground: theme.background,
    background: theme.accent,
    bold: true,
  });
}

/** Composites one real button's styled cells into its window rect. */
function blitSettingsButtonCells(painter: DesktopPainter, rect: Rectangle, snapshot: ExomuxSettingsButtonCells): void {
  const width = Math.min(rect.width, snapshot.width);
  for (let index = 0; index < width; index += 1) {
    const cell = snapshot.cells[index];
    if (cell === undefined) continue;
    painter.rawCell(rect.column + index, rect.row, cell);
  }
}

/** Composites a picker List's rendered region (in client-relative cells) into its window rect. */
function blitPickerRegion(
  painter: DesktopPainter,
  region: Rectangle,
  clientRect: Rectangle,
  surface: ExomuxSettingsSurface,
): void {
  for (let row = 0; row < region.height; row += 1) {
    for (let column = 0; column < region.width; column += 1) {
      const cell = surface.cellAt(region.row - clientRect.row + row, region.column - clientRect.column + column);
      if (cell === undefined) continue;
      painter.rawCell(region.column + column, region.row + row, cell);
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
  sessionNameField?: ExomuxSessionNameField,
): void {
  const theme = controller.theme.peek();
  const themeIndex = Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === controller.themeId.peek()));
  const backgroundIndex = Math.max(0, EXOMUX_BACKGROUND_IDS.indexOf(controller.backgroundId.peek()));
  const layout = exomuxGlobalConfigLayout(rect, themeIndex, backgroundIndex, controller.shaderOptionRows().length);
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
  painter.fill(nameRect, " ", {
    foreground: editing ? theme.background : theme.muted,
    background: editing ? theme.accent : theme.surfaceStrong,
  });
  const labelWidth = Math.min(nameRect.width, textWidth(nameLabel));
  painter.write(nameRect.column, nameRect.row, fitText(nameLabel, labelWidth), {
    foreground: editing ? theme.background : theme.accent,
    background: editing ? theme.accent : theme.surfaceStrong,
    bold: editing,
  });
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
      const cell = sessionNameField.cellAt(0, column);
      if (cell !== undefined) painter.rawCell(valueColumn + column, nameRect.row, cell);
    }
  } else {
    painter.write(
      valueColumn,
      nameRect.row,
      fitText(editing ? `${draft}▏` : controller.sessionName.peek(), valueWidth),
      {
        foreground: editing ? theme.background : theme.accent,
        background: editing ? theme.accent : theme.surfaceStrong,
        bold: editing,
      },
    );
  }

  const columnWidth = themeRows[0]?.rect.width ?? Math.max(8, Math.floor((rect.width - 3) / 2));
  const headerRow = rect.row + 1;
  const header = (column: number, text: string, focused: boolean) => {
    painter.write(column, headerRow, fitText(text, columnWidth), {
      foreground: focused ? theme.accent : theme.muted,
      background: theme.surfaceStrong,
      bold: focused,
    });
  };
  header(rect.column + 1, "Theme", pane === "theme");
  header(rect.column + 2 + columnWidth, "Background", pane === "background");

  const paintRow = (rowRect: Rectangle, label: string, selected: boolean, focused: boolean) => {
    painter.fill(rowRect, " ", {
      foreground: selected ? theme.background : theme.text,
      background: selected ? (focused ? theme.accent : theme.surface) : theme.surfaceStrong,
      bold: selected,
    });
    painter.write(rowRect.column, rowRect.row, fitText(`${selected ? ">" : " "} ${label}`, rowRect.width), {
      foreground: selected ? (focused ? theme.background : theme.accent) : theme.text,
      background: selected ? (focused ? theme.accent : theme.surface) : theme.surfaceStrong,
      bold: selected,
    });
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
      blitPickerRegion(painter, layout.themeListRect, rect, settingsPickers);
      blitPickerRegion(painter, layout.backgroundListRect, rect, settingsPickers);
    }
  }

  // The options pane lists the global settings followed by the shader rows
  // (only present under Ghostty), all navigated by one option index.
  const optionEntries: { label: string; value: string }[] = [
    ...EXOMUX_GLOBAL_SETTING_SPECS.map((spec) => ({ label: spec.label, value: spec.format(settings[spec.id]) })),
    ...controller.shaderOptionRows().map((row) => ({ label: row.label, value: row.value })),
  ];
  // Each global setting is rendered by a real exotui control — a CheckBox for
  // the boolean, a Cycler for the discrete-value settings — showing the live
  // value. The shader rows (dynamic, Ghostty-only) stay hand-drawn. The existing
  // option routing drives the changes; these controls reflect them.
  const globalCount = EXOMUX_GLOBAL_SETTING_SPECS.length;
  const controlSpecs: ExomuxOptionControlSpec[] = EXOMUX_GLOBAL_SETTING_SPECS.map((spec, index) => {
    const rowRect = optionRows[index];
    const focused = pane === "options" && index === optionIndex;
    const foreground = focused ? theme.background : theme.accent;
    const background = focused ? theme.accent : theme.surfaceStrong;
    if (spec.values.length > 0 && typeof spec.values[0] === "boolean") {
      return { kind: "checkbox", key: spec.id, width: 3, foreground, background, checked: Boolean(settings[spec.id]) };
    }
    return {
      kind: "cycler",
      key: spec.id,
      width: Math.min(16, Math.max(6, (rowRect?.width ?? 16) - 4)),
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
    const cells = index < globalCount ? controlCells[index] : undefined;
    const controlWidth = index < globalCount ? controlSpecs[index]!.width : 0;
    const controlColumn = rowRect.column + Math.max(0, rowRect.width - controlWidth);
    const valueColumn = cells
      ? controlColumn
      : rowRect.column + Math.max(0, rowRect.width - textWidth(entry.value) - 1);

    painter.fill(rowRect, " ", {
      foreground: focused ? theme.background : theme.text,
      background: focused ? theme.accent : theme.surfaceStrong,
      bold: focused,
    });
    painter.write(
      rowRect.column,
      rowRect.row,
      fitText(`${focused ? ">" : " "} ${entry.label}`, Math.max(0, valueColumn - rowRect.column - 1)),
      {
        foreground: focused ? theme.background : theme.text,
        background: focused ? theme.accent : theme.surfaceStrong,
        bold: focused,
      },
    );
    if (cells) {
      for (let column = 0; column < Math.min(controlWidth, cells.width); column += 1) {
        const cell = cells.cells[column];
        if (cell !== undefined) painter.rawCell(controlColumn + column, rowRect.row, cell);
      }
    } else {
      painter.write(valueColumn, rowRect.row, entry.value, {
        foreground: focused ? theme.background : theme.accent,
        background: focused ? theme.accent : theme.surfaceStrong,
        bold: true,
      });
    }
  }

  painter.write(
    rect.column + 1,
    rect.row + rect.height - 1,
    fitText(" * overgrows idle windows ", Math.max(0, layout.backgroundConfigRect.column - rect.column - 2)),
    {
      foreground: theme.muted,
      background: theme.surfaceStrong,
    },
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
    {
      key: "close",
      label: "Close",
      width: closeRect.width,
      foreground: theme.background,
      background: theme.accent,
    },
  ];
  const backgroundCells = settingsWidgets?.cellsFor(buttonSpecs, "background");
  if (backgroundCells) {
    blitSettingsButtonCells(painter, layout.backgroundConfigRect, backgroundCells);
  } else {
    painter.write(layout.backgroundConfigRect.column, layout.backgroundConfigRect.row, "[ b Background config ]", {
      foreground: theme.background,
      background: theme.warning,
      bold: true,
    });
  }
  const closeCells = settingsWidgets?.cellsFor(buttonSpecs, "close");
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
  for (let index = 0; index < rowRects.length; index += 1) {
    const rowRect = rowRects[index]!;
    const spec = EXOMUX_WINDOW_SETTING_SPECS[index]!;
    const active = index === selected;
    const value = spec.format(settings[spec.id]);
    const label = `${active ? ">" : " "} ${spec.label}`;
    // Right-align the value so the column of settings reads as a table.
    const valueColumn = rowRect.column + Math.max(0, rowRect.width - textWidth(value) - 1);
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
    painter.write(valueColumn, rowRect.row, value, {
      foreground: active ? theme.background : theme.accent,
      background: active ? theme.accent : theme.surfaceStrong,
      bold: true,
    });
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
  const masked = request.password.length > 0 ? "•".repeat(Math.min(request.password.length, rect.width - 16)) : "";
  const passwordHint = masked || "(key/agent auth)";
  painter.write(rect.column + 2, passwordRow, fitText(`Password: ${passwordHint}`, rect.width - 4), {
    foreground: request.password.length > 0 ? theme.text : theme.muted,
    background: theme.surfaceStrong,
  });
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
function modalButtonRects(rect: Rectangle, widths: readonly number[], gap = 2): Rectangle[] {
  const inner = Math.max(1, rect.width - 4);
  const spread = widths.reduce((sum, width) => sum + Math.min(width, inner), 0) + gap * (widths.length - 1);
  if (widths.length <= 1 || spread <= inner) {
    const buttonRow = rect.row + Math.max(1, rect.height - 2);
    const slack = widths.length > 1 ? Math.max(0, Math.floor((inner - spread) / (widths.length - 1))) : 0;
    let column = rect.column + 2;
    return widths.map((width) => {
      const fitted = Math.min(width, inner);
      const button = { column, row: buttonRow, width: fitted, height: 1 };
      column += fitted + gap + slack;
      return button;
    });
  }
  // Stack up from just above the bottom border, first button at the top.
  const firstRow = rect.row + Math.max(1, rect.height - 1 - widths.length);
  return widths.map((width, index) => ({
    column: rect.column + 2,
    row: firstRow + index,
    width: Math.min(width, inner),
    height: 1,
  }));
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

const MAX_PAINT_STYLE_CACHE = 8192;
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
  // Themes and gradients are bounded in practice; the cap is only here so a
  // long-lived session cannot grow this without limit.
  if (paintStyleCache.size >= MAX_PAINT_STYLE_CACHE) paintStyleCache.clear();
  paintStyleCache.set(key, style);
  return style;
}

class DesktopPainter {
  readonly rows: string[][];

  constructor(readonly bounds: Rectangle, readonly theme: ExomuxThemeSpec) {
    const width = Math.max(0, bounds.width);
    this.rows = Array.from({ length: Math.max(0, bounds.height) }, () => new Array<string>(width).fill(" "));
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
      return;
    }
    // A double-width glyph on the final column has nowhere to put its follower,
    // so it degrades to a blank rather than spilling past the desktop edge.
    if (localColumn + 1 >= this.bounds.width) {
      target[localColumn] = paint(" ");
      return;
    }
    // The follower is left empty so the sink emits nothing for it and the real
    // cursor, already advanced two columns by the glyph, stays in step.
    this.#retireWideGlyphAt(target, localColumn + 1);
    target[localColumn] = paint(glyph);
    target[localColumn + 1] = EXOMUX_WIDE_GLYPH_FOLLOWER;
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
      for (let row = firstRow; row < lastRow; row += 1) {
        const target = this.rows[row]!;
        for (let column = firstColumn; column < lastColumn; column += 1) {
          // Still has to retire a straddling wide glyph, or its follower would
          // survive underneath and desynchronise the rest of the row.
          this.#retireWideGlyphAt(target, column);
          target[column] = painted;
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

function managerSessionAt(
  controller: ExomuxController,
  projection: WorkbenchWindowHostProjection,
  selectedSessionIndex: number,
  column: number,
  row: number,
): ExomuxManagerSessionHit | undefined {
  const manager = projection.windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID);
  if (!manager || !contains(manager.clientRect, column, row)) return undefined;
  const sessions = controller.sessions.peek();
  const available = Math.max(0, manager.clientRect.height - SESSION_LIST_START);
  const relativeRow = row - manager.clientRect.row;
  if (relativeRow < SESSION_LIST_START || relativeRow >= SESSION_LIST_START + available) return undefined;
  const selected = clampIndex(selectedSessionIndex, sessions.length);
  const offset = Math.max(0, Math.min(selected - Math.floor(available / 2), sessions.length - available));
  const index = offset + relativeRow - SESSION_LIST_START;
  const session = sessions[index];
  return session ? { session, index } : undefined;
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
