// Copyright 2023 Im-Beast. MIT license.

// VIS-002: axes are measured in CELLS and labels are placed WHOLE. Ticks
// come from the VIS-001 scale; labels format locale-aware through Intl
// and are measured with the emoji-aware width machinery, so a label is
// either placed intact or not placed — nothing ever splits a grapheme.
// Collision handling is deterministic thinning: the first and last tick
// are always kept, and the stride grows until no two kept labels overlap
// (one-cell gap enforced), so the same inputs always keep the same
// ticks. Grid lines follow the kept ticks.

import { emojiAwareTextWidth } from "../unicode/emoji.ts";
import { type ContinuousScale, toCell } from "./scales.ts";

/** One placed tick. */
export interface AxisTick {
  readonly value: number;
  /** The tick's cell along the axis. */
  readonly cell: number;
  readonly label: string;
  /** The label's starting cell (x-axis) or row (y-axis). */
  readonly labelStart: number;
  readonly labelCells: number;
}

/** One computed axis layout. */
export interface AxisLayout {
  readonly orientation: "x" | "y";
  readonly ticks: readonly AxisTick[];
  /** Cells (x) or rows (y) that carry grid lines. */
  readonly gridCells: readonly number[];
  /** For y axes: the gutter width needed for the widest label. */
  readonly gutterCells: number;
  /** How many candidate ticks thinning dropped. */
  readonly thinned: number;
}

/** Axis options. */
export interface AxisOptions {
  readonly orientation: "x" | "y";
  readonly locale?: string;
  /** Overrides Intl formatting entirely. */
  readonly format?: (value: number) => string;
  /** Target tick count before thinning (default from axis length). */
  readonly tickCount?: number;
}

/** Builds a collision-free axis layout from a scale. */
export function buildAxis(scale: ContinuousScale, options: AxisOptions): AxisLayout {
  const formatter = options.format ??
    ((value: number) => new Intl.NumberFormat(options.locale ?? "en-US").format(value));
  const [r0, r1] = scale.range;
  const lengthCells = Math.abs(r1 - r0) + 1;
  const tickCount = options.tickCount ?? Math.max(2, Math.floor(lengthCells / 8));

  const values = scale.ticks(tickCount);
  const candidates = values.map((value) => {
    const label = formatter(value);
    const labelCells = emojiAwareTextWidth(label);
    const cell = toCell(scale, value);
    const labelStart = options.orientation === "x"
      ? Math.max(Math.min(r0, r1), cell - Math.floor(labelCells / 2))
      : cell;
    return { value, cell, label, labelStart, labelCells };
  });

  // Deterministic thinning: try stride 1, 2, 3… keeping endpoints, until
  // no two kept labels collide.
  const collides = (kept: readonly AxisTick[]): boolean => {
    for (let index = 1; index < kept.length; index += 1) {
      const previous = kept[index - 1]!;
      const current = kept[index]!;
      if (options.orientation === "y") {
        if (current.cell === previous.cell) return true;
      } else if (current.labelStart <= previous.labelStart + previous.labelCells) {
        return true; // one-cell gap required
      }
    }
    return false;
  };

  let kept: AxisTick[] = candidates;
  let stride = 1;
  while (candidates.length > 2 && collides(kept)) {
    stride += 1;
    const strided: AxisTick[] = [];
    for (let index = 0; index < candidates.length - 1; index += stride) strided.push(candidates[index]!);
    const last = candidates[candidates.length - 1]!;
    // Endpoints always survive thinning.
    if (strided[strided.length - 1] !== last) {
      // Drop a penultimate tick that would collide with the endpoint.
      while (
        strided.length > 1 &&
        (options.orientation === "y"
          ? strided[strided.length - 1]!.cell === last.cell
          : last.labelStart <= strided[strided.length - 1]!.labelStart + strided[strided.length - 1]!.labelCells)
      ) {
        strided.pop();
      }
      strided.push(last);
    }
    kept = strided;
    if (stride > candidates.length) break;
  }

  const gutterCells = options.orientation === "y" ? kept.reduce((max, tick) => Math.max(max, tick.labelCells), 0) : 0;
  return {
    orientation: options.orientation,
    ticks: kept,
    gridCells: kept.map((tick) => tick.cell),
    gutterCells,
    thinned: candidates.length - kept.length,
  };
}
