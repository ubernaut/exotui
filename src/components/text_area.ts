// Copyright 2023 Im-Beast. MIT license.

// 036 V1: TextBox grown into a full TEXT-AREA surface by composition.
// TextAreaController wraps a TextBoxController with a viewport and adds
// exactly what the audit found missing: three wrap MODES (soft wraps at
// word boundaries via the existing grapheme-safe wrapper, character
// wrap breaks at the viewport width regardless of words, none keeps
// logical lines and scrolls horizontally), selection-edge AUTO-SCROLL
// (extending the selection past a viewport edge scrolls the minimal
// distance to keep the focus visible), configurable editing ALIASES
// (hosts bind their own verb names onto the canonical editing actions,
// unknown verbs are refused), and OPTIONAL syntax highlighting (fresh
// HighlightSpans segment visual rows; stale versions are dropped, and a
// text edit invalidates them all).

import type { HighlightSpan } from "../app/syntax_service.ts";
import {
  TextBoxController,
  type TextBoxControllerOptions,
  type TextBoxVisualLine,
  wrapTextBoxLines,
} from "./textbox.ts";

/** The wrap modes. */
export type TextAreaWrapMode = "soft" | "character" | "none";

/** The canonical editing actions aliases can target. */
export type TextAreaAction =
  | "backspace"
  | "delete"
  | "newline"
  | "select-all"
  | "clear-selection"
  | "home"
  | "end"
  | "clear";

/** One visible text-area row. */
export interface TextAreaRow {
  readonly lineIndex: number;
  readonly continuation: boolean;
  readonly text: string;
  readonly segments: readonly { readonly text: string; readonly scope?: string }[];
}

/** The text-area controller. */
export class TextAreaController {
  readonly textBox: TextBoxController;
  readonly #viewportWidth: number;
  readonly #viewportHeight: number;
  #wrapMode: TextAreaWrapMode;
  #topRow = 0;
  #leftColumn = 0;
  #aliases = new Map<string, TextAreaAction>();
  #highlightVersion = 0;
  #spans = new Map<number, HighlightSpan[]>();

  constructor(
    options: TextBoxControllerOptions & {
      readonly viewportWidth: number;
      readonly viewportHeight: number;
      readonly wrapMode?: TextAreaWrapMode;
      readonly aliases?: Readonly<Record<string, TextAreaAction>>;
    },
  ) {
    this.#viewportWidth = Math.max(1, options.viewportWidth);
    this.#viewportHeight = Math.max(1, options.viewportHeight);
    this.#wrapMode = options.wrapMode ?? "soft";
    this.textBox = new TextBoxController(options);
    for (const [alias, action] of Object.entries(options.aliases ?? {})) this.bindAlias(alias, action);
  }

  wrapMode(): TextAreaWrapMode {
    return this.#wrapMode;
  }

  setWrapMode(mode: TextAreaWrapMode): void {
    this.#wrapMode = mode;
    if (mode !== "none") this.#leftColumn = 0;
  }

  /** Binds one host verb onto a canonical action. */
  bindAlias(alias: string, action: TextAreaAction): void {
    this.#aliases.set(alias, action);
  }

  /** Runs a host verb; unknown verbs are refused, not guessed. */
  invoke(alias: string): boolean {
    const action = this.#aliases.get(alias);
    if (action === undefined) return false;
    switch (action) {
      case "backspace":
        this.textBox.backspace();
        break;
      case "delete":
        this.textBox.delete();
        break;
      case "newline":
        this.textBox.newline();
        break;
      case "select-all":
        this.textBox.selectAll();
        break;
      case "clear-selection":
        this.textBox.clearSelection();
        break;
      case "home":
        this.textBox.home();
        break;
      case "end":
        this.textBox.end();
        break;
      case "clear":
        this.textBox.clear();
        break;
    }
    return true;
  }

