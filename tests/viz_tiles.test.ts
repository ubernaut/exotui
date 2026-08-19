// Copyright 2023 Im-Beast. MIT license.

// Dividing an area into tiles, and choosing what each one draws.

import { assert, assertEquals } from "./deps.ts";
import { chartRectFor, gridFor, isFramed, planTiles, type TileSource } from "../src/viz/tiles.ts";

const AREA = { column: 0, row: 0, width: 120, height: 36 };

function sources(count: number, shape: Partial<TileSource["shape"]> = {}): TileSource[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    shape: { kind: "0dt" as const, ...shape },
  }));
}

Deno.test("tiles stay inside the area and never overlap", () => {
  const rects = planTiles(AREA, sources(5)).tiles.map((tile) => tile.rect);
  assertEquals(rects.length, 5);
  const painted = new Set<string>();
  for (const rect of rects) {
    for (let row = rect.row; row < rect.row + rect.height; row += 1) {
      for (let column = rect.column; column < rect.column + rect.width; column += 1) {
        const key = `${column},${row}`;
        assert(!painted.has(key), `two tiles claim ${key}`);
        painted.add(key);
        assert(column < AREA.width && row < AREA.height, `tile escapes the area at ${key}`);
      }
    }
  }
  // Everything but the gutters: a bordered tile gives up one column and one row
  // so neighbouring borders do not read as one doubled line.
  const covered = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  assertEquals(painted.size, covered);
  assert(covered > AREA.width * AREA.height * 0.85, `gutters ate ${AREA.width * AREA.height - covered} cells`);
});

Deno.test("a short final row spreads across the width rather than leaving a hole", () => {
  const rects = planTiles(AREA, sources(5)).tiles.map((tile) => tile.rect);
  const lastRow = rects.filter((rect) => rect.row === rects.at(-1)!.row);
  assertEquals(lastRow.length, 2);
  const spanned = lastRow.at(-1)!.column + lastRow.at(-1)!.width;
  assert(spanned >= AREA.width - 1, `the last row stops at ${spanned}, short of ${AREA.width}`);
  assertEquals(lastRow[0]!.width, lastRow[1]!.width, "a two-tile row splits it evenly");
});

Deno.test("the grid keeps tiles wider than tall, because charts plot time sideways", () => {
  const grid = gridFor(AREA, 6)!;
  const width = AREA.width / grid.columns;
  const height = AREA.height / grid.rows;
  assert(width > height, `tiles came out ${width}x${height}`);
});

Deno.test("an area too small for charts still gives every source a row to report on", () => {
  // Four rows and eighteen columns: no room for a chart anywhere, so each tile
  // is a label and a number. There is no mode for this — it is what falls out.
  const layout = planTiles({ column: 0, row: 0, width: 18, height: 4 }, sources(4));
  assertEquals(layout.tiles.length, 4);
  assertEquals(layout.omitted.length, 0);
  for (const tile of layout.tiles) {
    assertEquals(tile.framed, false);
    assert(tile.rect.width >= 7, `a tile ${tile.rect.width} wide cannot hold "cpu 20%"`);
  }
});

Deno.test("more sources than fit are dropped, and reported", () => {
  const layout = planTiles({ column: 0, row: 0, width: 16, height: 2 }, sources(6));
  assert(layout.tiles.length < 6);
  assertEquals(layout.tiles.length + layout.omitted.length, 6);
});

Deno.test("the same source picks a different chart on differently shaped data", () => {
  const area = { column: 0, row: 0, width: 60, height: 20 };
  const of = (entries: number) =>
    planTiles(area, [{ id: "cores", shape: { kind: "1dt", extent: [entries] } }]).tiles[0]!;
  const few = of(4);
  const many = of(88);
  const scoreOf = (tile: typeof few, id: string) => tile.fits.find((fit) => fit.id === id)!.score;
  assert(scoreOf(few, "bars") > scoreOf(many, "bars"), "88 bars in 58 columns must score worse than 4");

  // Squeezed, the difference stops being a score and becomes the answer: a
  // renderer that spends a column per entry is out at eighty-eight, and one
  // that resamples takes over.
  const narrow = { column: 0, row: 0, width: 16, height: 8 };
  const squeeze = (entries: number) =>
    planTiles(narrow, [{ id: "cores", shape: { kind: "1dt", extent: [entries] } }]).tiles[0]!.visualization;
  assertEquals(squeeze(4), "psychograph", "four series overlay on one set of axes");
  assertEquals(squeeze(88), "scope", "eighty-eight cannot, and the one that resamples takes over");
});

Deno.test("a pin wins over a preference, and a preference over the ranking", () => {
  const area = { column: 0, row: 0, width: 60, height: 20 };
  const source: TileSource = { id: "cores", shape: { kind: "1dt", extent: [88] }, prefer: "waterfall" };
  const preferred = planTiles(area, [source]).tiles[0]!;
  assertEquals(preferred.visualization, "waterfall");
  assert(preferred.fits[0]!.id !== "waterfall", "the preference is doing the work, not the ranking");

  const pinned = planTiles(area, [source], { overrides: new Map([["cores", "bars"]]) }).tiles[0]!;
  assertEquals(pinned.visualization, "bars");

  // A pin that no longer fits is ignored rather than obeyed.
  const cramped = planTiles({ column: 0, row: 0, width: 20, height: 3 }, [
    { id: "cores", shape: { kind: "1dt", extent: [8] } },
  ], { overrides: new Map([["cores", "waterfall"]]) }).tiles[0]!;
  assert(cramped.visualization !== "waterfall", "a waterfall needs four rows");
});

Deno.test("a framed tile keeps its chart inside its border", () => {
  const rect = { column: 4, row: 2, width: 30, height: 10 };
  assert(isFramed(rect));
  assertEquals(chartRectFor(rect), { column: 5, row: 3, width: 28, height: 8 });
});
