// Copyright 2023 Im-Beast. MIT license.

// 036 L2: the real Taffy WASM adapter over the maintained npm
// distribution (taffy-layout, pinned in deno.jsonc). This is the
// spike's missing candidate: flex, grid, and block solve inside
// Taffy's own algorithms while text leaves measure through the same
// terminal-cell metrics every other solver uses, results project onto
// integer cells, and each solve builds and FREES its tree — no Taffy
// handle survives into public API. The mapped subset is explicit:
// display, sizes and min/max (cell/percent/auto), margin/padding/
// border/gap, flex direction/wrap/grow/shrink/basis, align/justify,
// grid templates (cell/percent/fr/auto/minmax and content keywords),
// and line-based grid placement. Everything else keeps its
// ComputedLayoutStyle default and is the simple solver's business.

import {
  AlignItems,
  Display,
  FlexDirection,
  FlexWrap,
  JustifyContent,
  loadTaffy,
  Style as TaffyStyle,
  TaffyTree,
} from "taffy-layout";
import type { Rectangle } from "../../types.ts";
import { insetRectangleByEdges, normalizeRectangle } from "../../utils/rectangles.ts";
import { TAFFY_LAYOUT_SOLVER_CAPABILITIES } from "../capabilities.ts";
import type { LayoutSolverCapabilities } from "../capabilities.ts";
import { measureTerminalTextIntrinsic } from "../measurement.ts";
import type { ComputedLayoutStyle, LayoutLengthValue } from "../style.ts";
import {
  type ComputedLayoutBox,
  computedLayoutBoxOverflow,
  flattenComputedLayoutBoxes,
  type LayoutNode,
  type LayoutSolver,
  type LayoutSolverInput,
  type LayoutSolverResult,
  mapLayoutBoxes,
} from "../solver.ts";

await loadTaffy();

type TaffyDimension = number | `${number}%` | "auto";
type TaffyTrackBound = number | `${number}%` | "auto" | "min-content" | "max-content";

function dimension(length: LayoutLengthValue): TaffyDimension {
  if (length.unit === "cell") return Math.max(0, Math.floor(length.value));
  if (length.unit === "percent") return `${length.value}%`;
  return "auto";
}

function trackBound(length: LayoutLengthValue | undefined, fallback: TaffyTrackBound): TaffyTrackBound {
  if (!length) return fallback;
  if (length.unit === "cell") return Math.max(0, Math.floor(length.value));
  if (length.unit === "percent") return `${length.value}%`;
  if (length.unit === "min-content" || length.unit === "max-content") return length.unit;
  return "auto";
}

function track(length: LayoutLengthValue): { min: TaffyTrackBound; max: TaffyTrackBound | `${number}fr` } {
  if (length.unit === "fr") return { min: "auto", max: `${Math.max(0, length.value)}fr` };
  if (length.unit === "minmax" && length.minTrack && length.maxTrack) {
    const max = length.maxTrack.unit === "fr"
      ? `${Math.max(0, length.maxTrack.value)}fr` as const
      : trackBound(length.maxTrack, "auto");
    return { min: trackBound(length.minTrack, "auto"), max };
  }
  const bound = trackBound(length, "auto");
  return { min: bound, max: bound };
}

function edgeRect(edges: ComputedLayoutStyle["margin"]): { left: number; right: number; top: number; bottom: number } {
  return { left: edges.left, right: edges.right, top: edges.top, bottom: edges.bottom };
}

function alignItemsFor(style: ComputedLayoutStyle): AlignItems | undefined {
  switch (style.alignItems) {
    case "start":
      return AlignItems.FlexStart;
    case "end":
      return AlignItems.FlexEnd;
    case "center":
      return AlignItems.Center;
    case "stretch":
      return AlignItems.Stretch;
    default:
      return undefined;
  }
}

function justifyFor(style: ComputedLayoutStyle): JustifyContent | undefined {
  switch (style.justifyContent) {
    case "start":
      return JustifyContent.FlexStart;
    case "end":
      return JustifyContent.FlexEnd;
    case "center":
      return JustifyContent.Center;
    case "space-between":
      return JustifyContent.SpaceBetween;
    case "space-around":
      return JustifyContent.SpaceAround;
    case "space-evenly":
      return JustifyContent.SpaceEvenly;
    default:
      return undefined;
  }
}

