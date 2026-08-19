// Copyright 2023 Im-Beast. MIT license.

// Rank-0 visualisations: one number, and one number over time.

import { blankFrame, type Visualization, type VizCell, type VizContext, type VizFrame, writeText } from "./render.ts";
import { domainOfAll, normalize, resample, safeDomain } from "./scale.ts";
import { rampGradient } from "./theme.ts";
import type { Sample } from "./data.ts";

const METER_GLYPHS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

/**
 * 0d — a meter.
 *
 * Sub-cell glyphs rather than whole blocks, so a narrow meter still moves: at
 * eight columns a whole-block bar has nine states and this has sixty-five.
 */
export const meter: Visualization<number> = {
  id: "meter",
  label: "Meter",
  accepts: "0d",
  minimum: { width: 3, height: 1 },
  render(value, context) {
    const { width, height } = context.size;
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    if (width <= 0 || height <= 0) return frame;
    const fraction = normalize(value, safeDomain(context.domain ?? { min: 0, max: 1 }));
    const colour = rampGradient(context.theme, fraction);
    const exact = fraction * width;
    const whole = Math.floor(exact);
    const remainder = exact - whole;
    const row = frame[0]!;
    for (let column = 0; column < width; column += 1) {
      if (column < whole) {
        row[column] = { char: "█", foreground: colour, background: context.theme.background };
      } else if (column === whole && remainder > 0) {
        const index = Math.min(METER_GLYPHS.length - 1, Math.floor(remainder * METER_GLYPHS.length));
        row[column] = { char: METER_GLYPHS[index]!, foreground: colour, background: context.theme.background };
      } else {
        row[column] = { char: "·", foreground: context.theme.grid, background: context.theme.background };
      }
    }
    if (context.label && height > 1) writeText(frame, 0, 1, context.label, { foreground: context.theme.axis });
    return frame;
  },
};

const SPARK_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/** 0dt — a sparkline: one number's history, one row per call. */
export const sparkline: Visualization<readonly Sample<0>[]> = {
  id: "sparkline",
  label: "Sparkline",
  accepts: "0dt",
  minimum: { width: 2, height: 1 },
  render(samples, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0) return frame;
    const values = resample(samples.map((sample) => sample.value), width);
    const domain = safeDomain(context.domain ?? domainOfAll(values));
    const row = frame[height - 1]!;
    for (let column = 0; column < width; column += 1) {
      const fraction = normalize(values[column] ?? 0, domain);
      const index = Math.min(SPARK_GLYPHS.length - 1, Math.round(fraction * (SPARK_GLYPHS.length - 1)));
      row[column] = {
        char: SPARK_GLYPHS[index]!,
        foreground: rampGradient(context.theme, fraction),
        background: context.theme.background,
      };
    }
    return frame;
  },
};

/**
 * 0dt — a psychograph: the same history plotted as points across the full box.
 *
 * Where a sparkline compresses history into one row of glyph heights, this
 * gives it the whole rectangle, so the shape of a signal is legible rather than
 * implied. It is the display an equaliser wants: a wave you can see the form of.
 */
export const psychograph: Visualization<readonly Sample<0>[]> = {
  id: "psychograph",
  label: "Psychograph",
  accepts: "0dt",
  minimum: { width: 8, height: 4 },
  render(samples, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0) return frame;
    const values = resample(samples.map((sample) => sample.value), width);
    const domain = safeDomain(context.domain ?? domainOfAll(values));
    for (let column = 0; column < width; column += 1) {
      const fraction = normalize(values[column] ?? 0, domain);
      // Row 0 is the top, so a high value has to plot near it.
      const row = Math.min(height - 1, Math.max(0, Math.round((1 - fraction) * (height - 1))));
      frame[row]![column] = {
        char: "■",
        foreground: rampGradient(context.theme, fraction),
        background: context.theme.background,
      };
    }
    return frame;
  },
};

/** Every rank-0 visualisation, for a registry to pick from. */
export const SCALAR_VISUALIZATIONS: readonly Visualization<never>[] = Object.freeze([
  meter as unknown as Visualization<never>,
  sparkline as unknown as Visualization<never>,
  psychograph as unknown as Visualization<never>,
]);

export type { VizCell, VizFrame };
