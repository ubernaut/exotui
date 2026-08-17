// Copyright 2023 Im-Beast. MIT license.
import {
  normalizePointerInputEvent,
  type PointerCaptureChange,
  type PointerCaptureController,
  type PointerCaptureOwnerHandle,
  type PointerInputEvent,
  type PointerInputKind,
} from "../pointer_input.ts";
import type { Rectangle } from "../types.ts";
import type { MarkupWindowHistoryAdapter, MarkupWindowHistoryGesture } from "./window_history.ts";
import type {
  MarkupFloatingWindowProjection,
  MarkupWindowActionResult,
  MarkupWindowController,
  MarkupWindowMoveDelta,
  MarkupWindowProjection,
  MarkupWindowResizeEdge,
  MarkupWindowSnapshot,
  MarkupWindowSnapTarget,
} from "./windows.ts";

/** Cell coordinate consumed by floating-window hit testing. */
export interface MarkupWindowCellPoint {
  column: number;
  row: number;
}

/** Interactive part of a projected floating window. */
export type MarkupWindowHitRegion = "client" | "title-bar" | MarkupWindowResizeEdge;

/** Clone-safe result of topmost floating-window hit testing. */
export interface MarkupWindowHitInspection {
  id: string;
  region: MarkupWindowHitRegion;
  rect: Rectangle;
  zIndex: number;
  alwaysOnTop: boolean;
}

/** Geometry policy used by pure floating-window hit testing. */
export interface MarkupWindowHitTestOptions {
  titleBarHeight?: number;
  resizeMargin?: number;
}

/** Configuration for the capture-driven floating-window interaction controller. */
export interface MarkupWindowInteractionControllerOptions extends MarkupWindowHitTestOptions {
  controller: MarkupWindowController;
  capture: PointerCaptureController;
  history?: MarkupWindowHistoryAdapter;
  ownerId?: string;
  /** Pointer distance from a workspace edge that activates release-time snapping. */
  snapDistance?: number;
  /**
   * Fraction of the top/bottom edge, centered, that triggers a half snap
   * (default 0.2 — the middle fifth of the edge row). Top/bottom snapping
   * only fires on the edge row itself (plus overshoot past the workspace).
   */
  snapEdgeSpanRatio?: number;
  /** Cells along each edge from a corner that trigger a corner snap (default 4). */
  snapCornerReach?: number;
  /** Defaults to true. Set false to disable automatic workspace/corner snap. */
  snapOnRelease?: boolean;
}

/** Stable mode of one active floating-window gesture. */
export type MarkupWindowInteractionMode = "move" | "resize";

/** Explicit outcome of one normalized pointer event. */
export type MarkupWindowInteractionStatus =
  | "started"
  | "updated"
  | "committed"
  | "cancelled"
  | "ignored"
  | "blocked"
  | "failed"
  | "disposed";

/** Clone-safe result returned for every pointer event. */
export interface MarkupWindowInteractionResult {
  status: MarkupWindowInteractionStatus;
  handled: boolean;
  pointerId?: number;
  pointerKind?: PointerInputKind;
  windowId?: string;
  mode?: MarkupWindowInteractionMode;
  region?: MarkupWindowHitRegion;
  updateCount?: number;
  historyRecorded?: boolean;
  snapTarget?: MarkupWindowSnapTarget;
  action?: MarkupWindowActionResult;
  reason?: string;
}

/** Clone-safe active-gesture diagnostics. */
export interface MarkupWindowActiveInteractionInspection {
  pointerId: number;
  windowId: string;
  mode: MarkupWindowInteractionMode;
  region: MarkupWindowHitRegion;
  resizeEdge?: MarkupWindowResizeEdge;
  start: MarkupWindowCellPoint;
  current: MarkupWindowCellPoint;
  startRect: Rectangle;
  updateCount: number;
}

/** Clone-safe lifetime diagnostics for one interaction controller. */
export interface MarkupWindowInteractionInspection {
  disposed: boolean;
  ownerId: string;
  titleBarHeight: number;
  resizeMargin: number;
  snapDistance: number;
  snapEdgeSpanRatio: number;
  snapCornerReach: number;
  snapOnRelease: boolean;
  active?: MarkupWindowActiveInteractionInspection;
  lastResult?: MarkupWindowInteractionResult;
}

interface NormalizedInteractionOptions {
  ownerId: string;
  titleBarHeight: number;
  resizeMargin: number;
  snapDistance: number;
  snapEdgeSpanRatio: number;
  snapCornerReach: number;
  snapOnRelease: boolean;
}

interface ActiveInteraction {
  pointerId: number;
  windowId: string;
  mode: MarkupWindowInteractionMode;
  region: MarkupWindowHitRegion;
  resizeEdge?: MarkupWindowResizeEdge;
  start: MarkupWindowCellPoint;
  current: MarkupWindowCellPoint;
  startRect: Rectangle;
  bounds: Rectangle;
  updateCount: number;
  geometryPrepared: boolean;
  groupId?: string;
  before?: MarkupWindowSnapshot;
  historyGesture?: MarkupWindowHistoryGesture;
}

interface ActiveInteractionSettlement {
  active: ActiveInteraction;
  delivery: "return" | "lifecycle";
  phase: "commit" | "rollback";
  claims: number;
  cancellationRequested?: boolean;
  disposalRequested?: boolean;
  cancellationError?: string;
}

interface StartInteractionCandidate {
  hit: MarkupWindowHitInspection;
  projectedWindow: MarkupFloatingWindowProjection;
  mode: MarkupWindowInteractionMode;
}

const DEFAULT_OWNER_ID = "markup-floating-windows";
const DEFAULT_TITLE_BAR_HEIGHT = 2;
const DEFAULT_RESIZE_MARGIN = 1;
const DEFAULT_SNAP_DISTANCE = 1;
// Deliberately small edge hot zones (user direction, Aug 17 2026): dragging
// to the top/bottom only half-tiles from the middle fifth of the edge row,
// while corners answer within four cells along each of their edges.
const DEFAULT_SNAP_EDGE_SPAN_RATIO = 0.2;
const DEFAULT_SNAP_CORNER_REACH = 4;
const MAX_INTERACTION_CELL = 1_000_000_000;
const MAX_OWNER_ID_LENGTH = 128;
const MAX_PENDING_LIFECYCLE_RESULTS = 64;

/**
 * Returns the topmost visible floating window at a cell coordinate.
 *
 * Resize corners and side borders win at their actual edge cells. The
 * remaining title-bar surface is a move affordance, so dragging visible
 * title-bar chrome translates the whole window instead of resizing its top.
 * The projection's z-order tiers remain authoritative.
 */
export function hitTestMarkupFloatingWindows(
  projection: MarkupWindowProjection,
  point: MarkupWindowCellPoint,
  options: MarkupWindowHitTestOptions = {},
): MarkupWindowHitInspection | undefined {
  const normalizedPoint = normalizeCellPoint(point);
  const normalizedOptions = normalizeHitTestOptions(options);
  if (!normalizedPoint || !normalizedOptions) return undefined;
  if (projection.topModalId) return undefined;
  for (let index = projection.floatingZOrder.length - 1; index >= 0; index -= 1) {
    const window = projection.floatingZOrder[index]!;
    if (!window.visible || !containsCell(window.rect, normalizedPoint)) continue;
    return Object.freeze({
      id: window.id,
      region: floatingHitRegion(window, normalizedPoint, normalizedOptions),
      rect: Object.freeze(cloneRect(window.rect)),
      zIndex: window.zIndex,
      alwaysOnTop: window.alwaysOnTop,
    });
  }
  return undefined;
}

