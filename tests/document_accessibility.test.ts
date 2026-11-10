// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  diagramAccessibilityNode,
  type DiagramSemanticNode,
  FlexMarkdownController,
  MarkdownController,
  type MarkdownDiagramFrame,
  parseMarkdown,
  renderMarkdown,
  snapshotDiagramAccessibility,
  snapshotDiagramSemanticContent,
} from "../mod.document.ts";
import {
  toAriaAttributes,
  toAriaAttributesWithDescription,
  toAriaTree,
  toTerminalProjection,
} from "../src/app/accessibility_tree.ts";
import { mermaidAccessibilityPreamble } from "../src/content/mermaid_accessibility_dom.ts";
import { Signal } from "../src/signals/mod.ts";
import { renderDomNodeToHtml } from "../src/web/dom_renderer.ts";
import { type SemanticAXInput, semanticAXMetadata, semanticAXTree } from "./fixtures/mermaid_standard/semantic_ax.ts";

const source = "Before.\n\n```mermaid\ngraph LR\nA --> B\n```\n\nAfter.";
function frame(): MarkdownDiagramFrame {
  return {
    columns: 8,
    cells: Array.from({ length: 10 }, () => Array.from("A──────B", (char) => ({ char }))),
    accessibility: {
      title: "Stack connections",
      description: "First line.\nSecond line.",
      role: "graphics-document document",
      roleDescription: "flowchart-v2",
    },
  };
}

Deno.test("document diagram metadata is immutable, bounded, inert and rejects terminal payloads", () => {
  const input = { title: '<script>alert("not executed")</script>', description: "A\n B" };
  const snapshot = snapshotDiagramAccessibility(input);
  assert(Object.isFrozen(snapshot));
  input.title = "Changed";
  assertEquals(snapshot.title, '<script>alert("not executed")</script>');
  assertThrows(() => snapshotDiagramAccessibility({ title: "x".repeat(4097) }), RangeError);
  assertThrows(() => snapshotDiagramAccessibility({ description: "x".repeat(32769) }), RangeError);
  assertThrows(() => snapshotDiagramAccessibility({ title: "bad\x1b]52;c;payload\x07" }), TypeError);
  assertThrows(() => snapshotDiagramAccessibility({ title: 42 as unknown as string }), TypeError);
  assertThrows(() => snapshotDiagramAccessibility({ hidden: "true" as unknown as boolean }), TypeError);
});

Deno.test("diagram projections preserve graphics roles and descriptions without claiming terminal ARIA", () => {
  const node = diagramAccessibilityNode(frame().accessibility!);
  assertEquals(toAriaAttributesWithDescription(node, "owned-description"), {
    role: "graphics-document document",
    "aria-label": "Stack connections",
    "aria-roledescription": "flowchart-v2",
    "aria-describedby": "owned-description",
  });
  assertEquals(toAriaTree(node).description, "First line.\nSecond line.");
  assertEquals(toAriaAttributes(node)["aria-describedby"], undefined);
  assertEquals(toAriaAttributes(node)["aria-description"], undefined);
  assertEquals(toTerminalProjection(node), { title: "Stack connections" });
  assertEquals(toTerminalProjection({ ...node, states: { focused: true } }), {
    title: "Stack connections",
    announcement: "Stack connections (graphics-document): First line. Second line.",
  });
  assertEquals(diagramAccessibilityNode({ role: "unknown img document" }).role, "img");
});

Deno.test("rendered diagram rows retain one root semantic identity through horizontal clipping", () => {
  const prepared = frame();
  const lines = renderMarkdown(parseMarkdown(source), { width: 4, diagram: () => ({ ...prepared, offset: 3 }) });
  const diagrams = lines.filter((line) => line.accessibility);
  assertEquals(diagrams.length, 11, "including the horizontal range indicator");
  assertEquals(diagrams[0]!.accessibility, prepared.accessibility);
  assert(diagrams.every((line) => line.accessibility === diagrams[0]!.accessibility));
  assert(
    !lines.filter((line) => line.text.includes("Before") || line.text.includes("After")).some((line) =>
      line.accessibility
    ),
  );
  prepared.accessibility = { title: "New name" };
  assertEquals(diagrams[0]!.accessibility!.title, "Stack connections");
});

