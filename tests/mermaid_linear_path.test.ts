// Copyright 2023 Im-Beast. MIT license.
import { assertEquals, assertThrows } from "./deps.ts";
import { linearPathPoints } from "../src/content/mermaid_linear_path.ts";

Deno.test("linear SVG contours retain exact corners, closures and local arclength", () => {
  assertEquals(linearPathPoints("M0 0 L10 20"), [
    { x: 0, y: 0, distance: 0 },
    { x: 10, y: 20, distance: Math.hypot(10, 20) },
  ]);
  assertEquals(linearPathPoints("M10,10H20V30h-10z"), [
    { x: 10, y: 10, distance: 0 },
    { x: 20, y: 10, distance: 10 },
    { x: 20, y: 30, distance: 30 },
    { x: 10, y: 30, distance: 40 },
    { x: 10, y: 10, distance: 60 },
  ]);
});

Deno.test("linear SVG contours handle implicit relative moves and compact exponent/sign numbers", () => {
  assertEquals(linearPathPoints("m1e1-2e1 3 4 0 1"), [
    { x: 10, y: -20, distance: 0 },
    { x: 13, y: -16, distance: 5 },
    { x: 13, y: -15, distance: 6 },
  ]);
  assertEquals(linearPathPoints("M.5.5L1.5.5"), [
    { x: 0.5, y: 0.5, distance: 0 },
    { x: 1.5, y: 0.5, distance: 1 },
  ]);
  assertEquals(linearPathPoints("M0 0 L0 0 L1 0"), [
    { x: 0, y: 0, distance: 0 },
    { x: 0, y: 0, distance: 0 },
    { x: 1, y: 0, distance: 1 },
  ]);
});

Deno.test("curves, disconnected contours and malformed input stay with DOM geometry; linear work is bounded", () => {
  for (
    const source of [
      "",
      "M0 0 Q10 10 20 0",
      "M0 0 A5 5 0 0 1 10 0",
      "M0 0 M10 10",
      "L1 2",
      "M0",
      "M0 0L",
      "M0 0z1",
      "M0 0L1e999 1",
      "M0 0!L1 1",
    ]
  ) {
    assertEquals(linearPathPoints(source), undefined, source);
  }
  assertThrows(() => linearPathPoints(`M0 0 ${"L1 1 ".repeat(8192)}`), RangeError, "point budget");
});
