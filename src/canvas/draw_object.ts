// Copyright 2023 Im-Beast. MIT license.
import { rectangleEquals, rectangleIntersection } from "../utils/numbers.ts";

// FIXME: rename to painters, drawobjects sounds cringe

import type { Style } from "../theme.ts";
import type { Canvas } from "./canvas.ts";
import type { Offset, Rectangle } from "../types.ts";
import { queueRerenderRangeInto } from "./rerender_queue.ts";
import type { View } from "../view.ts";
import type { Signal, SignalOfObject } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";
import type { Subscription } from "../signals/types.ts";

/** Options for configuring draw Object. */
export interface DrawObjectOptions {
  canvas: Canvas;

  omitCells?: number[];
  omitCellsPointer?: number;

  view?: View | Signal<View | undefined>;
  style: Style | SignalOfObject<Style>;
  zIndex: number | Signal<number>;
}

let id = 0;

/**
 * Base DrawObject which works as a skeleton for creating
 * draw objects which actually do something
 */
export class DrawObject<Type extends string = string> {
  id: number;
  type: Type;

  canvas: Canvas;

  style: Signal<Style>;
  zIndex: Signal<number>;

  view: Signal<View | undefined>;
  viewOffset: Offset;

  rectangle!: Signal<Rectangle>;
  previousRectangle?: Rectangle;

  objectsUnder: Set<DrawObject>;

  omitCells: Set<number>[];
  rerenderCells: Set<number>[];

  rendered: boolean;
  outOfBounds: boolean;
  updated: boolean;
  moved: boolean;

  #styleSubscription: Subscription<Style>;
  #zIndexSubscription: Subscription<number>;
  #viewSubscription: Subscription<View | undefined>;
  #viewRectangleSubscription: Subscription<Rectangle>;
  #viewOffsetSubscription: Subscription<Offset>;
  #viewMaxOffsetSubscription: Subscription<Offset>;
  #attachedView?: View;

