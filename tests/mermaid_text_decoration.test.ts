// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { nativeTextDecorations, renderedTextDecorationPaint } from "../src/content/mermaid_text_decoration.ts";
import {
  MermaidFlexMarkdownSurface,
  MermaidMarkdownCache,
  type MermaidSceneText,
  type MermaidStandardDiagram,
  prepareMermaidMarkdown,
  renderMermaidNativeFrame,
} from "../mod.mermaid.ts";
import { MarkdownSurface, type renderMarkdown } from "../mod.document.ts";
import { createAnsiStyle } from "../src/theme.ts";
import { parseAnsiCell } from "../src/web/cell_canvas_sink.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";

const escape = String.fromCharCode(27);
const paintedGlyphs = (rows: readonly string[], labels: string) =>
  rows.join("\n").matchAll(new RegExp(`${escape}\\[[0-9;:]*m([${labels}])${escape}\\[0m`, "g"));

const decoration = {
  line: "underline" as const,
  color: "red",
  style: "solid",
  thickness: "auto",
  offset: "auto",
  position: "auto",
  skipInk: "auto",
};
const text: MermaidSceneText = {
  kind: "text",
  text: "A界",
  x: 8,
  y: 8,
  width: 24,
  height: 16,
  color: "red",
  fontWeight: "bold",
  fontStyle: "italic",
  decorations: [decoration],
};
const scene = (item: MermaidSceneText) => ({
  width: 100,
  height: 100,
  title: "",
  description: "",
  diagnostics: [],
  items: [item],
});

Deno.test("HTML decoration paint uses captured CSS ink without inheriting inactive SVG fill/stroke", () => {
  const source = {
    ...decoration,
    color: "white",
    cssColor: "black",
    stroke: "mediumpurple",
    strokeWidth: "1px",
    fillOpacity: "0.5",
    strokeOpacity: "0.75",
    paintOrder: "stroke fill",
  };
  const before = JSON.stringify(source);
  assertEquals(renderedTextDecorationPaint(source, false), { ...decoration, color: "black" });
  assertEquals(renderedTextDecorationPaint(source, true), source);
  assertEquals(JSON.stringify(source), before);
});

Deno.test("mixed SVG/HTML decorating targets retain independent paint regardless of projection order", () => {
  const source = { ...decoration, color: "red", cssColor: "lime", stroke: "none" };
  for (const order of [[true, false], [false, true]]) {
    const first = renderedTextDecorationPaint(source, order[0]!);
    const before = JSON.stringify(first);
    renderedTextDecorationPaint(source, order[1]!);
    assertEquals(JSON.stringify(first), before);
    assertEquals(renderedTextDecorationPaint(source, true).color, "red");
    assertEquals(renderedTextDecorationPaint(source, false).color, "lime");
    assertEquals(renderedTextDecorationPaint(source, false).stroke, undefined);
  }
});

Deno.test("rendered CSS decoration projection preserves source line/style/geometry and ordinary descriptors", () => {
  for (const line of ["underline", "line-through", "overline"] as const) {
    const source = {
      ...decoration,
      line,
      style: "wavy",
      thickness: "3px",
      offset: "4px",
      position: "under",
      skipInk: "none",
      cssColor: "blue",
    };
    const { cssColor, ...expected } = source;
    assertEquals(renderedTextDecorationPaint(source, false), { ...expected, color: cssColor });
  }
  assertEquals(renderedTextDecorationPaint(decoration, false), decoration);
});

Deno.test("native conventional underline and strike preserve color aliases, JSON and text instead of decorative glyphs", () => {
  const messages = new Set<string>();
  assertEquals(nativeTextDecorations(text, messages), { underline: true, strikethrough: false });
  assertEquals(messages.size, 0);
  const both = {
    ...text,
    decorations: [decoration, { ...decoration, line: "line-through" as const, color: "#ff0000" }],
  };
  assertEquals(nativeTextDecorations(both, messages), { underline: true, strikethrough: true });
  assertEquals(messages.size, 0);
  const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene(both))));
  const first = frame.cells.flat().find((cell) => cell.char === "A")!;
  assert(first.underline && first.strikethrough && first.bold && first.italic);
  assertEquals(frame.diagnostics, []);
  assertEquals(frame.cells.flat().filter((cell) => cell.char === "界").length, 1);
});

