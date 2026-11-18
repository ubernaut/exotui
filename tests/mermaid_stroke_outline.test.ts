// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { strokeOutlineCells } from "../src/content/mermaid_stroke_outline.ts";
import { type MermaidScene, type MermaidScenePath, renderMermaidNativeFrame } from "../mod.mermaid.ts";

const path: MermaidScenePath = {
  kind: "path",
  closed: false,
  points: [{ x: 10, y: 20 }, { x: 30, y: 20 }],
  paint: { fill: "none", stroke: "red", strokeWidth: 8, dash: [], opacity: 1 },
};

function outline(value: MermaidScenePath): Set<string> {
  return new Set(
    Array.from(strokeOutlineCells(value, 80, 80, 1, 1, () => {}) ?? [], ({ column, row }) => `${column},${row}`),
  );
}

Deno.test("wide stroke outlines retain actual width and distinct butt/round/square caps", () => {
  const butt = outline(path);
  assert(butt.has("20,16") && butt.has("20,24"));
  assert(!butt.has("20,15") && !butt.has("9,20"));
  const round = outline({ ...path, paint: { ...path.paint, lineCap: "round" } });
  const square = outline({ ...path, paint: { ...path.paint, lineCap: "square" } });
  assert(round.has("6,20") && round.has("34,20"));
  assert(!round.has("7,17") && square.has("7,17"));
});

Deno.test("wide joins preserve outer miters, bevels, round sectors and miter limits", () => {
  const corner: MermaidScenePath = { ...path, points: [{ x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 30 }] };
  const miter = outline(corner);
  const bevel = outline({ ...corner, paint: { ...corner.paint, lineJoin: "bevel" } });
  const round = outline({ ...corner, paint: { ...corner.paint, lineJoin: "round" } });
  const limited = outline({ ...corner, paint: { ...corner.paint, miterLimit: 1 } });
  assert(miter.has("23,17") && !bevel.has("23,17") && !round.has("23,17"));
  assert(round.has("22,17") && !bevel.has("22,17"));
  assertEquals(limited, bevel);
  const clipped = outline({ ...corner, paint: { ...corner.paint, lineJoin: "miter-clip", miterLimit: 1 } });
  assert(clipped.has("22,17") && !clipped.has("23,17"));
});

Deno.test("outline dash runs retain caps, phase, zero-length dots and disconnected resets", () => {
  const dashed = {
    ...path,
    points: [{ x: 10, y: 20, distance: 0 }, { x: 50, y: 20, distance: 40 }],
    paint: { ...path.paint, dash: [8, 8] },
  };
  const cells = outline(dashed);
  assert(cells.has("14,20") && !cells.has("22,20") && cells.has("30,20"));
  const shifted = outline({ ...dashed, paint: { ...dashed.paint, dashOffset: 8 } });
  assert(!shifted.has("14,20") && shifted.has("22,20"));
  const capped = outline({ ...dashed, paint: { ...dashed.paint, lineCap: "round" } });
  assert(capped.has("20,20") && !capped.has("22,24"));
  const dots = outline({ ...dashed, paint: { ...dashed.paint, dash: [0, 12], lineCap: "round" } });
  assert(dots.has("10,23") && dots.has("22,23") && !dots.has("16,20"));
  const exactEnd = outline({
    ...dashed,
    points: [{ x: 10, y: 20, distance: 0 }, { x: 58, y: 20, distance: 48 }],
    paint: { ...dashed.paint, lineCap: "round" },
  });
  assert(!exactEnd.has("56,20"), "A positive dash beginning at the path's exact end invented a capped dot");
  const disconnected = outline({
    ...dashed,
    subpaths: [
      { points: dashed.points, closed: false },
      { points: dashed.points.map((point) => ({ ...point, y: 40 })), closed: false },
    ],
  });
  assert(disconnected.has("14,40") && !disconnected.has("22,40") && !disconnected.has("30,30"));
});

Deno.test("closed outlines join their seam without adding endpoint caps", () => {
  const closed = {
    ...path,
    closed: true,
    points: [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 }, { x: 20, y: 20 }],
  };
  const cells = outline(closed);
  assert(cells.has("17,17") && cells.has("43,43") && !cells.has("30,30"));
  assertEquals(outline({ ...closed, paint: { ...closed.paint, lineCap: "square" } }), cells);
});

