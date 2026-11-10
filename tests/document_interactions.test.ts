// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import {
  DocumentInteractionController,
  documentInteractionTargets,
  documentRowCells,
  FlexMarkdownController,
  FlexMarkdownSurface,
  layoutDocumentTooltip,
  MarkdownController,
  MarkdownSurface,
  paintDocumentInteractions,
  parseMarkdown,
  renderMarkdown,
} from "../mod.document.ts";
import type { KeyPressEvent } from "../src/input_reader/types.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";
import { Signal } from "../src/signals/mod.ts";
import { bindFocusNavigation, FocusManager } from "../src/focus.ts";
import type { ComponentState } from "../src/component.ts";
import type { MarkdownInteraction } from "../mod.document.ts";

const key = (name: KeyPressEvent["key"], modifiers: Partial<KeyPressEvent> = {}): KeyPressEvent => ({
  key: name,
  ctrl: false,
  meta: false,
  shift: false,
  buffer: new Uint8Array(),
  ...modifiers,
});

Deno.test("wrapped and styled links keep one stop while equal adjacent links and repeated fence node IDs remain distinct", () => {
  const document = parseMarkdown("[long **styled** label](product:same) [long **styled** label](product:same)");
  const wide = documentInteractionTargets(renderMarkdown(document, { width: 100, showLinkDestinations: false }));
  const narrow = documentInteractionTargets(renderMarkdown(document, { width: 8, showLinkDestinations: false }));
  assertEquals(wide.length, 2);
  assertEquals(narrow.length, 2);
  assertEquals(narrow.map((target) => target.key), wide.map((target) => target.key));
  assert(narrow[0]!.ranges.length > 1);
  const lines = renderMarkdown(parseMarkdown("```mermaid\na\n```\n\n```mermaid\nb\n```"), {
    width: 12,
    diagram: () => ({
      columns: 2,
      cells: [[
        { char: "A", interaction: { id: "B", title: "same", callbacks: [{ name: "run", args: [] }] } },
        { char: "B", interaction: { id: "B", title: "same", callbacks: [{ name: "run", args: [] }] } },
      ]],
    }),
  });
  assertEquals(
    documentInteractionTargets(lines).length,
    2,
    "JSON-cloned cells deduplicate by node only within a fence.",
  );
});

Deno.test("native tooltip geometry is bounded, inert, grapheme-aware and never covers its trigger", () => {
  for (const width of [1, 5, 6, 8, 24, 80]) {
    for (const height of [1, 3, 4, 6, 12]) {
      for (let row = 0; row < height; row++) {
        const tooltip = layoutDocumentTooltip(
          "界😀 long text\nSecond\nThird\nFourth\nFifth",
          { column: width - 1, row },
          width,
          height,
        );
        if (!tooltip) continue;
        const r = tooltip.rectangle;
        assert(r.column >= 0 && r.column + r.width <= width);
        assert(r.row >= 0 && r.row + r.height <= height);
        assert(row < r.row || row >= r.row + r.height);
        assert(tooltip.rows.every((line) => textWidth(line) === r.width));
        assert(r.height <= 8);
      }
    }
  }
  const inert = layoutDocumentTooltip("before\x1b[31m\x07after\t界", { column: 0, row: 0 }, 40, 8)!;
  assert(!inert.rows.join("").includes("\x1b"));
  assertStringIncludes(inert.rows.join(""), "�[31m�");
  const truncated = layoutDocumentTooltip("one\ntwo\nthree", { column: 0, row: 0 }, 16, 4)!;
  assertStringIncludes(truncated.rows.join(""), "…");
  const outside = layoutDocumentTooltip("Keep label visible", { column: 2, row: 1 }, 32, 12, { first: 1, last: 4 })!;
  assert(outside.rectangle.row >= 5, "Use free space below the selected node, not its caption rows.");
  const above = layoutDocumentTooltip("Above", { column: 2, row: 7 }, 32, 12, { first: 7, last: 10 })!;
  assert(above.rectangle.row + above.rectangle.height <= 7);
  const cells = [documentRowCells("界界界界", 8)];
  paintDocumentInteractions(
    cells,
    undefined,
    0,
    { rectangle: { column: 1, row: 0, width: 4, height: 1 }, rows: ["abcd"] },
    (v) => v,
    (v) => v,
  );
  assertEquals(cells[0], [" ", "a", "b", "c", "d", " ", "界", ""]);
});

