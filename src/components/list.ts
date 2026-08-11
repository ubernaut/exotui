// Copyright 2023 Im-Beast. MIT license.
import { Component, type ComponentOptions } from "../component.ts";
import { clampSelectionIndex, selectionWindow } from "../selection.ts";
import { Computed, Signal } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";
import { drawTextRows } from "./text_children.ts";
import { Text } from "./text.ts";
import { cropToWidth, textWidth } from "../utils/strings.ts";
import { BoxObject } from "../canvas/box.ts";
import type { TextRectangle } from "../canvas/text.ts";
import type { Rectangle } from "../types.ts";
import type { Style } from "../theme.ts";

/** Styles for a List scrollbar's track and thumb. */
export interface ListScrollbar {
  track: Style;
  thumb: Style;
}

/** Options for configuring list. */
export interface ListOptions extends ComponentOptions, ListControllerOptions {
  controller?: ListController;
  /**
   * Style for the selected row. When set, the selection is drawn as a full-width
   * highlight (over the base rows) rather than only marked with `>`.
   */
  selectedStyle?: Style;
  /**
   * When set, a one-column scrollbar is drawn down the List's right edge; the
   * thumb's size scales with the visible/total ratio and tracks the scroll window.
   */
  scrollbar?: ListScrollbar;
  /**
   * Chooses each row's one-character leading marker (default `>` for the selected
   * row, space otherwise). Use it to mark a secondary state — a current/active
   * item distinct from the selection. Read a Signal inside it to stay reactive.
   */
  markerFor?: ListRowMarker;
}

/** Public interface describing a virtual Row. */
export interface VirtualRow<T> {
  item: T;
  index: number;
  selected: boolean;
}

/** Public helper for virtual Rows. */
export function virtualRows<T>(
  items: readonly T[],
  selectedIndex: number,
  height: number,
): VirtualRow<T>[] {
  const safeHeight = Math.max(0, height);
  const selected = clampSelectionIndex(items.length, selectedIndex);
  const window = selectionWindow(items.length, selected, safeHeight);
  const rows = new Array<VirtualRow<T>>(Math.max(0, window.end - window.start));
  for (let offset = 0; offset < rows.length; offset += 1) {
    const index = window.start + offset;
    rows[offset] = {
      item: items[index]!,
      index,
      selected: index === selected,
    };
  }
  return rows;
}

/** Pads (and clips) a row to an exact display width so trailing cells are cleared. */
export function padListRow(row: string, width: number): string {
  if (width <= 0) return "";
  const cropped = cropToWidth(row, width);
  const pad = width - textWidth(cropped);
  return pad > 0 ? cropped + " ".repeat(pad) : cropped;
}

/** Resolves the one-character leading marker for a row. */
export type ListRowMarker = (index: number, selected: boolean) => string;

const defaultRowMarker: ListRowMarker = (_index, selected) => selected ? ">" : " ";

/** Public helper for visible List Rows. */
export function visibleListRows(
  items: readonly string[],
  selectedIndex: number,
  height: number,
  width?: number,
  markerFor: ListRowMarker = defaultRowMarker,
): string[] {
  return visibleListRowsInto([], items, selectedIndex, height, width, markerFor);
}

/**
 * Renders visible List Rows into a caller-owned buffer. When `width` is given,
 * each row is padded (and clipped) to that display width so a shorter row after
 * a scroll fully overwrites a longer one — no stale trailing characters.
 * `markerFor` chooses each row's one-character leading marker (default `>` for
 * the selected row, space otherwise), for secondary states like a current item.
 */
export function visibleListRowsInto(
  target: string[],
  items: readonly string[],
  selectedIndex: number,
  height: number,
  width?: number,
  markerFor: ListRowMarker = defaultRowMarker,
): string[] {
  const safeHeight = Math.max(0, height);
  const selected = clampSelectionIndex(items.length, selectedIndex);
  const window = selectionWindow(items.length, selected, safeHeight);
  const count = Math.max(0, window.end - window.start);
  target.length = count;
  for (let offset = 0; offset < count; offset += 1) {
    const index = window.start + offset;
    const row = `${markerFor(index, index === selected)} ${items[index]!}`;
    target[offset] = width === undefined ? row : padListRow(row, width);
  }
  return target;
}

/** Options for configuring list Controller. */
export interface ListControllerOptions {
  items: string[] | Signal<string[]>;
  selectedIndex?: number | Signal<number>;
  onSelect?: (item: string, index: number) => void | Promise<void>;
}

/** Serializable inspection snapshot for list. */
export interface ListInspection {
  items: string[];
  itemCount: number;
  selectedIndex: number;
  selected?: string;
  window: { start: number; end: number };
  empty: boolean;
}

