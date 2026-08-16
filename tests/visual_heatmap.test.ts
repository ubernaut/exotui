// Copyright 2023 Im-Beast. MIT license.

// VIS-004: truecolor, 256-color, 16-color, and monochrome outputs
// preserve the configured ordering.

import { assert, assertEquals } from "./deps.ts";
import { type HeatmapTarget, relativeLuminance, renderHeatmap } from "../mod.ts";

const TARGETS: HeatmapTarget[] = ["truecolor", "ansi256", "ansi16", "mono"];
const MONO_ORDER = " ░▒▓█";

Deno.test("monotone values render as monotone levels in every target", () => {
  const ascending = [Array.from({ length: 32 }, (_, index) => index / 31)];
  for (const target of TARGETS) {
    const render = renderHeatmap(ascending, { domain: [0, 1], target, levels: 8 });
    const cells = render.rows[0]!;
    let previousLevel = -1;
    let previousRank = -1;
    for (const cell of cells) {
      assert(cell.level >= previousLevel, `${target}: level regressed`);
      previousLevel = cell.level;
      // The rendered artifact is ordered too. Truecolor's order IS the
      // configured ramp (levels map onto legend entries exactly); the
      // reduced targets order by luminance or glyph-ramp rank.
      if (target === "truecolor") {
        assertEquals(cell.rgb, render.legend[cell.level]!.rgb);
        continue;
      }
      const rank = cell.rgb ? relativeLuminance(cell.rgb) : MONO_ORDER.indexOf(cell.glyph);
      assert(rank >= previousRank - 1e-9, `${target}: render rank regressed`);
      previousRank = rank;
    }
    // The full level range is exercised.
    assertEquals(cells[0]!.level, 0);
    assertEquals(cells[cells.length - 1]!.level, 7);
  }
});

Deno.test("legends are ordered and target-appropriate", () => {
  const truecolor = renderHeatmap([[0.5]], { domain: [0, 1], target: "truecolor", levels: 4 });
  assertEquals(truecolor.legend.length, 4);
  assertEquals(truecolor.legend[0]!.rgb, [20, 60, 200]); // configured ramp start
  assertEquals(truecolor.legend[3]!.rgb, [220, 50, 30]);

  const mono = renderHeatmap([[0.5]], { domain: [0, 1], target: "mono", levels: 5 });
  assertEquals(mono.legend.map((entry) => entry.glyph), [" ", "░", "▒", "▓", "█"]);
  assertEquals(mono.legend.every((entry) => entry.rgb === undefined), true);
});

Deno.test("missing and outlier cells are explicit kinds, never clamped data", () => {
  const render = renderHeatmap(
    [[0.2, null, -5, 0.9, 42]],
    { domain: [0, 1], target: "truecolor" },
  );
  const kinds = render.rows[0]!.map((cell) => cell.kind);
  assertEquals(kinds, ["value", "missing", "outlier-low", "value", "outlier-high"]);
  assertEquals(render.rows[0]![1]!.glyph, "·");
  assertEquals(render.rows[0]![2]!.glyph, "▽");
  assertEquals(render.rows[0]![4]!.glyph, "▲");
  assertEquals(render.rows[0]![1]!.level, -1); // not a data level
  // A degenerate domain still renders deterministically.
  const flat = renderHeatmap([[5, 5]], { domain: [5, 5], target: "mono" });
  assertEquals(flat.rows[0]!.map((cell) => cell.level), [0, 0]);
});
