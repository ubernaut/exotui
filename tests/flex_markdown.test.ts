import { assert, assertEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import {
  COMPACT_HEADING_FONTS,
  FlexMarkdownController,
  type FlexMarkdownSection,
  FlexMarkdownSurface,
  layoutFlexMarkdown,
  layoutMermaid,
  parseMarkdown,
  parseMermaid,
  renderAsciiHeading,
  renderMarkdown,
  renderMermaidFrame,
  TITLE_HEADING_FONTS,
} from "../mod.document.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";
import { MarkdownController } from "../src/components/markdown.ts";
import { Computed, Signal } from "../src/signals/mod.ts";

const sections: FlexMarkdownSection[] = [{
  id: "chapter",
  label: "Project profiles",
  number: "05",
  rows: [{
    panels: [
      {
        id: "left",
        kind: "card",
        href: "product:left",
        source: "## Left product\n\nLeft description.\n\n[Browser tab](tab:left)",
      },
      {
        id: "right",
        kind: "card",
        href: "product:right",
        source: "## Right product\n\nRight description.\n\n" +
          Array.from({ length: 15 }, (_, i) => `Right paragraph ${i}.`).join("\n\n"),
      },
    ],
  }],
}, { id: "next", label: "Next chapter", rows: [{ panels: [{ id: "last", source: "Last sentence." }] }] }];

Deno.test("compact heading hierarchy preserves visible word spaces without changing FIGlet stamps", () => {
  const words = renderAsciiHeading("AI AI", "micro", 80);
  assertEquals(words.length, 3);
  for (const row of words) assertEquals(row.slice(7, 10), "   ");
  for (const font of ["standard", "small"] as const) {
    const word = renderAsciiHeading("MODEL", font, 200);
    const pair = renderAsciiHeading("MODEL MODEL", font, 200);
    pair.forEach((row, i) => assertEquals(row, word[i] + "   " + word[i]));
  }
  const lines = renderMarkdown(parseMarkdown("# AI AI\n\n## Compact subhead"), {
    width: 80,
    headingFonts: COMPACT_HEADING_FONTS,
  });
  assertEquals(
    lines.filter((line) => line.blockIndex === 0 && line.segments.some((span) => span.role === "heading")).length,
    3,
  );
  assertEquals(
    lines.filter((line) => line.blockIndex === 1 && line.segments.some((span) => span.role === "heading")).length,
    1,
  );
});

Deno.test("document flex rows equalize cards, stack when narrow, center wide pages and keep chapters continuous", () => {
  const measure = (panel: { id: string }, width: number) => panel.id === "left" ? 4 : Math.ceil(200 / width);
  const wide = layoutFlexMarkdown(sections, 160, measure);
  const [left, right] = wide.panels;
  assertEquals(left!.rect.row, right!.rect.row);
  assertEquals(left!.rect.height, right!.rect.height);
  assertEquals(left!.rect.column, 20);
  assertEquals(right!.rect.column - left!.rect.column - left!.rect.width, 2);
  assert(wide.sections[1]!.row > right!.rect.row + right!.rect.height);
  for (const width of [1, 7, 24, 48, 89, 90, 120, 200]) {
    const layout = layoutFlexMarkdown(sections, width, measure);
    for (const box of layout.panels) {
      assert(box.rect.column >= 0 && box.rect.column + box.rect.width <= width);
      assert(box.contentRect.column + box.contentRect.width <= box.rect.column + box.rect.width);
      assert(box.contentRect.row + box.contentRect.height <= box.rect.row + box.rect.height);
    }
    if (width < 90) assert(layout.panels[1]!.rect.row > layout.panels[0]!.rect.row);
  }
  assertThrows(() => layoutFlexMarkdown(sections, NaN, measure), RangeError);
  assertThrows(() => layoutFlexMarkdown(sections, 100, () => Infinity), RangeError);
});

Deno.test("compact document titles fall back to readable text instead of multi-screen heading art", () => {
  const controller = new FlexMarkdownController({
    sections: [{ id: "cover", label: "Cover", rows: [{ panels: [{ id: "title", source: "# Tsotchke Tech Stack" }] }] }],
  });
  try {
    assertEquals(controller.layout(24).panels[0]!.contentRect.height, 1);
    assertEquals(controller.layout(120).panels[0]!.contentRect.height, 3);
  } finally {
    controller.dispose();
  }
});

Deno.test("flex title art is the first content and never repeats in later panels or chapters", async () => {
  const title = "Tsotchke Tech Stack";
  const document: FlexMarkdownSection[] = [{
    id: "cover",
    label: "Cover",
    rows: [{
      fullWidth: true,
      panels: [{ id: "opening", source: `# ${title}\n\n## Subtitle\n\n# Another opening heading` }],
    }, {
      panels: [{ id: "card", kind: "card", source: "# Card title\n\nCard text." }],
    }],
  }, {
    id: "chapter",
    label: "Chapter",
    rows: [{ panels: [{ id: "later", source: "# Later title\n\n## Subheading" }] }],
  }];
  const render = { headingFonts: TITLE_HEADING_FONTS, headingArt: "title", wrapHeadingArt: false } as const;
  const surface = new FlexMarkdownSurface({ sections: document, render, showFirstSectionHeader: false });
  try {
    await surface.ready;
    const fit = textWidth(renderAsciiHeading(title, "small", 2000)[0]!);
    for (const width of [160, 120, fit - 1, fit, 48, 120]) {
      const layout = surface.controller.layout(width);
      assertEquals(layout.panels[0]!.contentRect.row, 0);
      assertEquals(layout.panels[0]!.contentRect.width, width);
      assertEquals(layout.panels[1]!.rect.width, Math.min(width, 120));
      assertEquals(layout.panels[1]!.rect.column, Math.floor((width - Math.min(width, 120)) / 2));
      const rows = surface.render(width, layout.height).map(stripStyles);
      for (const [index, box] of layout.panels.entries()) {
        const c = box.contentRect;
        const source = box.panel.source;
        const expected = renderMarkdown(parseMarkdown(typeof source === "string" ? source : source.peek()), {
          ...render,
          headingFonts: index === 0 ? TITLE_HEADING_FONTS : { 1: "plain", 2: "plain" },
          width: c.width,
        }).map((line) => line.text);
        assertEquals(c.height, expected.length);
        assertEquals(
          rows.slice(c.row, c.row + c.height).map((row) => row.slice(c.column, c.column + c.width)),
          expected.map((row) => row.padEnd(c.width, " ")),
        );
        if (index === 0) {
          assertEquals(
            rows[0]!.trim(),
            c.width < fit ? title : renderAsciiHeading(title, "small", c.width)[0]!.trim(),
          );
        } else assertEquals(expected.filter((line) => line.includes("title")).length, 1);
      }
      await Promise.resolve();
      await Promise.resolve();
    }
  } finally {
    surface.dispose();
  }
});

Deno.test("flex controller links include card whitespace and retain explicit tab links after scrolling and reflow", () => {
  const controller = new FlexMarkdownController({ sections });
  try {
    const box = controller.layout(120).panels[0]!;
    assertEquals(controller.linkAt(box.rect.column, box.rect.row, 120, 40), "product:left");
    assertEquals(controller.linkAt(box.contentRect.column + 1, box.contentRect.row + 4, 120, 40), "tab:left");
    controller.scrollTo(box.rect.row, 120, 10);
    assertEquals(controller.linkAt(box.rect.column, 0, 120, 10), "product:left");
    controller.handleKeyPress({ key: "end", ctrl: false, meta: false, shift: false }, 48, 10);
    const info = controller.inspect(48, 10);
    assertEquals(info.offset, info.maxOffset);
    assertEquals(controller.handleKeyPress({ key: "home", ctrl: true, meta: false, shift: false }, 48, 10), undefined);
  } finally {
    controller.dispose();
  }
});

Deno.test("flex surface paints actual Markdown components in both columns and routes native viewport input", async () => {
  const links: string[] = [];
  const surface = new FlexMarkdownSurface({ sections, onLink: (href) => links.push(href) });
  try {
    await surface.ready;
    const rows = surface.render(120, 12).map(stripStyles);
    assertStringIncludes(rows.join("\n"), "Left product");
    assertStringIncludes(rows.join("\n"), "Right product");
    assert(rows.every((row) => textWidth(row) === 120));
    const right = surface.controller.layout(120).panels[1]!;
    surface.press(right.rect.column, right.rect.row);
    assertEquals(links, ["product:right"]);
    surface.scroll(1);
    assert(surface.controller.offset.peek() > 0);
    surface.render(48, 12);
    await Promise.resolve();
    await Promise.resolve();
    surface.key({ key: "end", ctrl: false, meta: false, shift: false, buffer: new Uint8Array() });
    assertStringIncludes(surface.render(48, 12).map(stripStyles).join("\n"), "Last sentence.");
  } finally {
    surface.dispose();
  }
});

Deno.test("flex documents preserve every content cell while panels clip, scroll and reflow", async () => {
  const document: FlexMarkdownSection[] = [...sections, {
    id: "diagram-chapter",
    label: "Circuit and table",
    rows: [{
      panels: [{
        id: "diagram-panel",
        kind: "diagram",
        source:
          "# Circuit map\n\n```mermaid\nflowchart TB\nA[Experience] ==> B[Compute]\nICC[Evidence] -.-> A\n```\n\n" +
          "| Product | Role |\n| --- | --- |\n| Core | Compute |\n| UI | Experience |\n\n[Details](tab:core)",
      }],
    }],
  }];
  const surface = new FlexMarkdownSurface({ sections: document });
  try {
    await surface.ready;
    for (const [width, height] of [[120, 18], [48, 11], [120, 27], [30, 7], [120, 18]] as const) {
      const layout = surface.controller.layout(width);
      const expected = layout.panels.map((box) =>
        renderMarkdown(
          parseMarkdown(typeof box.panel.source === "string" ? box.panel.source : box.panel.source.peek()),
          {
            width: box.contentRect.width,
            headingFonts: COMPACT_HEADING_FONTS,
            wrapHeadingArt: false,
            mermaid: true,
            mermaidStyle: "circuit",
            showLinkDestinations: false,
          },
        ).map((line) => line.text)
      );
      const end = surface.controller.inspect(width, height).maxOffset;
      const offsets = Array.from({ length: Math.ceil(end / 3) + 1 }, (_, index) => Math.min(end, index * 3));
      for (const offset of [...offsets, ...offsets.reverse()]) {
        surface.controller.scrollTo(offset, width, height);
        for (let frame = 0; frame < 2; frame++) {
          const rows = surface.render(width, height).map(stripStyles);
          layout.panels.forEach((box, index) => {
            const c = box.contentRect;
            for (let y = Math.max(c.row, offset); y < Math.min(c.row + c.height, offset + height); y++) {
              assertEquals(
                rows[y - offset]!.slice(c.column, c.column + c.width),
                (expected[index]![y - c.row] ?? "").padEnd(c.width, " "),
                `${box.panel.id}, width ${width}, height ${height}, offset ${offset}, row ${y}, frame ${frame}`,
              );
            }
          });
          // A desktop requests frames both before and after reactive mounting
          // settles. Neither may drop rows or resurrect stale clipped content.
          await Promise.resolve();
          await Promise.resolve();
        }
      }
    }
  } finally {
    surface.dispose();
  }
});

Deno.test("flex measurement and painting share one reactive panel model and invalidate at the same width", async () => {
  const source = new Signal("Short.");
  const models: MarkdownController[] = [];
  const surface = new FlexMarkdownSurface({
    sections: [{ id: "chapter", label: "Live", rows: [{ panels: [{ id: "live", source }] }] }],
    createController: (_, options) => {
      const model = new MarkdownController(options);
      models.push(model);
      return model;
    },
  });
  try {
    const before = surface.controller.layout(80);
    source.value = "New content.\n\n[New detail](product:live)\n\n" + "Additional line.\n\n".repeat(12);
    const after = surface.controller.layout(80);
    assert(after.height > before.height, "Same-width layout must reflect a changed source even before ready.");
    assertEquals(models.length, 1, "Views must not allocate a second controller or remeasure at one column.");
    const rows = surface.render(80, 10).map(stripStyles);
    assertStringIncludes(rows.join("\n"), "New content.");
    assertEquals(models[0], surface.controller.panelController("live"));
    const c = after.panels[0]!.contentRect;
    surface.controller.scrollTo(c.row + 1, 80, 6);
    surface.render(80, 6);
    assertEquals(
      surface.controller.linkAt(c.column, c.row + 2 - surface.controller.offset.peek(), 80, 6),
      "product:live",
    );
    await surface.ready;
  } finally {
    surface.dispose();
    surface.dispose();
    assertEquals(models[0]!.source.disposed, false);
    assertEquals(models[0]!.revision.disposed, true);
    source.dispose();
  }
});

Deno.test("flex source/frame revisions preserve the visible panel and reflow without recursive host updates", async () => {
  const top = new Signal("Short.");
  const surface = new FlexMarkdownSurface({
    sections: [{
      id: "chapter",
      label: "Anchor",
      rows: [
        { panels: [{ id: "top", source: top }] },
        { panels: [{ id: "anchor", source: "Visible anchor.\n\n" + "More content.\n\n".repeat(20) }] },
      ],
    }],
  });
  let view: Computed<string[]> | undefined;
  try {
    await surface.ready;
    const original = surface.controller.layout(80).panels[1]!;
    surface.controller.scrollTo(original.rect.row + 2, 80, 8);
    view = new Computed(() => {
      surface.controller.revision.value;
      surface.controller.offset.value;
      return surface.render(80, 8);
    });
    await Promise.resolve();
    await Promise.resolve();
    top.value = "Growing content.\n\n".repeat(16);
    await Promise.resolve();
    await Promise.resolve();
    const moved = surface.controller.layout(80).panels[1]!;
    assertEquals(surface.controller.offset.peek(), moved.rect.row + 2);
    assertEquals(view.peek(), surface.render(80, 8));
    const model = surface.controller.panelController("top")!;
    model.invalidate();
    const previous = surface.controller.layout(80);
    model.invalidate();
    assert(surface.controller.layout(80) !== previous, "Prepared geometry invalidation must invalidate layout.");
  } finally {
    view?.dispose();
    surface.dispose();
    top.dispose();
  }
});

Deno.test("flex panel updates snapshot structure, retain models, replace title roles and release removed panels", async () => {
  const first = { id: "first", source: "# First\n\n[Details](product:first)" };
  const second = { id: "second", source: "# Second" };
  const document: FlexMarkdownSection[] = [{ id: "chapter", label: "Live", rows: [{ panels: [first, second] }] }];
  const surface = new FlexMarkdownSurface({
    sections: document,
    render: { headingArt: "title", headingFonts: TITLE_HEADING_FONTS },
  });
  try {
    const oldFirst = surface.controller.panelController("first")!;
    const oldSecond = surface.controller.panelController("second")!;
    first.source = "Must not mutate the snapshot.";
    assertEquals(oldFirst.source.peek(), "# First\n\n[Details](product:first)");
    surface.render(120, 10);
    await surface.ready;
    surface.setSections([{
      id: "chapter",
      label: "Live",
      rows: [{ panels: [second, { ...first, source: "# First" }] }],
    }]);
    assertEquals(oldFirst.revision.disposed, true);
    assertEquals(oldSecond.revision.disposed, true);
    const newFirst = surface.controller.panelController("first")!;
    const newSecond = surface.controller.panelController("second")!;
    assertEquals(newFirst.render(80).length, 1);
    assertEquals(newSecond.render(80).length, 5);
    assertThrows(() => surface.setSections([{ id: "second", label: "Bad", rows: [{ panels: [second] }] }]), TypeError);
    assertEquals(
      surface.controller.panelController("second"),
      newSecond,
      "Validation failure must preserve the document.",
    );
    surface.setSections([{
      id: "chapter",
      label: "Live",
      rows: [{ panels: [{ id: "second", source: "# Updated" }] }],
    }]);
    assertEquals(surface.controller.panelController("second"), newSecond);
    assertEquals(newFirst.revision.disposed, true);
    assertEquals(surface.controller.panelController("first"), undefined);
    assertStringIncludes(newSecond.text(24), "Updated");
    surface.render(24, 8);
  } finally {
    surface.dispose();
  }
});

Deno.test("failed flex controller factories release partial allocations and preserve the old live document", () => {
  const made: MarkdownController[] = [];
  const controller = new FlexMarkdownController({
    sections: [{ id: "chapter", label: "Live", rows: [{ panels: [{ id: "existing", source: "Original." }] }] }],
    createController: (panel, options) => {
      if (panel.id === "fail") throw new Error("Factory failed.");
      const model = new MarkdownController(options);
      made.push(model);
      return model;
    },
  });
  try {
    assertThrows(
      () =>
        controller.setSections([{
          id: "chapter",
          label: "Live",
          rows: [{ panels: [{ id: "created", source: "New." }, { id: "fail", source: "Fail." }] }],
        }]),
      Error,
      "Factory failed",
    );
    assertEquals(controller.panelController("existing"), made[0]);
    assertEquals(made[0]!.revision.disposed, false);
    assertEquals(made[1]!.revision.disposed, true);
    assertEquals(controller.layout(40).panels.length, 1);
  } finally {
    controller.dispose();
  }
});

Deno.test("circuit diagrams use themed packages, pins, distinct traces and compact structural ranks", () => {
  const graph = parseMermaid(
    "flowchart TB\nA[Experience] ==> B[Cognition]\nB ==> C[Models]\nC ==> D[Compute]\nICC[Evidence rail] -.->|evidence| A\nmesh[Operations rail] -.->|placement| C\nedge[Independent service]",
  );
  for (const maxColumns of [12, 24, 48, 100, 120, 200]) {
    const layout = layoutMermaid(graph, { maxColumns, style: "circuit" });
    const frame = renderMermaidFrame(layout);
    assert(layout.width <= maxColumns);
    assert(frame.every((row) => textWidth(row.map((cell) => cell.char).join("")) <= maxColumns));
    const roles = new Set(frame.flatMap((row) => row.map((cell) => cell.role)));
    for (const role of ["diagram-node", "diagram-trace", "diagram-integration", "diagram-label"]) {
      assert(roles.has(role as "diagram-node"));
    }
    assertStringIncludes(frame.map((row) => row.map((cell) => cell.char).join("")).join("\n"), "╔");
    if (maxColumns >= 100) {
      const node = (id: string) => layout.nodes.find((node) => node.id === id)!;
      assert(node("A").y < node("B").y && node("B").y < node("C").y);
      assert(node("ICC").x < node("A").x && node("mesh").x > node("C").x);
      assert(layout.height < layoutMermaid(graph, { maxColumns }).height);
    }
  }
  const onlyRails = layoutMermaid(parseMermaid("flowchart TB\nA -.-> B"), { maxColumns: 100, style: "circuit" });
  assert(renderMermaidFrame(onlyRails).length > 0);
  const narrow = layoutMermaid(parseMermaid("flowchart TB\nA -->|a long relationship that must not vanish| B"), {
    maxColumns: 12,
    style: "circuit",
  });
  const text = renderMermaidFrame(narrow).map((row) => row.map((cell) => cell.char).join("").trim()).join(" ");
  assertStringIncludes(text, "must not");
  assertStringIncludes(text, "vanish");
});

Deno.test("circuit presentation retains all requested directions, readable cycles and self loops", () => {
  for (const direction of ["TB", "BT", "LR", "RL"] as const) {
    const graph = parseMermaid(`flowchart ${direction}\nA[Input] --> B[Output]\nICC -.->|optional| B\nA --> A`);
    const layout = layoutMermaid(graph, { style: "circuit" });
    const a = layout.nodes.find((node) => node.id === "A")!, b = layout.nodes.find((node) => node.id === "B")!;
    assert(
      direction === "TB" ? a.y < b.y : direction === "BT" ? a.y > b.y : direction === "LR" ? a.x < b.x : a.x > b.x,
    );
    const loop = layout.edges.find((edge) => edge.from === edge.to)!;
    assert(loop.path.length > 2);
    assert(renderMermaidFrame(layout).flat().some((cell) => "▲▶▼◀".includes(cell.char) && cell.char !== ""));
  }
});
