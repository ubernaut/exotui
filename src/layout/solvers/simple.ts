// Copyright 2023 Im-Beast. MIT license.
import type { WidgetHitRegion } from "../../components/interaction.ts";
import type { Rectangle } from "../../types.ts";
import { insetRectangleByEdges, normalizeRectangle } from "../../utils/rectangles.ts";
import { SIMPLE_LAYOUT_SOLVER_CAPABILITIES } from "../capabilities.ts";
import {
  LayoutMeasurementCache,
  measureTerminalTextIntrinsic,
  measureTerminalTextMinContentWidth,
} from "../measurement.ts";
import { type FlexDirection, type FlexItem, flexRects } from "../flex_layout.ts";
import {
  type BoxEdges,
  type ComputedLayoutStyle,
  isIntrinsicLayoutLengthUnit,
  type LayoutJustifyContent,
  type LayoutLengthResolutionContext,
  type LayoutLengthValue,
  resolveLayoutLength,
} from "../style.ts";
import {
  type ComputedLayoutBox,
  computedLayoutBoxOverflow,
  flattenComputedLayoutBoxes,
  type LayoutIntrinsicSize,
  type LayoutNode,
  type LayoutSolver,
  type LayoutSolverInput,
  type LayoutSolverResult,
  mapLayoutBoxes,
} from "../solver.ts";

/** Options for configuring the built-in TypeScript layout solver. */
export interface SimpleLayoutSolverOptions {
  defaultTextHeight?: number;
  intrinsicMeasurementCache?: LayoutMeasurementCache | false;
  maxIntrinsicCacheEntries?: number;
}

/** Built-in deterministic block/flex layout solver for terminal-cell rectangles. */
export class SimpleLayoutSolver implements LayoutSolver {
  readonly id = "simple";
  readonly capabilities = SIMPLE_LAYOUT_SOLVER_CAPABILITIES;
  readonly #defaultTextHeight: number;
  readonly #intrinsicMeasurementCache?: LayoutMeasurementCache;

  constructor(options: SimpleLayoutSolverOptions = {}) {
    this.#defaultTextHeight = Math.max(1, Math.floor(options.defaultTextHeight ?? 1));
    this.#intrinsicMeasurementCache = options.intrinsicMeasurementCache === false
      ? undefined
      : options.intrinsicMeasurementCache ?? new LayoutMeasurementCache({
        maxEntries: options.maxIntrinsicCacheEntries,
      });
  }

  supports(): boolean {
    return true;
  }

  solve(input: LayoutSolverInput): LayoutSolverResult {
    const bounds = normalizeRectangle(input.bounds);
    const previousViewport = activeLengthViewport;
    const previousParent = activeLengthParent;
    activeLengthViewport = { width: bounds.width, height: bounds.height };
    activeLengthParent = { width: bounds.width, height: bounds.height };
    try {
      const root = this.#layoutNode(input.root, bounds, true);
      const boxes = flattenComputedLayoutBoxes(root);
      return {
        root,
        boxes,
        byId: mapLayoutBoxes(boxes),
        contentWidth: root.scrollWidth,
        contentHeight: root.scrollHeight,
      };
    } finally {
      activeLengthViewport = previousViewport;
      activeLengthParent = previousParent;
    }
  }

