// Copyright 2023 Im-Beast. MIT license.
import { getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";
import type { MermaidSceneText } from "./mermaid_scene.ts";

/** Inert one-line native text; replacement keeps measured UTF-16 offsets intact. */
export function nativeDiagramText(text: string): string {
  // deno-lint-ignore no-control-regex
  return text.replace(/[\t\r\n]/g, " ").replace(/[\x00-\x1f\x7f-\x9f]/g, "�");
}

/** Validate optional glyph ink independently of logical text before native allocation. */
export function nativeTextInk(item: MermaidSceneText): string {
  const text = nativeDiagramText(item.text);
  if (item.renderedText === undefined) return text;
  if (
    typeof item.renderedText !== "string" || item.renderedText.length > 65_536 ||
    nativeDiagramText(item.renderedText) !== item.renderedText ||
    getMultiCodePointCharacters(item.renderedText).length !== getMultiCodePointCharacters(text).length
  ) throw new RangeError("Invalid native rendered text ink.");
  return item.renderedText;
}

/** Validate portable browser-measured graphemes before allocating or painting a frame. */
export function validateTextLayout(item: MermaidSceneText): number {
  if (!item.layout) return 0;
  const { glyphs, columnUnits } = item.layout;
  if (
    !Array.isArray(glyphs) || glyphs.length > 8192 || typeof item.text !== "string" || item.text.length > 65_536 ||
    !Number.isFinite(columnUnits) ||
    columnUnits <= 0 ||
    ![item.x, item.y, item.width, item.height].every(Number.isFinite) || item.width < 0 || item.height < 0
  ) throw new RangeError("Invalid measured SVG text layout.");
  if (item.layout.anchor !== undefined && !["center", "top-left"].includes(item.layout.anchor)) {
    throw new RangeError("Invalid measured text anchor.");
  }
  if (
    item.layout.sequence !== undefined &&
    (!Number.isSafeInteger(item.layout.sequence) || item.layout.sequence < 0 || item.layout.sequence > 65_536)
  ) {
    throw new RangeError("Invalid measured SVG text sequence.");
  }
  const boundaries = new Set([0]);
  let offset = 0;
  for (const char of getMultiCodePointCharacters(nativeDiagramText(item.text))) {
    offset += char.length;
    boundaries.add(offset);
  }
  let previous = 0, painted = 0;
  for (const glyph of glyphs) {
    if (!glyph || typeof glyph !== "object") throw new RangeError("Invalid measured SVG text grapheme.");
    if (
      !Number.isSafeInteger(glyph.start) || !Number.isSafeInteger(glyph.end) || glyph.start !== previous ||
      glyph.end <= glyph.start || glyph.end > item.text.length || !boundaries.has(glyph.start) ||
      !boundaries.has(glyph.end) || ![glyph.x, glyph.y].every(Number.isFinite) ||
      getMultiCodePointCharacters(nativeDiagramText(item.text.slice(glyph.start, glyph.end))).length !== 1
    ) throw new RangeError("Invalid measured SVG text grapheme.");
    if (
      glyph.rendered !== undefined &&
      (typeof glyph.rendered !== "string" || glyph.rendered.length > 512 ||
        nativeDiagramText(glyph.rendered) !== glyph.rendered ||
        getMultiCodePointCharacters(glyph.rendered).length !== 1)
    ) throw new RangeError("Invalid measured SVG rendered glyph.");
    if (glyph.fragments !== undefined) {
      if (!Array.isArray(glyph.fragments) || !glyph.fragments.length || glyph.rendered !== undefined) {
        throw new RangeError("Invalid measured text fragments.");
      }
      if ((painted += glyph.fragments.length) > 8192) {
        throw new RangeError("Measured text fragments exceed their glyph budget.");
      }
      for (const fragment of glyph.fragments) {
        if (
          !fragment || typeof fragment !== "object" || ![fragment.x, fragment.y].every(Number.isFinite) ||
          typeof fragment.rendered !== "string" || fragment.rendered.length > 512 ||
          nativeDiagramText(fragment.rendered) !== fragment.rendered ||
          getMultiCodePointCharacters(fragment.rendered).length !== 1 ||
          fragment.columnOffset !== undefined && fragment.columnOffset !== -1
        ) throw new RangeError("Invalid measured text fragment ink or geometry.");
        if (fragment.ink !== undefined) {
          const ink = fragment.ink;
          if (
            !ink || typeof ink !== "object" || fragment.columnOffset !== -1 ||
            !/^\u00a0[\p{Mark}\p{Cf}]+$/u.test(fragment.rendered) ||
            ![ink.x, ink.y, ink.width, ink.height, ink.x + ink.width, ink.y + ink.height].every(Number.isFinite) ||
            ink.width <= 0 || ink.height <= 0 || ink.x + ink.width <= ink.x || ink.y + ink.height <= ink.y
          ) throw new RangeError("Invalid measured detached mark ink box.");
        }
      }
    } else if (++painted > 8192) throw new RangeError("Measured text fragments exceed their glyph budget.");
    previous = glyph.end;
  }
  if (previous !== item.text.length) throw new RangeError("Incomplete measured SVG text layout.");
  return painted;
}

function textGlyphPaints(item: MermaidSceneText): {
  char: string;
  x: number;
  y: number;
  columnOffset?: -1;
  ink?: { x: number; y: number; width: number; height: number };
}[] {
  const text = nativeDiagramText(item.text);
  return item.layout!.glyphs.flatMap((glyph) =>
    glyph.fragments
      ? glyph.fragments.map(({ rendered, ...point }) => ({
        char: rendered,
        ...point,
        ...(point.ink ? { x: point.ink.x + point.ink.width / 2, y: point.ink.y + point.ink.height / 2 } : {}),
      }))
      : [{ char: glyph.rendered ?? text.slice(glyph.start, glyph.end), x: glyph.x, y: glyph.y }]
  );
}

/** Upright terminal glyphs centered on upstream positions; no DOM, shaping engine or source callbacks retained. */
export function measuredTextCells(
  item: MermaidSceneText,
  columnUnits: number,
  rowUnits: number,
): {
  char: string;
  width: number;
  column: number;
  row: number;
  ink?: { x: number; y: number; width: number; height: number };
}[] {
  return textGlyphPaints(item).map((glyph) => {
    const char = glyph.char;
    const width = textWidth(char);
    return {
      char,
      width,
      column: glyph.ink
        ? Math.floor(glyph.x / columnUnits)
        : Math.round(glyph.x / columnUnits - (item.layout!.anchor === "top-left" ? 0 : (width - 1) / 2)) +
          (glyph.columnOffset ?? 0),
      row: glyph.ink ? Math.floor(glyph.y / rowUnits) : Math.round(glyph.y / rowUnits),
      ...(glyph.ink ? { ink: glyph.ink } : {}),
    };
  });
}

/** Preserve visually adjacent measured ink, including nonadjacent source glyphs and styled runs of one label. */
export function measuredTextDensity(
  items: readonly MermaidSceneText[],
  columnUnits: number,
  rowUnits: number,
  automaticColumns: boolean,
  automaticRows: boolean,
): { columnUnits: number; rowUnits: number; merged: boolean } {
  for (let pass = 0; pass < 16; pass++) {
    let changeColumns = false, changeRows = false, merged = false;
    const labels = new Map<
      number | MermaidSceneText,
      {
        cell: ReturnType<typeof measuredTextCells>[number];
        point: { x: number; y: number };
      }[]
    >();
    let painted = 0;
    for (const item of items) {
      const glyphs = measuredTextCells(item, columnUnits, rowUnits);
      const points = textGlyphPaints(item);
      if ((painted += glyphs.length) > 65_536) throw new RangeError("Measured text density exceeds its glyph budget.");
      const key = item.layout!.sequence ?? item;
      let label = labels.get(key);
      if (!label) labels.set(key, label = []);
      for (let index = 0; index < glyphs.length; index++) {
        if (glyphs[index]!.width) label.push({ cell: glyphs[index]!, point: points[index]! });
      }
    }
    for (const label of labels.values()) {
      // A row/column sweep catches reordered glyphs without quadratic pair checks.
      label.sort((a, b) => a.cell.row - b.cell.row || a.cell.column - b.cell.column);
      let previous: typeof label[number] | undefined;
      for (const current of label) {
        if (previous && previous.cell.row === current.cell.row) {
          if (previous.cell.column + previous.cell.width > current.cell.column) {
            const dx = Math.abs(previous.point.x - current.point.x), dy = Math.abs(previous.point.y - current.point.y);
            if (automaticRows && dy > 1e-7 && (dy >= dx || !automaticColumns)) changeRows = true;
            else if (automaticColumns && dx > 1e-7) changeColumns = true;
            else merged = true;
          }
          if (previous.cell.column + previous.cell.width > current.cell.column + current.cell.width) continue;
        }
        previous = current;
      }
    }
    if (!changeColumns && !changeRows) return { columnUnits, rowUnits, merged };
    if (changeColumns) columnUnits /= 2;
    if (changeRows) rowUnits /= 2;
  }
  throw new RangeError("Measured SVG text density exceeds its refinement budget.");
}
