import { assert, assertEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import {
  ASCII_HEADING_FONTS,
  layoutMermaid,
  MarkdownSurface,
  parseMarkdown,
  parseMermaid,
  renderAsciiHeading,
  renderMarkdown,
  renderMermaidCells,
  renderMermaidSvg,
  TITLE_HEADING_FONTS,
} from "../mod.document.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";

Deno.test("ASCII headings have distinct heights, wrap, and preserve Unicode fallback", () => {
  for (const [font, height] of [["standard", 6], ["small", 5], ["micro", 3], ["plain", 1]] as const) {
    assertEquals(renderAsciiHeading("AI", font, 120).length, height);
    assert(renderAsciiHeading("Long model heading", font, 18).every((row) => textWidth(row) <= 18));
  }
  assertEquals(renderAsciiHeading("你好 🐕", "standard", 30), ["你好 🐕"]);
  assert(renderAsciiHeading("你好 🐕", "small", 1).every((row) => textWidth(row) <= 1));
  assertThrows(() => renderAsciiHeading("test", "plain", 0), RangeError);
});

Deno.test("title-only heading art appears once at the start and disappears below its exact fit width", () => {
  const text = "Tsotchke Tech Stack";
  const width = textWidth(renderAsciiHeading(text, "small", 2000)[0]!);
  const document = parseMarkdown(`# ${text}\n\n## Second heading\n\n# Later title`);
  const options = { headingFonts: TITLE_HEADING_FONTS, headingArt: "title", wrapHeadingArt: false } as const;
  for (const columns of [width - 1, width, width + 1]) {
    const lines = renderMarkdown(document, { ...options, width: columns });
    const headingRows = (index: number) =>
      lines.filter((line) => line.blockIndex === index && line.segments.some((span) => span.role === "heading")).map((
        line,
      ) => line.text);
    assertEquals(
      headingRows(0),
      columns < width ? [text] : renderAsciiHeading(text, "small", columns),
    );
    assertEquals(headingRows(1), ["Second heading"]);
    assertEquals(headingRows(2), ["Later title"]);
    assert(lines.every((line) => textWidth(line.text) <= columns));
  }
  // A nested/quoted heading, a subtitle, or a title after a preamble is not a
  // top-of-document banner, even if its configured font is an art font.
  for (const source of ["> # Nested title", "## Opening subtitle", "Preamble.\n\n# Later title"]) {
    const document = parseMarkdown(source);
    const lines = renderMarkdown(document, { ...options, headingFonts: ASCII_HEADING_FONTS, width: 200 });
    for (const [index, block] of document.blocks.entries()) {
      if (block.kind === "heading") {
        assertEquals(
          lines.filter((line) => line.blockIndex === index && line.segments.some((span) => span.role === "heading"))
            .length,
          1,
        );
      }
    }
  }
});

Deno.test("flowchart parser supports compact chains, quoted labels, classes and rejects directives", () => {
  const graph = parseMermaid(
    'flowchart TB; A["Code; evidence"]-->B(Serve)-.->|optional|C{Ready}; classDef core fill:#abc; class A core',
  );
  assertEquals(graph.nodes.map((n) => n.id), ["A", "B", "C"]);
  assertEquals(graph.nodes[0]!.label, "Code; evidence");
  assertEquals(graph.nodes[0]!.className, "core");
  assertEquals(graph.edges[1]!.style, "dotted");
  assertThrows(() => parseMermaid("sequenceDiagram\nA->>B: hello"), SyntaxError);
  assertThrows(() => parseMermaid("flowchart TB\nclick A callback"), SyntaxError);
  assertThrows(() => parseMermaid("flowchart TB\nsubgraph A\nB\nend"), SyntaxError);
  assertThrows(() => parseMermaid("flowchart TB\nA\nclassDef x fill:#12345"), SyntaxError);
});

Deno.test("flowchart directions are deterministic and routes avoid unrelated nodes", () => {
  for (const direction of ["TB", "BT", "LR", "RL"] as const) {
    const graph = parseMermaid(
      `flowchart ${direction}\nA[Input] --> B[Thought]\nA --> C[Action]\nB --> D[Output]\nC --> D`,
    );
    const first = layoutMermaid(graph);
    assertEquals(first, layoutMermaid(graph));
    const a = first.nodes.find((n) => n.id === "A")!, d = first.nodes.find((n) => n.id === "D")!;
    assert(
      direction === "TB" ? a.y < d.y : direction === "BT" ? a.y > d.y : direction === "LR" ? a.x < d.x : a.x > d.x,
    );
    for (const edge of first.edges) {
      for (const point of edge.path.slice(1, -1)) {
        assert(
          !first.nodes.some((n) =>
            point.x >= n.x && point.x < n.x + n.width && point.y >= n.y && point.y < n.y + n.height
          ),
        );
      }
    }
    assertStringIncludes(renderMermaidCells(first).join("\n"), "Input");
    assert(/[▲▶▼◀]/.test(renderMermaidCells(first).join("\n")));
  }
});

Deno.test("flowchart cycles, self loops and responsive ranks stay inside viewport", () => {
  const graph = parseMermaid("flowchart LR\nA[Evidence]-->B[Model]\nB-->A\nA-->A\nA-->C[Serve]\nA-->D[Review]");
  for (const maxColumns of [12, 24, 48, 100]) {
    const layout = layoutMermaid(graph, { maxColumns });
    assert(layout.width <= maxColumns);
    assert(renderMermaidCells(layout).every((row) => textWidth(row) <= maxColumns));
    assert(layout.edges.every((e) => e.path.length > 1));
  }
});

Deno.test("flowchart SVG escapes labels and refuses injected paints and control characters", () => {
  const graph = parseMermaid(
    'flowchart TB\nA["<script>alert(1)</script>"]-->B[Safe]\nclassDef __proto__ fill:#abc\nclass A __proto__',
  );
  const svg = renderMermaidSvg(layoutMermaid(graph), '<img onerror="bad">');
  assert(!svg.includes("<script>"));
  assertStringIncludes(svg, "&lt;script&gt;");
  graph.classes.__proto__ = { fill: '" onload="bad' };
  assertThrows(() => layoutMermaid(graph), TypeError);
  const safe = layoutMermaid(parseMermaid("flowchart TB\nA"));
  assertThrows(() => renderMermaidCells({ ...safe, width: NaN }), RangeError);
  assertThrows(() => renderMermaidSvg({ ...safe, width: 1_000_000 }), RangeError);
  assertThrows(() => renderMermaidSvg({ ...layoutMermaid(parseMermaid("flowchart TB\nA")), graph }), TypeError);
  assertThrows(() => layoutMermaid(parseMermaid('flowchart TB\nA["\x1b[31m"]')), TypeError);
});

Deno.test("Markdown opt-in fonts and flowcharts preserve defaults and width bounds", () => {
  const document = parseMarkdown(
    "# Stack\n\n```mermaid\nflowchart TB\nA[Code]-->B[Serve]\n```\n\n[Open model](product:model)",
  );
  assertStringIncludes(renderMarkdown(document, { width: 40 }).map((l) => l.text).join("\n"), "flowchart TB");
  for (const width of [7, 12, 24, 80]) {
    const rows = renderMarkdown(document, {
      width,
      headingFonts: ASCII_HEADING_FONTS,
      mermaid: true,
      showLinkDestinations: false,
    });
    assert(rows.every((row) => textWidth(row.text) <= width));
    assert(!rows.some((row) => row.text.includes("flowchart TB")));
  }
});

Deno.test("MarkdownSurface mounts the component, scrolls, reflows and activates wrapped links", async () => {
  const opened: string[] = [];
  const surface = new MarkdownSurface({
    source: "[Open model](product:model)\n\n" + Array.from({ length: 40 }, (_, i) => `Paragraph ${i}.`).join("\n\n"),
    render: { showLinkDestinations: false },
    onLink: (href) => opened.push(href),
  });
  try {
    await surface.ready;
    assertStringIncludes(surface.render(20, 5).map(stripStyles).join("\n"), "Open model");
    surface.press(2, 0);
    assertEquals(opened, ["product:model"]);
    surface.scroll(1);
    assert(surface.component.controller.offset.peek() > 0);
    assert(!surface.render(20, 5).map(stripStyles).join("\n").includes("Open model"));
    surface.render(12, 8);
    await Promise.resolve();
    await Promise.resolve();
    surface.key({ key: "end", ctrl: false, meta: false, shift: false, buffer: new Uint8Array() });
    assertStringIncludes(surface.render(12, 8).map(stripStyles).join("\n"), "39.");
    surface.key({ key: "home", ctrl: false, meta: false, shift: false, buffer: new Uint8Array() });
    surface.render(6, 5);
    surface.press(1, 1);
    assertEquals(opened.length, 2);
  } finally {
    surface.dispose();
  }
});
