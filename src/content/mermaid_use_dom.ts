// Copyright 2023 Im-Beast. MIT license.
import { copyGeneratedContentAlternative } from "./mermaid_generated_content_dom.ts";

/** Shared limits and reference identities for mounted local SVG instances. */
export interface MermaidUseBudget {
  nodes: number;
  instances: number;
  styleBytes: number;
  styles?: string;
  originals: WeakMap<Element, Element>;
  references: Set<Element>;
}

const namespace = "http://www.w3.org/2000/svg";
/** Computed SVG styles shared by local-use and marker shadow-instance capture. */
export const SVG_INSTANCE_STYLE_PROPERTIES: readonly string[] = [
  "color",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "paint-order",
  "vector-effect",
  "marker-start",
  "marker-mid",
  "marker-end",
  "clip-path",
  "clip-rule",
  "mask-image",
  "filter",
  "opacity",
  "mix-blend-mode",
  "isolation",
  "display",
  "visibility",
  "overflow",
  "transform",
  "translate",
  "rotate",
  "scale",
  "transform-origin",
  "transform-box",
  "x",
  "y",
  "width",
  "height",
  "rx",
  "ry",
  "r",
  "cx",
  "cy",
  "d",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration-line",
  "text-decoration-color",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-underline-offset",
  "text-underline-position",
  "text-decoration-skip-ink",
  "font-stretch",
  "font-variant",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "baseline-shift",
  "white-space",
  "text-align",
  "text-transform",
  "direction",
  "unicode-bidi",
  "writing-mode",
  "text-orientation",
  "color-interpolation",
  "color-interpolation-filters",
];
const properties = SVG_INSTANCE_STYLE_PROPERTIES;

/** Reject obviously oversized sibling batches before causing repeated DOM/style work. */
export function checkUseBatch(root: SVGSVGElement, elements: readonly SVGUseElement[], budget: MermaidUseBudget): void {
  if (elements.length + budget.instances > 2048) {
    throw new RangeError("Mermaid use extraction exceeds its referenced-node/instance budget.");
  }
  let nodes = budget.nodes;
  const counts = new Map<Element, number>();
  for (const element of elements) {
    const source = localSource(root, element);
    if (!source) continue;
    let count = counts.get(source);
    if (count === undefined) counts.set(source, count = source.querySelectorAll("*").length + 1);
    nodes += count;
    if (count > 4096 || nodes > 16_384) {
      throw new RangeError("Mermaid use extraction exceeds its referenced-node/instance budget.");
    }
  }
}

function localSource(root: SVGSVGElement, element: SVGUseElement): Element | null {
  const document = root.ownerDocument;
  const reference = element.getAttribute("href") ?? element.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  if (!reference) return null;
  try {
    const url = new URL(reference, document.baseURI);
    if (url.href.split("#")[0] === document.URL.split("#")[0] && url.hash) {
      return root.getElementById(decodeURIComponent(url.hash.slice(1)));
    }
  } catch { /* Invalid references render no content. */ }
  return null;
}

