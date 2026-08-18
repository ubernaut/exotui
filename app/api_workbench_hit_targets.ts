// Copyright 2023 Im-Beast. MIT license.

// The immediate-mode hit stack these two workbench demos are built on. It used
// to live in the library, and plan 040 removed it there: exotui's pointer
// story is now MouseInteractionRouter, one authority with z-ordered targets, a
// transform applied at ingress, and drag capture. Deleting it was right for the
// library and wrong for these demos, which are immediate-mode by design — they
// repaint, they re-add their targets, and a per-frame LIFO stack is exactly the
// shape that fits. So it lives here, beside its only two callers, instead of
// being public API nobody else should reach for.
//
// New code wants MouseInteractionRouter. This is for the demos that predate it.

import { clipRect, contains, intersects, type Rectangle } from "@ubernaut/deno-tui";

/** Hit target record used by pointer routers and immediate-mode workbench renderers. */
export interface HitTarget<Action> {
  rect: Rectangle;
  action: Action;
}

/** LIFO hit target stack where later targets are visually above earlier targets. */
export class HitTargetStack<Action> {
  #targets: Array<HitTarget<Action>> = [];

  get length(): number {
    return this.#targets.length;
  }

  add(rect: Rectangle, action: Action): void {
    this.#targets.push({ rect, action });
  }

  clear(): void {
    this.#targets = [];
  }

  at(index: number): HitTarget<Action> | undefined {
    return this.#targets[index];
  }

  remove(index: number): void {
    this.#targets.splice(index, 1);
  }

  updateRect(index: number, rect: Rectangle): void {
    const target = this.#targets[index];
    if (!target) return;
    target.rect = rect;
  }

  find(x: number, y: number): HitTarget<Action> | undefined {
    for (let index = this.#targets.length - 1; index >= 0; index -= 1) {
      const target = this.#targets[index]!;
      if (contains(target.rect, x, y)) return target;
    }
  }

  findExpanded(
    x: number,
    y: number,
    expand: (rect: Rectangle, target: HitTarget<Action>) => Rectangle | undefined,
  ): HitTarget<Action> | undefined {
    for (let index = this.#targets.length - 1; index >= 0; index -= 1) {
      const target = this.#targets[index]!;
      const rect = expand(target.rect, target);
      if (rect && contains(rect, x, y)) return { rect, action: target.action };
    }
  }

  entries(): Array<HitTarget<Action>> {
    const entries = new Array<HitTarget<Action>>(this.#targets.length);
    for (let index = 0; index < this.#targets.length; index += 1) {
      const target = this.#targets[index]!;
      entries[index] = { rect: { ...target.rect }, action: target.action };
    }
    return entries;
  }
}

/** Options for translating and clipping a suffix of a hit target stack. */
export interface TranslateHitTargetsOptions {
  startIndex: number;
  columnDelta?: number;
  rowDelta?: number;
  clip: Rectangle;
}

/**
 * Translates all hit targets added after a known stack index, clipping or removing targets that leave the viewport.
 */
export function translateHitTargets<Action>(
  targets: HitTargetStack<Action>,
  options: TranslateHitTargetsOptions,
): void {
  const columnDelta = options.columnDelta ?? 0;
  const rowDelta = options.rowDelta ?? 0;
  for (let index = targets.length - 1; index >= options.startIndex; index -= 1) {
    const target = targets.at(index)!;
    const translated = {
      ...target.rect,
      column: target.rect.column + columnDelta,
      row: target.rect.row + rowDelta,
    };
    if (!intersects(translated, options.clip)) {
      targets.remove(index);
      continue;
    }
    targets.updateRect(index, clipRect(translated, options.clip));
  }
}
