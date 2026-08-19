// Copyright 2023 Im-Beast. MIT license.

// The dimensional model: rank, time, and the scaling every renderer shares.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { DATA_KINDS, extentOf, isTemporal, kindFor, rankOf, rankOfValue, satisfies, shapeOf } from "../src/viz/data.ts";
import { DataStream, scalarStream, vectorStream } from "../src/viz/stream.ts";
import { domainOfAll, normalize, resample, safeDomain, TrackingDomain } from "../src/viz/scale.ts";

Deno.test("a kind names a rank and whether history is kept", () => {
  assertEquals(DATA_KINDS.length, 8);
  assertEquals(rankOf("0dt"), 0);
  assertEquals(rankOf("2d"), 2);
  assertEquals(isTemporal("1dt"), true);
  assertEquals(isTemporal("1d"), false);
  assertEquals(kindFor(1, true), "1dt");
  assertEquals(kindFor(3, false), "3d");
});

Deno.test("history can be dropped but never invented", () => {
  // A temporal stream feeds a momentary renderer: take the latest reading.
  assert(satisfies("0dt", "0d"));
  assert(satisfies("1dt", "1d"));
  // A momentary stream cannot feed a renderer that draws time.
  assert(!satisfies("0d", "0dt"));
  // Rank never converts: per-core load is not overall load.
  assert(!satisfies("1dt", "0dt"));
  assert(!satisfies("0dt", "1dt"));
});

Deno.test("a reading's rank is read off its shape", () => {
  assertEquals(shapeOf(5), []);
  assertEquals(shapeOf([1, 2, 3]), [3]);
  assertEquals(shapeOf([[1, 2], [3, 4], [5, 6]]), [3, 2]);
  assertEquals(rankOfValue(5), 0);
  assertEquals(rankOfValue([1, 2]), 1);
  assertEquals(rankOfValue([[1], [2]]), 2);
  assertEquals(rankOfValue([[[1]]]), 3);
});

Deno.test("a stream refuses a reading of the wrong rank", () => {
  // Silently accepting one produces a chart that is wrong invisibly.
  const cores = vectorStream();
  assertThrows(() => cores.push(0.5 as never), TypeError, "rank");
  cores.push([0.1, 0.2]);
  assertEquals(cores.latest(), [0.1, 0.2]);
});

Deno.test("a stream keeps a bounded history, oldest first", () => {
  const load = scalarStream({ capacity: 3 });
  for (let index = 0; index < 5; index += 1) load.push(index, index);
  assertEquals(load.values(), [2, 3, 4]);
  assertEquals(load.length, 3);
  assertEquals(load.latest(), 4);
  assertEquals(load.values(2), [3, 4]);
});

Deno.test("a stream can be asked for a time window rather than a count", () => {
  const load = scalarStream();
  load.push(1, 1000);
  load.push(2, 1500);
  load.push(3, 5000);
  // Within 3.6s of the newest: the 1500 reading and the 5000 one.
  assertEquals(load.since(3600).map((sample) => sample.value), [2, 3]);
  // The edge is inclusive, so a sample exactly one window old still counts —
  // otherwise a producer sampling on a fixed interval loses one every time
  // float arithmetic lands on the boundary.
  assertEquals(load.since(4000).map((sample) => sample.value), [1, 2, 3]);
});

Deno.test("a stream declares the kind it satisfies", () => {
  assertEquals(new DataStream(1).kind, "1dt");
  assert(satisfies(new DataStream(1).kind, "1d"));
});

Deno.test("a flat signal still gets a domain that can be divided by", () => {
  // Every value identical would otherwise be a division by zero.
  const domain = safeDomain({ min: 7, max: 7 });
  assert(domain.max > domain.min);
  assertEquals(normalize(7, domain), 0.5, "a flat signal sits in the middle, not at an edge");
});

Deno.test("normalising clamps rather than drawing outside the box", () => {
  const domain = { min: 0, max: 100 };
  assertEquals(normalize(50, domain), 0.5);
  assertEquals(normalize(-20, domain), 0);
  assertEquals(normalize(120, domain), 1);
  assertEquals(normalize(Number.NaN, domain), 0);
});

Deno.test("a domain covers every reading in a history, at any rank", () => {
  assertEquals(domainOfAll([[1, 5], [3, 9], [0, 2]]), { min: 0, max: 9 });
  assertEquals(extentOf([[[4]], [[-1]]]), { min: -1, max: 4 });
});

Deno.test("a tracking domain grows to fit peaks and does not shrink under them", () => {
  // Network throughput has no ceiling; rescaling every frame makes an idle
  // link look saturated.
  const tracking = new TrackingDomain({ floor: { min: 0, max: 1 } });
  tracking.observe(10);
  assertEquals(tracking.domain.max, 10);
  tracking.observe(2);
  assertEquals(tracking.domain.max, 10, "a quiet moment does not rescale the chart");
});

Deno.test("a tracking domain can decay so one spike does not flatten it forever", () => {
  const tracking = new TrackingDomain({ floor: { min: 0, max: 1 }, decay: 0.5 });
  tracking.observe(100);
  assertEquals(tracking.domain.max, 100);
  tracking.observe(0);
  // Halfway back toward the floor, not still pinned at the spike.
  assertEquals(tracking.domain.max, 50.5);
});

Deno.test("resampling keeps spikes instead of averaging them away", () => {
  const values = [0, 0, 0, 0, 9, 0, 0, 0];
  const narrow = resample(values, 4);
  assertEquals(narrow.length, 4);
  assert(narrow.includes(9), `the spike was lost: ${narrow.join(",")}`);
});

Deno.test("resampling stretches a short history across a wide axis", () => {
  assertEquals(resample([1, 2], 4), [1, 1, 2, 2]);
  assertEquals(resample([], 3), [0, 0, 0]);
  assertEquals(resample([1, 2, 3], 0), []);
  assertEquals(resample([1, 2, 3], 3), [1, 2, 3]);
});
