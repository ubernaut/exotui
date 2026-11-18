import { crayon } from "crayon";
import { assert, assertEquals, assertStrictEquals, assertStringIncludes } from "./deps.ts";
import {
  Computed,
  Markdown,
  MarkdownController,
  markdownRenderText,
  parseMarkdown,
  renderMarkdown,
} from "../mod.app.ts";
import { canvasRowText, createTestTerminalApp } from "../mod.testing.ts";
import { textWidth } from "../src/utils/strings.ts";

const richSource = [
  "# Title",
  "",
  "Paragraph with **bold**, *emphasis*, [link](https://example.com), ~~strike~~ and `code`.",
  "",
  "> quoted text that wraps across terminal rows",
  "",
  "1. one",
  "2. two",
  "",
  "- [x] shipped",
  "",
  "```ts",
  "const value = 1;",
  "console.log(value);",
  "```",
  "",
  "| Name | Value |",
  "| :--- | ----: |",
  "| alpha | 123 |",
].join("\n");

Deno.test("parseMarkdown preserves semantic blocks marks links tasks code and tables", () => {
  const document = parseMarkdown(richSource);

  assertEquals(document.blocks.map((block) => block.kind), [
    "heading",
    "paragraph",
    "paragraph",
    "list-item",
    "list-item",
    "list-item",
    "code",
    "table-row",
    "table-row",
  ]);
  assert(document.blocks[1]?.inlines?.some((span) => span.marks.includes("strong")));
  assert(document.blocks[1]?.inlines?.some((span) => span.marks.includes("emphasis")));
  assert(document.blocks[1]?.inlines?.some((span) => span.marks.includes("strikethrough")));
  assert(document.blocks[1]?.inlines?.some((span) => span.marks.includes("code")));
  assertEquals(document.links, [{ text: "link", href: "https://example.com", title: undefined }]);
  assertEquals(document.blocks[5]?.checked, true);
  assertEquals(document.blocks[6]?.language, "ts");
  assertEquals(document.blocks[7]?.cells?.map((cell) => cell.align), ["left", "right"]);
});

Deno.test("renderMarkdown wraps cell-width content and renders list groups code and tables", () => {
  const lines = renderMarkdown(parseMarkdown(richSource), { width: 32, codeLineNumbers: true });
  const text = markdownRenderText(lines);

  assertStringIncludes(text, "# Title");
  assertStringIncludes(text, "> quoted text that wraps across");
  assertStringIncludes(text, "> terminal rows");
  assertStringIncludes(text, "1. one\n2. two\n\n[x] shipped");
  assertStringIncludes(text, "```ts\n│ 1 const value = 1;\n│ 2 console.log(value);\n```");
  assertStringIncludes(text, "| Name  | Value |\n|-------|-------|\n| alpha |   123 |");
  assert(lines.every((line) => textWidth(line.text) <= 32));
});

Deno.test("renderMarkdown falls back to readable stacked table cells when narrow", () => {
  const lines = renderMarkdown(parseMarkdown("| A | B |\n| - | - |\n| 1 | 2 |"), { width: 7 });
  assertEquals(markdownRenderText(lines), "[1] A\n[2] B\n[1] 1\n[2] 2");
});

const longTable = [
  "| Area | Priority | Check |",
  "| --- | --- | :---: |",
  "| Verification platform | Provider interfaces, replay library, decoder benchmarks and signed releases | Ten published experiments reproduced within their confidence intervals |",
  "| **Geometric learning** | See [the repository](https://example.com/qgtl) for hardware-backed training | ok |",
].join("\n");

Deno.test("renderMarkdown wraps table cells without losing text, marks, links or alignment", () => {
  const document = parseMarkdown(longTable);
  const truncated = markdownRenderText(renderMarkdown(document, { width: 60, showLinkDestinations: false }));
  assertStringIncludes(truncated, "…");
  for (const width of [120, 80, 60]) {
    const lines = renderMarkdown(document, { width, showLinkDestinations: false, tableCells: "wrap" });
    const text = markdownRenderText(lines);
    assert(!text.includes("…"), `cells must stay complete at ${width} columns`);
    assert(lines.every((line) => textWidth(line.text) <= width), "wrapped table rows must fit the viewport");
    assert(lines.every((line) => textWidth(line.text) === textWidth(lines[0]!.text)), "grid rows share one width");
    // Every authored word survives, in reading order within its cell.
    const words = text.replace(/[|-]/g, " ").split(/\s+/).filter(Boolean);
    for (
      const word
        of "Verification platform Provider interfaces replay library decoder benchmarks signed releases Ten published experiments reproduced within their confidence intervals Geometric learning See the repository for hardware backed training ok"
          .split(" ")
    ) assert(words.some((entry) => entry.includes(word)), `lost ${word} at ${width} columns`);
    const linked = lines.flatMap((line) => line.segments).filter((part) => part.href === "https://example.com/qgtl");
    assertEquals(linked.map((part) => part.text).join(""), "therepository");
    const strong = lines.flatMap((line) => line.segments).filter((part) => part.marks.includes("strong"));
    assertEquals(strong.map((part) => part.text).join(""), "Geometriclearning");
  }
  const wide = renderMarkdown(document, { width: 120, showLinkDestinations: false, tableCells: "wrap" });
  assertEquals(wide.filter((line) => /^\|-+\|/.test(line.text)).length, 2, "a header rule and one row separator");
  const centered = wide.find((line) => line.text.includes(" ok "))!;
  const cell = centered.text.split("|").at(-2)!;
  assert(Math.abs(cell.indexOf("ok") - (cell.length - cell.indexOf("ok") - 2)) <= 1, "centered cells stay centered");
});

