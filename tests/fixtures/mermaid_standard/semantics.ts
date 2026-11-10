// Copyright 2023 Im-Beast. MIT license.
/** Real engine content/MathML and independent browser AX subtrees; not a second diagram grammar. */
import { type DiagramSemanticNode, DocumentAccessibilityDOM, MarkdownController } from "../../../mod.document.ts";
import {
  extractMermaidScene,
  type MermaidStandardDiagram,
  type MermaidStandardRenderer,
  renderMermaidNativeFrame,
} from "../../../mod.mermaid.ts";
import { mermaidSVGAccessibility } from "../../../src/content/mermaid_accessibility_dom.ts";
import { MERMAID_STANDARD_FIXTURES } from "./catalogue.ts";
import { MERMAID_MATH_FIXTURES } from "./math.ts";
import { verifyMermaidAccessibilityTransport } from "./accessibility.ts";
import { MERMAID_GENERATED_CONTENT_FIXTURES, verifyMermaidGeneratedContentScene } from "./generated_content.ts";
import { verifyMermaidCounterSourceConfig } from "./counter_source_config.ts";
import { verifyMermaidTerminalDecorations, verifyMermaidTextDecorations } from "./text_decoration.ts";
export { verifyMermaidGeneratedContentGuards } from "./generated_content.ts";

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function nodes(content: readonly DiagramSemanticNode[]): DiagramSemanticNode[] {
  return content.flatMap((node) => [node, ...nodes(node.children ?? [])]);
}

const mixedMathFixtures = [
  { name: "mixed-mtext", body: "<mtext>Mi<span>xed</span> case</mtext>", text: "Mixed case" },
  {
    name: "mixed-uppercase",
    body: "<mtext style='text-transform:uppercase'>Mi<span>xed</span> case</mtext>",
    text: "MIXED CASE",
  },
  {
    name: "mixed-style-override",
    body: "<mtext style='text-transform:uppercase'>Mi<span style='text-transform:lowercase'>XED</span> case</mtext>",
    text: "MIxed CASE",
  },
  { name: "mixed-identifier", body: "<mi>x<span>y</span>z</mi>", text: "xyz" },
  { name: "mixed-automatic-identifier", body: "<mi>x<span></span></mi>", text: "x" },
  { name: "mixed-number", body: "<mn>1<span>2</span>3</mn>", text: "123" },
  { name: "mixed-operator", body: "<mo>+<span>=</span>-</mo>", text: "+=-" },
  { name: "mixed-string", body: "<ms>Mi<span>xed</span> case</ms>", text: "Mixed case" },
  { name: "default-string", body: "<ms>inside</ms>", text: "inside" },
  { name: "legacy-string-quotes", body: "<ms lquote='aa' rquote='bb'>inside</ms>", text: "inside" },
  { name: "authored-string-quotes", body: "<ms>&quot;inside&quot;</ms>", text: '"inside"' },
  {
    name: "uppercase-string-quotes",
    body: "<ms style='text-transform:uppercase' lquote='aa' rquote='bb'>Straße</ms>",
    text: "STRASSE",
  },
  { name: "mixed-token-whitespace", body: "<mtext> <span>\u00a0</span> x<span> </span> </mtext>", text: " \u00a0 x  " },
] as const;

