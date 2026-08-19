// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertNotEquals } from "./deps.ts";
import type { Rectangle } from "@ubernaut/exotui";
import type { ExomuxBackgroundCell } from "../background.ts";
import { ExomuxBiomechField } from "../biomech_background.ts";
import { ExomuxJungleField } from "../jungle_background.ts";
import { exomuxTheme } from "../model.ts";

type Grid = ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>>;

interface BackgroundField {
  setPointer(point: { column: number; row: number }, now?: number): void;
  clearPointer(): void;
  advance(options: { bounds: Rectangle; obstacles?: readonly Rectangle[]; now?: number }): boolean;
  rasterizeCells(bounds: Rectangle, theme: ReturnType<typeof exomuxTheme>): Grid;
}

const BOUNDS: Rectangle = { column: 0, row: 0, width: 80, height: 24 };
const RESIZED: Rectangle = { column: 0, row: 0, width: 120, height: 40 };
const MIDNIGHT = exomuxTheme("midnight");
const T2 = exomuxTheme("t2");
const STEP_MS = 40;

function advanceFor(field: BackgroundField, bounds: Rectangle, startAt: number, durationMs: number): number {
  let now = startAt;
  for (let elapsed = 0; elapsed < durationMs; elapsed += STEP_MS) {
    now += STEP_MS;
    field.advance({ bounds, now });
  }
  return now;
}

function snapshot(grid: Grid): string {
  return JSON.stringify(grid);
}

function definedCells(grid: Grid): ExomuxBackgroundCell[] {
  const cells: ExomuxBackgroundCell[] = [];
  for (const row of grid) {
    for (const cell of row) if (cell) cells.push(cell);
  }
  return cells;
}

const FIELD_FACTORIES: readonly [string, (seed: number) => BackgroundField][] = [
  ["biomech", (seed) => new ExomuxBiomechField({ seed })],
  ["jungle", (seed) => new ExomuxJungleField({ seed })],
];

Deno.test("exomux biomech/jungle backgrounds: same seed and advance sequence are deterministic", () => {
  for (const [name, create] of FIELD_FACTORIES) {
    const first = create(7);
    const second = create(7);
    advanceFor(first, BOUNDS, 1_000, 2_000);
    advanceFor(second, BOUNDS, 1_000, 2_000);
    assertEquals(
      snapshot(first.rasterizeCells(BOUNDS, MIDNIGHT)),
      snapshot(second.rasterizeCells(BOUNDS, MIDNIGHT)),
      `${name}: same seed must match`,
    );
    const different = create(99);
    advanceFor(different, BOUNDS, 1_000, 2_000);
    assertNotEquals(
      snapshot(first.rasterizeCells(BOUNDS, MIDNIGHT)),
      snapshot(different.rasterizeCells(BOUNDS, MIDNIGHT)),
      `${name}: different seeds must differ`,
    );
  }
});

Deno.test("exomux biomech/jungle backgrounds: simulated time changes the grid", () => {
  for (const [name, create] of FIELD_FACTORIES) {
    const field = create(11);
    let now = advanceFor(field, BOUNDS, 500, 400);
    const before = snapshot(field.rasterizeCells(BOUNDS, MIDNIGHT));
    now = advanceFor(field, BOUNDS, now, 2_000);
    const after = snapshot(field.rasterizeCells(BOUNDS, MIDNIGHT));
    assertNotEquals(before, after, `${name}: time must move the field`);
  }
});

Deno.test("exomux biomech/jungle backgrounds: exact grid dimensions and resize safety", () => {
  for (const [name, create] of FIELD_FACTORIES) {
    const field = create(3);
    let now = advanceFor(field, BOUNDS, 200, 400);
    const grid = field.rasterizeCells(BOUNDS, MIDNIGHT);
    assertEquals(grid.length, BOUNDS.height, `${name}: row count`);
    for (const row of grid) assertEquals(row.length, BOUNDS.width, `${name}: column count`);
    now = advanceFor(field, RESIZED, now, 400);
    const resized = field.rasterizeCells(RESIZED, MIDNIGHT);
    assertEquals(resized.length, RESIZED.height, `${name}: resized row count`);
    for (const row of resized) assertEquals(row.length, RESIZED.width, `${name}: resized column count`);
    assert(definedCells(resized).length > 0, `${name}: resized field still paints cells`);
  }
});

Deno.test("exomux biomech/jungle backgrounds: pointer influence diverges from pointer-free twin", () => {
  for (const [name, create] of FIELD_FACTORIES) {
    const pointered = create(21);
    const untouched = create(21);
    let pointeredNow = advanceFor(pointered, BOUNDS, 100, 400);
    advanceFor(untouched, BOUNDS, 100, 400);
    pointered.setPointer({ column: 40, row: 12 }, pointeredNow);
    pointeredNow = advanceFor(pointered, BOUNDS, pointeredNow, 400);
    advanceFor(untouched, BOUNDS, 500, 400);
    assertNotEquals(
      snapshot(pointered.rasterizeCells(BOUNDS, MIDNIGHT)),
      snapshot(untouched.rasterizeCells(BOUNDS, MIDNIGHT)),
      `${name}: pointer must perturb the field`,
    );
  }
});

