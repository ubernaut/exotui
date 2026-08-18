// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStrictEquals } from "./deps.ts";
import {
  type MarkupWindowSnapshot,
  POINTER_INPUT_SCHEMA_VERSION,
  PointerCaptureController,
  type PointerInputEvent,
  TiledWorkspaceController,
  WorkbenchWindowHostController,
} from "../mod.ts";

const BOUNDS = { column: 0, row: 0, width: 100, height: 32 };

Deno.test("workbench window host shares one workspace and projects tiled floating AOT chrome", () => {
  const workspace = new TiledWorkspaceController({ gap: 1 });
  const host = createHost(workspace);
  try {
    assertStrictEquals(host.workspace, workspace);
    assertStrictEquals(host.controller.workspace, workspace);
    const projection = host.project(BOUNDS, {
      visibleWindowIds: ["tiled"],
      shelfBounds: { column: 0, row: 31, width: 100, height: 1 },
    });
    assertEquals(projection.tiledWindows.map((window) => window.id), ["tiled"]);
    assertEquals(projection.floatingWindows.map((window) => window.id), ["normal", "pinned"]);
    assert(projection.floatingWindows[1]!.zIndex > projection.floatingWindows[0]!.zIndex);
    assertEquals(projection.windows.map((window) => window.id), ["tiled", "normal", "pinned"]);
    const pinned = projection.floatingWindows[1]!;
    assertEquals(pinned.semantic.role, "window");
    assertEquals(pinned.semantic.description?.includes("always on top"), true);
    const pinControl = pinned.controls.find((control) => control.kind === "always-on-top");
    assertEquals(pinControl?.semantic.label, "Return window to normal stacking");
    assertEquals(pinControl?.semantic.shortcut, "Alt+P");
    assertEquals(pinned.clientRect, { column: 56, row: 7, width: 22, height: 6 });
  } finally {
    host.dispose();
    assertEquals(workspace.state.disposed, false);
    workspace.dispose();
  }
});