Deno.test("keyboard state respects modifiers, offscreen actions, tooltip-only stops and bounded target counts", () => {
  const state = new DocumentInteractionController();
  const targets = [{ key: "tip", interaction: { title: "inert" }, ranges: [{ column: 0, row: 0, width: 1 }] }, {
    key: "link",
    interaction: { href: "product:go" },
    ranges: [{ column: 0, row: 10, width: 1 }],
  }];
  const scroll: number[] = [];
  const press = (name: KeyPressEvent["key"], offset = 0, modifiers: Partial<KeyPressEvent> = {}) =>
    state.key(key(name, modifiers), targets, offset, 3, (row) => scroll.push(row));
  try {
    assert(!press("tab").handled);
    assert(!press("right", 0, { shift: true }).handled);
    assert(press("right").handled);
    assert(!press("return").activate);
    assert(press("right").handled);
    assertEquals(scroll, [8]);
    assert(!press("return", 0).handled, "A manually scrolled-away action cannot be activated.");
    assertEquals(press("space", 8).activate, { href: "product:go" });
    assert(press("escape", 8).handled);
    assert(state.tooltipDismissed);
    assert(!press("escape", 8).handled);
    state.pointer();
    assert(!state.tooltipDismissed);
    const lines = Array.from(
      { length: 16_385 },
      (_, blockIndex) => ({
        blockIndex,
        text: "x",
        segments: [{ text: "x", role: "text" as const, marks: [], href: "product:x" }],
      }),
    );
    assertThrows(() => documentInteractionTargets(lines), RangeError);
  } finally {
    state.dispose();
  }
  assert(!press("right").handled);
});

Deno.test("native hover popup blocks click-through, dismisses cleanly and does not consume component Tab focus", async () => {
  const source = new Signal('[Hover](product:first "Native tooltip")\n\n[Behind](product:behind)\n\nEnd.');
  const links: string[] = [], hover: (MarkdownInteraction | undefined)[] = [];
  const surface = new MarkdownSurface({
    controller: new MarkdownController({ source }),
    onLink: (href) => links.push(href),
    onHover: (hit) => hover.push(hit),
    initialSize: { columns: 32, rows: 7 },
  });
  const manager = new FocusManager();
  const other = { state: new Signal<ComponentState>("base") };
  const unbind = bindFocusNavigation(surface.component.tui, manager, { items: [surface.component, other] });
  try {
    await surface.ready;
    manager.focus(surface.component);
    surface.render(32, 7);
    surface.hover(0, 0);
    const popup = surface.render(32, 7).map(stripStyles);
    assertStringIncludes(popup.join("\n"), "Native tooltip");
    surface.press(2, 2);
    assertEquals(links, [], "Popup content is inert, not a click on the covered link.");
    surface.press(0, 0);
    assertEquals(links, ["product:first"]);
    assert(surface.key(key("escape")));
    assert(!surface.render(32, 7).map(stripStyles).join("\n").includes("Native tooltip"));
    surface.hover(0, 0);
    assertStringIncludes(surface.render(32, 7).map(stripStyles).join("\n"), "Native tooltip");
    assert(surface.key(key("right")));
    assertEquals(hover.at(-1), undefined, "Switching to keyboard ownership clears pointer host state.");
    surface.component.tui.emit("keyPress", key("tab"));
    assertEquals(manager.current(), other);
    assert(!surface.key(key("return")));
    assert(!surface.render(32, 7).map(stripStyles).join("\n").includes("Native tooltip"));
    manager.focus(surface.component);
    surface.key(key("right"));
    source.value = "Replaced.";
    assert(!surface.key(key("return")));
    surface.render(8, 3);
    assertEquals(links.length, 1);
  } finally {
    unbind();
    manager.clear();
    other.state.dispose();
    const controller = surface.component.controller;
    surface.dispose();
    controller.dispose();
    source.dispose();
  }
});