Deno.test("Markdown semantic targets use painted rows and clear on source, visibility and disposal", () => {
  const borrowed = new Signal(source);
  const prepared = frame();
  const controller = new MarkdownController({ source: borrowed, render: { diagram: () => prepared } });
  try {
    const all = controller.accessibilityTargets(8);
    assertEquals(all.length, 1);
    assertEquals(all[0]!.height, 10);
    controller.scrollTo(all[0]!.row + 4, 8, 3);
    assertEquals(controller.accessibilityTargets(8, 3).map((target) => target.key), [all[0]!.key]);
    controller.scrollTo(0, 8, 1);
    assertEquals(controller.accessibilityTargets(8, 1), []);
    prepared.accessibility = { ...prepared.accessibility, hidden: true };
    controller.invalidate();
    assertEquals(controller.accessibilityTargets(8), []);
    borrowed.value = "No diagram now.";
    assertEquals(controller.accessibilityTargets(8), []);
    controller.dispose();
    assertEquals(controller.accessibilityTargets(8), []);
    assertEquals(borrowed.inspect().disposed, false);
  } finally {
    controller.dispose();
    borrowed.dispose();
  }
});

Deno.test("flex semantics are reading ordered and scoped to the solved panel models", () => {
  const controller = new FlexMarkdownController({
    sections: [{
      id: "chapter",
      label: "Stack",
      rows: [{ panels: [{ id: "left", source }, { id: "right", source }] }],
    }],
    render: { diagram: () => frame() },
  });
  try {
    const wide = controller.accessibilityTargets(120);
    assertEquals(wide.map((target) => target.scope), ["left", "right"]);
    assert(wide[0]!.key !== wide[1]!.key);
    assertEquals(wide[0]!.row, wide[1]!.row);
    const narrow = controller.accessibilityTargets(30);
    assert(narrow[1]!.row > narrow[0]!.row);
    controller.scrollTo(narrow[1]!.row + 2, 30, 3);
    assertEquals(controller.accessibilityTargets(30, 3).map((target) => target.scope), ["right"]);
    controller.setSections([]);
    assertEquals(controller.accessibilityTargets(30), []);
    controller.dispose();
    assertEquals(controller.accessibilityTargets(30), []);
  } finally {
    controller.dispose();
  }
});

Deno.test("pinned-family accessibility preambles preserve body indentation, policy and original supported syntax", () => {
  const original =
    "---\nconfig:\n  securityLevel: loose\n---\nmindmap\n  accTitle: Map\n  accDescr {\n    Two lines.\n    Second line.\n  }\n  root((Root))\n    Child";
  const prepared = mermaidAccessibilityPreamble(original);
  assertEquals(prepared.source, "---\nconfig:\n  securityLevel: loose\n---\nmindmap\n  root((Root))\n    Child");
  assertEquals(prepared.accessibility, { title: "Map", description: "Two lines.\nSecond line." });
  const supported = "flowchart LR\naccTitle: First\nA-->B\naccTitle: Last";
  assertEquals(mermaidAccessibilityPreamble(supported), { source: supported });
  const directive = '%%{init: {"securityLevel":"loose"}}%%\nblock\naccTitle: First\naccTitle: Last\nA';
  assertEquals(mermaidAccessibilityPreamble(directive).source, '%%{init: {"securityLevel":"loose"}}%%\nblock\nA');
  assertEquals(mermaidAccessibilityPreamble(directive).accessibility!.title, "Last");
  const combined =
    '---\nconfig:\n  theme: dark\n---\n%%{init:\n {"securityLevel":"loose"}\n}%%\nblock\naccTitle: Safe title\nA';
  assertEquals(mermaidAccessibilityPreamble(combined).source, combined.replace("accTitle: Safe title\n", ""));
  assertEquals(mermaidAccessibilityPreamble(combined).accessibility!.title, "Safe title");
  assertEquals(mermaidAccessibilityPreamble("kanban\nA[accTitle: literal label]"), {
    source: "kanban\nA[accTitle: literal label]",
  });
  assertThrows(() => mermaidAccessibilityPreamble("mindmap\naccDescr {unterminated\n  Root"), SyntaxError);
  assertThrows(() => mermaidAccessibilityPreamble("mindmap\naccDescr {text} trailing\n  Root"), SyntaxError);
});

