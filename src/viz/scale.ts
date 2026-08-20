// Copyright 2023 Im-Beast. MIT license.

// Turning readings into the 0-1 fractions renderers draw with.
//
// Every visualisation needs this and every one would get it subtly wrong on its
// own. A domain of zero width divides by zero; an auto-scaled chart rescales on
// every frame so a flat line looks like noise; a value outside its domain draws
// past the end of its box. Doing it once, here, is why a heatmap and a sparkline
// showing the same stream agree about what "full" means.

import { extentOf, flatten } from "./data.ts";

export interface Domain {
  readonly min: number;
  readonly max: number;
}

/** A domain that cannot divide by zero: widened if the data is flat. */
export function safeDomain(domain: Domain): Domain {
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max)) return { min: 0, max: 1 };
  if (domain.max > domain.min) return domain;
  // A flat signal still has to sit somewhere in its box; the middle is honest.
  const centre = domain.min;
  return { min: centre - 0.5, max: centre + 0.5 };
}

/** The domain a reading occupies, widened so it is safe to divide by. */
export function domainOf(value: unknown): Domain {
  return safeDomain(extentOf(value) ?? { min: 0, max: 1 });
}

/** The domain covering every reading in a history. */
export function domainOfAll(values: Iterable<unknown>): Domain {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    for (const number of flatten(value)) {
      if (number < min) min = number;
      if (number > max) max = number;
    }
  }
  return safeDomain({ min, max });
}

/**
 * The domain for anything drawn from a baseline: bars, racks, filled areas.
 *
 * Auto-scaling to the data's own range is right for a trend line, where the
 * question is "what shape is this", and wrong for a bar, where the question is
 * "how much". Two values of 1019K and 698K auto-scaled put the second bar at
 * zero — the smaller of any pair is always empty, which is not a chart, it is
 * a ranking drawn as one. So the floor is zero unless the data goes below it,
 * and a caller with a real domain still wins.
 */
export function baselineDomain(values: Iterable<unknown>, given?: Domain): Domain {
  if (given) return safeDomain(given);
  const measured = domainOfAll(values);
  return safeDomain({ min: Math.min(0, measured.min), max: Math.max(0, measured.max) });
}

/** Where a value sits in a domain, clamped to 0-1. */
export function normalize(value: number, domain: Domain): number {
  const safe = safeDomain(domain);
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, (value - safe.min) / (safe.max - safe.min)));
}

/**
 * A domain that grows to fit new peaks but never shrinks below what it has seen.
 *
 * Network throughput has no ceiling to scale against, and rescaling to the
 * current maximum every frame makes an idle link look saturated. This keeps the
 * high-water mark, optionally decaying it so a one-off spike does not flatten
 * the chart forever.
 */
export class TrackingDomain {
  #min: number;
  #max: number;
  readonly #decay: number;
  readonly #floor: Domain;

  constructor(options: { readonly floor?: Domain; readonly decay?: number } = {}) {
    this.#floor = options.floor ?? { min: 0, max: 1 };
    this.#min = this.#floor.min;
    this.#max = this.#floor.max;
    // 1 keeps the peak forever; below 1 lets it settle back toward the floor.
    this.#decay = Math.min(1, Math.max(0, options.decay ?? 1));
  }

  observe(value: unknown): Domain {
    if (this.#decay < 1) {
      this.#max = this.#floor.max + (this.#max - this.#floor.max) * this.#decay;
      this.#min = this.#floor.min + (this.#min - this.#floor.min) * this.#decay;
    }
    for (const number of flatten(value)) {
      if (number > this.#max) this.#max = number;
      if (number < this.#min) this.#min = number;
    }
    return this.domain;
  }

  get domain(): Domain {
    return safeDomain({ min: this.#min, max: this.#max });
  }

  reset(): void {
    this.#min = this.#floor.min;
    this.#max = this.#floor.max;
  }
}

/**
 * Resamples a series to exactly `width` points.
 *
 * Re-exported from the measuring layer, where every other downsampler lives.
 * A per-column renderer wants one value per column; a polyline wants selected
 * points and their own positions, which is `lttbDownsample`. Both are honest
 * answers to "this history is longer than the terminal is wide", and keeping
 * them in one module is what stops a third appearing.
 */
export { resampleToWidth as resample } from "../visual/downsample.ts";
