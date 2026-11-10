// Copyright 2023 Im-Beast. MIT license.
import type { MermaidSceneText } from "./mermaid_scene.ts";
import { parsePaintColor } from "./mermaid_paint.ts";
import type { AnsiStyleSpec } from "../theme.ts";

/** Select captured decorating-owner ink for the rendered SVG or CSS text context without mutating the source. */
export function renderedTextDecorationPaint(
  decoration: NonNullable<MermaidSceneText["decorations"]>[number],
  svgText: boolean,
): NonNullable<MermaidSceneText["decorations"]>[number] {
  if (svgText || decoration.cssColor === undefined) return decoration;
  const { line, style, thickness, offset, position, skipInk, cssColor } = decoration;
  return { line, color: cssColor, style, thickness, offset, position, skipInk };
}

/** Terminal decoration transport; exact CSS geometry and non-representable layers remain diagnosed. */
export function nativeTextDecorations(
  item: MermaidSceneText,
  diagnostics: Set<string>,
): {
  underline: boolean;
  strikethrough: boolean;
  underlineColor?: string;
  underlineStyle?: AnsiStyleSpec["underlineStyle"];
  overline?: boolean;
} {
  const result: ReturnType<typeof nativeTextDecorations> = { underline: false, strikethrough: false };
  let underlineSignature: string | undefined;
  if ((item.decorations?.length ?? 0) > 32) throw new RangeError("Native text decorations exceed their budget.");
  for (const decoration of item.decorations ?? []) {
    if (
      !["underline", "line-through", "overline"].includes(decoration.line) ||
      !["solid", "double", "dotted", "dashed", "wavy"].includes(decoration.style) ||
      Object.values(decoration).some((value) => typeof value !== "string" || value.length > 256)
    ) throw new TypeError("Invalid native text decoration metadata.");
    const color = parsePaintColor(decoration.color), ink = parsePaintColor(item.color);
    const sameInk = !!color && !!ink && color.rgb.every((channel, index) => channel === ink.rgb[index]) &&
      color.alpha === ink.alpha && !item.gradient;
    if (decoration.line === "underline") {
      result.underline = true;
      result.underlineStyle = decoration.style === "solid"
        ? undefined
        : decoration.style as AnsiStyleSpec["underlineStyle"];
      result.underlineColor = sameInk ? undefined : decoration.color;
      const signature = JSON.stringify([
        color,
        decoration.style,
        decoration.thickness,
        decoration.offset,
        decoration.position,
      ]);
      if (underlineSignature !== undefined && underlineSignature !== signature) {
        diagnostics.add("Native text decoration needs full color/style/position/geometry painting.");
      }
      underlineSignature = signature;
    }
    if (decoration.line === "line-through") result.strikethrough = true;
    if (decoration.line === "overline") result.overline = true;
    if (
      (decoration.line !== "underline" && (decoration.style !== "solid" || !sameInk)) ||
      decoration.thickness !== "auto" || decoration.offset !== "auto" || decoration.position !== "auto" ||
      decoration.skipInk !== "auto" ||
      (decoration.stroke !== undefined && decoration.stroke !== "none") ||
      (decoration.fillOpacity !== undefined && decoration.fillOpacity !== "1") ||
      !color || color.alpha !== 1 ||
      (result.underlineColor !== undefined && item.opacity !== undefined && item.opacity !== 1)
    ) diagnostics.add("Native text decoration needs full color/style/position/geometry painting.");
  }
  // Omit absent additions for stable ordinary frame identities and existing host adapters.
  if (result.underlineColor === undefined) delete result.underlineColor;
  if (result.underlineStyle === undefined) delete result.underlineStyle;
  return result;
}