Deno.test("ZenUML common accessibility preamble preserves the real body and validates inert metadata", () => {
  const body = "title Demo\nA->B: accTitle: literal label";
  const source = `zenuml\naccTitle: Zen title\naccDescr {\nFirst line.\nSecond line.\n}\n${body}`;
  assertEquals(mermaidAccessibilityPreamble(source), {
    source: `zenuml\n${body}`,
    accessibility: { title: "Zen title", description: "First line.\nSecond line." },
  });
  assertEquals(mermaidAccessibilityPreamble(`zenuml\n${body}`), { source: `zenuml\n${body}` });
  assertThrows(() => mermaidAccessibilityPreamble("zenuml\naccTitle: bad\x1b[31m\nA->B: Message"), TypeError);
  assertThrows(() => mermaidAccessibilityPreamble("zenuml\naccDescr {unterminated\nA->B: Message"), SyntaxError);
});

Deno.test("diagram content keeps label formatting and structural MathML through immutable JSON snapshots", () => {
  const content: DiagramSemanticNode[] = [{ tag: "strong", text: "Readable label" }, {
    tag: "math",
    attributes: { display: "block" },
    children: [{
      tag: "mfrac",
      children: [{ tag: "mi", text: "x" }, {
        tag: "msup",
        children: [{ tag: "mi", text: "y" }, { tag: "mn", text: "2" }],
      }],
    }],
  }];
  const snapshot = snapshotDiagramAccessibility({ content });
  assertEquals(snapshot.content, content);
  assert(Object.isFrozen(snapshot.content));
  assert(Object.isFrozen(snapshot.content![1]!.attributes));
  assert(Object.isFrozen(snapshot.content![1]!.children![0]!.children));
  content[0] = { tag: "span", text: "Mutated" };
  assertEquals(snapshot.content![0]!.text, "Readable label");
  assertEquals(snapshotDiagramSemanticContent(JSON.parse(JSON.stringify(snapshot.content))), snapshot.content);
});

Deno.test("diagram semantic transport rejects unsafe elements, attributes, callbacks and terminal payloads", () => {
  for (const tag of ["script", "img", "a", "style", "iframe", "annotation-xml"]) {
    assertThrows(() => snapshotDiagramSemanticContent([{ tag: tag as DiagramSemanticNode["tag"] }]), TypeError);
  }
  for (const name of ["onclick", "href", "src", "style", "class", "id", "aria-labelledby"]) {
    assertThrows(() => snapshotDiagramSemanticContent([{ tag: "math", attributes: { [name]: "bad" } }]), TypeError);
  }
  assertThrows(() => snapshotDiagramSemanticContent([{ tag: "span", text: "bad\x1b]52;c;data\x07" }]), TypeError);
  for (const href of ["javascript:alert(1)", " data:text/html,evil", "java\nscript:alert(1)"]) {
    assertThrows(() => snapshotDiagramSemanticContent([{ tag: "span", interaction: { href } }]), TypeError);
  }
  const callbacks = [{ name: "host.run", args: ["one,two", "three"] }];
  const retained = snapshotDiagramSemanticContent([{ tag: "span", interaction: { callbacks } }]);
  callbacks[0]!.args[0] = "Changed";
  assertEquals(retained[0]!.interaction!.callbacks![0]!.args, ["one,two", "three"]);
  assert(Object.isFrozen(retained[0]!.interaction!.callbacks![0]!.args));
});

