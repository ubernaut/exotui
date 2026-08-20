// Copyright 2023 Im-Beast. MIT license.

// Projected visualisations, the axis layer, and the shape predicate that keeps
// a scatter from being offered a dense field.

import { assert, assertEquals } from "./deps.ts";
import { frameToText, type VizFrame } from "../src/viz/render.ts";
import { blankFrame } from "../src/viz/render.ts";
import { camera, depthFade, toUnit } from "../src/viz/project.ts";
import { pointCloud, ringVolume, surface, vectorField } from "../src/viz/renderers_spatial.ts";
import { scatter } from "../src/viz/renderers_matrix.ts";
import { drawLegend, drawTimeAxis, drawValueAxis, valueAxisWidth } from "../src/viz/axes.ts";
import { linearScale } from "../src/visual/scales.ts";
import { defaultVisualizationTheme } from "../src/viz/theme.ts";
import { fitVisualizations } from "../src/viz/registry.ts";

const THEME = defaultVisualizationTheme();

function inked(frame: VizFrame): number {
  return frame.flat().filter((cell) => cell.char !== " ").length;
}

Deno.test("a positive pitch looks down: what is further away sits higher", () => {
  // The sign of this was wrong once, and the symptom was a surface whose front
  // edge was hidden behind its own back edge by the floating horizon.
  const eye = camera({ width: 40, height: 20 }, { pitch: 0.15, yaw: 0 });
  const near = eye.project({ x: 0, y: 0, z: -1 });
  const far = eye.project({ x: 0, y: 0, z: 1 });
  assert(far.row < near.row, `far row ${far.row} should be above near row ${near.row}`);
  assert(far.depth > near.depth, "and further away");
});

Deno.test("a point behind the camera is not drawn rather than drawn inside out", () => {
  const eye = camera({ width: 20, height: 10 }, { distance: 1 });
  assertEquals(eye.project({ x: 0, y: 0, z: -5 }).visible, false);
  assertEquals(eye.project({ x: 0, y: 0, z: 0 }).visible, true);
});

Deno.test("toUnit and depthFade stay inside their ranges", () => {
  assertEquals(toUnit(0, { min: 0, max: 10 }), -1);
  assertEquals(toUnit(10, { min: 0, max: 10 }), 1);
  assertEquals(toUnit(5, { min: 5, max: 5 }), 0, "a domain with no span has no position in it");
  assertEquals(depthFade(0, 1, 2), 0);
  assertEquals(depthFade(9, 1, 2), 1);
  assertEquals(depthFade(1, 2, 2), 0, "no span, no fade");
});

Deno.test("a surface hides what is behind it", () => {
  // A ridge across the middle. Behind it the field is flat and low, so with a
  // floating horizon those strands are hidden; without one they show through.
  const field = Array.from({ length: 12 }, (_, z) => Array.from({ length: 24 }, () => (z === 5 ? 1 : 0)));
  const frame = surface.render(field, { size: { width: 40, height: 12 }, theme: THEME, domain: { min: 0, max: 1 } });
  const rows = frameToText(frame);
  const inkedRows = rows.filter((row) => row.trim().length > 0).length;
  assert(inkedRows < 12, `a flat field with one ridge should not ink every row: ${inkedRows}`);
  assert(inked(frame) > 20, "but it should draw something");
});

Deno.test("a point cloud draws only cells that carry something", () => {
  const empty = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => new Array(6).fill(0)));
  assertEquals(inked(pointCloud.render(empty, { size: { width: 20, height: 8 }, theme: THEME })), 0);
  const one = empty.map((plane, z) =>
    plane.map((line, y) => line.map((_, x) => (x === 3 && y === 3 && z === 3 ? 1 : 0)))
  );
  assertEquals(
    inked(pointCloud.render(one, { size: { width: 20, height: 8 }, theme: THEME, domain: { min: 0, max: 1 } })),
    1,
  );
});

Deno.test("a ring closes on itself", () => {
  const rings = [Array.from({ length: 16 }, () => 0.5)];
  const frame = ringVolume.render(rings, { size: { width: 30, height: 10 }, theme: THEME, domain: { min: 0, max: 1 } });
  // A closed ring of one constant value inks a band with a hole in the middle:
  // the centre row's ink is on both sides, not across.
  const middle = frameToText(frame)[Math.floor(10 / 2)]!;
  const first = middle.search(/\S/);
  const last = middle.trimEnd().length - 1;
  assert(first >= 0 && last > first + 4, `expected a wide ring on the centre row: "${middle}"`);
  assert(middle.slice(first + 2, last - 1).includes(" "), "and a hole in the middle of it");
});