/**
 * Owns one renderer-neutral title-bar move or border-resize gesture at a time.
 *
 * Hosts pass normalized mouse, touch, or pen events plus current workspace
 * bounds through `handlePointer`; they must not separately route the same event
 * through the injected capture controller. The capture controller keeps
 * delivery exclusive after pointer-down, and an optional history adapter
 * batches every live update into exactly one undo entry.
 *
 * While a gesture is active, hosts must defer direct mutations of the injected
 * window controller, its workspace/overlay signals, and the history stack.
 * Cancellation preserves independently changed workspace and declarative-modal
 * snapshot state when it can be merged without violating controller invariants.
 */
export class MarkupWindowInteractionController {
  readonly controller: MarkupWindowController;
  readonly capture: PointerCaptureController;
  readonly history?: MarkupWindowHistoryAdapter;

  readonly #options: NormalizedInteractionOptions;
  readonly #ownerHandle: PointerCaptureOwnerHandle;
  readonly #unsubscribeCapture: () => void;
  #active?: ActiveInteraction;
  #routingBounds?: Rectangle;
  #routingEvent?: Pick<PointerInputEvent, "kind" | "pointerId" | "sequence">;
  #routeDeliveryConsumed = false;
  #routedResult?: MarkupWindowInteractionResult;
  #lastResult?: MarkupWindowInteractionResult;
  #lifecycleResults = new Map<number, MarkupWindowInteractionResult>();
  #settling?: ActiveInteractionSettlement;
  #handlingPublicCall = false;
  #disposed = false;

  constructor(options: MarkupWindowInteractionControllerOptions) {
    if (!options || typeof options !== "object") throw new TypeError("Window interaction options are required.");
    this.controller = options.controller;
    this.capture = options.capture;
    this.history = options.history;
    if (this.history && this.history.controller !== this.controller) {
      throw new TypeError("Window interaction history must wrap the same window controller.");
    }
    this.#options = normalizeInteractionOptions(options);
    const ownerHandle = this.capture.registerOwner({
      id: this.#options.ownerId,
      onPointer: (event) => {
        const bounds = this.#routingBounds;
        const expected = this.#routingEvent;
        if (
          !bounds || !expected || this.#routeDeliveryConsumed || event.pointerId !== expected.pointerId ||
          event.kind !== expected.kind || event.sequence !== expected.sequence
        ) return;
        this.#routeDeliveryConsumed = true;
        try {
          this.#routedResult = this.#handleRoutedPointer(event, bounds);
        } catch (error) {
          this.#routedResult = this.#failActive(event, error);
        }
      },
    });
    this.#ownerHandle = ownerHandle;
    try {
      this.#unsubscribeCapture = this.capture.subscribe((change) => this.#handleCaptureChange(change));
    } catch (error) {
      ownerHandle.dispose();
      throw error;
    }
  }

