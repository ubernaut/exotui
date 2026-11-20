// Copyright 2026 ExotUI contributors. MIT license.
import { assertEquals } from "./deps.ts";
import {
  mermaidNativeLines,
  type MermaidScene,
  type MermaidSceneItem,
  renderMermaidNativeFrame,
} from "../mod.mermaid.ts";

// Nine by eighteen units is the default cell, so a point at (9c, 18r) is the centre of column c, row r.
const at = (column: number, row: number) => ({ x: column * 9, y: row * 18 });
const paint = { fill: "none", stroke: "rgb(0, 0, 0)", strokeWidth: 2, dash: [], opacity: 1 };

function line(...cells: [number, number][]): MermaidSceneItem {
  return { kind: "path", points: cells.map(([column, row]) => at(column, row)), closed: false, paint: { ...paint } };
}

function render(items: MermaidSceneItem[], columns = 12, rows = 6): string[] {
  const scene: MermaidScene = {
    width: columns * 9,
    height: rows * 18,
    title: "",
    description: "",
    diagnostics: [],
    items,
  };
  return mermaidNativeLines(renderMermaidNativeFrame(scene, { columnUnits: 9, rowUnits: 18 }))
    .map((row) => row.trimEnd());
}

Deno.test("separate strokes that meet in a cell resolve to one corner, tee or crossing", () => {
  // Upstream draws a class box as four independent sides, then its dividers.
  const lines = render([
    line([1, 1], [9, 1]),
    line([9, 1], [9, 5]),
    line([9, 5], [1, 5]),
    line([1, 5], [1, 1]),
    line([1, 3], [9, 3]),
    line([5, 3], [5, 5]),
    line([5, 0], [5, 2]),
  ]);
  assertEquals(lines, [
    "     │",
    " ┌───┼───┐",
    " │   │   │",
    " ├───┬───┤",
    " │   │   │",
    " └───┴───┘",
    "",
  ]);
});

Deno.test("an opaque fill forgets the lines beneath it, so a later stroke does not join them", () => {
  const lines = render([
    line([1, 2], [9, 2]),
    {
      kind: "path",
      points: [at(3, 1), at(7, 1), at(7, 4), at(3, 4)],
      closed: true,
      paint: { ...paint, fill: "rgb(255, 255, 255)", stroke: "none" },
    },
    line([5, 0], [5, 5]),
  ]);
  // Fills sample cell centres, so this one covers columns three to six.
  assertEquals(lines[2], " ──  │ ───", "the vertical stroke crosses the fill, not the covered line");
});

Deno.test("a corner rounded within a cell is a rounded corner, and a sustained slope stays diagonal", () => {
  const rounded: MermaidSceneItem = {
    kind: "path",
    points: [
      at(1, 4),
      at(1, 1.4),
      { x: 10, y: 21 },
      { x: 12, y: 19 },
      at(1.5, 1),
      at(9, 1),
    ],
    closed: false,
    paint: { ...paint },
  };
  assertEquals(render([rounded]).slice(1, 3), [" ╭────────", " │"]);
  const slope = render([line([1, 0], [9, 4])]);
  assertEquals(slope.slice(0, 5).every((row) => /^ *╲+$/.test(row)), true, slope.join("\n"));
});

Deno.test("an arrowhead marker becomes one arrow glyph and the box it points at keeps its border", () => {
  const head = (tip: [number, number], back: number): MermaidSceneItem => ({
    kind: "path",
    marker: "end",
    points: [
      { x: tip[0] * 9 - back * 8, y: tip[1] * 18 - 4 },
      at(...tip),
      { x: tip[0] * 9 - back * 8, y: tip[1] * 18 + 4 },
      { x: tip[0] * 9 - back * 8, y: tip[1] * 18 - 4 },
    ],
    closed: true,
    paint: { ...paint, fill: "rgb(0, 0, 0)", stroke: "none" },
  });
  const lines = render([
    line([8, 0], [8, 4]),
    line([1, 2], [8, 2]),
    head([8, 2], 1),
    line([11, 3], [8, 3]),
    head([8, 3], -1),
  ]);
  assertEquals(lines.slice(0, 5), [
    "        │",
    "        │",
    " ──────►│",
    "        │◄──",
    "        │",
  ]);
});

Deno.test("hollow, diamond, round and crossed markers keep their meaning; other shapes keep their geometry", () => {
  const marker = (points: [number, number][], fill: string, stroke: string): MermaidSceneItem => ({
    kind: "path",
    marker: "start",
    points: points.map(([x, y]) => ({ x, y })),
    closed: true,
    paint: { ...paint, fill, stroke },
  });
  const black = "rgb(0, 0, 0)";
  const ring = Array.from({ length: 12 }, (_, index): [number, number] => [
    90 + Math.cos(index * Math.PI / 6) * 4,
    18 + Math.sin(index * Math.PI / 6) * 4,
  ]);
  const lines = render([
    marker([[18, 10], [12, 18], [24, 18]], "rgba(0, 0, 0, 0)", black),
    marker([[45, 12], [51, 18], [45, 24], [39, 18]], black, black),
    marker([[72, 12], [78, 18], [72, 24], [66, 18]], "rgb(255, 255, 255)", black),
    marker(ring, black, "none"),
    {
      kind: "path",
      marker: "end",
      points: [{ x: 14, y: 50 }, { x: 22, y: 58 }],
      closed: false,
      subpaths: [
        { points: [{ x: 14, y: 50 }, { x: 22, y: 58 }], closed: false },
        { points: [{ x: 22, y: 50 }, { x: 14, y: 58 }], closed: false },
      ],
      paint: { ...paint },
    },
  ]);
  assertEquals(lines[1], "     ◆  ◇ ●");
  assertEquals(lines[2], "  △");
  assertEquals(lines[3], "  ×");
});

Deno.test("a ring around a dot is one end-state mark, and a start state is one dot", () => {
  const circle = (cx: number, cy: number, radius: number, fill: string): MermaidSceneItem => ({
    kind: "path",
    points: Array.from({ length: 17 }, (_, index) => ({
      x: cx + Math.cos(index * Math.PI / 8) * radius,
      y: cy + Math.sin(index * Math.PI / 8) * radius,
    })),
    closed: true,
    paint: { ...paint, fill, stroke: "rgb(40, 37, 61)" },
  });
  const lines = render([
    circle(18, 18, 7, "rgb(0, 0, 0)"),
    circle(54, 18, 7, "rgb(255, 255, 255)"),
    circle(54, 18, 3, "rgb(40, 37, 61)"),
  ]);
  assertEquals(lines[1], "  ●   ◉");
});

Deno.test("a line does not overwrite the label it passes behind", () => {
  const lines = render([
    {
      kind: "text",
      text: "Worker",
      x: 18,
      y: 27,
      width: 54,
      height: 16,
      color: "rgb(0, 0, 0)",
      fontWeight: "400",
      fontStyle: "normal",
    },
    line([4, 0], [4, 4]),
  ]);
  assertEquals(lines.slice(0, 4), ["    │", "    │", "  Worker", "    │"]);
});
