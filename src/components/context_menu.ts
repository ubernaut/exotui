// Copyright 2023 Im-Beast. MIT license.
import { Component, type ComponentOptions } from "../component.ts";
import { resolveSelectionPaint, type SelectionPaintState, stateHoldsInput } from "../focus.ts";
import type { KeyPressEvent } from "../input_reader/types.ts";
import { Computed, Signal } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";
import { drawTextRows } from "./text_children.ts";
import { TextObject, type TextRectangle } from "../canvas/text.ts";
import type { Rectangle } from "../types.ts";
import type { Style } from "../theme.ts";
import { padListRow } from "./list.ts";

/** Public interface describing a context Menu Item. */
export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  /** Marks a destructive command (delete, quit); renderers give it the danger tone. */
  danger?: boolean;
}

/** Chooses the style for one menu row; falls back to the component's base. */
export type ContextMenuItemStyle = (
  item: ContextMenuItem,
  selected: boolean,
  paint: SelectionPaintState,
) => Style | undefined;

/** Resolves the one-character leading marker for a menu row. */
export type ContextMenuRowMarker = (item: ContextMenuItem, selected: boolean, paint: SelectionPaintState) => string;

/** Options for configuring context Menu. */
export interface ContextMenuOptions extends ComponentOptions, ContextMenuControllerOptions {
  controller?: ContextMenuController;
  onSelect?: (item: ContextMenuItem) => void | Promise<void>;
  /** Per-item style (danger tone, selection block); falls back to the base theme. */
  itemStyle?: ContextMenuItemStyle;
  /** Per-item leading marker (default `>` for the selected row). */
  markerFor?: ContextMenuRowMarker;
}

/**
 * Places a context menu at a pointer anchor, clamped so the whole panel stays
 * on screen; without an anchor the caller-provided docked position is used
 * (itself clamped). This is the "open at the cursor, never off the edge" rule
 * a right-click menu needs.
 */
export function contextMenuPlacement(
  bounds: Rectangle,
  width: number,
  height: number,
  anchor?: { readonly column: number; readonly row: number },
  docked: { readonly column: number; readonly row: number } = { column: bounds.column, row: bounds.row },
): Rectangle {
  const fittedWidth = Math.min(Math.max(1, width), Math.max(1, bounds.width));
  const fittedHeight = Math.min(Math.max(1, height), Math.max(1, bounds.height));
  const at = anchor ?? docked;
  return {
    column: Math.max(bounds.column, Math.min(at.column, bounds.column + bounds.width - fittedWidth)),
    row: Math.max(bounds.row, Math.min(at.row, bounds.row + bounds.height - fittedHeight)),
    width: fittedWidth,
    height: fittedHeight,
  };
}

/** Options for configuring context Menu Controller. */
export interface ContextMenuControllerOptions {
  items: ContextMenuItem[] | Signal<ContextMenuItem[]>;
  selectedIndex?: number | Signal<number>;
}

/** Serializable inspection snapshot for context Menu. */
export interface ContextMenuInspection {
  selectedIndex: number;
  itemCount: number;
  selected?: ContextMenuItem;
}

/** Renders context Menu Rows into deterministic text rows. */
export function renderContextMenuRows(
  items: readonly ContextMenuItem[],
  selectedIndex: number,
  height: number,
  width?: number,
): string[] {
  const visible = visibleContextMenuItems(items, selectedIndex, height);
  const rows = new Array<string>(visible.length);
  for (let index = 0; index < visible.length; index += 1) {
    const row = visible[index]!;
    if (row.item.separatorBefore) {
      // A separator spans the menu; without a width it can only guess from
      // its own (usually empty) label, which rendered as a floating "──".
      rows[index] = "─".repeat(Math.max(1, width ?? (row.label.length + 2)));
      continue;
    }
    const marker = row.selected ? ">" : " ";
    const label = row.item.disabled ? `(${row.label})` : row.label;
    rows[index] = `${marker} ${label}`;
  }
  return rows;
}

