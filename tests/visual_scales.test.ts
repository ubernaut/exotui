// Copyright 2023 Im-Beast. MIT license.

// VIS-001: scale/property tests over degenerate domains, negative values,
// resize, and cell rounding.

import { assert, assertEquals } from "./deps.ts";
import { bandScale, linearScale, logScale, ordinalScale, symlogScale, timeScale, toCell } from "../mod.ts";

Deno.test("linear maps, inverts, nices, and survives degenerate domains", () => {
  const scale = linearScale([0, 100], [0, 80]);
  assertEquals(scale.map(50), 40);
  assertEquals(scale.invert(40), 50);
  assertEquals(scale.map(-10), -8); // unclamped by default

  const reversed = linearScale([100, 0], [0, 80]);
  assertEquals(reversed.map(100), 0);
  assertEquals(reversed.map(0), 80);
  assertEquals(reversed.invert(80), 0);

  const zeroSpan = linearScale([5, 5], [0, 80]);
  assertEquals(zeroSpan.map(5), 0); // contract: range start, never NaN
  assertEquals(zeroSpan.map(999), 0);
  assertEquals(zeroSpan.ticks(), [5]);

  const nice = linearScale([3, 97], [0, 80]).nice();
  assertEquals(nice.domain, [0, 100]);
  assertEquals(linearScale([0, 10], [0, 40]).ticks(5), [0, 2, 4, 6, 8, 10]);
  const fractional = linearScale([0, 1], [0, 10]).ticks(5);
  assertEquals(fractional.length, 6);
  fractional.forEach((tick, i) => assert(Math.abs(tick - i * 0.2) < 1e-9));
});

Deno.test("log handles negative-only domains and refuses zero crossings", () => {
  const positive = logScale([1, 1000], [0, 30]);
  assertEquals(positive.map(1), 0);
  assertEquals(positive.map(1000), 30);
  assertEquals(Math.round(positive.map(31.6227766)), 15);
  assert(Math.abs(positive.invert(15) - 31.6227766) < 0.001);

  const negative = logScale([-1000, -1], [0, 30]);
  assertEquals(negative.map(-1000), 0);
  assertEquals(negative.map(-1), 30);

  let threw = false;
  try {
    logScale([-1, 10], [0, 30]);
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test("symlog crosses zero smoothly and round-trips negatives", () => {
  const scale = symlogScale([-100, 100], [0, 60]);
  assertEquals(scale.map(0), 30); // symmetric center
  assert(scale.map(-100) === 0 && scale.map(100) === 60);
  for (const value of [-75, -1, 0, 0.5, 42]) {
    assert(Math.abs(scale.invert(scale.map(value)) - value) < 1e-9, `round-trip ${value}`);
  }
});

Deno.test("time scale nices to calendar-friendly steps", () => {
  const hour = 3_600_000;
  const scale = timeScale([hour * 1.1, hour * 7.9], [0, 100]);
  const ticks = scale.ticks(8);
  assert(ticks.length > 0 && ticks.every((tick) => tick % hour === 0));
  const nice = scale.nice(8);
  assertEquals(nice.domain, [hour, hour * 8]);
});

Deno.test("resize is re-ranging an immutable value", () => {
  const scale = linearScale([0, 10], [0, 40]);
  const resized = scale.rerange([0, 80]);
  assertEquals(scale.map(5), 20); // original untouched
  assertEquals(resized.map(5), 40);
});

Deno.test("ordinal repeats positions and band rounds to whole padded cells", () => {
  const ordinal = ordinalScale(["a", "b", "c", "d"], [0, 10, 20]);
  assertEquals(ordinal.map("a"), 0);
  assertEquals(ordinal.map("d"), 0); // wraps
  assertEquals(ordinal.map("x" as string), undefined);

  const bands = bandScale(["q1", "q2", "q3"], 0, 20, { paddingCells: 1 });
  assertEquals(bands.bandwidth(), 6); // (20 - 2 padding) / 3 = 6
  assertEquals(bands.band("q1"), { start: 0, width: 6 });
  assertEquals(bands.band("q2"), { start: 7, width: 6 });
  assertEquals(bands.band("q3"), { start: 14, width: 6 });
  assert(Number.isInteger(bands.band("q3")!.start));

  const tiny = bandScale(["a", "b", "c"], 0, 2);
  assertEquals(tiny.band("a"), undefined); // zero-width bands are absent, not fractional
  const resized = bands.rerange(0, 40);
  assertEquals(resized.bandwidth(), 12);
});

Deno.test("cell rounding clamps into the range", () => {
  const scale = linearScale([0, 100], [0, 79]);
  assertEquals(toCell(scale, 50), 40);
  assertEquals(toCell(scale, -20), 0); // clamped
  assertEquals(toCell(scale, 140), 79);
  assert(Number.isInteger(toCell(scale, 33.33)));
});