Deno.test("captured MathML casing survives JSON without allowing arbitrary CSS or overriding automatic operands", () => {
  const content: DiagramSemanticNode[] = [{
    tag: "math",
    children: [{ tag: "mtext", text: "STRASSE", textTransform: "none" }, { tag: "mi", text: "x" }],
  }];
  const captured = snapshotDiagramSemanticContent(content);
  assertEquals(snapshotDiagramSemanticContent(JSON.parse(JSON.stringify(captured))), content);
  assertEquals(captured[0]!.children![1]!.textTransform, undefined);
  assert(Object.isFrozen(captured[0]!.children![0]));
  for (const mode of ["uppercase", "math-auto", "none; background:url(bad)"]) {
    assertThrows(
      () => snapshotDiagramSemanticContent([{ tag: "mi", textTransform: mode as "none" }]),
      TypeError,
    );
  }
  assertThrows(() => snapshotDiagramSemanticContent([{ tag: "span", textTransform: "none" }]), TypeError);
});

Deno.test("diagram semantic structure bounds cycles, depth, aggregate nodes and text", () => {
  const children: DiagramSemanticNode[] = [];
  const cycle: DiagramSemanticNode = { tag: "span", children };
  children.push(cycle);
  assertThrows(() => snapshotDiagramSemanticContent(children), TypeError);
  let deep: DiagramSemanticNode = { tag: "span", text: "bottom" };
  for (let depth = 0; depth < 66; depth++) deep = { tag: "span", children: [deep] };
  assertThrows(() => snapshotDiagramSemanticContent([deep]), RangeError);
  assertThrows(() => snapshotDiagramSemanticContent(Array.from({ length: 4097 }, () => ({ tag: "span" }))), RangeError);
  assertThrows(
    () =>
      snapshotDiagramSemanticContent([{ tag: "span", children: Array.from({ length: 4096 }, () => ({ tag: "br" })) }]),
    RangeError,
  );
  assertThrows(
    () => snapshotDiagramSemanticContent(Array.from({ length: 32 }, () => ({ tag: "span", text: "x".repeat(4096) }))),
    RangeError,
  );
});

Deno.test("painted Markdown and solved flex semantic targets retain structured content through scrolling and source removal", () => {
  const prepared = frame();
  prepared.accessibility = {
    ...prepared.accessibility,
    content: [{ tag: "p", children: [{ tag: "strong", text: "Readable" }] }],
  };
  const controller = new MarkdownController({ source, render: { diagram: () => prepared } });
  const flex = new FlexMarkdownController({
    sections: [{ id: "chapter", label: "Chapter", rows: [{ panels: [{ id: "card", source }] }] }],
    render: { diagram: () => prepared },
  });
  try {
    for (const width of [8, 30, 120]) {
      const target = controller.accessibilityTargets(width)[0]!;
      assertEquals(target.content, prepared.accessibility.content);
      controller.scrollTo(target.row + 3, width, 3);
      assertEquals(controller.accessibilityTargets(width, 3)[0]!.content, target.content);
      assertEquals(flex.accessibilityTargets(width)[0]!.content, target.content);
    }
    controller.setSource("No diagram.");
    flex.setSections([]);
    assertEquals(controller.accessibilityTargets(30), []);
    assertEquals(flex.accessibilityTargets(30), []);
  } finally {
    controller.dispose();
    flex.dispose();
  }
});

Deno.test("DOM descriptors serialize native MathML with escaped inert text and unchanged HTML tags", () => {
  assertEquals(
    renderDomNodeToHtml({
      mathTag: "math",
      children: [{ mathTag: "mfrac", children: [{ mathTag: "mi", text: "x<y" }, { mathTag: "mn", text: "2" }] }],
    }),
    "<math><mfrac><mi>x&lt;y</mi><mn>2</mn></mfrac></math>",
  );
  assertEquals(renderDomNodeToHtml({ tag: "strong", text: "Label" }), "<strong>Label</strong>");
});

