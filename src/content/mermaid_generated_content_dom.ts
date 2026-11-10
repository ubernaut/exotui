// Copyright 2023 Im-Beast. MIT license.
import { generatedContentText, generatedStyleMatches } from "./mermaid_generated_content.ts";
import {
  generatedCounterRequests,
  generatedQuoteChanges,
  generatedQuotedContentValue,
  generatedQuoteProfile,
} from "./mermaid_quotes.ts";
import { generatedQuoteContexts } from "./mermaid_quotes_dom.ts";
import { withGeneratedCounterContentMetadata } from "./mermaid_counter_content_dom.ts";
import {
  generatedCounterFunctionValue,
  generatedCounterName,
  generatedCounterTokens,
} from "./mermaid_counter_styles.ts";
import { generatedCounterContexts } from "./mermaid_counters_dom.ts";

const html = "http://www.w3.org/1999/xhtml";
const math = "http://www.w3.org/1998/Math/MathML";
const active = new WeakMap<SVGSVGElement, string>();
const alternatives = new WeakMap<Element, string>();
let nextCapture = 0;
const properties = [
  "display",
  "contain",
  "counter-reset",
  "counter-increment",
  "counter-set",
  "visibility",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "box-sizing",
  "margin",
  "padding",
  "border",
  "vertical-align",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-variant",
  "font-stretch",
  "font-kerning",
  "font-feature-settings",
  "font-variation-settings",
  "quotes",
  "-webkit-locale",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "white-space",
  "word-break",
  "overflow-wrap",
  "hyphens",
  "text-wrap-mode",
  "text-wrap-style",
  "text-align",
  "text-indent",
  "direction",
  "unicode-bidi",
  "writing-mode",
  "transform",
  "transform-origin",
  "opacity",
  "color",
  "float",
  "clear",
  "overflow",
  "flex",
  "align-self",
  "order",
  "gap",
  "justify-content",
  "align-items",
  "flex-direction",
  "flex-wrap",
  "grid-template-columns",
  "grid-template-rows",
] as const;
const textProperties = properties.filter((property) =>
  property.startsWith("font-") || [
    "line-height",
    "word-break",
    "overflow-wrap",
    "hyphens",
    "text-wrap-mode",
    "text-wrap-style",
    "letter-spacing",
    "word-spacing",
    "text-transform",
    "text-align",
    "text-indent",
    "white-space",
    "direction",
    "unicode-bidi",
    "writing-mode",
    "color",
  ].includes(property)
);
const fingerprintProperties = [
  ...properties,
  "fill",
  "stroke",
  "clip-path",
  "filter",
  "background-color",
  "d",
  "clip-rule",
  "fill-rule",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "fill-opacity",
  "stroke-opacity",
  "paint-order",
  "vector-effect",
  "marker-start",
  "marker-mid",
  "marker-end",
];
const excluded = "style,script,title,desc,annotation,annotation-xml,mphantom,iframe,object,embed,img";

function captureAttribute(svg: SVGSVGElement): string {
  let attribute: string, collisions = 0;
  const scope = svg.getRootNode() as Document | ShadowRoot | Element;
  do {
    if (++collisions > 64) throw new RangeError("Mermaid generated capture attribute collision budget exceeded.");
    attribute = `data-exotui-generated-${++nextCapture}`;
  } while (svg.hasAttribute(attribute) || svg.querySelector(`[${attribute}]`) || scope.querySelector(`[${attribute}]`));
  return attribute;
}

function suppressionStyle(document: Document, attribute: string): HTMLStyleElement {
  const stylesheet = document.createElement("style");
  stylesheet.textContent =
    `@layer exotui-${attribute}{[${attribute}]::before,[${attribute}]::after{content:none!important}}`;
  return stylesheet;
}

function appendSuppressionStyle(svg: SVGSVGElement, stylesheet: HTMLStyleElement): () => void {
  const root = svg.getRootNode();
  // A document stylesheet cannot suppress generated boxes in a shadow tree.
  // nodeType works for SVGs borrowed from another same-origin Window too.
  const scope = root.nodeType === 11 && "host" in root ? root as ShadowRoot : svg.ownerDocument;
  // The private first layer wins authored !important layers. Keep the original
  // SVG stylesheet intact; structural selectors remain fidelity-checked.
  (scope.nodeType === 11 ? scope : svg.ownerDocument.head).prepend(stylesheet);
  return () => stylesheet.remove();
}

