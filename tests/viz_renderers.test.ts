// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { frameToText, type VizFrame } from "../src/viz/render.ts";
import { framesToRuns } from "../src/viz/view.ts";
import { bars, rack, scope, waterfall } from "../src/viz/renderers_vector.ts";
import { area, meter, psychograph, readout, sparkline } from "../src/viz/renderers_scalar.ts";
import { heatmap, lattice, volumeProjection } from "../src/viz/renderers_matrix.ts";
import { bestVisualization, drawStream, fitVisualizations, visualizationsFor } from "../src/viz/registry.ts";
import { scoreFit, type VizFit } from "../src/viz/fit.ts";
import { scalarStream, vectorStream, volumeStream } from "../src/viz/stream.ts";
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

Deno.test("a frame becomes runs, not one component per cell", () => {
  // A 40-wide bar of one colour must cost one component, not forty.
  const theme = defaultVisualizationTheme();
  const frame = meter.render(1, { size: { width: 40, height: 1 }, theme, domain: { min: 0, max: 1 } });
  const runs = framesToRuns(frame);
  assertEquals(runs.length, 1, `a solid bar split into ${runs.length} runs`);
  assertEquals(runs[0]!.text.length, 40);
});

Deno.test("runs carry their own colour, and blank space costs nothing", () => {
  const theme = defaultVisualizationTheme();
  // A half meter is filled cells then dotted ones: two runs, two colours.
  const frame = meter.render(0.5, { size: { width: 10, height: 1 }, theme, domain: { min: 0, max: 1 } });
  const runs = framesToRuns(frame);
  assert(runs.length >= 2, `expected filled and empty runs, got ${runs.length}`);
  assert(runs.some((run) => run.foreground !== undefined));
});

Deno.test("a readout is the last rung: the value as text, in one cell if need be", () => {
  const theme = defaultVisualizationTheme();
  const context = { size: { width: 4, height: 1 }, theme, domain: { min: 0, max: 1 } };
  assertEquals(frameToText(readout.render(0.2, context))[0], " 20%");
  // A caller that knows the unit supplies the words.
  assertEquals(
    frameToText(readout.render(2048, { ...context, size: { width: 6, height: 1 }, format: () => "2.0K/s" }))[0],
    "2.0K/s",
  );
  // Narrower than the text: keep the digits, drop the front, never pad-truncate
  // into a number that reads as a different one.
  assertEquals(frameToText(readout.render(1, { ...context, size: { width: 2, height: 1 } }))[0], "0%");
});

Deno.test("a readout is offered where nothing else fits", () => {
  const tiny = visualizationsFor("0dt", { width: 2, height: 1 }).map((visualization) => visualization.id);
  assert(tiny.includes("readout"), `nothing could draw a 2x1 box: ${tiny.join(",")}`);
});

Deno.test("what suits the data depends on how much of it there is", () => {
  // The case that motivated fitness scoring: the same tile, the same kind of
  // data, a different number of entries.
  const tile = { width: 40, height: 10 };
  const fourCores = fitVisualizations({ kind: "1dt", extent: [4] }, tile);
  const manyCores = fitVisualizations({ kind: "1dt", extent: [88] }, tile);

  // Renderer for renderer: a bar chart wanting a column each is crowded by 88
  // entries and not by 4. Comparing the two winners would not say this — the
  // winner changes identity, because a renderer that resamples is unbothered by
  // the count and takes the lead once there is a lot of data.
  const scoreOf = (fits: readonly VizFit[], id: string) => fits.find((fit) => fit.id === id)!.score;
  assert(
    scoreOf(manyCores, "bars") < scoreOf(fourCores, "bars"),
    `88 bars should score worse than 4 in the same tile: ${scoreOf(manyCores, "bars")} vs ${
      scoreOf(fourCores, "bars")
    }`,
  );
  assertEquals(fourCores.find((fit) => fit.id === "bars")!.reason, "fits comfortably");
  assert(
    manyCores.some((fit) => fit.reason.includes("88")),
    `some candidate should name the crowding: ${manyCores.map((fit) => fit.reason).join(", ")}`,
  );
});

Deno.test("a rack suits a handful of entries and a waterfall suits many", () => {
  // A rack spends a row per entry, so eight rows hold eight of them and no more.
  const short = { width: 30, height: 8 };
  const forEight = fitVisualizations({ kind: "1d", extent: [8] }, short);
  const forEighty = fitVisualizations({ kind: "1d", extent: [80] }, short);
  const rackFor = (fits: typeof forEight) => fits.find((fit) => fit.id === "rack")!.score;
  assert(rackFor(forEight) > rackFor(forEighty), "a rack of eighty rows in eight rows is not a rack");
});

