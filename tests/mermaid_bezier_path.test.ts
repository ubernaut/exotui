// Copyright 2023 Im-Beast. MIT license.
import { assert, assertAlmostEquals, assertEquals, assertThrows } from "./deps.ts";
import { bezierPathPoints } from "../src/content/mermaid_bezier_path.ts";

const numbers = (data: string) => (data.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
function measured(data: string): number {
  const points = numbers(data);
  const at = (t: number) => {
    const row = Array.from(
      { length: points.length / 2 },
      (_, index) => ({ x: points[index * 2]!, y: points[index * 2 + 1]! }),
    );
    for (let size = row.length - 1; size > 0; size--) {
      for (let index = 0; index < size; index++) {
        row[index] = {
          x: row[index]!.x * (1 - t) + row[index + 1]!.x * t,
          y: row[index]!.y * (1 - t) + row[index + 1]!.y * t,
        };
      }
    }
    return row[0]!;
  };
  let previous = at(0);
  let length = 0;
  for (let index = 1; index <= 1024; index++) {
    const next = at(index / 1024);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  return length;
}

Deno.test("almost straight long Béziers retain endpoints without distance-proportional samples", () => {
  let measurements = 0;
  const points = bezierPathPoints("M0 0C300 .05 600 -.05 900 0", (data) => {
    measurements++;
    return measured(data);
  })!;
  assertEquals(points.length, 2);
  assertEquals(measurements, 1);
  assertEquals(points[0], { x: 0, y: 0, distance: 0 });
  assertAlmostEquals(points[1]!.distance!, 900, 0.0001);
  assertEquals([points[1]!.x, points[1]!.y], [900, 0]);
});

Deno.test("adaptive curves retain loops, collinear reversal and exact authored corners", () => {
  for (const data of ["M0 0C300 100 -300 100 0 0", "M0 0C300 0 -300 0 0 0"]) {
    const points = bezierPathPoints(data, measured)!;
    assert(points.length > 4);
    assert(points.some((point) => point.x > 50));
    assert(points.some((point) => point.x < -50));
    assertEquals(points.at(-1)!.x, 0);
    assertAlmostEquals(points.at(-1)!.distance!, measured(data), 1e-8);
    assert(points.every((point, index) => !index || point.distance! >= points[index - 1]!.distance!));
  }
  const points = bezierPathPoints("M0 0C10 0 20 0 30 0H40V20L50 30Z", measured)!;
  assertEquals(points.map(({ x, y }) => [x, y]), [[0, 0], [30, 0], [40, 0], [40, 20], [50, 30], [0, 0]]);
});

Deno.test("relative and reflected cubic/quadratic commands preserve SVG control state", () => {
  assertEquals(
    bezierPathPoints("m10 20c10 0 20 10 30 10s20 -10 30 -10", measured),
    bezierPathPoints("M10 20C20 20 30 30 40 30C50 30 60 20 70 20", measured),
  );
  assertEquals(
    bezierPathPoints("M0 0q20 40 40 0t40 0", measured),
    bezierPathPoints("M0 0Q20 40 40 0Q60 -40 80 0", measured),
  );
  assertEquals(
    bezierPathPoints("M0 0C10 20 20 20 30 0L40 0S50 10 60 0", measured),
    bezierPathPoints("M0 0C10 20 20 20 30 0L40 0C40 0 50 10 60 0", measured),
  );
  assertEquals(
    bezierPathPoints("M0 0Q10 20 20 0zT40 0", measured),
    bezierPathPoints("M0 0Q10 20 20 0zQ0 0 40 0", measured),
  );
});

Deno.test("Bézier flattening meets geometric error rather than treating parameter spacing as length", () => {
  const data = "M0 0C0 150 200 -100 250 20";
  const points = bezierPathPoints(data, measured, 0.1)!;
  assert(points.length > 10 && points.length < 100);
  for (let index = 0; index <= 1000; index++) {
    const t = index / 1000;
    const u = 1 - t;
    const x = 3 * u * t * t * 200 + t * t * t * 250;
    const y = 3 * u * u * t * 150 - 3 * u * t * t * 100 + t * t * t * 20;
    let closest = Infinity;
    for (let n = 1; n < points.length; n++) {
      const a = points[n - 1]!;
      const b = points[n]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const fraction = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      closest = Math.min(closest, Math.hypot(x - a.x - fraction * dx, y - a.y - fraction * dy));
    }
    assert(closest <= 0.1, `Curve error ${closest} at ${t}`);
  }
});

Deno.test("unsupported and malformed paths defer to DOM; measurement failures are not hidden", () => {
  for (
    const data of [
      "",
      "M0 0A10 10 0 0 1 20 0",
      "M0 0M10 10",
      "L10 10",
      "M0",
      "M0 0C1 2",
      "M0 0Q1 2L10 0",
      "M0 0z1",
      "M0 0C1e999 0 2 0 3 0",
      "M0 0!C1 2 3 4 5 6",
    ]
  ) assertEquals(bezierPathPoints(data, measured), undefined, data);
  assertThrows(() => bezierPathPoints("M0 0C10 10 20 10 30 0", () => NaN), RangeError, "measured curve length");
  assertThrows(() => bezierPathPoints("M0 0Q10 10 20 0", () => -1), RangeError, "measured curve length");
  assertThrows(() => bezierPathPoints("M0 0Q10 10 20 0", measured, 0), RangeError, "tolerance");
});

Deno.test("curve source, retained-point and subdivision work remain bounded", () => {
  assertThrows(() => bezierPathPoints(" ".repeat(1_048_577), measured), RangeError, "source budget");
  assertThrows(() => bezierPathPoints(`M0 0${"C1 0 2 0 3 0".repeat(8192)}`, () => 3), RangeError, "point budget");
  assertThrows(() => bezierPathPoints("M0 0Q0 1 1 0", () => 1, Number.MIN_VALUE), RangeError, "budget");
});