  /**
   * Returns the topmost hit after synchronizing dependency lifecycle state.
   * Lifecycle synchronization can cancel an active gesture when a dependency
   * was disposed; use `hitTestMarkupFloatingWindows` for an observational-only
   * projection hit test.
   */
  hitTest(point: MarkupWindowCellPoint, bounds: Rectangle): MarkupWindowHitInspection | undefined {
    if (this.#handlingPublicCall) return undefined;
    this.#handlingPublicCall = true;
    try {
      if (this.#syncDependencyLifecycle()) return undefined;
      if (this.controller.overlays.topModal()) return undefined;
      const normalizedBounds = normalizeBounds(bounds);
      if (!normalizedBounds) return undefined;
      try {
        const hit = hitTestMarkupFloatingWindows(this.controller.project(normalizedBounds), point, this.#options);
        return this.#syncDependencyLifecycle() ? undefined : hit;
      } catch {
        return undefined;
      }
    } finally {
      this.#handlingPublicCall = false;
    }
  }

  /** Routes one pointer event through capture and applies a move, resize, commit, or cancellation transition. */
  handlePointer(eventValue: PointerInputEvent, boundsValue: Rectangle): MarkupWindowInteractionResult {
    if (this.#handlingPublicCall) {
      return interactionResult({
        status: "blocked",
        handled: false,
        reason: "interaction-route-is-reentrant",
      });
    }
    this.#handlingPublicCall = true;
    try {
      return this.#handlePointerInput(eventValue, boundsValue);
    } finally {
      this.#handlingPublicCall = false;
    }
  }

  #handlePointerInput(eventValue: PointerInputEvent, boundsValue: Rectangle): MarkupWindowInteractionResult {
    let dependencyDisposed = this.#syncDependencyLifecycle();

    let event: PointerInputEvent;
    try {
      event = normalizePointerInputEvent(eventValue);
    } catch {
      if (dependencyDisposed) {
        return this.#remember(interactionResult({
          status: "disposed",
          handled: false,
          reason: "interaction-dependency-disposed",
        }));
      }
      return this.#remember(interactionResult({
        status: "ignored",
        handled: false,
        reason: "pointer-event-is-invalid",
      }));
    }
    dependencyDisposed = this.#syncDependencyLifecycle() || dependencyDisposed;
    const lifecycleResult = this.#lifecycleResults.get(event.pointerId);
    if (lifecycleResult?.pointerId === event.pointerId && event.kind !== "down") {
      this.#lifecycleResults.delete(event.pointerId);
      return this.#remember(interactionResult({
        ...lifecycleResult,
        pointerKind: lifecycleResult.pointerKind ?? event.kind,
      }));
    }
    if (lifecycleResult?.pointerId === event.pointerId) this.#lifecycleResults.delete(event.pointerId);
    if (event.kind === "down" && this.#lifecycleResults.size >= MAX_PENDING_LIFECYCLE_RESULTS) {
      return this.#remember(interactionResult({
        status: "blocked",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        reason: "pending-lifecycle-settlement-capacity-exhausted",
      }));
    }
    if (dependencyDisposed) {
      return this.#remember(interactionResult({
        status: "disposed",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        reason: "interaction-dependency-disposed",
      }));
    }
    if (this.#routingBounds) {
      return this.#remember(interactionResult({
        status: "blocked",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        reason: "interaction-route-is-reentrant",
      }));
    }

    let bounds = normalizeBounds(boundsValue);
    if (this.#syncDependencyLifecycle()) {
      const lateLifecycleResult = this.#lifecycleResults.get(event.pointerId);
      if (lateLifecycleResult && event.kind !== "down") {
        this.#lifecycleResults.delete(event.pointerId);
        return this.#remember(interactionResult({
          ...lateLifecycleResult,
          pointerKind: lateLifecycleResult.pointerKind ?? event.kind,
        }));
      }
      if (lateLifecycleResult) this.#lifecycleResults.delete(event.pointerId);
      return this.#remember(interactionResult({
        status: "disposed",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        reason: "interaction-dependency-disposed",
      }));
    }
    const capturedByThisController = this.capture.captureOwner(event.pointerId) === this.#options.ownerId;
    if (
      !bounds && capturedByThisController && this.#active?.pointerId === event.pointerId &&
      (event.kind === "up" || event.kind === "cancel")
    ) {
      bounds = cloneRect(this.#active.bounds);
    }
    if (!bounds) {
      return this.#remember(interactionResult({
        status: "ignored",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        reason: "bounds-are-invalid-or-empty",
      }));
    }

    let hitOwnerId: string | undefined;
    if (event.kind === "down") {
      if (!isPrimaryActivation(event)) {
        return this.#remember(ignoredPointerResult(event, "pointer-is-not-a-primary-activation"));
      }
      const point = pointFromPointer(event);
      if (!point) return this.#remember(ignoredPointerResult(event, "pointer-has-no-finite-cell-coordinate"));
      const blockingModal = this.controller.overlays.topModal();
      if (blockingModal) {
        return this.#remember(interactionResult({
          status: "blocked",
          handled: false,
          pointerId: event.pointerId,
          pointerKind: event.kind,
          reason: `pointer-blocked-by-modal-overlay:${blockingModal.id}`,
        }));
      }
      let projection: MarkupWindowProjection;
      try {
        projection = this.controller.project(bounds);
      } catch (error) {
        return this.#remember(interactionResult({
          status: "failed",
          handled: false,
          pointerId: event.pointerId,
          pointerKind: event.kind,
          reason: `window-projection-failed:${errorMessage(error)}`,
        }));
      }
      const hit = hitTestMarkupFloatingWindows(projection, point, this.#options);
      if (!hit) return this.#remember(ignoredPointerResult(event, "pointer-did-not-hit-a-floating-window"));
      if (hit.region === "client") {
        return this.#remember(interactionResult({
          status: "ignored",
          handled: false,
          pointerId: event.pointerId,
          pointerKind: event.kind,
          windowId: hit.id,
          region: hit.region,
          reason: "client-hit-is-not-a-window-geometry-gesture",
        }));
      }
      if (projection.floatingZOrder.find((window) => window.id === hit.id)?.state === "maximized") {
        return this.#remember(interactionResult({
          status: "blocked",
          handled: false,
          pointerId: event.pointerId,
          pointerKind: event.kind,
          windowId: hit.id,
          region: hit.region,
          reason: "maximized-window-geometry-is-not-interactive",
        }));
      }
      hitOwnerId = this.#options.ownerId;
    } else if (!capturedByThisController) {
      return this.#remember(ignoredPointerResult(event, "pointer-is-not-captured-by-this-controller"));
    }

    this.#routingBounds = bounds;
    this.#routingEvent = { kind: event.kind, pointerId: event.pointerId, sequence: event.sequence };
    this.#routeDeliveryConsumed = false;
    this.#routedResult = undefined;
    let routeError: string | undefined;
    try {
      const route = this.capture.route(event, hitOwnerId);
      routeError = route.error?.message;
    } catch (error) {
      routeError = errorMessage(error);
    } finally {
      this.#routingBounds = undefined;
      this.#routingEvent = undefined;
      this.#routeDeliveryConsumed = false;
    }
    const routed = this.#routedResult;
    this.#routedResult = undefined;
    if (routed) return this.#remember(routed);
    return this.#remember(interactionResult({
      status: routeError ? "failed" : "ignored",
      handled: false,
      pointerId: event.pointerId,
      pointerKind: event.kind,
      reason: routeError ? `pointer-route-failed:${routeError}` : "pointer-route-had-no-owner",
    }));
  }

  /** Returns bounded clone-safe diagnostics without exposing controller snapshots or history callbacks. */
  inspect(): MarkupWindowInteractionInspection {
    this.#syncDependencyLifecycle();
    return {
      disposed: this.#disposed,
      ownerId: this.#options.ownerId,
      titleBarHeight: this.#options.titleBarHeight,
      resizeMargin: this.#options.resizeMargin,
      snapDistance: this.#options.snapDistance,
      snapEdgeSpanRatio: this.#options.snapEdgeSpanRatio,
      snapCornerReach: this.#options.snapCornerReach,
      snapOnRelease: this.#options.snapOnRelease,
      active: this.#active ? cloneActiveInspection(this.#active) : undefined,
      lastResult: this.#lastResult ? cloneInteractionResult(this.#lastResult) : undefined,
    };
  }

  /** Cancels an active gesture and releases only this controller's capture registration. */
  dispose(): void {
    if (this.#disposed) return;
    const nestedSettlement = this.#settling;
    if (nestedSettlement) {
      this.#requestSettlementCancellation(nestedSettlement, true);
      this.#unsubscribeCapture();
      this.#ownerHandle.dispose();
      this.#disposed = true;
      return;
    }
    const active = this.#active;
    const claim = active ? this.#claimSettlement(active, "lifecycle", "rollback") : undefined;
    try {
      if (active) {
        try {
          this.#cancelActive(active);
          const result = interactionResult({
            status: "cancelled",
            handled: true,
            pointerId: active.pointerId,
            windowId: active.windowId,
            mode: active.mode,
            region: active.region,
            updateCount: active.updateCount,
            historyRecorded: false,
            reason: "controller-disposed",
          });
          this.#lastResult = result;
          this.#queueLifecycleResult(result);
        } catch (error) {
          const result = interactionResult({
            status: "failed",
            handled: true,
            pointerId: active.pointerId,
            windowId: active.windowId,
            mode: active.mode,
            region: active.region,
            updateCount: active.updateCount,
            reason: `dispose-cancellation-failed:${errorMessage(error)}`,
          });
          this.#lastResult = result;
          this.#queueLifecycleResult(result);
        }
        this.#active = undefined;
      }
      this.#unsubscribeCapture();
      this.#ownerHandle.dispose();
      this.#disposed = true;
    } finally {
      if (claim) this.#finishSettlement(claim);
    }
  }

  #handleCaptureChange(change: PointerCaptureChange): void {
    const active = this.#active;
    const lostOwnership = change.previousOwnerId === this.#options.ownerId &&
      change.nextOwnerId !== this.#options.ownerId;
    if (active && lostOwnership && change.pointerId === active.pointerId) {
      if (this.#settling?.active === active) {
        this.#requestSettlementCancellation(this.#settling, change.kind === "owner-disposed");
      } else {
        const claim = this.#claimSettlement(active, "lifecycle", "rollback");
        let reason = `pointer-capture-${change.kind}`;
        let cancellationFailed = false;
        try {
          try {
            this.#cancelActive(active);
          } catch (error) {
            cancellationFailed = true;
            reason += `;cancel:${errorMessage(error)}`;
          }
          this.#active = undefined;
          const result = interactionResult({
            status: cancellationFailed ? "failed" : change.kind === "owner-disposed" ? "disposed" : "cancelled",
            handled: true,
            pointerId: active.pointerId,
            windowId: active.windowId,
            mode: active.mode,
            region: active.region,
            updateCount: active.updateCount,
            historyRecorded: false,
            reason,
          });
          this.#lastResult = result;
          this.#queueLifecycleResult(result);
        } finally {
          this.#finishSettlement(claim);
        }
      }
    }
    if (change.kind === "owner-disposed" && change.previousOwnerId === this.#options.ownerId) {
      this.#unsubscribeCapture();
      this.#disposed = true;
    }
  }

  #handleRoutedPointer(event: PointerInputEvent, bounds: Rectangle): MarkupWindowInteractionResult {
    if (event.kind === "down") return this.#start(event, bounds);
    const active = this.#active;
    if (!active || active.pointerId !== event.pointerId) {
      return ignoredPointerResult(event, "pointer-does-not-own-the-active-window-gesture");
    }
    active.bounds = cloneRect(bounds);
    const historyState = active.historyGesture?.inspect();
    if (historyState?.state === "cancelled" || historyState?.state === "unavailable") {
      this.#active = undefined;
      this.#releaseOwnedCapture(event.pointerId);
      return interactionResult({
        status: "cancelled",
        handled: true,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: active.windowId,
        mode: active.mode,
        region: active.region,
        updateCount: active.updateCount,
        historyRecorded: false,
        reason: historyState.reason ?? "window-history-gesture-cancelled",
      });
    }
    if (historyState?.state === "failed") {
      return this.#failActive(event, new Error(historyState.reason ?? "window-history-gesture-failed"));
    }
    if (event.kind === "cancel") return this.#cancel(event, active);
    if (event.kind === "move") return this.#update(event, active, bounds);
    if (event.kind === "up") return this.#commit(event, active, bounds);
    return interactionResult({
      status: "ignored",
      handled: false,
      pointerId: event.pointerId,
      pointerKind: event.kind,
      windowId: active.windowId,
      mode: active.mode,
      region: active.region,
      updateCount: active.updateCount,
      reason: "pointer-kind-does-not-update-window-geometry",
    });
  }

  #start(event: PointerInputEvent, bounds: Rectangle): MarkupWindowInteractionResult {
    if (this.#active) {
      return interactionResult({
        status: "blocked",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        reason: "another-window-gesture-is-active",
      });
    }
    const point = pointFromPointer(event)!;
    const initial = this.#startCandidate(point, bounds);
    if (typeof initial === "string") return this.#rejectedStart(event, initial);

    try {
      this.capture.capture(event.pointerId, this.#options.ownerId);
    } catch (error) {
      return interactionResult({
        status: "blocked",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: initial.hit.id,
        mode: initial.mode,
        region: initial.hit.region,
        reason: `pointer-capture-failed:${errorMessage(error)}`,
      });
    }
    const afterCapture = this.#startCandidate(point, bounds, initial);
    if (
      typeof afterCapture === "string" || this.capture.captureOwner(event.pointerId) !== this.#options.ownerId
    ) {
      this.#releaseOwnedCapture(event.pointerId);
      return this.#rejectedStart(
        event,
        typeof afterCapture === "string" ? afterCapture : "pointer-capture-was-lost-during-gesture-start",
        initial,
      );
    }

    let historyGesture: MarkupWindowHistoryGesture | undefined;
    let before: MarkupWindowSnapshot | undefined;
    let finalCandidate: StartInteractionCandidate | undefined;
    let startFailure: string | undefined;
    try {
      if (this.history) {
        historyGesture = this.history.beginGesture({
          action: afterCapture.mode === "move" ? "move-by" : "resize-window",
          id: afterCapture.hit.id,
          parameters: afterCapture.mode === "resize" ? { edge: afterCapture.hit.region } : undefined,
        });
        if (historyGesture.inspect().state !== "active") {
          throw new Error(historyGesture.inspect().reason ?? "window-history-gesture-unavailable");
        }
      } else {
        before = this.controller.snapshot();
      }
      const focus = this.controller.focus(afterCapture.hit.id);
      if (!focus.ok) throw new Error(focus.reason ?? `focus-${focus.status}`);
      const revalidated = this.#startCandidate(point, bounds, afterCapture);
      if (typeof revalidated === "string") startFailure = revalidated;
      else finalCandidate = revalidated;
      const historyState = historyGesture?.inspect();
      if (historyState && historyState.state !== "active") {
        startFailure = historyState.reason ?? `window-history-gesture-${historyState.state}`;
      }
      if (this.capture.captureOwner(event.pointerId) !== this.#options.ownerId) {
        startFailure = "pointer-capture-was-lost-during-gesture-start";
      }
    } catch (error) {
      startFailure = `gesture-start-failed:${errorMessage(error)}`;
    }
    if (startFailure || !finalCandidate) {
      let compensationError: string | undefined;
      try {
        this.#cancelPendingStart(historyGesture, before);
      } catch (error) {
        compensationError = errorMessage(error);
      }
      this.#releaseOwnedCapture(event.pointerId);
      return interactionResult({
        status: compensationError ? "failed" : this.#startDependenciesDisposed() ? "disposed" : "blocked",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: afterCapture.hit.id,
        mode: afterCapture.mode,
        region: afterCapture.hit.region,
        historyRecorded: false,
        reason: `${startFailure ?? "gesture-start-invalidated"}${
          compensationError ? `;cancel:${compensationError}` : ""
        }`,
      });
    }

    this.#active = {
      pointerId: event.pointerId,
      windowId: finalCandidate.hit.id,
      mode: finalCandidate.mode,
      region: finalCandidate.hit.region,
      resizeEdge: finalCandidate.mode === "resize" ? finalCandidate.hit.region as MarkupWindowResizeEdge : undefined,
      start: point,
      current: point,
      startRect: cloneRect(finalCandidate.hit.rect),
      bounds: cloneRect(bounds),
      updateCount: 0,
      geometryPrepared: false,
      groupId: finalCandidate.projectedWindow.groupId,
      before,
      historyGesture,
    };
    return interactionResult({
      status: "started",
      handled: true,
      pointerId: event.pointerId,
      pointerKind: event.kind,
      windowId: finalCandidate.hit.id,
      mode: finalCandidate.mode,
      region: finalCandidate.hit.region,
      updateCount: 0,
    });
  }

  #startCandidate(
    point: MarkupWindowCellPoint,
    bounds: Rectangle,
    expected?: StartInteractionCandidate,
  ): StartInteractionCandidate | string {
    if (this.#startDependenciesDisposed()) return "interaction-dependency-disposed-during-gesture-start";
    const blockingModal = this.controller.overlays.topModal();
    if (blockingModal) return `pointer-blocked-by-modal-overlay:${blockingModal.id}`;
    let projection: MarkupWindowProjection;
    try {
      projection = this.controller.project(bounds);
    } catch (error) {
      return `window-projection-failed:${errorMessage(error)}`;
    }
    const hit = hitTestMarkupFloatingWindows(projection, point, this.#options);
    if (!hit || hit.region === "client") return "gesture-hit-is-no-longer-actionable";
    const projectedWindow = projection.floatingZOrder.find((window) => window.id === hit.id);
    if (!projectedWindow) return "window-is-no-longer-visible";
    const mode: MarkupWindowInteractionMode = hit.region === "title-bar" ? "move" : "resize";
    if (
      expected &&
      (hit.id !== expected.hit.id || hit.region !== expected.hit.region || mode !== expected.mode)
    ) return "gesture-target-changed-during-start";
    if (projectedWindow.state === "maximized") return "maximized-window-geometry-is-not-interactive";
    if (
      mode === "move" && projectedWindow.groupId &&
      projection.floatingWindows.some((window) =>
        window.groupId === projectedWindow.groupId && window.snapTarget !== undefined
      )
    ) return "snapped-window-group-move-is-ambiguous";
    return { hit, projectedWindow, mode };
  }

  #startDependenciesDisposed(): boolean {
    return this.#disposed || this.capture.disposed || this.#ownerHandle.isDisposed() || this.controller.disposed ||
      Boolean(this.history?.disposed);
  }

  #cancelPendingStart(
    historyGesture: MarkupWindowHistoryGesture | undefined,
    before: MarkupWindowSnapshot | undefined,
  ): void {
    if (historyGesture) {
      const state = historyGesture.inspect();
      if (state.state === "active") {
        if (!historyGesture.cancel() && historyGesture.inspect().state === "failed") {
          throw new Error(historyGesture.inspect().reason ?? "history-gesture-cancel-failed");
        }
      } else if (state.state === "failed") {
        throw new Error(state.reason ?? "history-gesture-failed");
      }
      return;
    }
    if (!before) return;
    const restored = this.controller.restoreSnapshot(before);
    if (!restored.ok) throw new Error(restored.reason ?? `snapshot-${restored.status}`);
  }

  #rejectedStart(
    event: PointerInputEvent,
    reason: string,
    candidate?: StartInteractionCandidate,
  ): MarkupWindowInteractionResult {
    return interactionResult({
      status: this.#startDependenciesDisposed() ? "disposed" : "blocked",
      handled: false,
      pointerId: event.pointerId,
      pointerKind: event.kind,
      windowId: candidate?.hit.id,
      mode: candidate?.mode,
      region: candidate?.hit.region,
      reason,
    });
  }

  #update(
    event: PointerInputEvent,
    active: ActiveInteraction,
    bounds: Rectangle,
  ): MarkupWindowInteractionResult {
    const { projection, projectedWindow } = this.#validateActiveGeometry(active, bounds);
    const point = pointFromPointer(event);
    if (!point) {
      return interactionResult({
        status: "ignored",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: active.windowId,
        mode: active.mode,
        region: active.region,
        updateCount: active.updateCount,
        reason: "pointer-has-no-finite-cell-coordinate",
      });
    }
    const delta = pointDelta(active.current, point);
    if (delta.columns === 0 && delta.rows === 0) {
      return interactionResult({
        status: "ignored",
        handled: false,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: active.windowId,
        mode: active.mode,
        region: active.region,
        updateCount: active.updateCount,
        reason: "pointer-cell-did-not-change",
      });
    }
    let preparation: MarkupWindowActionResult | undefined;
    let actionBeforeRect = cloneRect(projectedWindow.floatingRect);
    if (!active.geometryPrepared) {
      const preparationTargets = active.mode === "move" && active.groupId
        ? projection.floatingWindows.filter((window) => window.visible && window.groupId === active.groupId)
        : [projectedWindow];
      for (const target of preparationTargets) {
        const preparedRect = target.id === active.windowId && active.mode === "move" && target.snapTarget &&
            target.restoreRect
          ? anchoredRestoreRect(target.restoreRect, active.startRect, active.start)
          : target.rect;
        const targetPreparation = this.controller.setFloatingRect(target.id, preparedRect);
        if (!targetPreparation.ok) {
          throw new Error(targetPreparation.reason ?? `window-${targetPreparation.status}`);
        }
        if (target.id === active.windowId) {
          preparation = targetPreparation;
          actionBeforeRect = cloneRect(preparedRect);
        }
      }
      active.geometryPrepared = true;
    }
    const action = active.mode === "move"
      ? this.controller.moveBy(active.windowId, delta)
      : this.controller.resizeWindow(active.windowId, active.resizeEdge!, delta);
    if (!action.ok) {
      throw new Error(action.reason ?? `window-${action.status}`);
    }
    if (active.mode === "move") {
      active.current = point;
    } else {
      const afterRect = this.controller.project(bounds).floatingWindows.find((window) =>
        window.id === active.windowId
      )?.floatingRect ?? actionBeforeRect;
      const horizontal = resizeEdgeMovesHorizontally(active.resizeEdge!);
      const vertical = resizeEdgeMovesVertically(active.resizeEdge!);
      active.current.column = horizontal
        ? active.current.column + consumedHorizontalResize(active.resizeEdge!, actionBeforeRect, afterRect)
        : point.column;
      active.current.row = vertical
        ? active.current.row + consumedVerticalResize(active.resizeEdge!, actionBeforeRect, afterRect)
        : point.row;
    }
    active.bounds = cloneRect(bounds);
    const geometryChanged = preparation?.status === "applied" || action.status === "applied";
    if (geometryChanged) active.updateCount += 1;
    return interactionResult({
      status: geometryChanged ? "updated" : "ignored",
      handled: geometryChanged,
      pointerId: event.pointerId,
      pointerKind: event.kind,
      windowId: active.windowId,
      mode: active.mode,
      region: active.region,
      updateCount: active.updateCount,
      action,
      reason: !geometryChanged && action.status === "unchanged"
        ? "window-geometry-was-clamped-or-unchanged"
        : undefined,
    });
  }

  #validateActiveGeometry(
    active: ActiveInteraction,
    bounds: Rectangle,
  ): { projection: MarkupWindowProjection; projectedWindow: MarkupFloatingWindowProjection } {
    const gestureState = active.historyGesture?.inspect().state;
    if (gestureState && gestureState !== "active") {
      throw new Error(`window-history-gesture-${gestureState}`);
    }
    const projection = this.controller.project(bounds);
    const blockingModal = this.controller.overlays.topModal();
    if (blockingModal) throw new Error(`window-gesture-blocked-by-modal:${blockingModal.id}`);
    const projectedWindow = projection.floatingZOrder.find((window) => window.id === active.windowId);
    if (!projectedWindow || projectedWindow.state === "maximized") {
      throw new Error(
        projectedWindow ? "maximized-window-geometry-is-not-interactive" : "window-is-no-longer-visible",
      );
    }
    if (
      active.mode === "move" && active.groupId &&
      projection.floatingWindows.some((window) => window.groupId === active.groupId && window.snapTarget !== undefined)
    ) {
      throw new Error("snapped-window-group-move-is-ambiguous");
    }
    return { projection, projectedWindow };
  }

  #commit(event: PointerInputEvent, active: ActiveInteraction, bounds: Rectangle): MarkupWindowInteractionResult {
    const claim = this.#claimSettlement(active, "return", "commit");
    try {
      return this.#commitSettled(event, active, bounds, claim);
    } finally {
      this.#finishSettlement(claim);
    }
  }

  #commitSettled(
    event: PointerInputEvent,
    active: ActiveInteraction,
    bounds: Rectangle,
    settlement: ActiveInteractionSettlement,
  ): MarkupWindowInteractionResult {
    const point = pointFromPointer(event);
    if (!point) this.#validateActiveGeometry(active, bounds);
    const finalUpdate = point ? this.#update(event, active, bounds) : undefined;
    if (finalUpdate?.status === "failed" || finalUpdate?.status === "blocked") {
      return this.#failActive(event, new Error(finalUpdate.reason ?? "final-window-update-failed"));
    }

    let snapTarget: MarkupWindowSnapTarget | undefined;
    let snapAction: MarkupWindowActionResult | undefined;
    if (active.mode === "move" && active.updateCount > 0 && !active.groupId && this.#options.snapOnRelease) {
      const point = pointFromPointer(event) ?? active.current;
      snapTarget = markupWindowSnapTargetAtPoint(
        point,
        bounds,
        this.#options.snapDistance,
        this.#options.snapEdgeSpanRatio,
        this.#options.snapCornerReach,
      );
      if (snapTarget) {
        snapAction = this.controller.snap(active.windowId, snapTarget, bounds);
        if (!snapAction.ok) {
          return this.#failActive(event, new Error(snapAction.reason ?? `snap-${snapAction.status}`));
        }
      }
    }

    let historyRecorded = false;
    try {
      historyRecorded = active.historyGesture?.commit() ?? false;
    } catch (error) {
      return this.#failActive(event, error);
    }
    if (settlement.cancellationError) {
      return this.#failActive(event, new Error(`settlement-cancellation-failed:${settlement.cancellationError}`));
    }
    const gestureState = active.historyGesture?.inspect();
    if (settlement.cancellationRequested && !active.historyGesture) {
      try {
        this.#cancelActive(active);
      } catch (error) {
        return this.#failActive(event, error);
      }
      this.#active = undefined;
      return interactionResult({
        status: "cancelled",
        handled: true,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: active.windowId,
        mode: active.mode,
        region: active.region,
        updateCount: active.updateCount,
        historyRecorded: false,
        reason: settlement.disposalRequested
          ? "controller-disposed-during-commit"
          : "interaction-cancelled-during-commit",
      });
    }
    this.#active = undefined;
    if (gestureState?.state === "cancelled" || gestureState?.state === "unavailable") {
      return interactionResult({
        status: "cancelled",
        handled: true,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: active.windowId,
        mode: active.mode,
        region: active.region,
        updateCount: active.updateCount,
        historyRecorded: false,
        reason: gestureState.reason ?? "window-history-gesture-cancelled",
      });
    }
    return interactionResult({
      status: "committed",
      handled: true,
      pointerId: event.pointerId,
      pointerKind: event.kind,
      windowId: active.windowId,
      mode: active.mode,
      region: active.region,
      updateCount: active.updateCount,
      historyRecorded,
      snapTarget,
      action: snapAction ?? finalUpdate?.action,
    });
  }

  #cancel(event: PointerInputEvent, active: ActiveInteraction): MarkupWindowInteractionResult {
    const claim = this.#claimSettlement(active, "return", "rollback");
    try {
      try {
        this.#cancelActive(active);
      } catch (error) {
        return this.#failActive(event, error);
      }
      this.#active = undefined;
      return interactionResult({
        status: "cancelled",
        handled: true,
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: active.windowId,
        mode: active.mode,
        region: active.region,
        updateCount: active.updateCount,
        historyRecorded: false,
        reason: "pointer-cancelled",
      });
    } finally {
      this.#finishSettlement(claim);
    }
  }

  #cancelActive(active: ActiveInteraction): void {
    let concurrentDependencies: MarkupWindowSnapshot | undefined;
    let dependencyCaptureError: unknown;
    if (!this.controller.disposed) {
      try {
        concurrentDependencies = this.controller.snapshot();
      } catch (error) {
        dependencyCaptureError = error;
      }
    }
    let cancellationError: unknown;
    try {
      if (active.historyGesture) {
        if (!active.historyGesture.cancel() && active.historyGesture.inspect().state === "failed") {
          throw new Error(active.historyGesture.inspect().reason ?? "history-gesture-cancel-failed");
        }
      } else if (active.before) {
        const result = this.controller.restoreSnapshot(active.before);
        if (!result.ok) throw new Error(result.reason ?? `snapshot-${result.status}`);
      }
    } catch (error) {
      cancellationError = error;
    }
    if (cancellationError && dependencyCaptureError) {
      throw new AggregateError(
        [dependencyCaptureError, cancellationError],
        "Gesture dependency capture and cancellation both failed.",
      );
    }
    if (cancellationError) throw cancellationError;
    if (dependencyCaptureError) throw dependencyCaptureError;
    if (!concurrentDependencies || this.controller.disposed) return;
    const restored = this.controller.snapshot();
    if (
      JSON.stringify(restored.workspace) === JSON.stringify(concurrentDependencies.workspace) &&
      JSON.stringify(restored.modals) === JSON.stringify(concurrentDependencies.modals)
    ) return;
    const merged: MarkupWindowSnapshot = {
      ...restored,
      workspace: structuredClone(concurrentDependencies.workspace),
      modals: concurrentDependencies.modals.map((modal) => ({ ...modal })),
    };
    const dependencyRestore = this.controller.restoreSnapshot(merged);
    if (!dependencyRestore.ok) {
      throw new Error(dependencyRestore.reason ?? `dependency-snapshot-${dependencyRestore.status}`);
    }
  }

  #failActive(event: PointerInputEvent, error: unknown): MarkupWindowInteractionResult {
    const active = this.#active;
    const claim = active ? this.#claimSettlement(active, "return", "rollback") : undefined;
    if (claim) claim.phase = "rollback";
    let cancellationError: string | undefined;
    try {
      if (active) {
        try {
          this.#cancelActive(active);
        } catch (cancelError) {
          cancellationError = errorMessage(cancelError);
        }
        this.#active = undefined;
      }
      this.#releaseOwnedCapture(event.pointerId);
      return interactionResult({
        status: "failed",
        handled: Boolean(active),
        pointerId: event.pointerId,
        pointerKind: event.kind,
        windowId: active?.windowId,
        mode: active?.mode,
        region: active?.region,
        updateCount: active?.updateCount,
        reason: `${errorMessage(error)}${cancellationError ? `;cancel:${cancellationError}` : ""}`,
      });
    } finally {
      if (claim) this.#finishSettlement(claim);
    }
  }

  #releaseOwnedCapture(pointerId: number): void {
    if (this.capture.disposed || this.capture.captureOwner(pointerId) !== this.#options.ownerId) return;
    try {
      this.capture.release(pointerId, this.#options.ownerId);
    } catch {
      // Ownership can change reentrantly between observation and release.
    }
  }

  #syncDependencyLifecycle(): boolean {
    if (this.#disposed) return true;
    this.#syncHistoryGestureLifecycle();
    const windowControllerDisposed = this.controller.disposed;
    const historyAdapterDisposed = this.history?.disposed ?? false;
    if (
      !this.capture.disposed && !this.#ownerHandle.isDisposed() && !windowControllerDisposed &&
      !historyAdapterDisposed
    ) return false;
    const active = this.#active;
    let cancellationError: string | undefined;
    if (active) {
      if (this.#settling?.active === active) {
        this.#requestSettlementCancellation(this.#settling, true);
      } else {
        const claim = this.#claimSettlement(active, "lifecycle", "rollback");
        try {
          try {
            this.#cancelActive(active);
          } catch (error) {
            cancellationError = errorMessage(error);
          }
          this.#active = undefined;
          const result = interactionResult({
            status: cancellationError ? "failed" : "disposed",
            handled: true,
            pointerId: active.pointerId,
            windowId: active.windowId,
            mode: active.mode,
            region: active.region,
            updateCount: active.updateCount,
            historyRecorded: false,
            reason: cancellationError
              ? `dependency-disposal-cancellation-failed:${cancellationError}`
              : "interaction-dependency-disposed",
          });
          this.#lastResult = result;
          this.#queueLifecycleResult(result);
        } finally {
          this.#finishSettlement(claim);
        }
      }
    }
    this.#unsubscribeCapture();
    this.#ownerHandle.dispose();
    this.#disposed = true;
    return true;
  }

  #syncHistoryGestureLifecycle(): void {
    const active = this.#active;
    if (!active?.historyGesture) return;
    let state: ReturnType<MarkupWindowHistoryGesture["inspect"]>;
    try {
      state = active.historyGesture.inspect();
    } catch (error) {
      state = {
        state: "failed",
        operation: { action: "move-by", id: active.windowId },
        reason: errorMessage(error),
      };
    }
    if (state.state === "active" || state.state === "committed") return;
    this.#active = undefined;
    this.#releaseOwnedCapture(active.pointerId);
    const result = interactionResult({
      status: state.state === "failed" ? "failed" : "cancelled",
      handled: true,
      pointerId: active.pointerId,
      windowId: active.windowId,
      mode: active.mode,
      region: active.region,
      updateCount: active.updateCount,
      historyRecorded: false,
      reason: state.reason ?? `window-history-gesture-${state.state}`,
    });
    this.#lastResult = result;
    this.#queueLifecycleResult(result);
  }

  #claimSettlement(
    active: ActiveInteraction,
    delivery: ActiveInteractionSettlement["delivery"],
    phase: ActiveInteractionSettlement["phase"],
  ): ActiveInteractionSettlement {
    if (this.#settling) {
      if (this.#settling.active !== active) {
        throw new Error("A different window interaction is already settling.");
      }
      this.#settling.claims += 1;
      return this.#settling;
    }
    const settlement: ActiveInteractionSettlement = { active, delivery, phase, claims: 1 };
    this.#settling = settlement;
    return settlement;
  }

  #finishSettlement(settlement: ActiveInteractionSettlement): void {
    settlement.claims = Math.max(0, settlement.claims - 1);
    if (settlement.claims === 0 && this.#settling === settlement) this.#settling = undefined;
  }

  #requestSettlementCancellation(
    settlement: ActiveInteractionSettlement,
    disposalRequested = false,
  ): void {
    settlement.cancellationRequested = true;
    if (disposalRequested) settlement.disposalRequested = true;
    if (settlement.phase !== "commit" || !settlement.active.historyGesture) return;
    try {
      settlement.active.historyGesture.cancel();
    } catch (error) {
      settlement.cancellationError = errorMessage(error);
    }
  }

  #queueLifecycleResult(result: MarkupWindowInteractionResult): void {
    if (result.pointerId === undefined) return;
    this.#lifecycleResults.delete(result.pointerId);
    if (this.#lifecycleResults.size >= MAX_PENDING_LIFECYCLE_RESULTS) return;
    this.#lifecycleResults.set(result.pointerId, cloneInteractionResult(result));
  }

  #remember(result: MarkupWindowInteractionResult): MarkupWindowInteractionResult {
    if (
      result.pointerId !== undefined && result.status !== "started" && result.status !== "updated"
    ) {
      this.#lifecycleResults.delete(result.pointerId);
    }
    this.#lastResult = cloneInteractionResult(result);
    return result;
  }
}

