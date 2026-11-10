// Copyright 2026 ExotUI contributors. MIT license.
import type { MermaidScene, MermaidSceneClip, MermaidSceneComposite, MermaidSceneFilter } from "./mermaid_scene.ts";
import { filterBufferExtent } from "./mermaid_filter.ts";
import { measuredTextCells } from "./mermaid_text.ts";
import { strokePattern } from "./mermaid_stroke.ts";

/** Inclusive global cell coordinates plus a safe sparse-map stride. */
export interface FilterBufferGrid {
  left: number;
  top: number;
  right: number;
  bottom: number;
  columns: number;
  rows: number;
}

/** Plan a sparse coordinate envelope, not an allocation; unrelated offscreen items never enlarge it. */
export function filterBufferGrid(
  items: MermaidScene["items"],
  groups: readonly MermaidSceneComposite[],
  columns: number,
  rows: number,
  columnUnits: number,
  rowUnits: number,
  predicate: (clip?: MermaidSceneClip) => (x: number, y: number) => boolean,
  charge: (amount: number) => void,
): FilterBufferGrid {
  let left = 0, top = 0, right = (columns - 1) * columnUnits, bottom = (rows - 1) * rowUnits;
  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError("Native filter buffer has invalid coordinates.");
    }
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  };
  const extents = new WeakMap<MermaidSceneFilter, ReturnType<typeof filterBufferExtent>>();
  const stack: { end: number; x: number; y: number; filters: number }[] = [];
  let next = 0, x = 0, y = 0, filters = 0, haloX = 0, haloY = 0;
  for (const [index, item] of items.entries()) {
    while (stack.length && stack.at(-1)!.end <= index) {
      const previous = stack.pop()!;
      x = previous.x;
      y = previous.y;
      filters = previous.filters;
    }
    while (groups[next]?.start === index) {
      const group = groups[next++]!;
      stack.push({ end: group.end, x, y, filters });
      if (!group.filter) continue;
      let extent = extents.get(group.filter);
      if (!extent) {
        extent = filterBufferExtent(group.filter, columnUnits, rowUnits, predicate, charge);
        extents.set(group.filter, extent);
        for (const region of extent.regions) {
          include(region[0], region[1]);
          include(region[2], region[3]);
        }
      }
      filters++;
      x += extent.x;
      y += extent.y;
      haloX = Math.max(haloX, x);
      haloY = Math.max(haloY, y);
    }
    if (!filters) continue;
    if (item.kind === "path") {
      const paths = item.subpaths ?? [item];
      const count = paths.reduce((total, path) => total + path.points.length, 0);
      if (count > 8192) throw new RangeError("Native Mermaid path exceeds its point budget.");
      charge(count);
      strokePattern(item.paint);
      let padX = columnUnits, padY = rowUnits;
      if (item.paint.stroke !== "none" && item.paint.strokeWidth > 0) {
        const inverse = item.strokeInverse ?? [1, 0, 0, 1, 0, 0];
        const [a, b, c, d] = inverse;
        const determinant = a! * d! - b! * c!;
        if (inverse.length !== 6 || !inverse.every(Number.isFinite) || !Number.isFinite(determinant) || !determinant) {
          throw new RangeError("Invalid native stroke metric transform.");
        }
        const limit = item.paint.miterLimit ?? 4;
        if (!Number.isFinite(limit) || limit < 1) throw new RangeError("Invalid or unsupported native stroke join.");
        const radius = item.paint.strokeWidth / 2 * Math.max(Math.SQRT2, limit);
        padX += radius * Math.hypot(d!, c!) / Math.abs(determinant);
        padY += radius * Math.hypot(b!, a!) / Math.abs(determinant);
      }
      for (const path of paths) {
        for (const point of path.points) {
          include(point.x - padX, point.y - padY);
          include(point.x + padX, point.y + padY);
        }
      }
    } else if (item.kind === "text" && item.layout) {
      const glyphs = measuredTextCells(item, columnUnits, rowUnits);
      charge(glyphs.length);
      for (const glyph of glyphs) {
        include(glyph.column * columnUnits, glyph.row * rowUnits);
        include((glyph.column + glyph.width) * columnUnits, (glyph.row + 1) * rowUnits);
      }
    } else {
      include(item.x - columnUnits, item.y - rowUnits);
      include(item.x + item.width + columnUnits, item.y + item.height + rowUnits);
    }
  }
  const grid = {
    left: Math.floor(left / columnUnits) - Math.ceil(haloX / columnUnits),
    top: Math.floor(top / rowUnits) - Math.ceil(haloY / rowUnits),
    right: Math.ceil(right / columnUnits) + Math.ceil(haloX / columnUnits),
    bottom: Math.ceil(bottom / rowUnits) + Math.ceil(haloY / rowUnits),
  };
  const width = grid.right - grid.left + 1, height = grid.bottom - grid.top + 1;
  if (![...Object.values(grid), width, height, width * height].every(Number.isSafeInteger) || width < 1 || height < 1) {
    throw new RangeError("Native filter buffer exceeds its coordinate budget.");
  }
  return { ...grid, columns: width, rows: height };
}
