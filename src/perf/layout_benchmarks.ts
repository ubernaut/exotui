// Copyright 2023 Im-Beast. MIT license.

// 036 T2: repeatable layout/render benchmarks. Trees are built from a
// seed (mulberry32), so every run lays out the IDENTICAL structure;
// cold and warm are separated by construction — cold solves with a
// fresh intrinsic cache, warm re-solves the same tree with the primed
// cache — and the clock is caller-owned, so tests drive a fake clock
// while the benchmark script uses the real one. The deterministic
// numbers (node/box counts, cache hits/misses) gate the checked-in
// comparison report; wall-clock times are recorded as indicative,
// environment-labeled data, never asserted.

import { LayoutMeasurementCache } from "../layout/measurement.ts";
import { createLayoutNode, type LayoutNode } from "../layout/solver.ts";
import { defaultComputedLayoutStyle } from "../layout/style.ts";
import { SimpleLayoutSolver } from "../layout/solvers/simple.ts";
import type { Rectangle } from "../types.ts";

/** One benchmark case description. */
export interface LayoutBenchmarkSpec {
  readonly name: string;
  readonly seed: number;
  readonly depth: number;
  readonly breadth: number;
  readonly bounds: Rectangle;
  /** Warm re-solves after the cold pass. */
  readonly warmRuns?: number;
}

/** One benchmark result. */
export interface LayoutBenchmarkResult {
  readonly name: string;
  /** Deterministic across machines. */
  readonly nodes: number;
  readonly boxes: number;
  readonly coldCacheMisses: number;
  readonly warmCacheHits: number;
  /** Indicative wall-clock, environment-dependent. */
  readonly coldMs: number;
  readonly warmMs: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];

/** Builds the seed-deterministic benchmark tree. */
export function buildBenchmarkTree(spec: LayoutBenchmarkSpec): { root: LayoutNode; nodes: number } {
  const random = mulberry32(spec.seed);
  let counter = 0;
  const build = (depth: number): LayoutNode => {
    counter += 1;
    const id = `n${counter}`;
    const style = defaultComputedLayoutStyle();
    const roll = random();
    if (depth > 0 && roll < 0.5) style.display = "flex";
    if (depth > 0 && roll >= 0.5 && roll < 0.6) {
      style.display = "grid";
      style.gridTemplateColumns = [{ unit: "fr", value: 1 }, { unit: "fr", value: 1 }];
    }
    const children: LayoutNode[] = [];
    if (depth > 0) {
      for (let index = 0; index < spec.breadth; index += 1) children.push(build(depth - 1));
    }
    const text = depth === 0
      ? Array.from({ length: 1 + Math.floor(random() * 6) }, () => WORDS[Math.floor(random() * WORDS.length)]!)
        .join(" ")
      : undefined;
    return createLayoutNode({ id, tag: depth === 0 ? "text" : "panel", style, children, ...(text ? { text } : {}) });
  };
  const root = build(spec.depth);
  return { root, nodes: counter };
}

function countBoxes(box: { children: readonly { children: readonly unknown[] }[] }): number {
  let total = 1;
  for (const child of box.children) {
    total += countBoxes(child as { children: readonly { children: readonly unknown[] }[] });
  }
  return total;
}

/** Runs one benchmark with cold/warm separation on the caller's clock. */
export function runLayoutBenchmark(
  spec: LayoutBenchmarkSpec,
  options: { readonly now: () => number },
): LayoutBenchmarkResult {
  const { root, nodes } = buildBenchmarkTree(spec);
  const cache = new LayoutMeasurementCache({ maxEntries: 4096 });
  const solver = new SimpleLayoutSolver({ intrinsicMeasurementCache: cache });

  const coldStart = options.now();
  const cold = solver.solve({ root, bounds: spec.bounds });
  const coldMs = options.now() - coldStart;
  const coldStats = cache.stats();

  const warmRuns = Math.max(1, spec.warmRuns ?? 3);
  const warmStart = options.now();
  for (let run = 0; run < warmRuns; run += 1) solver.solve({ root, bounds: spec.bounds });
  const warmMs = (options.now() - warmStart) / warmRuns;
  const warmStats = cache.stats();

  return {
    name: spec.name,
    nodes,
    boxes: countBoxes(cold.root),
    coldCacheMisses: coldStats.misses,
    warmCacheHits: warmStats.hits - coldStats.hits,
    coldMs,
    warmMs,
  };
}

/** The standard suite: small, deep, broad, and large mixed trees. */
export const LAYOUT_BENCHMARK_SUITE: readonly LayoutBenchmarkSpec[] = [
  { name: "small", seed: 11, depth: 2, breadth: 3, bounds: { column: 0, row: 0, width: 80, height: 24 } },
  { name: "deep", seed: 23, depth: 6, breadth: 2, bounds: { column: 0, row: 0, width: 120, height: 40 } },
  { name: "broad", seed: 37, depth: 2, breadth: 12, bounds: { column: 0, row: 0, width: 200, height: 50 } },
  { name: "large", seed: 41, depth: 4, breadth: 5, bounds: { column: 0, row: 0, width: 383, height: 101 } },
];
