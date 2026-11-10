// Copyright 2023 Im-Beast. MIT license.
import type { MermaidSceneGradient } from "./mermaid_scene.ts";
import { parsePaintColor } from "./mermaid_paint.ts";

const colorContexts = new WeakMap<Document, { context: CanvasRenderingContext2D; colors: Map<string, string> }>();

/** Normalize other browser-supported CSS color spaces into the native renderer's sRGB gamut. */
export function measuredPaintColor(color: string, document: Document): string {
  if (parsePaintColor(color) || !document.defaultView!.CSS.supports("color", color)) return color;
  let state = colorContexts.get(document);
  if (!state) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    state = { context: canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!, colors: new Map() };
    colorContexts.set(document, state);
  }
  const existing = state.colors.get(color);
  if (existing) return existing;
  state.context.clearRect(0, 0, 1, 1);
  state.context.fillStyle = color;
  state.context.fillRect(0, 0, 1, 1);
  const [r, g, b, alpha] = state.context.getImageData(0, 0, 1, 1).data;
  const resolved = alpha === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha! / 255})`;
  if (state.colors.size < 4096) state.colors.set(color, resolved);
  return resolved;
}

/** Resolve local SVG paint servers while the real diagram DOM and its CSS engine are available. */
export function extractGradient(
  root: SVGSVGElement,
  element: SVGGraphicsElement,
  paint: string,
  diagnostics: Set<string>,
  budget: { stops: number },
): MermaidSceneGradient | undefined {
  if (!paint.startsWith("url(")) return;
  const view = root.ownerDocument.defaultView!;
  const local = (reference: string): Element | undefined => {
    const url = new URL(reference, root.ownerDocument.baseURI);
    if (url.href.split("#")[0] !== root.ownerDocument.URL.split("#")[0]) return;
    return root.getElementById(decodeURIComponent(url.hash.slice(1))) ?? undefined;
  };
  const reference = paint.match(/^url\(["']?([^"')]+)["']?\)/)?.[1];
  const first = reference ? local(reference) : undefined;
  if (!(first instanceof view.SVGGradientElement)) {
    diagnostics.add("SVG patterns or unresolved/external paint servers need scene expansion.");
    return;
  }
  const chain: SVGGradientElement[] = [];
  for (let current: Element | undefined = first; current instanceof view.SVGGradientElement;) {
    if (chain.includes(current) || chain.length >= 32) {
      diagnostics.add("Cyclic or excessive SVG gradient references cannot be expanded.");
      return;
    }
    chain.push(current);
    const href = current.href.baseVal;
    if (!href) break;
    current = local(href);
    if (!current) diagnostics.add("An SVG gradient template could not be resolved locally.");
  }
  const attr = (name: string, fallback: string): string =>
    chain.find((gradient) => gradient.hasAttribute(name))?.getAttribute(name) ?? fallback;
  const viewport = element.ownerSVGElement ?? root;
  const box = viewport.viewBox.baseVal;
  const width = box.width || viewport.width.baseVal.value;
  const height = box.height || viewport.height.baseVal.value;
  const object = attr("gradientUnits", "objectBoundingBox") !== "userSpaceOnUse";
  const length = (value: string, axis: "x" | "y" | "r"): number => {
    const plain = value.trim().match(/^([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)(%|px)?$/i);
    if (plain) {
      const extent = object ? 1 : axis === "x" ? width : axis === "y" ? height : Math.hypot(width, height) / Math.SQRT2;
      return Number(plain[1]) * (plain[2] === "%" ? extent / 100 : 1);
    }
    const probe = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
    probe.setAttribute("width", value);
    probe.style.fontSize = view.getComputedStyle(element).fontSize;
    viewport.append(probe);
    try {
      return probe.width.baseVal.value;
    } finally {
      probe.remove();
    }
  };
  const rootMatrix = root.getScreenCTM();
  const targetMatrix = element.getScreenCTM();
  if (!rootMatrix || !targetMatrix) throw new Error("Mount SVG before measuring gradient coordinates.");
  let matrix = new view.DOMMatrix().translate(-root.viewBox.baseVal.x, -root.viewBox.baseVal.y)
    .multiply(view.DOMMatrix.fromMatrix(rootMatrix).inverse()).multiply(targetMatrix);
  if (object) {
    const bounds = element.getBBox();
    matrix = matrix.translate(bounds.x, bounds.y).scale(bounds.width, bounds.height);
  }
  const probe = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
  probe.setAttribute("transform", attr("gradientTransform", ""));
  const css = view.getComputedStyle(first);
  if (css.transform !== "none") probe.style.transform = css.transform;
  root.append(probe);
  try {
    const transform = probe.transform.baseVal.consolidate()?.matrix;
    matrix = matrix.multiply(
      css.transform !== "none" ? new view.DOMMatrix(css.transform) : transform ?? new view.DOMMatrix(),
    );
  } finally {
    probe.remove();
  }
  const inverse = matrix.inverse();
  const source = chain.find((gradient) => [...gradient.children].some((child) => child.localName === "stop"));
  const stops = source ? [...source.children].filter((child) => child instanceof view.SVGStopElement) : [];
  if (stops.length > 4096) throw new RangeError("Mermaid gradient exceeds its stop budget.");
  // Count references, not merely unique definitions: JSON transport expands
  // shared arrays, so repeatedly referencing a huge stop list must stay bounded.
  budget.stops += stops.length;
  if (budget.stops > 65_536) throw new RangeError("Mermaid scene exceeds its referenced-gradient-stop budget.");
  let previous = 0;
  let modernColors = false;
  const colors = stops.map((stop) => {
    const css = view.getComputedStyle(stop);
    if (/^(?:color|lab|lch|oklab|oklch)\(/.test(css.stopColor)) modernColors = true;
    previous = Math.max(previous, Math.min(1, Math.max(0, stop.offset.baseVal)));
    return {
      offset: previous,
      color: measuredPaintColor(css.stopColor, root.ownerDocument),
      opacity: Number(css.stopOpacity),
    };
  });
  if (
    chain.some((node) =>
      view.getComputedStyle(node).animationName !== "none" ||
      node.querySelector("animate,animateTransform,animateMotion,set")
    )
  ) {
    diagnostics.add("Animated SVG needs time-aware scene capture.");
  }
  const radial = first instanceof view.SVGRadialGradientElement;
  const x2 = length(attr(radial ? "cx" : "x2", radial ? "50%" : "100%"), "x");
  const y2 = length(attr(radial ? "cy" : "y2", radial ? "50%" : "0%"), "y");
  return {
    kind: radial ? "radial" : "linear",
    inverse: [inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f].every(Number.isFinite)
      ? [inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f]
      : [1, 0, 0, 1, 0, 0],
    x1: length(attr(radial ? "fx" : "x1", radial ? attr("cx", "50%") : "0%"), "x"),
    y1: length(attr(radial ? "fy" : "y1", radial ? attr("cy", "50%") : "0%"), "y"),
    x2,
    y2,
    radius: radial ? length(attr("r", "50%"), "r") : undefined,
    focalRadius: radial ? length(attr("fr", "0%"), "r") : undefined,
    spread: attr("spreadMethod", "pad") as MermaidSceneGradient["spread"],
    interpolation: css.colorInterpolation.toLowerCase() === "linearrgb" ? "linearRGB" : modernColors ? "Oklab" : "sRGB",
    stops: Number.isFinite(inverse.a) ? colors : [],
  };
}
