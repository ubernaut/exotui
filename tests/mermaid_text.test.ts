// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { measuredTextDensity, nativeDiagramText, validateTextLayout } from "../src/content/mermaid_text.ts";
import { type MermaidScene, type MermaidSceneText, renderMermaidNativeFrame } from "../mod.mermaid.ts";

const label: MermaidSceneText = {
  kind: "text",
  text: "AB😀é",
  x: 10,
  y: 10,
  width: 20,
  height: 60,
  color: "red",
  fontWeight: "bold",
  fontStyle: "italic",
  href: "https://example.com/axis",
  layout: {
    columnUnits: 8,
    glyphs: [
      { start: 0, end: 1, x: 20, y: 60 },
      { start: 1, end: 2, x: 20, y: 50 },
      { start: 2, end: 4, x: 20, y: 35 },
      { start: 4, end: 6, x: 20, y: 20 },
    ],
  },
};
const scene = (text: MermaidSceneText): MermaidScene => ({
  width: 100,
  height: 100,
  title: "",
  description: "",
  diagnostics: [],
  items: [text],
});

const separated = (): MermaidSceneText => ({
  ...label,
  text: ")\u0333",
  renderedText: undefined,
  layout: {
    columnUnits: 8,
    anchor: "top-left",
    glyphs: [{
      start: 0,
      end: 2,
      x: 60,
      y: 20,
      fragments: [{ rendered: ")", x: 60, y: 20 }, { rendered: "\u00a0\u0333", x: 20, y: 20, columnOffset: -1 }],
    }],
  },
} as MermaidSceneText);

Deno.test("one logical grapheme retains separately measured native ink, anchors, styles and links", () => {
  const text = separated(), original = JSON.stringify(text);
  assertEquals(validateTextLayout(text), 2);
  for (const columnUnits of [2, 4, 8]) {
    const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene(text))), { columnUnits, rowUnits: 10 });
    const base = frame.cells[2]![Math.round(60 / columnUnits)]!;
    const mark = frame.cells[2]![Math.round(20 / columnUnits) - 1]!;
    assertEquals(base.char, ")");
    assertEquals(mark.char, "\u00a0\u0333");
    assertEquals(base.href, label.href);
    assertEquals(mark.href, label.href);
    assert(base.bold && base.italic && mark.bold && mark.italic);
    assertEquals(JSON.stringify(text), original);
  }
});

Deno.test("detached marks occupy measured ink, preserving visible clipped ink instead of an empty advance", () => {
  const text = separated();
  text.math = { rowUnits: 8 };
  const mark = text.layout!.glyphs[0]!.fragments![1]!;
  mark.ink = { x: 16, y: 39, width: 8, height: 5 };
  text.clip = {
    kind: "path",
    rule: "nonzero",
    contours: [[{ x: 20, y: 5 }, { x: 90, y: 5 }, { x: 90, y: 60 }, { x: 20, y: 60 }]],
  };
  const saved = JSON.stringify(scene(text));
  for (const options of [undefined, { columnUnits: 2, rowUnits: 4 }, { columnUnits: 8, rowUnits: 8 }]) {
    const frame = renderMermaidNativeFrame(JSON.parse(saved), options);
    const columnUnits = options?.columnUnits ?? 2, rowUnits = options?.rowUnits ?? 2.5;
    const cell = frame.cells[Math.floor(41.5 / rowUnits)]![Math.floor(20 / columnUnits)]!;
    assertEquals(cell.char, "\u00a0\u0333");
    assertEquals(cell.foreground, "red");
    assertEquals(cell.href, label.href);
    assert(cell.bold && cell.italic);
    assertEquals(frame.cells[Math.round(20 / rowUnits)]![Math.round(20 / columnUnits) - 1]!.char, " ");
    assertEquals(frame.cells[Math.round(20 / rowUnits)]![Math.round(60 / columnUnits)]!.char, ")");
    assertEquals(JSON.stringify(scene(text)), saved);
  }
  text.clip.contours[0]![0]!.x = 22;
  text.clip.contours[0]![3]!.x = 22;
  const clipped = renderMermaidNativeFrame(scene(text), { columnUnits: 2, rowUnits: 4 });
  assertEquals(clipped.cells[10]![11]!.char, mark.rendered);
  assertEquals(clipped.cells[10]![10]!.char, " ");
  // A genuinely clipped ink box must stay invisible; its printable carrier
  // is not permission to bypass the viewport or place a mark in a free cell.
  mark.ink.x = 4;
  assert(!renderMermaidNativeFrame(scene(text)).cells.flat().some((cell) => cell.char === mark.rendered));
});

