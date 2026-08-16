// Copyright 2023 Im-Beast. MIT license.

/** Public type alias for CSS-inspired layout display modes. */
export type LayoutDisplay = "block" | "flex" | "grid" | "none";

/** Public type alias for CSS-inspired positioning modes. */
export type LayoutPosition = "relative" | "absolute";

/** Public type alias for CSS-inspired overflow handling. */
export type LayoutOverflow = "visible" | "hidden" | "auto" | "scroll";

/** Public type alias for flex layout direction. */
export type LayoutFlexDirection = "row" | "row-reverse" | "column" | "column-reverse";

/** Public type alias for flex wrapping behavior. */
export type LayoutFlexWrap = "nowrap" | "wrap" | "wrap-reverse";

/** Public type alias for cross-axis alignment. */
export type LayoutAlignItems = "start" | "end" | "center" | "stretch";

/** Public type alias for wrapped flex-line distribution. */
export type LayoutAlignContent =
  | "start"
  | "end"
  | "center"
  | "stretch"
  | "space-between"
  | "space-around"
  | "space-evenly";

/** Public type alias for per-item box alignment. */
export type LayoutSelfAlignment = "start" | "end" | "center" | "stretch";

/** Public type alias for main-axis distribution. */
export type LayoutJustifyContent =
  | "start"
  | "end"
  | "center"
  | "space-between"
  | "space-around"
  | "space-evenly";

/** Public type alias for CSS-grid auto-placement direction. */
export type LayoutGridAutoFlow = "row" | "column";

/** Public type alias for visibility state. */
export type LayoutVisibility = "visible" | "hidden";

/** Public type alias for CSS-inspired text whitespace handling. */
export type LayoutWhiteSpace = "normal" | "nowrap" | "pre" | "pre-wrap";

/** Public type alias for CSS-inspired long-word wrapping. */
export type LayoutOverflowWrap = "normal" | "anywhere" | "break-word";

/** Public type alias selecting which box an authored size describes. */
export type LayoutBoxSizing = "content-box" | "border-box";

/** Units resolvable inside a bounded additive `calc()` expression. */
export type LayoutCalcUnit = "cell" | "percent" | "vw" | "vh" | "pw" | "ph";

/** One signed additive term of a bounded `calc()` expression. */
export interface LayoutCalcTerm {
  unit: LayoutCalcUnit;
  value: number;
}

/**
 * Public interface describing a terminal-cell layout length.
 *
 * Beyond cells, percentages, and fractions: `vw`/`vh` resolve against the
 * solve viewport, `pw`/`ph` (authored `w`/`h`, Textual-style) against the
 * containing block's width/height regardless of the property's own axis, and
 * `calc` carries a bounded additive term list in {@linkcode LayoutLengthValue.terms}.
 */
export interface LayoutLengthValue {
  unit:
    | "auto"
    | "cell"
    | "percent"
    | "fr"
    | "vw"
    | "vh"
    | "pw"
    | "ph"
    | "calc"
    | "min-content"
    | "max-content"
    | "fit-content"
    | "minmax";
  value: number;
  /** Additive `calc()` terms; present only when `unit` is `"calc"`. */
  terms?: readonly LayoutCalcTerm[];
  /** The lower track bound; present only when `unit` is `"minmax"`. */
  minTrack?: LayoutLengthValue;
  /** The upper track bound; present only when `unit` is `"minmax"`. */
  maxTrack?: LayoutLengthValue;
  /** The `fit-content(limit)` argument, when one was authored. */
  limitTrack?: LayoutLengthValue;
}

/** True for the content-derived sizing keywords a solver must measure for. */
export function isIntrinsicLayoutLengthUnit(
  unit: LayoutLengthValue["unit"],
): unit is "min-content" | "max-content" | "fit-content" {
  return unit === "min-content" || unit === "max-content" || unit === "fit-content";
}

/** Sizes a bounded `calc()` expression may not exceed. */
export const LAYOUT_CALC_TERM_LIMIT = 8;

/**
 * Axis measurements viewport- and parent-relative units resolve against.
 * Missing axes degrade to the local available size, never to a silent zero.
 */
export interface LayoutLengthResolutionContext {
  viewportWidth?: number;
  viewportHeight?: number;
  parentWidth?: number;
  parentHeight?: number;
  /**
   * Content-derived bounds for the axis being resolved, supplied by a solver
   * that measured the node: `min-content` resolves to `intrinsicMin`,
   * `max-content` to `intrinsicMax`, and `fit-content` clamps the available
   * size between them. Without them the keywords resolve to the fallback,
   * behaving as `auto`.
   */
  intrinsicMin?: number;
  intrinsicMax?: number;
}

/** Public interface describing a one-dimensional CSS-grid placement. */
export interface LayoutGridPlacement {
  start?: number;
  end?: number;
  span?: number;
  /** A named start line, resolved against the template's line names. */
  startName?: string;
  /** A named end line, resolved against the template's line names. */
  endName?: string;
}

/** Public interface describing box model edges. */
export interface BoxEdges<T = number> {
  top: T;
  right: T;
  bottom: T;
  left: T;
}

/** Edge a docked node pins to (Textual-style `dock`). */
export type LayoutDock = "top" | "right" | "bottom" | "left";

/** Horizontal child alignment inside a container (Textual-style `align`). */
export type LayoutHorizontalAlign = "left" | "center" | "right";

/** Vertical child alignment inside a container. */
export type LayoutVerticalAlign = "top" | "middle" | "bottom";

/** Placement of a border title or subtitle along its edge. */
export type LayoutTitleAlign = "left" | "center" | "right";

/** Background hatch fill: one repeated glyph and an optional color. */
export interface LayoutHatch {
  readonly glyph: string;
  readonly color?: string;
}

/** Named hatch patterns (Textual-compatible) accepted by `hatch:`. */
export const LAYOUT_HATCH_PATTERNS: Readonly<Record<string, string>> = Object.freeze({
  left: "╲",
  right: "╱",
  cross: "╳",
  horizontal: "─",
  vertical: "│",
});

