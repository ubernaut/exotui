// Copyright 2023 Im-Beast. MIT license.
import type { TextRectangle } from "../canvas/text.ts";
import { Component, type ComponentOptions } from "../component.ts";
import { Computed, Signal } from "../signals/mod.ts";
import { cropToWidth, textWidth } from "../utils/strings.ts";
import type { Rectangle } from "../types.ts";
import { Box } from "./box.ts";
import { Frame } from "./frame.ts";
import { drawTextChild } from "./text_children.ts";

/** Public type alias for a modal Tone. */
export type ModalTone = "info" | "confirm" | "success" | "warning" | "error";

/** Public interface describing a modal Action. */
export interface ModalAction {
  id: string;
  label: string;
  disabled?: boolean;
  default?: boolean;
  destructive?: boolean;
}

/** Public interface describing a modal Content. */
export interface ModalContent {
  title: string;
  body?: string | string[];
  tone?: ModalTone;
  actions?: ModalAction[];
}

/** Options for configuring modal Controller. */
export interface ModalControllerOptions extends ModalContent {
  open?: boolean;
  selectedActionIndex?: number;
  closeOnEscape?: boolean;
  onAction?: (action: ModalAction, inspection: ModalInspection) => void | Promise<void>;
  onOpenChange?: (open: boolean, inspection: ModalInspection) => void | Promise<void>;
}

/** Serializable inspection snapshot for modal. */
export interface ModalInspection {
  open: boolean;
  title: string;
  body: string[];
  tone: ModalTone;
  actions: ModalAction[];
  selectedActionIndex: number;
  selectedAction?: ModalAction;
}

/** Options for configuring render Modal Rows. */
export interface RenderModalRowsOptions {
  width: number;
  height?: number;
  showTone?: boolean;
}

/** Options for configuring modal. */
export interface ModalOptions extends ComponentOptions {
  title?: string;
  body?: string;
}

/** State controller for modal behavior. */
export class ModalController {
  readonly openState: Signal<boolean>;
  readonly title: Signal<string>;
  readonly body: Signal<string[]>;
  readonly tone: Signal<ModalTone>;
  readonly actions: Signal<ModalAction[]>;
  readonly selectedActionIndex: Signal<number>;
  readonly closeOnEscape: Signal<boolean>;
  readonly #onAction?: (action: ModalAction, inspection: ModalInspection) => void | Promise<void>;
  readonly #onOpenChange?: (open: boolean, inspection: ModalInspection) => void | Promise<void>;

  constructor(options: ModalControllerOptions = { title: "" }) {
    this.openState = new Signal(options.open ?? false);
    this.title = new Signal(options.title ?? "");
    this.body = new Signal(normalizeModalBody(options.body), { deepObserve: true });
    this.tone = new Signal(options.tone ?? "info");
    this.actions = new Signal(normalizeModalActions(options.actions), { deepObserve: true });
    this.selectedActionIndex = new Signal(
      clampModalActionIndex(
        this.actions.peek(),
        options.selectedActionIndex ?? defaultModalActionIndex(this.actions.peek()),
      ),
    );
    this.closeOnEscape = new Signal(options.closeOnEscape ?? true);
    this.#onAction = options.onAction;
    this.#onOpenChange = options.onOpenChange;
  }

  open(content?: Partial<ModalContent>): ModalInspection {
    if (content) this.update(content);
    this.openState.value = true;
    const inspection = this.inspect();
    void this.#onOpenChange?.(true, inspection);
    return inspection;
  }

  close(): ModalInspection {
    this.openState.value = false;
    const inspection = this.inspect();
    void this.#onOpenChange?.(false, inspection);
    return inspection;
  }

  toggle(content?: Partial<ModalContent>): ModalInspection {
    return this.openState.peek() ? this.close() : this.open(content);
  }

  update(content: Partial<ModalContent>): ModalInspection {
    if (content.title !== undefined) this.title.value = content.title;
    if (content.body !== undefined) this.body.value = normalizeModalBody(content.body);
    if (content.tone !== undefined) this.tone.value = content.tone;
    if (content.actions !== undefined) {
      this.actions.value = normalizeModalActions(content.actions);
      this.selectedActionIndex.value = defaultModalActionIndex(this.actions.peek());
    } else {
      this.selectedActionIndex.value = clampModalActionIndex(this.actions.peek(), this.selectedActionIndex.peek());
    }
    return this.inspect();
  }

  setSelectedActionIndex(index: number): ModalAction | undefined {
    this.selectedActionIndex.value = clampModalActionIndex(this.actions.peek(), index);
    return this.selectedAction();
  }