Deno.test("positioned and stretched text preserve decorations through their distinct native glyph paths", () => {
  const positioned: MermaidSceneText = {
    ...text,
    layout: { columnUnits: 8, glyphs: [{ start: 0, end: 1, x: 20, y: 20 }, { start: 1, end: 2, x: 20, y: 40 }] },
  };
  assert(
    renderMermaidNativeFrame(scene(positioned)).cells.flat().filter((cell) => cell.char === "A" || cell.char === "界")
      .every((cell) => cell.underline),
  );
  const stretched: MermaidSceneText = {
    ...text,
    text: "(",
    width: 8,
    height: 40,
    math: { rowUnits: 8, stretch: "vertical" },
  };
  const frame = renderMermaidNativeFrame(scene(stretched));
  assert(frame.cells.flat().some((cell) => cell.underline));
});

Deno.test("native decoration descriptors stay intact and unsupported paint is diagnosed rather than silently declared faithful", () => {
  const examples = [
    { ...decoration, line: "line-through" as const, style: "wavy" },
    { ...decoration, line: "line-through" as const, color: "blue" },
    { ...decoration, line: "overline" as const, color: "blue" },
    { ...decoration, thickness: "3px" },
    { ...decoration, offset: "4px" },
    { ...decoration, position: "under" },
    { ...decoration, skipInk: "none" },
    { ...decoration, stroke: "blue" },
    { ...decoration, fillOpacity: "0.5" },
  ];
  for (const descriptor of examples) {
    const item = { ...text, decorations: [descriptor] };
    const original = JSON.stringify(item), messages = new Set<string>();
    nativeTextDecorations(item, messages);
    assertEquals(messages.size, 1);
    assertEquals(JSON.stringify(item), original);
  }
  assertThrows(
    () => nativeTextDecorations({ ...text, decorations: Array(33).fill(decoration) }, new Set()),
    RangeError,
  );
  assertThrows(
    () => nativeTextDecorations({ ...text, decorations: [{ ...decoration, style: "wrong" }] }, new Set()),
    TypeError,
  );
  assertThrows(
    () => nativeTextDecorations({ ...text, decorations: [{ ...decoration, color: "x".repeat(257) }] }, new Set()),
    TypeError,
  );
  assertEquals(nativeTextDecorations({ ...text, decorations: undefined }, new Set()), {
    underline: false,
    strikethrough: false,
  });
});

Deno.test("native underline ink and all five styles plus same-ink solid overline survive JSON without adding copied glyphs", () => {
  for (const style of ["solid", "double", "wavy", "dotted", "dashed"]) {
    const item = {
      ...text,
      decorations: [{ ...decoration, color: "lime", style }, { ...decoration, line: "overline" as const }],
    };
    const messages = new Set<string>(), flags = nativeTextDecorations(item, messages);
    assertEquals(messages.size, 0);
    assertEquals(flags.underlineColor, "lime");
    assertEquals(flags.underlineStyle ?? "solid", style);
    assert(flags.underline && flags.overline);
    const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene(item))));
    assertEquals(frame.diagnostics, []);
    const glyphs = frame.cells.flat().filter((cell) => cell.char === "A" || cell.char === "界");
    assertEquals(glyphs.length, 2);
    assert(
      glyphs.every((cell) =>
        cell.underline && cell.overline && cell.underlineColor === "lime" && (cell.underlineStyle ?? "solid") === style
      ),
    );
  }
  const messages = new Set<string>();
  nativeTextDecorations(
    { ...text, decorations: [decoration, { ...decoration, color: "lime", style: "wavy" }] },
    messages,
  );
  assertEquals(messages.size, 1, "Different simultaneous underline layers cannot be silently collapsed.");
});

Deno.test("foreground glyph overlays do not borrow decorations from text painted beneath them", () => {
  const value = scene(text);
  const frame = renderMermaidNativeFrame({
    ...value,
    items: [...value.items, {
      kind: "path",
      points: [{ x: 0, y: 8 }, { x: 80, y: 8 }],
      closed: false,
      paint: { fill: "none", stroke: "blue", strokeWidth: 1, dash: [], opacity: 1 },
    }],
  }, { columnUnits: 8, rowUnits: 16 });
  const overwritten = frame.cells.flat().filter((cell) => cell.foreground === "blue");
  assert(overwritten.length > 0);
  assert(overwritten.every((cell) => !cell.underline && !cell.strikethrough && !cell.bold && !cell.italic));
});

Deno.test("independent underline ink in element opacity and composite/filter ranges remains explicitly diagnosed", () => {
  const item = { ...text, decorations: [{ ...decoration, color: "lime" }] };
  assertEquals(renderMermaidNativeFrame(scene({ ...item, opacity: 0.5 })).diagnostics.length, 1);
  const value = scene(item);
  assertEquals(
    renderMermaidNativeFrame({
      ...value,
      composites: [{ start: 0, end: 1, depth: 0, opacity: 0.5, blendMode: "normal" }],
    }).diagnostics.length,
    1,
  );
});

