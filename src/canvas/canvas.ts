// Copyright 2023 Im-Beast. MIT license.

import { type EmitterEvent, EventEmitter } from "../event_emitter.ts";

import { SortedArray } from "../utils/sorted_array.ts";
import { rectangleEquals, rectangleIntersection } from "../utils/numbers.ts";

import type { ConsoleSize, Rectangle, Stdout } from "../types.ts";
import type { DrawObject } from "./draw_object.ts";
import { DirtyRegion, mergeDirtyRowSegmentsInPlace } from "./dirty_region.ts";
import { DrawObjectSpatialIndex } from "./spatial_index.ts";
import type { Signal, SignalOfObject } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";
import {
  AnsiCanvasSink,
  type CanvasCellSink,
  type CanvasCellUpdate,
  type CanvasRowRangeUpdate,
  type CanvasStdout,
  coalesceCanvasRowRanges,
} from "./sink.ts";
import type { DirtyRowSegment } from "./dirty_region.ts";

/** Interface defining object that {Canvas}'s constructor can interpret */
export interface CanvasOptions {
  /** Stdout to which canvas will render frameBuffer */
  stdout?: Stdout | CanvasStdout;
  /** Sink that receives dirty cell updates after each render. */
  sink?: CanvasCellSink;
  size: ConsoleSize | SignalOfObject<ConsoleSize>;
}

/** Map that contains events that {Canvas} can dispatch */
export type CanvasEventMap = {
  render: EmitterEvent<[]>;
};

/** Lightweight diagnostics for the most recent canvas render pass. */
export interface CanvasRenderStats {
  updatedObjects: number;
  renderedObjects: number;
  rerenderedObjects: number;
  intersectionUpdates: number;
  intersectionCandidateChecks: number;
  intersectionsDirty: boolean;
  dirtyRectangles: number;
  dirtyRowRanges: number;
  dirtyRows: number;
  dirtyCells: number;
  fullRedraws: number;
  flushedCells: number;
}

/**
 * Object, which stores data about currently rendered objects.
 *
 * It is responsible for outputting to stdout.
 */
export class Canvas extends EventEmitter<CanvasEventMap> {
  stdout?: Stdout | CanvasStdout;
  sink: CanvasCellSink;
  size: Signal<ConsoleSize>;
  rerenderedObjects?: number;
  frameBuffer: (string | Uint8Array)[][];
  rerenderQueue: Set<number>[];
  rerenderRanges: DirtyRowSegment[][];
  drawnObjects: SortedArray<DrawObject>;
  updateObjects: DrawObject[];
  resizeNeeded: boolean;
  lastRenderStats: CanvasRenderStats;
  drawnOrderVersion: number;
  cellUpdatesBuffer: CanvasCellUpdate[];
  rowRangesBuffer: ReturnType<typeof coalesceCanvasRowRanges>;
  directRowRangesBuffer: CanvasRowRangeUpdate[];
  objectsToUpdateBuffer: DrawObject[];
  seenObjectsBuffer: Set<DrawObject>;
  dirtyRowsSeenBuffer: Set<number>;
  dirtyRectanglesBuffer: Rectangle[];
  movedOwnObjectsBuffer: Set<DrawObject>;
  nonMovingUpdatedObjectsBuffer: DrawObject[];
  affectedObjectsBuffer: DrawObject[];
  requiredObjectsBuffer: Set<DrawObject>;
  dirtyCandidatesBuffer: DrawObject[];
  intersectionCandidatesBuffer: DrawObject[];
  dirtyRegionBuffer: DirtyRegion;
  spatialIndexBuffer: DrawObjectSpatialIndex;