Deno.test("detached ink boxes reject malformed payloads and cannot reposition ordinary source characters", () => {
  for (
    const ink of [
      null,
      {},
      { x: 1, y: 1, width: 0, height: 1 },
      { x: NaN, y: 1, width: 1, height: 1 },
      {
        x: 1,
        y: Infinity,
        width: 1,
        height: 1,
      },
      { x: 1, y: 1, width: 1, height: -1 },
      { x: 1e308, y: 1, width: 1e308, height: 1 },
    ]
  ) {
    const text = separated();
    Object.assign(text.layout!.glyphs[0]!.fragments![1]!, { ink });
    assertThrows(() => renderMermaidNativeFrame(scene(text)), RangeError);
  }
  for (const changed of [{ rendered: "A" }, { columnOffset: undefined }, { rendered: "\u00a0A" }]) {
    const text = separated();
    Object.assign(text.layout!.glyphs[0]!.fragments![1]!, { ink: { x: 1, y: 1, width: 1, height: 1 }, ...changed });
    assertThrows(() => renderMermaidNativeFrame(scene(text)), RangeError);
  }
});

Deno.test("ink density planning validates clip cycles before walking bounds or allocating", () => {
  const text = separated();
  text.layout!.glyphs[0]!.fragments![1]!.ink = { x: 16, y: 39, width: 8, height: 5 };
  const clip = { kind: "intersection" as const, children: [] as NonNullable<MermaidSceneText["clip"]>[] };
  clip.children.push(clip);
  text.clip = clip;
  assertThrows(() => renderMermaidNativeFrame(scene(text)), RangeError, "tree budget");
  const tooThin = separated();
  tooThin.layout!.glyphs[0]!.fragments![1]!.ink = { x: 20, y: 30, width: Number.MIN_VALUE, height: 5 };
  assertThrows(() => renderMermaidNativeFrame(scene(tooThin)), RangeError);
});

Deno.test("measured text fragments reject malformed geometry, controls, multiple graphemes and work before allocation", () => {
  for (
    const fragments of [
      [],
      null,
      1,
      [{ rendered: "\x1b", x: 1, y: 1 }],
      [{ rendered: "AB", x: 1, y: 1 }],
      [{ rendered: "", x: 1, y: 1 }],
      [{ rendered: `e${"\u0301".repeat(512)}`, x: 1, y: 1 }],
      [{ rendered: "A", x: NaN, y: 1 }],
      [{ rendered: "A", x: 1, y: Infinity }],
      [{ rendered: "A", x: 1, y: 1, columnOffset: 2 }],
      Array.from({ length: 8193 }, () => ({ rendered: "A", x: 1, y: 1 })),
    ]
  ) {
    const text = separated();
    Object.assign(text.layout!.glyphs[0]!, { fragments });
    assertThrows(() => renderMermaidNativeFrame(scene(text)), RangeError);
  }
  const conflict = separated();
  Object.assign(conflict.layout!.glyphs[0]!, { rendered: "A" });
  assertThrows(() => validateTextLayout(conflict), RangeError);
  const anchor = separated();
  Object.assign(anchor.layout!, { anchor: "arbitrary" });
  assertThrows(() => validateTextLayout(anchor), RangeError);
});

Deno.test("fragment ink shares the aggregate rendered payload budget independently of source size", () => {
  const text = separated();
  Object.assign(text.layout!.glyphs[0]!, {
    fragments: [{ rendered: `e${"\u0301".repeat(511)}`, x: 20, y: 20 }],
  });
  assertThrows(
    () => renderMermaidNativeFrame({ ...scene(text), items: Array.from({ length: 129 }, () => text) }),
    RangeError,
    "character budget",
  );
});

