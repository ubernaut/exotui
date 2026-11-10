// Copyright 2023 Im-Beast. MIT license.
import type { MermaidNativeCell } from "./mermaid_cells.ts";
import type { MermaidScene, MermaidSceneClip, MermaidSceneComposite } from "./mermaid_scene.ts";
import { BLEND_MODES, overPaint, type PaintColor, paintCSS, parsePaintColor } from "./mermaid_paint.ts";
import { textWidth } from "../utils/strings.ts";
import { type FilterCell, filterCells } from "./mermaid_filter.ts";
import { type FilterBufferGrid, filterBufferGrid } from "./mermaid_filter_buffer.ts";

type PixelCell = FilterCell;
interface Layer {
  group?: MermaidSceneComposite;
  pixels: Map<number, PixelCell>;
}
interface FilterOptions {
  columnUnits: number;
  rowUnits: number;
  predicate: (clip?: MermaidSceneClip) => (x: number, y: number) => boolean;
}

/** Bounded sparse group buffers preserve SVG group opacity instead of fading each child independently. */
export class MermaidCompositor {
  readonly #cells: MermaidNativeCell[][];
  readonly #columns: number;
  readonly grid: FilterBufferGrid;
  readonly #charge: (amount: number) => void;
  readonly #limit: number;
  readonly #groups: MermaidSceneComposite[];
  readonly #filterOptions: FilterOptions;
  readonly #maxCells: number;
  readonly #layers: Layer[] = [{ pixels: new Map() }];
  #next = 0;
  #allocated = 0;

  constructor(
    cells: MermaidNativeCell[][],
    groups: readonly MermaidSceneComposite[],
    items: MermaidScene["items"],
    maxCells: number,
    charge: (amount: number) => void,
    diagnostics: Set<string>,
    filterOptions: FilterOptions,
  ) {
    this.#cells = cells;
    this.#charge = charge;
    this.#filterOptions = filterOptions;
    this.#maxCells = maxCells;
    this.#limit = Math.min(4_000_000, maxCells * 4);
    if (groups.length > 20_000) throw new RangeError("Native Mermaid exceeds its composite-group budget.");
    this.#groups = [...groups].sort((a, b) => a.start - b.start || b.end - a.end || a.depth - b.depth);
    const stack: MermaidSceneComposite[] = [];
    for (const group of this.#groups) {
      if (
        ![group.start, group.end, group.depth].every(Number.isSafeInteger) || group.start < 0 ||
        group.end <= group.start || group.end > items.length || group.depth < 0 || !Number.isFinite(group.opacity) ||
        group.opacity < 0 || group.opacity > 1
      ) {
        throw new RangeError("Invalid native composite range or opacity.");
      }
      while (stack.length && stack.at(-1)!.end <= group.start) stack.pop();
      if (stack.length && group.end > stack.at(-1)!.end || stack.length >= 64) {
        throw new RangeError("Invalid or excessive native composite nesting.");
      }
      stack.push(group);
      if (!BLEND_MODES.has(group.blendMode)) {
        diagnostics.add(`Native blend mode needs implementation: ${group.blendMode}`);
      }
    }
    charge(groups.length * Math.max(1, Math.ceil(Math.log2(groups.length + 1))));
    this.grid = filterBufferGrid(
      items,
      this.#groups,
      cells[0]!.length,
      cells.length,
      filterOptions.columnUnits,
      filterOptions.rowUnits,
      filterOptions.predicate,
      charge,
    );
    this.#columns = this.grid.columns;
  }

  /** Enter/leave measured paint ranges before drawing the next ordinary scene item. */
  at(index: number): void {
    while (this.#layers.length > 1 && this.#layers.at(-1)!.group!.end <= index) this.#pop();
    while (this.#groups[this.#next]?.start === index) {
      this.#layers.push({ group: this.#groups[this.#next++]!, pixels: new Map() });
    }
  }

  /** Whether an ancestor needs SourceGraphic beyond the ordinary visible cell buffer. */
  get filtering(): boolean {
    return this.#layers.some((layer) => !!layer.group?.filter);
  }

  /** Independent decoration ink has not yet joined the sparse filter/group paint buffers. */
  get decoratedInkNeedsPaint(): boolean {
    return this.#layers.some((layer) =>
      layer.group && (layer.group.opacity !== 1 ||
        layer.group.blendMode !== "normal" || !!layer.group.filter)
    );
  }

  /** Paint one clipped glyph/background sample into the current isolated layer. */
  put(x: number, y: number, cell: Partial<MermaidNativeCell>, color: PaintColor | undefined): void {
    if (!color || color.alpha <= 0) return;
    this.#charge(8);
    const layer = this.#layers.at(-1)!;
    const target = this.#target(layer, (y - this.grid.top) * this.#columns + x - this.grid.left);
    if (cell.background !== undefined) this.#fill(target, color, cell);
    else {
      target.foreground = overPaint(color, target.foreground ?? target.background);
      if (cell.char !== undefined) {
        target.cell.bold = undefined;
        target.cell.italic = undefined;
        target.cell.underline = undefined;
        target.cell.underlineColor = undefined;
        target.cell.underlineStyle = undefined;
        target.cell.overline = undefined;
        target.cell.strikethrough = undefined;
      }
      Object.assign(target.cell, cell);
    }
  }