/** Public interface describing the normalized style used by layout solvers. */
export interface ComputedLayoutStyle {
  display: LayoutDisplay;
  position: LayoutPosition;
  flexDirection: LayoutFlexDirection;
  flexWrap: LayoutFlexWrap;
  flexGrow: number;
  flexShrink: number;
  flexBasis: LayoutLengthValue;
  order: number;
  alignItems: LayoutAlignItems;
  alignContent: LayoutAlignContent;
  justifyContent: LayoutJustifyContent;
  alignSelf: LayoutSelfAlignment;
  justifySelf: LayoutSelfAlignment;
  gridTemplateColumns: LayoutLengthValue[];
  gridTemplateRows: LayoutLengthValue[];
  gridTemplateAreas: string[][];
  gridTemplateColumnsAutoRepeat?: LayoutGridAutoRepeat;
  gridTemplateRowsAutoRepeat?: LayoutGridAutoRepeat;
  /** Names declared before/after each column track (index = line - 1). */
  gridTemplateColumnsLineNames?: string[][];
  /** Names declared before/after each row track (index = line - 1). */
  gridTemplateRowsLineNames?: string[][];
  gridAutoColumns: LayoutLengthValue;
  gridAutoRows: LayoutLengthValue;
  gridAutoFlow: LayoutGridAutoFlow;
  /** Dense backfill: visual only — document and focus order never reorder. */
  gridAutoFlowDense: boolean;
  gridColumn: LayoutGridPlacement;
  gridRow: LayoutGridPlacement;
  gridArea?: string;
  width: LayoutLengthValue;
  height: LayoutLengthValue;
  minWidth: LayoutLengthValue;
  minHeight: LayoutLengthValue;
  maxWidth: LayoutLengthValue;
  maxHeight: LayoutLengthValue;
  /** Preferred inline/block ratio. Undefined represents CSS `auto`. */
  aspectRatio?: number;
  /** Box used by width, height, and aspect-ratio calculations. */
  boxSizing?: LayoutBoxSizing;
  inset: BoxEdges<LayoutLengthValue>;
  /**
   * Scalar visual translation in cells (C1 `offset: x y`). Owned by paint and
   * hit testing: the subtree's computed boxes and hit regions move, but
   * siblings, scroll metadata, and normal flow are untouched — unlike
   * relative-position insets, which participate in layout.
   */
  offsetX: number;
  offsetY: number;
  /**
   * Textual-style edge docking: a docked node leaves normal flow, pins to
   * its container's content edge, and reserves that strip — siblings flow in
   * the remaining area. Docks apply in document order.
   */
  dock?: LayoutDock;
  /**
   * Named paint layers (Textual-style): a container declares the order with
   * `layers`, a descendant assigns itself with `layer`, and the engine
   * post-pass raises the subtree's z-order by the layer's index — later
   * names paint above earlier ones.
   */
  layers?: readonly string[];
  layer?: string;
  /** Container-level child alignment for block flow (Textual `align`). */
  alignHorizontal?: LayoutHorizontalAlign;
  alignVertical?: LayoutVerticalAlign;
  /** Renderer-owned scrollbar styling, consumed by scroll-area renderers. */
  scrollbarColor?: string;
  scrollbarBackgroundColor?: string;
  scrollbarSize?: number;
  /** Renderer-owned border captions painted over the border edge. */
  borderTitle?: string;
  borderSubtitle?: string;
  borderTitleAlign?: LayoutTitleAlign;
  borderSubtitleAlign?: LayoutTitleAlign;
  margin: BoxEdges<number>;
  padding: BoxEdges<number>;
  border: BoxEdges<number>;
  gap: number;
  rowGap: number;
  columnGap: number;
  overflowX: LayoutOverflow;
  overflowY: LayoutOverflow;
  zIndex: number;
  /**
   * C1 paint hints, renderer-owned like `color`: the solver never reads them.
   * `opacity` scales the subtree's paint toward its backdrop (0..1); `tint`
   * blends a color over the subtree's final paint; `hatch` fills otherwise
   * empty background cells with a repeating glyph.
   */
  opacity: number;
  tint?: string;
  hatch?: LayoutHatch;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderStyle?: string;
  visibility: LayoutVisibility;
  whiteSpace: LayoutWhiteSpace;
  overflowWrap: LayoutOverflowWrap;
  variables: Record<string, string>;
}

interface AuthoredLayoutLengths {
  margin?: BoxEdges<LayoutLengthValue>;
  padding?: BoxEdges<LayoutLengthValue>;
  rowGap?: LayoutLengthValue;
  columnGap?: LayoutLengthValue;
}

type StyleWithAuthoredLayoutLengths = ComputedLayoutStyle & {
  __layoutLengths?: AuthoredLayoutLengths;
};

/** Public constant for an automatic layout length. */
export const AUTO_LAYOUT_LENGTH: LayoutLengthValue = { unit: "auto", value: 0 };

/** Public constant for a zero-valued box edge set. */
export const ZERO_BOX_EDGES: BoxEdges<number> = { top: 0, right: 0, bottom: 0, left: 0 };

/** Creates a terminal-cell length value. */
export function cellLength(value: number): LayoutLengthValue {
  return { unit: "cell", value: Math.max(0, Math.floor(finiteNumber(value, 0))) };
}

/** Creates a percentage layout length value. */
export function percentLength(value: number): LayoutLengthValue {
  return { unit: "percent", value: finiteNumber(value, 0) };
}

/** Creates an fractional layout length value. */
export function frLength(value: number): LayoutLengthValue {
  return { unit: "fr", value: Math.max(0, finiteNumber(value, 0)) };
}

/** Creates an automatic layout length value. */
export function autoLength(): LayoutLengthValue {
  return { ...AUTO_LAYOUT_LENGTH };
}

/** Creates a bounded additive `calc()` layout length from its terms. */
export function calcLength(terms: readonly LayoutCalcTerm[]): LayoutLengthValue {
  const bounded = terms.slice(0, LAYOUT_CALC_TERM_LIMIT).map((term) => ({
    unit: term.unit,
    value: finiteNumber(term.value, 0),
  }));
  return { unit: "calc", value: 0, terms: bounded };
}

/** Returns a fresh normalized style object. */
export function defaultComputedLayoutStyle(): ComputedLayoutStyle {
  return {
    display: "block",
    position: "relative",
    flexDirection: "row",
    flexWrap: "nowrap",
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: autoLength(),
    order: 0,
    alignItems: "stretch",
    alignContent: "start",
    justifyContent: "start",
    alignSelf: "stretch",
    justifySelf: "stretch",
    gridTemplateColumns: [],
    gridTemplateRows: [],
    gridTemplateAreas: [],
    gridAutoColumns: autoLength(),
    gridAutoRows: autoLength(),
    gridAutoFlow: "row",
    gridAutoFlowDense: false,
    gridColumn: {},
    gridRow: {},
    width: autoLength(),
    height: autoLength(),
    minWidth: cellLength(0),
    minHeight: cellLength(0),
    maxWidth: autoLength(),
    maxHeight: autoLength(),
    aspectRatio: undefined,
    boxSizing: "border-box",
    inset: {
      top: autoLength(),
      right: autoLength(),
      bottom: autoLength(),
      left: autoLength(),
    },
    offsetX: 0,
    offsetY: 0,
    margin: { ...ZERO_BOX_EDGES },
    padding: { ...ZERO_BOX_EDGES },
    border: { ...ZERO_BOX_EDGES },
    gap: 0,
    rowGap: 0,
    columnGap: 0,
    overflowX: "visible",
    overflowY: "visible",
    zIndex: 0,
    opacity: 1,
    visibility: "visible",
    whiteSpace: "normal",
    overflowWrap: "normal",
    variables: {},
  };
}

/** Clones a computed layout style without preserving object identity. */
export function cloneComputedLayoutStyle(style: ComputedLayoutStyle): ComputedLayoutStyle {
  const clone: ComputedLayoutStyle = {
    ...style,
    flexBasis: cloneLayoutLength(style.flexBasis),
    gridTemplateColumns: cloneLayoutLengths(style.gridTemplateColumns),
    gridTemplateRows: cloneLayoutLengths(style.gridTemplateRows),
    gridTemplateAreas: cloneGridAreas(style.gridTemplateAreas),
    ...(style.gridTemplateColumnsAutoRepeat
      ? {
        gridTemplateColumnsAutoRepeat: {
          mode: style.gridTemplateColumnsAutoRepeat.mode,
          tracks: cloneLayoutLengths(style.gridTemplateColumnsAutoRepeat.tracks),
          insertAt: style.gridTemplateColumnsAutoRepeat.insertAt,
        },
      }
      : {}),
    ...(style.gridTemplateColumnsLineNames
      ? { gridTemplateColumnsLineNames: style.gridTemplateColumnsLineNames.map((names) => [...names]) }
      : {}),
    ...(style.gridTemplateRowsLineNames
      ? { gridTemplateRowsLineNames: style.gridTemplateRowsLineNames.map((names) => [...names]) }
      : {}),
    ...(style.gridTemplateRowsAutoRepeat
      ? {
        gridTemplateRowsAutoRepeat: {
          mode: style.gridTemplateRowsAutoRepeat.mode,
          tracks: cloneLayoutLengths(style.gridTemplateRowsAutoRepeat.tracks),
          insertAt: style.gridTemplateRowsAutoRepeat.insertAt,
        },
      }
      : {}),
    gridAutoFlowDense: style.gridAutoFlowDense,
    gridAutoColumns: cloneLayoutLength(style.gridAutoColumns),
    gridAutoRows: cloneLayoutLength(style.gridAutoRows),
    gridColumn: { ...style.gridColumn },
    gridRow: { ...style.gridRow },
    width: cloneLayoutLength(style.width),
    height: cloneLayoutLength(style.height),
    minWidth: cloneLayoutLength(style.minWidth),
    minHeight: cloneLayoutLength(style.minHeight),
    maxWidth: cloneLayoutLength(style.maxWidth),
    maxHeight: cloneLayoutLength(style.maxHeight),
    inset: cloneBoxEdgeLengths(style.inset),
    hatch: style.hatch ? { ...style.hatch } : undefined,
    layers: style.layers ? [...style.layers] : undefined,
    margin: { ...style.margin },
    padding: { ...style.padding },
    border: { ...style.border },
    variables: { ...style.variables },
  };
  const authored = authoredLayoutLengths(style);
  if (authored) {
    (clone as StyleWithAuthoredLayoutLengths).__layoutLengths = {
      margin: authored.margin ? cloneBoxEdgeLengths(authored.margin) : undefined,
      padding: authored.padding ? cloneBoxEdgeLengths(authored.padding) : undefined,
      rowGap: authored.rowGap ? { ...authored.rowGap } : undefined,
      columnGap: authored.columnGap ? { ...authored.columnGap } : undefined,
    };
  }
  return clone;
}