/** Compile actual upstream examples and retain only portable values for use after compiler disposal. */
export async function verifyMermaidSemantics(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  const names = ["flowchart-features", "sequenceDiagram", "classDiagram", "gantt", "mindmap", "flowchart-markdown"];
  for (
    const source of [
      ...names.map((name) => MERMAID_STANDARD_FIXTURES.find((fixture) => fixture.name === name)!.source),
      ...MERMAID_MATH_FIXTURES.map((fixture) => fixture.source),
      'flowchart TB\nA[Linked label]-->B[Host action]\nclick A href "https://example.test/semantic"\nclick B call host.run("one,two", three)',
      'classDiagram\nclass A\nclass B\nA-->B\nclick A href "https://example.test/semantic"\nclick B call host.run("one,two", three)',
      'gantt\ndateFormat YYYY-MM-DD\nsection Test\nLink :A, 2026-01-01, 2d\nAction :B, after A, 2d\nclick A href "https://example.test/semantic"\nclick B call host.run("one,two", three)',
      'flowchart LR\nA["<div><strong>First</strong> <em>Second</em> Third</div>"]',
      "flowchart LR\nA[\"<div style='white-space:pre'><strong>First</strong>  <em>Second</em> Third</div>\"]",
      "flowchart LR\nA[\"<div style='white-space:pre'>  <em>Indented</em>&nbsp; tail</div>\"]",
    ]
  ) {
    const diagram = await renderer.compile(source, { trusted: true, config: { securityLevel: "loose" } });
    require(diagram.scene?.accessibility?.content?.length, "Actual diagram content missing");
    require(
      Object.isFrozen(renderMermaidNativeFrame(diagram.scene).accessibility!.content),
      "Native content not snapshotted",
    );
    retained.push(JSON.parse(JSON.stringify(diagram)));
  }
  for (const fixture of mixedMathFixtures) {
    const diagram = await renderer.compile(`flowchart LR\nA["<math>${fixture.body}</math>"]`, {
      trusted: true,
      config: { securityLevel: "loose", htmlLabels: true, flowchart: { htmlLabels: true } },
    });
    const content = diagram.scene?.accessibility?.content;
    require(content, `Actual mixed MathML content missing: ${fixture.name}`);
    require(
      nodes(content).map((node) => node.text ?? "").join("") === fixture.text,
      `Actual MathML semantic ordering differs: ${fixture.name} ${JSON.stringify({ expected: fixture.text, content })}`,
    );
    require(
      diagram.scene!.items.filter((item) => item.kind === "text").map((item) => item.text).join("") === fixture.text,
      `Actual MathML painted text differs: ${fixture.name} ${
        JSON.stringify(diagram.scene!.items.filter((item) => item.kind === "text"))
      } ${JSON.stringify(diagram.scene!.diagnostics)}`,
    );
    retained.push(JSON.parse(JSON.stringify(diagram)));
  }
  for (const htmlLabels of [false, true]) {
    for (
      const [mode, label, expected] of [
        ["uppercase", "Straße", "STRASSE"],
        ["lowercase", "MIXED Case", "mixed case"],
        ["capitalize", "first second", "First Second"],
        ["uppercase", htmlLabels ? "One <strong>two</strong>" : "`One **two**`", "ONE TWO"],
      ]
    ) {
      const diagram = await renderer.compile(`flowchart LR\naccTitle: Literal title\nA["${label}"]`, {
        trusted: true,
        config: { htmlLabels, flowchart: { htmlLabels }, themeCSS: `text, .nodeLabel { text-transform:${mode}; }` },
      });
      require(diagram.scene?.accessibility?.title === "Literal title", "Casing changed an explicit title");
      require(
        nodes(diagram.scene!.accessibility!.content!).map((node) => node.text ?? "").join("") === expected,
        `Styled actual label lost semantic casing: ${
          JSON.stringify({ htmlLabels, mode, label, expected, content: diagram.scene!.accessibility!.content })
        }`,
      );
      retained.push(JSON.parse(JSON.stringify(diagram)));
    }
  }
  for (const mode of ["none", "uppercase"]) {
    const diagram = await renderer.compile(
      String.raw`flowchart LR
A["$$\text{Straße}+x$$"]`,
      {
        trusted: true,
        config: { themeCSS: `mtext, mi { text-transform:${mode}; }` },
      },
    );
    const math = nodes(diagram.scene!.accessibility!.content!);
    require(
      math.some((node) => node.tag === "mtext" && node.text === (mode === "none" ? "Straße" : "STRASSE")),
      "Styled actual MathML text lost casing",
    );
    require(
      math.some((node) =>
        node.tag === "mi" && node.text === (mode === "none" ? "x" : "X") && node.textTransform === "none"
      ),
      "Explicit MathML casing did not override automatic operand italics",
    );
    retained.push(JSON.parse(JSON.stringify(diagram)));
  }
  for (const fixture of MERMAID_GENERATED_CONTENT_FIXTURES) {
    const diagram = await renderer.compile(`flowchart LR\nA["${fixture.body.replaceAll('"', "'")}"]`, {
      trusted: true,
      config: { securityLevel: "loose", htmlLabels: true, flowchart: { htmlLabels: true }, themeCSS: fixture.css },
    });
    const engineText = "engineText" in fixture ? fixture.engineText : undefined;
    if (engineText !== undefined) {
      // Upstream 12.1.0 explicitly removes unsupported @counter-style at-rules
      // in compileCSS. Keep this negative fixture and the independent original
      // AX audit; never restore a deliberately filtered source rule to pass it.
      require(!diagram.svg.includes("@counter-style"), "Upstream unsupported-rule filtering was bypassed");
    }
    require(
      nodes(diagram.scene!.accessibility!.content!).map((node) => node.text ?? "").join("") ===
        (engineText ?? ("semanticText" in fixture ? fixture.semanticText : fixture.text)),
      `Actual generated content text differs: ${fixture.name} ${
        JSON.stringify({ content: diagram.scene!.accessibility!.content, diagnostics: diagram.scene!.diagnostics })
      }`,
    );
    require(
      diagram.scene!.items.filter((item) => item.kind === "text").map((item) => item.text).join("") ===
        (engineText ?? fixture.text),
      `Actual generated native text differs: ${fixture.name}`,
    );
    verifyMermaidGeneratedContentScene(fixture.name, diagram.scene!);
    retained.push(JSON.parse(JSON.stringify(diagram)));
  }
  const { retained: decorated, ...decorationStats } = await verifyMermaidTextDecorations(renderer);
  retained.push(...decorated);
  const { retained: sourceConfigs, ...sourceConfigStats } = await verifyMermaidCounterSourceConfig(renderer);
  retained.push(...sourceConfigs);
  const formatted = nodes(retained[5]!.scene!.accessibility!.content!);
  require(
    formatted.some((node) => node.tag === "strong") && formatted.some((node) => node.tag === "em"),
    "Markdown label marks lost",
  );
  const math = retained.slice(6, 15).flatMap((diagram) => nodes(diagram.scene!.accessibility!.content!));
  for (const tag of ["math", "mfrac", "msup", "msub", "msqrt", "mroot", "mtable", "munderover"]) {
    require(math.some((node) => node.tag === tag), `MathML ${tag} structure missing`);
  }
  require(!math.some((node) => node.text?.includes("HIDDEN")), "Phantom math became audible text");
  const actions = nodes(retained[17]!.scene!.accessibility!.content!);
  require(actions.some((node) => node.interaction?.href === "https://example.test/semantic"), "Semantic link lost");
  require(actions.some((node) => node.interaction?.callbacks?.[0]?.name === "host.run"), "Semantic callback lost");
  require(
    actions.filter((node) => node.interaction?.callbacks?.length).length === 1,
    "Gantt bar/label produced duplicate buttons",
  );
  for (const node of actions.filter((node) => node.interaction)) {
    require(node.label || nodes([node]).some((child) => child.text?.trim()), "Unnamed semantic action");
  }
  return {
    ...decorationStats,
    ...sourceConfigStats,
    diagrams: retained.length,
    mathDiagrams: 11 + mixedMathFixtures.length +
      MERMAID_GENERATED_CONTENT_FIXTURES.filter((fixture) => fixture.math).length,
    semanticNodes: retained.reduce((n, d) => n + nodes(d.scene!.accessibility!.content!).length, 0),
    retained,
  };
}