Deno.test("fragment work validation precedes rendered payload traversal", () => {
  let reads = 0;
  const text = separated();
  Object.assign(text, { text: "AB" });
  Object.assign(text.layout!, {
    glyphs: [
      {
        start: 0,
        end: 1,
        x: 20,
        y: 20,
        fragments: Array.from({ length: 8192 }, () => ({ rendered: "A", x: 20, y: 20 })),
      },
      {
        start: 1,
        end: 2,
        x: 30,
        y: 20,
        fragments: [{
          get rendered() {
            reads++;
            throw new Error("Over-budget payload was visited before validation");
          },
          x: 30,
          y: 20,
        }],
      },
    ],
  });
  assertThrows(() => renderMermaidNativeFrame(scene(text)), RangeError, "glyph budget");
  assertEquals(reads, 0);
});

Deno.test("automatic density retains nonadjacent visual glyphs and displaced mark carriers", () => {
  const text: MermaidSceneText = {
    ...label,
    text: "א(̲ב)̳",
    layout: {
      columnUnits: 14.4140625,
      sequence: 0,
      glyphs: [
        { start: 0, end: 1, x: 70.40625, y: 53.5 },
        { start: 1, end: 3, x: 56.0078125, y: 53.5, rendered: ")̲" },
        { start: 3, end: 4, x: 41.6015625, y: 53.5 },
        {
          start: 4,
          end: 6,
          x: 27.203125,
          y: 53.5,
          fragments: [
            { rendered: "(", x: 27.203125, y: 53.5 },
            { rendered: "\u00a0̳", x: 77.609375, y: 53.5, columnOffset: -1 },
          ],
        },
      ],
    },
  };
  const frame = renderMermaidNativeFrame(scene(text));
  for (const char of ["א", ")̲", "ב", "(", "\u00a0̳"]) {
    assertEquals(frame.cells.flat().filter((cell) => cell.char === char).length, 1);
  }
  assert(!frame.diagnostics.some((message) => message.includes("overlap")));
  const coarse = renderMermaidNativeFrame(scene(text), { columnUnits: 9, rowUnits: 18 });
  assert(coarse.diagnostics.includes("Explicit native density may merge measured SVG text."));
});

Deno.test("visual density checks every run in a label but does not merge independent labels", () => {
  const run = (text: string, x: number, sequence: number): MermaidSceneText => ({
    ...label,
    text,
    layout: { columnUnits: 8, sequence, glyphs: [{ start: 0, end: 1, x, y: 20 }] },
  });
  const first = run("A", 20, 0), middle = run("B", 60, 0), last = run("C", 21, 0);
  const result = measuredTextDensity([first, middle, last], 8, 16, true, true);
  assert(result.columnUnits < 8 && !result.merged);
  const independent = measuredTextDensity([first, middle, run("C", 21, 1)], 8, 16, true, true);
  assertEquals(independent, { columnUnits: 8, rowUnits: 16, merged: false });
});

Deno.test("visual density bounds aggregate glyph work before sorting label positions", () => {
  const text: MermaidSceneText = {
    ...label,
    text: "A".repeat(8192),
    layout: {
      columnUnits: 8,
      glyphs: Array.from({ length: 8192 }, (_, index) => ({ start: index, end: index + 1, x: index * 8, y: 20 })),
    },
  };
  assertThrows(
    () => measuredTextDensity(Array.from({ length: 9 }, () => text), 8, 16, true, true),
    RangeError,
    "glyph budget",
  );
});

Deno.test("mirrored glyph ink preserves logical text and survives JSON native transport", () => {
  const text: MermaidSceneText = {
    ...label,
    text: ")",
    renderedText: "(",
    layout: undefined,
    x: 10,
    y: 10,
    width: 8,
    height: 16,
  };
  const logical = JSON.stringify(text);
  const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene(text))), { columnUnits: 2, rowUnits: 5 });
  assertEquals(frame.cells[2]![5]!.char, "(");
  assertEquals(JSON.stringify(text), logical);
  assertEquals(frame.cells[2]![5]!.href, label.href);
});

Deno.test("SVG per-glyph mirror paint is independent of logical UTF-16 boundaries", () => {
  const text: MermaidSceneText = {
    ...label,
    text: ")😀",
    layout: {
      columnUnits: 8,
      glyphs: [
        { start: 0, end: 1, x: 20, y: 20, rendered: "(" },
        { start: 1, end: 3, x: 30, y: 20 },
      ],
    },
  };
  assertEquals(validateTextLayout(text), 2);
  const original = JSON.stringify(text);
  const frame = renderMermaidNativeFrame(scene(text), { columnUnits: 2, rowUnits: 5 });
  assertEquals(frame.cells[4]![10]!.char, "(");
  assertEquals(JSON.stringify(text), original);
});

