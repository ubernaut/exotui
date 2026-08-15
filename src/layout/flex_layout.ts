// Copyright 2023 Im-Beast. MIT license.
import type { Rectangle } from "../types.ts";

/** Public interface describing a flex Item. */
export interface FlexItem<T extends string = string> {
  id: T;
  basis?: number;
  grow?: number;
  shrink?: number;
  min?: number;
  max?: number;
}

/** Public type alias for a flex Direction. */
export type FlexDirection = "row" | "column";

const MAX_FLEX_SIZE = Number.MAX_SAFE_INTEGER;

/** Public helper for flex Rects. */
export function flexRects<T extends string>(
  bounds: Rectangle,
  direction: FlexDirection,
  items: readonly FlexItem<T>[],
  gap = 0,
): Record<T, Rectangle> {
  const rects = {} as Record<T, Rectangle>;
  const mainSize = direction === "row" ? bounds.width : bounds.height;
  const crossSize = direction === "row" ? bounds.height : bounds.width;
  const safeGap = Math.max(0, gap);
  const available = Math.max(0, mainSize - Math.max(0, items.length - 1) * safeGap);
  const sizes = solveFlexSizes(available, items);

  let cursor = direction === "row" ? bounds.column : bounds.row;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const size = sizes[index] ?? 0;
    rects[item.id] = direction === "row"
      ? { column: cursor, row: bounds.row, width: size, height: crossSize }
      : { column: bounds.column, row: cursor, width: crossSize, height: size };
    cursor += size + safeGap;
  }

  return rects;
}

function solveFlexSizes<T extends string>(total: number, items: readonly FlexItem<T>[]) {
  if (items.length === 0 || total <= 0) {
    const empty = new Array<number>(items.length);
    for (let index = 0; index < items.length; index += 1) empty[index] = 0;
    return empty;
  }

  const minimums = new Array<number>(items.length);
  const maximums = new Array<number>(items.length);
  const sizes = new Array<number>(items.length);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const min = Math.max(0, Math.floor(item.min ?? 0));
    const rawMax = item.max == null ? MAX_FLEX_SIZE : Math.floor(item.max);
    const max = Math.max(min, rawMax);
    const basis = item.basis == null ? min : Math.floor(item.basis);
    minimums[index] = min;
    maximums[index] = max;
    sizes[index] = Math.min(max, Math.max(min, basis));
  }

  let delta = total - sum(sizes);
  if (delta > 0) {
    const weights = flexWeights(items, "grow");
    distributePositive(sizes, delta, weights, maximums);
    return sizes;
  }

  if (delta < 0) {
    const weights = flexWeights(items, "shrink");
    delta = -delta;
    // Shrinking stops at each item's minimum (and skips zero-shrink items):
    // content that cannot fit overflows the container and is reported through
    // the shared overflow inspection, never silently squeezed below an
    // explicit minimum.
    distributeNegative(sizes, delta, weights, minimums);
  }

  return sizes;
}

/**
 * Distributes `extra` cells by weight with a largest-remainder pass, so equal
 * weights end within one cell of each other: every item's share is computed
 * from the same round base, then the leftover is handed out one cell at a
 * time in item order. Rounds repeat only when a maximum capped an item and
 * freed weight for the rest.
 */
function distributePositive(sizes: number[], extra: number, weights: number[], maximums: number[]) {
  let remaining = extra;
  while (remaining > 0) {
    let totalWeight = 0;
    for (let index = 0; index < sizes.length; index += 1) {
      const room = Math.max(0, (maximums[index] ?? MAX_FLEX_SIZE) - (sizes[index] ?? 0));
      if (room > 0 && flexRoundWeight(weights, index) > 0) totalWeight += flexRoundWeight(weights, index);
    }
    if (totalWeight === 0) break;

    const round = remaining;
    let used = 0;
    for (let index = 0; index < sizes.length; index += 1) {
      if (remaining <= 0) break;
      const room = Math.max(0, (maximums[index] ?? MAX_FLEX_SIZE) - (sizes[index] ?? 0));
      const weight = flexRoundWeight(weights, index);
      if (room <= 0 || weight <= 0) continue;
      const delta = Math.min(room, Math.floor(round * (weight / totalWeight)), remaining);
      if (delta <= 0) continue;
      sizes[index] = (sizes[index] ?? 0) + delta;
      remaining -= delta;
      used += delta;
    }
    // One-cell remainder pass in item order.
    for (let index = 0; index < sizes.length && remaining > 0; index += 1) {
      const room = Math.max(0, (maximums[index] ?? MAX_FLEX_SIZE) - (sizes[index] ?? 0));
      if (room <= 0 || flexRoundWeight(weights, index) <= 0) continue;
      sizes[index] = (sizes[index] ?? 0) + 1;
      remaining -= 1;
      used += 1;
    }

    if (used === 0) break;
  }
}

/** Same fair-round shape as {@linkcode distributePositive}, shrinking toward minimums. */
function distributeNegative(sizes: number[], deficit: number, weights: number[], minimums: number[]) {
  let remaining = deficit;
  while (remaining > 0) {
    let totalWeight = 0;
    for (let index = 0; index < sizes.length; index += 1) {
      const room = Math.max(0, (sizes[index] ?? 0) - (minimums[index] ?? 0));
      if (room > 0 && flexRoundWeight(weights, index) > 0) totalWeight += flexRoundWeight(weights, index);
    }
    if (totalWeight === 0) break;

    const round = remaining;
    let used = 0;
    for (let index = 0; index < sizes.length; index += 1) {
      if (remaining <= 0) break;
      const room = Math.max(0, (sizes[index] ?? 0) - (minimums[index] ?? 0));
      const weight = flexRoundWeight(weights, index);
      if (room <= 0 || weight <= 0) continue;
      const delta = Math.min(room, Math.floor(round * (weight / totalWeight)), remaining);
      if (delta <= 0) continue;
      sizes[index] = (sizes[index] ?? 0) - delta;
      remaining -= delta;
      used += delta;
    }
    for (let index = 0; index < sizes.length && remaining > 0; index += 1) {
      const room = Math.max(0, (sizes[index] ?? 0) - (minimums[index] ?? 0));
      if (room <= 0 || flexRoundWeight(weights, index) <= 0) continue;
      sizes[index] = (sizes[index] ?? 0) - 1;
      remaining -= 1;
      used += 1;
    }

    if (used === 0) break;
  }
}

/** A zero weight opts the item out of this distribution (flex-grow/shrink: 0). */
function flexRoundWeight(weights: number[], index: number): number {
  return Math.max(0, weights[index] ?? 1);
}

function sum(values: number[]) {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index] ?? 0;
  return total;
}

function flexWeights<T extends string>(items: readonly FlexItem<T>[], key: "grow" | "shrink"): number[] {
  const weights = new Array<number>(items.length);
  for (let index = 0; index < items.length; index += 1) {
    weights[index] = Math.max(0, items[index]![key] ?? 1);
  }
  return weights;
}
