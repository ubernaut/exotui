// Copyright 2023 Im-Beast. MIT license.
import { routeCells } from "../geometry/orthogonal_routes.ts";
import { getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";
import type { MermaidScene, MermaidSceneClip, MermaidScenePath } from "./mermaid_scene.ts";
import { strokeCoverage, strokePaintFraction, strokePattern, strokeSegmentCells } from "./mermaid_stroke.ts";
import { strokeOutlineCells } from "./mermaid_stroke_outline.ts";
import { nativePaintOrder, strokeContours } from "./mermaid_stroke_metrics.ts";
import { clipPredicate } from "./mermaid_clip.ts";
import { MermaidCompositor } from "./mermaid_compositor.ts";
import { clipBounds } from "./mermaid_filter.ts";
import { paintSampler } from "./mermaid_paint.ts";
import { decodeImageAsset } from "./mermaid_image.ts";
import { mathAssembly } from "./mermaid_math.ts";
import { projectMermaidScene } from "./mermaid_animation.ts";
import { measuredTextCells, measuredTextDensity, nativeTextInk, validateTextLayout } from "./mermaid_text.ts";
import { nativeTextDecorations } from "./mermaid_text_decoration.ts";
import type { MarkdownDiagramAccessibility, MarkdownInteraction } from "./markdown.ts";
import { snapshotDiagramAccessibility } from "./document_accessibility.ts";
import type { AnsiStyleSpec } from "../theme.ts";

/** Native diagram cell with resolved styling and a host-controlled link target. */
export interface MermaidNativeCell {
  char: string;
  foreground?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  underlineColor?: string;
  underlineStyle?: AnsiStyleSpec["underlineStyle"];
  overline?: boolean;
  strikethrough?: boolean;
  href?: string;
  interaction?: MarkdownInteraction;
}
/** Full diagram-sized native frame, ready for a clipped terminal/browser/remote viewport. */
export interface MermaidNativeFrame {
  columns: number;
  rows: number;
  cells: readonly (readonly MermaidNativeCell[])[];
  diagnostics: readonly string[];
  /** Portable metadata, available even after the compiler and its DOM have been disposed. */
  accessibility?: MarkdownDiagramAccessibility;
}
/** Drawing density in SVG units; labels remain native characters rather than illegible pixels. */
export interface MermaidNativeOptions {
  /** Local animation milliseconds. Defaults to a deterministic frame at zero; the host owns playback/reduced motion. */
  timeMs?: number;
  columnUnits?: number;
  rowUnits?: number;
  maxCells?: number;
  /** Optional opaque host backdrop; otherwise native RGBA paint retains transparency. */
  background?: string;
}

/** Convert all upstream diagram families from measured geometry, sharing circuit line glyphs and raster algorithms. */
export function renderMermaidNativeFrame(scene: MermaidScene, options: MermaidNativeOptions = {}): MermaidNativeFrame {
  scene = projectMermaidScene(scene, options.timeMs ?? 0);
  if (scene.items.length > 20_000) throw new RangeError("Native Mermaid scene exceeds its item budget.");
  const movingStrokes = new Set(
    scene.animations?.flatMap((track) =>
      track.target.kind === "path" && track.target.property === "dashOffset" ? [track.target.item] : []
    ),
  );
  let columnUnits = options.columnUnits ?? 9;
  const detailDiagnostics = new Set<string>();
  if (scene.density) {
    if (![scene.density.columnUnits, scene.density.rowUnits].every((value) => Number.isFinite(value) && value > 0)) {
      throw new RangeError("Invalid native SVG detail density.");
    }
    if (options.columnUnits === undefined) columnUnits = Math.min(columnUnits, scene.density.columnUnits);
    else if (columnUnits > scene.density.columnUnits) {
      detailDiagnostics.add("Explicit native density may hide small SVG icon detail.");
    }
  }
  if (!Number.isFinite(columnUnits) || columnUnits <= 0) throw new RangeError("Invalid native diagram column scale.");
  let measuredCharacters = 0;
  let renderedCharacters = 0;
  const measuredItems = [];
  const maxCells = options.maxCells ?? 250_000;
  if (!Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > 4_000_000) {
    throw new RangeError("Native Mermaid frame exceeds its cell budget.");
  }
  // Density planning and clip-bound walks share the same scene-wide quota
  // as raster paint, including work performed before allocating a frame.
  let remainingWork = Math.min(64_000_000, Math.max(64_000, maxCells * 128));
  const charge = (amount: number) => {
    remainingWork -= amount;
    if (remainingWork < 0) throw new RangeError("Native Mermaid scene exceeds its work budget.");
  };
  let cacheSlots = Math.min(1_000_000, maxCells * 2);
  const predicates = new WeakMap<MermaidSceneClip, (x: number, y: number) => boolean>();
  const predicate = (clip?: MermaidSceneClip) => {
    let inside = clip ? predicates.get(clip) : undefined;
    if (!inside) {
      inside = clipPredicate(clip, charge, () => cacheSlots-- > 0);
      if (clip) predicates.set(clip, inside);
    }
    return inside;
  };
  const inkClips = new WeakMap<MermaidSceneClip, ReturnType<typeof clipBounds>>();
  let detachedRowUnits = Infinity;
  for (const item of scene.items) {
    if (item.kind === "text") {
      if (item.layout) validateTextLayout(item);
      if (typeof item.renderedText === "string") renderedCharacters += item.renderedText.length;
      if (item.layout && Array.isArray(item.layout.glyphs)) {
        if (item.layout.glyphs.length > 8192) throw new RangeError("Invalid measured SVG text layout.");
        for (const glyph of item.layout.glyphs) {
          if (typeof glyph?.rendered === "string") renderedCharacters += glyph.rendered.length;
          if (Array.isArray(glyph?.fragments)) {
            if (glyph.fragments.length > 8192) {
              throw new RangeError("Measured text fragments exceed their glyph budget.");
            }
            for (const fragment of glyph.fragments) {
              if (typeof fragment?.rendered === "string") renderedCharacters += fragment.rendered.length;
            }
          }
        }
      }
      if (renderedCharacters > 65_536) throw new RangeError("Native rendered glyph ink exceeds its character budget.");
    }
    const ink = item.kind === "text" ? nativeTextInk(item) : "";
    if (item.kind === "text" && item.layout) {
      measuredCharacters += item.text.length;
      if (measuredCharacters > 65_536) throw new RangeError("Native SVG text exceeds its character budget.");
      columnUnits = Math.min(columnUnits, item.layout.columnUnits);
      for (const glyph of item.layout.glyphs) {
        for (const fragment of glyph.fragments ?? []) {
          // Detached font ink can be much narrower than its printable carrier.
          // Keep multiple samples across the clip/ink intersection, rather
          // than refining an invisible advance or ignoring a narrow overhang.
          if (fragment.ink) {
            predicate(item.clip); // Validate before the bounded geometry walk.
            let bounds = item.clip ? inkClips.get(item.clip) : undefined;
            if (!bounds) {
              bounds = clipBounds(item.clip, charge);
              if (item.clip) inkClips.set(item.clip, bounds);
            }
            const ink = fragment.ink;
            const width = Math.min(ink.x + ink.width, bounds[2]) - Math.max(ink.x, bounds[0]);
            const height = Math.min(ink.y + ink.height, bounds[3]) - Math.max(ink.y, bounds[1]);
            if (width > 0 && height > 0) {
              if (options.columnUnits === undefined) columnUnits = Math.min(columnUnits, width / 2);
              if (options.rowUnits === undefined) detachedRowUnits = Math.min(detachedRowUnits, height / 2);
            }
          }
        }
      }
      measuredItems.push(item);
      continue;
    }
    if (item.kind === "text" && item.width > 0 && textWidth(ink) > 0) {
      columnUnits = Math.min(columnUnits, item.width / textWidth(ink));
    }
  }
  let rowUnits = options.rowUnits ?? columnUnits * 2;
  if (scene.density) {
    if (options.rowUnits === undefined) rowUnits = Math.min(rowUnits, scene.density.rowUnits);
    else if (rowUnits > scene.density.rowUnits) {
      detailDiagnostics.add("Explicit native density may hide small SVG icon detail.");
    }
  }
  const mathDiagnostics = new Set<string>();
  for (const item of scene.items) {
    if (item.kind !== "text" || !item.math) continue;
    if (
      !Number.isFinite(item.math.rowUnits) || item.math.rowUnits <= 0 ||
      ![item.x, item.y, item.width, item.height].every(Number.isFinite) || item.width < 0 || item.height < 0 ||
      item.math.stretch !== undefined && !["vertical", "horizontal"].includes(item.math.stretch)
    ) {
      throw new RangeError("Invalid native MathML notation geometry.");
    }
    if (options.rowUnits === undefined) rowUnits = Math.min(rowUnits, item.math.rowUnits);
    else if (rowUnits > item.math.rowUnits) {
      mathDiagnostics.add("Explicit native row density may merge MathML notation.");
    }
  }
  if (options.rowUnits === undefined) rowUnits = Math.min(rowUnits, detachedRowUnits);
  if (!Number.isFinite(rowUnits) || rowUnits <= 0) throw new RangeError("Invalid native diagram row scale.");
  const measuredDensity = measuredTextDensity(
    measuredItems,
    columnUnits,
    rowUnits,
    options.columnUnits === undefined,
    options.rowUnits === undefined,
  );
  columnUnits = measuredDensity.columnUnits;
  rowUnits = measuredDensity.rowUnits;
  if (measuredDensity.merged) {
    detailDiagnostics.add(
      options.columnUnits !== undefined || options.rowUnits !== undefined
        ? "Explicit native density may merge measured SVG text."
        : "Measured SVG glyphs overlap at native density.",
    );
  }
  const columns = Math.ceil(scene.width / columnUnits) + 1;
  const rows = Math.ceil(scene.height / rowUnits) + 1;
  if (
    !Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > 4_000_000 || !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) || columns < 1 || rows < 1 || columns * rows > maxCells
  ) throw new RangeError("Native Mermaid frame exceeds its cell budget.");
  const cells: MermaidNativeCell[][] = Array.from(
    { length: rows },
    () => Array.from({ length: columns }, () => ({ char: " " })),
  );
  const diagnostics = new Set([...scene.diagnostics, ...mathDiagnostics, ...detailDiagnostics]);
  const imagePixels = new Map<number, Uint8Array>();
  if ((scene.images?.length ?? 0) > 256) throw new RangeError("Native Mermaid scene exceeds its image count budget.");
  let imagePixelCount = 0;
  const groups = [
    ...(scene.composites ?? []),
    ...scene.items.flatMap((item, index) =>
      item.kind === "path" && item.paint.opacity !== 1
        ? [{ start: index, end: index + 1, opacity: item.paint.opacity, blendMode: "normal", depth: 4096 }]
        : []
    ),
  ];
  const compositor = new MermaidCompositor(cells, groups, scene.items, maxCells, charge, diagnostics, {
    columnUnits,
    rowUnits,
    predicate,
  });
  const visibleGrid = { left: 0, top: 0, right: columns - 1, bottom: rows - 1, columns, rows };
  for (const [index, item] of scene.items.entries()) {
    compositor.at(index);
    const raster = compositor.filtering ? compositor.grid : visibleGrid;
    const inside = predicate(item.clip);
    const fill = item.kind === "path"
      ? paintSampler(item.paint.fill, item.paint.fillGradient, item.paint.fillOpacity ?? 1, charge, diagnostics)
      : undefined;
    const stroke = item.kind === "path"
      ? paintSampler(item.paint.stroke, item.paint.strokeGradient, item.paint.strokeOpacity ?? 1, charge, diagnostics)
      : item.kind === "text"
      ? paintSampler(item.color, item.gradient, item.opacity ?? 1, charge, diagnostics)
      : undefined;
    const put = (x: number, y: number, cell: Partial<MermaidNativeCell>, coverage = 1) => {
      const shift = cell.background || item.kind === "text" ? 0.5 : 0;
      const atX = (x + shift) * columnUnits;
      const atY = (y + shift) * rowUnits;
      if (x >= raster.left && x <= raster.right && y >= raster.top && y <= raster.bottom && inside!(atX, atY)) {
        const color = (cell.background ? fill : stroke)?.(atX, atY);
        compositor.put(x, y, cell, color && coverage !== 1 ? { ...color, alpha: color.alpha * coverage } : color);
      }
    };
    if (item.kind === "image") {
      const asset = item.image === undefined ? undefined : scene.images?.[item.image];
      if (!asset) {
        diagnostics.add("Native image cells need an image-capable host adapter to capture pixels.");
        continue;
      }
      let pixels = imagePixels.get(item.image!);
      if (!pixels) {
        imagePixelCount += asset.width * asset.height;
        if (!Number.isSafeInteger(imagePixelCount) || imagePixelCount > 8_388_608) {
          throw new RangeError("Native Mermaid scene exceeds its total image raster budget.");
        }
        charge(asset.width * asset.height * 4);
        pixels = decodeImageAsset(asset);
        imagePixels.set(item.image!, pixels);
      }
      const inverse = item.inverse ??
        [1 / item.width, 0, 0, 1 / item.height, -item.x / item.width, -item.y / item.height];
      if (
        inverse.length !== 6 || ![item.x, item.y, item.width, item.height, ...inverse].every(Number.isFinite) ||
        item.width <= 0 || item.height <= 0 || inverse[0] * inverse[3] - inverse[1] * inverse[2] === 0
      ) throw new RangeError("Native Mermaid image has invalid geometry.");
      const [a, b, c, d, e, f] = inverse;
      const startX = Math.max(raster.left, Math.floor(item.x / columnUnits));
      const startY = Math.max(raster.top, Math.floor(item.y / rowUnits));
      const endX = Math.min(raster.right + 1, Math.ceil((item.x + item.width) / columnUnits));
      const endY = Math.min(raster.bottom + 1, Math.ceil((item.y + item.height) / rowUnits));
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          charge(24);
          const atX = (x + 0.5) * columnUnits;
          const atY = (y + 0.5) * rowUnits;
          const u = a * atX + c * atY + e;
          const v = b * atX + d * atY + f;
          if (u < 0 || u >= 1 || v < 0 || v >= 1 || !inside(atX, atY)) continue;
          const pixel = (px: number, py: number) =>
            (Math.min(asset.height - 1, Math.max(0, py)) * asset.width + Math.min(asset.width - 1, Math.max(0, px))) *
            4;
          let alpha = 0;
          const rgb = [0, 0, 0] as [number, number, number];
          const sourceX = u * asset.width - 0.5;
          const sourceY = v * asset.height - 0.5;
          const left = Math.floor(sourceX);
          const top = Math.floor(sourceY);
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const weight = item.sampling === "pixelated"
                ? dx || dy ? 0 : 1
                : (dx ? sourceX - left : 1 - sourceX + left) * (dy ? sourceY - top : 1 - sourceY + top);
              const offset = item.sampling === "pixelated"
                ? pixel(Math.floor(u * asset.width), Math.floor(v * asset.height))
                : pixel(left + dx, top + dy);
              const opacity = pixels[offset + 3]! / 255 * weight;
              alpha += opacity;
              for (let channel = 0; channel < 3; channel++) rgb[channel]! += pixels[offset + channel]! * opacity;
            }
          }
          if (alpha > 0) {
            for (let channel = 0; channel < 3; channel++) rgb[channel]! /= alpha;
            compositor.put(x, y, { background: "image", href: item.link, interaction: item.interaction }, {
              rgb,
              alpha,
            });
          }
        }
      }
      continue;
    }
    if (item.kind === "text") {
      const decoration = nativeTextDecorations(item, diagnostics);
      if (
        decoration.underlineColor !== undefined && compositor.decoratedInkNeedsPaint ||
        item.decorations?.length && compositor.filtering
      ) {
        diagnostics.add("Native text decoration needs full color/style/position/geometry painting.");
      }
      if (item.layout) {
        for (const glyph of measuredTextCells(item, columnUnits, rowUnits)) {
          const { char, width, ink } = glyph;
          let { column, row } = glyph;
          charge(width + 1);
          if (!width) continue;
          if (ink && !inside((column + .5) * columnUnits, (row + .5) * rowUnits)) {
            // The advance and even the full ink centroid can be outside a
            // viewport while genuine mark ink remains inside. Project only
            // onto a clipped ink-owning sample, never an arbitrary free cell.
            const left = Math.max(raster.left, Math.ceil(ink.x / columnUnits - .5));
            const right = Math.min(raster.right, Math.floor((ink.x + ink.width) / columnUnits - .5));
            const top = Math.max(raster.top, Math.ceil(ink.y / rowUnits - .5));
            const bottom = Math.min(raster.bottom, Math.floor((ink.y + ink.height) / rowUnits - .5));
            let distance = Infinity;
            for (let y = top; y <= bottom; y++) {
              for (let x = left; x <= right; x++) {
                charge(4);
                const px = (x + .5) * columnUnits, py = (y + .5) * rowUnits;
                const next = Math.hypot(px - ink.x - ink.width / 2, py - ink.y - ink.height / 2);
                if (next < distance && inside(px, py)) {
                  column = x;
                  row = y;
                  distance = next;
                }
              }
            }
            if (!Number.isFinite(distance)) continue;
          }
          if (
            !Array.from({ length: width }, (_, i) => inside!((column + i + 0.5) * columnUnits, (row + 0.5) * rowUnits))
              .every(Boolean)
          ) continue;
          if (column < raster.left || column + width > raster.right + 1 || row < raster.top || row > raster.bottom) {
            diagnostics.add("Native text extends beyond measured diagram bounds.");
            continue;
          }
          put(column, row, {
            char,
            foreground: item.color,
            bold: Number(item.fontWeight) >= 600 || item.fontWeight === "bold",
            italic: item.fontStyle === "italic",
            ...decoration,
            href: item.href,
            interaction: item.interaction,
          });
          for (let i = 1; i < width; i++) {
            put(column + i, row, { char: "", href: item.href, interaction: item.interaction });
          }
        }
        continue;
      }
      let column = Math.round(item.x / columnUnits);
      const row = Math.round(item.y / rowUnits);
      if (item.math?.stretch) {
        const vertical = item.math.stretch === "vertical";
        const length = Math.max(1, Math.round(vertical ? item.height / rowUnits : item.width / columnUnits));
        if (!Number.isSafeInteger(length) || length > maxCells) {
          throw new RangeError("Native math assembly exceeds its budget.");
        }
        charge(length);
        const assembly = mathAssembly(nativeTextInk(item), item.math.stretch, length);
        if (!assembly) diagnostics.add("MathML stretched notation needs a native glyph assembly.");
        else {
          for (const [offset, char] of assembly.entries()) {
            put(column + (vertical ? 0 : offset), row + (vertical ? offset : 0), {
              char,
              foreground: item.color,
              href: item.href,
              interaction: item.interaction,
              bold: Number(item.fontWeight) >= 600 || item.fontWeight === "bold",
              italic: item.fontStyle === "italic",
              ...decoration,
            });
          }
          continue;
        }
      }
      const text = nativeTextInk(item);
      for (const char of getMultiCodePointCharacters(text)) {
        const width = textWidth(char);
        if (!width) continue;
        if (column + width > raster.right + 1) {
          if (
            Array.from({ length: width }, (_, i) => inside!((column + i + 0.5) * columnUnits, (row + 0.5) * rowUnits))
              .every(Boolean)
          ) {
            diagnostics.add("Native text extends beyond measured diagram bounds.");
          }
          break;
        }
        if (
          !Array.from(
            { length: width },
            (_, index) => inside!((column + index + 0.5) * columnUnits, (row + 0.5) * rowUnits),
          ).every(
            Boolean,
          )
        ) {
          column += width;
          continue;
        }
        put(column, row, {
          char,
          foreground: item.color,
          bold: Number(item.fontWeight) >= 600 || item.fontWeight === "bold",
          italic: item.fontStyle === "italic",
          ...decoration,
          href: item.href,
          interaction: item.interaction,
        });
        for (let offset = 1; offset < width; offset++) {
          put(column + offset, row, { char: "", href: item.href, interaction: item.interaction });
        }
        column += width;
      }
      continue;
    }
    const subpaths = strokeContours(item);
    const paintOrder = nativePaintOrder(item);
    const pointCount = subpaths.reduce((count, path) => count + path.points.length, 0);
    if (pointCount > 8192) {
      throw new RangeError("Native Mermaid path exceeds its point budget.");
    }
    charge(pointCount);
    const contours = subpaths.map((path) => {
      let distance = 0;
      let previousDistance = -Infinity;
      return {
        closed: path.closed,
        vertices: path.points.map(({ x, y, distance: measured }, index) => {
          if (index) distance += Math.hypot(x - path.points[index - 1]!.x, y - path.points[index - 1]!.y);
          const at = { x: x / columnUnits, y: y / rowUnits, distance: measured ?? distance };
          if (
            !Number.isSafeInteger(Math.round(at.x)) || !Number.isSafeInteger(Math.round(at.y)) ||
            !Number.isFinite(at.distance) || at.distance < 0
          ) {
            throw new RangeError("Native Mermaid geometry has invalid coordinates.");
          }
          if (at.distance < previousDistance) {
            throw new RangeError("Native stroke distances must increase within a contour.");
          }
          previousDistance = at.distance;
          return at;
        }),
      };
    });
    const paintStroke = () => {
      if (item.paint.stroke === "none" || item.paint.strokeWidth <= 0) return;
      const outline = strokeOutlineCells(
        item,
        raster.columns,
        raster.rows,
        columnUnits,
        rowUnits,
        charge,
        raster.left,
        raster.top,
      );
      if (outline) {
        for (const { column, row } of outline) {
          put(column, row, {
            char: "█",
            foreground: item.paint.stroke,
            href: item.href,
            interaction: item.interaction,
          });
        }
        return;
      }
      const pattern = strokePattern(item.paint);
      const movingStroke = movingStrokes.has(index);
      for (const { vertices, closed: contourClosed } of contours) {
        const initial = vertices[0];
        if (initial && vertices.every((point) => point.x === initial.x && point.y === initial.y)) {
          if (
            item.paint.lineCap && item.paint.lineCap !== "butt" &&
            strokeCoverage(pattern, initial.distance, initial.distance) !== "none"
          ) {
            put(Math.round(initial.x), Math.round(initial.y), {
              char: item.paint.lineCap === "round" ? "•" : "▪",
              foreground: item.paint.stroke,
              href: item.href,
              interaction: item.interaction,
            });
          }
          continue;
        }
        const path: { x: number; y: number; lower: number; upper: number; incoming: number; outgoing: number }[] = [];
        for (let index = 1; index < vertices.length; index++) {
          const first = vertices[index - 1]!;
          const last = vertices[index]!;
          const clipped = clipSegment(first, last, raster);
          if (!clipped) continue;
          const [from, to] = clipped;
          const dx = last.x - first.x;
          const dy = last.y - first.y;
          const square = dx * dx + dy * dy;
          if (!square) continue;
          const direction = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
          const begin = square ? ((from.x - first.x) * dx + (from.y - first.y) * dy) / square : 0;
          const end = square ? ((to.x - first.x) * dx + (to.y - first.y) * dy) / square : 1;
          for (const at of strokeSegmentCells({ column: from.x, row: from.y }, { column: to.x, row: to.y })) {
            charge(1);
            const distance = (position: number) =>
              first.distance + (begin + position * (end - begin)) * (last.distance - first.distance);
            const lower = Math.max(first.distance, Math.min(last.distance, distance(at.lower)));
            const upper = Math.max(lower, Math.min(last.distance, distance(at.upper)));
            if (upper < lower) continue;
            const previous = path.at(-1);
            if (previous?.x === at.column && previous.y === at.row) {
              previous.lower = Math.min(previous.lower, lower);
              previous.upper = Math.max(previous.upper, upper);
              previous.outgoing = direction;
            } else path.push({ x: at.column, y: at.row, lower, upper, incoming: direction, outgoing: direction });
            if (path.length > maxCells * 4) throw new RangeError("Native Mermaid stroke exceeds its work budget.");
          }
        }
        const closed = contourClosed && path.length > 3 && path[0]!.x === path.at(-1)!.x &&
          path[0]!.y === path.at(-1)!.y;
        if (closed) {
          path[0]!.incoming = path.at(-1)!.incoming;
          path.at(-1)!.outgoing = path[0]!.outgoing;
        }
        const trace = closed ? [path.at(-2)!, ...path, path[1]!] : path;
        const glyphs = closed ? routeCells(trace).slice(1, -1) : routeCells(trace);
        for (const [index, at] of glyphs.entries()) {
          charge(4 + (pattern?.intervals.length ?? 0) * 3);
          const fraction = movingStroke
            ? strokePaintFraction(pattern, path[index]!.lower, path[index]!.upper)
            : undefined;
          const coverage = fraction === undefined
            ? strokeCoverage(pattern, path[index]!.lower, path[index]!.upper)
            : fraction <= 0
            ? "none"
            : fraction >= 1 - 1e-12
            ? "solid"
            : "partial";
          if (coverage === "none") continue;
          const position = index + (closed ? 1 : 0);
          const previous = trace[Math.max(0, position - 1)]!;
          const next = trace[Math.min(trace.length - 1, position + 1)]!;
          const diagonal = previous.x !== at.x && previous.y !== at.y || next.x !== at.x && next.y !== at.y;
          // Cell traversal uses cardinal steps, but a continuous diagonal hatch is
          // not a series of right-angle corners. Preserve its measured direction;
          // only genuine segment turns need the shared circuit junction glyph.
          const tangent = path[index]!;
          let char = tangent.incoming === tangent.outgoing
            ? ["─", "╲", "│", "╱", "─", "╲", "│", "╱"][tangent.incoming]!
            : diagonal
            ? (next.x - previous.x) * (next.y - previous.y) > 0 ? "╲" : "╱"
            : at.glyph;
          if (item.paint.strokeWidth >= 3) {
            char = ({ "─": "═", "│": "║", "┌": "╔", "┐": "╗", "└": "╚", "┘": "╝" } as Record<string, string>)[char] ??
              char;
          }
          if (coverage === "partial") {
            char = ({ "─": "┄", "│": "┆", "═": "┅", "║": "┇" } as Record<string, string>)[char] ?? char;
          }
          put(
            at.x,
            at.y,
            { char, foreground: item.paint.stroke, href: item.href, interaction: item.interaction },
            fraction,
          );
        }
      }
    };
    for (const operation of paintOrder) {
      // SVG fills implicitly close open contours; strokes must not join them.
      if (operation === "fill" && item.paint.fill !== "none" && item.paint.fill !== "transparent") {
        fillPath(item, contours.map((contour) => contour.vertices), raster, put, charge);
      } else if (operation === "stroke") paintStroke();
    }
  }
  compositor.finish(options.background);
  return {
    columns,
    rows,
    cells,
    diagnostics: [...diagnostics],
    accessibility: snapshotDiagramAccessibility({
      ...scene.accessibility,
      title: scene.title,
      description: scene.description,
    }),
  };
}

