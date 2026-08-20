// Copyright 2023 Im-Beast. MIT license.

// String sequences (DCS/APC/PM/SOS) through the screen model.
//
// The reproduction behind these: tode — a VS Code fork that draws in the
// terminal — detects Ghostty from the environment exomux's PTYs inherit, and
// sends kitty graphics: images as base64 in APC strings, `ESC _ G … ESC \`.
// The screen model knew OSC and CSI but not APC, so `ESC _` fell through as
// text and every image transmission printed as a wall of base64.

import { assert, assertEquals } from "./deps.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";

function screenText(screen: TerminalScreenController): string {
  return screen.cellRows().map((row) => row.map((cell) => cell.char ?? " ").join("").trimEnd()).join("\n").trimEnd();
}

/** tode's exact emission: chunked kitty-graphics transmit-and-display. */
function kittyTransmit(payload: string, chunkSize = 4096): string[] {
  const chunks: string[] = [];
  for (let at = 0; at < payload.length; at += chunkSize) chunks.push(payload.slice(at, at + chunkSize));
  return chunks.map((chunk, index) => {
    const first = index === 0 ? "a=T,f=100,r=1,c=2,C=1," : "";
    const more = index === chunks.length - 1 ? "m=0" : "m=1";
    return `\x1b_G${first}${more};${chunk}\x1b\\`;
  });
}

Deno.test("a kitty graphics transmission never prints as text", () => {
  const screen = new TerminalScreenController({ columns: 80, rows: 10 });
  const payload = btoa("x".repeat(9000));
  for (const apc of kittyTransmit(payload)) screen.write(apc);
  screen.write("after\r\n");
  assertEquals(screenText(screen), "after");
});

Deno.test("an APC split at arbitrary chunk boundaries is still one sequence", () => {
  // A PTY hands over whatever it has when it has it; a 4 KB APC crossing a
  // read boundary is the normal case. Split at every prefix length that
  // matters: inside the introducer, inside the payload, and inside ST itself.
  const apc = `\x1b_Gm=0;${btoa("hello world, repeatedly".repeat(40))}\x1b\\`;
  for (const at of [1, 2, 5, 40, apc.length - 2, apc.length - 1]) {
    const screen = new TerminalScreenController({ columns: 80, rows: 6 });
    screen.write(apc.slice(0, at));
    screen.write(apc.slice(at));
    screen.write("ok");
    assertEquals(screenText(screen), "ok", `split at ${at} leaked the payload`);
  }
});

Deno.test("a payload larger than the pending cap is discarded, not printed", () => {
  // A single-APC image transmit can run to megabytes. The screen cannot buffer
  // that, and dropping the buffer used to mean the next write started
  // mid-payload and printed base64 from there on.
  const screen = new TerminalScreenController({ columns: 80, rows: 6 });
  const huge = btoa("pixel data ".repeat(40_000)); // ~0.5 MB, over the 64 KB cap
  const sequence = `\x1b_Ga=T,f=100;${huge}\x1b\\`;
  for (let at = 0; at < sequence.length; at += 8192) screen.write(sequence.slice(at, at + 8192));
  screen.write("intact");
  assertEquals(screenText(screen), "intact");
});

Deno.test("BEL does not terminate an APC", () => {
  // OSC accepts BEL as a terminator; string sequences do not, and a base64
  // alphabet does not contain 0x07 — but a binary-ish DCS payload might.
  const screen = new TerminalScreenController({ columns: 40, rows: 4 });
  screen.write(`\x1b_Gm=0;AAAA\x07BBBB\x1b\\done`);
  assertEquals(screenText(screen), "done");
});

Deno.test("DCS, PM and SOS are consumed like APC", () => {
  const screen = new TerminalScreenController({ columns: 60, rows: 6 });
  screen.write("\x1bPtmux;\x1b\x1b[31mnested\x1b\\");
  screen.write("\x1b^privacy message\x1b\\");
  screen.write("\x1bXstart of string\x1b\\");
  screen.write("visible");
  assertEquals(screenText(screen), "visible");
});

Deno.test("text on both sides of a string sequence lands exactly once", () => {
  const screen = new TerminalScreenController({ columns: 40, rows: 4 });
  screen.write(`before\x1b_Gm=0;${btoa("img")}\x1b\\after`);
  assertEquals(screenText(screen), "beforeafter");
});

Deno.test("clear() releases a half-received string sequence", () => {
  const screen = new TerminalScreenController({ columns: 40, rows: 4 });
  screen.write("\x1b_Gm=1;AAAA"); // no terminator yet
  screen.clear();
  screen.write("fresh");
  assertEquals(screenText(screen), "fresh");
  assert(!screenText(screen).includes("AAAA"));
});
