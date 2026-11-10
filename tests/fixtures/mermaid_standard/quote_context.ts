// Copyright 2023 Im-Beast. MIT license.
import { DocumentAccessibilityDOM, MarkdownController } from "../../../mod.document.ts";
import { extractMermaidScene, renderMermaidNativeFrame } from "../../../mod.mermaid.ts";
import { withMermaidGeneratedContent } from "../../../src/content/mermaid_generated_content_dom.ts";

const label = '<div class="generated">outer<span class="generated">inner</span></div>';
const outer = "[outer<inner>]", nested = "<outer{inner}>";
const prefix = '<span class="context"></span>';

/** Independently authored expected text; original AX is checked BEFORE any capture. */
export const MERMAID_QUOTE_CONTEXT_FIXTURES = [
  {
    name: "external-silent-chinese",
    before: prefix,
    css: ".context::before{content:no-open-quote}",
    auto: true,
    expected: "‘outer‘inner’’",
  },
  {
    name: "external-before-and-after",
    before: prefix,
    css: ".context::before,.context::after{content:no-open-quote}",
    expected: "{outer{inner}}",
  },
  {
    name: "external-balanced",
    before: prefix,
    css: ".context::before{content:no-open-quote}.context::after{content:no-close-quote}",
    expected: outer,
  },
  {
    name: "external-close-underflow",
    before: prefix,
    css: ".context::before{content:no-close-quote no-close-quote}",
    expected: outer,
  },
  {
    name: "external-hidden-ink",
    before: prefix,
    css: ".context{visibility:hidden}.context::before{content:open-quote}",
    expected: nested,
  },
  {
    name: "external-display-none",
    before: `<div style="display:none">${prefix}</div>`,
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "external-display-contents",
    before: prefix,
    css: ".context{display:contents}.context::before{content:no-open-quote}",
    expected: nested,
  },
  {
    name: "external-quotes-none",
    before: prefix,
    css: ".context{quotes:none}.context::before{content:open-quote}",
    expected: nested,
  },
  {
    name: "external-functions-and-inert-keywords",
    before: prefix,
    css: '.context::before{content:"open-quote" counter(x) no-open-quote / "close-quote"}',
    expected: nested,
  },
  {
    name: "external-unrelated-long-control-string",
    before: prefix,
    css: '.context::before{content:"' + "x".repeat(5000) + '\\1b open-quote" no-open-quote}',
    expected: nested,
  },
  {
    name: "ancestor-before-not-after",
    ancestor: true,
    css: ".ancestor::before{content:no-open-quote}.ancestor::after{content:no-open-quote}",
    expected: nested,
  },
  {
    name: "following-does-not-precede",
    after: prefix,
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "external-containment-does-not-leak",
    before: `<div style="contain:style">${prefix}</div>`,
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "ancestor-containment-inherits-depth",
    before: prefix,
    ancestor: true,
    css: ".context::before{content:no-open-quote}.ancestor{contain:style}",
    expected: nested,
  },
  {
    name: "internal-containment-does-not-leak",
    body:
      `<div class="generated">outer<span style="contain:style">${prefix}</span><span class="generated">inner</span></div>`,
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "internal-contained-unbalanced-child",
    body: '<div class="generated">outer<span class="generated contained">inner</span></div>',
    css: ".contained{contain:style}.contained::after{content:none}",
    expected: "[outer<inner]",
  },
  {
    name: "external-contained-pseudo",
    before: prefix,
    css: ".context::before{contain:style;content:no-open-quote}",
    expected: nested,
  },
  {
    name: "external-svg-nonbox",
    before: '<svg width="1" height="1"><g class="context"/></svg>',
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "external-replaced-nonbox",
    before: '<input class="context" value="unrelated">',
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "external-closed-details",
    before: `<details>${prefix}</details>`,
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "external-content-visibility-hidden",
    before: `<div style="content-visibility:hidden">${prefix}</div>`,
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "external-content-visibility-auto",
    before: `<div style="content-visibility:auto">${prefix}</div>`,
    css: ".context::before{content:no-open-quote}",
    expected: outer,
  },
  {
    name: "external-list-marker",
    before: '<ul><li class="context"></li></ul>',
    css: ".context::marker{content:no-open-quote}",
    expected: nested,
  },
  {
    name: "internal-list-marker",
    css: ".generated{display:list-item}.generated::marker{content:no-open-quote}",
    expected: "<outer{inner}}",
  },
  { name: "open-shadow-ancestor-order", shadow: "open", expected: nested },
  { name: "closed-target-shadow-ancestor-order", shadow: "closed", expected: nested },
  { name: "slotted-order-not-light-order", slots: true, expected: nested },
  { name: "assigned-text-excludes-slot-fallback", textSlot: true, expected: outer },
] as const;

