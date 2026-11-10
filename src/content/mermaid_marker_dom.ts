// Copyright 2023 Im-Beast. MIT license.
import { markerPathVertices, type MermaidMarkerVertex } from "./mermaid_marker_path.ts";
import { SVG_INSTANCE_STYLE_PROPERTIES } from "./mermaid_use_dom.ts";
import type { MermaidSceneGradient } from "./mermaid_scene.ts";
import { resolveSVGReference } from "./mermaid_reference_dom.ts";

/** Shared per-scene expansion work; preflight runs before mounting an instance. */
export interface MermaidMarkerBudget {
  vertices: number;
  instances: number;
  nodes: number;
  styleBytes: number;
  references: Set<SVGMarkerElement>;
}

/** Context paints already measured in original scene coordinates, not a marker's object bounding box. */
export interface MermaidMarkerPaint {
  fill?: MermaidSceneGradient;
  stroke?: MermaidSceneGradient;
}

/** Computed CSS d takes precedence; detached DOM contour probes retain their own d attribute. */
export function svgMarkerPathData(geometry: SVGGeometryElement): string {
  const data = geometry.ownerDocument.defaultView!.getComputedStyle(geometry).getPropertyValue("d");
  if (data === "none") return "";
  return data.match(/^path\(["']([^"']*)["']\)$/)?.[1] ?? geometry.getAttribute("d") ?? "";
}

/** Only authored command vertices count as marker sites; curve subdivision points do not. */
export function geometryMarkerVertices(element: SVGGeometryElement): MermaidMarkerVertex[] | undefined {
  const view = element.ownerDocument.defaultView!;
  if (element instanceof view.SVGPathElement) return markerPathVertices(svgMarkerPathData(element));
  if (element instanceof view.SVGLineElement) {
    return markerPathVertices(
      `M${element.x1.baseVal.value} ${element.y1.baseVal.value} L${element.x2.baseVal.value} ${element.y2.baseVal.value}`,
    );
  }
  if (element instanceof view.SVGPolylineElement || element instanceof view.SVGPolygonElement) {
    if (element.points.numberOfItems > 8191) throw new RangeError("Mermaid marker path exceeds its vertex budget.");
    const points = Array.from({ length: element.points.numberOfItems }, (_, index) => element.points.getItem(index));
    return markerPathVertices(
      points.length
        ? `M${points.map((point) => `${point.x} ${point.y}`).join(" L")}${element.localName === "polygon" ? " Z" : ""}`
        : "",
    );
  }
  return;
}

function localMarker(root: SVGSVGElement, reference: string): SVGMarkerElement | "none" | undefined {
  const body = reference.match(/^url\(([\s\S]*)\)$/)?.[1];
  if (body === undefined) return;
  const resolved = resolveSVGReference(root, body);
  if (resolved.kind === "empty") return "none";
  if (resolved.kind !== "local") return;
  const marker = resolved.target;
  if (!(marker instanceof root.ownerDocument.defaultView!.SVGMarkerElement)) return "none";
  return root.contains(marker) ? marker : undefined;
}

/** Reject excessive sibling instances/nodes before repeated style/layout work or temporary mutations. */
export function checkMarkerBatch(
  root: SVGSVGElement,
  references: readonly string[],
  budget: MermaidMarkerBudget,
): void {
  const counts = new Map<SVGMarkerElement, number>();
  let nodes = budget.nodes;
  let instances = budget.instances;
  for (const reference of references) {
    const marker = localMarker(root, reference);
    if (!marker || marker === "none" || budget.references.has(marker)) continue;
    if (++instances > 2048) throw new RangeError("Mermaid marker instance budget exceeded.");
    let count = counts.get(marker);
    if (count === undefined) counts.set(marker, count = marker.querySelectorAll("*").length + 1);
    nodes += count;
    if (count > 4096 || nodes > 16_384) throw new RangeError("Mermaid marker referenced-node budget exceeded.");
  }
}