  constructor(options: CanvasOptions) {
    super();

    this.frameBuffer = [];
    this.rerenderQueue = [];
    this.rerenderRanges = [];
    this.stdout = options.stdout;
    if (options.sink) {
      this.sink = options.sink;
    } else if (options.stdout) {
      this.sink = new AnsiCanvasSink({ stdout: options.stdout as CanvasStdout });
    } else {
      throw new Error("Canvas requires either stdout or sink.");
    }
    this.drawnObjects = new SortedArray((a, b) => a.zIndex.peek() - b.zIndex.peek() || a.id - b.id);
    this.updateObjects = [];
    this.resizeNeeded = false;
    this.lastRenderStats = emptyRenderStats();
    this.drawnOrderVersion = 0;
    this.cellUpdatesBuffer = [];
    this.rowRangesBuffer = [];
    this.directRowRangesBuffer = [];
    this.objectsToUpdateBuffer = [];
    this.seenObjectsBuffer = new Set();
    this.dirtyRowsSeenBuffer = new Set();
    this.dirtyRectanglesBuffer = [];
    this.movedOwnObjectsBuffer = new Set();
    this.nonMovingUpdatedObjectsBuffer = [];
    this.affectedObjectsBuffer = [];
    this.requiredObjectsBuffer = new Set();
    this.dirtyCandidatesBuffer = [];
    this.intersectionCandidatesBuffer = [];
    this.dirtyRegionBuffer = new DirtyRegion();
    this.spatialIndexBuffer = new DrawObjectSpatialIndex();

    this.size = signalify(options.size, { deepObserve: true });

    this.size.subscribe(() => {
      this.resizeNeeded = true;
      const { columns, rows } = this.size.peek();
      this.sink.resize?.(columns, rows);
    });
    const { columns, rows } = this.size.peek();
    this.sink.resize?.(columns, rows);
  }

  resortDrawnObjects(): void {
    this.drawnObjects.sort(this.drawnObjects.compareFn);
    this.drawnOrderVersion += 1;
  }

  resize() {
    this.rerenderAll();
  }

  /**
   * Discards all retained render state and re-queues every in-bounds object for
   * a full redraw on the next `render()`.
   *
   * The incremental renderer can miss a cell when a higher-zIndex object that
   * overlaps others moves or hides in the same pass their content changes (a
   * List's selection highlight scrolling out of view is the case that surfaced
   * this) — the overlapped-but-changed row keeps its stale content. A caller
   * that composites a snapshot and cannot tolerate a stale cell forces a clean
   * pass with this; it is also what a resize needs.
   */
  rerenderAll(): void {
    const { columns, rows } = this.size.peek();

    this.clearRetainedResizeState();

    for (const drawObject of this.drawnObjects) {
      const { column, row } = drawObject.rectangle.peek();
      if (column >= columns || row >= rows) continue;

      drawObject.rendered = false;
      drawObject.updated = false;
      this.updateObjects.push(drawObject);
    }
  }

  private clearRetainedResizeState(): void {
    this.frameBuffer.length = 0;
    this.rerenderQueue.length = 0;
    this.rerenderRanges.length = 0;
    this.cellUpdatesBuffer.length = 0;
    this.rowRangesBuffer.length = 0;
    this.directRowRangesBuffer.length = 0;
    this.dirtyRowsSeenBuffer.clear();
    this.dirtyRegionBuffer.clear();

    for (const drawObject of this.drawnObjects) {
      for (const row of drawObject.rerenderCells) row?.clear();
      drawObject.rerenderCells.length = 0;
      const ranged = drawObject as DrawObject & { rerenderRanges?: DirtyRowSegment[][] };
      if (ranged.rerenderRanges) {
        for (const row of ranged.rerenderRanges) {
          if (row) row.length = 0;
        }
        ranged.rerenderRanges.length = 0;
      }
    }
  }