let cleanup: (() => void) | undefined, target: SVGSVGElement | undefined, targetHost: HTMLElement | undefined;
let current: typeof MERMAID_QUOTE_CONTEXT_FIXTURES[number] | undefined;

/** Keep the real source in its original host context for the independent browser oracle. */
export function mountMermaidQuoteContextComparison(index: number) {
  disposeMermaidQuoteContextComparison();
  const fixture = MERMAID_QUOTE_CONTEXT_FIXTURES[index]!;
  current = fixture;
  const root = document.createElement("div");
  root.id = "exotui-quote-context-comparison";
  root.style.contain = "style";
  document.body.append(root);
  const rules =
    '.generated{quotes:"[" "]" "<" ">" "{" "}"}.generated::before{content:open-quote}.generated::after{content:close-quote}';
  const style = document.createElement("style");
  style.textContent = rules + ("css" in fixture ? fixture.css : "");
  root.append(style);
  const upstream = document.createElement("div");
  upstream.setAttribute("role", "document");
  upstream.setAttribute("aria-label", "Authoritative quote context");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "400");
  svg.setAttribute("height", "120");
  svg.innerHTML = `<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml">${
    "body" in fixture ? fixture.body : label
  }</div></foreignObject>`;
  if ("auto" in fixture) {
    svg.querySelector(".generated")!.setAttribute("lang", "zh-TW");
    svg.querySelectorAll<HTMLElement>(".generated").forEach((element) => element.style.quotes = "auto");
  }
  upstream.append(svg);
  if ("before" in fixture) root.insertAdjacentHTML("beforeend", fixture.before);
  if ("ancestor" in fixture) {
    const ancestor = document.createElement("div");
    ancestor.className = "ancestor";
    ancestor.append(upstream);
    root.append(ancestor);
  } else if ("shadow" in fixture) {
    const host = document.createElement("div"), shadow = host.attachShadow({ mode: fixture.shadow });
    const style = document.createElement("style");
    style.textContent = rules + ".context::before{content:no-open-quote}";
    shadow.append(style);
    const context = document.createElement("span");
    context.className = "context";
    shadow.append(context, upstream);
    root.append(host);
  } else if ("slots" in fixture || "textSlot" in fixture) {
    const host = document.createElement("div"), shadow = host.attachShadow({ mode: "open" });
    const context = document.createElement("span");
    context.className = "context";
    context.slot = "before";
    upstream.slot = "after";
    if ("textSlot" in fixture) {
      shadow.innerHTML =
        `<style>.context::before{content:no-open-quote}</style><slot>${prefix}</slot><slot name="after"></slot>`;
      host.append(document.createTextNode("assigned text"), upstream);
    } else {
      shadow.innerHTML = '<slot name="before"></slot><slot name="after"></slot>';
      // Deliberately invert light-DOM declaration order and composed order.
      host.append(upstream, context);
      style.textContent += ".context::before{content:no-open-quote}";
    }
    root.append(host);
  } else root.append(upstream);
  if ("after" in fixture) root.insertAdjacentHTML("beforeend", fixture.after);
  target = svg;
  targetHost = root;
  cleanup = () => root.remove();
  return { name: fixture.name, expected: fixture.expected };
}