/** Public helper for visible Context Menu Items. */
export function visibleContextMenuItems(
  items: readonly ContextMenuItem[],
  selectedIndex: number,
  height: number,
): Array<{ item: ContextMenuItem; index: number; label: string; selected: boolean }> {
  const safeHeight = Math.max(0, height);
  if (safeHeight === 0) return [];
  const selected = clampContextMenuSelection(items, selectedIndex);
  const offset = Math.max(0, Math.min(selected - Math.floor(safeHeight / 2), Math.max(0, items.length - safeHeight)));
  const count = Math.max(0, Math.min(items.length, offset + safeHeight) - offset);
  const rows = new Array<{ item: ContextMenuItem; index: number; label: string; selected: boolean }>(count);
  for (let index = 0; index < count; index += 1) {
    const itemIndex = offset + index;
    const item = items[itemIndex]!;
    rows[index] = {
      item,
      index: itemIndex,
      label: item.label,
      selected: itemIndex === selected && !item.disabled && !item.separatorBefore,
    };
  }
  return rows;
}

/** Clamps context Menu Selection to its valid range. */
export function clampContextMenuSelection(items: readonly ContextMenuItem[], selectedIndex: number): number {
  if (items.length === 0) return 0;
  const clamped = Math.max(0, Math.min(selectedIndex, items.length - 1));
  if (isSelectableContextItem(items[clamped])) return clamped;

  const next = shiftContextMenuSelection(items, clamped, 1);
  if (isSelectableContextItem(items[next])) return next;
  const previous = shiftContextMenuSelection(items, clamped, -1);
  return isSelectableContextItem(items[previous]) ? previous : clamped;
}

/** Moves context Menu Selection by a relative offset. */
export function shiftContextMenuSelection(
  items: readonly ContextMenuItem[],
  selectedIndex: number,
  delta: number,
): number {
  if (items.length === 0) return 0;
  let next = Math.max(0, Math.min(selectedIndex, items.length - 1));
  for (let count = 0; count < items.length; count += 1) {
    next = Math.max(0, Math.min(items.length - 1, next + delta));
    if (isSelectableContextItem(items[next])) return next;
    if (next === 0 || next === items.length - 1) break;
  }
  return selectedIndex;
}

function isSelectableContextItem(item: ContextMenuItem | undefined): boolean {
  return !!item && !item.disabled && !item.separatorBefore;
}

/** State controller for context Menu behavior. */
export class ContextMenuController {
  readonly items: Signal<ContextMenuItem[]>;
  readonly selectedIndex: Signal<number>;
  readonly #ownsItems: boolean;
  readonly #ownsSelectedIndex: boolean;

  constructor(options: ContextMenuControllerOptions) {
    this.#ownsItems = !(options.items instanceof Signal);
    this.#ownsSelectedIndex = !(options.selectedIndex instanceof Signal);
    this.items = signalify(options.items, { deepObserve: true });
    this.selectedIndex = signalify(options.selectedIndex ?? 0);
    this.clamp();
  }

  move(delta: number): void {
    this.selectedIndex.value = shiftContextMenuSelection(this.items.peek(), this.selectedIndex.peek(), delta);
    this.clamp();
  }

  first(): void {
    this.selectedIndex.value = clampContextMenuSelection(this.items.peek(), 0);
  }

  last(): void {
    this.selectedIndex.value = clampContextMenuSelection(this.items.peek(), this.items.peek().length - 1);
  }

  clamp(): void {
    this.selectedIndex.value = clampContextMenuSelection(this.items.peek(), this.selectedIndex.peek());
  }

  selected(): ContextMenuItem | undefined {
    const index = clampContextMenuSelection(this.items.peek(), this.selectedIndex.peek());
    const item = this.items.peek()[index];
    return isSelectableContextItem(item) ? item : undefined;
  }

  handleKeyPress(event: KeyPressEvent): ContextMenuItem | undefined {
    if (event.ctrl || event.meta || event.shift) return undefined;
    if (event.key === "up") {
      this.move(-1);
    } else if (event.key === "down") {
      this.move(1);
    } else if (event.key === "home") {
      this.first();
    } else if (event.key === "end") {
      this.last();
    } else if (event.key === "return") {
      return this.selected();
    }
    this.clamp();
    return undefined;
  }

  inspect(): ContextMenuInspection {
    return {
      selectedIndex: this.selectedIndex.peek(),
      itemCount: this.items.peek().length,
      selected: this.selected(),
    };
  }