  #layoutNode(
    node: LayoutNode,
    allocated: Rectangle,
    isRoot = false,
    fillAllocated = false,
    containingBlock: Rectangle = allocated,
    marginOverride?: BoxEdges<number>,
  ): ComputedLayoutBox {
    const previousParent = activeLengthParent;
    activeLengthParent = { width: containingBlock.width, height: containingBlock.height };
    try {
      return this.#layoutNodeScoped(node, allocated, isRoot, fillAllocated, containingBlock, marginOverride);
    } finally {
      activeLengthParent = previousParent;
    }
  }

  #layoutNodeScoped(
    node: LayoutNode,
    allocated: Rectangle,
    isRoot: boolean,
    fillAllocated: boolean,
    containingBlock: Rectangle,
    marginOverride?: BoxEdges<number>,
  ): ComputedLayoutBox {
    const style = node.style;
    const margin = isRoot
      ? zeroEdges()
      : marginOverride ?? resolveBoxEdges(authoredLengths(style)?.margin, style.margin, containingBlock.width);
    const padding = resolveBoxEdges(authoredLengths(style)?.padding, style.padding, containingBlock.width);
    const normalOuter = shrinkByMargin(allocated, margin);
    const relativeOffset = style.position === "relative" ? resolveRelativeOffset(style, containingBlock) : ZERO_OFFSET;
    const outer = translateRectangle(normalOuter, relativeOffset.column, relativeOffset.row);
    const rect = resolveNodeRect(
      node,
      outer,
      padding,
      isRoot,
      fillAllocated,
      this.#defaultTextHeight,
      this.#intrinsicMeasurementCache,
    );
    const contentRect = insetRectangleByEdges(rect, style.border, padding);
    const visible = style.visibility === "visible" && style.display !== "none";
    const docked = this.#layoutDockedChildren(node, contentRect);
    const flowRect = docked.remaining;
    const children = style.display === "flex"
      ? this.#layoutFlexChildren(node, flowRect)
      : style.display === "grid"
      ? this.#layoutGridChildren(node, flowRect)
      : this.#layoutBlockChildren(node, flowRect);
    children.unshift(...docked.boxes);
    this.#layoutAbsoluteChildrenInto(children, node, contentRect);
    const scroll = scrollSize(node, contentRect, children);

    return {
      id: node.id,
      tag: node.tag,
      classes: node.classes,
      attributes: { ...node.attributes },
      text: node.text,
      rect,
      contentRect,
      padding,
      margin,
      border: { ...style.border },
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      scrollWidth: scroll.width,
      scrollHeight: scroll.height,
      overflow: computedLayoutBoxOverflow(contentRect, scroll.width, scroll.height, style.overflowX, style.overflowY),
      zIndex: style.zIndex,
      visible,
      hitRegions: visible ? [hitRegionForNode(node, rect, style.zIndex)] : [],
      children,
    };
  }

  #layoutBlockChildren(node: LayoutNode, bounds: Rectangle): ComputedLayoutBox[] {
    const previousParent = activeLengthParent;
    activeLengthParent = { width: bounds.width, height: bounds.height };
    try {
      return this.#layoutBlockChildrenScoped(node, bounds);
    } finally {
      activeLengthParent = previousParent;
    }
  }

  #layoutBlockChildrenScoped(node: LayoutNode, bounds: Rectangle): ComputedLayoutBox[] {
    const boxes: ComputedLayoutBox[] = [];
    const children = layoutChildren(node);
    const gap = resolveAxisGap(node.style, "row", bounds);
    let cursor = bounds.row;

    for (const child of children) {
      const preferred = preferredBlockChildSize(
        child,
        bounds,
        this.#defaultTextHeight,
        this.#intrinsicMeasurementCache,
      );
      const childMargins = resolveBlockMargins(child.style, bounds, preferred.width);
      const allocatedHeight = preferred.height + childMargins.top + childMargins.bottom;
      const childBounds = {
        column: bounds.column,
        row: cursor,
        width: bounds.width,
        height: allocatedHeight,
      };
      const box = this.#layoutNode(child, childBounds, false, false, bounds, childMargins);
      boxes.push(box);
      cursor = childBounds.row + childBounds.height + gap;
    }

    applyBlockChildAlignment(node.style, boxes, bounds, children.length === 0 ? bounds.row : cursor - gap);
    return boxes;
  }

  #layoutFlexChildren(node: LayoutNode, bounds: Rectangle): ComputedLayoutBox[] {
    const previousParent = activeLengthParent;
    activeLengthParent = { width: bounds.width, height: bounds.height };
    try {
      return this.#layoutFlexChildrenScoped(node, bounds);
    } finally {
      activeLengthParent = previousParent;
    }
  }

  #layoutFlexChildrenScoped(node: LayoutNode, bounds: Rectangle): ComputedLayoutBox[] {
    const children = layoutChildren(node);
    if (children.length === 0) return [];

    const direction = flexAxisDirection(node.style.flexDirection);
    const reverseMainAxis = flexMainAxisIsReverse(node.style.flexDirection);
    const mainGap = resolveAxisGap(node.style, direction === "row" ? "column" : "row", bounds);
    const crossGap = resolveAxisGap(node.style, direction === "row" ? "row" : "column", bounds);
    const items = new Array<FlexLayoutItem>(children.length);
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]!;
      const margin = resolveBoxEdges(authoredLengths(child.style)?.margin, child.style.margin, bounds.width);
      const autoMargin = autoMarginEdges(child.style);
      const mainMargins = direction === "row" ? margin.left + margin.right : margin.top + margin.bottom;
      const crossMargins = direction === "row" ? margin.top + margin.bottom : margin.left + margin.right;
      const borderBoxBasis = preferredFlexBasis(
        child,
        bounds,
        direction,
        this.#defaultTextHeight,
        this.#intrinsicMeasurementCache,
      );
      const basis = borderBoxBasis + mainMargins;
      const minimum =
        resolveFlexMinimum(child, bounds, direction, this.#defaultTextHeight, this.#intrinsicMeasurementCache) +
        mainMargins;
      const resolvedMaximum = resolveFlexMaximum(
        child,
        bounds,
        direction,
        this.#defaultTextHeight,
        this.#intrinsicMeasurementCache,
      );
      const maximum = resolvedMaximum === undefined ? undefined : resolvedMaximum + mainMargins;
      const max = child.style.flexGrow === 0 ? Math.max(minimum, Math.min(maximum ?? basis, basis)) : maximum;
      items[index] = {
        node: child,
        id: child.id,
        basis,
        grow: child.style.flexGrow,
        shrink: child.style.flexShrink,
        min: minimum,
        max,
        crossSize: preferredFlexCrossSize(
          child,
          bounds,
          direction,
          this.#defaultTextHeight,
          this.#intrinsicMeasurementCache,
        ) + crossMargins,
        margin,
        autoMargin,
      };
    }
    const lines = node.style.flexWrap === "nowrap"
      ? [items]
      : wrapFlexLines(items, mainSize(bounds, direction), mainGap);
    const boxes: ComputedLayoutBox[] = [];
    const reverseLines = node.style.flexWrap === "wrap-reverse";
    const orderedLines = reverseLines ? lines.slice().reverse() : lines;
    const lineCrossSizes = orderedLines.map((line) =>
      lineFlexCrossSize(line, bounds, direction, node.style.alignItems, node.style.flexWrap === "nowrap")
    );
    const lineDistribution = distributeFlexLines(
      lineCrossSizes,
      crossSize(bounds, direction),
      crossGap,
      node.style.alignContent,
      node.style.flexWrap !== "nowrap",
    );
    const crossStart = direction === "row" ? bounds.row : bounds.column;

    for (let lineIndex = 0; lineIndex < orderedLines.length; lineIndex += 1) {
      const line = orderedLines[lineIndex]!;
      const lineCrossSize = lineDistribution.sizes[lineIndex] ?? 0;
      const crossCursor = crossStart + (lineDistribution.offsets[lineIndex] ?? 0);
      const lineBounds = direction === "row"
        ? { column: bounds.column, row: crossCursor, width: bounds.width, height: lineCrossSize }
        : { column: crossCursor, row: bounds.row, width: lineCrossSize, height: bounds.height };
      const lineLayout = flexLineRects(
        lineBounds,
        direction,
        line,
        mainGap,
        node.style.justifyContent,
        reverseMainAxis,
      );
      for (const item of line) {
        const aligned = alignFlexItemRect(
          lineLayout.rects[item.id] ?? lineBounds,
          item,
          direction,
          node.style.alignItems,
          lineLayout.margins[item.id] ?? item.margin,
        );
        boxes.push(this.#layoutNode(item.node, aligned.rect, false, true, bounds, aligned.margin));
      }
    }

    return boxes;
  }

  #layoutGridChildren(node: LayoutNode, bounds: Rectangle): ComputedLayoutBox[] {
    const previousParent = activeLengthParent;
    activeLengthParent = { width: bounds.width, height: bounds.height };
    try {
      return this.#layoutGridChildrenScoped(node, bounds);
    } finally {
      activeLengthParent = previousParent;
    }
  }

  #layoutGridChildrenScoped(node: LayoutNode, bounds: Rectangle): ComputedLayoutBox[] {
    const children = layoutChildren(node);
    if (children.length === 0) return [];

    const columnGap = resolveAxisGap(node.style, "column", bounds);
    const rowGap = resolveAxisGap(node.style, "row", bounds);
    const placed = placeGridChildren(children, {
      columns: node.style.gridTemplateColumns.length,
      rows: node.style.gridTemplateRows.length,
      autoFlow: node.style.gridAutoFlow,
      areas: node.style.gridTemplateAreas,
    });
    let columnCount = Math.max(1, node.style.gridTemplateColumns.length);
    let rowCount = Math.max(1, node.style.gridTemplateRows.length);
    for (const item of placed) {
      columnCount = Math.max(columnCount, item.column + item.columnSpan);
      rowCount = Math.max(rowCount, item.row + item.rowSpan);
    }
    const columns = resolveGridTracks(
      node.style.gridTemplateColumns,
      columnCount,
      bounds.width,
      columnGap,
      node.style.gridAutoColumns,
    );
    const rows = resolveGridTracks(
      node.style.gridTemplateRows,
      rowCount,
      bounds.height,
      rowGap,
      node.style.gridAutoRows,
    );
    const columnOffsets = gridTrackOffsets(bounds.column, columns, columnGap);
    const rowOffsets = gridTrackOffsets(bounds.row, rows, rowGap);

    const boxes = new Array<ComputedLayoutBox>(placed.length);
    for (let index = 0; index < placed.length; index += 1) {
      const item = placed[index]!;
      const column = columnOffsets[item.column] ?? bounds.column;
      const row = rowOffsets[item.row] ?? bounds.row;
      const width = gridSpanSize(columns, item.column, item.columnSpan, columnGap);
      const height = gridSpanSize(rows, item.row, item.rowSpan, rowGap);
      const itemBounds = alignGridItemBounds(item.node, { column, row, width, height });
      const margin = resolveBoxEdges(authoredLengths(item.node.style)?.margin, item.node.style.margin, bounds.width);
      boxes[index] = this.#layoutNode(item.node, itemBounds, false, true, bounds, margin);
    }
    return boxes;
  }

  /**
   * Lays out docked children in document order, each pinning to an edge of
   * the running remaining rectangle (Textual dock semantics): top/bottom
   * docks span the remaining width at their preferred height, left/right
   * docks span the remaining height at their preferred (intrinsic when auto)
   * width. Returns the docked boxes and the area left for normal flow.
   */
  #layoutDockedChildren(
    node: LayoutNode,
    bounds: Rectangle,
  ): { boxes: ComputedLayoutBox[]; remaining: Rectangle } {
    const boxes: ComputedLayoutBox[] = [];
    let remaining = { ...bounds };
    for (const child of node.children) {
      const dock = child.style.dock;
      if (dock === undefined || child.style.display === "none" || child.style.position === "absolute") continue;
      const margin = resolveBoxEdges(authoredLengths(child.style)?.margin, child.style.margin, remaining.width);
      let childBounds: Rectangle;
      if (dock === "top" || dock === "bottom") {
        const preferred = preferredBlockChildSize(
          child,
          remaining,
          this.#defaultTextHeight,
          this.#intrinsicMeasurementCache,
        );
        const height = Math.min(remaining.height, preferred.height + margin.top + margin.bottom);
        childBounds = {
          column: remaining.column,
          row: dock === "top" ? remaining.row : remaining.row + remaining.height - height,
          width: remaining.width,
          height,
        };
        remaining = {
          column: remaining.column,
          row: dock === "top" ? remaining.row + height : remaining.row,
          width: remaining.width,
          height: remaining.height - height,
        };
      } else {
        const preferred = preferredAbsoluteChildSize(
          child,
          remaining,
          this.#defaultTextHeight,
          this.#intrinsicMeasurementCache,
        );
        const width = Math.min(remaining.width, preferred.width + margin.left + margin.right);
        childBounds = {
          column: dock === "left" ? remaining.column : remaining.column + remaining.width - width,
          row: remaining.row,
          width,
          height: remaining.height,
        };
        remaining = {
          column: dock === "left" ? remaining.column + width : remaining.column,
          row: remaining.row,
          width: remaining.width - width,
          height: remaining.height,
        };
      }
      boxes.push(this.#layoutNode(child, childBounds, false, true, bounds, margin));
    }
    return { boxes, remaining };
  }

  #layoutAbsoluteChildrenInto(target: ComputedLayoutBox[], node: LayoutNode, bounds: Rectangle): void {
    const previousParent = activeLengthParent;
    activeLengthParent = { width: bounds.width, height: bounds.height };
    try {
      this.#layoutAbsoluteChildrenIntoScoped(target, node, bounds);
    } finally {
      activeLengthParent = previousParent;
    }
  }

  #layoutAbsoluteChildrenIntoScoped(target: ComputedLayoutBox[], node: LayoutNode, bounds: Rectangle): void {
    for (const child of node.children) {
      if (child.style.display === "none" || child.style.position !== "absolute") continue;
      const margin = resolveBoxEdges(authoredLengths(child.style)?.margin, child.style.margin, bounds.width);
      target.push(this.#layoutNode(
        child,
        absoluteChildBounds(child, bounds, this.#defaultTextHeight, this.#intrinsicMeasurementCache),
        false,
        false,
        bounds,
        margin,
      ));
    }
  }
}

/**
 * Dynamically scoped resolution context for viewport (`vw`/`vh`) and
 * parent-axis (`w`/`h`) units. The solver is fully synchronous, and every
 * writer saves and restores in try/finally, so this behaves as an implicit
 * parameter without threading it through every sizing helper. Where a helper
 * resolves against a rect other than the active containing block (grid
 * cells), it passes an explicit context instead.
 */
let activeLengthViewport: { width: number; height: number } | undefined;
let activeLengthParent: { width: number; height: number } | undefined;

function activeLengthContext(): LayoutLengthResolutionContext {
  return {
    viewportWidth: activeLengthViewport?.width,
    viewportHeight: activeLengthViewport?.height,
    parentWidth: activeLengthParent?.width,
    parentHeight: activeLengthParent?.height,
  };
}

function explicitLengthContext(parent: { width: number; height: number }): LayoutLengthResolutionContext {
  return {
    viewportWidth: activeLengthViewport?.width,
    viewportHeight: activeLengthViewport?.height,
    parentWidth: parent.width,
    parentHeight: parent.height,
  };
}

/** Creates the built-in deterministic block/flex layout solver. */
export function simpleLayoutSolver(options: SimpleLayoutSolverOptions = {}): SimpleLayoutSolver {
  return new SimpleLayoutSolver(options);
}