/** State controller for list behavior. */
export class ListController {
  readonly items: Signal<string[]>;
  readonly selectedIndex: Signal<number>;
  readonly #ownsItems: boolean;
  readonly #ownsSelectedIndex: boolean;
  readonly #onSelect?: (item: string, index: number) => void | Promise<void>;
  readonly #syncSelection = () => {
    this.selectedIndex.value = clampSelectionIndex(this.items.peek().length, this.selectedIndex.peek());
  };

  constructor(options: ListControllerOptions) {
    this.#ownsItems = !(options.items instanceof Signal);
    this.#ownsSelectedIndex = !(options.selectedIndex instanceof Signal);
    this.items = signalify(options.items, { deepObserve: true });
    this.selectedIndex = signalify(options.selectedIndex ?? 0);
    this.#onSelect = options.onSelect;
    this.items.subscribe(this.#syncSelection);
    this.#syncSelection();
  }

  rows(height: number): string[] {
    return visibleListRows(this.items.peek(), this.selectedIndex.peek(), height);
  }

  selected(): string | undefined {
    return this.items.peek()[clampSelectionIndex(this.items.peek().length, this.selectedIndex.peek())];
  }

  move(delta: number): string | undefined {
    return this.setSelectedIndex(this.selectedIndex.peek() + delta);
  }

  page(delta: number, height: number): string | undefined {
    return this.move(delta * Math.max(1, Math.floor(height)));
  }

  first(): string | undefined {
    return this.setSelectedIndex(0);
  }

  last(): string | undefined {
    return this.setSelectedIndex(this.items.peek().length - 1);
  }

  setSelectedIndex(index: number): string | undefined {
    this.selectedIndex.value = clampSelectionIndex(this.items.peek().length, index);
    return this.selected();
  }

  selectActive(): string | undefined {
    const index = clampSelectionIndex(this.items.peek().length, this.selectedIndex.peek());
    const item = this.items.peek()[index];
    if (item !== undefined) {
      void this.#onSelect?.(item, index);
    }
    return item;
  }

  /** The item index shown at a visible row `offset` for the current scroll window. */
  indexAtRow(offset: number, height: number): number {
    const length = this.items.peek().length;
    const window = selectionWindow(length, this.selectedIndex.peek(), Math.max(0, Math.floor(height)));
    return clampSelectionIndex(length, window.start + Math.max(0, Math.floor(offset)));
  }

  /** Moves the selection one row per wheel notch (positive scroll moves down). */
  handleScroll(scroll: number): string | undefined {
    if (!scroll) return undefined;
    return this.move(scroll > 0 ? 1 : -1);
  }

  handleKeyPress(
    { key, ctrl, meta, shift }: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean },
    height = 1,
  ): string | undefined {
    if (ctrl || meta || shift) return undefined;
    if (key === "up") this.move(-1);
    else if (key === "down") this.move(1);
    else if (key === "pageup") this.page(-1, height);
    else if (key === "pagedown") this.page(1, height);
    else if (key === "home") this.first();
    else if (key === "end") this.last();
    else if (key === "return" || key === "space") return this.selectActive();
    return undefined;
  }

  inspect(height: number = this.items.peek().length): ListInspection {
    const items = [...this.items.peek()];
    const selectedIndex = clampSelectionIndex(items.length, this.selectedIndex.peek());
    return {
      items,
      itemCount: items.length,
      selectedIndex,
      selected: items[selectedIndex],
      window: selectionWindow(items.length, selectedIndex, Math.max(0, Math.floor(height))),
      empty: items.length === 0,
    };
  }

  dispose(): void {
    this.items.unsubscribe(this.#syncSelection);
    if (this.#ownsItems) this.items.dispose();
    if (this.#ownsSelectedIndex) this.selectedIndex.dispose();
  }
}

/** Public class implementing a list. */
export class List extends Component {
  declare drawnObjects: { scrollbarTrack?: BoxObject; scrollbarThumb?: BoxObject };
  items: Signal<string[]>;
  selectedIndex: Signal<number>;
  readonly controller: ListController;
  readonly #rows: Computed<string[]>;
  readonly #rowBuffer: string[] = [];
  readonly #selectedStyle?: Style;
  readonly #scrollbar?: ListScrollbar;
  readonly #markerFor: ListRowMarker;

  constructor(options: ListOptions) {
    super(options);
    const ownsController = !options.controller;
    this.controller = options.controller ??
      new ListController({
        items: options.items,
        selectedIndex: options.selectedIndex,
        onSelect: options.onSelect,
      });
    this.#selectedStyle = options.selectedStyle;
    this.#scrollbar = options.scrollbar;
    this.#markerFor = options.markerFor ?? defaultRowMarker;
    this.items = this.controller.items;
    this.selectedIndex = this.controller.selectedIndex;
    this.#rows = new Computed(() =>
      visibleListRowsInto(
        this.#rowBuffer,
        this.items.value,
        this.selectedIndex.value,
        this.rectangle.value.height,
        // Pad rows to the full width so a shorter row fully overwrites a longer
        // one on scroll; reserve the last column when a scrollbar is shown.
        Math.max(0, this.rectangle.value.width - (this.#scrollbar ? 1 : 0)),
        this.#markerFor,
      )
    );

    this.on("keyPress", (event) => {
      this.controller.handleKeyPress(event, this.rectangle.peek().height);
    });
    // Clicking a visible row selects (and, unless it is a drag, activates) it;
    // the wheel moves the selection a row at a time. A List renders a scrolling
    // window, so the item under the pointer is resolved through that window.
    this.on("mousePress", ({ y, drag, ctrl, meta, shift }) => {
      if (ctrl || meta || shift) return;
      const rectangle = this.rectangle.peek();
      this.controller.setSelectedIndex(this.controller.indexAtRow(y - rectangle.row, rectangle.height));
      if (!drag) this.controller.selectActive();
    });
    this.on("mouseScroll", ({ scroll }) => {
      this.controller.handleScroll(scroll);
    });
    this.on("destroy", () => this.#rows.dispose());
    if (ownsController) this.on("destroy", () => this.controller.dispose());
  }

  /** A List is an interactable focus target: clicking or arrowing to it focuses it. */
  override interact(method: "keyboard" | "mouse"): void {
    super.interact(method);
    this.state.value = this.nextInteractionState(method);
  }

  override draw(): void {
    super.draw();
    drawTextRows(this, this.#rows);
    if (this.#selectedStyle) this.#drawSelectionHighlight(this.#selectedStyle);
    if (this.#scrollbar) this.#drawScrollbar(this.#scrollbar);
  }

  /** Full-width highlight drawn over the selected row, above the base rows. */
  #drawSelectionHighlight(style: Style): void {
    const reserve = this.#scrollbar ? 1 : 0;
    const label = new Computed(() => {
      const items = this.items.value;
      const index = clampSelectionIndex(items.length, this.selectedIndex.value);
      const item = items[index];
      if (item === undefined) return "";
      return padListRow(`${this.#markerFor(index, true)} ${item}`, Math.max(0, this.rectangle.value.width - reserve));
    });
    const rectangle = new Computed<TextRectangle>(() => {
      const rect = this.rectangle.value;
      const items = this.items.value;
      const index = clampSelectionIndex(items.length, this.selectedIndex.value);
      const window = selectionWindow(items.length, index, Math.max(0, Math.floor(rect.height)));
      return { column: rect.column, row: rect.row + (index - window.start), width: Math.max(0, rect.width - reserve) };
    });
    const highlight = new Text({
      parent: this,
      theme: { base: style },
      zIndex: new Computed(() => this.zIndex.value + 1),
      text: label,
      overwriteWidth: true,
      rectangle,
      visible: new Computed(() => this.visible.value && this.items.value.length > 0),
    });
    highlight.subComponentOf = this;
    this.subComponents.selection = highlight;
  }

  /** One-column scrollbar down the right edge, thumb scaled to the visible ratio. */
  #drawScrollbar(scrollbar: ListScrollbar): void {
    const track = new BoxObject({
      view: this.view,
      canvas: this.tui.canvas,
      zIndex: new Computed(() => this.zIndex.value + 1),
      style: scrollbar.track,
      rectangle: new Computed<Rectangle>(() => {
        const rect = this.rectangle.value;
        return { column: rect.column + rect.width - 1, row: rect.row, width: 1, height: Math.max(0, rect.height) };
      }),
    });
    this.drawnObjects.scrollbarTrack = track;
    track.draw();

    const thumb = new BoxObject({
      view: this.view,
      canvas: this.tui.canvas,
      zIndex: new Computed(() => this.zIndex.value + 2),
      style: scrollbar.thumb,
      rectangle: new Computed<Rectangle>(() => {
        const rect = this.rectangle.value;
        const column = rect.column + rect.width - 1;
        const total = this.items.value.length;
        const height = Math.max(1, Math.floor(rect.height));
        if (total <= height) return { column, row: rect.row, width: 1, height };
        const index = clampSelectionIndex(total, this.selectedIndex.value);
        const window = selectionWindow(total, index, height);
        const thumbSize = Math.max(1, Math.min(height, Math.round((height * height) / total)));
        const maxStart = height - thumbSize;
        const thumbStart = Math.min(maxStart, Math.round((maxStart * window.start) / Math.max(1, total - height)));
        return { column, row: rect.row + thumbStart, width: 1, height: thumbSize };
      }),
    });
    this.drawnObjects.scrollbarThumb = thumb;
    thumb.draw();
  }
}
