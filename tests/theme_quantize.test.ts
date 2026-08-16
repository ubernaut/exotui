// Copyright 2023 Im-Beast. MIT license.

// THEM-006: the report lists per-token error and critical roles never
// collapse to the same style without a fallback marker.

import { assert, assertEquals } from "./deps.ts";
import { perceptualDistance, quantizePalette } from "../mod.ts";

const PALETTE = {
  danger: [255, 60, 50],
  warning: [255, 200, 40],
  success: [40, 220, 100],
  accent: [60, 140, 255],
  muted: [120, 120, 120],
} as const;

Deno.test("ansi256 quantization is near-lossless with per-token error listed", () => {
  const report = quantizePalette(PALETTE, "ansi256");
  assertEquals(report.assignments.length, 5);
  for (const assignment of report.assignments) {
    assert(assignment.error >= 0);
    assert(assignment.index >= 0 && assignment.index < 256);
    // 256 colors: everything lands perceptually close.
    assert(assignment.error < 0.1, `${assignment.token} error ${assignment.error}`);
  }
  assertEquals(report.collisions, []);
  assert(report.maxError < 0.1);
});

Deno.test("ansi16 separates critical roles by reassignment when they collide", () => {
  // Two reds that both map nearest to ANSI red.
  const tokens = { danger: [255, 60, 50], critical: [240, 70, 60], info: [60, 140, 255] } as const;
  const report = quantizePalette(tokens, "ansi16", { critical: ["danger", "critical"] });
  const byToken = Object.fromEntries(report.assignments.map((entry) => [entry.token, entry]));
  assert(byToken["danger"]!.index !== byToken["critical"]!.index); // separated
  assertEquals(report.collisions.length, 1);
  assert(report.collisions[0]!.resolved);
  // The displaced token pays a higher error, and the report shows it.
  assert(byToken["critical"]!.error >= byToken["danger"]!.error);
});

Deno.test("monochrome keeps unresolvable collisions visible with fallback markers", () => {
  const tokens = {
    a: [255, 0, 0],
    b: [0, 255, 0],
    c: [0, 0, 255],
    d: [255, 255, 0],
  } as const;
  // Four critical roles, three mono levels: at least one unresolvable.
  const report = quantizePalette(tokens, "mono", { critical: ["a", "b", "c", "d"] });
  const unresolved = report.collisions.filter((collision) => !collision.resolved);
  assert(unresolved.length >= 1);
  assert(unresolved.every((collision) => collision.fallbackMarker !== undefined));
  assert(unresolved[0]!.tokens.length === 2);
  // Non-critical quantization to mono never invents indices.
  for (const assignment of report.assignments) {
    assert(assignment.index >= 0 && assignment.index < 3);
  }
});

Deno.test("perceptual distance is a metric anchored at zero", () => {
  assertEquals(perceptualDistance([10, 20, 30], [10, 20, 30]), 0);
  const near = perceptualDistance([100, 100, 100], [105, 105, 105]);
  const far = perceptualDistance([100, 100, 100], [255, 0, 0]);
  assert(near < far);
});
