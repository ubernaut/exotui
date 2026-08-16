// Copyright 2023 Im-Beast. MIT license.

// VIS-007: interactions are reversible, scale-aware, and expose semantic
// selected data rather than only cells.

import { assert, assertEquals } from "./deps.ts";
import { createChartInteractionController } from "../mod.ts";

const POINTS = Array.from({ length: 101 }, (_, index) => ({ x: index, y: index * 2 }));

function controller() {
  return createChartInteractionController({
    xDomain: [0, 100],
    yDomain: [0, 200],
    xRange: [0, 50],
    yRange: [20, 0], // screen y inverted
    points: POINTS,
  });
}

Deno.test("crosshair inverts cells to data and finds the nearest point", () => {
  const chart = controller();
  const state = chart.crosshair(25, 10);
  assertEquals(state.dataX, 50);
  assertEquals(state.dataY, 100);
  assertEquals(state.nearest, { x: 50, y: 100 });
  // Off-grid cells still resolve semantically.
  const between = chart.crosshair(25.4, 10);
  assertEquals(between.nearest!.x, 51);
});

Deno.test("pan and zoom are scale-aware and exactly reversible", () => {
  const chart = controller();
  const initial = chart.domains();

  chart.pan(5); // 5 cells = 10 data units
  assertEquals(chart.domains().x, [-10, 90]);
  chart.zoom(2, 25); // around data x=60 now under cell 25... anchor computed live
  const zoomed = chart.domains().x;
  assert(zoomed[1] - zoomed[0] === 50); // half the span

  // Reversible: two undos restore the exact original domain.
  assert(chart.undo());
  assertEquals(chart.domains().x, [-10, 90]);
  assert(chart.undo());
  assertEquals(chart.domains(), initial);
  assert(!chart.undo());
});

Deno.test("zooming keeps the anchor's data value under the anchor cell", () => {
  const chart = controller();
  const anchorCell = 10;
  const before = chart.crosshair(anchorCell, 0).dataX;
  chart.zoom(4, anchorCell);
  const after = chart.crosshair(anchorCell, 0).dataX;
  assert(Math.abs(before - after) < 1e-9);
});

Deno.test("brushing returns semantic points and the domain rectangle", () => {
  const chart = controller();
  const selection = chart.brush(10, 20, 20, 0); // cells, any corner order
  assertEquals(selection.domain.x0, 20);
  assertEquals(selection.domain.x1, 40);
  assertEquals(selection.domain.y0, 0);
  assertEquals(selection.domain.y1, 200);
  assertEquals(selection.points.length, 21); // x in [20, 40]
  assertEquals(selection.points[0], { x: 20, y: 40 }); // data, not cells
  // After a zoom the same CELLS select different DATA — scale-aware.
  chart.zoom(2, 25);
  const zoomedSelection = chart.brush(10, 20, 20, 0);
  assert(zoomedSelection.domain.x1 - zoomedSelection.domain.x0 < 21);
});
