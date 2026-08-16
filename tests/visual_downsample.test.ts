// Copyright 2023 Im-Beast. MIT license.

// VIS-006: million-point fixtures stay within declared frame and memory
// budgets while preserving extrema.

import { assert, assertEquals } from "./deps.ts";
import { createStreamingDownsampler, type DataPoint, lttbDownsample, minMaxDownsample } from "../mod.ts";

function wave(count: number, spikeAt: number): DataPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    x: index,
    y: index === spikeAt ? 1000 : Math.sin(index / 50) * 10 + (index % 7) * 0.1 - (index === spikeAt + 1 ? 900 : 0),
  }));
}

Deno.test("min/max buckets preserve global extrema by construction", () => {
  const points = wave(10_000, 7777);
  const sampled = minMaxDownsample(points, 100);
  assertEquals(sampled.length, 200);
  const ys = sampled.map((point) => point.y);
  assertEquals(Math.max(...ys), 1000); // the spike survives
  assertEquals(Math.min(...ys), Math.min(...points.map((point) => point.y)));
  // Small inputs pass through untouched.
  assertEquals(minMaxDownsample(points.slice(0, 10), 100), points.slice(0, 10));
});

Deno.test("LTTB pins endpoints and keeps the dominant spike", () => {
  const points = wave(5000, 2500);
  const sampled = lttbDownsample(points, 200);
  assertEquals(sampled.length, 200);
  assertEquals(sampled[0], points[0]);
  assertEquals(sampled[sampled.length - 1], points[points.length - 1]);
  assert(sampled.some((point) => point.y === 1000)); // spike kept
  // x stays strictly increasing — the polyline never folds back.
  for (let index = 1; index < sampled.length; index += 1) {
    assert(sampled[index]!.x > sampled[index - 1]!.x);
  }
});

Deno.test("a million streamed points hold fixed memory and the frame budget", () => {
  const downsampler = createStreamingDownsampler({ domain: [0, 1_000_000], buckets: 512 });
  const started = performance.now();
  const chunk = 50_000;
  for (let offset = 0; offset < 1_000_000; offset += chunk) {
    const points: DataPoint[] = Array.from({ length: chunk }, (_, index) => {
      const x = offset + index;
      return { x, y: x === 654_321 ? 5000 : Math.sin(x / 1000) * 100 };
    });
    downsampler.append(points);
  }
  const elapsed = performance.now() - started;
  assert(elapsed < 5000, `single-pass fold took ${elapsed}ms`); // frame budget ceiling

  const snapshot = downsampler.inspect();
  assertEquals(snapshot.appended, 1_000_000);
  assertEquals(snapshot.buckets, 512); // memory bound: buckets, not points

  const view = downsampler.query(0, 1_000_000, 200);
  assert(view.length <= 1024);
  assertEquals(Math.max(...view.map((point) => point.y)), 5000); // spike preserved end to end

  // The visible-range cache serves repeats until the next append.
  const again = downsampler.query(0, 1_000_000, 200);
  assert(again === view || JSON.stringify(again) === JSON.stringify(view));
  assertEquals(downsampler.inspect().cachedQueries, 1);
  downsampler.append([{ x: 0, y: -9999 }]);
  assertEquals(downsampler.inspect().cachedQueries, 0); // invalidated
  assertEquals(Math.min(...downsampler.query(0, 1_000_000, 200).map((point) => point.y)), -9999);
});