  constructor(type: Type, options: DrawObjectOptions) {
    this.id = id++;
    this.type = type;

    this.canvas = options.canvas;

    this.viewOffset = { columns: 0, rows: 0 };

    this.omitCells = [];
    this.rerenderCells = [];

    this.objectsUnder = new Set();

    this.rendered = false;
    this.outOfBounds = false;
    this.canvas.updateObjects.push(this);
    this.updated = true;
    this.moved = true;

    this.view = signalify(options.view);
    this.zIndex = signalify(options.zIndex);
    this.style = signalify(options.style);

    const { updateObjects } = this.canvas;

    this.#styleSubscription = () => {
      this.rendered = false;
      this.updated = false;
      updateObjects.push(this);

      for (const objectUnder of this.objectsUnder) {
        objectUnder.updated = false;
        updateObjects.push(objectUnder);
      }
    };
    this.#zIndexSubscription = () => {
      this.canvas.resortDrawnObjects();
      this.previousRectangle = undefined;
      this.moved = true;
      this.updated = false;
      updateObjects.push(this);
    };

    this.#viewSubscription = (view) => this.#attachView(view);
    this.#viewRectangleSubscription = () => this.#syncView();
    this.#viewOffsetSubscription = () => this.#syncView();
    this.#viewMaxOffsetSubscription = () => this.#queueViewUpdate();

    this.view.subscribe(this.#viewSubscription);
    queueMicrotask(() => this.#attachView(this.view.peek()));
  }

  draw(): void {
    this.style.subscribe(this.#styleSubscription);
    this.zIndex.subscribe(this.#zIndexSubscription);

    this.rendered = false;

    const { objectsUnder } = this;
    const { updateObjects } = this.canvas;

    this.moved = true;
    this.updated = false;
    updateObjects.push(this);

    for (const objectUnder of objectsUnder) {
      objectUnder.moved = true;
      objectUnder.updated = false;
      updateObjects.push(objectUnder);
    }

    // draw() must be idempotent: visibility recomputations re-invoke it on
    // already-registered objects, and a duplicate registration is immortal —
    // erase() removes one entry, so the twin keeps painting its last state
    // forever (the accumulating stale selection bars in composited Lists).
    if (!this.canvas.drawnObjects.includes(this)) {
      this.canvas.drawnObjects.push(this);
    }
    this.canvas.drawnOrderVersion += 1;
  }

  erase(): void {
    this.style.unsubscribe(this.#styleSubscription);
    this.zIndex.unsubscribe(this.#zIndexSubscription);

    const { drawnObjects } = this.canvas;

    drawnObjects.remove(this);
    this.canvas.drawnOrderVersion += 1;

    for (const object of drawnObjects) {
      object.objectsUnder.delete(this);
    }

    const { objectsUnder } = this;
    const { updateObjects } = this.canvas;

    this.moved = true;
    this.updated = false;
    updateObjects.push(this);

    for (const objectUnder of objectsUnder) {
      objectUnder.moved = true;
      objectUnder.updated = false;
      updateObjects.push(objectUnder);
    }

    const { column, row, width, height } = this.rectangle.peek();

    const rowRange = row + height;
    const columnRange = column + width;
    for (let r = row; r < rowRange; ++r) {
      for (const objectUnder of objectsUnder) {
        objectUnder.queueRerenderRange(r, column, columnRange);
      }
    }
  }

  queueRerender(row: number, column: number): void {
    this.queueRerenderRange(row, column, column + 1);
  }

  queueRerenderRange(row: number, startColumn: number, endColumn: number): void {
    const viewRectangle = this.view.peek()?.rectangle?.peek();
    queueRerenderRangeInto(this.rerenderCells, row, startColumn, endColumn, this.canvas.size.peek(), viewRectangle);
  }

  queueRerenderRectangle(rectangle: Rectangle): void {
    const rowRange = rectangle.row + rectangle.height;
    const columnRange = rectangle.column + rectangle.width;
    for (let row = rectangle.row; row < rowRange; row += 1) {
      this.queueRerenderRange(row, rectangle.column, columnRange);
    }
  }

  updatePreviousRectangle(): void {
    const { previousRectangle } = this;
    const { column, row, width, height } = this.rectangle.peek();

    if (!previousRectangle) {
      this.previousRectangle = { column, row, width, height };
    } else {
      previousRectangle.column = column;
      previousRectangle.row = row;
      previousRectangle.width = width;
      previousRectangle.height = height;
    }
  }

  updateMovement(): void {
    const { previousRectangle, objectsUnder } = this;
    const rectangle = this.rectangle.peek();

    // Rerender cells that changed because objects position changed
    if (!previousRectangle || rectangleEquals(rectangle, previousRectangle)) return;

    const intersection = rectangleIntersection(rectangle, previousRectangle, true);

    const previousRowRange = previousRectangle.row + previousRectangle.height;
    const previousColumnRange = previousRectangle.column + previousRectangle.width;
    for (let r = previousRectangle.row; r < previousRowRange; ++r) {
      if (intersection && r >= intersection.row && r < intersection.row + intersection.height) {
        for (const objectUnder of objectsUnder) {
          objectUnder.queueRerenderRange(r, previousRectangle.column, intersection.column);
          objectUnder.queueRerenderRange(r, intersection.column + intersection.width, previousColumnRange);
        }
        continue;
      }
      for (const objectUnder of objectsUnder) {
        objectUnder.queueRerenderRange(r, previousRectangle.column, previousColumnRange);
      }
    }

    const rowRange = rectangle.row + rectangle.height;
    const columnRange = rectangle.column + rectangle.width;
    for (let r = rectangle.row; r < rowRange; ++r) {
      if (intersection && r >= intersection.row && r < intersection.row + intersection.height) {
        this.queueRerenderRange(r, rectangle.column, intersection.column);
        this.queueRerenderRange(r, intersection.column + intersection.width, columnRange);
        continue;
      }
      this.queueRerenderRange(r, rectangle.column, columnRange);
    }
  }

  updateOutOfBounds(): void {
    const { columns, rows } = this.canvas.size.peek();
    const { column, row, width, height } = this.rectangle.peek();

    this.outOfBounds = width === 0 || height === 0 ||
      column >= columns || row >= rows ||
      column + width < 0 || row + height < 0;

    if (!this.outOfBounds) {
      const viewRectangle = this.view.peek()?.rectangle?.peek();
      if (!viewRectangle) return;

      if (
        column > viewRectangle.column + viewRectangle.width ||
        row > viewRectangle.row + viewRectangle.height ||
        column + width < viewRectangle.column || row + height < viewRectangle.row
      ) {
        this.outOfBounds = true;
      }
    }
  }

  update(): void {
  }

  render(): void {
    const { column, row, width, height } = this.rectangle.peek();

    this.queueRerenderRectangle({ column, row, width, height });
    this.rerender();
  }

  rerender(): void {}

  #attachView(view: View | undefined): void {
    if (this.#attachedView === view) {
      this.#syncView();
      return;
    }

    if (this.#attachedView) {
      this.#attachedView.rectangle.unsubscribe(this.#viewRectangleSubscription);
      this.#attachedView.offset.unsubscribe(this.#viewOffsetSubscription);
      this.#attachedView.maxOffset.unsubscribe(this.#viewMaxOffsetSubscription);
    }

    this.#attachedView = view;

    if (view) {
      view.rectangle.subscribe(this.#viewRectangleSubscription);
      view.offset.subscribe(this.#viewOffsetSubscription);
      view.maxOffset.subscribe(this.#viewMaxOffsetSubscription);
    }

    this.#syncView();
  }

  #syncView(): void {
    const view = this.#attachedView;
    if (!view) {
      this.#queueViewUpdate();
      return;
    }

    const rectangle = this.rectangle?.peek();
    if (!rectangle) return;

    const viewRectangle = view.rectangle.peek();
    const offset = view.offset.peek();
    const nextColumns = viewRectangle.column - offset.columns;
    const nextRows = viewRectangle.row - offset.rows;
    const deltaColumns = nextColumns - this.viewOffset.columns;
    const deltaRows = nextRows - this.viewOffset.rows;

    if (deltaColumns !== 0 || deltaRows !== 0) {
      rectangle.column += deltaColumns;
      rectangle.row += deltaRows;
      this.moved = true;
      for (const objectUnder of this.objectsUnder) {
        objectUnder.moved = true;
      }
    }

    this.viewOffset.columns = nextColumns;
    this.viewOffset.rows = nextRows;
    this.#queueViewUpdate();
  }

  #queueViewUpdate(): void {
    const { updateObjects } = this.canvas;
    this.updated = false;
    updateObjects.push(this);

    for (const objectUnder of this.objectsUnder) {
      objectUnder.updated = false;
      updateObjects.push(objectUnder);
    }
  }
}
