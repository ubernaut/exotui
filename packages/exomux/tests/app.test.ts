// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertNotEquals, assertStringIncludes } from "./deps.ts";
import { FakeExomuxClient, session } from "./fakes.ts";
export { FakeExomuxClient, session };
import {
  encodeTerminalPaste,
  POINTER_INPUT_SCHEMA_VERSION,
  type PointerInputEvent,
  type Rectangle,
} from "@ubernaut/deno-tui";

/** Width of the top-left start button, mirrored from the app layout. */
const START_BUTTON_WIDTH = 14;
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { stripAnsi } from "@ubernaut/deno-tui/testing";
import { createTestKeyPress, createTestMousePress, createTestMouseScroll } from "@ubernaut/deno-tui/testing";
import { decodeBuffer } from "@ubernaut/deno-tui";
import type { Key, MouseScrollEvent } from "@ubernaut/deno-tui";
import {
  bindExomuxPointerInput,
  createExomuxTerminalOptions,
  type ExomuxAppMountRef,
  exomuxGlobalConfigLayout,
  exomuxGlyphColumns,
  exomuxManagerRows,
  exomuxMetaballBackgroundVisible,
  exomuxMetaballGradientColors,
  exomuxMetaballsMayAdvance,
  exomuxOptionCycleDirection,
  type ExomuxPointerInputSource,
  exomuxQuitLayout,
  exomuxScpLayout,
  exomuxSessionListWindowStart,
  exomuxStartMenuItems,
  exomuxStartMenuLayout,
  exomuxWindowConfigLayout,
  projectExomuxTerminalBar,
  resizeGlyphAt,
} from "../app.ts";
import {
  buildExomuxNetworkNodes,
  createExomuxController,
  EXOMUX_NETWORK_WINDOW_ID,
  EXOMUX_REMOTE_MONITOR_COMMAND,
  EXOMUX_SESSIONS_WINDOW_ID,
  EXOMUX_SETTINGS_WINDOW_ID,
  EXOMUX_WARNING_TTL_MS,
  type ExomuxController,
  exomuxFuzzyMatch,
  exomuxNetworkNodeAction,
  exomuxNetworkNodeRemoteSession,
  exomuxPermissionReport,
  exomuxPingSummary,
  type ExomuxPreferences,
  parseExomuxRemoteSessions,
} from "../controller.ts";
import {
  cycleExomuxGlobalSetting,
  cycleExomuxWindowSetting,
  defaultExomuxGlobalSettings,
  defaultExomuxWindowSettings,
  EXOMUX_BACKGROUND_IDS,
  EXOMUX_BORDER_STYLES,
  EXOMUX_GLOBAL_SETTING_SPECS,
  EXOMUX_THEMES,
  EXOMUX_WINDOW_SETTING_SPECS,
  exomuxActiveTitlebarForeground,
  type ExomuxAttachResult,
  exomuxBorderGlyphs,
  type ExomuxClientPort,
  type ExomuxOutputFrame,
  type ExomuxSessionSummary,
  type ExomuxSpawnOptions,
  exomuxTheme,
  exomuxWindowId,
  normalizeExomuxGlobalSettings,
  normalizeExomuxWindowSettings,
  normalizeExomuxWorkspaceState,
} from "../model.ts";
import { EXOMUX_PROTOCOL_LIMITS } from "../protocol.ts";
import type { TailnetStatusResult } from "../tailnet.ts";
import { exomuxTerminalForegroundRgb } from "../terminal_palette.ts";
import { EXOMUX_METABALL_LEVELS, ExomuxMetaballField } from "../metaball_background.ts";
import { mixExomuxRgb } from "../background.ts";
import { exomuxControlOpacity } from "../model.ts";

Deno.test("Exomux metaballs are deterministic, pointer-attracted, window-averse, and quantized", () => {
  const bounds = { column: 0, row: 2, width: 64, height: 20 } as const;
  const first = new ExomuxMetaballField({ seed: 42, count: 1 });
  const second = new ExomuxMetaballField({ seed: 42, count: 1 });
  assertEquals([...first.rasterize(bounds)], [...second.rasterize(bounds)]);
  assertEquals(first.inspect(), second.inspect());

  const beforePointer = first.inspect().balls[0]!;
  const direction = beforePointer.x < bounds.width / 2 ? 1 : -1;
  first.setPointer({
    column: direction > 0 ? bounds.column + bounds.width - 1 : bounds.column,
    row: beforePointer.y,
  }, 0);
  first.advance({ bounds, now: 16.7 });
  const afterPointer = first.inspect().balls[0]!;
  assert(direction * (afterPointer.vx - beforePointer.vx) > 0);

  const avoiding = new ExomuxMetaballField({ seed: 7, count: 1 });
  avoiding.rasterize(bounds);
  const beforeObstacle = avoiding.inspect().balls[0]!;
  avoiding.advance({
    bounds,
    now: 16.7,
    obstacles: [{
      column: Math.floor(beforeObstacle.x + beforeObstacle.radius * 0.7),
      row: bounds.row - 100,
      width: 40,
      height: 200,
    }],
  });
  assert(avoiding.inspect().balls[0]!.vx < beforeObstacle.vx);

  const levels = first.rasterize(bounds);
  assert(Math.max(...levels) > 0);
  assert(Math.max(...levels) < EXOMUX_METABALL_LEVELS);
  assertEquals(levels.length, bounds.width * bounds.height);
});