/** Creates a capture-driven floating-window interaction controller. */
export function createMarkupWindowInteractionController(
  options: MarkupWindowInteractionControllerOptions,
): MarkupWindowInteractionController {
  return new MarkupWindowInteractionController(options);
}

function floatingHitRegion(
  window: MarkupFloatingWindowProjection,
  point: MarkupWindowCellPoint,
  options: Required<MarkupWindowHitTestOptions>,
): MarkupWindowHitRegion {
  const rect = window.rect;
  const leftDistance = point.column - rect.column;
  const rightDistance = rect.column + rect.width - 1 - point.column;
  const topDistance = point.row - rect.row;
  const bottomDistance = rect.row + rect.height - 1 - point.row;
  const horizontalMargin = Math.min(options.resizeMargin, Math.ceil(rect.width / 2));
  const verticalMargin = Math.min(options.resizeMargin, Math.ceil(rect.height / 2));
  const nearLeft = leftDistance < horizontalMargin;
  const nearRight = rightDistance < horizontalMargin;
  const nearTop = topDistance < verticalMargin;
  const nearBottom = bottomDistance < verticalMargin;
  const horizontal = nearLeft && nearRight
    ? (leftDistance <= rightDistance ? "left" : "right")
    : nearLeft
    ? "left"
    : nearRight
    ? "right"
    : undefined;
  // A terminal-cell title bar has no separate pixel-sized top border. Keep
  // resize corners at the outer columns, but make every interior title cell
  // draggable before considering the top resize margin.
  if (
    (!horizontal || rect.width <= horizontalMargin * 2) &&
    topDistance < Math.min(options.titleBarHeight, rect.height)
  ) {
    return "title-bar";
  }
  const vertical = nearTop && nearBottom
    ? (topDistance <= bottomDistance ? "top" : "bottom")
    : nearTop
    ? "top"
    : nearBottom
    ? "bottom"
    : undefined;
  if (horizontal && vertical) return `${vertical}-${horizontal}` as MarkupWindowResizeEdge;
  if (horizontal) return horizontal;
  if (vertical) return vertical;
  return "client";
}

