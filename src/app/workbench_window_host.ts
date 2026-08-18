// Copyright 2023 Im-Beast. MIT license.

import { HistoryStack } from "./history.ts";
import {
  createWorkbenchShelfLayoutBuffers,
  layoutWorkbenchShelfInto,
  type WorkbenchShelfLayoutBuffers,
} from "./workbench_shelf.ts";
import {
  createWorkbenchTitlebarLayout,
  layoutWorkbenchTitlebarInto,
  type WorkbenchTitlebarButtonKind,
  workbenchTitlebarButtonRenderCommandsInto,
  type WorkbenchTitlebarLayout,
} from "./workbench_titlebar.ts";
import { InputEnvelopeFactory } from "../input_envelope.ts";
import type { KeyPressEvent, MouseEvent, MousePressEvent } from "../input_reader/types.ts";
import { OverlayStackController } from "../layout/overlay.ts";
import { createLayoutNode, type LayoutNode } from "../layout/solver.ts";
import { cellLength, defaultComputedLayoutStyle } from "../layout/style.ts";
import type {
  TiledWorkspaceController,
  TiledWorkspaceDockEdge,
  TiledWorkspaceSeparatorLayout,
  TiledWorkspaceSnapshot,
} from "../layout/tiled_workspace.ts";
import {
  adaptTerminalMousePointer,
  normalizePointerInputEvent,
  PointerCaptureController,
  type PointerCaptureOwnerHandle,
  type PointerInputEvent,
} from "../pointer_input.ts";
import { Signal } from "../signals/signal.ts";
import { contains as containsCell } from "./hit_targets.ts";
import { createPointerGestureState, type PointerGestureState, reducePointerGesture } from "./pointer_gestures.ts";
import type { Rectangle } from "../types.ts";
import {
  createMarkupWindowHistoryAdapter,
  type MarkupWindowHistoryAdapter,
  type MarkupWindowHistoryGesture,
} from "../markup/window_history.ts";
import {
  MarkupWindowInteractionController,
  type MarkupWindowInteractionResult,
  markupWindowSnapTargetAtPoint,
} from "../markup/window_interactions.ts";
import {
  MARKUP_WINDOW_SNAPSHOT_V1_VERSION,
  type MarkupWindowActionResult,
  type MarkupWindowCompactMode,
  MarkupWindowController,
  type MarkupWindowControllerInspection,
  type MarkupWindowMoveDelta,
  type MarkupWindowPlacement,
  type MarkupWindowProjection,
  type MarkupWindowResizeEdge,
  type MarkupWindowSnapshot,
  type MarkupWindowSnapTarget,
  type MarkupWindowState,
  type ProjectMarkupWindowsOptions,
  type ReconcileMarkupWindowsOptions,
} from "../markup/windows.ts";

/** Declarative input used to build one shared workbench-window markup root. */
export interface WorkbenchWindowHostDescriptor<TId extends string = string> {
  id: TId;
  title: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  state?: MarkupWindowState;
  placement?: MarkupWindowPlacement;
  floatingRect?: Rectangle;
  alwaysOnTop?: boolean;
  groupId?: string;
}

/** Construction options for the renderer-neutral advanced-window host. */
export interface WorkbenchWindowHostControllerOptions<TId extends string = string> {
  workspace: TiledWorkspaceController;
  /** Supply either a pre-built markup root or window descriptors. */
  root?: LayoutNode;
  windows?: readonly WorkbenchWindowHostDescriptor<TId>[];
  rootId?: string;
  overlays?: OverlayStackController;
  capture?: PointerCaptureController;
  compactMode?: MarkupWindowCompactMode;
  /** Optional tiled-only bootstrap imported atomically after this host claims its declared window registrations. */
  initialWorkspace?: TiledWorkspaceSnapshot;
  historyCapacity?: number;
  now?: () => number;
  snapDistance?: number;
  /** Centered fraction of the top/bottom edge row that half-snaps (default 0.2). */
  snapEdgeSpanRatio?: number;
  /** Cells along each edge from a corner that corner-snap (default 4). */
  snapCornerReach?: number;
  snapOnRelease?: boolean;
  commandStep?: number;
  /** Pointer-capture owner id. Supply a stable value when hosts share a capture controller. */
  ownerId?: string;
  /**
   * Adds a per-window `config` titlebar button. Pass a predicate to show it only
   * on some windows. The button carries no built-in command, so the host app
   * routes its activation itself. Defaults to off.
   */
  windowConfigButton?: boolean | ((id: string) => boolean);
  /** Label rendered inside the per-window config button. Defaults to `config`. */
  windowConfigLabel?: string;
}

/** Commands shared by keyboard, pointer chrome, palettes, and renderer hosts. */
export type WorkbenchWindowHostCommand =
  | { kind: "focus"; id?: string }
  | { kind: "focus-next"; direction: -1 | 1 }
  | { kind: "nudge"; id?: string; delta: MarkupWindowMoveDelta }
  | { kind: "resize"; id?: string; edge: MarkupWindowResizeEdge; delta: MarkupWindowMoveDelta }
  | { kind: "resize-split"; splitId: string; delta: number }
  | { kind: "snap"; id?: string; target: MarkupWindowSnapTarget }
  | { kind: "dock"; id?: string; targetId: string; edge: TiledWorkspaceDockEdge; ratio?: number }
  | { kind: "set-placement"; id?: string; placement: MarkupWindowPlacement; rect?: Rectangle }
  | { kind: "toggle-placement"; id?: string; rect?: Rectangle }
  | { kind: "restore-floating"; id?: string }
  | { kind: "minimize" | "maximize" | "toggle-maximize" | "restore" | "close"; id?: string }
  | { kind: "recover-bounds"; id?: string }
  | { kind: "recover-all" }
  | { kind: "toggle-always-on-top"; id?: string }
  | { kind: "set-group"; id?: string; groupId?: string }
  | { kind: "switcher-open"; direction: -1 | 1 }
  | { kind: "switcher-step"; direction: -1 | 1 }
  | { kind: "switcher-accept" }
  | { kind: "switcher-cancel" };

/** Semantic node projected for terminal help and browser accessibility adapters. */
export interface WorkbenchWindowSemanticNode {
  id: string;
  role: "window" | "button" | "separator" | "listbox" | "option";
  label: string;
  description?: string;
  shortcut?: string;
  selected?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  positionInSet?: number;
  setSize?: number;
}

/** One paintable and hittable titlebar control. */
export interface WorkbenchWindowChromeControl {
  kind: WorkbenchTitlebarButtonKind;
  text: string;
  rect: Rectangle;
  hitRect: Rectangle;
  tone: string;
  command?: WorkbenchWindowHostCommand;
  semantic: WorkbenchWindowSemanticNode;
}

/** Unified tiled or floating window projection in back-to-front paint order. */
export interface WorkbenchWindowChromeProjection {
  id: string;
  title: string;
  placement: MarkupWindowPlacement;
  state: MarkupWindowState;
  rect: Rectangle;
  titleBarRect: Rectangle;
  clientRect: Rectangle;
  active: boolean;
  alwaysOnTop: boolean;
  groupId?: string;
  zIndex: number;
  controls: WorkbenchWindowChromeControl[];
  /** Live status tags for the title bar (from options.titleAdornments). */
  titleAdornments: readonly string[];
  semantic: WorkbenchWindowSemanticNode;
}

/** The window whose bare title bar (not a control) covers one cell, topmost first. */
function bareTitleBarWindowAt(
  projection: WorkbenchWindowHostProjection,
  x: number,
  y: number,
): string | undefined {
  const windows = [...projection.tiledWindows, ...projection.floatingWindows];
  for (let index = windows.length - 1; index >= 0; index -= 1) {
    const window = windows[index]!;
    if (!containsCell(window.rect, x, y)) continue;
    // The topmost window owns the cell: only its own title row counts, never
    // its client area or a titlebar control (those carry their own actions).
    if (y !== window.rect.row || containsCell(window.clientRect, x, y)) return undefined;
    for (const control of window.controls) {
      if (containsCell(control.hitRect, x, y)) return undefined;
    }
    return window.id;
  }
  return undefined;
}

/** Minimized-window task-shelf item. */
export interface WorkbenchWindowShelfItem {
  id: string;
  title: string;
  active: boolean;
  placement: MarkupWindowPlacement;
  rect?: Rectangle;
  command: WorkbenchWindowHostCommand;
  semantic: WorkbenchWindowSemanticNode;
}

