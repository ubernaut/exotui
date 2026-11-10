// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { type MermaidScene, type MermaidSceneGradient, renderMermaidNativeFrame } from "../mod.mermaid.ts";
import { BLEND_MODES, overPaint, paintSampler, parsePaintColor } from "../src/content/mermaid_paint.ts";

const rect = (fill: string, x = 0, opacity = 1) => ({
  kind: "path" as const,
  points: [{ x, y: 0 }, { x: x + 20, y: 0 }, { x: x + 20, y: 20 }, { x, y: 20 }],
  closed: true,
  paint: { fill, stroke: "none", strokeWidth: 0, dash: [], opacity },
});
const scene = (items: MermaidScene["items"]): MermaidScene => ({
  width: 40,
  height: 20,
  title: "",
  description: "",
  items,
  diagnostics: [],
});
const gradient = (): MermaidSceneGradient => ({
  kind: "linear",
  inverse: [1, 0, 0, 1, 0, 0],
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 0,
  spread: "pad",
  interpolation: "sRGB",
  stops: [{ offset: 0, color: "red", opacity: 1 }, { offset: 1, color: "blue", opacity: 1 }],
});
const channels = (color: string | undefined) => {
  const parsed = parsePaintColor(color)!;
  return [...parsed.rgb.map(Math.round), Math.round(parsed.alpha * 1000) / 1000];
};

Deno.test("native alpha combines paint/color opacity and preserves a transparent scene until host flattening", () => {
  const red = rect("rgba(255,0,0,.5)", 0, .5);
  const frame = renderMermaidNativeFrame(scene([red]), { columnUnits: 5, rowUnits: 10 });
  assertEquals(channels(frame.cells[0]![0]!.background), [255, 0, 0, .25]);
  const flat = renderMermaidNativeFrame(scene([red]), { columnUnits: 5, rowUnits: 10, background: "white" });
  assertEquals(channels(flat.cells[0]![0]!.background), [255, 191, 191, 1]);
  assertEquals(flat.cells[0]![5]!.background, undefined, "Unused cells must not cover the window backdrop.");
  assertThrows(() => renderMermaidNativeFrame(scene([red]), { background: "transparent" }), RangeError, "backdrop");
});

Deno.test("native group opacity applies once after children overlap and supports nested identical ranges", () => {
  const value = scene([rect("white"), rect("red"), rect("blue", 10)]);
  value.composites = [{ start: 1, end: 3, opacity: .5, blendMode: "normal", depth: 0 }];
  const frame = renderMermaidNativeFrame(value, { columnUnits: 5, rowUnits: 10 });
  assertEquals(
    channels(frame.cells[0]![2]!.background),
    [128, 128, 255, 1],
    "Overlap must not independently fade both children.",
  );
  value.composites = [...value.composites, { start: 1, end: 3, opacity: .5, blendMode: "normal", depth: 1 }];
  const nested = renderMermaidNativeFrame(value, { columnUnits: 5, rowUnits: 10 });
  assertEquals(channels(nested.cells[0]![2]!.background), [191, 191, 255, 1]);
});

Deno.test("native zero paint/group opacity does not leave glyphs or links, and opaque overlays replace hidden text", () => {
  const text = {
    kind: "text" as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: "A",
    color: "black",
    fontWeight: "bold",
    fontStyle: "normal",
    href: "product:hidden",
  };
  const value = scene([text, rect("red")]);
  value.composites = [{ start: 0, end: 1, opacity: 0, blendMode: "normal", depth: 0 }];
  const empty = renderMermaidNativeFrame(value, { columnUnits: 5, rowUnits: 10 });
  assertEquals(empty.cells[0]![0]!.char, " ");
  assertEquals(empty.cells[0]![0]!.href, undefined);
  value.composites = [];
  const covered = renderMermaidNativeFrame(value, { columnUnits: 5, rowUnits: 10 });
  assertEquals(covered.cells[0]![0]!.char, " ");
  assertEquals(covered.cells[0]![0]!.foreground, undefined);
  assertEquals(covered.cells[0]![0]!.href, undefined);
  assertEquals(covered.cells[0]![0]!.bold, undefined);
});

