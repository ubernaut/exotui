// Copyright 2023 Im-Beast. MIT license.
import { linearPathPoints } from "./mermaid_linear_path.ts";
import { bezierPathPoints } from "./mermaid_bezier_path.ts";
import { resolvedStrokeDashes, svgPaintOrder } from "./mermaid_stroke_metrics.ts";
import { beginMermaidAnimationCapture } from "./mermaid_animation_dom.ts";
import type { MermaidSceneAnimation } from "./mermaid_animation.ts";
import { extractGradient, measuredPaintColor } from "./mermaid_gradient_dom.ts";
import { extractFilter } from "./mermaid_filter_dom.ts";
import { checkUseBatch, expandUse, type MermaidUseBudget } from "./mermaid_use_dom.ts";
import { extractSceneImage } from "./mermaid_image_geometry.ts";
import { extractMathML } from "./mermaid_math_dom.ts";
import { measuredHTMLTextRuns, measuredSVGText } from "./mermaid_text_dom.ts";
import { measuredTextDecorations } from "./mermaid_text_decoration_dom.ts";
import { measuredTextDirectionResolver, renderedTextSlices } from "./mermaid_text_transform_dom.ts";
import { mirroredTextGlyph } from "./mermaid_bidi.ts";
import { withMermaidGeneratedContent } from "./mermaid_generated_content_dom.ts";
import type { MarkdownInteraction } from "./markdown.ts";
import { mermaidMetadata, safeMermaidHref } from "./mermaid_interactions.ts";
import type { MarkdownDiagramAccessibility } from "./markdown.ts";
import { mermaidSVGAccessibility } from "./mermaid_accessibility_dom.ts";
import {
  checkMarkerBatch,
  expandMermaidMarker,
  geometryMarkerVertices,
  type MermaidMarkerBudget,
  type MermaidMarkerPaint,
  svgMarkerPathData,
} from "./mermaid_marker_dom.ts";

/** A point in the upstream diagram's measured SVG coordinate system. */
export interface MermaidScenePoint {
  x: number;
  y: number;
  /** Browser-measured distance along this contour BEFORE its SVG transforms. */
  distance?: number;
}

/** Renderer-neutral CSS paint after upstream styles, classes and themes have resolved. */
export interface MermaidScenePaint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: readonly number[];
  /** Resolved offset in the stroke's metric units: local by default, host CSS pixels for non-scaling strokes. */
  dashOffset?: number;
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel" | "miter-clip";
  miterLimit?: number;
  opacity: number;
  fillOpacity?: number;
  strokeOpacity?: number;
  fillGradient?: MermaidSceneGradient;
  strokeGradient?: MermaidSceneGradient;
  /** SVG compound contours use the upstream winding rule, including holes. */
  fillRule?: "nonzero" | "evenodd";
}

/** Resolved SVG gradient in its own coordinate system, with a scene-to-gradient affine transform. */
export interface MermaidSceneGradient {
  kind: "linear" | "radial";
  /** Affine matrix [a,b,c,d,e,f] mapping normalized scene positions to gradient positions. */
  inverse: readonly [number, number, number, number, number, number];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  radius?: number;
  focalRadius?: number;
  spread: "pad" | "repeat" | "reflect";
  interpolation: "sRGB" | "linearRGB" | "Oklab";
  stops: readonly { offset: number; color: string; opacity: number }[];
}

/** An isolated SVG element/group composites this half-open item range after painting its children. */
export interface MermaidSceneComposite {
  start: number;
  end: number;
  opacity: number;
  blendMode: string;
  /** Preserves parent-before-child order when several groups cover the same item range. */
  depth: number;
  /** Apply the filter to the completed group, before clipping and opacity/blending. */
  filter?: MermaidSceneFilter;
  /** Post-filter silhouette; the SourceGraphic must not be prematurely clipped. */
  clip?: MermaidSceneClip;
}

/** One SVG channel transfer function, evaluated on unpremultiplied color components. */
export type MermaidSceneTransfer =
  | { kind: "identity" }
  | { kind: "table" | "discrete"; values: readonly number[] }
  | { kind: "linear"; slope: number; intercept: number }
  | { kind: "gamma"; amplitude: number; exponent: number; offset: number };

/** A bounded portable filter graph. Input 0 is SourceGraphic; node i produces input i+1. */
export type MermaidSceneFilterNode =
  & (
    | { kind: "alpha"; input: number }
    | { kind: "matrix"; input: number; values: readonly number[] }
    | { kind: "transfer"; input: number; channels: readonly MermaidSceneTransfer[] }
    | { kind: "blur"; input: number; sigmaX: number; sigmaY: number }
    | { kind: "offset"; input: number; dx: number; dy: number }
    | { kind: "flood"; color: string; opacity: number }
    | { kind: "blend"; input: number; input2: number; mode: string }
    | {
      kind: "composite";
      input: number;
      input2: number;
      operator: "over" | "in" | "out" | "atop" | "xor" | "arithmetic";
      coefficients?: readonly number[];
    }
    | { kind: "merge"; inputs: readonly number[] }
  )
  & {
    /** SVG primitive color space; CSS filter functions use sRGB. */
    interpolation?: "sRGB" | "linearRGB";
    /** Measured filter primitive subregion, independent of input coverage. */
    clip?: MermaidSceneClip;
  };

/** Filter operations in dependency order, plus the measured SVG filter region. */
export interface MermaidSceneFilter {
  nodes: readonly MermaidSceneFilterNode[];
  clip?: MermaidSceneClip;
}

/** One disconnected contour; fill closes open contours without joining their strokes. */
export interface MermaidSceneSubpath {
  points: readonly MermaidScenePoint[];
  closed: boolean;
}

/** Serializable clip silhouettes: children union within a clipPath and ancestor clips intersect. */
export type MermaidSceneClip =
  | { kind: "path"; contours: readonly (readonly MermaidScenePoint[])[]; rule: "nonzero" | "evenodd" }
  | { kind: "union"; children: readonly MermaidSceneClip[] }
  | { kind: "intersection"; children: readonly MermaidSceneClip[] };

/** Measured vector geometry; paths/curves/shapes share one portable representation. */
export interface MermaidScenePath extends MermaidSceneSubpath {
  kind: "path";
  /** Affine scene-to-stroke-space metrics: authored space normally, host CSS pixels for non-scaling strokes. */
  strokeInverse?: readonly [number, number, number, number, number, number];
  /** Stroke-only cumulative distances per contour; authored point.distance remains unchanged. */
  strokeDistances?: readonly (readonly number[])[];
  /** Ordered shape operations; markers are separate items and may split this into single-operation paths. */
  paintOrder?: readonly ("fill" | "stroke")[];
  /** Set on geometry expanded from an SVG marker: which vertex of the owning path it decorates. */
  marker?: "start" | "mid" | "end";
  /** All contours when the upstream shape contains multiple moveto commands. */
  subpaths?: readonly MermaidSceneSubpath[];
  paint: MermaidScenePaint;
  href?: string;
  interaction?: MarkdownInteraction;
  clip?: MermaidSceneClip;
}

