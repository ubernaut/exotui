// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects, assertStringIncludes, assertThrows } from "./deps.ts";
import { type MermaidStandardDiagram, prepareMermaidMarkdown } from "../mod.mermaid.ts";
import { MarkdownSurface, parseMarkdown, renderMarkdown, TITLE_HEADING_FONTS } from "../mod.document.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";

function diagram(source: string): MermaidStandardDiagram {
  return {
    source,
    diagramType: "sequence",
    version: "fixture",
    svg: "<svg/>",
    scene: {
      width: 300,
      height: 100,
      title: "Sequence",
      description: "",
      diagnostics: [],
      items: [{
        kind: "text",
        text: "Hello sequence 世界",
        x: 10,
        y: 20,
        width: 220,
        height: 16,
        color: "rgb(255, 200, 50)",
        fontWeight: "700",
        fontStyle: "italic",
        href: "product:sequence",
      }],
    },
  };
}
const source = "# Stack\n\n```mermaid\nsequenceDiagram\nAlice->>Bob: Hello\n```\n\n## Details";

Deno.test("prepared native translucent paint respects the host backdrop instead of discarding alpha", async () => {
  const compile = (code: string) => {
    const value = diagram(code);
    const item = value.scene!.items[0]!;
    if (item.kind === "text") item.color = "rgba(255,0,0,.5)";
    return Promise.resolve(value);
  };
  const prepared = await prepareMermaidMarkdown(source, { compile }, { native: { background: "rgb(20,40,60)" } });
  const color = prepared.diagrams[0]!.native.cells.flat().find((cell) => cell.char === "H")!.foreground;
  assertEquals(color, "rgb(138, 20, 30)");
  assertEquals(prepared.diagnostics, []);
  const fallback = await prepareMermaidMarkdown(source, { compile });
  const spans = renderMarkdown(fallback.document, { ...fallback.render, width: 80 }).flatMap((line) => line.segments);
  assertEquals(spans.find((span) => span.text === "H")!.style!.foreground, [128, 0, 0]);
  assert(fallback.diagnostics.some((message) => message.includes("set native.background")));
});

Deno.test("full Mermaid Markdown prepares unique fences once and preserves native styles and links", async () => {
  let calls = 0;
  const prepared = await prepareMermaidMarkdown(source + "\n\n```mermaid\nsequenceDiagram\nAlice->>Bob: Hello\n```", {
    compile: (code) => {
      calls++;
      return Promise.resolve(diagram(code));
    },
  });
  assertEquals(calls, 1);
  assertEquals(prepared.diagrams.length, 1);
  const lines = renderMarkdown(prepared.document, { ...prepared.render, width: 80 });
  assertStringIncludes(lines.map((line) => line.text).join("\n"), "Hello sequence 世界");
  assert(!lines.some((line) => line.text.includes("Alice->>Bob")));
  const span = lines.flatMap((line) => line.segments).find((span) => span.text === "H")!;
  assertEquals(span.href, "product:sequence");
  assertEquals(span.style?.foreground, [255, 200, 50]);
  assertEquals(span.style?.bold, true);
  assertEquals(span.style?.italic, true);
  assertEquals(prepared.diagnostics, []);
});

Deno.test("prepared full diagrams mount in the existing native Markdown component and keep scrolling rows", async () => {
  let offset = 0;
  const opened: string[] = [];
  const prepared = await prepareMermaidMarkdown(source, { compile: (code) => Promise.resolve(diagram(code)) }, {
    offset: () => offset,
    render: { headingFonts: TITLE_HEADING_FONTS, headingArt: "title", wrapHeadingArt: false },
  });
  const surface = new MarkdownSurface({ source, render: prepared.render, onLink: (href) => opened.push(href) });
  try {
    await surface.ready;
    for (const [width, height, scroll] of [[80, 12, 0], [80, 6, 3], [80, 10, 1], [12, 5, 0], [80, 12, 0]] as const) {
      surface.component.controller.scrollTo(scroll, width, height);
      const cells = surface.render(width, height).map(stripStyles);
      const expected = surface.component.controller.visible(width, height).map((line) =>
        line.text + " ".repeat(width - textWidth(line.text))
      );
      while (expected.length < height) expected.push(" ".repeat(width));
      assertEquals(cells, expected, `native diagram frame at ${width}x${height}, offset ${scroll}`);
      await Promise.resolve();
      await Promise.resolve();
    }
    const visible = surface.component.controller.visible(80, 12);
    const row = visible.findIndex((line) => line.text.includes("Hello sequence"));
    const column = textWidth(visible[row]!.text.split("Hello sequence")[0]!);
    surface.press(column, row);
    assertEquals(opened, ["product:sequence"]);
    surface.render(12, 20);
    const before = surface.component.controller.text(12);
    offset = 15;
    surface.component.controller.invalidate();
    const after = surface.render(12, 20).map(stripStyles).join("\n");
    assert(after !== before);
    assertStringIncludes(after, "世界");
    assert(surface.component.controller.render(12).every((line) => textWidth(line.text) <= 12));
  } finally {
    surface.dispose();
  }
});

Deno.test("full Markdown preparation forwards cancellation and rejects missing scenes or stale diagrams", async () => {
  const abort = new AbortController();
  abort.abort();
  await assertRejects(
    () =>
      prepareMermaidMarkdown(source, { compile: (code) => Promise.resolve(diagram(code)) }, {
        compile: { signal: abort.signal },
      }),
    DOMException,
  );
  await assertRejects(
    () =>
      prepareMermaidMarkdown(source, { compile: (code) => Promise.resolve({ ...diagram(code), scene: undefined }) }),
    Error,
    "measured native scene",
  );
  const prepared = await prepareMermaidMarkdown(source, { compile: (code) => Promise.resolve(diagram(code)) });
  assertThrows(
    () => renderMarkdown(parseMarkdown('```mermaid\npie\n"A":1\n```'), { ...prepared.render, width: 40 }),
    Error,
    "source changed",
  );
  await assertRejects(
    () => prepareMermaidMarkdown("x".repeat(1_000_001), { compile: (code) => Promise.resolve(diagram(code)) }),
    RangeError,
  );
});

Deno.test("prepared diagram clipping never splits wide glyphs or interprets terminal controls", () => {
  const document = parseMarkdown("```mermaid\nfixture\n```");
  const frame = { columns: 4, cells: [[{ char: "界" }, { char: "" }, { char: "A" }, { char: "B" }]], offset: 1 };
  const lines = renderMarkdown(document, { width: 2, diagram: () => frame });
  assertEquals(lines[0]!.text, " A");
  frame.offset = 0;
  assertEquals(renderMarkdown(document, { width: 1, diagram: () => frame })[0]!.text, " ");
  frame.cells[0]![0]!.char = "\x1b[31m";
  assertThrows(() => renderMarkdown(document, { width: 4, diagram: () => frame }), TypeError, "control sequences");
});
