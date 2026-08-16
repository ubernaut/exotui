// Copyright 2023 Im-Beast. MIT license.

// 036 G1: the quadrant sampler as a separate mode, and the CPU/GPU
// backend seam with the same grid contract and explicit fallback.

import { assert, assertEquals } from "./deps.ts";
import {
  createSamplerBackend,
  DENSITY_RAMP,
  PIXEL_SAMPLER_LIMITS,
  sampleDensityRamp,
  type SampledFrame,
  sampleQuadrants,
  type SamplerPixels,
} from "../mod.ts";

/** A deterministic frame: left half black, right half white. */
function splitFrame(width = 8, height = 8): SamplerPixels {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x >= width / 2 ? 255 : 0;
      const offset = (y * width + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return { pixels, width, height };
}

Deno.test("density ramp stays selectable and unchanged: dark to bright glyphs", () => {
  const frame = sampleDensityRamp(splitFrame(), { columns: 2, rows: 1 });
  assertEquals(frame.mode, "density-ramp");
  assertEquals(frame.cells[0]!.glyph, " "); // black half → dimmest
  assertEquals(frame.cells[1]!.glyph, "█"); // white half → brightest
  assertEquals(frame.cells[1]!.foreground, [255, 255, 255]);
  assertEquals(frame.cells[0]!.background, undefined); // one color only
  assertEquals(DENSITY_RAMP[0], " ");
});

Deno.test("the quadrant sampler carries BOTH colors and picks corner glyphs", () => {
  // One cell over the split frame: right corners lit, left corners not.
  const frame = sampleQuadrants(splitFrame(), { columns: 1, rows: 1 });
  const cell = frame.cells[0]!;
  assertEquals(frame.mode, "quadrant");
  assertEquals(cell.glyph, "▐"); // top-right + bottom-right
  assertEquals(cell.foreground, [255, 255, 255]); // lit partition
  assertEquals(cell.background, [0, 0, 0]); // unlit partition
});

Deno.test("a flat bright cell renders as a full block, not noise", () => {
  const width = 4, height = 4;
  const pixels = new Uint8Array(width * height * 4).fill(200);
  const frame = sampleQuadrants({ pixels, width, height }, { columns: 1, rows: 1 });
  assertEquals(frame.cells[0]!.glyph, "█");
});

Deno.test("both modes answer the same grid contract", () => {
  for (
    const frame of [
      sampleDensityRamp(splitFrame(), { columns: 4, rows: 2 }),
      sampleQuadrants(splitFrame(), { columns: 4, rows: 2 }),
    ]
  ) {
    assertEquals(frame.columns, 4);
    assertEquals(frame.rows, 2);
    assertEquals(frame.cells.length, 8);
  }
});

Deno.test("the backend seam falls back to CPU with an explicit reason", () => {
  const cpu = createSamplerBackend();
  assertEquals(cpu.kind, "cpu");
  assert(cpu.fallbackReason!.includes("no GPU sampler provided"));
  assertEquals(cpu.sample(splitFrame(), { columns: 2, rows: 1 }, "quadrant").mode, "quadrant");

  let called = 0;
  const gpu = createSamplerBackend({
    gpu: (input, grid, mode): SampledFrame => {
      called += 1;
      return { mode, columns: grid.columns, rows: grid.rows, cells: [] };
    },
  });
  assertEquals(gpu.kind, "gpu");
  assertEquals(gpu.fallbackReason, undefined);
  gpu.sample(splitFrame(), { columns: 1, rows: 1 }, "density-ramp");
  assertEquals(called, 1);
});

Deno.test("the CPU sampler is documented as not-3D-rendering", () => {
  assert(Object.isFrozen(PIXEL_SAMPLER_LIMITS));
  assert(PIXEL_SAMPLER_LIMITS.cpu.includes("not software 3D rendering"));
});
