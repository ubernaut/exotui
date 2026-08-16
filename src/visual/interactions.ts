// Copyright 2023 Im-Beast. MIT license.

// VIS-007: chart interactions speak DATA, not cells. The controller owns
// the live x/y domains; crosshair moves invert cell positions through
// the scales into domain coordinates and surface the nearest data point
// semantically; pan shifts and zoom rescales the domain around the
// anchor's data value — every domain change lands on an undo stack, so
// interactions are exactly reversible; rectangular brushing converts the
// cell rectangle to a domain rectangle and returns the SELECTED POINTS
// (plus the domain rect), never just cell coordinates.

import type { DataPoint } from "./downsample.ts";
import { type ContinuousScale, linearScale } from "./scales.ts";

/** The semantic crosshair state. */
export interface CrosshairState {
  readonly dataX: number;
  readonly dataY: number;
  readonly nearest?: DataPoint;
}

/** A semantic brush selection. */
export interface BrushSelection {
  readonly domain: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number };
  readonly points: readonly DataPoint[];
}

/** Controller options. */
export interface ChartInteractionOptions {
  readonly xDomain: readonly [number, number];
  readonly yDomain: readonly [number, number];
  readonly xRange: readonly [number, number];
  readonly yRange: readonly [number, number];
  readonly points: readonly DataPoint[];
}

/** The interaction controller. */
export class ChartInteractionController {
  readonly #xRange: readonly [number, number];
  readonly #yRange: readonly [number, number];
  readonly #points: readonly DataPoint[];
  #xDomain: readonly [number, number];
  #yDomain: readonly [number, number];
  readonly #history: Array<{ x: readonly [number, number]; y: readonly [number, number] }> = [];

  constructor(options: ChartInteractionOptions) {
    this.#xDomain = options.xDomain;
    this.#yDomain = options.yDomain;
    this.#xRange = options.xRange;
    this.#yRange = options.yRange;
    this.#points = options.points;
  }

  xScale(): ContinuousScale {
    return linearScale(this.#xDomain, this.#xRange);
  }

  yScale(): ContinuousScale {
    return linearScale(this.#yDomain, this.#yRange);
  }

  /** Crosshair at a cell: semantic position + nearest point in x. */
  crosshair(cellX: number, cellY: number): CrosshairState {
    const dataX = this.xScale().invert(cellX);
    const dataY = this.yScale().invert(cellY);
    let nearest: DataPoint | undefined;
    let bestDistance = Infinity;
    for (const point of this.#points) {
      const distance = Math.abs(point.x - dataX);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = point;
      }
    }
    return { dataX, dataY, nearest };
  }

  /** Pans by cells; the domain shifts by the equivalent data delta. */
  pan(deltaCells: number): void {
    const scale = this.xScale();
    const dataDelta = scale.invert(deltaCells) - scale.invert(0);
    this.#push();
    this.#xDomain = [this.#xDomain[0] - dataDelta, this.#xDomain[1] - dataDelta];
  }

  /** Zooms by a factor around the data value under the anchor cell. */
  zoom(factor: number, anchorCell: number): void {
    if (factor <= 0) return;
    const anchorData = this.xScale().invert(anchorCell);
    this.#push();
    this.#xDomain = [
      anchorData - (anchorData - this.#xDomain[0]) / factor,
      anchorData + (this.#xDomain[1] - anchorData) / factor,
    ];
  }

  /** Rectangular brush in cells → semantic selection. */
  brush(cellX0: number, cellY0: number, cellX1: number, cellY1: number): BrushSelection {
    const xs = [this.xScale().invert(cellX0), this.xScale().invert(cellX1)].sort((a, b) => a - b);
    const ys = [this.yScale().invert(cellY0), this.yScale().invert(cellY1)].sort((a, b) => a - b);
    const domain = { x0: xs[0]!, x1: xs[1]!, y0: ys[0]!, y1: ys[1]! };
    const points = this.#points.filter((point) =>
      point.x >= domain.x0 && point.x <= domain.x1 && point.y >= domain.y0 && point.y <= domain.y1
    );
    return { domain, points };
  }

  /** Reverses the most recent pan/zoom exactly. */
  undo(): boolean {
    const previous = this.#history.pop();
    if (!previous) return false;
    this.#xDomain = previous.x;
    this.#yDomain = previous.y;
    return true;
  }

  domains(): { x: readonly [number, number]; y: readonly [number, number] } {
    return { x: this.#xDomain, y: this.#yDomain };
  }

  #push(): void {
    this.#history.push({ x: this.#xDomain, y: this.#yDomain });
    if (this.#history.length > 128) this.#history.shift();
  }
}

/** Creates a chart interaction controller. */
export function createChartInteractionController(options: ChartInteractionOptions): ChartInteractionController {
  return new ChartInteractionController(options);
}