function suppressed(view: Window, element: Element): boolean {
  return view.getComputedStyle(element, "::before").content === "none" &&
    view.getComputedStyle(element, "::after").content === "none";
}

/** Read an owned generated box's literal accessible alternative, including the decorative empty string. */
export function generatedContentAlternative(element: Element): string | undefined {
  return alternatives.get(element);
}

/** Retain owned generated alternatives through bounded local SVG instance clones without authored attributes. */
export function copyGeneratedContentAlternative(source: Element, copy: Element): void {
  const value = alternatives.get(source);
  if (value !== undefined) alternatives.set(copy, value);
}

/** Materialize resolved textual pseudo boxes only while measuring, with bounded preflight and finally-owned cleanup. */
export function withMermaidGeneratedContent<T>(svg: SVGSVGElement, diagnostics: Set<string>, read: () => T): T {
  if (active.has(svg)) return read();
  const document = svg.ownerDocument, view = document.defaultView!;
  const candidates = [...svg.querySelectorAll("foreignObject *")];
  if (candidates.length > 16_384) throw new RangeError("Mermaid generated content exceeds its node budget.");
  const prepared: { owner: Element; before?: HTMLElement; after?: HTMLElement }[] = [];
  const eligible: Element[] = [];
  const displays = new Map<HTMLElement, string>();
  let units = 0, styleUnits = 0, boxes = 0, ancestorReads = 0;
  for (const owner of candidates) {
    if (![html, math].includes(owner.namespaceURI ?? "") || owner.closest(excluded)) continue;
    let displayed = true;
    let depth = 0;
    for (let ancestor: Element | null = owner; ancestor; ancestor = ancestor.parentElement) {
      if (++depth > 128 || ++ancestorReads > 128_000) {
        throw new RangeError("Mermaid generated content exceeds its ancestor-work budget.");
      }
      if (view.getComputedStyle(ancestor).display === "none") displayed = false;
      if (ancestor === svg) break;
    }
    if (!displayed) continue;
    eligible.push(owner);
  }
  const quoteState = { depth: 0 };
  const quoteProfile = generatedQuoteProfile(view.navigator.userAgent);
  const quoteContexts = eligible.some((owner) =>
      ["before", "after"].some((side) => {
        const css = view.getComputedStyle(owner, `::${side}`);
        return css.display !== "none" && generatedQuoteChanges(css.content).length;
      })
    )
    ? generatedQuoteContexts(svg, new Set(eligible))
    : undefined;
  const stack: typeof prepared = [];
  const counterOwners = new Set(eligible.filter((owner) =>
    ["before", "after"].some((side) => {
      const css = view.getComputedStyle(owner, `::${side}`);
      return css.display !== "none" && generatedCounterRequests(css.content).length;
    })
  ));
  type Requests = ReturnType<typeof generatedCounterRequests>;
  type CounterRecord = {
    before?: Requests;
    after?: Requests;
    styles: ReturnType<import("./mermaid_counter_content_dom.ts").GeneratedCounterContentMetadata["styles"]>;
  };
  const counterData = new Map<Element, CounterRecord>(), counterNames = new Set<string>();
  if (counterOwners.size) {
    try {
      withGeneratedCounterContentMetadata(svg, counterOwners, (metadata) => {
        for (const owner of counterOwners) {
          const record: CounterRecord = { styles: metadata.styles(owner) };
          for (const side of ["before", "after"] as const) {
            record[side] = metadata.requests(owner, side, view.getComputedStyle(owner, `::${side}`).content);
            for (const request of record[side] ?? []) {
              const name = generatedCounterName(generatedCounterTokens(request.arguments)[0] ?? "");
              if (name) counterNames.add(name);
            }
          }
          counterData.set(owner, record);
        }
      });
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      diagnostics.add(error.message);
    }
  }
  const counterContexts = counterData.size ? generatedCounterContexts(svg, counterOwners, counterNames) : undefined;
  const prepare = (record: typeof prepared[number], side: "before" | "after") => {
    const owner = record.owner;
    const css = view.getComputedStyle(owner, `::${side}`);
    if (["none", "normal", ""].includes(css.content) || css.display === "none") return;
    if (quoteContexts) {
      const context = quoteContexts.get(owner);
      if (!context) return; // No generated box in the original rendered host tree.
      quoteState.depth = context[side];
    }
    const locale = generatedContentText(css.getPropertyValue("-webkit-locale")) ?? "und";
    const counters = counterData.get(owner), requests = counters?.[side];
    let requestIndex = 0;
    const value = generatedQuotedContentValue(
      css.content,
      css.quotes,
      locale,
      quoteState,
      quoteProfile,
      (_name, _argumentsText) => {
        const request = requests?.[requestIndex++], context = counterContexts?.get(owner)?.[side];
        if (!request || !context) return;
        return generatedCounterFunctionValue(
          request.name,
          request.arguments,
          (name) => context.get(name),
          counters!.styles,
          quoteProfile === "chromium-common" ? "chromium" : "standard",
        );
      },
    );
    if (value === undefined) {
      diagnostics.add(
        "Generated CSS counters, images or unsupported content need native expansion.",
      );
      return;
    }
    units += value.text.length + (value.alternative?.length ?? 0);
    if (++boxes > 1024 || units > 65_536) {
      throw new RangeError("Mermaid generated content exceeds its capture budget.");
    }
    const span = document.createElementNS(html, "span");
    span.style.setProperty("all", "initial", "important");
    for (const property of properties) {
      const value = css.getPropertyValue(property);
      if ((styleUnits += value.length) > 128_000) {
        throw new RangeError("Mermaid generated content exceeds its style budget.");
      }
      span.style.setProperty(property, value, "important");
    }
    // Preserve inherited font provenance when the pseudo uses its owner's
    // choice. Reserializing a generic family can lose language fallback, and
    // explicit keyword-size/feature values can split Chromium inline shaping
    // under important-layer suppression despite identical computed values.
    // Distinct authored pseudo choices must remain explicit.
    const ownerStyle = view.getComputedStyle(owner);
    for (const property of ["font-family", "font-size", "font-feature-settings"]) {
      if (css.getPropertyValue(property) === ownerStyle.getPropertyValue(property)) {
        span.style.setProperty(property, "inherit", "important");
      }
    }
    displays.set(span, span.style.getPropertyValue("display"));
    // Hidden probes must prove pseudo suppression before becoming renderable,
    // including against higher-specificity authored !important selectors.
    span.style.setProperty("display", "none", "important");
    span.textContent = value.text;
    if (value.alternative !== undefined) alternatives.set(span, value.alternative);
    record[side] = span;
    if (
      css.backgroundColor !== "rgba(0, 0, 0, 0)" || css.backgroundImage !== "none" ||
      Number.parseFloat(css.borderTopWidth) || Number.parseFloat(css.borderRightWidth) ||
      Number.parseFloat(css.borderBottomWidth) || Number.parseFloat(css.borderLeftWidth) ||
      css.boxShadow !== "none" || css.textShadow !== "none" || css.filter !== "none" || css.clipPath !== "none"
    ) diagnostics.add("Generated CSS box backgrounds, borders, shadows or effects need native expansion.");
  };
  const finish = () => {
    const record = stack.pop()!;
    prepare(record, "after");
    if (record.before || record.after) prepared.push(record);
  };
  // Quote depth follows flattened source order, not a flat before/after pair
  // per owner: parent's after comes AFTER every nested child's generated text.
  for (const owner of eligible) {
    while (stack.length && !stack.at(-1)!.owner.contains(owner)) finish();
    const record: typeof prepared[number] = { owner };
    stack.push(record);
    prepare(record, "before");
  }
  while (stack.length) finish();
  if (!prepared.length) return read();
  const originals = [svg, ...svg.querySelectorAll("*")];
  if (originals.length > 20_000) throw new RangeError("Mermaid generated content exceeds its fidelity-work budget.");
  let fidelityUnits = 0;
  const snapshot = (element: Element) => {
    const css = view.getComputedStyle(element), box = element.getBoundingClientRect();
    const values = fingerprintProperties.map((property) => {
      const value = css.getPropertyValue(property);
      if (value.length > 16_384 || (fidelityUnits += value.length) > 32_768_000) {
        throw new RangeError("Mermaid generated content exceeds its fidelity-style budget.");
      }
      return value;
    });
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) {
      throw new RangeError("Mermaid generated content has non-finite source geometry.");
    }
    return {
      style: values,
      bounds: [box.x, box.y, box.width, box.height],
    };
  };
  const reference = originals.map(snapshot);
  const textRanges: Range[] = [];
  const walker = document.createTreeWalker(svg, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (text.parentElement?.closest(excluded)) continue;
    if (textRanges.length >= 16_384) throw new RangeError("Mermaid generated content exceeds its text-range budget.");
    const range = document.createRange();
    range.selectNodeContents(text);
    textRanges.push(range);
  }
  const textBounds = textRanges.map((range) => range.getBoundingClientRect());
  const attribute = captureAttribute(svg);
  const stylesheet = suppressionStyle(document, attribute);
  let removeSuppression = () => stylesheet.remove();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const { owner, before, after } of prepared) {
      before?.remove();
      after?.remove();
      owner.removeAttribute(attribute);
    }
    removeSuppression();
    active.delete(svg);
  };
  try {
    removeSuppression = appendSuppressionStyle(svg, stylesheet);
    active.set(svg, attribute);
    for (const { owner } of prepared) {
      owner.setAttribute(attribute, "");
    }
    if (prepared.some(({ owner }) => !suppressed(view, owner))) {
      dispose();
      diagnostics.add("Generated CSS source boxes could not be safely suppressed.");
      return read();
    }
    for (const { owner, before, after } of prepared) {
      for (const node of [before, after]) node?.setAttribute(attribute, "");
      if (before) owner.prepend(before);
      if (after) owner.append(after);
    }
    const probes = prepared.flatMap(({ before, after }) =>
      [before, after].filter((node): node is HTMLElement => !!node)
    );
    if (probes.some((node) => !suppressed(view, node))) {
      dispose();
      diagnostics.add("Generated CSS probe boxes could not be safely suppressed.");
      return read();
    }
    for (const node of probes) {
      node.style.setProperty("display", displays.get(node)!, "important");
    }
    let fidelityReason = "source pseudo suppression";
    const faithful = originals.every((element, index) => {
      const current = snapshot(element), previous = reference[index]!;
      const changedStyle = current.style.findIndex((value, property) =>
        !generatedStyleMatches(fingerprintProperties[property]!, previous.style[property]!, value)
      );
      if (changedStyle >= 0) {
        fidelityReason = `source element ${index} property ${fingerprintProperties[changedStyle]}`;
        return false;
      }
      const changedAxis = current.bounds.findIndex((value, axis) => Math.abs(value - previous.bounds[axis]!) >= 0.25);
      if (changedAxis >= 0) {
        fidelityReason = `source element ${index} bounds axis ${changedAxis}: ${previous.bounds[changedAxis]} -> ${
          current.bounds[changedAxis]
        }`;
        return false;
      }
      return true;
    });
    if (
      !faithful || prepared.some(({ owner }) => !suppressed(view, owner)) ||
      textRanges.some((range, index) => {
        const current = range.getBoundingClientRect(), previous = textBounds[index]!;
        return ["x", "y", "width", "height"].some((axis) =>
          Math.abs(current[axis as keyof DOMRect] as number - (previous[axis as keyof DOMRect] as number)) >= 0.25
        );
      })
    ) {
      dispose();
      diagnostics.add("Generated CSS materialization changed source styles/layout or could not suppress source boxes.");
      diagnostics.add(`Generated CSS fidelity refusal: ${fidelityReason}.`);
    }
    return read();
  } finally {
    dispose();
  }
}