function normalizeInteractionOptions(
  options: MarkupWindowInteractionControllerOptions,
): NormalizedInteractionOptions {
  let ownerIdValue: string | undefined;
  let titleBarHeight: number | undefined;
  let resizeMargin: number | undefined;
  let snapDistanceValue: number | undefined;
  let snapEdgeSpanRatioValue: number | undefined;
  let snapCornerReachValue: number | undefined;
  let snapOnReleaseValue: boolean | undefined;
  try {
    ownerIdValue = options.ownerId;
    titleBarHeight = options.titleBarHeight;
    resizeMargin = options.resizeMargin;
    snapDistanceValue = options.snapDistance;
    snapEdgeSpanRatioValue = options.snapEdgeSpanRatio;
    snapCornerReachValue = options.snapCornerReach;
    snapOnReleaseValue = options.snapOnRelease;
  } catch {
    throw new TypeError("Window interaction options could not be read safely.");
  }
  const hit = normalizeHitTestOptions({ titleBarHeight, resizeMargin });
  if (!hit) throw new RangeError("Window title-bar and resize metrics must be bounded non-negative integers.");
  const ownerId = normalizeOwnerId(ownerIdValue);
  const snapDistance = snapDistanceValue ?? DEFAULT_SNAP_DISTANCE;
  if (!Number.isSafeInteger(snapDistance) || snapDistance < 0 || snapDistance > MAX_INTERACTION_CELL) {
    throw new RangeError("Window snap distance must be a bounded non-negative integer.");
  }
  if (snapOnReleaseValue !== undefined && typeof snapOnReleaseValue !== "boolean") {
    throw new TypeError("Window snapOnRelease must be boolean.");
  }
  const snapEdgeSpanRatio = snapEdgeSpanRatioValue ?? DEFAULT_SNAP_EDGE_SPAN_RATIO;
  if (!Number.isFinite(snapEdgeSpanRatio) || snapEdgeSpanRatio <= 0 || snapEdgeSpanRatio > 1) {
    throw new RangeError("Window snap edge span ratio must be in (0, 1].");
  }
  const snapCornerReach = snapCornerReachValue ?? DEFAULT_SNAP_CORNER_REACH;
  if (!Number.isSafeInteger(snapCornerReach) || snapCornerReach < 1 || snapCornerReach > MAX_INTERACTION_CELL) {
    throw new RangeError("Window snap corner reach must be a bounded positive integer.");
  }
  return {
    ownerId,
    ...hit,
    snapDistance,
    snapEdgeSpanRatio,
    snapCornerReach,
    snapOnRelease: snapOnReleaseValue ?? true,
  };
}