/** Mount one style-frozen marker instance against the original scene CTM, with native viewport clipping. */
export function expandMermaidMarker(
  root: SVGSVGElement,
  element: SVGGeometryElement,
  vertex: MermaidMarkerVertex,
  reference: string,
  context: CSSStyleDeclaration,
  contextWidth: number,
  contextPaint: MermaidMarkerPaint,
  paints: WeakMap<Element, MermaidMarkerPaint>,
  budget: MermaidMarkerBudget,
  diagnostics: Set<string>,
): { scope?: SVGSVGElement; dispose: () => void } | undefined {
  const marker = localMarker(root, reference);
  if (!marker) {
    diagnostics.add("External/unresolved SVG markers need host-controlled scene expansion.");
    return { dispose: () => {} };
  }
  if (marker === "none") return { dispose: () => {} };
  // A repeated marker in the active reference chain paints nothing, while
  // distinct nested definitions still retain their authored marker properties.
  if (budget.references.has(marker)) return { dispose: () => {} };
  if (budget.references.size >= 32) throw new RangeError("Mermaid marker reference-depth budget exceeded.");
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const originals = [marker, ...marker.querySelectorAll("*")];
  budget.instances++;
  budget.nodes += originals.length;
  if (budget.instances > 2048 || originals.length > 4096 || budget.nodes > 16_384) {
    throw new RangeError("Mermaid marker referenced-node/instance budget exceeded.");
  }
  const parentMatrix = element.parentElement instanceof view.SVGGraphicsElement
    ? element.parentElement.getScreenCTM()
    : root.getScreenCTM();
  const sourceMatrix = element.getScreenCTM();
  if (!parentMatrix || !sourceMatrix) return;
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const viewport = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const clone = marker.cloneNode(true) as SVGMarkerElement;
  const copies = [viewport, ...clone.querySelectorAll("*")];
  for (const attribute of marker.attributes) {
    if (["viewBox", "preserveAspectRatio", "class"].includes(attribute.name)) {
      viewport.setAttribute(attribute.name, attribute.value);
    }
  }
  // Snapshot ORIGINAL selectors and inheritance, not the destination's svg ancestry.
  const snapshots = originals.map((original, index) => {
    const css = view.getComputedStyle(original);
    if (css.animationName !== "none") diagnostics.add("Animated SVG needs time-aware scene capture.");
    const typed =
      (original as Element & { computedStyleMap?: () => { get: (name: string) => { toString(): string } | undefined } })
        .computedStyleMap?.();
    const names = original.namespaceURI === "http://www.w3.org/2000/svg" ? SVG_INSTANCE_STYLE_PROPERTIES : [...css];
    return [...names, ...[...css].filter((name) => name.startsWith("--"))].map((name) => {
      let value = ["transform", "transform-origin", "translate", "rotate", "scale"].includes(name)
        ? typed?.get(name)?.toString() ?? css.getPropertyValue(name)
        : css.getPropertyValue(name);
      if (name === "fill" || name === "stroke") {
        if (value === "context-fill" || value === "context-stroke") {
          const channel = value === "context-fill" ? "fill" : "stroke";
          const at = copies[index]!;
          const paint = paints.get(at) ?? {};
          paint[name] = contextPaint[channel];
          paints.set(at, paint);
          value = context[channel];
        }
      }
      budget.styleBytes += name.length + value.length;
      if (budget.styleBytes > 32 * 1024 * 1024) throw new RangeError("Mermaid marker style budget exceeded.");
      return [name, value] as const;
    });
  });
  try {
    for (const [index, copy] of copies.entries()) {
      // Native marker shadow instances do not expose executable DOM handlers.
      for (const attribute of [...copy.attributes]) {
        if (attribute.name.toLowerCase().startsWith("on")) copy.removeAttributeNode(attribute);
      }
      if (copy.localName === "style") {
        copy.remove();
        continue;
      }
      if (["script", "iframe", "audio", "video", "object", "embed"].includes(copy.localName)) {
        copy.remove();
        diagnostics.add("Active SVG marker content needs a host-controlled adapter.");
        continue;
      }
      const style = (copy as SVGElement | HTMLElement).style;
      style.setProperty("all", "initial", "important");
      for (const [name, value] of snapshots[index]!) style.setProperty(name, value, "important");
      style.setProperty("animation", "none", "important");
      style.setProperty("transition", "none", "important");
    }
    const orient = marker.getAttribute("orient") ?? "0";
    const angle = orient.startsWith("auto")
      ? vertex.angle + (orient === "auto-start-reverse" && vertex.position === "start" ? 180 : 0)
      : marker.orientAngle.baseVal.value;
    const strokeUnits = marker.markerUnits.baseVal === view.SVGMarkerElement.SVG_MARKERUNITS_STROKEWIDTH;
    // Chromium normalizes strokeWidth marker units by the source CTM's RMS
    // scale for non-scaling strokes. It retains anisotropy/reflection; replacing
    // this with a uniformly sized host-space marker disagrees with actual paint.
    const hostScale = context.vectorEffect === "non-scaling-stroke"
      ? Math.hypot(sourceMatrix.a, sourceMatrix.b, sourceMatrix.c, sourceMatrix.d) / Math.SQRT2
      : 1;
    const units = strokeUnits ? contextWidth / hostScale : 1;
    const box = (marker.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
    const emptyBox = box.length === 4 && box.every(Number.isFinite) && box[2]! >= 0 && box[3]! >= 0 &&
      (box[2] === 0 || box[3] === 0);
    if (
      emptyBox || !Number.isFinite(units) || !(units > 0) || !(marker.markerWidth.baseVal.value > 0) ||
      !(marker.markerHeight.baseVal.value > 0)
    ) {
      return { dispose: () => {} };
    }
    const transform = parentMatrix.inverse().multiply(sourceMatrix).translate(vertex.x, vertex.y).rotate(angle).scale(
      units,
    );
    group.style.setProperty("all", "initial", "important");
    group.style.setProperty("transform-origin", "0px 0px", "important");
    group.style.setProperty(
      "transform",
      `matrix(${transform.a},${transform.b},${transform.c},${transform.d},${transform.e},${transform.f})`,
      "important",
    );
    viewport.style.setProperty("display", "inline", "important");
    viewport.style.setProperty("width", `${marker.markerWidth.baseVal.value}px`, "important");
    viewport.style.setProperty("height", `${marker.markerHeight.baseVal.value}px`, "important");
    viewport.style.setProperty("x", "0px", "important");
    viewport.style.setProperty("y", "0px", "important");
    viewport.setAttribute("width", String(marker.markerWidth.baseVal.value));
    viewport.setAttribute("height", String(marker.markerHeight.baseVal.value));
    viewport.append(...clone.childNodes);
    group.append(viewport);
    element.after(group);
    const matrix = viewport.getScreenCTM();
    const groupMatrix = group.getScreenCTM();
    if (!matrix || !groupMatrix) {
      group.remove();
      return;
    }
    // Keep percentage/unit resolution with the owning browser. Normalizing
    // against viewBox dimensions disagrees with Chromium's rendered markers.
    const ref = new view.DOMPoint(
      marker.refX.baseVal.value,
      marker.refY.baseVal.value,
    ).matrixTransform(groupMatrix.inverse().multiply(matrix));
    viewport.style.setProperty("x", `${-ref.x}px`, "important");
    viewport.style.setProperty("y", `${-ref.y}px`, "important");
    // SVG viewport x/y attributes still own placement in Chromium's SVG layout.
    viewport.setAttribute("x", String(-ref.x));
    viewport.setAttribute("y", String(-ref.y));
    budget.references.add(marker);
    return {
      scope: viewport,
      dispose: () => {
        group.remove();
        budget.references.delete(marker);
      },
    };
  } catch (error) {
    group.remove();
    throw error;
  }
}