/** The percentage base one unit resolves against, given the known axes. */
function unitBase(unit: LayoutCalcUnit, available: number, context?: LayoutLengthResolutionContext): number {
  const pick = (axis: number | undefined): number =>
    axis === undefined ? available : Math.max(0, Math.floor(finiteNumber(axis, 0)));
  if (unit === "vw") return pick(context?.viewportWidth);
  if (unit === "vh") return pick(context?.viewportHeight);
  if (unit === "pw") return pick(context?.parentWidth);
  if (unit === "ph") return pick(context?.parentHeight);
  return available;
}

/** One term's unfloored cell contribution. */
function resolveCalcTerm(term: LayoutCalcTerm, available: number, context?: LayoutLengthResolutionContext): number {
  if (term.unit === "cell") return finiteNumber(term.value, 0);
  return unitBase(term.unit, available, context) * finiteNumber(term.value, 0) / 100;
}

/** Resolves a layout length against an available terminal-cell size. */
export function resolveLayoutLength(
  value: LayoutLengthValue | undefined,
  available: number,
  fallback = 0,
  context?: LayoutLengthResolutionContext,
): number {
  const safeAvailable = Math.max(0, Math.floor(finiteNumber(available, 0)));
  const safeFallback = Math.max(0, Math.floor(finiteNumber(fallback, 0)));
  if (!value || value.unit === "auto") return safeFallback;
  if (value.unit === "cell") return Math.max(0, Math.floor(value.value));
  if (value.unit === "percent") return Math.max(0, Math.floor(safeAvailable * value.value / 100));
  if (value.unit === "vw" || value.unit === "vh" || value.unit === "pw" || value.unit === "ph") {
    return Math.max(0, Math.floor(unitBase(value.unit, safeAvailable, context) * value.value / 100));
  }
  if (value.unit === "calc") {
    const sum = (value.terms ?? []).reduce(
      (total, term) => total + resolveCalcTerm(term, safeAvailable, context),
      0,
    );
    return Math.max(0, Math.floor(sum));
  }
  if (value.unit === "min-content") {
    return context?.intrinsicMin === undefined ? safeFallback : Math.max(0, Math.floor(context.intrinsicMin));
  }
  if (value.unit === "max-content") {
    return context?.intrinsicMax === undefined ? safeFallback : Math.max(0, Math.floor(context.intrinsicMax));
  }
  if (value.unit === "fit-content") {
    if (context?.intrinsicMin === undefined || context.intrinsicMax === undefined) return safeFallback;
    const lower = Math.max(0, Math.floor(context.intrinsicMin));
    const upper = Math.max(lower, Math.floor(context.intrinsicMax));
    return Math.min(upper, Math.max(lower, safeAvailable));
  }
  return Math.max(0, Math.floor(value.value));
}

/** Clamps a terminal-cell size by min and max layout lengths. */
export function clampLayoutSize(
  size: number,
  available: number,
  min: LayoutLengthValue,
  max: LayoutLengthValue,
  context?: LayoutLengthResolutionContext,
): number {
  const safe = Math.max(0, Math.floor(finiteNumber(size, 0)));
  const lower = resolveLayoutLength(min, available, 0, context);
  const upper = max.unit === "auto" ? Number.MAX_SAFE_INTEGER : resolveLayoutLength(max, available, available, context);
  return Math.max(lower, Math.min(upper, safe));
}

/** Parses a CSS-like length into a terminal-cell layout length. */
export function parseLayoutLength(
  value: string | undefined,
  fallback: LayoutLengthValue = autoLength(),
): LayoutLengthValue {
  if (value === undefined) return { ...fallback };
  return tryParseLayoutLength(value) ?? { ...fallback };
}

function tryParseLayoutLength(value: string): LayoutLengthValue | undefined {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "auto") return autoLength();
  if (trimmed === "min-content" || trimmed === "max-content" || trimmed === "fit-content") {
    return { unit: trimmed, value: 0 };
  }
  if (trimmed.startsWith("minmax(")) return tryParseMinmaxTrack(trimmed);
  if (trimmed.startsWith("fit-content(")) return tryParseFitContentTrack(trimmed);
  if (trimmed.startsWith("calc(")) return tryParseCalcLength(trimmed);
  const match = trimmed.match(/^(\d+(?:\.\d+)?|\.\d+)(%|fr|ch|cells?|vw|vh|w|h)?$/);
  if (!match) return undefined;
  const number = Number.parseFloat(match[1]!);
  if (!Number.isFinite(number)) return undefined;
  const unit = match[2];
  if (unit === "%") return percentLength(number);
  if (unit === "fr") return frLength(number);
  if (unit === "vw" || unit === "vh") return { unit, value: number };
  if (unit === "w") return { unit: "pw", value: number };
  if (unit === "h") return { unit: "ph", value: number };
  return cellLength(number);
}

/**
 * Parses `minmax(min, max)`. The minimum may not be flexible (`fr` is
 * refused there, as in CSS) and neither bound may nest another minmax.
 */
function tryParseMinmaxTrack(trimmed: string): LayoutLengthValue | undefined {
  if (!trimmed.endsWith(")")) return undefined;
  const body = trimmed.slice("minmax(".length, -1);
  if (body.includes("(")) return undefined;
  const parts = body.split(",");
  if (parts.length !== 2) return undefined;
  const min = tryParseLayoutLength(parts[0]!.trim());
  const max = tryParseLayoutLength(parts[1]!.trim());
  if (!min || !max || min.unit === "fr" || min.unit === "minmax" || max.unit === "minmax") return undefined;
  return { unit: "minmax", value: 0, minTrack: min, maxTrack: max };
}

/** Parses `fit-content(limit)`; the limit may not be flexible. */
function tryParseFitContentTrack(trimmed: string): LayoutLengthValue | undefined {
  if (!trimmed.endsWith(")")) return undefined;
  const body = trimmed.slice("fit-content(".length, -1);
  if (body.includes("(")) return undefined;
  const limit = tryParseLayoutLength(body.trim());
  if (!limit || limit.unit === "fr" || limit.unit === "minmax") return undefined;
  return { unit: "fit-content", value: 0, limitTrack: limit };
}

/**
 * Parses the bounded additive `calc()` subset: signed `+`/`-` chains of at
 * most {@linkcode LAYOUT_CALC_TERM_LIMIT} cell/%/vw/vh/w/h terms. Nesting,
 * multiplication, and `fr` terms are rejected — the model stays a linear
 * combination a terminal cell grid can resolve deterministically.
 */
function tryParseCalcLength(trimmed: string): LayoutLengthValue | undefined {
  if (!trimmed.endsWith(")")) return undefined;
  const body = trimmed.slice("calc(".length, -1).trim();
  if (body.length === 0 || body.length > 256 || body.includes("(")) return undefined;
  // Normalize into "term [op term]*": operators need surrounding whitespace.
  const tokens = body.split(/\s+/);
  const terms: LayoutCalcTerm[] = [];
  let sign = 1;
  let expectTerm = true;
  for (const token of tokens) {
    if (!expectTerm) {
      if (token === "+") sign = 1;
      else if (token === "-") sign = -1;
      else return undefined;
      expectTerm = true;
      continue;
    }
    const match = token.match(/^(\d+(?:\.\d+)?|\.\d+)(%|ch|cells?|vw|vh|w|h)?$/);
    if (!match) return undefined;
    const number = Number.parseFloat(match[1]!);
    if (!Number.isFinite(number)) return undefined;
    const suffix = match[2];
    const unit: LayoutCalcUnit = suffix === "%"
      ? "percent"
      : suffix === "vw"
      ? "vw"
      : suffix === "vh"
      ? "vh"
      : suffix === "w"
      ? "pw"
      : suffix === "h"
      ? "ph"
      : "cell";
    terms.push({ unit, value: sign * number });
    sign = 1;
    expectTerm = false;
  }
  if (expectTerm || terms.length === 0 || terms.length > LAYOUT_CALC_TERM_LIMIT) return undefined;
  return { unit: "calc", value: 0, terms };
}