Deno.test("renderMarkdown keeps single-row wrapped tables compact and turns narrow ones into records", () => {
  const compact = renderMarkdown(parseMarkdown("| A | B |\n| - | - |\n| one | two |\n| three | four |"), {
    width: 40,
    tableCells: "wrap",
  });
  assertEquals(compact.map((line) => line.text), [
    "| A     | B    |",
    "|-------|------|",
    "| one   | two  |",
    "| three | four |",
  ]);
  const records = renderMarkdown(parseMarkdown(longTable), {
    width: 30,
    showLinkDestinations: false,
    tableCells: "wrap",
  });
  const text = markdownRenderText(records);
  assert(!text.includes("|") && !text.includes("…"), "records replace a grid that cannot stay readable");
  assert(records.every((line) => textWidth(line.text) <= 30));
  assertStringIncludes(text, "Verification platform\n  Priority: Provider\n  interfaces, replay library,");
  assertStringIncludes(text, "\n\nGeometric learning\n  Priority: See the repository");
  assertStringIncludes(text, "  Check: ok");
  assertEquals(
    records.flatMap((line) => line.segments).filter((part) => part.href).map((part) => part.text).join(""),
    "therepository",
  );
  // A quoted table keeps its quote prefix in both presentations.
  for (const width of [80, 24]) {
    const quoted = renderMarkdown(
      parseMarkdown("> | Key | Value |\n> | - | - |\n> | alpha | a long value that needs to wrap |"),
      {
        width,
        tableCells: "wrap",
      },
    );
    assert(quoted.every((line) => line.text.startsWith("> ") && textWidth(line.text) <= width));
  }
});

Deno.test("renderMarkdown keeps nested list items in one compact list group", () => {
  const source = ["- parent", "  1. child one", "  2. child two", "- next", "", "> quoted", "> continuation"]
    .join("\n");
  const text = markdownRenderText(renderMarkdown(parseMarkdown(source), { width: 24 }));
  assertEquals(text, "• parent\n  1. child one\n  2. child two\n• next\n\n> quoted continuation");
});

Deno.test("MarkdownController scrolls a reflowed document deterministically", () => {
  const controller = new MarkdownController({
    source: Array.from({ length: 12 }, (_, index) => `Paragraph ${index}.`).join("\n\n"),
  });
  try {
    const inspection = controller.inspect(14, 4);
    assert(inspection.lines > inspection.height);
    assertStrictEquals(controller.render(14), controller.render(14));
    assertEquals(controller.scrollTo(Number.MAX_SAFE_INTEGER, 14, 4), inspection.maxOffset);
    assertStringIncludes(markdownRenderText(controller.visible(14, 4)), "Paragraph 11.");
    controller.setSource("# Reset");
    assertEquals(controller.offset.peek(), 0);
  } finally {
    controller.dispose();
  }
});

Deno.test("Markdown component renders reflows and scrolls through TerminalAppPilot", async () => {
  let markdown: Markdown | undefined;
  const harness = await createTestTerminalApp({
    size: { columns: 36, rows: 5 },
    setup(app) {
      markdown = new Markdown({
        parent: app.tui,
        rectangle: new Computed(() => ({
          column: 0,
          row: 0,
          width: app.tui.rectangle.value.width,
          height: app.tui.rectangle.value.height,
        })),
        zIndex: 1,
        theme: { base: crayon.white, focused: crayon.white },
        source: Array.from({ length: 14 }, (_, index) => `## Section ${index}\n\nBody row ${index}.`).join("\n\n"),
      });
      app.registerComponent(markdown, { id: "document" });
      app.focus.focus(markdown);
    },
  });

  try {
    assertStringIncludes(harness.pilot.snapshot(), "## Section 0");
    await harness.pilot.press("end");
    assert((markdown?.controller.offset.peek() ?? 0) > 0);
    assertStringIncludes(harness.pilot.snapshot(), "Body row 13.");
    await harness.pilot.resize(24, 9);
    assertEquals(markdown?.controller.inspect(24, 9).width, 24);
    assertStringIncludes(canvasRowText(harness.canvas, 8, 24), "Body row 13.");
  } finally {
    harness.destroy();
  }
});

Deno.test("Markdown component skips line rendering while hidden or zero-sized", async () => {
  const controller = new MarkdownController({ source: "# Hidden" });
  const originalVisible = controller.visible.bind(controller);
  let visibleCalls = 0;
  controller.visible = (width, height) => {
    visibleCalls += 1;
    return originalVisible(width, height);
  };
  let markdown: Markdown | undefined;
  const harness = await createTestTerminalApp({
    size: { columns: 20, rows: 4 },
    setup(app) {
      markdown = new Markdown({
        parent: app.tui,
        controller,
        visible: false,
        rectangle: { column: 0, row: 0, width: 20, height: 4 },
        zIndex: 1,
        theme: { base: crayon.white },
      });
    },
  });

  try {
    assertEquals(visibleCalls, 0);
    controller.setSource("# Still hidden");
    assertEquals(visibleCalls, 0);
    markdown!.visible.value = true;
    assertEquals(visibleCalls, 1);
    markdown!.rectangle.value = { column: 0, row: 0, width: 0, height: 0 };
    controller.setSource("# Zero sized");
    assertEquals(visibleCalls, 1);
  } finally {
    harness.destroy();
    controller.dispose();
  }
});