/** Measure an HTML-in-MathML text baseline without retaining wrappers or changing source layout. */
export function generatedMathTextBaseline(node: Text, diagnostics: Set<string>): number {
  const document = node.ownerDocument!, owner = node.parentElement!, view = document.defaultView!;
  let svg: SVGSVGElement | undefined, attribute: string | undefined;
  let depth = 0;
  for (let ancestor: Element | null = owner; ancestor; ancestor = ancestor.parentElement) {
    if (++depth > 128) throw new RangeError("MathML baseline ancestry exceeds its budget.");
    if (ancestor.namespaceURI !== "http://www.w3.org/2000/svg" || ancestor.localName !== "svg") continue;
    svg ??= ancestor as SVGSVGElement;
    attribute = active.get(ancestor as SVGSVGElement);
    if (attribute) break;
  }
  if (!svg) throw new TypeError("MathML baseline measurement requires an SVG owner.");
  const stylesheet = attribute ? undefined : suppressionStyle(document, attribute = captureAttribute(svg));
  let removeSuppression = () => stylesheet?.remove();
  const range = document.createRange();
  range.selectNodeContents(node);
  const reference = range.getBoundingClientRect();
  const selection = document.getSelection();
  if (selection && selection.rangeCount > 64) throw new RangeError("MathML selection snapshot exceeds its budget.");
  const selected = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => {
      const range = selection.getRangeAt(index);
      return {
        start: range.startContainer,
        startOffset: range.startOffset,
        end: range.endContainer,
        endOffset: range.endOffset,
      };
    })
    : [];
  const anchor = selection?.anchorNode, anchorOffset = selection?.anchorOffset;
  const focus = selection?.focusNode, focusOffset = selection?.focusOffset;
  let wrapper: HTMLElement | undefined;
  const marker = document.createElementNS(html, "span");
  marker.style.cssText =
    "all:initial!important;display:none!important;width:0!important;height:0!important;vertical-align:baseline!important";
  marker.setAttribute(attribute, "");
  try {
    if (stylesheet) removeSuppression = appendSuppressionStyle(svg, stylesheet);
    if (owner.namespaceURI === math) {
      wrapper = document.createElementNS(html, "span");
      wrapper.style.cssText =
        "all:initial!important;display:none!important;position:static!important;margin:0!important;padding:0!important;border:0!important";
      const css = view.getComputedStyle(owner);
      let units = 0;
      for (const property of textProperties) {
        const value = css.getPropertyValue(property);
        if ((units += value.length) > 16_384) throw new RangeError("MathML baseline text styles exceed their budget.");
        wrapper.style.setProperty(property, value, "important");
      }
      wrapper.setAttribute(attribute, "");
      owner.replaceChild(wrapper, node);
      wrapper.append(node);
    }
    node.parentNode!.insertBefore(marker, node);
    if (!suppressed(view, marker) || wrapper && !suppressed(view, wrapper)) {
      diagnostics.add("Mixed MathML baseline probes could not safely suppress generated CSS.");
      return reference.bottom;
    }
    wrapper?.style.setProperty("display", "inline", "important");
    marker.style.setProperty("display", "inline-block", "important");
    range.selectNodeContents(node);
    const current = range.getBoundingClientRect();
    if (
      ["x", "y", "width", "height"].some((key) =>
        Math.abs(current[key as keyof DOMRect] as number - (reference[key as keyof DOMRect] as number)) > 0.25
      )
    ) {
      diagnostics.add("Mixed MathML baseline measurement changed token shaping.");
      return reference.bottom;
    }
    return marker.getBoundingClientRect().top;
  } finally {
    marker.remove();
    wrapper?.replaceWith(node);
    removeSuppression();
    if (
      selection && (selection.rangeCount !== selected.length || selected.some((before, index) => {
        if (index >= selection.rangeCount) return true;
        const after = selection.getRangeAt(index);
        return before.start !== after.startContainer || before.startOffset !== after.startOffset ||
          before.end !== after.endContainer || before.endOffset !== after.endOffset;
      }))
    ) {
      selection.removeAllRanges();
      for (const saved of selected) {
        const range = document.createRange();
        range.setStart(saved.start, saved.startOffset);
        range.setEnd(saved.end, saved.endOffset);
        selection.addRange(range);
      }
      if (selected.length === 1 && anchor && focus) {
        selection.setBaseAndExtent(anchor, anchorOffset!, focus, focusOffset!);
      }
    }
  }
}
