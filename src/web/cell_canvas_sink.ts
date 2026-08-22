// Copyright 2023 Im-Beast. MIT license.
import type { CanvasCellSink, CanvasCellUpdate, CanvasRowRangeUpdate } from "../canvas/sink.ts";
import type { CanvasRenderStats } from "../canvas/canvas.ts";
import { stripStyles } from "../utils/strings.ts";
import { ansi256Color, ansiColor } from "./ansi_color.ts";

const textDecoder = new TextDecoder();
const ESCAPE = String.fromCharCode(27);
const SGR_PATTERN = new RegExp(`${ESCAPE}\\[([0-9;]*)m`, "g");

/** Options for drawing terminal cells into a browser Canvas2D surface. */
export interface BrowserCellCanvasSinkOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  font?: string;
  cellWidth?: number;
  cellHeight?: number;
  foreground?: string;
  background?: string;
  devicePixelRatio?: number;
}

/** Snapshot of browser canvas sink geometry, colors, and last render stats. */
export interface BrowserCellCanvasSinkInspection {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  foreground: string;
  background: string;
  lastStats?: CanvasRenderStats;
}

interface CellCanvasContext {
  canvas: { width: number; height: number };
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textBaseline: CanvasTextBaseline;
  globalAlpha?: number;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  scale(x: number, y: number): void;
  setTransform?(a: number, b: number, c: number, d: number, e: number, f: number): void;
  measureText?(text: string): { width: number };
  save?(): void;
  restore?(): void;
  beginPath?(): void;
  rect?(x: number, y: number, width: number, height: number): void;
  clip?(): void;
}

/** Parsed display attributes for one ANSI-styled terminal cell. */
export interface ParsedAnsiCell {
  text: string;
  foreground?: string;
  background?: string;
  bold: boolean;
  dim: boolean;
}

/** Canvas2D-backed cell sink for browser-hosted TUI rendering. */
export class BrowserCellCanvasSink implements CanvasCellSink {
  readonly requiresCellUpdates = false;

  readonly #canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly #context: CellCanvasContext;
  readonly #font: string;
  readonly #foreground: string;
  readonly #background: string;
  readonly #pixelRatio: number;
  #columns = 0;
  #rows = 0;
  #cellWidth: number;
  #cellHeight: number;
  #lastStats?: CanvasRenderStats;
  /** Advance per glyph at this font, cached — measured once, asked constantly. */
  readonly #glyphAdvance = new Map<string, number>();

  constructor(options: BrowserCellCanvasSinkOptions) {
    const context = options.canvas.getContext("2d");
    if (!context) {
      throw new Error("BrowserCellCanvasSink requires a 2D canvas context.");
    }
    this.#canvas = options.canvas;
    this.#context = context as unknown as CellCanvasContext;
    this.#font = options.font ?? "16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    this.#foreground = options.foreground ?? "#dbeafe";
    this.#background = options.background ?? "#070b12";
    this.#pixelRatio = Math.max(1, options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1);
    this.#cellWidth = Math.max(1, options.cellWidth ?? 10);
    this.#cellHeight = Math.max(1, options.cellHeight ?? 20);
    this.#context.font = this.#font;
    this.#context.textBaseline = "top";
  }

  resize(columns: number, rows: number): void {
    this.#columns = Math.max(1, Math.floor(columns));
    this.#rows = Math.max(1, Math.floor(rows));
    this.#canvas.width = Math.ceil(this.#columns * this.#cellWidth * this.#pixelRatio);
    this.#canvas.height = Math.ceil(this.#rows * this.#cellHeight * this.#pixelRatio);
    this.#context.setTransform?.(1, 0, 0, 1, 0, 0);
    this.#context.scale(this.#pixelRatio, this.#pixelRatio);
    this.#context.font = this.#font;
    this.#context.textBaseline = "top";
    this.#context.fillStyle = this.#background;
    this.#context.fillRect(0, 0, this.#columns * this.#cellWidth, this.#rows * this.#cellHeight);
  }