Deno.test("diagram focus survives width reflow but clipped/changed metadata never activates a stale callback", async () => {
  const activated: MarkdownInteraction[] = [];
  let pan = 0, enabled = true;
  const interaction = { id: "same", title: "Execute", callbacks: [{ name: "host.run", args: ["one,two"] }] };
  const surface = new MarkdownSurface({
    source: "```mermaid\nfixture\n```",
    onActivate: (hit) => activated.push(hit),
    initialSize: { columns: 16, rows: 6 },
    render: {
      diagram: () => ({
        columns: 20,
        offset: pan,
        cells: [[
          { char: "界", interaction: enabled ? interaction : undefined },
          { char: "", interaction },
          ...Array.from({ length: 18 }, () => ({ char: " " })),
        ]],
      }),
    },
  });
  try {
    await surface.ready;
    surface.render(16, 6);
    assert(surface.key(key("right")));
    surface.render(12, 6);
    assert(surface.key(key("return")));
    assertEquals(activated, [interaction]);
    pan = 1;
    surface.component.controller.invalidate();
    surface.render(12, 6);
    assert(!surface.key(key("return")), "A missing half of a wide glyph has no callback.");
    pan = 0;
    enabled = false;
    surface.component.controller.invalidate();
    surface.render(12, 6);
    assert(!surface.key(key("return")));
    assertEquals(activated.length, 1);
  } finally {
    surface.dispose();
  }
});

Deno.test("flex keyboard scopes duplicate node IDs, preserves card precedence and clears replaced source focus", async () => {
  const action = { id: "B", title: "Run", callbacks: [{ name: "host.run", args: ["B"] }] };
  const source = new Signal("```mermaid\nfixture\n```");
  const activated: MarkdownInteraction[] = [];
  const sections = [{
    id: "chapter",
    label: "",
    rows: [{
      panels: [
        { id: "first", source, href: "product:card", kind: "card" as const },
        { id: "second", source: "```mermaid\nfixture\n```", kind: "card" as const },
      ],
      minPanelWidth: 20,
    }],
  }];
  const controller = new FlexMarkdownController({
    sections,
    showFirstSectionHeader: false,
    render: { diagram: () => ({ columns: 1, cells: [[{ char: "B", interaction: action }]] }) },
  });
  const surface = new FlexMarkdownSurface({ sections: [], controller, onActivate: (hit) => activated.push(hit) });
  try {
    await surface.ready;
    surface.render(64, 8);
    const targets = controller.interactionTargets(64);
    assertEquals(targets.length, 3);
    assertEquals(targets.filter((target) => target.interaction.id === "B").length, 2);
    surface.key(key("right"));
    surface.key(key("return"));
    assertEquals(activated[0]?.href, "product:card");
    surface.key(key("right"));
    assertStringIncludes(surface.render(64, 8).map(stripStyles).join("\n"), "Run");
    surface.key(key("return"));
    assertEquals(activated[1]?.callbacks, action.callbacks);
    source.value = "Replaced.";
    assert(!surface.key(key("return")));
    surface.render(24, 8);
    surface.key(key("right"));
    surface.key(key("right"));
    assert(controller.offset.peek() > 0);
    surface.render(24, 8);
    surface.key(key("return"));
    assertEquals(activated[2]?.callbacks, action.callbacks);
    controller.setSections([]);
    surface.render(24, 8);
    assert(!surface.key(key("return")));
  } finally {
    surface.dispose();
    controller.dispose();
    source.dispose();
  }
  assert(!surface.key(key("right")));
});