Deno.test("independent underline palettes survive disposed compilation, mounted Markdown/flex, narrow reflow and plain copy", async () => {
  const source = "```mermaid\nextended\n```", styles = ["solid", "double", "wavy", "dotted", "dashed"] as const;
  const diagram: MermaidStandardDiagram = {
    ...decoratedDiagram("extended"),
    scene: {
      ...scene(text),
      width: 128,
      height: 80,
      items: [
        ...styles.map((style, index) => ({
          ...text,
          text: String.fromCharCode(65 + index),
          x: 8 + index * 16,
          y: 64,
          width: 8,
          color: "blue",
          fontWeight: "400",
          fontStyle: "normal",
          decorations: [{ ...decoration, color: "lime", style }],
        })),
        {
          ...text,
          text: "F",
          x: 88,
          y: 64,
          width: 8,
          color: "blue",
          fontWeight: "400",
          fontStyle: "normal",
          decorations: [{ ...decoration, color: "blue", line: "overline" as const }],
        },
      ],
    },
  };
  let disposed = false, calls = 0;
  const compile = (code: string) => {
    assert(!disposed);
    calls++;
    return Promise.resolve({ ...JSON.parse(JSON.stringify(diagram)), source: code });
  };
  const prepared = await prepareMermaidMarkdown(source, { compile }, { native: { columnUnits: 8, rowUnits: 16 } });
  assertEquals(prepared.diagnostics, []);
  disposed = true;
  const markdown = new MarkdownSurface({ source, render: prepared.render });
  const check = (rows: readonly string[]) => {
    let count = 0;
    for (const match of paintedGlyphs(rows, "A-F")) {
      const value = parseAnsiCell(match[0]), index = match[1]!.charCodeAt(0) - 65;
      assertEquals(value.foreground, "rgb(0,0,255)");
      if (index === 5) assert(value.overline && !value.underline);
      else {
        assert(value.underline);
        assertEquals(value.underlineColor, "rgb(0,255,0)");
        assertEquals(value.underlineStyle ?? "solid", styles[index]);
      }
      count++;
    }
    return count;
  };
  try {
    await markdown.ready;
    assertEquals(check(markdown.render(80, 12)), 6);
    markdown.render(8, 12);
    assertEquals(check(markdown.render(80, 12)), 6);
    assert(!markdown.component.controller.text(80).includes("\x1b"));
    assertEquals(calls, 1);
  } finally {
    markdown.dispose();
  }
  disposed = false;
  const cache = new MermaidMarkdownCache({ compile });
  const flex = new MermaidFlexMarkdownSurface(cache, {
    showFirstSectionHeader: false,
    settings: { native: { columnUnits: 8, rowUnits: 16 } },
    sections: [{ id: "extended", label: "", rows: [{ panels: [{ id: "diagram", source }] }] }],
  });
  try {
    for (const width of [80, 25, 80]) {
      await flex.settled(width);
      assertEquals(check(flex.render(width, 12)), 6);
    }
    assert(!flex.controller.panelController("diagram")!.text(80).includes("\x1b"));
  } finally {
    flex.dispose();
    cache.dispose();
  }
});

function decoratedDiagram(source: string): MermaidStandardDiagram {
  return {
    source,
    diagramType: "fixture",
    version: "fixture",
    svg: "<svg/>",
    scene: {
      width: 128,
      height: 80,
      title: "",
      description: "",
      diagnostics: [],
      items: ["U", "P", "S", "界"].map((label, index) => ({
        ...text,
        text: label,
        x: 8 + index * 16,
        y: 64,
        width: label === "界" ? 16 : 8,
        fontWeight: "400",
        fontStyle: "normal",
        decorations: label === "P"
          ? undefined
          : [{ ...decoration, line: label === "S" ? "line-through" : "underline" }],
      })),
    },
  };
}
const decoratedSource = "Before.\n\n```mermaid\ndecorated\n```\n\n" + "After.\n\n".repeat(10);

