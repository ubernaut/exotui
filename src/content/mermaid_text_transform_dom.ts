// Copyright 2023 Im-Beast. MIT license.
import { diagramSemanticNamespace } from "./document_semantics.ts";
import { measuredHTMLGlyphDirection } from "./mermaid_bidi.ts";

/** Share bounded, context-aware displayed text across semantic content and local ARIA references. */
export function renderedTextResolver(document: Document): (node: Text) => string {
  const view = document.defaultView;
  const cache = new WeakMap<Element, ReadonlyMap<Text, string>>();
  let visited = 0;
  const metadata = new Set(["title", "desc", "style", "script", "metadata", "annotation", "annotation-xml"]);
  return (node) => {
    const owner = node.parentElement;
    if (!view || !owner) return node.data;
    const transform = view.getComputedStyle(owner).textTransform;
    // MathML's math-auto retains logical operands; the semantic companion owns its default italic projection.
    if (transform === "none" || transform === "math-auto") return node.data;
    for (let at: Element | null = owner; at; at = at.parentElement) {
      if (metadata.has(at.localName) || view.getComputedStyle(at).display === "none") return node.data;
    }
    const scope = owner.closest("text,foreignObject,math") ?? owner;
    let values = cache.get(scope);
    if (!values) {
      const walker = document.createTreeWalker(scope, view.NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) {
        if (++visited > 20_000) throw new RangeError("Mermaid semantic casing exceeds its work budget.");
        let displayed = true;
        for (let at = walker.currentNode.parentElement; at; at = at.parentElement) {
          if (metadata.has(at.localName) || view.getComputedStyle(at).display === "none") {
            displayed = false;
            break;
          }
          if (at === scope) break;
        }
        if (displayed) nodes.push(walker.currentNode as Text);
      }
      const texts = renderedTextSlices(scope, nodes.map((node) => ({ node, start: 0, end: node.length })));
      values = new Map(nodes.map((node, index) => [node, texts[index]!]));
      cache.set(scope, values);
    }
    const value = values.get(node);
    if (value === undefined) throw new RangeError("Mermaid semantic casing lost its displayed source node.");
    return value;
  };
}

/** A source-node interval; replacement text is already normalized by SVG's whitespace rules. */
export interface MermaidTextSlice {
  node: Text;
  start: number;
  end: number;
}

/**
 * Read the owning browser's rendered Unicode casing, rather than reimplementing CSS/language rules.
 * An isolated, text-only document keeps its selection separate from the application and loads no resources.
 */
export function renderedTextSlices(
  root: Element,
  slices: readonly MermaidTextSlice[],
  replacements: ReadonlyMap<Text, string> = new Map(),
): string[] {
  const document = root.ownerDocument, view = document.defaultView!;
  for (const { node, start, end } of slices) {
    const text = replacements.get(node) ?? node.data;
    if (
      !root.contains(node) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start ||
      end > text.length
    ) {
      throw new RangeError("Rendered text slice has invalid source offsets.");
    }
  }
  const original = slices.map(({ node, start, end }) => (replacements.get(node) ?? node.data).slice(start, end));
  if (!slices.some(({ node }) => view.getComputedStyle(node.parentElement!).textTransform !== "none")) return original;
  let output = 0;
  return projectedTextSlices(root, slices, replacements, false, (owned, text, start, end) => {
    const selection = owned.defaultView!.getSelection()!, range = owned.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    selection.removeAllRanges();
    selection.addRange(range);
    const value = selection.toString();
    output += value.length;
    if (output > 65_536) throw new RangeError("Rendered text exceeds its output budget.");
    return value;
  });
}

/** Resolve ambiguous HTML caret affinity in a lazy, bounded text-only projection, never in application selection. */
export function measuredTextDirectionResolver(
  root: Element,
  slices: readonly MermaidTextSlice[],
): (node: Text, start: number, end: number) => "ltr" | "rtl" | undefined {
  let values: Map<Text, Map<string, "ltr" | "rtl" | undefined>> | undefined;
  return (node, start, end) => {
    if (!values) {
      const directions = projectedTextSlices(root, slices, new Map(), true, (owned, text) => {
        const range = owned.createRange();
        range.selectNodeContents(text);
        const box = range.getBoundingClientRect();
        range.collapse(true);
        const from = range.getBoundingClientRect();
        range.setStart(text, text.length);
        range.collapse(true);
        return measuredHTMLGlyphDirection(box, from, range.getBoundingClientRect());
      });
      values = new Map();
      for (const [index, slice] of slices.entries()) {
        let offsets = values.get(slice.node);
        if (!offsets) values.set(slice.node, offsets = new Map());
        offsets.set(`${slice.start}:${slice.end}`, directions[index]);
      }
    }
    return values.get(node)?.get(`${start}:${end}`);
  };
}

