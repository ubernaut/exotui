// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { strokeCoverage, strokePattern, strokeSegmentCells } from "../src/content/mermaid_stroke.ts";
import { mermaidNativeLines, type MermaidScene, renderMermaidNativeFrame } from "../mod.mermaid.ts";

const paint = { fill: "none", stroke: "red", strokeWidth: 1, opacity: 1, dash: [] as number[] };

Deno.test("subpixel stroke traversal retains real cell crossings and exact dash intervals", () => {
  const from = { column: 44.7993, row: 199.625 };
  const to = { column: 46.7349, row: 201.406 };
  const cells = [...strokeSegmentCells(from, to)];
  assertEquals(cells.map(({ column, row }) => [column, row]), [[45, 200], [46, 200], [46, 201], [47, 201]]);
  assertEquals(
    [...strokeSegmentCells(to, from)].map(({ column, row }) => [column, row]),
    cells.map(({ column, row }) => [column, row]).reverse(),
  );
  assertEquals(cells[0]!.lower, 0);
  assertEquals(cells.at(-1)!.upper, 1);
  assert(cells.every((cell, index) => cell.upper >= cell.lower && (!index || cell.lower === cells[index - 1]!.upper)));
  const horizontal = [...strokeSegmentCells({ column: .2, row: .2 }, { column: 4.3, row: .2 })];
  assert(Math.abs(horizontal[0]!.upper - .3 / 4.1) < 1e-12);
  assertEquals([...strokeSegmentCells({ column: 2, row: 3 }, { column: 2, row: 3 })], [{
    column: 2,
    row: 3,
    lower: 0,
    upper: 1,
  }]);
  assertEquals(
    [...strokeSegmentCells({ column: 0, row: 0 }, { column: 2, row: 2 })].map(({ column, row }) => [column, row]),
    [[0, 0], [1, 1], [2, 2]],
  );
});

Deno.test("subpixel traversal agrees with independent segment-box intersections and bounds invalid work", () => {
  for (
    const [from, to] of [
      [{ column: .2, row: .3 }, { column: 9.7, row: 6.1 }],
      [{ column: 9.7, row: 6.1 }, { column: .2, row: .3 }],
      [{ column: -3.1, row: 5.9 }, { column: 7.2, row: -1.2 }],
      [{ column: 2.1, row: -2.7 }, { column: 2.1, row: 8.2 }],
    ]
  ) {
    const expected = new Set<string>();
    for (let row = -5; row <= 10; row++) {
      for (let column = -5; column <= 10; column++) {
        let lower = 0;
        let upper = 1;
        for (
          const [begin, end, min, max] of [[from!.column, to!.column, column - .5, column + .5], [
            from!.row,
            to!.row,
            row - .5,
            row + .5,
          ]]
        ) {
          const delta = end! - begin!;
          if (!delta) {
            if (begin! < min! || begin! > max!) upper = -1;
            continue;
          }
          const first = (min! - begin!) / delta;
          const last = (max! - begin!) / delta;
          lower = Math.max(lower, Math.min(first, last));
          upper = Math.min(upper, Math.max(first, last));
        }
        if (upper > lower) expected.add(`${column},${row}`);
      }
    }
    assertEquals(
      new Set(
        [...strokeSegmentCells(from!, to!)].filter((cell) => cell.upper > cell.lower).map(({ column, row }) =>
          `${column},${row}`
        ),
      ),
      expected,
    );
  }
  for (
    const point of [{ column: Infinity, row: 0 }, { column: NaN, row: 0 }, { column: 1e20, row: 0 }, {
      column: 9_000_000,
      row: 0,
    }]
  ) assertThrows(() => [...strokeSegmentCells({ column: 0, row: 0 }, point)], RangeError);
});

Deno.test("native dashed curve segments do not lose a centerline cell to endpoint snapping", () => {
  const scene: MermaidScene = {
    width: 420,
    height: 420,
    title: "",
    description: "",
    diagnostics: [],
    items: [{
      kind: "path",
      closed: false,
      points: [{ x: 89.5986, y: 399.25, distance: 39.2995 }, { x: 93.4698, y: 402.8125, distance: 44.9776 }],
      paint: { ...paint, dash: [17, 13], dashOffset: -5 },
    }],
  };
  const frame = renderMermaidNativeFrame(scene, { columnUnits: 2, rowUnits: 2 });
  assert(frame.cells[201]![46]!.char !== " ");
});

Deno.test("native subpixel hatches retain their measured direction instead of grid-step corner noise", () => {
  for (
    const [points, glyph] of [
      [[{ x: 10, y: 10 }, { x: 70, y: 40 }], "╲"],
      [[{ x: 70, y: 40 }, { x: 10, y: 10 }], "╲"],
      [[{ x: 10, y: 40 }, { x: 70, y: 10 }], "╱"],
      [[{ x: 10, y: 10 }, { x: 70, y: 10.1 }], "─"],
    ] as const
  ) {
    const scene: MermaidScene = {
      width: 100,
      height: 60,
      title: "",
      description: "",
      diagnostics: [],
      items: [{ kind: "path", closed: false, points, paint }],
    };
    const cells = renderMermaidNativeFrame(scene, { columnUnits: 2, rowUnits: 2 }).cells.flat().filter((cell) =>
      cell.foreground === "red"
    );
    assert(cells.length > 10);
    assert(cells.every((cell) => cell.char === glyph), "Continuous tangent was replaced with raster turns");
  }
});

