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
 * Terminals are narrow and histories are long, so something has to give. Picking
 * every nth point drops the spikes that are the whole reason for watching, so
 * this takes the extreme of each bucket instead: the value furthest from the
 * bucket's mean survives, which keeps a one-frame spike visible after
 * downsampling.
 */
export function resample(values: readonly number[], width: number): number[] {
  const target = Math.max(0, Math.floor(width));
  if (target === 0) return [];
  if (values.length === 0) return new Array(target).fill(0);
  if (values.length === target) return [...values];
  if (values.length < target) {
    // Stretch: hold each value across its share of the wider axis.
    return Array.from({ length: target }, (_, index) => {
      const source = Math.min(values.length - 1, Math.floor((index * values.length) / target));
      return values[source]!;
    });
  }
  const out: number[] = [];
  for (let index = 0; index < target; index += 1) {
    const start = Math.floor((index * values.length) / target);
    const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / target));
    let sum = 0;
    for (let at = start; at < end; at += 1) sum += values[at]!;
    const mean = sum / (end - start);
    let extreme = values[start]!;
    for (let at = start; at < end; at += 1) {
      if (Math.abs(values[at]! - mean) > Math.abs(extreme - mean)) extreme = values[at]!;
    }
    out.push(extreme);
  }
  return out;
}