/** Check every family and math/action structure in real wheel/reflow surfaces after actual compiler disposal. */
export async function verifyMermaidSemanticsTransport(retained: readonly MermaidStandardDiagram[]) {
  const transport = await verifyMermaidAccessibilityTransport(retained);
  const terminalDecorations = await verifyMermaidTerminalDecorations(retained);
  for (const diagram of retained) {
    const frame = renderMermaidNativeFrame(diagram.scene!);
    const controller = new MarkdownController({ source: "```mermaid\nfixture\n```", render: { diagram: () => frame } });
    try {
      for (const width of [120, 48, 160]) {
        const target = controller.accessibilityTargets(width)[0];
        require(
          JSON.stringify(target?.content) === JSON.stringify(diagram.scene!.accessibility!.content),
          "Disposed semantic content lost",
        );
      }
    } finally {
      controller.dispose();
    }
  }
  return { ...transport, terminalDecorations };
}

let cleanup: (() => void) | undefined;

/** Direct SVG feature probes supplement, never replace, the actual Mermaid grammar fixtures. */
export const MERMAID_SEMANTIC_SVG_FIXTURES: readonly {
  name: string;
  role?: string;
  body: string;
  expectedText?: string;
  expectedSemanticText?: string;
  attributes?: Readonly<Record<string, string>>;
  metadata?: { title?: string; description?: string };
}[] = [
  ...MERMAID_GENERATED_CONTENT_FIXTURES.map((fixture) => ({
    name: fixture.name,
    expectedText: fixture.text,
    expectedSemanticText: "semanticText" in fixture ? fixture.semanticText : fixture.text,
    body:
      `<style>${fixture.css}</style><foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml">${
        fixture.body.replace("<math>", '<math xmlns="http://www.w3.org/1998/Math/MathML">')
      }</div></foreignObject>`,
  })),
  ...mixedMathFixtures.map((fixture) => ({
    name: fixture.name,
    expectedText: fixture.text,
    body:
      `<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><math xmlns="http://www.w3.org/1998/Math/MathML">${fixture.body}</math></div></foreignObject>`,
  })),
  {
    name: "generated-alternative-reference",
    attributes: { "aria-labelledby": "generated-alt-reference" },
    metadata: { title: "Alternative Straße INSIDE" },
    body:
      '<style>.generated::before{content:"shown" / "Alternative Straße"}</style><foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><div id="generated-alt-reference" class="generated" style="text-transform:uppercase">inside</div></div></foreignObject>',
    expectedText: "SHOWNINSIDE",
    expectedSemanticText: "Alternative StraßeINSIDE",
  },
  {
    name: "preserved-leading-and-unicode-space",
    body:
      '<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="white-space:pre">  <em>Indented</em>&#160; tail</div></foreignObject>',
  },
  {
    name: "named-group",
    body: '<g><title>Named group</title><desc>Group description</desc><text x="10" y="25">Group text</text></g>',
  },
  {
    name: "ordered-fallback-object",
    body: '<g role="graphics-object img" aria-label="Object"><text x="10" y="25">Object text</text></g>',
  },
  {
    name: "symbol-text",
    body: '<g role="graphics-symbol img" aria-label="Symbol"><text x="10" y="25">Symbol text</text></g>',
  },
  {
    name: "referenced-text",
    body:
      '<defs aria-hidden="true"><g id="semantic-reuse"><text x="10" y="25">Referenced text</text></g></defs><use href="#semantic-reuse"/><use href="#semantic-reuse" y="35"/>',
  },
  {
    name: "referenced-symbol",
    body:
      '<defs aria-hidden="true"><symbol id="semantic-reuse" viewBox="0 0 100 40"><title>Reference title</title><text x="10" y="25">Referenced symbol</text></symbol></defs><use href="#semantic-reuse" width="100" height="40"/>',
  },
  {
    name: "referenced-name-override",
    body:
      '<defs aria-hidden="true"><g id="semantic-reuse"><title>Source name</title><text x="10" y="25">Referenced text</text></g></defs><use href="#semantic-reuse" aria-label="Override name"/>',
  },
  { name: "presentational-root", role: "presentation", body: '<text x="10" y="25">Presentational content</text>' },
  {
    name: "presentational-title",
    role: "none",
    body: '<title>Named presentation</title><text x="10" y="25">Named content</text>',
  },
  {
    name: "visibility-override",
    body:
      '<g style="visibility:hidden"><text x="10" y="25">Hidden</text><text x="10" y="50" style="visibility:visible">Visible override</text></g>',
  },
  {
    name: "normal-inline-space",
    body:
      '<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><strong>First</strong> <em>Second</em> Third</div></foreignObject>',
  },
  {
    name: "preserved-inline-space",
    body:
      '<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="white-space:pre"><strong>First</strong>  <em>Second</em>\n  Third</div></foreignObject>',
  },
  {
    name: "uppercase-literal-metadata",
    attributes: {
      style: "text-transform:uppercase",
      "aria-label": "Source literal",
      "aria-description": "Description literal",
    },
    metadata: { title: "Source literal", description: "Description literal" },
    body: '<text x="10" y="25">Straße</text>',
  },
  {
    name: "uppercase-title-desc",
    attributes: { style: "text-transform:uppercase" },
    metadata: { title: "Source title", description: "Description literal" },
    body: '<title>Source title</title><desc>Description literal</desc><text x="10" y="25">Straße</text>',
  },
  {
    name: "uppercase-visible-references",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref", "aria-describedby": "detail" },
    metadata: { title: "STRASSE REFERENCE", description: "DESCRIPTION TEXT" },
    body: '<text id="ref" x="10" y="25">Straße reference</text><text id="detail" x="10" y="60">Description text</text>',
  },
  {
    name: "uppercase-display-hidden-reference",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref" },
    metadata: { title: "Straße reference" },
    body: '<text id="ref" style="display:none">Straße reference</text><text x="10" y="25">Visible</text>',
  },
  {
    name: "uppercase-visibility-hidden-reference",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref" },
    metadata: { title: "STRASSE REFERENCE" },
    body: '<text id="ref" style="visibility:hidden">Straße reference</text><text x="10" y="25">Visible</text>',
  },
  {
    name: "uppercase-definition-reference",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref" },
    metadata: { title: "STRASSE REFERENCE" },
    body: '<defs><text id="ref">Straße reference</text></defs><text x="10" y="25">Visible</text>',
  },
  {
    name: "uppercase-hidden-descendants",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref" },
    metadata: { title: "SHOWN TAIL" },
    body:
      '<text id="ref" x="10" y="25">Shown<tspan style="display:none">HIDDEN</tspan><tspan aria-hidden="true">ARIAHIDDEN</tspan> tail</text>',
  },
  {
    name: "uppercase-visibility-hidden-descendant",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref" },
    metadata: { title: "SHOWN TAIL" },
    body: '<text id="ref" x="10" y="25">Shown<tspan style="visibility:hidden">HIDDEN</tspan> tail</text>',
  },
  {
    name: "uppercase-aria-hidden-reference",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref" },
    metadata: { title: "SHOWNHIDDEN TAIL" },
    body: '<text id="ref" x="10" y="25" aria-hidden="true">Shown<tspan aria-hidden="true">HIDDEN</tspan> tail</text>',
  },
  {
    name: "uppercase-hidden-reference-with-undisplayed-child",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref" },
    metadata: { title: "SHOWN hidden Straße TAIL" },
    body: '<text id="ref" style="visibility:hidden">Shown<tspan style="display:none">hidden Straße</tspan> tail</text>',
  },
  {
    name: "literal-referenced-name",
    attributes: { style: "text-transform:uppercase", "aria-labelledby": "ref" },
    metadata: { title: "Literal reference" },
    body: '<text id="ref" x="10" y="25" aria-label="Literal reference">Shown</text>',
  },
  {
    name: "svg-text-literal-name",
    body: '<text aria-label="Own name" x="10" y="25">Shown</text>',
  },
  {
    name: "svg-text-literal-title-description",
    body: '<text x="10" y="25"><title>Own title</title><desc>Own description</desc>Shown</text>',
  },
  {
    name: "svg-text-explicit-group-name",
    body: '<text role="group" aria-label="Own name" x="10" y="25">Shown</text>',
  },
  {
    name: "svg-tspan-literal-name",
    body: '<text x="10" y="25"><tspan aria-label="Own name">Shown</tspan></text>',
  },
  {
    name: "unhidden-marker-metadata",
    body: '<defs><marker id="m"><title>Marker title</title><desc>Marker description</desc></marker></defs>',
  },
  {
    name: "unhidden-marker-text",
    body: '<defs><marker id="m"><title>Marker title</title><text>Marker text</text></marker></defs>',
  },
  {
    name: "unhidden-definitions-metadata",
    body: "<defs><title>Defs title</title><desc>Defs description</desc><text>Definition text</text></defs>",
  },
  {
    name: "uninstanced-symbol-metadata",
    body: '<defs><symbol id="m"><title>Symbol title</title><text>Symbol text</text></symbol></defs>',
  },
  {
    name: "unhidden-pattern-metadata",
    body: '<defs><pattern id="m"><title>Pattern title</title><text>Pattern text</text></pattern></defs>',
  },
  {
    name: "uppercase-nested-link",
    attributes: { style: "text-transform:uppercase" },
    body: '<text x="10" y="25">Mi<a href="https://example.test/"><tspan>xed</tspan></a> case</text>',
  },
  {
    name: "turkish-nested-casing",
    attributes: { "xml:lang": "tr", style: "text-transform:uppercase" },
    body: '<text x="10" y="25">istan<tspan>bul</tspan></text>',
  },
  {
    name: "greek-lowercase",
    attributes: { lang: "el", style: "text-transform:lowercase" },
    body: '<text x="10" y="25">ΟΣΟΣ</text>',
  },
  {
    name: "html-cased-marks-and-whitespace",
    body:
      '<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="white-space:pre;text-transform:uppercase">  <strong>Straße</strong> <em style="text-transform:lowercase">MIXED</em>&#160; tail</div></foreignObject>',
  },
  {
    name: "math-casing-with-default-operand",
    body:
      '<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="text-transform:uppercase">Before <math xmlns="http://www.w3.org/1998/Math/MathML"><mtext>Straße</mtext><mi>x</mi></math> after</div></foreignObject>',
  },
  {
    name: "math-explicit-none",
    body:
      '<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><math xmlns="http://www.w3.org/1998/Math/MathML"><mi style="text-transform:none">x</mi><mtext style="text-transform:uppercase">Straße</mtext></math></div></foreignObject>',
  },
  {
    name: "math-explicit-uppercase",
    body:
      '<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><math xmlns="http://www.w3.org/1998/Math/MathML"><mi style="text-transform:uppercase">x</mi><mtext lang="tr" style="text-transform:uppercase">istanbul</mtext></math></div></foreignObject>',
  },
];

