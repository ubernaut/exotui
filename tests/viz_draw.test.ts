// Copyright 2023 Im-Beast. MIT license.

// The drawing toolkit, and the visualisations promoted onto it from the demos.

import { assert, assertEquals } from "./deps.ts";
import { blankFrame, frameToText, type VizFrame } from "../src/viz/render.ts";
import { drawArc, drawLine, drawPath, drawRect, fillRect, plot, plotQuadrant } from "../src/viz/draw.ts";
import { dial, odometer, strip } from "../src/viz/renderers_scalar.ts";
import { hexgrid } from "../src/viz/renderers_vector.ts";
import { overlay } from "../src/viz/renderers_matrix.ts";
import { defaultVisualizationTheme } from "../src/viz/theme.ts";

const THEME = defaultVisualizationTheme();

function inked(frame: VizFrame): number {
  return frame.flat().filter((cell) => cell.char !== " ").length;
}

Deno.test("drawing outside the frame is ignored rather than throwing", () => {
  const frame = blankFrame({ width: 4, height: 3 });
  plot(frame, -1, 0, "x");
  plot(frame, 99, 0, "x");
  plot(frame, 0, -5, "x");
  drawLine(frame, { column: -10, row: -10 }, { column: 40, row: 40 }, "x");
  assertEquals(frame.length, 3);
  for (const row of frame) assertEquals(row.length, 4);
});

Deno.test("a line joins its ends with no gaps along the way", () => {
  const frame = blankFrame({ width: 20, height: 10 });
  drawLine(frame, { column: 0, row: 9 }, { column: 19, row: 0 }, "#");
  for (let column = 0; column < 20; column += 1) {
    assert(frame.some((row) => row[column]!.char === "#"), `column ${column} was skipped`);
  }
});

Deno.test("a path is a line through every point, and one point still draws", () => {
  const frame = blankFrame({ width: 12, height: 6 });
  drawPath(frame, [{ column: 0, row: 5 }, { column: 5, row: 0 }, { column: 11, row: 5 }], "+");
  assertEquals(frame[0]![5]!.char, "+");
  assertEquals(frame[5]![0]!.char, "+");
  assertEquals(frame[5]![11]!.char, "+");
  const single = blankFrame({ width: 4, height: 4 });
  drawPath(single, [{ column: 2, row: 2 }], "o");
  assertEquals(single[2]![2]!.char, "o");
});

Deno.test("an arc sweeps only the turns it was given", () => {
  const full = blankFrame({ width: 21, height: 11 });
  drawArc(full, { column: 10, row: 5 }, { column: 9, row: 4 }, "o", { from: 0, to: 1 });
  const half = blankFrame({ width: 21, height: 11 });
  // The upper half only: three quarters of a turn round to a full turn, since
  // row grows downward.
  drawArc(half, { column: 10, row: 5 }, { column: 9, row: 4 }, "o", { from: 0.5, to: 1 });
  assert(inked(half) < inked(full), "half an arc should ink fewer cells than a whole one");
  assert(half.slice(6).every((row) => row.every((cell) => cell.char === " ")), "nothing below the centre");
});

Deno.test("rectangles outline and fill", () => {
  const frame = blankFrame({ width: 8, height: 5 });
  drawRect(frame, { column: 1, row: 1, width: 5, height: 3 }, "#");
  assertEquals(frameToText(frame)[2], " #   #  ", "the middle row is hollow");
  fillRect(frame, { column: 1, row: 1, width: 5, height: 3 }, "#");
  assertEquals(frameToText(frame)[2], " #####  ");
});

Deno.test("quadrants accumulate, so two sub-cell points share a cell", () => {
  const frame = blankFrame({ width: 4, height: 4 });
  plotQuadrant(frame, 0, 0);
  assertEquals(frame[0]![0]!.char, "▘");
  plotQuadrant(frame, 1, 1);
  assertEquals(frame[0]![0]!.char, "▚", "the first point is still lit");
});

