// Copyright 2023 Im-Beast. MIT license.

// PER-010: recommendations include evidence, confidence, rollback
// values, and never transmit measurements.

import { assert, assertEquals } from "./deps.ts";
import { createRuntimeProfileTuner } from "../mod.ts";

const PROFILE = { cacheCapacity: 512, frameIntervalMs: 16, diffStrategyBias: "balanced" as const };

Deno.test("recommendations carry evidence, confidence, and rollback", () => {
  const tuner = createRuntimeProfileTuner();
  for (let index = 0; index < 30; index += 1) {
    tuner.addMeasurement({ cacheHitRate: 0.3, frameIntervalMs: 50, diffBytes: 900, fullFrameBytes: 1000 });
  }
  const recommendations = tuner.recommend(PROFILE);
  assertEquals(recommendations.map((entry) => entry.setting), [
    "cache-capacity",
    "frame-interval",
    "diff-strategy-bias",
  ]);
  const cache = recommendations[0]!;
  assertEquals(cache.recommended, 1024);
  assertEquals(cache.rollback, 512); // the exact restore value
  assert(cache.evidence.statistic.includes("0.300"));
  assertEquals(cache.evidence.samples, 30);
  assertEquals(cache.confidence, "medium"); // 30 samples

  // Recommending mutates nothing: the profile object is read-only input.
  assertEquals(PROFILE.cacheCapacity, 512);
  // Sixty samples upgrade confidence.
  for (let index = 0; index < 30; index += 1) tuner.addMeasurement({ cacheHitRate: 0.3 });
  assertEquals(tuner.recommend(PROFILE)[0]!.confidence, "high");
});

Deno.test("healthy measurements yield no recommendations; windows are bounded", () => {
  const tuner = createRuntimeProfileTuner({ maxSamples: 50 });
  for (let index = 0; index < 200; index += 1) {
    tuner.addMeasurement({ cacheHitRate: 0.95, frameIntervalMs: 15, diffBytes: 40, fullFrameBytes: 1000 });
  }
  assertEquals(tuner.recommend(PROFILE), []);
  assertEquals(tuner.sampleCount(), 50); // bounded window

  // Too few samples: silent, never a low-evidence recommendation.
  const sparse = createRuntimeProfileTuner();
  for (let index = 0; index < 5; index += 1) sparse.addMeasurement({ cacheHitRate: 0.1 });
  assertEquals(sparse.recommend(PROFILE), []);
});

Deno.test("the tuner module transmits and persists nothing (contract)", async () => {
  const source = await Deno.readTextFile(new URL("../src/perf/profile_tuner.ts", import.meta.url));
  assert(!/\bfetch\s*\(/.test(source), "no network calls");
  assert(!/\bDeno\.\w+\(/.test(source), "no filesystem/persistence calls");
  assert(!/localStorage|WebSocket|XMLHttpRequest/.test(source), "no other transports");
});