Deno.test("linear gradients handle transforms, spread cycles, hard stops, degeneracy and SVG color spaces", () => {
  const diagnostics = new Set<string>();
  const sample = (value: MermaidSceneGradient) => paintSampler("url(#gradient)", value, 1, () => {}, diagnostics);
  const value = gradient();
  assertEquals(sample(value)(50, 0)!.rgb, [127.5, 0, 127.5]);
  value.inverse = [2, 0, 0, 1, 0, 0];
  assertEquals(sample(value)(25, 0)!.rgb, [127.5, 0, 127.5]);
  value.inverse = [1, 0, 0, 1, 0, 0];
  value.spread = "repeat";
  assertEquals(sample(value)(-25, 0)!.rgb, [63.75, 0, 191.25]);
  value.spread = "reflect";
  assertEquals(sample(value)(125, 0)!.rgb, [63.75, 0, 191.25]);
  value.spread = "pad";
  value.stops = [{ offset: .5, color: "red", opacity: 1 }, { offset: .5, color: "blue", opacity: 1 }];
  assertEquals(sample(value)(50, 0)!.rgb, [0, 0, 255]);
  value.x2 = 0;
  assertEquals(sample(value)(1, 1)!.rgb, [0, 0, 255]);
  value.spread = "repeat";
  assertEquals(
    sample(value)(1, 1)!.rgb,
    [0, 0, 255],
    "A degenerate vector uses its final stop, not the wrapped first stop.",
  );
  value.spread = "pad";
  value.x2 = 100;
  value.interpolation = "linearRGB";
  value.stops = [{ offset: 0, color: "black", opacity: 1 }, { offset: 1, color: "white", opacity: 1 }];
  assertEquals(sample(value)(50, 0)!.rgb.map(Math.round), [188, 188, 188]);
  value.interpolation = "Oklab";
  assertEquals(sample(value)(50, 0)!.rgb.map(Math.round), [99, 99, 99]);
  value.stops = [{ offset: 0, color: "rgba(255,0,0,0)", opacity: 1 }, {
    offset: 1,
    color: "blue",
    opacity: 1,
  }];
  const transparentStop = sample(value)(50, 0)!;
  assertEquals(transparentStop.rgb.map(Math.round), [140, 83, 162]);
  assertEquals(transparentStop.alpha, .5);
  let work = 0;
  paintSampler("red", value, 1, (amount) => work += amount, diagnostics)(50, 0);
  assert(work >= 320, "Oklab conversions and bounded gamut mapping must charge their work.");
  value.interpolation = "sRGB";
  value.stops = [{ offset: 0, color: "transparent", opacity: 1 }, { offset: 1, color: "blue", opacity: 1 }];
  assertEquals(sample(value)(50, 0)!.rgb, [0, 0, 127.5]);
  assertEquals(sample(value)(50, 0)!.alpha, .5);
  assertEquals(diagnostics.size, 0);
});

Deno.test("radial gradients solve concentric/two-circle positions and bound sample work without cycle loops", () => {
  const value = { ...gradient(), kind: "radial" as const, x1: 0, y1: 0, x2: 0, y2: 0, radius: 100, focalRadius: 20 };
  let work = 0;
  const sample = paintSampler("url(#radial)", value, .5, (amount) => work += amount, new Set());
  assertEquals(sample(60, 0)!.rgb, [127.5, 0, 127.5]);
  assertEquals(sample(60, 0)!.alpha, .5);
  assertEquals(sample(100, 0)!.rgb, [0, 0, 255]);
  sample(1e20, 1e20);
  assert(work < 100);
});

Deno.test("CSS blend modes preserve finite alpha and standard endpoint colors", () => {
  const white = parsePaintColor("white")!;
  const red = parsePaintColor("red")!;
  assertEquals(overPaint(red, white, 1, "multiply").rgb, red.rgb);
  assertEquals(overPaint(red, white, 1, "screen").rgb, white.rgb);
  for (const mode of BLEND_MODES) {
    const color = overPaint(parsePaintColor("rgba(20,70,140,.6)")!, parsePaintColor("rgba(200,130,40,.7)")!, .5, mode);
    assert(color.rgb.every((value) => Number.isFinite(value) && value >= -1e-8 && value <= 255 + 1e-8));
    assert(Math.abs(color.alpha - .79) < 1e-12);
  }
  assertThrows(() => overPaint(red, white, 1, "unimplemented"), RangeError, "blend mode");
});