/** Transient keyboard task-switcher projection. */
export interface WorkbenchWindowSwitcherProjection {
  selectedIndex: number;
  items: Array<{
    id: string;
    title: string;
    selected: boolean;
    state: MarkupWindowState;
    semantic: WorkbenchWindowSemanticNode;
  }>;
  semantic: WorkbenchWindowSemanticNode;
}

/** Transient snap indicator matching the interaction controller's release policy. */
export interface WorkbenchWindowSnapPreview {
  windowId: string;
  target: MarkupWindowSnapTarget;
  rect: Rectangle;
}

/** Paint/hit metadata for one tiled split separator. */
export interface WorkbenchWindowSeparatorProjection extends TiledWorkspaceSeparatorLayout {
  command: Extract<WorkbenchWindowHostCommand, { kind: "resize-split" }>;
  semantic: WorkbenchWindowSemanticNode;
}

/** Combined renderer-neutral desktop projection. */
export interface WorkbenchWindowHostProjection {
  bounds: Rectangle;
  compact: boolean;
  compactWindowId?: string;
  topModalId?: string;
  windows: WorkbenchWindowChromeProjection[];
  tiledWindows: WorkbenchWindowChromeProjection[];
  floatingWindows: WorkbenchWindowChromeProjection[];
  separators: WorkbenchWindowSeparatorProjection[];
  shelf: WorkbenchWindowShelfItem[];
  switcher?: WorkbenchWindowSwitcherProjection;
  snapPreview?: WorkbenchWindowSnapPreview;
  core: MarkupWindowProjection;
}

/** Projection options used by both terminal and browser renderers. */
export interface WorkbenchWindowHostProjectionOptions extends ProjectMarkupWindowsOptions {
  shelfBounds?: Rectangle;
  /**
   * Host-owned double-click-to-maximize: two primary downs on a window's bare
   * title bar (off its controls) within this many milliseconds toggle
   * maximize/restore. Off when unset, so existing consumers are unchanged.
   */
  doubleClickMaximizeMs?: number;
  /**
   * Live status adornments for a window's title (e.g. "[SCROLL]",
   * "[NO MOUSE]"), projected first-class so every renderer can show them.
   */
  titleAdornments?: (windowId: string) => readonly string[];
}

/** Explicit result returned by command and pointer host paths. */
export interface WorkbenchWindowHostResult {
  status: "applied" | "unchanged" | "ignored" | "blocked" | "invalid" | "disposed" | "failed";
  handled: boolean;
  command?: WorkbenchWindowHostCommand;
  action?: MarkupWindowActionResult;
  interaction?: MarkupWindowInteractionResult;
  reason?: string;
}

/** Clone-safe host ownership and transient-state inspection. */
export interface WorkbenchWindowHostInspection {
  disposed: boolean;
  ownsOverlays: boolean;
  ownsHistory: boolean;
  ownsCapture: boolean;
  commitRevision: number;
  viewRevision: number;
  switcherOpen: boolean;
  controller: MarkupWindowControllerInspection;
  interaction: ReturnType<MarkupWindowInteractionController["inspect"]>;
  history: ReturnType<HistoryStack["inspect"]>;
  separatorResize?: { pointerId: number; splitId: string; direction: "row" | "column"; delta: number };
}

interface SwitcherState {
  ids: string[];
  selectedIndex: number;
}

interface SeparatorResizeState {
  pointerId: number;
  splitId: string;
  direction: "row" | "column";
  startPointerColumn: number;
  startPointerRow: number;
  startSeparatorColumn: number;
  startSeparatorRow: number;
  delta: number;
  options: ProjectMarkupWindowsOptions;
  gesture: MarkupWindowHistoryGesture;
}

const DEFAULT_HISTORY_CAPACITY = 64;
const DEFAULT_COMMAND_STEP = 1;
let hostOwnerSequence = 0;

/** Builds a declarative root while keeping the markup controller authoritative for window state. */
export function createWorkbenchWindowHostRoot<TId extends string>(
  windows: readonly WorkbenchWindowHostDescriptor<TId>[],
  rootId = "workbench-window-host",
): LayoutNode {
  const children = windows.map((window) => {
    const style = defaultComputedLayoutStyle();
    if (finitePositive(window.minWidth)) style.minWidth = cellLength(Math.floor(window.minWidth!));
    if (finitePositive(window.minHeight)) style.minHeight = cellLength(Math.floor(window.minHeight!));
    if (finitePositive(window.maxWidth)) style.maxWidth = cellLength(Math.floor(window.maxWidth!));
    if (finitePositive(window.maxHeight)) style.maxHeight = cellLength(Math.floor(window.maxHeight!));
    const attributes: Record<string, string> = { title: String(window.title ?? "") };
    if (window.state !== undefined) attributes.state = window.state;
    if (window.placement !== undefined) attributes.placement = window.placement;
    if (window.alwaysOnTop !== undefined) attributes["always-on-top"] = String(window.alwaysOnTop);
    if (window.groupId !== undefined) attributes["group-id"] = window.groupId;
    if (window.floatingRect) {
      attributes.column = String(window.floatingRect.column);
      attributes.row = String(window.floatingRect.row);
      attributes.width = String(window.floatingRect.width);
      attributes.height = String(window.floatingRect.height);
    }
    return createLayoutNode({ id: window.id, tag: "window", attributes, style });
  });
  return createLayoutNode({ id: rootId, tag: "main", children });
}

/**
 * Owns composition glue only: markup state remains in one MarkupWindowController
 * over the caller's exact tiled workspace. Terminal and browser hosts consume
 * the same projection and normalized pointer path.
 */
export class WorkbenchWindowHostController<TId extends string = string> {
  readonly workspace: TiledWorkspaceController;
  readonly overlays: OverlayStackController;
  readonly history: HistoryStack;
  readonly capture: PointerCaptureController;
  readonly controller: MarkupWindowController;
  readonly windowHistory: MarkupWindowHistoryAdapter;
  readonly interactions: MarkupWindowInteractionController;
  readonly commitRevision: Signal<number> = new Signal(0);
  readonly viewRevision: Signal<number> = new Signal(0);

  readonly #ownsOverlays: boolean;
  readonly #ownsHistory: boolean;
  readonly #ownsCapture: boolean;
  readonly #input: InputEnvelopeFactory;
  readonly #commandStep: number;
  /** Pending first title-bar click for host-owned double-click-to-maximize. */
  /**
   * Title-bar click/drag/double-click recognition, as one state machine
   * (src/app/pointer_gestures.ts) rather than flags. It decides on the
   * release: a press that travels is a drag, so "click to focus, then drag"
   * moves a window instead of snapping it full screen.
   */
  #titleBarGesture: PointerGestureState = createPointerGestureState();
  readonly #titlebarLayouts = new Map<string, WorkbenchTitlebarLayout>();
  readonly #titlebarCommands = new Map<
    string,
    ReturnType<typeof workbenchTitlebarButtonRenderCommandsInto>
  >();
  readonly #shelfBuffers: WorkbenchShelfLayoutBuffers<string> = createWorkbenchShelfLayoutBuffers<string>();
  readonly #separatorOwnerId: string;
  readonly #separatorOwnerHandle: PointerCaptureOwnerHandle;
  readonly #windowConfigButton: (id: string) => boolean;
  readonly #windowConfigLabel: string;
  #switcher?: SwitcherState;
  #separatorResize?: SeparatorResizeState;
  #disposed = false;

