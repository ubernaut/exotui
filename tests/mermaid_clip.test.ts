// Copyright 2023 Im-Beast. MIT license.
import { assertEquals, assertThrows } from "./deps.ts";
import { clipPredicate } from "../src/content/mermaid_clip.ts";
import { type MermaidScene, type MermaidSceneClip, renderMermaidNativeFrame } from "../mod.mermaid.ts";

const rectangle = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];
const silhouette = (x: number, y: number, width: number, height: number): MermaidSceneClip => ({
  kind: "path",
  rule: "nonzero",
  contours: [rectangle(x, y, width, height)],
});

Deno.test("native clips union children, intersect ancestors and preserve independent evenodd/nonzero holes", () => {
  const left = silhouette(0, 0, 20, 20);
  const right = silhouette(40, 0, 20, 20);
  const union = clipPredicate({ kind: "union", children: [left, right] }, () => {});
  assertEquals([union(10, 10), union(30, 10), union(50, 10)], [true, false, true]);
  const intersection = clipPredicate({ kind: "intersection", children: [left, silhouette(10, 0, 30, 20)] }, () => {});
  assertEquals([intersection(5, 10), intersection(15, 10), intersection(30, 10)], [false, true, false]);
  for (const rule of ["evenodd", "nonzero"] as const) {
    const clip: MermaidSceneClip = {
      kind: "path",
      rule,
      contours: [rectangle(0, 0, 60, 60), rectangle(20, 20, 20, 20)],
    };
    assertEquals(clipPredicate(clip, () => {})(30, 30), rule === "nonzero");
    clip.contours = [clip.contours[0]!, [...clip.contours[1]!].reverse()];
    assertEquals(clipPredicate(clip, () => {})(30, 30), false);
  }
  assertEquals(clipPredicate({ kind: "union", children: [] }, () => {})(0, 0), false);
  assertEquals(
    clipPredicate(
      { kind: "path", rule: "nonzero", contours: [[{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 20 }]] },
      () => {},
    )(5, 10),
    false,
  );
});

Deno.test("native clipping removes paints and link targets without splitting wide glyphs", () => {
  const clip = silhouette(0, 0, 25, 50);
  const scene: MermaidScene = {
    width: 60,
    height: 50,
    title: "",
    description: "",
    diagnostics: [],
    items: [{
      kind: "path",
      closed: true,
      points: rectangle(0, 0, 60, 50),
      clip,
      paint: { fill: "red", stroke: "blue", strokeWidth: 1, dash: [], opacity: 1 },
      href: "product:paint",
    }, {
      kind: "text",
      text: "A界Z",
      x: 10,
      y: 20,
      width: 40,
      height: 10,
      color: "black",
      fontWeight: "400",
      fontStyle: "normal",
      href: "product:label",
      clip,
    }],
  };
  const frame = renderMermaidNativeFrame(scene, { columnUnits: 10, rowUnits: 10 });
  assertEquals(frame.cells[2]![1]!.char, "A");
  assertEquals(frame.cells[2]![1]!.href, "product:label");
  assertEquals(frame.cells[2]![2]!.char, " ", "A clipped wide glyph must not leave its first half.");
  assertEquals(frame.cells[2]![3]!.href, undefined);
  assertEquals(frame.cells[2]![3]!.foreground, undefined);
  assertEquals(frame.cells[2]![3]!.background, undefined);
});

Deno.test("clip trees reject cycles, excessive depth, nonfinite coordinates and unbounded geometry", () => {
  const cyclic: MermaidSceneClip = { kind: "union", children: [] };
  cyclic.children = [cyclic];
  assertThrows(() => clipPredicate(cyclic, () => {}), RangeError, "tree budget");
  let deep = silhouette(0, 0, 10, 10);
  for (let depth = 0; depth < 66; depth++) deep = { kind: "intersection", children: [deep] };
  assertThrows(() => clipPredicate(deep, () => {}), RangeError, "tree budget");
  assertThrows(
    () => clipPredicate({ kind: "path", rule: "nonzero", contours: [[{ x: Infinity, y: 0 }]] }, () => {}),
    RangeError,
  );
  assertThrows(
    () => clipPredicate({ kind: "path", rule: "nonzero", contours: [new Array(32769).fill({ x: 0, y: 0 })] }, () => {}),
    RangeError,
    "point budget",
  );
});

Deno.test("native marker text clips at painted cell samples rather than snapping its origin outside the visible viewport", () => {
  const scene: MermaidScene = {
    width: 300,
    height: 200,
    title: "",
    description: "",
    diagnostics: [],
    items: [{
      kind: "text",
      text: "Sample",
      x: 120,
      y: 22,
      width: 60,
      height: 22,
      color: "red",
      fontWeight: "400",
      fontStyle: "normal",
      href: "product:marker",
      clip: silhouette(120, 20, 90, 30),
    }],
  };
  const frame = renderMermaidNativeFrame(scene, { columnUnits: 9, rowUnits: 16 });
  assertEquals(frame.cells[1]!.filter((cell) => cell.char.trim()).map((cell) => cell.char).join(""), "Sample");
  assertEquals(frame.cells[1]![13]!.href, "product:marker");
  assertEquals(frame.diagnostics, []);
});

Deno.test("clip samples charge scene work and share only explicitly reserved bounded cache slots", () => {
  let work = 0;
  let slots = 1;
  const inside = clipPredicate(silhouette(0, 0, 10, 10), (amount) => work += amount, () => slots-- > 0);
  inside(5, 5);
  const first = work;
  inside(5, 5);
  assertEquals(work, first);
  inside(6, 6);
  const second = work;
  inside(6, 6);
  assertEquals(work > second, true);
});