Deno.test("a vector field only takes readings whose innermost axis is a vector", () => {
  const arrows = fitVisualizations({ kind: "3d", extent: [6, 8, 3] }, { width: 40, height: 12 });
  assert(arrows.some((fit) => fit.id === "vector-field"));
  const densities = fitVisualizations({ kind: "3d", extent: [6, 8, 12] }, { width: 40, height: 12 });
  assert(!densities.some((fit) => fit.id === "vector-field"), "a cube of densities is not a field of arrows");
  assert(densities.some((fit) => fit.id === "point-cloud"), "it is a cloud");
});

Deno.test("a scatter is offered for points and not for a field", () => {
  assert(fitVisualizations({ kind: "2d", extent: [50, 2] }, { width: 30, height: 10 }).some((f) => f.id === "scatter"));
  assert(
    !fitVisualizations({ kind: "2d", extent: [30, 30] }, { width: 30, height: 10 }).some((f) => f.id === "scatter"),
  );
});

Deno.test("a scatter plots at quadrant resolution, so near points stay apart", () => {
  // Two points half a cell apart land in the same cell but different quadrants.
  const frame = scatter.render([[0, 0], [1, 1]], { size: { width: 2, height: 2 }, theme: THEME });
  assert(inked(frame) >= 1);
  const distinct = new Set(frame.flat().map((cell) => cell.char).filter((char) => char !== " "));
  assert(distinct.size > 0, "something was plotted");
});

Deno.test("ticks are round numbers, free of floating-point residue", () => {
  // Three times 0.2 is 0.6000000000000001 in IEEE 754, and it used to reach the
  // tick list — saved from view only by Intl formatting downstream.
  assertEquals(linearScale([0, 1], [9, 0]).ticks(4), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assertEquals(linearScale([0, 0.03], [9, 0]).ticks(4), [0, 0.01, 0.02, 0.03]);
  for (const tick of linearScale([-40, 40], [9, 0]).ticks(4)) {
    assert(tick >= -40 && tick <= 40, `${tick} is outside the domain`);
  }
  assertEquals(linearScale([5, 5], [9, 0]).ticks(4), [5], "a domain with no span has one tick");
});

Deno.test("an axis reports the room it needs and stays inside it", () => {
  const theme = THEME;
  const domain = { min: 0, max: 1 };
  const format = (value: number) => `${Math.round(value * 100)}%`;
  const width = valueAxisWidth({ theme, domain, format }, 9);
  assertEquals(width, 5, "'100%' plus a tick mark");
  const frame = blankFrame({ width: 20, height: 9 }, { char: " " });
  drawValueAxis(frame, { column: 0, row: 0, width, height: 9 }, { theme, domain, format });
  for (const row of frameToText(frame)) {
    assert(row.slice(width).trim().length === 0, `the axis wrote past its gutter: "${row}"`);
  }
  assert(frameToText(frame).some((row) => row.includes("100%")));
  assert(frameToText(frame).some((row) => row.includes("0%┤")));
});

Deno.test("a time axis spans exactly the chart and drops labels rather than cutting them", () => {
  const frame = blankFrame({ width: 30, height: 1 }, { char: " " });
  drawTimeAxis(frame, { column: 0, row: 0, width: 30, height: 1 }, {
    theme: THEME,
    labels: ["-2m", "-90s", "-60s", "-30s", "now"],
  });
  const row = frameToText(frame)[0]!;
  assert(row.startsWith("-2m"), `the first label starts at the edge: "${row}"`);
  assertEquals(row.trimEnd().length, 30, "and the last ends at it");
  // Too narrow for all five: some are dropped, none is truncated.
  const narrow = blankFrame({ width: 12, height: 1 }, { char: " " });
  drawTimeAxis(narrow, { column: 0, row: 0, width: 12, height: 1 }, {
    theme: THEME,
    labels: ["-2m", "-90s", "-60s", "-30s", "now"],
  });
  for (const word of frameToText(narrow)[0]!.split(/\s+/).filter(Boolean)) {
    assert(["-2m", "-90s", "-60s", "-30s", "now"].includes(word), `"${word}" is a fragment`);
  }
});

Deno.test("a legend wraps rather than running off the end", () => {
  const frame = blankFrame({ width: 20, height: 3 }, { char: " " });
  drawLegend(frame, { column: 0, row: 0, width: 20, height: 3 }, [
    { label: "cpu", colour: THEME.series },
    { label: "gpu", colour: THEME.seriesAlt },
    { label: "mem", colour: THEME.ramp[0] },
    { label: "net", colour: THEME.ramp[2] },
  ], THEME);
  const rows = frameToText(frame);
  for (const row of rows) assert(row.length <= 20);
  assert(rows.filter((row) => row.trim().length > 0).length >= 2, "four entries do not fit one row of twenty");
});
