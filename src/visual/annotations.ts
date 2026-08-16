// Copyright 2023 Im-Beast. MIT license.

// VIS-008: annotations anchor to DATA, layout happens per frame. Every
// annotation — point labels, reference lines, threshold bands, event
// markers — is declared in data coordinates and projected through the
// CURRENT scales at layout time, so resize, pan, zoom, and data-window
// changes reposition them by construction: the anchor never changes,
// only the projection. Out-of-window annotations are reported offscreen
// (never silently dropped), and label collisions resolve through a
// deterministic policy: "shift" nudges later labels to free rows,
// "hide-later" hides them with the hidden flag visible.

import type { ContinuousScale } from "./scales.ts";
import { toCell } from "./scales.ts";

/** Declared annotations, all in data coordinates. */
export type ChartAnnotation =
  | { readonly kind: "point-label"; readonly x: number; readonly y: number; readonly text: string }
  | { readonly kind: "reference-line"; readonly axis: "x" | "y"; readonly value: number; readonly label?: string }
  | {
    readonly kind: "threshold-band";
    readonly axis: "x" | "y";
    readonly from: number;
    readonly to: number;
    readonly label?: string;
  }
  | { readonly kind: "event-marker"; readonly x: number; readonly label: string };

/** One placed annotation. */
export interface PlacedAnnotation {
  readonly annotation: ChartAnnotation;
  readonly offscreen: boolean;
  readonly hidden: boolean;
  /** Cell geometry when on screen. */
  readonly cell?: { readonly column: number; readonly row: number };
  readonly span?: { readonly from: number; readonly to: number };
}

/** Layout options. */
export interface AnnotationLayoutOptions {
  readonly xScale: ContinuousScale;
  readonly yScale: ContinuousScale;
  readonly collisionPolicy?: "shift" | "hide-later";
}

function inRange(scale: ContinuousScale, cell: number): boolean {
  const [r0, r1] = scale.range;
  return cell >= Math.min(r0, r1) && cell <= Math.max(r0, r1);
}

/** Projects annotations through the current scales. */
export function layoutAnnotations(
  annotations: readonly ChartAnnotation[],
  options: AnnotationLayoutOptions,
): PlacedAnnotation[] {
  const policy = options.collisionPolicy ?? "shift";
  const occupiedRows = new Map<number, Set<number>>(); // column bucket → rows
  const placed: PlacedAnnotation[] = [];

  for (const annotation of annotations) {
    switch (annotation.kind) {
      case "point-label":
      case "event-marker": {
        const column = toCell(options.xScale, annotation.x);
        const rawRow = annotation.kind === "point-label"
          ? toCell(options.yScale, annotation.y)
          : Math.min(...options.yScale.range.map((edge) => edge));
        const offscreen = !inRange(options.xScale, options.xScale.map(annotation.x));
        if (offscreen) {
          placed.push({ annotation, offscreen: true, hidden: false });
          break;
        }
        // Collision handling within the column bucket.
        const bucket = Math.floor(column / 8);
        const rows = occupiedRows.get(bucket) ?? new Set<number>();
        let row = rawRow;
        let hidden = false;
        if (rows.has(row)) {
          if (policy === "hide-later") hidden = true;
          else {
            while (rows.has(row)) row += 1; // deterministic downward shift
          }
        }
        if (!hidden) rows.add(row);
        occupiedRows.set(bucket, rows);
        placed.push({ annotation, offscreen: false, hidden, cell: { column, row } });
        break;
      }
      case "reference-line": {
        const scale = annotation.axis === "x" ? options.xScale : options.yScale;
        const cell = toCell(scale, annotation.value);
        const offscreen = !inRange(scale, scale.map(annotation.value));
        placed.push({
          annotation,
          offscreen,
          hidden: false,
          ...(offscreen ? {} : {
            cell: annotation.axis === "x" ? { column: cell, row: 0 } : { column: 0, row: cell },
          }),
        });
        break;
      }
      case "threshold-band": {
        const scale = annotation.axis === "x" ? options.xScale : options.yScale;
        const [r0, r1] = scale.range;
        const low = Math.min(r0, r1);
        const high = Math.max(r0, r1);
        // Detect fully-outside bands from the UNCLAMPED projections —
        // toCell clamps, which would hide out-of-window bands.
        const rawA = scale.map(annotation.from);
        const rawB = scale.map(annotation.to);
        const offscreen = Math.max(rawA, rawB) < low || Math.min(rawA, rawB) > high;
        const from = Math.max(low, Math.min(toCell(scale, annotation.from), toCell(scale, annotation.to)));
        const to = Math.min(high, Math.max(toCell(scale, annotation.from), toCell(scale, annotation.to)));
        placed.push({
          annotation,
          offscreen,
          hidden: false,
          ...(offscreen ? {} : { span: { from, to } }),
        });
        break;
      }
    }
  }
  return placed;
}
