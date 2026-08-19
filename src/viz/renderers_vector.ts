// Copyright 2023 Im-Beast. MIT license.

// Rank-1 visualisations: an array read at one instant, and that array over time.
//
// The distinction matters more than it looks. Per-core CPU load is `1d` — one
// value per core, right now — and drawing it as bars answers "which core is
// busy". Keeping those arrays over time is `1dt`, and drawing that as a
// waterfall answers "which core has been busy", which no single frame can.

import { blankFrame, type Visualization, type VizContext, type VizFrame, writeText } from "./render.ts";
import { baselineDomain, domainOfAll, normalize, resample, safeDomain } from "./scale.ts";
import { mixColor, rampGradient } from "./theme.ts";
import type { Sample, Vector } from "./data.ts";

const COLUMN_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
/** Intensity by density, so a waterfall reads without colour. */
const WATERFALL_GLYPHS = ["·", "░", "▒", "▓", "█"] as const;

/**
 * 1d — vertical bars, one per entry.
 *
 * Entries are given whole columns and share the remainder, so eight cores in
 * thirty columns do not silently become seven.
 */
export const bars: Visualization<Vector> = {
  id: "bars",
  label: "Bars",
  accepts: "1d",
  minimum: { width: 2, height: 2 },
  // A column each: eighty-eight cores want eighty-eight columns.
  perEntry: { columns: 1 },
  weight: 0.8,
  render(values, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || values.length === 0) return frame;
    const domain = baselineDomain([values], context.domain);
    for (let column = 0; column < width; column += 1) {
      // Map the column back to an entry, so a narrow box shows all of them
      // compressed rather than the first few at full width.
      const entry = Math.min(values.length - 1, Math.floor((column * values.length) / width));
      const fraction = normalize(values[entry] ?? 0, domain);
      const colour = rampGradient(context.theme, fraction);
      const exact = fraction * height;
      const whole = Math.floor(exact);
      for (let row = 0; row < height; row += 1) {
        const fromBottom = height - 1 - row;
        if (fromBottom < whole) {
          frame[row]![column] = { char: "█", foreground: colour, background: context.theme.background };
        } else if (fromBottom === whole) {
          const remainder = exact - whole;
          if (remainder > 0) {
            const index = Math.min(COLUMN_GLYPHS.length - 1, Math.floor(remainder * COLUMN_GLYPHS.length));
            frame[row]![column] = {
              char: COLUMN_GLYPHS[index]!,
              foreground: colour,
              background: context.theme.background,
            };
          }
        }
      }
    }
    return frame;
  },
};

/**
 * 1d — a rack of labelled horizontal meters, one row per entry.
 *
 * What bars cannot do is name anything. When entries have identities — eight
 * cores, four interfaces — a rack says which row is which, at the cost of one
 * row each.
 */
export const rack: Visualization<Vector> = {
  id: "rack",
  label: "Rack",
  accepts: "1d",
  minimum: { width: 8, height: 1 },
  // A row each, which is what makes it readable for a few entries and hopeless
  // for many.
  perEntry: { rows: 1 },
  weight: 0.6,
  render(values, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || values.length === 0) return frame;
    const domain = baselineDomain([values], context.domain);
    const labelWidth = Math.min(8, Math.max(0, width - 6));
    const barWidth = Math.max(1, width - labelWidth - 5);
    const rows = Math.min(height, values.length);
    for (let row = 0; row < rows; row += 1) {
      const fraction = normalize(values[row] ?? 0, domain);
      const colour = rampGradient(context.theme, fraction);
      if (labelWidth > 0) {
        writeText(frame, 0, row, String(row).padEnd(labelWidth).slice(0, labelWidth), {
          foreground: context.theme.axis,
          background: context.theme.background,
        });
      }
      const filled = Math.round(fraction * barWidth);
      for (let column = 0; column < barWidth; column += 1) {
        frame[row]![labelWidth + column] = {
          char: column < filled ? "█" : "·",
          foreground: column < filled ? colour : context.theme.grid,
          background: context.theme.background,
        };
      }
      writeText(frame, labelWidth + barWidth + 1, row, String(Math.round(fraction * 100)).padStart(3), {
        foreground: context.theme.foreground,
        background: context.theme.background,
      });
    }
    return frame;
  },
};