/** Mount a source feature and native companion without changing the source DOM or installing a live site. */
export function mountMermaidSemanticSVGComparison(index: number) {
  // Previous test-only unscoped styles must not influence the next source probe.
  disposeMermaidSemanticComparison();
  const fixture = MERMAID_SEMANTIC_SVG_FIXTURES[index]!;
  const host = document.createElement("div");
  document.body.append(host);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "400");
  svg.setAttribute("height", "120");
  svg.setAttribute("role", fixture.role ?? "graphics-document document");
  for (const [name, value] of Object.entries(fixture.attributes ?? {})) svg.setAttribute(name, value);
  svg.innerHTML = fixture.body;
  host.append(svg);
  const original = svg.outerHTML;
  try {
    if (fixture.name === "generated-math-inline") {
      const token = svg.querySelector("ms")!;
      const range = document.createRange();
      range.selectNodeContents(token.firstChild!);
      require(
        // Chromium blockifies these MathML pseudo boxes despite authored display:inline.
        getComputedStyle(token, "::before").display === "block" &&
          token.getBoundingClientRect().height > range.getBoundingClientRect().height * 2,
        `Current browser MathML generated row behavior changed: ${
          JSON.stringify({
            display: getComputedStyle(token, "::before").display,
            owner: token.getBoundingClientRect().height,
            text: range.getBoundingClientRect().height,
          })
        }`,
      );
    }
    const scene = extractMermaidScene(svg);
    if (fixture.metadata) {
      require(scene.accessibility?.title === fixture.metadata.title, "Referenced semantic title differs");
      require(
        scene.accessibility?.description === fixture.metadata.description,
        "Referenced semantic description differs",
      );
    }
    require(svg.outerHTML === original, "Semantic reference capture changed source SVG");
    mountMermaidSemanticComparison({ svg: original, scene });
    if (fixture.expectedText !== undefined) {
      require(
        nodes(scene.accessibility?.content ?? []).map((node) => node.text ?? "").join("") ===
          (fixture.expectedSemanticText ?? fixture.expectedText),
        `Direct semantic text differs: ${
          JSON.stringify({
            name: fixture.name,
            expected: fixture.expectedSemanticText ?? fixture.expectedText,
            actual: nodes(scene.accessibility?.content ?? []).map((node) => node.text ?? "").join(""),
            diagnostics: scene.diagnostics,
          })
        }`,
      );
      require(
        scene.items.filter((item) => item.kind === "text").map((item) => item.text).join("") === fixture.expectedText,
        `Direct MathML native text differs: ${fixture.name}`,
      );
      const math = document.querySelector("[data-exotui-document-accessibility] math");
      const content = math ?? document.querySelector("[data-exotui-document-accessibility] [data-document-target]");
      require(
        content?.textContent === (fixture.expectedSemanticText ?? fixture.expectedText),
        `Owned content DOM ordering differs: ${fixture.name}`,
      );
      const token = math?.firstElementChild;
      if (fixture.name.startsWith("mixed-")) {
        require(token?.firstChild?.nodeType === Node.TEXT_NODE, "Mixed MathML text gained an element wrapper");
      }
      const native = renderMermaidNativeFrame(scene);
      require(
        native.cells.flat().filter((cell) => cell.char === '"').length ===
          [...fixture.expectedText].filter((char) => char === '"').length,
        `Native MathML quotes differ: ${fixture.name}`,
      );
      require(
        JSON.stringify(renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)))) ===
          JSON.stringify(renderMermaidNativeFrame(scene)),
        `MathML native JSON transport differs: ${fixture.name}`,
      );
      if (fixture.name.startsWith("generated-")) verifyMermaidGeneratedContentScene(fixture.name, scene);
    }
  } finally {
    host.remove();
  }
  return { name: fixture.name, metadata: fixture.metadata };
}