  updateIntersections(object: DrawObject, candidates?: Iterable<DrawObject>): number {
    const { omitCells, objectsUnder } = object;
    let candidateChecks = 0;

    const zIndex = object.zIndex.peek();
    const rectangle = object.rectangle.peek();

    for (const omitRows of omitCells) {
      omitRows?.clear();
    }

    objectsUnder.clear();

    for (const object2 of candidates ?? this.drawnObjects) {
      if (object === object2 || object2.outOfBounds) continue;
      candidateChecks += 1;

      const zIndex2 = object2.zIndex.peek();

      if (zIndex2 < zIndex || (zIndex2 === zIndex && object2.id < object.id)) {
        if (rectangleIntersection(rectangle, object2.rectangle.peek(), false)) {
          objectsUnder.add(object2);
        }
        continue;
      }

      const intersection = rectangleIntersection(rectangle, object2.rectangle.peek(), true);

      if (!intersection) continue;

      const rowRange = intersection.row + intersection.height;
      const columnRange = intersection.column + intersection.width;
      for (let row = intersection.row; row < rowRange; ++row) {
        const omitColumns = omitCells[row] ??= new Set();

        for (let column = intersection.column; column < columnRange; ++column) {
          omitColumns.add(column);
        }
      }
    }

    return candidateChecks;
  }

  /** Returns diagnostics from the most recent render pass. */
  inspectRender(): CanvasRenderStats {
    return { ...this.lastRenderStats };
  }

