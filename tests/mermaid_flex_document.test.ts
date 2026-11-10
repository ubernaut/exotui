// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import {
  MermaidFlexMarkdownController,
  type MermaidFlexMarkdownOptions,
  MermaidFlexMarkdownSurface,
  MermaidMarkdownCache,
  type MermaidMarkdownSettings,
  type MermaidStandardDiagram,
  type MermaidStandardOptions,
} from "../mod.mermaid.ts";
import { type FlexMarkdownSection, TITLE_HEADING_FONTS } from "../mod.document.ts";
import { Signal } from "../src/signals/mod.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";

const code = (label: string) => `\`\`\`mermaid\n${label}\n\`\`\``;
const render = { headingFonts: TITLE_HEADING_FONTS, headingArt: "title" as const, wrapHeadingArt: false };

function diagram(source: string, options: MermaidStandardOptions = {}): MermaidStandardDiagram {
  if (source === "invalid") throw new Error("Invalid diagram\x1b[2J.");
  return {
    source,
    diagramType: "fixture",
    version: "fixture",
    svg: "<svg/>",
    scene: {
      width: options.containerWidth!,
      height: source === "tall" ? 350 : 120,
      title: "",
      description: "",
      diagnostics: [],
      items: [{
        kind: "text",
        text: source,
        x: 15,
        y: 20,
        width: 100,
        height: 16,
        color: options.config?.theme === "dark" ? "rgb(255,0,0)" : "rgb(0,255,0)",
        fontWeight: "400",
        fontStyle: "normal",
        href: `product:${source}`,
      }],
    },
  };
}

async function turns(count = 16) {
  for (let i = 0; i < count; i++) await Promise.resolve();
}

function verifyContent(surface: MermaidFlexMarkdownSurface, width: number, height: number): void {
  const actual = surface.render(width, height).map(stripStyles);
  const layout = surface.controller.layout(width);
  const offset = surface.controller.inspect(width, height).offset;
  assert(actual.every((row) => textWidth(row) === width));
  for (const box of layout.panels) {
    const c = box.contentRect;
    const expected = surface.controller.panelController(box.panel.id)!.render(c.width);
    assertEquals(c.height, Math.max(1, expected.length));
    for (let row = Math.max(offset, c.row); row < Math.min(c.row + c.height, offset + height); row++) {
      assertEquals(
        actual[row - offset]!.slice(c.column, c.column + c.width),
        (expected[row - c.row]?.text ?? "") + " ".repeat(c.width - textWidth(expected[row - c.row]?.text ?? "")),
        `${box.panel.id} at width ${width}, offset ${offset}, row ${row}`,
      );
    }
  }
}

Deno.test("Mermaid flex options preserve typed Markdown and reserve ownership of the full diagram hook", () => {
  const valid: MermaidFlexMarkdownOptions = { sections: [], render: { headingArt: "title" } };
  const invalid: MermaidFlexMarkdownOptions = {
    sections: [],
    // @ts-expect-error Full Mermaid owns the measured diagram hook.
    render: { diagram: () => undefined },
  };
  assertEquals(valid.render?.headingArt, "title");
  assert(invalid.render);
});