interface FlexLayoutItem extends FlexItem<string> {
  node: LayoutNode;
  crossSize: number;
  margin: BoxEdges<number>;
  autoMargin: BoxEdges<boolean>;
}

interface FlexLineLayout {
  rects: Record<string, Rectangle>;
  margins: Record<string, BoxEdges<number>>;
}

interface AlignedFlexItem {
  rect: Rectangle;
  margin: BoxEdges<number>;
}

interface GridPlacementBounds {
  columns: number;
  rows: number;
  autoFlow: ComputedLayoutStyle["gridAutoFlow"];
  areas?: readonly (readonly string[])[];
}

interface GridPlacedItem {
  node: LayoutNode;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

interface GridPlacementCandidate {
  index: number;
  node: LayoutNode;
  columnSpan: number;
  rowSpan: number;
  explicitColumn?: number;
  explicitRow?: number;
}

interface FindGridSlotOptions {
  preferredColumn?: number;
  preferredRow?: number;
  columnSpan: number;
  rowSpan: number;
  maxColumns?: number;
  maxRows?: number;
  scanColumns: number;
  scanRows: number;
  autoFlow: ComputedLayoutStyle["gridAutoFlow"];
}

function placeGridChildren(children: readonly LayoutNode[], bounds: GridPlacementBounds): GridPlacedItem[] {
  const placed = new Array<GridPlacedItem>(children.length);
  const occupied = new Set<string>();
  const autoColumns = bounds.columns > 0 ? bounds.columns : Math.max(1, Math.ceil(Math.sqrt(children.length)));
  const autoRows = bounds.rows > 0 ? bounds.rows : Math.max(1, Math.ceil(Math.sqrt(children.length)));
  const candidates = new Array<GridPlacementCandidate>(children.length);
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    const area = child.style.gridArea ? gridTemplateAreaBounds(bounds.areas ?? [], child.style.gridArea) : undefined;
    const hasExplicitColumn = gridPlacementHasExplicitLine(child.style.gridColumn);
    const hasExplicitRow = gridPlacementHasExplicitLine(child.style.gridRow);
    candidates[index] = {
      index,
      node: child,
      columnSpan: hasExplicitColumn ? gridPlacementSpan(child.style.gridColumn) : area?.columnSpan ??
        gridPlacementSpan(child.style.gridColumn),
      rowSpan: hasExplicitRow ? gridPlacementSpan(child.style.gridRow) : area?.rowSpan ??
        gridPlacementSpan(child.style.gridRow),
      explicitColumn: gridPlacementStart(child.style.gridColumn) ?? area?.column,
      explicitRow: gridPlacementStart(child.style.gridRow) ?? area?.row,
    };
  }

  for (let phase = 0; phase < 3; phase += 1) {
    for (const candidate of candidates) {
      const explicitColumn = candidate.explicitColumn !== undefined;
      const explicitRow = candidate.explicitRow !== undefined;
      if (phase === 0 && (!explicitColumn || !explicitRow)) continue;
      if (phase === 1 && explicitColumn === explicitRow) continue;
      if (phase === 2 && (explicitColumn || explicitRow)) continue;

      const position = candidate.explicitColumn !== undefined && candidate.explicitRow !== undefined
        ? { column: candidate.explicitColumn, row: candidate.explicitRow }
        : candidate.explicitColumn !== undefined
        ? findGridSlot(occupied, {
          preferredColumn: candidate.explicitColumn,
          columnSpan: candidate.columnSpan,
          rowSpan: candidate.rowSpan,
          maxColumns: undefined,
          maxRows: undefined,
          scanColumns: Math.max(autoColumns, candidate.explicitColumn + candidate.columnSpan),
          scanRows: autoRows,
          autoFlow: bounds.autoFlow,
        })
        : candidate.explicitRow !== undefined
        ? findGridSlot(occupied, {
          preferredRow: candidate.explicitRow,
          columnSpan: candidate.columnSpan,
          rowSpan: candidate.rowSpan,
          maxColumns: bounds.columns > 0 ? bounds.columns : undefined,
          maxRows: undefined,
          scanColumns: autoColumns,
          scanRows: Math.max(autoRows, candidate.explicitRow + candidate.rowSpan),
          autoFlow: bounds.autoFlow,
        })
        : findGridSlot(occupied, {
          columnSpan: candidate.columnSpan,
          rowSpan: candidate.rowSpan,
          maxColumns: bounds.autoFlow === "row" && bounds.columns > 0 ? bounds.columns : undefined,
          maxRows: bounds.autoFlow === "column" && bounds.rows > 0 ? bounds.rows : undefined,
          scanColumns: autoColumns,
          scanRows: autoRows,
          autoFlow: bounds.autoFlow,
        });

      occupyGridCells(occupied, position.row, position.column, candidate.rowSpan, candidate.columnSpan);
      placed[candidate.index] = {
        node: candidate.node,
        column: position.column,
        row: position.row,
        columnSpan: candidate.columnSpan,
        rowSpan: candidate.rowSpan,
      };
    }
  }

  return placed;
}

function alignGridItemBounds(node: LayoutNode, cell: Rectangle): Rectangle {
  const cellContext = explicitLengthContext(cell);
  const width = node.style.justifySelf === "stretch" || node.style.width.unit === "auto"
    ? cell.width
    : Math.min(cell.width, resolveLayoutLength(node.style.width, cell.width, cell.width, cellContext));
  const height = node.style.alignSelf === "stretch" || node.style.height.unit === "auto"
    ? cell.height
    : Math.min(cell.height, resolveLayoutLength(node.style.height, cell.height, cell.height, cellContext));
  return {
    column: cell.column + gridAlignmentOffset(cell.width, width, node.style.justifySelf),
    row: cell.row + gridAlignmentOffset(cell.height, height, node.style.alignSelf),
    width,
    height,
  };
}

function resolveGridTracks(
  template: readonly LayoutLengthValue[],
  count: number,
  available: number,
  gap: number,
  autoTrack: LayoutLengthValue,
): number[] {
  const trackCount = Math.max(1, count);
  const tracks = new Array<LayoutLengthValue>(trackCount);
  for (let index = 0; index < trackCount; index++) {
    tracks[index] = template[index] ?? autoTrack;
  }
  const totalGap = Math.max(0, trackCount - 1) * Math.max(0, gap);
  const availableWithoutGaps = Math.max(0, Math.floor(available) - totalGap);
  const sizes = new Array<number>(trackCount).fill(0);
  const autoIndexes: number[] = [];
  const frIndexes: number[] = [];
  let fixed = 0;
  let frTotal = 0;

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index] ?? autoTrack;
    if (track.unit === "cell") {
      sizes[index] = Math.max(0, Math.floor(track.value));
      fixed += sizes[index]!;
    } else if (
      track.unit === "percent" || track.unit === "vw" || track.unit === "vh" ||
      track.unit === "pw" || track.unit === "ph" || track.unit === "calc"
    ) {
      sizes[index] = resolveLayoutLength(track, availableWithoutGaps, 0, activeLengthContext());
      fixed += sizes[index]!;
    } else if (track.unit === "fr") {
      frIndexes.push(index);
      frTotal += Math.max(0, track.value);
    } else {
      autoIndexes.push(index);
    }
  }

  let remaining = Math.max(0, availableWithoutGaps - fixed);
  if (frIndexes.length > 0 && frTotal > 0) {
    let assigned = 0;
    for (const [frIndex, trackIndex] of frIndexes.entries()) {
      const track = tracks[trackIndex] ?? autoTrack;
      const size = frIndex === frIndexes.length - 1
        ? remaining - assigned
        : Math.floor(remaining * Math.max(0, track.value) / frTotal);
      sizes[trackIndex] = Math.max(0, size);
      assigned += sizes[trackIndex]!;
    }
    remaining = Math.max(0, availableWithoutGaps - fixed - assigned);
  }

  if (autoIndexes.length > 0) {
    const base = Math.floor(remaining / autoIndexes.length);
    let extra = remaining % autoIndexes.length;
    for (const trackIndex of autoIndexes) {
      sizes[trackIndex] = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
    }
  }

  shrinkGridTracksToFit(sizes, availableWithoutGaps);
  for (let index = 0; index < sizes.length; index += 1) {
    sizes[index] = Math.max(0, Math.floor(sizes[index] ?? 0));
  }
  return sizes;
}

function gridTrackOffsets(start: number, tracks: readonly number[], gap: number): number[] {
  const offsets: number[] = [];
  let cursor = start;
  for (const track of tracks) {
    offsets.push(cursor);
    cursor += Math.max(0, track) + Math.max(0, gap);
  }
  return offsets;
}

function gridSpanSize(tracks: readonly number[], start: number, span: number, gap: number): number {
  const safeSpan = Math.max(1, span);
  let size = 0;
  for (let offset = 0; offset < safeSpan; offset += 1) {
    size += tracks[start + offset] ?? 0;
  }
  return Math.max(0, size + Math.max(0, safeSpan - 1) * Math.max(0, gap));
}

function hitRegionForNode(
  node: LayoutNode,
  bounds: Rectangle,
  zIndex: number,
): WidgetHitRegion<{ nodeId: string; tag: string }> {
  return {
    id: node.id,
    bounds,
    zIndex,
    payload: { nodeId: node.id, tag: node.tag },
  };
}