/** Capture paint/semantics only after original AX was independently checked. */
export function captureMermaidQuoteContextComparison() {
  const svg = target!, fixture = current!, root = targetHost!;
  const markup = root.innerHTML,
    shadowMarkup = svg.getRootNode() instanceof ShadowRoot ? (svg.getRootNode() as ShadowRoot).innerHTML : undefined;
  const scene = extractMermaidScene(svg);
  const text = scene.items.filter((item) => item.kind === "text").map((item) => item.text).join("");
  if (text !== fixture.expected || scene.diagnostics.length) {
    throw new Error(
      `Quotation context capture differs: ${
        JSON.stringify({ name: fixture.name, text, diagnostics: scene.diagnostics })
      }`,
    );
  }
  if (
    root.innerHTML !== markup ||
    shadowMarkup !== undefined && (svg.getRootNode() as ShadowRoot).innerHTML !== shadowMarkup
  ) {
    throw new Error("Quotation context capture changed original host markup");
  }
  const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)));
  for (const mark of ["[", "]", "<", ">", "{", "}", "‘", "’"]) {
    const expected = [...fixture.expected].filter((char) => char === mark).length;
    const actual = frame.cells.flat().filter((cell) => cell.char === mark).length;
    if (actual !== expected) {
      throw new Error(`Native quote marks differ: ${JSON.stringify({ name: fixture.name, mark, expected, actual })}`);
    }
  }
  const controller = new MarkdownController({ source: "```mermaid\nfixture\n```", render: { diagram: () => frame } });
  const host = document.createElement("div");
  root.append(host);
  const companion = new DocumentAccessibilityDOM(host, controller, { label: "Native quote companion" });
  companion.update(120);
  cleanup = () => {
    companion.dispose();
    controller.dispose();
    root.remove();
  };
  return { name: fixture.name, text };
}

/** Release only test-owned trees, companions and controllers. */
export function disposeMermaidQuoteContextComparison() {
  cleanup?.();
  cleanup = undefined;
  target = undefined;
  targetHost = undefined;
  current = undefined;
}

