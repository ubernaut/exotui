// Copyright 2023 Im-Beast. MIT license.

// VIS-008: annotations remain attached through resize, pan, zoom, and
// data-window changes.

import { assert, assertEquals } from "./deps.ts";
import { type ChartAnnotation, layoutAnnotations, linearScale } from "../mod.ts";

const ANNOTATIONS: ChartAnnotation[] = [
  { kind: "point-label", x: 50, y: 100, text: "peak" },
  { kind: "reference-line", axis: "y", value: 80, label: "SLA" },
  { kind: "threshold-band", axis: "y", from: 120, to: 200, label: "danger" },
  { kind: "event-marker", x: 30, label: "deploy" },
];

Deno.test("annotations follow their data anchors through pan, zoom, resize", () => {
  const base = {
    xScale: linearScale([0, 100], [0, 50]),
    yScale: linearScale([0, 200], [20, 0]),
  };
  const initial = layoutAnnotations(ANNOTATIONS, base);
  assertEquals(initial[0]!.cell, { column: 25, row: 10 }); // x=50 → cell 25

  // Pan: domain shifts +20; the label moves with its DATA anchor.
  const panned = layoutAnnotations(ANNOTATIONS, {
    ...base,
    xScale: linearScale([20, 120], [0, 50]),
  });
  assertEquals(panned[0]!.cell, { column: 15, row: 10 });

  // Zoom in: x=50 lands proportionally in the tighter window.
  const zoomed = layoutAnnotations(ANNOTATIONS, {
    ...base,
    xScale: linearScale([40, 60], [0, 50]),
  });
  assertEquals(zoomed[0]!.cell!.column, 25);
  // The x=30 event is now outside the window: offscreen, not dropped.
  const marker = zoomed.find((entry) => entry.annotation.kind === "event-marker")!;
  assert(marker.offscreen);
  assertEquals(zoomed.length, ANNOTATIONS.length); // nothing vanished

  // Resize: same domains, wider range — anchors reproject.
  const resized = layoutAnnotations(ANNOTATIONS, {
    xScale: linearScale([0, 100], [0, 100]),
    yScale: linearScale([0, 200], [40, 0]),
  });
  assertEquals(resized[0]!.cell, { column: 50, row: 20 });
});

Deno.test("reference lines and bands clip to the viewport", () => {
  const scales = {
    xScale: linearScale([0, 100], [0, 50]),
    yScale: linearScale([0, 200], [20, 0]),
  };
  const placed = layoutAnnotations(ANNOTATIONS, scales);
  const line = placed.find((entry) => entry.annotation.kind === "reference-line")!;
  assertEquals(line.cell, { column: 0, row: 12 }); // y=80 → row 12

  const band = placed.find((entry) => entry.annotation.kind === "threshold-band")!;
  assertEquals(band.span, { from: 0, to: 8 }); // y 120..200 → rows 8..0, clipped ordered

  // A band fully outside the y window is offscreen.
  const outside = layoutAnnotations(
    [{ kind: "threshold-band", axis: "x", from: 300, to: 400 }],
    scales,
  );
  assert(outside[0]!.offscreen);
});

Deno.test("label collisions resolve deterministically by policy", () => {
  const scales = {
    xScale: linearScale([0, 100], [0, 50]),
    yScale: linearScale([0, 200], [20, 0]),
  };
  const colliding: ChartAnnotation[] = [
    { kind: "point-label", x: 50, y: 100, text: "first" },
    { kind: "point-label", x: 51, y: 100, text: "second" }, // same cell row & bucket
  ];
  const shifted = layoutAnnotations(colliding, { ...scales, collisionPolicy: "shift" });
  assertEquals(shifted[0]!.cell!.row, 10);
  assertEquals(shifted[1]!.cell!.row, 11); // nudged down, visible
  assertEquals(shifted, layoutAnnotations(colliding, { ...scales, collisionPolicy: "shift" }));

  const hidden = layoutAnnotations(colliding, { ...scales, collisionPolicy: "hide-later" });
  assert(!hidden[0]!.hidden);
  assert(hidden[1]!.hidden); // hidden but reported, never dropped
});
