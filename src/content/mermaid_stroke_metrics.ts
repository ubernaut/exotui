// Copyright 2023 Im-Beast. MIT license.
import type { MermaidScenePath, MermaidSceneSubpath } from "./mermaid_scene.ts";

/** Resolve captured dash lengths, including the owning Chromium engine's solid zero-pathLength behavior. */
export function resolvedStrokeDashes(dash: readonly number[], authorLength?: number): readonly number[] {
  if (dash.length > 1024) throw new RangeError("Native stroke exceeds its dash-pattern budget.");
  if (dash.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Invalid native stroke dash length.");
  }
  // Do not export infinities or silently approximate them with a giant period.
  // The actual compiler host paints these as solid, including zero-length dash
  // entries and non-scaling strokes. This is measured browser behavior, not a
  // claim that all browsers implement SVG2's infinite calibration identically.
  return authorLength === 0 || !dash.some((value) => value > 0) ? [] : dash;
}

/** Resolve and validate portable stroke-only distance overrides without changing authored fill geometry. */
export function strokeContours(path: MermaidScenePath): readonly MermaidSceneSubpath[] {
  const contours = path.subpaths ?? [path];
  const distances = path.strokeDistances;
  if (distances === undefined) return contours;
  if (!Array.isArray(distances) || distances.length !== contours.length) {
    throw new RangeError("Invalid native stroke distance contours.");
  }
  let count = 0;
  return contours.map((contour, index) => {
    const values = distances[index]!;
    count += contour.points.length;
    if (count > 8192) throw new RangeError("Native Mermaid path exceeds its point budget.");
    if (!Array.isArray(values) || values.length !== contour.points.length) {
      throw new RangeError("Invalid native stroke distance count.");
    }
    let previous = -Infinity;
    let authoredPrevious = -Infinity;
    return {
      closed: contour.closed,
      points: contour.points.map((point, index) => {
        if (point.distance !== undefined) {
          if (!Number.isFinite(point.distance) || point.distance < 0 || point.distance < authoredPrevious) {
            throw new RangeError("Invalid native authored stroke distance.");
          }
          authoredPrevious = point.distance;
        }
        const distance = values[index]!;
        if (!Number.isFinite(distance) || distance < 0 || distance < previous || index === 0 && distance !== 0) {
          throw new RangeError("Invalid native stroke distance metrics.");
        }
        previous = distance;
        return { ...point, distance };
      }),
    };
  });
}

/** Normalize SVG paint-order shorthand; omitted operations retain their standard relative order. */
export function svgPaintOrder(value: string): readonly ("fill" | "stroke" | "markers")[] {
  const normal = ["fill", "stroke", "markers"] as const;
  if (!value || value === "normal") return normal;
  const tokens = value.trim().split(/\s+/);
  if (
    tokens.length > 3 || tokens.some((token) => !normal.includes(token as typeof normal[number])) ||
    new Set(tokens).size !== tokens.length
  ) {
    throw new RangeError("Invalid SVG paint order.");
  }
  const authored = tokens as (typeof normal[number])[];
  return [...authored, ...normal.filter((operation) => !authored.includes(operation))];
}

/** Validate an expanded native shape's fill/stroke operations, including marker-interleaved single operations. */
export function nativePaintOrder(path: MermaidScenePath): readonly ("fill" | "stroke")[] {
  const order = path.paintOrder ?? ["fill", "stroke"];
  if (
    !Array.isArray(order) || !order.length || order.length > 2 ||
    order.some((operation) => operation !== "fill" && operation !== "stroke") || new Set(order).size !== order.length
  ) {
    throw new RangeError("Invalid native shape paint order.");
  }
  return order;
}
