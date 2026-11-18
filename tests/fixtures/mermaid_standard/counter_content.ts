// Copyright 2023 Im-Beast. MIT license.
import { extractMermaidScene } from "../../../src/content/mermaid_scene.ts";
import { renderMermaidNativeFrame } from "../../../src/content/mermaid_cells.ts";
import { withGeneratedCounterContentMetadata } from "../../../src/content/mermaid_counter_content_dom.ts";
import type { DiagramSemanticNode } from "../../../src/content/document_semantics.ts";
import { DocumentAccessibilityDOM } from "../../../src/content/document_accessibility_dom.ts";
import { diagramAccessibilityNode } from "../../../src/content/document_accessibility.ts";

const nested =
  '<div class="counter-outer"><div class="counter-inner"><span class="generated">inside</span></div></div>';
const resets =
  ".counter-outer{counter-reset:probe 2}.counter-inner{counter-reset:probe 4}.generated{counter-reset:probe 9}";

/** Independently authored original CSS, reused by raw and both real-engine native/companion probes. */
export const MERMAID_COUNTER_CONTENT_FIXTURES: readonly {
  name: string;
  body: string;
  css: string;
  text: string;
  semanticText?: string;
  /** Pinned upstream deliberately removes @counter-style from themeCSS; this is a negative compatibility probe. */
  engineText?: string;
  math: boolean;
}[] = [
  {
    name: "decimal",
    body: '<div class="generated">inside</div>',
    css: '.generated{counter-reset:probe 4}.generated::before{counter-increment:probe;content:counter(probe) ":"}',
    text: "5:inside",
  },
  ...[
    ["plural-empty", 'counters(probe,"") ":"', "249:inside"],
    ["plural-dotted", 'counters(probe,".") ":"', "2.4.9:inside"],
    ["multiple", 'counter(probe) "/" counters(probe,"",upper-roman) ":"', "9/IIIVIX:inside"],
    ["escaped", String.raw`\63 ounters(probe,/* ( ignored ) */"") ":"`, "249:inside"],
    ["alternative", 'counter(probe) / counters(probe,"")', "9inside"],
  ].map(([name, content, text]) => ({
    name: name!,
    body: nested,
    css: resets + `.generated::before{content:${content}}`,
    text: text!,
    ...(name === "alternative" ? { semanticText: "249inside" } : {}),
  })),
  {
    name: "custom-style",
    body: '<div class="generated">inside</div>',
    css:
      '@counter-style binary-test{system:numeric;symbols:"Z" "O"}.generated{counter-reset:probe 5}.generated::before{content:counter(probe,binary-test) ":"}',
    text: "OZO:inside",
    engineText: "5:inside",
  },
  ...[
    [
      "named-layers",
      '@layer early,late;@layer late{.generated::before{content:counters(probe,"") ":"}}@layer early{.generated::before{content:counter(probe) ":"}}',
    ],
    [
      "important-layers",
      '@layer early,late;@layer early{.generated::before{content:counters(probe,"") ":"!important}}@layer late{.generated::before{content:counter(probe) ":"!important}}.generated::before{content:"wrong"!important}',
    ],
    [
      "anonymous-layers",
      '@layer{.generated::before{content:counter(probe) ":"}}@layer later{.generated::before{content:counters(probe,"") ":"}}',
    ],
    [
      "revert-layer",
      '@layer early,late;@layer early{.generated::before{content:counters(probe,"") ":"}}@layer late{.generated::before{content:revert-layer}}',
    ],
    [
      "conditional",
      '@supports(content:counters(probe,"")){@media(min-width:1px){.generated::before{content:counters(probe,"") ":"}}}@media(min-width:100000px){.generated::before{content:"wrong"}}',
    ],
    [
      "nesting",
      '.counter-outer{.counter-inner{.generated{&::before{content:counters(probe,"") ":"}}}}',
    ],
    ["invalid-fallback", '.generated::before{content:counters(probe,"") ":";content:invalid}'],
    [
      "variable",
      '.generated{--counter-text:counters(probe,"") ":"}.generated::before{content:var(--counter-text)}',
    ],
    [
      "important-declaration",
      '.generated::before{content:counters(probe,"") ":"!important;content:counter(probe) ":"}',
    ],
  ].map(([name, css]) => ({ name: name!, body: nested, css: resets + css, text: "249:inside" })),
  {
    name: "before-after-state",
    body: '<div class="generated">inside</div>',
    css:
      ".generated{counter-reset:probe 4}.generated::before{counter-increment:probe;content:counter(probe)}.generated::after{counter-increment:probe;content:counter(probe)}",
    text: "5inside6",
  },
].map((fixture) => ({ ...fixture, name: `generated-counter-${fixture.name}`, math: false }));

