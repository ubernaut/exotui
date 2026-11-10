// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects, assertThrows } from "./deps.ts";
import { beginMermaidInteractions, mermaidMetadata, safeMermaidHref } from "../src/content/mermaid_interactions.ts";
import type { MermaidStandardRuntime } from "../mod.mermaid.ts";
import { type MarkdownInteraction, MarkdownSurface, parseMarkdown, renderMarkdown } from "../mod.document.ts";
import { type MermaidScene, renderMermaidNativeFrame } from "../mod.mermaid.ts";

Deno.test("native interaction URLs reject executable schemes and control bytes under every trust policy", () => {
  for (
    const value of [
      "javascript:alert(1)",
      " JAVASCRIPT:alert(1)",
      "data:text/html,test",
      "vbscript:run",
      "java\nscript:test",
      "https://example.test/\x1b",
    ]
  ) {
    assertEquals(safeMermaidHref(value), undefined);
  }
  for (
    const value of ["https://example.test", "../product", "#section", "mailto:team@example.test", "product:selene"]
  ) assertEquals(safeMermaidHref(value), value);
  assertThrows(() => safeMermaidHref("x".repeat(4097)), RangeError);
  assertEquals(mermaidMetadata("title\x1b[31m\nsecond"), "title�[31m\nsecond");
  assertThrows(() => mermaidMetadata("x".repeat(4097)), RangeError);
});

class Database {
  readonly nodes = new Map([["B", { id: "B", domId: "node-B" }]]);
  setClickFun: (id: string, name: string, args?: string) => void;
  constructor() {
    this.setClickFun = Database.prototype.setClickFun.bind(this);
  }
  click(_id: string, _name: string, _args?: string): void {}
  getVertices() {
    return this.nodes;
  }
}

Deno.test("semantic DB capture handles fresh instances, quoted arguments, effective security and exact cleanup", async () => {
  // The pinned DB has a same-named prototype method which its constructor binds.
  Object.defineProperty(Database.prototype, "setClickFun", {
    value: Database.prototype.click,
    configurable: true,
    writable: true,
  });
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, "setClickFun");
  let securityLevel = "loose";
  const parser = { parser: { yy: new Database() } };
  const runtime = {
    mermaidAPI: {
      getDiagramFromText: () => Promise.resolve({ db: parser.parser.yy, parser }),
      getConfig: () => ({ securityLevel }),
    },
  } as unknown as MermaidStandardRuntime;
  const root = { closest: () => null, hasAttribute: () => false } as unknown as Element;
  const svg = {
    id: "render",
    getElementById: (id: string) => id === "render-node-B" ? root : null,
  } as unknown as SVGSVGElement;
  const scope = await beginMermaidInteractions(runtime, "upstream grammar owns this", true);
  try {
    const next = new Database();
    parser.parser.yy = next;
    next.setClickFun("B", "host.run", '"one,two", three');
    assertEquals(scope.resolve(svg).get(root)?.callbacks, [{ name: "host.run", args: ["one,two", "three"] }]);
    scope.reset();
    securityLevel = "strict";
    next.setClickFun("B", "host.run");
    assertEquals(scope.resolve(svg).size, 0);
    securityLevel = "loose";
    next.setClickFun("B", "host.run");
    assertEquals(scope.resolve(svg).get(root)?.callbacks, [{ name: "host.run", args: ["B"] }]);
    scope.dispose();
    assertEquals(Object.getOwnPropertyDescriptor(Database.prototype, "setClickFun"), descriptor);
    next.setClickFun("B", "host.run");
    assertEquals(scope.resolve(svg).size, 0, "A retained wrapper must not retain or record data after disposal.");
  } finally {
    scope.dispose();
  }
});

Deno.test("semantic callback bounds and upstream failures cannot strand an intercepted DB", async () => {
  const db = { setClickEvent(_ids: string, _name: string, _args?: string) {}, getTasks: () => [{ id: "B" }] };
  const descriptor = Object.getOwnPropertyDescriptor(db, "setClickEvent");
  const runtime = {
    mermaidAPI: { getDiagramFromText: () => Promise.resolve({ db }), getConfig: () => ({ securityLevel: "loose" }) },
  } as unknown as MermaidStandardRuntime;
  const scope = await beginMermaidInteractions(runtime, "gantt", true);
  try {
    assertThrows(() => db.setClickEvent("B", "x".repeat(4097)), RangeError);
    scope.reset();
    assertThrows(() => db.setClickEvent("B", "host.run", Array.from({ length: 129 }, () => "a").join(",")), RangeError);
    scope.reset();
    for (let i = 0; i < 1024; i++) db.setClickEvent("B", "host.run");
    assertThrows(() => db.setClickEvent("B", "host.run"), RangeError);
  } finally {
    scope.dispose();
  }
  assertEquals(Object.getOwnPropertyDescriptor(db, "setClickEvent"), descriptor);
  runtime.mermaidAPI!.getDiagramFromText = () => Promise.reject(new SyntaxError("upstream parse"));
  await assertRejects(() => beginMermaidInteractions(runtime, "invalid", true), SyntaxError);
  assertEquals(Object.getOwnPropertyDescriptor(db, "setClickEvent"), descriptor);
});