Deno.test("rendered glyph overrides reject controls, extra graphemes and excessive payloads before paint", () => {
  for (const renderedText of ["\x1b[31mX", "AB", "", "x".repeat(65_537), 12]) {
    assertThrows(
      () =>
        renderMermaidNativeFrame(
          scene({ ...label, text: "A", layout: undefined, renderedText: renderedText as string }),
        ),
      RangeError,
    );
  }
  for (const rendered of ["\x1b", "AB", "", "x".repeat(513), 12]) {
    assertThrows(
      () =>
        validateTextLayout({
          ...label,
          text: "A",
          layout: { columnUnits: 8, glyphs: [{ start: 0, end: 1, x: 20, y: 20, rendered: rendered as string }] },
        }),
      RangeError,
    );
  }
});

Deno.test("aggregate rendered ink is bounded independently of logical source and visible cell count", () => {
  const text: MermaidSceneText = { ...label, text: "A", layout: undefined, renderedText: `a${"\u0301".repeat(511)}` };
  assertThrows(
    () => renderMermaidNativeFrame({ ...scene(text), items: Array.from({ length: 129 }, () => text) }),
    RangeError,
    "character budget",
  );
  const glyph: MermaidSceneText = {
    ...label,
    text: "A",
    renderedText: undefined,
    layout: { columnUnits: 8, glyphs: [{ start: 0, end: 1, x: 20, y: 20, rendered: text.renderedText }] },
  };
  assertThrows(
    () => renderMermaidNativeFrame({ ...scene(glyph), items: Array.from({ length: 129 }, () => glyph) }),
    RangeError,
    "character budget",
  );
});

Deno.test("measured rotated SVG text retains direction, Unicode, styles and links without horizontal density inflation", () => {
  assertEquals(validateTextLayout(label), 4);
  const original = JSON.stringify(label);
  const frame = renderMermaidNativeFrame(scene(label), { columnUnits: 2, rowUnits: 5 });
  assertEquals(frame.columns, 51);
  assertEquals(frame.rows, 21);
  assertEquals(frame.cells[12]![10]!.char, "A");
  assertEquals(frame.cells[10]![10]!.char, "B");
  const emoji = frame.cells[7]![10]!;
  assertEquals(emoji.char, "😀");
  assert(emoji.bold && emoji.italic && emoji.href === label.href);
  assertEquals(frame.cells[7]![11]!.char, "");
  assertEquals(frame.cells[4]![10]!.char, "é");
  assertEquals(
    renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene(label))), { columnUnits: 2, rowUnits: 5 }),
    frame,
  );
  assertEquals(JSON.stringify(label), original);
});

Deno.test("automatic measured density separates vertical and diagonal glyphs without multiplying horizontal columns", () => {
  const tight = {
    ...label,
    layout: { ...label.layout!, glyphs: label.layout!.glyphs.map((g, i) => ({ ...g, y: 60 - i * 6 })) },
  };
  const vertical = measuredTextDensity([tight], 8, 16, true, true);
  assertEquals(vertical.columnUnits, 8);
  assert(vertical.rowUnits <= 10 && !vertical.merged);
  const frame = renderMermaidNativeFrame(scene(label));
  assertEquals(frame.columns, 14);
  assertEquals(frame.cells.flat().filter((cell) => ["A", "B", "😀", "é"].includes(cell.char)).length, 4);
  const diagonal = {
    ...label,
    layout: { ...label.layout!, glyphs: label.layout!.glyphs.map((g, i) => ({ ...g, x: 10 + i * 6, y: 10 + i * 6 })) },
  };
  const result = measuredTextDensity([diagonal], 8, 16, true, true);
  assert(!result.merged && result.rowUnits < 16);
  const coarse = renderMermaidNativeFrame(scene(label), { columnUnits: 8, rowUnits: 100 });
  assert(coarse.diagnostics.includes("Explicit native density may merge measured SVG text."));
});

