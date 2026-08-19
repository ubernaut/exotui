// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { frameToText, type VizFrame } from "../src/viz/render.ts";
import { bars, rack, waterfall } from "../src/viz/renderers_vector.ts";
import { meter, psychograph, sparkline } from "../src/viz/renderers_scalar.ts";
import { heatmap, lattice, volumeProjection } from "../src/viz/renderers_matrix.ts";
import { drawStream, visualizationsFor } from "../src/viz/registry.ts";
import { scalarStream, vectorStream } from "../src/viz/stream.ts";
import { defaultVisualizationTheme } from "../src/viz/theme.ts";

const theme = defaultVisualizationTheme();
const at = (width: number, height: number) => ({ size: { width, height }, theme });

/** Non-blank cells, which is how "did it draw anything" is asked. */
function inked(frame: VizFrame): number {
  return frame.flatMap((row) => [...row]).filter((cell) => cell.char !== " ").length;
}

Deno.test("a meter fills in proportion, and reaches both ends", () => {
  const empty = frameToText(meter.render(0, { ...at(10, 1), domain: { min: 0, max: 1 } }))[0]!;
  const full = frameToText(meter.render(1, { ...at(10, 1), domain: { min: 0, max: 1 } }))[0]!;
  assertEquals(full, "██████████");
  assert(!empty.includes("█"), `an empty meter drew filled cells: ${empty}`);
  const half = frameToText(meter.render(0.5, { ...at(10, 1), domain: { min: 0, max: 1 } }))[0]!;
  assertEquals(half.split("").filter((char) => char === "█").length, 5);
});

Deno.test("a meter moves within a single cell, so a narrow one is not stuck", () => {
  // Whole blocks alone give a 4-wide meter five states; sub-cell glyphs give it
  // thirty-three, which is the difference between a readable meter and a stuck one.
  const a = frameToText(meter.render(0.03, { ...at(4, 1), domain: { min: 0, max: 1 } }))[0]!;
  const b = frameToText(meter.render(0.10, { ...at(4, 1), domain: { min: 0, max: 1 } }))[0]!;
  assert(a !== b, `the meter did not move between 3% and 10%: ${a} vs ${b}`);
});

Deno.test("a sparkline draws one glyph per column and tracks its domain", () => {
  const samples = [0, 1, 2, 3, 4].map((value, index) => ({ at: index, value }));
  const row = frameToText(sparkline.render(samples, at(5, 1)))[0]!;
  assertEquals(row.length, 5);
  assertEquals(row[0], "▁", "the lowest value sits at the bottom glyph");
  assertEquals(row.at(-1), "█", "the highest fills the cell");
});

Deno.test("a psychograph plots history across the whole box, high values high", () => {
  const samples = [0, 0.5, 1].map((value, index) => ({ at: index, value }));
  const rows = frameToText(psychograph.render(samples, { ...at(3, 5), domain: { min: 0, max: 1 } }));
  assertEquals(rows.length, 5);
  // Lowest value plots on the bottom row, highest on the top.
  assert(rows[4]!.startsWith("■"), `expected the 0 sample on the bottom row, got ${JSON.stringify(rows)}`);
  assert(rows[0]!.endsWith("■"), `expected the 1 sample on the top row, got ${JSON.stringify(rows)}`);
});

Deno.test("bars give every entry a column, however narrow the box", () => {
  // Eight cores in ten columns must still show eight bars' worth of variation.
  const values = [0, 1, 0, 1, 0, 1, 0, 1];
  const rows = frameToText(bars.render(values, { ...at(10, 4), domain: { min: 0, max: 1 } }));
  const bottom = rows[3]!;
  assert(bottom.includes("█"), "the full entries drew nothing");
  assert(bottom.includes(" "), "the empty entries were drawn as full");
});

Deno.test("a rack labels its rows and prints a percentage", () => {
  const rows = frameToText(rack.render([0.5, 1], { ...at(20, 2), domain: { min: 0, max: 1 } }));
  assert(rows[0]!.startsWith("0"), `row 0 was not labelled: ${rows[0]}`);
  assert(rows[0]!.includes("50"), `row 0 lacked its value: ${rows[0]}`);
  assert(rows[1]!.includes("100"), `row 1 lacked its value: ${rows[1]}`);
});