  moveAction(delta: number): ModalAction | undefined {
    const actions = this.actions.peek();
    if (actions.length === 0) return undefined;
    let next = this.selectedActionIndex.peek();
    for (let count = 0; count < actions.length; count += 1) {
      next = (next + delta + actions.length) % actions.length;
      if (!actions[next]?.disabled) return this.setSelectedActionIndex(next);
    }
    return this.selectedAction();
  }

  selectedAction(): ModalAction | undefined {
    return this.actions.peek()[clampModalActionIndex(this.actions.peek(), this.selectedActionIndex.peek())];
  }

  activateAction(index: number = this.selectedActionIndex.peek()): ModalAction | undefined {
    const action = this.actions.peek()[clampModalActionIndex(this.actions.peek(), index)];
    if (!action || action.disabled) return undefined;
    this.selectedActionIndex.value = clampModalActionIndex(this.actions.peek(), index);
    const inspection = this.inspect();
    void this.#onAction?.({ ...action }, inspection);
    return action;
  }

  handleKeyPress(
    { key, ctrl, meta, shift }: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean },
  ): ModalAction | ModalInspection | undefined {
    if (!this.openState.peek() || ctrl || meta) return undefined;
    if (key === "escape" && this.closeOnEscape.peek()) return this.close();
    // Up/down mirror left/right so a narrow modal whose buttons stacked
    // vertically (see `modalActionRects`) still arrows naturally.
    if (key === "left" || key === "up" || (key === "tab" && shift)) return this.moveAction(-1);
    if (key === "right" || key === "down" || key === "tab") return this.moveAction(1);
    if (key === "return" || key === "space") return this.activateAction();
    return undefined;
  }

  inspect(): ModalInspection {
    const actions = cloneModalActions(this.actions.peek());
    const selectedActionIndex = clampModalActionIndex(actions, this.selectedActionIndex.peek());
    return {
      open: this.openState.peek(),
      title: this.title.peek(),
      body: Array.from(this.body.peek()),
      tone: this.tone.peek(),
      actions,
      selectedActionIndex,
      selectedAction: actions[selectedActionIndex] ? { ...actions[selectedActionIndex]! } : undefined,
    };
  }

  dispose(): void {
    this.openState.dispose();
    this.title.dispose();
    this.body.dispose();
    this.tone.dispose();
    this.actions.dispose();
    this.selectedActionIndex.dispose();
    this.closeOnEscape.dispose();
  }
}

/** Geometry for one modal's action buttons. */
export interface ModalActionRectsResult {
  rects: Rectangle[];
  /** True when the box was too narrow for one row and the buttons stacked. */
  stacked: boolean;
}

/**
 * Lays a modal's action buttons inside its box: one bottom row with the slack
 * spread between them when they fit, and a vertical stack up from the bottom
 * border when the box is too narrow — so a destructive choice next to a safe
 * one never collapses into an adjacent mis-hit target. `widths` are the
 * rendered button widths in visual order; rects come back in the same order.
 */
export function modalActionRects(
  rect: Rectangle,
  widths: readonly number[],
  gap = 2,
): ModalActionRectsResult {
  const inner = Math.max(1, rect.width - 4);
  const spread = widths.reduce((sum, width) => sum + Math.min(width, inner), 0) + gap * (widths.length - 1);
  if (widths.length <= 1 || spread <= inner) {
    const buttonRow = rect.row + Math.max(1, rect.height - 2);
    const slack = widths.length > 1 ? Math.max(0, Math.floor((inner - spread) / (widths.length - 1))) : 0;
    let column = rect.column + 2;
    const rects = widths.map((width) => {
      const fitted = Math.min(width, inner);
      const button = { column, row: buttonRow, width: fitted, height: 1 };
      column += fitted + gap + slack;
      return button;
    });
    return { rects, stacked: false };
  }
  // Stack up from just above the bottom border, first button at the top.
  const firstRow = rect.row + Math.max(1, rect.height - 1 - widths.length);
  return {
    rects: widths.map((width, index) => ({
      column: rect.column + 2,
      row: firstRow + index,
      width: Math.min(width, inner),
      height: 1,
    })),
    stacked: true,
  };
}

/** Renders modal Rows into deterministic text rows. */
export function renderModalRows(inspection: ModalInspection, options: RenderModalRowsOptions): string[] {
  const width = Math.max(0, Math.floor(options.width));
  if (width <= 0) return [];
  const innerWidth = Math.max(0, width - 4);
  const tone = options.showTone === false ? "" : `[${inspection.tone.toUpperCase()}] `;
  const rows = [cropToWidth(`${tone}${inspection.title}`, innerWidth), ""];
  for (const line of inspection.body) {
    appendModalWrappedLines(rows, line, innerWidth);
  }
  const actions = renderModalActions(inspection.actions, inspection.selectedActionIndex, innerWidth);
  if (actions) rows.push("", actions);
  const height = options.height === undefined ? rows.length : Math.max(0, Math.floor(options.height));
  if (options.height === undefined || height <= 0 || rows.length <= height) return rows;
  const clipped = new Array<string>(height);
  for (let index = 0; index < height; index += 1) {
    clipped[index] = rows[index] ?? "";
  }
  if (!actions || height === 1) return clipped;
  clipped[height - 1] = actions;
  return clipped;
}

