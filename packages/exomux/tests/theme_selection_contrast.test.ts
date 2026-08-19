// Copyright 2023 Im-Beast. MIT license.

// 044 shipped an unfocused selection whose label nobody could read: the muted
// band was visible in every preset and the text on it measured 1.52-2.86:1.
// The vocabulary's rule is that a foreground names the ground it is read
// against; this asserts the pair actually clears the bar, for every theme.

import { assert } from "./deps.ts";
import { EXOMUX_THEMES } from "../model.ts";
import { exomuxThemeDocument } from "../theme_documents.ts";
import { contrastRatio, resolveControlTokens, rgbToOklch } from "@ubernaut/exotui/theme";
import type { Rgb } from "@ubernaut/exotui/theme";

/** WCAG AA for normal text. */
const READABLE = 4.5;
/** Enough tonal separation that a muted row reads as a band at all. */
const VISIBLE = 1.5;

Deno.test("every preset's unfocused selection is both visible and readable", () => {
  const failures: string[] = [];

  for (const theme of EXOMUX_THEMES) {
    const tokens = resolveControlTokens(exomuxThemeDocument(theme).tokens);
    const background = tokens["control:background-selected-unfocused"];
    const foreground = tokens["control:foreground-selected-unfocused"];
    const ground = tokens["control:background"];
    assert(background && foreground && ground, `${theme.id} resolves the unfocused selection`);

    const text = contrastRatio(foreground, background);
    const band = contrastRatio(background, ground);
    if (text < READABLE) failures.push(`${theme.id}: label on the muted row is ${text.toFixed(2)}:1`);
    if (band < VISIBLE) failures.push(`${theme.id}: muted row is ${band.toFixed(2)}:1 against the panel — invisible`);
  }

  assert(failures.length === 0, `unreadable or invisible unfocused selection:\n  ${failures.join("\n  ")}`);
});

Deno.test("the two selections are perceptually distinct in every preset", () => {
  // WCAG contrast is the wrong tool here: it measures luminance only, and the
  // focused row is a saturated accent while the unfocused one is grey. They
  // measured 1.04-2.58:1 against each other — apparently identical — while
  // being obviously different colours. OKLab distance counts hue and chroma
  // too. A just-noticeable difference is around 0.02; the closest preset
  // (seaglass) sits at 0.096.
  const JND = 0.02;
  const FLOOR = JND * 2;

  for (const theme of EXOMUX_THEMES) {
    const tokens = resolveControlTokens(exomuxThemeDocument(theme).tokens);
    const distance = oklabDistance(
      tokens["control:background-selected"]!,
      tokens["control:background-selected-unfocused"]!,
    );
    assert(
      distance >= FLOOR,
      `${theme.id}: the focused and unfocused selections are ${distance.toFixed(3)} apart in OKLab — ` +
        "too close to tell which list has the keyboard",
    );
  }
});

/** Perceptual distance in OKLab, so hue and chroma count and not only brightness. */
function oklabDistance(a: Rgb, b: Rgb): number {
  const first = rgbToOklch(a);
  const second = rgbToOklch(b);
  const toAb = (color: { c: number; h: number }) =>
    [
      color.c * Math.cos(color.h * Math.PI / 180),
      color.c * Math.sin(color.h * Math.PI / 180),
    ] as const;
  const [aa, ab] = toAb(first);
  const [ba, bb] = toAb(second);
  return Math.hypot(first.l - second.l, aa - ba, ab - bb);
}