Deno.test("a tile that grows earns a richer visualisation", () => {
  const shape = { kind: "0dt" as const };
  const tiny = fitVisualizations(shape, { width: 20, height: 1 })[0]!;
  const roomy = fitVisualizations(shape, { width: 40, height: 12 })[0]!;
  assertEquals(tiny.id, "sparkline", "one row can only be a sparkline");
  assertEquals(roomy.id, "area", "given a box, the filled view wins");
  const alternatives = fitVisualizations(shape, { width: 40, height: 12 }).map((fit) => fit.id);
  assert(alternatives.includes("psychograph"), "the others stay available for the settings page to offer");
});

Deno.test("something is always drawable, however small the tile", () => {
  const best = bestVisualization({ kind: "0dt" }, { width: 2, height: 1 });
  assert(best, "a 2x1 tile still has to show something");
  assertEquals(best.id, "sparkline");
  assertEquals(bestVisualization({ kind: "0d" }, { width: 1, height: 1 })?.id, "readout");
});

Deno.test("an area chart fills from the baseline, so the trend has an edge to follow", () => {
  const theme = defaultVisualizationTheme();
  const rising = Array.from({ length: 20 }, (_, index) => ({ value: index / 19, at: index }));
  const frame = area.render(rising, { size: { width: 20, height: 8 }, theme, domain: { min: 0, max: 1 } });
  const lines = frameToText(frame);
  // The bottom row is full across, because every column has some value above the
  // baseline; the top row is not, because only the last columns reach it.
  assertEquals(lines.at(-1)!.trim().length, 20, `bottom row: "${lines.at(-1)}"`);
  assert(lines[0]!.trim().length < 20, `top row should not be full: "${lines[0]}"`);
  // Nothing floats: a filled column is contiguous down to the baseline.
  for (let column = 0; column < 20; column += 1) {
    let seenInk = false;
    for (let row = 7; row >= 0; row -= 1) {
      const filled = frame[row]![column]!.char !== " ";
      if (!filled && seenInk) continue;
      if (filled) seenInk = true;
    }
    assert(seenInk, `column ${column} drew nothing at all`);
  }
});

Deno.test("crowding is reported separately from the score, because it answers a different question", () => {
  const roomy = scoreFit({ id: "bars", minimum: { width: 2, height: 2 }, perEntry: { columns: 1 } }, {
    kind: "1d",
    extent: [8],
  }, { width: 40, height: 10 });
  const packed = scoreFit({ id: "bars", minimum: { width: 2, height: 2 }, perEntry: { columns: 1 } }, {
    kind: "1d",
    extent: [88],
  }, { width: 10, height: 10 });
  assertEquals(roomy.crowding, 1);
  assert(packed.crowding < 0.2, `88 entries in 10 columns is ${packed.crowding}`);
  assert(packed.score > 0, "still rankable — it is the caller that decides it is not worth drawing");
});

Deno.test("a bar chart's baseline is zero, so the smallest bar is not always empty", () => {
  const theme = defaultVisualizationTheme();
  // Two throughput readings with no declared domain. Scaled to their own range,
  // the smaller one normalises to 0 and draws nothing — every pair of bars
  // would show one full and one empty, whatever the numbers.
  const frame = bars.render([1_019_000, 698_000], { size: { width: 4, height: 4 }, theme });
  const lines = frameToText(frame);
  const rightHalf = lines.map((line) => line.slice(2)).join("");
  assert(rightHalf.trim().length > 0, `the smaller bar drew nothing:\n${lines.join("\n")}`);
});

Deno.test("a caller's domain still wins over the baseline", () => {
  const theme = defaultVisualizationTheme();
  const frame = bars.render([0.5, 0.5], { size: { width: 4, height: 4 }, theme, domain: { min: 0, max: 1 } });
  const lines = frameToText(frame);
  // Half of four rows, both bars alike, because the domain says what full means.
  assertEquals(lines[0]!.trim(), "", `top row should be empty:\n${lines.join("\n")}`);
  assertEquals(lines[3]!.length, 4);
});

Deno.test("a field renderer given too little data loses to one that suits it", () => {
  // Two entries is not a spectrogram, however comfortably it fits — so the
  // field renderers rank below everything that suits two of anything.
  const pair = fitVisualizations({ kind: "1dt", extent: [2] }, { width: 40, height: 10 });
  const waterfall = pair.find((fit) => fit.id === "waterfall")!;
  assert(waterfall.reason.includes("wants"), waterfall.reason);
  assert(pair.indexOf(waterfall) > 2, `a spectrogram of two should not be near the top: ${pair.map((f) => f.id)}`);
  assert(pair[0]!.score > waterfall.score * 2);
  // Twenty-eight is, and it wins the same box back.
  assertEquals(fitVisualizations({ kind: "1dt", extent: [28] }, { width: 40, height: 10 })[0]!.id, "waterfall");
});

