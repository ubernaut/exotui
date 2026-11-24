// Copyright 2023 Im-Beast. MIT license.
import type { CanvasCellSink, CanvasCellUpdate, CanvasRowRangeUpdate } from "../canvas/sink.ts";
import type { CanvasRenderStats } from "../canvas/canvas.ts";
import { readCsiSequenceAt, readOsc8SequenceAt } from "../utils/ansi_text.ts";
import { characterWidth, stripStyles } from "../utils/strings.ts";
import { ansi256Color, ansiColor } from "./ansi_color.ts";
import { sgrColor, sgrParameters } from "../utils/sgr_parameters.ts";
import type { AnsiStyleSpec } from "../theme.ts";

const textDecoder = new TextDecoder();

// Light box-drawing glyphs as four half-arms from the centre; bit order URDL.
const BOX_LIGHT_ARMS: ReadonlyMap<number, number> = new Map([
  [0x2500, 0b0101], // ─
  [0x2502, 0b1010], // │
  [0x250c, 0b0110], // ┌
  [0x2510, 0b0011], // ┐
  [0x2514, 0b1100], // └
  [0x2518, 0b1001], // ┘
  [0x251c, 0b1110], // ├
  [0x2524, 0b1011], // ┤
  [0x252c, 0b0111], // ┬
  [0x2534, 0b1101], // ┴
  [0x253c, 0b1111], // ┼
  [0x256d, 0b0110], // ╭ (square-cornered)
  [0x256e, 0b0011], // ╮
  [0x256f, 0b1001], // ╯
  [0x2570, 0b1100], // ╰
  [0x2574, 0b0001], // ╴
  [0x2575, 0b1000], // ╵
  [0x2576, 0b0100], // ╶
  [0x2577, 0b0010], // ╷
]);
const ESCAPE = String.fromCharCode(27);
const SGR_PATTERN = new RegExp(`${ESCAPE}\\[([0-9;:]*)m`, "g");

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
  italic?: boolean;
  underline?: boolean;
  underlineStyle?: AnsiStyleSpec["underlineStyle"];
  underlineColor?: string;
  overline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  /** Sanitized OSC 8 hyperlink URI attached to this cell, when present. */
  hyperlink?: string;
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
  /** Source cells, not pixels: dirty followers must repaint their retained wide owner. */
  #cells: (string | undefined)[] = [];
  readonly #wideOwners = new Set<number>();

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
    columns = Math.max(1, Math.floor(columns));
    rows = Math.max(1, Math.floor(rows));
    if (!Number.isSafeInteger(columns * rows) || columns * rows > 2_000_000) {
      throw new RangeError("Browser cell surfaces support at most 2,000,000 finite cells.");
    }
    this.#columns = columns;
    this.#rows = rows;
    this.#cells = new Array(columns * rows);
    this.#wideOwners.clear();
    this.#canvas.width = Math.ceil(this.#columns * this.#cellWidth * this.#pixelRatio);
    this.#canvas.height = Math.ceil(this.#rows * this.#cellHeight * this.#pixelRatio);
    this.#context.setTransform?.(1, 0, 0, 1, 0, 0);
    this.#context.scale(this.#pixelRatio, this.#pixelRatio);
    this.#context.font = this.#font;
    this.#context.textBaseline = "top";
    this.#context.fillStyle = this.#background;
    this.#context.fillRect(0, 0, this.#canvas.width / this.#pixelRatio, this.#canvas.height / this.#pixelRatio);
  }

  flush(updates: readonly CanvasCellUpdate[], stats: CanvasRenderStats): void {
    const dirty = new Set<number>();
    for (const update of updates) {
      this.#stage(update.row, update.column, update.value, dirty);
    }
    this.#paintDirty(dirty);
    this.#lastStats = { ...stats };
  }

  flushRanges(
    ranges: readonly CanvasRowRangeUpdate[],
    stats: CanvasRenderStats,
    _updates: readonly CanvasCellUpdate[] = [],
  ): void {
    const dirty = new Set<number>();
    for (const range of ranges) {
      let column = range.startColumn;
      for (const value of range.values) {
        this.#stage(range.row, column, value, dirty);
        column += 1;
      }
    }
    this.#paintDirty(dirty);
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

  #stage(row: number, column: number, value: string | Uint8Array, dirty: Set<number>): void {
    if (
      !Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= this.#rows || column < 0 ||
      column >= this.#columns
    ) return;
    const index = row * this.#columns + column;
    dirty.add(index);
    if (this.#wideOwners.has(index)) dirty.add(index + 1);
    if (column > 0 && this.#wideOwners.has(index - 1)) dirty.add(index - 1);
    // Decode at the boundary so borrowed bytes cannot mutate retained state later.
    this.#cells[index] = typeof value === "string" ? value : textDecoder.decode(value);
  }

  #paintDirty(dirty: Set<number>): void {
    const parsed = new Map<number, ParsedAnsiCell>();
    const read = (index: number) => {
      let value = parsed.get(index);
      if (!value) {
        value = parseAnsiCell(this.#cells[index] ?? "");
        parsed.set(index, value);
      }
      return value;
    };
    // TextObject styles empty continuation cells too. A present, styled empty
    // marker still belongs to the owner; an ordinary space or absent cell does not.
    const follower = (index: number) => this.#cells[index] !== undefined && read(index).text === "";
    const span = (index: number): 0 | 1 | 2 => {
      if (characterWidth(read(index).text) !== 2) return 1;
      return index % this.#columns + 1 < this.#columns && follower(index + 1) ? 2 : 0;
    };
    // Stage every update before closing old/new pairs; order and separate row
    // ranges must not let a follower's background erase its owner's pixels.
    for (const index of dirty) {
      if (span(index) === 2) dirty.add(index + 1);
      if (index % this.#columns > 0 && follower(index) && span(index - 1) === 2) {
        dirty.add(index - 1);
      }
    }
    for (const index of dirty) {
      this.#wideOwners.delete(index);
      if (index % this.#columns > 0 && follower(index) && span(index - 1) === 2) {
        continue;
      }
      const style = read(index), width = span(index);
      this.#paintCell(Math.floor(index / this.#columns), index % this.#columns, style, width);
      if (width === 2) this.#wideOwners.add(index);
    }
  }

  #paintCell(row: number, column: number, parsed: ParsedAnsiCell, span: 0 | 1 | 2): void {
    const x = column * this.#cellWidth;
    const y = row * this.#cellHeight;
    const width = Math.max(1, span) * this.#cellWidth;
    // Fractional device pixels cannot be shared between independently dirty
    // cells: antialiased clears otherwise retain ink and depend on paint order.
    // Partition at rounded device boundaries, including the ceil-sized edge.
    const left = Math.round(x * this.#pixelRatio) / this.#pixelRatio;
    const top = Math.round(y * this.#pixelRatio) / this.#pixelRatio;
    const right =
      (column + Math.max(1, span) === this.#columns ? this.#canvas.width : Math.round((x + width) * this.#pixelRatio)) /
      this.#pixelRatio;
    const bottom =
      (row + 1 === this.#rows ? this.#canvas.height : Math.round((y + this.#cellHeight) * this.#pixelRatio)) /
      this.#pixelRatio;
    this.#context.fillStyle = parsed.inverse
      ? parsed.foreground ?? this.#foreground
      : parsed.background ?? this.#background;
    this.#context.fillRect(left, top, right - left, bottom - top);

    const text = span === 0 ? " " : parsed.text || " ";
    const ink = parsed.inverse ? parsed.background ?? this.#background : parsed.foreground ?? this.#foreground;
    const foreground = parsed.dim ? dimColor(ink) : ink;
    if (text.trim().length === 0 && !parsed.underline && !parsed.overline && !parsed.strikethrough) return;
    // Advance is not an ink bound: marks, italics and late-loaded fonts can
    // paint outside it. Clip the whole ink plane, including geometric glyphs
    // and decorations, while retaining original logical font positions.
    if (
      this.#context.save && this.#context.restore && this.#context.beginPath && this.#context.rect && this.#context.clip
    ) {
      this.#context.save();
      try {
        this.#context.beginPath();
        this.#context.rect(left, top, right - left, bottom - top);
        this.#context.clip();
        this.#paintCellInk(parsed, span, text, x, y, foreground, left, top, right - left, bottom - top);
      } finally {
        this.#context.restore();
      }
    } else this.#paintCellInk(parsed, span, text, x, y, foreground, left, top, right - left, bottom - top);
  }

  #paintCellInk(
    parsed: ParsedAnsiCell,
    span: 0 | 1 | 2,
    text: string,
    x: number,
    y: number,
    foreground: string,
    left: number,
    top: number,
    width: number,
    height: number,
  ): void {
    if (text.trim().length === 0) {
      this.#paintDecorations(parsed, x, y, foreground);
      return;
    }
    // Block elements never go through the font: no monospace face fills its
    // cell box exactly, and the shortfall reads as a grid of seams over any
    // shaded background. Halves, eighths, and quadrants become exact rects;
    // shades become alpha fills — full coverage no matter the font metrics.
    if (text.length === 1) {
      const code = text.codePointAt(0)!;
      if (
        (code >= 0x2500 && code <= 0x257f && this.#paintBoxGlyph(code, left, top, foreground, width, height)) ||
        this.#paintBlockGlyph(code, left, top, foreground, width, height)
      ) {
        this.#paintDecorations(parsed, x, y, foreground);
        return;
      }
    }
    this.#context.font = `${parsed.italic ? "italic " : ""}${parsed.bold ? "700 " : ""}${this.#font}`;
    this.#context.fillStyle = foreground;
    this.#context.fillText(text, x, y);
    this.#paintDecorations(parsed, x, y, foreground);
    if (span === 2) this.#paintDecorations(parsed, x + this.#cellWidth, y, foreground);
  }

  /** Conventional terminal lines stay inside the cell and clear with its next background paint. */
  #paintDecorations(style: ParsedAnsiCell, x: number, y: number, color: string): void {
    if (!style.underline && !style.strikethrough && !style.overline) return;
    const thickness = Math.min(this.#cellHeight, Math.max(1, Math.round(this.#cellHeight / 16)));
    this.#context.fillStyle = color;
    if (style.overline) this.#context.fillRect(x, y, this.#cellWidth, thickness);
    if (style.strikethrough) {
      this.#context.fillRect(x, y + Math.floor((this.#cellHeight - thickness) / 2), this.#cellWidth, thickness);
    }
    if (!style.underline) return;
    this.#context.fillStyle = style.underlineColor ?? color;
    const bottom = y + this.#cellHeight - thickness;
    const line = style.underlineStyle ?? "solid";
    if (line === "solid" || line === "double") {
      this.#context.fillRect(x, bottom, this.#cellWidth, thickness);
      if (line === "double" && this.#cellHeight > thickness * 2) {
        this.#context.fillRect(x, Math.max(y, bottom - thickness * 2), this.#cellWidth, thickness);
      }
    } else {
      // Global screen-coordinate phase keeps adjacent cells and dirty ranges continuous.
      // Rect samples avoid depending on optional Canvas path methods and never escape this cell.
      const period = line === "dotted" ? thickness * 2 : line === "dashed" ? thickness * 6 : thickness * 8;
      const step = Math.max(1, this.#cellWidth / 512);
      for (let offset = 0; offset < this.#cellWidth; offset += step) {
        const phase = (x + offset) % period;
        if (line === "dotted" && phase >= thickness || line === "dashed" && phase >= thickness * 4) continue;
        const top = line === "wavy"
          ? Math.max(
            y,
            bottom - Math.min(this.#cellHeight - thickness, thickness * 2) *
                (1 + Math.sin((x + offset) * Math.PI * 2 / period)) / 2,
          )
          : bottom;
        this.#context.fillRect(x + offset, top, Math.min(step, this.#cellWidth - offset), thickness);
      }
    }
  }

  /**
   * Box-drawing glyphs as geometry: light and heavy arms, square corners,
   * tees and crosses, and the double-line set. Font glyphs for these rarely
   * span the full cell, and the shortfall reads as gaps along every wire and
   * window border; exact rects meet at the cell edges instead.
   */
  #paintBoxGlyph(code: number, x: number, y: number, foreground: string, w: number, h: number): boolean {
    const context = this.#context;
    const t = Math.max(1, Math.round(Math.min(w, h) / 8));
    const heavy = Math.max(2, t * 2);
    const cx = x + Math.floor((w - t) / 2);
    const cy = y + Math.floor((h - t) / 2);
    const hline = (top: number, from: number, to: number, thickness = t) =>
      context.fillRect(from, top, Math.max(0, to - from), thickness);
    const vline = (left: number, from: number, to: number, thickness = t) =>
      context.fillRect(left, from, thickness, Math.max(0, to - from));
    const arms = code === 0x2501 ? 0b0101 : code === 0x2503 ? 0b1010 : BOX_LIGHT_ARMS.get(code);
    if (arms !== undefined) {
      context.fillStyle = foreground;
      const thickness = code === 0x2501 || code === 0x2503 ? heavy : t;
      const armCx = x + Math.floor((w - thickness) / 2);
      const armCy = y + Math.floor((h - thickness) / 2);
      if (arms & 0b1000) vline(armCx, y, armCy + thickness, thickness);
      if (arms & 0b0010) vline(armCx, armCy, y + h, thickness);
      if (arms & 0b0001) hline(armCy, x, armCx + thickness, thickness);
      if (arms & 0b0100) hline(armCy, armCx, x + w, thickness);
      return true;
    }
    // Doubles: two parallel lines, outer corners long and inner corners short.
    const d = Math.max(t + 1, Math.round(Math.min(w, h) / 5));
    const yT = cy - d;
    const yB = cy + d;
    const xL = cx - d;
    const xR = cx + d;
    context.fillStyle = foreground;
    switch (code) {
      case 0x2550: // ═
        hline(yT, x, x + w);
        hline(yB, x, x + w);
        return true;
      case 0x2551: // ║
        vline(xL, y, y + h);
        vline(xR, y, y + h);
        return true;
      case 0x2554: // ╔
        hline(yT, xL, x + w);
        hline(yB, xR, x + w);
        vline(xL, yT, y + h);
        vline(xR, yB, y + h);
        return true;
      case 0x2557: // ╗
        hline(yT, x, xR + t);
        hline(yB, x, xL + t);
        vline(xR, yT, y + h);
        vline(xL, yB, y + h);
        return true;
      case 0x255a: // ╚
        hline(yB, xL, x + w);
        hline(yT, xR, x + w);
        vline(xL, y, yB + t);
        vline(xR, y, yT + t);
        return true;
      case 0x255d: // ╝
        hline(yB, x, xR + t);
        hline(yT, x, xL + t);
        vline(xR, y, yB + t);
        vline(xL, y, yT + t);
        return true;
      case 0x2560: // ╠
        vline(xL, y, y + h);
        vline(xR, y, yT + t);
        vline(xR, yB, y + h);
        hline(yT, xR, x + w);
        hline(yB, xR, x + w);
        return true;
      case 0x2563: // ╣
        vline(xR, y, y + h);
        vline(xL, y, yT + t);
        vline(xL, yB, y + h);
        hline(yT, x, xL + t);
        hline(yB, x, xL + t);
        return true;
      case 0x2566: // ╦
        hline(yT, x, x + w);
        hline(yB, x, xL + t);
        hline(yB, xR, x + w);
        vline(xL, yB, y + h);
        vline(xR, yB, y + h);
        return true;
      case 0x2569: // ╩
        hline(yB, x, x + w);
        hline(yT, x, xL + t);
        hline(yT, xR, x + w);
        vline(xL, y, yT + t);
        vline(xR, y, yT + t);
        return true;
      case 0x256c: // ╬
        vline(xL, y, yT + t);
        vline(xR, y, yT + t);
        vline(xL, yB, y + h);
        vline(xR, yB, y + h);
        hline(yT, x, xL + t);
        hline(yB, x, xL + t);
        hline(yT, xR, x + w);
        hline(yB, xR, x + w);
        return true;
      case 0x256a: // ╪
        hline(yT, x, x + w);
        hline(yB, x, x + w);
        vline(cx, y, y + h);
        return true;
      case 0x256b: // ╫
        vline(xL, y, y + h);
        vline(xR, y, y + h);
        hline(cy, x, x + w);
        return true;
      default:
        return false;
    }
  }

  #paintBlockGlyph(code: number, x: number, y: number, foreground: string, w: number, h: number): boolean {
    if (code < 0x2580 || code > 0x259f) return false;
    const context = this.#context;
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
}

/** Parses SGR styling and any leading OSC 8 hyperlink from a single terminal cell string. */
export function parseAnsiCell(value: string): ParsedAnsiCell {
  const style: ParsedAnsiCell = { text: stripStyles(value), bold: false, dim: false };
  const lead = scanAnsiCellLead(value);
  if (lead.hyperlink) style.hyperlink = lead.hyperlink;
  const textIndex = lead.textIndex;
  const matches = value.matchAll(SGR_PATTERN);
  for (const match of matches) {
    if (match.index !== undefined && match.index > textIndex) break;
    const params = sgrParameters(match[1] ?? "");
    for (let index = 0; index < params.length; index += 1) {
      const parts = params[index]!.split(":"), param = Number(parts[0]);
      if (parts.length > 1 && param === 4) {
        if (parts.length === 2 && /^[0-5]$/.test(parts[1]!)) {
          if (parts[1] === "0") {
            delete style.underline;
            delete style.underlineStyle;
          } else {
            style.underline = true;
            style.underlineStyle = (["solid", "double", "wavy", "dotted", "dashed"] as const)[Number(parts[1]) - 1];
          }
        }
        continue;
      }
      if (param === 38 || param === 48 || param === 58) {
        const decoded = sgrColor(params, index);
        const color = decoded.rgb
          ? `rgb(${decoded.rgb.join(",")})`
          : decoded.palette !== undefined
          ? ansi256Color(decoded.palette)
          : undefined;
        if (color !== undefined) {
          if (param === 38) style.foreground = color;
          else if (param === 48) style.background = color;
          else style.underlineColor = color;
        }
        index += decoded.consumed - 1;
        continue;
      }
      if (parts.length > 1) continue;
      if (param === 0) {
        style.foreground = undefined;
        style.background = undefined;
        style.bold = false;
        style.dim = false;
        delete style.italic;
        delete style.underline;
        delete style.strikethrough;
        delete style.underlineColor;
        delete style.underlineStyle;
        delete style.overline;
        delete style.inverse;
      } else if (param === 1) {
        style.bold = true;
      } else if (param === 2) {
        style.dim = true;
      } else if (param === 3) {
        style.italic = true;
      } else if (param === 4) {
        style.underline = true;
        delete style.underlineStyle;
      } else if (param === 21) {
        style.underline = true;
        style.underlineStyle = "double";
      } else if (param === 53) {
        style.overline = true;
      } else if (param === 55) {
        delete style.overline;
      } else if (param === 59) {
        delete style.underlineColor;
      } else if (param === 9) {
        style.strikethrough = true;
      } else if (param === 7) {
        style.inverse = true;
      } else if (param === 27) {
        delete style.inverse;
      } else if (param === 23) {
        delete style.italic;
      } else if (param === 24) {
        delete style.underline;
        delete style.underlineStyle;
      } else if (param === 29) {
        delete style.strikethrough;
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
      }
    }
  }
  return style;
}

function scanAnsiCellLead(value: string): { textIndex: number; hyperlink?: string } {
  let index = 0;
  let hyperlink: string | undefined;
  while (index < value.length) {
    if (value[index] !== "\x1b") return { textIndex: index, hyperlink };
    const csi = readCsiSequenceAt(value, index);
    if (csi) {
      index += csi.length;
      continue;
    }
    const osc8 = readOsc8SequenceAt(value, index);
    if (osc8) {
      hyperlink = osc8.uri || undefined;
      index += osc8.length;
      continue;
    }
    // Skip any other unrecognized escape sequence conservatively up to a CSI/ST boundary.
    index += 1;
    while (index < value.length && value[index] !== "m" && value[index] !== "\x07" && value[index] !== "\\") {
      index += 1;
    }
    index += 1;
  }
  return { textIndex: value.length, hyperlink };
}

function dimColor(color: string): string {
  return color.startsWith("#") ? `${color}aa` : color;
}