Deno.test("exomux biomech/jungle backgrounds: cell colors are valid RGB and theme-dependent", () => {
  for (const [name, create] of FIELD_FACTORIES) {
    const field = create(5);
    advanceFor(field, BOUNDS, 900, 1_200);
    const midnightGrid = field.rasterizeCells(BOUNDS, MIDNIGHT);
    const cells = definedCells(midnightGrid);
    assert(cells.length > 0, `${name}: field paints at least one cell`);
    for (const cell of cells) {
      assertEquals(cell.foreground.length, 3, `${name}: rgb tuple`);
      for (const channel of cell.foreground) {
        assert(Number.isInteger(channel), `${name}: integer channel`);
        assert(channel >= 0 && channel <= 255, `${name}: channel in range`);
      }
    }
    const midnightSnapshot = snapshot(midnightGrid);
    const t2Snapshot = snapshot(field.rasterizeCells(BOUNDS, T2));
    assertNotEquals(midnightSnapshot, t2Snapshot, `${name}: theme must recolor the field`);
  }
});

Deno.test("exomux jungle background: moving obstacle rustles clusters that a static obstacle does not", () => {
  const moving = new ExomuxJungleField({ seed: 13 });
  const staticTwin = new ExomuxJungleField({ seed: 13 });
  const staticRect: Rectangle = { column: 20, row: 6, width: 30, height: 10 };
  let now = 100;
  for (let frame = 0; frame < 80; frame += 1) {
    now += STEP_MS;
    const movingRect: Rectangle = { ...staticRect, column: staticRect.column + (frame % 24) };
    moving.advance({ bounds: BOUNDS, obstacles: [movingRect], now });
    staticTwin.advance({ bounds: BOUNDS, obstacles: [staticRect], now });
  }
  assertNotEquals(
    snapshot(moving.rasterizeCells(BOUNDS, MIDNIGHT)),
    snapshot(staticTwin.rasterizeCells(BOUNDS, MIDNIGHT)),
    "moving windows must rustle overlapped clusters",
  );
});

Deno.test("exomux biomech background: piston heads travel over a four second span", () => {
  const field = new ExomuxBiomechField({ seed: 17 });
  let now = advanceFor(field, BOUNDS, 250, 200);
  const before = pistonHeadPositions(field.rasterizeCells(BOUNDS, MIDNIGHT));
  assert(before.length > 0, "piston heads render");
  now = advanceFor(field, BOUNDS, now, 4_000);
  const after = pistonHeadPositions(field.rasterizeCells(BOUNDS, MIDNIGHT));
  assert(after.length > 0, "piston heads still render");
  assertNotEquals(before.join(";"), after.join(";"), "piston heads must extend or retract");
});

const COVERAGE_BOUNDS: Rectangle = { column: 0, row: 0, width: 100, height: 30 };

Deno.test("exomux biomech background: interlocking relief covers at least 70% of a 100x30 field", () => {
  const field = new ExomuxBiomechField({ seed: 9 });
  advanceFor(field, COVERAGE_BOUNDS, 300, 240);
  const defined = definedCells(field.rasterizeCells(COVERAGE_BOUNDS, MIDNIGHT)).length;
  const total = COVERAGE_BOUNDS.width * COVERAGE_BOUNDS.height;
  assert(defined >= total * 0.7, `biomech coverage ${defined}/${total}`);
});

Deno.test("exomux jungle background: overlapping fronds cover at least 75% of a 100x30 field", () => {
  const field = new ExomuxJungleField({ seed: 9 });
  advanceFor(field, COVERAGE_BOUNDS, 300, 240);
  const defined = definedCells(field.rasterizeCells(COVERAGE_BOUNDS, MIDNIGHT)).length;
  const total = COVERAGE_BOUNDS.width * COVERAGE_BOUNDS.height;
  assert(defined >= total * 0.75, `jungle coverage ${defined}/${total}`);
});

Deno.test("exomux biomech/jungle backgrounds: 100 advance+rasterize frames at 200x60 stay under budget", () => {
  const large: Rectangle = { column: 0, row: 0, width: 200, height: 60 };
  for (const [name, create] of FIELD_FACTORIES) {
    const field = create(29);
    const startedAt = performance.now();
    let now = 1_000;
    for (let frame = 0; frame < 100; frame += 1) {
      now += STEP_MS;
      field.advance({ bounds: large, now });
      field.rasterizeCells(large, MIDNIGHT);
    }
    const elapsed = performance.now() - startedAt;
    assert(elapsed < 2_000, `${name}: 100 frames took ${elapsed.toFixed(1)}ms`);
  }
});

function pistonHeadPositions(grid: Grid): string[] {
  const positions: string[] = [];
  for (let row = 0; row < grid.length; row += 1) {
    const cells = grid[row]!;
    for (let column = 0; column < cells.length; column += 1) {
      if (cells[column]?.char === "╦") positions.push(`${column},${row}`);
    }
  }
  return positions.sort();
}