  dispose(): void {
    if (this.#ownsItems) this.items.dispose();
    if (this.#ownsSelectedIndex) this.selectedIndex.dispose();
  }
}

/** Public class implementing a context Menu. */
export class ContextMenu extends Component {
  declare drawnObjects: { styledRows?: TextObject[] };
  items: Signal<ContextMenuItem[]>;
  selectedIndex: Signal<number>;
  readonly controller: ContextMenuController;
  readonly #rows: Computed<string[]>;
  readonly #itemStyle?: ContextMenuItemStyle;

  /**
   * This row's paint state. An open context menu is normally where the keyboard
   * is, so this is usually `selected` — but it is resolved rather than assumed,
   * so a menu shown beside a focused editor reports what is actually true.
   */
  #paintFor(selected: boolean): SelectionPaintState {
    return resolveSelectionPaint({ selected, collectionFocused: stateHoldsInput(this.state.value) });
  }

  readonly #markerFor?: ContextMenuRowMarker;
  #styledRows: TextObject[] = [];

  constructor(private readonly options: ContextMenuOptions) {
    super(options);
    const ownsController = !options.controller;
    this.controller = options.controller ??
      new ContextMenuController({
        items: options.items,
        selectedIndex: options.selectedIndex,
      });
    this.items = this.controller.items;
    this.selectedIndex = this.controller.selectedIndex;
    this.#itemStyle = options.itemStyle;
    this.#markerFor = options.markerFor;
    this.#rows = new Computed(() =>
      renderContextMenuRows(
        this.items.value,
        this.selectedIndex.value,
        this.rectangle.value.height,
        this.rectangle.value.width,
      )
    );

    this.on("keyPress", (event) => {
      const item = this.controller.handleKeyPress(event);
      if (item) void this.options.onSelect?.(item);
    });
    this.on("destroy", () => this.#rows.dispose());
    if (ownsController) this.on("destroy", () => this.controller.dispose());
  }

  selected(): ContextMenuItem | undefined {
    return this.controller.selected();
  }

  override draw(): void {
    super.draw();
    // Per-item styling (a danger tone, a selection block) needs per-row styled
    // objects; without it the uniform cached text path is kept.
    if (this.#itemStyle || this.#markerFor) this.#drawStyledRows();
    else drawTextRows(this, this.#rows);
  }

  /** One styled TextObject per viewport row, reused across scrolls and redraws. */
  #drawStyledRows(): void {
    const height = Math.max(0, Math.floor(this.rectangle.peek().height));
    const rows = this.drawnObjects.styledRows ??= this.#styledRows;
    const rowAt = (offset: number) => {
      const visible = visibleContextMenuItems(
        this.items.value,
        this.selectedIndex.value,
        Math.max(0, Math.floor(this.rectangle.value.height)),
      );
      return visible[offset];
    };
    while (rows.length < height) {
      const offset = rows.length;
      const object = new TextObject({
        canvas: this.tui.canvas,
        view: this.view,
        zIndex: this.zIndex,
        overwriteRectangle: true,
        rectangle: new Computed<TextRectangle>(() => {
          const rect = this.rectangle.value;
          return { column: rect.column, row: rect.row + offset, width: Math.max(0, rect.width) };
        }),
        value: new Computed(() => {
          const rect = this.rectangle.value;
          const row = rowAt(offset);
          if (!row) return "";
          if (row.item.separatorBefore) {
            return padListRow("─".repeat(Math.max(1, rect.width)), Math.max(0, rect.width));
          }
          const marker = this.#markerFor
            ? this.#markerFor(row.item, row.selected, this.#paintFor(row.selected))
            : row.selected
            ? ">"
            : " ";
          const label = row.item.disabled ? `(${row.label})` : row.label;
          return padListRow(`${marker} ${label}`, Math.max(0, rect.width));
        }),
        style: new Computed(() => {
          const row = rowAt(offset);
          if (!row) return this.style.value;
          return this.#itemStyle?.(row.item, row.selected, this.#paintFor(row.selected)) ?? this.style.value;
        }),
      });
      object.draw();
      rows.push(object);
    }
  }
}
