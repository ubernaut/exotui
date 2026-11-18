// Copyright 2023 Im-Beast. MIT license.

import { createTestTerminalApp } from "@ubernaut/exotui/testing";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import { createExomuxController, EXOMUX_SESSIONS_WINDOW_ID } from "../controller.ts";
import { exomuxControlColor, exomuxWindowId } from "../model.ts";
import { widgetSurfaceCellData } from "../widget_surface.ts";
import { assert, assertEquals } from "./deps.ts";
import { FakeExomuxClient, session } from "./fakes.ts";

Deno.test("Sessions keeps its selected row and mutes it when another window takes focus", async () => {
  const shell = session("shell", "logs", 0);
  const controller = await createExomuxController({
    client: new FakeExomuxClient([shell]),
    initialSessions: [shell],
    hostSessionsSource: { probe: () => Promise.resolve([]) },
    tailnetSource: { fetchStatus: () => Promise.resolve({ availability: "unavailable", detail: "fixture" }) },
  });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...options } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...options, size: { columns: 100, rows: 28 } });
  try {
    const mounted = mount.current!;
    await mounted.whenIdle();
    const body = mounted.bodyRect.peek();
    controller.openSessionManager(body);
    controller.windowHost.execute({
      kind: "set-placement",
      id: EXOMUX_SESSIONS_WINDOW_ID,
      placement: "floating",
      rect: { column: 4, row: 4, width: 24, height: 10 },
    }, body);
    controller.windowHost.execute({
      kind: "set-placement",
      id: exomuxWindowId(shell.id),
      placement: "floating",
      rect: { column: 40, row: 4, width: 30, height: 10 },
    }, body);
    const selectionCell = () => {
      const panel = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_SESSIONS_WINDOW_ID);
      assert(panel);
      return widgetSurfaceCellData(harness.canvas.frameBuffer[panel.clientRect.row + 3]?.[panel.clientRect.column]);
    };
    const theme = controller.theme.peek();
    controller.windowHost.execute({ kind: "focus", id: EXOMUX_SESSIONS_WINDOW_ID }, body);
    await harness.pilot.settle();
    assertEquals(selectionCell()?.glyph, ">");
    assertEquals(selectionCell()?.background, exomuxControlColor(theme, "control:background-selected", theme.accent));

    controller.windowHost.execute({ kind: "focus", id: exomuxWindowId(shell.id) }, body);
    await harness.pilot.settle();
    assertEquals(selectionCell()?.glyph, "·");
    assertEquals(
      selectionCell()?.background,
      exomuxControlColor(theme, "control:background-selected-unfocused", theme.surfaceStrong),
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});
