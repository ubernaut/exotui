// Copyright 2023 Im-Beast. MIT license.

// 036 V1: the ScrollBox audit's CONCRETE gap closures, composed onto
// the existing ScrollAreaController rather than a new abstraction.
// Audit result: bidirectional scrolling, offset clamping, and scrollbar
// thumb/glyph/pointer integration already exist; the genuine gaps were
// sticky-edge follow (a log view pinned to the bottom stays pinned when
// content grows, and unpins the moment the user scrolls away), viewport
// culling for large content (only children intersecting the window
// render), configurable wheel acceleration on the caller's clock,
// scrollChildIntoView with margins (minimal movement on both axes), and
// nested input routing (the inner area consumes deltas until clamped at
// its edge, the leftover chains to the parent unless contained).

import type { Offset } from "../types.ts";
import type { ScrollAreaController } from "./scroll_area.ts";

/** A child rectangle in content coordinates. */
export interface ContentRect {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Sticky-edge follow: call `contentResized` INSTEAD of setContentSize.
 * While the offset sits at the tracked edge, growth keeps it there; a
 * user scroll away from the edge unpins until the edge is reached again.
 */
export class StickyEdgeScroll {
  readonly #controller: ScrollAreaController;
  readonly #edge: "bottom" | "right";

  constructor(controller: ScrollAreaController, edge: "bottom" | "right" = "bottom") {
    this.#controller = controller;
    this.#edge = edge;
  }

  /** true when the offset currently sits at the tracked edge. */
  pinned(): boolean {
    const max = this.#controller.maxOffset();
    const offset = this.#controller.offset.peek();
    return this.#edge === "bottom" ? offset.rows >= max.rows : offset.columns >= max.columns;
  }

  /** Resizes content, following the edge only when it was pinned. */
  contentResized(width: number, height: number): Offset {
    const wasPinned = this.pinned();
    this.#controller.setContentSize(width, height);
    if (!wasPinned) return this.#controller.offset.peek();
    const max = this.#controller.maxOffset();
    const offset = this.#controller.offset.peek();
    return this.#edge === "bottom"
      ? this.#controller.scrollTo(offset.columns, max.rows)
      : this.#controller.scrollTo(max.columns, offset.rows);
  }
}

/** Viewport culling: indexes of children intersecting the window. */
export function cullToViewport(
  children: readonly ContentRect[],
  offset: Offset,
  viewportWidth: number,
  viewportHeight: number,
): readonly number[] {
  const visible: number[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    const intersects = child.column < offset.columns + viewportWidth &&
      child.column + child.width > offset.columns &&
      child.row < offset.rows + viewportHeight &&
      child.row + child.height > offset.rows;
    if (intersects) visible.push(index);
  }
  return visible;
}

/**
 * Scrolls the minimal distance on each axis to reveal the child plus
 * its margin; a child already visible produces no movement.
 */
export function scrollChildIntoView(
  controller: ScrollAreaController,
  child: ContentRect,
  options: { readonly margin?: number } = {},
): Offset {
  const margin = Math.max(0, options.margin ?? 0);
  const offset = controller.offset.peek();
  const viewportWidth = controller.viewportWidth.peek();
  const viewportHeight = controller.viewportHeight.peek();
  let columns = offset.columns;
  let rows = offset.rows;
  if (child.column - margin < columns) columns = child.column - margin;
  else if (child.column + child.width + margin > columns + viewportWidth) {
    columns = child.column + child.width + margin - viewportWidth;
  }
  if (child.row - margin < rows) rows = child.row - margin;
  else if (child.row + child.height + margin > rows + viewportHeight) {
    rows = child.row + child.height + margin - viewportHeight;
  }
  return controller.scrollTo(Math.max(0, columns), Math.max(0, rows));
}

/** Wheel acceleration on the caller's clock. */
export class WheelAcceleration {
  readonly #windowMs: number;
  readonly #maxMultiplier: number;
  readonly #rampPerTick: number;
  #lastTickMs?: number;
  #multiplier = 1;

  constructor(
    options: {
      readonly windowMs?: number;
      readonly maxMultiplier?: number;
      readonly rampPerTick?: number;
    } = {},
  ) {
    this.#windowMs = Math.max(1, options.windowMs ?? 120);
    this.#maxMultiplier = Math.max(1, options.maxMultiplier ?? 6);
    this.#rampPerTick = Math.max(0, options.rampPerTick ?? 1);
  }

  /** Rows for one wheel tick; rapid successive ticks accelerate. */
  tick(nowMs: number, baseRows = 1): number {
    if (this.#lastTickMs !== undefined && nowMs - this.#lastTickMs <= this.#windowMs) {
      this.#multiplier = Math.min(this.#maxMultiplier, this.#multiplier + this.#rampPerTick);
    } else {
      this.#multiplier = 1;
    }
    this.#lastTickMs = nowMs;
    return baseRows * this.#multiplier;
  }
}

/**
 * Nested input routing: the inner area consumes the delta until it is
 * clamped at its edge; the leftover chains to the outer area unless the
 * inner declared `contain`.
 */
export function routeNestedScroll(
  inner: ScrollAreaController,
  outer: ScrollAreaController,
  delta: { readonly columns: number; readonly rows: number },
  options: { readonly contain?: boolean } = {},
): { readonly consumedByInner: Offset; readonly chainedToOuter: Offset } {
  const before = inner.offset.peek();
  inner.scrollBy(delta.columns, delta.rows);
  const after = inner.offset.peek();
  const consumed = { columns: after.columns - before.columns, rows: after.rows - before.rows };
  const leftover = { columns: delta.columns - consumed.columns, rows: delta.rows - consumed.rows };
  if (options.contain || (leftover.columns === 0 && leftover.rows === 0)) {
    return { consumedByInner: consumed, chainedToOuter: { columns: 0, rows: 0 } };
  }
  const outerBefore = outer.offset.peek();
  outer.scrollBy(leftover.columns, leftover.rows);
  const outerAfter = outer.offset.peek();
  return {
    consumedByInner: consumed,
    chainedToOuter: {
      columns: outerAfter.columns - outerBefore.columns,
      rows: outerAfter.rows - outerBefore.rows,
    },
  };
}