  render(): void {
    const { frameBuffer, updateObjects } = this;

    if (this.resizeNeeded) {
      this.resize();
      this.resizeNeeded = false;
    }

    if (!updateObjects.length) {
      this.lastRenderStats = emptyRenderStats();
      return;
    }

    const objectsToUpdate = this.objectsToUpdateBuffer;
    const seenObjects = this.seenObjectsBuffer;
    objectsToUpdate.length = 0;
    seenObjects.clear();

    while (updateObjects.length) {
      const object = updateObjects.pop()!;
      if (seenObjects.has(object)) {
        continue;
      }
      seenObjects.add(object);
      objectsToUpdate.push(object);
    }

    objectsToUpdate.sort((a, b) => b.zIndex.peek() - a.zIndex.peek() || b.id - a.id);

    let i = 0;
    let intersectionsDirty = false;
    const dirtyRectangles = this.dirtyRectanglesBuffer;
    const movedOwnObjects = this.movedOwnObjectsBuffer;
    const nonMovingUpdatedObjects = this.nonMovingUpdatedObjectsBuffer;
    dirtyRectangles.length = 0;
    movedOwnObjects.clear();
    nonMovingUpdatedObjects.length = 0;

    for (const object of objectsToUpdate) {
      object.updated = true;
      ++i;
      object.update();

      const previousRectangle = object.previousRectangle ? cloneRectangle(object.previousRectangle) : undefined;
      object.updateMovement();

      if (object.moved) {
        intersectionsDirty = true;
        const rectangle = object.rectangle.peek();
        const ownRectangleChanged = !previousRectangle || !rectangleEquals(rectangle, previousRectangle);
        const drawn = this.drawnObjects.includes(object);
        if (ownRectangleChanged || !drawn) {
          dirtyRectangles.push(cloneRectangle(rectangle));
          if (previousRectangle) {
            dirtyRectangles.push(previousRectangle);
          }
          movedOwnObjects.add(object);
        }
      } else {
        nonMovingUpdatedObjects.push(object);
      }

      object.updatePreviousRectangle();
      object.updateOutOfBounds();

      if (object.outOfBounds) {
        object.rendered = false;
      }
    }

    const dirtyRegion = this.dirtyRegionBuffer;
    dirtyRegion.resetFromRectangles(dirtyRectangles);
    const spatialIndex = intersectionsDirty ? this.spatialIndexBuffer.resetFromObjects(this.drawnObjects) : undefined;
    const objectsToRender = intersectionsDirty
      ? affectedDrawObjects(
        this.drawnObjects,
        dirtyRegion,
        nonMovingUpdatedObjects,
        movedOwnObjects,
        spatialIndex!,
        this.affectedObjectsBuffer,
        this.requiredObjectsBuffer,
        this.dirtyCandidatesBuffer,
      )
      : objectsToUpdate;
    let intersectionCandidateChecks = 0;
    if (intersectionsDirty) {
      objectsToRender.sort((a, b) => b.zIndex.peek() - a.zIndex.peek() || b.id - a.id);
      const intersectionCandidates = this.intersectionCandidatesBuffer;
      for (const object of objectsToRender) {
        intersectionCandidateChecks += this.updateIntersections(
          object,
          spatialIndex!.queryInto(intersectionCandidates, object.rectangle.peek()),
        );
        object.moved = false;
        if (!object.outOfBounds) {
          if (movedOwnObjects.has(object) || !object.rendered) {
            object.rendered = false;
          } else {
            queueDirtyRegion(object, dirtyRegion);
          }
        }
      }
    } else {
      for (const object of objectsToRender) {
        object.moved = false;
      }
    }

    let renderedObjects = 0;
    let rerenderedObjects = 0;

    for (const object of objectsToRender) {
      if (object.outOfBounds) {
        continue;
      }

      if (object.rendered) {
        object.rerender();
        rerenderedObjects += 1;
      } else {
        object.render();
        object.rendered = true;
        renderedObjects += 1;
      }
    }

    this.rerenderedObjects = i;

    const { rerenderQueue, rerenderRanges } = this;
    const size = this.size.peek();
    let flushedCells = 0;
    let dirtyRows = 0;
    let dirtyCells = 0;
    const cellUpdates = this.cellUpdatesBuffer;
    const directRowRanges = this.directRowRangesBuffer;
    const dirtyRowsSeen = this.dirtyRowsSeenBuffer;
    cellUpdates.length = 0;
    directRowRanges.length = 0;
    dirtyRowsSeen.clear();
    const needsCellUpdates = !this.sink.flushRanges || this.sink.requiresCellUpdates !== false;

    for (let row = 0; row < size.rows; ++row) {
      const ranges = rerenderRanges[row];
      if (ranges?.length) {
        mergeDirtyRowSegmentsInPlace(ranges);
        dirtyRowsSeen.add(row);
        const rowBuffer = frameBuffer[row] ??= [];
        for (const range of ranges) {
          dirtyCells += Math.max(0, range.endColumn - range.startColumn);
          flushedCells += appendCanvasRowRangeUpdates(
            row,
            range.startColumn,
            range.endColumn,
            rowBuffer,
            directRowRanges,
            needsCellUpdates ? cellUpdates : undefined,
          );
        }
        ranges.length = 0;
      }

      const columns = rerenderQueue[row];
      if (!columns?.size) continue;
      dirtyRowsSeen.add(row);
      dirtyCells += columns.size;

      const rowBuffer = frameBuffer[row] ??= [];

      for (const column of columns) {
        const cell = rowBuffer[column];
        if (cell === undefined) continue;
        cellUpdates.push({ row, column, value: cell });
        flushedCells += 1;
      }

      columns.clear();
    }

    const rowRanges = this.sink.flushRanges
      ? directRowRanges
      : coalesceCanvasRowRanges(cellUpdates, this.rowRangesBuffer);
    if (this.sink.flushRanges && cellUpdates.length > 0) {
      coalesceCanvasRowRanges(cellUpdates, this.rowRangesBuffer);
      for (const range of this.rowRangesBuffer) {
        directRowRanges.push(range);
      }
    }
    dirtyRows = dirtyRowsSeen.size;
    this.lastRenderStats = {
      updatedObjects: i,
      renderedObjects,
      rerenderedObjects,
      intersectionUpdates: intersectionsDirty ? objectsToRender.length : 0,
      intersectionCandidateChecks,
      intersectionsDirty,
      dirtyRectangles: dirtyRectangles.length,
      dirtyRowRanges: rowRanges.length,
      dirtyRows,
      dirtyCells,
      fullRedraws: renderedObjects,
      flushedCells,
    };

    if (cellUpdates.length > 0 || (this.sink.flushRanges && rowRanges.length > 0)) {
      if (this.sink.flushRanges) {
        this.sink.flushRanges(rowRanges, this.lastRenderStats, cellUpdates);
      } else {
        this.sink.flush(cellUpdates, this.lastRenderStats);
      }
      // A saturated terminal may have swallowed part of this frame; the diff
      // would then never repaint those cells. Force a clean full repaint so a
      // truncated frame heals on the next render instead of ghosting forever.
      if (this.sink.takeFlushDegraded?.()) this.rerenderAll();
    }

    this.emit("render");
  }
}

