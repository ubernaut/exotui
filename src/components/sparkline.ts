// Copyright 2023 Im-Beast. MIT license.
import { Component, type ComponentOptions } from "../component.ts";
import { Computed, type Signal } from "../signals/mod.ts";
import { drawTextChild } from "./text_children.ts";

const SPARKLINE_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/** Options for configuring sparkline. */
export interface SparklineOptions extends ComponentOptions {
  values: number[] | Signal<number[]>;
}

/** Renders sparkline into deterministic text rows. */
export function renderSparkline(values: readonly number[], width: number): string {
  const safeWidth = Math.max(0, width);
  if (safeWidth === 0) return "";
  if (values.length === 0) return " ".repeat(safeWidth);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < safeWidth; index += 1) {
    const value = sampleSeriesValue(values, safeWidth, index);
    if (value === undefined) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const span = Math.max(0.000001, max - min);
  let line = "";
  for (let column = 0; column < safeWidth; column += 1) {
    const value = sampleSeriesValue(values, safeWidth, column);
    if (value === undefined) {
      // A series shorter than the width leaves the tail empty; repeating the
      // last value painted a fake flat plateau indistinguishable from data.
      line += " ";
      continue;
    }
    const glyphIndex = Math.max(0, Math.min(SPARKLINE_GLYPHS.length - 1, Math.round(((value - min) / span) * 7)));
    line += SPARKLINE_GLYPHS[glyphIndex];
  }
  return line;
}

function sampleSeriesValue(values: readonly number[], width: number, index: number): number | undefined {
  if (values.length <= width) {
    return values[index];
  }
  const sourceIndex = Math.floor((index / Math.max(1, width - 1)) * (values.length - 1));
  return values[sourceIndex] ?? 0;
}

/** Public class implementing a sparkline. */
export class Sparkline extends Component {
  constructor(private readonly options: SparklineOptions) {
    super(options);
  }

  override draw(): void {
    super.draw();
    drawTextChild(
      this,
      new Computed(() => {
        const values = Array.isArray(this.options.values) ? this.options.values : this.options.values.value;
        return renderSparkline(values, this.rectangle.value.width);
      }),
    );
  }
}
