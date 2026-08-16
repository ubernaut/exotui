// Copyright 2023 Im-Beast. MIT license.

// OBS-007: sampling that observes, never steers. A sampler decides per
// trace — head sampling by deterministic ratio (a stable hash of the trace
// id, so the same trace always answers the same), parent-based inheritance
// (children follow their root's decision), and an always/never override —
// and the decision gates only EXPORT: application code runs identically
// either way, which the API enforces by returning a plain boolean that has
// no side channel back into control flow. Metric exemplar hooks attach
// sampled trace ids to metric recordings for cross-signal drill-down.

/** The sampling strategies. */
export type SamplingStrategy =
  | { readonly kind: "always" }
  | { readonly kind: "never" }
  | { readonly kind: "ratio"; readonly ratio: number }
  | { readonly kind: "parent"; readonly root: SamplingStrategy };

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The sampler. */
export class TraceSampler {
  readonly #strategy: SamplingStrategy;
  readonly #decisions = new Map<string, boolean>();

  constructor(strategy: SamplingStrategy) {
    this.#strategy = strategy;
  }

  /**
   * The decision for a trace. Deterministic: the same trace id always
   * answers the same, within and across sampler instances of equal config.
   */
  shouldSample(traceId: string, parentSampled?: boolean): boolean {
    const cached = this.#decisions.get(traceId);
    if (cached !== undefined) return cached;
    const decision = this.#decide(this.#strategy, traceId, parentSampled);
    this.#decisions.set(traceId, decision);
    return decision;
  }

  #decide(strategy: SamplingStrategy, traceId: string, parentSampled: boolean | undefined): boolean {
    switch (strategy.kind) {
      case "always":
        return true;
      case "never":
        return false;
      case "ratio": {
        const ratio = Math.min(1, Math.max(0, strategy.ratio));
        return fnv1a(traceId) / 0x100000000 < ratio;
      }
      case "parent":
        if (parentSampled !== undefined) return parentSampled;
        return this.#decide(strategy.root, traceId, undefined);
    }
  }
}

/** An exemplar: a sampled trace attached to a metric recording. */
export interface MetricExemplar {
  readonly metric: string;
  readonly value: number;
  readonly traceId: string;
}

/** Collects exemplars for sampled traces only, bounded per metric. */
export class MetricExemplarHook {
  readonly #sampler: TraceSampler;
  readonly #perMetric: number;
  readonly #exemplars = new Map<string, MetricExemplar[]>();

  constructor(sampler: TraceSampler, options: { readonly perMetric?: number } = {}) {
    this.#sampler = sampler;
    this.#perMetric = Math.max(1, options.perMetric ?? 4);
  }

  /** Offers a recording; only sampled traces attach, bounded per metric. */
  offer(metric: string, value: number, traceId: string): boolean {
    if (!this.#sampler.shouldSample(traceId)) return false;
    const list = this.#exemplars.get(metric) ?? [];
    this.#exemplars.set(metric, list);
    if (list.length >= this.#perMetric) list.shift();
    list.push({ metric, value, traceId });
    return true;
  }

  exemplars(metric: string): readonly MetricExemplar[] {
    return [...(this.#exemplars.get(metric) ?? [])];
  }
}

/** Creates a trace sampler. */
export function createTraceSampler(strategy: SamplingStrategy): TraceSampler {
  return new TraceSampler(strategy);
}

/** Creates a metric exemplar hook over a sampler. */
export function createMetricExemplarHook(
  sampler: TraceSampler,
  options: { readonly perMetric?: number } = {},
): MetricExemplarHook {
  return new MetricExemplarHook(sampler, options);
}