  flush(updates: readonly CanvasCellUpdate[], stats: CanvasRenderStats): void {
    for (const update of updates) {
      this.#paintCell(update.row, update.column, update.value);
    }
    this.#lastStats = { ...stats };
  }

  flushRanges(
    ranges: readonly CanvasRowRangeUpdate[],
    stats: CanvasRenderStats,
    _updates: readonly CanvasCellUpdate[] = [],
  ): void {
    for (const range of ranges) {
      let column = range.startColumn;
      for (const value of range.values) {
        this.#paintCell(range.row, column, value);
        column += 1;
      }
    }
    this.#lastStats = { ...stats };
  }

  inspectSink(): BrowserCellCanvasSinkInspection {
    return {
      columns: this.#columns,
      rows: this.#rows,
      cellWidth: this.#cellWidth,
      cellHeight: this.#cellHeight,
      foreground: this.#foreground,
      background: this.#background,
      lastStats: this.#lastStats ? { ...this.#lastStats } : undefined,
    };
  }

  #paintCell(row: number, column: number, rawValue: string | Uint8Array): void {
    const value = typeof rawValue === "string" ? rawValue : textDecoder.decode(rawValue);
    const parsed = parseAnsiCell(value);
    const x = column * this.#cellWidth;
    const y = row * this.#cellHeight;
    this.#context.fillStyle = parsed.background ?? this.#background;
    this.#context.fillRect(x, y, this.#cellWidth, this.#cellHeight);

    const text = parsed.text || stripStyles(value) || " ";
    if (text.trim().length === 0) return;
    const foreground = parsed.dim
      ? dimColor(parsed.foreground ?? this.#foreground)
      : parsed.foreground ?? this.#foreground;
    // Block elements never go through the font: no monospace face fills its
    // cell box exactly, and the shortfall reads as a grid of seams over any
    // shaded background. Halves, eighths, and quadrants become exact rects;
    // shades become alpha fills — full coverage no matter the font metrics.
    if (text.length === 1 && this.#paintBlockGlyph(text.codePointAt(0)!, x, y, foreground)) return;
    this.#context.font = parsed.bold ? `700 ${this.#font}` : this.#font;
    this.#context.fillStyle = foreground;
    // A glyph whose advance exceeds the cell bleeds into the neighbour, and
    // when the neighbour never repaints the residue reads as a trail — the
    // whole reason animated charts smeared. Wide glyphs are clipped to their
    // cell; the advance is measured once per (weight, glyph) and cached.
    if (this.#glyphOverflows(text, parsed.bold === true) && this.#context.save && this.#context.clip) {
      this.#context.save();
      this.#context.beginPath?.();
      this.#context.rect?.(x, y, this.#cellWidth, this.#cellHeight);
      this.#context.clip();
      this.#context.fillText(text, x, y);
      this.#context.restore?.();
      return;
    }
    this.#context.fillText(text, x, y);
  }

  #paintBlockGlyph(code: number, x: number, y: number, foreground: string): boolean {
    if (code < 0x2580 || code > 0x259f) return false;
    const context = this.#context;
    const w = this.#cellWidth;
    const h = this.#cellHeight;
    context.fillStyle = foreground;
    if (code === 0x2580) {
      context.fillRect(x, y, w, h / 2);
    } else if (code >= 0x2581 && code <= 0x2588) {
      const rise = h * (code - 0x2580) / 8;
      context.fillRect(x, y + h - rise, w, rise);
    } else if (code >= 0x2589 && code <= 0x258f) {
      context.fillRect(x, y, w * (0x2590 - code) / 8, h);
    } else if (code === 0x2590) {
      context.fillRect(x + w / 2, y, w / 2, h);
    } else if (code >= 0x2591 && code <= 0x2593) {
      const alpha = [0.25, 0.5, 0.75][code - 0x2591]!;
      const previous = context.globalAlpha ?? 1;
      context.globalAlpha = previous * alpha;
      context.fillRect(x, y, w, h);
      context.globalAlpha = previous;
    } else if (code === 0x2594) {
      context.fillRect(x, y, w, h / 8);
    } else if (code === 0x2595) {
      context.fillRect(x + w * 7 / 8, y, w / 8, h);
    } else {
      // Quadrants ▖▗▘▙▚▛▜▝▞▟ as bitmasks: 1=UL, 2=UR, 4=LL, 8=LR.
      const mask = [4, 8, 1, 13, 9, 7, 11, 2, 6, 14][code - 0x2596]!;
      if (mask & 1) context.fillRect(x, y, w / 2, h / 2);
      if (mask & 2) context.fillRect(x + w / 2, y, w / 2, h / 2);
      if (mask & 4) context.fillRect(x, y + h / 2, w / 2, h / 2);
      if (mask & 8) context.fillRect(x + w / 2, y + h / 2, w / 2, h / 2);
    }
    return true;
  }