/** Measured native text, including upstream SVG labels and Markdown HTML-label text. */
export interface MermaidSceneText {
  kind: "text";
  text: string;
  /** Optional rendered glyph ink; logical text and semantic content remain unchanged. */
  renderedText?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fontWeight: string;
  fontStyle: string;
  /** Original decorating boxes, not inherited CSS; descriptors remain portable when native paint is incomplete. */
  decorations?: readonly {
    line: "underline" | "line-through" | "overline";
    color: string;
    style: string;
    thickness: string;
    offset: string;
    position: string;
    skipInk: string;
    /** Original computed CSS color when SVG's decorating fill paints the line instead. */
    cssColor?: string;
    /** SVG decorating-owner paint, kept independently of the descendant glyph's ink. */
    stroke?: string;
    strokeWidth?: string;
    fillOpacity?: string;
    strokeOpacity?: string;
    paintOrder?: string;
  }[];
  href?: string;
  interaction?: MarkdownInteraction;
  clip?: MermaidSceneClip;
  opacity?: number;
  gradient?: MermaidSceneGradient;
  /** Measured MathML density and optional native stretched notation; no TeX source parsing. */
  math?: { rowUnits: number; stretch?: "vertical" | "horizontal" };
  /** Measured grapheme centers for rotated/reflected/vertical/path text; glyphs remain upright in a terminal. */
  layout?: {
    columnUnits: number;
    /** HTML Range fragments use top-left anchors; existing SVG centers remain the default. */
    anchor?: "center" | "top-left";
    /** Inert scene-local identity joining differently styled runs from the same SVG text element. */
    sequence?: number;
    glyphs: readonly {
      start: number;
      end: number;
      x: number;
      y: number;
      rendered?: string;
      /** One logical grapheme may have separate browser-shaped ink boxes, including floating combining marks. */
      fragments?: readonly {
        rendered: string;
        x: number;
        y: number;
        /** A zero-advance combining mark attaches to the preceding native carrier cell. */
        columnOffset?: -1;
        /** Actual detached mark ink in scene units; its native carrier occupies this ink box, not an empty advance. */
        ink?: { x: number; y: number; width: number; height: number };
      }[];
    }[];
  };
}

/** Portable, bounded RGBA8 pixels; base64 is preserved across JSON/process/remote boundaries. */
export interface MermaidSceneImageAsset {
  href: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  rgba: string;
  /** SVG resources are laid out in this embedding viewport before capture. */
  viewport?: { width: number; height: number; preserveAspectRatio: string; sampling: string };
}

/** Measured image geometry and an optional captured asset, separate from its clickable link. */
export interface MermaidSceneImage {
  kind: "image";
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image?: number;
  /** Maps normalized scene positions to image coordinates in the unit square. */
  inverse?: readonly [number, number, number, number, number, number];
  link?: string;
  interaction?: MarkdownInteraction;
  sampling?: "smooth" | "pixelated";
  clip?: MermaidSceneClip;
}

/** Vector/text/image item in document paint order. */
export type MermaidSceneItem = MermaidScenePath | MermaidSceneText | MermaidSceneImage;

/** Serializable scene shared by native terminal, browser-cell and remote consumers. */
export interface MermaidScene {
  width: number;
  height: number;
  title: string;
  description: string;
  /** Root-local names/descriptions and upstream role tokens; never nested icon/marker metadata. */
  accessibility?: MarkdownDiagramAccessibility;
  items: readonly MermaidSceneItem[];
  composites?: readonly MermaidSceneComposite[];
  images?: readonly MermaidSceneImageAsset[];
  /** Paint keyframes and timing, usable after the upstream compiler/DOM has been disposed. */
  animations?: readonly MermaidSceneAnimation[];
  /** Visible features needing follow-up handling; never silently claim perfect conversion. */
  diagnostics: readonly string[];
  /** Measured upstream icon viewports need sufficient native density to retain small vector details. */
  density?: { columnUnits: number; rowUnits: number };
}

/** Extract a real, mounted upstream SVG rather than reparsing a subset of Mermaid. */
export function extractMermaidScene(
  svg: SVGSVGElement,
  options: { images?: readonly MermaidSceneImageAsset[]; interactions?: ReadonlyMap<Element, MarkdownInteraction> } =
    {},
): MermaidScene {
  const animation = beginMermaidAnimationCapture(svg);
  const generatedDiagnostics = new Set<string>();
  try {
    const scene = withMermaidGeneratedContent(svg, generatedDiagnostics, () =>
      extractScene(
        svg,
        svg,
        undefined,
        undefined,
        options.images,
        undefined,
        undefined,
        undefined,
        options.interactions,
        undefined,
        animation,
      ));
    return {
      ...scene,
      animations: animation.tracks.length ? animation.tracks : undefined,
      diagnostics: [...new Set([...scene.diagnostics, ...animation.diagnostics, ...generatedDiagnostics])],
    };
  } finally {
    animation.dispose();
  }
}