function gridLine(
  placement: ComputedLayoutStyle["gridColumn"],
): { start: number | "auto" | { span: number }; end: number | "auto" | { span: number } } {
  if (placement.start !== undefined) {
    return {
      start: placement.start,
      end: placement.end !== undefined
        ? placement.end
        : placement.span !== undefined
        ? { span: Math.max(1, placement.span) }
        : "auto",
    };
  }
  if (placement.span !== undefined) return { start: "auto", end: { span: Math.max(1, placement.span) } };
  return { start: "auto", end: "auto" };
}

function taffyStyleFor(style: ComputedLayoutStyle): TaffyStyle {
  const taffy = new TaffyStyle();
  taffy.display = style.display === "none"
    ? Display.None
    : style.display === "grid"
    ? Display.Grid
    : style.display === "flex"
    ? Display.Flex
    : Display.Block;
  taffy.size = { width: dimension(style.width), height: dimension(style.height) };
  taffy.minSize = { width: dimension(style.minWidth), height: dimension(style.minHeight) };
  taffy.maxSize = { width: dimension(style.maxWidth), height: dimension(style.maxHeight) };
  taffy.margin = edgeRect(style.margin);
  taffy.padding = edgeRect(style.padding);
  taffy.border = edgeRect(style.border);
  taffy.gap = { width: Math.max(0, style.columnGap || style.gap), height: Math.max(0, style.rowGap || style.gap) };
  if (style.display === "flex") {
    taffy.flexDirection = style.flexDirection === "column"
      ? FlexDirection.Column
      : style.flexDirection === "row-reverse"
      ? FlexDirection.RowReverse
      : style.flexDirection === "column-reverse"
      ? FlexDirection.ColumnReverse
      : FlexDirection.Row;
    taffy.flexWrap = style.flexWrap === "wrap" ? FlexWrap.Wrap : FlexWrap.NoWrap;
  }
  taffy.flexGrow = Math.max(0, style.flexGrow);
  taffy.flexShrink = Math.max(0, style.flexShrink);
  taffy.flexBasis = dimension(style.flexBasis);
  const align = alignItemsFor(style);
  if (align !== undefined) taffy.alignItems = align;
  const justify = justifyFor(style);
  if (justify !== undefined) taffy.justifyContent = justify;
  if (style.display === "grid") {
    if (style.gridTemplateColumns.length > 0) {
      taffy.gridTemplateColumns = style.gridTemplateColumns.map(track);
    }
    if (style.gridTemplateRows.length > 0) {
      taffy.gridTemplateRows = style.gridTemplateRows.map(track);
    }
  }
  taffy.gridColumn = gridLine(style.gridColumn);
  taffy.gridRow = gridLine(style.gridRow);
  return taffy;
}

function taffyChildren(node: LayoutNode): LayoutNode[] {
  return node.children.filter((child) => child.style.display !== "none" && child.style.position !== "absolute");
}

/** The experimental Taffy WASM layout solver. */
export class TaffyWasmLayoutSolver implements LayoutSolver {
  readonly id = "taffy-wasm";
  readonly capabilities: LayoutSolverCapabilities = Object.freeze({
    ...TAFFY_LAYOUT_SOLVER_CAPABILITIES,
    availability: "optional" as const,
    displayModes: Object.freeze({
      block: "partial" as const,
      flex: "supported" as const,
      grid: "supported" as const,
      none: "supported" as const,
    }),
  });
  readonly #defaultTextHeight: number;

  constructor(options: { defaultTextHeight?: number } = {}) {
    this.#defaultTextHeight = Math.max(1, Math.floor(options.defaultTextHeight ?? 1));
  }

  supports(): boolean {
    return true;
  }