Deno.test("zero-length native contours respect butt invisibility and thin round/square marks", () => {
  const scene: MermaidScene = {
    width: 60,
    height: 60,
    title: "",
    description: "",
    diagnostics: [],
    items: [{
      ...path,
      points: [{ x: 20, y: 20 }, { x: 20, y: 20 }],
      paint: { ...path.paint, strokeWidth: 1 },
    }],
  };
  assertEquals(renderMermaidNativeFrame(scene, { columnUnits: 4, rowUnits: 4 }).cells[5]![5]!.char, " ");
  const item = scene.items[0] as MermaidScenePath;
  item.paint.lineCap = "round";
  assertEquals(renderMermaidNativeFrame(scene, { columnUnits: 4, rowUnits: 4 }).cells[5]![5]!.char, "•");
  item.paint.lineCap = "square";
  assertEquals(renderMermaidNativeFrame(scene, { columnUnits: 4, rowUnits: 4 }).cells[5]![5]!.char, "▪");
});

Deno.test("authored affine metrics preserve anisotropic width and cap shapes after JSON", () => {
  const transformed: MermaidScenePath = {
    ...path,
    points: [{ x: 20, y: 20, distance: 0 }, { x: 40, y: 20, distance: 10 }],
    strokeInverse: [.5, 0, 0, 2, -10, 0],
    paint: { ...path.paint, lineCap: "round" },
  };
  const cells = outline(transformed);
  assert(cells.has("12,20") && cells.has("48,20") && cells.has("30,22") && !cells.has("30,23"));
  assertEquals(outline(JSON.parse(JSON.stringify(transformed))), cells);
});

Deno.test("unioned stroke primitives paint opacity once and retain clipped actions", () => {
  const scene: MermaidScene = {
    width: 60,
    height: 60,
    title: "",
    description: "",
    diagnostics: [],
    items: [{
      ...path,
      points: [{ x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 40 }],
      paint: { ...path.paint, strokeOpacity: .5, lineJoin: "round" },
      href: "https://example.test/wide",
      interaction: { href: "https://example.test/wide", title: "Wide" },
      clip: {
        kind: "path",
        rule: "nonzero",
        contours: [[{ x: 0, y: 0 }, { x: 22, y: 0 }, { x: 22, y: 60 }, { x: 0, y: 60 }]],
      },
    }],
  };
  const frame = renderMermaidNativeFrame(scene, { columnUnits: 1, rowUnits: 1 });
  assertEquals(frame.cells[20]![20]!.char, "█");
  assertEquals(frame.cells[20]![20]!.foreground, frame.cells[20]![15]!.foreground);
  assertEquals(frame.cells[20]![20]!.interaction?.title, "Wide");
  assertEquals(frame.cells[20]![24]!.href, undefined);
  assertEquals(renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)), { columnUnits: 1, rowUnits: 1 }), frame);
});

Deno.test("outline projection keeps thin circuit paths and rejects invalid or excessive work", () => {
  assertEquals(strokeOutlineCells(path, 20, 20, 10, 20, () => {}), undefined);
  for (const strokeInverse of [[0, 0, 0, 0, 0, 0], [NaN, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0]] as const) {
    assertThrows(
      () => outline({ ...path, strokeInverse: strokeInverse as MermaidScenePath["strokeInverse"] }),
      RangeError,
    );
  }
  assertThrows(
    () => outline({ ...path, paint: { ...path.paint, dash: [1e-12, 1e-12] } }),
    RangeError,
    "dash-run budget",
  );
  assertThrows(() => outline({ ...path, paint: { ...path.paint, miterLimit: NaN } }), RangeError);
  assertThrows(() =>
    strokeOutlineCells(path, 80, 80, 1, 1, () => {
      throw new RangeError("Scene work");
    }), RangeError);
  assertThrows(
    () => outline({ ...path, points: [{ x: 10, y: 20, distance: 10 }, { x: 30, y: 20, distance: 5 }] }),
    RangeError,
  );
});
