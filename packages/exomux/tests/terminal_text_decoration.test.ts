// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals } from "./deps.ts";
import { createAnsiStyle } from "@ubernaut/exotui";
import { createTestTerminalApp } from "@ubernaut/exotui/testing";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import { createExomuxController, EXOMUX_SESSIONS_WINDOW_ID } from "../controller.ts";
import { exomuxWindowId } from "../model.ts";
import { FakeExomuxClient, session } from "./fakes.ts";
import { parseAnsiCell } from "../../../src/web/cell_canvas_sink.ts";

Deno.test("isolated mounted Exomux preserves PTY typography, distinct underline-cache identities and styled copy history", async () => {
  const initial = session("decorated-shell", "decorated", 1),
    styles = ["solid", "double", "wavy", "dotted", "dashed"] as const;
  const data = styles.map((underlineStyle, index) =>
    createAnsiStyle({
      bold: true,
      italic: true,
      underline: true,
      underlineStyle,
      underlineColor: [0, 255, 0],
      foreground: [0, 0, 255],
      overline: true,
      strikethrough: true,
    })(String.fromCharCode(65 + index))
  ).join("");
  const client = new FakeExomuxClient([initial], {
    [initial.id]: [{ sessionId: initial.id, sequence: 1, data }],
  });
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 1 };
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 110, rows: 32 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await harness.pilot.settle();
    const rect = () =>
      mounted.windowProjection.peek().windows.find((window) => window.id === exomuxWindowId(initial.id))!.clientRect;
    const cell = (index: number) => {
      const clientRect = rect(), value = harness.canvas.frameBuffer[clientRect.row]?.[clientRect.column + index];
      return parseAnsiCell(typeof value === "string" ? value : new TextDecoder().decode(value));
    };
    for (const [index, underlineStyle] of styles.entries()) {
      const painted = cell(index);
      assertEquals(painted.text, String.fromCharCode(65 + index));
      assert(painted.bold && painted.italic && painted.underline && painted.overline && painted.strikethrough);
      assertEquals(painted.underlineStyle ?? "solid", underlineStyle);
      assertEquals(painted.foreground, "rgb(0,0,255)");
      assertEquals(painted.underlineColor, "rgb(0,255,0)");
    }
    const runtime = controller.runtime(initial.id);
    assert(runtime);
    client.emitOutput({ sessionId: initial.id, sequence: 2, data: "\r\n".repeat(runtime.screen.rows) + "plain" });
    runtime.scrollback.setSelection(0);
    runtime.renderRevision.value++;
    await harness.pilot.settle();
    assertEquals(runtime.scrollback.copySelection(), "ABCDE");
    for (const [index, underlineStyle] of styles.entries()) {
      assertEquals(cell(index).underlineStyle ?? "solid", underlineStyle);
      assertEquals(cell(index).underlineColor, "rgb(0,255,0)");
    }
    runtime.scrollback.exitCopyMode();
    client.emitOutput({ sessionId: initial.id, sequence: 3, data: "\x1b[H\x1b[0mA" });
    await harness.pilot.settle();
    const plain = cell(0);
    assertEquals(plain.text, "A");
    assert(!plain.italic && !plain.underline && !plain.overline && !plain.strikethrough);
    assertEquals(plain.underlineColor, undefined);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});