function normalizeHitTestOptions(
  options: MarkupWindowHitTestOptions,
): Required<MarkupWindowHitTestOptions> | undefined {
  try {
    const titleBarHeight = options.titleBarHeight ?? DEFAULT_TITLE_BAR_HEIGHT;
    const resizeMargin = options.resizeMargin ?? DEFAULT_RESIZE_MARGIN;
    if (
      !Number.isSafeInteger(titleBarHeight) || titleBarHeight < 1 || titleBarHeight > MAX_INTERACTION_CELL ||
      !Number.isSafeInteger(resizeMargin) || resizeMargin < 0 || resizeMargin > MAX_INTERACTION_CELL
    ) return undefined;
    return { titleBarHeight, resizeMargin };
  } catch {
    return undefined;
  }
}

function normalizeOwnerId(value: string | undefined): string {
  const normalized = value?.trim() || DEFAULT_OWNER_ID;
  if (normalized.length > MAX_OWNER_ID_LENGTH || hasControlCharacters(normalized)) {
    throw new TypeError("Window interaction owner id is invalid or too long.");
  }
  return normalized;
}

function normalizeBounds(value: Rectangle): Rectangle | undefined {
  try {
    const column = ownDataNumber(value, "column");
    const row = ownDataNumber(value, "row");
    const width = ownDataNumber(value, "width");
    const height = ownDataNumber(value, "height");
    if (column === undefined || row === undefined || width === undefined || height === undefined) return undefined;
    if (![column, row, width, height].every(Number.isFinite)) return undefined;
    const rect = {
      column: Math.floor(column),
      row: Math.floor(row),
      width: Math.floor(width),
      height: Math.floor(height),
    };
    if (
      !Number.isSafeInteger(rect.column) || !Number.isSafeInteger(rect.row) ||
      rect.width < 1 || rect.height < 1 || rect.width > MAX_INTERACTION_CELL || rect.height > MAX_INTERACTION_CELL ||
      Math.abs(rect.column) > MAX_INTERACTION_CELL || Math.abs(rect.row) > MAX_INTERACTION_CELL
    ) return undefined;
    return rect;
  } catch {
    return undefined;
  }
}