  constructor(options: WorkbenchWindowHostControllerOptions<TId>) {
    if (!options?.workspace) throw new TypeError("Workbench window host requires an existing tiled workspace.");
    if ((options.root === undefined) === (options.windows === undefined)) {
      throw new TypeError("Workbench window host requires exactly one of root or windows.");
    }
    this.workspace = options.workspace;
    this.#ownsOverlays = options.overlays === undefined;
    this.#ownsHistory = true;
    this.#ownsCapture = options.capture === undefined;
    this.overlays = options.overlays ?? new OverlayStackController();
    this.history = new HistoryStack({ capacity: options.historyCapacity ?? DEFAULT_HISTORY_CAPACITY });
    this.capture = options.capture ?? new PointerCaptureController();
    this.#commandStep = finitePositive(options.commandStep)
      ? Math.max(1, Math.floor(options.commandStep!))
      : DEFAULT_COMMAND_STEP;
    this.#input = new InputEnvelopeFactory({ now: options.now ?? Date.now });
    const configButton = options.windowConfigButton ?? false;
    this.#windowConfigButton = typeof configButton === "function" ? configButton : () => configButton;
    this.#windowConfigLabel = options.windowConfigLabel ?? "config";
    const controller = new MarkupWindowController({
      root: options.root ?? createWorkbenchWindowHostRoot(options.windows!, options.rootId),
      workspace: this.workspace,
      overlays: this.overlays,
      compactMode: options.compactMode,
    });
    const interactionOwnerId = options.ownerId ?? `workbench-window-host-${++hostOwnerSequence}`;
    const separatorOwnerId = childPointerOwnerId(interactionOwnerId, "separator");
    let windowHistory: MarkupWindowHistoryAdapter | undefined;
    let interactions: MarkupWindowInteractionController | undefined;
    let separatorOwnerHandle: PointerCaptureOwnerHandle | undefined;
    try {
      if (options.initialWorkspace) {
        const current = controller.snapshot();
        const restored = controller.restoreSnapshot({
          version: MARKUP_WINDOW_SNAPSHOT_V1_VERSION,
          compactMode: current.compactMode,
          windowIds: current.windowIds,
          minimizedWindowIds: current.minimizedWindowIds,
          closedWindowIds: current.closedWindowIds,
          maximizedWindowId: current.maximizedWindowId,
          modals: current.modals,
          workspace: options.initialWorkspace,
        });
        if (!restored.ok) throw new TypeError(`Initial workbench workspace was rejected: ${restored.reason}`);
      }
      windowHistory = createMarkupWindowHistoryAdapter({
        controller,
        history: this.history,
        idPrefix: "workbench-window",
        group: "workbench-windows",
      });
      separatorOwnerHandle = this.capture.registerOwner({
        id: separatorOwnerId,
        // Pointer delivery is intentionally coordinated by handlePointer so it
        // can return one synchronous renderer-neutral result to the caller.
        onPointer: () => {},
      });
      interactions = new MarkupWindowInteractionController({
        controller,
        capture: this.capture,
        history: windowHistory,
        ownerId: interactionOwnerId,
        titleBarHeight: 1,
        resizeMargin: 1,
        snapDistance: options.snapDistance,
        snapEdgeSpanRatio: options.snapEdgeSpanRatio,
        snapCornerReach: options.snapCornerReach,
        snapOnRelease: options.snapOnRelease,
      });
    } catch (error) {
      preserveOriginalErrorCleanup(() => interactions?.dispose());
      preserveOriginalErrorCleanup(() => separatorOwnerHandle?.dispose());
      preserveOriginalErrorCleanup(() => windowHistory?.dispose());
      preserveOriginalErrorCleanup(() => controller.dispose());
      if (this.#ownsCapture) preserveOriginalErrorCleanup(() => this.capture.dispose());
      if (this.#ownsOverlays) preserveOriginalErrorCleanup(() => this.overlays.dispose());
      preserveOriginalErrorCleanup(() => this.commitRevision.dispose());
      preserveOriginalErrorCleanup(() => this.viewRevision.dispose());
      throw error;
    }
    this.controller = controller;
    this.windowHistory = windowHistory;
    this.interactions = interactions;
    this.#separatorOwnerId = separatorOwnerId;
    this.#separatorOwnerHandle = separatorOwnerHandle;
  }

  /** Projects unified tiled/floating chrome, controls, shelf, switcher, and snap preview. */
  project(bounds: Rectangle, options: WorkbenchWindowHostProjectionOptions = {}): WorkbenchWindowHostProjection {
    this.#assertActive("project");
    this.viewRevision.value;
    const core = this.controller.project(bounds, options);
    const inspection = this.controller.inspect();
    const byId = new Map(inspection.windows.map((window) => [window.id, window]));
    const windows: WorkbenchWindowChromeProjection[] = [];
    const tiledWindows: WorkbenchWindowChromeProjection[] = [];
    const floatingWindows: WorkbenchWindowChromeProjection[] = [];
    let tiledZIndex = 0;
    for (const pane of core.workspace.panes) {
      const window = byId.get(pane.windowId);
      if (!window) continue;
      const chrome = this.#projectWindow(
        window.id,
        window.title ?? window.id,
        "tiled",
        pane.rect,
        tiledZIndex++,
        window,
        options.titleAdornments?.(window.id) ?? [],
      );
      tiledWindows.push(chrome);
      windows.push(chrome);
    }
    for (const projected of core.floatingZOrder) {
      const window = byId.get(projected.id);
      if (!window) continue;
      const chrome = this.#projectWindow(
        window.id,
        window.title ?? window.id,
        "floating",
        projected.rect,
        projected.zIndex,
        window,
        options.titleAdornments?.(window.id) ?? [],
      );
      floatingWindows.push(chrome);
      windows.push(chrome);
    }

    const shelf = this.#projectShelf(inspection, options.shelfBounds);
    const separators = core.workspace.separators.map(projectSeparator);
    return {
      bounds: cloneRect(bounds),
      compact: core.compact,
      compactWindowId: core.compactWindowId,
      topModalId: core.topModalId,
      windows,
      tiledWindows,
      floatingWindows,
      separators,
      shelf,
      switcher: this.#projectSwitcher(inspection, options),
      snapPreview: this.#projectSnapPreview(bounds, inspection),
      core,
    };
  }