function parseAspectRatio(value: string): { valid: boolean; value?: number } {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "auto") return { valid: true, value: undefined };
  const parts = trimmed.split("/").map((part) => part.trim());
  if (parts.length < 1 || parts.length > 2 || parts.some((part) => !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(part))) {
    return { valid: false };
  }
  const numerator = Number.parseFloat(parts[0]!);
  const denominator = parts.length === 2 ? Number.parseFloat(parts[1]!) : 1;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
    return { valid: false };
  }
  return { valid: true, value: numerator / denominator };
}

/** Parses a CSS-grid track list into terminal-cell layout lengths. */
export function parseGridTrackList(
  value: string | undefined,
  fallback: readonly LayoutLengthValue[] = [],
): LayoutLengthValue[] {
  return parseGridTemplateTrackList(value, { tracks: cloneLayoutLengths(fallback) }).tracks;
}

/**
 * The accessibility contract for dense placement: backfill is VISUAL
 * only. Document order, focus order, and screen-reader order remain the
 * source order deterministically — dense never reorders children, it
 * only chooses which grid cell each auto-placed child renders into.
 */
export const GRID_DENSE_PLACEMENT_SEMANTICS = Object.freeze({
  visualOnly: true,
  documentOrder: "source order, always",
  focusOrder: "source order, always",
  guidance: "Use dense only where visual position does not encode meaning; " +
    "readers and keyboard users traverse the source order.",
});

/** One `repeat(auto-fill|auto-fit, …)` template segment. */
export interface LayoutGridAutoRepeat {
  mode: "auto-fill" | "auto-fit";
  tracks: LayoutLengthValue[];
  /** Track index in the parsed template where the repeat expands. */
  insertAt: number;
}

/** A parsed track template: explicit tracks plus one optional auto repeat. */
export interface LayoutGridTrackTemplate {
  tracks: LayoutLengthValue[];
  autoRepeat?: LayoutGridAutoRepeat;
  /** Names at each line: `lineNames[i]` sits before track `i`. */
  lineNames?: string[][];
}

/**
 * Parses a track list INCLUDING `repeat()`. Numeric repeats expand in
 * place (capped at 256); at most one `repeat(auto-fill|auto-fit, …)` is
 * recorded for the solver to expand against the real axis size. A second
 * auto repeat or a nested repeat refuses the whole list.
 */
export function parseGridTemplateTrackList(
  value: string | undefined,
  fallback: LayoutGridTrackTemplate = { tracks: [] },
): LayoutGridTrackTemplate {
  if (value === undefined) {
    return {
      tracks: cloneLayoutLengths(fallback.tracks),
      ...(fallback.autoRepeat
        ? {
          autoRepeat: {
            mode: fallback.autoRepeat.mode,
            tracks: cloneLayoutLengths(fallback.autoRepeat.tracks),
            insertAt: fallback.autoRepeat.insertAt,
          },
        }
        : {}),
    };
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "none") return { tracks: [] };
  const tracks: LayoutLengthValue[] = [];
  const lineNames: string[][] = [];
  let sawName = false;
  let autoRepeat: LayoutGridAutoRepeat | undefined;
  const nameAt = (index: number): string[] => {
    while (lineNames.length <= index) lineNames.push([]);
    return lineNames[index]!;
  };
  for (const token of tokenizeGridTrackList(trimmed)) {
    if (token.startsWith("[") && token.endsWith("]")) {
      const names = token.slice(1, -1).split(/\s+/).filter((name) => /^[a-z_][\w-]*$/.test(name));
      if (names.length > 0) {
        sawName = true;
        nameAt(tracks.length).push(...names);
      }
      continue;
    }
    if (!token.startsWith("repeat(")) {
      tracks.push(parseLayoutLength(token, autoLength()));
      continue;
    }
    if (!token.endsWith(")")) return { tracks: cloneLayoutLengths(fallback.tracks) };
    const body = token.slice("repeat(".length, -1);
    const comma = body.indexOf(",");
    if (comma < 0 || body.includes("repeat(")) return { tracks: cloneLayoutLengths(fallback.tracks) };
    const countText = body.slice(0, comma).trim();
    const repeated = tokenizeGridTrackList(body.slice(comma + 1).trim())
      .map((inner) => parseLayoutLength(inner, autoLength()));
    if (repeated.length === 0) return { tracks: cloneLayoutLengths(fallback.tracks) };
    if (countText === "auto-fill" || countText === "auto-fit") {
      if (autoRepeat) return { tracks: cloneLayoutLengths(fallback.tracks) };
      autoRepeat = { mode: countText, tracks: repeated, insertAt: tracks.length };
      continue;
    }
    const count = Math.floor(Number.parseFloat(countText));
    if (!Number.isFinite(count) || count < 0) return { tracks: cloneLayoutLengths(fallback.tracks) };
    const bounded = Math.min(count, 256);
    for (let repetition = 0; repetition < bounded; repetition += 1) {
      for (const track of repeated) tracks.push(cloneLayoutLength(track));
    }
  }
  if (sawName) nameAt(tracks.length);
  return { tracks, ...(autoRepeat ? { autoRepeat } : {}), ...(sawName ? { lineNames } : {}) };
}

/**
 * Resolves one named template area to its track rectangle. Shared by
 * every solver adapter so template-area behavior stays backend-neutral;
 * a non-rectangular area refuses rather than guessing.
 */
export function resolveGridTemplateArea(
  areas: readonly (readonly string[])[],
  name: string,
): { column: number; row: number; columnSpan: number; rowSpan: number } | undefined {
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = -1;
  for (const [row, cells] of areas.entries()) {
    for (const [column, cell] of cells.entries()) {
      if (cell !== name) continue;
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minColumn = Math.min(minColumn, column);
      maxColumn = Math.max(maxColumn, column);
    }
  }
  if (maxRow < 0 || maxColumn < 0) return undefined;
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (areas[row]?.[column] !== name) return undefined;
    }
  }
  return {
    column: minColumn,
    row: minRow,
    columnSpan: maxColumn - minColumn + 1,
    rowSpan: maxRow - minRow + 1,
  };
}

/**
 * Resolves a placement's named lines to numeric lines. Explicit
 * `[name]` declarations win; template areas contribute the implicit
 * `<area>-start`/`<area>-end` lines, and a bare area name means the
 * area's own extent, exactly as in CSS.
 */
export function resolveNamedGridPlacement(
  placement: LayoutGridPlacement,
  lineNames: readonly (readonly string[])[] | undefined,
  areas: readonly (readonly string[])[],
  axis: "column" | "row",
): LayoutGridPlacement {
  if (placement.startName === undefined && placement.endName === undefined) return placement;
  const lineFor = (name: string, edge: "start" | "end"): number | undefined => {
    if (lineNames) {
      for (let index = 0; index < lineNames.length; index += 1) {
        if (lineNames[index]!.includes(name)) return index + 1;
      }
    }
    const explicit = name.endsWith("-start") || name.endsWith("-end");
    const base = explicit ? name.replace(/-(start|end)$/, "") : name;
    const area = resolveGridTemplateArea(areas, base);
    if (!area) return undefined;
    const start = axis === "column" ? area.column + 1 : area.row + 1;
    const span = axis === "column" ? area.columnSpan : area.rowSpan;
    const wantsEnd = explicit ? name.endsWith("-end") : edge === "end";
    return wantsEnd ? start + span : start;
  };
  const resolved: LayoutGridPlacement = { ...placement };
  if (placement.startName !== undefined) {
    const line = lineFor(placement.startName, "start");
    if (line !== undefined) resolved.start = line;
    delete resolved.startName;
  }
  if (placement.endName !== undefined) {
    const line = lineFor(placement.endName, "end");
    if (line !== undefined) resolved.end = line;
    delete resolved.endName;
  }
  if (resolved.start !== undefined && resolved.end !== undefined && resolved.end > resolved.start) {
    resolved.span = resolved.end - resolved.start;
  }
  return resolved;
}