function normalizeCellPoint(value: MarkupWindowCellPoint): MarkupWindowCellPoint | undefined {
  try {
    const column = ownDataNumber(value, "column");
    const row = ownDataNumber(value, "row");
    if (column === undefined || row === undefined || !Number.isFinite(column) || !Number.isFinite(row)) {
      return undefined;
    }
    const point = { column: Math.floor(column), row: Math.floor(row) };
    if (
      !Number.isSafeInteger(point.column) || !Number.isSafeInteger(point.row) ||
      Math.abs(point.column) > MAX_INTERACTION_CELL || Math.abs(point.row) > MAX_INTERACTION_CELL
    ) return undefined;
    return point;
  } catch {
    return undefined;
  }
}

function ownDataNumber(value: object, key: string): number | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor && typeof descriptor.value === "number" ? descriptor.value : undefined;
}

function pointFromPointer(event: PointerInputEvent): MarkupWindowCellPoint | undefined {
  const cell = event.coordinates.cell;
  return cell ? normalizeCellPoint({ column: cell.x, row: cell.y }) : undefined;
}

function pointDelta(from: MarkupWindowCellPoint, to: MarkupWindowCellPoint): MarkupWindowMoveDelta {
  return { columns: to.column - from.column, rows: to.row - from.row };
}