/** Resolve CSS in a true shadow scope, then measure a temporary native SVG subtree. */
export function expandUse(
  root: SVGSVGElement,
  element: SVGUseElement,
  diagnostics: Set<string>,
  budget: MermaidUseBudget,
): { scope: SVGGElement; dispose: () => void } | undefined {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const reference = element.getAttribute("href") ?? element.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  if (!reference) return;
  const source = localSource(root, element);
  if (!(source instanceof view.SVGElement)) {
    diagnostics.add("External/unresolved SVG use references need host-controlled scene expansion.");
    return;
  }
  if (["script", "iframe", "audio", "video", "object", "embed"].includes(source.localName)) {
    diagnostics.add("Active SVG use content needs a host-controlled adapter.");
    return;
  }
  if (source.localName === "style") return; // Declaration reuse must not install a new stylesheet.
  const original = budget.originals.get(element) ?? element;
  if (budget.references.has(source) || source.contains(original)) {
    diagnostics.add("Cyclic SVG use references cannot be expanded.");
    return;
  }
  if (budget.references.size >= 32) throw new RangeError("Mermaid use extraction exceeds its reference-depth budget.");
  const nodes = [source, ...source.querySelectorAll("*")];
  budget.nodes += nodes.length;
  if (nodes.length > 4096 || budget.nodes > 16_384 || ++budget.instances > 2048) {
    throw new RangeError("Mermaid use extraction exceeds its referenced-node/instance budget.");
  }
  const sourceMatrix = element.getScreenCTM();
  const parentMatrix = element.parentElement instanceof view.SVGGraphicsElement
    ? element.parentElement.getScreenCTM()
    : root.getScreenCTM();
  if (!sourceMatrix || !parentMatrix) throw new Error("Mount the SVG before expanding use references.");
  const css = view.getComputedStyle(element);
  const clone = source.cloneNode(true) as SVGElement;
  const copies = [clone, ...clone.querySelectorAll("*")];
  for (const [index, copy] of copies.entries()) {
    budget.originals.set(copy, nodes[index]!);
    copyGeneratedContentAlternative(nodes[index]!, copy);
    // Native use shadow scripts are inert. Cloning must not make them executable.
    for (const attribute of [...copy.attributes]) {
      if (attribute.name.toLowerCase().startsWith("on")) copy.removeAttributeNode(attribute);
    }
    if (copy.localName === "style") copy.remove(); // Already shared through the scoped stylesheet list.
    if (["script", "iframe", "audio", "video", "object", "embed"].includes(copy.localName)) {
      copy.replaceChildren();
      copy.remove();
      diagnostics.add("Active SVG use content needs a host-controlled adapter.");
    }
  }
  const group = document.createElementNS(namespace, "g");
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  // Only computed inheritance crosses this boundary; source/destination
  // ancestors cannot accidentally match selectors inside an SVG use instance.
  host.style.setProperty("all", "initial", "important");
  for (const name of properties) host.style.setProperty(name, css.getPropertyValue(name), "important");
  for (const name of css) {
    if (name.startsWith("--")) host.style.setProperty(name, css.getPropertyValue(name), "important");
  }
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("left", "-100000px", "important");
  const sheet = document.createElement("style");
  sheet.textContent = budget.styles ??= scopedStyles(root, diagnostics);
  const defaults = document.createElement("style");
  // These viewport UA defaults normally require an SVG ancestor. The style-only
  // shadow scope deliberately has none; a low-priority layer restores them
  // without defeating presentation attributes or the shared author sheets.
  defaults.textContent =
    "@layer exotui-use-viewport-defaults { :where(svg:not([overflow]), symbol:not([overflow])) { overflow: hidden } }";
  shadow.append(defaults, sheet, clone);
  budget.references.add(source);
  try {
    document.body.append(host);
    const snapshots = copies.map((copy) => {
      const current = view.getComputedStyle(copy);
      if (
        current.animationName !== "none" ||
        ["animate", "animateTransform", "animateMotion", "set"].includes(copy.localName)
      ) {
        diagnostics.add("Animated SVG needs time-aware scene capture.");
      }
      const names = copy.namespaceURI === namespace ? [...properties] : [...current];
      names.push(...[...current].filter((name) => name.startsWith("--")));
      // CSSOM can expose used zero geometry for these unrendered SVG nodes.
      // Typed OM retains percentages and transform functions until measurement.
      const typed = (copy as Element & {
        computedStyleMap?: () => { get: (name: string) => { toString: () => string } | undefined };
      }).computedStyleMap?.();
      if (!typed) diagnostics.add("SVG use layout-dependent styles need Typed OM capture.");
      return names.map((name) =>
        [
          name,
          ["transform", "transform-origin", "translate", "rotate", "scale"].includes(name)
            ? typed?.get(name)?.toString() ?? current.getPropertyValue(name)
            : current.getPropertyValue(name),
        ] as const
      );
    });
    // Snapshot the entire scope before adding inline declarations: selectors
    // such as [style] must not change later descendants during this capture.
    for (const [index, copy] of copies.entries()) {
      const style = (copy as SVGElement | HTMLElement).style;
      style.setProperty("all", "initial", "important");
      for (const [name, value] of snapshots[index]!) {
        budget.styleBytes += name.length + value.length;
        if (budget.styleBytes > 32 * 1024 * 1024) {
          throw new RangeError("Mermaid use extraction exceeds its style budget.");
        }
        style.setProperty(name, value, "important");
      }
      style.setProperty("animation", "none", "important");
      style.setProperty("transition", "none", "important");
    }
    host.remove();
    let content: SVGElement = clone;
    if (source.localName === "symbol") {
      const viewport = document.createElementNS(namespace, "svg");
      for (const attribute of clone.attributes) {
        viewport.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
      }
      viewport.append(...clone.childNodes);
      viewport.style.setProperty("display", "inline", "important");
      budget.originals.set(viewport, source);
      content = viewport;
    }
    if (content instanceof view.SVGSVGElement) {
      const dimensions = useViewport(root, element, clone, budget.instances);
      for (const name of ["width", "height"] as const) {
        const value = `${dimensions[name]}px`;
        content.style.setProperty(name, value, "important");
        content.setAttribute(name, value);
      }
    }
    const point = usePosition(element, css);
    const matrix = parentMatrix.inverse().multiply(sourceMatrix).translate(point.x, point.y);
    group.style.setProperty("all", "initial", "important");
    group.style.setProperty("transform-origin", "0px 0px", "important");
    group.style.setProperty(
      "transform",
      `matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},${matrix.e},${matrix.f})`,
      "important",
    );
    group.append(content);
    element.after(group);
    return {
      scope: group,
      dispose: () => {
        group.remove();
        budget.references.delete(source!);
      },
    };
  } catch (error) {
    group.remove();
    budget.references.delete(source);
    throw error;
  } finally {
    host.remove();
  }
}

