// Copyright 2023 Im-Beast. MIT license.
import { generatedQuoteChanges } from "./mermaid_quotes.ts";

const html = "http://www.w3.org/1999/xhtml", math = "http://www.w3.org/1998/Math/MathML";
const svgNamespace = "http://www.w3.org/2000/svg";
const replaced = new Set([
  "img",
  "input",
  "textarea",
  "select",
  "iframe",
  "object",
  "embed",
  "video",
  "audio",
  "canvas",
]);
const definitions = new Set(["defs", "symbol", "clipPath", "mask", "marker", "pattern"]);

function shadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && "host" in node;
}

/** Original incoming depths, before either generated side changes its containing scope. */
export interface GeneratedQuoteDepths {
  before: number;
  after: number;
}

/**
 * Read original flattened host order without modifying it. Style containment
 * inherits preceding depth, but its changes do not escape to its parent scope.
 * Open shadow roots and the target's accessible ancestor roots use slot order.
 */
export function generatedQuoteContexts(
  svg: SVGSVGElement,
  owners: ReadonlySet<Element>,
): ReadonlyMap<Element, GeneratedQuoteDepths> {
  const view = svg.ownerDocument.defaultView!;
  const result = new Map<Element, GeneratedQuoteDepths>();
  const roots = new Map<Element, ShadowRoot>();
  let root = svg.getRootNode(), ancestorWork = 0;
  while (shadowRoot(root)) {
    if (++ancestorWork > 128) throw new RangeError("Mermaid quotation host ancestors exceed their budget.");
    roots.set(root.host, root);
    root = root.host.getRootNode();
  }
  const start = root.nodeType === 9
    ? (root as Document).documentElement
    : root.nodeType === 1
    ? root as Element
    : undefined;
  if (!start) return result;
  type Scope = { depth: number };
  type Frame = {
    element: Element;
    scope: Scope;
    children?: HTMLCollection | readonly Element[];
    at: number;
    entered: boolean;
    hidden?: boolean;
  };
  const frames: Frame[] = [{ element: start, scope: { depth: 0 }, at: 0, entered: false }];
  let work = 0, styleUnits = 0, inside = false;
  const change = (content: string, scope: Scope) => {
    if ((styleUnits += content.length) > 4_194_304) {
      throw new RangeError("Mermaid quotation host content exceeds its budget.");
    }
    for (const value of generatedQuoteChanges(content)) {
      scope.depth = Math.max(0, scope.depth + value);
      if (scope.depth > 16_384) throw new RangeError("Mermaid quotation depth exceeds its budget.");
    }
  };
  const side = (element: Element, side: "marker" | "before" | "after", scope: Scope) => {
    if (![html, math].includes(element.namespaceURI ?? "") || replaced.has(element.localName)) return;
    const css = view.getComputedStyle(element, `::${side}`);
    if (["none", "normal", ""].includes(css.content) || css.display === "none") return;
    // Current Chromium associates LayoutQuote with its originating element's
    // scope; contain:style on the pseudo itself does not isolate these tokens.
    change(css.content, scope);
  };
  while (frames.length) {
    if (frames.length > 256) {
      throw new RangeError("Mermaid quotation host traversal exceeds its budget.");
    }
    const frame = frames.at(-1)!, element = frame.element;
    if (frame.entered) {
      const child = frame.children?.[frame.at++];
      if (child) {
        frames.push({ element: child, scope: frame.scope, at: 0, entered: false });
        continue;
      }
      const record = result.get(element);
      if (record) record.after = frame.scope.depth;
      if (!frame.hidden) side(element, "after", frame.scope);
      frames.pop();
      if (element === svg) break;
      continue;
    }
    if (++work > 32_768) throw new RangeError("Mermaid quotation host traversal exceeds its budget.");
    if (element === svg) inside = true;
    const css = view.getComputedStyle(element);
    if (css.display === "none") {
      if (element === svg) break;
      frames.pop();
      continue;
    }
    if (element.namespaceURI === svgNamespace && definitions.has(element.localName)) {
      frames.pop();
      continue;
    }
    const scope = css.contain.split(/\s+/).some((token) => ["style", "strict", "content"].includes(token)) ||
        css.contentVisibility !== "visible"
      ? { depth: frame.scope.depth }
      : frame.scope;
    frame.scope = scope;
    frame.entered = true;
    frame.hidden = css.contentVisibility === "hidden";
    if (frame.hidden) continue;
    if (css.display.split(/\s+/).includes("list-item")) side(element, "marker", scope);
    if (inside && owners.has(element)) result.set(element, { before: scope.depth, after: scope.depth });
    side(element, "before", scope);
    if (replaced.has(element.localName) && element.namespaceURI === html) continue;
    const shadow = element.shadowRoot ?? roots.get(element);
    const children = element.localName === "details" && element.namespaceURI === html && !element.hasAttribute("open")
      ? (() => {
        const summary = element.querySelector(":scope > summary");
        return summary ? [summary] : [];
      })()
      : shadow
      ? shadow.children
      : element.localName === "slot" && element.namespaceURI === html && shadowRoot(element.getRootNode())
      ? (() => {
        const assigned = (element as HTMLSlotElement).assignedNodes();
        if (assigned.length > 32_768) throw new RangeError("Mermaid quotation host slot exceeds its budget.");
        return assigned.length ? assigned.filter((node): node is Element => node.nodeType === 1) : element.children;
      })()
      : element.children;
    frame.children = children;
  }
  return result;
}
