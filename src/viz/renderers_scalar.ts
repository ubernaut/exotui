// Copyright 2023 Im-Beast. MIT license.

// Rank-0 visualisations: one number, and one number over time.

import { blankFrame, type Visualization, type VizCell, type VizContext, type VizFrame, writeText } from "./render.ts";
import { drawArc, drawLine, plot } from "./draw.ts";
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

/**
 * 0d — a dial: an arc that fills with the value, and the number in the middle.
 *
 * Promoted from the neon demos' field ring, where it was a decoration driven by
 * a phase counter. What makes it a visualisation rather than an ornament is
 * that the sweep is the value: a glance reads the angle without reading the
 * digits, which is the whole argument for a round gauge over a bar.
 *
 * The radii differ because a character cell is about twice as tall as it is
 * wide; equal radii draw an upright oval.
 */
export const dial: Visualization<number> = {
  id: "dial",
  label: "Dial",
  accepts: "0d",
  minimum: { width: 9, height: 5 },
  weight: 0.65,
  render(value, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0) return frame;
    const fraction = normalize(value, safeDomain(context.domain ?? { min: 0, max: 1 }));
    const centre = { column: (width - 1) / 2, row: (height - 1) / 2 };
    const radius = { column: Math.max(2, (width - 1) / 2 - 1), row: Math.max(1, (height - 1) / 2) };
    // A gauge sweep, open at the bottom: three quarters of a turn starting at
    // the lower left, which is where every dial anyone has read starts.
    const START = 0.375;
    const SWEEP = 0.75;
    drawArc(frame, centre, radius, "·", {
      from: START,
      to: START + SWEEP,
      foreground: context.theme.grid,
      background: context.theme.background,
    });
    if (fraction > 0) {
      drawArc(frame, centre, radius, "●", {
        from: START,
        to: START + SWEEP * fraction,
        styleAt: (along) => ({
          foreground: rampGradient(context.theme, fraction * along),
          background: context.theme.background,
        }),
      });
    }
    const text = context.format?.(value) ?? `${Math.round(fraction * 100)}%`;
    if (text.length <= width - 2) {
      writeText(frame, Math.round(centre.column - (text.length - 1) / 2), Math.round(centre.row), text, {
        foreground: rampGradient(context.theme, fraction),
        background: context.theme.background,
      });
    }
    return frame;
  },
};

const ODOMETER_DIGITS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "0": ["┏━┓", "┃ ┃", "┗━┛"],
  "1": [" ┓ ", " ┃ ", " ╹ "],
  "2": ["┏━┓", "┏━┛", "┗━╸"],
  "3": ["┏━┓", " ━┫", "┗━┛"],
  "4": ["╻ ╻", "┗━┫", "  ╹"],
  "5": ["┏━╸", "┗━┓", "┗━┛"],
  "6": ["┏━╸", "┣━┓", "┗━┛"],
  "7": ["┏━┓", "  ┃", "  ╹"],
  "8": ["┏━┓", "┣━┫", "┗━┛"],
  "9": ["┏━┓", "┗━┫", "┗━┛"],
  "%": ["╻ ╱", " ╱ ", "╱ ╹"],
  ".": ["   ", "   ", " ╺ "],
  "-": ["   ", "╺━╸", "   "],
  "°": ["┏┓ ", "┗┛ ", "   "],
  " ": ["   ", "   ", "   "],
});

/**
 * 0d — the value in large glyphs, three rows tall.
 *
 * The counter boards in the neon demos, made to carry a real number. A readout
 * one cell tall is legible at a desk and invisible from across a room, and a
 * wall display is a real use — so where a tile has the room, this spends it on
 * size rather than on a chart nobody is close enough to read.
 */
export const odometer: Visualization<number> = {
  id: "odometer",
  label: "Odometer",
  accepts: "0d",
  minimum: { width: 12, height: 3 },
  weight: 0.55,
  render(value, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0) return frame;
    const fraction = normalize(value, safeDomain(context.domain ?? { min: 0, max: 1 }));
    const text = context.format?.(value) ?? `${Math.round(fraction * 100)}%`;
    const glyphs = [...text].map((character) => ODOMETER_DIGITS[character] ?? ODOMETER_DIGITS[" "]!);
    const drawn = glyphs.reduce((sum, digit) => sum + digit[0]!.length, 0);
    const style = { foreground: rampGradient(context.theme, fraction), background: context.theme.background };
    // Right-aligned and vertically centred: digits that stay put as the value
    // changes width are the difference between a display and a flicker.
    let column = width - drawn;
    const top = Math.max(0, Math.floor((height - 3) / 2));
    for (const digit of glyphs) {
      for (let row = 0; row < digit.length; row += 1) writeText(frame, column, top + row, digit[row]!, style);
      column += digit[0]!.length;
    }
    return frame;
  },
};

/**
 * 0dt — a strip chart: history as one joined line.
 *
 * The third answer to "a number over time", beside the filled area and the
 * scattered psychograph. A line neither hides the space under it nor asks the
 * eye to assemble points, which is what a trace on an instrument looks like and
 * why the biosignal strips in the demos read the way they do.
 */
export const strip: Visualization<readonly Sample<0>[]> = {
  id: "strip",
  label: "Strip",
  accepts: "0dt",
  minimum: { width: 6, height: 3 },
  weight: 0.9,
  render(samples, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0) return frame;
    const values = resample(samples.map((sample) => sample.value), width);
    const domain = safeDomain(context.domain ?? domainOfAll(values));
    const points = values.map((value, column) => ({
      column,
      row: Math.min(height - 1, Math.max(0, Math.round((1 - normalize(value, domain)) * (height - 1)))),
      value,
    }));
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index]!;
      drawLine(frame, points[index - 1]!, point, "─", {
        foreground: rampGradient(context.theme, normalize(point.value, domain)),
        background: context.theme.background,
      });
    }
    // The newest reading, marked: on a strip the right-hand end is the present,
    // and an unmarked line does not say which end that is.
    const last = points.at(-1);
    if (last) {
      plot(frame, last.column, last.row, "●", {
        foreground: rampGradient(context.theme, normalize(last.value, domain)),
        background: context.theme.background,
      });
    }
    return frame;
  },
};

/** Every rank-0 visualisation, for a registry to pick from. */
export const SCALAR_VISUALIZATIONS: readonly Visualization<never>[] = Object.freeze([
  meter as unknown as Visualization<never>,
  readout as unknown as Visualization<never>,
  dial as unknown as Visualization<never>,
  odometer as unknown as Visualization<never>,
  strip as unknown as Visualization<never>,
  sparkline as unknown as Visualization<never>,
  area as unknown as Visualization<never>,
  psychograph as unknown as Visualization<never>,
]);

export type { VizCell, VizFrame };