function projectedTextSlices<T>(
  root: Element,
  slices: readonly MermaidTextSlice[],
  replacements: ReadonlyMap<Text, string>,
  separate: boolean,
  measure: (document: Document, node: Text, start: number, end: number) => T,
): T[] {
  const document = root.ownerDocument, view = document.defaultView!;
  if (slices.length > 16_384) throw new RangeError("Rendered text exceeds its slice budget.");
  for (const { node, start, end } of slices) {
    if (
      !root.contains(node) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start ||
      end > (replacements.get(node) ?? node.data).length
    ) throw new RangeError("Rendered text slice has invalid source offsets.");
  }
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "all:initial!important;display:block!important;position:fixed!important;left:-100000px!important;top:0!important;width:400px!important;height:200px!important;pointer-events:none!important;opacity:0!important";
  document.body.append(frame);
  try {
    const owned = frame.contentDocument;
    if (!owned?.body) throw new Error("Rendered text needs an isolated measuring document.");
    const nodes = new Map<Text, Text>();
    let count = 0, characters = 0;
    const htmlTags = new Set(["div", "span", "p", "br", "pre", "b", "i", "em", "strong", "code", "sub", "sup"]);
    const clone = (source: Node, depth: number): Node | undefined => {
      if (++count > 16_384 || depth > 128) throw new RangeError("Rendered text exceeds its node/depth budget.");
      if (source instanceof view.Text) {
        const value = replacements.get(source) ?? source.data;
        characters += value.length;
        if (characters > 65_536) throw new RangeError("Rendered text exceeds its character budget.");
        const text = owned.createTextNode(value);
        nodes.set(source, text);
        return text;
      }
      if (!(source instanceof view.Element)) return;
      const css = view.getComputedStyle(source);
      if (
        css.display === "none" ||
        ["style", "script", "title", "desc", "defs", "annotation", "annotation-xml"].includes(source.localName)
      ) return;
      const svg = source.namespaceURI === "http://www.w3.org/2000/svg";
      const math = source.namespaceURI === "http://www.w3.org/1998/Math/MathML";
      if (svg && !["text", "tspan", "textPath", "foreignObject", "svg", "g", "a"].includes(source.localName)) return;
      if (math && diagramSemanticNamespace(source.localName) !== "mathml") return;
      const name = svg || math
        ? source.localName === "textPath" ? "tspan" : source.localName
        : htmlTags.has(source.localName)
        ? source.localName
        : "span";
      const copy = owned.createElementNS(
        math
          ? "http://www.w3.org/1998/Math/MathML"
          : svg
          ? "http://www.w3.org/2000/svg"
          : "http://www.w3.org/1999/xhtml",
        name,
      ) as
        | HTMLElement
        | SVGElement
        | MathMLElement;
      // No source stylesheet, font bytes, URLs or executable attributes are installed.
      for (
        const [property, value] of [
          ["display", css.display],
          ["text-transform", css.textTransform],
          ["direction", css.direction],
          ["unicode-bidi", css.unicodeBidi],
          ["white-space", separate ? css.whiteSpace : "pre"],
          ["visibility", "visible"],
        ]
      ) copy.style.setProperty(property!, value!);
      // Direction does not depend on source font bytes or transforms. Use readable
      // private metrics while retaining the original paragraph/inline bidi scopes.
      if (separate) copy.style.setProperty("font", "24px monospace");
      for (let ancestor: Element | null = source; ancestor; ancestor = ancestor.parentElement) {
        const language = ancestor.getAttribute("lang") ?? ancestor.getAttribute("xml:lang");
        if (language !== null) {
          if (language.length > 256) throw new RangeError("Rendered text language exceeds its budget.");
          copy.setAttribute("lang", language);
          break;
        }
      }
      if (svg && name === "text") {
        copy.setAttribute("x", "0");
        copy.setAttribute("y", "24");
      }
      if (svg && name === "foreignObject") {
        copy.setAttribute("width", "32768");
        copy.setAttribute("height", "32768");
      }
      for (const child of source.childNodes) {
        const projected = clone(child, depth + 1);
        if (projected) copy.append(projected);
      }
      return copy;
    };
    const projected = clone(root, 0);
    if (!projected) throw new RangeError("Rendered text root is not displayed.");
    if (root.namespaceURI === "http://www.w3.org/2000/svg") {
      const svg = owned.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "32768");
      svg.setAttribute("height", "32768");
      svg.append(projected);
      owned.body.append(svg);
    } else owned.body.append(projected);
    const separated = new Map<MermaidTextSlice, Text>();
    if (separate) {
      const grouped = new Map<Text, MermaidTextSlice[]>();
      for (const slice of slices) {
        let intervals = grouped.get(slice.node);
        if (!intervals) grouped.set(slice.node, intervals = []);
        intervals.push(slice);
      }
      for (const [node, intervals] of grouped) {
        const text = nodes.get(node);
        if (!text) throw new RangeError("Rendered text slice has no visible source node.");
        let previous = text.length;
        for (const slice of intervals.sort((a, b) => b.start - a.start)) {
          if (slice.end > previous || slice.start === slice.end) {
            throw new RangeError("Rendered direction slices must be nonempty and disjoint.");
          }
          if ((count += 2) > 16_384) throw new RangeError("Rendered text exceeds its node/depth budget.");
          const interval = text.splitText(slice.start);
          interval.splitText(slice.end - slice.start);
          separated.set(slice, interval);
          previous = slice.start;
        }
      }
    }
    return slices.map((slice) => {
      const { node, start, end } = slice;
      if (separate) return measure(owned, separated.get(slice)!, 0, end - start);
      const text = nodes.get(node);
      if (!text) throw new RangeError("Rendered text slice has no visible source node.");
      return measure(owned, text, start, end);
    });
  } finally {
    frame.remove();
  }
}