Deno.test("SVG distance patterns preserve solid arrow gaps rather than converting the whole line to dots", () => {
  const pattern = strokePattern({ ...paint, dash: [0, 0, 32, 4] });
  assertEquals(strokeCoverage(pattern, 1, 25), "solid");
  assertEquals(strokeCoverage(pattern, 33, 35), "none");
  assertEquals(strokeCoverage(pattern, 30, 34), "partial");
  assertEquals(strokeCoverage(strokePattern({ ...paint, dash: [1, 0] }), 0, 1000), "solid");
  assertEquals(strokeCoverage(strokePattern({ ...paint, dash: [0, 0] }), 0, 1000), "solid");
});

Deno.test("SVG odd arrays repeat, positive and negative offsets wrap, and subpixel cycles stay bounded", () => {
  const odd = strokePattern({ ...paint, dash: [4, 2, 1] });
  assertEquals(odd?.period, 14);
  assertEquals(odd?.intervals, [[0, 4], [6, 7], [11, 13]]);
  assertEquals(strokeCoverage(odd, 4.1, 5.9), "none");
  assertEquals(strokeCoverage(odd, 6.1, 6.9), "solid");
  const positive = strokePattern({ ...paint, dash: [10, 10], dashOffset: 15 });
  const negative = strokePattern({ ...paint, dash: [10, 10], dashOffset: -5 });
  assertEquals(positive, negative);
  assertEquals(strokeCoverage(positive, 0, 2), "none");
  assertEquals(strokeCoverage(positive, 6, 8), "solid");
  assertEquals(strokeCoverage(strokePattern({ ...paint, dash: [1e-12, 1e-12] }), -1e12, 1e12), "partial");
});

Deno.test("SVG zero-length dash caps paint dots only with round/square caps and merge overlapping caps", () => {
  assertEquals(strokeCoverage(strokePattern({ ...paint, dash: [0, 10] }), 0, 50), "none");
  for (const lineCap of ["round", "square"] as const) {
    const pattern = strokePattern({ ...paint, strokeWidth: 2, dash: [0, 10], lineCap });
    assertEquals(strokeCoverage(pattern, 0, 0.5), "solid");
    assertEquals(strokeCoverage(pattern, 2, 8), "none");
    assertEquals(strokeCoverage(pattern, 9.5, 10.5), "solid");
    assertEquals(strokeCoverage(strokePattern({ ...paint, strokeWidth: 10, dash: [0, 10], lineCap }), 0, 100), "solid");
  }
});

Deno.test("native SVG patterns keep source-distance phase through transforms, disconnected contours and clipping", () => {
  const scene: MermaidScene = {
    width: 100,
    height: 40,
    title: "",
    description: "",
    diagnostics: [],
    items: [{
      kind: "path",
      closed: false,
      points: [{ x: 0, y: 10, distance: 0 }, { x: 100, y: 10, distance: 50 }],
      subpaths: [
        { closed: false, points: [{ x: 0, y: 10, distance: 0 }, { x: 100, y: 10, distance: 50 }] },
        { closed: false, points: [{ x: 0, y: 30, distance: 0 }, { x: 100, y: 30, distance: 50 }] },
      ],
      paint: { ...paint, dash: [10, 10] },
    }],
  };
  const frame = renderMermaidNativeFrame(scene, { columnUnits: 2, rowUnits: 10 });
  assertEquals(frame.cells[1]!.map((cell) => cell.char), frame.cells[3]!.map((cell) => cell.char));
  assertEquals(frame.cells[1]![5]!.char, "─");
  assertEquals(frame.cells[1]![15]!.char, " ");
  const path = scene.items[0]!;
  if (path.kind !== "path") throw new Error("fixture");
  path.subpaths = undefined;
  path.points = [{ x: -1e12, y: 10 }, { x: 1e12, y: 10 }];
  path.paint.dash = [20, 20];
  const clipped = mermaidNativeLines(renderMermaidNativeFrame(scene, { columnUnits: 2, rowUnits: 10 }))[1]!;
  assert(clipped.includes("─") && clipped.includes(" "));
});

Deno.test("native stroke rejects invalid numeric, phase and allocation inputs", () => {
  for (const dash of [[-1, 1], [NaN, 1], [Infinity, 1], new Array(1025).fill(1)]) {
    assertThrows(() => strokePattern({ ...paint, dash }), RangeError);
  }
  assertThrows(() => strokePattern({ ...paint, dashOffset: NaN }), RangeError);
  assertThrows(() => strokeCoverage(strokePattern({ ...paint, dash: [1, 1] }), 2, 1), RangeError);
  const scene: MermaidScene = {
    width: 100,
    height: 10,
    title: "",
    description: "",
    diagnostics: [],
    // Outline dash runs avoid the old O(pattern-length * painted-cells) work.
    // Enough overlapping paths must still trip the same aggregate scene bound.
    items: Array.from({ length: 64 }, () => ({
      kind: "path" as const,
      closed: false,
      points: [{ x: 0, y: 5 }, { x: 100, y: 5 }],
      paint: { ...paint, dash: new Array(1024).fill(1) },
    })),
  };
  assertThrows(
    () => renderMermaidNativeFrame(scene, { columnUnits: 1, rowUnits: 5, maxCells: 500 }),
    RangeError,
    "scene exceeds its work budget",
  );
});
