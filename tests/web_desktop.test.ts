// The desktop page's ANSI-to-cells conversion, tested without a DOM.
//
// The desktop composes windows as cell grids; demos that emit styled strings
// pass through `ansiLineToCells`, and a mistake here paints every neon demo
// wrong. The parser's contract: convert what the demos actually emit, drop
// what it does not understand, and always return exactly `width` cells.

import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { ansi256ToRgb, ansiLineToCells, hexToRgb } from "../examples/web/ansi_cells.ts";
import { createBrowserMonitor } from "../examples/web/browser_monitor.ts";

const GROUND = [10, 10, 10] as const;

Deno.test("plain text becomes ground-backed cells padded to width", () => {
  const cells = ansiLineToCells("ab", 4, GROUND);
  assertEquals(cells.length, 4);
  assertEquals(cells[0], { char: "a", foreground: undefined, background: GROUND });
  assertEquals(cells[2], { char: " ", background: GROUND });
});

Deno.test("truecolor foreground and background carry through and reset", () => {
  const line = "\x1b[38;2;1;2;3m\x1b[48;2;9;8;7mX\x1b[0mY";
  const cells = ansiLineToCells(line, 2, GROUND);
  assertEquals(cells[0], { char: "X", foreground: [1, 2, 3], background: [9, 8, 7] });
  assertEquals(cells[1], { char: "Y", foreground: undefined, background: GROUND });
});

Deno.test("256-colour indices resolve through the xterm cube", () => {
  const cells = ansiLineToCells("\x1b[38;5;196mR", 1, GROUND);
  assertEquals(cells[0]!.foreground, ansi256ToRgb(196));
  // 196 is full red in the 6x6x6 cube.
  assertEquals(ansi256ToRgb(196), [255, 0, 0]);
  // The grey ramp is monotone.
  assertEquals(ansi256ToRgb(232), [8, 8, 8]);
  assertEquals(ansi256ToRgb(255), [238, 238, 238]);
});

Deno.test("width clamps styled overflow instead of spilling", () => {
  const cells = ansiLineToCells("\x1b[38;2;5;5;5mabcdef", 3, GROUND);
  assertEquals(cells.length, 3);
  assertEquals(cells.map((cell) => cell.char).join(""), "abc");
});

Deno.test("an unterminated escape ends the line rather than printing garbage", () => {
  const cells = ansiLineToCells("ok\x1b[38;2;1", 4, GROUND);
  assertEquals(cells.map((cell) => cell.char).join(""), "ok  ");
});

Deno.test("base-16 SGR colours map to the same palette as index lookups", () => {
  const cells = ansiLineToCells("\x1b[31mr\x1b[91mb", 2, GROUND);
  assertEquals(cells[0]!.foreground, ansi256ToRgb(1));
  assertEquals(cells[1]!.foreground, ansi256ToRgb(9));
});

Deno.test("hexToRgb reads palette hex fields and refuses malformed ones", () => {
  assertEquals(hexToRgb("#7fd6ff"), [127, 214, 255]);
  assertEquals(hexToRgb("0a0c14"), [10, 12, 20]);
  assertEquals(hexToRgb("#fff"), undefined);
  assertEquals(hexToRgb("not-a-colour"), undefined);
});

Deno.test("the browser monitor composes a waiting dashboard without a DOM", () => {
  // No microphone, no heap report: every feed is absent, and the contract is
  // a full frame of the right size that says "waiting", not a crash or zeros.
  const monitor = createBrowserMonitor({ header: false });
  monitor.sample(1000);
  for (const [width, height] of [[60, 18], [24, 8], [7, 3]] as const) {
    const frame = monitor.render(width, height);
    assertEquals(frame.length, height);
    for (const row of frame) assertEquals(row.length, width);
  }
  assert(monitor.microphone() === "waiting");
});