  /** Resolve remaining groups and optionally flatten only painted samples against a host-provided opaque backdrop. */
  finish(background?: string): void {
    while (this.#layers.length > 1) this.#pop();
    const backdrop = parsePaintColor(background);
    if (background !== undefined && (!backdrop || backdrop.alpha !== 1)) {
      throw new RangeError("Native Mermaid backdrop must be an opaque RGB color.");
    }
    for (const [index, pixel] of this.#layers[0]!.pixels) {
      this.#charge(4);
      const x = index % this.#columns + this.grid.left;
      const y = Math.floor(index / this.#columns) + this.grid.top;
      if (!this.#cells[y]?.[x]) continue;
      this.#cells[y]![x] = {
        ...pixel.cell,
        background: paintCSS(pixel.background && backdrop ? overPaint(pixel.background, backdrop) : pixel.background),
        foreground: paintCSS(pixel.foreground && backdrop ? overPaint(pixel.foreground, backdrop) : pixel.foreground),
      };
    }
    // Overlays can cover either half of a wide glyph. Never leave an orphan
    // continuation or display a wide glyph whose continuation was replaced.
    for (const row of this.#cells) {
      let continuation = 0;
      for (let index = 0; index < row.length; index++) {
        const cell = row[index]!;
        if (cell.char === "") {
          if (continuation) continuation--;
          else row[index] = { char: " ", background: cell.background };
          continue;
        }
        continuation = 0;
        if (cell.char.length === 1 && cell.char.charCodeAt(0) < 128) continue;
        this.#charge(4);
        const width = textWidth(cell.char);
        if (
          width > 1 && row.slice(index + 1, index + width).every((next) => next.char === "") &&
          index + width <= row.length
        ) continuation = width - 1;
        else if (width > 1) row[index] = { char: " ", background: cell.background };
      }
    }
  }

  #target(layer: Layer, index: number): PixelCell {
    const found = layer.pixels.get(index);
    if (found) return found;
    if (++this.#allocated > this.#limit) throw new RangeError("Native Mermaid exceeds its composite-cell budget.");
    const target: PixelCell = { cell: { char: " " } };
    layer.pixels.set(index, target);
    return target;
  }

  #fill(target: PixelCell, color: PaintColor, cell: Partial<MermaidNativeCell>): void {
    const visible = target.foreground ?? target.background;
    target.background = overPaint(color, target.background);
    if (color.alpha >= 1) {
      target.cell = { char: " ", href: cell.href, interaction: cell.interaction };
      target.foreground = undefined;
    } else if (target.cell.char !== " ") {
      target.foreground = overPaint(color, visible);
      target.cell.href = cell.href;
      target.cell.interaction = cell.interaction;
    } else {
      target.cell.href = cell.href;
      target.cell.interaction = cell.interaction;
    }
  }

  #pop(): void {
    const layer = this.#layers.pop()!;
    const group = layer.group!;
    const parent = this.#layers.at(-1)!;
    const mode = BLEND_MODES.has(group.blendMode) ? group.blendMode : "normal";
    if (group.filter) {
      const original = layer.pixels.size;
      layer.pixels = filterCells(layer.pixels, group.filter, {
        ...this.#filterOptions,
        columns: this.#columns,
        rows: this.grid.rows,
        left: this.grid.left,
        top: this.grid.top,
        maxCells: this.#maxCells,
        charge: this.#charge,
      });
      this.#allocated += layer.pixels.size - original;
      if (this.#allocated > this.#limit) throw new RangeError("Native Mermaid exceeds its composite-cell budget.");
    }
    const inside = this.#filterOptions.predicate(group.clip);
    for (const [index, source] of layer.pixels) {
      this.#charge(24);
      if (!group.opacity) continue;
      const x = index % this.#columns + this.grid.left;
      const y = Math.floor(index / this.#columns) + this.grid.top;
      const shift = source.cell.char === " " ? .5 : 0;
      if (!inside((x + shift) * this.#filterOptions.columnUnits, (y + shift) * this.#filterOptions.rowUnits)) continue;
      const target = this.#target(parent, index);
      const visible = target.foreground ?? target.background;
      if (source.background) {
        const background = overPaint(source.background, target.background, group.opacity, mode);
        if (source.background.alpha * group.opacity >= 1) {
          target.cell = { char: " ", href: source.cell.href, interaction: source.cell.interaction };
          target.foreground = undefined;
        } else if (target.cell.char !== " ") {
          target.foreground = overPaint(source.background, visible, group.opacity, mode);
          target.cell.href = source.cell.href;
          target.cell.interaction = source.cell.interaction;
        } else {
          target.cell.href = source.cell.href;
          target.cell.interaction = source.cell.interaction;
        }
        target.background = background;
      }
      if (source.foreground) {
        target.foreground = overPaint(source.foreground, visible, group.opacity, mode);
        target.cell = { ...source.cell };
      }
    }
    this.#allocated -= layer.pixels.size;
  }
}
