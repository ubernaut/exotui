// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { type MermaidScene, renderMermaidNativeFrame } from "../mod.mermaid.ts";
import { mathAssembly } from "../src/content/mermaid_math.ts";

function scene(): MermaidScene {
  const label = {
    kind: "text" as const,
    width: 9,
    height: 12,
    color: "red",
    fontWeight: "400",
    fontStyle: "normal",
    math: { rowUnits: 3 },
    href: "host:math",
  };
  return {
    width: 70,
    height: 30,
    title: "",
    description: "",
    diagnostics: [],
    items: [
      { ...label, text: "x", x: 9, y: 12 },
      { ...label, text: "2", x: 18, y: 6 },
      { ...label, text: "y", x: 36, y: 12 },
      { ...label, text: "1", x: 45, y: 18 },
    ],
  };
}

Deno.test("native math density keeps bases and scripts separate across portable scene transport", () => {
  const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene())));
  assertEquals(frame.cells[2]![2]!.char, "2");
  assertEquals(frame.cells[4]![1]!.char, "x");
  assertEquals(frame.cells[4]![4]!.char, "y");
  assertEquals(frame.cells[6]![5]!.char, "1");
  assertEquals(frame.cells[2]![2]!.href, "host:math");
  assertEquals(frame.diagnostics, []);
  assert(
    renderMermaidNativeFrame(scene(), { rowUnits: 18 }).diagnostics.some((message) =>
      message.includes("may merge MathML")
    ),
  );
});

Deno.test("native math assemblies preserve stretched delimiters and horizontal arrow direction", () => {
  assertEquals(mathAssembly("(", "vertical", 4), ["⎛", "⎜", "⎜", "⎝"]);
  assertEquals(mathAssembly("}", "vertical", 5), ["⎫", "⎪", "⎬", "⎪", "⎭"]);
  assertEquals(mathAssembly("⌊", "vertical", 3), ["│", "│", "└"]);
  assertEquals(mathAssembly("→", "horizontal", 4), ["─", "─", "─", "→"]);
  assertEquals(mathAssembly("↔", "horizontal", 1), ["↔"]);
  assertEquals(mathAssembly("↔", "horizontal", 4), ["←", "─", "─", "→"]);
  assertEquals(mathAssembly("unknown", "vertical", 3), undefined);
  const input = scene();
  const first = input.items[0]!;
  if (first.kind !== "text") throw new Error("fixture");
  first.text = "(";
  first.y = 3;
  first.height = 15;
  first.math!.stretch = "vertical";
  const frame = renderMermaidNativeFrame(input);
  assertEquals(frame.cells[1]![1]!.char, "⎛");
  assertEquals(frame.cells[5]![1]!.char, "⎝");
  assertEquals(frame.cells[3]![1]!.href, "host:math");
});

Deno.test("native math metadata, allocation and unknown assemblies cannot silently downgrade", () => {
  const input = scene();
  const first = input.items[0]!;
  if (first.kind !== "text") throw new Error("fixture");
  for (const rowUnits of [0, -1, NaN, Infinity, Number.MIN_VALUE]) {
    first.math!.rowUnits = rowUnits;
    assertThrows(() => renderMermaidNativeFrame(input), RangeError);
  }
  first.math!.rowUnits = 3;
  first.math!.stretch = "vertical";
  first.height = Infinity;
  assertThrows(() => renderMermaidNativeFrame(input), RangeError);
  first.height = 15;
  assert(renderMermaidNativeFrame(input).diagnostics.some((message) => message.includes("native glyph assembly")));
});

Deno.test("native math assembly uses measured mirrored ink without changing logical source", () => {
  const input = scene(), first = input.items[0]!;
  if (first.kind !== "text") throw new Error("fixture");
  first.text = ")";
  first.renderedText = "(";
  first.y = 3;
  first.height = 15;
  first.math!.stretch = "vertical";
  const saved = JSON.stringify(input), frame = renderMermaidNativeFrame(JSON.parse(saved));
  assertEquals(frame.cells[1]![1]!.char, "⎛");
  assertEquals(frame.cells[5]![1]!.char, "⎝");
  assertEquals(frame.cells[3]![1]!.href, "host:math");
  assertEquals(JSON.stringify(input), saved);
  first.renderedText = "((";
  assertThrows(() => renderMermaidNativeFrame(input), RangeError);
});

Deno.test("native math assemblies obey clip and compositor styling at every painted row", () => {
  const input = scene();
  const first = input.items[0]!;
  if (first.kind !== "text") throw new Error("fixture");
  first.text = "[";
  first.y = 3;
  first.height = 18;
  first.math!.stretch = "vertical";
  first.clip = {
    kind: "path",
    rule: "nonzero",
    contours: [[{ x: 0, y: 8 }, { x: 25, y: 8 }, { x: 25, y: 15 }, { x: 0, y: 15 }]],
  };
  const frame = renderMermaidNativeFrame(input);
  assertEquals(frame.cells[1]![1]!.char, " ");
  assertEquals(frame.cells[3]![1]!.char, "⎢");
  assertEquals(frame.cells[3]![1]!.foreground, "red");
  assertEquals(frame.cells[3]![1]!.href, "host:math");
  assertEquals(frame.cells[6]![1]!.char, " ");
});

Deno.test("fraction rule widths retain host-space affine metrics through native JSON projection", () => {
  for (const [scale, rows] of [[1, [20, 28]], [2, [22, 26]], [.5, [16, 32]]] as const) {
    const input: MermaidScene = {
      width: 60,
      height: 48,
      title: "",
      description: "",
      diagnostics: [],
      items: [{
        kind: "path",
        closed: false,
        points: [{ x: 8, y: 24 }, { x: 40, y: 24 }],
        strokeInverse: [1, 0, 0, scale, 0, 0],
        paint: { fill: "none", stroke: "green", strokeWidth: 8, dash: [], opacity: 1 },
        href: "host:fraction",
      }],
    };
    const saved = JSON.stringify(input),
      frame = renderMermaidNativeFrame(JSON.parse(saved), { columnUnits: 1, rowUnits: 1 });
    for (let row = 0; row < frame.rows; row++) {
      const cell = frame.cells[row]![20]!;
      assertEquals(cell.char, row >= rows[0] && row <= rows[1] ? "█" : " ");
      if (cell.char !== " ") {
        assertEquals(cell.foreground, "green");
        assertEquals(cell.href, "host:fraction");
      }
    }
    assertEquals(JSON.stringify(input), saved);
  }
});