function findGridSlot(occupied: Set<string>, options: FindGridSlotOptions): { column: number; row: number } {
  const scanColumns = Math.max(
    1,
    options.scanColumns,
    options.preferredColumn !== undefined ? options.preferredColumn + 1 : 1,
  );
  const scanRows = Math.max(1, options.scanRows, options.preferredRow !== undefined ? options.preferredRow + 1 : 1);
  const limit = Math.max(scanColumns * scanRows + occupied.size + 16, 32);

  if (options.preferredColumn !== undefined) {
    for (let row = options.preferredRow ?? 0; row < limit; row += 1) {
      if (gridCellsAvailable(occupied, row, options.preferredColumn, options.rowSpan, options.columnSpan, options)) {
        return { column: options.preferredColumn, row };
      }
    }
  }

  if (options.preferredRow !== undefined) {
    for (let column = options.preferredColumn ?? 0; column < limit; column += 1) {
      if (gridCellsAvailable(occupied, options.preferredRow, column, options.rowSpan, options.columnSpan, options)) {
        return { column, row: options.preferredRow };
      }
    }
  }

  if (options.autoFlow === "column") {
    for (let column = 0; column < limit; column += 1) {
      for (let row = 0; row < scanRows || row < limit && options.maxRows === undefined; row += 1) {
        if (gridCellsAvailable(occupied, row, column, options.rowSpan, options.columnSpan, options)) {
          return { column, row };
        }
      }
    }
  } else {
    for (let row = 0; row < limit; row += 1) {
      for (let column = 0; column < scanColumns || column < limit && options.maxColumns === undefined; column += 1) {
        if (gridCellsAvailable(occupied, row, column, options.rowSpan, options.columnSpan, options)) {
          return { column, row };
        }
      }
    }
  }

  return { column: 0, row: 0 };
}

function gridCellsAvailable(
  occupied: Set<string>,
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
  options: FindGridSlotOptions,
): boolean {
  if (row < 0 || column < 0) return false;
  if (options.maxColumns !== undefined && column + columnSpan > options.maxColumns) return false;
  if (options.maxRows !== undefined && row + rowSpan > options.maxRows) return false;
  for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
      if (occupied.has(gridCellKey(row + rowOffset, column + columnOffset))) return false;
    }
  }
  return true;
}

function occupyGridCells(
  occupied: Set<string>,
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
): void {
  for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
      occupied.add(gridCellKey(row + rowOffset, column + columnOffset));
    }
  }
}

function gridCellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function gridPlacementSpan(placement: ComputedLayoutStyle["gridColumn"]): number {
  if (placement.span !== undefined) return Math.max(1, placement.span);
  if (placement.start !== undefined && placement.end !== undefined) return Math.max(1, placement.end - placement.start);
  return 1;
}

function gridPlacementHasExplicitLine(placement: ComputedLayoutStyle["gridColumn"]): boolean {
  return placement.start !== undefined || placement.end !== undefined || placement.span !== undefined;
}

function gridPlacementStart(placement: ComputedLayoutStyle["gridColumn"]): number | undefined {
  if (placement.start !== undefined) return Math.max(0, placement.start - 1);
  if (placement.end !== undefined && placement.span !== undefined) {
    return Math.max(0, placement.end - placement.span - 1);
  }
  return undefined;
}