function extractScene(
  svg: SVGSVGElement,
  scope: SVGGraphicsElement,
  gradientBudget: { stops: number; filterNodes: number } = { stops: 0, filterNodes: 0 },
  useBudget: MermaidUseBudget = {
    nodes: 0,
    instances: 0,
    styleBytes: 0,
    originals: new WeakMap(),
    references: new Set(),
  },
  images?: readonly MermaidSceneImageAsset[],
  mathBudget: { nodes: number; comparisons?: number } = { nodes: 0 },
  markerBudget: MermaidMarkerBudget = { vertices: 0, instances: 0, nodes: 0, styleBytes: 0, references: new Set() },
  markerPaints: WeakMap<Element, MermaidMarkerPaint> = new WeakMap(),
  interactions: ReadonlyMap<Element, MarkdownInteraction> = new Map(),
  interactionBudget: { units: number } = { units: 0 },
  animation?: ReturnType<typeof beginMermaidAnimationCapture>,
  textBudget: { characters: number; nodes: number } = { characters: 0, nodes: 0 },
): MermaidScene {
  const view = svg.ownerDocument.defaultView;
  if (!view) throw new Error("SVG extraction requires its owning DOM window.");
  const bounds = svg.viewBox.baseVal;
  const width = bounds.width || svg.getBoundingClientRect().width;
  const height = bounds.height || svg.getBoundingClientRect().height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Mermaid SVG has invalid bounds.");
  }
  const root = svg.getScreenCTM();
  if (!root) throw new Error("Mount Mermaid SVG before extracting its scene.");
  // Chromium still exposes legacy SVGMatrix objects here. Normalize before
  // composing with DOMMatrix inputs (HTML labels use an identity DOMMatrix).
  const inverse = view.DOMMatrix.fromMatrix(root).inverse();
  const items: MermaidSceneItem[] = [];
  const owners: Element[] = [];
  const interactionCache = new WeakMap<Element, MarkdownInteraction | undefined>();
  const interactionFor = (owner: Element, depth = 0): MarkdownInteraction | undefined => {
    if (interactionCache.has(owner)) return interactionCache.get(owner);
    if (depth >= 128) throw new RangeError("Mermaid interactions exceed their ancestor budget.");
    const inherited = owner !== svg && owner.parentElement ? interactionFor(owner.parentElement, depth + 1) : undefined;
    const declared = interactions.get(owner);
    const anchor = owner.localName === "a";
    const link = anchor ? safeMermaidHref(owner.getAttribute("href") ?? owner.getAttribute("xlink:href")) : undefined;
    const rawTitle = owner.getAttribute("data-title") ?? owner.getAttribute("title");
    let title: string | undefined;
    if (rawTitle) {
      mermaidMetadata(rawTitle);
      // Templates parse tooltip markup inertly: no scripts, navigation, style
      // installation or asset loads. Hosts receive plain text, never HTML.
      const template = svg.ownerDocument.createElement("template");
      template.innerHTML = rawTitle;
      for (const br of template.content.querySelectorAll("br")) br.replaceWith("\n");
      title = mermaidMetadata(template.content.textContent ?? "");
    }
    let value = inherited;
    if (declared || anchor || title) {
      const href = link ?? declared?.href ?? (anchor ? undefined : inherited?.href);
      const target = anchor ? owner.getAttribute("target") ?? undefined : declared?.target ?? inherited?.target;
      value = {
        ...inherited,
        ...declared,
        href,
        target: target ? mermaidMetadata(target) : undefined,
        title: title ?? declared?.title ?? inherited?.title,
      };
      // Gantt links/callbacks have no anchor markup. Charge declarative data as
      // well as DOM fields, and share this budget with all nested instances.
      interactionBudget.units += (link?.length ?? 0) + (title?.length ?? 0) + (target?.length ?? 0) +
        (declared?.href?.length ?? 0) + (declared?.id?.length ?? 0) + (declared?.title?.length ?? 0) +
        (declared?.callbacks?.reduce(
          (sum, callback) => sum + callback.name.length + callback.args.reduce((n, arg) => n + arg.length, 0),
          0,
        ) ?? 0);
      if (interactionBudget.units > 128_000) throw new RangeError("Mermaid interactions exceed their metadata budget.");
    }
    interactionCache.set(owner, value);
    return value;
  };
  const markerComposites: MermaidSceneComposite[] = [];
  const decorations = measuredTextDecorations(svg);
  const append = (item: MermaidSceneItem, owner: Element, capturedText = false): void => {
    if (item.kind === "text" && !capturedText) item = { ...item, decorations: decorations(owner) };
    const interaction = item.interaction ?? interactionFor(owner);
    items.push(
      item.kind === "image"
        ? { ...item, interaction, link: interaction?.href ?? item.link }
        : { ...item, interaction, href: interaction?.href ?? item.href },
    );
    owners.push(owner);
  };
  const diagnostics = new Set<string>();
  let density: MermaidScene["density"];
  // The exact fallback body is pinned with the upstream engine. A successful
  // render containing it is not evidence that a requested icon was available.
  if (
    scope.querySelector('rect[width="80"][height="80"][style*="#087ebf"]') &&
    [...scope.querySelectorAll('text[transform="translate(21.16 64.67)"]')].some((text) => text.textContent === "?")
  ) {
    diagnostics.add("Upstream rendered a missing-icon '?' placeholder.");
  }
  const relativeMatrices = new WeakMap<DOMMatrix, DOMMatrix>();
  const convert = (point: MermaidScenePoint, matrix: DOMMatrix): MermaidScenePoint => {
    let relative = relativeMatrices.get(matrix);
    if (!relative) {
      relative = inverse.multiply(matrix);
      relativeMatrices.set(matrix, relative);
    }
    // Compose before transforming points. The offscreen DOM translation must
    // not turn a zero-area diagonal clip into a spurious narrow polygon.
    const at = new DOMPoint(point.x, point.y).matrixTransform(relative);
    return {
      x: at.x - bounds.x,
      y: at.y - bounds.y,
      ...point.distance === undefined ? {} : { distance: point.distance },
    };
  };
  const href = (element: Element): string | undefined => {
    const link = element.closest("a");
    return safeMermaidHref(link?.getAttribute("href") ?? link?.getAttribute("xlink:href"));
  };
  const clipCache = new WeakMap<Element, MermaidSceneClip | undefined>();
  const filterCache = new WeakMap<Element, MermaidSceneFilter | undefined>();
  const filterFor = (element: Element): MermaidSceneFilter | undefined => {
    if (!filterCache.has(element)) filterCache.set(element, extractFilter(svg, element, diagnostics, gradientBudget));
    return filterCache.get(element);
  };
  const clipFor = (element: Element, completedFilter = false): MermaidSceneClip | undefined => {
    // A filter sees SourceGraphic before this element's clip/mask. Defer
    // ancestor constraints to the completed filter range as well.
    if (!completedFilter && filterFor(element)) return;
    if (!completedFilter && clipCache.has(element)) return clipCache.get(element);
    const parent = element === svg || element === scope ? undefined : element.parentElement;
    const inherited = parent ? clipFor(parent) : undefined;
    const reference = extractClip(svg, element, convert, diagnostics);
    const viewport = extractViewportClip(svg, element, convert);
    const direct = reference && viewport
      ? { kind: "intersection" as const, children: [reference, viewport] }
      : reference ?? viewport;
    const clip = inherited && direct
      ? { kind: "intersection" as const, children: [inherited, direct] }
      : direct ?? inherited;
    if (!completedFilter) clipCache.set(element, clip);
    return clip;
  };
  const visible = (element: Element): boolean => {
    const css = view.getComputedStyle(element);
    if (
      (css.visibility !== "visible" && !(element instanceof view.SVGUseElement)) ||
      element.closest("defs,clipPath,mask,marker,symbol,pattern,linearGradient,radialGradient,filter")
    ) return false;
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const inherited = view.getComputedStyle(ancestor);
      if (inherited.display === "none" || Number(inherited.opacity) === 0) return false;
      if (ancestor === svg) break;
    }
    return true;
  };
  const elements = [scope, ...scope.querySelectorAll("*")];
  checkUseBatch(
    svg,
    elements.filter((element): element is SVGUseElement => element instanceof view.SVGUseElement && visible(element)),
    useBudget,
  );
  for (const element of elements) {
    if (!visible(element)) continue;
    const css = view.getComputedStyle(element);
    if (
      element instanceof view.SVGSVGElement && element !== svg &&
      element.closest(".icon-shape,.label-icon,.treeView-node-icon,.service-icon,.group-icon")
    ) {
      const rect = element.getBoundingClientRect();
      const start = convert({ x: rect.left, y: rect.top }, new DOMMatrix());
      const end = convert({ x: rect.right, y: rect.bottom }, new DOMMatrix());
      const columns = Math.abs(end.x - start.x) / 4;
      const rows = Math.abs(end.y - start.y) / 4;
      if (columns > 0 && rows > 0) {
        density = {
          columnUnits: Math.min(density?.columnUnits ?? Infinity, columns),
          rowUnits: Math.min(density?.rowUnits ?? Infinity, rows),
        };
      }
    }
    if (css.maskImage !== "none") diagnostics.add("SVG masks need scene expansion.");
    filterFor(element);
    // Geometry/text branches return early; animation checks must precede them.
    if (
      ["animate", "animateTransform", "animateMotion", "set"].includes(element.localName) ||
      css.animationName !== "none" && !animation?.handled(element)
    ) {
      diagnostics.add("Animated SVG needs time-aware scene capture.");
    }
    if (element instanceof view.SVGUseElement) {
      // Measure ancestor constraints before temporary instances change any bounds.
      const sourceClip = clipFor(element);
      const expanded = expandUse(svg, element, diagnostics, useBudget);
      if (!expanded) continue;
      try {
        const instance = extractScene(
          svg,
          expanded.scope,
          gradientBudget,
          useBudget,
          images,
          mathBudget,
          markerBudget,
          markerPaints,
          interactions,
          interactionBudget,
          undefined,
          textBudget,
        );
        const offset = items.length;
        markerComposites.push(...(instance.composites ?? []).map((group) => ({
          ...group,
          start: group.start + offset,
          end: group.end + offset,
          depth: group.depth + 1024,
        })));
        for (const item of instance.items) {
          const linked = item.kind === "image"
            ? { ...item, link: item.link ?? href(element) }
            : { ...item, href: item.href ?? href(element) };
          append(
            {
              ...linked,
              clip: item.clip && sourceClip
                ? { kind: "intersection" as const, children: [item.clip, sourceClip] }
                : item.clip ?? sourceClip,
            },
            element,
            true,
          );
        }
        for (const diagnostic of instance.diagnostics) diagnostics.add(diagnostic);
      } finally {
        expanded.dispose();
      }
      continue;
    }
    if (element instanceof view.SVGGeometryElement) {
      const matrix = element.getScreenCTM();
      if (!matrix) continue;
      const length = element.getTotalLength();
      const hasMarkers = css.markerStart !== "none" || css.markerMid !== "none" || css.markerEnd !== "none";
      const contextPaint = markerPaints.get(element);
      const fillGradient = contextPaint && "fill" in contextPaint
        ? contextPaint.fill
        : extractGradient(svg, element, css.fill, diagnostics, gradientBudget);
      const strokeGradient = contextPaint && "stroke" in contextPaint
        ? contextPaint.stroke
        : extractGradient(svg, element, css.stroke, diagnostics, gradientBudget);
      const contours = geometryContours(element, view);
      const relative = inverse.multiply(matrix);
      const nonScaling = css.vectorEffect === "non-scaling-stroke";
      // Host-space dashes require transformed arc distances, not an isotropic
      // multiplier of local distance. Refine curves in that same metric space.
      const units = Math.max(
        1,
        Math.hypot(relative.a, relative.b, relative.c, relative.d),
        nonScaling ? Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d) * 8 : 0,
      );
      const subpaths = contours.map(({ geometry, closed }) => ({
        points: sampleGeometry(geometry, units).map((point) => convert(point, matrix)),
        closed,
      })).filter(({ points }) => points.length > 1);
      if (nonScaling && subpaths.reduce((total, contour) => total + contour.points.length, 0) > 8192) {
        throw new RangeError("Mermaid non-scaling stroke exceeds its point budget.");
      }
      if (!subpaths.length && !hasMarkers) continue;
      const viewport = element.ownerSVGElement!;
      const box = viewport.viewBox.baseVal;
      const diagonal =
        Math.hypot(box.width || viewport.width.baseVal.value, box.height || viewport.height.baseVal.value) /
        Math.SQRT2;
      const authorLength = element.hasAttribute("pathLength") ? element.pathLength.baseVal : undefined;
      const calibration = authorLength !== undefined && authorLength > 0 ? length / authorLength : 1;
      const distance = (value: string): number => resolveStrokeLength(value, diagonal, element, css) * calibration;
      const strokeWidth = resolveStrokeLength(css.strokeWidth, diagonal, element, css);
      const rawDash = css.strokeDasharray === "none" ? [] : strokeLengthList(css.strokeDasharray).map(distance);
      const dash = resolvedStrokeDashes(rawDash, authorLength);
      if (authorLength === 0 && rawDash.length) {
        diagnostics.add("SVG zero pathLength dashes follow the owning Chromium engine's solid-stroke behavior.");
      }
      const order = svgPaintOrder(css.getPropertyValue("paint-order"));
      const appendGeometry = (paintOrder: readonly ("fill" | "stroke")[]) => {
        if (!subpaths.length || !paintOrder.length) return;
        const animatedItem = items.length;
        // The scene origin is bounds-relative; translate in scene space, not
        // through the authored transform's rotated/scaled basis.
        const localInverse = relative.inverse().translate(bounds.x, bounds.y);
        const strokeInverse = nonScaling ? new view.DOMMatrix([root.a, root.b, root.c, root.d, 0, 0]) : localInverse;
        const strokeMetrics = [
          strokeInverse.a,
          strokeInverse.b,
          strokeInverse.c,
          strokeInverse.d,
          strokeInverse.e,
          strokeInverse.f,
        ] as const;
        const nonsingularStroke = strokeMetrics.every(Number.isFinite) &&
          [localInverse.a, localInverse.b, localInverse.c, localInverse.d].every(Number.isFinite);
        const strokeDistances = nonScaling
          ? subpaths.map(({ points }) => {
            let distance = 0;
            return points.map((point, index) => {
              if (index) {
                const previous = points[index - 1]!;
                const dx = point.x - previous.x;
                const dy = point.y - previous.y;
                distance += Math.hypot(root.a * dx + root.c * dy, root.b * dx + root.d * dy);
              }
              if (!Number.isFinite(distance)) throw new RangeError("Invalid Mermaid host stroke distance.");
              return distance;
            });
          })
          : undefined;
        append({
          kind: "path",
          ...subpaths[0]!,
          subpaths: subpaths.length > 1 ? subpaths : undefined,
          strokeInverse: nonsingularStroke ? strokeMetrics : undefined,
          strokeDistances,
          paintOrder: paintOrder.length === 2 && paintOrder[0] === "fill" ? undefined : paintOrder,
          paint: {
            fill: measuredPaintColor(css.fill, svg.ownerDocument),
            stroke: measuredPaintColor(css.stroke, svg.ownerDocument),
            strokeWidth: nonsingularStroke ? strokeWidth : 0,
            // SVG defines an all-zero dash pattern as a solid stroke. Upstream
            // flowchart defaults use `0`, not always the `none` keyword.
            dash,
            dashOffset: distance(css.strokeDashoffset),
            lineCap: css.strokeLinecap as "butt" | "round" | "square",
            lineJoin: css.strokeLinejoin as "miter" | "round" | "bevel" | "miter-clip",
            miterLimit: Number(css.strokeMiterlimit),
            // Element opacity (including markers) is represented by composites.
            opacity: 1,
            fillOpacity: Number(css.fillOpacity),
            strokeOpacity: Number(css.strokeOpacity),
            fillGradient,
            strokeGradient,
            fillRule: css.fillRule === "evenodd" ? "evenodd" : "nonzero",
          },
          href: href(element),
          clip: clipFor(element),
        }, element);
        animation?.path(element, animatedItem, (items[animatedItem] as MermaidScenePath).paint, distance);
      };
      const appendMarkers = () => {
        if (!hasMarkers) return;
        const vertices = geometryMarkerVertices(element);
        if (!vertices) {
          diagnostics.add("Markers on this SVG shape need equivalent-path expansion.");
          return;
        }
        markerBudget.vertices += vertices.length;
        if (markerBudget.vertices > 16_384) throw new RangeError("Mermaid marker scene vertex budget exceeded.");
        const references = { start: css.markerStart, mid: css.markerMid, end: css.markerEnd };
        checkMarkerBatch(
          svg,
          vertices.map((vertex) => references[vertex.position]).filter((reference) => reference !== "none"),
          markerBudget,
        );
        const sourceClip = clipFor(element);
        for (const vertex of vertices) {
          const reference = references[vertex.position];
          if (reference === "none") continue;
          const expanded = expandMermaidMarker(
            svg,
            element,
            vertex,
            reference,
            css,
            strokeWidth,
            { fill: fillGradient, stroke: strokeGradient },
            markerPaints,
            markerBudget,
            diagnostics,
          );
          if (!expanded) {
            diagnostics.add("An SVG marker could not be resolved locally.");
            continue;
          }
          if (!expanded.scope) {
            expanded.dispose();
            continue;
          }
          try {
            const markerScene = extractScene(
              svg,
              expanded.scope,
              gradientBudget,
              useBudget,
              images,
              mathBudget,
              markerBudget,
              markerPaints,
              interactions,
              interactionBudget,
              undefined,
              textBudget,
            );
            const offset = items.length;
            markerComposites.push(...(markerScene.composites ?? []).map((group) => ({
              ...group,
              start: group.start + offset,
              end: group.end + offset,
              depth: group.depth + 1024,
            })));
            for (const item of markerScene.items) {
              append(
                {
                  ...item,
                  ...(item.kind === "path" ? { marker: vertex.position } : {}),
                  clip: item.clip && sourceClip
                    ? { kind: "intersection" as const, children: [item.clip, sourceClip] }
                    : item.clip ?? sourceClip,
                },
                element,
                true,
              );
            }
            for (const diagnostic of markerScene.diagnostics) diagnostics.add(diagnostic);
          } finally {
            expanded.dispose();
          }
        }
      };
      if (!hasMarkers) appendGeometry(order.filter((operation) => operation !== "markers"));
      else {
        const markerAt = order.indexOf("markers");
        appendGeometry(order.slice(0, markerAt).filter((operation) => operation !== "markers"));
        appendMarkers();
        appendGeometry(order.slice(markerAt + 1).filter((operation) => operation !== "markers"));
      }
      continue;
    }
    if (element instanceof view.SVGTextElement) {
      for (const { owner: run, ...measured } of measuredSVGText(element, convert, visible, textBudget, diagnostics)) {
        const runCss = view.getComputedStyle(run);
        append({
          kind: "text",
          ...measured,
          color: measuredPaintColor(runCss.fill, svg.ownerDocument),
          fontWeight: runCss.fontWeight,
          fontStyle: runCss.fontStyle,
          href: href(run),
          clip: clipFor(run),
          opacity: Number(runCss.fillOpacity),
          gradient: extractGradient(svg, run, runCss.fill, diagnostics, gradientBudget),
        }, run);
      }
      continue;
    }
    if (element instanceof view.SVGImageElement) {
      const item = extractSceneImage(svg, element, images, convert, clipFor(element), href(element), diagnostics);
      if (item) append(item, element);
      continue;
    }
    if (element.localName === "foreignObject") {
      if ([...element.querySelectorAll("i.fa,i.fab,i.fas,i.far,i.fal,i.fad,i.fak")].some(visible)) {
        diagnostics.add("FontAwesome CSS icons need an explicit vector pack for native rendering.");
      }
      if ([...element.querySelectorAll(".katex-html")].some(visible)) {
        diagnostics.add("Legacy KaTeX HTML notation needs native math capture and matching host styles.");
      }
      for (const math of element.querySelectorAll("math")) {
        if (!visible(math)) continue;
        const accessible = math.closest(".katex-mathml");
        const presentation = accessible?.parentElement?.querySelector(".katex-html");
        if (presentation && visible(presentation)) continue;
        const sequences = new Map<number, number>();
        for (
          const { item, owner } of extractMathML(math, {
            convert: (point) => convert(point, new DOMMatrix()),
            visible,
            diagnostics,
            budget: mathBudget,
          })
        ) {
          if (item.kind === "text" && item.layout) {
            const key = item.layout.sequence!;
            let sequence = sequences.get(key);
            if (sequence === undefined) {
              sequence = textBudget.characters;
              sequences.set(key, sequence);
            }
            textBudget.characters += item.text.length;
            if (textBudget.characters > 65_536) {
              throw new RangeError("MathML positioned text exceeds its scene character budget.");
            }
            item.layout = { ...item.layout, sequence };
          }
          append({ ...item, href: href(owner), clip: clipFor(owner) }, owner);
        }
      }
      const walker = svg.ownerDocument.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
      const sequence = textBudget.characters;
      const labels: { node: Text; css: CSSStyleDeclaration; segments: Intl.SegmentData[] }[] = [];
      const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      while (walker.nextNode()) {
        if (++textBudget.nodes > 16_384) throw new RangeError("HTML text exceeds its node budget.");
        const node = walker.currentNode;
        const text = node.textContent ?? "";
        if (
          !text.trim() || node.parentElement?.closest("style,script,annotation,annotation-xml,math") ||
          node.parentElement?.closest("svg") !== svg
        ) continue;
        if (!node.parentElement || !visible(node.parentElement)) continue;
        textBudget.characters += text.length;
        if (textBudget.characters > 65_536) throw new RangeError("HTML text exceeds its character budget.");
        const textCss = view.getComputedStyle(node.parentElement!);
        labels.push({ node: node as Text, css: textCss, segments: Array.from(segmenter.segment(text)) });
      }
      const rendered = renderedTextSlices(
        element,
        labels.flatMap(({ node, segments }) =>
          segments.map(({ segment, index }) => ({ node, start: index, end: index + segment.length }))
        ),
      );
      const resolveDirection = measuredTextDirectionResolver(
        element,
        labels.flatMap(({ node, segments }) =>
          segments.filter(({ segment }) => {
            const mirror = mirroredTextGlyph(segment, true);
            return mirror.text !== segment || mirror.unpaired;
          }).map(({ segment, index }) => ({ node, start: index, end: index + segment.length }))
        ),
      );
      let offset = 0;
      const measuredLabels = labels.map(({ node, css: textCss, segments }) => {
        const values = rendered.slice(offset, offset + segments.length);
        offset += segments.length;
        return {
          node,
          textCss,
          runs: measuredHTMLTextRuns(node, textCss, segments, values, diagnostics, resolveDirection, true),
        };
      });
      const separated = measuredLabels.some(({ runs }) =>
        runs.some((run) => run.layout?.glyphs.some((glyph) => glyph.fragments))
      );
      for (const { node, textCss, runs } of measuredLabels) {
        for (const run of runs) {
          if (separated && !run.layout) {
            diagnostics.add("Expanded or zero-advance HTML text needs native shaping layout.");
          }
          const origin = convert({ x: run.x, y: run.y }, new DOMMatrix());
          const far = convert({ x: run.x + run.width, y: run.y + run.height }, new DOMMatrix());
          let layout: MermaidSceneText["layout"];
          if (separated && run.layout) {
            const zero = convert({ x: 0, y: 0 }, new DOMMatrix());
            const along = convert({ x: 1, y: 0 }, new DOMMatrix());
            layout = {
              ...run.layout,
              sequence,
              columnUnits: run.layout.columnUnits * Math.hypot(along.x - zero.x, along.y - zero.y),
              glyphs: run.layout.glyphs.map((glyph) => ({
                ...glyph,
                ...convert(glyph, new DOMMatrix()),
                fragments: glyph.fragments?.map((fragment) => ({ ...fragment, ...convert(fragment, new DOMMatrix()) })),
              })),
            };
          }
          append({
            kind: "text",
            text: run.text,
            ...(layout || run.renderedText === undefined ? {} : { renderedText: run.renderedText }),
            ...(layout === undefined ? {} : { layout }),
            x: origin.x,
            y: origin.y,
            width: far.x - origin.x,
            height: far.y - origin.y,
            color: measuredPaintColor(textCss.color, svg.ownerDocument),
            fontWeight: textCss.fontWeight,
            fontStyle: textCss.fontStyle,
            href: href(node.parentElement!),
            clip: clipFor(node.parentElement!),
          }, node.parentElement!);
        }
        if (textCss.direction !== "ltr") diagnostics.add("Bidirectional HTML labels need native text ordering.");
      }
      for (const image of element.querySelectorAll("img")) {
        if (!visible(image)) continue;
        const item = extractSceneImage(svg, image, images, convert, clipFor(image), href(image), diagnostics);
        if (item) append(item, image);
      }
    }
  }
  const ranges = new Map<Element, MermaidSceneComposite>();
  for (const [index, owner] of owners.entries()) {
    const ancestors: Element[] = [];
    for (let node: Element | null = owner; node; node = node.parentElement) {
      ancestors.push(node);
      if (node === scope) break;
    }
    for (const [depth, node] of ancestors.reverse().entries()) {
      const css = view.getComputedStyle(node);
      const filter = filterFor(node);
      if (
        css.opacity === "1" && css.mixBlendMode === "normal" && css.isolation !== "isolate" && !filter &&
        !animation?.opacity(node)
      ) continue;
      const previous = ranges.get(node);
      if (previous) previous.end = index + 1;
      else {ranges.set(node, {
          start: index,
          end: index + 1,
          opacity: Number(css.opacity),
          blendMode: css.mixBlendMode,
          depth,
          filter,
          clip: filter ? clipFor(node, true) : undefined,
        });}
    }
  }
  for (const [index, [element, composite]] of [...ranges.entries()].entries()) {
    animation?.composite(element, index, composite.opacity);
  }
  // Instance/marker extraction shares the root. Read its metadata once, not
  // once per expanded subtree (which would multiply full-root ID scans).
  const accessibility = scope === svg ? mermaidSVGAccessibility(svg, interactionFor, diagnostics) : undefined;
  return {
    width,
    height,
    title: accessibility?.title ?? "",
    description: accessibility?.description ?? "",
    accessibility,
    items,
    composites: [...ranges.values(), ...markerComposites],
    images,
    diagnostics: [...diagnostics],
    density,
  };
}

