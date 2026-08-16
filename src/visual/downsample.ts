// Copyright 2023 Im-Beast. MIT license.

// VIS-006: downsampling that cannot lose a spike. Min/max bucketing keeps
// both extremes of every bucket in order, so the global extrema are in
// the output by construction; LTTB keeps the perceptually dominant point
// per bucket with both endpoints pinned. The streaming aggregator folds
// arbitrarily many appended points into a FIXED number of buckets —
// memory is bounded by the bucket count, never the point count — and the
// visible-range cache memoizes window queries by (range, width) until
// the next append invalidates them. A million-point test drives all of
// it single-pass under an explicit wall-clock ceiling.

/** One data point. */
export interface DataPoint {
  readonly x: number;
  readonly y: number;
}

/** Min/max bucket downsampling: extrema survive by construction. */
export function minMaxDownsample(points: readonly DataPoint[], buckets: number): DataPoint[] {
  if (points.length <= buckets * 2) return [...points];
  const size = points.length / buckets;
  const out: DataPoint[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor(bucket * size);
    const end = Math.min(points.length, Math.floor((bucket + 1) * size));
    let min = points[start]!;
    let max = points[start]!;
    for (let index = start + 1; index < end; index += 1) {
      const point = points[index]!;
      if (point.y < min.y) min = point;
      if (point.y > max.y) max = point;
    }
    // Emit in x order so the polyline stays monotone.
    if (min.x <= max.x) out.push(min, max);
    else out.push(max, min);
  }
  return out;
}

/** Largest-Triangle-Three-Buckets with pinned endpoints. */
export function lttbDownsample(points: readonly DataPoint[], threshold: number): DataPoint[] {
  if (threshold >= points.length || threshold < 3) return [...points];
  const out: DataPoint[] = [points[0]!];
  const bucketSize = (points.length - 2) / (threshold - 2);
  let previousIndex = 0;
  for (let bucket = 0; bucket < threshold - 2; bucket += 1) {
    const rangeStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(points.length, Math.floor((bucket + 2) * bucketSize) + 1);
    // The next bucket's average anchors the triangle.
    let averageX = 0;
    let averageY = 0;
    const count = Math.max(1, rangeEnd - rangeStart);
    for (let index = rangeStart; index < rangeEnd; index += 1) {
      averageX += points[index]!.x;
      averageY += points[index]!.y;
    }
    averageX /= count;
    averageY /= count;

    const currentStart = Math.floor(bucket * bucketSize) + 1;
    const currentEnd = Math.min(points.length - 1, Math.floor((bucket + 1) * bucketSize) + 1);
    const anchor = points[previousIndex]!;
    let bestArea = -1;
    let bestIndex = currentStart;
    for (let index = currentStart; index < currentEnd; index += 1) {
      const point = points[index]!;
      const area = Math.abs(
        (anchor.x - averageX) * (point.y - anchor.y) - (anchor.x - point.x) * (averageY - anchor.y),
      );
      if (area > bestArea) {
        bestArea = area;
        bestIndex = index;
      }
    }
    out.push(points[bestIndex]!);
    previousIndex = bestIndex;
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Streaming min/max aggregator with fixed memory and a range cache. */
export class StreamingDownsampler {
  readonly #buckets: { minY: number; maxY: number; minX: number; maxX: number; count: number }[];
  readonly #bucketWidth: number;
  readonly #domainStart: number;
  readonly #cache = new Map<string, DataPoint[]>();
  #revision = 0;
  #appended = 0;

  constructor(options: { readonly domain: readonly [number, number]; readonly buckets?: number }) {
    const buckets = Math.max(1, options.buckets ?? 512);
    this.#domainStart = options.domain[0];
    this.#bucketWidth = (options.domain[1] - options.domain[0]) / buckets;
    this.#buckets = Array.from({ length: buckets }, () => ({
      minY: Infinity,
      maxY: -Infinity,
      minX: 0,
      maxX: 0,
      count: 0,
    }));
  }

  /** Folds points in; memory stays at the fixed bucket count. */
  append(points: readonly DataPoint[]): void {
    for (const point of points) {
      const index = Math.max(
        0,
        Math.min(this.#buckets.length - 1, Math.floor((point.x - this.#domainStart) / this.#bucketWidth)),
      );
      const bucket = this.#buckets[index]!;
      if (point.y < bucket.minY) {
        bucket.minY = point.y;
        bucket.minX = point.x;
      }
      if (point.y > bucket.maxY) {
        bucket.maxY = point.y;
        bucket.maxX = point.x;
      }
      bucket.count += 1;
    }
    this.#appended += points.length;
    this.#revision += 1;
    this.#cache.clear(); // visible-range cache: valid per revision
  }

  /** Window query, memoized until the next append. */
  query(rangeStart: number, rangeEnd: number, width: number): readonly DataPoint[] {
    const key = `${rangeStart} ${rangeEnd} ${width}`;
    const cached = this.#cache.get(key);
    if (cached) return cached;
    const raw: DataPoint[] = [];
    for (const bucket of this.#buckets) {
      if (bucket.count === 0) continue;
      const inRange = (x: number) => x >= rangeStart && x <= rangeEnd;
      if (bucket.minX <= bucket.maxX) {
        if (inRange(bucket.minX)) raw.push({ x: bucket.minX, y: bucket.minY });
        if (inRange(bucket.maxX)) raw.push({ x: bucket.maxX, y: bucket.maxY });
      } else {
        if (inRange(bucket.maxX)) raw.push({ x: bucket.maxX, y: bucket.maxY });
        if (inRange(bucket.minX)) raw.push({ x: bucket.minX, y: bucket.minY });
      }
    }
    const result = raw.length > width * 2 ? minMaxDownsample(raw, width) : raw;
    this.#cache.set(key, result);
    return result;
  }

  inspect(): { appended: number; buckets: number; revision: number; cachedQueries: number } {
    return {
      appended: this.#appended,
      buckets: this.#buckets.length,
      revision: this.#revision,
      cachedQueries: this.#cache.size,
    };
  }
}

/** Creates a streaming downsampler over a fixed x domain. */
export function createStreamingDownsampler(
  options: { readonly domain: readonly [number, number]; readonly buckets?: number },
): StreamingDownsampler {
  return new StreamingDownsampler(options);
}