  solve(input: LayoutSolverInput): LayoutSolverResult {
    const bounds = normalizeRectangle(input.bounds);
    const tree = new TaffyTree();
    try {
      tree.enableRounding();
      const nodes = new Map<bigint, LayoutNode>();
      const rootHandle = this.#build(tree, input.root, nodes, true, bounds);
      tree.computeLayoutWithMeasure(
        rootHandle,
        { width: bounds.width, height: bounds.height },
        (known, available, _handle, context) => {
          const text = (context as { text?: string } | undefined)?.text ?? "";
          const width = known.width ??
            (typeof available.width === "number" ? available.width : Number.MAX_SAFE_INTEGER);
          const measured = measureTerminalTextIntrinsic(text, Math.max(1, Math.floor(width)), this.#defaultTextHeight);
          return { width: measured.width, height: Math.max(this.#defaultTextHeight, measured.height) };
        },
      );
      const root = this.#toComputedBox(tree, rootHandle, input.root, {
        column: bounds.column,
        row: bounds.row,
      });
      const boxes = flattenComputedLayoutBoxes(root);
      return {
        root,
        boxes,
        byId: mapLayoutBoxes(boxes),
        contentWidth: root.scrollWidth,
        contentHeight: root.scrollHeight,
      };
    } finally {
      // Disposal is part of the contract: no Taffy handle survives.
      tree.free();
    }
  }

  #build(
    tree: TaffyTree,
    node: LayoutNode,
    nodes: Map<bigint, LayoutNode>,
    isRoot: boolean,
    bounds: Rectangle,
  ): bigint {
    const style = taffyStyleFor(node.style);
    if (isRoot && node.style.width.unit === "auto" && node.style.height.unit === "auto") {
      style.size = { width: bounds.width, height: bounds.height };
    }
    const children = taffyChildren(node);
    let handle: bigint;
    if (children.length === 0) {
      handle = node.text !== undefined ? tree.newLeafWithContext(style, { text: node.text }) : tree.newLeaf(style);
    } else {
      handle = tree.newWithChildren(
        style,
        children.map((child) => this.#build(tree, child, nodes, false, bounds)),
      );
    }
    nodes.set(handle, node);
    return handle;
  }

  #toComputedBox(
    tree: TaffyTree,
    handle: bigint,
    node: LayoutNode,
    parentOffset: { column: number; row: number },
  ): ComputedLayoutBox {
    const layout = tree.getLayout(handle);
    const rect = {
      column: parentOffset.column + Math.round(layout.x),
      row: parentOffset.row + Math.round(layout.y),
      width: Math.max(0, Math.round(layout.width)),
      height: Math.max(0, Math.round(layout.height)),
    };
    const contentRect = insetRectangleByEdges(rect, node.style.border, node.style.padding);
    const displayed = node.style.display !== "none";
    const visible = displayed && node.style.visibility === "visible";
    const children: ComputedLayoutBox[] = [];
    let scrollWidth = contentRect.width;
    let scrollHeight = contentRect.height;
    const orderedChildren = taffyChildren(node);
    const childHandles = tree.children(handle);
    for (let index = 0; index < orderedChildren.length && index < childHandles.length; index += 1) {
      const childBox = this.#toComputedBox(tree, childHandles[index]!, orderedChildren[index]!, {
        column: rect.column,
        row: rect.row,
      });
      children.push(childBox);
      scrollWidth = Math.max(scrollWidth, childBox.rect.column + childBox.rect.width - contentRect.column);
      scrollHeight = Math.max(scrollHeight, childBox.rect.row + childBox.rect.height - contentRect.row);
    }
    return {
      id: node.id,
      tag: node.tag,
      classes: node.classes,
      attributes: { ...node.attributes },
      text: node.text,
      rect,
      contentRect,
      padding: { ...node.style.padding },
      margin: { ...node.style.margin },
      border: { ...node.style.border },
      overflowX: node.style.overflowX,
      overflowY: node.style.overflowY,
      scrollWidth,
      scrollHeight,
      overflow: computedLayoutBoxOverflow(
        contentRect,
        scrollWidth,
        scrollHeight,
        node.style.overflowX,
        node.style.overflowY,
      ),
      zIndex: node.style.zIndex,
      visible,
      hitRegions: visible ? [] : [],
      children,
    };
  }
}

/** Creates the experimental Taffy WASM solver. */
export function taffyWasmLayoutSolver(options: { defaultTextHeight?: number } = {}): TaffyWasmLayoutSolver {
  return new TaffyWasmLayoutSolver(options);
}
