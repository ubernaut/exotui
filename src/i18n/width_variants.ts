// Copyright 2023 Im-Beast. MIT license.

// LOC-005: localized variants selected by measured cell width. A variant set
// (long/short/narrow) is chosen by how many terminal cells each rendering
// actually occupies — emoji-aware, so an eleven-code-unit ZWJ family counts
// its two cells, not its string length. Selection is a pure monotone
// function of the column budget (wider budgets never pick narrower
// variants), so resizing cannot oscillate; when nothing fits, the narrowest
// variant clips at a span boundary, never mid-cluster.

import { segmentEmojiSequences } from "../unicode/emoji.ts";
import type { EmojiAwareWidthOptions } from "../unicode/emoji.ts";

/** One localized variant of a label. */
export interface WidthVariant {
  readonly length: "long" | "short" | "narrow";
  readonly text: string;
}

/** The chosen rendering for a column budget. */
export interface WidthVariantSelection {
  readonly variant: WidthVariant;
  /** The text to draw — the variant, or its span-safe clip when nothing fits. */
  readonly text: string;
  readonly cells: number;
  readonly clipped: boolean;
}

/** Measures a string in terminal cells (emoji-aware). */
export function measureCells(text: string, options: EmojiAwareWidthOptions = {}): number {
  let cells = 0;
  for (const span of segmentEmojiSequences(text, options)) cells += span.cells;
  return cells;
}

/** Clips to at most `columns` cells on span boundaries — never mid-cluster. */
export function clipToCells(text: string, columns: number, options: EmojiAwareWidthOptions = {}): string {
  const budget = Math.max(0, Math.floor(columns));
  let cells = 0;
  let end = 0;
  for (const span of segmentEmojiSequences(text, options)) {
    if (cells + span.cells > budget) break;
    cells += span.cells;
    end = span.end;
  }
  return text.slice(0, end);
}

/**
 * Picks the widest variant whose measured cells fit the budget. Pure in
 * (variants, columns): repeated calls agree, and a larger budget never
 * selects a narrower text than a smaller one did.
 */
export function selectWidthVariant(
  variants: readonly WidthVariant[],
  columns: number,
  options: EmojiAwareWidthOptions = {},
): WidthVariantSelection {
  if (variants.length === 0) throw new RangeError("selectWidthVariant requires at least one variant");
  const budget = Math.max(0, Math.floor(columns));
  const measured = variants
    .map((variant) => ({ variant, cells: measureCells(variant.text, options) }))
    .sort((left, right) => right.cells - left.cells);
  for (const entry of measured) {
    if (entry.cells <= budget) {
      return { variant: entry.variant, text: entry.variant.text, cells: entry.cells, clipped: false };
    }
  }
  const narrowest = measured.at(-1)!;
  const clippedText = clipToCells(narrowest.variant.text, budget, options);
  return {
    variant: narrowest.variant,
    text: clippedText,
    cells: measureCells(clippedText, options),
    clipped: true,
  };
}