const action: MarkdownInteraction = { id: "B", title: "Run product", callbacks: [{ name: "host.run", args: ["B"] }] };

Deno.test("mounted Markdown dispatches rich callbacks without a fake href and clears hover on scroll/hide/disposal", async () => {
  const activated: MarkdownInteraction[] = [], hovered: (MarkdownInteraction | undefined)[] = [], links: string[] = [];
  const source = "```mermaid\nfixture\n```\n\nAfter.";
  const surface = new MarkdownSurface({
    source,
    render: {
      diagram: () => ({
        columns: 4,
        cells: [[{ char: "界", interaction: action }, { char: "", interaction: action }, {
          char: "L",
          href: "product:link",
          interaction: { href: "product:link", target: "_blank", title: "Link" },
        }, { char: " " }]],
      }),
    },
    onActivate: (value) => activated.push(value),
    onHover: (value) => hovered.push(value),
    onLink: (value) => links.push(value),
    initialSize: { columns: 4, rows: 1 },
  });
  try {
    await surface.ready;
    surface.render(4, 1);
    surface.hover(1, 0);
    surface.press(1, 0);
    assertEquals(activated, [action]);
    assertEquals(hovered, [action]);
    surface.press(2, 0);
    assertEquals(activated[1]?.target, "_blank");
    assertEquals(links, [], "Rich activation replaces legacy dispatch, not a second navigation.");
    surface.component.controller.scrollTo(2, 4, 1);
    await Promise.resolve();
    assertEquals(hovered.at(-1), undefined);
    surface.component.controller.scrollTo(0, 4, 1);
    surface.hover(1, 0);
    surface.component.visible.value = false;
    surface.press(1, 0);
    assertEquals(activated.length, 2);
    assertEquals(hovered.at(-1), undefined);
    surface.component.visible.value = true;
    surface.hover(1, 0);
    surface.component.rectangle.value = { column: 10, row: 0, width: 4, height: 1 };
    assertEquals(hovered.at(-1), undefined, "Moving a window must re-hit-test the absolute pointer.");
    surface.component.emit("mouseEvent", {
      key: "mouse",
      buffer: new Uint8Array(),
      x: 11,
      y: 0,
      movementX: 0,
      movementY: 0,
      ctrl: false,
      meta: false,
      shift: false,
    });
    assertEquals(hovered.at(-1), action);
    surface.component.state.value = "base";
    assertEquals(hovered.at(-1), undefined, "Losing native input ownership must clear the tooltip.");
    surface.component.state.value = "focused";
  } finally {
    surface.dispose();
  }
  assertEquals(hovered.at(-1), undefined);
  surface.press(1, 0);
  surface.hover(1, 0);
  assertEquals(activated.length, 2);
});

Deno.test("diagram pan/clipping removes targets from either clipped half of a wide glyph", () => {
  const document = parseMarkdown("```mermaid\nfixture\n```");
  const frame = {
    columns: 4,
    cells: [[
      { char: "界", href: "product:wide", interaction: action },
      { char: "", href: "product:wide", interaction: action },
      { char: "A" },
      { char: "B" },
    ]],
    offset: 1,
  };
  const first = renderMarkdown(document, { width: 2, diagram: () => frame });
  assertEquals(first[0]!.segments.find((span) => span.role === "diagram-label")?.interaction, undefined);
  frame.offset = 0;
  const last = renderMarkdown(document, { width: 1, diagram: () => frame });
  assert(!last[0]!.segments.some((span) => span.href || span.interaction));
});

Deno.test("native interaction metadata follows opacity, opaque occlusion and JSON transport", () => {
  const scene: MermaidScene = {
    width: 40,
    height: 20,
    title: "",
    description: "",
    diagnostics: [],
    items: [
      {
        kind: "text",
        text: "Action",
        x: 0,
        y: 0,
        width: 30,
        height: 10,
        color: "red",
        fontWeight: "normal",
        fontStyle: "normal",
        interaction: action,
      },
      {
        kind: "path",
        points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
        closed: true,
        paint: { fill: "blue", stroke: "none", strokeWidth: 0, dash: [], opacity: 1 },
      },
    ],
  };
  const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)), { columnUnits: 5, rowUnits: 10 });
  assertEquals(frame.cells[0]![0]!.interaction, undefined);
  assertEquals(frame.cells[0]![4]!.interaction, action);
  scene.composites = [{ start: 0, end: 1, opacity: 0, blendMode: "normal", depth: 0 }];
  assert(
    !renderMermaidNativeFrame(scene, { columnUnits: 5, rowUnits: 10 }).cells.flat().some((cell) => cell.interaction),
  );
});