/** Measure the host's actual SVG use sizing (CSS/SVG2 support differs by browser). */
function useViewport(
  root: SVGSVGElement,
  element: SVGUseElement,
  source: SVGElement,
  instance: number,
): { width: number; height: number } {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const definition = source.cloneNode(false) as SVGElement;
  let id = `exotui-use-viewport-probe-${instance}`;
  while (root.getElementById(id)) id += "-";
  definition.id = id;
  definition.removeAttribute("viewBox");
  for (const name of ["transform", "translate", "rotate", "scale", "clip-path", "filter"]) {
    definition.style.setProperty(name, "none", "important");
  }
  const rect = document.createElementNS(namespace, "rect");
  rect.style.setProperty("all", "initial", "important");
  for (const name of ["width", "height"]) rect.style.setProperty(name, "100%", "important");
  definition.append(rect);
  const defs = document.createElementNS(namespace, "defs");
  defs.append(definition);
  const probe = document.createElementNS(namespace, "use");
  for (const name of ["x", "y", "width", "height"]) {
    if (element.hasAttribute(name)) probe.setAttribute(name, element.getAttribute(name)!);
    probe.style.setProperty(name, view.getComputedStyle(element).getPropertyValue(name), "important");
  }
  probe.style.setProperty("transform", "none", "important");
  probe.setAttribute("href", `#${id}`);
  try {
    root.append(defs);
    element.after(probe);
    const box = probe.getBBox();
    return { width: box.width, height: box.height };
  } finally {
    probe.remove();
    defs.remove();
  }
}

/** A real sibling resolves percentages/calc CSS positions in the original viewport. */
function usePosition(element: SVGUseElement, css: CSSStyleDeclaration): { x: number; y: number } {
  const probe = element.ownerDocument.createElementNS(namespace, "rect");
  probe.style.setProperty("all", "initial", "important");
  for (const name of ["x", "y"]) probe.style.setProperty(name, css.getPropertyValue(name), "important");
  for (const name of ["width", "height"]) probe.style.setProperty(name, "1px", "important");
  element.after(probe);
  try {
    const box = probe.getBBox();
    return { x: box.x, y: box.y };
  } finally {
    probe.remove();
  }
}

/** Copy already-available sheets; never introduce a stylesheet fetch. */
function scopedStyles(root: SVGSVGElement, diagnostics: Set<string>): string {
  const view = root.ownerDocument.defaultView!;
  const scope = root.getRootNode() as Document | ShadowRoot;
  const sheets = [...scope.styleSheets, ...(scope.adoptedStyleSheets ?? [])];
  const visited = new Set<CSSStyleSheet>();
  const text: string[] = [];
  let rules = 0;
  let bytes = 0;
  const copy = (sheet: CSSStyleSheet): void => {
    if (visited.has(sheet) || sheet.disabled) return;
    visited.add(sheet);
    let contents: CSSRuleList;
    try {
      contents = sheet.cssRules;
    } catch {
      diagnostics.add("Unreadable SVG use stylesheets need a host-controlled style adapter.");
      return;
    }
    for (const rule of contents) {
      if (++rules > 4096) throw new RangeError("Mermaid use extraction exceeds its stylesheet-rule budget.");
      if (rule instanceof view.CSSImportRule) {
        if (rule.styleSheet && (!rule.media.length || view.matchMedia(rule.media.mediaText).matches)) {
          copy(rule.styleSheet);
        }
        continue;
      }
      bytes += rule.cssText.length;
      if (bytes > 1024 * 1024) throw new RangeError("Mermaid use extraction exceeds its stylesheet-byte budget.");
      text.push(rule.cssText);
    }
  };
  for (const sheet of sheets) {
    if (!sheet.media.length || view.matchMedia(sheet.media.mediaText).matches) copy(sheet);
  }
  return text.join("\n");
}