/** Local reference capture shares native instance limits and removes measuring scopes on rejection. */
export function verifyMermaidSemanticReferences() {
  const host = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "400");
  svg.setAttribute("height", "120");
  document.body.append(host);
  host.append(svg);
  const bodyChildren = document.body.childNodes.length;
  try {
    svg.innerHTML =
      '<defs aria-hidden="true"><g id="semantic-cycle-a"><use href="#semantic-cycle-b"/></g><g id="semantic-cycle-b"><use href="#semantic-cycle-a"/></g></defs><use href="#semantic-cycle-a"/>';
    let original = svg.outerHTML;
    const diagnostics = new Set<string>();
    const cycle = mermaidSVGAccessibility(svg, undefined, diagnostics);
    require(
      !cycle.content?.length && [...diagnostics].some((value) => value.includes("Cyclic")),
      "Cyclic semantic use did not diagnose/refuse",
    );
    require(
      svg.outerHTML === original && document.body.childNodes.length === bodyChildren,
      "Cyclic reference leaked a measuring scope",
    );
    svg.innerHTML = '<defs><g id="semantic-oversized"></g></defs><use href="#semantic-oversized"/>';
    const source = svg.querySelector("defs g")!;
    for (let count = 0; count < 4096; count++) {
      source.append(document.createElementNS("http://www.w3.org/2000/svg", "g"));
    }
    original = svg.outerHTML;
    let rejected = false;
    try {
      mermaidSVGAccessibility(svg);
    } catch (error) {
      rejected = error instanceof RangeError;
    }
    require(
      rejected && svg.outerHTML === original && document.body.childNodes.length === bodyChildren,
      "Oversized reference did not reject/clean up",
    );
    svg.innerHTML = '<use href="https://example.test/external.svg#shape"/>';
    diagnostics.clear();
    mermaidSVGAccessibility(svg, undefined, diagnostics);
    require(
      [...diagnostics].some((value) => value.includes("External/unresolved")),
      "External use bypassed the host-controlled boundary",
    );
    let casingRefusals = 0;
    const refuse = (casing = true) => {
      const original = svg.outerHTML, frames = document.querySelectorAll("iframe").length;
      let rejected = false;
      try {
        mermaidSVGAccessibility(svg);
      } catch (error) {
        rejected = error instanceof RangeError;
      }
      require(
        rejected && svg.outerHTML === original && document.querySelectorAll("iframe").length === frames,
        "Semantic casing/reference bounds failed or leaked an owned frame",
      );
      if (casing) casingRefusals++;
    };
    svg.innerHTML = `<text style="text-transform:uppercase">${"ß".repeat(32_769)}</text>`;
    refuse();
    svg.innerHTML = `<defs aria-hidden="true"><text id="oversized-name" style="display:none">${
      "x".repeat(128_001)
    }</text></defs>`;
    svg.setAttribute("aria-labelledby", "oversized-name");
    refuse();
    svg.innerHTML = '<defs aria-hidden="true"><g id="deep-name"></g></defs>';
    let parent = svg.querySelector("g")!;
    for (let depth = 0; depth < 66; depth++) {
      const child = document.createElementNS("http://www.w3.org/2000/svg", "g");
      parent.append(child);
      parent = child;
    }
    parent.textContent = "Deep name";
    svg.setAttribute("aria-labelledby", "deep-name");
    refuse();
    svg.removeAttribute("aria-labelledby");
    let orderedTextRefusals = 0;
    for (
      const body of [
        `<mtext>${"x".repeat(4097)}<span xmlns="http://www.w3.org/1999/xhtml">tail</span></mtext>`,
        `<mtext>${'<span xmlns="http://www.w3.org/1999/xhtml"></span>x'.repeat(4096)}</mtext>`,
      ]
    ) {
      svg.innerHTML =
        `<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><math xmlns="http://www.w3.org/1998/Math/MathML">${body}</math></div></foreignObject>`;
      refuse(false);
      orderedTextRefusals++;
    }
    svg.innerHTML = '<text style="text-transform:uppercase">Recovered casing</text>';
    require(
      nodes(mermaidSVGAccessibility(svg).content ?? []).some((node) => node.text === "RECOVERED CASING"),
      "Casing refusal poisoned later semantic capture",
    );
    svg.innerHTML = '<text x="10" y="25">Recovered local semantics</text>';
    const recovered = mermaidSVGAccessibility(svg);
    require(
      nodes(recovered.content ?? []).some((node) => node.text === "Recovered local semantics"),
      "Reference rejection poisoned later capture",
    );
    return { cycle: 1, rejected: 1, external: 1, recovery: 1, casingRefusals, orderedTextRefusals };
  } finally {
    host.remove();
  }
}

