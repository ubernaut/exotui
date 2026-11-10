// Copyright 2023 Im-Beast. MIT license.
import { BIDI_MIRROR_PAIRS, BIDI_MIRROR_UNPAIRED } from "./mermaid_bidi_data.ts";

const mirrors = new Map(BIDI_MIRROR_PAIRS), unpaired = new Set(BIDI_MIRROR_UNPAIRED);

/** Project known Unicode mirror glyphs only after the browser resolves this glyph's direction. */
export function mirroredTextGlyph(text: string, rtl: boolean): { text: string; unpaired: boolean } {
  if (!rtl) return { text, unpaired: false };
  let unsupported = false;
  const rendered = Array.from(text, (char) => {
    const point = char.codePointAt(0)!;
    if (unpaired.has(point)) unsupported = true;
    const mirror = mirrors.get(point);
    return mirror === undefined ? char : String.fromCodePoint(mirror);
  }).join("");
  return { text: rendered, unpaired: unsupported };
}

/** A range caret at a bidi boundary may lie outside this glyph; use only consistent in-box edge evidence. */
export function measuredHTMLGlyphDirection(
  box: { x: number; y: number; width: number; height: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): "ltr" | "rtl" | undefined {
  const directions: ("ltr" | "rtl")[] = [];
  const tolerance = 0.1;
  if (
    ![box.x, box.y, box.width, box.height, start.x, start.y, end.x, end.y].every(Number.isFinite) ||
    box.width <= tolerance * 2 || box.height <= 0
  ) return undefined;
  if (Math.abs(start.y - box.y) < tolerance) {
    if (Math.abs(start.x - box.x) < tolerance) directions.push("ltr");
    else if (Math.abs(start.x - box.x - box.width) < tolerance) directions.push("rtl");
  }
  if (Math.abs(end.y - box.y) < tolerance) {
    if (Math.abs(end.x - box.x) < tolerance) directions.push("rtl");
    else if (Math.abs(end.x - box.x - box.width) < tolerance) directions.push("ltr");
  }
  return directions.length && directions.every((value) => value === directions[0]) ? directions[0] : undefined;
}
