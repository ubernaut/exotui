// Copyright 2023 Im-Beast. MIT license.

// THEM-005: generated colors are in gamut and meet declared contrast
// constraints in truecolor output.

import { assert, assertEquals } from "./deps.ts";
import { contrastRatio, generateTonalPalette, oklchInGamut, oklchToRgb, surfaceLadder, TONAL_STOPS } from "../mod.ts";

Deno.test("OKLCH conversion hits known anchors and maps out-of-gamut chroma", () => {
  assertEquals(oklchToRgb({ l: 1, c: 0, h: 0 }), [255, 255, 255]);
  assertEquals(oklchToRgb({ l: 0, c: 0, h: 0 }), [0, 0, 0]);
  const gray = oklchToRgb({ l: 0.5, c: 0, h: 0 });
  assert(gray[0] === gray[1] && gray[1] === gray[2]); // achromatic stays gray

  // A wildly out-of-gamut request still lands inside sRGB.
  const wild = { l: 0.6, c: 0.8, h: 150 };
  assert(!oklchInGamut(wild));
  const mapped = oklchToRgb(wild);
  assert(mapped.every((channel) => channel >= 0 && channel <= 255));
  // Hue survives the mapping: green stays dominant.
  assert(mapped[1] > mapped[0] && mapped[1] > mapped[2]);
});

Deno.test("tonal palettes are monotone in lightness and fully in gamut", () => {
  for (const hue of [0, 85, 150, 220, 310]) {
    const palette = generateTonalPalette(hue, { chroma: 0.15 });
    let previousLuma = -1;
    for (const stop of TONAL_STOPS) {
      const [r, g, b] = palette.tones[stop]!;
      assert(r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      assert(luma >= previousLuma - 1, `hue ${hue} tone ${stop} regressed in lightness`);
      previousLuma = luma;
    }
  }
});

Deno.test("surface ladders meet 4.5:1 contrast in both schemes across hues", () => {
  for (const hue of [0, 45, 120, 200, 280, 340]) {
    const palette = generateTonalPalette(hue);
    for (const scheme of ["light", "dark"] as const) {
      const ladder = surfaceLadder(palette, scheme);
      const primary = contrastRatio(ladder.onSurface, ladder.surface);
      assert(primary >= 4.5, `hue ${hue} ${scheme}: onSurface/surface ${primary.toFixed(2)}`);
      const muted = contrastRatio(ladder.onSurfaceMuted, ladder.surface);
      assert(muted >= 3, `hue ${hue} ${scheme}: muted ${muted.toFixed(2)}`);
    }
  }
});