Deno.test("mixed MathML keeps ordered inert text nodes through bounded immutable JSON", () => {
  const content: DiagramSemanticNode[] = [{
    tag: "mtext",
    children: [{ tag: "#text", text: "Mi" }, { tag: "span", text: "xed" }, { tag: "#text", text: " case" }],
  }];
  const retained = snapshotDiagramSemanticContent(content);
  assertEquals(snapshotDiagramSemanticContent(JSON.parse(JSON.stringify(retained))), content);
  assert(Object.isFrozen(retained[0]!.children![0]));
  assertEquals(
    renderDomNodeToHtml({ mathTag: "mtext", children: ["Mi", { tag: "span", text: "xed" }, " case"] }),
    "<mtext>Mi<span>xed</span> case</mtext>",
  );
  assertEquals(
    renderDomNodeToHtml({ tag: "span", children: ['<script>&"', { tag: "strong", text: "safe" }, ">"] }),
    "<span>&lt;script&gt;&amp;&quot;<strong>safe</strong>&gt;</span>",
  );
});

Deno.test("semantic text nodes cannot carry element metadata, nested children or unbounded payloads", () => {
  for (
    const metadata of [
      { children: [] },
      { attributes: {} },
      { interaction: {} },
      { role: "img" },
      {
        whiteSpace: "pre",
      },
      { textTransform: "none" },
      { label: "name" },
    ]
  ) {
    assertThrows(
      () => snapshotDiagramSemanticContent([{ tag: "#text", text: "safe", ...metadata } as DiagramSemanticNode]),
      TypeError,
    );
  }
  assertThrows(() => snapshotDiagramSemanticContent([{ tag: "#text" }]), TypeError);
  assertThrows(() => snapshotDiagramSemanticContent([{ tag: "#text", text: "bad\x1b" }]), TypeError);
  assertThrows(() => snapshotDiagramSemanticContent([{ tag: "#text", text: "x".repeat(4097) }]), RangeError);
  assertThrows(
    () => snapshotDiagramSemanticContent(Array.from({ length: 4097 }, () => ({ tag: "#text", text: "" }))),
    RangeError,
  );
  assertThrows(
    () => snapshotDiagramSemanticContent(Array.from({ length: 33 }, () => ({ tag: "#text", text: "x".repeat(4096) }))),
    RangeError,
  );
  assertEquals(snapshotDiagramSemanticContent([{ tag: "#text", text: "Recovered" }])[0]!.text, "Recovered");
});

Deno.test("diagram semantics retain only owned whitespace modes and reject source CSS payloads", () => {
  for (const whiteSpace of ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"] as const) {
    const retained = snapshotDiagramSemanticContent([{ tag: "span", text: "First  Second", whiteSpace }]);
    assertEquals(retained[0]!.whiteSpace, whiteSpace);
    assert(Object.isFrozen(retained[0]));
  }
  assertThrows(
    () => snapshotDiagramSemanticContent([{ tag: "span", whiteSpace: "pre; background:url(bad)" as "pre" }]),
    TypeError,
  );
});

Deno.test("presentational diagram roots keep content without inventing named graphics or announcements", () => {
  for (const role of ["none", "presentation"] as const) {
    const metadata = {
      title: "Not a semantic name",
      description: "Not a semantic description",
      role,
      content: [{ tag: "span" as const, text: "Readable body" }],
    };
    const node = diagramAccessibilityNode(metadata);
    assertEquals(node, { role });
    assertEquals(toAriaAttributes(node), { role });
    assertEquals(toTerminalProjection(node), {});
    const prepared = { ...frame(), accessibility: metadata };
    const controller = new MarkdownController({ source, render: { diagram: () => prepared } });
    try {
      assertEquals(controller.accessibilityTargets(30)[0]!.content, metadata.content);
    } finally {
      controller.dispose();
    }
  }
});

