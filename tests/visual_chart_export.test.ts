// Copyright 2023 Im-Beast. MIT license.

// VIS-010: all formats declare scale/domain metadata and match the
// rendered series revision.

import { assert, assertEquals } from "./deps.ts";
import {
  buildChartSnapshot,
  exportChartCells,
  exportChartData,
  exportChartDescription,
  exportChartSvg,
  type SnapshotSeries,
} from "../mod.ts";

const SERIES: SnapshotSeries[] = [
  { name: "load", kind: "line", points: [{ x: 0, y: 1 }, { x: 4, y: 1 }] },
  { name: "events", kind: "scatter", points: [{ x: 2, y: 2 }, { x: 3, y: null }] },
];

function snapshot(revision = 7) {
  return buildChartSnapshot({
    revision,
    xDomain: [0, 4],
    yDomain: [0, 2],
    width: 5,
    height: 3,
    series: SERIES,
  });
}

Deno.test("every format carries identical metadata and revision", () => {
  const model = snapshot();
  const data = exportChartData(model);
  const cells = exportChartCells(model);
  const description = exportChartDescription(model);
  const svg = exportChartSvg(model);

  for (const shared of [data.metadata, cells.metadata, description.metadata]) {
    assertEquals(shared, { revision: 7, xDomain: [0, 4], yDomain: [0, 2], width: 5, height: 3 });
  }
  assert(svg.includes('data-revision="7"'));
  assert(svg.includes('data-x-domain="0,4"') && svg.includes('data-y-domain="0,2"'));
});

Deno.test("cell export is deterministic and consistent with the snapshot", () => {
  const first = exportChartCells(snapshot());
  const second = exportChartCells(snapshot());
  assertEquals(first.lines, second.lines); // deterministic
  assertEquals(first.lines, ["  ●  ", "·····", "     "]);
  // The SVG renders exactly those lines.
  const svg = exportChartSvg(snapshot());
  assert(svg.includes(">  ●  </text>"));
  assert(svg.includes(">·····</text>"));
});

Deno.test("the description reports per-series structure including missing", () => {
  const description = exportChartDescription(snapshot());
  assertEquals(description.series, [
    { name: "load", kind: "line", pointCount: 2, missingCount: 0, minY: 1, maxY: 1 },
    { name: "events", kind: "scatter", pointCount: 2, missingCount: 1, minY: 2, maxY: 2 },
  ]);
});

Deno.test("snapshots are detached: later series mutation changes nothing", () => {
  const liveSeries: SnapshotSeries[] = [
    { name: "live", kind: "line", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
  ];
  const model = buildChartSnapshot({
    revision: 1,
    xDomain: [0, 4],
    yDomain: [0, 2],
    width: 5,
    height: 3,
    series: liveSeries,
  });
  (liveSeries[0]!.points as { x: number; y: number | null }[]).push({ x: 2, y: 2 });
  assertEquals(exportChartData(model).series[0]!.points.length, 2); // detached copy
  assertEquals(exportChartCells(model).lines[2], "·····"); // rendering unchanged
  assert(Object.isFrozen(model));
});