/** Mount a local clip's silhouettes in the referencing element's real SVG coordinate system. */
function extractClip(
  root: SVGSVGElement,
  element: Element,
  convert: (point: MermaidScenePoint, matrix: DOMMatrix) => MermaidScenePoint,
  diagnostics: Set<string>,
  references = new Set<Element>(),
  budget = { nodes: 0, points: 0 },
): MermaidSceneClip | undefined {
  const view = root.ownerDocument.defaultView!;
  const reference = view.getComputedStyle(element).clipPath;
  if (reference === "none") return;
  const raw = reference.match(/^url\(["']?([^"')]+)["']?\)$/)?.[1];
  const unsupported = () => {
    diagnostics.add("A clip needs CSS-shape, text/use or external-reference scene expansion.");
    return undefined;
  };
  if (!raw || !(element instanceof view.SVGGraphicsElement)) return unsupported();
  const url = new URL(raw, root.ownerDocument.baseURI);
  const documentURL = new URL(root.ownerDocument.URL);
  if (url.href.split("#")[0] !== documentURL.href.split("#")[0]) {
    return unsupported();
  }
  const source = root.getElementById(decodeURIComponent(url.hash.slice(1)));
  if (!(source instanceof view.SVGClipPathElement)) {
    diagnostics.add("An SVG clip reference could not be resolved locally.");
    return;
  }
  if (references.has(source) || references.size >= 32) {
    diagnostics.add("Cyclic or excessive SVG clip references cannot be expanded.");
    return { kind: "union", children: [] };
  }
  references.add(source);
  const group = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
  const objectBounds = source.clipPathUnits.baseVal === view.SVGUnitTypes.SVG_UNIT_TYPE_OBJECTBOUNDINGBOX;
  const holder = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
  try {
    budget.nodes += source.querySelectorAll("*").length + 1;
    if (budget.nodes > 4096) throw new RangeError("Mermaid clip extraction exceeds its tree budget.");
    const rootMatrix = root.getScreenCTM();
    const targetMatrix = element.getScreenCTM();
    if (!rootMatrix || !targetMatrix) throw new Error("Mount the SVG before measuring clip coordinates.");
    let matrix = view.DOMMatrix.fromMatrix(rootMatrix.inverse().multiply(targetMatrix));
    if (objectBounds) {
      const box = element.getBBox();
      matrix = matrix.translate(box.x, box.y).scale(box.width, box.height);
    }
    group.setAttribute("transform", `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);
    // Preserve the definition's computed presentation, not the target's paint.
    const sourceCss = view.getComputedStyle(source);
    for (const name of ["transform", "transform-origin", "transform-box", "clip-rule", "clip-path", "visibility"]) {
      holder.style.setProperty(name, sourceCss.getPropertyValue(name), "important");
    }
    for (const child of source.children) {
      const clone = child.cloneNode(true) as Element;
      const original = [child, ...child.querySelectorAll("*")];
      const copied = [clone, ...clone.querySelectorAll("*")];
      for (const [index, node] of copied.entries()) {
        const css = view.getComputedStyle(original[index]!);
        if (
          css.animationName !== "none" ||
          ["animate", "animateTransform", "animateMotion", "set"].includes(node.localName)
        ) {
          diagnostics.add("Animated SVG needs time-aware scene capture.");
        }
        for (
          const name of [
            "display",
            "visibility",
            "clip-rule",
            "clip-path",
            "transform",
            "transform-origin",
            "transform-box",
            "d",
          ]
        ) {
          (node as SVGElement).style.setProperty(name, css.getPropertyValue(name), "important");
        }
      }
      holder.append(clone);
    }
    group.append(holder);
    root.append(group);
    const children: MermaidSceneClip[] = [];
    for (const shape of holder.querySelectorAll("*")) {
      const css = view.getComputedStyle(shape);
      if (css.display === "none" || css.visibility !== "visible") continue;
      let displayed = true;
      for (
        let ancestor: Element | null = shape.parentElement;
        ancestor && ancestor !== holder;
        ancestor = ancestor.parentElement
      ) {
        if (view.getComputedStyle(ancestor).display === "none") displayed = false;
      }
      if (!displayed) continue;
      if (!(shape instanceof view.SVGGeometryElement)) {
        if (["text", "use"].includes(shape.localName)) unsupported();
        continue;
      }
      const shapeMatrix = shape.getScreenCTM();
      if (!shapeMatrix) continue;
      const relative = rootMatrix.inverse().multiply(shapeMatrix);
      const units = Math.max(1, Math.hypot(relative.a, relative.b, relative.c, relative.d));
      const contours = geometryContours(shape, view).map(({ geometry }) =>
        sampleGeometry(geometry, units).map((point) => convert(point, shapeMatrix))
      ).filter((points) => points.length > 2);
      budget.points += contours.reduce((count, points) => count + points.length, 0);
      if (budget.points > 32768) throw new RangeError("Mermaid clip extraction exceeds its point budget.");
      let silhouette: MermaidSceneClip = {
        kind: "path",
        contours,
        rule: css.clipRule === "evenodd" ? "evenodd" : "nonzero",
      };
      for (let ancestor: Element | null = shape; ancestor && ancestor !== group; ancestor = ancestor.parentElement) {
        const nested = extractClip(root, ancestor, convert, diagnostics, references, budget);
        if (nested) silhouette = { kind: "intersection", children: [silhouette, nested] };
      }
      children.push(silhouette);
    }
    return { kind: "union", children };
  } finally {
    group.remove();
    references.delete(source);
  }
}

/** Let a viewBox-free sibling expose the browser's viewport frame, including rotated meet/slice markers. */
function extractViewportClip(
  root: SVGSVGElement,
  element: Element,
  convert: (point: MermaidScenePoint, matrix: DOMMatrix) => MermaidScenePoint,
): MermaidSceneClip | undefined {
  const view = root.ownerDocument.defaultView!;
  if (!(element instanceof view.SVGSVGElement) && !(element instanceof view.SVGForeignObjectElement)) return;
  const css = view.getComputedStyle(element);
  if (css.overflow === "visible") return;
  if (element instanceof view.SVGForeignObjectElement) {
    // foreignObject is a clipping viewport too. Its own browser-resolved
    // geometry already exposes CSS/percentage sizing; no sibling is needed.
    // Keep its affine corners, not a transformed axis-aligned screen box.
    const box = element.getBBox(), matrix = element.getScreenCTM();
    if (!matrix) throw new Error("Mount the SVG before measuring foreignObject clipping.");
    if (box.width <= 0 || box.height <= 0) return { kind: "union", children: [] };
    return {
      kind: "path",
      rule: "nonzero",
      contours: [[
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
      ].map((point) => convert(point, matrix))],
    };
  }
  // The DOM typings structurally overlap SVGSVGElement and foreignObject;
  // the runtime constructor checks above establish this remaining branch.
  const viewportElement = element as SVGSVGElement;
  const originalBox = viewportElement === root ? viewportElement.getBoundingClientRect() : undefined;
  const probe = viewportElement.cloneNode(false) as SVGSVGElement;
  probe.removeAttribute("id");
  probe.removeAttribute("viewBox");
  for (const name of ["transform", "transform-origin", "transform-box", "x", "y", "width", "height"]) {
    probe.style.setProperty(name, css.getPropertyValue(name), "important");
  }
  const frame = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (
    const [name, value] of [
      ["x", "0px"],
      ["y", "0px"],
      ["width", "100%"],
      ["height", "100%"],
      ["transform", "none"],
      ["display", "block"],
      ["fill", "none"],
      ["stroke", "none"],
    ]
  ) {
    frame.style.setProperty(name, value, "important");
  }
  probe.append(frame);
  viewportElement.after(probe);
  try {
    let matrix = probe.getScreenCTM();
    if (!matrix) throw new Error("Mount the SVG before measuring viewport clipping.");
    if (originalBox) {
      // A root sibling participates in HTML flow, unlike a nested SVG. Both
      // have the same measured viewport and CSS transform; remove only the
      // sibling's screen-space displacement before mapping its real corners.
      const probeBox = probe.getBoundingClientRect();
      matrix = new view.DOMMatrix().translate(originalBox.x - probeBox.x, originalBox.y - probeBox.y)
        .multiply(view.DOMMatrix.fromMatrix(matrix));
    }
    // A 100% probe delegates percentage/calc viewport sizing to the DOM too.
    const box = frame.getBBox();
    if (box.width <= 0 || box.height <= 0) return { kind: "union", children: [] };
    const points = [{ x: 0, y: 0 }, { x: box.width, y: 0 }, { x: box.width, y: box.height }, { x: 0, y: box.height }];
    return { kind: "path", contours: [points.map((point) => convert(point, matrix))], rule: "nonzero" };
  } finally {
    probe.remove();
  }
}

/** Browser-measured contours keep SVG parsing and curve metrics owned by the DOM. */
function geometryContours(
  element: SVGGeometryElement,
  view: Window & typeof globalThis,
): { geometry: SVGGeometryElement; closed: boolean }[] {
  if (!(element instanceof view.SVGPathElement)) {
    return [{ geometry: element, closed: element.localName !== "line" && element.localName !== "polyline" }];
  }
  const data = geometryPathData(element);
  const chunks = data.match(/[Mm][^Mm]*/g) ?? [];
  if (chunks.length <= 1) return [{ geometry: element, closed: /[zZ]\s*$/.test(data) }];
  let current = { x: 0, y: 0 };
  const contours: { geometry: SVGPathElement; closed: boolean }[] = [];
  const number = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
  const move = new RegExp(`^[Mm]\\s*(${number})[\\s,]*(${number})`);
  for (const chunk of chunks) {
    const initial = chunk.match(move);
    if (!initial) throw new SyntaxError("Invalid upstream SVG moveto.");
    let x = Number(initial[1]);
    let y = Number(initial[2]);
    let source = chunk;
    if (chunk[0] === "m") {
      x += current.x;
      y += current.y;
      const rest = chunk.slice(initial[0].length).trimStart().replace(/^,\s*/, "");
      // Extra moveto pairs are implicit lineto; preserve their relative mode.
      source = `M${x} ${y} ${/^[+\-.\d]/.test(rest) ? "l" : ""}${rest}`;
    }
    const geometry = element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    geometry.setAttribute("d", source);
    const length = geometry.getTotalLength();
    current = length > 0 ? geometry.getPointAtLength(length) : { x, y };
    contours.push({ geometry, closed: /[zZ]\s*$/.test(chunk) });
  }
  return contours;
}

function sampleGeometry(geometry: SVGGeometryElement, units = 1): MermaidScenePoint[] {
  if (geometry.localName === "path") {
    // getPointAtLength can quantize interior points differently on each axis.
    // Exact straight vertices preserve corners and zero-area diagonal clips.
    const data = geometryPathData(geometry);
    const points = linearPathPoints(data);
    if (points) return points;
    // Rough.js hatching has hundreds of long, almost straight Bézier contours.
    // Uniform two-unit sampling exhausts the native point budget without adding
    // visible curvature. Preserve the control hull and DOM dash distances instead.
    const probe = geometry.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    const curved = bezierPathPoints(data, (path) => {
      probe.setAttribute("d", path);
      return probe.getTotalLength();
    }, 0.25 / Math.max(1, units));
    if (curved) {
      const measured = geometry.getTotalLength();
      const sampled = curved.at(-1)?.distance ?? 0;
      return sampled > 0
        ? curved.map((point) => ({ ...point, distance: point.distance! * measured / sampled }))
        : curved;
    }
  }
  // Polygon vertices must be exact: uniform sampling can skip small corners.
  if (geometry.localName === "polygon" || geometry.localName === "polyline") {
    const points = (geometry as SVGPolygonElement).points;
    const result = Array.from({ length: points.numberOfItems }, (_, index) => {
      const point = points.getItem(index);
      return { x: point.x, y: point.y };
    });
    if (geometry.localName === "polygon" && result.length) result.push(result[0]!);
    let distance = 0;
    return result.map((point, index) => {
      if (index) distance += Math.hypot(point.x - result[index - 1]!.x, point.y - result[index - 1]!.y);
      return { ...point, distance };
    });
  }
  if (geometry.localName === "rect") {
    const css = geometry.ownerDocument.defaultView!.getComputedStyle(geometry);
    const rect = geometry as SVGRectElement;
    if (
      !rect.rx.baseVal.value && !rect.ry.baseVal.value &&
      !(Number.parseFloat(css.getPropertyValue("rx")) > 0) && !(Number.parseFloat(css.getPropertyValue("ry")) > 0)
    ) {
      const box = geometry.getBBox();
      if (box.width <= 0 || box.height <= 0) return [];
      return [
        { x: box.x, y: box.y, distance: 0 },
        { x: box.x + box.width, y: box.y, distance: box.width },
        { x: box.x + box.width, y: box.y + box.height, distance: box.width + box.height },
        { x: box.x, y: box.y + box.height, distance: box.width * 2 + box.height },
        { x: box.x, y: box.y, distance: box.width * 2 + box.height * 2 },
      ];
    }
  }
  const length = geometry.getTotalLength();
  if (!(length > 0) && geometry.localName === "line") {
    const line = geometry as SVGLineElement;
    const point = { x: line.x1.baseVal.value, y: line.y1.baseVal.value, distance: 0 };
    return [point, point];
  }
  if (!(length > 0)) return [];
  const count = Math.min(4096, Math.max(1, Math.ceil(length * units / 2)));
  return Array.from({ length: count + 1 }, (_, index) => {
    const point = geometry.getPointAtLength(length * index / count);
    return { x: point.x, y: point.y, distance: length * index / count };
  });
}

/** Computed CSS d overrides the path attribute; detached contour probes use their own attribute. */
function geometryPathData(geometry: SVGGeometryElement): string {
  return svgMarkerPathData(geometry);
}

function strokeLengthList(value: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (index === value.length || !depth && /[,\s]/.test(char!)) {
      const part = value.slice(start, index).trim();
      if (part) result.push(part);
      start = index + 1;
    }
  }
  return result;
}

/** Let the owning CSS engine resolve calc/min/max, rather than inventing a CSS expression parser. */
function resolveStrokeLength(value: string, diagonal: number, element: SVGElement, css: CSSStyleDeclaration): number {
  const plain = value.trim().match(/^([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)(px|%)?$/i);
  if (plain) return Number(plain[1]) * (plain[2] === "%" ? diagonal / 100 : 1);
  const document = element.ownerDocument;
  const parent = document.createElement("div");
  parent.style.cssText = `position:fixed;left:-100000px;top:0;width:${diagonal}px!important;display:block!important`;
  const measure = document.createElement("div");
  measure.style.setProperty("margin-left", value, "important");
  measure.style.setProperty("font-size", css.fontSize, "important");
  measure.style.setProperty("font-family", css.fontFamily, "important");
  parent.append(measure);
  document.body.append(parent);
  try {
    const length = Number.parseFloat(document.defaultView!.getComputedStyle(measure).marginLeft);
    if (!Number.isFinite(length)) throw new RangeError(`Unsupported computed SVG stroke length: ${value}`);
    return length;
  } finally {
    parent.remove();
  }
}