/** Preflight refusal/recovery, untouched host state, early-stop bounds and a borrowed same-origin Window. */
export function verifyMermaidQuoteContextGuards() {
  const host = document.createElement("div"), style = document.createElement("style");
  const input = document.createElement("input"), preceding = document.createElement("div");
  const following = document.createElement("div");
  host.style.contain = "style";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "400");
  svg.setAttribute("height", "120");
  svg.innerHTML =
    `<foreignObject width="350" height="100"><div xmlns="http://www.w3.org/1999/xhtml">${label}</div></foreignObject>`;
  host.append(style, input, preceding, svg, following);
  document.body.append(host);
  input.focus();
  const base =
    '.generated{quotes:"[" "]" "<" ">" "{" "}"}.generated::before{content:open-quote}.generated::after{content:close-quote}';
  const headStyles = document.head.querySelectorAll("style").length;
  let checks = 0;
  const capture = () => {
    const diagnostics = new Set<string>();
    const text = withMermaidGeneratedContent(svg, diagnostics, () => svg.querySelector("foreignObject")!.textContent);
    if (diagnostics.size) throw new Error(`Quote-context guard diagnostics: ${[...diagnostics]}`);
    return text;
  };
  const unchanged = (markup: string) => {
    if (
      host.innerHTML !== markup || document.head.querySelectorAll("style").length !== headStyles ||
      document.activeElement !== input
    ) {
      throw new Error("Quote-context preflight/capture changed host markup/styles/focus");
    }
    checks++;
  };
  const refuses = (body: string, css: string) => {
    preceding.innerHTML = body;
    style.textContent = base + css;
    const markup = host.innerHTML;
    let error: unknown;
    try {
      capture();
    } catch (value) {
      error = value;
    }
    if (!(error instanceof RangeError)) throw new Error(`Expected bounded quotation-context refusal: ${error}`);
    unchanged(markup);
    preceding.replaceChildren();
    style.textContent = base;
    if (capture() !== outer) throw new Error("Quotation context did not recover after preflight refusal");
    checks++;
  };
  try {
    style.textContent = base + ".context::before{content:no-open-quote}";
    preceding.innerHTML = prefix;
    const text = svg.querySelector(".generated")!.firstChild!;
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(text, 5, text, 1);
    let markup = host.innerHTML;
    if (capture() !== nested) throw new Error("External context not retained through guarded capture");
    if (
      selection.anchorNode !== text || selection.anchorOffset !== 5 || selection.focusNode !== text ||
      selection.focusOffset !== 1
    ) {
      throw new Error("Quotation-context capture changed borrowed backwards selection");
    }
    unchanged(markup);
    try {
      withMermaidGeneratedContent(svg, new Set(), () => {
        throw new Error("quote callback failure");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "quote callback failure") throw error;
    }
    unchanged(markup);
    preceding.replaceChildren();
    style.textContent = base;
    following.innerHTML = "<span></span>".repeat(33_000);
    markup = host.innerHTML;
    if (capture() !== outer) throw new Error("Unread following nodes influenced quote capture");
    unchanged(markup);
    following.replaceChildren();
    refuses("<span></span>".repeat(33_000), "");
    refuses("<div>".repeat(260) + "</div>".repeat(260), "");
    refuses(prefix.repeat(65), ".context::before{content:" + "no-open-quote ".repeat(256) + "}");
    refuses(prefix, ".context::before{content:" + "no-open-quote ".repeat(257) + "}");
    refuses(prefix, '.context::before{content:"' + "x".repeat(16_385) + '" no-open-quote}');
    refuses(
      prefix.repeat(270),
      '.context::before{content:"' + "x".repeat(16_000) + '" no-open-quote;position:absolute;visibility:hidden}',
    );

    let captureIndex = 0;
    withMermaidGeneratedContent(svg, new Set(), () => {
      const name = svg.querySelector(".generated > span")!.getAttributeNames().find((name) =>
        name.startsWith("data-exotui-generated-")
      )!;
      captureIndex = Number(name.slice("data-exotui-generated-".length));
    });
    const borrowedAttribute = document.createElement("span");
    borrowedAttribute.className = "borrowed-context";
    borrowedAttribute.setAttribute(`data-exotui-generated-${captureIndex + 1}`, "authored");
    preceding.append(borrowedAttribute);
    style.textContent = base + ".borrowed-context::before{content:no-open-quote}";
    markup = host.innerHTML;
    withMermaidGeneratedContent(svg, new Set(), () => {
      if (getComputedStyle(borrowedAttribute, "::before").content !== "no-open-quote") {
        throw new Error("Owned suppression stylesheet changed unrelated authored host boxes");
      }
    });
    unchanged(markup);
    borrowedAttribute.remove();
    style.textContent = base;

    const frame = document.createElement("iframe");
    host.append(frame);
    const borrowed = frame.contentDocument!;
    borrowed.body.innerHTML = `<style>${base}.context::before{content:no-open-quote}</style>${prefix}`;
    const child = borrowed.importNode(svg, true);
    borrowed.body.append(child);
    const childMarkup = borrowed.documentElement.outerHTML, diagnostics = new Set<string>();
    const value = withMermaidGeneratedContent(
      child,
      diagnostics,
      () => child.querySelector("foreignObject")!.textContent,
    );
    if (value !== nested || diagnostics.size || borrowed.documentElement.outerHTML !== childMarkup) {
      throw new Error(
        `Borrowed same-origin Window quotation capture differs: ${
          JSON.stringify({ value, diagnostics: [...diagnostics] })
        }`,
      );
    }
    frame.remove();
    checks++;
  } finally {
    host.remove();
  }
  return { checks };
}