Deno.test("Exomux paints the metaball field behind floating desktop windows", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 80, rows: 24 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    const body = mounted.bodyRect.peek();
    const manager = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === EXOMUX_SESSIONS_WINDOW_ID
    );
    assert(manager);
    const uncoveredStyles = new Set<string>();
    for (let row = body.row; row < body.row + body.height; row += 1) {
      for (let column = body.column; column < body.column + body.width; column += 1) {
        const covered = column >= manager.rect.column && column < manager.rect.column + manager.rect.width &&
          row >= manager.rect.row && row < manager.rect.row + manager.rect.height;
        if (covered) continue;
        const value = harness.canvas.frameBuffer[row]?.[column] ?? "";
        uncoveredStyles.add(typeof value === "string" ? value : new TextDecoder().decode(value));
      }
    }
    assert(uncoveredStyles.size > 1);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux paints titlebar text and controls in the main theme foreground", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 90, rows: 26 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await harness.pilot.settle();
    const manager = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === EXOMUX_SESSIONS_WINDOW_ID
    );
    assert(manager);
    const theme = controller.theme.peek();
    const cellText = (column: number, row: number): string => {
      const value = harness.canvas.frameBuffer[row]?.[column] ?? "";
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    };
    const foregroundSgr = (color: readonly [number, number, number]): string =>
      `38;2;${color[0]};${color[1]};${color[2]}`;
    // Active titlebars contrast their accent bar (user direction Aug 17):
    // black on dark themes' bright accents, white on the light themes.
    // Inactive titlebars keep the main theme foreground.
    const activeForeground = exomuxActiveTitlebarForeground(theme);
    const expectedForeground = manager.active ? activeForeground : theme.text;
    const expectForeground = (kind: string) => {
      const control = manager.controls.find((entry) => entry.kind === kind);
      assert(control, `missing ${kind} control`);
      assertStringIncludes(cellText(control.rect.column, control.rect.row), foregroundSgr(expectedForeground));
    };
    expectForeground("close");
    expectForeground("maximize");
    expectForeground("minimize");
    // The title text follows the same rule.
    assertStringIncludes(
      cellText(manager.titleBarRect.column + 1, manager.titleBarRect.row),
      foregroundSgr(expectedForeground),
    );
    assertEquals(exomuxActiveTitlebarForeground(theme), [0, 0, 0], "midnight is a dark theme: black on accent");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux metaballs keep moving during sustained visible terminal output", async () => {
  // Since the cell-style memo made repaints cheap, animation no longer yields
  // to keyboard recency: only an in-flight control barrier holds a frame back.
  assertEquals(exomuxMetaballsMayAdvance(124, 0, false), true);
  assertEquals(exomuxMetaballsMayAdvance(10, 9, false, 0), true); // mid-typing advances
  assertEquals(exomuxMetaballsMayAdvance(1_000, 0, true), false);
  assertEquals(exomuxMetaballsMayAdvance(10, 0, true, 5_000), false); // a pending barrier still blocks

  const initial = session("asciichurn-output", "asciichurn", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 28 } });
  let outputTimer: ReturnType<typeof setInterval> | undefined;

  try {
    const mounted = mount.current;
    assert(mounted);
    controller.windowHost.execute(
      { kind: "minimize", id: EXOMUX_SESSIONS_WINDOW_ID },
      mounted.bodyRect.peek(),
    );
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId(initial.id),
      placement: "floating",
      rect: { column: 5, row: 5, width: 42, height: 15 },
    }, mounted.bodyRect.peek());
    assertEquals(
      exomuxMetaballBackgroundVisible(mounted.windowProjection.peek(), mounted.bodyRect.peek()),
      true,
    );

    harness.app.start();
    await waitForCondition(() => mounted.metaballFrameRevision() > 0, 1_500);

    let sequence = 0;
    const emitAsciichurnFrame = () => {
      sequence += 1;
      client.emitOutput({
        sessionId: initial.id,
        sequence,
        data: `\r${sequence % 10}`,
      });
    };
    emitAsciichurnFrame();
    outputTimer = setInterval(emitAsciichurnFrame, 20);
    const revisionDuringOutput = mounted.metaballFrameRevision();
    await waitForCondition(() => mounted.metaballFrameRevision() >= revisionDuringOutput + 2, 1_500);
  } finally {
    if (outputTimer !== undefined) clearInterval(outputTimer);
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux mounted app renders styled terminal cells and routes ordered prefix/raw input", async () => {
  const initial = session("shell-1", "primary", 1);
  const client = new FakeExomuxClient([initial], {
    "shell-1": [{
      sessionId: "shell-1",
      sequence: 1,
      data: "\x1b]2;asciichurn\x07\x1b[31;44;1mR\x1b[0m\x1b[38;5;196;48;5;22mX\x1b[0m\x1b[38;2;12;34;56mY\x1b[0m",
    }],
  });
  const controller = await createExomuxController({
    client,
    initialSessions: [initial],
    defaultCommand: "/bin/test-shell",
  });
  // These assertions snapshot exact cell colours, so pin the desktop opaque
  // rather than inheriting the translucent factory default.
  controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 1 };
  const mount: ExomuxAppMountRef = {};
  const terminalOptions = createExomuxTerminalOptions(controller, mount);
  const { tuiOptions: _tuiOptions, ...headlessOptions } = terminalOptions;
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 110, rows: 32 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute(
      { kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID },
      mounted.bodyRect.peek(),
    );
    await harness.pilot.settle();

    const projection = mounted.windowProjection.peek();
    const terminal = projection.windows.find((window) => window.id === exomuxWindowId("shell-1"));
    assert(terminal);
    const paintedValue = harness.canvas.frameBuffer[terminal.clientRect.row]?.[terminal.clientRect.column] ?? "";
    const painted = typeof paintedValue === "string" ? paintedValue : new TextDecoder().decode(paintedValue);
    assertStringIncludes(painted, "\x1b[1;38;2;205;49;49;48;2;36;114;200mR");
    const paletteValue = harness.canvas.frameBuffer[terminal.clientRect.row]?.[terminal.clientRect.column + 1] ?? "";
    const palette = typeof paletteValue === "string" ? paletteValue : new TextDecoder().decode(paletteValue);
    assertStringIncludes(palette, "\x1b[38;2;255;0;0;48;2;0;95;0mX");
    const truecolorValue = harness.canvas.frameBuffer[terminal.clientRect.row]?.[terminal.clientRect.column + 2] ?? "";
    const truecolor = typeof truecolorValue === "string" ? truecolorValue : new TextDecoder().decode(truecolorValue);
    assertStringIncludes(truecolor, "\x1b[38;2;12;34;56;48;2;14;21;34mY");
    assertStringIncludes(harness.pilot.snapshot(), "asciichurn");
    assertStringIncludes(harness.pilot.snapshot(), "Exomux");

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("f", { buffer: new TextEncoder().encode("f") });
    await mounted.whenIdle();
    let floating = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId("shell-1")
    );
    assert(floating);
    const beforeDrag = { ...floating.rect };
    const dragX = floating.titleBarRect.column + 2;
    const dragY = floating.rect.row;
    assertEquals(
      (await harness.app.mouse.dispatch(createTestMousePress({ x: dragX, y: dragY }))).handled,
      true,
    );
    assertEquals(
      (await harness.app.mouse.dispatch(createTestMousePress({
        x: dragX + 5,
        y: dragY + 4,
        drag: true,
        movementX: 5,
        movementY: 4,
      }))).handled,
      true,
    );
    assertEquals(
      (await harness.app.mouse.dispatch(createTestMousePress({
        x: dragX + 5,
        y: dragY + 4,
        release: true,
        button: undefined,
      }))).handled,
      true,
    );
    await mounted.whenIdle();
    floating = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId("shell-1")
    );
    assert(floating);
    assertEquals(floating.rect, {
      ...beforeDrag,
      column: beforeDrag.column + 5,
      row: beforeDrag.row + 4,
    });

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("f", { buffer: new TextEncoder().encode("f") });
    await mounted.whenIdle();
    assertEquals(
      mounted.windowProjection.peek().tiledWindows.some((window) => window.id === exomuxWindowId("shell-1")),
      true,
    );

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await mounted.whenIdle();
    assertEquals(controller.prefixPending.peek(), true);
    assertEquals(client.inputs.length, 0);

    await harness.pilot.press("t", { buffer: new TextEncoder().encode("t") });
    await mounted.whenIdle();
    assertEquals(controller.themeId.peek(), EXOMUX_THEMES[1]!.id);
    assertEquals(client.inputs.length, 0);

    await harness.pilot.press("a", { buffer: new TextEncoder().encode("a") });
    await mounted.whenIdle();
    assertEquals(client.inputs, [{ sessionId: "shell-1", data: "a" }]);

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("c", { buffer: new TextEncoder().encode("c") });
    await mounted.whenIdle();
    assertEquals(controller.sessions.peek().length, 2);
    assertEquals(client.spawned.length, 1);
    assertEquals(client.inputs.length, 1);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Double-clicking a window title bar toggles maximize and restore", async () => {
  const first = session("dbl-1", "primary", 0);
  const client = new FakeExomuxClient([first]);
  const controller = await createExomuxController({ client, initialSessions: [first] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId(first.id),
      placement: "floating",
      rect: { column: 4, row: 5, width: 34, height: 14 },
    }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    const windowId = exomuxWindowId(first.id);
    const terminal = mounted.windowProjection.peek().floatingWindows.find((window) => window.id === windowId);
    assert(terminal);
    // A bare title-bar cell — off the window's controls, on its top row.
    const x = terminal.titleBarRect.column + 2;
    const y = terminal.titleBarRect.row;
    assertEquals(controller.windowHost.controller.inspect().maximizedWindowId, undefined);

    // Two quick clicks on the same title bar maximize the window.
    await harness.app.mouse.dispatch(createTestMousePress({ x, y }));
    await harness.app.mouse.dispatch(createTestMousePress({ x, y, release: true, button: undefined }));
    await harness.app.mouse.dispatch(createTestMousePress({ x, y }));
    await mounted.whenIdle();
    assertEquals(controller.windowHost.controller.inspect().maximizedWindowId, windowId);

    // Double-clicking the title bar again restores it.
    const maximized = mounted.windowProjection.peek().windows.find((window) => window.id === windowId);
    assert(maximized);
    const restoreX = maximized.titleBarRect.column + 2;
    const restoreY = maximized.titleBarRect.row;
    await harness.app.mouse.dispatch(createTestMousePress({ x: restoreX, y: restoreY }));
    await harness.app.mouse.dispatch(
      createTestMousePress({ x: restoreX, y: restoreY, release: true, button: undefined }),
    );
    await harness.app.mouse.dispatch(createTestMousePress({ x: restoreX, y: restoreY }));
    await mounted.whenIdle();
    assertEquals(controller.windowHost.controller.inspect().maximizedWindowId, undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("A single title-bar click focuses the window without maximizing it", async () => {
  const first = session("single-1", "primary", 0);
  const client = new FakeExomuxClient([first]);
  const controller = await createExomuxController({ client, initialSessions: [first] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId(first.id),
      placement: "floating",
      rect: { column: 4, row: 5, width: 34, height: 14 },
    }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    const windowId = exomuxWindowId(first.id);
    const terminal = mounted.windowProjection.peek().floatingWindows.find((window) => window.id === windowId);
    assert(terminal);
    const x = terminal.titleBarRect.column + 2;
    const y = terminal.titleBarRect.row;

    await harness.app.mouse.dispatch(createTestMousePress({ x, y }));
    await harness.app.mouse.dispatch(createTestMousePress({ x, y, release: true, button: undefined }));
    await mounted.whenIdle();
    // One click never maximizes; it only focuses (and begins a no-op move).
    assertEquals(controller.windowHost.controller.inspect().maximizedWindowId, undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("resizeGlyphAt picks a move/resize glyph on a floating window's border", () => {
  const projection = {
    floatingWindows: [{
      rect: { column: 4, row: 2, width: 20, height: 10 },
      clientRect: { column: 5, row: 3, width: 18, height: 8 },
    }],
  } as unknown as Parameters<typeof resizeGlyphAt>[0];
  // Top row is the title bar → move.
  assertEquals(resizeGlyphAt(projection, 10, 2), "✥");
  // Side edges → horizontal resize.
  assertEquals(resizeGlyphAt(projection, 4, 6), "↔");
  assertEquals(resizeGlyphAt(projection, 23, 6), "↔");
  // Bottom edge → vertical resize; bottom corners → diagonal resize.
  assertEquals(resizeGlyphAt(projection, 10, 11), "↕");
  assertEquals(resizeGlyphAt(projection, 4, 11), "⤢");
  assertEquals(resizeGlyphAt(projection, 23, 11), "⤡");
  // Inside the content and off the window → no glyph (a plain block).
  assertEquals(resizeGlyphAt(projection, 10, 6), undefined);
  assertEquals(resizeGlyphAt(projection, 0, 0), undefined);
});

Deno.test("Option-row clicks step back on the left half and forward on the right", () => {
  // width 30 -> controlWidth 16, right-aligned at column 18, midpoint at 26.
  const row = { column: 4, row: 5, width: 30, height: 1 };
  assertEquals(exomuxOptionCycleDirection(row, 4), -1); // label side steps back
  assertEquals(exomuxOptionCycleDirection(row, 18), -1); // the `<` at the control's left edge
  assertEquals(exomuxOptionCycleDirection(row, 25), -1); // still the left half
  assertEquals(exomuxOptionCycleDirection(row, 26), 1); // right of the midpoint
  assertEquals(exomuxOptionCycleDirection(row, 33), 1); // the `>` at the control's right edge
  // A narrow row still splits sanely (controlWidth floored at 6).
  const narrow = { column: 0, row: 0, width: 8, height: 1 };
  assertEquals(exomuxOptionCycleDirection(narrow, 2), -1);
  assertEquals(exomuxOptionCycleDirection(narrow, 7), 1);
});

Deno.test("Any-motion hover events are inert to the window host, so buttons keep working", async () => {
  const first = session("hover-1", "primary", 0);
  const client = new FakeExomuxClient([first]);
  const controller = await createExomuxController({ client, initialSessions: [first] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId(first.id),
      placement: "floating",
      rect: { column: 4, row: 5, width: 34, height: 14 },
    }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    const windowId = exomuxWindowId(first.id);
    const inspect = () => controller.windowHost.controller.inspect();
    const currentWindow = () => mounted.windowProjection.peek().windows.find((window) => window.id === windowId)!;
    const titleBar = currentWindow().titleBarRect;
    const rectBefore = { ...currentWindow().rect };

    // The block cursor enables any-motion tracking, which streams pure hover
    // motion (a drag with no held button, reported with button code 3). Such a
    // hover must not start a window interaction — otherwise the next real click
    // is swallowed by the phantom gesture.
    for (let step = 0; step < 4; step += 1) {
      await harness.app.mouse.dispatch(
        createTestMousePress({ x: titleBar.column + 2 + step, y: titleBar.row, drag: true, button: 3 as never }),
      );
    }
    await mounted.whenIdle();
    assertEquals(currentWindow().rect, rectBefore, "a bare hover must not move the window");

    // A real click on the maximize button still fires right after the hovers.
    const maximize = currentWindow().controls.find((control) =>
      control.command?.kind === "maximize" || control.command?.kind === "toggle-maximize"
    )!;
    const buttonX = maximize.hitRect.column + Math.floor(maximize.hitRect.width / 2);
    const buttonY = maximize.hitRect.row;
    await harness.app.mouse.dispatch(createTestMousePress({ x: buttonX, y: buttonY }));
    await harness.app.mouse.dispatch(
      createTestMousePress({ x: buttonX, y: buttonY, release: true, button: undefined }),
    );
    await mounted.whenIdle();
    assertEquals(inspect().maximizedWindowId, windowId, "the button must still act after hover motion");

    // A genuine held-button drag (button 0) must still move the window.
    controller.windowHost.execute({ kind: "restore", id: windowId }, mounted.bodyRect.peek());
    controller.windowHost.execute({
      kind: "set-placement",
      id: windowId,
      placement: "floating",
      rect: { column: 4, row: 5, width: 34, height: 14 },
    }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const dragBar = currentWindow().titleBarRect;
    const dragOrigin = { ...currentWindow().rect };
    await harness.app.mouse.dispatch(createTestMousePress({ x: dragBar.column + 2, y: dragBar.row }));
    await harness.app.mouse.dispatch(
      createTestMousePress({
        x: dragBar.column + 6,
        y: dragBar.row + 3,
        drag: true,
        button: 0,
        movementX: 4,
        movementY: 3,
      }),
    );
    await harness.app.mouse.dispatch(
      createTestMousePress({ x: dragBar.column + 6, y: dragBar.row + 3, release: true, button: undefined }),
    );
    await mounted.whenIdle();
    assertNotEquals(currentWindow().rect, dragOrigin, "a held-button drag must still move the window");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux forwards negotiated nested mouse and touch input to the captured terminal", async () => {
  const first = session("mouse-a", "mouse A", 0);
  const second = session("mouse-b", "mouse B", 0);
  const client = new FakeExomuxClient([first, second]);
  const controller = await createExomuxController({ client, initialSessions: [first, second] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 100, rows: 30 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId(first.id),
      placement: "floating",
      rect: { column: 4, row: 5, width: 34, height: 14 },
    }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(first.id) }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    const runtime = controller.runtime(first.id)!;
    runtime.screen.write("\x1b[?1002;1006h");
    let terminal = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(first.id)
    );
    assert(terminal);
    const x = terminal.clientRect.column + 1;
    const y = terminal.clientRect.row + 1;
    client.inputs.splice(0);
    client.delayInputAcks = true;

    assertEquals(await mounted.handlePointer(mousePointer("down", x, y, 1)), true);
    await Promise.resolve();
    assert(client.pendingInputAckCount > 0);
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(second.id) }, mounted.bodyRect.peek());
    assertEquals(await mounted.handlePointer(mousePointer("move", x + 2, y + 1, 2)), true);
    assertEquals(await mounted.handlePointer(mousePointer("up", x + 2, y + 1, 3)), true);
    await client.resolveAllInputAcks();
    await mounted.whenIdle();
    assert(client.inputs.every((input) => input.sessionId === first.id));
    assertEquals(
      client.inputs.map((input) => input.data).join(""),
      "\x1b[<0;2;2M\x1b[<32;4;3M\x1b[<0;4;3m",
    );

    client.delayInputAcks = false;
    client.inputs.splice(0);
    assertEquals((await harness.pilot.scroll(-1, x + 1, y)).handled, true);
    await mounted.whenIdle();
    assertEquals(client.inputs.map((input) => input.data).join(""), "\x1b[<64;3;2M");

    runtime.screen.write("\x1b[?1002l\x1b[?1003h");
    client.inputs.splice(0);
    assertEquals(await mounted.handlePointer(mouseHoverPointer(x + 3, y + 2, 4, true)), true);
    await mounted.whenIdle();
    assertEquals(client.inputs.map((input) => input.data).join(""), "\x1b[<43;5;4M");

    runtime.screen.write("\x1b[?1003l\x1b[?1002h");
    client.inputs.splice(0);
    const secondary = { ...touchPointer("down", x, y, 5, 62), primary: false };
    assertEquals(await mounted.handlePointer(secondary), false);
    await mounted.whenIdle();
    assertEquals(client.inputs, []);

    assertEquals(await mounted.handlePointer(touchPointer("down", x + 1, y + 1, 6, 63)), true);
    assertEquals(await mounted.handlePointer(touchPointer("move", x + 2, y + 2, 7, 63)), true);
    assertEquals(await mounted.handlePointer(touchPointer("up", x + 2, y + 2, 8, 63)), true);
    await mounted.whenIdle();
    assertEquals(
      client.inputs.map((input) => input.data).join(""),
      "\x1b[<0;3;3M\x1b[<32;4;4M\x1b[<0;4;4m",
    );

    client.inputs.splice(0);
    await mounted.handlePointer(touchPointer("down", x, y, 9, 64));
    controller.openHelp();
    await mounted.handlePointer(touchPointer("move", x + 1, y + 1, 10, 64));
    await mounted.whenIdle();
    assertEquals(client.inputs.map((input) => input.data).join(""), "\x1b[<0;2;2M\x1b[<0;3;3m");
    controller.closeHelp();

    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId(second.id),
      placement: "floating",
      rect: {
        column: terminal.clientRect.column + 3,
        row: terminal.clientRect.row + 2,
        width: 20,
        height: 8,
      },
    }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(second.id) }, mounted.bodyRect.peek());
    terminal = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(second.id)
    );
    assert(terminal);
    runtime.screen.write("\x1b[?1002l\x1b[?1003h");
    client.inputs.splice(0);
    await mounted.handlePointer(mouseHoverPointer(
      terminal.titleBarRect.column + 2,
      terminal.titleBarRect.row,
      11,
    ));
    await mounted.whenIdle();
    assertEquals(client.inputs, []);
  } finally {
    client.delayInputAcks = false;
    await client.resolveAllInputAcks();
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux coalesces output bursts to one retained desktop invalidation", async () => {
  const initial = session("repaint-burst", "repaint burst", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 80, rows: 24 } });

  try {
    assert(mount.current);
    await harness.pilot.settle();
    assertEquals(harness.canvas.updateObjects.length, 0);
    for (let sequence = 1; sequence <= 64; sequence += 1) {
      client.emitOutput({ sessionId: initial.id, sequence, data: "x" });
    }
    assertEquals(controller.runtime(initial.id)!.lastSequence, 64);
    assertEquals(
      harness.canvas.updateObjects.filter((object) => object.type === "exomux-desktop").length,
      1,
    );
    assertEquals(harness.canvas.updateObjects.length, new Set(harness.canvas.updateObjects).size);
    await harness.pilot.settle();
    assertEquals(harness.canvas.updateObjects.length, 0);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux invalidates output from a terminal spawned after the desktop mounts", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 80, rows: 24 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await harness.pilot.settle();
    await controller.spawn({ bounds: mounted.bodyRect.peek() });
    await mounted.whenIdle();
    await harness.pilot.settle();
    assertEquals(
      mounted.windowProjection.peek().floatingWindows.some((window) => window.id === exomuxWindowId("spawned-1")),
      true,
    );
    assertEquals(harness.canvas.updateObjects.length, 0);
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID)
        ?.state,
      "minimized",
    );

    const runtime = controller.runtime("spawned-1");
    assert(runtime);
    client.emitOutput({ sessionId: runtime.sessionId, sequence: 1, data: "fresh-output" });

    assertEquals(runtime.lastSequence, 1);
    assertEquals(
      harness.canvas.updateObjects.filter((object) => object.type === "exomux-desktop").length,
      1,
    );
    await harness.pilot.settle();
    assertStringIncludes(harness.pilot.snapshot(), "fresh-output");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux title-bar x kills its terminal and fullscreen suppresses the metaball desktop", async () => {
  const initial = session("chrome-x", "close target", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    assertEquals(
      exomuxMetaballBackgroundVisible(mounted.windowProjection.peek(), mounted.bodyRect.peek()),
      false,
    );
    controller.windowHost.execute(
      { kind: "set-placement", id: exomuxWindowId(initial.id), placement: "floating" },
      mounted.bodyRect.peek(),
    );
    assertEquals(
      exomuxMetaballBackgroundVisible(mounted.windowProjection.peek(), mounted.bodyRect.peek()),
      true,
    );

    controller.windowHost.execute(
      { kind: "maximize", id: exomuxWindowId(initial.id) },
      mounted.bodyRect.peek(),
    );
    assertEquals(
      exomuxMetaballBackgroundVisible(mounted.windowProjection.peek(), mounted.bodyRect.peek()),
      false,
    );
    controller.windowHost.execute(
      { kind: "restore", id: exomuxWindowId(initial.id) },
      mounted.bodyRect.peek(),
    );
    assertEquals(
      exomuxMetaballBackgroundVisible(mounted.windowProjection.peek(), mounted.bodyRect.peek()),
      true,
    );

    // The always-on-top session manager overlaps this floating terminal's
    // title bar in the default test geometry. Minimize it so the click reaches
    // the terminal control the assertion is exercising.
    controller.windowHost.execute(
      { kind: "minimize", id: EXOMUX_SESSIONS_WINDOW_ID },
      mounted.bodyRect.peek(),
    );

    const terminal = mounted.windowProjection.peek().windows.find((window) => window.id === exomuxWindowId(initial.id));
    const close = terminal?.controls.find((control) => control.kind === "close");
    assert(close);
    assertEquals(
      (await harness.pilot.click(
        close.hitRect.column + Math.floor(close.hitRect.width / 2),
        close.hitRect.row + Math.floor(close.hitRect.height / 2),
      )).press.handled,
      true,
    );
    await mounted.whenIdle();

    assertEquals(client.killed, [initial.id]);
    assertEquals(client.detached, []);
    assertEquals(client.listSnapshot(), []);
    assertEquals(controller.runtime(initial.id), undefined);
    assertEquals(
      mounted.windowProjection.peek().windows.some((window) => window.id === exomuxWindowId(initial.id)),
      false,
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux title-bar x kills a visible terminal even when its initial attach failed", async () => {
  const initial = session("attach-failed-x", "unattached target", 0);
  const client = new FakeExomuxClient([initial]);
  client.rejectAttach = true;
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    assertEquals(controller.runtime(initial.id)?.attached.peek(), false);
    const terminal = mounted.windowProjection.peek().windows.find((window) => window.id === exomuxWindowId(initial.id));
    const close = terminal?.controls.find((control) => control.kind === "close");
    assert(close);
    await mounted.handlePointer(touchPointer("down", close.hitRect.column, close.hitRect.row, 901));
    await mounted.handlePointer(touchPointer("up", close.hitRect.column, close.hitRect.row, 902));
    await mounted.whenIdle();

    assertEquals(client.killed, [initial.id]);
    assertEquals(client.listSnapshot(), []);
    assertEquals(controller.runtime(initial.id), undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux restores a chrome-closed terminal when the host rejects its kill", async () => {
  const initial = session("kill-rejected-x", "keep this", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    client.rejectKill = true;
    let terminal = mounted.windowProjection.peek().windows.find((window) => window.id === exomuxWindowId(initial.id));
    let close = terminal?.controls.find((control) => control.kind === "close");
    assert(close);
    await harness.pilot.click(close.hitRect.column, close.hitRect.row);
    await mounted.whenIdle();

    assertEquals(client.killed, [initial.id]);
    assertEquals(controller.runtime(initial.id)?.attached.peek(), true);
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === exomuxWindowId(initial.id))
        ?.state,
      "normal",
    );
    client.emitOutput({ sessionId: initial.id, sequence: 1, data: "after-rejected-kill" });
    assertEquals(controller.runtime(initial.id)?.lastSequence, 1);

    client.rejectKill = false;
    terminal = mounted.windowProjection.peek().windows.find((window) => window.id === exomuxWindowId(initial.id));
    close = terminal?.controls.find((control) => control.kind === "close");
    assert(close);
    await harness.pilot.click(close.hitRect.column, close.hitRect.row);
    await mounted.whenIdle();
    assertEquals(client.killed, [initial.id, initial.id]);
    assertEquals(controller.runtime(initial.id), undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux Meta-C kills the terminal that was active before generic close changed focus", async () => {
  const initial = session("meta-close", "keyboard target", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 28 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await harness.pilot.press("c", { meta: true });
    await mounted.whenIdle();
    assertEquals(client.killed, [initial.id]);
    assertEquals(controller.runtime(initial.id), undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux exposes prefix help, forwards a literal prefix, and confirms destructive kills", async () => {
  const initial = session("safe-1", "important shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 80, rows: 24 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("?");
    await mounted.whenIdle();
    assertEquals(controller.helpVisible.peek(), true);
    assertStringIncludes(harness.pilot.snapshot(), "EXOMUX KEY REFERENCE");
    await harness.pilot.press("escape");
    await mounted.whenIdle();
    assertEquals(controller.helpVisible.peek(), false);

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await mounted.whenIdle();
    assertEquals(client.inputs, [{ sessionId: "safe-1", data: "\x0e" }]);

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("&");
    await mounted.whenIdle();
    assertEquals(controller.pendingKillSessionId.peek(), "safe-1");
    assertEquals(controller.sessions.peek().length, 1);
    assertStringIncludes(harness.pilot.snapshot(), "TERMINATE HOST SESSION?");
    await harness.pilot.press("escape");
    await mounted.whenIdle();
    assertEquals(controller.pendingKillSessionId.peek(), undefined);
    assertEquals(controller.sessions.peek().length, 1);

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("&");
    await harness.pilot.press("y");
    await mounted.whenIdle();
    assertEquals(controller.sessions.peek().length, 0);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux manager reopens a detached terminal without replacing its host session", async () => {
  const initial = session("persist-1", "persistent", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const terminalOptions = createExomuxTerminalOptions(controller, mount);
  const { tuiOptions: _tuiOptions, ...headlessOptions } = terminalOptions;
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 96, rows: 28 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    assertEquals(controller.runtime("persist-1")?.attached.peek(), true);

    await harness.pilot.press("n", { ctrl: true });
    await harness.pilot.press("d");
    await mounted.whenIdle();
    assertEquals(controller.runtime("persist-1")?.attached.peek(), false);
    assertEquals(client.detached, ["persist-1"]);
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === exomuxWindowId("persist-1"))
        ?.state,
      "closed",
    );

    await harness.pilot.press("n", { ctrl: true });
    await harness.pilot.press("s");
    await mounted.whenIdle();
    assertEquals(controller.windowHost.controller.inspect().activeWindowId, EXOMUX_SESSIONS_WINDOW_ID);
    const manager = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID);
    assert(manager);
    const click = await harness.pilot.click(manager.clientRect.column + 2, manager.clientRect.row + 3);
    assertEquals(click.press.handled, true);
    await mounted.whenIdle();

    assertEquals(controller.runtime("persist-1")?.attached.peek(), true);
    assertEquals(client.listSnapshot().map((entry) => entry.id), ["persist-1"]);
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === exomuxWindowId("persist-1"))
        ?.state,
      "normal",
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux pipelines bounded raw batches and fences them around control operations", async () => {
  const initial = session("latency-1", "latency probe", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const terminalOptions = createExomuxTerminalOptions(controller, mount);
  const { tuiOptions: _tuiOptions, ...headlessOptions } = terminalOptions;
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 96, rows: 28 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    client.delayInputAcks = true;

    const typed = "abcdefghijklmnopqrstuvwx";
    await Promise.all(([...typed] as Key[]).map((key) => harness.pilot.press(key)));
    await Promise.resolve();
    assert(client.pendingInputAckCount > 0);
    assert(client.inputs.length <= 4);

    let idleSettled = false;
    const idle = mounted.whenIdle().then(() => idleSettled = true);
    await Promise.resolve();
    assertEquals(idleSettled, false);
    await client.resolveAllInputAcks();
    await idle;
    assertEquals(client.inputs.map((input) => input.data).join(""), typed);
    assert(client.inputs.length < typed.length);

    client.inputs.splice(0);
    const themeBefore = controller.themeId.peek();
    await harness.pilot.press("q");
    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("t");
    await harness.pilot.press("r");
    await Promise.resolve();
    assertEquals(client.inputs.map((input) => input.data).join(""), "q");
    assertEquals(controller.themeId.peek(), themeBefore);

    client.resolveNextInputAck();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertNotEquals(controller.themeId.peek(), themeBefore);
    assertEquals(client.inputs.map((input) => input.data).join(""), "qr");
    await client.resolveAllInputAcks();
    await mounted.whenIdle();

    client.inputs.splice(0);
    await harness.pilot.press("u");
    const pointerMenu = mounted.handlePointer(mousePointer("down", 1, 0, 71));
    await harness.pilot.press("v");
    await Promise.resolve();
    // The menu press is fenced behind the outstanding ack, so nothing has opened.
    assertEquals(client.inputs.map((input) => input.data).join(""), "u");
    assertEquals(controller.startMenuVisible.peek(), false);

    client.resolveNextInputAck();
    assertEquals(await pointerMenu, true);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (controller.startMenuVisible.peek()) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    // "v" was queued after the menu press, so the now-open modal claims it
    // instead of the terminal - proving the control op was ordered first.
    assertEquals(controller.startMenuVisible.peek(), true);
    assertEquals(client.inputs.map((input) => input.data).join(""), "u");
    controller.closeStartMenu();
    await client.resolveAllInputAcks();
    await mounted.whenIdle();

    client.inputs.splice(0);
    const protocolSizedPaste = "x".repeat(EXOMUX_PROTOCOL_LIMITS.inputBytes * 2);
    await harness.pilot.paste(protocolSizedPaste);
    await Promise.resolve();
    assert(client.inputs.length >= 2);
    assert(
      client.inputs.every((input) =>
        new TextEncoder().encode(input.data).byteLength <= EXOMUX_PROTOCOL_LIMITS.inputBytes
      ),
    );
    await client.resolveAllInputAcks();
    await mounted.whenIdle();

    client.inputs.splice(0);
    await harness.pilot.paste("y".repeat(EXOMUX_PROTOCOL_LIMITS.inputBytes * 4 + 1));
    await Promise.resolve();
    assertEquals(client.inputs, []);
    assertStringIncludes(controller.status.peek(), "raw input buffer limit exceeded");
  } finally {
    client.delayInputAcks = false;
    await client.resolveAllInputAcks();
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux coalesces printable keys classified behind a control barrier", async () => {
  const initial = session("barrier-latency", "barrier latency", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    client.delayInputAcks = true;

    await harness.pilot.press("q");
    await Promise.resolve();
    assertEquals(client.inputs.map((input) => input.data).join(""), "q");
    assertEquals(client.pendingInputAckCount, 1);

    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await harness.pilot.press("t");
    const suffix = "abcdefghijklmnopqrstuvwx";
    await Promise.all(([...suffix] as Key[]).map((key) => harness.pilot.press(key)));
    assertEquals(client.inputs.map((input) => input.data).join(""), "q");

    client.resolveNextInputAck();
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (client.inputs.map((input) => input.data).join("") === `q${suffix}`) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assertEquals(client.inputs.map((input) => input.data).join(""), `q${suffix}`);
    assertEquals(client.inputs.length, 2);
    assertEquals(client.pendingInputAckCount, 1);

    await client.resolveAllInputAcks();
    await mounted.whenIdle();
  } finally {
    client.delayInputAcks = false;
    await client.resolveAllInputAcks();
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux bounds classified keys retained behind a stalled barrier", async () => {
  const initial = session("bounded-classifier", "bounded classifier", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 28 } });

  let releaseBarrier!: () => void;
  const barrierGate = new Promise<void>((resolve) => releaseBarrier = resolve);
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const barrier = mounted.enqueue(() => barrierGate);

    for (let index = 0; index < 5_000; index += 1) {
      harness.app.tui.emit(
        "keyPress",
        createTestKeyPress("a", { buffer: new Uint8Array(["a".charCodeAt(0)]) }),
      );
    }
    assertEquals(client.inputs, []);
    assertStringIncludes(controller.status.peek(), "raw input buffer limit exceeded");

    releaseBarrier();
    await barrier;
    await mounted.whenIdle();
    const forwarded = client.inputs.map((input) => input.data).join("");
    assert(forwarded.length > 0);
    assert(forwarded.length < 5_000);
  } finally {
    releaseBarrier();
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux snapshots reused key events before asynchronous prefix routing", async () => {
  const initial = session("reused-key", "reused key", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute(
      { kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID },
      mounted.bodyRect.peek(),
    );
    controller.windowHost.execute(
      { kind: "focus", id: exomuxWindowId(initial.id) },
      mounted.bodyRect.peek(),
    );

    const source = new Uint8Array([14, ...new TextEncoder().encode("ca")]);
    for (const event of decodeBuffer(source)) {
      if (event.key !== "mouse" && event.key !== "paste" && event.key !== "focus") {
        harness.app.tui.emit("keyPress", event);
      }
    }
    source.fill("z".charCodeAt(0));
    await mounted.whenIdle();

    assertEquals(client.spawned.length, 1);
    assertEquals(client.inputs, [{ sessionId: "spawned-1", data: "a" }]);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux repaints Workbench light/dark themes and the six-family T2 theme", async () => {
  const initial = session("theme-render", "theme renderer", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  // These assertions snapshot exact cell colours, so pin the desktop opaque
  // rather than inheriting the translucent factory default.
  controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 1 };
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 112, rows: 30 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    const initialTheme = controller.themeId.peek();
    await clickStartMenuItem(harness, mounted, "config");
    assertEquals(controller.globalConfigVisible.peek(), true);
    // Pick a different theme straight off the select list.
    const themePick = EXOMUX_THEMES.findIndex((entry) => entry.id !== initialTheme);
    const themeLayout = exomuxGlobalConfigLayout(
      mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SETTINGS_WINDOW_ID)!
        .clientRect,
      Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === initialTheme)),
      0,
    );
    const themeRow = themeLayout.themeRows.find((entry) => entry.index === themePick)!;
    assertEquals((await harness.pilot.click(themeRow.rect.column + 2, themeRow.rect.row)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.themeId.peek(), EXOMUX_THEMES[themePick]!.id);
    assertNotEquals(controller.themeId.peek(), initialTheme);
    controller.closeGlobalConfig();
    await mounted.whenIdle();

    for (const themeId of ["unit01", "parchment", "t2"] as const) {
      cycleToTheme(controller, themeId);
      await harness.pilot.settle();
      const theme = exomuxTheme(themeId);
      const brandCell = canvasCell(harness.canvas.frameBuffer[0]?.[0]);
      assertStringIncludes(
        brandCell,
        `38;2;${theme.background.join(";")};48;2;${theme.accent.join(";")}`,
      );
      // Just past the start button, where the top bar is plain chrome.
      const headerCell = canvasCell(harness.canvas.frameBuffer[0]?.[START_BUTTON_WIDTH]);
      assertStringIncludes(
        headerCell,
        `38;2;${theme.text.join(";")};48;2;${theme.surfaceStrong.join(";")}`,
      );
    }
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux mouse menus, modal buttons, floating chrome, shelf, and tiled separators work", async () => {
  const initial = session("mouse-one", "mouse one", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  // These assertions snapshot exact cell colours, so pin the desktop opaque
  // rather than inheriting the translucent factory default.
  controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 1 };
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 112, rows: 32 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    await clickStartMenuItem(harness, mounted, "new");
    assertEquals(controller.sessions.peek().length, 2);
    const spawned = controller.sessions.peek().find((entry) => entry.id !== initial.id)!;

    // Background now lives in the global config modal's select list.
    const backgroundBefore = controller.backgroundId.peek();
    await clickStartMenuItem(harness, mounted, "config");
    assertEquals(controller.globalConfigVisible.peek(), true);
    const backgroundPick = EXOMUX_BACKGROUND_IDS.findIndex((id) => id !== backgroundBefore);
    const backgroundLayout = exomuxGlobalConfigLayout(
      mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SETTINGS_WINDOW_ID)!
        .clientRect,
      0,
      Math.max(0, EXOMUX_BACKGROUND_IDS.indexOf(backgroundBefore)),
    );
    const backgroundRow = backgroundLayout.backgroundRows.find((entry) => entry.index === backgroundPick)!;
    assertEquals(
      (await harness.pilot.click(backgroundRow.rect.column + 2, backgroundRow.rect.row)).press.handled,
      true,
    );
    await mounted.whenIdle();
    assertEquals(controller.backgroundId.peek(), EXOMUX_BACKGROUND_IDS[backgroundPick]!);
    assertNotEquals(controller.backgroundId.peek(), backgroundBefore);
    assertEquals(
      (await harness.pilot.click(backgroundLayout.closeRect.column + 1, backgroundLayout.closeRect.row)).press.handled,
      true,
    );
    await mounted.whenIdle();
    assertEquals(controller.globalConfigVisible.peek(), false);

    await clickStartMenuItem(harness, mounted, "help");
    assertEquals(controller.helpVisible.peek(), true);
    const blockedTheme = controller.themeId.peek();
    // The modal catcher owns every click while help is up.
    assertEquals((await harness.pilot.click(38, 0)).press.targetId, "exomux-modal");
    await mounted.whenIdle();
    assertEquals(controller.themeId.peek(), blockedTheme);
    const helpClose = helpClosePoint(mounted.windowProjection.peek().bounds);
    assertEquals((await harness.pilot.click(helpClose.column, helpClose.row)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.helpVisible.peek(), false);

    controller.requestKillSession(initial.id);
    const killButtons = killButtonPoints(mounted.windowProjection.peek().bounds);
    assertEquals((await harness.pilot.click(killButtons.cancel.column, killButtons.cancel.row)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.pendingKillSessionId.peek(), undefined);
    assertEquals(controller.sessions.peek().length, 2);
    controller.requestKillSession(initial.id);
    assertEquals((await harness.pilot.click(killButtons.confirm.column, killButtons.confirm.row)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.sessions.peek().map((entry) => entry.id), [spawned.id]);

    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute(
      {
        kind: "set-placement",
        id: exomuxWindowId(spawned.id),
        placement: "floating",
        rect: { column: 48, row: 5, width: 40, height: 14 },
      },
      mounted.bodyRect.peek(),
    );
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(spawned.id) }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    let floating = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(spawned.id)
    );
    assert(floating);
    const minimize = floating.controls.find((control) => control.kind === "minimize");
    assert(minimize);
    assertEquals(
      (await harness.pilot.click(
        minimize.hitRect.column + Math.floor(minimize.hitRect.width / 2),
        minimize.hitRect.row + Math.floor(minimize.hitRect.height / 2),
      )).press.handled,
      true,
    );
    await mounted.whenIdle();
    const terminalButton = projectExomuxTerminalBar(
      controller,
      mounted.windowProjection.peek(),
      mounted.shelfBounds.peek(),
    ).commands.find((command) =>
      command.item.action.kind === "session" && command.item.action.sessionId === spawned.id
    );
    assert(terminalButton);
    assertEquals(
      (await harness.pilot.click(
        terminalButton.hitRect.column + Math.floor(terminalButton.hitRect.width / 2),
        terminalButton.hitRect.row,
      )).press.handled,
      true,
    );
    await mounted.whenIdle();

    floating = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(spawned.id)
    );
    assert(floating);
    const beforeResize = { ...floating.rect };
    const resizeX = floating.rect.column + floating.rect.width - 1;
    const resizeY = floating.rect.row + floating.rect.height - 1;
    assertEquals(
      (await harness.app.mouse.dispatch(createTestMousePress({ x: resizeX, y: resizeY }))).handled,
      true,
    );
    assertEquals(
      (await harness.app.mouse.dispatch(createTestMousePress({
        x: resizeX + 4,
        y: resizeY + 2,
        drag: true,
        movementX: 4,
        movementY: 2,
      }))).handled,
      true,
    );
    assertEquals(
      (await harness.app.mouse.dispatch(createTestMousePress({
        x: resizeX + 4,
        y: resizeY + 2,
        release: true,
        button: undefined,
      }))).handled,
      true,
    );
    await mounted.whenIdle();
    floating = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(spawned.id)
    );
    assert(floating);
    assertNotEquals(floating.rect.width, beforeResize.width);
    assertNotEquals(floating.rect.height, beforeResize.height);

    controller.windowHost.execute(
      { kind: "set-placement", id: exomuxWindowId(spawned.id), placement: "tiled" },
      mounted.bodyRect.peek(),
    );
    controller.windowHost.execute(
      { kind: "maximize", id: exomuxWindowId(spawned.id) },
      mounted.bodyRect.peek(),
    );
    await harness.pilot.settle();
    const fullscreen = mounted.windowProjection.peek().tiledWindows.find((window) =>
      window.id === exomuxWindowId(spawned.id)
    );
    const restore = fullscreen?.controls.find((control) => control.kind === "restore");
    assert(restore);
    assertEquals(
      (await harness.pilot.click(
        restore.hitRect.column + Math.floor(restore.hitRect.width / 2),
        restore.hitRect.row,
      )).press.handled,
      true,
    );
    await mounted.whenIdle();
    const poppedOut = controller.windowHost.controller.inspect().windows.find((window) =>
      window.id === exomuxWindowId(spawned.id)
    );
    assertEquals(poppedOut?.state, "normal");
    assertEquals(poppedOut?.placement, "floating");
    controller.windowHost.execute(
      { kind: "set-placement", id: exomuxWindowId(spawned.id), placement: "tiled" },
      mounted.bodyRect.peek(),
    );
    await controller.spawn({ bounds: mounted.bodyRect.peek(), dock: "right" });
    await harness.pilot.settle();
    const separator = mounted.windowProjection.peek().separators[0];
    assert(separator);
    const separatorX = separator.rect.column + Math.floor(separator.rect.width / 2);
    const separatorY = separator.rect.row + Math.floor(separator.rect.height / 2);
    const beforeRatio = separator.ratio;
    const deltaX = separator.axis === "column" ? 4 : 0;
    const deltaY = separator.axis === "row" ? 3 : 0;
    await harness.app.mouse.dispatch(createTestMousePress({ x: separatorX, y: separatorY }));
    await harness.app.mouse.dispatch(createTestMousePress({
      x: separatorX + deltaX,
      y: separatorY + deltaY,
      drag: true,
      movementX: deltaX,
      movementY: deltaY,
    }));
    await harness.app.mouse.dispatch(createTestMousePress({
      x: separatorX + deltaX,
      y: separatorY + deltaY,
      release: true,
      button: undefined,
    }));
    await mounted.whenIdle();
    assertNotEquals(mounted.windowProjection.peek().separators[0]?.ratio, beforeRatio);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux terminal bar raises every open terminal, protects floating paint, and collapses for touch", async () => {
  const initialSessions = [
    session("bar-one", "bash", 0),
    session("bar-two", "vim", 0),
    session("bar-three", "asciichurn", 0),
  ];
  const client = new FakeExomuxClient(initialSessions);
  const controller = await createExomuxController({ client, initialSessions });
  // These assertions snapshot exact cell colours, so pin the desktop opaque
  // rather than inheriting the translucent factory default.
  controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 1 };
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 120, rows: 32 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const bounds = mounted.bodyRect.peek();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, bounds);
    for (const [index, entry] of initialSessions.slice(0, 2).entries()) {
      controller.windowHost.execute({
        kind: "set-placement",
        id: exomuxWindowId(entry.id),
        placement: "floating",
        rect: { column: 22 + index * 3, row: 6 + index, width: 48, height: 16 },
      }, bounds);
    }
    controller.windowHost.execute({ kind: "minimize", id: exomuxWindowId("bar-three") }, bounds);
    await harness.pilot.settle();

    let bar = projectExomuxTerminalBar(
      controller,
      mounted.windowProjection.peek(),
      mounted.shelfBounds.peek(),
    );
    assertEquals(bar.collapsed, false);
    assertEquals(
      bar.commands.flatMap((command) => command.item.action.kind === "session" ? [command.item.action.sessionId] : [])
        .sort(),
      initialSessions.map((entry) => entry.id).sort(),
    );
    const firstButton = bar.commands.find((command) =>
      command.item.action.kind === "session" && command.item.action.sessionId === "bar-one"
    );
    assert(firstButton);
    await harness.pilot.click(
      firstButton.hitRect.column + Math.floor(firstButton.hitRect.width / 2),
      firstButton.hitRect.row,
    );
    await mounted.whenIdle();
    assertEquals(
      mounted.windowProjection.peek().floatingWindows.at(-1)?.id,
      exomuxWindowId("bar-one"),
    );
    await harness.pilot.click(
      firstButton.hitRect.column + Math.floor(firstButton.hitRect.width / 2),
      firstButton.hitRect.row,
    );
    await mounted.whenIdle();
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((entry) => entry.id === exomuxWindowId("bar-one"))
        ?.state,
      "minimized",
    );
    bar = projectExomuxTerminalBar(
      controller,
      mounted.windowProjection.peek(),
      mounted.shelfBounds.peek(),
    );
    const minimizedFirstButton = bar.commands.find((command) =>
      command.item.action.kind === "session" && command.item.action.sessionId === "bar-one"
    );
    assert(minimizedFirstButton);
    await harness.pilot.click(
      minimizedFirstButton.hitRect.column + Math.floor(minimizedFirstButton.hitRect.width / 2),
      minimizedFirstButton.hitRect.row,
    );
    await mounted.whenIdle();
    assertNotEquals(
      controller.windowHost.controller.inspect().windows.find((entry) => entry.id === exomuxWindowId("bar-one"))
        ?.state,
      "minimized",
    );

    for (const entry of initialSessions.slice(0, 2)) {
      controller.windowHost.execute({
        kind: "set-placement",
        id: exomuxWindowId(entry.id),
        placement: "tiled",
      }, bounds);
    }
    controller.windowHost.execute({ kind: "restore", id: exomuxWindowId("bar-three") }, bounds);
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId("bar-three"),
      placement: "floating",
    }, bounds);
    let separator = mounted.windowProjection.peek().separators[0];
    assert(separator);
    let overlapColumn = separator.rect.column + Math.floor(separator.rect.width / 2);
    let overlapRow = separator.rect.row + Math.floor(separator.rect.height / 2);
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId("bar-three"),
      placement: "floating",
      rect: {
        column: overlapColumn - 4,
        row: overlapRow - 2,
        width: 28,
        height: 10,
      },
    }, bounds);
    await harness.pilot.settle();
    separator = mounted.windowProjection.peek().separators[0];
    assert(separator);
    overlapColumn = separator.rect.column + Math.floor(separator.rect.width / 2);
    overlapRow = separator.rect.row + Math.floor(separator.rect.height / 2);
    const crossingWindow = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId("bar-three")
    );
    assert(crossingWindow);
    assert(
      overlapColumn >= crossingWindow.clientRect.column &&
        overlapColumn < crossingWindow.clientRect.column + crossingWindow.clientRect.width &&
        overlapRow >= crossingWindow.clientRect.row &&
        overlapRow < crossingWindow.clientRect.row + crossingWindow.clientRect.height,
    );
    const crossingCell = canvasCell(harness.canvas.frameBuffer[overlapRow]?.[overlapColumn]);
    assertStringIncludes(crossingCell, `48;2;${controller.theme.peek().surface.join(";")}`);

    controller.windowHost.execute({ kind: "minimize", id: exomuxWindowId("bar-three") }, bounds);
    controller.windowHost.execute({ kind: "maximize", id: exomuxWindowId("bar-one") }, bounds);
    await harness.pilot.settle();
    bar = projectExomuxTerminalBar(
      controller,
      mounted.windowProjection.peek(),
      mounted.shelfBounds.peek(),
    );
    const secondButton = bar.commands.find((command) =>
      command.item.action.kind === "session" && command.item.action.sessionId === "bar-two"
    );
    assert(secondButton);
    await harness.pilot.click(
      secondButton.hitRect.column + Math.floor(secondButton.hitRect.width / 2),
      secondButton.hitRect.row,
    );
    await mounted.whenIdle();
    assertEquals(controller.windowHost.controller.inspect().maximizedWindowId, exomuxWindowId("bar-two"));

    await harness.pilot.resize(28, 24);
    bar = projectExomuxTerminalBar(
      controller,
      mounted.windowProjection.peek(),
      mounted.shelfBounds.peek(),
    );
    assertEquals(bar.collapsed, true);
    assertEquals(bar.commands.length, 1);
    assertEquals(bar.commands[0]?.item.action, { kind: "sessions" });
    const selector = bar.commands[0]!;
    const touchColumn = selector.hitRect.column + Math.floor(selector.hitRect.width / 2);
    await mounted.handlePointer(touchPointer("down", touchColumn, selector.hitRect.row, 100, 77));
    await mounted.handlePointer(touchPointer("up", touchColumn, selector.hitRect.row, 101, 77));
    await mounted.whenIdle();
    const inspection = controller.windowHost.controller.inspect();
    // 28x24 is phone-sized, so the mobile layout hands the session manager the
    // whole body instead of floating it over windows that cannot fit anyway.
    assertEquals(inspection.maximizedWindowId, EXOMUX_SESSIONS_WINDOW_ID);
    assertEquals(inspection.activeWindowId, EXOMUX_SESSIONS_WINDOW_ID);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux sessions panel renders as a composited List with translucent row grounds", async () => {
  const initialSessions = [session("list-a", "alpha", 0), session("list-b", "beta", 1)];
  const client = new FakeExomuxClient(initialSessions);
  const controller = await createExomuxController({ client, initialSessions });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 96, rows: 26 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "focus", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    // A half-transparent desktop, so the panel rows blend against the field.
    controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 0.5 };
    await harness.pilot.settle();
    const manager = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID);
    assert(manager);
    const theme = controller.theme.peek();
    const cellText = (column: number, row: number): string => {
      const value = harness.canvas.frameBuffer[row]?.[column] ?? "";
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    };
    const selectedRowY = manager.clientRect.row + 3;
    // The composited List puts its selection marker in the panel's first
    // column; the hand-drawn fallback indents it by one. Waiting for the
    // column-0 marker therefore waits for the real component's snapshot. The
    // harness has no free-running render loop, so pump settle() while waiting.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (stripAnsi(cellText(manager.clientRect.column, selectedRowY)).includes(">")) break;
      await harness.pilot.settle();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assertStringIncludes(stripAnsi(cellText(manager.clientRect.column, selectedRowY)), ">");

    // The selected row is the List's opaque accent block.
    assertStringIncludes(cellText(manager.clientRect.column + 1, selectedRowY), `48;2;${theme.accent.join(";")}`);
    // An unselected row blends its ground against the desktop rather than
    // keeping the plain surface colour.
    const unselected = cellText(manager.clientRect.column + 1, selectedRowY + 1);
    assert(
      !unselected.includes(`48;2;${theme.surface.join(";")}`),
      `unselected row should take the blended ground, saw "${unselected.replaceAll("\x1b", "ESC")}"`,
    );
    // The session labels flow through the composited cells.
    let secondRow = "";
    for (let column = 0; column < manager.clientRect.width; column += 1) {
      secondRow += stripAnsi(cellText(manager.clientRect.column + column, selectedRowY + 1));
    }
    assertStringIncludes(secondRow, "beta");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux manager wheel selection never clicks through its fixed header", async () => {
  const initialSessions = Array.from(
    { length: 20 },
    (_, index) => session(`overflow-${index}`, `session ${index}`, 0),
  );
  const client = new FakeExomuxClient(initialSessions);
  const controller = await createExomuxController({ client, initialSessions });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 96, rows: 24 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const sessions = controller.sessions.peek();
    for (const entry of sessions) {
      controller.windowHost.execute({ kind: "minimize", id: exomuxWindowId(entry.id) }, mounted.bodyRect.peek());
    }
    controller.windowHost.execute({ kind: "restore", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    mounted.selectedSessionIndex.value = 12;
    await harness.pilot.settle();
    let manager = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID);
    assert(manager);

    const headerClick = await harness.pilot.click(manager.clientRect.column + 2, manager.clientRect.row + 1);
    assertEquals(headerClick.press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.windowHost.controller.inspect().activeWindowId, EXOMUX_SESSIONS_WINDOW_ID);
    assertEquals(mounted.selectedSessionIndex.peek(), 12);

    // A wheel notch scrolls the list viewport without moving the selection —
    // the proper listbox wheel the composited List provides (WS-003).
    const available = Math.max(0, manager.clientRect.height - 3);
    const topBefore = exomuxSessionListWindowStart(sessions.length, 12, available, -1);
    assertEquals(
      (await harness.pilot.scroll(1, manager.clientRect.column + 2, manager.clientRect.row + 3)).handled,
      true,
    );
    await mounted.whenIdle();
    assertEquals(mounted.selectedSessionIndex.peek(), 12, "the wheel must not move the selection");
    manager = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID);
    assert(manager);
    const targetIndex = topBefore + 1 + 1; // scrolled one notch, clicked visible row 1
    const rowClick = await harness.pilot.click(manager.clientRect.column + 2, manager.clientRect.row + 4);
    assertEquals(rowClick.press.handled, true);
    await mounted.whenIdle();
    assertEquals(mounted.selectedSessionIndex.peek(), targetIndex);
    assertEquals(
      controller.windowHost.controller.inspect().activeWindowId,
      exomuxWindowId(sessions[targetIndex]!.id),
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux wheel and touch input scroll styled history and manipulate windows", async () => {
  const initial = session("touch-shell", "touch shell", 0);
  const transcript = Array.from(
    { length: 48 },
    (_, index) => `\x1b[31mred-${String(index).padStart(2, "0")}\x1b[0m\r\n`,
  ).join("");
  const client = new FakeExomuxClient([initial], {
    [initial.id]: [{ sessionId: initial.id, sequence: 1, data: transcript }],
  });
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 100, rows: 28 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute(
      { kind: "maximize", id: exomuxWindowId(initial.id) },
      mounted.bodyRect.peek(),
    );
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(initial.id) }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const runtime = controller.runtime(initial.id)!;
    let terminal = mounted.windowProjection.peek().windows.find((window) => window.id === exomuxWindowId(initial.id));
    assert(terminal);
    assert(runtime.scrollback.inspect().scrollbackRows > 0);

    const wheelX = terminal.clientRect.column + 2;
    const wheelY = terminal.clientRect.row + 2;
    assertEquals((await harness.pilot.scroll(-1, wheelX, wheelY)).handled, true);
    await mounted.whenIdle();
    assertEquals(runtime.scrollback.inspect().mode, "copy");
    for (let attempt = 0; attempt < 32 && runtime.scrollback.inspect().offset > 0; attempt += 1) {
      await harness.pilot.scroll(-1, wheelX, wheelY);
    }
    await mounted.whenIdle();
    assertEquals(runtime.scrollback.inspect().offset, 0);
    await harness.pilot.settle();
    const styledHistory = canvasCell(
      harness.canvas.frameBuffer[terminal.clientRect.row]?.[terminal.clientRect.column],
    );
    const theme = controller.theme.peek();
    const historyRed = exomuxTerminalForegroundRgb(31, theme.surface, theme.text)!;
    assertStringIncludes(styledHistory, `38;2;${historyRed.join(";")}`);

    for (let attempt = 0; attempt < 32 && runtime.scrollback.inspect().mode === "copy"; attempt += 1) {
      await harness.pilot.scroll(1, wheelX, wheelY);
    }
    assertEquals(runtime.scrollback.inspect().mode, "live");

    controller.windowHost.execute(
      { kind: "restore", id: exomuxWindowId(initial.id) },
      mounted.bodyRect.peek(),
    );
    controller.windowHost.execute(
      { kind: "set-placement", id: exomuxWindowId(initial.id), placement: "floating" },
      mounted.bodyRect.peek(),
    );
    await harness.pilot.settle();
    terminal = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(initial.id)
    );
    assert(terminal);
    const beforeDrag = { ...terminal.rect };
    const dragX = terminal.titleBarRect.column + 2;
    const dragY = terminal.titleBarRect.row;
    await mounted.handlePointer(touchPointer("down", dragX, dragY, 1));
    await mounted.handlePointer(touchPointer("move", dragX + 5, dragY + 4, 2));
    await mounted.handlePointer(touchPointer("up", dragX + 5, dragY + 4, 3));
    terminal = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(initial.id)
    );
    assert(terminal);
    assertEquals(terminal.rect, {
      ...beforeDrag,
      column: beforeDrag.column + 5,
      row: beforeDrag.row + 4,
    });

    const beforeCancelledDrag = { ...terminal.rect };
    const cancelX = terminal.titleBarRect.column + Math.max(1, Math.floor(terminal.titleBarRect.width / 2));
    const cancelY = terminal.titleBarRect.row;
    await mounted.handlePointer(touchPointer("down", cancelX, cancelY, 4));
    await mounted.handlePointer(touchPointer("move", cancelX + 4, cancelY + 1, 5));
    await mounted.handlePointer(touchPointerWithoutCell("cancel", 6));
    terminal = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(initial.id)
    );
    assert(terminal);
    assertEquals(terminal.rect, beforeCancelledDrag);

    const beforeModalDrag = { ...terminal.rect };
    const modalDragX = terminal.titleBarRect.column + Math.max(1, Math.floor(terminal.titleBarRect.width / 2));
    const modalDragY = terminal.titleBarRect.row;
    await mounted.handlePointer(touchPointer("down", modalDragX, modalDragY, 7, 0));
    await mounted.handlePointer(touchPointer("move", modalDragX + 3, modalDragY + 1, 8, 0));
    controller.openHelp();
    await mounted.handlePointer(touchPointer("move", modalDragX + 4, modalDragY + 1, 9, 0));
    terminal = mounted.windowProjection.peek().floatingWindows.find((window) =>
      window.id === exomuxWindowId(initial.id)
    );
    assert(terminal);
    assertEquals(terminal.rect, beforeModalDrag);
    controller.closeHelp();

    const swipeX = terminal.clientRect.column + 2;
    const swipeY = terminal.clientRect.row + 2;
    await mounted.handlePointer(touchPointer("down", swipeX, swipeY, 10));
    await mounted.handlePointer(touchPointer("move", swipeX, swipeY + 4, 11));
    await mounted.handlePointer(touchPointer("up", swipeX, swipeY + 4, 12));
    assertEquals(runtime.scrollback.inspect().mode, "copy");

    // A non-activating press on the top bar is absorbed by the chrome and must
    // not act; what matters is that it changes nothing.
    const rightClickTheme = controller.themeId.peek();
    await mounted.handlePointer(mousePointer("down", 38, 0, 13, 2));
    assertEquals(controller.themeId.peek(), rightClickTheme);
    assertEquals(controller.startMenuVisible.peek(), false);

    const beforeCancelledNew = controller.sessions.peek().length;
    await mounted.handlePointer(touchPointer("down", 13, 0, 14));
    assertEquals(controller.sessions.peek().length, beforeCancelledNew);
    await mounted.handlePointer(touchPointerWithoutCell("cancel", 15));
    assertEquals(controller.sessions.peek().length, beforeCancelledNew);
    await mounted.handlePointer(touchPointer("down", 13, 0, 16));
    await mounted.handlePointer(touchPointer("move", 18, 0, 17));
    await mounted.handlePointer(touchPointer("up", 18, 0, 18));
    assertEquals(controller.sessions.peek().length, beforeCancelledNew);

    await mounted.handlePointer(touchPointer("down", 1, 0, 19));
    assertEquals(controller.startMenuVisible.peek(), true);
    assertEquals(controller.helpVisible.peek(), false);
    const helpItem = exomuxStartMenuLayout(harness.app.tui.rectangle.peek()).items
      .find((item) => item.id === "help")!;
    await mounted.handlePointer(touchPointer("down", helpItem.rect.column + 1, helpItem.rect.row, 20));
    await mounted.handlePointer(touchPointer("up", helpItem.rect.column + 1, helpItem.rect.row, 21));
    assertEquals(controller.helpVisible.peek(), true);
    const close = helpClosePoint(mounted.windowProjection.peek().bounds);
    await mounted.handlePointer(touchPointer("down", close.column, close.row, 21));
    assertEquals(controller.helpVisible.peek(), true);
    await mounted.handlePointer(touchPointer("up", close.column, close.row, 22));
    assertEquals(controller.helpVisible.peek(), false);

    const pointerSource = new FakeExomuxPointerSource();
    const unbindPointer = bindExomuxPointerInput(mounted, pointerSource);
    // The start button responds only while the source is bound.
    await pointerSource.emitPointer(touchPointer("down", 1, 0, 23));
    assertEquals(controller.startMenuVisible.peek(), true);
    controller.closeStartMenu();
    unbindPointer();
    await pointerSource.emitPointer(touchPointer("down", 1, 0, 25));
    await pointerSource.emitPointer(touchPointer("up", 1, 0, 26));
    assertEquals(controller.startMenuVisible.peek(), false);

    controller.openHelp();
    const orderedClose = helpClosePoint(mounted.windowProjection.peek().bounds);
    let releaseBarrier!: () => void;
    let markBarrierStarted!: () => void;
    const barrierStarted = new Promise<void>((resolve) => markBarrierStarted = resolve);
    const barrier = mounted.enqueue(() => {
      markBarrierStarted();
      return new Promise<void>((resolve) => releaseBarrier = resolve);
    });
    await barrierStarted;
    const closeDown = mounted.handlePointer(touchPointer("down", orderedClose.column, orderedClose.row, 27, 70));
    const closeUp = mounted.handlePointer(touchPointer("up", orderedClose.column, orderedClose.row, 28, 70));
    const startDown = mounted.handlePointer(touchPointer("down", 1, 0, 29, 71));
    const startUp = mounted.handlePointer(touchPointer("up", 1, 0, 30, 71));
    releaseBarrier();
    await Promise.all([barrier, closeDown, closeUp, startDown, startUp]);
    // Help closed first, then the start menu opened - both behind one barrier.
    assertEquals(controller.helpVisible.peek(), false);
    assertEquals(controller.startMenuVisible.peek(), true);
    controller.closeStartMenu();

    controller.requestKillSession(initial.id);
    const kill = killButtonPoints(mounted.windowProjection.peek().bounds);
    await mounted.handlePointer(touchPointer("down", kill.confirm.column, kill.confirm.row, 31));
    assertEquals(controller.sessions.peek().length, 1);
    await mounted.handlePointer(touchPointerWithoutCell("cancel", 32));
    assertEquals(controller.sessions.peek().length, 1);
    controller.cancelKillSession();

    client.delayInputAcks = true;
    await harness.pilot.press("q");
    await Promise.resolve();
    assert(client.pendingInputAckCount > 0);
    const beforeCoalescedSwipe = controller.sessions.peek().length;
    const down = mounted.handlePointer(touchPointer("down", 13, 0, 33, 61));
    const away = mounted.handlePointer(touchPointer("move", 30, 0, 34, 61));
    const back = mounted.handlePointer(touchPointer("move", 13, 0, 35, 61));
    const up = mounted.handlePointer(touchPointer("up", 13, 0, 36, 61));
    await client.resolveAllInputAcks();
    await Promise.all([down, away, back, up]);
    await mounted.whenIdle();
    assertEquals(controller.sessions.peek().length, beforeCoalescedSwipe);
    client.delayInputAcks = false;
  } finally {
    client.delayInputAcks = false;
    await client.resolveAllInputAcks();
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("F1 toggles the help modal from anywhere without leaking to the terminal", async () => {
  const initial = session("f1-help", "f1 help", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 90, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    // Focus a real terminal so a stray key would otherwise reach the child.
    const terminalWindowId = exomuxWindowId(initial.id);
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: terminalWindowId }, mounted.bodyRect.peek());
    await mounted.whenIdle();
    assertEquals(controller.helpVisible.peek(), false);

    const pressF1 = () =>
      harness.app.tui.emit("keyPress", createTestKeyPress("f1", { buffer: new TextEncoder().encode("\x1bOP") }));

    pressF1();
    await mounted.whenIdle();
    assertEquals(controller.helpVisible.peek(), true);
    // The shortcut is consumed by the mux, never forwarded as bytes.
    assertEquals(client.inputs, []);

    // Pressing it again toggles the modal back off.
    pressF1();
    await mounted.whenIdle();
    assertEquals(controller.helpVisible.peek(), false);
    assertEquals(client.inputs, []);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux classifies queued keys against the modal state in arrival order", async () => {
  const initial = session("ordered-keys", "ordered keys", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 90, rows: 28 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const terminalWindowId = exomuxWindowId(initial.id);
    controller.windowHost.execute(
      { kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID },
      mounted.bodyRect.peek(),
    );
    controller.windowHost.execute({ kind: "focus", id: terminalWindowId }, mounted.bodyRect.peek());

    harness.app.tui.emit(
      "keyPress",
      createTestKeyPress("n", {
        ctrl: true,
        buffer: new Uint8Array([14]),
      }),
    );
    harness.app.tui.emit(
      "keyPress",
      createTestKeyPress("?", {
        buffer: new TextEncoder().encode("?"),
      }),
    );
    harness.app.tui.emit(
      "keyPress",
      createTestKeyPress("m", {
        meta: true,
        buffer: new TextEncoder().encode("m"),
      }),
    );
    await mounted.whenIdle();

    assertEquals(controller.helpVisible.peek(), true);
    assertEquals(
      mounted.windowProjection.peek().shelf.some((item) => item.id === terminalWindowId),
      false,
    );
    assertEquals(client.inputs, []);

    harness.app.tui.emit("keyPress", createTestKeyPress("escape"));
    harness.app.tui.emit(
      "keyPress",
      createTestKeyPress("a", {
        buffer: new TextEncoder().encode("a"),
      }),
    );
    await mounted.whenIdle();

    assertEquals(controller.helpVisible.peek(), false);
    assertEquals(client.inputs, [{ sessionId: initial.id, data: "a" }]);

    controller.openHelp();
    harness.app.tui.emit("keyPress", createTestKeyPress("escape"));
    harness.app.tui.emit("paste", {
      key: "paste",
      text: "ordered paste",
      buffer: new TextEncoder().encode("ordered paste"),
    });
    await mounted.whenIdle();
    assertEquals(controller.helpVisible.peek(), false);
    assertEquals(client.inputs.at(-1), { sessionId: initial.id, data: "ordered paste" });

    const largePrefixPaste = {
      key: "paste" as const,
      text: "p".repeat(EXOMUX_PROTOCOL_LIMITS.inputBytes * 2),
      buffer: new Uint8Array(),
    };
    largePrefixPaste.buffer = new TextEncoder().encode(largePrefixPaste.text);
    const prefixPasteStart = client.inputs.length;
    harness.app.tui.emit(
      "keyPress",
      createTestKeyPress("n", {
        ctrl: true,
        buffer: new Uint8Array([14]),
      }),
    );
    harness.app.tui.emit("paste", largePrefixPaste);
    await mounted.whenIdle();
    assertEquals(controller.prefixPending.peek(), false);
    const prefixPasteChunks = client.inputs.slice(prefixPasteStart);
    assert(prefixPasteChunks.length >= 2);
    assert(
      prefixPasteChunks.every((input) =>
        new TextEncoder().encode(input.data).byteLength <= EXOMUX_PROTOCOL_LIMITS.inputBytes
      ),
    );
    assertEquals(
      prefixPasteChunks.map((input) => input.data).join(""),
      new TextDecoder().decode(encodeTerminalPaste(largePrefixPaste)),
    );

    const oversizedPaste = {
      key: "paste" as const,
      text: "z".repeat(EXOMUX_PROTOCOL_LIMITS.inputBytes * 4 + 1),
      buffer: new Uint8Array(),
    };
    oversizedPaste.buffer = new TextEncoder().encode(oversizedPaste.text);
    const inputCountBeforeOversizedPaste = client.inputs.length;
    harness.app.tui.emit(
      "keyPress",
      createTestKeyPress("n", {
        ctrl: true,
        buffer: new Uint8Array([14]),
      }),
    );
    harness.app.tui.emit("paste", oversizedPaste);
    await mounted.whenIdle();
    assertEquals(controller.prefixPending.peek(), false);
    assertEquals(client.inputs.length, inputCountBeforeOversizedPaste);
    assertStringIncludes(controller.status.peek(), "raw input buffer limit exceeded");

    const inputCountBeforeModalPaste = client.inputs.length;
    harness.app.tui.emit(
      "keyPress",
      createTestKeyPress("n", {
        ctrl: true,
        buffer: new Uint8Array([14]),
      }),
    );
    harness.app.tui.emit(
      "keyPress",
      createTestKeyPress("?", {
        buffer: new TextEncoder().encode("?"),
      }),
    );
    harness.app.tui.emit("paste", {
      key: "paste",
      text: "blocked by help",
      buffer: new TextEncoder().encode("blocked by help"),
    });
    await mounted.whenIdle();
    assertEquals(controller.helpVisible.peek(), true);
    assertEquals(client.inputs.length, inputCountBeforeModalPaste);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux coalesced pointer callers share completion and disposal settles pending work", async () => {
  const initial = session("pointer-lifecycle", "pointer lifecycle", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({
    ...headlessOptions,
    size: { columns: 80, rows: 24 },
  });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    let releaseFirstBarrier!: () => void;
    let markFirstBarrierStarted!: () => void;
    const firstBarrierStarted = new Promise<void>((resolve) => markFirstBarrierStarted = resolve);
    const firstBarrier = mounted.enqueue(() => {
      markFirstBarrierStarted();
      return new Promise<void>((resolve) => releaseFirstBarrier = resolve);
    });
    await firstBarrierStarted;
    const firstMove = mounted.handlePointer(touchPointer("move", 0, 0, 1, 90));
    const coalescedMove = mounted.handlePointer(touchPointer("move", 1, 0, 2, 90));
    assert(firstMove === coalescedMove);
    releaseFirstBarrier();
    await firstBarrier;
    assertEquals(await firstMove, false);
    assertEquals(await coalescedMove, false);

    let releaseDisposeBarrier!: () => void;
    let markDisposeBarrierStarted!: () => void;
    const disposeBarrierStarted = new Promise<void>((resolve) => markDisposeBarrierStarted = resolve);
    const disposeBarrier = mounted.enqueue(() => {
      markDisposeBarrierStarted();
      return new Promise<void>((resolve) => releaseDisposeBarrier = resolve);
    });
    await disposeBarrierStarted;
    const pendingMove = mounted.handlePointer(touchPointer("move", 0, 0, 3, 91));
    mounted.dispose();
    releaseDisposeBarrier();
    await disposeBarrier;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      pendingMove,
      new Promise<"timeout">((resolve) => timeoutId = setTimeout(() => resolve("timeout"), 100)),
    ]);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    assertEquals(outcome, false);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux translates wheel into cursor keys for alternate-screen apps without mouse tracking", async () => {
  const initial = session("alt-screen", "alt screen", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(initial.id) }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const runtime = controller.runtime(initial.id)!;
    client.emitOutput({ sessionId: initial.id, sequence: 1, data: "\x1b[?1049h" });
    await waitForCondition(() => runtime.screen.inspect().alternate, 2_000);

    const terminal = mounted.windowProjection.peek().windows.find(
      (window) => window.id === exomuxWindowId(initial.id),
    );
    assert(terminal);
    const wheelX = terminal.clientRect.column + 2;
    const wheelY = terminal.clientRect.row + 2;
    assertEquals((await harness.pilot.scroll(-1, wheelX, wheelY)).handled, true);
    await mounted.whenIdle();
    assertEquals(runtime.scrollback.inspect().mode, "live");
    // One row per wheel notch is the default scroll speed.
    assertEquals(client.inputs, [{ sessionId: initial.id, data: "\x1b[A" }]);

    client.inputs.length = 0;
    client.emitOutput({ sessionId: initial.id, sequence: 2, data: "\x1b[?1h" });
    await waitForCondition(() => runtime.screen.inspect().privateModes.includes(1), 2_000);
    assertEquals((await harness.pilot.scroll(1, wheelX, wheelY)).handled, true);
    await mounted.whenIdle();
    assertEquals(runtime.scrollback.inspect().mode, "live");
    assertEquals(client.inputs, [{ sessionId: initial.id, data: "\x1bOB" }]);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux quit control cancels, detaches, and terminates from the end-session modal", async () => {
  const initial = session("quit-shell", "quit shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const bounds = harness.app.tui.rectangle.peek();
    const quitX = bounds.column + bounds.width - 3;

    assertEquals((await harness.pilot.click(quitX, 0)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.quitModalVisible.peek(), true);
    await harness.pilot.press("escape");
    await mounted.whenIdle();
    assertEquals(controller.quitModalVisible.peek(), false);

    let destroyed = false;
    harness.app.tui.on("destroy", () => {
      destroyed = true;
    });
    assertEquals((await harness.pilot.click(quitX, 0)).press.handled, true);
    await mounted.whenIdle();
    const layout = exomuxQuitLayout(mounted.windowProjection.peek().bounds);
    assertEquals(
      (await harness.pilot.click(layout.detachRect.column + 1, layout.detachRect.row)).press.handled,
      true,
    );
    await waitForCondition(() => destroyed, 2_000);
    assertEquals(client.shutdownCalls, 0);
    assertEquals(controller.quitModalVisible.peek(), false);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux quit modal terminate shuts down the detached host before exiting", async () => {
  const initial = session("terminate-shell", "terminate shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    let destroyed = false;
    harness.app.tui.on("destroy", () => {
      destroyed = true;
    });
    const bounds = harness.app.tui.rectangle.peek();
    assertEquals((await harness.pilot.click(bounds.column + bounds.width - 3, 0)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.quitModalVisible.peek(), true);
    await harness.pilot.press("t");
    await waitForCondition(() => destroyed && client.shutdownCalls === 1, 2_000);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux network panel renders as a composited Tree with status colours", async () => {
  const initial = session("nettree-shell", "net shell", 0);
  const client = new FakeExomuxClient([initial]);
  const tailnetResult: TailnetStatusResult = {
    availability: "available",
    detail: "tailscale is running",
    snapshot: {
      backendState: "Running",
      devices: [
        {
          id: "self",
          shortName: "workshop",
          dnsName: "workshop.tail.net",
          os: "linux",
          online: true,
          self: true,
          relayed: false,
          tags: [],
          ipv4: "100.64.0.1",
        },
        {
          id: "peer-off",
          shortName: "cellar",
          dnsName: "cellar.tail.net",
          os: "linux",
          online: false,
          self: false,
          relayed: false,
          tags: [],
        },
      ],
      capturedAt: 1,
    },
  };
  const controller = await createExomuxController({
    client,
    initialSessions: [initial],
    tailnetSource: { fetchStatus: () => Promise.resolve(tailnetResult) },
    tailnetPollIntervalMs: 300_000,
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    // The floating sessions manager would overlap the left-docked panel.
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    await clickStartMenuItem(harness, mounted, "network");
    await mounted.whenIdle();
    await waitForCondition(
      () => controller.networkTree.visibleRows().some((row) => row.id === "dev:peer-off"),
      2_000,
    );
    const panel = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_NETWORK_WINDOW_ID);
    assert(panel);
    const theme = controller.theme.peek();
    const cellText = (column: number, row: number): string => {
      const value = harness.canvas.frameBuffer[row]?.[column] ?? "";
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    };
    const plainRow = (offset: number): string => {
      let text = "";
      for (let column = 0; column < panel.clientRect.width; column += 1) {
        text += stripAnsi(cellText(panel.clientRect.column + column, panel.clientRect.row + 1 + offset));
      }
      return text;
    };
    // The composited Tree puts the selection marker in the panel's first
    // column (the hand-drawn fallback has none); pump settle until the real
    // snapshot lands — the harness has no free-running render loop.
    const selectedRowY = panel.clientRect.row + 1;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (stripAnsi(cellText(panel.clientRect.column, selectedRowY)).includes(">")) break;
      await harness.pilot.settle();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assertStringIncludes(stripAnsi(cellText(panel.clientRect.column, selectedRowY)), ">");
    assertStringIncludes(plainRow(0), "HOSTS");

    // The offline device's row recedes to the muted tone through the Tree's
    // rowStyle; its status flag rides the controller-built TreeNode itself.
    const rows = controller.networkTree.visibleRows();
    const offlineIndex = rows.findIndex((row) => row.id === "dev:peer-off");
    assert(offlineIndex >= 0);
    assertEquals(rows[offlineIndex]!.node.status, "offline");
    const offlineText = plainRow(offlineIndex);
    assertStringIncludes(offlineText, "cellar");
    const glyphColumn = offlineText.search(/\S/);
    assertStringIncludes(
      cellText(panel.clientRect.column + glyphColumn, panel.clientRect.row + 1 + offlineIndex),
      `38;2;${theme.muted.join(";")}`,
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux network panel lists hosts and tailnet devices, opens SSH, and forgets hosts", async () => {
  const initial = session("net-shell", "net shell", 0);
  const client = new FakeExomuxClient([initial]);
  const tailnetResult: TailnetStatusResult = {
    availability: "available",
    detail: "tailscale is running",
    snapshot: {
      backendState: "Running",
      devices: [
        {
          id: "self",
          shortName: "workshop",
          dnsName: "workshop.tail.net",
          os: "linux",
          online: true,
          self: true,
          relayed: false,
          tags: [],
          ipv4: "100.64.0.1",
        },
        {
          id: "peer-1",
          shortName: "studio",
          dnsName: "studio.tail.net",
          os: "linux",
          online: true,
          self: false,
          relayed: false,
          tags: [],
        },
      ],
      capturedAt: 1,
    },
  };
  const controller = await createExomuxController({
    client,
    initialSessions: [initial],
    tailnetSource: { fetchStatus: () => Promise.resolve(tailnetResult) },
    tailnetPollIntervalMs: 300_000,
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    await clickStartMenuItem(harness, mounted, "network");
    await mounted.whenIdle();
    assertEquals(
      controller.windowHost.controller.inspect().activeWindowId,
      EXOMUX_NETWORK_WINDOW_ID,
    );
    await waitForCondition(() => controller.networkStatus.peek() !== undefined, 2_000);
    await waitForCondition(
      () => controller.networkTree.visibleRows().some((row) => row.id === "dev:peer-1"),
      2_000,
    );

    for (let step = 0; step < 4; step += 1) await harness.pilot.press("down");
    assertEquals(controller.networkTree.selected()?.id, "dev:peer-1");
    await harness.pilot.press("right");
    await harness.pilot.press("down");
    assertEquals(controller.networkTree.selected()?.id, "act:shell:peer-1");
    await harness.pilot.press("return");
    await waitForCondition(() => client.spawned.length === 1, 2_000);
    assertEquals(client.spawned[0]!.command, "ssh");
    assertEquals(client.spawned[0]!.args, ["studio.tail.net"]);
    assertEquals(client.spawned[0]!.title, "studio");
    assertEquals(controller.savedHosts.peek(), ["studio.tail.net"]);

    controller.windowHost.execute(
      { kind: "focus", id: EXOMUX_NETWORK_WINDOW_ID },
      mounted.bodyRect.peek(),
    );
    await waitForCondition(
      () => controller.networkTree.visibleRows().some((row) => row.id === "host:studio.tail.net"),
      2_000,
    );

    assertEquals(controller.sessionHosts.peek()["spawned-1"], "studio.tail.net");
    controller.networkTree.setExpanded("host:studio.tail.net", true);
    await waitForCondition(
      () => controller.networkTree.visibleRows().some((row) => row.id === "ses:spawned-1"),
      2_000,
    );
    controller.networkTree.setSelectedIndex(
      controller.networkTree.visibleRows().findIndex((row) => row.id === "ses:spawned-1"),
    );
    await harness.pilot.press("return");
    await mounted.whenIdle();
    assertEquals(
      controller.windowHost.controller.inspect().activeWindowId,
      exomuxWindowId("spawned-1"),
    );

    controller.windowHost.execute(
      { kind: "focus", id: EXOMUX_NETWORK_WINDOW_ID },
      mounted.bodyRect.peek(),
    );
    controller.networkTree.setSelectedIndex(
      controller.networkTree.visibleRows().findIndex((row) => row.id === "host:studio.tail.net"),
    );
    await harness.pilot.press("delete");
    await mounted.whenIdle();
    assertEquals(controller.savedHosts.peek(), []);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux paste of a local file path onto an SSH shell offers and runs scp", async () => {
  const initial = session("scp-shell", "scp shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({
    client,
    initialSessions: [initial],
    tailnetSource: {
      fetchStatus: () => Promise.resolve({ availability: "unavailable", detail: "off" } as TailnetStatusResult),
    },
    tailnetPollIntervalMs: 300_000,
    statFile: (path) => Promise.resolve(path === "/tmp/report.pdf"),
    scpCwdTimeoutMs: 60,
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.sessionHosts.value = Object.freeze({ [initial.id]: "studio.tail.net" });
    controller.windowHost.execute(
      { kind: "focus", id: exomuxWindowId(initial.id) },
      mounted.bodyRect.peek(),
    );

    harness.app.tui.emit("paste", { key: "paste", text: "/tmp/report.pdf", buffer: new Uint8Array() });
    await waitForCondition(() => controller.pendingScp.peek() !== undefined, 2_000);
    assertEquals(controller.pendingScp.peek()!.target, "studio.tail.net");
    // A typed password fills the masked field.
    await harness.pilot.press("h");
    await harness.pilot.press("i");
    assertEquals(controller.pendingScp.peek()!.password, "hi");
    // Send spawns a dedicated scp terminal window showing progress.
    await harness.pilot.press("return");
    await waitForCondition(() => client.spawned.some((options) => options.command === "scp"), 2_000);
    const scpSpawn = client.spawned.find((options) => options.command === "scp")!;
    assertEquals(scpSpawn.args, [
      "-o",
      "StrictHostKeyChecking=accept-new",
      "--",
      "/tmp/report.pdf",
      "studio.tail.net:",
    ]);
    assertEquals(scpSpawn.title, "scp report.pdf");
    assertEquals(controller.pendingScp.peek(), undefined);
    // The typed password is injected once scp prompts in that window.
    const scpSessionId = client.listSnapshot().find((s) => s.commandLine === "scp")!.id;
    client.emitOutput({ sessionId: scpSessionId, sequence: 1, data: "cos@studio's password: " });
    await waitForCondition(
      () => client.inputs.some((input) => input.sessionId === scpSessionId && input.data === "hi\r"),
      2_000,
    );

    // The "Paste path" button forwards the literal text and skips scp.
    controller.windowHost.execute(
      { kind: "focus", id: exomuxWindowId(initial.id) },
      mounted.bodyRect.peek(),
    );
    harness.app.tui.emit("paste", { key: "paste", text: "/tmp/report.pdf", buffer: new Uint8Array() });
    await waitForCondition(() => controller.pendingScp.peek() !== undefined, 2_000);
    const pasteRect = exomuxScpLayout(mounted.windowProjection.peek().bounds).pasteRect;
    await harness.pilot.click(pasteRect.column + 1, pasteRect.row);
    await mounted.whenIdle();
    assertEquals(controller.pendingScp.peek(), undefined);
    assertEquals(client.inputs.at(-1), { sessionId: initial.id, data: "/tmp/report.pdf" });

    harness.app.tui.emit("paste", { key: "paste", text: "plain text, not a path", buffer: new Uint8Array() });
    await mounted.whenIdle();
    assertEquals(controller.pendingScp.peek(), undefined);
    assertEquals(client.inputs.at(-1), { sessionId: initial.id, data: "plain text, not a path" });

    harness.app.tui.emit("paste", { key: "paste", text: "/tmp/missing.pdf", buffer: new Uint8Array() });
    await mounted.whenIdle();
    assertEquals(controller.pendingScp.peek(), undefined);
    assertEquals(client.inputs.at(-1), { sessionId: initial.id, data: "/tmp/missing.pdf" });
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux scp capture runs pwd in the shell and targets the captured directory", async () => {
  const initial = session("cwd-shell", "cwd shell", 0, "ssh studio.tail.net");
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({
    client,
    initialSessions: [initial],
    tailnetSource: {
      fetchStatus: () => Promise.resolve({ availability: "unavailable", detail: "off" } as TailnetStatusResult),
    },
    tailnetPollIntervalMs: 300_000,
    statFile: () => Promise.resolve(true),
    scpCwdTimeoutMs: 2_000,
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    // The target derives from the session's own `ssh …` command line; no
    // network-panel mapping is seeded. The prompt must be visible so the
    // idle-prompt guard allows the probe.
    client.emitOutput({ sessionId: initial.id, sequence: 1, data: "user@studio:~$ " });
    controller.windowHost.execute(
      { kind: "focus", id: exomuxWindowId(initial.id) },
      mounted.bodyRect.peek(),
    );
    await waitForCondition(() => controller.runtime(initial.id)!.lastSequence === 1, 2_000);

    harness.app.tui.emit("paste", { key: "paste", text: "/tmp/report.pdf", buffer: new Uint8Array() });
    await waitForCondition(() => controller.pendingScp.peek() !== undefined, 2_000);
    assertEquals(controller.pendingScp.peek()!.remoteDir, undefined);
    await waitForCondition(
      () => client.inputs.some((input) => input.sessionId === initial.id && input.data === " pwd\r"),
      2_000,
    );
    client.emitOutput({
      sessionId: initial.id,
      sequence: 2,
      data: " pwd\r\n\x1b[32m/home/cos/projects\x1b[0m\r\nuser@studio:~$ ",
    });
    await waitForCondition(() => controller.pendingScp.peek()?.remoteDir === "/home/cos/projects", 2_000);

    await harness.pilot.press("return");
    await waitForCondition(() => client.spawned.some((options) => options.command === "scp"), 2_000);
    const scpSpawn = client.spawned.find((options) => options.command === "scp")!;
    assertEquals(scpSpawn.args, [
      "-o",
      "StrictHostKeyChecking=accept-new",
      "--",
      "/tmp/report.pdf",
      "studio.tail.net:/home/cos/projects/",
    ]);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux workspace state round-trips saved hosts and rejects hostile entries", () => {
  const normalized = normalizeExomuxWorkspaceState({
    schemaVersion: 1,
    themeId: "midnight",
    terminalOrdinal: 3,
    savedHosts: ["studio.tail.net", "user@host-1", "-rm -rf /", "studio.tail.net", 42, "ok.example"],
  });
  assertEquals(normalized.savedHosts, ["studio.tail.net", "user@host-1", "ok.example"]);
  assertEquals(normalizeExomuxWorkspaceState(undefined).savedHosts, []);
  const withSessions = normalizeExomuxWorkspaceState({
    schemaVersion: 1,
    themeId: "midnight",
    terminalOrdinal: 1,
    savedHosts: [],
    sessionHosts: { "spawned-1": "studio.tail.net", "bad id!": "x", "spawned-2": "-rm" },
  });
  assertEquals(withSessions.sessionHosts, { "spawned-1": "studio.tail.net" });
  assertEquals(normalizeExomuxWorkspaceState(undefined).sessionHosts, {});
});

class FakeExomuxPointerSource implements ExomuxPointerInputSource {
  readonly #pointerListeners = new Set<(event: PointerInputEvent) => void | Promise<void>>();
  readonly #scrollListeners = new Set<(event: MouseScrollEvent) => void | Promise<void>>();

  on(type: "pointerInput", listener: (event: PointerInputEvent) => void | Promise<void>): () => void;
  on(type: "mouseScroll", listener: (event: MouseScrollEvent) => void | Promise<void>): () => void;
  on(
    type: "pointerInput" | "mouseScroll",
    listener:
      | ((event: PointerInputEvent) => void | Promise<void>)
      | ((event: MouseScrollEvent) => void | Promise<void>),
  ): () => void {
    if (type === "pointerInput") {
      const typed = listener as (event: PointerInputEvent) => void | Promise<void>;
      this.#pointerListeners.add(typed);
      return () => this.#pointerListeners.delete(typed);
    }
    const typed = listener as (event: MouseScrollEvent) => void | Promise<void>;
    this.#scrollListeners.add(typed);
    return () => this.#scrollListeners.delete(typed);
  }

  async emitPointer(event: PointerInputEvent): Promise<void> {
    for (const listener of this.#pointerListeners) await listener(event);
  }
}

/** Opens the start menu and clicks one command row, the way a user would. */
async function clickStartMenuItem(
  harness: {
    pilot: { click: (column: number, row: number) => Promise<unknown> };
    app: { tui: { rectangle: { peek: () => Rectangle } } };
  },
  mounted: { whenIdle: () => Promise<void> },
  id: string,
): Promise<void> {
  await harness.pilot.click(1, 0);
  await mounted.whenIdle();
  const layout = exomuxStartMenuLayout(harness.app.tui.rectangle.peek());
  const item = layout.items.find((candidate) => candidate.id === id)!;
  await harness.pilot.click(item.rect.column + 1, item.rect.row);
  await mounted.whenIdle();
}

async function waitForCondition(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(`Condition did not become true within ${timeoutMs} ms.`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function cycleToTheme(controller: ExomuxController, id: string): void {
  for (let attempt = 0; attempt < EXOMUX_THEMES.length; attempt += 1) {
    if (controller.themeId.peek() === id) return;
    controller.cycleTheme();
  }
  throw new Error(`Exomux theme was not found: ${id}`);
}

function canvasCell(value: unknown): string {
  return typeof value === "string"
    ? value
    : value instanceof Uint8Array
    ? new TextDecoder().decode(value)
    : String(value ?? "");
}

function helpClosePoint(bounds: { column: number; row: number; width: number; height: number }) {
  const width = Math.min(84, Math.max(24, bounds.width - 4));
  const height = Math.min(15, Math.max(3, bounds.height - 2));
  const column = bounds.column + Math.max(0, Math.floor((bounds.width - width) / 2));
  const row = bounds.row + Math.max(0, Math.floor((bounds.height - height) / 2));
  return {
    column: column + Math.max(1, width - 10),
    row: row + Math.max(1, height - 2),
  };
}

function killButtonPoints(bounds: { column: number; row: number; width: number; height: number }) {
  const width = Math.min(62, Math.max(24, bounds.width - 6));
  const height = Math.min(8, Math.max(3, bounds.height - 2));
  const column = bounds.column + Math.max(0, Math.floor((bounds.width - width) / 2));
  const row = bounds.row + Math.max(0, Math.floor((bounds.height - height) / 2));
  const buttonRow = row + Math.max(1, height - 2);
  return {
    cancel: { column: column + 2, row: buttonRow },
    confirm: { column: column + Math.max(13, width - 10), row: buttonRow },
  };
}

function touchPointer(
  kind: "down" | "move" | "up" | "cancel",
  column: number,
  row: number,
  sequence: number,
  pointerId = 41,
): PointerInputEvent {
  return {
    schemaVersion: POINTER_INPUT_SCHEMA_VERSION,
    sequence,
    timestamp: sequence,
    source: "browser",
    trust: "trusted",
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    pointerId,
    device: "touch",
    kind,
    coordinates: { cell: { space: "cell", x: column, y: row } },
    primary: true,
    button: null,
    buttons: kind === "up" || kind === "cancel" ? 0 : 1,
    pressure: kind === "up" || kind === "cancel" ? 0 : 0.5,
    contact: { width: 18, height: 18 },
  };
}

function touchPointerWithoutCell(kind: "up" | "cancel", sequence: number): PointerInputEvent {
  return {
    ...touchPointer(kind, 0, 0, sequence),
    coordinates: { screen: { space: "screen", x: 100, y: 100 } },
  };
}

function mousePointer(
  kind: "down" | "move" | "up" | "cancel",
  column: number,
  row: number,
  sequence: number,
  button: number | null = kind === "down" ? 0 : null,
): PointerInputEvent {
  return {
    schemaVersion: POINTER_INPUT_SCHEMA_VERSION,
    sequence,
    timestamp: sequence,
    source: "browser",
    trust: "trusted",
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    pointerId: 51,
    device: "mouse",
    kind,
    coordinates: { cell: { space: "cell", x: column, y: row } },
    primary: true,
    button,
    buttons: kind === "up" || kind === "cancel" ? 0 : button === 2 ? 2 : 1,
  };
}

function mouseHoverPointer(
  column: number,
  row: number,
  sequence: number,
  alt = false,
): PointerInputEvent {
  const event = mousePointer("move", column, row, sequence, null);
  return {
    ...event,
    pointerId: 52,
    modifiers: { ...event.modifiers, alt },
    buttons: 0,
  };
}

Deno.test("Exomux window settings cycle, normalize, and reject unknown values", () => {
  const defaults = defaultExomuxWindowSettings();
  assertEquals(defaults.themed, true);
  assertEquals(defaults.scrollbackLimit, 2_000);

  // Every spec cycles through its declared values and wraps in both directions.
  for (const spec of EXOMUX_WINDOW_SETTING_SPECS) {
    let settings = defaults;
    const seen: (boolean | number)[] = [];
    for (let step = 0; step < spec.values.length; step += 1) {
      settings = cycleExomuxWindowSetting(settings, spec.id, 1);
      seen.push(settings[spec.id]);
    }
    assertEquals(settings[spec.id], defaults[spec.id], `${spec.id} should return to its start`);
    assertEquals(new Set(seen).size, spec.values.length, `${spec.id} should visit every value`);
    const back = cycleExomuxWindowSetting(defaults, spec.id, -1);
    assertEquals(spec.values.includes(back[spec.id]), true);
  }

  // Persisted junk falls back to defaults per field rather than being trusted.
  const restored = normalizeExomuxWindowSettings({
    themed: false,
    scrollbackLimit: 999_999,
    mouseReporting: "yes",
    wheelLines: 5,
  });
  assertEquals(restored.themed, false);
  assertEquals(restored.scrollbackLimit, defaults.scrollbackLimit);
  assertEquals(restored.mouseReporting, defaults.mouseReporting);
  assertEquals(restored.wheelLines, 5);
  assertEquals(normalizeExomuxWindowSettings(null), defaults);
});

Deno.test("Exomux titlebar config button opens a per-window settings modal", async () => {
  const initial = session("cfg-shell", "cfg shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 30 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    // The terminal window carries a `config` control; the manager window does not.
    const projection = mounted.windowProjection.peek();
    const terminalWindow = projection.windows.find((w) => w.id === exomuxWindowId("cfg-shell"));
    assert(terminalWindow, "terminal window should be projected");
    const configControl = terminalWindow.controls.find((control) => control.kind === "config");
    assert(configControl, "terminal window should expose a config control");
    const managerWindow = projection.windows.find((w) => w.id === EXOMUX_SESSIONS_WINDOW_ID);
    assertEquals(managerWindow?.controls.some((control) => control.kind === "config"), false);

    // Clicking it opens the modal for that window.
    assertEquals(controller.configSessionId.peek(), undefined);
    await harness.pilot.click(configControl.hitRect.column, configControl.hitRect.row);
    await mounted.whenIdle();
    assertEquals(controller.configSessionId.peek(), "cfg-shell");

    // Theme colors is the first row; clicking it flips the setting off.
    const layout = exomuxWindowConfigLayout(mounted.windowProjection.peek().bounds);
    assertEquals(EXOMUX_WINDOW_SETTING_SPECS[0]!.id, "themed");
    const themedRow = layout.rowRects[0]!;
    await harness.pilot.click(themedRow.column + 2, themedRow.row);
    await mounted.whenIdle();
    assertEquals(controller.windowSettingsFor("cfg-shell").themed, false);

    // Scrollback cycles and reaches the live screen model.
    controller.configRowIndex.value = 1;
    assertEquals(EXOMUX_WINDOW_SETTING_SPECS[1]!.id, "scrollbackLimit");
    controller.cycleWindowSetting("cfg-shell", "scrollbackLimit", 1);
    const scrollbackLimit = controller.windowSettingsFor("cfg-shell").scrollbackLimit;
    assertNotEquals(scrollbackLimit, 2_000);
    assertEquals(controller.runtime("cfg-shell")?.screen.scrollbackLimit, scrollbackLimit);

    // Reset restores defaults, and Close dismisses the modal.
    await harness.pilot.click(layout.resetRect.column + 1, layout.resetRect.row);
    await mounted.whenIdle();
    assertEquals(controller.windowSettingsFor("cfg-shell"), defaultExomuxWindowSettings());
    await harness.pilot.click(layout.closeRect.column + 1, layout.closeRect.row);
    await mounted.whenIdle();
    assertEquals(controller.configSessionId.peek(), undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux window-config modal renders its value rows as composited controls", async () => {
  const initial = session("cfg-widgets", "cfg widgets", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 30 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const terminalWindow = mounted.windowProjection.peek().windows.find((w) => w.id === exomuxWindowId("cfg-widgets"));
    assert(terminalWindow);
    const configControl = terminalWindow.controls.find((control) => control.kind === "config");
    assert(configControl);
    await harness.pilot.click(configControl.hitRect.column, configControl.hitRect.row);
    await mounted.whenIdle();
    assertEquals(controller.configSessionId.peek(), "cfg-widgets");

    const layout = exomuxWindowConfigLayout(mounted.windowProjection.peek().bounds);
    const plainRow = (rect: Rectangle): string => {
      let text = "";
      for (let column = rect.column; column < rect.column + rect.width; column += 1) {
        const value = harness.canvas.frameBuffer[rect.row]?.[column] ?? "";
        text += stripAnsi(typeof value === "string" ? value : new TextDecoder().decode(value));
      }
      return text;
    };
    // The composited Cycler/CheckBox snapshot lands asynchronously; until then
    // the hand-drawn fallback fills the rows. Wait for the real controls.
    assertEquals(EXOMUX_WINDOW_SETTING_SPECS[0]!.id, "themed");
    assertEquals(EXOMUX_WINDOW_SETTING_SPECS[1]!.id, "scrollbackLimit");
    await waitForCondition(() => plainRow(layout.rowRects[1]!).includes("<"), 2_000);
    assertStringIncludes(plainRow(layout.rowRects[0]!), "✓"); // themed default on → checked CheckBox
    const scrollbackRow = plainRow(layout.rowRects[1]!);
    assertStringIncludes(scrollbackRow, "<"); // Cycler step affordances
    assertStringIncludes(scrollbackRow, ">");
    assertStringIncludes(scrollbackRow, "2,000 lines");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux window settings persist and drive scrollback on restore", async () => {
  const initial = session("persist-shell", "persist shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });

  try {
    controller.cycleWindowSetting("persist-shell", "themed", 1);
    controller.cycleWindowSetting("persist-shell", "scrollbackLimit", 1);
    const expected = controller.windowSettingsFor("persist-shell");
    assertEquals(expected.themed, false);

    const persisted = normalizeExomuxWorkspaceState(controller.kernel.appState.peek());
    assertEquals(persisted.windowSettings["persist-shell"], expected);
    assertEquals(controller.runtime("persist-shell")?.screen.scrollbackLimit, expected.scrollbackLimit);
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux confirm-on-close off kills a terminal without the prompt", async () => {
  const initial = session("quick-kill", "quick kill", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });

  try {
    // Default asks first.
    assertEquals(controller.requestKillSession("quick-kill"), true);
    assertEquals(controller.pendingKillSessionId.peek(), "quick-kill");
    controller.cancelKillSession();

    // With the prompt disabled the session terminates directly.
    controller.cycleWindowSetting("quick-kill", "confirmClose", 1);
    assertEquals(controller.windowSettingsFor("quick-kill").confirmClose, false);
    assertEquals(controller.requestKillSession("quick-kill"), true);
    assertEquals(controller.pendingKillSessionId.peek(), undefined);
    await waitForCondition(() => controller.runtime("quick-kill") === undefined, 2_000);
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux global config modal picks theme and background from select lists", async () => {
  const initial = session("global-cfg", "global cfg", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 34 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    // Settings opens from the start menu as a focused floating window.
    await clickStartMenuItem(harness, mounted, "config");
    assertEquals(controller.globalConfigVisible.peek(), true);
    assertEquals(controller.globalConfigPane.peek(), "theme");
    assertEquals(controller.windowHost.controller.inspect().activeWindowId, EXOMUX_SETTINGS_WINDOW_ID);

    const layoutFor = () =>
      exomuxGlobalConfigLayout(
        mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SETTINGS_WINDOW_ID)!
          .clientRect,
        Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === controller.themeId.peek())),
        Math.max(0, EXOMUX_BACKGROUND_IDS.indexOf(controller.backgroundId.peek())),
      );

    // Arrow keys walk the theme list and apply live.
    const themeBefore = controller.themeId.peek();
    await harness.pilot.press("down");
    await mounted.whenIdle();
    assertNotEquals(controller.themeId.peek(), themeBefore);
    await harness.pilot.press("up");
    await mounted.whenIdle();
    assertEquals(controller.themeId.peek(), themeBefore);

    // Tab moves to the background pane, where arrows drive that list instead.
    await harness.pilot.press("tab");
    await mounted.whenIdle();
    assertEquals(controller.globalConfigPane.peek(), "background");
    const backgroundBefore = controller.backgroundId.peek();
    await harness.pilot.press("down");
    await mounted.whenIdle();
    assertNotEquals(controller.backgroundId.peek(), backgroundBefore);
    assertEquals(controller.themeId.peek(), themeBefore);

    // Clicking a background row selects it directly.
    const jungleIndex = EXOMUX_BACKGROUND_IDS.indexOf("jungle");
    const jungleRow = layoutFor().backgroundRows.find((entry) => entry.index === jungleIndex)!;
    assertEquals((await harness.pilot.click(jungleRow.rect.column + 2, jungleRow.rect.row)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.backgroundId.peek(), "jungle");

    // Tab again reaches the options pane where left/right cycles values.
    await harness.pilot.press("tab");
    await mounted.whenIdle();
    assertEquals(controller.globalConfigPane.peek(), "options");
    assertEquals(controller.globalSettings.peek().overgrowInactive, true);
    await harness.pilot.press("right");
    await mounted.whenIdle();
    assertEquals(controller.globalSettings.peek().overgrowInactive, false);
    await harness.pilot.press("right");
    await mounted.whenIdle();
    assertEquals(controller.globalSettings.peek().overgrowInactive, true);

    // Overgrow time is the second option and clicking its row cycles it.
    assertEquals(EXOMUX_GLOBAL_SETTING_SPECS[1]!.id, "overgrowFullMs");
    const timeBefore = controller.globalSettings.peek().overgrowFullMs;
    const optionRow = layoutFor().optionRows[1]!;
    assertEquals((await harness.pilot.click(optionRow.column + 2, optionRow.row)).press.handled, true);
    await mounted.whenIdle();
    assertNotEquals(controller.globalSettings.peek().overgrowFullMs, timeBefore);

    // The arrows are not decoration: the `<` on the left steps the value back and
    // the `>` on the right steps it forward, so a left click then a right click
    // returns to where it started (before, a click stepped forward either side).
    const anchor = controller.globalSettings.peek().overgrowFullMs;
    await harness.pilot.click(optionRow.column + 1, optionRow.row);
    await mounted.whenIdle();
    const afterLeft = controller.globalSettings.peek().overgrowFullMs;
    assertNotEquals(afterLeft, anchor, "a left-half click changed the value");
    await harness.pilot.click(optionRow.column + optionRow.width - 1, optionRow.row);
    await mounted.whenIdle();
    assertEquals(
      controller.globalSettings.peek().overgrowFullMs,
      anchor,
      "left then right returns to the starting value",
    );

    // Settings persist with the workspace.
    const persisted = normalizeExomuxWorkspaceState(controller.kernel.appState.peek());
    assertEquals(persisted.globalSettings, controller.globalSettings.peek());
    assertEquals(persisted.backgroundId, "jungle");

    // Escape closes.
    await harness.pilot.press("escape");
    await mounted.whenIdle();
    assertEquals(controller.globalConfigVisible.peek(), false);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Scrolling a settings list routes to the list under the pointer, never the theme", async () => {
  const initial = session("scroll-settings", "shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 34 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    await clickStartMenuItem(harness, mounted, "config");
    assertEquals(controller.globalConfigVisible.peek(), true);
    // The active pane is "theme"; before, a wheel anywhere in settings cycled it.
    assertEquals(controller.globalConfigPane.peek(), "theme");

    const backgroundListRect = exomuxGlobalConfigLayout(
      mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SETTINGS_WINDOW_ID)!.clientRect,
      Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === controller.themeId.peek())),
      Math.max(0, EXOMUX_BACKGROUND_IDS.indexOf(controller.backgroundId.peek())),
    ).backgroundListRect;

    const themeBefore = controller.themeId.peek();
    const backgroundBefore = controller.backgroundId.peek();
    // Scroll with the pointer over the background list: it must touch neither the
    // theme (the reported bug) nor any selection.
    await mounted.handleScroll(createTestMouseScroll(1, {
      x: backgroundListRect.column + Math.floor(backgroundListRect.width / 2),
      y: backgroundListRect.row + Math.floor(backgroundListRect.height / 2),
    }));
    await mounted.whenIdle();
    assertEquals(controller.themeId.peek(), themeBefore, "scrolling the background list must not change the theme");
    assertEquals(controller.backgroundId.peek(), backgroundBefore, "scrolling must not change the selection");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux global settings normalize and reject unknown values", () => {
  const defaults = defaultExomuxGlobalSettings();
  assertEquals(defaults.overgrowInactive, true);
  assertEquals(normalizeExomuxGlobalSettings(null), defaults);
  assertEquals(normalizeExomuxGlobalSettings({ overgrowInactive: "yes" }), defaults);
  assertEquals(
    normalizeExomuxGlobalSettings({ overgrowInactive: false, overgrowFullMs: 30_000 }),
    {
      ...defaults,
      overgrowInactive: false,
      overgrowFullMs: 30_000,
    },
  );
  // Unlisted durations fall back rather than being trusted.
  assertEquals(normalizeExomuxGlobalSettings({ overgrowFullMs: 7 }).overgrowFullMs, defaults.overgrowFullMs);

  for (const spec of EXOMUX_GLOBAL_SETTING_SPECS) {
    let settings = defaults;
    for (let step = 0; step < spec.values.length; step += 1) {
      settings = cycleExomuxGlobalSetting(settings, spec.id, 1);
    }
    assertEquals(settings[spec.id], defaults[spec.id], `${spec.id} should wrap back to its start`);
  }
});

Deno.test("Exomux glyph columns classify single- and double-width characters", () => {
  for (const glyph of [" ", "a", "#", "~", "░", "▓", "█", "·", "･", "ﾊ", "─", "│", "✕"]) {
    assertEquals(exomuxGlyphColumns(glyph), 1, `${JSON.stringify(glyph)} should be one column`);
  }
  for (const glyph of ["日", "中", "ア", "・", "🙂"]) {
    assertEquals(exomuxGlyphColumns(glyph), 2, `${JSON.stringify(glyph)} should be two columns`);
  }
});

Deno.test("Exomux background glyph vocabularies stay single-width", async () => {
  // A double-width glyph in a background bleeds one column right. On a window's
  // left edge that lands inside the window, and because the canvas repaints
  // differentially the damage persists until a full repaint.
  // Discovered from disk so a new background is covered without editing this.
  // Resolved from this module rather than the working directory so the scan
  // follows the package instead of breaking whenever it is run from elsewhere.
  const packageDirectory = new URL("../", import.meta.url);
  const fields: string[] = [];
  for await (const entry of Deno.readDir(packageDirectory)) {
    if (entry.isFile && entry.name.endsWith("_background.ts")) fields.push(entry.name);
  }
  assert(fields.length >= 8, `expected the background catalog, found ${fields.length}`);
  for (const field of fields) {
    const source = await Deno.readTextFile(new URL(field, packageDirectory));
    const wide = new Set<string>();
    for (const glyph of source) {
      if (glyph.codePointAt(0)! >= 0x80 && exomuxGlyphColumns(glyph) === 2) wide.add(glyph);
    }
    assertEquals([...wide], [], `${field} must not contain double-width glyphs`);
  }
});

Deno.test("Exomux renders a character written over half a wide glyph", async () => {
  // Regression: the renderer used to re-derive wide-glyph pairing by measuring
  // the glyph, so a character written into the second column of a wide glyph was
  // mistaken for its continuation and skipped — it vanished from the window. The
  // screen model now erases the pair, and the renderer follows the model's mark.
  const initial = session("broken-pair", "broken pair", 1);
  const client = new FakeExomuxClient([initial], {
    "broken-pair": [{ sessionId: "broken-pair", sequence: 1, data: "\x1b[1;1H日本AB\x1b[1;2HX" }],
  });
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 32 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    const terminal = mounted.windowProjection.peek().windows.find(
      (window) => window.id === exomuxWindowId("broken-pair"),
    )!;
    const row = harness.canvas.frameBuffer[terminal.clientRect.row] ?? [];
    const start = terminal.clientRect.column;
    const charAt = (offset: number): string => {
      const value = row[start + offset];
      const text = typeof value === "string" ? value : value ? new TextDecoder().decode(value) : "";
      return stripAnsi(text);
    };

    // 日 was erased by the write into its second column, and the X is on screen.
    assertEquals(charAt(0), " ");
    assertEquals(charAt(1), "X");
    // The surviving pair still owns two columns, so what follows keeps its place.
    assertEquals(charAt(2), "本");
    assertEquals(charAt(3), "");
    assertEquals(charAt(4), "A");
    assertEquals(charAt(5), "B");

    let columns = 0;
    for (let offset = 0; offset < 6; offset += 1) {
      const glyph = charAt(offset);
      if (glyph !== "") columns += exomuxGlyphColumns(glyph);
    }
    assertEquals(columns, 6);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux pairs a wide terminal glyph with an empty follower cell", async () => {
  const initial = session("wide-shell", "wide shell", 1);
  const client = new FakeExomuxClient([initial], {
    "wide-shell": [{ sessionId: "wide-shell", sequence: 1, data: "\x1b[1;1H日本AB" }],
  });
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 32 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    const terminal = mounted.windowProjection.peek().windows.find(
      (window) => window.id === exomuxWindowId("wide-shell"),
    )!;
    const row = harness.canvas.frameBuffer[terminal.clientRect.row] ?? [];
    const start = terminal.clientRect.column;
    const charAt = (offset: number): string => {
      const value = row[start + offset];
      const text = typeof value === "string" ? value : value ? new TextDecoder().decode(value) : "";
      return stripAnsi(text);
    };

    // Each wide glyph owns two columns: the glyph then an empty follower, so the
    // ASCII after it still lands on its own column instead of being displaced.
    assertEquals(charAt(0), "日");
    assertEquals(charAt(1), "");
    assertEquals(charAt(2), "本");
    assertEquals(charAt(3), "");
    assertEquals(charAt(4), "A");
    assertEquals(charAt(5), "B");

    // Advertised columns match cells consumed, which is what keeps everything to
    // the right - including the neighbouring window's border - on its own column.
    let columns = 0;
    for (let offset = 0; offset < 6; offset += 1) {
      const glyph = charAt(offset);
      if (glyph !== "") columns += exomuxGlyphColumns(glyph);
    }
    assertEquals(columns, 6);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux overgrows every unselected window while an organic background runs", async () => {
  const first = session("grow-a", "grow a", 1);
  const second = session("grow-b", "grow b", 2);
  const client = new FakeExomuxClient([first, second]);
  const controller = await createExomuxController({ client, initialSessions: [first, second] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 32 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.setBackground("jungle");
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId("grow-a") }, mounted.bodyRect.peek());
    await mounted.whenIdle();

    harness.app.start();
    await waitForCondition(() => mounted.overgrowthRatios().size > 0, 3_000);

    // Every window except the focused one is reclaimed, the manager included.
    const active = controller.windowHost.controller.inspect().activeWindowId;
    const ratios = mounted.overgrowthRatios();
    assertEquals(ratios.has(active ?? ""), false, "the focused window must stay clear");
    for (const window of mounted.windowProjection.peek().windows) {
      if (window.id === active) continue;
      assert(ratios.has(window.id), `expected ${window.id} to overgrow while unfocused`);
      assert(ratios.get(window.id)! > 0);
    }

    // Focusing a reclaimed window resets it.
    const reclaimed = [...ratios.keys()].find((id) => id !== active)!;
    controller.windowHost.execute({ kind: "focus", id: reclaimed }, mounted.bodyRect.peek());
    await waitForCondition(() => !mounted.overgrowthRatios().has(reclaimed), 3_000);
    assertEquals(mounted.overgrowthRatios().has(reclaimed), false);

    // A background that does not overgrow retires every ratio.
    controller.setBackground("vaporwave");
    await waitForCondition(() => mounted.overgrowthRatios().size === 0, 3_000);
    assertEquals(mounted.overgrowthRatios().size, 0, "vaporwave must not overgrow windows");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux truncated attach wiggles the pty size so full-screen children repaint (resume fix)", async () => {
  // A long-running full-screen child (a nested exomux, vim, htop) overflows
  // the host's replay ring; on resume the retained tail cannot reconstruct its
  // screen and the window stays blank until the child repaints. The controller
  // must ask for that repaint the only way a pty allows: a real size change
  // and back (an unchanged TIOCSWINSZ raises no SIGWINCH).
  const initial = session("remote-exomux", "ssh host exomux", 7);
  const client = new FakeExomuxClient([initial]);
  client.truncateNextAttach = true;
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  try {
    await waitForCondition(() => client.resizes.length >= 2, 2_000);
    const [wiggle, settle] = client.resizes;
    assertEquals(wiggle!.sessionId, "remote-exomux");
    assertEquals(settle!.sessionId, "remote-exomux");
    assertEquals(wiggle!.columns, settle!.columns, "only the row count wiggles");
    assert(wiggle!.rows !== settle!.rows, "the wiggle size must actually differ");
    assert(Math.abs(wiggle!.rows - settle!.rows) === 1, "one row off, then the real geometry");
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux clean attach sends no repaint wiggle", async () => {
  const initial = session("clean-shell", "shell", 3);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  try {
    await waitForCondition(() => client.resizes.length >= 1, 2_000);
    // Give a hypothetical second (wiggle) resize a moment to appear; it must not.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rowSizes = client.resizes.map((entry) => entry.rows);
    assertEquals(new Set(rowSizes).size, 1, "every resize carries the real geometry, no wiggle");
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux retires a truncation warning instead of blocking a content row", async () => {
  const initial = session("warn-shell", "warn shell", 1);
  const client = new FakeExomuxClient([initial]);
  // The host reports a truncated replay, which used to pin a notice over the
  // bottom row of this window's content for the life of the session.
  client.truncateNextAttach = true;
  const controller = await createExomuxController({ client, initialSessions: [initial] });

  try {
    const runtime = controller.runtime("warn-shell");
    assert(runtime);
    await waitForCondition(() => runtime.warning.peek() !== undefined, 2_000);
    assertStringIncludes(runtime.warning.peek() ?? "", "Replay buffer was truncated");

    // It clears on demand rather than persisting.
    controller.clearWarning("warn-shell");
    assertEquals(runtime.warning.peek(), undefined);
    assert(EXOMUX_WARNING_TTL_MS > 0 && EXOMUX_WARNING_TTL_MS <= 30_000);
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux overgrowth never bleeds onto a window stacked above it", async () => {
  const under = session("under-win", "under", 1);
  const over = session("over-win", "over", 2);
  const client = new FakeExomuxClient([under, over], {
    // The focused window fills its view with a glyph the background never uses.
    "over-win": [{ sessionId: "over-win", sequence: 1, data: "\x1b[1;1H" + "X".repeat(200) }],
  });
  const controller = await createExomuxController({ client, initialSessions: [under, over] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 32 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const body = mounted.bodyRect.peek();
    controller.windowHost.execute({ kind: "minimize", id: EXOMUX_SESSIONS_WINDOW_ID }, body);
    controller.setBackground("jungle");
    // Two overlapping floating windows, the focused one on top.
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId("under-win"),
      placement: "floating",
      rect: { column: 2, row: 2, width: 50, height: 20 },
    }, body);
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId("over-win"),
      placement: "floating",
      rect: { column: 20, row: 6, width: 40, height: 14 },
    }, body);
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId("over-win") }, body);
    await mounted.whenIdle();

    harness.app.start();
    await waitForCondition(() => mounted.overgrowthRatios().has(exomuxWindowId("under-win")), 3_000);
    // Let the idle window reclaim a good share of itself.
    await new Promise((resolve) => setTimeout(resolve, 400));
    harness.app.tui.canvas.render();

    const projection = mounted.windowProjection.peek();
    const overWindow = projection.windows.find((window) => window.id === exomuxWindowId("over-win"))!;
    const underWindow = projection.windows.find((window) => window.id === exomuxWindowId("under-win"))!;
    // The focused window really is stacked above the idle one.
    const stack = [...projection.tiledWindows, ...projection.floatingWindows].map((window) => window.id);
    assert(
      stack.indexOf(overWindow.id) > stack.indexOf(underWindow.id),
      "the focused window should paint after the idle one",
    );

    // Every cell of the focused window that overlaps the reclaimed one still
    // shows its own content, not background creeping through from underneath.
    let checked = 0;
    for (let row = overWindow.clientRect.row; row < overWindow.clientRect.row + overWindow.clientRect.height; row++) {
      for (
        let column = overWindow.clientRect.column;
        column < overWindow.clientRect.column + overWindow.clientRect.width;
        column++
      ) {
        const insideUnder = column >= underWindow.clientRect.column &&
          column < underWindow.clientRect.column + underWindow.clientRect.width &&
          row >= underWindow.clientRect.row && row < underWindow.clientRect.row + underWindow.clientRect.height;
        if (!insideUnder) continue;
        const value = harness.canvas.frameBuffer[row]?.[column];
        const glyph = stripAnsi(typeof value === "string" ? value : "");
        assert(
          glyph === "X" || glyph === " " || glyph === "",
          `focused window cell at ${column},${row} was overgrown with ${JSON.stringify(glyph)}`,
        );
        checked += 1;
      }
    }
    assert(checked > 40, `expected a meaningful overlap to inspect, checked ${checked}`);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux fits text to terminal columns, not code units", async () => {
  const initial = session("fit-shell", "fit shell", 1);
  const client = new FakeExomuxClient([initial], {
    // A wide glyph on the final content column must not spill onto the border.
    "fit-shell": [{ sessionId: "fit-shell", sequence: 1, data: "\x1b[1;1H" + "-".repeat(200) }],
  });
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    // A CJK window title must be truncated by display width so it cannot run
    // past the title bar and over the window controls.
    controller.runtime("fit-shell")!.screen.write("\x1b]2;" + "日本語".repeat(20) + "\x07");
    await mounted.whenIdle();
    harness.app.tui.canvas.render();

    const terminal = mounted.windowProjection.peek().windows.find(
      (window) => window.id === exomuxWindowId("fit-shell"),
    )!;
    // Every control stays on its own column: nothing from the title overran it.
    for (const control of terminal.controls) {
      const value = harness.canvas.frameBuffer[control.rect.row]?.[control.rect.column];
      const glyph = stripAnsi(typeof value === "string" ? value : "");
      assertEquals(exomuxGlyphColumns(glyph || " "), 1, "controls must not be overrun by wide title text");
    }

    // The row's advertised columns never exceed the desktop width.
    const titleRow = harness.canvas.frameBuffer[terminal.titleBarRect.row] ?? [];
    let columns = 0;
    for (const value of titleRow) {
      const glyph = stripAnsi(typeof value === "string" ? value : "");
      if (glyph !== "") columns += exomuxGlyphColumns(glyph);
    }
    assertEquals(columns, harness.canvas.size.peek().columns);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux draws Zellij-style thin window borders by default and can switch style", async () => {
  // Every frame glyph must be single-width or it would shift the row underneath.
  for (const [id, glyphs] of Object.entries(EXOMUX_BORDER_STYLES)) {
    for (const [corner, glyph] of Object.entries(glyphs)) {
      assertEquals(exomuxGlyphColumns(glyph), 1, `${id}.${corner} must be one column`);
      assertEquals([...glyph].length, 1, `${id}.${corner} must be a single glyph`);
    }
  }
  assertEquals(defaultExomuxGlobalSettings().borderStyle, "thin");
  assertEquals(exomuxBorderGlyphs("nonsense").topLeft, EXOMUX_BORDER_STYLES.thin.topLeft);

  const initial = session("border-shell", "border shell", 1);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "minimize", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    harness.app.tui.canvas.render();

    const terminal = mounted.windowProjection.peek().windows.find(
      (window) => window.id === exomuxWindowId("border-shell"),
    )!;
    const glyphAt = (column: number, row: number): string => {
      const value = harness.canvas.frameBuffer[row]?.[column];
      return stripAnsi(typeof value === "string" ? value : "");
    };
    const rect = terminal.rect;
    const left = rect.column;
    const right = rect.column + rect.width - 1;
    const bottom = rect.row + rect.height - 1;

    // Default corners and sides come from the rounded thin vocabulary.
    const thin = EXOMUX_BORDER_STYLES.thin;
    assertEquals(glyphAt(left, bottom), thin.bottomLeft);
    assertEquals(glyphAt(right, bottom), thin.bottomRight);
    assertEquals(glyphAt(left, rect.row + 1), thin.left);
    assertEquals(glyphAt(right, rect.row + 1), thin.right);
    assertEquals(glyphAt(left + 1, bottom), thin.bottom);

    // Switching the setting repaints with the ASCII vocabulary instead.
    controller.cycleGlobalSetting("borderStyle", 1);
    controller.cycleGlobalSetting("borderStyle", 1);
    assertEquals(controller.globalSettings.peek().borderStyle, "ascii");
    await harness.pilot.settle();
    harness.app.tui.canvas.render();
    const ascii = EXOMUX_BORDER_STYLES.ascii;
    assertEquals(glyphAt(left, bottom), ascii.bottomLeft);
    assertEquals(glyphAt(left + 1, bottom), ascii.bottom);
    assertEquals(glyphAt(left, rect.row + 1), ascii.left);

    // The choice persists with the workspace.
    assertEquals(
      normalizeExomuxWorkspaceState(controller.kernel.appState.peek()).globalSettings.borderStyle,
      "ascii",
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux forwards wheel to a child that enabled mouse tracking", async () => {
  const initial = session("mouse-shell", "mouse shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(initial.id) }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const runtime = controller.runtime(initial.id)!;

    // Exactly what tmux sends on attach: alt screen plus SGR mouse tracking.
    client.emitOutput({
      sessionId: initial.id,
      sequence: 1,
      data: "\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h",
    });
    await waitForCondition(
      () => runtime.screen.inspect().alternate && runtime.screen.inspect().privateModes.includes(1006),
      2_000,
    );

    const terminal = mounted.windowProjection.peek().windows.find(
      (window) => window.id === exomuxWindowId(initial.id),
    )!;
    const wheelX = terminal.clientRect.column + 2;
    const wheelY = terminal.clientRect.row + 2;
    client.inputs.length = 0;
    assertEquals((await harness.pilot.scroll(-1, wheelX, wheelY)).handled, true);
    await mounted.whenIdle();

    const sent = client.inputs.map((input) => input.data).join("");
    // A real SGR wheel-up packet, not cursor keys and not local scrollback.
    assertStringIncludes(sent, "\x1b[<64;");
    assertEquals(runtime.scrollback.inspect().mode, "live");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux forwards clicks and drags to a child that enabled mouse tracking", async () => {
  const initial = session("click-shell", "click shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(initial.id) }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const runtime = controller.runtime(initial.id)!;
    client.emitOutput({
      sessionId: initial.id,
      sequence: 1,
      data: "\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h",
    });
    await waitForCondition(() => runtime.screen.inspect().privateModes.includes(1006), 2_000);

    const terminal = mounted.windowProjection.peek().windows.find(
      (window) => window.id === exomuxWindowId(initial.id),
    )!;
    const x = terminal.clientRect.column + 3;
    const y = terminal.clientRect.row + 4;
    client.inputs.length = 0;
    await harness.pilot.click(x, y);
    await mounted.whenIdle();
    const sent = client.inputs.map((input) => input.data).join("");
    // Press then release, addressed in the child's own coordinate space.
    assertStringIncludes(sent, "\x1b[<0;4;5M");
    assertStringIncludes(sent, "\x1b[<0;4;5m");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux stops forwarding the wheel when a window turns mouse reporting off", async () => {
  const initial = session("noreport-shell", "noreport shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(initial.id) }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const runtime = controller.runtime(initial.id)!;
    client.emitOutput({
      sessionId: initial.id,
      sequence: 1,
      data: "\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h",
    });
    await waitForCondition(() => runtime.screen.inspect().privateModes.includes(1006), 2_000);

    const terminal = mounted.windowProjection.peek().windows.find(
      (window) => window.id === exomuxWindowId(initial.id),
    )!;
    const wheelX = terminal.clientRect.column + 2;
    const wheelY = terminal.clientRect.row + 2;

    // Turning the per-window setting off stops mouse packets reaching the child,
    // which is exactly what "cannot scroll inside tmux" looks like.
    controller.cycleWindowSetting("noreport-shell", "mouseReporting", 1);
    assertEquals(controller.windowSettingsFor("noreport-shell").mouseReporting, false);

    // The window says so, so a dead-feeling mouse is explained rather than
    // looking like broken passthrough.
    await harness.pilot.settle();
    harness.app.tui.canvas.render();
    const titleRow = harness.canvas.frameBuffer[terminal.titleBarRect.row] ?? [];
    const title = titleRow.map((value) => stripAnsi(typeof value === "string" ? value : "")).join("");
    assertStringIncludes(title, "[NO MOUSE]");

    client.inputs.length = 0;
    await harness.pilot.scroll(-1, wheelX, wheelY);
    await mounted.whenIdle();
    const withoutReporting = client.inputs.map((input) => input.data).join("");
    assertEquals(withoutReporting.includes("\x1b[<"), false, "no mouse packet should reach the child");

    // Turning it back on restores passthrough.
    controller.cycleWindowSetting("noreport-shell", "mouseReporting", 1);
    assertEquals(controller.windowSettingsFor("noreport-shell").mouseReporting, true);
    client.inputs.length = 0;
    await harness.pilot.scroll(-1, wheelX, wheelY);
    await mounted.whenIdle();
    assertStringIncludes(client.inputs.map((input) => input.data).join(""), "\x1b[<64;");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux start menu holds every command and frees the bottom rows", async () => {
  const initial = session("start-shell", "start shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    // One header row and no footer: the desktop reaches the last row.
    const bounds = harness.app.tui.rectangle.peek();
    const body = mounted.bodyRect.peek();
    assertEquals(body.row, 1);
    assertEquals(body.row + body.height, bounds.height);

    // The taskbar shares the top row, to the right of the start button.
    const shelf = mounted.shelfBounds.peek();
    assertEquals(shelf.row, 0);
    assert(shelf.column >= START_BUTTON_WIDTH, "the taskbar must clear the start button");

    // Closed by default; the button toggles it.
    assertEquals(controller.startMenuVisible.peek(), false);
    assertEquals((await harness.pilot.click(1, 0)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), true);

    // Every former top-bar command is present, and it hangs below the top bar.
    const layout = exomuxStartMenuLayout(bounds);
    assertEquals(layout.items.map((item) => item.id), ["new", "network", "sessions", "config", "help", "quit"]);
    assertEquals(layout.panelRect.row, 1);
    assertEquals(layout.panelRect.column, 0);
    assertEquals(layout.items.find((item) => item.id === "quit")?.danger, true);

    // Clicking outside dismisses without running anything.
    const before = controller.sessions.peek().length;
    assertEquals((await harness.pilot.click(bounds.width - 20, bounds.height - 2)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), false);
    assertEquals(controller.sessions.peek().length, before);

    // A command row runs and closes the menu.
    await clickStartMenuItem(harness, mounted, "new");
    assertEquals(controller.startMenuVisible.peek(), false);
    assertEquals(controller.sessions.peek().length, before + 1);

    // Escape dismisses too.
    await harness.pilot.click(1, 0);
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), true);
    await harness.pilot.press("escape");
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), false);

    // Quit stays reachable in one click from the top-right.
    assertEquals((await harness.pilot.click(bounds.width - 3, 0)).press.handled, true);
    await mounted.whenIdle();
    assertEquals(controller.quitModalVisible.peek(), true);
    controller.cancelQuitModal();

    // The prefix cue rides on the start button now that the status bars are gone.
    await harness.pilot.press("n", { ctrl: true, buffer: new Uint8Array([14]) });
    await mounted.whenIdle();
    assertEquals(controller.prefixPending.peek(), true);
    harness.app.tui.canvas.render();
    const topRow = (harness.canvas.frameBuffer[0] ?? [])
      .map((value) => stripAnsi(typeof value === "string" ? value : "")).join("");
    assertStringIncludes(topRow, "PREFIX");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux pulls floating windows back on screen when the desktop shrinks", async () => {
  const initial = session("reflow-shell", "reflow shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 160, rows: 48 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const windowId = exomuxWindowId("reflow-shell");
    controller.windowHost.execute(
      {
        kind: "set-placement",
        id: windowId,
        placement: "floating",
        rect: { column: 120, row: 34, width: 36, height: 12 },
      },
      mounted.bodyRect.peek(),
    );
    await mounted.whenIdle();

    // Shrinking the terminal strands the window off the new viewport.
    harness.canvas.size.value = { columns: 80, rows: 24 };
    await mounted.whenIdle();

    const bounds = mounted.bodyRect.peek();
    const rect = controller.windowHost.controller.inspect().windows
      .find((window) => window.id === windowId)!.floatingRect!;
    assert(rect.column >= bounds.column, "left edge back on screen");
    assert(rect.row >= bounds.row, "top edge back on screen");
    assert(rect.column + rect.width <= bounds.column + bounds.width, "right edge back on screen");
    assert(rect.row + rect.height <= bounds.row + bounds.height, "bottom edge back on screen");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux fits a restored offscreen floating window at launch, before any resize", async () => {
  const initial = session("launch-shell", "launch shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const windowId = exomuxWindowId("launch-shell");
  // Simulate a layout persisted from a large terminal: park the window far off a
  // small screen before the desktop ever mounts.
  controller.windowHost.execute(
    {
      kind: "set-placement",
      id: windowId,
      placement: "floating",
      rect: { column: 130, row: 40, width: 36, height: 12 },
    },
    { column: 0, row: 1, width: 200, height: 60 },
  );

  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  // Launch small. The mount must fit the window without waiting for a resize.
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 80, rows: 24 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    const bounds = mounted.bodyRect.peek();
    const rect = controller.windowHost.controller.inspect().windows
      .find((window) => window.id === windowId)!.floatingRect!;
    assert(rect.column >= bounds.column, "left edge on screen at launch");
    assert(rect.row >= bounds.row, "top edge on screen at launch");
    assert(rect.column + rect.width <= bounds.column + bounds.width, "right edge on screen at launch");
    assert(rect.row + rect.height <= bounds.row + bounds.height, "bottom edge on screen at launch");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux modal layouts stay within a cramped desktop", () => {
  const within = (rect: Rectangle, bounds: Rectangle, label: string) => {
    assert(rect.column >= bounds.column, `${label}: left edge off screen`);
    assert(rect.row >= bounds.row, `${label}: top edge off screen`);
    assert(
      rect.column + rect.width <= bounds.column + bounds.width,
      `${label}: right edge off screen (${rect.column}+${rect.width} > ${bounds.width})`,
    );
    assert(
      rect.row + rect.height <= bounds.row + bounds.height,
      `${label}: bottom edge off screen (${rect.row}+${rect.height} > ${bounds.height})`,
    );
    assert(rect.width >= 1 && rect.height >= 1, `${label}: collapsed`);
  };

  // From a phone-narrow strip up to comfortably large, including sizes below
  // every modal's old minimum width.
  for (
    const size of [
      { width: 20, height: 6 },
      { width: 30, height: 8 },
      { width: 46, height: 10 },
      { width: 58, height: 12 },
      { width: 80, height: 24 },
      { width: 200, height: 60 },
    ]
  ) {
    const bounds = { column: 0, row: 1, ...size };
    const quit = exomuxQuitLayout(bounds);
    within(quit.rect, bounds, "quit");
    const quitButtons = [quit.cancelRect, quit.detachRect, quit.terminateRect];
    for (const button of quitButtons) within(button, bounds, "quit button");
    // Destructive buttons must never share a cell: a mis-hit would terminate.
    for (let a = 0; a < quitButtons.length; a += 1) {
      for (let b = a + 1; b < quitButtons.length; b += 1) {
        const first = quitButtons[a]!;
        const second = quitButtons[b]!;
        const disjoint = first.row !== second.row ||
          first.column + first.width <= second.column ||
          second.column + second.width <= first.column;
        assert(disjoint, `quit buttons ${a}/${b} overlap at ${size.width}x${size.height}`);
      }
    }

    const scp = exomuxScpLayout(bounds);
    within(scp.rect, bounds, "scp");

    const windowConfig = exomuxWindowConfigLayout(bounds);
    within(windowConfig.rect, bounds, "window config");
    within(windowConfig.closeRect, bounds, "window config close");

    const global = exomuxGlobalConfigLayout(bounds, 0, 0);
    within(global.rect, bounds, "global config");
    within(global.closeRect, bounds, "global config close");

    const start = exomuxStartMenuLayout(bounds);
    within(start.panelRect, bounds, "start menu");
  }
});

Deno.test("Exomux session panel header stays inside a narrow window", async () => {
  const initial = session("panel-shell", "a-very-long-session-title-that-would-overflow", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 90, rows: 26 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.openSessionManager(mounted.bodyRect.peek());
    await mounted.whenIdle();

    // Squeeze the manager window down so its header text would overflow if unclamped.
    controller.windowHost.execute(
      {
        kind: "set-placement",
        id: EXOMUX_SESSIONS_WINDOW_ID,
        placement: "floating",
        rect: { column: 2, row: 3, width: 20, height: 12 },
      },
      mounted.bodyRect.peek(),
    );
    await mounted.whenIdle();
    harness.app.tui.canvas.render();

    const panel = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID)!;
    const client_ = panel.clientRect;
    // Nothing the panel paints may cross its right border.
    const rightBorder = panel.rect.column + panel.rect.width - 1;
    for (let row = client_.row; row < client_.row + client_.height; row += 1) {
      const value = harness.canvas.frameBuffer[row]?.[rightBorder];
      const glyph = stripAnsi(typeof value === "string" ? value : "");
      const borderGlyphs = "│┃|+#"; // any frame vertical or ascii edge
      assert(
        glyph === " " || borderGlyphs.includes(glyph) || glyph === "",
        `panel text crossed the right border at row ${row}: ${JSON.stringify(glyph)}`,
      );
    }

    // The removed blurb is gone.
    const rows = harness.pilot.snapshot();
    assert(!rows.includes("survive UI exit"), "the survive-UI-exit blurb should be removed");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux routes Ctrl+C to the focused terminal and quits only without one", async () => {
  const initial = session("intr-shell", "intr shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(initial.id) }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    // The exomux app opts into full raw mode so the chord even reaches it.
    const appInput = createExomuxTerminalOptions(controller).input;
    assert(typeof appInput === "object" && appInput.captureKeyboardSignals === true);

    // With a running terminal focused, Ctrl+C is ETX to the child, not an exit.
    client.inputs.length = 0;
    await harness.pilot.press("c", { ctrl: true, buffer: new Uint8Array([3]) });
    await mounted.whenIdle();
    assertEquals(controller.quitModalVisible.peek(), false);
    assertEquals(client.inputs.length, 1);
    assertEquals(client.inputs[0]!.sessionId, initial.id);
    assertEquals(new TextEncoder().encode(client.inputs[0]!.data as string)[0], 3);

    // Once the child exits, the same chord opens the quit modal instead of
    // being silently swallowed.
    client.markExited(initial.id, 0);
    await mounted.whenIdle();
    client.inputs.length = 0;
    await harness.pilot.press("c", { ctrl: true, buffer: new Uint8Array([3]) });
    await mounted.whenIdle();
    assertEquals(controller.quitModalVisible.peek(), true);
    assertEquals(client.inputs.length, 0);
    controller.cancelQuitModal();
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

/** Background colour of one painted cell, read out of the frame buffer. */
function cellBackground(harness: { canvas: { frameBuffer: (string | Uint8Array)[][] } }, column: number, row: number) {
  const value = harness.canvas.frameBuffer[row]?.[column] ?? "";
  const text = typeof value === "string" ? value : new TextDecoder().decode(value);
  const match = /48;2;(\d+);(\d+);(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] as const : undefined;
}

Deno.test("Exomux paints the desktop background through a transparent terminal window", async () => {
  const shell = session("shell-1", "shell", 1);
  const client = new FakeExomuxClient([shell]);
  const controller = await createExomuxController({ client, initialSessions: [shell] });
  // These assertions snapshot exact cell colours, so pin the desktop opaque
  // rather than inheriting the translucent factory default.
  controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 1 };
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 32 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    // Biomech is deterministic and covers the whole desktop, so the window has
    // something to show through it at every cell rather than the sparse hits a
    // rain field would leave.
    controller.setBackground("biomech");
    harness.app.start();
    await mounted.whenIdle();

    const terminal = mounted.windowProjection.peek().windows.find((window) => window.id === exomuxWindowId("shell-1"));
    assert(terminal);
    const theme = controller.theme.peek();
    // Sampled inside the client rect, skipping anything another window is
    // floating over — the session manager sits on top of this one — so only
    // this terminal's own ground is measured.
    const others = mounted.windowProjection.peek().windows.filter((window) => window.id !== terminal.id);
    const covered = (column: number, row: number): boolean =>
      others.some((window) =>
        column >= window.rect.column && column < window.rect.column + window.rect.width &&
        row >= window.rect.row && row < window.rect.row + window.rect.height
      );
    const sample = (): (readonly number[] | undefined)[] => {
      const out: (readonly number[] | undefined)[] = [];
      const { column: left, row: top, width, height } = terminal.clientRect;
      for (let row = top + 1; row < top + height - 1; row += 1) {
        for (let column = left + 1; column < left + width - 1; column += 1) {
          if (covered(column, row)) continue;
          out.push(cellBackground(harness, column, row));
        }
      }
      return out;
    };

    // Pinned opaque above: client cells are the window surface, bar
    // the cursor, which paints the accent colour wherever it happens to sit.
    const opaque = sample().filter(Boolean);
    assert(opaque.length > 0, "the terminal client area should be painted");
    const opaqueColours = new Set(opaque.map((rgb) => String(rgb)));
    opaqueColours.delete(String([...theme.accent]));
    assertEquals(
      [...opaqueColours],
      [String([...theme.surface])],
      "an opaque window must not show the desktop",
    );

    // Turn the desktop translucent and the same cells pick up the background.
    // This also exercises the animation gate: a focal background stops
    // advancing once windows cover the desktop, and transparency is exactly
    // the case where it must keep going.
    while (controller.globalSettings.peek().opacity === 1) controller.cycleGlobalSetting("opacity");
    const opacity = controller.globalSettings.peek().opacity;
    assert(opacity < 1);
    await waitForCondition(() => mounted.metaballFrameRevision() > 2, 5_000);
    await waitForCondition(() => {
      const colours = new Set(sample().filter(Boolean).map((rgb) => String(rgb)));
      colours.delete(String([...theme.accent]));
      return colours.size > 1;
    }, 5_000);

    const translucent = sample().filter(Boolean);
    const distinct = new Set(translucent.map((rgb) => String(rgb)));
    assert(distinct.size > 1, `a transparent window should vary with the background, saw ${distinct.size} colours`);
    // Every cell still sits between the desktop background and the window
    // surface: transparency tints toward the backdrop, it does not invent
    // colours or blow past either end.
    for (const background of translucent) {
      for (let channel = 0; channel < 3; channel += 1) {
        const low = Math.min(theme.background[channel]!, theme.surface[channel]!) - 1;
        const high = Math.max(255, theme.surface[channel]!);
        assert(background![channel]! >= low && background![channel]! <= high, `channel ${channel} out of range`);
      }
    }

    // A window may opt back out on its own, independent of the desktop.
    while (controller.windowSettingsFor("shell-1").opacity !== 1) {
      controller.cycleWindowSetting("shell-1", "opacity");
    }
    const restored = new Set<string>();
    await waitForCondition(() => {
      restored.clear();
      for (const rgb of sample()) if (rgb) restored.add(String(rgb));
      restored.delete(String([...theme.accent]));
      return restored.size === 1 && restored.has(String([...theme.surface]));
    }, 3_000);
    assertEquals([...restored], [String([...theme.surface])], "an overridden window returns to opaque");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux shows the metaball desktop through a transparent window on the default background", async () => {
  const shell = session("shell-1", "shell", 1);
  const client = new FakeExomuxClient([shell]);
  const controller = await createExomuxController({ client, initialSessions: [shell] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 32 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    // The default background is the metaball field — no ExomuxAnimatedBackground.
    assertEquals(controller.backgroundId.peek(), "metaballs");
    while (controller.globalSettings.peek().opacity === 1) controller.cycleGlobalSetting("opacity");
    harness.app.start();
    await mounted.whenIdle();
    await waitForCondition(() => mounted.metaballFrameRevision() > 2, 5_000);

    const terminal = mounted.windowProjection.peek().windows.find((window) => window.id === exomuxWindowId("shell-1"));
    assert(terminal);
    const theme = controller.theme.peek();
    const others = mounted.windowProjection.peek().windows.filter((window) => window.id !== terminal.id);
    const covered = (column: number, row: number): boolean =>
      others.some((window) =>
        column >= window.rect.column && column < window.rect.column + window.rect.width &&
        row >= window.rect.row && row < window.rect.row + window.rect.height
      );
    const sample = (): string[] => {
      const out: string[] = [];
      const { column: left, row: top, width, height } = terminal.clientRect;
      for (let row = top + 1; row < top + height - 1; row += 1) {
        for (let column = left + 1; column < left + width - 1; column += 1) {
          if (covered(column, row)) continue;
          const rgb = cellBackground(harness, column, row);
          if (rgb) out.push(String(rgb));
        }
      }
      return out;
    };
    // The metaball glow varies across the client area; a flat theme background
    // (the pre-fix behaviour) would collapse to a single colour.
    await waitForCondition(() => {
      const colours = new Set(sample());
      colours.delete(String([...theme.accent]));
      return colours.size > 1;
    }, 5_000);
    const colours = new Set(sample());
    colours.delete(String([...theme.accent]));
    assert(colours.size > 1, `a transparent window must show the metaball desktop, saw ${colours.size} colours`);
    assert(!(colours.size === 1 && colours.has(String([...theme.background]))), "not a flat theme background");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux repaints on menu interaction even when a static image background stops animating", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-image-repaint-" });
  const imagePath = `${directory}/wallpaper.png`;
  try {
    await Deno.writeFile(imagePath, await tinyExomuxPng());
    const shell = session("shell-1", "shell", 1);
    const client = new FakeExomuxClient([shell]);
    const controller = await createExomuxController({ client, initialSessions: [shell] });
    const mount: ExomuxAppMountRef = {};
    const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
    const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });

    try {
      const mounted = mount.current;
      assert(mounted);
      await mounted.whenIdle();
      controller.setBackgroundImagePath(imagePath);
      controller.setBackground("image");
      harness.app.start();
      await mounted.whenIdle();

      // Let the static image settle: once it stops advancing, the background
      // no longer forces repaints on its own.
      const settled = mounted.metaballFrameRevision();
      await waitForCondition(() => mounted.metaballFrameRevision() > settled, 3_000).catch(() => undefined);
      const quiet = mounted.metaballFrameRevision();
      await new Promise((resolve) => setTimeout(resolve, 250));
      assertEquals(mounted.metaballFrameRevision(), quiet, "a loaded image must stop animating");

      // Opening the start menu must still repaint the desktop.
      const before = mounted.renderRevisionValue();
      controller.openStartMenu();
      await mounted.whenIdle();
      assertNotEquals(
        mounted.renderRevisionValue(),
        before,
        "menu state must invalidate the retained desktop under a static background",
      );
    } finally {
      harness.destroy();
      await controller.dispose();
    }
  } finally {
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
  }
});

async function tinyExomuxPng(): Promise<Uint8Array> {
  const width = 4;
  const height = 2;
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const at = row * (width * 3 + 1);
    raw[at] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[at + 1 + x * 3] = row === 0 ? 255 : 0;
      raw[at + 1 + x * 3 + 2] = row === 0 ? 0 : 255;
    }
  }
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

Deno.test("Exomux right-clicks the desktop to open the menu at the cursor", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    // A clear patch of desktop, away from the always-on-top panels: the
    // bottom-right corner, which no window covers with zero terminals open.
    const body = mounted.bodyRect.peek();
    const x = body.column + body.width - 6;
    const y = body.row + body.height - 4;
    const covered = mounted.windowProjection.peek().windows.some((window) =>
      window.state !== "minimized" && window.state !== "closed" &&
      x >= window.rect.column && x < window.rect.column + window.rect.width &&
      y >= window.rect.row && y < window.rect.row + window.rect.height
    );
    assert(!covered, "the test targets bare desktop");
    assertEquals(controller.startMenuVisible.peek(), false);
    assertEquals(
      (await harness.app.mouse.dispatch(createTestMousePress({ x, y, button: 2 }))).handled,
      true,
    );
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), true, "right-click opens the menu");

    // The menu is anchored under the cursor, not docked at the top-left.
    const layout = exomuxStartMenuLayout(harness.app.tui.rectangle.peek(), controller.startMenuAnchor.peek());
    assert(layout.panelRect.column > body.column, "the menu is anchored near the cursor, not the left edge");
    assert(layout.panelRect.row > body.row + 1, "the menu drops at the cursor row, not under the start button");
    // It stays fully on screen even anchored near the edge.
    assert(layout.panelRect.column + layout.panelRect.width <= body.column + body.width);
    assert(layout.panelRect.row + layout.panelRect.height <= body.row + body.height);

    // A left-click elsewhere dismisses it, clearing the anchor.
    assertEquals(
      (await harness.app.mouse.dispatch(createTestMousePress({ x: body.column + 1, y: body.row + 1 }))).handled,
      true,
    );
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), false);
    assertEquals(controller.startMenuAnchor.peek(), undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("exomuxStartMenuItems adds a favorite item below Settings over an active butterchurn", () => {
  // Off a butterchurn background, the menu is just the standard commands.
  const offButterchurn = exomuxStartMenuItems({
    startMenuPreset: { peek: () => undefined },
    backgroundId: { peek: () => "metaballs" },
    isButterchurnFavorite: () => false,
  } as unknown as ExomuxController);
  assert(!offButterchurn.some((item) => item.id === "favorite"), "no favorite item off a butterchurn background");

  // Over one, the favorite item sits directly below "Settings" (the config
  // command), and its box is empty for a preset not yet favorited.
  const unfavorited = exomuxStartMenuItems({
    startMenuPreset: { peek: () => "Some Preset" },
    backgroundId: { peek: () => "butterchurn" },
    isButterchurnFavorite: (_name: string) => false,
  } as unknown as ExomuxController);
  const ids = unfavorited.map((item) => item.id);
  const configAt = ids.indexOf("config");
  assert(configAt >= 0, "the Settings command is present");
  assertEquals(ids.slice(configAt, configAt + 2), ["config", "favorite"], "the favorite item follows Settings");
  const favItem = unfavorited.find((item) => item.id === "favorite");
  assert(favItem, "a favorite item is offered over a butterchurn background");
  assertStringIncludes(favItem!.label, "☐", "an unfavorited preset shows an empty box");

  // The box is checked when the showing preset is already a favorite, and the
  // software butterchurn is treated the same as the GPU one.
  const favorited = exomuxStartMenuItems({
    startMenuPreset: { peek: () => "Some Preset" },
    backgroundId: { peek: () => "butterchurn cpu" },
    isButterchurnFavorite: (name: string) => name === "Some Preset",
  } as unknown as ExomuxController);
  const checked = favorited.find((item) => item.id === "favorite");
  assertStringIncludes(checked!.label, "☑", "an already-favorited preset shows a checked box");
});

Deno.test("toggleButterchurnFavorite updates the list and persists it through onPreferencesChanged", async () => {
  const client = new FakeExomuxClient([]);
  const saved: ExomuxPreferences[] = [];
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    onPreferencesChanged: (preferences) => saved.push(preferences),
  });
  try {
    assertEquals(controller.butterchurnFavorites.peek(), []);
    assertEquals(controller.isButterchurnFavorite("Nebula"), false);

    assertEquals(controller.toggleButterchurnFavorite("Nebula"), true, "toggling on returns the new membership");
    assertEquals(controller.butterchurnFavorites.peek(), ["Nebula"]);
    assert(controller.isButterchurnFavorite("Nebula"));
    assert(
      saved.some((preferences) => preferences.butterchurnFavorites.includes("Nebula")),
      "the favorite is written out through onPreferencesChanged",
    );

    assertEquals(controller.toggleButterchurnFavorite("Nebula"), false, "toggling off returns the new membership");
    assertEquals(controller.butterchurnFavorites.peek(), []);
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux metaball gradient uses two high-contrast theme colours, no scanline banding", () => {
  for (const theme of EXOMUX_THEMES) {
    const spec = exomuxTheme(theme.id);
    const [center, edge] = exomuxMetaballGradientColors(spec);
    // The two ends are genuinely distinct — a real gradient, not one flat colour.
    const distance = Math.abs(center[0] - edge[0]) + Math.abs(center[1] - edge[1]) + Math.abs(center[2] - edge[2]);
    assert(distance > 30, `theme ${theme.id} gradient endpoints should contrast, saw distance ${distance}`);
    // Centre is the brighter end so blobs glow inward.
    const luma = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    assert(luma(center) >= luma(edge), `theme ${theme.id} centre should be at least as bright as the edge`);
    // The pair is vivid, not two near-greys: at least one end is saturated.
    const chroma = (c: readonly number[]) => Math.max(c[0]!, c[1]!, c[2]!) - Math.min(c[0]!, c[1]!, c[2]!);
    assert(
      Math.max(chroma(center), chroma(edge)) > 60,
      `theme ${theme.id} should pick a vivid colour, saw chroma ${chroma(center)}/${chroma(edge)}`,
    );
  }

  // T2's exemplar: hot pink centre, blue edge.
  const [t2Center, t2Edge] = exomuxMetaballGradientColors(exomuxTheme("t2"));
  assertEquals(t2Center, [255, 105, 180]);
  assertEquals(t2Edge, [30, 58, 112]);
});

Deno.test("Exomux renames the session from the settings window field", async () => {
  const renames: string[] = [];
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    initialSessionName: "main",
    onRenameSession: (name: string) => {
      renames.push(name);
      return Promise.resolve({ ok: true, name });
    },
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    assertEquals(controller.sessionName.peek(), "main");
    assert(controller.canRenameSession);

    await clickStartMenuItem(harness, mounted, "config");
    assertEquals(controller.globalConfigVisible.peek(), true);
    const clientRect = mounted.windowProjection.peek().windows.find(
      (window) => window.id === EXOMUX_SETTINGS_WINDOW_ID,
    )!.clientRect;
    const layout = exomuxGlobalConfigLayout(clientRect, 0, 0);

    // Click the session-name field to begin editing.
    assertEquals(
      (await harness.pilot.click(layout.sessionNameRect.column + 1, layout.sessionNameRect.row)).press.handled,
      true,
    );
    await mounted.whenIdle();
    assertEquals(controller.sessionNameDraft.peek(), "main");

    // Clear the seeded "main" and type a new name, then commit with Enter.
    const typeChar = (char: string) => harness.pilot.press(char as Key, { buffer: new TextEncoder().encode(char) });
    for (let i = 0; i < "main".length; i += 1) await harness.pilot.press("backspace");
    for (const char of "work") await typeChar(char);
    await mounted.whenIdle();
    assertEquals(controller.sessionNameDraft.peek(), "work");
    await harness.pilot.press("return");
    await mounted.whenIdle();

    assertEquals(renames, ["work"]);
    assertEquals(controller.sessionName.peek(), "work");
    assertEquals(controller.sessionNameDraft.peek(), undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux session rename is unavailable without a rename hook", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  try {
    assert(!controller.canRenameSession);
    controller.beginSessionRename();
    assertEquals(controller.sessionNameDraft.peek(), undefined, "editing does not start without a rename hook");
    const result = await controller.renameSession("work");
    assertEquals(result.ok, false);
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux shows CRT shader settings only under Ghostty and cycles them", async () => {
  const applied: string[] = [];
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    ghosttyDetected: true,
    onShadersChanged: (config) => {
      const on = (["scanline", "pincushion"] as const).filter((effect) => config.effects[effect].enabled);
      applied.push(on.length ? on.join("+") : "off");
    },
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 34 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    assert(controller.ghosttyDetected.peek());
    // Each effect has its own on/off row (scanline, pincushion, vhs); all off
    // by default, rendered as CheckBox controls.
    let rows = controller.shaderOptionRows();
    assertEquals(rows.length, 3);
    assertEquals(rows[0]!.value, "Off");
    assertEquals(rows[0]!.control.kind, "checkbox");
    assertEquals(rows[1]!.value, "Off");
    assertEquals(rows[2]!.value, "Off");

    // Toggle scanlines on: it reveals its parameter rows as `< value >` Cyclers.
    controller.cycleShaderRow("shader-toggle:scanline", 1);
    assertEquals(controller.shaderConfig.peek().effects.scanline.enabled, true);
    rows = controller.shaderOptionRows();
    assert(rows.length > 3, "scanline exposes its intensity parameters");
    const paramRow = rows.find((row) => row.id.startsWith("shader-param:scanline:"))!;
    assertEquals(paramRow.control.kind, "cycler");
    if (paramRow.control.kind === "cycler") {
      assert(paramRow.control.options.includes(paramRow.value), "the cycler's options include the current value");
      assertEquals(paramRow.control.options[paramRow.control.activeIndex], paramRow.value);
    }
    assertEquals(applied.at(-1), "scanline");

    // Nudge a parameter and confirm it changed and re-applied.
    const before = controller.shaderConfig.peek().effects.scanline.params.scanlineIntensity;
    controller.cycleShaderRow("shader-param:scanline:scanlineIntensity", 1);
    assert(controller.shaderConfig.peek().effects.scanline.params.scanlineIntensity !== before);

    // Enable pincushion too — more than one shader runs at once.
    controller.cycleShaderRow("shader-toggle:pincushion", 1);
    assertEquals(controller.shaderConfig.peek().effects.scanline.enabled, true);
    assertEquals(controller.shaderConfig.peek().effects.pincushion.enabled, true);
    assertEquals(applied.at(-1), "scanline+pincushion");

    // Toggle scanlines back off; pincushion stays on.
    controller.cycleShaderRow("shader-toggle:scanline", 1);
    assertEquals(controller.shaderConfig.peek().effects.scanline.enabled, false);
    assertEquals(controller.shaderConfig.peek().effects.pincushion.enabled, true);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux hides CRT shader settings when not in Ghostty", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  try {
    assert(!controller.ghosttyDetected.peek());
    assertEquals(controller.shaderOptionRows().length, 0);
    // Toggling is inert without Ghostty.
    controller.cycleShaderRow("shader-toggle:scanline", 1);
    assertEquals(controller.shaderConfig.peek().effects.scanline.enabled, false);
    // The shader manager (UX-009) is Ghostty-only too.
    assertEquals(controller.openShaderManager(), false);
    assertEquals(controller.addCustomShader("glow.glsl"), false);
    assertEquals(controller.shaderManagerVisible.peek(), false);
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux shader manager manages custom Ghostty shaders in order", async () => {
  const applied: string[][] = [];
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    ghosttyDetected: true,
    onShadersChanged: (config) => {
      applied.push(config.customShaders.map((entry) => `${entry.path}:${entry.enabled ? "on" : "off"}`));
    },
  });
  try {
    // The manager lists the built-in effect rows first, then the custom section.
    let rows = controller.shaderManagerRows();
    assertEquals(rows.length, 4); // 3 builtin toggles + the custom heading
    assertEquals(rows[3]!.kind, "note");
    // The settings pane no longer inlines shader rows — they moved here (UX-009).
    assertEquals(controller.settingsOptionCount(), EXOMUX_GLOBAL_SETTING_SPECS.length);

    assert(controller.openShaderManager());
    assertEquals(controller.shaderManagerVisible.peek(), true);

    // Add two custom entries; duplicates are refused.
    assert(controller.addCustomShader("~/shaders/glow.glsl"));
    assert(!controller.addCustomShader("~/shaders/glow.glsl"));
    assert(controller.addCustomShader("crt-extra.glsl"));
    rows = controller.shaderManagerRows();
    assertEquals(rows.length, 6);
    assertEquals(rows[4]!.kind, "custom");
    assertEquals(applied.at(-1), ["~/shaders/glow.glsl:on", "crt-extra.glsl:on"]);

    // Disable the second entry without removing it.
    controller.toggleCustomShader(1);
    assertEquals(applied.at(-1), ["~/shaders/glow.glsl:on", "crt-extra.glsl:off"]);
    assertEquals(controller.shaderManagerRows()[5]!.value, "Off");

    // Reorder: the chain order is exactly what Ghostty applies.
    controller.moveCustomShader(1, -1);
    assertEquals(applied.at(-1), ["crt-extra.glsl:off", "~/shaders/glow.glsl:on"]);
    controller.moveCustomShader(0, -1); // the top entry cannot move further
    assertEquals(applied.at(-1), ["crt-extra.glsl:off", "~/shaders/glow.glsl:on"]);

    // The selection skips the heading row between builtins and customs.
    controller.shaderManagerIndex.value = 2;
    controller.moveShaderManagerSelection(1);
    assertEquals(controller.shaderManagerIndex.peek(), 4);
    controller.moveShaderManagerSelection(-1);
    assertEquals(controller.shaderManagerIndex.peek(), 2);

    // The add-path draft round-trip trims and appends enabled.
    controller.beginAddCustomShader();
    assertEquals(controller.shaderPathDraft.peek(), "");
    controller.setShaderPathDraft("  vhs-extra.glsl  ");
    assert(controller.commitShaderPathDraft());
    assertEquals(controller.shaderPathDraft.peek(), undefined);
    assertEquals(controller.shaderConfig.peek().customShaders.at(-1)!.path, "vhs-extra.glsl");

    // Removing clamps the selection back into range.
    controller.shaderManagerIndex.value = controller.shaderManagerRows().length - 1;
    controller.removeCustomShader(2);
    assertEquals(controller.shaderConfig.peek().customShaders.length, 2);
    assert(controller.shaderManagerIndex.peek() < controller.shaderManagerRows().length);

    controller.closeShaderManager();
    assertEquals(controller.shaderManagerVisible.peek(), false);
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux opens the shader manager from settings and adds a shader by path", async () => {
  const applied: string[][] = [];
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    ghosttyDetected: true,
    onShadersChanged: (config) => {
      applied.push(config.customShaders.filter((entry) => entry.enabled).map((entry) => entry.path));
    },
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 34 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.openGlobalConfig();
    await mounted.whenIdle();

    // Under Ghostty the settings window carries a Shaders button; clicking it
    // opens the manager modal.
    const clientRect = mounted.windowProjection.peek().windows.find(
      (window) => window.id === EXOMUX_SETTINGS_WINDOW_ID,
    )!.clientRect;
    const settingsLayout = exomuxGlobalConfigLayout(clientRect, 0, 0);
    await harness.pilot.click(settingsLayout.shadersRect.column + 1, settingsLayout.shadersRect.row);
    await mounted.whenIdle();
    assertEquals(controller.shaderManagerVisible.peek(), true);

    // Enter toggles the selected builtin row (CRT scanlines).
    await harness.pilot.press("return");
    await mounted.whenIdle();
    assertEquals(controller.shaderConfig.peek().effects.scanline.enabled, true);

    // "a" opens the path prompt; typing + Enter adds the entry enabled.
    await harness.pilot.press("a");
    await mounted.whenIdle();
    assertEquals(controller.shaderPathDraft.peek(), "");
    const typeChar = (char: string) => harness.pilot.press(char as Key, { buffer: new TextEncoder().encode(char) });
    for (const char of "glow.glsl") await typeChar(char);
    await mounted.whenIdle();
    assertEquals(controller.shaderPathDraft.peek(), "glow.glsl");
    await harness.pilot.press("return");
    await mounted.whenIdle();
    assertEquals(controller.shaderPathDraft.peek(), undefined);
    assertEquals(controller.shaderConfig.peek().customShaders, [{ path: "glow.glsl", enabled: true }]);
    assertEquals(applied.at(-1), ["glow.glsl"]);

    // Del removes the selected custom entry (the commit selected it).
    const rows = controller.shaderManagerRows();
    assertEquals(rows[controller.shaderManagerIndex.peek()]!.kind, "custom");
    await harness.pilot.press("delete");
    await mounted.whenIdle();
    assertEquals(controller.shaderConfig.peek().customShaders.length, 0);

    // Escape closes the manager; settings stays open beneath it.
    await harness.pilot.press("escape");
    await mounted.whenIdle();
    assertEquals(controller.shaderManagerVisible.peek(), false);
    assertEquals(controller.globalConfigVisible.peek(), true);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux kill and quit modals arrow their actions like a real Modal", async () => {
  const initial = session("kill-arrows", "kill arrows", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();

    // Kill modal: the selection starts on the destructive default (Kill);
    // arrowing left to Cancel and pressing Enter must NOT kill the session.
    controller.requestKillSession("kill-arrows");
    await mounted.whenIdle();
    assertEquals(controller.pendingKillSessionId.peek(), "kill-arrows");
    await harness.pilot.press("left");
    await harness.pilot.press("return");
    await mounted.whenIdle();
    assertEquals(controller.pendingKillSessionId.peek(), undefined);
    assertEquals(client.killed.length, 0, "cancel must not kill");

    // Quit modal: default is Detach; arrow left to Cancel and Enter keeps the
    // app alive with the modal closed.
    controller.openQuitModal();
    await mounted.whenIdle();
    assertEquals(controller.quitModalVisible.peek(), true);
    await harness.pilot.press("left");
    await harness.pilot.press("return");
    await mounted.whenIdle();
    assertEquals(controller.quitModalVisible.peek(), false);
    assertEquals(client.shutdownCalls, 0, "cancel must not shut the host down");

    // Enter with no arrowing still confirms the kill (the default action).
    controller.requestKillSession("kill-arrows");
    await mounted.whenIdle();
    await harness.pilot.press("return");
    await waitForCondition(() => client.killed.length === 1, 2_000);
    assertEquals(client.killed, ["kill-arrows"]);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux start menu arrows its commands and renders the composited danger tone", async () => {
  const initial = session("menu-shell", "menu shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    await harness.pilot.click(1, 0);
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), true);

    // Arrow down to the second command and activate it with Enter.
    const items = exomuxStartMenuItems(controller);
    await harness.pilot.press("down");
    await harness.pilot.press("return");
    await mounted.whenIdle();
    assertEquals(controller.startMenuVisible.peek(), false);
    // The second entry is the settings command in the default menu.
    if (items[1]?.id === "config") {
      assertEquals(controller.globalConfigVisible.peek(), true);
      controller.closeGlobalConfig();
      await mounted.whenIdle();
    }

    // Reopen and wait for the composited ContextMenu: the danger Quit row
    // renders in the theme's danger tone through the real component.
    await harness.pilot.click(1, 0);
    await mounted.whenIdle();
    const theme = controller.theme.peek();
    const layout = exomuxStartMenuLayout(
      harness.app.tui.rectangle.peek(),
      controller.startMenuAnchor.peek(),
      exomuxStartMenuItems(controller),
    );
    const quit = layout.items.find((item) => item.id === "quit");
    assert(quit);
    const cellText = (column: number, row: number): string => {
      const value = harness.canvas.frameBuffer[row]?.[column] ?? "";
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    };
    // Pump settle until the composited snapshot lands (the marker column of the
    // selected first row is only painted by the real ContextMenu).
    const selectedRowY = layout.panelRect.row + 1;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (stripAnsi(cellText(layout.panelRect.column + 1, selectedRowY)).includes(">")) break;
      await harness.pilot.settle();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assertStringIncludes(stripAnsi(cellText(layout.panelRect.column + 1, selectedRowY)), ">");
    assertStringIncludes(
      cellText(quit.rect.column + 2, quit.rect.row),
      `38;2;${theme.danger.join(";")}`,
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux transparent windows show the windows beneath them, stacking per cell", async () => {
  const under = session("stack-under", "under", 0);
  const over = session("stack-over", "over", 1);
  const top = session("stack-top", "top", 2);
  // The lower terminal paints an explicit red block; explicit backgrounds stay
  // opaque and deposit their exact colour into the scene ground.
  const redRow = "\x1b[48;2;200;30;40m" + " ".repeat(60);
  const client = new FakeExomuxClient([under, over, top], {
    "stack-under": [{ sessionId: "stack-under", sequence: 1, data: Array(10).fill(redRow).join("\r\n") }],
  });
  const controller = await createExomuxController({ client, initialSessions: [under, over, top] });
  controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 0.5 };
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 90, rows: 26 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    const place = (id: string, rect: Rectangle) => {
      controller.windowHost.execute(
        { kind: "set-placement", id: exomuxWindowId(id), placement: "floating", rect },
        mounted.bodyRect.peek(),
      );
    };
    place("stack-under", { column: 5, row: 5, width: 30, height: 10 });
    place("stack-over", { column: 20, row: 8, width: 30, height: 8 });
    place("stack-top", { column: 24, row: 10, width: 14, height: 6 });
    // Focus order fixes the z-order: under < over < top.
    for (const id of ["stack-under", "stack-over", "stack-top"]) {
      controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(id) }, mounted.bodyRect.peek());
    }
    await harness.pilot.settle();

    const theme = controller.theme.peek();
    const cellText = (column: number, row: number): string => {
      const value = harness.canvas.frameBuffer[row]?.[column] ?? "";
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    };
    const red: readonly [number, number, number] = [200, 30, 40];
    const oneDeep = mixExomuxRgb(red, theme.surface, 0.5);
    const twoDeep = mixExomuxRgb(oneDeep, theme.surface, 0.5);

    // The middle window's ground over the red block blends the block, not the
    // bare field: mix(red, surface, opacity).
    assertStringIncludes(cellText(22, 9), `48;2;${oneDeep.join(";")}`);
    // The top window blends the middle window's already-blended colour again.
    assertStringIncludes(cellText(26, 11), `48;2;${twoDeep.join(";")}`);
    // Off the lower window, the same middle window blends the field instead.
    assert(
      !cellText(40, 12).includes(`48;2;${oneDeep.join(";")}`),
      "outside the overlap the ground comes from the field, not the red block",
    );

    // Chrome is a control surface: the top window's title bar blends at half
    // the window's transparency (0.5 → 0.75) against the scene beneath it —
    // the middle window's already-blended cells.
    const chromeExpected = mixExomuxRgb(oneDeep, theme.accent, exomuxControlOpacity(0.5));
    assertStringIncludes(cellText(26, 10), `48;2;${chromeExpected.join(";")}`);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux settings window stacks like a regular window (UX-003)", async () => {
  const initial = session("stack-regular", "shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.windowHost.execute(
      { kind: "set-placement", id: exomuxWindowId("stack-regular"), placement: "floating" },
      mounted.bodyRect.peek(),
    );
    // Open settings, then focus the terminal: the terminal must stack above.
    await clickStartMenuItem(harness, mounted, "config");
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId("stack-regular") }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const projection = mounted.windowProjection.peek();
    const settings = projection.floatingWindows.find((w) => w.id === EXOMUX_SETTINGS_WINDOW_ID);
    const terminal = projection.floatingWindows.find((w) => w.id === exomuxWindowId("stack-regular"));
    assert(settings && terminal);
    assertEquals(settings.alwaysOnTop, false, "settings must not pin on top");
    assert(terminal.zIndex > settings.zIndex, "a focused terminal stacks above the settings window");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux close button kills an exited window in one click (UX-005)", async () => {
  const initial = session("dead-window", "dead shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    client.markExited("dead-window", 0);
    await harness.pilot.settle();
    const terminal = mounted.windowProjection.peek().windows.find((w) => w.id === exomuxWindowId("dead-window"));
    assert(terminal);
    const close = terminal.controls.find((control) => control.kind === "close");
    assert(close);
    await harness.pilot.click(close.hitRect.column, close.hitRect.row);
    await waitForCondition(() => client.killed.includes("dead-window"), 2_000);
    await mounted.whenIdle();
    assertEquals(
      mounted.windowProjection.peek().windows.some((w) => w.id === exomuxWindowId("dead-window")),
      false,
      "the dead window is gone after one click",
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux settings layout stacks the pickers on narrow windows (UX-002)", () => {
  // Wide: side-by-side columns under one header row.
  const wide = exomuxGlobalConfigLayout({ column: 0, row: 0, width: 64, height: 24 }, 0, 0, 0);
  assertEquals(wide.stacked, false);
  assertEquals(wide.themeHeaderRect.row, wide.backgroundHeaderRect.row);
  assert(wide.backgroundListRect.column > wide.themeListRect.column);

  // Narrow: Theme above Background, both full width, each under its own
  // header, with the background-config button directly below the list.
  const narrow = exomuxGlobalConfigLayout({ column: 0, row: 0, width: 48, height: 26 }, 0, 0, 0);
  assertEquals(narrow.stacked, true);
  assertEquals(narrow.themeListRect.column, narrow.backgroundListRect.column);
  assertEquals(narrow.themeListRect.width, narrow.backgroundListRect.width);
  assert(narrow.backgroundListRect.row > narrow.themeListRect.row + narrow.themeListRect.height - 1);
  assertEquals(narrow.backgroundHeaderRect.row, narrow.backgroundListRect.row - 1);
  assertEquals(
    narrow.backgroundConfigRect.row,
    narrow.backgroundListRect.row + narrow.backgroundListRect.height,
    "the background-config button sits directly below the background list",
  );
  // Rows and hit regions agree with the list rects.
  assert(narrow.themeRows.every((row) =>
    row.rect.row >= narrow.themeListRect.row &&
    row.rect.row < narrow.themeListRect.row + narrow.themeListRect.height
  ));
  assert(narrow.backgroundRows.every((row) =>
    row.rect.row >= narrow.backgroundListRect.row &&
    row.rect.row < narrow.backgroundListRect.row + narrow.backgroundListRect.height
  ));
  // The options block still fits above the bottom row.
  assert(narrow.optionRows.every((row) => row.row > narrow.backgroundConfigRect.row && row.row < 25));
});

Deno.test("Exomux adopts windows another client opens, without stealing focus (UX-007)", async () => {
  const initial = session("local-shell", "local", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId("local-shell") }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const activeBefore = controller.windowHost.controller.inspect().activeWindowId;

    // Another client of the same host opens a terminal: the host broadcasts
    // its session-state and this desktop adopts the window live.
    client.broadcastSession(session("remote-shell", "opened elsewhere", 5));
    await waitForCondition(
      () => mounted.windowProjection.peek().windows.some((w) => w.id === exomuxWindowId("remote-shell")),
      2_000,
    );
    await mounted.whenIdle();
    assertEquals(
      controller.windowHost.controller.inspect().activeWindowId,
      activeBefore,
      "an adopted window must not steal focus",
    );
    assertEquals(controller.runtime("remote-shell")?.attached.peek(), true, "the adopted terminal attaches");
    assert(controller.sessions.peek().some((s) => s.id === "remote-shell"));

    // A broadcast for a known, running session is not adopted twice.
    client.broadcastSession(session("remote-shell", "opened elsewhere", 6));
    await harness.pilot.settle();
    assertEquals(
      mounted.windowProjection.peek().windows.filter((w) => w.id === exomuxWindowId("remote-shell")).length,
      1,
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux sessions panel lists host sessions and switches on click (UX-006)", async () => {
  const initial = session("here-shell", "here", 0);
  const client = new FakeExomuxClient([initial]);
  const switches: string[] = [];
  const controller = await createExomuxController({
    client,
    initialSessions: [initial],
    initialSessionName: "main",
    hostSessionsSource: {
      probe: () =>
        Promise.resolve([
          { name: "main", state: "attachable" as const, upMs: 60_000, terminals: [{ title: "here", running: true }] },
          {
            name: "work",
            state: "attachable" as const,
            upMs: 7_200_000,
            terminals: [{ title: "vim", running: true }, { title: "build", running: true }],
          },
          { name: "stale", state: "stopped" as const, terminals: [] },
        ]),
    },
    onSwitchSession: (name) => {
      switches.push(name);
    },
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 30 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    await controller.refreshHostSessions();
    await harness.pilot.settle();

    // The combined row model: terminals first, then the host-session section.
    const rows = exomuxManagerRows(controller);
    assertEquals(rows[0]?.kind, "terminal");
    const headingAt = rows.findIndex((row) => row.kind === "heading");
    assert(headingAt > 0, "a heading separates the host sessions");
    const work = rows.find((row) => row.kind === "host-session" && row.name === "work");
    assert(work && work.kind === "host-session");
    assertStringIncludes(work.label, "work");
    assertStringIncludes(work.label, "2 terms");
    const current = rows.find((row) => row.kind === "host-session" && row.name === "main");
    assert(current && current.kind === "host-session" && current.current, "the current session is marked");

    // Guards: switching to the current or a stopped session refuses.
    assertEquals(controller.switchToSession("main"), false);
    assertEquals(controller.switchToSession("stale"), false);
    assertEquals(switches, []);

    // Clicking the "work" row switches.
    controller.windowHost.execute({ kind: "focus", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const manager = mounted.windowProjection.peek().windows.find((w) => w.id === EXOMUX_SESSIONS_WINDOW_ID);
    assert(manager);
    const workIndex = rows.findIndex((row) => row.kind === "host-session" && row.name === "work");
    const rowY = manager.clientRect.row + 3 + workIndex; // SESSION_LIST_START + index (viewport from 0)
    await harness.pilot.click(manager.clientRect.column + 2, rowY);
    await mounted.whenIdle();
    assertEquals(switches, ["work"]);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux network tree carries per-machine action rows (TSM-010)", () => {
  const nodes = buildExomuxNetworkNodes(
    ["cos@backup.local"],
    {
      availability: "available",
      detail: "tailscale is running",
      snapshot: {
        backendState: "Running",
        devices: [
          {
            id: "peer-1",
            shortName: "studio",
            dnsName: "studio.tail.net",
            ipv4: "100.64.0.2",
            os: "linux",
            online: true,
            self: false,
            relayed: false,
            tags: [],
          },
          {
            id: "peer-2",
            shortName: "bare",
            dnsName: "",
            os: "linux",
            online: true,
            self: false,
            relayed: false,
            tags: [],
          },
        ],
        capturedAt: 1,
      },
    },
    new Set(["hosts", "tailscale"]),
  );
  const host = nodes[0]!.children!.find((node) => node.id === "host:cos@backup.local")!;
  const hostActions = host.children!.find((node) => node.id === "grp:act-host:cos@backup.local")!;
  assertEquals(hostActions.children!.map((node) => node.id), [
    "act:host-mon:cos@backup.local",
    "act:host-ping:cos@backup.local",
    "act:host-copy:cos@backup.local",
  ]);
  const studio = nodes[1]!.children!.find((node) => node.id === "dev:peer-1")!;
  const studioActions = studio.children!.find((node) => node.id === "grp:act:peer-1")!;
  assertEquals(studioActions.children!.map((node) => node.id), [
    "act:mon:peer-1",
    "act:ping:peer-1",
    "act:copy4:peer-1",
    "act:copydns:peer-1",
  ]);
  // A device with neither IPv4 nor a DNS name only offers monitor + ping.
  const bare = nodes[1]!.children!.find((node) => node.id === "dev:peer-2")!;
  const bareActions = bare.children!.find((node) => node.id === "grp:act:peer-2")!;
  assertEquals(bareActions.children!.map((node) => node.id), ["act:mon:peer-2", "act:ping:peer-2"]);
  // The id parser round-trips every action row.
  assertEquals(exomuxNetworkNodeAction("act:mon:peer-1"), { kind: "monitor", deviceId: "peer-1" });
  assertEquals(exomuxNetworkNodeAction("act:host-copy:cos@backup.local"), {
    kind: "host-copy",
    target: "cos@backup.local",
  });
  assertEquals(exomuxNetworkNodeAction("act:shell:peer-1"), undefined);
});

Deno.test("Exomux ping summary picks the reply or loss line from raw ping output", () => {
  assertEquals(
    exomuxPingSummary("PING x (1.2.3.4)\n64 bytes from 1.2.3.4: icmp_seq=1 ttl=64 time=1.23 ms\n"),
    "64 bytes from 1.2.3.4: icmp_seq=1 ttl=64 time=1.23 ms",
  );
  assertEquals(
    exomuxPingSummary("PING x\n\n--- x ping statistics ---\n1 packets transmitted, 0 received, 100% packet loss\n"),
    "1 packets transmitted, 0 received, 100% packet loss",
  );
  assertEquals(exomuxPingSummary(""), undefined);
});

Deno.test("Exomux network actions: monitor spawns over ssh -t, ping reports, copy emits OSC 52", async () => {
  const client = new FakeExomuxClient([]);
  const pings: string[][] = [];
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    tailnetSource: {
      fetchStatus: () =>
        Promise.resolve(
          {
            availability: "available",
            detail: "tailscale is running",
            snapshot: {
              backendState: "Running",
              devices: [
                {
                  id: "peer-1",
                  shortName: "studio",
                  dnsName: "studio.tail.net",
                  ipv4: "100.64.0.2",
                  os: "linux",
                  online: true,
                  self: false,
                  relayed: false,
                  tags: [],
                },
              ],
              capturedAt: 1,
            },
          } satisfies TailnetStatusResult,
        ),
    },
    tailnetPollIntervalMs: 300_000,
    networkProbeRunner: (command, args) => {
      pings.push([command, ...args]);
      return Promise.resolve({
        code: 0,
        stdout: new TextEncoder().encode("64 bytes from 100.64.0.2: icmp_seq=1 ttl=64 time=1.23 ms\n"),
      });
    },
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await clickStartMenuItem(harness, mounted, "network");
    await mounted.whenIdle();
    await waitForCondition(
      () => controller.networkTree.visibleRows().some((row) => row.id === "dev:peer-1"),
      2_000,
    );

    const tree = controller.networkTree;
    const pressOn = async (rowId: string) => {
      const index = tree.visibleRows().findIndex((row) => row.id === rowId);
      assert(index >= 0, `row ${rowId} is visible`);
      tree.setSelectedIndex(index);
      await harness.pilot.press("return");
      await mounted.whenIdle();
    };

    // Expand the machine, then its Actions group.
    await pressOn("dev:peer-1");
    await pressOn("grp:act:peer-1");

    // Copy IPv4 → OSC 52 with the base64 payload lands on the terminal stream.
    await pressOn("act:copy4:peer-1");
    assertStringIncludes(controller.status.peek(), "Copied studio IPv4: 100.64.0.2");
    assertStringIncludes(harness.stdout.text, `]52;c;${btoa("100.64.0.2")}`);

    // Copy MagicDNS uses the DNS name.
    await pressOn("act:copydns:peer-1");
    assertStringIncludes(harness.stdout.text, `]52;c;${btoa("studio.tail.net")}`);

    // Ping runs the bounded local probe and reports the reply line.
    await pressOn("act:ping:peer-1");
    await waitForCondition(() => controller.status.peek().includes("time=1.23"), 2_000);
    assertEquals(pings, [["ping", "-c", "1", "-W", "3", "studio.tail.net"]]);

    // System monitor spawns ssh -t with the remote btop/htop/top probe.
    await pressOn("act:mon:peer-1");
    await waitForCondition(() => client.spawned.length > 0, 2_000);
    const monitor = client.spawned.at(-1)!;
    assertEquals(monitor.command, "ssh");
    assertEquals(monitor.args, ["-t", "studio.tail.net", EXOMUX_REMOTE_MONITOR_COMMAND]);
    assertEquals(monitor.title, "studio · monitor");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux remote session probe output parses tmux and exomux rows, dropping junk", () => {
  const output = [
    "main\t3\t1",
    "scratch\t1\t0",
    "bad name!\t2\t0", // hostile name dropped
    "not-a-row",
    "--exomux--",
    "NAME     STATE       UP    TERMINALS  RUNNING",
    "default  attachable  3h 2m  2         nvim",
    "stale    crashed     -     -          -", // non-attachable dropped
  ].join("\n");
  assertEquals(parseExomuxRemoteSessions(output), [
    { kind: "tmux", name: "main", windows: 3, attached: true },
    { kind: "tmux", name: "scratch", windows: 1, attached: false },
    { kind: "exomux", name: "default", windows: 2 },
  ]);
  assertEquals(parseExomuxRemoteSessions(""), []);
  // The rses: node id round-trips targets and names safely.
  assertEquals(exomuxNetworkNodeRemoteSession("rses:tmux:studio.tail.net:main"), {
    kind: "tmux",
    target: "studio.tail.net",
    name: "main",
  });
  assertEquals(exomuxNetworkNodeRemoteSession("act:ping:x"), undefined);
});

Deno.test("Exomux network Sessions node probes lazily, attaches, and focuses if open (TSM-012/013)", async () => {
  const client = new FakeExomuxClient([]);
  const probes: string[][] = [];
  const probeOutput = "main\t3\t1\n--exomux--\nNAME  STATE  UP  TERMINALS  RUNNING\n";
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    tailnetSource: {
      fetchStatus: () =>
        Promise.resolve(
          {
            availability: "available",
            detail: "tailscale is running",
            snapshot: {
              backendState: "Running",
              devices: [
                {
                  id: "peer-1",
                  shortName: "studio",
                  dnsName: "studio.tail.net",
                  ipv4: "100.64.0.2",
                  os: "linux",
                  online: true,
                  self: false,
                  relayed: false,
                  tags: [],
                },
              ],
              capturedAt: 1,
            },
          } satisfies TailnetStatusResult,
        ),
    },
    tailnetPollIntervalMs: 300_000,
    networkProbeRunner: (command, args) => {
      probes.push([command, ...args]);
      return Promise.resolve({ code: 0, stdout: new TextEncoder().encode(probeOutput) });
    },
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await clickStartMenuItem(harness, mounted, "network");
    await mounted.whenIdle();
    await waitForCondition(
      () => controller.networkTree.visibleRows().some((row) => row.id === "dev:peer-1"),
      2_000,
    );
    assertEquals(probes.length, 0, "no SSH probes before the Sessions node expands");

    const tree = controller.networkTree;
    const pressOn = async (rowId: string, shift = false) => {
      const index = tree.visibleRows().findIndex((row) => row.id === rowId);
      assert(index >= 0, `row ${rowId} is visible`);
      tree.setSelectedIndex(index);
      await harness.pilot.press("return", { shift });
      await mounted.whenIdle();
    };

    // Expanding the machine then its Sessions node fires exactly one probe.
    await pressOn("dev:peer-1");
    const sessionsGroupId = `grp:ses:${encodeURIComponent("studio.tail.net")}`;
    await pressOn(sessionsGroupId);
    await waitForCondition(() => probes.length === 1, 2_000);
    assertEquals(probes[0]!.slice(0, 4), ["ssh", "-o", "BatchMode=yes", "studio.tail.net"]);
    assertStringIncludes(probes[0]!.at(-1)!, "tmux list-sessions");
    assertStringIncludes(probes[0]!.at(-1)!, "--exomux--");

    // The discovered tmux session renders as an attachable row.
    const rowId = `rses:tmux:${encodeURIComponent("studio.tail.net")}:main`;
    await waitForCondition(() => tree.visibleRows().some((row) => row.id === rowId), 2_000);
    assertStringIncludes(
      tree.visibleRows().find((row) => row.id === rowId)!.node.label,
      "tmux: main (3) · attached",
    );

    // Enter attaches over ssh -t in a new window.
    await pressOn(rowId);
    await waitForCondition(() => client.spawned.length === 1, 2_000);
    assertEquals(client.spawned[0]!.command, "ssh");
    assertEquals(client.spawned[0]!.args, ["-t", "studio.tail.net", "tmux attach -t main"]);
    assertEquals(client.spawned[0]!.title, "studio · tmux:main");

    // Enter again focuses the existing window instead of duplicating.
    const attachedId = client.listSnapshot().find((candidate) => candidate.commandLine === "ssh")!.id;
    await pressOn(rowId);
    await mounted.whenIdle();
    assertEquals(client.spawned.length, 1, "focus-if-open must not spawn again");
    assertEquals(controller.windowHost.controller.inspect().activeWindowId, exomuxWindowId(attachedId));

    // Shift-Enter forces a second attachment (after refocusing the panel,
    // since focus-if-open just moved focus to the attached window).
    controller.windowHost.execute({ kind: "focus", id: EXOMUX_NETWORK_WINDOW_ID }, mounted.bodyRect.peek());
    await mounted.whenIdle();
    await pressOn(rowId, true);
    await waitForCondition(() => client.spawned.length === 2, 2_000);
    assertEquals(client.spawned[1]!.args, ["-t", "studio.tail.net", "tmux attach -t main"]);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux fuzzy match is a case-insensitive in-order subsequence", () => {
  assert(exomuxFuzzyMatch("sd", "Studio"));
  assert(exomuxFuzzyMatch("STU", "studio.tail.net"));
  assert(exomuxFuzzyMatch("", "anything"));
  assert(!exomuxFuzzyMatch("ds", "studio"));
  assert(!exomuxFuzzyMatch("z", "studio"));
});

Deno.test("Exomux network filter narrows machines and auto-expands survivors (TSM-006)", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    tailnetSource: {
      fetchStatus: () =>
        Promise.resolve(
          {
            availability: "available",
            detail: "tailscale is running",
            snapshot: {
              backendState: "Running",
              devices: [
                {
                  id: "peer-1",
                  shortName: "studio",
                  dnsName: "studio.tail.net",
                  ipv4: "100.64.0.2",
                  os: "linux",
                  online: true,
                  self: false,
                  relayed: false,
                  tags: [],
                },
                {
                  id: "peer-2",
                  shortName: "cellar",
                  dnsName: "cellar.tail.net",
                  os: "linux",
                  online: true,
                  self: false,
                  relayed: false,
                  tags: [],
                },
              ],
              capturedAt: 1,
            },
          } satisfies TailnetStatusResult,
        ),
    },
    tailnetPollIntervalMs: 300_000,
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.rememberHost("cos@backup.local");
    await clickStartMenuItem(harness, mounted, "network");
    await mounted.whenIdle();
    await waitForCondition(
      () => controller.networkTree.visibleRows().some((row) => row.id === "dev:peer-2"),
      2_000,
    );

    // "/stu" keeps only the studio device; survivors auto-expand.
    await harness.pilot.press("/");
    for (const char of "stu") await harness.pilot.press(char as Key);
    await mounted.whenIdle();
    assertEquals(controller.networkFilter.peek(), "stu");
    assertStringIncludes(controller.status.peek(), "Filter: stu");
    const ids = controller.networkTree.visibleRows().map((row) => row.id);
    assert(ids.includes("dev:peer-1"), "studio survives the filter");
    assert(!ids.includes("dev:peer-2"), "cellar is filtered out");
    assert(!ids.some((id) => id.startsWith("host:")), "the non-matching saved host is filtered out");
    assert(ids.includes("act:shell:peer-1"), "the surviving machine auto-expands");

    // Backspacing to empty then once more turns the filter off and restores.
    for (let i = 0; i < 4; i += 1) await harness.pilot.press("backspace");
    await mounted.whenIdle();
    assertEquals(controller.networkFilter.peek(), undefined);
    const restored = controller.networkTree.visibleRows().map((row) => row.id);
    assert(restored.includes("dev:peer-2"), "clearing the filter restores every machine");

    // Escape also clears an active filter.
    await harness.pilot.press("/");
    await harness.pilot.press("z" as Key);
    await mounted.whenIdle();
    assert(!controller.networkTree.visibleRows().some((row) => row.id.startsWith("dev:")));
    await harness.pilot.press("escape");
    await mounted.whenIdle();
    assertEquals(controller.networkFilter.peek(), undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux permission report lists every subprocess grant with provenance (TSM-011)", () => {
  const report = exomuxPermissionReport();
  const spawnTargets = (level: "required" | "optional") =>
    (level === "required" ? report.required : report.optional)
      .filter((entry) => entry.kind === "subprocess")
      .map((entry) => ({ target: entry.target, by: [...entry.requiredBy, ...entry.optionalBy] }));

  // The host's own processes are required; every network tool is optional.
  const required = spawnTargets("required");
  assert(required.some((entry) => entry.target.includes("host daemon") && entry.by.includes("exomux-host")));
  assert(required.some((entry) => entry.target.includes("terminal shells")));

  const optional = spawnTargets("optional");
  const byTool = (needle: string) => optional.find((entry) => entry.target.includes(needle));
  assertEquals(byTool("tailscale")?.by, ["exomux-tailnet-discovery"]);
  assertEquals(byTool("ssh")?.by, ["exomux-network-panel"]);
  assertEquals(byTool("ping")?.by, ["exomux-network-panel"]);
  assertEquals(byTool("scp")?.by, ["exomux-file-transfer"]);
});

Deno.test("Exomux provider capability follows tailnet availability without restart (TSM-011)", async () => {
  const client = new FakeExomuxClient([]);
  let result: TailnetStatusResult = { availability: "unavailable", detail: "tailscale binary not found" };
  const controller = await createExomuxController({
    client,
    initialSessions: [],
    tailnetSource: { fetchStatus: () => Promise.resolve(result) },
    tailnetPollIntervalMs: 300_000,
  });
  try {
    assertEquals(controller.networkCapability().status, "unavailable");

    await controller.refreshNetwork();
    assertEquals(controller.networkCapability().status, "unavailable");
    assertEquals(controller.networkCapability().reason, "tailscale binary not found");

    result = { availability: "degraded", detail: "tailscaled is stopped" };
    await controller.refreshNetwork();
    assertEquals(controller.networkCapability().status, "degraded");

    result = {
      availability: "available",
      detail: "tailscale is running",
      snapshot: { backendState: "Running", devices: [], capturedAt: 1 },
    };
    await controller.refreshNetwork();
    assertEquals(controller.networkCapability().status, "available");
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux scp targets the OSC 7 working directory without probing (035 D4)", async () => {
  const initial = session("osc7-shell", "osc7 shell", 0, "ssh studio.tail.net");
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({
    client,
    initialSessions: [initial],
    tailnetSource: {
      fetchStatus: () => Promise.resolve({ availability: "unavailable", detail: "off" } as TailnetStatusResult),
    },
    tailnetPollIntervalMs: 300_000,
    statFile: () => Promise.resolve(true),
    scpCwdTimeoutMs: 2_000,
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 28 } });

  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.sessionHosts.value = Object.freeze({ [initial.id]: "studio.tail.net" });
    // The remote shell reported its cwd through OSC 7 at some earlier point.
    client.emitOutput({
      sessionId: initial.id,
      sequence: 1,
      data: "\x1b]7;file://studio/srv/deploys\x07",
    });
    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(initial.id) }, mounted.bodyRect.peek());

    harness.app.tui.emit("paste", { key: "paste", text: "/tmp/report.pdf", buffer: new Uint8Array() });
    await waitForCondition(() => controller.pendingScp.peek()?.remoteDir !== undefined, 2_000);
    assertEquals(controller.pendingScp.peek()!.remoteDir, "/srv/deploys");
    // The OSC 7 report made the pwd probe unnecessary.
    assert(!client.inputs.some((input) => input.data.includes("pwd")), "no pwd probe typed into the shell");

    await harness.pilot.press("return");
    await waitForCondition(() => client.spawned.some((options) => options.command === "scp"), 2_000);
    const scpSpawn = client.spawned.find((options) => options.command === "scp")!;
    assertEquals(scpSpawn.args!.at(-1), "studio.tail.net:/srv/deploys/");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});