  /** Executes a semantic window command through exact history when it mutates durable state. */
  execute(
    command: WorkbenchWindowHostCommand,
    bounds: Rectangle,
    options: WorkbenchWindowHostProjectionOptions = {},
  ): WorkbenchWindowHostResult {
    if (this.#disposed) return hostResult("disposed", false, command, undefined, undefined, "window-host-disposed");
    if (this.#hasActiveGesture()) {
      return hostResult("blocked", false, command, undefined, undefined, "window-gesture-active");
    }
    try {
      if (command.kind === "switcher-open" || command.kind === "switcher-step") {
        return this.#stepSwitcher(command.direction, command, options);
      }
      if (command.kind === "switcher-cancel") {
        const changed = this.#switcher !== undefined;
        this.#switcher = undefined;
        if (changed) this.#publishView();
        return hostResult(changed ? "applied" : "unchanged", changed, command);
      }
      if (command.kind === "switcher-accept") return this.#acceptSwitcher(command, bounds, options);
      if (command.kind === "recover-all") return this.#recoverAll(command, bounds);
      if (command.kind === "focus-next") return this.#focusNext(command, bounds, options);
      if (command.kind === "restore-floating") return this.#restoreFloating(command);
      if (command.kind === "resize-split") {
        return this.#publishAction(command, this.windowHistory.resize(command.splitId, command.delta, bounds, options));
      }

      const id = command.id ?? this.controller.inspect().activeWindowId;
      if (!id) return hostResult("blocked", false, command, undefined, undefined, "no-active-window");
      const inspected = this.controller.inspect().windows.find((window) => window.id === id);
      let action: MarkupWindowActionResult;
      switch (command.kind) {
        case "focus":
          action = this.windowHistory.focus(id);
          break;
        case "nudge":
          action = this.windowHistory.moveBy(id, command.delta);
          break;
        case "resize":
          action = this.windowHistory.resizeWindow(id, command.edge, command.delta);
          break;
        case "snap":
          action = this.windowHistory.snap(id, command.target, bounds);
          break;
        case "dock":
          action = this.windowHistory.dock(id, command.targetId, command.edge, { ratio: command.ratio });
          break;
        case "set-placement":
          action = this.windowHistory.setPlacement(id, command.placement, { rect: command.rect });
          break;
        case "toggle-placement": {
          if (!inspected) return hostResult("invalid", false, command, undefined, undefined, "window-not-found");
          const placement = inspected.placement === "floating" ? "tiled" : "floating";
          action = this.windowHistory.setPlacement(id, placement, { rect: command.rect });
          break;
        }
        case "minimize":
          action = this.windowHistory.minimize(id);
          break;
        case "maximize":
          action = this.windowHistory.maximize(id);
          break;
        case "toggle-maximize":
          action = inspected?.state === "maximized" ? this.windowHistory.restore(id) : this.windowHistory.maximize(id);
          break;
        case "restore":
          action = this.windowHistory.restore(id);
          break;
        case "close":
          action = this.windowHistory.close(id);
          break;
        case "recover-bounds":
          action = this.windowHistory.recoverBounds(id, bounds, { titleBarHeight: 1 });
          break;
        case "toggle-always-on-top":
          if (!inspected) return hostResult("invalid", false, command, undefined, undefined, "window-not-found");
          action = this.windowHistory.setAlwaysOnTop(id, !inspected.alwaysOnTop);
          break;
        case "set-group":
          action = this.windowHistory.setGroup(id, command.groupId);
          break;
        default:
          return hostResult("invalid", false, command, undefined, undefined, "unsupported-window-command");
      }
      return this.#publishAction(command, action);
    } catch (error) {
      return hostResult("failed", false, command, undefined, undefined, safeErrorMessage(error));
    }
  }

  /** Maps one common terminal/browser key shape to discoverable default window commands. */
  handleKey(
    event: Pick<KeyPressEvent, "key" | "ctrl" | "meta" | "shift">,
    bounds: Rectangle,
    options: WorkbenchWindowHostProjectionOptions = {},
  ): WorkbenchWindowHostResult {
    if (this.#switcher) {
      if (event.key === "escape") return this.execute({ kind: "switcher-cancel" }, bounds, options);
      if (event.key === "return" || event.key === "space") {
        return this.execute({ kind: "switcher-accept" }, bounds, options);
      }
      if (event.key === "tab" || event.key === "right" || event.key === "down") {
        return this.execute({ kind: "switcher-step", direction: event.shift ? -1 : 1 }, bounds, options);
      }
      if (event.key === "left" || event.key === "up") {
        return this.execute({ kind: "switcher-step", direction: -1 }, bounds, options);
      }
    }
    if (!event.meta) return hostResult("ignored", false, undefined, undefined, undefined, "window-modifier-not-held");
    if (event.key === "tab") {
      return this.execute({ kind: "switcher-open", direction: event.shift ? -1 : 1 }, bounds, options);
    }
    const edge = keyEdge(event.key);
    if (edge) {
      if (event.ctrl) return this.execute({ kind: "snap", target: { kind: "workspace", edge } }, bounds, options);
      if (event.shift) {
        return this.execute({ kind: "resize", edge, delta: edgeDelta(edge, this.#commandStep) }, bounds, options);
      }
      return this.execute({ kind: "nudge", delta: movementDelta(edge, this.#commandStep) }, bounds, options);
    }
    switch (event.key.toLowerCase()) {
      case "m":
        return this.execute({ kind: "minimize" }, bounds, options);
      case "f":
        return this.execute({ kind: "toggle-maximize" }, bounds, options);
      case "c":
        return this.execute({ kind: "close" }, bounds, options);
      case "r":
        return this.execute({ kind: "recover-bounds" }, bounds, options);
      case "p":
        return this.execute({ kind: "toggle-always-on-top" }, bounds, options);
      case "d":
        return this.execute({ kind: "toggle-placement" }, bounds, options);
      default:
        return hostResult("ignored", false, undefined, undefined, undefined, "unbound-window-key");
    }
  }

  /** Routes normalized pointer input, giving titlebar controls precedence over move/resize chrome. */
  handlePointer(
    eventValue: PointerInputEvent,
    bounds: Rectangle,
    options: WorkbenchWindowHostProjectionOptions = {},
  ): WorkbenchWindowHostResult {
    if (this.#disposed) return hostResult("disposed", false, undefined, undefined, undefined, "window-host-disposed");
    let event: PointerInputEvent;
    try {
      event = normalizePointerInputEvent(eventValue);
    } catch {
      return hostResult("invalid", false, undefined, undefined, undefined, "pointer-event-is-invalid");
    }
    if (this.#separatorResize) return this.#routeSeparatorResize(event, bounds);
    if (event.kind !== "down" && options.doubleClickMaximizeMs !== undefined) {
      const cell = event.coordinates.cell;
      const advanced = reducePointerGesture(this.#titleBarGesture, {
        kind: event.kind === "move" ? "move" : event.kind === "up" ? "up" : "cancel",
        column: cell?.x ?? Number.NaN,
        row: cell?.y ?? Number.NaN,
        timestamp: event.timestamp,
      }, { doubleClickMs: options.doubleClickMaximizeMs });
      this.#titleBarGesture = advanced.state;
      if (advanced.outcome.kind === "double-click") {
        // Let an in-flight move settle first, then toggle: the release still
        // belongs to the gesture that owns it.
        if (this.interactions.inspect().active) this.#routeInteraction(event, bounds);
        return this.execute({ kind: "toggle-maximize", id: advanced.outcome.id }, bounds, options);
      }
    }
    if (this.interactions.inspect().active) return this.#routeInteraction(event, bounds);
    if (event.kind === "down") {
      const point = event.coordinates.cell;
      if (!point) {
        return hostResult("ignored", false, undefined, undefined, undefined, "pointer-has-no-cell-coordinate");
      }
      const projection = this.project(bounds, options);
      if (projection.topModalId) {
        return hostResult(
          "blocked",
          false,
          undefined,
          undefined,
          undefined,
          `pointer-blocked-by-modal:${projection.topModalId}`,
        );
      }
      const primaryActivation = event.primary &&
        (event.button === 0 || (event.device !== "mouse" && event.button === null));
      if (primaryActivation) {
        for (let index = projection.shelf.length - 1; index >= 0; index -= 1) {
          const item = projection.shelf[index]!;
          if (item.rect && containsCell(item.rect, point.x, point.y)) return this.execute(item.command, bounds);
        }
      }
      // Host-owned double-click-to-maximize (opt-in): two quick primary mouse
      // downs on a bare title bar toggle maximize/restore before a move
      // gesture can claim the second click. Mouse only — a touch down is as
      // likely to begin a drag as a tap, so two quick touch drags must not
      // read as a double-tap. Timestamps come from the input envelope, so the
      // host needs no clock of its own.
      if (primaryActivation && event.device === "mouse" && options.doubleClickMaximizeMs !== undefined) {
        const advanced = reducePointerGesture(this.#titleBarGesture, {
          kind: "down",
          id: bareTitleBarWindowAt(projection, point.x, point.y),
          column: point.x,
          row: point.y,
          timestamp: event.timestamp,
        }, { doubleClickMs: options.doubleClickMaximizeMs });
        this.#titleBarGesture = advanced.state;
      }
      // Floating windows paint above the tiled separator layer. Route them
      // first so an expanded separator hit target cannot pierce floating
      // chrome or client content.
      const routeWindow = (window: WorkbenchWindowChromeProjection): WorkbenchWindowHostResult | undefined => {
        if (!containsCell(window.rect, point.x, point.y)) return undefined;
        for (let controlIndex = window.controls.length - 1; controlIndex >= 0; controlIndex -= 1) {
          const control = window.controls[controlIndex]!;
          if (primaryActivation && control.command && containsCell(control.hitRect, point.x, point.y)) {
            return this.execute(control.command, bounds);
          }
        }
        if (!primaryActivation) {
          return hostResult("ignored", false, undefined, undefined, undefined, "pointer-is-not-a-primary-activation");
        }
        if (window.placement === "floating") {
          const hit = this.interactions.hitTest({ column: point.x, row: point.y }, bounds);
          if (hit && hit.region !== "client") return this.#routeInteraction(event, bounds);
        }
        const focus = this.execute({ kind: "focus", id: window.id }, bounds);
        if (containsCell(window.clientRect, point.x, point.y)) {
          // Focus follows the pointer, but client widgets must still receive
          // their own click instead of treating window focus as consumption.
          return { ...focus, handled: false, reason: "window-client-focus-pass-through" };
        }
        return focus;
      };
      for (let windowIndex = projection.floatingWindows.length - 1; windowIndex >= 0; windowIndex -= 1) {
        const result = routeWindow(projection.floatingWindows[windowIndex]!);
        if (result) return result;
      }
      if (primaryActivation) {
        for (let index = projection.separators.length - 1; index >= 0; index -= 1) {
          const separator = projection.separators[index]!;
          if (containsCell(separator.hitRect, point.x, point.y)) {
            return this.#startSeparatorResize(separator, event, options);
          }
        }
      }
      for (let windowIndex = projection.tiledWindows.length - 1; windowIndex >= 0; windowIndex -= 1) {
        const result = routeWindow(projection.tiledWindows[windowIndex]!);
        if (result) return result;
      }
    }
    return this.#routeInteraction(event, bounds);
  }

  /** Adapts the legacy mouse union emitted by both terminal and browser platform hosts. */
  handleMouse(
    source: "terminal" | "browser",
    event: MouseEvent | MousePressEvent,
    bounds: Rectangle,
    options: WorkbenchWindowHostProjectionOptions = {},
  ): WorkbenchWindowHostResult {
    try {
      const envelope = source === "terminal" ? this.#input.terminal(event) : this.#input.browser(event);
      return this.handlePointer(adaptTerminalMousePointer(envelope, event), bounds, options);
    } catch (error) {
      return hostResult("invalid", false, undefined, undefined, undefined, safeErrorMessage(error));
    }
  }

  /**
   * Reconciles a dynamic descriptor inventory through the host's durable
   * commit boundary. Surviving ids retain their controller-owned state and
   * geometry; removed ids release their workspace registrations and chrome
   * caches atomically with the underlying markup reconciliation.
   */
  reconcileWindows(
    windows: readonly WorkbenchWindowHostDescriptor<string>[],
    rootId = "workbench-window-host",
  ): WorkbenchWindowHostResult {
    if (this.#disposed) {
      return hostResult("disposed", false, undefined, undefined, undefined, "window-host-disposed");
    }
    let root: LayoutNode;
    try {
      root = createWorkbenchWindowHostRoot(windows, rootId);
    } catch (error) {
      return hostResult("failed", false, undefined, undefined, undefined, safeErrorMessage(error));
    }
    return this.reconcileRoot(root);
  }

  /**
   * Reconciles a pre-built markup root and publishes exactly one durable host
   * revision on success. Reconciliation is rejected while pointer or history
   * mutations are provisional so a new declaration inventory cannot become a
   * gesture's accidental rollback target.
   */
  reconcileRoot(
    root: LayoutNode,
    options: ReconcileMarkupWindowsOptions = {},
  ): WorkbenchWindowHostResult {
    if (this.#disposed) {
      return hostResult("disposed", false, undefined, undefined, undefined, "window-host-disposed");
    }
    if (this.#hasActiveGesture()) {
      return hostResult("blocked", false, undefined, undefined, undefined, "window-gesture-active");
    }
    if (this.controller.mutationInProgress) {
      return hostResult(
        "blocked",
        false,
        undefined,
        undefined,
        undefined,
        "window-controller-mutation-in-progress",
      );
    }
    const history = this.history.inspect();
    if (history.operation || history.transaction) {
      return hostResult("blocked", false, undefined, undefined, undefined, "window-history-active");
    }

    try {
      const inspection = this.controller.reconcile(root, options);
      // Exact history snapshots close over the previous declaration inventory.
      // A successful reconciliation therefore establishes a new replay base.
      this.history.clear();
      this.#pruneReconciledWindowState(inspection);
      this.#publishCommit();
      return hostResult("applied", true, undefined, undefined, undefined, "windows-reconciled");
    } catch (error) {
      // MarkupWindowController.reconcile restores its complete controller,
      // workspace, and overlay snapshot before surfacing a failure.
      return hostResult("failed", false, undefined, undefined, undefined, safeErrorMessage(error));
    }
  }

  /** Restores exact V2 markup state and publishes one persistence revision. */
  restoreSnapshot(snapshot: unknown): MarkupWindowActionResult {
    this.#assertActive("restore snapshot");
    if (this.#hasActiveGesture()) {
      return {
        action: "restore-snapshot",
        status: "blocked",
        ok: false,
        reason: "window-gesture-active",
      };
    }
    const result = this.controller.restoreSnapshot(snapshot);
    if (result.ok) {
      // A restore establishes a new exact baseline. Older entries close over
      // state that is no longer the live history predecessor.
      this.history.clear();
      this.#publishCommit();
    }
    return result;
  }

  /** Imports a legacy tiled-only showcase session through the core V1 migration. */
  restoreLegacyWorkspace(workspace: TiledWorkspaceSnapshot): MarkupWindowActionResult {
    this.#assertActive("restore legacy workspace");
    const current = this.controller.snapshot();
    return this.restoreSnapshot({
      version: MARKUP_WINDOW_SNAPSHOT_V1_VERSION,
      compactMode: current.compactMode,
      windowIds: current.windowIds,
      minimizedWindowIds: current.minimizedWindowIds,
      closedWindowIds: current.closedWindowIds,
      maximizedWindowId: current.maximizedWindowId,
      modals: current.modals,
      workspace,
    });
  }

  snapshot(): MarkupWindowSnapshot {
    return this.controller.snapshot();
  }

  async undo(): Promise<boolean> {
    this.#assertActive("undo");
    if (this.#hasActiveGesture()) return false;
    const changed = await this.history.undo();
    if (changed) this.#publishCommit();
    return changed;
  }

  async redo(): Promise<boolean> {
    this.#assertActive("redo");
    if (this.#hasActiveGesture()) return false;
    const changed = await this.history.redo();
    if (changed) this.#publishCommit();
    return changed;
  }

  inspect(): WorkbenchWindowHostInspection {
    return {
      disposed: this.#disposed,
      ownsOverlays: this.#ownsOverlays,
      ownsHistory: this.#ownsHistory,
      ownsCapture: this.#ownsCapture,
      commitRevision: this.commitRevision.peek(),
      viewRevision: this.viewRevision.peek(),
      switcherOpen: this.#switcher !== undefined,
      controller: this.controller.inspect(),
      interaction: this.interactions.inspect(),
      history: this.history.inspect(),
      separatorResize: this.#separatorResize
        ? {
          pointerId: this.#separatorResize.pointerId,
          splitId: this.#separatorResize.splitId,
          direction: this.#separatorResize.direction,
          delta: this.#separatorResize.delta,
        }
        : undefined,
    };
  }

  /** Disposes owned composition helpers and managed window registrations, never the injected workspace. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelSeparatorResize();
    this.interactions.dispose();
    this.#separatorOwnerHandle.dispose();
    this.windowHistory.dispose();
    this.history.clear();
    this.controller.dispose();
    if (this.#ownsCapture) this.capture.dispose();
    if (this.#ownsOverlays) this.overlays.dispose();
    this.commitRevision.dispose();
    this.viewRevision.dispose();
  }

  #projectWindow(
    id: string,
    title: string,
    placement: MarkupWindowPlacement,
    rect: Rectangle,
    zIndex: number,
    window: MarkupWindowControllerInspection["windows"][number],
    titleAdornments: readonly string[] = [],
  ): WorkbenchWindowChromeProjection {
    const layout = this.#titlebarLayouts.get(id) ?? createWorkbenchTitlebarLayout();
    this.#titlebarLayouts.set(id, layout);
    layoutWorkbenchTitlebarInto(layout, {
      rect,
      title,
      maximized: window.state === "maximized",
      alwaysOnTop: placement === "floating" ? window.alwaysOnTop : undefined,
      showConfig: this.#windowConfigButton(id),
      configLabel: this.#windowConfigLabel,
      configAccessibilityLabel: `Configure ${title}`,
    });
    const commandBuffer = this.#titlebarCommands.get(id) ?? [];
    this.#titlebarCommands.set(id, commandBuffer);
    const renderCommands = workbenchTitlebarButtonRenderCommandsInto(commandBuffer, layout);
    const reservedMoveColumn = rect.column + Math.floor((Math.max(1, rect.width) - 1) / 2);
    const controls = renderCommands.filter((control) =>
      !(control.hitRect.row === rect.row && containsCell(control.hitRect, reservedMoveColumn, rect.row))
    ).map((control) => {
      const command = titlebarCommand(id, control.kind, placement, window.state);
      return {
        kind: control.kind,
        text: control.text,
        rect: cloneRect(control.rect),
        hitRect: cloneRect(control.hitRect),
        tone: control.tone,
        command,
        semantic: {
          id: `${id}:control:${control.kind}`,
          role: "button" as const,
          label: control.accessibilityLabel,
          shortcut: control.shortcut ? `Alt+${control.shortcut}` : undefined,
        },
      };
    });
    const description = [
      placement === "floating" ? "Floating window" : "Tiled window",
      window.active ? "active" : undefined,
      window.alwaysOnTop ? "always on top" : undefined,
      window.groupId ? `group ${window.groupId}` : undefined,
    ].filter(Boolean).join(", ");
    return {
      id,
      title,
      placement,
      state: window.state,
      rect: cloneRect(rect),
      titleBarRect: {
        column: rect.column,
        row: rect.row,
        width: Math.max(0, rect.width),
        height: rect.height > 0 ? 1 : 0,
      },
      clientRect: insetRect(rect, 1),
      active: window.active,
      alwaysOnTop: window.alwaysOnTop,
      groupId: window.groupId,
      zIndex,
      controls,
      titleAdornments,
      semantic: { id: `${id}:window`, role: "window", label: title, description, selected: window.active },
    };
  }

  #projectShelf(
    inspection: MarkupWindowControllerInspection,
    bounds: Rectangle | undefined,
  ): WorkbenchWindowShelfItem[] {
    const minimized = inspection.windows.filter((window) => window.state === "minimized" && window.declaredVisible);
    let rects = new Map<string, Rectangle>();
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const layout = layoutWorkbenchShelfInto(this.#shelfBuffers, {
        row: bounds.row,
        column: bounds.column,
        width: bounds.width,
        entries: minimized.map((window) => ({ id: window.id, title: window.title ?? window.id })),
      });
      rects = new Map(layout.buttons.map((button) => [button.id, cloneRect(button.rect)]));
    }
    return minimized.map((window, index) => ({
      id: window.id,
      title: window.title ?? window.id,
      active: window.active,
      placement: window.placement,
      rect: rects.get(window.id),
      command: { kind: "restore", id: window.id },
      semantic: {
        id: `${window.id}:shelf`,
        role: "button",
        label: `Restore ${window.title ?? window.id}`,
        positionInSet: index + 1,
        setSize: minimized.length,
      },
    }));
  }

  #projectSwitcher(
    inspection: MarkupWindowControllerInspection,
    options: WorkbenchWindowHostProjectionOptions,
  ): WorkbenchWindowSwitcherProjection | undefined {
    const switcher = this.#reconcileSwitcher(inspection, options);
    if (!switcher) return undefined;
    const byId = new Map(inspection.windows.map((window) => [window.id, window]));
    const items = switcher.ids.flatMap((id, index) => {
      const window = byId.get(id);
      if (!window) return [];
      const selected = index === switcher.selectedIndex;
      return [{
        id,
        title: window.title ?? id,
        selected,
        state: window.state,
        semantic: {
          id: `${id}:switcher`,
          role: "option" as const,
          label: window.title ?? id,
          selected,
          positionInSet: index + 1,
          setSize: switcher.ids.length,
        },
      }];
    });
    return {
      selectedIndex: Math.min(switcher.selectedIndex, Math.max(0, items.length - 1)),
      items,
      semantic: { id: "window-switcher", role: "listbox", label: "Windows" },
    };
  }

  #projectSnapPreview(
    bounds: Rectangle,
    inspection: MarkupWindowControllerInspection,
  ): WorkbenchWindowSnapPreview | undefined {
    const interaction = this.interactions.inspect();
    if (!interaction.snapOnRelease) return undefined;
    const active = interaction.active;
    if (!active || active.mode !== "move" || active.updateCount === 0) return undefined;
    const target = markupWindowSnapTargetAtPoint(
      { column: active.current.column, row: active.current.row },
      bounds,
      interaction.snapDistance,
      interaction.snapEdgeSpanRatio,
      interaction.snapCornerReach,
    );
    if (!target) return undefined;
    const window = inspection.windows.find((candidate) => candidate.id === active.windowId);
    if (!window || window.groupId) return undefined;
    const rect = snapPreviewRect(target, bounds, window);
    return rect ? { windowId: active.windowId, target, rect } : undefined;
  }

  #routeInteraction(event: PointerInputEvent, bounds: Rectangle): WorkbenchWindowHostResult {
    const interaction = this.interactions.handlePointer(event, bounds);
    if (interaction.status === "committed") this.#publishCommit();
    else if (interaction.handled) this.#publishView();
    return {
      status: interaction.status === "failed"
        ? "failed"
        : interaction.status === "blocked"
        ? "blocked"
        : interaction.status === "disposed"
        ? "disposed"
        : interaction.handled
        ? "applied"
        : "ignored",
      handled: interaction.handled,
      interaction,
      reason: interaction.reason,
    };
  }

  #startSeparatorResize(
    separator: WorkbenchWindowSeparatorProjection,
    event: PointerInputEvent,
    options: WorkbenchWindowHostProjectionOptions,
  ): WorkbenchWindowHostResult {
    const point = event.coordinates.cell!;
    let gesture: MarkupWindowHistoryGesture;
    try {
      gesture = this.windowHistory.beginGesture({
        action: "resize",
        id: separator.splitId,
        parameters: { pointer: event.pointerId },
      });
      if (gesture.inspect().state !== "active") {
        return hostResult("blocked", false, separator.command, undefined, undefined, gesture.inspect().reason);
      }
      this.capture.capture(event.pointerId, this.#separatorOwnerId);
    } catch (error) {
      preserveOriginalErrorCleanup(() => gesture?.cancel());
      return hostResult("blocked", false, separator.command, undefined, undefined, safeErrorMessage(error));
    }
    this.#separatorResize = {
      pointerId: event.pointerId,
      splitId: separator.splitId,
      direction: separator.direction,
      startPointerColumn: point.x,
      startPointerRow: point.y,
      startSeparatorColumn: separator.rect.column,
      startSeparatorRow: separator.rect.row,
      delta: 0,
      options: cloneProjectionOptions(options),
      gesture,
    };
    this.#publishView();
    return hostResult("applied", true, separator.command, undefined, undefined, "separator-resize-started");
  }

  #routeSeparatorResize(event: PointerInputEvent, bounds: Rectangle): WorkbenchWindowHostResult {
    const active = this.#separatorResize!;
    const command: WorkbenchWindowHostCommand = { kind: "resize-split", splitId: active.splitId, delta: 0 };
    if (event.pointerId !== active.pointerId) {
      return hostResult("blocked", false, command, undefined, undefined, "another-pointer-owns-separator-resize");
    }
    if (this.capture.captureOwner(active.pointerId) !== this.#separatorOwnerId) {
      const cancelled = this.#cancelSeparatorResize();
      if (cancelled) this.#publishView();
      return hostResult("blocked", false, command, undefined, undefined, "separator-pointer-capture-lost");
    }
    if (event.kind === "cancel") {
      const cancelled = this.#cancelSeparatorResize();
      if (cancelled) this.#publishView();
      return hostResult("applied", true, command, undefined, undefined, "separator-resize-cancelled");
    }
    if (event.kind !== "move" && event.kind !== "up") {
      return hostResult("ignored", false, command, undefined, undefined, "separator-resize-event-ignored");
    }

    let action: MarkupWindowActionResult | undefined;
    const point = event.coordinates.cell;
    if (point) {
      const desiredDelta = active.direction === "row"
        ? point.x - active.startPointerColumn
        : point.y - active.startPointerRow;
      const incremental = desiredDelta - active.delta;
      if (incremental !== 0) {
        action = this.controller.resize(active.splitId, incremental, bounds, active.options);
        if (!action.ok) {
          const reason = action.reason;
          this.#cancelSeparatorResize();
          this.#publishView();
          return hostResult("blocked", true, { ...command, delta: incremental }, action, undefined, reason);
        }
        if (action.status === "applied") {
          const projected = this.controller.project(bounds, active.options).workspace.separators.find((separator) =>
            separator.splitId === active.splitId
          );
          if (!projected) {
            this.#cancelSeparatorResize();
            this.#publishView();
            return hostResult(
              "blocked",
              true,
              { ...command, delta: active.delta },
              action,
              undefined,
              "separator-disappeared-during-resize",
            );
          }
          active.delta = active.direction === "row"
            ? projected.rect.column - active.startSeparatorColumn
            : projected.rect.row - active.startSeparatorRow;
        }
      }
    }

    if (event.kind === "move") {
      if (action?.status === "applied") this.#publishView();
      return hostResult(
        action?.status === "applied" ? "applied" : "unchanged",
        true,
        { ...command, delta: active.delta },
        action,
      );
    }

    let recorded = false;
    try {
      recorded = active.gesture.commit();
    } catch (error) {
      preserveOriginalErrorCleanup(() => this.capture.release(active.pointerId, this.#separatorOwnerId));
      this.#separatorResize = undefined;
      return hostResult(
        "failed",
        true,
        { ...command, delta: active.delta },
        action,
        undefined,
        safeErrorMessage(error),
      );
    }
    preserveOriginalErrorCleanup(() => this.capture.release(active.pointerId, this.#separatorOwnerId));
    this.#separatorResize = undefined;
    if (recorded) this.#publishCommit();
    else this.#publishView();
    return hostResult(
      recorded ? "applied" : "unchanged",
      true,
      { ...command, delta: active.delta },
      action,
      undefined,
      "separator-resize-committed",
    );
  }

  #cancelSeparatorResize(): boolean {
    const active = this.#separatorResize;
    if (!active) return false;
    this.#separatorResize = undefined;
    let cancelled = false;
    try {
      cancelled = active.gesture.cancel();
    } finally {
      if (!this.capture.disposed) {
        preserveOriginalErrorCleanup(() => this.capture.release(active.pointerId, this.#separatorOwnerId));
      }
    }
    return cancelled;
  }

  #hasActiveGesture(): boolean {
    return this.#separatorResize !== undefined || this.interactions.inspect().active !== undefined;
  }

  #pruneReconciledWindowState(inspection: MarkupWindowControllerInspection): void {
    const retainedIds = new Set(inspection.windows.map((window) => window.id));
    for (const id of this.#titlebarLayouts.keys()) {
      if (!retainedIds.has(id)) this.#titlebarLayouts.delete(id);
    }
    for (const id of this.#titlebarCommands.keys()) {
      if (!retainedIds.has(id)) this.#titlebarCommands.delete(id);
    }

    // Shelf buffers are small allocation caches, but their entries retain ids
    // and titles until the next shelf projection. Clear them at the inventory
    // boundary instead of retaining removed application/session metadata.
    this.#shelfBuffers.buttons.length = 0;
    this.#shelfBuffers.items.length = 0;
    this.#shelfBuffers.placements.length = 0;

    const switcher = this.#switcher;
    if (!switcher) return;
    const selectedId = switcher.ids[switcher.selectedIndex];
    const ids = switcher.ids.filter((id) => retainedIds.has(id));
    if (ids.length === 0) {
      this.#switcher = undefined;
      return;
    }
    const retainedIndex = selectedId === undefined ? -1 : ids.indexOf(selectedId);
    this.#switcher = { ids, selectedIndex: retainedIndex >= 0 ? retainedIndex : 0 };
  }

  #publishAction(command: WorkbenchWindowHostCommand, action: MarkupWindowActionResult): WorkbenchWindowHostResult {
    if (action.status === "applied") this.#publishCommit();
    else if (action.ok) this.#publishView();
    return hostResult(
      action.status === "applied"
        ? "applied"
        : action.status === "unchanged"
        ? "unchanged"
        : action.status === "disposed"
        ? "disposed"
        : action.status === "invalid"
        ? "invalid"
        : "blocked",
      action.ok,
      command,
      action,
      undefined,
      action.reason,
    );
  }

  #focusNext(
    command: Extract<WorkbenchWindowHostCommand, { kind: "focus-next" }>,
    bounds: Rectangle,
    options: WorkbenchWindowHostProjectionOptions,
  ): WorkbenchWindowHostResult {
    const inspection = this.controller.inspect();
    const windows = this.#focusableWindows(inspection, options);
    if (windows.length === 0) {
      return hostResult("blocked", false, command, undefined, undefined, "no-focusable-windows");
    }
    const current = windows.findIndex((window) => window.id === inspection.activeWindowId);
    const nextIndex = current < 0
      ? command.direction > 0 ? 0 : windows.length - 1
      : (current + command.direction + windows.length) % windows.length;
    const next = windows[nextIndex]!;
    if (next.state === "minimized") this.execute({ kind: "restore", id: next.id }, bounds, options);
    return this.execute({ kind: "focus", id: next.id }, bounds, options);
  }

  #stepSwitcher(
    direction: -1 | 1,
    command: WorkbenchWindowHostCommand,
    options: WorkbenchWindowHostProjectionOptions,
  ): WorkbenchWindowHostResult {
    const inspection = this.controller.inspect();
    const eligibleIds = this.#focusableWindows(inspection, options).map((window) => window.id);
    if (eligibleIds.length === 0) {
      this.#switcher = undefined;
      return hostResult("blocked", false, command, undefined, undefined, "no-switcher-windows");
    }
    if (!this.#switcher) {
      const activeIndex = Math.max(0, eligibleIds.indexOf(inspection.activeWindowId ?? ""));
      this.#switcher = {
        ids: eligibleIds,
        selectedIndex: (activeIndex + direction + eligibleIds.length) % eligibleIds.length,
      };
    } else {
      const previouslySelected = this.#switcher.ids[this.#switcher.selectedIndex];
      const selectedIndex = eligibleIds.indexOf(previouslySelected ?? "");
      const baseIndex = selectedIndex >= 0
        ? selectedIndex
        : Math.max(0, eligibleIds.indexOf(inspection.activeWindowId ?? ""));
      this.#switcher = {
        ids: eligibleIds,
        selectedIndex: (baseIndex + direction + eligibleIds.length) % eligibleIds.length,
      };
    }
    this.#publishView();
    return hostResult("applied", true, command);
  }

  #acceptSwitcher(
    command: Extract<WorkbenchWindowHostCommand, { kind: "switcher-accept" }>,
    bounds: Rectangle,
    options: WorkbenchWindowHostProjectionOptions,
  ): WorkbenchWindowHostResult {
    const inspection = this.controller.inspect();
    const switcher = this.#reconcileSwitcher(inspection, options);
    const selected = switcher?.ids[switcher.selectedIndex];
    this.#switcher = undefined;
    this.#publishView();
    if (!selected) return hostResult("unchanged", false, command, undefined, undefined, "switcher-is-closed");
    const window = this.#focusableWindows(inspection, options).find((candidate) => candidate.id === selected);
    if (!window) return hostResult("blocked", false, command, undefined, undefined, "switcher-window-not-visible");
    if (window.state === "minimized") this.execute({ kind: "restore", id: selected }, bounds, options);
    return this.execute({ kind: "focus", id: selected }, bounds, options);
  }

  #focusableWindows(
    inspection: MarkupWindowControllerInspection,
    options: WorkbenchWindowHostProjectionOptions,
  ): MarkupWindowControllerInspection["windows"] {
    const visibleTiledIds = options.visibleWindowIds ? new Set(options.visibleWindowIds) : undefined;
    return inspection.windows
      .filter((window) =>
        window.declaredVisible && window.state !== "closed" &&
        (window.placement === "floating" || !visibleTiledIds || visibleTiledIds.has(window.id))
      )
      .sort((left, right) => right.focusOrder - left.focusOrder || left.id.localeCompare(right.id));
  }

  #reconcileSwitcher(
    inspection: MarkupWindowControllerInspection,
    options: WorkbenchWindowHostProjectionOptions,
  ): SwitcherState | undefined {
    const switcher = this.#switcher;
    if (!switcher) return undefined;
    const ids = this.#focusableWindows(inspection, options).map((window) => window.id);
    if (ids.length === 0) {
      this.#switcher = undefined;
      return undefined;
    }
    const selectedId = switcher.ids[switcher.selectedIndex];
    const retainedIndex = ids.indexOf(selectedId ?? "");
    const activeIndex = ids.indexOf(inspection.activeWindowId ?? "");
    this.#switcher = {
      ids,
      selectedIndex: retainedIndex >= 0 ? retainedIndex : activeIndex >= 0 ? activeIndex : 0,
    };
    return this.#switcher;
  }

  #recoverAll(
    command: Extract<WorkbenchWindowHostCommand, { kind: "recover-all" }>,
    bounds: Rectangle,
  ): WorkbenchWindowHostResult {
    const floating = this.controller.inspect().windows.filter((window) =>
      window.placement === "floating" && window.declaredVisible &&
      window.state !== "minimized" && window.state !== "closed"
    );
    let gesture: MarkupWindowHistoryGesture;
    try {
      gesture = this.windowHistory.beginGesture({ action: "recover-bounds", parameters: { all: 1 } });
    } catch (error) {
      return hostResult("blocked", false, command, undefined, undefined, safeErrorMessage(error));
    }
    if (gesture.inspect().state !== "active") {
      return hostResult("blocked", false, command, undefined, undefined, gesture.inspect().reason);
    }
    let applied = false;
    try {
      for (const window of floating) {
        const result = this.controller.recoverBounds(window.id, bounds, { titleBarHeight: 1 });
        if (!result.ok) {
          gesture.cancel();
          return hostResult("blocked", false, command, result, undefined, result.reason);
        }
        applied ||= result.status === "applied";
      }
      const recorded = gesture.commit();
      if (applied || recorded) this.#publishCommit();
      else this.#publishView();
      return hostResult(applied ? "applied" : "unchanged", applied, command);
    } catch (error) {
      try {
        gesture.cancel();
      } catch { /* The adapter reports an exact restore failure through its next inspection. */ }
      return hostResult("failed", false, command, undefined, undefined, safeErrorMessage(error));
    }
  }

  #restoreFloating(
    command: Extract<WorkbenchWindowHostCommand, { kind: "restore-floating" }>,
  ): WorkbenchWindowHostResult {
    const id = command.id ?? this.controller.inspect().activeWindowId;
    if (!id) return hostResult("blocked", false, command, undefined, undefined, "no-active-window");
    let gesture: MarkupWindowHistoryGesture;
    try {
      gesture = this.windowHistory.beginGesture({
        action: "set-placement",
        id,
        parameters: { placement: "floating", restore: 1 },
      });
    } catch (error) {
      return hostResult("blocked", false, command, undefined, undefined, safeErrorMessage(error));
    }
    if (gesture.inspect().state !== "active") {
      return hostResult("blocked", false, command, undefined, undefined, gesture.inspect().reason);
    }
    try {
      const restored = this.controller.restore(id);
      if (!restored.ok) {
        gesture.cancel();
        return hostResult("blocked", false, command, restored, undefined, restored.reason);
      }
      const placed = this.controller.setPlacement(id, "floating");
      if (!placed.ok) {
        gesture.cancel();
        return hostResult("blocked", false, command, placed, undefined, placed.reason);
      }
      const applied = restored.status === "applied" || placed.status === "applied";
      const recorded = gesture.commit();
      if (applied || recorded) this.#publishCommit();
      else this.#publishView();
      return hostResult(applied ? "applied" : "unchanged", applied, command, placed);
    } catch (error) {
      try {
        gesture.cancel();
      } catch { /* Exact history restoration reports any compensation failure. */ }
      return hostResult("failed", false, command, undefined, undefined, safeErrorMessage(error));
    }
  }

  #publishCommit(): void {
    this.commitRevision.value = this.commitRevision.peek() + 1;
    this.#publishView();
  }

  #publishView(): void {
    this.viewRevision.value = this.viewRevision.peek() + 1;
  }

  #assertActive(operation: string): void {
    if (this.#disposed) throw new Error(`Workbench window host is disposed; cannot ${operation}.`);
  }
}

/** Factory form retained for dependency-injection and functional call sites. */
export function createWorkbenchWindowHostController<TId extends string = string>(
  options: WorkbenchWindowHostControllerOptions<TId>,
): WorkbenchWindowHostController<TId> {
  return new WorkbenchWindowHostController(options);
}

function titlebarCommand(
  id: string,
  kind: WorkbenchTitlebarButtonKind,
  placement: MarkupWindowPlacement,
  state: MarkupWindowState,
): WorkbenchWindowHostCommand | undefined {
  if (kind === "config") return undefined;
  if (kind === "maximize") return { kind: "maximize", id };
  if (kind === "restore") {
    return placement === "tiled" && state === "maximized" ? { kind: "restore-floating", id } : { kind: "restore", id };
  }
  if (kind === "minimize") return { kind: "minimize", id };
  if (kind === "close") return { kind: "close", id };
  return { kind: "toggle-always-on-top", id };
}

function projectSeparator(separator: TiledWorkspaceSeparatorLayout): WorkbenchWindowSeparatorProjection {
  const movement = separator.axis === "column" ? "horizontally" : "vertically";
  return {
    splitId: separator.splitId,
    direction: separator.direction,
    axis: separator.axis,
    ratio: separator.ratio,
    bounds: cloneRect(separator.bounds),
    firstRect: cloneRect(separator.firstRect),
    rect: cloneRect(separator.rect),
    hitRect: cloneRect(separator.hitRect),
    secondRect: cloneRect(separator.secondRect),
    command: { kind: "resize-split", splitId: separator.splitId, delta: 1 },
    semantic: {
      id: `${separator.splitId}:separator`,
      role: "separator",
      label: `Resize split ${movement}`,
      description: `Drag ${movement} to resize adjacent tiled windows`,
    },
  };
}

function hostResult(
  status: WorkbenchWindowHostResult["status"],
  handled: boolean,
  command?: WorkbenchWindowHostCommand,
  action?: MarkupWindowActionResult,
  interaction?: MarkupWindowInteractionResult,
  reason?: string,
): WorkbenchWindowHostResult {
  return { status, handled, command, action, interaction, reason };
}

function finitePositive(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function cloneRect(rect: Rectangle): Rectangle {
  return { column: rect.column, row: rect.row, width: rect.width, height: rect.height };
}

function cloneProjectionOptions(options: WorkbenchWindowHostProjectionOptions): ProjectMarkupWindowsOptions {
  return {
    gap: options.gap,
    separatorHitSize: options.separatorHitSize,
    compactMode: options.compactMode,
    visibleWindowIds: options.visibleWindowIds ? [...options.visibleWindowIds] : undefined,
  };
}

function childPointerOwnerId(ownerId: string, suffix: string): string {
  const maxOwnerIdLength = 128;
  const separator = ":";
  const prefixLength = Math.max(1, maxOwnerIdLength - separator.length - suffix.length);
  return `${ownerId.slice(0, prefixLength)}${separator}${suffix}`;
}

function preserveOriginalErrorCleanup(cleanup: () => void): void {
  try {
    cleanup();
  } catch {
    // Cleanup is best-effort when another error is already authoritative.
  }
}

function insetRect(rect: Rectangle, amount: number): Rectangle {
  return {
    column: rect.column + Math.min(amount, Math.max(0, rect.width)),
    row: rect.row + Math.min(amount, Math.max(0, rect.height)),
    width: Math.max(0, rect.width - amount * 2),
    height: Math.max(0, rect.height - amount * 2),
  };
}

function keyEdge(key: string): TiledWorkspaceDockEdge | undefined {
  return key === "left" || key === "right" || key === "top" || key === "bottom"
    ? key
    : key === "up"
    ? "top"
    : key === "down"
    ? "bottom"
    : undefined;
}

function movementDelta(edge: TiledWorkspaceDockEdge, step: number): MarkupWindowMoveDelta {
  return {
    columns: edge === "left" ? -step : edge === "right" ? step : 0,
    rows: edge === "top" ? -step : edge === "bottom" ? step : 0,
  };
}

function edgeDelta(edge: TiledWorkspaceDockEdge, step: number): MarkupWindowMoveDelta {
  return movementDelta(edge, step);
}

function snapPreviewRect(
  target: MarkupWindowSnapTarget,
  bounds: Rectangle,
  window: MarkupWindowControllerInspection["windows"][number],
): Rectangle | undefined {
  if (target.kind === "dock" || bounds.width <= 0 || bounds.height <= 0) return undefined;
  const leftWidth = Math.max(1, Math.ceil(bounds.width / 2));
  const rightWidth = Math.max(1, Math.floor(bounds.width / 2));
  const topHeight = Math.max(1, Math.ceil(bounds.height / 2));
  const bottomHeight = Math.max(1, Math.floor(bounds.height / 2));
  const right = target.kind === "workspace"
    ? target.edge === "right"
    : target.corner === "top-right" || target.corner === "bottom-right";
  const bottom = target.kind === "workspace"
    ? target.edge === "bottom"
    : target.corner === "bottom-left" || target.corner === "bottom-right";
  let width = target.kind === "workspace" && (target.edge === "top" || target.edge === "bottom")
    ? bounds.width
    : right
    ? rightWidth
    : leftWidth;
  let height = target.kind === "workspace" && (target.edge === "left" || target.edge === "right")
    ? bounds.height
    : bottom
    ? bottomHeight
    : topHeight;
  width = Math.max(window.minWidth ?? 1, Math.min(window.maxWidth ?? 1_000_000, width));
  height = Math.max(window.minHeight ?? 1, Math.min(window.maxHeight ?? 1_000_000, height));
  return {
    column: right ? bounds.column + bounds.width - width : bounds.column,
    row: bottom ? bounds.row + bounds.height - height : bounds.row,
    width,
    height,
  };
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "window-host-operation-failed";
  const message = Array.from(error.message, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("").trim();
  return message.slice(0, 256) || "window-host-operation-failed";
}
