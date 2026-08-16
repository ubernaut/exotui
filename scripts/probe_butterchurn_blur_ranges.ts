// Copyright 2023 Im-Beast. MIT license.

/**
 * 033 blur-range probe (data-only, no GPU): real butterchurn stores each blur
 * level range-compressed into [b*n, b*x] and clamps on store, which makes the
 * reconstruction a hard clamp to the authored bounds. Our pipeline hardcodes
 * (0,1) — a floor at 0 instead of the authored floor. If echo-class presets
 * author b1n > 0, real playback holds a luminance floor our loop is missing.
 *
 *   deno run -A -c packages/exomux/deno.json scripts/probe_butterchurn_blur_ranges.ts
 */

import { EXOMUX_BUTTERCHURN_CATALOG } from "../packages/exomux/butterchurn_catalog.ts";

const FIELDS = ["b1n", "b1x", "b2n", "b2x", "b3n", "b3x", "b1ed"] as const;
const DEFAULTS: Record<(typeof FIELDS)[number], number> = {
  b1n: 0,
  b1x: 1,
  b2n: 0,
  b2x: 1,
  b3n: 0,
  b3x: 1,
  b1ed: 0.25,
};

const ECHO_CLASS = [
  "Goody - The Wild Vort",
  "stahlregen - old school",
  "crush ice 72",
  "digital sea",
  "bouncing balls",
  "mushroom rainbows",
];

let nonDefault = 0;
const rows: string[] = [];
for (const preset of EXOMUX_BUTTERCHURN_CATALOG) {
  const base = (preset as { baseVals?: Record<string, number> }).baseVals ?? {};
  const authored = FIELDS.filter((field) => base[field] !== undefined && base[field] !== DEFAULTS[field]);
  const usesBlurInFrame = /\bb[123][nx]\s*=/.test(
    (preset as { frame?: string }).frame ?? "",
  );
  if (authored.length === 0 && !usesBlurInFrame) continue;
  nonDefault += 1;
  const echo = ECHO_CLASS.some((needle) => preset.name.toLowerCase().includes(needle.toLowerCase())) ? " <== ECHO" : "";
  const values = authored.map((field) => `${field}=${base[field]}`).join(" ");
  rows.push(`${preset.name}: ${values}${usesBlurInFrame ? " [frame-animated]" : ""}${echo}`);
}

console.log(`catalog: ${EXOMUX_BUTTERCHURN_CATALOG.length} presets, ${nonDefault} with non-default blur ranges\n`);
for (const row of rows) console.log(row);

console.log("\n--- echo-class presets, all blur fields (authored or default) ---");
for (const preset of EXOMUX_BUTTERCHURN_CATALOG) {
  if (!ECHO_CLASS.some((needle) => preset.name.toLowerCase().includes(needle.toLowerCase()))) continue;
  const base = (preset as { baseVals?: Record<string, number> }).baseVals ?? {};
  const values = FIELDS.map((field) => `${field}=${base[field] ?? DEFAULTS[field]}`).join(" ");
  console.log(`${preset.name}: ${values}`);
}
