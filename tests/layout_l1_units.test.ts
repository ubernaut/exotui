// Copyright 2023 Im-Beast. MIT license.

// L1 viewport-axis (vw/vh), parent-axis (w/h), and bounded additive calc()
// units: parsing, contextual resolution, solver behavior, and capability
// classification (036 L1).

import { assert, assertEquals } from "./deps.ts";
import {
  calcLength,
  cellLength,
  clampLayoutSize,
  createMarkupLayout,
  inspectLayoutSolverCapabilities,
  LAYOUT_CALC_TERM_LIMIT,
  parseLayoutLength,
  resolveLayoutLength,
  SIMPLE_LAYOUT_SOLVER_CAPABILITIES,
  YOGA_LAYOUT_SOLVER_CAPABILITIES,
} from "../mod.ts";

Deno.test("L1 units parse vw/vh, Textual-style w/h, and additive calc()", () => {
  assertEquals(parseLayoutLength("50vw"), { unit: "vw", value: 50 });
  assertEquals(parseLayoutLength("25vh"), { unit: "vh", value: 25 });
  assertEquals(parseLayoutLength("50w"), { unit: "pw", value: 50 });
  assertEquals(parseLayoutLength("75h"), { unit: "ph", value: 75 });
  assertEquals(parseLayoutLength("calc(100% - 4)"), {
    unit: "calc",
    value: 0,
    terms: [{ unit: "percent", value: 100 }, { unit: "cell", value: -4 }],
  });
  assertEquals(parseLayoutLength("calc(50vw + 2 - 10%)"), {
    unit: "calc",
    value: 0,
    terms: [
      { unit: "vw", value: 50 },
      { unit: "cell", value: 2 },
      { unit: "percent", value: -10 },
    ],
  });
  assertEquals(parseLayoutLength("calc(30h + 1ch)"), {
    unit: "calc",
    value: 0,
    terms: [{ unit: "ph", value: 30 }, { unit: "cell", value: 1 }],
  });

  // The bounded model rejects everything beyond signed additive terms.
  const fallback = cellLength(7);
  assertEquals(parseLayoutLength("calc(2 * 3%)", fallback), fallback);
  assertEquals(parseLayoutLength("calc((1) + 2)", fallback), fallback);
  assertEquals(parseLayoutLength("calc(1fr + 2)", fallback), fallback);
  assertEquals(parseLayoutLength("calc()", fallback), fallback);
  assertEquals(parseLayoutLength("calc(100%-4)", fallback), fallback);
  assertEquals(parseLayoutLength("calc(1 +)", fallback), fallback);
  const overLimit = `calc(${new Array(LAYOUT_CALC_TERM_LIMIT + 1).fill("1").join(" + ")})`;
  assertEquals(parseLayoutLength(overLimit, fallback), fallback);
  const atLimit = `calc(${new Array(LAYOUT_CALC_TERM_LIMIT).fill("1").join(" + ")})`;
  assertEquals(parseLayoutLength(atLimit, fallback).unit, "calc");
});

Deno.test("L1 units resolve against the threaded axes and degrade to the local size", () => {
  const context = { viewportWidth: 120, viewportHeight: 40, parentWidth: 60, parentHeight: 20 };
  assertEquals(resolveLayoutLength({ unit: "vw", value: 50 }, 10, 0, context), 60);
  assertEquals(resolveLayoutLength({ unit: "vh", value: 50 }, 10, 0, context), 20);
  assertEquals(resolveLayoutLength({ unit: "pw", value: 50 }, 10, 0, context), 30);
  assertEquals(resolveLayoutLength({ unit: "ph", value: 50 }, 10, 0, context), 10);
  // Missing axes degrade to the local available size, never to zero.
  assertEquals(resolveLayoutLength({ unit: "vw", value: 50 }, 10, 0), 5);
  assertEquals(resolveLayoutLength({ unit: "ph", value: 50 }, 10, 0, { viewportWidth: 120 }), 5);

  // calc() sums unfloored terms, floors once, and clamps at zero.
  const mixed = calcLength([{ unit: "percent", value: 50 }, { unit: "cell", value: -3 }, { unit: "vw", value: 10 }]);
  assertEquals(resolveLayoutLength(mixed, 30, 0, context), 24); // 15 - 3 + 12
  assertEquals(resolveLayoutLength(calcLength([{ unit: "cell", value: -5 }]), 30, 0, context), 0);
  assertEquals(
    resolveLayoutLength(calcLength([{ unit: "percent", value: 2.5 }, { unit: "percent", value: 2.6 }]), 100, 0),
    5,
  );

  // Min/max clamping accepts the same context.
  assertEquals(clampLayoutSize(100, 30, cellLength(0), { unit: "vw", value: 50 }, context), 60);
});