Deno.test("borrowed document mounts own independent focus and custom tooltip hosts can opt out of native chrome", async () => {
  const controller = new MarkdownController({ source: '[Shared](product:shared "No popup")' });
  const links: string[] = [];
  const first = new MarkdownSurface({
    controller,
    tooltips: false,
    onLink: (href) => links.push(href),
    initialSize: { columns: 24, rows: 6 },
  });
  const second = new MarkdownSurface({
    controller,
    onLink: (href) => links.push(href),
    initialSize: { columns: 24, rows: 6 },
  });
  try {
    await Promise.all([first.ready, second.ready]);
    first.render(24, 6);
    second.render(24, 6);
    first.key(key("right"));
    assert(!first.render(24, 6).map(stripStyles).join("\n").includes("No popup"));
    assert(!second.key(key("return")));
    assert(first.key(key("return")));
    assertEquals(links, ["product:shared"]);
    first.dispose();
    assert(!first.key(key("return")));
    assertEquals(controller.interactionTargets(24).length, 1);
  } finally {
    first.dispose();
    second.dispose();
    controller.dispose();
  }
});

Deno.test("a rejected diagram adapter cannot leave an asynchronously mounting partial component or borrow ownership", async () => {
  const source = new Signal("```mermaid\nfixture\n```");
  const controller = new MarkdownController({
    source,
    render: { diagram: () => ({ columns: 4, cells: [[{ char: "x" }]] }) },
  });
  try {
    await Promise.resolve();
    await Promise.resolve();
    const before = source.inspect().subscriptions;
    assertThrows(() => new MarkdownSurface({ controller, initialSize: { columns: 12, rows: 6 } }), RangeError);
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(source.inspect().subscriptions, before);
    assert(!source.inspect().disposed);
    assert(!controller.revision.inspect().disposed);
  } finally {
    controller.dispose();
    source.dispose();
  }
});

Deno.test("failed native frame rendering cannot publish new cache stamps or expose the prior action on retry", () => {
  let bad = false;
  const model = new MarkdownController({
    source: "```mermaid\nfixture\n```",
    render: {
      diagram: () =>
        bad
          ? { columns: 4, cells: [[{ char: "x" }]] }
          : { columns: 1, cells: [[{ char: "L", interaction: { href: "product:old" } }]] },
    },
  });
  try {
    assertEquals(model.interactionAt(7, 0, 16, 3)?.href, "product:old");
    bad = true;
    model.invalidate();
    assertThrows(() => model.render(16), RangeError);
    assertThrows(() => model.render(16), RangeError, "inconsistent row width");
    assertThrows(() => model.interactionAt(7, 0, 16, 3), RangeError);
    bad = false;
    assertEquals(
      model.interactionAt(7, 0, 16, 3)?.href,
      "product:old",
      "A valid retry recovers without another invalidation.",
    );
  } finally {
    model.dispose();
  }
});

Deno.test("mounted document keyboard selects, reveals and activates links through the component input path", async () => {
  const links: string[] = [];
  const surface = new MarkdownSurface({
    source: '[First](product:first "First tooltip")\n\n' + "Paragraph.\n\n".repeat(8) +
      '[Last](product:last "Last tooltip")',
    onLink: (href) => links.push(href),
    initialSize: { columns: 32, rows: 6 },
  });
  try {
    await surface.ready;
    surface.render(32, 6);
    // Drive Tui delivery, not the scroll-only controller method.
    surface.component.tui.emit("keyPress", key("right"));
    assertStringIncludes(surface.render(32, 6).map(stripStyles).join("\n"), "First tooltip");
    surface.component.tui.emit("keyPress", key("return"));
    assertEquals(links, ["product:first"]);
    surface.component.tui.emit("keyPress", key("right"));
    assert(surface.component.controller.offset.peek() > 0);
    assertStringIncludes(surface.render(32, 6).map(stripStyles).join("\n"), "Last tooltip");
    assert(surface.key(key("space")));
    assertEquals(links, ["product:first", "product:last"]);
    assert(!surface.key(key("right", { meta: true })));
    assert(surface.key(key("escape")));
    assert(!surface.key(key("return")));
  } finally {
    surface.dispose();
  }
});