Deno.test("a waterfall puts the newest reading on top", () => {
  const samples = [
    { at: 1, value: [0, 0] },
    { at: 2, value: [1, 1] },
  ];
  const rows = frameToText(waterfall.render(samples, { ...at(2, 2), domain: { min: 0, max: 1 } }));
  assertEquals(rows[0], "██", "the newest reading belongs on the row the eye starts at");
  assertEquals(rows[1], "··", "and the older one below it");
  // Intensity is carried by the glyph, not only by colour, so a mid reading is
  // distinguishable from a full one on a monochrome terminal.
  const mid = frameToText(
    waterfall.render([{ at: 1, value: [0.5, 0.5] }], { ...at(2, 1), domain: { min: 0, max: 1 } }),
  )[0]!;
  assert(mid !== "██" && mid.trim().length > 0, `a half reading drew as ${JSON.stringify(mid)}`);
});

Deno.test("a heatmap stretches a small grid across a large box", () => {
  const grid = [[0, 1], [1, 0]];
  const frame = heatmap.render(grid, { ...at(8, 4), domain: { min: 0, max: 1 } });
  assertEquals(frame.length, 4);
  assertEquals(frame[0]!.length, 8);
  assert(inked(frame) > 0, "a 2x2 grid in an 8x4 box drew nothing");
});

Deno.test("the 2D lattice draws a profile over a reference line", () => {
  const samples = [{ at: 1, value: [0, 0.5, 1] }];
  const rows = frameToText(lattice.render(samples, { ...at(9, 5), domain: { min: 0, max: 1 } }));
  assert(rows.some((row) => row.includes("─")), "the reference line is missing");
  assert(rows.some((row) => row.includes("▄")), "the profile is missing");
});

Deno.test("a volume is projected by its peaks, not its averages", () => {
  // A monitor watches for peaks; averaging two slices would hide a spike in one.
  const volume = [[[0, 0], [0, 0]], [[1, 0], [0, 0]]];
  const frame = volumeProjection.render(volume, { ...at(4, 2), domain: { min: 0, max: 1 } });
  assert(inked(frame) > 0, "the peak in the second slice was lost");
});

Deno.test("the registry offers only visualisations that can draw the stream", () => {
  const forScalar = visualizationsFor("0dt").map((visualization) => visualization.id);
  assert(forScalar.includes("sparkline"));
  assert(forScalar.includes("psychograph"));
  assert(forScalar.includes("meter"), "a 0dt stream can also feed a 0d meter");
  assert(!forScalar.includes("waterfall"), "rank never converts");

  // And size filters: a psychograph needs room its minimum declares.
  const tiny = visualizationsFor("0dt", { width: 4, height: 1 }).map((v) => v.id);
  assert(!tiny.includes("psychograph"), "a 4x1 box cannot draw a psychograph");
  assert(tiny.includes("sparkline"));
});

Deno.test("drawing a stream hands each renderer the shape it declared", () => {
  const load = scalarStream({ domain: { min: 0, max: 1 } });
  for (const value of [0.2, 0.5, 0.9]) load.push(value);
  // Temporal renderer gets history; momentary one gets the latest reading.
  assert(inked(drawStream(sparkline as never, load, at(3, 1))) > 0);
  assert(inked(drawStream(meter as never, load, at(10, 1))) > 0);
});

Deno.test("a mismatched pairing throws instead of drawing something wrong", () => {
  const cores = vectorStream();
  cores.push([0.1, 0.9]);
  assertThrows(
    () => drawStream(sparkline as never, cores, at(10, 1)),
    TypeError,
    "0dt",
  );
});

Deno.test("an empty stream draws an empty frame rather than throwing", () => {
  const load = scalarStream();
  const frame = drawStream(sparkline as never, load, at(6, 1));
  assertEquals(frame.length, 1);
  assertEquals(frame[0]!.length, 6);
});