Deno.test("independent AX oracle distinguishes parent relationships that have identical semantic role preorder", () => {
  const tree: SemanticAXInput[] = [
    { nodeId: "root", ignored: false, role: { value: "document" }, name: { value: "Test" }, childIds: ["outer"] },
    { nodeId: "outer", ignored: false, role: { value: "MathMLRow" }, childIds: ["inner", "second"] },
    { nodeId: "inner", ignored: false, role: { value: "MathMLRow" }, childIds: ["first"] },
    { nodeId: "first", ignored: false, role: { value: "MathMLIdentifier" }, name: { value: "x" } },
    { nodeId: "second", ignored: false, role: { value: "MathMLIdentifier" }, name: { value: "y" } },
  ];
  const original = semanticAXTree(tree, "Test");
  const moved = JSON.parse(JSON.stringify(tree)) as SemanticAXInput[];
  moved[1]!.childIds = ["inner"];
  moved[2]!.childIds = ["first", "second"];
  assert(JSON.stringify(original) !== JSON.stringify(semanticAXTree(moved, "Test")));
  assertEquals(original, [{
    role: "MathMLRow",
    children: [{ role: "MathMLRow", children: [{ role: "MathMLIdentifier", name: "x" }] }, {
      role: "MathMLIdentifier",
      name: "y",
    }],
  }]);
});

Deno.test("independent AX metadata oracle keeps literal name and description separately from nested content", () => {
  const tree: SemanticAXInput[] = [
    { nodeId: "root", ignored: false, name: { value: "Comparison" }, childIds: ["ignored"] },
    { nodeId: "ignored", ignored: true, childIds: ["diagram"] },
    {
      nodeId: "diagram",
      ignored: false,
      role: { value: "graphics-document" },
      name: { value: "Literal title" },
      description: { value: "DESCRIPTION TEXT" },
      childIds: ["text"],
    },
    { nodeId: "text", ignored: false, role: { value: "StaticText" }, name: { value: "STRASSE" } },
  ];
  assertEquals(semanticAXMetadata(tree, "Comparison"), { title: "Literal title", description: "DESCRIPTION TEXT" });
  assertEquals(semanticAXTree(tree, "Comparison"), [{ role: "StaticText", name: "STRASSE" }]);
  assertThrows(() => semanticAXMetadata(tree, "Missing"), Error);
});

Deno.test("independent AX oracle retains named generic SVG text and descriptions without inventing groups", () => {
  const tree: SemanticAXInput[] = [
    { nodeId: "root", ignored: false, name: { value: "Comparison" }, childIds: ["named"] },
    {
      nodeId: "named",
      ignored: false,
      role: { value: "generic" },
      name: { value: "Own title" },
      description: { value: "Own description" },
      childIds: ["text"],
    },
    { nodeId: "text", ignored: false, role: { value: "StaticText" }, name: { value: "Shown" } },
  ];
  assertEquals(semanticAXTree(tree, "Comparison"), [{
    role: "generic",
    name: "Own title",
    description: "Own description",
    children: [{ role: "StaticText", name: "Shown" }],
  }]);
  tree[1]!.role = { value: "group" };
  assertEquals(semanticAXTree(tree, "Comparison")[0]!.role, "group");
});

Deno.test("independent AX oracle preserves meaningful whitespace and joins only same-parent text fragments", () => {
  const tree: SemanticAXInput[] = [
    {
      nodeId: "root",
      ignored: false,
      role: { value: "document" },
      name: { value: "Test" },
      childIds: ["first", "second"],
    },
    { nodeId: "first", ignored: false, role: { value: "StaticText" }, name: { value: "First " } },
    { nodeId: "second", ignored: false, role: { value: "StaticText" }, name: { value: " Second\n Third" } },
  ];
  assertEquals(semanticAXTree(tree, "Test"), [{ role: "StaticText", name: "First  Second\n Third" }]);
  tree[1]!.name = { value: "First" };
  assertEquals(semanticAXTree(tree, "Test"), [{ role: "StaticText", name: "First Second\n Third" }]);
  tree[1]!.childIds = ["root"];
  assertThrows(() => semanticAXTree(tree, "Test"), TypeError);
  tree[1]!.childIds = ["missing"];
  assertThrows(() => semanticAXTree(tree, "Test"), Error);
});
