// Copyright 2023 Im-Beast. MIT license.

// Regression guard (034 UX-014): interleaved theme clicks (which remount the
// composited pickers) and wheel scrolls must never accumulate stale
// selection bars — the user's screenshot showed three, one per past epoch.
import { assert } from "./deps.ts";
import { createTestMouseScroll, createTestTerminalApp, stripAnsi } from "@ubernaut/exotui/testing";
import { createExomuxTerminalOptions, type ExomuxAppMountRef, exomuxGlobalConfigLayout } from "../app.ts";
import { createExomuxController, EXOMUX_SESSIONS_WINDOW_ID, EXOMUX_SETTINGS_WINDOW_ID } from "../controller.ts";
import { EXOMUX_THEMES } from "../model.ts";
import { FakeExomuxClient } from "./fakes.ts";

Deno.test("Exomux settings pickers survive click/scroll churn without stale bars (UX-014)", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _t, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 100, rows: 34 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    controller.openGlobalConfig();
    await mounted.whenIdle();

    const clientRect = () =>
      mounted.windowProjection.peek().windows.find((w) => w.id === EXOMUX_SETTINGS_WINDOW_ID)!.clientRect;
    const layout = () => {
      const themeIndex = Math.max(0, EXOMUX_THEMES.findIndex((entry) => entry.id === controller.themeId.peek()));
      return exomuxGlobalConfigLayout(clientRect(), themeIndex, 0);
    };
    const cellText = (column: number, row: number): string => {
      const value = harness.canvas.frameBuffer[row]?.[column] ?? "";
      return stripAnsi(typeof value === "string" ? value : new TextDecoder().decode(value));
    };
    const listRows = (rect: { column: number; row: number; width: number; height: number }): string[] => {
      const rows: string[] = [];
      for (let r = 0; r < rect.height; r += 1) {
        let text = "";
        for (let c = 0; c < rect.width; c += 1) text += cellText(rect.column + c, rect.row + r);
        rows.push(text.trim());
      }
      return rows;
    };
    const shallow = async () => {
      await harness.pilot.settle();
      await new Promise((resolve) => setTimeout(resolve, 3));
    };
    const deep = async () => {
      for (let i = 0; i < 80; i += 1) {
        await harness.pilot.settle();
        await new Promise((resolve) => setTimeout(resolve, 6));
      }
    };

    // Churn: click different theme rows (each remounts the pickers with new
    // colors), wheel-scroll both lists, all with only shallow settles like a
    // live 60fps session.
    for (let round = 0; round < 6; round += 1) {
      const l = layout();
      const themeRow = l.themeRows[(round * 2 + 1) % l.themeRows.length]!;
      await harness.app.mouse.dispatch({
        ...createTestMouseScroll(1),
        x: l.themeListRect.column + 2,
        y: l.themeListRect.row + 1,
      });
      await shallow();
      await harness.pilot.click(themeRow.rect.column + 2, themeRow.rect.row);
      await shallow();
      await harness.app.mouse.dispatch({
        ...createTestMouseScroll(round % 2 === 0 ? 1 : -1),
        x: l.backgroundListRect.column + 2,
        y: l.backgroundListRect.row + 1,
      });
      await shallow();
    }
    await deep();

    const l = layout();
    const themeRows = listRows(l.themeListRect);
    const backgroundRows = listRows(l.backgroundListRect);

    for (const [name, rows] of [["theme", themeRows], ["background", backgroundRows]] as const) {
      const markers = rows.filter((row) => row.startsWith(">")).length;
      const texts = rows.map((row) => row.replace(/^[>·] /, "")).filter((row) => row.length > 0);
      const dupes = texts.filter((text, index) => texts.indexOf(text) !== index);
      assert(markers <= 1, `${name} shows ${markers} selection markers`);
      assert(dupes.length === 0, `${name} repeats rows: ${dupes.join(", ")}`);
    }
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});