function parseGridTemplateAreas(
  value: string | undefined,
  fallback: readonly (readonly string[])[] = [],
): string[][] {
  if (value === undefined) return cloneGridAreas(fallback);
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return [];

  const rows: string[][] = [];
  for (const match of trimmed.matchAll(/"([^"]*)"|'([^']*)'/g)) {
    const source = (match[1] ?? match[2] ?? "").trim();
    if (!source) return cloneGridAreas(fallback);
    const cells = splitCssWords(source);
    for (const cell of cells) {
      if (cell !== "." && !/^[A-Za-z_][\w-]*$/.test(cell)) return cloneGridAreas(fallback);
    }
    rows.push(cells);
  }

  if (rows.length === 0) return cloneGridAreas(fallback);
  const width = rows[0]?.length ?? 0;
  if (width === 0) return cloneGridAreas(fallback);
  for (const row of rows) {
    if (row.length !== width) return cloneGridAreas(fallback);
  }
  return rows;
}

/** Parses a CSS-grid line placement shorthand. */
export function parseGridPlacement(
  value: string | undefined,
  fallback: LayoutGridPlacement = {},
): LayoutGridPlacement {
  if (value === undefined) return { ...fallback };
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "auto") return {};

  const slash = trimmed.indexOf("/");
  const startPart = slash < 0 ? trimmed : trimmed.slice(0, slash).trim();
  const endPart = slash < 0 ? "" : trimmed.slice(slash + 1).trim();
  const placement: LayoutGridPlacement = {};
  const startSpan = parseGridSpan(startPart);
  const startLine = parsePositiveInteger(startPart);

  if (startSpan !== undefined) {
    placement.span = startSpan;
  } else if (startLine !== undefined) {
    placement.start = startLine;
  }

  const namePattern = /^[a-z_][\w-]*$/;
  if (
    placement.start === undefined && placement.span === undefined &&
    startPart !== "auto" && namePattern.test(startPart)
  ) {
    placement.startName = startPart;
  }

  const endSpan = parseGridSpan(endPart);
  const endLine = parsePositiveInteger(endPart);
  if (endSpan !== undefined) {
    placement.span = endSpan;
  } else if (placement.start !== undefined && endLine !== undefined) {
    placement.end = endLine;
    placement.span = Math.max(1, endLine - placement.start);
  } else if (endLine !== undefined) {
    placement.end = endLine;
  } else if (endPart && endPart !== "auto" && namePattern.test(endPart)) {
    placement.endName = endPart;
  }

  if (placement.start === undefined && placement.span === undefined && placement.startName === undefined) {
    return { ...fallback };
  }
  return placement;
}

function parseGridAreaName(value: string | undefined, fallback?: string): string | undefined {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "auto") return undefined;
  if (trimmed.includes("/")) return fallback;
  return /^[A-Za-z_][\w-]*$/.test(trimmed) ? trimmed : fallback;
}

/** Parses a non-negative terminal-cell integer. */
export function parseLayoutInteger(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

/** Signed whole-cell offset component; undefined on junk so shorthands fail closed. */
function parseSignedOffsetCells(value: string | undefined): number | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed || !/^[+-]?\d+(?:ch|cells?)?$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseHorizontalAlign(value: string): LayoutHorizontalAlign | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized === "left" || normalized === "center" || normalized === "right" ? normalized : undefined;
}

function parseVerticalAlign(value: string): LayoutVerticalAlign | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized === "top" || normalized === "middle" || normalized === "bottom" ? normalized : undefined;
}

function stripCssQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (trimmed[0] === '"' || trimmed[0] === "'") && trimmed.at(-1) === trimmed[0]) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseOpacityValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^[+]?\d*\.?\d+%?$/.test(trimmed)) return undefined;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  const scaled = trimmed.endsWith("%") ? parsed / 100 : parsed;
  return Math.min(1, Math.max(0, scaled));
}

