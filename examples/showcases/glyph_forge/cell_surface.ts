// Copyright 2023 Im-Beast. MIT license.

// A retained styled-cell surface (GLYPH-003 slice): the editor canvas is a
// grid of pre-styled terminal cells rendered through one draw object that
// diffs against its previous frame and repaints only changed row ranges —
// the same differential pattern the exomux desktop uses. Promotion to a
// core `CellCanvas` waits for the selection/performance contracts (025).

import {
  Component,
  type ComponentOptions,
  type Computed,
  DrawObject,
  type Rectangle,
  type SignalOfObject,
} from "../../../mod.ts";

/** Options for the retained cell surface. */
export interface GlyphCellSurfaceOptions extends ComponentOptions {
  rectangle: SignalOfObject<Rectangle>;
  /** Revision whose changes schedule a diff-and-repaint. */
  revision: Computed<number> | Computed<string>;
  /** Produces the current pre-styled cell rows (one string per cell). */
  render: () => string[][];
}

/** Component wrapper that mounts one retained cell draw object. */
export class GlyphCellSurface extends Component {
  declare drawnObjects: { surface: GlyphCellDrawObject };

  constructor(private readonly options: GlyphCellSurfaceOptions) {
    super(options);
  }

  override draw(): void {
    super.draw();
    const surface = new GlyphCellDrawObject({
      canvas: this.tui.canvas,
      view: this.view,
      style: this.style,
      zIndex: this.zIndex,
      rectangle: this.options.rectangle,
      revision: this.options.revision,
      render: this.options.render,
    });
    this.drawnObjects.surface = surface;
    surface.draw();
  }
}

interface GlyphCellDrawObjectOptions {
  canvas: DrawObject["canvas"];
  view: DrawObject["view"];
  style: DrawObject["style"];
  zIndex: DrawObject["zIndex"];
  rectangle: SignalOfObject<Rectangle>;
  revision: Computed<number> | Computed<string>;
  render: () => string[][];
}

/** Differential renderer for pre-styled cell rows. */
class GlyphCellDrawObject extends DrawObject<"glyph-cells"> {
  declare rectangle: SignalOfObject<Rectangle>;
  readonly #revision: Computed<number> | Computed<string>;
  readonly #renderRows: () => string[][];
  readonly #lifecycle = new AbortController();
  #previousRows: string[][] = [];
  #forceFullPaint = true;

  constructor(options: GlyphCellDrawObjectOptions) {
    super("glyph-cells", options);
    this.rectangle = options.rectangle;
    this.#revision = options.revision;
    this.#renderRows = options.render;
  }

  override draw(): void {
    this.rectangle.subscribe(() => this.#invalidate(true), this.#lifecycle.signal);
    this.#revision.subscribe(() => this.#invalidate(false), this.#lifecycle.signal);
    super.draw();
  }

  override erase(): void {
    this.#lifecycle.abort();
    super.erase();
  }

  override render(): void {
    this.#forceFullPaint = true;
    this.rerender();
  }

  override rerender(): void {
    const rectangle = this.rectangle.peek();
    const rows = this.#renderRows();
    const previousRows = this.#previousRows;
    const canvasSize = this.canvas.size.peek();
    const rowEnd = Math.min(canvasSize.rows, rectangle.row + rectangle.height);
    const columnEnd = Math.min(canvasSize.columns, rectangle.column + rectangle.width);
    for (let row = Math.max(0, rectangle.row); row < rowEnd; row += 1) {
      const source = rows[row - rectangle.row] ?? [];
      const previous = previousRows[row - rectangle.row] ?? [];
      const frameRow = this.canvas.frameBuffer[row] ??= [];
      const omitted = this.omitCells[row];
      const forced = this.rerenderCells[row];
      let rangeStart = -1;
      for (let column = Math.max(0, rectangle.column); column < columnEnd; column += 1) {
        const sourceColumn = column - rectangle.column;
        const value = source[sourceColumn] ?? " ";
        const changed = this.#forceFullPaint || forced?.has(column) || previous[sourceColumn] !== value;
        if (!changed || omitted?.has(column)) {
          if (rangeStart !== -1) {
            (this.canvas.rerenderRanges[row] ??= []).push({ row, startColumn: rangeStart, endColumn: column });
            rangeStart = -1;
          }
          continue;
        }
        frameRow[column] = value;
        if (rangeStart === -1) rangeStart = column;
      }
      if (rangeStart !== -1) {
        (this.canvas.rerenderRanges[row] ??= []).push({ row, startColumn: rangeStart, endColumn: columnEnd });
      }
      forced?.clear();
    }
    this.#previousRows = rows;
    this.#forceFullPaint = false;
  }

  #invalidate(moved: boolean): void {
    if (moved) {
      this.moved = true;
      this.#forceFullPaint = true;
    }
    if (!this.updated) return;
    this.updated = false;
    this.canvas.updateObjects.push(this);
    for (const objectUnder of this.objectsUnder) {
      if (!objectUnder.updated) continue;
      objectUnder.updated = false;
      this.canvas.updateObjects.push(objectUnder);
    }
  }
}