Deno.test("async Mermaid flex measures and paints shared native frames at actual content widths without one-column remounts", async () => {
  const calls: { source: string; options: MermaidStandardOptions }[] = [];
  const cache = new MermaidMarkdownCache({
    compile: (source, options = {}) => {
      calls.push({ source, options });
      return Promise.resolve(diagram(source, options));
    },
  });
  const document: FlexMarkdownSection[] = [{
    id: "chapter",
    label: "Stack",
    rows: [
      { fullWidth: true, panels: [{ id: "cover", source: "# Stack\n\nOpening." }] },
      {
        panels: [
          { id: "left", kind: "card", source: "# Left\n\n" + code("shared"), href: "product:card" },
          { id: "right", kind: "card", source: "# Right\n\n" + code("shared") },
        ],
      },
      { panels: [{ id: "tail", source: "After diagrams.\n\n" + "Tail.\n\n".repeat(20) }] },
    ],
  }];
  const links: string[] = [];
  const surface = new MermaidFlexMarkdownSurface(cache, {
    sections: document,
    render,
    onLink: (href) => links.push(href),
  });
  try {
    const initial = surface.controller.layout(120);
    surface.render(120, 15);
    await surface.settled(120);
    const ready = surface.controller.layout(120);
    assert(ready.height > initial.height, "Accepted diagrams must invalidate same-width panel measurements.");
    assertEquals(calls.length, 1, "Identical diagram panels must share cache leases, including mounted views.");
    assertEquals(calls[0]!.options.containerWidth, ready.panels[1]!.contentRect.width * 9);
    assertEquals(surface.controller.panelController("cover")!.render(120).length, 7);
    assertEquals(surface.controller.panelController("left")!.render(53)[0]!.text, "Left");
    for (const width of [120, 48, 160, 120]) {
      surface.render(width, 15);
      await surface.settled(width);
      const end = surface.controller.inspect(width, 9).maxOffset;
      for (const offset of [0, 3, Math.floor(end / 2), end, 0]) {
        surface.controller.scrollTo(offset, width, 9);
        verifyContent(surface, width, 9);
        await turns(2);
        verifyContent(surface, width, 9);
      }
    }
    assertEquals(calls.map((call) => call.options.containerWidth), [477, 378]);
    const box = surface.controller.layout(120).panels[1]!;
    const lines = surface.controller.panelController("left")!.render(box.contentRect.width);
    const line = lines.findIndex((line) => line.segments.some((span) => span.href === "product:shared"));
    assert(line >= 0);
    const spans = lines[line]!.segments;
    const before = spans.slice(0, spans.findIndex((span) => span.href === "product:shared"));
    const column = box.contentRect.column + before.reduce((width, span) => width + textWidth(span.text), 0);
    surface.controller.scrollTo(box.contentRect.row + line, 120, 9);
    surface.render(120, 9);
    surface.press(column, 0);
    assertEquals(links, ["product:shared"], "Diagram links must override card links even after clipped painting.");
    surface.controller.scrollTo(box.rect.row, 120, 9);
    surface.render(120, 9);
    surface.press(box.rect.column, 0);
    assertEquals(links.at(-1), "product:card");
  } finally {
    surface.dispose();
    surface.dispose();
    assertEquals(cache.inspect().disposed, false);
    cache.dispose();
  }
});

Deno.test("Mermaid flex reactive source/theme refresh keeps scroll anchors, isolates windows and recovers from safe errors", async () => {
  const source = new Signal(code("short"));
  const settings = new Signal<MermaidMarkdownSettings>({ native: { background: "rgb(10,12,20)" } });
  let calls = 0;
  const cache = new MermaidMarkdownCache({
    compile: (source, options = {}) => {
      calls++;
      return Promise.resolve().then(() => diagram(source, options));
    },
  });
  const document: FlexMarkdownSection[] = [{
    id: "chapter",
    label: "Live",
    rows: [
      { panels: [{ id: "diagram", source }] },
      { panels: [{ id: "anchor", source: "Anchor.\n\n" + "Following.\n\n".repeat(30) }] },
    ],
  }];
  const first = new MermaidFlexMarkdownSurface(cache, { sections: document, settings });
  const second = new MermaidFlexMarkdownSurface(cache, { sections: document });
  try {
    await Promise.all([first.settled(80), second.settled(80)]);
    assertEquals(calls, 1);
    first.controller.scrollTo(first.controller.layout(80).panels[1]!.rect.row + 2, 80, 10);
    source.value = code("tall");
    await Promise.all([first.settled(80), second.settled(80)]);
    assertEquals(first.controller.offset.peek(), first.controller.layout(80).panels[1]!.rect.row + 2);
    verifyContent(first, 80, 10);
    const before = first.controller.panelController("diagram")!.render(80).flatMap((row) => row.segments).map((span) =>
      span.style
    );
    settings.value = { compile: { config: { theme: "dark" } }, native: { background: "rgb(10,12,20)" } };
    await first.settled(80);
    const after = first.controller.panelController("diagram")!.render(80).flatMap((row) => row.segments).map((span) =>
      span.style
    );
    assert(JSON.stringify(before) !== JSON.stringify(after));
    assertEquals(second.controller.panelController("diagram")!.settings.peek().compile, undefined);
    source.value = code("invalid");
    await Promise.all([first.settled(80), second.settled(80)]);
    assertEquals(first.controller.panelController("diagram")!.state.peek().phase, "error");
    const text = first.controller.panelController("diagram")!.text(80);
    assertStringIncludes(text, "Mermaid error:");
    assert(!text.includes("\x1b"));
    source.value = code("recovered");
    await Promise.all([first.settled(80), second.settled(80)]);
    assertEquals(first.controller.panelController("diagram")!.state.peek().phase, "ready");
    const previous = calls;
    cache.invalidate();
    await Promise.all([first.settled(80), second.settled(80)]);
    assertEquals(calls, previous + 2);
  } finally {
    first.dispose();
    second.dispose();
    assertEquals(source.disposed, false);
    assertEquals(settings.disposed, false);
    assertEquals(source.inspect().subscriptions, 0);
    assertEquals(settings.inspect().subscriptions, 0);
    cache.dispose();
    source.dispose();
    settings.dispose();
  }
});

