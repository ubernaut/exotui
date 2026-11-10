// Copyright 2023 Im-Beast. MIT license.
import type {
  MermaidSceneClip,
  MermaidSceneFilter,
  MermaidSceneFilterNode,
  MermaidSceneTransfer,
} from "./mermaid_scene.ts";
import { measuredPaintColor } from "./mermaid_gradient_dom.ts";
import { resolveSVGReference } from "./mermaid_reference_dom.ts";

type InvalidReferencePolicy = "skip-function" | "discard-chain" | "unavailable";
const invalidReferencePolicies = new WeakMap<Document, InvalidReferencePolicy>();
let probeSequence = 0;
const filterInputKeywords = new Set([
  "SourceGraphic",
  "SourceAlpha",
  "BackgroundImage",
  "BackgroundAlpha",
  "FillPaint",
  "StrokePaint",
]);

/** Extract CSS filter lists/local SVG filter graphs while authoritative layout and CSS are available. */
export function extractFilter(
  root: SVGSVGElement,
  element: Element,
  diagnostics: Set<string>,
  budget: { filterNodes: number },
): MermaidSceneFilter | undefined {
  const view = root.ownerDocument.defaultView!;
  const css = view.getComputedStyle(element);
  if (css.filter === "none") return;
  // Resolve in the browser's tree scope, then enforce ownership. Looking only
  // inside the SVG would mistake a borrowed valid definition for a missing one.
  const tokens = filterFunctions(css.filter);
  const references = new Map<(typeof tokens)[number], SVGFilterElement>();
  let invalidReference = false;
  for (const token of tokens) {
    if (token.name !== "url") continue;
    const reference = resolveSVGReference(root, token.body);
    if (reference.kind !== "local") {
      if (reference.kind === "empty") {
        invalidReference = true;
        continue;
      }
      diagnostics.add(
        reference.kind === "external"
          ? "External/unresolved SVG filters need host-controlled scene expansion."
          : "Unresolved SVG filter URLs need host-controlled scene expansion.",
      );
      return;
    }
    const target = reference.target;
    if (!(target instanceof view.SVGFilterElement)) invalidReference = true;
    else if (!root.contains(target)) {
      diagnostics.add("External/unresolved SVG filters need host-controlled scene expansion.");
      return;
    } else references.set(token, target);
  }
  if (invalidReference && tokens.length > 1) {
    const policy = invalidFilterReferencePolicy(root.ownerDocument);
    if (policy === "unavailable") {
      diagnostics.add("Invalid SVG filter chains need a measurable host filter-reference policy.");
      return;
    }
    if (policy === "discard-chain") return;
  }
  const nodes: MermaidSceneFilterNode[] = [];
  let last = 0;
  const add = (node: MermaidSceneFilterNode): number => {
    if (nodes.length >= 256 || ++budget.filterNodes > 65_536) {
      throw new RangeError("Mermaid scene exceeds its filter-node budget.");
    }
    nodes.push(node);
    return nodes.length;
  };
  const rootMatrix = root.getScreenCTM();
  if (!rootMatrix) throw new Error("Mount SVG before measuring filters.");
  const targetMatrix = element instanceof view.SVGGraphicsElement ? element.getScreenCTM() : rootMatrix;
  if (!targetMatrix) return;
  const matrix = new view.DOMMatrix().translate(-root.viewBox.baseVal.x, -root.viewBox.baseVal.y)
    .multiply(view.DOMMatrix.fromMatrix(rootMatrix).inverse()).multiply(targetMatrix);
  const vector = (x: number, y: number) => ({ x: matrix.a * x + matrix.c * y, y: matrix.b * x + matrix.d * y });
  const blur = (input: number, x: number, y: number, interpolation: "sRGB" | "linearRGB", clip?: MermaidSceneClip) => {
    if (Math.abs(matrix.a * matrix.b * x * x + matrix.c * matrix.d * y * y) > 1e-6) {
      diagnostics.add("Correlated rotated/skewed Gaussian filters need native covariance sampling.");
      return false;
    }
    return add({
      kind: "blur",
      input,
      sigmaX: Math.hypot(matrix.a * x, matrix.c * y),
      sigmaY: Math.hypot(matrix.b * x, matrix.d * y),
      interpolation,
      clip,
    });
  };
  const shadow = (
    input: number,
    dx: number,
    dy: number,
    sx: number,
    sy: number,
    color: string,
    opacity: number,
    interpolation: "sRGB" | "linearRGB",
    clip?: MermaidSceneClip,
  ): number | false => {
    const alpha = add({ kind: "alpha", input, interpolation, clip });
    const softened = blur(alpha, sx, sy, interpolation, clip);
    if (softened === false) return false;
    const offset = vector(dx, dy);
    const moved = add({ kind: "offset", input: softened, dx: offset.x, dy: offset.y, interpolation, clip });
    const flood = add({ kind: "flood", color, opacity, interpolation, clip });
    const colored = add({ kind: "composite", input: flood, input2: moved, operator: "in", interpolation, clip });
    return add({ kind: "merge", inputs: [colored, input], interpolation, clip });
  };
  for (const token of tokens) {
    const { name, body } = token;
    if (name === "url") {
      const target = references.get(token);
      if (!target) continue;
      const compiled = svgFilter(target, last);
      if (compiled === false) return;
      last = compiled;
      continue;
    }
    if (name === "blur") {
      const sigma = cssNumber(body, "px");
      const compiled = blur(last, sigma, sigma, "sRGB");
      if (compiled === false) return;
      last = compiled;
    } else if (name === "drop-shadow") {
      const parts = filterArguments(body);
      const color = parts.find((part) => view.CSS.supports("color", part)) ?? css.color;
      const lengths = parts.filter((part) => part !== color).map((value) => cssNumber(value, "px"));
      if (lengths.length < 2 || lengths.length > 3) throw new RangeError("Invalid resolved CSS shadow.");
      const compiled = shadow(
        last,
        lengths[0]!,
        lengths[1]!,
        lengths[2] ?? 0,
        lengths[2] ?? 0,
        measuredPaintColor(color, root.ownerDocument),
        1,
        "sRGB",
      );
      if (compiled === false) return;
      last = compiled;
    } else {
      const amount = name === "hue-rotate" ? angle(body) : cssNumber(body);
      const values = filterColorMatrix(name, amount);
      if (!values) {
        diagnostics.add(`CSS filter needs scene expansion: ${name}`);
        return;
      }
      last = add({ kind: "matrix", input: last, values, interpolation: "sRGB" });
    }
  }
  return nodes.length ? { nodes } : undefined;

  function svgFilter(filter: SVGFilterElement, source: number): number | false {
    // SVG filter primitives default to linearRGB, unlike CSS filter functions.
    const region = filterRegion(root, element, filter, matrix);
    if (![...filter.children].some((child) => child.localName.startsWith("fe"))) {
      // An empty SVG filter produces transparent output, not an identity.
      return add({ kind: "flood", color: "rgb(0,0,0)", opacity: 0, clip: region });
    }
    const object = filter.getAttribute("primitiveUnits") === "objectBoundingBox";
    const box = element instanceof view.SVGGraphicsElement ? element.getBBox() : { width: 1, height: 1 };
    const coord = (value: number, axis: "x" | "y") => value * (object ? box[axis === "x" ? "width" : "height"] : 1);
    const results = new Map<string, number>([["SourceGraphic", source]]);
    let previous = source;
    const input = (reference: string | null): number | false => {
      if (!reference) return previous;
      if (reference === "SourceAlpha" && !results.has(reference)) {
        results.set(reference, add({ kind: "alpha", input: source }));
      }
      const value = results.get(reference);
      if (value !== undefined) return value;
      // Unresolved/forward result names use the implicit input, unlike the four
      // standard backdrop/paint sources that still require dedicated capture.
      if (filterInputKeywords.has(reference)) {
        diagnostics.add(`SVG filter input needs scene expansion: ${reference}`);
        return false;
      }
      return previous;
    };
    for (const primitive of filter.children) {
      if (!primitive.localName.startsWith("fe")) continue;
      const style = view.getComputedStyle(primitive);
      const interpolation = style.colorInterpolationFilters.toLowerCase() === "srgb" ? "sRGB" : "linearRGB";
      const own = filterRegion(root, element, primitive, matrix, filter);
      const clip = own ? { kind: "intersection" as const, children: [region, own] } : region;
      const a = ["feFlood", "feMerge"].includes(primitive.localName) ? previous : input(primitive.getAttribute("in"));
      if (a === false) return false;
      let result: number | false;
      const number = (name: string, fallback = 0) => Number(primitive.getAttribute(name) ?? fallback);
      if (primitive.localName === "feGaussianBlur" || primitive.localName === "feDropShadow") {
        const deviations = numbers(primitive.getAttribute("stdDeviation") ?? "0");
        const sx = coord(deviations[0] ?? 0, "x");
        const sy = coord(deviations[1] ?? deviations[0] ?? 0, "y");
        if (primitive.getAttribute("edgeMode") && primitive.getAttribute("edgeMode") !== "none") {
          diagnostics.add("SVG Gaussian edge modes need native sampling.");
          return false;
        }
        result = primitive.localName === "feDropShadow"
          ? shadow(
            a,
            coord(number("dx", 2), "x"),
            coord(number("dy", 2), "y"),
            sx,
            sy,
            measuredPaintColor(style.floodColor, root.ownerDocument),
            Number(style.floodOpacity),
            interpolation,
            clip,
          )
          : blur(a, sx, sy, interpolation, clip);
      } else if (primitive.localName === "feOffset") {
        const offset = vector(coord(number("dx"), "x"), coord(number("dy"), "y"));
        result = add({ kind: "offset", input: a, dx: offset.x, dy: offset.y, interpolation, clip });
      } else if (primitive.localName === "feFlood") {
        result = add({
          kind: "flood",
          color: measuredPaintColor(style.floodColor, root.ownerDocument),
          opacity: Number(style.floodOpacity),
          interpolation,
          clip,
        });
      } else if (primitive.localName === "feColorMatrix") {
        const type = primitive.getAttribute("type") ?? "matrix";
        const raw = numbers(primitive.getAttribute("values") ?? "");
        const values = type === "matrix"
          ? raw.length ? raw : filterColorMatrix("brightness", 1)!
          : type === "saturate"
          ? filterColorMatrix("saturate", raw[0] ?? 1)
          : type === "hueRotate"
          ? filterColorMatrix("hue-rotate", raw[0] ?? 0)
          : type === "luminanceToAlpha"
          ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .2125, .7154, .0721, 0, 0]
          : undefined;
        if (!values) {
          diagnostics.add(`SVG color matrix type needs scene expansion: ${type}`);
          return false;
        }
        result = add({ kind: "matrix", input: a, values, interpolation, clip });
      } else if (primitive.localName === "feComponentTransfer") {
        const channels = ["R", "G", "B", "A"].map((channel): MermaidSceneTransfer => {
          const fn = [...primitive.children].find((child) => child.localName === `feFunc${channel}`);
          const kind = fn?.getAttribute("type") ?? "identity";
          const value = (name: string, fallback: number) => Number(fn?.getAttribute(name) ?? fallback);
          if (kind === "table" || kind === "discrete") {
            return { kind, values: numbers(fn?.getAttribute("tableValues") ?? "") };
          }
          if (kind === "linear") return { kind, slope: value("slope", 1), intercept: value("intercept", 0) };
          if (kind === "gamma") {
            return {
              kind,
              amplitude: value("amplitude", 1),
              exponent: value("exponent", 1),
              offset: value("offset", 0),
            };
          }
          return { kind: "identity" };
        });
        result = add({ kind: "transfer", input: a, channels, interpolation, clip });
      } else if (primitive.localName === "feMerge") {
        const merged = [...primitive.children].map((child) => input(child.getAttribute("in")));
        if (merged.some((value) => value === false)) return false;
        result = add({ kind: "merge", inputs: merged as number[], interpolation, clip });
      } else if (primitive.localName === "feBlend" || primitive.localName === "feComposite") {
        const b = input(primitive.getAttribute("in2"));
        if (b === false) return false;
        result = primitive.localName === "feBlend"
          ? add({
            kind: "blend",
            input: a,
            input2: b,
            mode: primitive.getAttribute("mode") ?? "normal",
            interpolation,
            clip,
          })
          : add({
            kind: "composite",
            input: a,
            input2: b,
            operator: (primitive.getAttribute("operator") ?? "over") as "over",
            coefficients: [number("k1"), number("k2"), number("k3"), number("k4")],
            interpolation,
            clip,
          });
      } else {
        diagnostics.add(`SVG filter primitive needs scene expansion: ${primitive.localName}`);
        return false;
      }
      if (result === false) return false;
      previous = result;
      const name = primitive.getAttribute("result");
      if (name && !filterInputKeywords.has(name)) results.set(name, result);
      if (style.animationName !== "none" || primitive.querySelector("animate,set")) {
        diagnostics.add("Animated SVG needs time-aware scene capture.");
      }
    }
    return previous;
  }
}