/** Mount authoritative SVG and native companion separately for an external CDP accessibility-tree comparison. */
export function mountMermaidSemanticComparison(diagram: Pick<MermaidStandardDiagram, "svg" | "scene">) {
  disposeMermaidSemanticComparison();
  const root = document.createElement("div");
  root.id = "exotui-semantic-comparison";
  document.body.append(root);
  const upstream = document.createElement("div");
  upstream.setAttribute("role", "document");
  upstream.setAttribute("aria-label", "Authoritative SVG semantics");
  // Test-only authoritative output. Production never imports this SVG as its semantic tree.
  upstream.innerHTML = diagram.svg;
  root.append(upstream);
  const host = document.createElement("div");
  root.append(host);
  const frame = renderMermaidNativeFrame(diagram.scene!);
  const controller = new MarkdownController({ source: "```mermaid\nfixture\n```", render: { diagram: () => frame } });
  const companion = new DocumentAccessibilityDOM(host, controller, { label: "Native companion semantics" });
  cleanup = () => {
    companion.dispose();
    controller.dispose();
    root.remove();
    cleanup = undefined;
  };
  companion.update(120);
}

/** Drive actual companion DOM events; no source callbacks or browser navigation may run. */
export function verifyMermaidSemanticDOMActions(diagram: MermaidStandardDiagram) {
  const host = document.createElement("div");
  const borrowed = document.createElement("span");
  borrowed.textContent = "Borrowed child";
  host.append(borrowed);
  document.body.append(host);
  const source = "```mermaid\nfixture\n```";
  const frame = renderMermaidNativeFrame(diagram.scene!);
  const controller = new MarkdownController({ source, render: { diagram: () => frame } });
  let activations = 0;
  let callbacksExecuted = 0;
  const originalHost = Object.getOwnPropertyDescriptor(globalThis, "host");
  Object.defineProperty(globalThis, "host", {
    configurable: true,
    value: {
      run() {
        callbacksExecuted++;
      },
    },
  });
  const inert = new DocumentAccessibilityDOM(host, controller);
  const companion = new DocumentAccessibilityDOM(host, controller, { onAction: () => activations++ });
  try {
    inert.update(120);
    require(!host.querySelector("[tabindex]"), "Unconfigured host exposed focusable actions");
    for (const action of host.querySelectorAll<HTMLElement>('[role="link"],[role="button"]')) action.click();
    require(Number(activations) === 0, "Unconfigured action activated");
    inert.dispose();
    companion.update(120);
    require(
      !host.querySelector("[href],[src],script,style,img,iframe,object"),
      "Semantic projection installed executable/resource markup",
    );
    const link = host.querySelector<HTMLElement>('[role="link"][tabindex="0"]');
    const button = host.querySelector<HTMLElement>('[role="button"][tabindex="0"]');
    require(
      link && button,
      `Painted actions are not keyboard accessible: ${
        JSON.stringify({
          actions: nodes(diagram.scene!.accessibility!.content!).filter((node) => node.interaction).map((node) =>
            node.interaction
          ),
          native: controller.interactionTargets(120).map((target) => target.interaction),
          elements: [...host.querySelectorAll('[role="link"],[role="button"]')].map((element) =>
            element.outerHTML.slice(0, 600)
          ),
        })
      }`,
    );
    link.click();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    require(Number(activations) === 2, "Explicit host hook did not receive actions");
    link.focus();
    const focusKey = link.getAttribute("data-document-semantic");
    companion.update(80);
    require(
      document.activeElement?.getAttribute("data-document-semantic") === focusKey,
      "Reflow lost owned action focus",
    );
    const reflowed = host.querySelector<HTMLElement>('[role="button"][tabindex="0"]')!;
    reflowed.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    require(Number(activations) === 2, "Companion swallowed host modifier routing");
    reflowed.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    require(Number(activations) === 3, "Space did not activate a host callback button");
    const buttonRange = controller.interactionTargets(120).find((target) => target.interaction.callbacks?.length)!
      .ranges[0]!;
    controller.scrollTo(buttonRange.row, 120, 1);
    companion.update(120, 1);
    require(!host.querySelector('[role="link"][tabindex="0"]'), "Off-viewport native link remained focusable");
    controller.setSource("No diagram.");
    link.click();
    require(Number(activations) === 3, "Detached/stale model action activated");
    companion.update(120);
    require(!host.querySelector('[role="link"],[role="button"]'), "Source replacement left stale semantics");
    controller.setSource(source);
    companion.update(120);
    const current = host.querySelector<HTMLElement>('[role="link"][tabindex="0"]')!;
    companion.dispose();
    current.click();
    require(
      Number(activations) === 3 && host.childNodes.length === 1 && host.firstChild === borrowed,
      "Disposed semantics activated or destroyed borrowed DOM",
    );
    // Chromium exposes otherwise uninstanced definition text. Only explicit CSS/ARIA hiding excludes it.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML =
      '<defs><text>DEFINITION</text></defs><text aria-hidden="true">ARIA HIDDEN</text><text style="display:none">CSS HIDDEN</text><text>Visible label</text>';
    host.append(svg);
    const markup = svg.outerHTML;
    const metadata = mermaidSVGAccessibility(svg);
    const texts = nodes(metadata.content ?? []).map((node) => node.text ?? "").join("");
    require(
      texts === "DEFINITIONVisible label" && svg.outerHTML === markup,
      "Definition exposure or hidden-content exclusion differs from source semantics",
    );
    svg.querySelector("defs")!.setAttribute("aria-hidden", "true");
    require(
      nodes(mermaidSVGAccessibility(svg).content ?? []).map((node) => node.text ?? "").join("") === "Visible label",
      "ARIA-hidden definitions leaked into semantics",
    );
    svg.style.display = "none";
    require(mermaidSVGAccessibility(svg).hidden, "Hidden root still exposed");
    svg.style.display = "";
    svg.replaceChildren(document.createElementNS("http://www.w3.org/2000/svg", "text"));
    svg.firstChild!.textContent = "x".repeat(128001);
    let rejected = false;
    try {
      mermaidSVGAccessibility(svg);
    } catch (error) {
      rejected = error instanceof RangeError;
    }
    require(rejected, "Raw DOM text budget was not enforced");
    svg.remove();
    const base = controller.accessibilityTargets(120)[0]!;
    const overflow = new DocumentAccessibilityDOM(host, {
      accessibilityTargets: () =>
        Array.from(
          { length: 5 },
          (_, index) => ({
            ...base,
            key: String(index),
            content: Array.from({ length: 4096 }, () => ({ tag: "br" as const })),
          }),
        ),
    });
    try {
      rejected = false;
      try {
        overflow.update(120);
      } catch (error) {
        rejected = error instanceof RangeError;
      }
      require(rejected && host.childNodes.length === 1, "Aggregate DOM quota failed or left owned content");
    } finally {
      overflow.dispose();
    }
    const oversized = new DocumentAccessibilityDOM(host, {
      accessibilityTargets: () =>
        Array.from(
          { length: 257 },
          (_, index) => ({ ...base, key: String(index), content: [{ tag: "span" as const, text: "x".repeat(4096) }] }),
        ),
    });
    try {
      rejected = false;
      try {
        oversized.update(120);
      } catch (error) {
        rejected = error instanceof RangeError;
      }
      require(rejected && host.childNodes.length === 1, "Aggregate text quota failed or left owned content");
    } finally {
      oversized.dispose();
    }
    require(Number(callbacksExecuted) === 0, "Source callback executed through a global lookup");
    return { activations, callbacksExecuted, budgetCases: 3 };
  } finally {
    inert.dispose();
    companion.dispose();
    controller.dispose();
    host.remove();
    if (originalHost) Object.defineProperty(globalThis, "host", originalHost);
    else Reflect.deleteProperty(globalThis, "host");
  }
}

export function disposeMermaidSemanticComparison() {
  cleanup?.();
}
