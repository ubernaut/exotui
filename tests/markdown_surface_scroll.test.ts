import { assertEquals } from "./deps.ts";
import { MarkdownSurface, TITLE_HEADING_FONTS } from "../mod.document.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";
import { MarkdownController } from "../src/components/markdown.ts";
import { Signal } from "../src/signals/mod.ts";

Deno.test("Markdown source changes before subscription readiness render immediately and remain current", async () => {
  const source = new Signal("Old content.");
  const controller = new MarkdownController({ source, render: { showLinkDestinations: false } });
  try {
    source.value = "New content.\n\n[Details](product:new)";
    assertEquals(controller.render(40).map((line) => line.text), ["New content.", "", "Details"]);
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(controller.document.peek().source, source.peek());
    assertEquals(controller.linkAt(0, 2, 40, 4), "product:new");
  } finally {
    controller.dispose();
    assertEquals(source.disposed, false);
    source.dispose();
  }
});

Deno.test("Markdown cell surfaces preserve wide glyph continuation cells without shifting labels or links", async () => {
  const surface = new MarkdownSurface({
    source: "[你好 ❤](product:unicode) [Next](product:next)",
    render: { showLinkDestinations: false },
    initialSize: { columns: 24, rows: 3 },
  });
  try {
    await surface.ready;
    const rows = surface.renderCells(24, 3);
    assertEquals(rows[0]![1], "");
    assertEquals(rows[0]![3], "");
    const text = stripStyles(rows[0]!.join(""));
    const expected = surface.component.controller.render(24)[0]!.text;
    assertEquals(text, expected + " ".repeat(24 - textWidth(expected)));
    assertEquals(textWidth(text), 24);
    assertEquals(surface.component.controller.linkAt(1, 0, 24, 3), "product:unicode");
    assertEquals(surface.component.controller.linkAt(7, 0, 24, 3), "product:next");
  } finally {
    surface.dispose();
  }
});

Deno.test("disposing a borrowed Markdown model before ready does not reattach its source dependencies", async () => {
  const source = new Signal("Borrowed source.");
  const controller = new MarkdownController({ source });
  controller.dispose();
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(source.inspect().dependants, 0);
  assertEquals(source.disposed, false);
  source.dispose();
});

Deno.test("MarkdownSurface first viewport before ready preserves the complete opening title row", async () => {
  const surface = new MarkdownSurface({
    source: "# Stack\n\nOpening text.\n\n## Details",
    render: { headingFonts: TITLE_HEADING_FONTS, headingArt: "title", wrapHeadingArt: false },
  });
  try {
    surface.render(80, 12);
    await surface.ready;
    const actual = surface.render(80, 12).map(stripStyles);
    const expected = surface.component.controller.visible(80, 12).map((line) => line.text.padEnd(80, " "));
    while (expected.length < 12) expected.push(" ".repeat(80));
    assertEquals(actual, expected);
  } finally {
    surface.dispose();
  }
});

Deno.test("MarkdownSurface snapshots retain every row after shrinking and scrolling its viewport", async () => {
  const surface = new MarkdownSurface({
    source: Array.from({ length: 15 }, (_, index) => `Line ${index}.`).join("\n\n"),
  });
  try {
    await surface.ready;
    surface.render(40, 12);
    await Promise.resolve();
    await Promise.resolve();
    for (const [offset, height] of [[1, 11], [3, 9], [8, 4], [0, 12], [5, 8]] as const) {
      surface.component.controller.scrollTo(offset, 40, height);
      const actual = surface.render(40, height).map(stripStyles);
      const expected = surface.component.controller.visible(40, height).map((line) => line.text.padEnd(40, " "));
      assertEquals(actual, expected, `offset ${offset}, height ${height}`);
      await Promise.resolve();
      await Promise.resolve();
    }
  } finally {
    surface.dispose();
  }
});

Deno.test("MarkdownSurface synchronous frames refresh rows created by its first grown viewport", async () => {
  const surface = new MarkdownSurface({
    source: Array.from({ length: 20 }, (_, index) => `Content ${index}.`).join("\n\n"),
  });
  try {
    await surface.ready;
    for (
      const [width, height, offset] of [[80, 12, 0], [80, 7, 3], [40, 9, 4], [80, 12, 0], [25, 5, 7], [
        80,
        12,
        0,
      ]] as const
    ) {
      surface.component.controller.scrollTo(offset, width, height);
      const actual = surface.render(width, height).map(stripStyles);
      const expected = surface.component.controller.visible(width, height).map((line) => line.text.padEnd(width, " "));
      while (expected.length < height) expected.push(" ".repeat(width));
      assertEquals(actual, expected, `immediate ${width}x${height}, offset ${offset}`);
      // Deliberately no microtask yield between snapshots.
    }
  } finally {
    surface.dispose();
  }
});
