// Copyright 2023 Im-Beast. MIT license.

// PER-010: the tuner RECOMMENDS, the host decides. Local measurements
// (cache hit rates, frame interval p95, diff bytes per frame) accumulate
// in a bounded window; recommend() derives setting proposals — each
// carrying its evidence (the statistic and sample count it came from), a
// confidence tier scaled by sample size, and the exact rollback value —
// and NOTHING is ever applied or persisted by this module: there is no
// setter, no storage call, and no network call (a contract test greps
// the source), so measurements never leave the process and settings
// never change silently.

/** One local measurement sample. */
export interface ProfileSample {
  readonly cacheHitRate?: number;
  readonly frameIntervalMs?: number;
  readonly diffBytes?: number;
  readonly fullFrameBytes?: number;
}

/** One recommendation. */
export interface ProfileRecommendation {
  readonly setting: "cache-capacity" | "frame-interval" | "diff-strategy-bias";
  readonly current: number | string;
  readonly recommended: number | string;
  /** The exact value to restore if the host regrets applying it. */
  readonly rollback: number | string;
  readonly evidence: { readonly statistic: string; readonly samples: number };
  readonly confidence: "low" | "medium" | "high";
}

/** Current settings the tuner reasons about (read-only inputs). */
export interface CurrentProfile {
  readonly cacheCapacity: number;
  readonly frameIntervalMs: number;
  readonly diffStrategyBias: "balanced" | "prefer-regions";
}

function confidenceFor(samples: number): "low" | "medium" | "high" {
  return samples >= 60 ? "high" : samples >= 20 ? "medium" : "low";
}

/** The bounded, transmit-nothing profile tuner. */
export class RuntimeProfileTuner {
  readonly #samples: ProfileSample[] = [];
  readonly #maxSamples: number;

  constructor(options: { readonly maxSamples?: number } = {}) {
    this.#maxSamples = Math.max(10, options.maxSamples ?? 240);
  }

  /** Records one local sample (bounded window, oldest dropped). */
  addMeasurement(sample: ProfileSample): void {
    this.#samples.push(sample);
    if (this.#samples.length > this.#maxSamples) this.#samples.shift();
  }

  sampleCount(): number {
    return this.#samples.length;
  }

  /** Derives recommendations; applies and persists NOTHING. */
  recommend(current: CurrentProfile): ProfileRecommendation[] {
    const recommendations: ProfileRecommendation[] = [];

    const hitRates = this.#samples
      .map((sample) => sample.cacheHitRate)
      .filter((rate): rate is number => rate !== undefined);
    if (hitRates.length >= 10) {
      const mean = hitRates.reduce((total, rate) => total + rate, 0) / hitRates.length;
      if (mean < 0.5) {
        recommendations.push({
          setting: "cache-capacity",
          current: current.cacheCapacity,
          recommended: current.cacheCapacity * 2,
          rollback: current.cacheCapacity,
          evidence: { statistic: `mean cache hit rate ${mean.toFixed(3)}`, samples: hitRates.length },
          confidence: confidenceFor(hitRates.length),
        });
      }
    }

    const intervals = this.#samples
      .map((sample) => sample.frameIntervalMs)
      .filter((interval): interval is number => interval !== undefined)
      .sort((a, b) => a - b);
    if (intervals.length >= 10) {
      const p95 = intervals[Math.floor(intervals.length * 0.95)] ?? intervals[intervals.length - 1]!;
      if (p95 > current.frameIntervalMs * 2) {
        recommendations.push({
          setting: "frame-interval",
          current: current.frameIntervalMs,
          recommended: Math.ceil(p95 / 2),
          rollback: current.frameIntervalMs,
          evidence: { statistic: `frame interval p95 ${p95.toFixed(1)}ms`, samples: intervals.length },
          confidence: confidenceFor(intervals.length),
        });
      }
    }

    const ratios = this.#samples
      .filter((sample) =>
        sample.diffBytes !== undefined && sample.fullFrameBytes !== undefined && sample.fullFrameBytes! > 0
      )
      .map((sample) => sample.diffBytes! / sample.fullFrameBytes!);
    if (ratios.length >= 10 && current.diffStrategyBias === "balanced") {
      const mean = ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length;
      if (mean > 0.7) {
        recommendations.push({
          setting: "diff-strategy-bias",
          current: current.diffStrategyBias,
          recommended: "prefer-regions",
          rollback: current.diffStrategyBias,
          evidence: { statistic: `mean diff/full ratio ${mean.toFixed(3)}`, samples: ratios.length },
          confidence: confidenceFor(ratios.length),
        });
      }
    }
    return recommendations;
  }
}

/** Creates a runtime profile tuner. */
export function createRuntimeProfileTuner(options: { readonly maxSamples?: number } = {}): RuntimeProfileTuner {
  return new RuntimeProfileTuner(options);
}
