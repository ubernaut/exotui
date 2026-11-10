// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  nativePaintOrder,
  resolvedStrokeDashes,
  strokeContours,
  svgPaintOrder,
} from "../src/content/mermaid_stroke_metrics.ts";
import { type MermaidScene, type MermaidScenePath, renderMermaidNativeFrame } from "../mod.mermaid.ts";

const path: MermaidScenePath = {
  kind: "path",
  closed: false,
  points: [{ x: 20, y: 30, distance: 0 }, { x: 60, y: 30, distance: 20 }],
  strokeInverse: [1, 0, 0, 1, 0, 0],
  strokeDistances: [[0, 40]],
  paint: { fill: "none", stroke: "red", strokeWidth: 4, dash: [6, 6], opacity: 1 },
};
const scene = (path: MermaidScenePath): MermaidScene => ({
  width: 80,
  height: 60,
  title: "",
  description: "",
  diagnostics: [],
  items: [path],
});

Deno.test("captured zero-pathLength dashes match Chromium solid paint without nonfinite transport or weaker budgets", () => {
  for (const dash of [[8, 4], [0, 12], [12, 0], [0], []]) {
    const original = [...dash];
    assertEquals(resolvedStrokeDashes(dash, 0), []);
    assertEquals(dash, original);
  }
  assertEquals(resolvedStrokeDashes([0, 0]), []);
  assertEquals(resolvedStrokeDashes([8, 4]), [8, 4]);
  assertEquals(resolvedStrokeDashes([8, 4], 40), [8, 4]);
  assertEquals(resolvedStrokeDashes([8, 4], -1), [8, 4]);
  for (const dash of [[Infinity], [NaN], [-1], Array(1025).fill(0)]) {
    assertThrows(() => resolvedStrokeDashes(dash, 0), RangeError);
  }
  const fixed = { ...path, paint: { ...path.paint, dash: resolvedStrokeDashes(path.paint.dash, 0) } };
  const wide = renderMermaidNativeFrame(scene(fixed), { columnUnits: 1, rowUnits: 1 });
  assertEquals(wide.cells[30]![29]!.char, "█");
  assertEquals(
    renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene(fixed))), { columnUnits: 1, rowUnits: 1 }),
    wide,
  );
});

Deno.test("stroke-only host distances preserve local geometry and survive portable wide and thin projection", () => {
  const source = JSON.stringify(path);
  const metric = strokeContours(path);
  assertEquals(metric[0]!.points[1]!.distance, 40);
  assertEquals(path.points[1]!.distance, 20);
  const wide = renderMermaidNativeFrame(scene(path), { columnUnits: 1, rowUnits: 1 });
  assertEquals(wide.cells[30]![24]!.char, "█");
  assertEquals(wide.cells[30]![29]!.char, " ");
  assertEquals(wide.cells[32]![24]!.char, "█");
  assertEquals(wide.cells[33]![24]!.char, " ");
  assertEquals(
    renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene(path))), { columnUnits: 1, rowUnits: 1 }),
    wide,
  );
  const thin = renderMermaidNativeFrame(scene({ ...path, paint: { ...path.paint, strokeWidth: .1, dash: [10, 10] } }), {
    columnUnits: 2,
    rowUnits: 2,
  });
  assert(thin.cells[15]![12]!.char !== " " && thin.cells[15]![17]!.char === " ");
  assertEquals(JSON.stringify(path), source);
});

Deno.test("host metric contours reset separately and reject malformed or unbounded transported distances", () => {
  assertThrows(
    () => strokeContours({ ...path, points: [{ ...path.points[0]!, distance: NaN }, path.points[1]!] }),
    RangeError,
    "authored stroke distance",
  );
  const other = { points: path.points.map((point) => ({ ...point, y: 40 })), closed: false };
  const split = { ...path, subpaths: [path, other], strokeDistances: [[0, 40], [0, 40]] };
  assertEquals(strokeContours(split).map((contour) => contour.points[0]!.distance), [0, 0]);
  for (const strokeDistances of [[], [[0]], [[0, NaN]], [[2, 40]], [[0, -1]], [[0, 1, 2]]]) {
    assertThrows(() => renderMermaidNativeFrame(scene({ ...path, strokeDistances })), RangeError, "stroke distance");
  }
  assertThrows(
    () => strokeContours({ ...path, points: Array(8193).fill(path.points[0]), strokeDistances: [Array(8193).fill(0)] }),
    RangeError,
    "point budget",
  );
});

Deno.test("SVG paint-order shorthand restores omitted operations and rejects duplicate/unknown orders", () => {
  assertEquals(svgPaintOrder("normal"), ["fill", "stroke", "markers"]);
  assertEquals(svgPaintOrder("stroke"), ["stroke", "fill", "markers"]);
  assertEquals(svgPaintOrder("markers stroke"), ["markers", "stroke", "fill"]);
  assertEquals(svgPaintOrder("fill markers"), ["fill", "markers", "stroke"]);
  for (const value of ["stroke stroke", "fill mystery", "fill stroke markers fill"]) {
    assertThrows(() => svgPaintOrder(value), RangeError);
  }
  for (const paintOrder of [[], ["stroke", "stroke"], ["markers"], ["fill", "stroke", "fill"]]) {
    assertThrows(
      () => nativePaintOrder({ ...path, paintOrder: paintOrder as MermaidScenePath["paintOrder"] }),
      RangeError,
    );
  }
});

Deno.test("native paint order changes overlap while split operations preserve grouped opacity and JSON", () => {
  const box: MermaidScenePath = {
    kind: "path",
    closed: true,
    points: [{ x: 20, y: 15 }, { x: 60, y: 15 }, { x: 60, y: 45 }, { x: 20, y: 45 }, { x: 20, y: 15 }],
    paint: { fill: "lime", stroke: "red", strokeWidth: 12, dash: [], opacity: 1 },
  };
  const options = { columnUnits: 1, rowUnits: 1 };
  const normal = renderMermaidNativeFrame(scene(box), options);
  const swapped = renderMermaidNativeFrame(scene({ ...box, paintOrder: ["stroke", "fill"] }), options);
  assertEquals(normal.cells[20]![23]!.char, "█");
  assertEquals(swapped.cells[20]![23]!.char, " ");
  assertEquals(swapped.cells[20]![23]!.background, "lime");
  assertEquals(normal.cells[20]![17], swapped.cells[20]![17]);
  const isolated = { ...scene(box), composites: [{ start: 0, end: 1, opacity: .5, blendMode: "normal", depth: 0 }] };
  const divided = {
    ...isolated,
    items: [{ ...box, paintOrder: ["fill"] as const }, { ...box, paintOrder: ["stroke"] as const }],
    composites: [{ ...isolated.composites[0]!, end: 2 }],
  };
  assertEquals(renderMermaidNativeFrame(divided, options), renderMermaidNativeFrame(isolated, options));
  assertEquals(
    renderMermaidNativeFrame(JSON.parse(JSON.stringify(divided)), options),
    renderMermaidNativeFrame(divided, options),
  );
});