Deno.test("workbench window host commands use exact history and keep transient switcher out of snapshots", async () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    const before = host.snapshot();
    const moved = host.execute({ kind: "nudge", id: "normal", delta: { columns: 5, rows: 2 } }, BOUNDS);
    assertEquals(moved.status, "applied");
    assertEquals(host.history.undoDepth, 1);
    assertEquals(floatingRect(host.snapshot(), "normal"), { column: 15, row: 6, width: 24, height: 10 });
    assertEquals(await host.undo(), true);
    assertEquals(host.snapshot(), before);
    assertEquals(await host.redo(), true);
    assertEquals(floatingRect(host.snapshot(), "normal"), { column: 15, row: 6, width: 24, height: 10 });

    const durable = host.snapshot();
    assertEquals(host.execute({ kind: "switcher-open", direction: 1 }, BOUNDS).status, "applied");
    assertEquals(host.project(BOUNDS).switcher?.semantic.role, "listbox");
    assertEquals(host.snapshot(), durable);
    assertEquals(host.execute({ kind: "switcher-cancel" }, BOUNDS).status, "applied");

    const minimized = host.execute({ kind: "minimize", id: "normal" }, BOUNDS);
    assertEquals(minimized.status, "applied");
    const shelf = host.project(BOUNDS, { shelfBounds: { column: 0, row: 31, width: 100, height: 1 } }).shelf;
    assertEquals(shelf.map((item) => item.id), ["normal"]);
    assertEquals(shelf[0]!.semantic.label, "Restore Normal");
    assertEquals(host.execute(shelf[0]!.command, BOUNDS).status, "applied");
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host keyboard traversal excludes responsively hidden tiled windows", () => {
  const workspace = new TiledWorkspaceController();
  const host = new WorkbenchWindowHostController({
    workspace,
    windows: [
      { id: "editor", title: "Editor" },
      { id: "vault", title: "Vault" },
      { id: "preview", title: "Preview" },
    ],
  });
  const narrow = { visibleWindowIds: ["editor"] };
  try {
    host.execute({ kind: "focus", id: "editor" }, BOUNDS, narrow);
    assertEquals(
      host.handleKey({ key: "tab", ctrl: false, meta: true, shift: false }, BOUNDS, narrow).status,
      "applied",
    );
    assertEquals(host.project(BOUNDS, narrow).switcher?.items.map((item) => item.id), ["editor"]);
    assertEquals(
      host.handleKey({ key: "return", ctrl: false, meta: false, shift: false }, BOUNDS, narrow).handled,
      true,
    );
    assertEquals(host.controller.inspect().activeWindowId, "editor");
    assertEquals(host.execute({ kind: "focus-next", direction: 1 }, BOUNDS, narrow).status, "unchanged");

    host.execute({ kind: "set-placement", id: "preview", placement: "floating" }, BOUNDS, narrow);
    host.execute({ kind: "focus", id: "editor" }, BOUNDS, narrow);
    host.handleKey({ key: "tab", ctrl: false, meta: true, shift: false }, BOUNDS, narrow);
    assertEquals(host.project(BOUNDS, narrow).switcher?.items.map((item) => item.id), ["editor", "preview"]);
    host.handleKey({ key: "return", ctrl: false, meta: false, shift: false }, BOUNDS, narrow);
    assertEquals(host.controller.inspect().activeWindowId, "preview");

    host.execute({ kind: "set-placement", id: "preview", placement: "tiled" }, BOUNDS);
    host.execute({ kind: "focus", id: "editor" }, BOUNDS);
    host.handleKey({ key: "tab", ctrl: false, meta: true, shift: false }, BOUNDS);
    assertEquals(host.project(BOUNDS).switcher?.items.length, 3);
    assertEquals(host.project(BOUNDS, narrow).switcher?.items.map((item) => item.id), ["editor"]);
    host.handleKey({ key: "return", ctrl: false, meta: false, shift: false }, BOUNDS, narrow);
    assertEquals(host.controller.inspect().activeWindowId, "editor");
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host titlebar controls win over move capture and pointer move is one history entry", async () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    let projection = host.project(BOUNDS);
    const normal = projection.floatingWindows.find((window) => window.id === "normal")!;
    const close = normal.controls.find((control) => control.kind === "close")!;
    const closePoint = {
      column: close.hitRect.column + Math.floor(close.hitRect.width / 2),
      row: close.hitRect.row,
    };
    const closed = host.handlePointer(pointer("down", closePoint.column, closePoint.row, 1), BOUNDS);
    assertEquals(closed.action?.action, "close");
    assertEquals(host.interactions.inspect().active, undefined);
    assertEquals(host.controller.inspect().windows.find((window) => window.id === "normal")?.state, "closed");
    assertEquals(host.execute({ kind: "restore", id: "normal" }, BOUNDS).status, "applied");

    projection = host.project(BOUNDS);
    const restored = projection.floatingWindows.find((window) => window.id === "normal")!;
    const moveColumn = restored.rect.column + 2;
    const startDepth = host.history.undoDepth;
    assertEquals(
      host.handlePointer(pointer("down", moveColumn, restored.rect.row, 2), BOUNDS).interaction?.status,
      "started",
    );
    assertEquals(
      host.handlePointer(pointer("move", moveColumn + 7, restored.rect.row + 3, 3), BOUNDS).interaction?.status,
      "updated",
    );
    const preview = host.project(BOUNDS).snapPreview;
    assertEquals(preview, undefined);
    assertEquals(
      host.handlePointer(pointer("up", moveColumn + 7, restored.rect.row + 3, 4), BOUNDS).interaction?.status,
      "committed",
    );
    assertEquals(host.history.undoDepth, startDepth + 1);
    assertEquals(floatingRect(host.snapshot(), "normal"), { column: 17, row: 7, width: 24, height: 10 });
    assertEquals(await host.undo(), true);
    assertEquals(floatingRect(host.snapshot(), "normal"), { column: 10, row: 4, width: 24, height: 10 });
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench tiled fullscreen restore control pops the window out as one undoable gesture", async () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    assertEquals(host.execute({ kind: "maximize", id: "tiled" }, BOUNDS).status, "applied");
    const maximizedSnapshot = host.snapshot();
    const window = host.project(BOUNDS).tiledWindows.find((item) => item.id === "tiled")!;
    const restore = window.controls.find((control) => control.kind === "restore")!;
    assertEquals(restore.command, { kind: "restore-floating", id: "tiled" });
    const depth = host.history.undoDepth;

    const result = host.handlePointer(
      pointer("down", restore.hitRect.column, restore.hitRect.row, 40),
      BOUNDS,
    );

    assertEquals(result.command, { kind: "restore-floating", id: "tiled" });
    assertEquals(result.status, "applied");
    assertEquals(host.history.undoDepth, depth + 1);
    const restored = host.controller.inspect().windows.find((item) => item.id === "tiled");
    assertEquals(restored?.state, "normal");
    assertEquals(restored?.placement, "floating");
    assertEquals(await host.undo(), true);
    assertEquals(host.snapshot(), maximizedSnapshot);
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host terminal and browser legacy adapters share pointer semantics", () => {
  const snapshots: MarkupWindowSnapshot[] = [];
  for (const source of ["terminal", "browser"] as const) {
    const workspace = new TiledWorkspaceController();
    let now = 0;
    const host = createHost(workspace, () => ++now);
    try {
      const rect = host.project(BOUNDS).floatingWindows.find((window) => window.id === "normal")!.rect;
      const x = rect.column + Math.floor((rect.width - 1) / 2);
      host.handleMouse(source, mouse(false, false, x, rect.row), BOUNDS);
      host.handleMouse(source, mouse(true, false, x + 4, rect.row + 2), BOUNDS);
      host.handleMouse(source, mouse(false, true, x + 4, rect.row + 2), BOUNDS);
      snapshots.push(host.snapshot());
    } finally {
      host.dispose();
      workspace.dispose();
    }
  }
  assertEquals(snapshots[0], snapshots[1]);
  assertEquals(floatingRect(snapshots[0]!, "normal"), { column: 14, row: 6, width: 24, height: 10 });
});