function anchoredRestoreRect(
  restoreRect: Rectangle,
  snappedRect: Rectangle,
  anchor: MarkupWindowCellPoint,
): Rectangle {
  const horizontalRatio = snappedRect.width <= 1
    ? 0
    : Math.max(0, Math.min(1, (anchor.column - snappedRect.column) / (snappedRect.width - 1)));
  const horizontalOffset = Math.round(horizontalRatio * Math.max(0, restoreRect.width - 1));
  const verticalOffset = Math.max(
    0,
    Math.min(restoreRect.height - 1, anchor.row - snappedRect.row),
  );
  return {
    ...cloneRect(restoreRect),
    column: anchor.column - horizontalOffset,
    row: anchor.row - verticalOffset,
  };
}

function resizeEdgeMovesHorizontally(edge: MarkupWindowResizeEdge): boolean {
  return edge === "left" || edge === "right" || edge.endsWith("-left") || edge.endsWith("-right");
}

function resizeEdgeMovesVertically(edge: MarkupWindowResizeEdge): boolean {
  return edge === "top" || edge === "bottom" || edge.startsWith("top-") || edge.startsWith("bottom-");
}

function consumedHorizontalResize(
  edge: MarkupWindowResizeEdge,
  before: Rectangle,
  after: Rectangle,
): number {
  if (edge === "left" || edge.endsWith("-left")) return after.column - before.column;
  return after.column + after.width - (before.column + before.width);
}

function consumedVerticalResize(
  edge: MarkupWindowResizeEdge,
  before: Rectangle,
  after: Rectangle,
): number {
  if (edge === "top" || edge.startsWith("top-")) return after.row - before.row;
  return after.row + after.height - (before.row + before.height);
}

function containsCell(rect: Rectangle, point: MarkupWindowCellPoint): boolean {
  return point.column >= rect.column && point.row >= rect.row &&
    point.column < rect.column + rect.width && point.row < rect.row + rect.height;
}

function isPrimaryActivation(event: PointerInputEvent): boolean {
  return event.primary && (event.button === 0 || (event.device !== "mouse" && event.button === null));
}

/**
 * The release-snap hot-zone geometry, shared with the host's live drag
 * preview so what the preview shows is exactly what a release commits.
 */
export function markupWindowSnapTargetAtPoint(
  point: MarkupWindowCellPoint,
  bounds: Rectangle,
  distance: number,
  edgeSpanRatio: number,
  cornerReach: number,
): MarkupWindowSnapTarget | undefined {
  const minColumn = bounds.column;
  const maxColumn = bounds.column + bounds.width - 1;
  const minRow = bounds.row;
  const maxRow = bounds.row + bounds.height - 1;
  const withinHorizontalSpan = point.column >= minColumn - distance && point.column <= maxColumn + distance;
  const withinVerticalSpan = point.row >= minRow - distance && point.row <= maxRow + distance;
  // Left/right keep a `distance`-thick full-height band; top/bottom fire only
  // on the edge row itself (with overshoot past the workspace forgiven).
  const onLeftColumn = withinVerticalSpan && Math.abs(point.column - minColumn) <= distance;
  const onRightColumn = withinVerticalSpan && Math.abs(point.column - maxColumn) <= distance;
  const onTopRow = withinHorizontalSpan && point.row <= minRow && point.row >= minRow - distance;
  const onBottomRow = withinHorizontalSpan && point.row >= maxRow && point.row <= maxRow + distance;

  // Corners answer within `cornerReach` cells along each of their edges.
  const nearLeftEnd = point.column <= minColumn + cornerReach - 1;
  const nearRightEnd = point.column >= maxColumn - cornerReach + 1;
  const nearTopEnd = point.row <= minRow + cornerReach - 1;
  const nearBottomEnd = point.row >= maxRow - cornerReach + 1;
  const corner = (onTopRow && nearLeftEnd) || (onLeftColumn && nearTopEnd)
    ? "top-left" as const
    : (onTopRow && nearRightEnd) || (onRightColumn && nearTopEnd)
    ? "top-right" as const
    : (onBottomRow && nearLeftEnd) || (onLeftColumn && nearBottomEnd)
    ? "bottom-left" as const
    : (onBottomRow && nearRightEnd) || (onRightColumn && nearBottomEnd)
    ? "bottom-right" as const
    : undefined;
  if (corner) return { kind: "corner", corner };

  // Top/bottom halves only from the centered span of the edge row.
  const halfSpan = Math.max(1, Math.round((bounds.width * edgeSpanRatio) / 2));
  const centerColumn = minColumn + (bounds.width - 1) / 2;
  const withinEdgeSpan = Math.abs(point.column - centerColumn) <= halfSpan;
  if (onTopRow && withinEdgeSpan) return { kind: "workspace", edge: "top" };
  if (onBottomRow && withinEdgeSpan) return { kind: "workspace", edge: "bottom" };

  if (onLeftColumn && onRightColumn) {
    return {
      kind: "workspace",
      edge: Math.abs(point.column - minColumn) <= Math.abs(point.column - maxColumn) ? "left" : "right",
    };
  }
  if (onLeftColumn) return { kind: "workspace", edge: "left" };
  if (onRightColumn) return { kind: "workspace", edge: "right" };
  return undefined;
}

function ignoredPointerResult(event: PointerInputEvent, reason: string): MarkupWindowInteractionResult {
  return interactionResult({
    status: "ignored",
    handled: false,
    pointerId: event.pointerId,
    pointerKind: event.kind,
    reason,
  });
}

function interactionResult(value: MarkupWindowInteractionResult): MarkupWindowInteractionResult {
  const result = cloneInteractionResult(value);
  if (result.action) Object.freeze(result.action);
  if (result.snapTarget) Object.freeze(result.snapTarget);
  return Object.freeze(result);
}

function cloneInteractionResult(value: MarkupWindowInteractionResult): MarkupWindowInteractionResult {
  return {
    ...value,
    action: value.action ? { ...value.action } : undefined,
    snapTarget: value.snapTarget ? { ...value.snapTarget } : undefined,
  };
}

function cloneActiveInspection(active: ActiveInteraction): MarkupWindowActiveInteractionInspection {
  return {
    pointerId: active.pointerId,
    windowId: active.windowId,
    mode: active.mode,
    region: active.region,
    resizeEdge: active.resizeEdge,
    start: { ...active.start },
    current: { ...active.current },
    startRect: cloneRect(active.startRect),
    updateCount: active.updateCount,
  };
}

function cloneRect(rect: Rectangle): Rectangle {
  return { column: rect.column, row: rect.row, width: rect.width, height: rect.height };
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function errorMessage(error: unknown): string {
  try {
    const value = error instanceof Error ? error.message : String(error);
    return value.length > 512 ? `${value.slice(0, 511)}…` : value;
  } catch {
    return "uninspectable-window-interaction-error";
  }
}
