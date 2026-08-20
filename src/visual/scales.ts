// Copyright 2023 Im-Beast. MIT license.

// VIS-001: reusable scales for terminal visualization. Continuous scales
// (linear, log, symmetric-log, time) map a numeric domain onto a cell
// range with invert and nice-domain operations; ordinal maps discrete
// values to a repeating range; band divides a cell run into padded bands
// with cell-safe rounding. Degenerate domains (zero span, reversed,
// negative, empty) are handled by contract, never by NaN: a zero-span
// domain maps everything to the range start, and every continuous scale
// clamps optionally. Resize is just a new range — scales are immutable
// values, so tests cover re-derivation instead of hidden state.

/** A continuous scale value: map, invert, ticks, nice. */
export interface ContinuousScale {
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  map(value: number): number;
  invert(position: number): number;
  /** A copy with the domain extended to round values. */
  nice(count?: number): ContinuousScale;
  /** A copy over a new range (resize). */
  rerange(range: readonly [number, number]): ContinuousScale;
  ticks(count?: number): number[];
}

function niceStep(span: number, count: number): number {
  const raw = Math.abs(span) / Math.max(1, count);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const residual = raw / magnitude;
  // d3's tick-step thresholds (sqrt(50), sqrt(10), sqrt(2)).
  const factor = residual >= 7.071 ? 10 : residual >= 3.162 ? 5 : residual >= 1.414 ? 2 : 1;
  return factor * magnitude;
}

function makeContinuous(
  domain: readonly [number, number],
  range: readonly [number, number],
  transform: (value: number) => number,
  untransform: (value: number) => number,
  rebuild: (domain: readonly [number, number], range: readonly [number, number]) => ContinuousScale,
): ContinuousScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const t0 = transform(d0);
  const t1 = transform(d1);
  const span = t1 - t0;
  return {
    domain,
    range,
    map(value) {
      if (span === 0) return r0; // zero-span domain: everything at the start
      const t = (transform(value) - t0) / span;
      return r0 + t * (r1 - r0);
    },
    invert(position) {
      if (r1 - r0 === 0) return d0;
      const t = (position - r0) / (r1 - r0);
      return untransform(t0 + t * span);
    },
    nice(count = 10) {
      if (span === 0) return this;
      const step = niceStep(d1 - d0, count);
      const lo = Math.floor(Math.min(d0, d1) / step) * step;
      const hi = Math.ceil(Math.max(d0, d1) / step) * step;
      return rebuild(d0 <= d1 ? [lo, hi] : [hi, lo], range);
    },
    rerange(next) {
      return rebuild(domain, next);
    },
    ticks(count = 10) {
      if (span === 0) return [d0];
      const step = niceStep(d1 - d0, count);
      const lo = Math.ceil(Math.min(d0, d1) / step) * step;
      const hi = Math.floor(Math.max(d0, d1) / step) * step;
      // Snapped to the step's own precision. `Math.round(v / step) * step` is
      // not enough on its own — three times 0.2 is 0.6000000000000001 in IEEE
      // 754, and that reaches an axis label for any caller not formatting
      // through Intl.
      const decimals = Math.min(12, Math.max(0, -Math.floor(Math.log10(step))));
      const values: number[] = [];
      for (let v = lo; v <= hi + step / 2; v += step) {
        values.push(Number((Math.round(v / step) * step).toFixed(decimals)));
      }
      return values;
    },
  };
}

/** Linear scale. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): ContinuousScale {
  return makeContinuous(domain, range, (v) => v, (v) => v, linearScale);
}

/**
 * Log scale. The domain must be strictly positive or strictly negative;
 * zero-crossing domains belong to {@linkcode symlogScale}.
 */
export function logScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): ContinuousScale {
  const [d0, d1] = domain;
  if (d0 === 0 || d1 === 0 || Math.sign(d0) !== Math.sign(d1)) {
    throw new RangeError("log scale domain must not touch or cross zero; use symlogScale");
  }
  const sign = Math.sign(d0);
  return makeContinuous(
    domain,
    range,
    (v) => Math.log(Math.abs(v)) * sign,
    (v) => Math.exp(v * sign) * sign,
    logScale,
  );
}

