// Copyright 2023 Im-Beast. MIT license.

// Rectangle arithmetic for terminal-cell layout and hit testing.
//
// This file also carried HitTargetStack, an immediate-mode rect-to-action
// stack that answered "what is at this cell" with its own precedence rules and
// had no production consumer. MouseInteractionRouter answers that question
// with paint order, drag capture, live bounds and region classification, and
// is what the desktop actually uses, so the second answer is gone: one
// question, one API (plan/todo/040).
import type { Rectangle } from "../types.ts";

/**
 * Returns true when a terminal-cell coordinate is inside a rectangle.
 *
 * The canonical implementation: the pointer path had grown seven copies of
 * this, and a cell belonging to different things depending on which copy asked
 * is how clicks went missing. Negative sizes clamp to empty rather than
 * inverting, which is what the pointer router always did defensively.
 */
export function contains(rect: Rectangle, x: number, y: number): boolean {
  return x >= rect.column && y >= rect.row &&
    x < rect.column + Math.max(0, rect.width) &&
    y < rect.row + Math.max(0, rect.height);
}

/** Returns true when two rectangles overlap. */
export function intersects(left: Rectangle, right: Rectangle): boolean {
  return left.column < right.column + right.width && left.column + left.width > right.column &&
    left.row < right.row + right.height && left.row + left.height > right.row;
}

/** Clips a rectangle to another rectangle. */
export function clipRect(rect: Rectangle, clip: Rectangle): Rectangle {
  const column = Math.max(rect.column, clip.column);
  const row = Math.max(rect.row, clip.row);
  const right = Math.min(rect.column + rect.width, clip.column + clip.width);
  const bottom = Math.min(rect.row + rect.height, clip.row + clip.height);
  return { column, row, width: Math.max(0, right - column), height: Math.max(0, bottom - row) };
}

/** Insets a rectangle by the same amount on every side. */
export function inset(rect: Rectangle, amount: number): Rectangle {
  return {
    column: rect.column + amount,
    row: rect.row + amount,
    width: Math.max(0, rect.width - amount * 2),
    height: Math.max(0, rect.height - amount * 2),
  };
}
