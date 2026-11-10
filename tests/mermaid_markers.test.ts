// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { markerPathVertices } from "../src/content/mermaid_marker_path.ts";

const angles = (data: string): number[] =>
  markerPathVertices(data).map((vertex) => Math.round(vertex.angle * 1000) / 1000);

Deno.test("SVG markers occur only on command vertices and bisect incoming/outgoing directions", () => {
  assertEquals(markerPathVertices("M0 0 L20 0 L20 20"), [
    { x: 0, y: 0, angle: 0, position: "start" },
    { x: 20, y: 0, angle: 45, position: "mid" },
    { x: 20, y: 20, angle: 90, position: "end" },
  ]);
  assertEquals(markerPathVertices("M0 0 C0 0 10 10 20 0").length, 2, "Curve flattening must not create markers.");
});

Deno.test("SVG cubic/quadratic shorthand and degenerate endpoint controls retain exact tangents", () => {
  assertEquals(angles("M0 0 C0 0 10 10 20 0 S30 -10 40 0"), [45, -45, 45]);
  assertEquals(angles("M0 0 Q10 10 20 0 T40 0"), [45, -45, 45]);
  assertEquals(angles("M0 0 C10 0 0 10 0 0"), [0, -90]);
  assertEquals(angles("M0 0 L10 0 T20 10"), [0, 22.5, 45], "Non-quadratic commands reset reflected control state.");
});

Deno.test("SVG marker arcs handle sweep/radius corrections, relative coordinates and compact flags", () => {
  assertEquals(angles("M0 0 A10 10 0 0 1 20 0"), [-90, 90]);
  assertEquals(angles("M0 0 A10 10 0 0 0 20 0"), [90, -90]);
  assertEquals(angles("M0 0 a-2 -2 0 0120 0"), [-90, 90]);
  assertEquals(angles("M0 0 A0 10 30 1 1 20 20"), [45, 45]);
});

Deno.test("closed/disconnected SVG contours preserve duplicate closure sites but only one global start/end", () => {
  const vertices = markerPathVertices("M0 0 h20 v20 z m50 0 20 0 0 20 z");
  assertEquals(vertices.length, 8);
  assertEquals(angles("M0 0 h20 v20 z"), [-67.5, 45, 157.5, -67.5]);
  assertEquals(vertices[4]!.x, 50);
  assertEquals(vertices.map((vertex) => vertex.position), ["start", "mid", "mid", "mid", "mid", "mid", "mid", "end"]);
  assertEquals(vertices[0]!.x, vertices[3]!.x);
});

Deno.test("zero-length SVG segments retain authored sites and the current Chromium host's zero-vector angles", () => {
  assertEquals(angles("M0 0 L0 0 L10 0 L10 0 L10 10 L10 10"), [0, 0, 0, 45, 45, 0]);
  assertEquals(markerPathVertices("M5 5"), [{ x: 5, y: 5, angle: 45, position: "end" }]);
  assertEquals(markerPathVertices("M5 5 l0 0"), [
    { x: 5, y: 5, angle: 0, position: "start" },
    { x: 5, y: 5, angle: 0, position: "end" },
  ]);
  assertEquals(markerPathVertices(""), []);
  assert(markerPathVertices(`M0 0 ${"L0 0 ".repeat(8000)}`).every((vertex) => vertex.angle === 0));
});

Deno.test("close-followed-by-line and inclusive half-turn marker directions match authored SVG vertices", () => {
  assertEquals(angles("M25 295 L70 295 Z L125 295"), [90, 270, 90, 0]);
  assertEquals(angles("M0 0 L0 -10 L0 0"), [-90, 180, 90]);
  assertEquals(angles("M0 0 L20 0 L20 20 L0 0 Z"), [0, 45, 157.5, -67.5, 0]);
});

Deno.test("SVG marker path parsing bounds source/vertices and rejects invalid/overflowing parameters", () => {
  assertThrows(() => markerPathVertices(" ".repeat(1_048_577)), RangeError);
  assertThrows(() => markerPathVertices(`M0 0 ${"L0 0 ".repeat(8192)}`), RangeError);
  for (const source of ["L0 0", "M0", "M0 0 R10 10", "M0 0 A10 10 0 2 1 20 0", "M0 0 Z 1 1"]) {
    assertThrows(() => markerPathVertices(source), SyntaxError);
  }
  assertThrows(() => markerPathVertices("M1e999 0"), RangeError);
});