  #glyphOverflows(text: string, bold: boolean): boolean {
    if (!this.#context.measureText) return false;
    const key = `${bold ? "b" : "n"}:${text}`;
    let advance = this.#glyphAdvance.get(key);
    if (advance === undefined) {
      advance = this.#context.measureText(text).width;
      if (this.#glyphAdvance.size >= 4096) this.#glyphAdvance.clear();
      this.#glyphAdvance.set(key, advance);
    }
    return advance > this.#cellWidth + 0.01;
  }
}

/** Parses SGR styling from a single terminal cell string. */
export function parseAnsiCell(value: string): ParsedAnsiCell {
  const style: ParsedAnsiCell = { text: stripStyles(value), bold: false, dim: false };
  const textIndex = firstPrintableIndex(value);
  const matches = value.matchAll(SGR_PATTERN);
  for (const match of matches) {
    if (match.index !== undefined && match.index > textIndex) break;
    const params = parseSgrParams(match[1] ?? "");
    for (let index = 0; index < params.length; index += 1) {
      const param = params[index] ?? 0;
      if (param === 0) {
        style.foreground = undefined;
        style.background = undefined;
        style.bold = false;
        style.dim = false;
      } else if (param === 1) {
        style.bold = true;
      } else if (param === 2) {
        style.dim = true;
      } else if (param === 22) {
        style.bold = false;
        style.dim = false;
      } else if (param === 39) {
        style.foreground = undefined;
      } else if (param === 49) {
        style.background = undefined;
      } else if (param >= 30 && param <= 37) {
        style.foreground = ansiColor(param - 30);
      } else if (param >= 90 && param <= 97) {
        style.foreground = ansiColor(param - 90 + 8);
      } else if (param >= 40 && param <= 47) {
        style.background = ansiColor(param - 40);
      } else if (param >= 100 && param <= 107) {
        style.background = ansiColor(param - 100 + 8);
      } else if ((param === 38 || param === 48) && params[index + 1] === 2) {
        const color = `rgb(${clampByte(params[index + 2])},${clampByte(params[index + 3])},${
          clampByte(params[index + 4])
        })`;
        if (param === 38) style.foreground = color;
        else style.background = color;
        index += 4;
      } else if ((param === 38 || param === 48) && params[index + 1] === 5) {
        const color = ansi256Color(params[index + 2] ?? 15);
        if (param === 38) style.foreground = color;
        else style.background = color;
        index += 2;
      }
    }
  }
  return style;
}

function parseSgrParams(value: string): number[] {
  if (!value) return [0];
  const params: number[] = [];
  let start = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index !== value.length && value[index] !== ";") continue;
    const part = value.slice(start, index);
    params.push(part ? Number(part) : 0);
    start = index + 1;
  }
  return params;
}

function firstPrintableIndex(value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\x1b") return index;
    while (index < value.length && value[index] !== "m") index += 1;
  }
  return value.length;
}

function dimColor(color: string): string {
  return color.startsWith("#") ? `${color}aa` : color;
}

function clampByte(value: number | undefined): number {
  return Math.max(0, Math.min(255, Math.floor(Number.isFinite(value) ? value! : 0)));
}