/**
 * 1dt — a waterfall: entries across, time down.
 *
 * Each row is one reading of the whole array, newest at the top, so a core that
 * has been pinned shows as a vertical stripe and a burst shows as a horizontal
 * one. This is the shape an audio spectrogram takes, and the shape "which of
 * these has been busy" is legible in.
 */
export const waterfall: Visualization<readonly Sample<1>[]> = {
  id: "waterfall",
  label: "Waterfall",
  accepts: "1dt",
  minimum: { width: 4, height: 3 },
  perEntry: { columns: 1 },
  minimumEntries: 6,
  weight: 1,
  render(samples, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || samples.length === 0) return frame;
    const domain = safeDomain(context.domain ?? domainOfAll(samples.map((sample) => sample.value)));
    // Newest first: the most recent reading is the row the eye starts on.
    const recent = samples.slice(Math.max(0, samples.length - height)).reverse();
    for (let row = 0; row < Math.min(height, recent.length); row += 1) {
      const reading = resample(recent[row]!.value, width);
      for (let column = 0; column < width; column += 1) {
        const fraction = normalize(reading[column] ?? 0, domain);
        // Shade as well as colour. A glyph that is either blank or full makes
        // every busy reading look identical, and says nothing at all to a
        // monochrome terminal — the waterfall becomes a solid wall.
        const shade = Math.min(WATERFALL_GLYPHS.length - 1, Math.round(fraction * (WATERFALL_GLYPHS.length - 1)));
        frame[row]![column] = {
          char: WATERFALL_GLYPHS[shade]!,
          foreground: shade === 0 ? context.theme.grid : rampGradient(context.theme, fraction),
          background: context.theme.background,
        };
      }
    }
    return frame;
  },
};

/**
 * 1d — a trace: the vector as a continuous line across the box.
 *
 * Bars answer "how much of each"; a trace answers "what shape is this", which
 * is a different question and the one an equaliser or an oscilloscope is
 * asking. Consecutive points are joined rather than plotted as dots, because a
 * scatter of points is something the eye has to assemble and a line is not —
 * and at sixty frames a second an assembled shape is the whole effect.
 */
export const scope: Visualization<Vector> = {
  id: "scope",
  label: "Scope",
  accepts: "1d",
  minimum: { width: 8, height: 3 },
  // No per-entry appetite: a trace resamples across the box, so two hundred
  // points in forty columns is a coarse curve rather than an unreadable one.
  // It does want enough points to have a shape — a line between two of them is
  // not a trace of anything.
  minimumEntries: 8,
  weight: 0.85,
  render(values, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || values.length === 0) return frame;
    // Resampled across the width, so twenty-eight bands are a curve over sixty
    // columns rather than twenty-eight dots with gaps between them.
    const points = resample(values, width);
    const domain = safeDomain(context.domain ?? domainOfAll([values]));
    let previous: number | undefined;
    for (let column = 0; column < width; column += 1) {
      const fraction = normalize(points[column] ?? 0, domain);
      const row = Math.min(height - 1, Math.max(0, Math.round((1 - fraction) * (height - 1))));
      const colour = rampGradient(context.theme, fraction);
      if (previous !== undefined && Math.abs(previous - row) > 1) {
        // The riser between two samples a long way apart. Dimmer than the trace
        // itself so a steep edge reads as one line rather than a solid column.
        const step = previous < row ? 1 : -1;
        const trail = mixColor(colour, context.theme.background, 0.45);
        for (let between = previous + step; between !== row; between += step) {
          frame[between]![column] = { char: "│", foreground: trail, background: context.theme.background };
        }
      }
      frame[row]![column] = { char: "─", foreground: colour, background: context.theme.background };
      previous = row;
    }
    return frame;
  },
};

export const VECTOR_VISUALIZATIONS: readonly Visualization<never>[] = Object.freeze([
  bars as unknown as Visualization<never>,
  scope as unknown as Visualization<never>,
  rack as unknown as Visualization<never>,
  waterfall as unknown as Visualization<never>,
]);