Deno.test("a dial's sweep is the value, not decoration", () => {
  const low = dial.render(0.05, { size: { width: 21, height: 9 }, theme: THEME, domain: { min: 0, max: 1 } });
  const high = dial.render(0.95, { size: { width: 21, height: 9 }, theme: THEME, domain: { min: 0, max: 1 } });
  const filled = (frame: typeof low) => frame.flat().filter((cell) => cell.char === "●").length;
  assert(filled(high) > filled(low) * 3, `95% should sweep far further than 5%: ${filled(high)} vs ${filled(low)}`);
  // And the number is in the middle of it.
  assert(frameToText(high).join("").includes("95%"));
});

Deno.test("an odometer draws the number large and right-aligned", () => {
  const frame = odometer.render(0.42, {
    size: { width: 20, height: 5 },
    theme: THEME,
    domain: { min: 0, max: 1 },
    format: (value) => `${Math.round(value * 100)}%`,
  });
  const lines = frameToText(frame);
  assertEquals(lines.length, 5);
  // Three rows of glyphs, centred vertically, ending at the right edge.
  const drawn = lines.filter((line) => line.trim().length > 0);
  assertEquals(drawn.length, 3);
  // Right-aligned: the block ends at the edge. Individual rows may stop a cell
  // short, because a glyph's own last column can be blank ("%" is ` ╱ `).
  const rightmost = Math.max(...drawn.map((line) => line.trimEnd().length));
  assertEquals(rightmost, 20, `the block should reach the right edge:\n${lines.join("\n")}`);
  const leftmost = Math.min(...drawn.map((line) => line.length - line.trimStart().length));
  assert(leftmost > 0, "and not start at it");
});

Deno.test("a strip joins its history and marks the present", () => {
  const samples = Array.from({ length: 40 }, (_, index) => ({ value: index / 39, at: index }));
  const frame = strip.render(samples, { size: { width: 30, height: 8 }, theme: THEME, domain: { min: 0, max: 1 } });
  const text = frameToText(frame).join("\n");
  assert(text.includes("●"), "the newest reading is marked");
  assert(text.includes("─"), "the rest is a line");
  // Rising history ends at the top and starts at the bottom.
  assertEquals(frame[7]!.findIndex((cell) => cell.char !== " "), 0);
  assert(frame[0]!.some((cell) => cell.char !== " "), "the last samples reach the top");
});

Deno.test("a honeycomb spends area, so it holds entries neither axis could", () => {
  const values = Array.from({ length: 88 }, (_, index) => index / 87);
  const frame = hexgrid.render(values, { size: { width: 40, height: 14 }, theme: THEME, domain: { min: 0, max: 1 } });
  assert(inked(frame) > 88, "every entry got at least a cell");
  // Rows alternate their offset, which is what makes it read as a honeycomb.
  const firstInk = (row: number) => frame[row]!.findIndex((cell) => cell.char !== " ");
  assert(firstInk(0) !== firstInk(2), `rows 0 and 2 should be offset: ${firstInk(0)} vs ${firstInk(2)}`);
});

Deno.test("an overlay tells its series apart by glyph as well as by colour", () => {
  const series = [0, 1, 2].map((k) => Array.from({ length: 40 }, (_, i) => (Math.sin(i / 6 + k * 2) + 1) / 2));
  const frame = overlay.render(series, { size: { width: 40, height: 9 }, theme: THEME, domain: { min: 0, max: 1 } });
  const glyphs = new Set(frame.flat().map((cell) => cell.char).filter((char) => char !== " "));
  assertEquals(glyphs.size, 3, `three series, three glyphs: ${[...glyphs].join("")}`);
  const colours = new Set(frame.flat().filter((cell) => cell.char !== " ").map((cell) => cell.foreground?.join(",")));
  assertEquals(colours.size, 3, "and three colours");
});