Deno.test("a trace is continuous: no gap between two samples a long way apart", () => {
  const theme = defaultVisualizationTheme();
  // A square wave: alternating extremes, which is the case a scatter of points
  // draws as two dotted rows with nothing joining them.
  const values = Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? 0 : 1));
  const frame = scope.render(values, { size: { width: 12, height: 7 }, theme, domain: { min: 0, max: 1 } });
  for (let column = 1; column < 12; column += 1) {
    const inked = frame.map((row) => row[column]!.char !== " ");
    const first = inked.indexOf(true);
    const last = inked.lastIndexOf(true);
    assert(first >= 0, `column ${column} drew nothing`);
    for (let row = first; row <= last; row += 1) {
      assert(inked[row], `column ${column} has a hole at row ${row}`);
    }
  }
});

Deno.test("a trace resamples rather than demanding a column per point", () => {
  // 256 waveform points in 40 columns is a coarse curve, not an unusable one —
  // so unlike bars it takes no crowding penalty for carrying a lot of data.
  const many = fitVisualizations({ kind: "1d", extent: [256] }, { width: 40, height: 10 });
  assertEquals(many.find((fit) => fit.id === "scope")!.crowding, 1);
  assert(many.find((fit) => fit.id === "bars")!.crowding < 0.2);
  // It still wants enough points to have a shape.
  const pair = fitVisualizations({ kind: "1d", extent: [2] }, { width: 40, height: 10 });
  assert(pair.find((fit) => fit.id === "scope")!.score < pair.find((fit) => fit.id === "bars")!.score);
});

Deno.test("a psychograph draws one series or several, from whichever shape carries them", () => {
  const theme = defaultVisualizationTheme();
  const size = { width: 30, height: 7 };
  const rising = Array.from({ length: 30 }, (_, index) => ({ value: index / 29, at: index }));

  // One series: the value ramp and one pip, exactly as before.
  const single = psychograph.render(rising, { size, theme, domain: { min: 0, max: 1 } });
  const singleGlyphs = new Set(single.flat().map((cell) => cell.char).filter((char) => char !== " "));
  assertEquals(singleGlyphs, new Set(["■"]));

  // Several series over time, transposed out of a history of vectors — which is
  // the shape a sampler produces and the opposite of the shape a chart wants.
  const overTime = Array.from({ length: 30 }, (_, index) => ({ value: [index / 29, 1 - index / 29], at: index }));
  const pair = psychograph.render(overTime, { size, theme, domain: { min: 0, max: 1 } });
  const pairGlyphs = new Set(pair.flat().map((cell) => cell.char).filter((char) => char !== " "));
  assert(pairGlyphs.has("■") && pairGlyphs.has("●"), `two series, two pips: ${[...pairGlyphs].join("")}`);

  // Several series at one instant, as a matrix — left and right spectra.
  const spectra = psychograph.render([[0.2, 0.8, 0.4], [0.3, 0.7, 0.5]], { size, theme, domain: { min: 0, max: 1 } });
  const spectraGlyphs = new Set(spectra.flat().map((cell) => cell.char).filter((char) => char !== " "));
  assert(spectraGlyphs.has("■") && spectraGlyphs.has("●"));
});

Deno.test("two series meeting draw the crossing rather than hiding one of them", () => {
  const theme = defaultVisualizationTheme();
  // Identical series: every point collides. Two audio channels agree most of the
  // time, and a chart that silently drops one for it says they differ.
  const same = [[0.1, 0.5, 0.9], [0.1, 0.5, 0.9]];
  const frame = psychograph.render(same, { size: { width: 12, height: 6 }, theme, domain: { min: 0, max: 1 } });
  const glyphs = frame.flat().map((cell) => cell.char).filter((char) => char !== " ");
  assert(glyphs.every((glyph) => glyph === "╋"), `every point should be a crossing: ${[...new Set(glyphs)].join("")}`);
});

Deno.test("a psychograph is not offered for more lines than anyone can read", () => {
  const size = { width: 60, height: 16 };
  assert(fitVisualizations({ kind: "1dt", extent: [4] }, size).some((fit) => fit.id === "psychograph"));
  assert(!fitVisualizations({ kind: "1dt", extent: [40] }, size).some((fit) => fit.id === "psychograph"));
  // A scalar history is one line whatever its extent says.
  assert(fitVisualizations({ kind: "0dt", extent: [1] }, size).some((fit) => fit.id === "psychograph"));
});

Deno.test("pairing a stream with a visualisation that cannot draw it still throws", () => {
  const volume = volumeStream({ capacity: 2 });
  assertThrows(
    () =>
      drawStream(psychograph as never, volume, { size: { width: 10, height: 5 }, theme: defaultVisualizationTheme() }),
    TypeError,
    "psychograph draws 0dt or 1dt or 2d",
  );
});
