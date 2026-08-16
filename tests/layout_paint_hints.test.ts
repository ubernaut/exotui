// Copyright 2023 Im-Beast. MIT license.

// C1 renderer-neutral paint hints: opacity, tint, and hatch live in the
// normalized style model as renderer-owned fields (like color), parse from
// CSS-like declarations, and survive cloning without shared references.

import { assertEquals } from "./deps.ts";
import {
  applyLayoutDeclarations,
  cloneComputedLayoutStyle,
  defaultComputedLayoutStyle,
  LAYOUT_HATCH_PATTERNS,
  resolvedLayoutDeclarationFields,
} from "../mod.ts";

Deno.test("opacity parses numbers and percentages, clamps, and rejects junk", () => {
  const base = defaultComputedLayoutStyle();
  assertEquals(base.opacity, 1);
  assertEquals(applyLayoutDeclarations(base, [["opacity", "0.35"]]).opacity, 0.35);
  assertEquals(applyLayoutDeclarations(base, [["opacity", "40%"]]).opacity, 0.4);
  assertEquals(applyLayoutDeclarations(base, [["opacity", "3"]]).opacity, 1);
  const rejected = applyLayoutDeclarations(
    applyLayoutDeclarations(base, [["opacity", "0.5"]]),
    [["opacity", "mostly"]],
  );
  assertEquals(rejected.opacity, 0.5);
});

Deno.test("tint stores a color and `none` clears it", () => {
  const base = defaultComputedLayoutStyle();
  const tinted = applyLayoutDeclarations(base, [["tint", "rgba(255,0,0,0.4)"]]);
  assertEquals(tinted.tint, "rgba(255,0,0,0.4)");
  assertEquals(applyLayoutDeclarations(tinted, [["tint", "none"]]).tint, undefined);
});

Deno.test("hatch accepts named patterns and single-cell custom glyphs", () => {
  const base = defaultComputedLayoutStyle();
  const named = applyLayoutDeclarations(base, [["hatch", "right cyan"]]);
  assertEquals(named.hatch, { glyph: LAYOUT_HATCH_PATTERNS["right"], color: "cyan" });
  const custom = applyLayoutDeclarations(base, [["hatch", '"░" #446688']]);
  assertEquals(custom.hatch, { glyph: "░", color: "#446688" });
  const bare = applyLayoutDeclarations(base, [["hatch", "·"]]);
  assertEquals(bare.hatch, { glyph: "·", color: undefined });
  // Multi-cell fills are rejected wholesale; the previous value stands.
  assertEquals(applyLayoutDeclarations(named, [["hatch", "ab red"]]).hatch?.glyph, LAYOUT_HATCH_PATTERNS["right"]);
  assertEquals(applyLayoutDeclarations(named, [["hatch", "none"]]).hatch, undefined);
});

Deno.test("paint hints clone without shared references and report their fields", () => {
  const styled = applyLayoutDeclarations(defaultComputedLayoutStyle(), [
    ["opacity", "0.75"],
    ["tint", "magenta"],
    ["hatch", "cross blue"],
  ]);
  const clone = cloneComputedLayoutStyle(styled);
  assertEquals(clone.opacity, 0.75);
  assertEquals(clone.tint, "magenta");
  assertEquals(clone.hatch, styled.hatch);
  assertEquals(clone.hatch === styled.hatch, false);

  assertEquals(resolvedLayoutDeclarationFields("opacity", "0.5"), ["opacity"]);
  assertEquals(resolvedLayoutDeclarationFields("tint", "red"), ["tint"]);
  assertEquals(resolvedLayoutDeclarationFields("hatch", "left green"), ["hatch"]);
});
