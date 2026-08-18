// Copyright 2023 Im-Beast. MIT license.

import { assert, assertAlmostEquals, assertEquals } from "./deps.ts";
import { COLOR_PICKER_AXIS_IDS, ColorPickerController } from "../src/components/color_picker.ts";
import { oklchToRgb, rgbToOklch } from "../src/theme_oklch.ts";
import type { Rgb } from "../src/theme_expressions.ts";

// Plan 042 slice C. The picker's contract is that every mutator is total: no
// input moves the colour somewhere it cannot be, and nothing throws.

const PINK: Rgb = [247, 101, 184];

Deno.test("OKLCH round-trips through sRGB exactly for colours in gamut", () => {
  for (
    const color of [PINK, [31, 162, 255], [122, 255, 180], [10, 45, 70], [255, 255, 255], [0, 0, 0], [
      128,
      128,
      128,
    ]] as const
  ) {
    assertEquals(oklchToRgb(rgbToOklch(color)), color, `${color} did not survive the round trip`);
  }
  // Grey has no hue to report, and reporting one would make the hue slider
  // jump the moment a colour desaturates.
  assertEquals(rgbToOklch([128, 128, 128]).c, 0);
  assertEquals(rgbToOklch([128, 128, 128]).h, 0);
});

Deno.test("lightness moves without dragging the hue with it", () => {
  const picker = new ColorPickerController({ color: PINK });
  const before = rgbToOklch(picker.color.peek());
  picker.adjust("lightness", 10);
  const after = rgbToOklch(picker.color.peek());
  assert(after.l > before.l, "it got lighter");
  assertAlmostEquals(after.h, before.h, 1.5, "and stayed the same colour");
  // The RGB axes are the opposite trade: exact numbers, hue drifts.
  picker.setColor(PINK);
  picker.setAxis("red", 200);
  assertEquals(picker.color.peek()[0], 200);
  picker.dispose();
});

Deno.test("axes clamp at their ends and hue wraps", () => {
  const picker = new ColorPickerController({ color: PINK });
  picker.setAxis("lightness", 5);
  assertEquals(picker.color.peek(), [255, 255, 255], "lightness stops at white");
  picker.setColor(PINK);
  picker.setAxis("lightness", -5);
  assertEquals(picker.color.peek(), [0, 0, 0], "and at black");

  picker.setColor(PINK);
  const hue = rgbToOklch(picker.color.peek()).h;
  picker.setAxis("hue", hue + 360);
  assertAlmostEquals(rgbToOklch(picker.color.peek()).h, hue, 1, "a full turn comes back");
  picker.setAxis("hue", -10);
  assertAlmostEquals(rgbToOklch(picker.color.peek()).h, 350, 1, "and negative wraps round");

  picker.setAxis("red", 9_999);
  assertEquals(picker.color.peek()[0], 255);
  picker.setAxis("blue", -9_999);
  assertEquals(picker.color.peek()[2], 0);

  // Nothing at all happens for values that are not numbers.
  const before = picker.color.peek();
  picker.setAxis("green", Number.NaN);
  picker.adjust("green", Number.POSITIVE_INFINITY);
  picker.nudge(0);
  assertEquals(picker.color.peek(), before);
  picker.dispose();
});

Deno.test("chroma beyond the gamut is mapped, not refused", () => {
  const picker = new ColorPickerController({ color: PINK });
  picker.setAxis("chroma", 1);
  const color = picker.color.peek();
  for (const channel of color) {
    assert(Number.isInteger(channel) && channel >= 0 && channel <= 255, `${color} is not a colour`);
  }
  // It stayed pink: gamut mapping keeps lightness and hue and gives up chroma.
  assertAlmostEquals(rgbToOklch(color).h, rgbToOklch(PINK).h, 3);
  picker.dispose();
});

Deno.test("a half-typed hex keeps its draft and leaves the colour alone", () => {
  const changes: Rgb[] = [];
  const picker = new ColorPickerController({ color: [0, 0, 0], onChange: (color) => changes.push(color) });
  assertEquals(picker.setDraft("#f7"), false);
  assertEquals(picker.inspect().draft, "#f7");
  assertEquals(picker.inspect().draftValid, false);
  assertEquals(picker.color.peek(), [0, 0, 0], "the colour waits for a complete value");
  assertEquals(changes, []);

  assertEquals(picker.setDraft("#f765b8"), true);
  assertEquals(picker.color.peek(), PINK);
  assertEquals(picker.inspect().draftValid, true);
  assertEquals(changes, [PINK]);

  // Abandoning a bad draft restores the field to what is actually selected.
  picker.setDraft("nonsense");
  picker.resetDraft();
  assertEquals(picker.inspect().draft, "#f765b8");
  picker.dispose();
});

Deno.test("swatches are one keystroke, and say which one is current", () => {
  const picker = new ColorPickerController({
    color: [0, 0, 0],
    swatches: [
      { color: PINK, hex: "#f765b8", label: "accent" },
      { color: [31, 162, 255], hex: "#1fa2ff", label: "border" },
    ],
  });
  assertEquals(picker.inspect().swatchIndex, -1, "black is not one of them");
  assertEquals(picker.selectSwatch(1), true);
  assertEquals(picker.color.peek(), [31, 162, 255]);
  assertEquals(picker.inspect().swatchIndex, 1);
  assertEquals(picker.inspect().hex, "#1fa2ff");
  assertEquals(picker.selectSwatch(7), false, "an index that is not there does nothing");
  assertEquals(picker.selectSwatch(-1), false);
  picker.dispose();
});

Deno.test("the axis selection cycles in both directions and drives nudge", () => {
  const picker = new ColorPickerController({ color: PINK });
  assertEquals(picker.axis.peek(), "lightness");
  picker.cycleAxis(-1);
  assertEquals(picker.axis.peek(), COLOR_PICKER_AXIS_IDS.at(-1), "it wraps backwards");
  picker.cycleAxis(1);
  assertEquals(picker.axis.peek(), "lightness");

  picker.selectAxis("blue");
  const before = picker.color.peek()[2];
  picker.nudge(3);
  assertEquals(picker.color.peek()[2], Math.min(255, before + 3), "nudge moves the selected axis");
  picker.dispose();
});

Deno.test("the inspection reports every axis with a drawable fraction", () => {
  const picker = new ColorPickerController({ color: PINK });
  const axes = picker.inspect().axes;
  assertEquals(axes.map((axis) => axis.id), [...COLOR_PICKER_AXIS_IDS]);
  for (const axis of axes) {
    assert(axis.fraction >= 0 && axis.fraction <= 1, `${axis.id} fraction ${axis.fraction} is not drawable`);
    assert(axis.value >= axis.min && axis.value <= axis.max, `${axis.id} is outside its own range`);
    assert(axis.step > 0 && axis.label.length > 0 && axis.text.length > 0);
  }
  picker.dispose();
});

Deno.test("the picker measures its colour against a ground", () => {
  const picker = new ColorPickerController({ color: PINK });
  // The mistake this whole feature exists to prevent, now answerable.
  assert(picker.contrastAgainst([240, 255, 254]) < 4.5, "hot pink on near-white is not readable");
  assert(picker.contrastAgainst([14, 21, 34]) > 4.5, "on a dark ground it is");
  picker.dispose();
});
