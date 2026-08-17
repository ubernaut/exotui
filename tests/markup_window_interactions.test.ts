import { assert, assertEquals, assertNotStrictEquals, assertThrows } from "./deps.ts";
import { HistoryStack } from "../src/app/history.ts";
import { OverlayStackController } from "../src/layout/overlay.ts";
import { createLayoutNode, type LayoutNode } from "../src/layout/solver.ts";
import { cellLength, defaultComputedLayoutStyle } from "../src/layout/style.ts";
import { TiledWorkspaceController } from "../src/layout/tiled_workspace.ts";
import {
  hitTestMarkupFloatingWindows,
  MarkupWindowInteractionController,
  markupWindowSnapTargetAtPoint,
} from "../src/markup/window_interactions.ts";
import { MarkupWindowHistoryAdapter } from "../src/markup/window_history.ts";
import { MarkupWindowController } from "../src/markup/windows.ts";
import {
  POINTER_INPUT_SCHEMA_VERSION,
  PointerCaptureController,
  type PointerInputDevice,
  type PointerInputEvent,
  type PointerInputKind,
} from "../src/pointer_input.ts";
import type { Rectangle } from "../src/types.ts";

const bounds: Rectangle = { column: 0, row: 0, width: 80, height: 30 };

Deno.test("floating hit testing honors AOT z-order and deterministic chrome regions", () => {
  const fixture = createFixture({ history: false });
  try {
    fixture.controller.setPlacement("back", "floating", {
      rect: { column: 2, row: 2, width: 30, height: 14 },
    });
    fixture.controller.setPlacement("front", "floating", {
      rect: { column: 8, row: 5, width: 28, height: 12 },
    });
    fixture.controller.setPlacement("pinned", "floating", {
      rect: { column: 10, row: 6, width: 20, height: 9 },
    });
    fixture.controller.setAlwaysOnTop("pinned", true);
    fixture.controller.focus("front");

    const projection = fixture.controller.project(bounds);
    const title = hitTestMarkupFloatingWindows(projection, { column: 14, row: 7 });
    const corner = hitTestMarkupFloatingWindows(projection, { column: 10, row: 6 });
    const right = hitTestMarkupFloatingWindows(projection, { column: 29, row: 10 });
    const client = hitTestMarkupFloatingWindows(projection, { column: 14, row: 10 });
    assertEquals(title, {
      id: "pinned",
      region: "title-bar",
      rect: { column: 10, row: 6, width: 20, height: 9 },
      zIndex: projection.floatingZOrder.at(-1)!.zIndex,
      alwaysOnTop: true,
    });
    assertEquals(corner?.region, "top-left");
    assertEquals(right?.region, "right");
    assertEquals(client?.region, "client");
    for (let row = 6; row < 8; row += 1) {
      for (let column = 11; column < 29; column += 1) {
        assertEquals(
          hitTestMarkupFloatingWindows(projection, { column, row })?.region,
          "title-bar",
        );
      }
    }
    assert(Object.isFrozen(title));
    assert(Object.isFrozen(title!.rect));

    const clone = fixture.interactions.inspect();
    assertNotStrictEquals(clone, fixture.interactions.inspect());
    fixture.controller.minimize("pinned");
    assertEquals(
      hitTestMarkupFloatingWindows(fixture.controller.project(bounds), { column: 14, row: 7 })?.id,
      "front",
    );
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("captured mouse title-bar drag commits one exact undoable history entry", async () => {
  const fixture = createFixture();
  try {
    const before = fixture.controller.snapshot();
    const original = floatingRect(fixture.controller, "front");
    const titleColumn = original.column + 1;
    const titleRow = original.row;
    const started = fixture.interactions.handlePointer(pointer("down", titleColumn, titleRow), bounds);
    assertEquals([started.status, started.mode, started.region], ["started", "move", "title-bar"]);
    assertEquals(fixture.capture.captureOwner(1), "test-floating-windows");
    assertEquals(
      fixture.interactions.handlePointer(pointer("move", titleColumn + 5, titleRow + 4), bounds).status,
      "updated",
    );
    const committed = fixture.interactions.handlePointer(pointer("up", titleColumn + 7, titleRow + 5), bounds);

    assertEquals(committed.status, "committed");
    assertEquals(committed.historyRecorded, true);
    assertEquals(committed.updateCount, 2);
    assertEquals(fixture.capture.captureOwner(1), undefined);
    assertEquals(fixture.history!.undoDepth, 1);
    assertEquals(floatingRect(fixture.controller, "front"), {
      ...original,
      column: original.column + 7,
      row: original.row + 5,
    });

    const moved = fixture.controller.snapshot();
    assertEquals(await fixture.history!.undo(), true);
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(await fixture.history!.redo(), true);
    assertEquals(fixture.controller.snapshot(), moved);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("edge resize cancellation restores exact state and records nothing", () => {
  const fixture = createFixture();
  try {
    const before = fixture.controller.snapshot();
    const rect = floatingRect(fixture.controller, "front");
    const column = rect.column + rect.width - 1;
    const row = rect.row + rect.height - 1;
    const started = fixture.interactions.handlePointer(pointer("down", column, row), bounds);
    assertEquals([started.status, started.mode, started.region], ["started", "resize", "bottom-right"]);
    fixture.interactions.handlePointer(pointer("move", column + 8, row + 4), bounds);
    assertEquals(floatingRect(fixture.controller, "front").width, rect.width + 8);
    const cancelled = fixture.interactions.handlePointer(pointer("cancel", column + 8, row + 4), bounds);

    assertEquals(cancelled.status, "cancelled");
    assertEquals(cancelled.historyRecorded, false);
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(fixture.history!.undoDepth, 0);
    assertEquals(fixture.capture.captureOwner(1), undefined);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("mouse touch and pen title-bar drags have geometry parity", () => {
  const finalRects: Rectangle[] = [];
  for (const device of ["mouse", "touch", "pen"] as const) {
    const fixture = createFixture({ history: false, snapOnRelease: false });
    try {
      const original = floatingRect(fixture.controller, "front");
      const button = device === "mouse" ? 0 : null;
      fixture.interactions.handlePointer(pointer("down", 14, 6, { device, button }), bounds);
      fixture.interactions.handlePointer(pointer("move", 18, 9, { device, button: null }), bounds);
      const result = fixture.interactions.handlePointer(pointer("up", 18, 9, { device, button: null }), bounds);
      assertEquals(result.status, "committed");
      const finalRect = floatingRect(fixture.controller, "front");
      assertEquals(finalRect, { ...original, column: original.column + 4, row: original.row + 3 });
      finalRects.push(finalRect);
    } finally {
      disposeFixture(fixture);
    }
  }
  assertEquals(finalRects[0], finalRects[1]);
  assertEquals(finalRects[1], finalRects[2]);
});

Deno.test("release near two workspace edges commits a corner snap in the same gesture", async () => {
  const fixture = createFixture();
  try {
    const before = fixture.controller.snapshot();
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 0, 0), bounds);
    const committed = fixture.interactions.handlePointer(pointer("up", 0, 0), bounds);

    assertEquals(committed.status, "committed");
    assertEquals(committed.snapTarget, { kind: "corner", corner: "top-left" });
    assertEquals(floatingRect(fixture.controller, "front"), {
      column: 0,
      row: 0,
      width: 40,
      height: 15,
    });
    assertEquals(
      fixture.controller.inspect().windows.find((window) => window.id === "front")?.snapTarget,
      { kind: "corner", corner: "top-left" },
    );
    assertEquals(fixture.history!.undoDepth, 1);
    assertEquals(await fixture.history!.undo(), true);
    assertEquals(fixture.controller.snapshot(), before);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("client secondary coordinate-less and concurrent pointers are ignored or blocked without leaks", () => {
  const fixture = createFixture();
  try {
    assertEquals(
      fixture.interactions.handlePointer(pointer("down", 18, 10), bounds).reason,
      "client-hit-is-not-a-window-geometry-gesture",
    );
    assertEquals(
      fixture.interactions.handlePointer(pointer("down", 14, 6, { button: 2, buttons: 2 }), bounds).reason,
      "pointer-is-not-a-primary-activation",
    );
    assertEquals(
      fixture.interactions.handlePointer(pointer("down", undefined, undefined), bounds).reason,
      "pointer-has-no-finite-cell-coordinate",
    );
    assertEquals(fixture.capture.inspect().captures, []);

    assertEquals(fixture.interactions.handlePointer(pointer("down", 14, 6), bounds).status, "started");
    const blocked = fixture.interactions.handlePointer(pointer("down", 14, 6, { pointerId: 2 }), bounds);
    assertEquals(blocked.status, "blocked");
    assertEquals(blocked.reason, "another-window-gesture-is-active");
    assertEquals(fixture.capture.captureOwner(2), undefined);
    fixture.interactions.handlePointer(pointer("cancel", 14, 6), bounds);
    assertEquals(fixture.capture.inspect().captures, []);
    assertEquals(fixture.history!.undoDepth, 0);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("capture keeps updates alive outside the original hit rectangle", () => {
  const fixture = createFixture({ history: false, snapOnRelease: false });
  try {
    const original = floatingRect(fixture.controller, "front");
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    const outside = fixture.interactions.handlePointer(pointer("move", 70, 25), bounds);
    assertEquals(outside.status, "updated");
    assertEquals(outside.handled, true);
    fixture.interactions.handlePointer(pointer("up", 70, 25), bounds);
    assertEquals(floatingRect(fixture.controller, "front"), {
      ...original,
      column: original.column + 56,
      row: original.row + 19,
    });
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("external release cancellation and owner disposal roll active geometry back exactly", () => {
  const fixture = createFixture();
  try {
    const before = fixture.controller.snapshot();
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 22, 11), bounds);
    assertEquals(fixture.capture.release(1, "test-floating-windows"), true);
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(fixture.interactions.inspect().active, undefined);
    const released = fixture.interactions.handlePointer(pointer("up", 22, 11), bounds);
    assertEquals([released.status, released.reason], ["cancelled", "pointer-capture-released"]);

    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 24, 12), bounds);
    assertEquals(fixture.capture.cancelAll(), 1);
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(fixture.interactions.inspect().active, undefined);
    const cancelled = fixture.interactions.handlePointer(pointer("cancel", 24, 12), bounds);
    assertEquals([cancelled.status, cancelled.reason], ["cancelled", "pointer-capture-cancelled"]);

    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 26, 13), bounds);
    assertEquals(fixture.capture.disposeOwner("test-floating-windows"), true);
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(fixture.interactions.inspect().disposed, true);
    const ownerDisposed = fixture.interactions.handlePointer(pointer("up", 26, 13), bounds);
    assertEquals([ownerDisposed.status, ownerDisposed.reason], ["disposed", "pointer-capture-owner-disposed"]);
    assertEquals(fixture.history!.undoDepth, 0);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("external capture settlements remain one-shot for every pointer id", () => {
  const fixture = createFixture({ history: false });
  try {
    const before = fixture.controller.snapshot();
    fixture.interactions.handlePointer(pointer("down", 14, 6, { pointerId: 1 }), bounds);
    fixture.interactions.handlePointer(pointer("move", 20, 10, { pointerId: 1 }), bounds);
    assertEquals(fixture.capture.release(1, "test-floating-windows"), true);

    fixture.interactions.handlePointer(pointer("down", 14, 6, { pointerId: 2 }), bounds);
    fixture.interactions.handlePointer(pointer("move", 22, 11, { pointerId: 2 }), bounds);
    assertEquals(fixture.capture.release(2, "test-floating-windows"), true);
    assertEquals(fixture.controller.snapshot(), before);

    const first = fixture.interactions.handlePointer(pointer("up", 20, 10, { pointerId: 1 }), bounds);
    const second = fixture.interactions.handlePointer(pointer("up", 22, 11, { pointerId: 2 }), bounds);
    assertEquals([first.status, first.pointerId, first.reason], ["cancelled", 1, "pointer-capture-released"]);
    assertEquals([second.status, second.pointerId, second.reason], ["cancelled", 2, "pointer-capture-released"]);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("pending capture settlements apply backpressure instead of evicting pointers", () => {
  const fixture = createFixture({ history: false });
  try {
    for (let pointerId = 1; pointerId <= 64; pointerId += 1) {
      assertEquals(
        fixture.interactions.handlePointer(pointer("down", 14, 6, { pointerId }), bounds).status,
        "started",
      );
      assertEquals(fixture.capture.release(pointerId, "test-floating-windows"), true);
    }
    const blocked = fixture.interactions.handlePointer(pointer("down", 14, 6, { pointerId: 65 }), bounds);
    assertEquals(
      [blocked.status, blocked.reason],
      ["blocked", "pending-lifecycle-settlement-capacity-exhausted"],
    );
    assertEquals(fixture.capture.captureOwner(65), undefined);

    const first = fixture.interactions.handlePointer(pointer("up", 14, 6, { pointerId: 1 }), bounds);
    assertEquals([first.status, first.pointerId, first.reason], ["cancelled", 1, "pointer-capture-released"]);
    assertEquals(
      fixture.interactions.handlePointer(pointer("down", 14, 6, { pointerId: 65 }), bounds).status,
      "started",
    );
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("dispose cancels active geometry exactly without owning injected controllers", () => {
  const fixture = createFixture();
  const before = fixture.controller.snapshot();
  fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
  fixture.interactions.handlePointer(pointer("move", 24, 12), bounds);
  fixture.interactions.dispose();

  assertEquals(fixture.controller.snapshot(), before);
  assertEquals(fixture.capture.captureOwner(1), undefined);
  assertEquals(fixture.capture.disposed, false);
  assertEquals(fixture.controller.inspect().disposed, false);
  assertEquals(fixture.history!.undoDepth, 0);
  assertEquals(fixture.interactions.inspect().disposed, true);
  assertEquals(fixture.interactions.handlePointer(pointer("down", 14, 6), bounds).status, "disposed");

  fixture.interactions.dispose();
  fixture.adapter!.dispose();
  fixture.controller.dispose();
  fixture.workspace.dispose();
  fixture.overlays.dispose();
  fixture.capture.dispose();
});

Deno.test("interaction options fail early for mismatched history and hostile geometry policy", () => {
  const first = createFixture({ interaction: false });
  const second = createFixture({ interaction: false });
  try {
    assertThrows(
      () =>
        new MarkupWindowInteractionController({
          controller: first.controller,
          capture: first.capture,
          history: second.adapter,
        }),
      TypeError,
      "same window controller",
    );
    assertThrows(
      () =>
        new MarkupWindowInteractionController({
          controller: first.controller,
          capture: first.capture,
          resizeMargin: -1,
        }),
      RangeError,
      "bounded non-negative",
    );
    assertThrows(
      () =>
        new MarkupWindowInteractionController({
          controller: first.controller,
          capture: first.capture,
          ownerId: "x".repeat(129),
        }),
      TypeError,
      "too long",
    );
  } finally {
    disposeFixture(first);
    disposeFixture(second);
  }
});

Deno.test("terminal events use the last valid bounds and always release capture", () => {
  const fixture = createFixture({ snapOnRelease: false });
  const invalidBounds = { column: 0, row: 0, width: 0, height: 0 };
  try {
    const before = fixture.controller.snapshot();
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 20, 10), bounds);
    const cancelled = fixture.interactions.handlePointer(pointer("cancel", 20, 10), invalidBounds);
    assertEquals(cancelled.status, "cancelled");
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(fixture.capture.captureOwner(1), undefined);

    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 18, 9), bounds);
    const committed = fixture.interactions.handlePointer(pointer("up", 18, 9), invalidBounds);
    assertEquals(committed.status, "committed");
    assertEquals(fixture.capture.captureOwner(1), undefined);
    assertEquals(fixture.history!.undoDepth, 1);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("capture-time release and modal activation cannot publish a stale gesture", () => {
  const released = createFixture({ history: false, interaction: false });
  const releaseListener = released.capture.subscribe((change) => {
    if (change.kind === "captured") released.capture.release(change.pointerId, change.nextOwnerId!);
  });
  const releasedInteractions = createInteractions(released);
  try {
    assertEquals(releasedInteractions.handlePointer(pointer("down", 14, 6), bounds).status, "blocked");
    assertEquals(releasedInteractions.inspect().active, undefined);
    assertEquals(released.capture.inspect().captures, []);
  } finally {
    releaseListener();
    releasedInteractions.dispose();
    disposeFixture(released);
  }

  const modal = createFixture({ history: false, interaction: false });
  modal.overlays.register({
    id: "external-modal",
    rect: { column: 30, row: 10, width: 12, height: 5 },
    layer: "modal",
    kind: "modal",
    modal: true,
    visible: false,
  });
  const modalListener = modal.capture.subscribe((change) => {
    if (change.kind === "captured") modal.overlays.open("external-modal");
  });
  const modalInteractions = createInteractions(modal);
  try {
    const before = modal.controller.snapshot();
    const result = modalInteractions.handlePointer(pointer("down", 14, 6), bounds);
    assertEquals(result.status, "blocked");
    assertEquals(result.reason, "pointer-blocked-by-modal-overlay:external-modal");
    assertEquals(modalInteractions.inspect().active, undefined);
    assertEquals(modal.capture.inspect().captures, []);
    assertEquals(modal.controller.snapshot(), before);
    assertEquals(modal.overlays.surface("external-modal")?.visible, true);
  } finally {
    modalListener();
    modalInteractions.dispose();
    disposeFixture(modal);
  }
});

Deno.test("nested capture routing cannot overwrite the outer terminal result", () => {
  const fixture = createFixture({ history: false, interaction: false, snapOnRelease: false });
  let nested = false;
  const listener = fixture.capture.subscribe((change) => {
    if (change.kind !== "auto-released" || change.pointerId !== 1 || nested) return;
    nested = true;
    fixture.capture.route(pointer("down", 14, 6, { pointerId: 2 }), "test-floating-windows");
  });
  const interactions = createInteractions(fixture, { snapOnRelease: false });
  try {
    interactions.handlePointer(pointer("down", 14, 6), bounds);
    interactions.handlePointer(pointer("move", 18, 9), bounds);
    const terminal = interactions.handlePointer(pointer("up", 18, 9), bounds);
    assertEquals(terminal.status, "committed");
    assertEquals(terminal.pointerId, 1);
    assertEquals(nested, true);
    assertEquals(fixture.capture.captureOwner(2), undefined);
    assertEquals(interactions.inspect().active, undefined);
  } finally {
    listener();
    interactions.dispose();
    disposeFixture(fixture);
  }
});

Deno.test("pointer handling rejects reentrancy before hostile bounds are inspected", () => {
  const fixture = createFixture({ history: false });
  const nested: Array<ReturnType<MarkupWindowInteractionController["handlePointer"]>> = [];
  const hostileBounds = new Proxy(bounds, {
    getOwnPropertyDescriptor(target, property) {
      if (nested.length === 0) {
        nested.push(fixture.interactions.handlePointer(pointer("down", 14, 6, { pointerId: 2 }), bounds));
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  try {
    const outer = fixture.interactions.handlePointer(pointer("down", 14, 6), hostileBounds);
    assertEquals(outer.status, "started");
    assertEquals([nested[0]?.status, nested[0]?.reason], ["blocked", "interaction-route-is-reentrant"]);
    assertEquals(fixture.capture.captureOwner(2), undefined);
    assertEquals(fixture.capture.captureOwner(1), "test-floating-windows");
    fixture.interactions.handlePointer(pointer("cancel", 14, 6), bounds);

    nested.length = 0;
    const hostileHitBounds = new Proxy(bounds, {
      getOwnPropertyDescriptor(target, property) {
        if (nested.length === 0) {
          nested.push(fixture.interactions.handlePointer(pointer("down", 14, 6, { pointerId: 2 }), bounds));
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    assertEquals(fixture.interactions.hitTest({ column: 14, row: 6 }, hostileHitBounds)?.id, "front");
    assertEquals([nested[0]?.status, nested[0]?.reason], ["blocked", "interaction-route-is-reentrant"]);
    assertEquals(fixture.capture.captureOwner(2), undefined);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("pointer handling resynchronizes disposal triggered by hostile bounds", () => {
  const fixture = createFixture({ history: false });
  let disposed = false;
  const hostileBounds = new Proxy(bounds, {
    getOwnPropertyDescriptor(target, property) {
      if (!disposed) {
        disposed = true;
        fixture.interactions.dispose();
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  try {
    const result = fixture.interactions.handlePointer(pointer("down", 14, 6), hostileBounds);
    assertEquals([result.status, result.reason], ["disposed", "interaction-dependency-disposed"]);
    assertEquals(fixture.interactions.inspect().disposed, true);
    assertEquals(fixture.capture.inspect().captures, []);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("instance hit testing suppresses hits after hostile point disposal", () => {
  const fixture = createFixture({ history: false });
  let disposed = false;
  const hostilePoint = new Proxy({ column: 14, row: 6 }, {
    getOwnPropertyDescriptor(target, property) {
      if (!disposed) {
        disposed = true;
        fixture.interactions.dispose();
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  try {
    assertEquals(fixture.interactions.hitTest(hostilePoint, bounds), undefined);
    assertEquals(fixture.interactions.inspect().disposed, true);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("external modals block start and cancel an in-flight gesture exactly", () => {
  const fixture = createFixture();
  fixture.overlays.register({
    id: "external-modal",
    rect: { column: 30, row: 10, width: 12, height: 5 },
    layer: "modal",
    kind: "modal",
    modal: true,
    visible: true,
  });
  try {
    assertEquals(fixture.interactions.handlePointer(pointer("down", 14, 6), bounds).status, "blocked");
    fixture.overlays.update("external-modal", { visible: false });
    const before = fixture.controller.snapshot();
    assertEquals(fixture.interactions.handlePointer(pointer("down", 14, 6), bounds).status, "started");
    assertEquals(fixture.interactions.handlePointer(pointer("move", 20, 10), bounds).status, "updated");
    fixture.overlays.update("external-modal", { visible: true });
    const failed = fixture.interactions.handlePointer(pointer("up", 20, 10), bounds);
    assertEquals(failed.status, "failed");
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(fixture.capture.captureOwner(1), undefined);
    assertEquals(fixture.history!.undoDepth, 0);
    assertEquals(fixture.overlays.surface("external-modal")?.visible, true);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("gesture compensation preserves concurrent managed-modal and workspace state", () => {
  for (const historyEnabled of [true, false]) {
    const fixture = createFixture({ history: historyEnabled, dialog: true });
    try {
      const before = fixture.controller.snapshot();
      assertEquals(fixture.interactions.handlePointer(pointer("down", 14, 6), bounds).status, "started");
      assertEquals(fixture.interactions.handlePointer(pointer("move", 20, 10), bounds).status, "updated");
      fixture.workspace.gap.value = 7;
      fixture.overlays.open("dialog");

      const terminal = fixture.interactions.handlePointer(pointer("up", 20, 10), bounds);
      assertEquals(terminal.status, "failed");
      assertEquals(fixture.capture.captureOwner(1), undefined);
      assertEquals(fixture.overlays.surface("dialog")?.visible, true);
      assertEquals(fixture.controller.inspect().modals[0]!.requestedOpen, true);
      assertEquals(fixture.controller.snapshot(), {
        ...before,
        modals: [{ id: "dialog", open: true }],
        workspace: { ...before.workspace, gap: 7 },
      });
      assertEquals(fixture.history?.undoDepth ?? 0, 0);
    } finally {
      disposeFixture(fixture);
    }
  }
});

Deno.test("coordinate-less captured terminal events still honor modal gating", () => {
  const fixture = createFixture();
  try {
    const before = fixture.controller.snapshot();
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 20, 10), bounds);
    fixture.overlays.register({
      id: "late-modal",
      rect: { column: 30, row: 10, width: 12, height: 5 },
      layer: "modal",
      kind: "modal",
      modal: true,
      visible: true,
    });
    const terminal = fixture.interactions.handlePointer(pointer("up"), bounds);
    assertEquals(terminal.status, "failed");
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(fixture.history!.undoDepth, 0);
    assertEquals(fixture.overlays.surface("late-modal")?.visible, true);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("dependency compensation blocks reentrant history from recording intermediate state", () => {
  const fixture = createFixture({ history: false });
  const history = new HistoryStack();
  const adapter = new MarkupWindowHistoryAdapter({ controller: fixture.controller, history });
  const statuses: string[] = [];
  const listener = () => statuses.push(adapter.setAlwaysOnTop("front", true).status);
  try {
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 20, 10), bounds);
    fixture.workspace.gap.value = 7;
    fixture.workspace.gap.subscribe(listener);
    const terminal = fixture.interactions.handlePointer(pointer("cancel", 20, 10), bounds);
    assertEquals(terminal.status, "cancelled");
    assertEquals(statuses.every((status) => status === "blocked"), true);
    assertEquals(history.undoDepth, 0);
    assertEquals(fixture.workspace.gap.peek(), 7);
    assertEquals(
      fixture.controller.inspect().windows.find((window) => window.id === "front")?.alwaysOnTop,
      false,
    );
  } finally {
    fixture.workspace.gap.unsubscribe(listener);
    adapter.dispose();
    disposeFixture(fixture);
  }
});

Deno.test("reentrant disposal during pointer cancellation has one returned settlement", () => {
  const fixture = createFixture({ history: false });
  const before = fixture.controller.snapshot();
  const listener = () => fixture.interactions.dispose();
  try {
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 20, 10), bounds);
    fixture.workspace.gap.value = 7;
    fixture.workspace.gap.subscribe(listener);

    const terminal = fixture.interactions.handlePointer(pointer("cancel", 20, 10), bounds);
    fixture.workspace.gap.unsubscribe(listener);
    assertEquals([terminal.status, terminal.reason], ["cancelled", "pointer-cancelled"]);
    assertEquals(fixture.controller.snapshot(), {
      ...before,
      workspace: { ...before.workspace, gap: 7 },
    });
    assertEquals(fixture.interactions.inspect().disposed, true);
    assertEquals(fixture.interactions.inspect().active, undefined);
    assertEquals(fixture.interactions.inspect().lastResult, terminal);
    assertEquals(fixture.capture.inspect().captures, []);

    const later = fixture.interactions.handlePointer(pointer("up", 20, 10), bounds);
    assertEquals([later.status, later.reason], ["disposed", "interaction-dependency-disposed"]);
  } finally {
    fixture.workspace.gap.unsubscribe(listener);
    disposeFixture(fixture);
  }
});

Deno.test("history adapter disposal preserves concurrent gesture dependencies", () => {
  const fixture = createFixture({ dialog: true });
  try {
    const before = fixture.controller.snapshot();
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 20, 10), bounds);
    fixture.workspace.gap.value = 7;
    fixture.overlays.open("dialog");
    fixture.adapter!.dispose();
    fixture.interactions.inspect();

    assertEquals(fixture.controller.snapshot(), {
      ...before,
      modals: [{ id: "dialog", open: true }],
      workspace: { ...before.workspace, gap: 7 },
    });
    assertEquals(fixture.overlays.surface("dialog")?.visible, true);
    assertEquals(fixture.capture.captureOwner(1), undefined);
    assertEquals(fixture.history!.undoDepth, 0);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("gesture cancellation preserves externally removed managed-modal registrations", () => {
  for (const historyEnabled of [true, false]) {
    const fixture = createFixture({ history: historyEnabled, dialog: true });
    try {
      const before = fixture.controller.snapshot();
      fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
      fixture.interactions.handlePointer(pointer("move", 20, 10), bounds);
      fixture.overlays.remove("dialog");
      assertEquals(fixture.interactions.handlePointer(pointer("cancel", 20, 10), bounds).status, "cancelled");
      assertEquals(fixture.controller.snapshot(), before);
      assertEquals(fixture.overlays.surface("dialog"), undefined);
      assertEquals(fixture.controller.inspect().modals[0]!.registered, false);
    } finally {
      disposeFixture(fixture);
    }
  }
});

Deno.test("controller and history disposal clean active capture without stale pointer locks", () => {
  const controllerFixture = createFixture();
  controllerFixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
  controllerFixture.interactions.handlePointer(pointer("move", 19, 9), bounds);
  controllerFixture.controller.dispose();
  const disposed = controllerFixture.interactions.handlePointer(pointer("move", 20, 10), bounds);
  assertEquals([disposed.status, controllerFixture.capture.captureOwner(1)], ["failed", undefined]);
  const unrelated = controllerFixture.interactions.handlePointer(
    pointer("down", 14, 6, { pointerId: 2 }),
    bounds,
  );
  assertEquals([unrelated.status, unrelated.pointerId, unrelated.pointerKind], ["disposed", 2, "down"]);
  const replacement = controllerFixture.capture.registerOwner({
    id: "test-floating-windows",
    onPointer: () => {},
  });
  replacement.dispose();
  controllerFixture.interactions.dispose();
  controllerFixture.adapter!.dispose();
  controllerFixture.workspace.dispose();
  controllerFixture.overlays.dispose();
  controllerFixture.capture.dispose();

  const historyFixture = createFixture();
  try {
    historyFixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    historyFixture.interactions.handlePointer(pointer("move", 19, 9), bounds);
    historyFixture.adapter!.dispose();
    assertEquals(historyFixture.adapter!.disposed, true);
    assertEquals(historyFixture.interactions.inspect().active, undefined);
    assertEquals(historyFixture.interactions.inspect().disposed, true);
    assertEquals(historyFixture.capture.captureOwner(1), undefined);
    const settled = historyFixture.interactions.handlePointer(pointer("up", 19, 9), bounds);
    assertEquals(settled.status, "cancelled");
    assertEquals(settled.pointerId, 1);
    const pointerTwo = historyFixture.interactions.handlePointer(
      pointer("down", 14, 6, { pointerId: 2 }),
      bounds,
    );
    assertEquals(pointerTwo.status, "disposed");
    assertEquals(historyFixture.capture.captureOwner(2), undefined);
  } finally {
    disposeFixture(historyFixture);
  }
});

Deno.test("snapped move detaches from anchored restore geometry while no-op stays exact", () => {
  const fixture = createFixture({ snapOnRelease: false });
  try {
    const original = floatingRect(fixture.controller, "front");
    assertEquals(fixture.controller.snap("front", { kind: "workspace", edge: "left" }, bounds).status, "applied");
    const snapped = fixture.controller.snapshot();
    fixture.interactions.handlePointer(pointer("down", 10, 1), bounds);
    assertEquals(fixture.interactions.handlePointer(pointer("up", 10, 1), bounds).status, "committed");
    assertEquals(fixture.controller.snapshot(), snapped);
    assertEquals(fixture.history!.undoDepth, 0);

    fixture.interactions.handlePointer(pointer("down", 10, 1), bounds);
    const rejected = fixture.interactions.handlePointer(pointer("move", 1_000_000_000, 1), bounds);
    assertEquals([rejected.status, rejected.handled], ["failed", true]);
    assertEquals(fixture.controller.snapshot(), snapped);
    assertEquals(fixture.capture.captureOwner(1), undefined);
    assertEquals(fixture.history!.undoDepth, 0);

    fixture.interactions.handlePointer(pointer("down", 10, 1), bounds);
    fixture.interactions.handlePointer(pointer("move", 15, 4), bounds);
    assertEquals(fixture.interactions.handlePointer(pointer("up", 15, 4), bounds).status, "committed");
    const detached = floatingRect(fixture.controller, "front");
    assertEquals({ width: detached.width, height: detached.height }, {
      width: original.width,
      height: original.height,
    });
    assertEquals(fixture.controller.inspect().windows.find((window) => window.id === "front")?.snapTarget, undefined);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("group moves reject snapped peers and prepare every visible offscreen peer", () => {
  const fixture = createFixture({ history: false, snapOnRelease: false });
  try {
    fixture.controller.setPlacement("pinned", "floating", {
      rect: { column: 45, row: 5, width: 20, height: 9 },
    });
    fixture.controller.setGroup("front", "tools");
    fixture.controller.setGroup("pinned", "tools");
    fixture.controller.snap("pinned", { kind: "workspace", edge: "right" }, bounds);
    const blocked = fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    assertEquals(blocked.reason, "snapped-window-group-move-is-ambiguous");
    assertEquals(fixture.capture.inspect().captures, []);

    fixture.controller.setFloatingRect("pinned", { column: 500, row: 5, width: 20, height: 9 });
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", 18, 6), bounds);
    fixture.interactions.handlePointer(pointer("up", 18, 6), bounds);
    assertEquals(floatingRect(fixture.controller, "pinned").column, 74);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("maximized windows are inert and tiny chrome retains a move affordance", () => {
  const fixture = createFixture({ history: false });
  try {
    fixture.controller.maximize("front");
    const blocked = fixture.interactions.handlePointer(pointer("down", 39, 0), bounds);
    assertEquals(blocked.reason, "maximized-window-geometry-is-not-interactive");
    assertEquals(fixture.capture.inspect().captures, []);
  } finally {
    disposeFixture(fixture);
  }

  const workspace = new TiledWorkspaceController();
  const overlays = new OverlayStackController();
  const tiny = new MarkupWindowController({
    root: markupRoot(windowNode("tiny", { minWidth: 1, minHeight: 1 })),
    workspace,
    overlays,
  });
  try {
    tiny.setPlacement("tiny", "floating", { rect: { column: 3, row: 2, width: 1, height: 1 } });
    assertEquals(
      hitTestMarkupFloatingWindows(tiny.project(bounds), { column: 3, row: 2 })?.region,
      "title-bar",
    );
  } finally {
    tiny.dispose();
    workspace.dispose();
    overlays.dispose();
  }
});

Deno.test("resize overshoot tracks only consumed edge movement", () => {
  const fixture = createFixture({ history: false, frontMaxHeight: 6 });
  try {
    fixture.controller.setFloatingRect("front", { column: 10, row: 5, width: 8, height: 4 });
    fixture.interactions.handlePointer(pointer("down", 13, 8), bounds);
    fixture.interactions.handlePointer(pointer("move", 13, 18), bounds);
    assertEquals(floatingRect(fixture.controller, "front").height, 6);
    fixture.interactions.handlePointer(pointer("move", 13, 17), bounds);
    assertEquals(floatingRect(fixture.controller, "front").height, 6);
    fixture.interactions.handlePointer(pointer("move", 13, 9), bounds);
    assertEquals(floatingRect(fixture.controller, "front").height, 5);
    fixture.interactions.handlePointer(pointer("up", 13, 9), bounds);
  } finally {
    disposeFixture(fixture);
  }
});

Deno.test("history metadata cancellation cannot commit a reentrant terminal gesture", () => {
  const fixture = createFixture({ history: false, interaction: false });
  const history = new HistoryStack();
  const adapter = new MarkupWindowHistoryAdapter({
    controller: fixture.controller,
    history,
    label: () => {
      fixture.capture.route(pointer("cancel", 19, 10));
      return "reentrant cancel";
    },
  });
  const interactions = createInteractions(fixture, { history: adapter });
  try {
    const before = fixture.controller.snapshot();
    interactions.handlePointer(pointer("down", 14, 6), bounds);
    interactions.handlePointer(pointer("move", 19, 10), bounds);
    const terminal = interactions.handlePointer(pointer("up", 19, 10), bounds);
    assertEquals(terminal.status, "cancelled");
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(history.undoDepth, 0);
    assertEquals(fixture.capture.captureOwner(1), undefined);
  } finally {
    interactions.dispose();
    adapter.dispose();
    disposeFixture(fixture);
  }
});

Deno.test("history metadata disposal settles the committing pointer exactly once", () => {
  const fixture = createFixture({ history: false, interaction: false });
  const history = new HistoryStack();
  const adapter = new MarkupWindowHistoryAdapter({
    controller: fixture.controller,
    history,
    label: () => {
      interactions.dispose();
      return "dispose during commit";
    },
  });
  const interactions = createInteractions(fixture, { history: adapter });
  try {
    const before = fixture.controller.snapshot();
    interactions.handlePointer(pointer("down", 14, 6), bounds);
    interactions.handlePointer(pointer("move", 19, 10), bounds);
    const terminal = interactions.handlePointer(pointer("up", 19, 10), bounds);
    assertEquals(terminal.status, "cancelled");
    assertEquals(fixture.controller.snapshot(), before);
    assertEquals(history.undoDepth, 0);
    assertEquals(fixture.capture.inspect().captures, []);
    assertEquals(interactions.inspect().lastResult, terminal);

    const later = interactions.handlePointer(pointer("cancel", 19, 10), bounds);
    assertEquals([later.status, later.reason], ["disposed", "interaction-dependency-disposed"]);
  } finally {
    interactions.dispose();
    adapter.dispose();
    disposeFixture(fixture);
  }
});

Deno.test("release snap uses finite edge segments and options are read once", () => {
  const fixture = createFixture({ history: false });
  try {
    fixture.interactions.handlePointer(pointer("down", 14, 6), bounds);
    fixture.interactions.handlePointer(pointer("move", -100, 6), bounds);
    const terminal = fixture.interactions.handlePointer(pointer("up", -100, 6), bounds);
    assertEquals(terminal.snapTarget, undefined);
    assertEquals(fixture.controller.inspect().windows.find((window) => window.id === "front")?.snapTarget, undefined);
  } finally {
    disposeFixture(fixture);
  }

  const once = createFixture({ history: false, interaction: false });
  let reads = 0;
  const option = {
    controller: once.controller,
    capture: once.capture,
    get snapOnRelease() {
      reads += 1;
      return false;
    },
  };
  const interactions = new MarkupWindowInteractionController(option);
  try {
    assertEquals(reads, 1);
    assertEquals(interactions.inspect().snapOnRelease, false);
  } finally {
    interactions.dispose();
    disposeFixture(once);
  }
});

interface Fixture {
  workspace: TiledWorkspaceController;
  overlays: OverlayStackController;
  controller: MarkupWindowController;
  capture: PointerCaptureController;
  history?: HistoryStack;
  adapter?: MarkupWindowHistoryAdapter;
  interactions: MarkupWindowInteractionController;
}

interface FixtureOptions {
  history?: boolean;
  interaction?: boolean;
  snapOnRelease?: boolean;
  frontMaxHeight?: number;
  dialog?: boolean;
}

function createFixture(options: FixtureOptions = {}): Fixture {
  const workspace = new TiledWorkspaceController();
  const overlays = new OverlayStackController();
  const nodes = [
    windowNode("back"),
    windowNode("front", { maxHeight: options.frontMaxHeight }),
    windowNode("pinned"),
  ];
  if (options.dialog) nodes.push(createLayoutNode({ id: "dialog", tag: "dialog" }));
  const controller = new MarkupWindowController({
    root: markupRoot(...nodes),
    workspace,
    overlays,
    compactMode: "never",
    layout: options.dialog
      ? { byId: new Map([["dialog", { rect: { column: 30, row: 10, width: 12, height: 5 } }]]) }
      : undefined,
  });
  controller.setPlacement("front", "floating", {
    rect: { column: 10, row: 5, width: 28, height: 12 },
  });
  const capture = new PointerCaptureController();
  const history = options.history === false ? undefined : new HistoryStack();
  const adapter = history ? new MarkupWindowHistoryAdapter({ controller, history }) : undefined;
  const interactions = options.interaction === false ? undefined : new MarkupWindowInteractionController({
    controller,
    capture,
    history: adapter,
    ownerId: "test-floating-windows",
    titleBarHeight: 2,
    resizeMargin: 1,
    snapDistance: 1,
    snapOnRelease: options.snapOnRelease,
  });
  return {
    workspace,
    overlays,
    controller,
    capture,
    history,
    adapter,
    interactions: interactions as MarkupWindowInteractionController,
  };
}

function disposeFixture(fixture: Fixture): void {
  fixture.interactions?.dispose();
  fixture.adapter?.dispose();
  fixture.controller.dispose();
  fixture.workspace.dispose();
  fixture.overlays.dispose();
  fixture.capture.dispose();
}

function markupRoot(...children: LayoutNode[]): LayoutNode {
  return createLayoutNode({ id: "root", tag: "main", children });
}

function windowNode(
  id: string,
  constraints: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number } = {},
): LayoutNode {
  const style = defaultComputedLayoutStyle();
  style.minWidth = cellLength(constraints.minWidth ?? 8);
  style.minHeight = cellLength(constraints.minHeight ?? 4);
  if (constraints.maxWidth !== undefined) style.maxWidth = cellLength(constraints.maxWidth);
  if (constraints.maxHeight !== undefined) style.maxHeight = cellLength(constraints.maxHeight);
  return createLayoutNode({ id, tag: "window", attributes: { title: id }, style });
}

function createInteractions(
  fixture: Fixture,
  options: { history?: MarkupWindowHistoryAdapter; snapOnRelease?: boolean } = {},
): MarkupWindowInteractionController {
  return new MarkupWindowInteractionController({
    controller: fixture.controller,
    capture: fixture.capture,
    history: options.history,
    ownerId: "test-floating-windows",
    titleBarHeight: 2,
    resizeMargin: 1,
    snapDistance: 1,
    snapOnRelease: options.snapOnRelease,
  });
}

function floatingRect(controller: MarkupWindowController, id: string): Rectangle {
  return controller.inspect().windows.find((window) => window.id === id)!.floatingRect!;
}

interface PointerOptions {
  pointerId?: number;
  device?: PointerInputDevice;
  primary?: boolean;
  button?: number | null;
  buttons?: number;
}

let pointerSequence = 0;

function pointer(
  kind: PointerInputKind,
  column?: number,
  row?: number,
  options: PointerOptions = {},
): PointerInputEvent {
  const device = options.device ?? "mouse";
  const pointerId = options.pointerId ?? 1;
  const coordinates = column === undefined || row === undefined
    ? { screen: { space: "screen" as const, x: 1, y: 1 } }
    : { cell: { space: "cell" as const, x: column, y: row } };
  return {
    schemaVersion: POINTER_INPUT_SCHEMA_VERSION,
    sequence: ++pointerSequence,
    timestamp: pointerSequence,
    source: "test",
    trust: "trusted",
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    pointerId,
    device,
    kind,
    coordinates,
    primary: options.primary ?? true,
    button: options.button !== undefined ? options.button : kind === "down" ? 0 : null,
    buttons: options.buttons ?? (kind === "down" || kind === "move" ? 1 : 0),
  };
}

Deno.test("snap hot zones: middle-fifth top/bottom rows, four-cell corners, full-height sides", () => {
  const zoneBounds = { column: 0, row: 0, width: 80, height: 30 };
  const at = (column: number, row: number) => markupWindowSnapTargetAtPoint({ column, row }, zoneBounds, 1, 0.2, 4);

  // Top half only from the centered fifth of the very top row (columns 32-47).
  assertEquals(at(40, 0), { kind: "workspace", edge: "top" });
  assertEquals(at(32, 0), { kind: "workspace", edge: "top" });
  assertEquals(at(47, 0), { kind: "workspace", edge: "top" });
  assertEquals(at(40, -1), { kind: "workspace", edge: "top" }, "overshoot past the workspace still counts");
  assertEquals(at(31, 0), undefined, "outside the middle fifth the top row does nothing");
  assertEquals(at(48, 0), undefined);
  assertEquals(at(40, 1), undefined, "one row below the edge no longer half-snaps");

  // Bottom mirrors the top.
  assertEquals(at(40, 29), { kind: "workspace", edge: "bottom" });
  assertEquals(at(40, 30), { kind: "workspace", edge: "bottom" });
  assertEquals(at(20, 29), undefined);
  assertEquals(at(40, 28), undefined);

  // Corners answer within four cells along each of their edges.
  assertEquals(at(0, 0), { kind: "corner", corner: "top-left" });
  assertEquals(at(3, 0), { kind: "corner", corner: "top-left" }, "four cells along the top edge");
  assertEquals(at(4, 0), undefined, "the fifth cell along the top edge is dead space");
  assertEquals(at(0, 3), { kind: "corner", corner: "top-left" }, "four cells down the left edge");
  assertEquals(at(0, 4), { kind: "workspace", edge: "left" }, "past the reach the side takes over");
  assertEquals(at(76, 0), { kind: "corner", corner: "top-right" });
  assertEquals(at(79, 26), { kind: "corner", corner: "bottom-right" });
  assertEquals(at(2, 29), { kind: "corner", corner: "bottom-left" });

  // Left/right stay full-height distance bands between the corner reaches.
  assertEquals(at(0, 15), { kind: "workspace", edge: "left" });
  assertEquals(at(79, 15), { kind: "workspace", edge: "right" });
  assertEquals(at(40, 15), undefined, "the workspace interior never snaps");
});