Deno.test("removing Mermaid flex panels cancels only owned leases and refuses late native geometry", async () => {
  let finish!: (diagram: MermaidStandardDiagram) => void;
  const pending = new Promise<MermaidStandardDiagram>((resolve) => finish = resolve);
  let owned!: AbortSignal;
  let calls = 0;
  const cache = new MermaidMarkdownCache({
    compile: (_, options = {}) => {
      calls++;
      owned = options.signal!;
      return pending;
    },
  });
  const document: FlexMarkdownSection[] = [{
    id: "chapter",
    label: "Live",
    rows: [{ panels: [{ id: "first", source: code("pending") }] }, {
      panels: [{ id: "second", source: code("pending") }],
    }],
  }];
  const surface = new MermaidFlexMarkdownSurface(cache, { sections: document });
  try {
    surface.render(80, 8);
    const settling = surface.settled(80);
    await turns();
    assertEquals(calls, 1);
    const first = surface.controller.panelController("first")!;
    const second = surface.controller.panelController("second")!;
    surface.setSections([{ ...document[0]!, rows: [{ panels: [document[0]!.rows[1]!.panels[0]!] }] }]);
    await turns();
    assertEquals(first.state.peek().phase, "disposed");
    assertEquals(surface.controller.panelController("second"), second);
    assert(!owned.aborted, "A removed panel must not cancel another panel's equal request.");
    surface.setSections([]);
    await settling;
    assert(owned.aborted);
    assertEquals(second.state.peek().phase, "disposed");
    finish(diagram("late", { containerWidth: 720 }));
    await turns();
    assertEquals(cache.inspect().entries, 0);
    assertEquals(cache.inspect().pending, 0);
    assertEquals(surface.controller.layout(80).panels.length, 0);
    assertThrows(() => surface.controller.layout(0), RangeError);
  } finally {
    surface.dispose();
    cache.dispose();
  }
});

Deno.test("Mermaid flex settling follows structural changes while earlier panels compile", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => finish = resolve);
  const cache = new MermaidMarkdownCache({
    compile: async (source, options = {}) => {
      if (source === "pending") await pending;
      return diagram(source, options);
    },
  });
  const controller = new MermaidFlexMarkdownController(cache, {
    sections: [{ id: "chapter", label: "Live", rows: [{ panels: [{ id: "first", source: code("pending") }] }] }],
  });
  try {
    const settling = controller.settled(80);
    await turns();
    controller.setSections([{
      id: "chapter",
      label: "Updated",
      rows: [{ panels: [{ id: "first", source: code("pending") }] }, { panels: [{ id: "new", source: code("new") }] }],
    }]);
    finish();
    await settling;
    assertEquals(controller.panelController("new")!.state.peek().phase, "ready");
    assertEquals(controller.panelController("new")!.state.peek().width, 80);
    assertStringIncludes(controller.panelController("new")!.text(80), "new");
  } finally {
    controller.dispose();
    cache.dispose();
  }
});
