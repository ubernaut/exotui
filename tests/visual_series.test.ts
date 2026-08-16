// Copyright 2023 Im-Beast. MIT license.

// VIS-003: clipping, missing values, multiple scales, and zero-sized
// viewports have golden fixtures.

import { assert, assertEquals } from "./deps.ts";
import { linearScale, renderSeries, renderStackedArea } from "../mod.ts";

const X5 = linearScale([0, 4], [0, 4]);
const Y3 = linearScale([0, 2], [2, 0]);

Deno.test("golden: line, stepped-line, and scatter with a missing gap", () => {
  assertEquals(
    renderSeries([{ x: 0, y: 1 }, { x: 4, y: 1 }], { kind: "line", xScale: X5, yScale: Y3, width: 5, height: 3 }),
    ["     ", "·····", "     "],
  );
  assertEquals(
    renderSeries([{ x: 0, y: 0 }, { x: 4, y: 2 }], {
      kind: "stepped-line",
      xScale: X5,
      yScale: Y3,
      width: 5,
      height: 3,
    }),
    ["    ·", "    ·", "·····"],
  );
  assertEquals(
    renderSeries([{ x: 0, y: 0 }, { x: 2, y: null }, { x: 4, y: 2 }], {
      kind: "scatter",
      xScale: X5,
      yScale: Y3,
      width: 5,
      height: 3,
    }),
    ["    ●", "     ", "●    "],
  );
  // A missing value in a LINE breaks the polyline — no interpolation.
  const gapped = renderSeries([{ x: 0, y: 1 }, { x: 2, y: null }, { x: 4, y: 1 }], {
    kind: "line",
    xScale: X5,
    yScale: Y3,
    width: 5,
    height: 3,
  });
  assertEquals(gapped[1], "·   ·"); // two isolated marks, gap visible
});

Deno.test("golden: area fill and stacked bands keep their glyphs", () => {
  const X4 = linearScale([0, 3], [0, 3]);
  const Y4 = linearScale([0, 3], [3, 0]);
  assertEquals(
    renderSeries([{ x: 0, y: 1 }, { x: 3, y: 1 }], { kind: "area", xScale: X4, yScale: Y4, width: 4, height: 4 }),
    ["    ", "    ", "████", "████"],
  );
  assertEquals(
    renderStackedArea(
      [
        [{ x: 0, y: 1 }, { x: 3, y: 1 }],
        [{ x: 0, y: 1 }, { x: 3, y: 1 }],
      ],
      { xScale: X4, yScale: Y4, width: 4, height: 4 },
    ),
    ["    ", "▓▓▓▓", "████", "████"],
  );
});

Deno.test("golden: out-of-window data clips to the viewport edge", () => {
  // The x domain window is [0, 4] but data runs to x=8: the segment
  // clamps at the right edge instead of escaping the grid.
  const clipped = renderSeries([{ x: 0, y: 1 }, { x: 8, y: 1 }], {
    kind: "line",
    xScale: X5,
    yScale: Y3,
    width: 5,
    height: 3,
  });
  assertEquals(clipped, ["     ", "·····", "     "]);
  // Fully out-of-range y clamps to the boundary row, never out of grid.
  const highY = renderSeries([{ x: 0, y: 99 }, { x: 4, y: 99 }], {
    kind: "line",
    xScale: X5,
    yScale: Y3,
    width: 5,
    height: 3,
  });
  assertEquals(highY[0], "·····");
});

Deno.test("golden: multiple scales share one viewport grid", () => {
  const yPercent = linearScale([0, 100], [2, 0]);
  const first = renderSeries([{ x: 0, y: 2 }, { x: 4, y: 2 }], {
    kind: "line",
    xScale: X5,
    yScale: Y3,
    width: 5,
    height: 3,
  });
  // Overlay a second series with a DIFFERENT y scale onto the same grid.
  const grid = first.map((line) => line.split(""));
  const combined = renderSeries([{ x: 0, y: 0 }, { x: 4, y: 0 }], {
    kind: "line",
    xScale: X5,
    yScale: yPercent,
    width: 5,
    height: 3,
    glyph: "*",
    grid,
  });
  assertEquals(combined, ["·····", "     ", "*****"]); // both scales coexist
});

Deno.test("golden: zero-sized viewports render nothing and never crash", () => {
  const options = { kind: "line" as const, xScale: X5, yScale: Y3 };
  assertEquals(renderSeries([{ x: 0, y: 1 }], { ...options, width: 0, height: 3 }), []);
  assertEquals(renderSeries([{ x: 0, y: 1 }], { ...options, width: 5, height: 0 }), []);
  assertEquals(renderStackedArea([[{ x: 0, y: 1 }]], { xScale: X5, yScale: Y3, width: 0, height: 0 }), []);
});