Deno.test("measured glyph clipping rejects whole wide glyphs and carries interactions only on visible paint", () => {
  const text = {
    ...label,
    interaction: { id: "axis", title: "Axis detail" },
    clip: {
      kind: "path" as const,
      rule: "nonzero" as const,
      contours: [[{ x: 0, y: 0 }, { x: 21, y: 0 }, { x: 21, y: 100 }, { x: 0, y: 100 }]],
    },
  };
  const frame = renderMermaidNativeFrame(scene(text), { columnUnits: 2, rowUnits: 5 });
  assertEquals(frame.cells[7]![10]!.char, " ");
  assertEquals(frame.cells[7]![11]!.char, " ");
  assertEquals(frame.cells[12]![10]!.interaction?.id, "axis");
});

Deno.test("density retains adjacent SVG glyphs across nested style-run boundaries", () => {
  const first: MermaidSceneText = {
    ...label,
    text: "A",
    layout: { columnUnits: 8, sequence: 0, glyphs: [{ start: 0, end: 1, x: 20, y: 20 }] },
  };
  const second: MermaidSceneText = {
    ...first,
    text: "B",
    color: "blue",
    layout: { ...first.layout!, glyphs: [{ start: 0, end: 1, x: 20, y: 25 }] },
  };
  const frame = renderMermaidNativeFrame({ ...scene(first), items: [first, second] });
  assertEquals(frame.cells.flat().filter((cell) => cell.char === "A" || cell.char === "B").length, 2);
  assertThrows(() => validateTextLayout({ ...first, layout: { ...first.layout!, sequence: NaN } }), RangeError);
});

Deno.test("supported horizontal measured SVG spacing is not reported as an unsupported native feature", () => {
  const horizontal: MermaidSceneText = {
    ...label,
    text: "AB",
    layout: { columnUnits: 8, glyphs: [{ start: 0, end: 1, x: 20, y: 20 }, { start: 1, end: 2, x: 44, y: 20 }] },
  };
  const frame = renderMermaidNativeFrame(scene(horizontal), { columnUnits: 4, rowUnits: 10 });
  assertEquals(frame.diagnostics, []);
  assertEquals(frame.cells[2]![5]!.char, "A");
  assertEquals(frame.cells[2]![11]!.char, "B");
});

Deno.test("intentionally clipped text outside the frame does not report a native bounds failure", () => {
  const clip = {
    kind: "path" as const,
    rule: "nonzero" as const,
    contours: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]],
  };
  const plain: MermaidSceneText = {
    ...label,
    text: "Clipped label",
    x: 90,
    y: 20,
    width: 104,
    height: 16,
    layout: undefined,
    clip,
  };
  const measured: MermaidSceneText = {
    ...label,
    clip,
    layout: { ...label.layout!, glyphs: label.layout!.glyphs.map((glyph) => ({ ...glyph, x: glyph.x + 100 })) },
  };
  for (const text of [plain, measured]) {
    assertEquals(renderMermaidNativeFrame(scene(text), { columnUnits: 8, rowUnits: 8 }).diagnostics, []);
    assert(
      renderMermaidNativeFrame(scene({ ...text, clip: undefined }), { columnUnits: 8, rowUnits: 8 })
        .diagnostics.includes("Native text extends beyond measured diagram bounds."),
    );
  }
});

Deno.test("portable SVG text validates complete graphemes, finite coordinates and unchanged scene/work limits", () => {
  for (
    const glyphs of [
      [],
      [{ start: 0, end: 3, x: 1, y: 1 }],
      [{ start: 1, end: 6, x: 1, y: 1 }],
      label.layout!.glyphs.map((g, i) => ({ ...g, x: i ? g.x : NaN })),
      Array(8193).fill(label.layout!.glyphs[0]),
    ]
  ) {
    assertThrows(() => renderMermaidNativeFrame(scene({ ...label, layout: { columnUnits: 8, glyphs } })), RangeError);
  }
  for (const columnUnits of [0, NaN, Infinity, -1]) {
    assertThrows(() => validateTextLayout({ ...label, layout: { ...label.layout!, columnUnits } }), RangeError);
  }
  assertThrows(
    () => renderMermaidNativeFrame({ ...scene(label), items: Array(16385).fill(label) }),
    RangeError,
    "character budget",
  );
  assertThrows(() => renderMermaidNativeFrame(scene(label), { maxCells: 5 }), RangeError, "cell budget");
  assertEquals(nativeDiagramText("A\nB\x1bC"), "A B�C");
});