let host: HTMLElement | undefined, svg: SVGSVGElement | undefined, current = 0;
let companion: DocumentAccessibilityDOM | undefined, companionRoot: HTMLElement | undefined;

/** Mount the untouched source first; the driver reads its real AX text before any implementation capture. */
export function mountMermaidCounterContentOriginal(index: number) {
  companion?.dispose();
  companionRoot?.remove();
  host?.remove();
  current = index;
  const fixture = MERMAID_COUNTER_CONTENT_FIXTURES[index]!;
  host = document.createElement("div");
  host.setAttribute("role", "document");
  host.setAttribute("aria-label", fixture.name);
  svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "600");
  svg.setAttribute("height", "200");
  svg.innerHTML =
    `<style>${fixture.css}</style><foreignObject width="550" height="180"><div xmlns="http://www.w3.org/1999/xhtml" style="font:16px monospace">${fixture.body}</div></foreignObject>`;
  host.append(svg);
  document.body.append(host);
  return { id: fixture.name, expected: fixture.semanticText ?? fixture.text };
}

/** Capture native visual/semantic text and prove original markup and adopted-sheet ownership are restored. */
export function captureMermaidCounterContentOriginal() {
  const fixture = MERMAID_COUNTER_CONTENT_FIXTURES[current]!, source = svg!;
  const original = source.outerHTML, sheets = [...document.adoptedStyleSheets];
  const scene = extractMermaidScene(source);
  if (
    source.outerHTML !== original || sheets.length !== document.adoptedStyleSheets.length ||
    sheets.some((sheet, index) => sheet !== document.adoptedStyleSheets[index])
  ) {
    throw new Error("Counter native capture changed original markup or leaked a metadata stylesheet.");
  }
  const frame = renderMermaidNativeFrame(scene);
  if (!frame.cells.flat().some((cell) => /[1-9ZOIV]/.test(cell.char))) {
    throw new Error("Counter text exists in metadata but was not painted natively.");
  }
  const plain = (nodes: readonly DiagramSemanticNode[]): string =>
    nodes.map((node) => (node.text ?? "") + plain(node.children ?? [])).join("");
  const metadata = JSON.parse(JSON.stringify(scene.accessibility));
  companionRoot = document.createElement("div");
  document.body.append(companionRoot);
  const companionId = fixture.name + "-companion";
  companion = new DocumentAccessibilityDOM(companionRoot, {
    accessibilityTargets: () => [{
      key: "counter",
      blockIndex: 0,
      row: 0,
      height: frame.rows,
      node: diagramAccessibilityNode(metadata),
      content: metadata.content,
    }],
  }, { label: companionId });
  companion.update(frame.columns);
  return {
    id: fixture.name,
    expected: fixture.text,
    captured: scene.items.filter((item) => item.kind === "text").map((item) => item.text).join(""),
    diagnostics: scene.diagnostics,
    semantic: plain(scene.accessibility?.content ?? []),
    expectedSemantic: fixture.semanticText ?? fixture.text,
    companionId,
  };
}

