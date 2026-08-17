// Copyright 2023 Im-Beast. MIT license.
import { DrawObject, type DrawObjectOptions } from "./draw_object.ts";

import { getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";
import { fitsInRectangle, rectangleEquals, rectangleIntersection } from "../utils/numbers.ts";
import { Effect, type Signal, type SignalOfObject } from "../signals/mod.ts";
import type { Rectangle } from "../types.ts";
import { signalify } from "../utils/signals.ts";
import type { Subscription } from "../signals/types.ts";
import { type DirtyRowSegment, mergeDirtyRowSegmentsInPlace } from "./dirty_region.ts";

/**
 * Type that describes position and size of TextObject
 *
 * When `width` isn't set, it gets automatically calculated depending of given `value` text width
 */
export type TextRectangle = { column: number; row: number; width?: number };

/** Options for configuring text Object. */
export interface TextObjectOptions extends DrawObjectOptions {
  value: string | Signal<string>;
  overwriteRectangle?: boolean | Signal<boolean>;
  rectangle: TextRectangle | SignalOfObject<TextRectangle>;
  multiCodePointSupport?: boolean | Signal<boolean>;
}

/**
 * DrawObject that's responsible for rendering text.
 *
 * Keep in mind its not designed to render mutliline text!
 */
export class TextObject extends DrawObject<"text"> {
  text: Signal<string>;
  valueChars: string[] | string;
  overwriteRectangle: Signal<boolean>;
  multiCodePointSupport: Signal<boolean>;
  rerenderRanges: DirtyRowSegment[][];

  #rectangleSubscription: Subscription<Rectangle>;
  #updateEffect: Effect;

  constructor(options: TextObjectOptions) {
    super("text", options);

    this.text = signalify(options.value);
    this.rectangle = signalify(options.rectangle as Rectangle);
    this.overwriteRectangle = signalify(options.overwriteRectangle ?? false);
    this.multiCodePointSupport = signalify(options.multiCodePointSupport ?? false);
    this.valueChars = this.multiCodePointSupport.value ? getMultiCodePointCharacters(this.text.value) : this.text.value;
    this.rerenderRanges = [];

    const { updateObjects } = this.canvas;

    const update = (
      text: string,
      rectangle: Rectangle,
      multiCodePointSupport: boolean,
      overwriteRectangle: boolean,
    ): void => {
      if (!overwriteRectangle) {
        const lastWidth = rectangle.width;
        rectangle.width = textWidth(text);

        if (rectangle.width !== lastWidth) {
          this.moved = true;
          for (const objectUnder of this.objectsUnder) {
            objectUnder.moved = true;
          }
        }
      }
      rectangle.height = 1;

      const { valueChars: previousValueChars } = this;
      const valueChars: string | string[] = this.valueChars = multiCodePointSupport
        ? getMultiCodePointCharacters(text)
        : text;

      const { row, column, width } = rectangle;
      const barrier = overwriteRectangle
        ? (width < previousValueChars.length ? width : -1)
        : (valueChars.length < previousValueChars.length ? valueChars.length : -1);

      const columnRange = Math.max(valueChars.length, previousValueChars.length);
      if (overwriteRectangle && width !== undefined && valueChars.length >= width) {
        queueChangedOverwriteRanges(this, previousValueChars, valueChars, row, column, width);
        return;
      }

      if (barrier !== -1) {
        for (let c = 0; c < columnRange; ++c) {
          if (c >= barrier) {
            for (const objectUnder of this.objectsUnder) {
              objectUnder.queueRerender(row, column + c);
            }
          } else if (valueChars[c] !== previousValueChars[c]) {
            this.queueRerender(row, column + c);
          }
        }
      } else {
        for (let c = 0; c < columnRange; ++c) {
          if (valueChars[c] !== previousValueChars[c]) {
            this.queueRerender(row, column + c);
          }
        }
      }
    };

    this.#rectangleSubscription = (rectangle) => {
      const text = this.text.peek();
      const multiCodePointSupport = this.multiCodePointSupport.peek();
      const overwriteRectangle = this.overwriteRectangle.peek();

      this.moved = true;
      this.updated = false;
      updateObjects.push(this);
      for (const objectUnder of this.objectsUnder) {
        objectUnder.moved = true;
        objectUnder.updated = false;
        updateObjects.push(objectUnder);
      }

      update(text, rectangle, multiCodePointSupport, overwriteRectangle);
    };

    this.#updateEffect = new Effect(() => {
      const text = this.text.value;
      const rectangle = this.rectangle.peek();
      const overwriteRectangle = this.overwriteRectangle.value;
      const multiCodePointSupport = this.multiCodePointSupport.value;

      this.updated = false;
      updateObjects.push(this);

      for (const objectUnder of this.objectsUnder) {
        objectUnder.updated = false;
        updateObjects.push(objectUnder);
      }

      update(text, rectangle, multiCodePointSupport, overwriteRectangle);
    });
  }

  override draw(): void {
    this.#updateEffect.resume();
    this.rectangle.subscribe(this.#rectangleSubscription);
    super.draw();
  }

  override erase(): void {
    this.#updateEffect.pause();
    this.rectangle.unsubscribe(this.#rectangleSubscription);
    super.erase();
  }

  override queueRerender(row: number, column: number): void {
    this.queueRerenderRange(row, column, column + 1);
  }

  override queueRerenderRange(row: number, startColumn: number, endColumn: number): void {
    const viewRectangle = this.view.peek()?.rectangle?.peek();
    if (row < 0) return;
    const { columns, rows } = this.canvas.size.peek();
    if (row >= rows) return;

    let start = Math.max(0, Math.floor(startColumn));
    let end = Math.min(columns, Math.ceil(endColumn));
    if (viewRectangle) {
      if (row < viewRectangle.row || row >= viewRectangle.row + viewRectangle.height) return;
      start = Math.max(start, viewRectangle.column);
      end = Math.min(end, viewRectangle.column + viewRectangle.width);
    }
    if (end <= start) return;

    const normalizedRow = Math.floor(row);
    const ranges = this.rerenderRanges[normalizedRow] ??= [];
    ranges.push({ row: normalizedRow, startColumn: start, endColumn: end });
  }

  override updateMovement(): void {
    const { objectsUnder, previousRectangle } = this;
    const rectangle = this.rectangle.peek();

    // Rerender cells that changed because objects position changed
    if (!previousRectangle || rectangleEquals(rectangle, previousRectangle)) return;

    const intersection = rectangleIntersection(rectangle, previousRectangle, true);

    const previousRow = previousRectangle.row;
    const previousColumnRange = previousRectangle.column + previousRectangle.width;
    for (let column = previousRectangle.column; column < previousColumnRange; ++column) {
      if (intersection && fitsInRectangle(column, previousRow, intersection)) {
        continue;
      }

      for (const objectUnder of objectsUnder) {
        objectUnder.queueRerender(previousRow, column);
      }
    }

    const hasOriginMoved = rectangle.column !== previousRectangle.column || rectangle.row !== previousRectangle.row;

    const { row } = rectangle;
    const columnRange = rectangle.column + rectangle.width;
    for (let column = rectangle.column; column < columnRange; ++column) {
      // When text moves it needs to be rerendered completely because of text continuity
      if (hasOriginMoved) this.queueRerender(row, column);

      if (intersection && fitsInRectangle(column, row, intersection)) {
        continue;
      }

      for (const objectUnder of objectsUnder) {
        objectUnder.queueRerender(row, column);
      }
    }
  }

  override rerender(): void {
    const { canvas, valueChars, omitCells, rerenderCells, rerenderRanges } = this;

    const { frameBuffer, rerenderQueue } = canvas;
    const { columns, rows } = canvas.size.peek();

    const rectangle = this.rectangle.peek();
    const style = this.style.peek();

    const { row } = rectangle;

    // In overwriteRectangle mode the object owns the caller-provided width;
    // padding cells past the text must repaint as spaces, or a shrinking
    // value / moving rectangle leaves its old tail on screen ("Widgetsw").
    const ownedWidth = this.overwriteRectangle.peek() ? (rectangle.width ?? valueChars.length) : valueChars.length;
    let rowRange = Math.min(row, rows);
    let columnRange = Math.min(rectangle.column + ownedWidth, columns);

    const viewRectangle = this.view.peek()?.rectangle?.peek();
    if (viewRectangle) {
      rowRange = Math.min(row, viewRectangle.row + viewRectangle.height);
      columnRange = Math.min(columnRange, viewRectangle.column + viewRectangle.width);
    }

    if (row > rowRange) return;

    const rerenderColumns = rerenderCells[row];
    const ranges = rerenderRanges[row];
    if (!rerenderColumns?.size && !ranges?.length) return;

    const omitColumns = omitCells[row];
    if (omitColumns?.size === valueChars.length) {
      rerenderColumns?.clear();
      if (ranges) ranges.length = 0;
      return;
    }

    const rowBuffer = frameBuffer[row] ??= [];

    if (ranges?.length) {
      mergeDirtyRowSegmentsInPlace(ranges);
      const directRanges = omitColumns?.size ? undefined : canvas.rerenderRanges[row] ??= [];
      let rerenderQueueRow: Set<number> | undefined;
      for (const range of ranges) {
        const start = Math.max(range.startColumn, rectangle.column);
        const end = Math.min(range.endColumn, columnRange);
        if (end <= start) continue;
        for (let column = start; column < end; column += 1) {
          if (omitColumns?.has(column)) continue;
          rowBuffer[column] = style(valueChars[column - rectangle.column] ?? " ");
          if (!directRanges) {
            rerenderQueueRow ??= rerenderQueue[row] ??= new Set();
            rerenderQueueRow.add(column);
          }
        }
        if (directRanges) directRanges.push({ row, startColumn: start, endColumn: end });
      }
      ranges.length = 0;
    }

    if (rerenderColumns?.size) {
      const rerenderQueueRow = rerenderQueue[row] ??= new Set();
      for (const column of rerenderColumns) {
        if (
          column >= columnRange ||
          column < rectangle.column ||
          omitColumns?.has(column)
        ) {
          continue;
        }

        rowBuffer[column] = style(valueChars[column - rectangle.column] ?? " ");
        rerenderQueueRow.add(column);
      }

      rerenderColumns.clear();
    }
  }
}

function queueChangedOverwriteRanges(
  object: TextObject,
  previousValueChars: string[] | string,
  valueChars: string[] | string,
  row: number,
  column: number,
  width: number,
): void {
  let runStart = -1;
  for (let offset = 0; offset < width; offset += 1) {
    const next = valueChars[offset] ?? " ";
    const previous = previousValueChars[offset] ?? " ";
    if (next === previous) {
      if (runStart !== -1) {
        object.queueRerenderRange(row, column + runStart, column + offset);
        runStart = -1;
      }
      continue;
    }
    if (runStart === -1) runStart = offset;
  }
  if (runStart !== -1) {
    object.queueRerenderRange(row, column + runStart, column + width);
  }
}