/** Measure, don't UA-guess: Chromium differs from Filter Effects §5 here. */
export function invalidFilterReferencePolicy(document: Document): InvalidReferencePolicy {
  const known = invalidReferencePolicies.get(document);
  if (known) return known;
  let policy: InvalidReferencePolicy = "unavailable";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  try {
    const context = canvas.getContext("2d");
    if (context && "filter" in context) {
      const id = `exotui-filter-policy-${++probeSequence}`;
      if (document.getElementById(id)) throw new Error("Filter-policy probe ID is already owned by the host.");
      const paint = (filter: string) => {
        context.clearRect(0, 0, 1, 1);
        context.filter = filter;
        if (context.filter !== filter) return [];
        context.fillStyle = "rgb(200,100,50)";
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      const is = (pixels: number[], expected: number[]) => pixels.join() === expected.join();
      if (is(paint("none"), [200, 100, 50, 255]) && is(paint("invert(1)"), [55, 155, 205, 255])) {
        const pixels = paint(`invert(1) url(#${id})`);
        if (is(pixels, [55, 155, 205, 255])) policy = "skip-function";
        else if (is(pixels, [200, 100, 50, 255])) policy = "discard-chain";
      }
    }
  } catch {
    // Readback/filter capability can be denied independently of SVG layout.
  } finally {
    canvas.width = canvas.height = 0;
  }
  invalidReferencePolicies.set(document, policy);
  return policy;
}

function filterRegion(
  root: SVGSVGElement,
  element: Element,
  definition: Element,
  matrix: DOMMatrix,
  parent?: SVGFilterElement,
): MermaidSceneClip {
  const view = root.ownerDocument.defaultView!;
  const box = element instanceof view.SVGGraphicsElement ? element.getBBox() : { x: 0, y: 0, width: 1, height: 1 };
  const viewport = element instanceof view.SVGElement ? element.ownerSVGElement ?? root : root;
  const width = viewport.viewBox.baseVal.width || viewport.width.baseVal.value;
  const height = viewport.viewBox.baseVal.height || viewport.height.baseVal.value;
  const rect = (
    node: Element,
    primitive?: SVGFilterElement,
  ): { x: number; y: number; width: number; height: number } => {
    const object = (primitive?.getAttribute("primitiveUnits") ?? node.getAttribute("filterUnits") ??
      (primitive ? "userSpaceOnUse" : "objectBoundingBox")) === "objectBoundingBox";
    const region = primitive ? rect(primitive) : undefined;
    const length = (name: "x" | "y" | "width" | "height"): number => {
      const horizontal = name === "x" || name === "width";
      const position = name === "x" || name === "y";
      const value = node.getAttribute(name);
      if (!value && region) return region[name];
      const raw = value ?? (position ? "-10%" : "120%");
      const percent = raw.trim().endsWith("%");
      const amount = cssNumber(raw, "px");
      const extent = percent && region
        ? region[horizontal ? "width" : "height"]
        : object
        ? box[horizontal ? "width" : "height"]
        : horizontal
        ? width
        : height;
      return amount * (percent || object ? extent : 1) +
        (position ? percent && region ? region[name] : object ? box[name] : 0 : 0);
    };
    return { x: length("x"), y: length("y"), width: length("width"), height: length("height") };
  };
  const bounds = rect(definition, parent);
  if (!Object.values(bounds).every(Number.isFinite)) throw new RangeError("Invalid resolved SVG filter region.");
  if (bounds.width <= 0 || bounds.height <= 0) return { kind: "union", children: [] };
  const points = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [
    bounds.x + bounds.width,
    bounds.y + bounds.height,
  ], [bounds.x, bounds.y + bounds.height]].map(([x, y]) => {
    const point = new view.DOMPoint(x, y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
  return { kind: "path", contours: [points], rule: "nonzero" };
}

function filterFunctions(value: string): { name: string; body: string }[] {
  const result: { name: string; body: string }[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    while (/\s/.test(value[cursor] ?? "") && cursor < value.length) cursor++;
    if (cursor >= value.length) break;
    const match = value.slice(cursor).match(/^([a-z-]+)\(/i);
    if (!match) throw new RangeError("Invalid resolved CSS filter function.");
    cursor += match[0].length;
    const start = cursor;
    let depth = 1;
    let quote = "";
    while (cursor < value.length && depth) {
      const char = value[cursor++]!;
      if (char === "\\") {
        cursor++;
        continue;
      }
      if (quote) {
        if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") quote = char;
      else if (char === "(") depth++;
      else if (char === ")") depth--;
    }
    if (depth || quote) throw new RangeError("Unclosed resolved CSS filter function.");
    result.push({ name: match[1]!.toLowerCase(), body: value.slice(start, cursor - 1) });
    if (result.length > 256) throw new RangeError("Mermaid exceeds its CSS filter-list budget.");
  }
  return result;
}

function filterArguments(value: string): string[] {
  let depth = 0;
  let start = 0;
  const result: string[] = [];
  for (let index = 0; index <= value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if ((!char || /\s/.test(char)) && !depth) {
      if (index > start) result.push(value.slice(start, index));
      start = index + 1;
    }
  }
  return result;
}
function numbers(value: string): number[] {
  const result = value.trim() ? value.trim().split(/[\s,]+/).map(Number) : [];
  if (result.length > 4096 || !result.every(Number.isFinite)) {
    throw new RangeError("Invalid or excessive SVG filter numbers.");
  }
  return result;
}
function cssNumber(value: string, unit = ""): number {
  const match = value.trim().match(/^([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)([%a-z]*)$/i);
  if (!match || !["", "%", unit].includes(match[2]!)) throw new RangeError("Unresolved CSS filter number/length.");
  const number = Number(match[1]) * (match[2] === "%" ? .01 : 1);
  if (!Number.isFinite(number)) throw new RangeError("Invalid resolved CSS filter number.");
  return number;
}
function angle(value: string): number {
  const match = value.trim().match(/^([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)(deg|grad|rad|turn)?$/i);
  if (!match) throw new RangeError("Invalid resolved CSS filter angle.");
  return Number(match[1]) *
    (match[2] === "turn" ? 360 : match[2] === "rad" ? 180 / Math.PI : match[2] === "grad" ? .9 : 1);
}

/** Standard CSS/SVG photometric matrices; values act on unpremultiplied RGBA. */
export function filterColorMatrix(kind: string, value: number): readonly number[] | undefined {
  if (!Number.isFinite(value)) throw new RangeError("Invalid native filter amount.");
  const rows = [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0]];
  if (kind === "brightness" || kind === "contrast" || kind === "invert") {
    const amount = kind === "invert" ? Math.max(0, Math.min(1, value)) : value;
    for (let index = 0; index < 3; index++) {
      rows[index]![index] = kind === "invert" ? 1 - 2 * amount : amount;
      rows[index]![4] = kind === "contrast" ? .5 * (1 - amount) : kind === "invert" ? amount : 0;
    }
  } else if (kind === "opacity") rows[3]![3] = Math.max(0, Math.min(1, value));
  else if (kind === "grayscale" || kind === "saturate") {
    const amount = kind === "grayscale" ? 1 - Math.max(0, Math.min(1, value)) : value;
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        rows[row]![column] =
          (kind === "grayscale" ? [.2126, .7152, .0722] : [.213, .715, .072])[column]! * (1 - amount) +
          (row === column ? amount : 0);
      }
    }
  } else if (kind === "sepia") {
    const amount = Math.max(0, Math.min(1, value));
    const sepia = [[.393, .769, .189], [.349, .686, .168], [.272, .534, .131]];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        rows[row]![column] = sepia[row]![column]! * amount + (row === column ? 1 - amount : 0);
      }
    }
  } else if (kind === "hue-rotate") {
    const c = Math.cos(value * Math.PI / 180);
    const s = Math.sin(value * Math.PI / 180);
    const weights = [.213, .715, .072];
    const sine = [[-.213, -.715, .928], [.143, .140, -.283], [-.787, .715, .072]];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        rows[row]![column] = weights[column]! * (1 - c) + (row === column ? c : 0) + sine[row]![column]! * s;
      }
    }
  } else return;
  return rows.flat();
}