function checkDecoratedRows(rows: ReturnType<typeof renderMarkdown>, mounted: string[]): number {
  let checked = 0;
  for (const span of rows.flatMap((row) => row.segments)) {
    if (!["U", "P", "S", "界"].includes(span.text)) continue;
    assertEquals(!!span.style?.underline, span.text === "U" || span.text === "界");
    assertEquals(!!span.style?.strikethrough, span.text === "S");
    const encoded = createAnsiStyle(span.style!)(span.text);
    const expected = parseAnsiCell(encoded);
    const candidates = [...paintedGlyphs(mounted, "UPS界")]
      .filter((match) => match[1] === span.text).map((match) => parseAnsiCell(match[0]));
    assert(
      candidates.some((actual) =>
        ["foreground", "bold", "italic", "underline", "underlineStyle", "underlineColor", "overline", "strikethrough"]
          .every((key) => actual[key as keyof typeof actual] === expected[key as keyof typeof expected])
      ),
      "Mounted glyph must retain its diagram typography; the host's independent background is allowed.",
    );
    checked++;
  }
  return checked;
}

Deno.test("decorated Markdown palettes distinguish same-ink plain and marked text through mounted scroll, pan, wide clipping and copy", async () => {
  let offset = 0;
  const prepared = await prepareMermaidMarkdown(decoratedSource, {
    compile: (source) => Promise.resolve(JSON.parse(JSON.stringify(decoratedDiagram(source)))),
  }, {
    native: { columnUnits: 8, rowUnits: 16 },
    offset: () => offset,
  });
  assertEquals(prepared.diagnostics, []);
  const surface = new MarkdownSurface({ source: decoratedSource, render: prepared.render });
  let checked = 0;
  try {
    await surface.ready;
    for (const width of [80, 12, 80]) {
      for (const pan of [0, 1, 8, 0]) {
        offset = pan;
        surface.component.controller.invalidate();
        surface.render(width, 6);
        const target = surface.component.controller.accessibilityTargets(width)[0]!;
        surface.component.controller.scrollTo(target.row, width, 6);
        surface.scroll(1);
        const mounted = surface.render(width, 6);
        checked += checkDecoratedRows(surface.component.controller.visible(width, 6), mounted);
        const copied = surface.component.controller.text(width);
        assert(!copied.includes("\x1b"), "Plain text copy must never contain styling controls.");
        assertEquals(
          mounted.map(stripStyles),
          surface.component.controller.visible(width, 6).map((row) =>
            row.text + " ".repeat(width - textWidth(row.text))
          ),
        );
      }
    }
    assert(checked >= 12, "Reflow/scroll must actually paint decorated glyphs, not just offscreen frames.");
  } finally {
    surface.dispose();
  }
});

Deno.test("decorated flex panels preserve marked and plain glyphs after compiler JSON transport, wheel/reflow and source replacement", async () => {
  let calls = 0;
  const cache = new MermaidMarkdownCache({
    compile: (source) => {
      calls++;
      return Promise.resolve(JSON.parse(JSON.stringify(decoratedDiagram(source))));
    },
  });
  const surface = new MermaidFlexMarkdownSurface(cache, {
    showFirstSectionHeader: false,
    settings: { native: { columnUnits: 8, rowUnits: 16 } },
    sections: [{
      id: "decorated",
      label: "Decorations",
      rows: [{ panels: [{ id: "diagram", source: decoratedSource }] }],
    }],
  });
  let checked = 0;
  try {
    for (const width of [120, 35, 80]) {
      await surface.settled(width);
      surface.render(width, 6);
      const target = surface.controller.accessibilityTargets(width)[0]!;
      surface.controller.scrollTo(target.row, width, 6);
      const beforeWheel = calls;
      surface.scroll(1);
      const mounted = surface.render(width, 6);
      const box = surface.controller.layout(width).panels[0]!;
      const controller = surface.controller.panelController("diagram")!;
      const offset = surface.controller.inspect(width, 6).offset - box.contentRect.row;
      const rows = controller.render(box.contentRect.width).slice(Math.max(0, offset), Math.max(0, offset) + 6);
      checked += checkDecoratedRows(rows, mounted);
      assert(!controller.text(box.contentRect.width).includes("\x1b"));
      assertEquals(calls, beforeWheel, "Wheel painting must reuse the captured scene, not start compiler work.");
    }
    assert(checked >= 12);
    assertEquals(calls, 3, "Each new solved width requests the upstream layout once.");
    surface.controller.setSections([{
      id: "plain-section",
      label: "Plain",
      rows: [{ panels: [{ id: "plain", source: "No diagram now." }] }],
    }]);
    await surface.settled(80);
    assert(!surface.render(80, 6).join("\n").includes("\x1b[4;"), "Removed decorated panels must not leak styles.");
  } finally {
    surface.dispose();
    cache.dispose();
  }
});