/** Metadata ownership, exception cleanup and unsupported-source recovery without resource or global registration. */
export function mermaidCounterContentMetadataGuards() {
  mountMermaidCounterContentOriginal(1);
  const source = svg!, owner = source.querySelector(".generated")!, original = source.outerHTML;
  const sheets = [...document.adoptedStyleSheets];
  const extra = new CSSStyleSheet();
  let property = "", checks = 0;
  try {
    withGeneratedCounterContentMetadata(source, new Set([owner]), (metadata) => {
      const requests = metadata.requests(owner, "before", getComputedStyle(owner, "::before").content);
      if (requests?.[0]?.name !== "counters" || requests[0].arguments !== 'probe,""') {
        throw new Error("Original plural metadata not preserved.");
      }
      property = (document.adoptedStyleSheets.at(-1)!.cssRules[0] as CSSRule & { name: string }).name;
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, extra];
      checks++;
      throw new Error("counter callback failure");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "counter callback failure") throw error;
    checks++;
  }
  if (
    source.outerHTML !== original || document.adoptedStyleSheets.length !== sheets.length + 1 ||
    document.adoptedStyleSheets.at(-1) !== extra || getComputedStyle(owner, "::before").getPropertyValue(property)
  ) throw new Error("Metadata exception cleanup leaked registration or removed host ownership.");
  checks++;
  try {
    withGeneratedCounterContentMetadata(source, new Set([owner]), () => {});
    throw new Error("Source-less adopted stylesheet silently accepted.");
  } catch (error) {
    if (!(error instanceof TypeError) || !error.message.includes("original stylesheet source")) throw error;
    checks++;
  } finally {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== extra);
  }
  withGeneratedCounterContentMetadata(source, new Set([owner]), () => checks++);
  const input = document.createElement("input");
  host!.append(input);
  input.focus();
  const selection = document.getSelection()!, text = owner.firstChild!;
  selection.setBaseAndExtent(text, 5, text, 1);
  const focused = document.activeElement;
  withGeneratedCounterContentMetadata(source, new Set([owner]), () => {
    if (
      source.outerHTML !== original || document.activeElement !== focused || selection.anchorNode !== text ||
      selection.anchorOffset !== 5 || selection.focusNode !== text || selection.focusOffset !== 1
    ) throw new Error("Counter metadata changed source DOM, focus or backwards selection.");
  });
  checks++;
  const style = source.querySelector<SVGStyleElement>("style")!, css = style.textContent!;
  style.textContent +=
    '@font-face{font-family:CounterUnusedFont;src:url("https://counter-probe.invalid/font.woff2")}.never-counter-target{background:url("https://counter-probe.invalid/image.png")}@counter-style unused-image-test{system:cyclic;symbols:url("https://counter-probe.invalid/symbol.png")}';
  const fonts = document.fonts.size;
  withGeneratedCounterContentMetadata(source, new Set([owner]), (metadata) => {
    const sheet = document.adoptedStyleSheets.at(-1)!;
    const content = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
    if (
      /font-face|background:|src:|counter-style/.test(content) || document.fonts.size !== fonts ||
      !metadata.styles(owner).get("unused-image-test")?.unsupported
    ) throw new Error("Metadata adopted resource/font declarations or invented a nontextual counter style.");
  });
  style.textContent = css;
  checks++;
  style.textContent += "/*" + "x".repeat(1_048_576) + "*/";
  try {
    withGeneratedCounterContentMetadata(source, new Set([owner]), () => {});
    throw new Error("Counter source budget was not enforced.");
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    checks++;
  } finally {
    style.textContent = css;
  }
  const sheet = style.sheet!;
  const index = sheet.insertRule(".counter-unrelated{color:red}", sheet.cssRules.length);
  try {
    withGeneratedCounterContentMetadata(source, new Set([owner]), () => {});
    throw new Error("Changed stylesheet CSSOM was silently accepted as original source.");
  } catch (error) {
    if (!(error instanceof TypeError) || !error.message.includes("current CSSOM")) throw error;
    checks++;
  } finally {
    sheet.deleteRule(index);
  }
  withGeneratedCounterContentMetadata(source, new Set([owner]), () => checks++);
  if (
    source.outerHTML !== original || document.adoptedStyleSheets.length !== sheets.length ||
    sheets.some((sheet, index) => sheet !== document.adoptedStyleSheets[index])
  ) throw new Error("Counter metadata guards did not restore original ownership.");
  host?.remove();
  host = undefined;
  svg = undefined;
  return checks;
}