function parseHatchValue(value: string): LayoutHatch | undefined {
  const words = splitCssWords(value);
  if (words.length === 0 || words.length > 2) return undefined;
  const [pattern, color] = words;
  const named = LAYOUT_HATCH_PATTERNS[pattern!.toLowerCase()];
  const raw = named ?? pattern!.replace(/^["']|["']$/g, "");
  // The fill must be exactly one narrow grapheme; multi-cell fills would
  // desynchronize the hatch from the cell grid.
  if ([...raw].length !== 1) return undefined;
  return { glyph: raw, color: color || undefined };
}

function parseSignedLayoutInteger(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

/** Expands one-to-four CSS box values into top, right, bottom, and left edges. */
export function parseBoxEdges(
  value: string | undefined,
  fallback: BoxEdges<number> = ZERO_BOX_EDGES,
): BoxEdges<number> {
  if (value === undefined) return { ...fallback };
  const words = splitCssWords(value.trim());
  const parts = new Array<number>(words.length);
  for (let index = 0; index < words.length; index += 1) {
    parts[index] = parseLayoutInteger(words[index], 0);
  }
  if (parts.length === 0) return { ...fallback };
  const [top, right = top, bottom = top, left = right] = parts;
  return { top: top ?? 0, right: right ?? 0, bottom: bottom ?? 0, left: left ?? 0 };
}

/** Applies one CSS-like declaration to a computed style. */
export function applyLayoutDeclaration(
  style: ComputedLayoutStyle,
  property: string,
  value: string,
): ComputedLayoutStyle {
  const next = cloneComputedLayoutStyle(style);
  const normalized = property.trim().toLowerCase();
  const resolved = value.trim();

  if (normalized.startsWith("--")) {
    next.variables[normalized] = resolved;
    return next;
  }

  switch (normalized) {
    case "display":
      next.display = parseOneOf(resolved, ["block", "flex", "grid", "none"], next.display);
      break;
    case "position":
      next.position = parseOneOf(resolved, ["relative", "absolute"], next.position);
      break;
    case "flex-direction":
      next.flexDirection = parseOneOf(
        resolved,
        ["row", "row-reverse", "column", "column-reverse"],
        next.flexDirection,
      );
      break;
    case "flex-wrap":
      next.flexWrap = parseOneOf(resolved, ["nowrap", "wrap", "wrap-reverse"], next.flexWrap);
      break;
    case "flex-flow":
      applyFlexFlowShorthand(next, resolved);
      break;
    case "flex-grow":
      next.flexGrow = nonNegativeFloat(resolved, next.flexGrow);
      break;
    case "flex-shrink":
      next.flexShrink = nonNegativeFloat(resolved, next.flexShrink);
      break;
    case "flex-basis":
      next.flexBasis = parseLayoutLength(resolved, next.flexBasis);
      break;
    case "flex":
      applyFlexShorthand(next, resolved);
      break;
    case "order":
      next.order = parseSignedLayoutInteger(resolved, next.order);
      break;
    case "align-items":
      next.alignItems = normalizeAlignItems(resolved, next.alignItems);
      break;
    case "align-content":
      next.alignContent = normalizeAlignContent(resolved, next.alignContent);
      break;
    case "justify-content":
      next.justifyContent = normalizeJustifyContent(resolved, next.justifyContent);
      break;
    case "align-self":
      next.alignSelf = normalizeSelfAlignment(resolved, next.alignSelf);
      break;
    case "justify-self":
      next.justifySelf = normalizeSelfAlignment(resolved, next.justifySelf);
      break;
    case "place-self":
      applyPlaceSelfShorthand(next, resolved);
      break;
    case "grid-template-columns": {
      const template = parseGridTemplateTrackList(resolved, {
        tracks: next.gridTemplateColumns,
        ...(next.gridTemplateColumnsAutoRepeat ? { autoRepeat: next.gridTemplateColumnsAutoRepeat } : {}),
      });
      next.gridTemplateColumns = template.tracks;
      if (template.autoRepeat) next.gridTemplateColumnsAutoRepeat = template.autoRepeat;
      else delete next.gridTemplateColumnsAutoRepeat;
      if (template.lineNames) next.gridTemplateColumnsLineNames = template.lineNames;
      else delete next.gridTemplateColumnsLineNames;
      break;
    }
    case "grid-template-rows": {
      const template = parseGridTemplateTrackList(resolved, {
        tracks: next.gridTemplateRows,
        ...(next.gridTemplateRowsAutoRepeat ? { autoRepeat: next.gridTemplateRowsAutoRepeat } : {}),
      });
      next.gridTemplateRows = template.tracks;
      if (template.autoRepeat) next.gridTemplateRowsAutoRepeat = template.autoRepeat;
      else delete next.gridTemplateRowsAutoRepeat;
      if (template.lineNames) next.gridTemplateRowsLineNames = template.lineNames;
      else delete next.gridTemplateRowsLineNames;
      break;
    }
    case "grid-template-areas":
      next.gridTemplateAreas = parseGridTemplateAreas(resolved, next.gridTemplateAreas);
      break;
    case "grid-auto-columns":
      next.gridAutoColumns = parseLayoutLength(resolved, next.gridAutoColumns);
      break;
    case "grid-auto-rows":
      next.gridAutoRows = parseLayoutLength(resolved, next.gridAutoRows);
      break;
    case "grid-auto-flow": {
      const words = resolved.trim().toLowerCase().split(/\s+/);
      const flow = words.find((word) => word === "row" || word === "column");
      const dense = words.includes("dense");
      if (!flow && !dense) break;
      if (flow) next.gridAutoFlow = flow as LayoutGridAutoFlow;
      next.gridAutoFlowDense = dense;
      break;
    }
    case "grid-column":
      next.gridColumn = parseGridPlacement(resolved, next.gridColumn);
      break;
    case "grid-row":
      next.gridRow = parseGridPlacement(resolved, next.gridRow);
      break;
    case "grid-column-start":
      next.gridColumn = applyGridPlacementLonghand(next.gridColumn, "start", resolved);
      break;
    case "grid-column-end":
      next.gridColumn = applyGridPlacementLonghand(next.gridColumn, "end", resolved);
      break;
    case "grid-row-start":
      next.gridRow = applyGridPlacementLonghand(next.gridRow, "start", resolved);
      break;
    case "grid-row-end":
      next.gridRow = applyGridPlacementLonghand(next.gridRow, "end", resolved);
      break;
    case "grid-area":
      next.gridArea = parseGridAreaName(resolved, next.gridArea);
      break;
    case "width":
      next.width = parseLayoutLength(resolved, next.width);
      break;
    case "height":
      next.height = parseLayoutLength(resolved, next.height);
      break;
    case "min-width":
      next.minWidth = parseLayoutLength(resolved, next.minWidth);
      break;
    case "min-height":
      next.minHeight = parseLayoutLength(resolved, next.minHeight);
      break;
    case "max-width":
      next.maxWidth = parseLayoutLength(resolved, next.maxWidth);
      break;
    case "max-height":
      next.maxHeight = parseLayoutLength(resolved, next.maxHeight);
      break;
    case "aspect-ratio":
      {
        const ratio = parseAspectRatio(resolved);
        if (ratio.valid) next.aspectRatio = ratio.value;
      }
      break;
    case "box-sizing":
      next.boxSizing = parseOneOf(
        resolved,
        ["content-box", "border-box"] as const,
        next.boxSizing ?? "border-box",
      );
      break;
    case "inset":
      next.inset = parseBoxEdgeLengths(resolved, next.inset);
      break;
    case "top":
    case "right":
    case "bottom":
    case "left":
      {
        const edge = normalized as keyof BoxEdges<LayoutLengthValue>;
        next.inset = applyBoxEdgeLength(next.inset, edge, parseLayoutLength(resolved, next.inset[edge]));
      }
      break;
    case "margin":
      applyLengthBoxShorthand(next, "margin", resolved, true);
      break;
    case "margin-top":
    case "margin-right":
    case "margin-bottom":
    case "margin-left":
      applyLengthBoxLonghand(next, "margin", normalized.slice("margin-".length), resolved, true);
      break;
    case "padding":
      applyLengthBoxShorthand(next, "padding", resolved, false);
      break;
    case "padding-top":
    case "padding-right":
    case "padding-bottom":
    case "padding-left":
      applyLengthBoxLonghand(next, "padding", normalized.slice("padding-".length), resolved, false);
      break;
    case "border":
      applyBorderShorthand(next, resolved);
      break;
    case "border-width":
      next.border = parseBoxEdges(resolved, next.border);
      break;
    case "border-top":
    case "border-right":
    case "border-bottom":
    case "border-left":
      next.border = applyBoxEdge(next.border, normalized.slice("border-".length), parseLayoutInteger(resolved, 1));
      break;
    case "border-style":
      next.borderStyle = resolved || next.borderStyle;
      break;
    case "border-color":
      next.borderColor = resolved || next.borderColor;
      break;
    case "gap":
      applyGapShorthand(next, resolved);
      break;
    case "row-gap":
      applyGapLonghand(next, "row", resolved);
      break;
    case "column-gap":
      applyGapLonghand(next, "column", resolved);
      break;
    case "overflow":
      next.overflowX = parseOneOf(resolved, ["visible", "hidden", "auto", "scroll"], next.overflowX);
      next.overflowY = next.overflowX;
      break;
    case "overflow-x":
      next.overflowX = parseOneOf(resolved, ["visible", "hidden", "auto", "scroll"], next.overflowX);
      break;
    case "overflow-y":
      next.overflowY = parseOneOf(resolved, ["visible", "hidden", "auto", "scroll"], next.overflowY);
      break;
    case "z-index":
      next.zIndex = Math.floor(Number.parseFloat(resolved)) || 0;
      break;
    case "offset": {
      const parts = resolved.split(/\s+/);
      if (parts.length !== 2) return style;
      const x = parseSignedOffsetCells(parts[0]);
      const y = parseSignedOffsetCells(parts[1]);
      if (x === undefined || y === undefined) return style;
      next.offsetX = x;
      next.offsetY = y;
      break;
    }
    case "offset-x": {
      const x = parseSignedOffsetCells(resolved);
      if (x === undefined) return style;
      next.offsetX = x;
      break;
    }
    case "offset-y": {
      const y = parseSignedOffsetCells(resolved);
      if (y === undefined) return style;
      next.offsetY = y;
      break;
    }
    case "dock": {
      if (resolved === "none") {
        next.dock = undefined;
        break;
      }
      const dock = resolved.trim().toLowerCase();
      if (dock !== "top" && dock !== "right" && dock !== "bottom" && dock !== "left") return style;
      next.dock = dock;
      break;
    }
    case "layers": {
      if (resolved === "none") {
        next.layers = undefined;
        break;
      }
      const names = splitCssWords(resolved).slice(0, 8);
      if (names.length === 0 || names.some((name) => !/^[A-Za-z][\w-]*$/.test(name))) return style;
      next.layers = names;
      break;
    }
    case "layer": {
      if (resolved === "none") {
        next.layer = undefined;
        break;
      }
      if (!/^[A-Za-z][\w-]*$/.test(resolved.trim())) return style;
      next.layer = resolved.trim();
      break;
    }
    case "align": {
      const parts = splitCssWords(resolved);
      if (parts.length !== 2) return style;
      const horizontal = parseHorizontalAlign(parts[0]!);
      const vertical = parseVerticalAlign(parts[1]!);
      if (!horizontal || !vertical) return style;
      next.alignHorizontal = horizontal;
      next.alignVertical = vertical;
      break;
    }
    case "align-horizontal": {
      const horizontal = parseHorizontalAlign(resolved);
      if (!horizontal) return style;
      next.alignHorizontal = horizontal;
      break;
    }
    case "align-vertical": {
      const vertical = parseVerticalAlign(resolved);
      if (!vertical) return style;
      next.alignVertical = vertical;
      break;
    }
    case "scrollbar-color":
      next.scrollbarColor = resolved || undefined;
      break;
    case "scrollbar-background":
      next.scrollbarBackgroundColor = resolved || undefined;
      break;
    case "scrollbar-size": {
      const size = Number.parseInt(resolved, 10);
      if (!Number.isFinite(size) || size < 1) return style;
      next.scrollbarSize = Math.min(4, size);
      break;
    }
    case "border-title":
      next.borderTitle = stripCssQuotes(resolved) || undefined;
      break;
    case "border-subtitle":
      next.borderSubtitle = stripCssQuotes(resolved) || undefined;
      break;
    case "border-title-align":
      next.borderTitleAlign = parseHorizontalAlign(resolved) ?? next.borderTitleAlign;
      break;
    case "border-subtitle-align":
      next.borderSubtitleAlign = parseHorizontalAlign(resolved) ?? next.borderSubtitleAlign;
      break;
    case "opacity": {
      const opacity = parseOpacityValue(resolved);
      if (opacity === undefined) return style;
      next.opacity = opacity;
      break;
    }
    case "tint":
      next.tint = resolved === "none" ? undefined : resolved || undefined;
      break;
    case "hatch": {
      if (resolved === "none") {
        next.hatch = undefined;
        break;
      }
      const hatch = parseHatchValue(resolved);
      if (hatch === undefined) return style;
      next.hatch = hatch;
      break;
    }
    case "color":
      next.color = resolved || undefined;
      break;
    case "background":
    case "background-color":
      next.backgroundColor = resolved || undefined;
      break;
    case "visibility":
      next.visibility = parseOneOf(resolved, ["visible", "hidden"], next.visibility);
      break;
    case "white-space":
      next.whiteSpace = parseOneOf(resolved, ["normal", "nowrap", "pre", "pre-wrap"], next.whiteSpace);
      break;
    case "overflow-wrap":
    case "word-wrap":
      next.overflowWrap = parseOneOf(resolved, ["normal", "anywhere", "break-word"], next.overflowWrap);
      break;
  }

  return next;
}

/** Applies multiple CSS-like declarations to a computed style. */
export function applyLayoutDeclarations(
  style: ComputedLayoutStyle,
  declarations: Iterable<readonly [property: string, value: string]>,
): ComputedLayoutStyle {
  let next = style;
  for (const [property, value] of declarations) {
    next = applyLayoutDeclaration(next, property, value);
  }
  return next;
}

function applyFlexShorthand(style: ComputedLayoutStyle, value: string): void {
  const parts = splitCssWords(value);
  if (parts.length === 1) {
    if (parts[0] === "none") {
      style.flexGrow = 0;
      style.flexShrink = 0;
      style.flexBasis = autoLength();
      return;
    }
    if (parts[0] === "auto") {
      style.flexGrow = 1;
      style.flexShrink = 1;
      style.flexBasis = autoLength();
      return;
    }
    style.flexGrow = nonNegativeFloat(parts[0]!, style.flexGrow);
    return;
  }
  style.flexGrow = nonNegativeFloat(parts[0]!, style.flexGrow);
  style.flexShrink = nonNegativeFloat(parts[1]!, style.flexShrink);
  if (parts[2]) style.flexBasis = parseLayoutLength(parts[2], style.flexBasis);
}

function applyFlexFlowShorthand(style: ComputedLayoutStyle, value: string): void {
  for (const part of splitCssWords(value)) {
    style.flexDirection = parseOneOf(
      part,
      ["row", "row-reverse", "column", "column-reverse"],
      style.flexDirection,
    );
    style.flexWrap = parseOneOf(part, ["nowrap", "wrap", "wrap-reverse"], style.flexWrap);
  }
}

function applyBorderShorthand(style: ComputedLayoutStyle, value: string): void {
  const parts = splitCssWords(value);
  let width: string | undefined;
  let color: string | undefined;
  let stylePart: string | undefined;
  for (const part of parts) {
    if (width === undefined && /^-?\d+(\.\d+)?/.test(part)) width = part;
    if (color === undefined && (part.startsWith("#") || part.startsWith("rgb") || part.startsWith("var("))) {
      color = part;
    }
    if (stylePart === undefined && ["none", "single", "double", "solid", "round", "heavy"].includes(part)) {
      stylePart = part;
    }
  }
  if (width) style.border = parseBoxEdges(width, style.border);
  else if (value.trim() && value.trim() !== "none") style.border = parseBoxEdges("1", style.border);
  if (color) style.borderColor = color;
  if (stylePart) style.borderStyle = stylePart;
}

function tokenizeGridTrackList(value: string): string[] {
  // calc(...) contains spaces; keep each parenthesized group one token so a
  // track list like "25vw calc(100% - 30) 1fr" splits into three tracks.
  // [name lists] likewise stay one token for the line-name pass.
  const tokens: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseGridSpan(value: string): number | undefined {
  const match = value.match(/^span\s+(\d+)$/);
  if (!match) return undefined;
  return Math.max(1, Math.floor(Number.parseFloat(match[1]!)));
}

function parsePositiveInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Math.floor(Number.parseFloat(value));
  return parsed > 0 ? parsed : undefined;
}

function applyGridPlacementLonghand(
  placement: LayoutGridPlacement,
  edge: "start" | "end",
  value: string,
): LayoutGridPlacement {
  const trimmed = value.trim().toLowerCase();
  const next = { ...placement };
  if (!trimmed || trimmed === "auto") {
    delete next[edge];
    if (next.start === undefined || next.end === undefined) delete next.span;
    return next;
  }

  const span = parseGridSpan(trimmed);
  if (span !== undefined) {
    next.span = span;
    return next;
  }

  const line = parsePositiveInteger(trimmed);
  if (line === undefined) return next;
  next[edge] = line;
  if (next.start !== undefined && next.end !== undefined) next.span = Math.max(1, next.end - next.start);
  return next;
}

function applyBoxEdge(edges: BoxEdges<number>, edge: string, value: number): BoxEdges<number> {
  const next = { ...edges };
  if (edge === "top" || edge === "right" || edge === "bottom" || edge === "left") {
    next[edge] = value;
  }
  return next;
}

function authoredLayoutLengths(style: ComputedLayoutStyle): AuthoredLayoutLengths | undefined {
  return (style as StyleWithAuthoredLayoutLengths).__layoutLengths;
}

function mutableAuthoredLayoutLengths(style: ComputedLayoutStyle): AuthoredLayoutLengths {
  const internal = style as StyleWithAuthoredLayoutLengths;
  return internal.__layoutLengths ??= {};
}

function applyLengthBoxShorthand(
  style: ComputedLayoutStyle,
  property: "margin" | "padding",
  value: string,
  allowAuto: boolean,
): void {
  const parsed = parseLengthBox(value, allowAuto);
  if (!parsed) return;
  const authored = mutableAuthoredLayoutLengths(style);
  if (property === "margin") {
    authored.margin = parsed;
    style.margin = legacyCellEdges(parsed);
  } else {
    authored.padding = parsed;
    style.padding = legacyCellEdges(parsed);
  }
}

function applyLengthBoxLonghand(
  style: ComputedLayoutStyle,
  property: "margin" | "padding",
  edgeName: string,
  value: string,
  allowAuto: boolean,
): void {
  if (edgeName !== "top" && edgeName !== "right" && edgeName !== "bottom" && edgeName !== "left") return;
  const parsed = tryParseLayoutLength(value);
  if (!parsed || parsed.unit === "fr" || !allowAuto && parsed.unit === "auto") return;
  const edge = edgeName as keyof BoxEdges<LayoutLengthValue>;
  const authored = mutableAuthoredLayoutLengths(style);
  if (property === "margin") {
    const lengths = authored.margin ?? lengthEdgesFromCells(style.margin);
    authored.margin = applyBoxEdgeLength(lengths, edge, parsed);
    style.margin = applyBoxEdge(style.margin, edge, legacyCellValue(parsed));
  } else {
    const lengths = authored.padding ?? lengthEdgesFromCells(style.padding);
    authored.padding = applyBoxEdgeLength(lengths, edge, parsed);
    style.padding = applyBoxEdge(style.padding, edge, legacyCellValue(parsed));
  }
}

function parseLengthBox(value: string, allowAuto: boolean): BoxEdges<LayoutLengthValue> | undefined {
  const words = splitCssWords(value.trim());
  if (words.length < 1 || words.length > 4) return undefined;
  const parts: LayoutLengthValue[] = [];
  for (const word of words) {
    const parsed = tryParseLayoutLength(word);
    if (!parsed || parsed.unit === "fr" || !allowAuto && parsed.unit === "auto") return undefined;
    parts.push(parsed);
  }
  const [top, right = top, bottom = top, left = right] = parts;
  if (!top || !right || !bottom || !left) return undefined;
  return {
    top: { ...top },
    right: { ...right },
    bottom: { ...bottom },
    left: { ...left },
  };
}

function applyGapShorthand(style: ComputedLayoutStyle, value: string): void {
  const words = splitCssWords(value.trim());
  if (words.length < 1 || words.length > 2) return;
  const row = tryParseGap(words[0]!);
  const column = words.length === 2 ? tryParseGap(words[1]!) : row;
  if (!row || !column) return;
  const authored = mutableAuthoredLayoutLengths(style);
  authored.rowGap = { ...row };
  authored.columnGap = { ...column };
  style.rowGap = legacyCellValue(row);
  style.columnGap = legacyCellValue(column);
  style.gap = words.length === 1 ? legacyCellValue(row) : 0;
}

function applyGapLonghand(style: ComputedLayoutStyle, axis: "row" | "column", value: string): void {
  const parsed = tryParseGap(value);
  if (!parsed) return;
  const authored = mutableAuthoredLayoutLengths(style);
  if (axis === "row") {
    authored.rowGap = parsed;
    style.rowGap = legacyCellValue(parsed);
  } else {
    authored.columnGap = parsed;
    style.columnGap = legacyCellValue(parsed);
  }
}

function tryParseGap(value: string): LayoutLengthValue | undefined {
  const parsed = tryParseLayoutLength(value);
  return parsed && (parsed.unit === "cell" || parsed.unit === "percent") ? parsed : undefined;
}

function legacyCellEdges(edges: BoxEdges<LayoutLengthValue>): BoxEdges<number> {
  return {
    top: legacyCellValue(edges.top),
    right: legacyCellValue(edges.right),
    bottom: legacyCellValue(edges.bottom),
    left: legacyCellValue(edges.left),
  };
}

function legacyCellValue(value: LayoutLengthValue): number {
  return value.unit === "cell" ? value.value : 0;
}

function lengthEdgesFromCells(edges: BoxEdges<number>): BoxEdges<LayoutLengthValue> {
  return {
    top: cellLength(edges.top),
    right: cellLength(edges.right),
    bottom: cellLength(edges.bottom),
    left: cellLength(edges.left),
  };
}

function parseBoxEdgeLengths(
  value: string | undefined,
  fallback: BoxEdges<LayoutLengthValue>,
): BoxEdges<LayoutLengthValue> {
  if (value === undefined) return cloneBoxEdgeLengths(fallback);
  const words = splitCssWords(value.trim());
  if (words.length < 1 || words.length > 4) return cloneBoxEdgeLengths(fallback);
  const parts = new Array<LayoutLengthValue>(words.length);
  for (let index = 0; index < words.length; index += 1) {
    const parsed = tryParseLayoutLength(words[index]!);
    if (!parsed) return cloneBoxEdgeLengths(fallback);
    parts[index] = parsed;
  }
  const [top, right = top, bottom = top, left = right] = parts;
  return {
    top: top ? { ...top } : autoLength(),
    right: right ? { ...right } : autoLength(),
    bottom: bottom ? { ...bottom } : autoLength(),
    left: left ? { ...left } : autoLength(),
  };
}

function applyBoxEdgeLength(
  edges: BoxEdges<LayoutLengthValue>,
  edge: keyof BoxEdges<LayoutLengthValue>,
  value: LayoutLengthValue,
): BoxEdges<LayoutLengthValue> {
  return {
    top: edge === "top" ? { ...value } : { ...edges.top },
    right: edge === "right" ? { ...value } : { ...edges.right },
    bottom: edge === "bottom" ? { ...value } : { ...edges.bottom },
    left: edge === "left" ? { ...value } : { ...edges.left },
  };
}

function cloneLayoutLength(value: LayoutLengthValue): LayoutLengthValue {
  const clone: LayoutLengthValue = value.terms
    ? { ...value, terms: value.terms.map((term) => ({ ...term })) }
    : { ...value };
  if (value.minTrack) clone.minTrack = cloneLayoutLength(value.minTrack);
  if (value.maxTrack) clone.maxTrack = cloneLayoutLength(value.maxTrack);
  if (value.limitTrack) clone.limitTrack = cloneLayoutLength(value.limitTrack);
  return clone;
}

function cloneBoxEdgeLengths(edges: BoxEdges<LayoutLengthValue>): BoxEdges<LayoutLengthValue> {
  return {
    top: cloneLayoutLength(edges.top),
    right: cloneLayoutLength(edges.right),
    bottom: cloneLayoutLength(edges.bottom),
    left: cloneLayoutLength(edges.left),
  };
}

function normalizeAlignItems(value: string, fallback: LayoutAlignItems): LayoutAlignItems {
  const normalized = value === "flex-start" ? "start" : value === "flex-end" ? "end" : value;
  return parseOneOf(normalized, ["start", "end", "center", "stretch"], fallback);
}

function normalizeAlignContent(value: string, fallback: LayoutAlignContent): LayoutAlignContent {
  const normalized = value === "flex-start" ? "start" : value === "flex-end" ? "end" : value;
  return parseOneOf(
    normalized,
    ["start", "end", "center", "stretch", "space-between", "space-around", "space-evenly"],
    fallback,
  );
}

function normalizeJustifyContent(value: string, fallback: LayoutJustifyContent): LayoutJustifyContent {
  const normalized = value === "flex-start" ? "start" : value === "flex-end" ? "end" : value;
  return parseOneOf(
    normalized,
    ["start", "end", "center", "space-between", "space-around", "space-evenly"],
    fallback,
  );
}

function normalizeSelfAlignment(value: string, fallback: LayoutSelfAlignment): LayoutSelfAlignment {
  const normalized = value === "flex-start"
    ? "start"
    : value === "flex-end"
    ? "end"
    : value === "auto"
    ? fallback
    : value;
  return parseOneOf(normalized, ["start", "end", "center", "stretch"], fallback);
}

function applyPlaceSelfShorthand(style: ComputedLayoutStyle, value: string): void {
  const parts = splitCssWords(value);
  const align = parts[0];
  const justify = parts[1] ?? align;
  if (align) style.alignSelf = normalizeSelfAlignment(align, style.alignSelf);
  if (justify) style.justifySelf = normalizeSelfAlignment(justify, style.justifySelf);
}

function parseOneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized as T) ? normalized as T : fallback;
}

function nonNegativeFloat(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function cloneLayoutLengths(values: readonly LayoutLengthValue[]): LayoutLengthValue[] {
  const clone = new Array<LayoutLengthValue>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    clone[index] = cloneLayoutLength(values[index]!);
  }
  return clone;
}

function cloneGridAreas(values: readonly (readonly string[])[]): string[][] {
  const clone = new Array<string[]>(values.length);
  for (let row = 0; row < values.length; row += 1) {
    const source = values[row]!;
    const target = new Array<string>(source.length);
    for (let column = 0; column < source.length; column += 1) {
      target[column] = source[column]!;
    }
    clone[row] = target;
  }
  return clone;
}

function firstCssWord(value: string): string | undefined {
  const words = splitCssWords(value);
  return words[0];
}

function splitCssWords(value: string): string[] {
  const words: string[] = [];
  let start = -1;
  for (let index = 0; index <= value.length; index += 1) {
    const atEnd = index === value.length;
    const whitespace = !atEnd && /\s/.test(value[index]!);
    if (!atEnd && !whitespace && start < 0) start = index;
    if ((atEnd || whitespace) && start >= 0) {
      words.push(value.slice(start, index));
      start = -1;
    }
  }
  return words;
}