  /** Applies streamed highlights; stale versions are refused. */
  applyHighlights(version: number, spans: readonly HighlightSpan[]): boolean {
    if (version !== this.#highlightVersion) return false;
    for (const span of spans) {
      const bucket = this.#spans.get(span.line) ?? [];
      bucket.push(span);
      this.#spans.set(span.line, bucket);
    }
    return true;
  }

  /** Bumps the highlight version after an edit; old spans drop. */
  invalidateHighlights(): number {
    this.#highlightVersion += 1;
    this.#spans.clear();
    return this.#highlightVersion;
  }

  highlightVersion(): number {
    return this.#highlightVersion;
  }

  offset(): { readonly topRow: number; readonly leftColumn: number } {
    return { topRow: this.#topRow, leftColumn: this.#leftColumn };
  }

  scrollTo(topRow: number, leftColumn = this.#leftColumn): void {
    const rows = this.#visualLines();
    this.#topRow = Math.max(0, Math.min(topRow, Math.max(0, rows.length - 1)));
    this.#leftColumn = this.#wrapMode === "none" ? Math.max(0, leftColumn) : 0;
  }

  /**
   * Extends the selection to a document position and auto-scrolls the
   * minimal distance so the selection edge stays visible.
   */
  extendSelectionTo(position: { readonly x: number; readonly y: number }): void {
    const selection = this.textBox.selection.peek();
    const anchor = selection?.anchor ?? this.textBox.cursorPosition.peek();
    this.textBox.setSelection({ ...anchor }, { x: position.x, y: position.y });
    this.#followEdge(position);
  }

  /** The visible window with highlight segments. */
  visibleRows(): readonly TextAreaRow[] {
    const rows = this.#visualLines();
    const bottom = Math.min(rows.length, this.#topRow + this.#viewportHeight);
    const visible: TextAreaRow[] = [];
    for (let index = this.#topRow; index < bottom; index += 1) {
      const row = rows[index]!;
      const windowed = this.#wrapMode === "none"
        ? (this.textBox.text.peek().split("\n")[row.lineIndex] ?? "").slice(
          this.#leftColumn,
          this.#leftColumn + this.#viewportWidth,
        )
        : row.text;
      visible.push({
        lineIndex: row.lineIndex,
        continuation: row.continuation,
        text: windowed,
        segments: this.#segment(row, windowed),
      });
    }
    return visible;
  }

  dispose(): void {
    this.textBox.dispose();
  }

  #visualLines(): readonly TextBoxVisualLine[] {
    const lines = this.textBox.text.peek().split("\n");
    if (this.#wrapMode === "soft") return wrapTextBoxLines(lines, this.#viewportWidth, { wordWrap: true });
    if (this.#wrapMode === "character") {
      const visual: TextBoxVisualLine[] = [];
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex]!;
        if (line.length === 0) {
          visual.push({ lineIndex, startColumn: 0, endColumn: 0, text: "", continuation: false });
          continue;
        }
        for (let start = 0; start < line.length; start += this.#viewportWidth) {
          const end = Math.min(line.length, start + this.#viewportWidth);
          visual.push({
            lineIndex,
            startColumn: start,
            endColumn: end,
            text: line.slice(start, end),
            continuation: start > 0,
          });
        }
      }
      return visual;
    }
    return lines.map((line, lineIndex) => ({
      lineIndex,
      startColumn: 0,
      endColumn: line.length,
      text: line,
      continuation: false,
    }));
  }

  #followEdge(position: { readonly x: number; readonly y: number }): void {
    const rows = this.#visualLines();
    let targetRow = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      if (
        row.lineIndex === position.y &&
        position.x >= row.startColumn &&
        (position.x < row.endColumn || index === rows.length - 1 ||
          rows[index + 1]!.lineIndex !== position.y)
      ) {
        targetRow = index;
        break;
      }
    }
    if (targetRow < this.#topRow) this.#topRow = targetRow;
    else if (targetRow >= this.#topRow + this.#viewportHeight) {
      this.#topRow = targetRow - this.#viewportHeight + 1;
    }
    if (this.#wrapMode === "none") {
      if (position.x < this.#leftColumn) this.#leftColumn = position.x;
      else if (position.x >= this.#leftColumn + this.#viewportWidth) {
        this.#leftColumn = position.x - this.#viewportWidth + 1;
      }
    }
  }

  #segment(row: TextBoxVisualLine, windowed: string): readonly { readonly text: string; readonly scope?: string }[] {
    const spans = this.#spans.get(row.lineIndex) ?? [];
    if (spans.length === 0 || windowed === "") {
      return windowed === "" ? [] : [{ text: windowed }];
    }
    const base = this.#wrapMode === "none" ? this.#leftColumn : row.startColumn;
    const scopeAt: (string | undefined)[] = Array.from({ length: windowed.length }, () => undefined);
    for (const span of spans) {
      const from = Math.max(0, span.start - base);
      const to = Math.min(windowed.length, span.end - base);
      for (let column = from; column < to; column += 1) scopeAt[column] = span.scope;
    }
    const segments: { text: string; scope?: string }[] = [];
    let start = 0;
    for (let column = 1; column <= windowed.length; column += 1) {
      if (column === windowed.length || scopeAt[column] !== scopeAt[start]) {
        const scope = scopeAt[start];
        segments.push({ text: windowed.slice(start, column), ...(scope !== undefined ? { scope } : {}) });
        start = column;
      }
    }
    return segments;
  }
}
