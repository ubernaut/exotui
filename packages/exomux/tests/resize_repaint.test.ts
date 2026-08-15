import { assert, assertEquals } from "./deps.ts";
import { createTestMousePress, createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { createExomuxTerminalOptions, type ExomuxAppMountRef, exomuxStartMenuLayout } from "../app.ts";
import { createExomuxController, EXOMUX_SESSIONS_WINDOW_ID, EXOMUX_SETTINGS_WINDOW_ID } from "../controller.ts";
import { FakeExomuxClient, session } from "./app.test.ts";

function snapshot(harness: { canvas: { frameBuffer: (string | Uint8Array)[][] } }, cols: number, rows: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const v = harness.canvas.frameBuffer[r]?.[c] ?? "";
      line += typeof v === "string" ? v : new TextDecoder().decode(v);
    }
    out.push(line);
  }
  return out;
}

async function stabilize(harness: { pilot: { settle: () => Promise<unknown> }; canvas: { frameBuffer: (string | Uint8Array)[][] } }, cols: number, rows: number): Promise<string[]> {
  let prev = snapshot(harness, cols, rows).join("\n");
  for (let i = 0; i < 40; i++) {
    await harness.pilot.settle();
    await new Promise((r) => setTimeout(r, 15));
    const next = snapshot(harness, cols, rows).join("\n");
    if (next === prev) return next.split("\n");
    prev = next;
  }
  return prev.split("\n");
}

Deno.test("interactive corner resize min->max leaves no ghosts in the frame or the emitted stream", async () => {
  const initial = session("ghost-resize", "shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _t, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const COLS = 110, ROWS = 34;
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: COLS, rows: ROWS } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    // open settings via the start menu
    await harness.pilot.click(1, 0);
    await mounted.whenIdle();
    const menu = exomuxStartMenuLayout(harness.app.tui.rectangle.peek());
    const item = menu.items.find((candidate) => candidate.id === "config")!;
    await harness.pilot.click(item.rect.column + 1, item.rect.row);
    await mounted.whenIdle();
    await stabilize(harness, COLS, ROWS);

    const settingsRect = () =>
      mounted.windowProjection.peek().windows.find((w) => w.id === EXOMUX_SETTINGS_WINDOW_ID)!.rect;

    const dragCorner = async (toX: number, toY: number) => {
      const r = settingsRect();
      const cx = r.column + r.width - 1;
      const cy = r.row + r.height - 1;
      await harness.app.mouse.dispatch(createTestMousePress({ x: cx, y: cy }));
      // several intermediate ticks like a real drag
      const steps = 8;
      for (let s = 1; s <= steps; s++) {
        const x = Math.round(cx + (toX - cx) * (s / steps));
        const y = Math.round(cy + (toY - cy) * (s / steps));
        await harness.app.mouse.dispatch(createTestMousePress({ x, y, drag: true }));
      }
      await harness.app.mouse.dispatch(createTestMousePress({ x: toX, y: toY, release: true, button: undefined }));
      await mounted.whenIdle();
    };

    const before = { ...settingsRect() };
    // shrink to minimum
    await dragCorner(before.column + 2, before.row + 2);
    const small = { ...settingsRect() };
    // grow to maximum
    await dragCorner(COLS - 1, ROWS - 1);
    const big = { ...settingsRect() };
    assert(small.width < big.width, "the drags actually resized");

    // A: the incrementally-painted frame, fully settled.
    const incremental = await stabilize(harness, COLS, ROWS);
    // B: a forced clean full repaint of the same state.
    harness.canvas.rerenderAll();
    const clean = await stabilize(harness, COLS, ROWS);

    const diffs: string[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (incremental[r] !== clean[r]) diffs.push(`row ${r}`);
    }

    // End-to-end: replay the emitted ANSI stream into a terminal emulator and
    // compare what a real terminal would show against the frame buffer.
    const { TerminalScreenController } = await import("@ubernaut/deno-tui/terminal");
    const { widgetSurfaceCellData } = await import("@ubernaut/deno-tui/app");
    const { exomuxTerminalRgb } = await import("../terminal_palette.ts");
    const emulator = new TerminalScreenController({ columns: COLS, rows: ROWS });
    emulator.write(harness.stdout.text);
    const rows = emulator.cellRows();
    let mismatches = 0;
    const samples: string[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const term = rows[r]?.[c];
        if (!term || term.continuation) continue;
        const fbRaw = harness.canvas.frameBuffer[r]?.[c] ?? "";
        const fb = widgetSurfaceCellData(typeof fbRaw === "string" ? fbRaw : new TextDecoder().decode(fbRaw));
        if (!fb || fb.glyph === "") continue;
        const termGlyph = term.char || " ";
        const termBg = exomuxTerminalRgb(term.background, true);
        const same = termGlyph === fb.glyph &&
          JSON.stringify(termBg ?? null) === JSON.stringify(fb.background ?? null);
        if (!same) {
          mismatches++;
          if (samples.length < 8) {
            samples.push(
              `(${c},${r}) term="${termGlyph}"/${JSON.stringify(termBg)} fb="${fb.glyph}"/${JSON.stringify(fb.background)}`,
            );
          }
        }
      }
    }
    assertEquals(diffs.length, 0, `canvas ghosts on ${diffs.join(", ")}`);
    assertEquals(mismatches, 0, "the emitted ANSI stream must reproduce the frame buffer");
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});
