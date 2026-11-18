// Copyright 2023 Im-Beast. MIT license.
import { generatedCounterDirectives, GeneratedCounterLedger, type GeneratedCounterNode } from "./mermaid_counters.ts";

const html = "http://www.w3.org/1999/xhtml", math = "http://www.w3.org/1998/Math/MathML";
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
type Side = "marker" | "before" | "after";
type Directives = ReturnType<typeof generatedCounterDirectives>;
interface OriginalNode extends GeneratedCounterNode {
  parent?: OriginalNode;
  element: Element;
  side?: Side;
  css: CSSStyleDeclaration;
  directives: Directives;
  contained: boolean;
  children?: OriginalNode[];
  iterator?: Generator<OriginalNode>;
  complete?: boolean;
}

export interface GeneratedCounterValues {
  before: ReadonlyMap<string, readonly number[]>;
  after: ReadonlyMap<string, readonly number[]>;
}

/**
 * Read original flattened layout order, including the host before the SVG.
 * This is a read-only state foundation, not a CSS content/cascade resolver.
 * Reversed resets inspect their original forward scope without mutating it.
 */
export function generatedCounterContexts(
  svg: SVGSVGElement,
  owners: ReadonlySet<Element>,
  names: ReadonlySet<string>,
  profile: "chromium-legacy" | "css-accounting" = "chromium-legacy",
): ReadonlyMap<Element, GeneratedCounterValues> {
  if (owners.size > 1024 || names.size > 256) throw new RangeError("Mermaid counter requests exceed their budget.");
  if ([...names].some((name) => name.length > 4096)) throw new RangeError("Mermaid counter name exceeds its budget.");
  const view = svg.ownerDocument.defaultView!, ledger = new GeneratedCounterLedger();
  const roots = new Map<Element, ShadowRoot>(), result = new Map<Element, GeneratedCounterValues>();
  const isShadow = (node: Node): node is ShadowRoot => node.nodeType === 11 && "host" in node;
  let root = svg.getRootNode(), ancestors = 0;
  while (isShadow(root)) {
    if (++ancestors > 128) throw new RangeError("Mermaid counter host ancestry exceeds its budget.");
    roots.set(root.host, root);
    root = root.host.getRootNode();
  }
  const start = root.nodeType === 9
    ? (root as Document).documentElement
    : root.nodeType === 1
    ? root as Element
    : undefined;
  if (!start) return result;
  let nodes = 0, styleUnits = 0, snapshotUnits = 0, forwardWork = 0;
  const checkedStyle = (css: CSSStyleDeclaration, property: string) => {
    const value = css.getPropertyValue(property);
    if (value.length > 16_384 || (styleUnits += value.length) > 4_194_304) {
      throw new RangeError("Mermaid counter host styles exceed their budget.");
    }
    return value;
  };
  const create = (element: Element, parent?: OriginalNode, side?: Side): OriginalNode | undefined => {
    if (++nodes > 32_768) throw new RangeError("Mermaid counter host nodes exceed their budget.");
    const css = view.getComputedStyle(element, side ? `::${side}` : undefined);
    if (css.display === "none" || side && ["none", "normal", ""].includes(checkedStyle(css, "content"))) return;
    if (!side && element.namespaceURI === "http://www.w3.org/2000/svg" && definitions.has(element.localName)) return;
    const directives = css.display === "contents" ? new Map() : generatedCounterDirectives(
      checkedStyle(css, "counter-reset"),
      checkedStyle(css, "counter-increment"),
      checkedStyle(css, "counter-set"),
    );
    return {
      parent,
      element,
      side,
      css,
      directives,
      contained: css.display !== "contents" &&
        (css.contain.split(/\s+/).some((part) => ["style", "strict", "content"].includes(part)) ||
          css.contentVisibility !== "visible"),
    };
  };
  function* iterateChildren(node: OriginalNode): Generator<OriginalNode> {
    const { element, css } = node;
    if (node.side || css.contentVisibility === "hidden") return;
    const childrenParent = css.display === "contents" ? node.parent : node;
    const pseudoEligible = [html, math].includes(element.namespaceURI ?? "") && !replaced.has(element.localName);
    if (pseudoEligible) {
      if (css.display.split(/\s+/).includes("list-item")) {
        const marker = create(element, childrenParent, "marker");
        if (marker) yield marker;
      }
      const before = create(element, childrenParent, "before");
      if (before) yield before;
    }
    if (!(element.namespaceURI === html && replaced.has(element.localName))) {
      const shadow = element.shadowRoot ?? roots.get(element);
      const source = element.namespaceURI === html && element.localName === "details" && !element.hasAttribute("open")
        ? (() => {
          const summary = element.querySelector(":scope > summary");
          return summary ? [summary] : [];
        })()
        : shadow
        ? shadow.children
        : element.namespaceURI === html && element.localName === "slot" && isShadow(element.getRootNode())
        ? (() => {
          const assigned = (element as HTMLSlotElement).assignedNodes();
          if (assigned.length > 32_768) throw new RangeError("Mermaid counter host slot exceeds its budget.");
          return assigned.length ? assigned.filter((node): node is Element => node.nodeType === 1) : element.children;
        })()
        : element.children;
      for (const child of source) {
        const original = create(child, childrenParent);
        if (!original) continue;
        // display:contents has no layout object and no counter directives. Its
        // generated children still participate at the nearest real parent.
        if (original.css.display === "contents") {
          for (let at = 0;; at++) {
            const nested = childAt(original, at);
            if (!nested) break;
            yield nested;
          }
        } else yield original;
      }
    }
    if (pseudoEligible) {
      const after = create(element, childrenParent, "after");
      if (after) yield after;
    }
  }
  let childReadDepth = 0;
  function childAt(node: OriginalNode, index: number): OriginalNode | undefined {
    if (++childReadDepth > 256) {
      childReadDepth--;
      throw new RangeError("Mermaid counter flattened contents exceed their depth budget.");
    }
    try {
      node.children ??= [];
      while (!node.complete && node.children.length <= index) {
        node.iterator ??= iterateChildren(node);
        const next = node.iterator.next();
        if (next.done) node.complete = true;
        else node.children.push(next.value);
      }
      return node.children[index];
    } finally {
      childReadDepth--;
    }
  }
  const htmlInteger = (source: string | null): number | undefined => {
    const match = /^[\t\n\f\r ]*([+-]?\d+)/.exec(source ?? "");
    if (!match) return;
    const value = Number(match[1]);
    return Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647 ? value : undefined;
  };
  const countListItems = (node: OriginalNode): number => {
    const pending = [{ node, at: 0 }];
    let count = 0;
    while (pending.length) {
      if (pending.length > 256 || ++forwardWork > 131_072) {
        throw new RangeError("Mermaid implicit lists exceed their forward-work budget.");
      }
      const frame = pending.at(-1)!, current = childAt(frame.node, frame.at++);
      if (!current) {
        pending.pop();
        continue;
      }
      if (
        !current.side && current.element.namespaceURI === html &&
        ["ol", "ul", "menu", "dir"].includes(current.element.localName)
      ) continue;
      if (current.css.display.split(/\s+/).includes("list-item")) count++;
      pending.push({ node: current, at: 0 });
    }
    return count;
  };
  const implicit = (node: OriginalNode): Directives => {
    const { element, css } = node;
    if (node.side || element.namespaceURI !== html || node.directives.has("list-item")) return node.directives;
    let directive: { reset: number } | { increment: number } | undefined;
    if (
      css.display.split(/\s+/).includes("list-item") && ["li", "ol", "ul", "menu", "dir"].includes(element.localName)
    ) {
      const explicit = element.localName === "li" && profile === "chromium-legacy"
        ? htmlInteger(element.getAttribute("value"))
        : undefined;
      let parent = node.parent;
      while (
        parent &&
        !(parent.element.namespaceURI === html && ["ol", "ul", "menu", "dir"].includes(parent.element.localName)) &&
        !(profile === "css-accounting" &&
          (parent.directives.get("list-item")?.reset !== undefined || parent.directives.get("list-item")?.reversed))
      ) {
        parent = parent.parent;
      }
      const reversed = profile === "css-accounting"
        ? parent?.directives.get("list-item")?.reversed
        : parent?.element.localName === "ol" && parent.element.hasAttribute("reversed");
      directive = explicit !== undefined ? { reset: explicit } : { increment: reversed ? -1 : 1 };
    } else if (["ol", "ul", "menu", "dir"].includes(element.localName)) {
      // Legacy HTML ordinals are absent from computed counter-reset. With CSS
      // accounting enabled, presentation hints already are explicit directives.
      const reversed = element.localName === "ol" && element.hasAttribute("reversed");
      const start = element.localName === "ol" ? htmlInteger(element.getAttribute("start")) : undefined;
      const initial = element.localName !== "ol" || profile === "css-accounting"
        ? 0
        : (start ?? (reversed ? countListItems(node) : 1)) + (reversed ? 1 : -1);
      directive = { reset: Math.min(2_147_483_647, Math.max(-2_147_483_648, initial)) };
    }
    return directive ? new Map([...node.directives, ["list-item", directive]]) : node.directives;
  };
  const forwardInitial = (node: OriginalNode, name: string): number => {
    const scope = node.parent;
    let at = 0;
    if (scope) {
      while (childAt(scope, at) !== node) {
        if (!childAt(scope, at++)) throw new TypeError("Mermaid reversed counter lost its original flattened scope.");
      }
    }
    const pending: { node: OriginalNode; at: number }[] = [
      ...(scope ? [{ node: scope, at: at + 1 }] : []),
      { node, at: 0 },
    ];
    let initial = 0, last = 0;
    while (pending.length) {
      if (pending.length > 256 || ++forwardWork > 131_072) {
        throw new RangeError("Mermaid reversed counters exceed their forward-work budget.");
      }
      const frame = pending.at(-1)!, current = childAt(frame.node, frame.at++);
      if (!current) {
        pending.pop();
        continue;
      }
      const directive = current.directives.get(name);
      if (directive?.reset !== undefined || directive?.reversed) {
        if (current.parent === scope) break;
        continue;
      }
      const increment = directive?.increment ??
        (name === "list-item" && !current.side && current.element.namespaceURI === html &&
            current.element.localName === "li"
          ? -1
          : 0);
      if (increment) last = -increment;
      if (directive?.set !== undefined) {
        initial += directive.set;
        break;
      }
      initial -= increment;
      pending.push({ node: current, at: 0 });
    }
    return Math.min(2_147_483_647, Math.max(-2_147_483_648, initial + last));
  };
  const snapshot = (node: OriginalNode): ReadonlyMap<string, readonly number[]> => {
    const map = new Map<string, readonly number[]>();
    for (const name of names) {
      const values = ledger.values(node, name);
      if ((snapshotUnits += values.length) > 65_536) {
        throw new RangeError("Mermaid counter snapshots exceed their budget.");
      }
      map.set(name, values);
    }
    return map;
  };
  const first = create(start);
  if (!first) return result;
  type Frame = { node: OriginalNode; entered: boolean; at: number; directives?: Directives };
  const frames: Frame[] = [{ node: first, entered: false, at: 0 }];
  let inside = false;
  while (frames.length) {
    if (frames.length > 256) throw new RangeError("Mermaid counter traversal exceeds its depth budget.");
    const frame = frames.at(-1)!, node = frame.node;
    if (!frame.entered) {
      frame.entered = true;
      if (!node.side && node.element === svg) inside = true;
      frame.directives = implicit(node);
      ledger.enter(node, frame.directives, (name) => profile === "css-accounting" ? forwardInitial(node, name) : 0);
      if (node.contained) ledger.contain();
      if (inside && owners.has(node.element)) {
        if (!node.side) result.set(node.element, { before: new Map(), after: new Map() });
        else if (node.side !== "marker") {
          const record = result.get(node.element) ?? { before: new Map(), after: new Map() };
          record[node.side] = snapshot(node);
          result.set(node.element, record);
        }
      }
    }
    const child = childAt(node, frame.at++);
    if (child) {
      frames.push({ node: child, entered: false, at: 0 });
      continue;
    }
    if (node.contained) ledger.releaseContainment();
    ledger.leave(node, frame.directives!);
    frames.pop();
    if (!node.side && node.element === svg) break;
  }
  return result;
}
