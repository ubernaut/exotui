// Copyright 2023 Im-Beast. MIT license.

// 036 G1: pre-squeeze comparison, centralized aspect correction with
// projection tests, capture, statistics, metrics, and fixtures.

import { assert, assertAlmostEquals, assertEquals } from "./deps.ts";
import {
  captureSampledFrame,
  compareSqueezeSamplers,
  orthographicCellFrustum,
  perspectiveCellAspect,
  preSqueezePixels,
  sampleDensityRamp,
  sampleQuadrants,
  SAMPLER_FIXTURES,
  samplerColorError,
  samplerStatistics,
} from "../mod.ts";

Deno.test("pre-squeeze halves width by averaging; the standard path never squeezes", () => {
  const gradient = SAMPLER_FIXTURES.gradient(16, 2);
  const squeezed = preSqueezePixels(gradient, 2);
  assertEquals(squeezed.width, 8);
  assertEquals(squeezed.height, 2);
  // Averaged neighbors: pixel 0 = (0+17)/2 = 8 or 9.
  assert(Math.abs(squeezed.pixels[0]! - 8.5) <= 0.5);

  const comparison = compareSqueezeSamplers(gradient, { columns: 4, rows: 1 });
  assertEquals(comparison.standard.cells.length, 4);
  assertEquals(comparison.preSqueezed.cells.length, 4);
  // Averaging preserves per-cell means on a linear gradient: tiny error.
  assert(comparison.meanColorError < 4, `unexpected divergence: ${comparison.meanColorError}`);
});

Deno.test("perspective aspect correction is centralized and cell-aware", () => {
  assertAlmostEquals(perspectiveCellAspect(80, 24), (80 * 0.5) / 24);
  assertAlmostEquals(perspectiveCellAspect(80, 24, 1), 80 / 24); // square cells opt out
});

Deno.test("orthographic frustum keeps a unit square square on the grid", () => {
  const frustum = orthographicCellFrustum(80, 24, 10);
  assertEquals(frustum.right - frustum.left, 10);
  const aspect = perspectiveCellAspect(80, 24);
  assertAlmostEquals(frustum.top - frustum.bottom, 10 / aspect);
  // Projection test: width/height ratio equals the corrected aspect.
  assertAlmostEquals((frustum.right - frustum.left) / (frustum.top - frustum.bottom), aspect);
});

Deno.test("fixtures exercise ramps, quadrant corners, and full blocks", () => {
  const ramp = sampleDensityRamp(SAMPLER_FIXTURES.gradient(20, 4), { columns: 5, rows: 1 });
  assertEquals(ramp.cells[0]!.glyph, " ");
  assertEquals(ramp.cells[4]!.glyph, "█");
  assert(new Set(ramp.cells.map((cell) => cell.glyph)).size >= 4); // ramp coverage

  const checker = sampleQuadrants(SAMPLER_FIXTURES.checker(), { columns: 1, rows: 1 });
  assert(checker.cells[0]!.glyph === "▚" || checker.cells[0]!.glyph === "▞"); // diagonal corners

  const solid = sampleQuadrants(SAMPLER_FIXTURES.solid(220), { columns: 1, rows: 1 });
  assertEquals(solid.cells[0]!.glyph, "█");
});

Deno.test("statistics, color error, and capture are deterministic", () => {
  const frame = sampleDensityRamp(SAMPLER_FIXTURES.gradient(16, 4), { columns: 4, rows: 2 });
  const stats = samplerStatistics(frame);
  assertEquals(stats.cells, 8);
  assert(stats.litCells > 0 && stats.litCells <= 8);
  assert(stats.distinctGlyphs >= 2);
  assertEquals(samplerColorError(frame, frame), 0); // identity
  const captured = captureSampledFrame(frame);
  assertEquals(JSON.parse(captured).cells.length, 8); // round-trips
});