/** Plain text rows from a native frame; wide-character continuation cells remain empty. */
export function mermaidNativeLines(frame: MermaidNativeFrame): string[] {
  return frame.cells.map((row) => row.map((cell) => cell.char).join(""));
}

// Liang–Barsky clipping happens BEFORE rasterization. Gantt's current-date
// marker may be far beyond its plotted range; walking that offscreen distance
// wastes unbounded work even though the SVG viewport shows none of it.
function clipSegment(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bounds: { left: number; top: number; right: number; bottom: number },
): readonly [{ x: number; y: number }, { x: number; y: number }] | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let lower = 0;
  let upper = 1;
  for (
    const [p, q] of [[-dx, from.x - bounds.left], [dx, bounds.right - from.x], [-dy, from.y - bounds.top], [
      dy,
      bounds.bottom - from.y,
    ]]
  ) {
    if (p === 0) {
      if (q! < 0) return;
      continue;
    }
    const at = q! / p!;
    if (p! < 0) lower = Math.max(lower, at);
    else upper = Math.min(upper, at);
    if (lower > upper) return;
  }
  return [
    { x: from.x + lower * dx, y: from.y + lower * dy },
    { x: from.x + upper * dx, y: from.y + upper * dy },
  ];
}

function fillPath(
  item: MermaidScenePath,
  contours: readonly (readonly { x: number; y: number }[])[],
  bounds: { left: number; top: number; right: number; bottom: number },
  put: (x: number, y: number, cell: Partial<MermaidNativeCell>) => void,
  charge: (amount: number) => void,
): void {
  const all = contours.flat();
  if (all.length < 3) return;
  const top = Math.max(bounds.top, Math.ceil(Math.min(...all.map((point) => point.y)) - 0.5));
  const bottom = Math.min(bounds.bottom, Math.floor(Math.max(...all.map((point) => point.y)) - 0.5));
  for (let row = top; row <= bottom; row++) {
    charge(all.length);
    const intersections: { x: number; winding: number }[] = [];
    const scan = row + 0.5;
    for (const vertices of contours) {
      for (let index = 0; index < vertices.length; index++) {
        const first = vertices[index]!;
        const second = vertices[(index + 1) % vertices.length]!;
        if ((first.y <= scan && second.y > scan) || (second.y <= scan && first.y > scan)) {
          intersections.push({
            x: first.x + (scan - first.y) * (second.x - first.x) / (second.y - first.y),
            winding: second.y > first.y ? 1 : -1,
          });
        }
      }
    }
    charge(intersections.length * Math.max(1, Math.ceil(Math.log2(intersections.length))));
    intersections.sort((a, b) => a.x - b.x);
    let winding = 0;
    for (let index = 0; index + 1 < intersections.length; index++) {
      winding += item.paint.fillRule === "evenodd" ? 1 : intersections[index]!.winding;
      if (item.paint.fillRule === "evenodd" ? winding % 2 === 0 : winding === 0) continue;
      const left = Math.max(bounds.left, Math.ceil(intersections[index]!.x - 0.5));
      const right = Math.min(bounds.right, Math.floor(intersections[index + 1]!.x - 0.5));
      charge(Math.max(0, right - left + 1));
      for (let column = left; column <= right; column++) {
        put(column, row, { char: " ", background: item.paint.fill, href: item.href, interaction: item.interaction });
      }
    }
  }
}