Deno.test("L1 units size markup through the simple solver", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="viewportChild">V</panel>
        <panel id="parentChild">P</panel>
        <panel id="calcChild">C</panel>
      </window>
    `,
    css: `
      #root { display: block; width: 40; height: 20; }
      #viewportChild { width: 25vw; height: 25vh; }
      #parentChild { width: 50h; height: 2; }
      #calcChild { width: calc(100% - 4); height: calc(10vh + 1); }
    `,
    bounds: { column: 0, row: 0, width: 80, height: 24 },
    widgets: false,
  });

  // 25vw/25vh resolve against the 80x24 solve bounds, not the 40x20 parent.
  const viewportChild = result.layout.byId.get("viewportChild")!;
  assertEquals(viewportChild.rect.width, 20);
  assertEquals(viewportChild.rect.height, 6);

  // 50h resolves against the containing block's *height* for a width.
  const parentChild = result.layout.byId.get("parentChild")!;
  assertEquals(parentChild.rect.width, 10);

  // calc(100% - 4) tracks the parent inline size; calc(10vh + 1) the viewport.
  const calcChild = result.layout.byId.get("calcChild")!;
  assertEquals(calcChild.rect.width, 36);
  assertEquals(calcChild.rect.height, 3); // floor(2.4) + 1
});

Deno.test("L1 units participate in grid tracks and flex bases", () => {
  const grid = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="a">A</panel>
        <panel id="b">B</panel>
      </window>
    `,
    css: `
      #root { display: grid; grid-template-columns: 25vw calc(100% - 30); }
    `,
    bounds: { column: 0, row: 0, width: 80, height: 10 },
    widgets: false,
  });
  assertEquals(grid.layout.byId.get("a")!.rect.width, 20);
  assertEquals(grid.layout.byId.get("b")!.rect.width, 50);

  const flex = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="a">A</panel>
        <panel id="b">B</panel>
      </window>
    `,
    css: `
      #root { display: flex; flex-direction: row; }
      #a { flex-basis: 25vw; flex-grow: 0; flex-shrink: 0; }
      #b { flex-grow: 1; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 6 },
    widgets: false,
  });
  assertEquals(flex.layout.byId.get("a")!.rect.width, 10);
});

Deno.test("L1 units are classified per solver in the capability report", () => {
  const report = inspectLayoutSolverCapabilities();
  for (const unit of ["vw", "vh", "pw", "ph", "calc"] as const) {
    assertEquals(SIMPLE_LAYOUT_SOLVER_CAPABILITIES.lengthUnits[unit], "supported");
    assertEquals(YOGA_LAYOUT_SOLVER_CAPABILITIES.lengthUnits[unit], "unsupported");
    for (const solver of report.solvers) {
      assert(solver.lengthUnits[unit] !== undefined, `${solver.solverId} classifies ${unit}`);
    }
  }
  assert(
    SIMPLE_LAYOUT_SOLVER_CAPABILITIES.notes.some((note) => note.includes("calc()")),
    "the simple profile documents the bounded calc() model",
  );
});