/** Symmetric-log scale: linear near zero, log beyond; handles negatives. */
export function symlogScale(
  domain: readonly [number, number],
  range: readonly [number, number],
  constant = 1,
): ContinuousScale {
  const c = Math.abs(constant) || 1;
  return makeContinuous(
    domain,
    range,
    (v) => Math.sign(v) * Math.log1p(Math.abs(v) / c),
    (v) => Math.sign(v) * c * (Math.exp(Math.abs(v)) - 1),
    (d, r) => symlogScale(d, r, c),
  );
}

/** Time scale over epoch-milliseconds (a linear scale with time ticks). */
export function timeScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): ContinuousScale {
  const base = linearScale(domain, range);
  const STEPS = [
    1000,
    5_000,
    15_000,
    60_000,
    300_000,
    900_000,
    3_600_000,
    21_600_000,
    86_400_000,
    604_800_000,
  ];
  return {
    ...base,
    nice(count = 10) {
      const span = Math.abs(domain[1] - domain[0]);
      if (span === 0) return this;
      const step = STEPS.find((candidate) => span / candidate <= count) ?? STEPS[STEPS.length - 1]!;
      const lo = Math.floor(Math.min(domain[0], domain[1]) / step) * step;
      const hi = Math.ceil(Math.max(domain[0], domain[1]) / step) * step;
      return timeScale(domain[0] <= domain[1] ? [lo, hi] : [hi, lo], range);
    },
    rerange(next) {
      return timeScale(domain, next);
    },
    ticks(count = 10) {
      const span = Math.abs(domain[1] - domain[0]);
      if (span === 0) return [domain[0]];
      const step = STEPS.find((candidate) => span / candidate <= count) ?? STEPS[STEPS.length - 1]!;
      const lo = Math.ceil(Math.min(domain[0], domain[1]) / step) * step;
      const hi = Math.floor(Math.max(domain[0], domain[1]) / step) * step;
      const values: number[] = [];
      for (let v = lo; v <= hi; v += step) values.push(v);
      return values;
    },
  };
}

/** Ordinal scale: discrete values map to range entries, repeating. */
export interface OrdinalScale<T> {
  readonly domain: readonly T[];
  map(value: T): number | undefined;
  position(value: T): number | undefined;
}

/** Creates an ordinal scale over explicit positions. */
export function ordinalScale<T>(domain: readonly T[], positions: readonly number[]): OrdinalScale<T> {
  const index = new Map<T, number>();
  domain.forEach((value, i) => {
    if (!index.has(value)) index.set(value, i);
  });
  return {
    domain,
    map(value) {
      const at = index.get(value);
      if (at === undefined || positions.length === 0) return undefined;
      return positions[at % positions.length];
    },
    position(value) {
      return this.map(value);
    },
  };
}

/** One band's cell-aligned placement. */
export interface Band {
  readonly start: number;
  readonly width: number;
}

/** Band scale: divides an integer cell run into padded, whole-cell bands. */
export interface BandScale<T> {
  readonly domain: readonly T[];
  band(value: T): Band | undefined;
  bandwidth(): number;
  /** A copy over a new cell run (resize). */
  rerange(start: number, end: number): BandScale<T>;
}

/** Creates a band scale with inner padding in cells. */
export function bandScale<T>(
  domain: readonly T[],
  start: number,
  end: number,
  options: { readonly paddingCells?: number } = {},
): BandScale<T> {
  const padding = Math.max(0, Math.floor(options.paddingCells ?? 0));
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const total = Math.max(0, Math.floor(hi) - Math.ceil(lo));
  const count = domain.length;
  const width = count === 0 ? 0 : Math.max(0, Math.floor((total - padding * (count - 1)) / Math.max(1, count)));
  const index = new Map<T, number>();
  domain.forEach((value, i) => {
    if (!index.has(value)) index.set(value, i);
  });
  return {
    domain,
    band(value) {
      const at = index.get(value);
      if (at === undefined || width === 0) return undefined;
      return { start: Math.ceil(lo) + at * (width + padding), width };
    },
    bandwidth() {
      return width;
    },
    rerange(nextStart, nextEnd) {
      return bandScale(domain, nextStart, nextEnd, { paddingCells: padding });
    },
  };
}

/** Rounds a mapped position to a terminal cell, clamped into the range. */
export function toCell(scale: ContinuousScale, value: number): number {
  const [r0, r1] = scale.range;
  const lo = Math.min(r0, r1);
  const hi = Math.max(r0, r1);
  return Math.max(lo, Math.min(hi, Math.round(scale.map(value))));
}