Deno.test("workbench window host imports tiled-only V1 sessions through the markup migration", () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    const legacyWorkspace = host.snapshot().workspace;
    assertEquals(host.execute({ kind: "toggle-placement", id: "tiled" }, BOUNDS).status, "applied");
    assertEquals(host.controller.inspect().windows.find((window) => window.id === "tiled")?.placement, "floating");
    const restored = host.restoreLegacyWorkspace(legacyWorkspace);
    assertEquals(restored.ok, true);
    assertEquals(host.controller.inspect().windows.find((window) => window.id === "tiled")?.placement, "tiled");
    assertEquals(host.snapshot().version, 2);
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host rejects non-primary controls and routes clickable shelf geometry", () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    const normal = host.project(BOUNDS).floatingWindows.find((window) => window.id === "normal")!;
    const close = normal.controls.find((control) => control.kind === "close")!;
    const rightClick = { ...pointer("down", close.hitRect.column, close.hitRect.row, 1), button: 2, buttons: 2 };
    assertEquals(host.handlePointer(rightClick, BOUNDS).handled, false);
    assertEquals(host.controller.inspect().windows.find((window) => window.id === "normal")?.state, "normal");

    assertEquals(host.execute({ kind: "minimize", id: "normal" }, BOUNDS).status, "applied");
    const shelfBounds = { column: 0, row: 31, width: 100, height: 1 };
    const item = host.project(BOUNDS, { shelfBounds }).shelf[0]!;
    assert(item.rect);
    const restored = host.handlePointer(pointer("down", item.rect.column, item.rect.row, 2), BOUNDS, { shelfBounds });
    assertEquals(restored.action?.action, "restore");
    assertEquals(host.controller.inspect().windows.find((window) => window.id === "normal")?.state, "normal");
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host restore and disposal invalidate controller-bound history", async () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  const baseline = host.snapshot();
  assertEquals(host.execute({ kind: "nudge", id: "normal", delta: { columns: 2, rows: 0 } }, BOUNDS).status, "applied");
  assertEquals(host.history.undoDepth, 1);
  assertEquals(host.restoreSnapshot(baseline).ok, true);
  assertEquals(host.history.undoDepth, 0);
  assertEquals(await host.history.undo(), false);
  host.execute({ kind: "nudge", id: "normal", delta: { columns: 2, rows: 0 } }, BOUNDS);
  host.dispose();
  assertEquals(host.history.undoDepth, 0);
  assertEquals(await host.history.undo(), false);
  workspace.dispose();
});

