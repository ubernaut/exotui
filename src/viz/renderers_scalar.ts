// Copyright 2023 Im-Beast. MIT license.

// Rank-0 visualisations: one number, and one number over time.

import { blankFrame, type Visualization, type VizCell, type VizContext, type VizFrame, writeText } from "./render.ts";
import { baselineDomain, domainOfAll, normalize, resample, safeDomain } from "./scale.ts";
import { mixColor, rampGradient } from "./theme.ts";
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
  weight: 0.5,
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
  weight: 0.7,
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

const AREA_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * 0dt — an area chart: history filled from the baseline up.
 *
 * The shape every system monitor draws, and for a reason a scatter of points
 * makes obvious once you see them side by side: a filled body gives the eye an
 * edge to follow, so the trend reads at a glance instead of being reconstructed
 * dot by dot. The crest carries the value's colour and the body a dimmer mix of
 * it, which is what stops a full-height chart from becoming a solid slab.
 */
export const area: Visualization<readonly Sample<0>[]> = {
  id: "area",
  label: "Area",
  accepts: "0dt",
  minimum: { width: 4, height: 2 },
  // Above the psychograph, so a box that fits both gets the filled one.
  weight: 1.1,
  render(samples, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0) return frame;
    const values = resample(samples.map((sample) => sample.value), width);
    // Filled from a baseline, so the baseline is zero rather than the smallest
    // reading — an area chart that floats reads as busier than the machine is.
    const domain = baselineDomain(values, context.domain);
    for (let column = 0; column < width; column += 1) {
      const fraction = normalize(values[column] ?? 0, domain);
      const colour = rampGradient(context.theme, fraction);
      const body = mixColor(colour, context.theme.background, 0.55);
      const filled = fraction * height;
      const whole = Math.min(height, Math.floor(filled));
      for (let step = 0; step < whole; step += 1) {
        frame[height - 1 - step]![column] = {
          char: "█",
          foreground: body,
          background: context.theme.background,
        };
      }
      if (whole < height) {
        const remainder = filled - whole;
        // A value that rounds to nothing still gets its baseline tick, or an
        // idle series disappears rather than reading as idle.
        const index = Math.max(0, Math.min(AREA_GLYPHS.length - 1, Math.floor(remainder * AREA_GLYPHS.length)));
        frame[height - 1 - whole]![column] = {
          char: AREA_GLYPHS[index]!,
          foreground: colour,
          background: context.theme.background,
        };
      }
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
  // The richest scalar view, so it wins wherever it has room.
  weight: 1,
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

/**
 * 0d — the value as text, for a box with no room for a chart.
 *
 * The last rung of the ladder. A terminal can always be made small enough that
 * a meter is a lie — one cell cannot show sixty-five states — and at that size
 * the honest thing is the number itself. It is a visualisation like any other
 * so the same registry can choose it, rather than every caller carrying its own
 * special case for "too small to draw".
 */
export const readout: Visualization<number> = {
  id: "readout",
  label: "Readout",
  accepts: "0d",
  minimum: { width: 1, height: 1 },
  // The floor: always available, never preferred where anything else fits.
  weight: 0.2,
  render(value, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0) return frame;
    const domain = safeDomain(context.domain ?? { min: 0, max: 1 });
    const fraction = normalize(value, domain);
    const text = context.format?.(value) ?? `${Math.round(fraction * 100)}%`;
    // Right-aligned: the digits stay put as the value changes width, which is
    // what stops a readout jittering.
    const shown = text.length > width ? text.slice(text.length - width) : text.padStart(width);
    writeText(frame, 0, 0, shown, {
      foreground: rampGradient(context.theme, fraction),
      background: context.theme.background,
    });
    return frame;
  },
};

/** Every rank-0 visualisation, for a registry to pick from. */
export const SCALAR_VISUALIZATIONS: readonly Visualization<never>[] = Object.freeze([
  meter as unknown as Visualization<never>,
  readout as unknown as Visualization<never>,
  sparkline as unknown as Visualization<never>,
  area as unknown as Visualization<never>,
  psychograph as unknown as Visualization<never>,
]);

export type { VizCell, VizFrame };