/** Public helper for modal Content Height. */
export function modalContentHeight(inspection: ModalInspection, width: number): number {
  return renderModalRows(inspection, { width }).length + 2;
}

function normalizeModalBody(body: string | string[] | undefined): string[] {
  if (Array.isArray(body)) {
    const lines: string[] = [];
    for (const line of body) appendSplitModalLines(lines, line);
    return lines;
  }
  return body === undefined ? [] : `${body}`.split("\n");
}

function normalizeModalActions(actions: readonly ModalAction[] | undefined): ModalAction[] {
  return cloneModalActions(actions ?? [{ id: "ok", label: "OK", default: true }]);
}

function defaultModalActionIndex(actions: readonly ModalAction[]): number {
  const preferred = actions.findIndex((action) => action.default && !action.disabled);
  if (preferred >= 0) return preferred;
  return actions.findIndex((action) => !action.disabled);
}

function clampModalActionIndex(actions: readonly ModalAction[], index: number): number {
  if (actions.length === 0) return -1;
  const clamped = Math.max(0, Math.min(Math.floor(index), actions.length - 1));
  if (!actions[clamped]?.disabled) return clamped;
  const fallback = defaultModalActionIndex(actions);
  return fallback >= 0 ? fallback : clamped;
}

function renderModalActions(actions: readonly ModalAction[], selectedIndex: number, width: number): string {
  if (width <= 0 || actions.length === 0) return "";
  let row = "";
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!;
    const label = action.disabled ? `(${action.label})` : action.label;
    const token = index === selectedIndex ? `[ ${label} ]` : `  ${label}  `;
    if (row) row += " ";
    row += action.destructive ? `!${token}!` : token;
    if (textWidth(row) >= width) return cropToWidth(row, width);
  }
  return row;
}

function appendModalWrappedLines(rows: string[], value: string, width: number): void {
  if (width <= 0) {
    rows.push("");
    return;
  }
  const words = value.split(/\s+/);
  let line = "";
  let appended = false;
  for (const word of words) {
    if (!word) continue;
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next) <= width) {
      line = next;
    } else {
      if (line) {
        rows.push(cropToWidth(line, width));
        appended = true;
      }
      line = cropToWidth(word, width);
    }
  }
  if (line) {
    rows.push(cropToWidth(line, width));
    appended = true;
  }
  if (!appended) rows.push("");
}

function appendSplitModalLines(lines: string[], value: unknown): void {
  const text = `${value}`;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") continue;
    lines.push(text.slice(start, index));
    start = index + 1;
  }
  lines.push(text.slice(start));
}

function cloneModalActions(actions: readonly ModalAction[]): ModalAction[] {
  const clone = new Array<ModalAction>(actions.length);
  for (let index = 0; index < actions.length; index += 1) {
    clone[index] = { ...actions[index]! };
  }
  return clone;
}

/** Public class implementing a modal. */
export class Modal extends Component {
  constructor(private readonly options: ModalOptions) {
    super(options);
  }

  override draw(): void {
    super.draw();

    const box = new Box({
      parent: this,
      theme: this.theme,
      rectangle: this.rectangle,
      zIndex: this.zIndex,
      visible: this.visible,
    });
    const frame = new Frame({
      parent: this,
      theme: this.theme,
      rectangle: this.rectangle,
      zIndex: this.zIndex,
      charMap: "rounded",
      visible: this.visible,
    });
    drawTextChild(this, this.options.title ?? "", {
      key: "title",
      overwriteWidth: false,
      zIndex: new Computed(() => this.zIndex.value + 1),
      rectangle: new Computed<TextRectangle>(() => ({
        column: this.rectangle.value.column + 1,
        row: this.rectangle.value.row - 1,
      })),
    });
    drawTextChild(this, this.options.body ?? "", {
      key: "body",
      zIndex: new Computed(() => this.zIndex.value + 1),
      rectangle: new Computed<TextRectangle>(() => ({
        column: this.rectangle.value.column + 1,
        row: this.rectangle.value.row + 1,
        width: Math.max(0, this.rectangle.value.width - 2),
      })),
    });
    box.subComponentOf = frame.subComponentOf = this;
    this.subComponents.box = box;
    this.subComponents.frame = frame;
  }
}