Deno.test("workbench window host reconciles dynamic windows through one durable revision", () => {
  const workspace = new TiledWorkspaceController({ gap: 1 });
  const host = createHost(workspace);
  try {
    assertEquals(
      host.execute({ kind: "nudge", id: "normal", delta: { columns: 5, rows: 2 } }, BOUNDS).status,
      "applied",
    );
    assertEquals(host.execute({ kind: "minimize", id: "pinned" }, BOUNDS).status, "applied");
    assertEquals(host.execute({ kind: "focus", id: "normal" }, BOUNDS).status, "applied");
    host.project(BOUNDS, { shelfBounds: { column: 0, row: 31, width: 100, height: 1 } });
    host.execute({ kind: "switcher-open", direction: 1 }, BOUNDS);

    const beforeCommit = host.commitRevision.peek();
    const beforeView = host.viewRevision.peek();
    let commitPublications = 0;
    let viewPublications = 0;
    const onCommit = () => commitPublications += 1;
    const onView = () => viewPublications += 1;
    host.commitRevision.subscribe(onCommit);
    host.viewRevision.subscribe(onView);
    try {
      const result = host.reconcileWindows([
        { id: "normal", title: "Renamed shell", minWidth: 16, minHeight: 7 },
        {
          id: "fresh",
          title: "Fresh shell",
          placement: "floating",
          floatingRect: { column: 42, row: 8, width: 30, height: 12 },
        },
      ]);
      assertEquals(result.status, "applied");
      assertEquals(result.reason, "windows-reconciled");
    } finally {
      host.commitRevision.unsubscribe(onCommit);
      host.viewRevision.unsubscribe(onView);
    }

    assertEquals(commitPublications, 1);
    assertEquals(viewPublications, 1);
    assertEquals(host.commitRevision.peek(), beforeCommit + 1);
    assertEquals(host.viewRevision.peek(), beforeView + 1);
    assertEquals(host.history.undoDepth, 0);
    assertEquals(workspace.windowIds(), ["normal", "fresh"]);

    const normal = host.controller.inspect().windows.find((window) => window.id === "normal")!;
    assertEquals(normal.title, "Renamed shell");
    assertEquals(normal.placement, "floating");
    assertEquals(normal.state, "normal");
    assertEquals(normal.active, true);
    assertEquals(floatingRect(host.snapshot(), "normal"), { column: 15, row: 6, width: 24, height: 10 });

    const projection = host.project(BOUNDS, {
      shelfBounds: { column: 0, row: 31, width: 100, height: 1 },
    });
    assertEquals(projection.windows.map((window) => window.id), ["fresh", "normal"]);
    assertEquals(projection.windows.map((window) => window.title), ["Fresh shell", "Renamed shell"]);
    assertEquals(projection.shelf, []);
    assertEquals(projection.switcher?.items.some((item) => item.id === "pinned" || item.id === "tiled"), false);
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host reconciliation rolls back failures and blocks transient mutations", () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    host.execute({ kind: "nudge", id: "normal", delta: { columns: 3, rows: 1 } }, BOUNDS);
    const baseline = host.snapshot();
    const beforeCommit = host.commitRevision.peek();
    const beforeView = host.viewRevision.peek();
    const beforeHistory = host.history.undoDepth;
    const failWorkspacePublication = () => {
      throw new Error("dynamic-window-publication-failed");
    };
    workspace.state.subscribe(failWorkspacePublication);
    let failed;
    try {
      failed = host.reconcileWindows([
        { id: "normal", title: "Normal" },
        { id: "replacement", title: "Replacement" },
      ]);
    } finally {
      workspace.state.unsubscribe(failWorkspacePublication);
    }
    assertEquals(failed.status, "failed");
    assertEquals(failed.reason?.includes("reconciliation and rollback publication failed"), true);
    assertEquals(host.snapshot(), baseline);
    assertEquals(workspace.windowIds(), ["tiled", "normal", "pinned"]);
    assertEquals(host.history.undoDepth, beforeHistory);
    assertEquals(host.commitRevision.peek(), beforeCommit);
    assertEquals(host.viewRevision.peek(), beforeView);

    const normal = host.project(BOUNDS).floatingWindows.find((window) => window.id === "normal")!;
    const moveColumn = normal.rect.column + Math.floor((normal.rect.width - 1) / 2);
    assertEquals(
      host.handlePointer(pointer("down", moveColumn, normal.rect.row, 40), BOUNDS).interaction?.status,
      "started",
    );
    const gestureSnapshot = host.snapshot();
    const blocked = host.reconcileWindows([
      { id: "normal", title: "Normal" },
      { id: "replacement", title: "Replacement" },
    ]);
    assertEquals(blocked.status, "blocked");
    assertEquals(blocked.reason, "window-gesture-active");
    assertEquals(host.snapshot(), gestureSnapshot);
    host.handlePointer(pointer("cancel", moveColumn, normal.rect.row, 41), BOUNDS);
    assertEquals(host.snapshot(), baseline);

    const historyBlocked = host.history.transactionSync(
      { label: "hold window history" },
      () => host.reconcileWindows([{ id: "normal", title: "Normal" }]),
    );
    assertEquals(historyBlocked.status, "blocked");
    assertEquals(historyBlocked.reason, "window-history-active");
    assertEquals(host.snapshot(), baseline);
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window hosts use isolated capture owners and roll back failed construction", () => {
  const capture = new PointerCaptureController();
  const firstWorkspace = new TiledWorkspaceController();
  const secondWorkspace = new TiledWorkspaceController();
  const first = new WorkbenchWindowHostController({
    workspace: firstWorkspace,
    capture,
    ownerId: "shared-owner",
    windows: [{ id: "first", title: "First" }],
  });
  try {
    let threw = false;
    try {
      new WorkbenchWindowHostController({
        workspace: secondWorkspace,
        capture,
        ownerId: "shared-owner",
        windows: [{ id: "second", title: "Second" }],
      });
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
    assertEquals(secondWorkspace.inspect().count, 0);

    const thirdWorkspace = new TiledWorkspaceController();
    const third = new WorkbenchWindowHostController({
      workspace: thirdWorkspace,
      capture,
      windows: [{ id: "third", title: "Third" }],
    });
    third.dispose();
    thirdWorkspace.dispose();
  } finally {
    first.dispose();
    firstWorkspace.dispose();
    secondWorkspace.dispose();
    capture.dispose();
  }
});

Deno.test("workbench window host passes client clicks through and preserves a titlebar drag cell", () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    const normal = host.project(BOUNDS).floatingWindows.find((window) => window.id === "normal")!;
    const clientClick = host.handlePointer(
      pointer("down", normal.clientRect.column + 1, normal.clientRect.row + 1, 1),
      BOUNDS,
    );
    assertEquals(clientClick.handled, false);
    assertEquals(clientClick.reason, "window-client-focus-pass-through");

    const moveColumn = normal.rect.column + Math.floor((normal.rect.width - 1) / 2);
    assertEquals(
      normal.controls.some((control) =>
        moveColumn >= control.hitRect.column && moveColumn < control.hitRect.column + control.hitRect.width
      ),
      false,
    );
    assertEquals(
      host.handlePointer(pointer("down", moveColumn, normal.rect.row, 2), BOUNDS).interaction?.status,
      "started",
    );
    assertEquals(
      host.handlePointer(pointer("cancel", moveColumn, normal.rect.row, 3), BOUNDS).interaction?.status,
      "cancelled",
    );
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host honors disabled snap preview and blocks history replacement during gestures", async () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace, () => 1, { snapOnRelease: false });
  try {
    const baseline = host.snapshot();
    const normal = host.project(BOUNDS).floatingWindows.find((window) => window.id === "normal")!;
    const moveColumn = normal.rect.column + Math.floor((normal.rect.width - 1) / 2);
    assertEquals(
      host.handlePointer(pointer("down", moveColumn, normal.rect.row, 1), BOUNDS).interaction?.status,
      "started",
    );
    assertEquals(host.handlePointer(pointer("move", 1, 1, 2), BOUNDS).interaction?.status, "updated");
    assertEquals(host.project(BOUNDS).snapPreview, undefined);
    assertEquals(host.restoreSnapshot(baseline).reason, "window-gesture-active");
    assertEquals(await host.undo(), false);
    assertEquals(await host.redo(), false);
    assertEquals(host.handlePointer(pointer("cancel", 1, 1, 3), BOUNDS).interaction?.status, "cancelled");
    assertEquals(host.snapshot(), baseline);
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host recovers eligible floating windows atomically in one history entry", async () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    assertEquals(
      host.execute({ kind: "nudge", id: "normal", delta: { columns: -80, rows: -20 } }, BOUNDS).status,
      "applied",
    );
    assertEquals(host.execute({ kind: "minimize", id: "pinned" }, BOUNDS).status, "applied");
    const beforeRecover = host.snapshot();
    const depth = host.history.undoDepth;
    assertEquals(host.execute({ kind: "recover-all" }, BOUNDS).status, "applied");
    assertEquals(host.history.undoDepth, depth + 1);
    assertEquals(host.controller.inspect().windows.find((window) => window.id === "pinned")?.state, "minimized");
    assertEquals(await host.undo(), true);
    assertEquals(host.snapshot(), beforeRecover);
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host resizes tiled separators by command and one-entry pointer gestures", async () => {
  const workspace = new TiledWorkspaceController({ gap: 1 });
  const host = new WorkbenchWindowHostController({
    workspace,
    windows: [
      { id: "left", title: "Left", minWidth: 8, minHeight: 4 },
      { id: "right", title: "Right", minWidth: 8, minHeight: 4 },
    ],
  });
  const options = { separatorHitSize: 3 };
  try {
    let projection = host.project(BOUNDS, options);
    const separator = projection.separators[0]!;
    assertEquals(separator.semantic.role, "separator");
    const beforeCommand = host.snapshot();
    assertEquals(
      host.execute({ kind: "resize-split", splitId: separator.splitId, delta: 4 }, BOUNDS, options).status,
      "applied",
    );
    assertEquals(host.history.undoDepth, 1);
    assertEquals(await host.undo(), true);
    assertEquals(host.snapshot(), beforeCommand);

    projection = host.project(BOUNDS, options);
    const current = projection.separators[0]!;
    const x = current.rect.column;
    const y = current.rect.row + Math.floor(current.rect.height / 2);
    const beforeDrag = host.snapshot();
    const depth = host.history.undoDepth;
    assertEquals(host.handlePointer(pointer("down", x, y, 10), BOUNDS, options).reason, "separator-resize-started");
    assertEquals(host.inspect().separatorResize?.splitId, current.splitId);
    assertEquals(host.handlePointer(pointer("move", x + 7, y, 11), BOUNDS, options).status, "applied");
    assertEquals(host.handlePointer(pointer("up", x + 7, y, 12), BOUNDS, options).reason, "separator-resize-committed");
    assertEquals(host.history.undoDepth, depth + 1);
    assertEquals(await host.undo(), true);
    assertEquals(host.snapshot(), beforeDrag);

    projection = host.project(BOUNDS, options);
    const clampedSeparator = projection.separators[0]!;
    const clampX = clampedSeparator.rect.column;
    const clampY = clampedSeparator.rect.row + Math.floor(clampedSeparator.rect.height / 2);
    host.handlePointer(pointer("down", clampX, clampY, 13), BOUNDS, options);
    host.handlePointer(pointer("move", clampX + 100, clampY, 14), BOUNDS, options);
    const clampedX = host.project(BOUNDS, options).separators[0]!.rect.column;
    const appliedDelta = clampedX - clampX;
    assert(appliedDelta > 0 && appliedDelta < 100);
    assertEquals(host.inspect().separatorResize?.delta, appliedDelta);
    assertEquals(host.handlePointer(pointer("move", clampX + 99, clampY, 15), BOUNDS, options).status, "unchanged");
    assertEquals(host.project(BOUNDS, options).separators[0]!.rect.column, clampedX);
    host.handlePointer(pointer("move", clampX + appliedDelta - 1, clampY, 16), BOUNDS, options);
    assertEquals(host.project(BOUNDS, options).separators[0]!.rect.column, clampedX - 1);
    host.handlePointer(pointer("up", clampX + appliedDelta - 1, clampY, 17), BOUNDS, options);

    projection = host.project(BOUNDS, options);
    const cancelSeparator = projection.separators[0]!;
    const cancelX = cancelSeparator.rect.column;
    const cancelY = cancelSeparator.rect.row + Math.floor(cancelSeparator.rect.height / 2);
    const beforeCancel = host.snapshot();
    const cancelDepth = host.history.undoDepth;
    host.handlePointer(pointer("down", cancelX, cancelY, 20), BOUNDS, options);
    host.handlePointer(pointer("move", cancelX - 5, cancelY, 21), BOUNDS, options);
    assertEquals(host.restoreSnapshot(beforeCancel).reason, "window-gesture-active");
    assertEquals(
      host.handlePointer(pointer("cancel", cancelX - 5, cancelY, 22), BOUNDS, options).reason,
      "separator-resize-cancelled",
    );
    assertEquals(host.snapshot(), beforeCancel);
    assertEquals(host.history.undoDepth, cancelDepth);
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

Deno.test("workbench window host keeps floating chrome and clients above tiled separator hit targets", () => {
  const workspace = new TiledWorkspaceController({ gap: 1 });
  const host = new WorkbenchWindowHostController({
    workspace,
    windows: [
      { id: "left", title: "Left", minWidth: 8, minHeight: 4 },
      { id: "right", title: "Right", minWidth: 8, minHeight: 4 },
      {
        id: "floating",
        title: "Floating",
        minWidth: 8,
        minHeight: 4,
        placement: "floating",
        floatingRect: { column: 40, row: 14, width: 20, height: 10 },
      },
    ],
  });
  const options = { separatorHitSize: 3 };
  try {
    const projection = host.project(BOUNDS, options);
    const separator = projection.separators[0]!;
    const floating = projection.floatingWindows[0]!;
    const titleColumn = Array.from(
      { length: Math.max(0, floating.titleBarRect.width - 2) },
      (_, index) => floating.titleBarRect.column + index + 1,
    ).find((column) =>
      !floating.controls.some((control) =>
        overlappingCell(control.hitRect, { column, row: floating.titleBarRect.row, width: 1, height: 1 })
      )
    );
    assert(titleColumn !== undefined);
    const titlePoint = { column: titleColumn, row: floating.titleBarRect.row };
    assert(overlappingCell(
      separator.hitRect,
      { column: titlePoint.column, row: titlePoint.row, width: 1, height: 1 },
    ));
    assertEquals(
      floating.controls.some((control) =>
        overlappingCell(
          control.hitRect,
          { column: titlePoint.column, row: titlePoint.row, width: 1, height: 1 },
        )
      ),
      false,
    );
    const started = host.handlePointer(pointer("down", titlePoint.column, titlePoint.row, 30), BOUNDS, options);
    assertEquals(started.interaction?.status, "started");
    assertEquals(host.interactions.inspect().active?.mode, "move");
    assertEquals(host.inspect().separatorResize, undefined);
    host.handlePointer(pointer("cancel", titlePoint.column, titlePoint.row, 31), BOUNDS, options);

    const clientPoint = overlappingCell(separator.hitRect, floating.clientRect);
    assert(clientPoint);
    const client = host.handlePointer(pointer("down", clientPoint.column, clientPoint.row, 32), BOUNDS, options);
    assertEquals(client.reason, "window-client-focus-pass-through");
    assertEquals(client.handled, false);
    assertEquals(host.inspect().separatorResize, undefined);
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

function createHost(
  workspace: TiledWorkspaceController,
  now: () => number = () => 1,
  options: { snapOnRelease?: boolean } = {},
) {
  return new WorkbenchWindowHostController({
    workspace,
    now,
    snapOnRelease: options.snapOnRelease,
    windows: [
      { id: "tiled", title: "Tiled", minWidth: 12, minHeight: 6 },
      {
        id: "normal",
        title: "Normal",
        minWidth: 12,
        minHeight: 6,
        placement: "floating",
        floatingRect: { column: 10, row: 4, width: 24, height: 10 },
      },
      {
        id: "pinned",
        title: "Pinned",
        minWidth: 12,
        minHeight: 6,
        placement: "floating",
        floatingRect: { column: 55, row: 6, width: 24, height: 8 },
        alwaysOnTop: true,
      },
    ],
  });
}

function floatingRect(snapshot: MarkupWindowSnapshot, id: string) {
  return snapshot.placements.find((placement) => placement.id === id)?.floatingRect;
}

function overlappingCell(
  first: { column: number; row: number; width: number; height: number },
  second: { column: number; row: number; width: number; height: number },
  excluded: readonly { column: number; row: number; width: number; height: number }[] = [],
) {
  const startColumn = Math.max(first.column, second.column);
  const endColumn = Math.min(first.column + first.width, second.column + second.width);
  const startRow = Math.max(first.row, second.row);
  const endRow = Math.min(first.row + first.height, second.row + second.height);
  for (let row = startRow; row < endRow; row += 1) {
    for (let column = startColumn; column < endColumn; column += 1) {
      if (
        !excluded.some((rect) =>
          column >= rect.column && column < rect.column + rect.width && row >= rect.row && row < rect.row + rect.height
        )
      ) {
        return { column, row };
      }
    }
  }
  return undefined;
}

function pointer(
  kind: "down" | "move" | "up" | "cancel",
  column: number,
  row: number,
  sequence: number,
): PointerInputEvent {
  return {
    schemaVersion: POINTER_INPUT_SCHEMA_VERSION,
    sequence,
    timestamp: sequence,
    source: "test",
    trust: "synthetic",
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    pointerId: 1,
    device: "mouse",
    kind,
    coordinates: { cell: { space: "cell", x: column, y: row } },
    primary: true,
    button: kind === "down" ? 0 : null,
    buttons: kind === "up" || kind === "cancel" ? 0 : 1,
  };
}

function mouse(drag: boolean, release: boolean, x: number, y: number) {
  return {
    key: "mouse" as const,
    buffer: new Uint8Array(),
    x,
    y,
    movementX: 0,
    movementY: 0,
    meta: false,
    ctrl: false,
    shift: false,
    drag,
    release,
    button: release ? undefined : 0 as const,
  };
}

Deno.test("workbench window host projects title adornments and owns double-click maximize", () => {
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    // Adornments arrive first-class on the chrome projection.
    const projection = host.project(BOUNDS, {
      titleAdornments: (id) => (id === "normal" ? ["[SCROLL]", "[NO MOUSE]"] : []),
    });
    const normal = projection.floatingWindows.find((window) => window.id === "normal");
    assert(normal);
    assertEquals(normal.titleAdornments, ["[SCROLL]", "[NO MOUSE]"]);
    assertEquals(projection.tiledWindows[0]?.titleAdornments, []);

    // Two quick primary mouse clicks on the bare title bar toggle maximize.
    // The toggle waits for the second release: a press that moves before it
    // lifts is a drag, and a drag has to move the window instead.
    const options = { doubleClickMaximizeMs: 400 };
    const barColumn = normal.titleBarRect.column + 2;
    const barRow = normal.titleBarRect.row;
    const first = host.handlePointer(pointer("down", barColumn, barRow, 10), BOUNDS, options);
    assert(first.handled);
    host.handlePointer(pointer("up", barColumn, barRow, 11), BOUNDS, options);
    host.handlePointer(pointer("down", barColumn, barRow, 12), BOUNDS, options);
    const second = host.handlePointer(pointer("up", barColumn, barRow, 13), BOUNDS, options);
    assertEquals(second.command, { kind: "toggle-maximize", id: "normal" });
    assertEquals(
      host.project(BOUNDS).windows.find((window) => window.id === "normal")?.state,
      "maximized",
    );

    // Slow clicks (outside the window) never double: restore first, then click
    // twice with a large timestamp gap.
    host.execute({ kind: "toggle-maximize", id: "normal" }, BOUNDS);
    const again = host.project(BOUNDS).floatingWindows.find((window) => window.id === "normal")!;
    const slowColumn = again.titleBarRect.column + 2;
    host.handlePointer(pointer("down", slowColumn, again.titleBarRect.row, 100), BOUNDS, options);
    host.handlePointer(pointer("up", slowColumn, again.titleBarRect.row, 101), BOUNDS, options);
    const slow = host.handlePointer(pointer("down", slowColumn, again.titleBarRect.row, 700), BOUNDS, options);
    assert(slow.command?.kind !== "toggle-maximize");
  } finally {
    host.dispose();
    workspace.dispose();
  }
});

// Regression: the software cursor drew its move glyph across the whole title
// row, including the control buttons, where a press activates the button and no
// gesture ever starts. A third of a title bar can be buttons, so the cursor was
// promising a drag it could not deliver — "the cursor says move and the window
// will not move" — and the outer title columns are resize corners besides.
Deno.test("the software cursor glyph agrees with the host's own hit test", async () => {
  const { windowResizeGlyphAt } = await import("../src/app/software_cursor.ts");
  const workspace = new TiledWorkspaceController();
  const host = createHost(workspace);
  try {
    const projection = host.project(BOUNDS);
    const window = projection.floatingWindows.find((candidate) => candidate.id === "normal");
    assert(window);
    assert(window.controls.length > 0, "the window carries title-bar buttons");

    const MOVE = "✥";
    const RESIZE = new Set(["↔", "↕", "⤢", "⤡"]);
    let movable = 0;
    for (let row = window.rect.row; row < window.rect.row + window.rect.height; row += 1) {
      for (let column = window.rect.column; column < window.rect.column + window.rect.width; column += 1) {
        const glyph = windowResizeGlyphAt(projection, column, row);
        const onControl = window.controls.some((control) =>
          column >= control.hitRect.column && column < control.hitRect.column + control.hitRect.width &&
          row >= control.hitRect.row && row < control.hitRect.row + control.hitRect.height
        );
        const region = host.interactions.hitTest({ column, row }, BOUNDS)?.region;
        if (onControl) {
          assertEquals(glyph, undefined, `a button at (${column},${row}) must not offer a move`);
          continue;
        }
        if (region === "title-bar") {
          assertEquals(glyph, MOVE, `the draggable title cell (${column},${row}) must offer a move`);
          movable += 1;
        } else if (region === "client" || region === undefined) {
          assertEquals(glyph, undefined, `content at (${column},${row}) has no gesture`);
        } else {
          assert(glyph && RESIZE.has(glyph), `the ${region} edge at (${column},${row}) must offer a resize`);
        }
      }
    }
    assert(movable > 0, "some of the title bar is still draggable");
  } finally {
    host.dispose();
    workspace.dispose();
  }
});