Deno.test("native overlays repair both halves of wide glyphs and keep only visible link targets", () => {
  const label = {
    kind: "text" as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: "界",
    color: "black",
    fontWeight: "400",
    fontStyle: "normal",
    href: "product:wide",
  };
  for (const x of [0, 5]) {
    const overlay = rect("red", x);
    overlay.points = [{ x, y: 0 }, { x: x + 5, y: 0 }, { x: x + 5, y: 20 }, { x, y: 20 }];
    const frame = renderMermaidNativeFrame(scene([label, overlay]), { columnUnits: 5, rowUnits: 10 });
    assertEquals(frame.cells[0]!.slice(0, 2).map((cell) => cell.char), [" ", " "]);
    assertEquals(frame.cells[0]!.slice(0, 2).map((cell) => cell.href), [undefined, undefined]);
  }
});

Deno.test("ASCII-base keycaps retain native wide followers and repair either overlaid half", () => {
  for (const text of ["1️⃣", "#️⃣", "*️⃣"]) {
    const label = {
      kind: "text" as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      text,
      color: "black",
      fontWeight: "400",
      fontStyle: "normal",
      href: "product:keycap",
    };
    const plain = renderMermaidNativeFrame(scene([label]), { columnUnits: 5, rowUnits: 10 });
    assertEquals(plain.cells[0]!.slice(0, 2).map((cell) => cell.char), [text, ""]);
    assertEquals(plain.cells[0]!.slice(0, 2).map((cell) => cell.href), ["product:keycap", "product:keycap"]);
    for (const x of [0, 5]) {
      const overlay = rect("red", x);
      overlay.points = [{ x, y: 0 }, { x: x + 5, y: 0 }, { x: x + 5, y: 20 }, { x, y: 20 }];
      const covered = renderMermaidNativeFrame(scene([label, overlay]), { columnUnits: 5, rowUnits: 10 });
      assertEquals(covered.cells[0]!.slice(0, 2).map((cell) => cell.char), [" ", " "]);
      assertEquals(covered.cells[0]!.slice(0, 2).map((cell) => cell.href), [undefined, undefined]);
    }
  }
});

Deno.test("native sparse group allocations reject frame-wide nested layers before unbounded retention", () => {
  const value = scene(
    new Array(6).fill(0).map(() => ({
      ...rect("red"),
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    })),
  );
  value.width = value.height = 100;
  value.composites = new Array(6).fill(0).map((_, start) => ({
    start,
    end: 6,
    depth: start,
    opacity: .5,
    blendMode: "normal",
  }));
  assertThrows(
    () => renderMermaidNativeFrame(value, { columnUnits: 5, rowUnits: 5, maxCells: 500 }),
    RangeError,
    "composite-cell budget",
  );
  assertEquals(parsePaintColor("rgb(200oops,0,0)"), undefined);
});

Deno.test("composite and gradient validation reject crossing/deep ranges, invalid opacity and unbounded stops", () => {
  const value = scene([rect("red"), rect("blue"), rect("green")]);
  value.composites = [{ start: 0, end: 2, opacity: 1, blendMode: "normal", depth: 0 }, {
    start: 1,
    end: 3,
    opacity: 1,
    blendMode: "normal",
    depth: 1,
  }];
  assertThrows(() => renderMermaidNativeFrame(value), RangeError, "nesting");
  value.composites = new Array(65).fill(0).map((_, depth) => ({
    start: 0,
    end: 3,
    opacity: 1,
    blendMode: "normal",
    depth,
  }));
  assertThrows(() => renderMermaidNativeFrame(value), RangeError, "nesting");
  value.composites = [{ start: 0, end: 1, opacity: NaN, blendMode: "normal", depth: 0 }];
  assertThrows(() => renderMermaidNativeFrame(value), RangeError, "opacity");
  const invalid = { ...gradient(), stops: new Array(4097).fill({ offset: 0, color: "red", opacity: 1 }) };
  assertThrows(() => paintSampler("red", invalid, 1, () => {}, new Set()), RangeError);
  assertThrows(() => paintSampler("red", gradient(), -1, () => {}, new Set()), RangeError, "opacity");
  assertThrows(
    () =>
      paintSampler(
        "red",
        { ...gradient(), stops: [{ offset: .8, color: "red", opacity: 1 }, { offset: .1, color: "blue", opacity: 1 }] },
        1,
        () => {},
        new Set(),
      ),
    RangeError,
    "stop",
  );
});