function emptyRenderStats(): CanvasRenderStats {
  return {
    updatedObjects: 0,
    renderedObjects: 0,
    rerenderedObjects: 0,
    intersectionUpdates: 0,
    intersectionCandidateChecks: 0,
    intersectionsDirty: false,
    dirtyRectangles: 0,
    dirtyRowRanges: 0,
    dirtyRows: 0,
    dirtyCells: 0,
    fullRedraws: 0,
    flushedCells: 0,
  };
}

function cloneRectangle(rectangle: Rectangle): Rectangle {
  return {
    column: rectangle.column,
    row: rectangle.row,
    width: rectangle.width,
    height: rectangle.height,
  };
}

function affectedDrawObjects(
  objects: Iterable<DrawObject>,
  dirtyRegion: DirtyRegion,
  requiredObjects: readonly DrawObject[],
  movedObjects: ReadonlySet<DrawObject>,
  spatialIndex: DrawObjectSpatialIndex,
  target: DrawObject[],
  required: Set<DrawObject>,
  dirtyCandidates: DrawObject[],
): DrawObject[] {
  target.length = 0;
  required.clear();
  if (dirtyRegion.isEmpty()) {
    for (const object of objects) {
      target.push(object);
    }
    return target;
  }

  for (const object of movedObjects) {
    required.add(object);
  }
  for (const object of requiredObjects) {
    required.add(object);
  }
  for (const object of spatialIndex.queryDirtyRegionInto(dirtyCandidates, dirtyRegion)) {
    required.add(object);
  }
  for (const object of objects) {
    if (required.has(object)) {
      target.push(object);
    }
  }
  return target;
}

function queueDirtyRegion(object: DrawObject, dirtyRegion: DirtyRegion): void {
  dirtyRegion.forEachIntersectionValue(object.rectangle.peek(), (row, startColumn, endColumn) => {
    object.queueRerenderRange(row, startColumn, endColumn);
  });
}

function appendCanvasRowRangeUpdates(
  row: number,
  startColumn: number,
  endColumn: number,
  rowBuffer: (string | Uint8Array)[],
  rowRanges: CanvasRowRangeUpdate[],
  cellUpdates?: CanvasCellUpdate[],
): number {
  if (!cellUpdates) {
    const values = sliceDefinedRowRange(rowBuffer, startColumn, endColumn);
    if (values) {
      rowRanges.push({ row, startColumn, values });
      return values.length;
    }
  }

  let flushedCells = 0;
  let activeValues: (string | Uint8Array)[] | undefined;
  let activeStart = startColumn;

  for (let column = startColumn; column < endColumn; column += 1) {
    const value = rowBuffer[column];
    if (value === undefined) {
      if (activeValues?.length) {
        if (!cellUpdates) rowRanges.push({ row, startColumn: activeStart, values: activeValues });
      }
      activeValues = undefined;
      continue;
    }

    if (!activeValues) {
      activeValues = [];
      activeStart = column;
    }
    activeValues.push(value);
    cellUpdates?.push({ row, column, value });
    flushedCells += 1;
  }

  if (activeValues?.length) {
    if (!cellUpdates) rowRanges.push({ row, startColumn: activeStart, values: activeValues });
  }
  return flushedCells;
}

function sliceDefinedRowRange(
  rowBuffer: (string | Uint8Array)[],
  startColumn: number,
  endColumn: number,
): (string | Uint8Array)[] | undefined {
  for (let column = startColumn; column < endColumn; column += 1) {
    if (rowBuffer[column] === undefined) return undefined;
  }
  return rowBuffer.slice(startColumn, endColumn);
}
