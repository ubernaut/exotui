// Regression guard for the typing echo path: a keystroke's output frame
// must repaint the desktop well inside an interactive budget. The bound is
// deliberately loose for CI variance — before the cell-style memo this
// scenario cost ~99ms/frame; with it ~15ms.
import { assert } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/exotui/testing";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import { createExomuxController } from "../controller.ts";
import { FakeExomuxClient, session } from "./fakes.ts";

Deno.test("Exomux typing echo frames stay inside the interactive budget", async () => {
  const sessions = Array.from({ length: 5 }, (_, i) => session(`s${i}`, `shell ${i}`, 0));
  const client = new FakeExomuxClient(sessions);
  const controller = await createExomuxController({ client, initialSessions: sessions });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _t, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 220, rows: 60 } });
  try {
    const mounted = mount.current;
    assert(mounted);
    await mounted.whenIdle();
    // Fill each session with content and turn transparency on (the user's setup).
    controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 0.8 };
    for (const s of sessions) {
      let data = "";
      for (let row = 0; row < 40; row += 1) {
        data += `\x1b[3${row % 8}mrow ${row} lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod\r\n`;
      }
      client.emitOutput({ sessionId: s.id, sequence: 1, data });
    }
    await mounted.whenIdle();
    await harness.pilot.settle();

    // Simulate typing echoes: one small output frame per keystroke.
    const runs = 60;
    let sequence = 2;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) {
      client.emitOutput({ sessionId: "s0", sequence: sequence++, data: "x" });
      await harness.pilot.settle();
    }
    const elapsed = performance.now() - start;
    const perFrame = elapsed / runs;
    console.log(`echo frames: ${runs} in ${elapsed.toFixed(1)}ms → ${perFrame.toFixed(2)}ms/frame`);
    assert(perFrame < 60, `typing echo frame took ${perFrame.toFixed(1)}ms; the interactive budget is 60ms`);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});