function gridTemplateAreaBounds(
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

function gridAlignmentOffset(available: number, size: number, alignment: ComputedLayoutStyle["justifySelf"]): number {
  const free = Math.max(0, available - size);
  if (alignment === "end") return free;
  if (alignment === "center") return Math.floor(free / 2);
  return 0;
}

function shrinkGridTracksToFit(sizes: number[], available: number): void {
  let total = 0;
  for (const size of sizes) total += size;
  let overflow = total - Math.max(0, available);
  for (let index = sizes.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const removable = Math.min(sizes[index] ?? 0, overflow);
    sizes[index] = Math.max(0, (sizes[index] ?? 0) - removable);
    overflow -= removable;
  }
}

/**
 * Textual-style container `align`: block children shift as a group
 * vertically into the free space, and each child shifts horizontally within
 * the row it owns. Shifts are clamped at zero so overflowing content never
 * moves backwards.
 */
function applyBlockChildAlignment(
  style: ComputedLayoutStyle,
  boxes: ComputedLayoutBox[],
  bounds: Rectangle,
  contentBottom: number,
): void {
  const horizontal = style.alignHorizontal;
  const vertical = style.alignVertical;
  if (boxes.length === 0 || (horizontal === undefined && vertical === undefined)) return;
  const freeHeight = Math.max(0, bounds.row + bounds.height - contentBottom);
  const rowShift = vertical === "middle" ? Math.floor(freeHeight / 2) : vertical === "bottom" ? freeHeight : 0;
  for (const box of boxes) {
    const freeWidth = Math.max(0, bounds.width - box.rect.width);
    const columnShift = horizontal === "center" ? Math.floor(freeWidth / 2) : horizontal === "right" ? freeWidth : 0;
    if (columnShift !== 0 || rowShift !== 0) translateSolvedBox(box, columnShift, rowShift);
  }
}

function translateSolvedBox(box: ComputedLayoutBox, columns: number, rows: number): void {
  box.rect = { ...box.rect, column: box.rect.column + columns, row: box.rect.row + rows };
  box.contentRect = { ...box.contentRect, column: box.contentRect.column + columns, row: box.contentRect.row + rows };
  box.hitRegions = box.hitRegions.map((region) => ({
    ...region,
    bounds: { ...region.bounds, column: region.bounds.column + columns, row: region.bounds.row + rows },
  }));
  for (const child of box.children) translateSolvedBox(child, columns, rows);
}

function layoutChildren(node: LayoutNode): LayoutNode[] {
  const children: LayoutNode[] = [];
  for (const child of node.children) {
    if (child.style.display !== "none" && child.style.position !== "absolute" && child.style.dock === undefined) {
      children.push(child);
    }
  }
  sortLayoutChildrenByOrder(children);
  return children;
}

function sortLayoutChildrenByOrder(children: LayoutNode[]): void {
  let ordered = false;
  for (const child of children) {
    if (child.style.order !== 0) {
      ordered = true;
      break;
    }
  }
  if (!ordered) return;
  const positions = new Map<LayoutNode, number>();
  for (let index = 0; index < children.length; index += 1) positions.set(children[index]!, index);
  children.sort((left, right) =>
    left.style.order - right.style.order || (positions.get(left) ?? 0) - (positions.get(right) ?? 0)
  );
}

const ZERO_OFFSET = { column: 0, row: 0 } as const;

interface AuthoredLayoutLengths {
  margin?: BoxEdges<LayoutLengthValue>;
  padding?: BoxEdges<LayoutLengthValue>;
  rowGap?: LayoutLengthValue;
  columnGap?: LayoutLengthValue;
}

function authoredLengths(style: ComputedLayoutStyle): AuthoredLayoutLengths | undefined {
  return (style as ComputedLayoutStyle & { __layoutLengths?: AuthoredLayoutLengths }).__layoutLengths;
}

function zeroEdges(): BoxEdges<number> {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function resolveBoxEdges(
  lengths: BoxEdges<LayoutLengthValue> | undefined,
  legacy: BoxEdges<number>,
  percentageBase: number,
): BoxEdges<number> {
  if (!lengths) return { ...legacy };
  return {
    top: resolveBoxLength(lengths.top, percentageBase),
    right: resolveBoxLength(lengths.right, percentageBase),
    bottom: resolveBoxLength(lengths.bottom, percentageBase),
    left: resolveBoxLength(lengths.left, percentageBase),
  };
}

function resolveBoxLength(value: LayoutLengthValue, percentageBase: number): number {
  return value.unit === "auto" ? 0 : resolveLayoutLength(value, percentageBase, 0, activeLengthContext());
}

function autoMarginEdges(style: ComputedLayoutStyle): BoxEdges<boolean> {
  const lengths = authoredLengths(style)?.margin;
  if (!lengths) return { top: false, right: false, bottom: false, left: false };
  return {
    top: lengths.top.unit === "auto",
    right: lengths.right.unit === "auto",
    bottom: lengths.bottom.unit === "auto",
    left: lengths.left.unit === "auto",
  };
}

function resolveBlockMargins(
  style: ComputedLayoutStyle,
  containingBlock: Rectangle,
  preferredWidth: number,
): BoxEdges<number> {
  const margin = resolveBoxEdges(authoredLengths(style)?.margin, style.margin, containingBlock.width);
  const auto = autoMarginEdges(style);
  const free = Math.max(0, containingBlock.width - preferredWidth - margin.left - margin.right);
  if (auto.left && auto.right) {
    margin.left += Math.floor(free / 2);
    margin.right += Math.ceil(free / 2);
  } else if (auto.left) {
    margin.left += free;
  } else if (auto.right) {
    margin.right += free;
  }
  return margin;
}

function resolveAxisGap(
  style: ComputedLayoutStyle,
  axis: "row" | "column",
  containingBlock: Rectangle,
): number {
  const lengths = authoredLengths(style);
  const authored = axis === "row" ? lengths?.rowGap : lengths?.columnGap;
  if (authored) {
    const available = axis === "row" ? containingBlock.height : containingBlock.width;
    return resolveLayoutLength(authored, available, 0, explicitLengthContext(containingBlock));
  }
  return Math.max(0, axis === "row" ? style.rowGap || style.gap : style.columnGap || style.gap);
}

function resolveRelativeOffset(
  style: ComputedLayoutStyle,
  containingBlock: Rectangle,
): { column: number; row: number } {
  const left = resolveInset(style.inset.left, containingBlock.width);
  const right = resolveInset(style.inset.right, containingBlock.width);
  const top = resolveInset(style.inset.top, containingBlock.height);
  const bottom = resolveInset(style.inset.bottom, containingBlock.height);
  return {
    column: left !== undefined ? left : right !== undefined ? -right : 0,
    row: top !== undefined ? top : bottom !== undefined ? -bottom : 0,
  };
}

function translateRectangle(rect: Rectangle, column: number, row: number): Rectangle {
  return { ...rect, column: rect.column + column, row: rect.row + row };
}

function shrinkByMargin(rect: Rectangle, margin: ComputedLayoutStyle["margin"]): Rectangle {
  return {
    column: rect.column + margin.left,
    row: rect.row + margin.top,
    width: Math.max(0, rect.width - margin.left - margin.right),
    height: Math.max(0, rect.height - margin.top - margin.bottom),
  };
}

/** Wide enough that no terminal line wraps: the max-content measuring width. */
const MAX_CONTENT_MEASURE_WIDTH = 4096;

interface IntrinsicSizePair {
  min: number;
  max: number;
}

/** True when any of the axis lengths needs a content measurement to resolve. */
function needsIntrinsicPair(...lengths: readonly LayoutLengthValue[]): boolean {
  return lengths.some((length) => isIntrinsicLayoutLengthUnit(length.unit));
}

/**
 * Content-only min-content width: the widest unbreakable unit in the subtree
 * (longest word for text, sum/max over children for row-flex/other
 * containers), using the numeric spacing subset for child extras.
 */
function nodeMinContentWidth(
  node: LayoutNode,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
  depth = 0,
): number {
  if (node.intrinsic?.width !== undefined) return Math.max(1, Math.floor(node.intrinsic.width));
  if (node.text) {
    return measureTerminalTextMinContentWidth(node.text, {
      breakWords: node.style.overflowWrap === "anywhere" || node.style.overflowWrap === "break-word",
    });
  }
  if (node.children.length === 0 || depth > 32) return 1;
  const row = node.style.display === "flex" && flexAxisDirection(node.style.flexDirection) === "row";
  const gap = Math.max(0, node.style.columnGap || node.style.gap);
  let total = 0;
  let widest = 1;
  let count = 0;
  for (const child of node.children) {
    if (!participatesInLayout(child)) continue;
    const extras = child.style.border.left + child.style.border.right +
      child.style.padding.left + child.style.padding.right;
    const childMin = nodeMinContentWidth(child, defaultTextHeight, measurementCache, depth + 1) + extras;
    total += childMin;
    widest = Math.max(widest, childMin);
    count += 1;
  }
  return row ? total + Math.max(0, count - 1) * gap : widest;
}

/** The width-axis content bounds: longest word up to the unwrapped line. */
function widthIntrinsicPair(
  node: LayoutNode,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): IntrinsicSizePair {
  const min = nodeMinContentWidth(node, defaultTextHeight, measurementCache);
  const max = measureNodeIntrinsic(node, MAX_CONTENT_MEASURE_WIDTH, defaultTextHeight, measurementCache).width;
  return { min, max: Math.max(min, max) };
}

/** Content bounds for one flex axis: exact width pair, wrapped-height subset. */
function flexIntrinsicPair(
  node: LayoutNode,
  bounds: Rectangle,
  axis: "width" | "height",
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): IntrinsicSizePair {
  if (axis === "width") return widthIntrinsicPair(node, defaultTextHeight, measurementCache);
  const height = measureNodeIntrinsic(node, Math.max(1, bounds.width), defaultTextHeight, measurementCache).height;
  return { min: height, max: height };
}

function resolveNodeRect(
  node: LayoutNode,
  allocated: Rectangle,
  padding: BoxEdges<number>,
  isRoot: boolean,
  fillAllocated: boolean,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): Rectangle {
  const style = node.style;
  const horizontalExtras = style.border.left + style.border.right + padding.left + padding.right;
  const verticalExtras = style.border.top + style.border.bottom + padding.top + padding.bottom;
  const boxSizing = style.boxSizing ?? "border-box";
  const widthSpecified = style.width.unit !== "auto";
  const heightSpecified = style.height.unit !== "auto";
  const widthPair = needsIntrinsicPair(style.width, style.minWidth, style.maxWidth)
    ? widthIntrinsicPair(node, defaultTextHeight, measurementCache)
    : undefined;
  let width = resolveOuterSize(style.width, allocated.width, allocated.width, horizontalExtras, boxSizing, widthPair);
  width = clampOuterSize(
    width,
    allocated.width,
    style.minWidth,
    style.maxWidth,
    horizontalExtras,
    boxSizing,
    widthPair,
  );
  const measurementWidth = Math.max(1, width - horizontalExtras);
  const intrinsic = measureNodeIntrinsic(node, measurementWidth, defaultTextHeight, measurementCache);
  // Height-axis content bounds are the wrapped height at the resolved width —
  // the documented terminal subset (min and max coincide).
  const heightPair = needsIntrinsicPair(style.height, style.minHeight, style.maxHeight)
    ? { min: intrinsic.height, max: intrinsic.height }
    : undefined;
  const fallbackHeight = isRoot || fillAllocated ? allocated.height : intrinsic.height + verticalExtras;
  let height = resolveOuterSize(style.height, allocated.height, fallbackHeight, verticalExtras, boxSizing, heightPair);
  height = clampOuterSize(
    height,
    allocated.height,
    style.minHeight,
    style.maxHeight,
    verticalExtras,
    boxSizing,
    heightPair,
  );

  const ratio = validAspectRatio(style.aspectRatio);
  if (ratio !== undefined && widthSpecified !== heightSpecified) {
    if (widthSpecified) {
      const ratioWidth = boxSizing === "border-box" ? width : Math.max(0, width - horizontalExtras);
      const ratioHeight = Math.floor(ratioWidth / ratio);
      height = boxSizing === "border-box" ? ratioHeight : ratioHeight + verticalExtras;
      height = clampOuterSize(
        height,
        allocated.height,
        style.minHeight,
        style.maxHeight,
        verticalExtras,
        boxSizing,
        heightPair,
      );
    } else {
      const ratioHeight = boxSizing === "border-box" ? height : Math.max(0, height - verticalExtras);
      const ratioWidth = Math.floor(ratioHeight * ratio);
      width = boxSizing === "border-box" ? ratioWidth : ratioWidth + horizontalExtras;
      width = clampOuterSize(
        width,
        allocated.width,
        style.minWidth,
        style.maxWidth,
        horizontalExtras,
        boxSizing,
        widthPair,
      );
    }
  } else if (ratio !== undefined && !widthSpecified && !heightSpecified && !isRoot && !fillAllocated) {
    const ratioWidth = boxSizing === "border-box" ? width : Math.max(0, width - horizontalExtras);
    const ratioHeight = Math.floor(ratioWidth / ratio);
    height = boxSizing === "border-box" ? ratioHeight : ratioHeight + verticalExtras;
    height = clampOuterSize(
      height,
      allocated.height,
      style.minHeight,
      style.maxHeight,
      verticalExtras,
      boxSizing,
      heightPair,
    );
  }
  return {
    column: allocated.column,
    row: allocated.row,
    width: Math.min(width, allocated.width),
    height: Math.min(height, allocated.height),
  };
}

function resolveOuterSize(
  length: LayoutLengthValue,
  available: number,
  fallbackOuter: number,
  extras: number,
  boxSizing: NonNullable<ComputedLayoutStyle["boxSizing"]>,
  intrinsic?: IntrinsicSizePair,
): number {
  if (length.unit === "auto") return Math.max(0, Math.floor(fallbackOuter));
  // An unmeasured intrinsic keyword behaves as auto rather than as zero.
  if (isIntrinsicLayoutLengthUnit(length.unit) && !intrinsic) return Math.max(0, Math.floor(fallbackOuter));
  const context = intrinsic
    ? { ...activeLengthContext(), intrinsicMin: intrinsic.min, intrinsicMax: intrinsic.max }
    : activeLengthContext();
  const authored = resolveLayoutLength(length, available, 0, context);
  // Intrinsic keywords are content sizes, so the border box always adds extras.
  const addExtras = boxSizing === "content-box" || isIntrinsicLayoutLengthUnit(length.unit);
  return authored + (addExtras ? extras : 0);
}

function clampOuterSize(
  size: number,
  available: number,
  min: LayoutLengthValue,
  max: LayoutLengthValue,
  extras: number,
  boxSizing: NonNullable<ComputedLayoutStyle["boxSizing"]>,
  intrinsic?: IntrinsicSizePair,
): number {
  const lower = resolveOuterSize(min, available, 0, extras, boxSizing, intrinsic);
  const upper = max.unit === "auto"
    ? Number.MAX_SAFE_INTEGER
    : resolveOuterSize(max, available, available, extras, boxSizing, intrinsic);
  return Math.min(Math.max(0, Math.floor(available)), Math.max(lower, Math.min(upper, Math.max(0, Math.floor(size)))));
}

function clampOuterSizeWithoutAllocation(
  size: number,
  available: number,
  min: LayoutLengthValue,
  max: LayoutLengthValue,
  extras: number,
  boxSizing: NonNullable<ComputedLayoutStyle["boxSizing"]>,
  intrinsic?: IntrinsicSizePair,
): number {
  const lower = resolveOuterSize(min, available, 0, extras, boxSizing, intrinsic);
  const upper = max.unit === "auto"
    ? Number.MAX_SAFE_INTEGER
    : resolveOuterSize(max, available, available, extras, boxSizing, intrinsic);
  return Math.max(lower, Math.min(upper, Math.max(0, Math.floor(size))));
}

function validAspectRatio(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function preferredBlockChildSize(
  node: LayoutNode,
  bounds: Rectangle,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): LayoutIntrinsicSize {
  const padding = resolveBoxEdges(authoredLengths(node.style)?.padding, node.style.padding, bounds.width);
  const rect = resolveNodeRect(node, bounds, padding, false, false, defaultTextHeight, measurementCache);
  return { width: rect.width, height: rect.height };
}

function preferredAbsoluteChildSize(
  node: LayoutNode,
  containingBlock: Rectangle,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): LayoutIntrinsicSize {
  const style = node.style;
  const padding = resolveBoxEdges(authoredLengths(style)?.padding, style.padding, containingBlock.width);
  const horizontalExtras = style.border.left + style.border.right + padding.left + padding.right;
  const verticalExtras = style.border.top + style.border.bottom + padding.top + padding.bottom;
  const boxSizing = style.boxSizing ?? "border-box";
  const intrinsic = measureNodeIntrinsic(
    node,
    Math.max(1, containingBlock.width - horizontalExtras),
    defaultTextHeight,
    measurementCache,
  );
  const widthSpecified = style.width.unit !== "auto";
  const heightSpecified = style.height.unit !== "auto";
  let width = resolveOuterSize(
    style.width,
    containingBlock.width,
    widthSpecified ? 0 : containingBlock.width,
    horizontalExtras,
    boxSizing,
  );
  let height = resolveOuterSize(
    style.height,
    containingBlock.height,
    heightSpecified ? 0 : intrinsic.height + verticalExtras,
    verticalExtras,
    boxSizing,
  );
  width = clampOuterSizeWithoutAllocation(
    width,
    containingBlock.width,
    style.minWidth,
    style.maxWidth,
    horizontalExtras,
    boxSizing,
  );
  height = clampOuterSizeWithoutAllocation(
    height,
    containingBlock.height,
    style.minHeight,
    style.maxHeight,
    verticalExtras,
    boxSizing,
  );

  const ratio = validAspectRatio(style.aspectRatio);
  if (ratio !== undefined && widthSpecified !== heightSpecified) {
    if (widthSpecified) {
      const ratioWidth = boxSizing === "border-box" ? width : Math.max(0, width - horizontalExtras);
      height = (boxSizing === "border-box" ? 0 : verticalExtras) + Math.floor(ratioWidth / ratio);
    } else {
      const ratioHeight = boxSizing === "border-box" ? height : Math.max(0, height - verticalExtras);
      width = (boxSizing === "border-box" ? 0 : horizontalExtras) + Math.floor(ratioHeight * ratio);
    }
  }
  return { width, height };
}

function absoluteChildBounds(
  node: LayoutNode,
  containingBlock: Rectangle,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): Rectangle {
  const style = node.style;
  const left = resolveInset(style.inset.left, containingBlock.width);
  const right = resolveInset(style.inset.right, containingBlock.width);
  const top = resolveInset(style.inset.top, containingBlock.height);
  const bottom = resolveInset(style.inset.bottom, containingBlock.height);
  const intrinsic = preferredAbsoluteChildSize(node, containingBlock, defaultTextHeight, measurementCache);
  const width = left !== undefined && right !== undefined
    ? Math.max(0, containingBlock.width - left - right)
    : intrinsic.width;
  const height = top !== undefined && bottom !== undefined
    ? Math.max(0, containingBlock.height - top - bottom)
    : intrinsic.height;
  const column = left !== undefined
    ? containingBlock.column + left
    : right !== undefined
    ? containingBlock.column + Math.max(0, containingBlock.width - right - width)
    : containingBlock.column;
  const row = top !== undefined
    ? containingBlock.row + top
    : bottom !== undefined
    ? containingBlock.row + Math.max(0, containingBlock.height - bottom - height)
    : containingBlock.row;

  return { column, row, width, height };
}

function resolveInset(value: ComputedLayoutStyle["inset"]["top"], available: number): number | undefined {
  return value.unit === "auto" || value.unit === "fr"
    ? undefined
    : resolveLayoutLength(value, available, 0, activeLengthContext());
}

function preferredFlexBasis(
  node: LayoutNode,
  bounds: Rectangle,
  direction: FlexDirection,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): number {
  const mainAvailable = direction === "row" ? bounds.width : bounds.height;
  const mainLength = direction === "row" ? node.style.width : node.style.height;
  const padding = resolveBoxEdges(authoredLengths(node.style)?.padding, node.style.padding, bounds.width);
  const extras = direction === "row"
    ? padding.left + padding.right + node.style.border.left + node.style.border.right
    : padding.top + padding.bottom + node.style.border.top + node.style.border.bottom;
  const boxSizing = node.style.boxSizing ?? "border-box";
  const mainAxis = direction === "row" ? "width" as const : "height" as const;
  if (node.style.flexBasis.unit !== "auto" && !isIntrinsicLayoutLengthUnit(node.style.flexBasis.unit)) {
    return resolveOuterSize(node.style.flexBasis, mainAvailable, 0, extras, boxSizing);
  }
  if (mainLength.unit !== "auto") {
    const pair = isIntrinsicLayoutLengthUnit(mainLength.unit)
      ? flexIntrinsicPair(node, bounds, mainAxis, defaultTextHeight, measurementCache)
      : undefined;
    return resolveOuterSize(mainLength, mainAvailable, 0, extras, boxSizing, pair);
  }
  const crossLength = direction === "row" ? node.style.height : node.style.width;
  if (validAspectRatio(node.style.aspectRatio) !== undefined && crossLength.unit !== "auto") {
    const preferred = preferredBlockChildSize(node, bounds, defaultTextHeight, measurementCache);
    return direction === "row" ? preferred.width : preferred.height;
  }
  const intrinsic = measureNodeIntrinsic(node, Math.max(1, bounds.width), defaultTextHeight, measurementCache);
  const fallback = direction === "row" ? intrinsic.width : intrinsic.height;
  return Math.max(1, fallback + extras);
}

function preferredFlexCrossSize(
  node: LayoutNode,
  bounds: Rectangle,
  direction: FlexDirection,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): number {
  const crossAvailable = direction === "row" ? bounds.height : bounds.width;
  const crossLength = direction === "row" ? node.style.height : node.style.width;
  const padding = resolveBoxEdges(authoredLengths(node.style)?.padding, node.style.padding, bounds.width);
  const extras = direction === "row"
    ? padding.top + padding.bottom + node.style.border.top + node.style.border.bottom
    : padding.left + padding.right + node.style.border.left + node.style.border.right;
  const boxSizing = node.style.boxSizing ?? "border-box";
  const crossAxis = direction === "row" ? "height" as const : "width" as const;
  if (crossLength.unit !== "auto") {
    const pair = isIntrinsicLayoutLengthUnit(crossLength.unit)
      ? flexIntrinsicPair(node, bounds, crossAxis, defaultTextHeight, measurementCache)
      : undefined;
    return resolveOuterSize(crossLength, crossAvailable, 0, extras, boxSizing, pair);
  }
  const mainLength = direction === "row" ? node.style.width : node.style.height;
  if (validAspectRatio(node.style.aspectRatio) !== undefined && mainLength.unit !== "auto") {
    const preferred = preferredBlockChildSize(node, bounds, defaultTextHeight, measurementCache);
    return direction === "row" ? preferred.height : preferred.width;
  }
  const intrinsic = measureNodeIntrinsic(node, Math.max(1, bounds.width), defaultTextHeight, measurementCache);
  const fallback = (direction === "row" ? intrinsic.height : intrinsic.width) + extras;
  const min = direction === "row" ? node.style.minHeight : node.style.minWidth;
  const max = direction === "row" ? node.style.maxHeight : node.style.maxWidth;
  const clampPair = needsIntrinsicPair(min, max)
    ? flexIntrinsicPair(node, bounds, crossAxis, defaultTextHeight, measurementCache)
    : undefined;
  return clampOuterSize(Math.max(1, fallback), crossAvailable, min, max, extras, boxSizing, clampPair);
}

function resolveFlexMinimum(
  node: LayoutNode,
  bounds: Rectangle,
  direction: FlexDirection,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): number {
  const length = direction === "row" ? node.style.minWidth : node.style.minHeight;
  const padding = resolveBoxEdges(authoredLengths(node.style)?.padding, node.style.padding, bounds.width);
  const extras = direction === "row"
    ? padding.left + padding.right + node.style.border.left + node.style.border.right
    : padding.top + padding.bottom + node.style.border.top + node.style.border.bottom;
  // min-width: min-content is the content-derived minimum: the item refuses
  // to shrink below its widest unbreakable content.
  const pair = isIntrinsicLayoutLengthUnit(length.unit)
    ? flexIntrinsicPair(node, bounds, direction === "row" ? "width" : "height", defaultTextHeight, measurementCache)
    : undefined;
  return resolveOuterSize(
    length,
    mainSize(bounds, direction),
    0,
    extras,
    node.style.boxSizing ?? "border-box",
    pair,
  );
}

function resolveFlexMaximum(
  node: LayoutNode,
  bounds: Rectangle,
  direction: FlexDirection,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): number | undefined {
  const length = direction === "row" ? node.style.maxWidth : node.style.maxHeight;
  const padding = resolveBoxEdges(authoredLengths(node.style)?.padding, node.style.padding, bounds.width);
  const extras = direction === "row"
    ? padding.left + padding.right + node.style.border.left + node.style.border.right
    : padding.top + padding.bottom + node.style.border.top + node.style.border.bottom;
  const pair = isIntrinsicLayoutLengthUnit(length.unit)
    ? flexIntrinsicPair(node, bounds, direction === "row" ? "width" : "height", defaultTextHeight, measurementCache)
    : undefined;
  return length.unit === "auto" ? undefined : resolveOuterSize(
    length,
    mainSize(bounds, direction),
    mainSize(bounds, direction),
    extras,
    node.style.boxSizing ?? "border-box",
    pair,
  );
}

function flexAxisDirection(direction: ComputedLayoutStyle["flexDirection"]): FlexDirection {
  return direction === "row" || direction === "row-reverse" ? "row" : "column";
}

function flexMainAxisIsReverse(direction: ComputedLayoutStyle["flexDirection"]): boolean {
  return direction === "row-reverse" || direction === "column-reverse";
}

function mainSize(rect: Rectangle, direction: FlexDirection): number {
  return direction === "row" ? rect.width : rect.height;
}

function crossSize(rect: Rectangle, direction: FlexDirection): number {
  return direction === "row" ? rect.height : rect.width;
}

function wrapFlexLines(
  items: readonly FlexLayoutItem[],
  availableMainSize: number,
  gap: number,
): FlexLayoutItem[][] {
  const lines: FlexLayoutItem[][] = [];
  let current: FlexLayoutItem[] = [];
  let used = 0;
  const safeAvailable = Math.max(0, Math.floor(availableMainSize));
  const safeGap = Math.max(0, gap);

  for (const item of items) {
    const itemSize = Math.max(item.min ?? 0, item.basis ?? 0);
    const projected = current.length === 0 ? itemSize : used + safeGap + itemSize;
    if (current.length > 0 && projected > safeAvailable) {
      lines.push(current);
      current = [item];
      used = itemSize;
    } else {
      current.push(item);
      used = projected;
    }
  }

  if (current.length > 0) lines.push(current);
  return lines;
}

function lineFlexCrossSize(
  items: readonly FlexLayoutItem[],
  bounds: Rectangle,
  direction: FlexDirection,
  _alignItems: ComputedLayoutStyle["alignItems"],
  singleLine: boolean,
): number {
  if (singleLine) return crossSize(bounds, direction);
  let size = 1;
  for (const item of items) size = Math.max(size, item.crossSize);
  return size;
}

interface FlexLineDistribution {
  offsets: number[];
  sizes: number[];
}

function distributeFlexLines(
  sourceSizes: readonly number[],
  availableCrossSize: number,
  gap: number,
  alignContent: ComputedLayoutStyle["alignContent"],
  enabled: boolean,
): FlexLineDistribution {
  const sizes = sourceSizes.map((size) => Math.max(0, Math.floor(size)));
  const offsets = new Array<number>(sizes.length);
  if (sizes.length === 0) return { offsets, sizes };

  const safeGap = Math.max(0, Math.floor(gap));
  let used = Math.max(0, sizes.length - 1) * safeGap;
  for (const size of sizes) used += size;
  const free = Math.max(0, Math.floor(availableCrossSize) - used);
  const extraGaps = new Array<number>(Math.max(0, sizes.length - 1)).fill(0);
  let leading = 0;

  if (enabled && alignContent === "stretch") {
    const share = Math.floor(free / sizes.length);
    let remainder = free % sizes.length;
    for (let index = 0; index < sizes.length; index += 1) {
      sizes[index] = (sizes[index] ?? 0) + share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
  } else if (enabled && alignContent === "end") {
    leading = free;
  } else if (enabled && alignContent === "center") {
    leading = Math.floor(free / 2);
  } else if (enabled && alignContent === "space-between" && sizes.length > 1) {
    distributeFlexGapSpace(extraGaps, free);
  } else if (enabled && alignContent === "space-around") {
    const share = Math.floor(free / sizes.length);
    leading = Math.floor(share / 2);
    distributeFlexGapRemainder(extraGaps, share, free % sizes.length);
  } else if (enabled && alignContent === "space-evenly") {
    const share = Math.floor(free / (sizes.length + 1));
    leading = share;
    distributeFlexGapRemainder(extraGaps, share, free % (sizes.length + 1));
  }

  let cursor = leading;
  for (let index = 0; index < sizes.length; index += 1) {
    offsets[index] = cursor;
    cursor += sizes[index] ?? 0;
    if (index < extraGaps.length) cursor += safeGap + (extraGaps[index] ?? 0);
  }
  return { offsets, sizes };
}

function distributeFlexGapSpace(gaps: number[], free: number): void {
  if (gaps.length === 0) return;
  const share = Math.floor(free / gaps.length);
  let remainder = free % gaps.length;
  for (let index = 0; index < gaps.length; index += 1) {
    gaps[index] = share + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
}

function distributeFlexGapRemainder(gaps: number[], share: number, remainder: number): void {
  for (let index = 0; index < gaps.length; index += 1) {
    gaps[index] = share + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
}

function flexLineRects(
  bounds: Rectangle,
  direction: FlexDirection,
  items: readonly FlexLayoutItem[],
  gap: number,
  justifyContent: LayoutJustifyContent,
  reverseMainAxis: boolean,
): FlexLineLayout {
  const rects = flexRects(bounds, direction, items, gap);
  const sizes = new Array<number>(items.length);
  const margins: Record<string, BoxEdges<number>> = {};
  let usedSize = 0;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const size = mainSize(rects[item.id] ?? bounds, direction);
    sizes[index] = size;
    usedSize += size;
    margins[item.id] = { ...item.margin };
  }
  const used = usedSize + Math.max(0, items.length - 1) * gap;
  const free = Math.max(0, mainSize(bounds, direction) - used);
  let leading = 0;
  let resolvedGap = gap;
  let remainder = 0;
  const autoEdges: Array<{ item: FlexLayoutItem; edge: keyof BoxEdges<number> }> = [];
  for (const item of items) {
    const startEdge = direction === "row" ? "left" : "top";
    const endEdge = direction === "row" ? "right" : "bottom";
    if (item.autoMargin[startEdge]) autoEdges.push({ item, edge: startEdge });
    if (item.autoMargin[endEdge]) autoEdges.push({ item, edge: endEdge });
  }

  if (autoEdges.length > 0) {
    const share = Math.floor(free / autoEdges.length);
    let autoRemainder = free % autoEdges.length;
    for (const autoEdge of autoEdges) {
      const margin = margins[autoEdge.item.id]!;
      margin[autoEdge.edge] += share + (autoRemainder > 0 ? 1 : 0);
      if (autoRemainder > 0) autoRemainder -= 1;
    }
  } else if (justifyContent === "end") {
    leading = free;
  } else if (justifyContent === "center") {
    leading = Math.floor(free / 2);
  } else if (justifyContent === "space-between" && items.length > 1) {
    resolvedGap += Math.floor(free / (items.length - 1));
    remainder = free % (items.length - 1);
  } else if (justifyContent === "space-around" && items.length > 0) {
    const share = Math.floor(free / items.length);
    leading = Math.floor(share / 2);
    resolvedGap += share;
    remainder = free % items.length;
  } else if (justifyContent === "space-evenly" && items.length > 0) {
    const share = Math.floor(free / (items.length + 1));
    leading = share;
    resolvedGap += share;
    remainder = free % (items.length + 1);
  }

  const adjusted: Record<string, Rectangle> = {};
  let cursor = (direction === "row" ? bounds.column : bounds.row) + leading;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const margin = margins[item.id]!;
    const autoSize = direction === "row"
      ? (item.autoMargin.left ? margin.left : 0) + (item.autoMargin.right ? margin.right : 0)
      : (item.autoMargin.top ? margin.top : 0) + (item.autoMargin.bottom ? margin.bottom : 0);
    const size = (sizes[index] ?? 0) + autoSize;
    adjusted[item.id] = direction === "row"
      ? { column: cursor, row: bounds.row, width: size, height: bounds.height }
      : { column: bounds.column, row: cursor, width: bounds.width, height: size };
    cursor += size + resolvedGap + (remainder > 0 && index < items.length - 1 ? 1 : 0);
    if (remainder > 0 && index < items.length - 1) remainder -= 1;
  }

  if (reverseMainAxis) {
    for (const rect of Object.values(adjusted)) {
      if (direction === "row") {
        rect.column = bounds.column + bounds.width - (rect.column - bounds.column) - rect.width;
      } else {
        rect.row = bounds.row + bounds.height - (rect.row - bounds.row) - rect.height;
      }
    }
  }

  return { rects: adjusted, margins };
}

function alignFlexItemRect(
  rect: Rectangle,
  item: FlexLayoutItem,
  direction: FlexDirection,
  alignItems: ComputedLayoutStyle["alignItems"],
  sourceMargin: BoxEdges<number>,
): AlignedFlexItem {
  const margin = { ...sourceMargin };
  const startEdge = direction === "row" ? "top" : "left";
  const endEdge = direction === "row" ? "bottom" : "right";
  const startAuto = item.autoMargin[startEdge];
  const endAuto = item.autoMargin[endEdge];
  if (startAuto || endAuto) {
    const availableCross = crossSize(rect, direction);
    const free = Math.max(0, availableCross - Math.min(availableCross, Math.max(0, item.crossSize)));
    if (startAuto && endAuto) {
      margin[startEdge] += Math.ceil(free / 2);
      margin[endEdge] += Math.floor(free / 2);
    } else if (startAuto) {
      margin[startEdge] += free;
    } else {
      margin[endEdge] += free;
    }
    return { rect, margin };
  }

  if (alignItems === "stretch") return { rect, margin };

  const availableCross = crossSize(rect, direction);
  const size = Math.min(availableCross, Math.max(0, item.crossSize));
  let offset = 0;
  if (alignItems === "end") offset = availableCross - size;
  else if (alignItems === "center") offset = Math.floor((availableCross - size) / 2);

  return {
    rect: direction === "row"
      ? { ...rect, row: rect.row + offset, height: size }
      : { ...rect, column: rect.column + offset, width: size },
    margin,
  };
}

function measureNodeIntrinsic(
  node: LayoutNode,
  availableWidth: number,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): LayoutIntrinsicSize {
  const cacheKey = measurementCache ? intrinsicMeasurementCacheKey(node, availableWidth, defaultTextHeight) : undefined;
  if (cacheKey) {
    const cached = measurementCache?.get(cacheKey);
    if (cached) return cached;
  }

  const intrinsicWidth = node.intrinsic?.width;
  const measurementWidth = intrinsicWidth === undefined ? availableWidth : Math.max(1, Math.floor(intrinsicWidth));
  let measured = measureNodeIntrinsicBase(node, measurementWidth, defaultTextHeight, measurementCache);
  if (node.intrinsic?.width !== undefined || node.intrinsic?.height !== undefined) {
    measured = {
      width: node.intrinsic.width === undefined ? measured.width : Math.max(0, Math.floor(node.intrinsic.width)),
      height: node.intrinsic.height === undefined
        ? measured.height
        : Math.max(defaultTextHeight, Math.floor(node.intrinsic.height)),
    };
  }
  if (cacheKey) measurementCache?.set(cacheKey, measured);
  return measured;
}

function measureNodeIntrinsicBase(
  node: LayoutNode,
  availableWidth: number,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): LayoutIntrinsicSize {
  if (node.text) {
    return measureTextIntrinsic(node.text, availableWidth, defaultTextHeight, node.style);
  }
  if (node.children.length === 0) {
    return { width: 1, height: defaultTextHeight };
  }

  if (node.style.display === "flex" && flexAxisDirection(node.style.flexDirection) === "row") {
    let width = 0;
    let height = defaultTextHeight;
    let count = 0;
    const authoredGap = authoredLengths(node.style)?.columnGap;
    const gap = authoredGap
      ? resolveLayoutLength(authoredGap, availableWidth, 0, activeLengthContext())
      : Math.max(0, node.style.columnGap || node.style.gap);
    for (const child of node.children) {
      if (!participatesInLayout(child)) continue;
      const childSize = childLayoutIntrinsicSize(child, availableWidth, defaultTextHeight, measurementCache);
      width += childSize.width;
      height = Math.max(height, childSize.height);
      count += 1;
    }
    return {
      width: width + Math.max(0, count - 1) * gap,
      height,
    };
  }
  let width = 1;
  let height = 0;
  let count = 0;
  const authoredGap = authoredLengths(node.style)?.rowGap;
  const gap = authoredGap
    ? authoredGap.unit === "cell" ? resolveLayoutLength(authoredGap, 0, 0) : 0
    : Math.max(0, node.style.rowGap || node.style.gap);
  for (const child of node.children) {
    if (!participatesInLayout(child)) continue;
    const childSize = childLayoutIntrinsicSize(child, availableWidth, defaultTextHeight, measurementCache);
    width = Math.max(width, childSize.width);
    if (count > 0) height += gap;
    height += Math.max(defaultTextHeight, childSize.height);
    count += 1;
  }
  return {
    width,
    height: count === 0 ? defaultTextHeight : height,
  };
}

function participatesInLayout(node: LayoutNode): boolean {
  return node.style.display !== "none" && node.style.position !== "absolute";
}

function childLayoutIntrinsicSize(
  node: LayoutNode,
  availableWidth: number,
  defaultTextHeight: number,
  measurementCache?: LayoutMeasurementCache,
): LayoutIntrinsicSize {
  const measured = measureNodeIntrinsic(node, availableWidth, defaultTextHeight, measurementCache);
  const width = node.style.width.unit === "auto"
    ? measured.width
    : resolveLayoutLength(node.style.width, availableWidth, measured.width, activeLengthContext());
  const height = node.style.height.unit === "auto" ? measured.height : resolveLayoutLength(
    node.style.height,
    Math.max(defaultTextHeight, measured.height),
    measured.height,
    activeLengthContext(),
  );
  return {
    width: Math.max(0, width),
    height: Math.max(defaultTextHeight, height),
  };
}

function measureTextIntrinsic(
  text: string,
  availableWidth: number,
  defaultTextHeight: number,
  style: ComputedLayoutStyle,
): LayoutIntrinsicSize {
  return measureTerminalTextIntrinsic(text, availableWidth, defaultTextHeight, {
    wrap: style.whiteSpace !== "nowrap" && style.whiteSpace !== "pre",
    breakWords: style.overflowWrap === "anywhere" || style.overflowWrap === "break-word",
    preserveNewlines: true,
  });
}

function intrinsicMeasurementCacheKey(node: LayoutNode, availableWidth: number, defaultTextHeight: number): string {
  return "v2" +
    "\u001f" + (activeLengthViewport ? `${activeLengthViewport.width}x${activeLengthViewport.height}` : "-") +
    "\u001f" + Math.max(1, Math.floor(availableWidth)) +
    "\u001f" + Math.max(1, Math.floor(defaultTextHeight)) +
    "\u001f" + intrinsicNodeSignature(node, "\u001f", false);
}

function intrinsicNodeSignature(
  node: LayoutNode,
  childSeparator = "\u001e",
  terminateLeaf = true,
): string {
  const authored = authoredLengths(node.style);
  let signature = node.tag +
    "\u001f" + (node.text ?? "") +
    "\u001f" + (node.intrinsic?.width ?? "") +
    "\u001f" + (node.intrinsic?.height ?? "") +
    "\u001f" + node.style.display +
    "\u001f" + node.style.position +
    "\u001f" + (node.style.dock ?? "") +
    "\u001f" + (node.style.alignHorizontal ?? "") +
    "\u001f" + (node.style.alignVertical ?? "") +
    "\u001f" + node.style.order +
    "\u001f" + node.style.flexDirection +
    "\u001f" + layoutLengthSignature(node.style.flexBasis) +
    "\u001f" + layoutLengthSignature(node.style.width) +
    "\u001f" + layoutLengthSignature(node.style.height) +
    "\u001f" + layoutLengthSignature(node.style.minWidth) +
    "\u001f" + layoutLengthSignature(node.style.minHeight) +
    "\u001f" + layoutLengthSignature(node.style.maxWidth) +
    "\u001f" + layoutLengthSignature(node.style.maxHeight) +
    "\u001f" + (node.style.aspectRatio ?? "auto") +
    "\u001f" + (node.style.boxSizing ?? "border-box") +
    "\u001f" + boxEdgeSignature(authored?.margin, node.style.margin) +
    "\u001f" + boxEdgeSignature(authored?.padding, node.style.padding) +
    "\u001f" + numericBoxEdgeSignature(node.style.border) +
    "\u001f" + node.style.gap +
    "\u001f" + node.style.rowGap +
    "\u001f" + node.style.columnGap +
    "\u001f" + (authored?.rowGap ? layoutLengthSignature(authored.rowGap) : "legacy") +
    "\u001f" + (authored?.columnGap ? layoutLengthSignature(authored.columnGap) : "legacy") +
    "\u001f" + node.style.whiteSpace +
    "\u001f" + node.style.overflowWrap;
  if (node.children.length === 0) return terminateLeaf ? signature + "\u001f" : signature;
  signature += "\u001f";
  for (let index = 0; index < node.children.length; index += 1) {
    if (index > 0) signature += childSeparator;
    signature += intrinsicNodeSignature(node.children[index]!);
  }
  return signature;
}

function boxEdgeSignature(
  authored: BoxEdges<LayoutLengthValue> | undefined,
  legacy: BoxEdges<number>,
): string {
  if (!authored) return numericBoxEdgeSignature(legacy);
  return [authored.top, authored.right, authored.bottom, authored.left].map(layoutLengthSignature).join(":");
}

function numericBoxEdgeSignature(edges: BoxEdges<number>): string {
  return `${edges.top}:${edges.right}:${edges.bottom}:${edges.left}`;
}

function layoutLengthSignature(value: ComputedLayoutStyle["width"]): string {
  return `${value.unit}:${value.value}`;
}

function scrollSize(
  node: LayoutNode,
  contentRect: Rectangle,
  children: readonly ComputedLayoutBox[],
): LayoutIntrinsicSize {
  const textSize = node.text
    ? measureTextIntrinsic(node.text, Math.max(1, contentRect.width), 1, node.style)
    : { width: 0, height: 0 };
  let right = contentRect.column + Math.max(contentRect.width, textSize.width);
  let bottom = contentRect.row + Math.max(contentRect.height, textSize.height);
  for (const child of children) {
    right = Math.max(right, child.rect.column + child.rect.width + child.margin.right);
    bottom = Math.max(bottom, child.rect.row + child.rect.height + child.margin.bottom);
  }
  return {
    width: Math.max(contentRect.width, right - contentRect.column),
    height: Math.max(contentRect.height, bottom - contentRect.row),
  };
}
