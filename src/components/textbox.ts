// Copyright 2023 Im-Beast. MIT license.
import { Box } from "./box.ts";
import type { ComponentOptions } from "../component.ts";

import type { BoxObject } from "../canvas/box.ts";
import { TextObject, type TextRectangle } from "../canvas/text.ts";
import type { Theme } from "../theme.ts";
import type { DeepPartial } from "../types.ts";
import { cropToWidth, textWidth } from "../utils/strings.ts";
import { clamp } from "../utils/numbers.ts";
import { batchSignalUpdates, Computed, Effect, Signal } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";
import type { KeyPressEvent } from "../input_reader/types.ts";
import {
  graphemeBoundaries,
  nextGraphemeBoundary,
  previousGraphemeBoundary,
  resolveGraphemeBoundary,
} from "../unicode/grapheme.ts";

function canonicalTextBoxOffset(text: string, position: number): number {
  const clamped = clamp(position, 0, text.length);
  const integer = Number.isFinite(clamped) ? Math.trunc(clamped) : 0;
  return resolveGraphemeBoundary(text, integer, "nearest");
}

function graphemeBoundaryIndexAtOrBefore(boundaries: readonly number[], offset: number): number {
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (boundaries[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

const DEFAULT_TEXT_BOX_REPLACE_ALL_MAX_REPLACEMENTS = 100_000;
const DEFAULT_TEXT_BOX_REPLACE_ALL_MAX_TEXT_LENGTH = 16_000_000;
const MAX_TEXT_BOX_REPLACE_ALL_REPLACEMENTS = 1_000_000;
const MAX_TEXT_BOX_TEXT_LENGTH = 64_000_000;

function cursorPositionsEqual(left: CursorPosition, right: CursorPosition): boolean {
  return left.x === right.x && left.y === right.y;
}

function compareCursorPositions(left: CursorPosition, right: CursorPosition): number {
  return left.y - right.y || left.x - right.x;
}

function frozenCursorPosition(position: CursorPosition): Readonly<CursorPosition> {
  return Object.freeze({ x: position.x, y: position.y });
}

function frozenTextBoxSelection(selection: TextBoxSelection): TextBoxSelection {
  return Object.freeze({
    anchor: frozenCursorPosition(selection.anchor),
    focus: frozenCursorPosition(selection.focus),
  });
}

function selectionsEqual(
  left: TextBoxSelection | undefined,
  right: TextBoxSelection | undefined,
): boolean {
  if (!left || !right) return left === right;
  return cursorPositionsEqual(left.anchor, right.anchor) && cursorPositionsEqual(left.focus, right.focus);
}

function frozenTextBoxRange(range: TextBoxRange): TextBoxRange {
  return Object.freeze({
    start: frozenCursorPosition(range.start),
    end: frozenCursorPosition(range.end),
  });
}

/** Public interface describing a cursor Position. */
export interface CursorPosition {
  x: number;
  y: number;
}

/** Directional anchor/focus selection retained by a text box controller. */
export interface TextBoxSelection {
  readonly anchor: CursorPosition;
  readonly focus: CursorPosition;
}

/** Ordered, end-exclusive text range derived from a directional selection. */
export interface TextBoxRange {
  readonly start: CursorPosition;
  readonly end: CursorPosition;
}

/** Direction used by literal text-box find operations. */
export type TextBoxFindDirection = "forward" | "backward";

/** Options for one bounded literal text-box find operation. */
export interface TextBoxFindOptions {
  readonly direction?: TextBoxFindDirection;
  readonly from?: CursorPosition;
  readonly wrap?: boolean;
}

/** Clone-safe result of one literal find operation. `index` is zero-based. */
export interface TextBoxFindResult {
  readonly query: string;
  readonly range: TextBoxRange;
  readonly index: number;
  readonly total: number;
  readonly wrapped: boolean;
}

/** Resource limits for an atomic replace-all operation. Limit hits never partially mutate text. */
export interface TextBoxReplaceAllOptions {
  /** Maximum number of replacements built by one operation. Defaults to 100,000. */
  readonly maxReplacements?: number;
  /** Maximum UTF-16 length of the resulting text. Defaults to 16,000,000. */
  readonly maxTextLength?: number;
}

/** Clone-safe result of an atomic replace-all mutation. */
export interface TextBoxReplaceAllResult {
  /** Boundary-aligned matches observed before applying resource limits. */
  readonly matchCount: number;
  readonly replacements: number;
  readonly changed: boolean;
  /** True when the operation was rejected without mutation by a resource limit. */
  readonly limited: boolean;
  readonly text: string;
  readonly cursorPosition: CursorPosition;
}

/** Detached cursor transition supplied with a completed text-box mutation. */
export interface TextBoxChangeContext {
  readonly previousCursorPosition: CursorPosition;
  readonly cursorPosition: CursorPosition;
}

/** Public interface describing a text Box Theme. */
export interface TextBoxTheme extends Theme {
  value: Theme;
  cursor: Theme;
  /** Style for the visible selected text range. */
  selection?: Theme;
  /** Style for numbers counting textbox rows */
  lineNumbers: Theme;
  /** Style for currently selected text row */
  highlightedLine: Theme;
}

/** Options for configuring text Box. */
export interface TextBoxOptions extends ComponentOptions, TextBoxControllerOptions {
  theme: DeepPartial<Omit<TextBoxTheme, "selection">, "cursor"> & { selection?: DeepPartial<Theme> };
  controller?: TextBoxController;
  /** Function that defines what key does what while textbox is focused/active */
  keyboardHandler?: (keyPress: KeyPressEvent) => void;
}

/** Options for configuring text Box Controller. */
export interface TextBoxControllerOptions {
  text?: string | Signal<string>;
  /** Optional maximum UTF-16 length accepted by interactive and programmatic mutations. */
  maxLength?: number;
  cursorPosition?: CursorPosition | Signal<CursorPosition>;
  selection?: TextBoxSelection | Signal<TextBoxSelection | undefined>;
  validator?: RegExp | Signal<RegExp | undefined>;
  multiCodePointSupport?: boolean | Signal<boolean>;
  /** Whether to highlight currently selected text row */
  lineHighlighting?: boolean | Signal<boolean>;
  /** Whether to number textbox rows */
  lineNumbering?: boolean | Signal<boolean>;
  /** Whether long logical lines wrap into multiple visual rows */
  wordWrap?: boolean | Signal<boolean>;
  onChange?: (value: string, context: TextBoxChangeContext) => void | Promise<void>;
}

/** Serializable inspection snapshot for text Box. */
export interface TextBoxInspection {
  text: string;
  lines: readonly string[];
  lineCount: number;
  cursorPosition: CursorPosition;
  currentLine: string;
  empty: boolean;
  valid: boolean;
  lineHighlighting: boolean;
  lineNumbering: boolean;
  wordWrap: boolean;
  maxLength?: number;
  /** Present only while a non-empty directional selection is active. */
  selection?: TextBoxSelection;
  /** Present only while a non-empty directional selection is active. */
  selectionRange?: TextBoxRange;
  /** Present only while a non-empty directional selection is active. */
  selectedText?: string;
}

/** Public type alias for a text Box Edit Result. */
export type TextBoxEditResult = "changed" | "moved" | "ignored";

/** Serializable inspection snapshot for text Line Cache. */
export interface TextLineCacheInspection {
  text: string;
  lineCount: number;
}

/** Public interface describing a text Box Visual Line. */
export interface TextBoxVisualLine {
  lineIndex: number;
  startColumn: number;
  endColumn: number;
  text: string;
  continuation: boolean;
}

/** Public interface describing a text Box Visual Cursor. */
export interface TextBoxVisualCursor {
  row: number;
  column: number;
  line: TextBoxVisualLine;
}

/** Public class implementing a text Line Cache. */
export class TextLineCache {
  #text = "";
  #lines: readonly string[] = [""];

  lines(text: string): readonly string[] {
    if (text !== this.#text) {
      this.#text = text;
      this.#lines = text.split("\n");
    }
    return this.#lines;
  }

  inspect(): TextLineCacheInspection {
    return {
      text: this.#text,
      lineCount: this.#lines.length,
    };
  }
}

/** State controller for text Box behavior. */
export class TextBoxController {
  readonly text: Signal<string>;
  readonly maxLength?: number;
  readonly cursorPosition: Signal<CursorPosition>;
  readonly selection: Signal<TextBoxSelection | undefined>;
  readonly validator: Signal<RegExp | undefined>;
  readonly multiCodePointSupport: Signal<boolean>;
  readonly lineHighlighting: Signal<boolean>;
  readonly lineNumbering: Signal<boolean>;
  readonly wordWrap: Signal<boolean>;
  readonly lines: Computed<readonly string[]>;
  readonly #textLineCache = new TextLineCache();
  readonly #ownsText: boolean;
  readonly #ownsCursorPosition: boolean;
  readonly #ownsSelection: boolean;
  readonly #ownsValidator: boolean;
  readonly #ownsMultiCodePointSupport: boolean;
  readonly #ownsLineHighlighting: boolean;
  readonly #ownsLineNumbering: boolean;
  readonly #ownsWordWrap: boolean;
  readonly #onChange?: (value: string, context: TextBoxChangeContext) => void | Promise<void>;
  #syncingState = false;
  readonly #syncCursor = () => {
    if (this.#syncingState) return;
    const current = this.cursorPosition.peek();
    const canonical = this.canonicalCursor(current);
    const selection = this.selection.peek();
    const keepSelection = selection && cursorPositionsEqual(canonical, selection.focus)
      ? this.canonicalSelection(selection)
      : undefined;
    if (cursorPositionsEqual(canonical, current) && selectionsEqual(keepSelection, selection)) return;
    this.writeState(canonical, keepSelection);
  };
  readonly #syncSelection = () => {
    if (this.#syncingState) return;
    const selection = this.canonicalSelection(this.selection.peek());
    const cursor = selection?.focus ?? this.canonicalCursor(this.cursorPosition.peek());
    if (cursorPositionsEqual(cursor, this.cursorPosition.peek()) && selectionsEqual(selection, this.selection.peek())) {
      return;
    }
    this.writeState(cursor, selection);
  };
  readonly #syncText = () => {
    if (this.#syncingState) return;
    const selection = this.canonicalSelection(this.selection.peek());
    const cursor = selection?.focus ?? this.canonicalCursor(this.cursorPosition.peek());
    this.writeState(cursor, selection);
  };

  constructor(options: TextBoxControllerOptions = {}) {
    this.maxLength = normalizeTextBoxMaxLength(options.maxLength);
    this.#ownsText = !(options.text instanceof Signal);
    this.#ownsCursorPosition = !(options.cursorPosition instanceof Signal);
    this.#ownsSelection = !(options.selection instanceof Signal);
    this.#ownsValidator = !(options.validator instanceof Signal);
    this.#ownsMultiCodePointSupport = !(options.multiCodePointSupport instanceof Signal);
    this.#ownsLineHighlighting = !(options.lineHighlighting instanceof Signal);
    this.#ownsLineNumbering = !(options.lineNumbering instanceof Signal);
    this.#ownsWordWrap = !(options.wordWrap instanceof Signal);
    this.text = signalify(options.text ?? "");
    this.cursorPosition = signalify(options.cursorPosition ?? { x: 0, y: 0 }, { deepObserve: true });
    this.selection = signalify(options.selection);
    this.validator = signalify(options.validator);
    this.multiCodePointSupport = signalify(options.multiCodePointSupport ?? false);
    this.lineHighlighting = signalify(options.lineHighlighting ?? false);
    this.lineNumbering = signalify(options.lineNumbering ?? false);
    this.wordWrap = signalify(options.wordWrap ?? false);
    if (!this.acceptsLength(this.text.peek().length)) throw new RangeError("TextBox value exceeds maxLength.");
    this.#onChange = options.onChange;
    this.lines = new Computed(() => this.#textLineCache.lines(this.text.value));
    this.text.subscribe(this.#syncText);
    this.cursorPosition.subscribe(this.#syncCursor);
    this.selection.subscribe(this.#syncSelection);
    this.#syncText();
  }

  setText(value: string, cursorPosition: CursorPosition = this.endPosition(value)): string {
    if (!this.acceptsLength(value.length)) throw new RangeError("TextBox value exceeds maxLength.");
    const previousCursor = frozenCursorPosition(this.cursorPosition.peek());
    const cursor = this.canonicalCursor(cursorPosition, value);
    this.writeValue(value, cursor);
    this.notifyChange(this.text.peek(), previousCursor);
    return this.text.peek();
  }

  clear(): string {
    return this.setText("", { x: 0, y: 0 });
  }

  setCursorPosition(position: CursorPosition): CursorPosition {
    const cursor = this.canonicalCursor(position);
    this.writeState(cursor, undefined);
    return { ...cursor };
  }

  /** Sets a directional selection and moves the cursor to its focus. */
  setSelection(
    anchor: CursorPosition,
    focus: CursorPosition = this.cursorPosition.peek(),
  ): TextBoxSelection | undefined {
    const selection = this.canonicalSelection({ anchor, focus });
    const cursor = selection?.focus ?? this.canonicalCursor(focus);
    this.writeState(cursor, selection);
    return selection ? frozenTextBoxSelection(selection) : undefined;
  }

  /** Selects the complete document, or clears selection for an empty document. */
  selectAll(): TextBoxSelection | undefined {
    return this.setSelection({ x: 0, y: 0 }, this.endPosition(this.text.peek()));
  }

  /** Clears the active selection without moving its focus cursor. */
  clearSelection(): void {
    this.writeState(this.canonicalCursor(this.cursorPosition.peek()), undefined);
  }

  /** Collapses a selection to a chosen directional or ordered edge. */
  collapseSelection(edge: "anchor" | "focus" | "start" | "end" = "focus"): CursorPosition {
    const selection = this.selection.peek();
    if (!selection) return { ...this.cursorPosition.peek() };
    const range = this.selectionRange()!;
    const cursor = edge === "anchor"
      ? selection.anchor
      : edge === "focus"
      ? selection.focus
      : edge === "start"
      ? range.start
      : range.end;
    return this.setCursorPosition(cursor);
  }

  /** Returns an ordered clone-safe range for the active selection. */
  selectionRange(): TextBoxRange | undefined {
    const selection = this.canonicalSelection(this.selection.peek());
    if (!selection) return undefined;
    const ordered = compareCursorPositions(selection.anchor, selection.focus) <= 0
      ? { start: selection.anchor, end: selection.focus }
      : { start: selection.focus, end: selection.anchor };
    return frozenTextBoxRange(ordered);
  }

  /** Returns selected text without exposing a live selection reference. */
  selectedText(): string {
    const range = this.selectionRange();
    if (!range) return "";
    const text = this.text.peek();
    return text.slice(this.positionOffset(range.start), this.positionOffset(range.end));
  }

  moveCursor(delta: Partial<CursorPosition>, extendSelection = false): CursorPosition {
    const cursor = this.cursorPosition.peek();
    if (!extendSelection && this.selection.peek() && (delta.x ?? 0) !== 0 && (delta.y ?? 0) === 0) {
      return this.collapseSelection((delta.x ?? 0) < 0 ? "start" : "end");
    }
    const y = cursor.y + (delta.y ?? 0);
    let next: CursorPosition;
    if ((delta.y ?? 0) === 0 && delta.x === -1) {
      const line = this.currentLines()[cursor.y] ?? "";
      next = this.canonicalCursor({ x: previousGraphemeBoundary(line, cursor.x), y });
    } else if ((delta.y ?? 0) === 0 && delta.x === 1) {
      const line = this.currentLines()[cursor.y] ?? "";
      next = this.canonicalCursor({ x: nextGraphemeBoundary(line, cursor.x), y });
    } else {
      next = this.canonicalCursor({
        x: cursor.x + (delta.x ?? 0),
        y,
      });
    }
    return this.moveTo(next, extendSelection);
  }

  home(extendSelection = false): CursorPosition {
    const cursor = this.cursorPosition.peek();
    return this.moveTo({ x: 0, y: cursor.y }, extendSelection);
  }

  end(extendSelection = false): CursorPosition {
    const cursor = this.cursorPosition.peek();
    return this.moveTo({
      x: this.currentLines()[cursor.y]?.length ?? 0,
      y: cursor.y,
    }, extendSelection);
  }

  insert(character: string): boolean {
    if (!this.accepts(character)) return false;
    return this.insertText(character);
  }

  /** Atomically inserts multiline text, replacing an active selection once. */
  insertText(value: string): boolean {
    const normalized = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    if (!this.acceptsText(normalized)) return false;
    const text = this.text.peek();
    const previousCursor = frozenCursorPosition(this.cursorPosition.peek());
    const range = this.selectionRange();
    const start = range ? this.positionOffset(range.start) : this.positionOffset(this.cursorPosition.peek());
    const end = range ? this.positionOffset(range.end) : start;
    if (!this.acceptsLength(text.length - (end - start) + normalized.length)) return false;
    const next = text.slice(0, start) + normalized + text.slice(end);
    const cursor = this.cursorAtOffset(start + normalized.length, next);
    if (next === text) {
      this.writeState(cursor, undefined);
      return false;
    }
    this.writeValue(next, cursor);
    this.notifyChange(next, previousCursor);
    return true;
  }

  newline(): boolean {
    return this.insertText("\n");
  }

  backspace(): boolean {
    if (this.selection.peek()) return this.replaceSelection("");
    const cursor = this.cursorPosition.peek();
    const lines = [...this.currentLines()];
    const line = lines[cursor.y] ?? "";
    if (cursor.x === 0) {
      if (cursor.y === 0) return false;
      const previous = lines[cursor.y - 1] ?? "";
      lines[cursor.y - 1] = previous + line;
      lines.splice(cursor.y, 1);
      this.setText(lines.join("\n"), { x: previous.length, y: cursor.y - 1 });
      return true;
    }
    const previous = previousGraphemeBoundary(line, cursor.x);
    lines[cursor.y] = line.slice(0, previous) + line.slice(cursor.x);
    this.setText(lines.join("\n"), { x: previous, y: cursor.y });
    return true;
  }

  delete(): boolean {
    if (this.selection.peek()) return this.replaceSelection("");
    const cursor = this.cursorPosition.peek();
    const lines = [...this.currentLines()];
    const line = lines[cursor.y] ?? "";
    if (cursor.x < line.length) {
      const next = nextGraphemeBoundary(line, cursor.x);
      lines[cursor.y] = line.slice(0, cursor.x) + line.slice(next);
      this.setText(lines.join("\n"), cursor);
      return true;
    }
    if (lines.length - 1 <= cursor.y) return false;
    lines[cursor.y] = line + (lines[cursor.y + 1] ?? "");
    lines.splice(cursor.y + 1, 1);
    this.setText(lines.join("\n"), cursor);
    return true;
  }

  /** Replaces the active selection once and collapses it at the inserted text end. */
  replaceSelection(replacement: string): boolean {
    if (!this.selection.peek()) return false;
    return this.insertText(replacement);
  }

  /** Returns all non-overlapping literal matches aligned to full grapheme boundaries. */
  findAll(query: string): readonly TextBoxRange[] {
    const text = this.text.peek();
    const lineStarts = textBoxLineStarts(text);
    const ranges: TextBoxRange[] = [];
    this.scanLiteralMatches(query, (start, end) => {
      ranges.push(frozenTextBoxRange({
        start: this.cursorAtOffset(start, text, lineStarts),
        end: this.cursorAtOffset(end, text, lineStarts),
      }));
    });
    return Object.freeze(ranges);
  }

  /** Counts boundary-aligned non-overlapping literal matches without retaining ranges. */
  countMatches(query: string): number {
    return this.scanLiteralMatches(query);
  }

  /** Finds one literal match without mutating cursor or selection state. */
  find(query: string, options: TextBoxFindOptions = {}): TextBoxFindResult | undefined {
    const direction = options.direction ?? "forward";
    const from = this.positionOffset(options.from ?? this.cursorPosition.peek());
    let first: { start: number; end: number; index: number } | undefined;
    let last: { start: number; end: number; index: number } | undefined;
    let selected: { start: number; end: number; index: number } | undefined;
    const total = this.scanLiteralMatches(query, (start, end, index) => {
      const match = { start, end, index };
      first ??= match;
      last = match;
      if (direction === "forward") {
        if (!selected && start >= from) selected = match;
      } else if (end <= from) selected = match;
    });
    if (total === 0) return undefined;
    let wrapped = false;
    if (!selected && options.wrap !== false) {
      selected = direction === "forward" ? first : last;
      wrapped = true;
    }
    if (!selected) return undefined;
    const text = this.text.peek();
    const lineStarts = textBoxLineStarts(text);
    return frozenTextBoxFindResult(
      query,
      {
        start: this.cursorAtOffset(selected.start, text, lineStarts),
        end: this.cursorAtOffset(selected.end, text, lineStarts),
      },
      selected.index,
      total,
      wrapped,
    );
  }

  /** Finds and selects the next or previous literal match, wrapping by default. */
  findNext(query: string, options: Omit<TextBoxFindOptions, "from"> = {}): TextBoxFindResult | undefined {
    const direction = options.direction ?? "forward";
    const range = this.selectionRange();
    const from = range && this.selectedText() === query
      ? (direction === "forward" ? range.end : range.start)
      : this.cursorPosition.peek();
    const result = this.find(query, { ...options, direction, from });
    if (!result) return undefined;
    if (direction === "forward") this.setSelection(result.range.start, result.range.end);
    else this.setSelection(result.range.end, result.range.start);
    return result;
  }

  /** Replaces every literal match in one bounded, failure-atomic mutation. */
  replaceAll(
    query: string,
    replacement: string,
    options: TextBoxReplaceAllOptions = {},
  ): TextBoxReplaceAllResult {
    const normalized = replacement.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    const text = this.text.peek();
    const previousCursor = frozenCursorPosition(this.cursorPosition.peek());
    const matchCount = this.countMatches(query);
    if (matchCount === 0 || !this.acceptsText(normalized)) {
      return this.replaceAllResult(matchCount, 0, false, false);
    }
    if (query === normalized) return this.replaceAllResult(matchCount, matchCount, false, false);

    const maxReplacements = normalizeTextBoxOperationLimit(
      options.maxReplacements,
      DEFAULT_TEXT_BOX_REPLACE_ALL_MAX_REPLACEMENTS,
      MAX_TEXT_BOX_REPLACE_ALL_REPLACEMENTS,
      "maxReplacements",
    );
    const requestedMaxTextLength = normalizeTextBoxOperationLimit(
      options.maxTextLength,
      DEFAULT_TEXT_BOX_REPLACE_ALL_MAX_TEXT_LENGTH,
      MAX_TEXT_BOX_TEXT_LENGTH,
      "maxTextLength",
    );
    const maxTextLength = Math.min(requestedMaxTextLength, this.maxLength ?? requestedMaxTextLength);
    const projectedLength = text.length + matchCount * (normalized.length - query.length);
    if (matchCount > maxReplacements || projectedLength > maxTextLength) {
      return this.replaceAllResult(matchCount, 0, false, true);
    }

    const parts: string[] = [];
    let sourceOffset = 0;
    let nextOffset = 0;
    this.scanLiteralMatches(query, (start, end) => {
      parts.push(text.slice(sourceOffset, start), normalized);
      nextOffset += start - sourceOffset + normalized.length;
      sourceOffset = end;
    });
    parts.push(text.slice(sourceOffset));
    const next = parts.join("");
    if (next === text) return this.replaceAllResult(matchCount, matchCount, false, false);
    const cursor = this.cursorAtOffset(nextOffset, next);
    this.writeValue(next, cursor);
    this.notifyChange(next, previousCursor);
    return this.replaceAllResult(matchCount, matchCount, true, false);
  }

  handleKeyPress({ key, ctrl, meta, shift }: KeyPressEvent): TextBoxEditResult {
    if (ctrl || meta) {
      if (key.toLocaleLowerCase("en-US") === "a" && !shift) {
        this.selectAll();
        return "moved";
      }
      return "ignored";
    }

    switch (key) {
      case "left":
        this.moveCursor({ x: -1 }, shift);
        return "moved";
      case "right":
        this.moveCursor({ x: 1 }, shift);
        return "moved";
      case "up":
        this.moveCursor({ y: -1 }, shift);
        return "moved";
      case "down":
        this.moveCursor({ y: 1 }, shift);
        return "moved";
      case "home":
        this.home(shift);
        return "moved";
      case "end":
        this.end(shift);
        return "moved";
      case "backspace":
        return this.backspace() ? "changed" : "ignored";
      case "delete":
        return this.delete() ? "changed" : "ignored";
      case "return":
        return this.newline() ? "changed" : "ignored";
      case "space":
        return this.insert(" ") ? "changed" : "ignored";
      case "tab":
        return this.insert("\t") ? "changed" : "ignored";
      default:
        return this.insert(key) ? "changed" : "ignored";
    }
  }

  accepts(character: string): boolean {
    if (typeof character !== "string" || graphemeBoundaries(character).length !== 2) return false;
    if (!this.multiCodePointSupport.peek() && character.length > 1) return false;
    const validator = this.validator.peek();
    if (!validator) return true;
    validator.lastIndex = 0;
    return validator.test(character);
  }

  inspect(): TextBoxInspection {
    const text = this.text.peek();
    const lines = this.currentLines();
    const validator = this.validator.peek();
    const directionalSelection = this.canonicalSelection(this.selection.peek());
    const selectionRange = this.selectionRange();
    const charactersValid = validator
      ? lines.every((line) => {
        const boundaries = graphemeBoundaries(line);
        for (let index = 0; index + 1 < boundaries.length; index++) {
          validator.lastIndex = 0;
          if (!validator.test(line.slice(boundaries[index], boundaries[index + 1]))) return false;
        }
        return true;
      })
      : true;
    return {
      text,
      lines,
      lineCount: lines.length,
      cursorPosition: { ...this.cursorPosition.peek() },
      currentLine: lines[this.cursorPosition.peek().y] ?? "",
      empty: text.length === 0,
      valid: this.acceptsLength(text.length) && charactersValid,
      lineHighlighting: this.lineHighlighting.peek(),
      lineNumbering: this.lineNumbering.peek(),
      wordWrap: this.wordWrap.peek(),
      ...(this.maxLength === undefined ? {} : { maxLength: this.maxLength }),
      ...(directionalSelection && selectionRange
        ? {
          selection: frozenTextBoxSelection(directionalSelection),
          selectionRange,
          selectedText: this.selectedText(),
        }
        : {}),
    };
  }

  dispose(): void {
    this.text.unsubscribe(this.#syncText);
    this.cursorPosition.unsubscribe(this.#syncCursor);
    this.selection.unsubscribe(this.#syncSelection);
    try {
      this.lines.dispose();
    } catch {
      // Computed dependency tracking is asynchronous; disposal may happen before
      // dependencies have linked their dependant sets in short-lived tests.
    }
    if (this.#ownsText) this.text.dispose();
    if (this.#ownsCursorPosition) this.cursorPosition.dispose();
    if (this.#ownsSelection) this.selection.dispose();
    if (this.#ownsValidator) this.validator.dispose();
    if (this.#ownsMultiCodePointSupport) this.multiCodePointSupport.dispose();
    if (this.#ownsLineHighlighting) this.lineHighlighting.dispose();
    if (this.#ownsLineNumbering) this.lineNumbering.dispose();
    if (this.#ownsWordWrap) this.wordWrap.dispose();
  }

  private canonicalCursor(position: CursorPosition, value: string = this.text.peek()): CursorPosition {
    const lines = value === this.text.peek() ? this.currentLines() : value.split("\n");
    const clampedY = clamp(position.y, 0, Math.max(lines.length - 1, 0));
    const y = Number.isFinite(clampedY) ? Math.trunc(clampedY) : 0;
    const line = lines[y] ?? "";
    return { x: canonicalTextBoxOffset(line, position.x), y };
  }

  private canonicalSelection(selection: TextBoxSelection | undefined): TextBoxSelection | undefined {
    if (!selection) return undefined;
    const anchor = this.canonicalCursor(selection.anchor);
    const focus = this.canonicalCursor(selection.focus);
    if (cursorPositionsEqual(anchor, focus)) return undefined;
    return { anchor, focus };
  }

  private moveTo(position: CursorPosition, extendSelection: boolean): CursorPosition {
    const cursor = this.canonicalCursor(position);
    if (!extendSelection) return this.setCursorPosition(cursor);
    const anchor = this.selection.peek()?.anchor ?? this.cursorPosition.peek();
    this.setSelection(anchor, cursor);
    return { ...cursor };
  }

  private writeValue(value: string, position: CursorPosition): void {
    const cursor = this.canonicalCursor(position, value);
    const retainedCursor = this.cursorPosition.peek();
    this.#syncingState = true;
    try {
      batchSignalUpdates(() => {
        this.text.value = value;
        retainedCursor.y = cursor.y;
        retainedCursor.x = cursor.x;
        this.cursorPosition.forceUpdateValue = true;
        this.cursorPosition.value = retainedCursor;
        this.selection.value = undefined;
      });
    } finally {
      this.#syncingState = false;
    }
  }

  private writeState(position: CursorPosition, selection: TextBoxSelection | undefined): void {
    const cursor = this.canonicalCursor(position);
    const canonicalSelection = this.canonicalSelection(selection);
    const retainedCursor = this.cursorPosition.peek();
    const nextSelection = canonicalSelection
      ? {
        anchor: { ...canonicalSelection.anchor },
        focus: { ...canonicalSelection.focus },
      }
      : undefined;
    this.#syncingState = true;
    try {
      batchSignalUpdates(() => {
        retainedCursor.y = cursor.y;
        retainedCursor.x = cursor.x;
        this.cursorPosition.forceUpdateValue = true;
        this.cursorPosition.value = retainedCursor;
        this.selection.value = nextSelection;
      });
    } finally {
      this.#syncingState = false;
    }
  }

  private currentLines(): readonly string[] {
    return this.#textLineCache.lines(this.text.peek());
  }

  private endPosition(value: string): CursorPosition {
    const lines = value.split("\n");
    const y = Math.max(lines.length - 1, 0);
    return { x: lines[y]?.length ?? 0, y };
  }

  private positionOffset(position: CursorPosition): number {
    const cursor = this.canonicalCursor(position);
    const lines = this.currentLines();
    let offset = cursor.x;
    for (let lineIndex = 0; lineIndex < cursor.y; lineIndex += 1) {
      offset += (lines[lineIndex]?.length ?? 0) + 1;
    }
    return offset;
  }

  private cursorAtOffset(
    offset: number,
    value: string = this.text.peek(),
    lineStarts: readonly number[] = textBoxLineStarts(value),
  ): CursorPosition {
    const safeOffset = Math.max(0, Math.min(Number.isFinite(offset) ? Math.trunc(offset) : 0, value.length));
    let low = 0;
    let high = lineStarts.length;
    while (low < high) {
      const middle = low + ((high - low) >>> 1);
      if (lineStarts[middle]! <= safeOffset) low = middle + 1;
      else high = middle;
    }
    const y = Math.max(0, low - 1);
    const lineStart = lineStarts[y] ?? 0;
    const lineEnd = y + 1 < lineStarts.length ? lineStarts[y + 1]! - 1 : value.length;
    const line = value.slice(lineStart, lineEnd);
    return { x: canonicalTextBoxOffset(line, safeOffset - lineStart), y };
  }

  private scanLiteralMatches(
    query: string,
    visitor?: (start: number, end: number, index: number) => void,
  ): number {
    if (typeof query !== "string" || query.length === 0) return 0;
    const text = this.text.peek();
    if (query.length > text.length) return 0;
    const boundaries = new Set(graphemeBoundaries(text));
    let count = 0;
    let offset = 0;
    while (offset <= text.length - query.length) {
      const found = text.indexOf(query, offset);
      if (found < 0) break;
      const end = found + query.length;
      if (boundaries.has(found) && boundaries.has(end)) {
        visitor?.(found, end, count);
        count += 1;
        offset = end;
      } else {
        offset = found + 1;
      }
    }
    return count;
  }

  private acceptsText(value: string): boolean {
    for (const line of value.split("\n")) {
      const boundaries = graphemeBoundaries(line);
      for (let index = 0; index + 1 < boundaries.length; index += 1) {
        if (!this.accepts(line.slice(boundaries[index], boundaries[index + 1]))) return false;
      }
    }
    return true;
  }

  private acceptsLength(length: number): boolean {
    return this.maxLength === undefined || length <= this.maxLength;
  }

  private notifyChange(value: string, previousCursorPosition: CursorPosition): void {
    void this.#onChange?.(
      value,
      Object.freeze({
        previousCursorPosition: frozenCursorPosition(previousCursorPosition),
        cursorPosition: frozenCursorPosition(this.cursorPosition.peek()),
      }),
    );
  }

  private replaceAllResult(
    matchCount: number,
    replacements: number,
    changed: boolean,
    limited: boolean,
  ): TextBoxReplaceAllResult {
    return Object.freeze({
      matchCount,
      replacements,
      changed,
      limited,
      text: this.text.peek(),
      cursorPosition: frozenCursorPosition(this.cursorPosition.peek()),
    });
  }
}

function normalizeTextBoxMaxLength(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return normalizeTextBoxOperationLimit(value, value, MAX_TEXT_BOX_TEXT_LENGTH, "maxLength");
}

function normalizeTextBoxOperationLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0 || resolved > maximum) {
    throw new RangeError(`TextBox ${label} must be a safe integer between 0 and ${maximum}.`);
  }
  return resolved;
}

function textBoxLineStarts(value: string): number[] {
  const starts = [0];
  for (let offset = value.indexOf("\n"); offset >= 0; offset = value.indexOf("\n", offset + 1)) {
    starts.push(offset + 1);
  }
  return starts;
}

function padTextBoxCells(value: string, width: number): string {
  const cropped = cropToWidth(value, width);
  return `${cropped}${" ".repeat(Math.max(0, width - textWidth(cropped)))}`;
}

function frozenTextBoxFindResult(
  query: string,
  range: TextBoxRange,
  index: number,
  total: number,
  wrapped: boolean,
): TextBoxFindResult {
  return Object.freeze({
    query,
    range: frozenTextBoxRange(range),
    index,
    total,
    wrapped,
  });
}

/** Tabs as the spaces they are drawn as, without allocating when there are none. */
function untab(text: string): string {
  return text.includes("\t") ? text.replaceAll("\t", " ") : text;
}

/** A cluster as text, tabs mapped to the space they are drawn as. */
function sliceForWidth(line: string, start: number, end: number): string {
  const segment = line.slice(start, end);
  return segment === "\t" ? " " : segment;
}

/** Public helper for wrap Text Box Lines. */
export function wrapTextBoxLines(
  lines: readonly string[],
  width: number,
  options: { wordWrap?: boolean } = {},
): TextBoxVisualLine[] {
  return wrapTextBoxLinesInto([], lines, width, options);
}

/** Public helper for wrap Text Box Lines into caller-owned storage. */
export function wrapTextBoxLinesInto(
  visual: TextBoxVisualLine[],
  lines: readonly string[],
  width: number,
  options: { wordWrap?: boolean } = {},
): TextBoxVisualLine[] {
  let written = 0;
  const safeWidth = Math.max(1, Math.floor(width));
  const wordWrap = options.wordWrap ?? true;
  const writeVisualLine = (
    lineIndex: number,
    startColumn: number,
    endColumn: number,
    text: string,
    continuation: boolean,
  ) => {
    const target = visual[written] ??= {
      lineIndex: 0,
      startColumn: 0,
      endColumn: 0,
      text: "",
      continuation: false,
    };
    target.lineIndex = lineIndex;
    target.startColumn = startColumn;
    target.endColumn = endColumn;
    target.text = text;
    target.continuation = continuation;
    written += 1;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    if (!wordWrap) {
      writeVisualLine(lineIndex, 0, line.length, cropToWidth(untab(line), safeWidth), false);
      continue;
    }
    if (line.length === 0) {
      writeVisualLine(lineIndex, 0, 0, "", false);
      continue;
    }

    let startBoundaryIndex = 0;
    let continuation = false;
    const boundaries = graphemeBoundaries(line);
    while (startBoundaryIndex + 1 < boundaries.length) {
      const startColumn = boundaries[startBoundaryIndex]!;
      let fitBoundaryIndex = startBoundaryIndex;
      let segmentWidth = 0;
      let separatorBoundaryIndex = -1;
      while (fitBoundaryIndex + 1 < boundaries.length) {
        const start = boundaries[fitBoundaryIndex]!;
        const end = boundaries[fitBoundaryIndex + 1]!;
        // The overwhelmingly common cluster is one printable ASCII code unit,
        // one column wide. Measuring it by slicing a string out of the line and
        // handing that to textWidth costs an allocation and a call per
        // character; a char-code test answers the same question. A tab counts
        // as one column, matching the space it is drawn as below.
        const code = end - start === 1 ? line.charCodeAt(start) : -1;
        const ascii = code >= 0x20 ? code < 0x7f : code === 0x09;
        const width = ascii ? 1 : textWidth(sliceForWidth(line, start, end));
        if (fitBoundaryIndex > startBoundaryIndex && segmentWidth + width > safeWidth) break;
        segmentWidth += width;
        if (code === 0x20 && start > startColumn) separatorBoundaryIndex = fitBoundaryIndex;
        fitBoundaryIndex += 1;
        // Always make progress when one grapheme is wider than the viewport.
        if (segmentWidth >= safeWidth) break;
      }

      if (fitBoundaryIndex + 1 >= boundaries.length) {
        writeVisualLine(
          lineIndex,
          startColumn,
          line.length,
          cropToWidth(untab(line.slice(startColumn)), safeWidth),
          continuation,
        );
        break;
      }

      const endBoundaryIndex = separatorBoundaryIndex >= 0 ? separatorBoundaryIndex : fitBoundaryIndex;
      const endColumn = boundaries[endBoundaryIndex]!;
      writeVisualLine(
        lineIndex,
        startColumn,
        endColumn,
        cropToWidth(untab(line.slice(startColumn, endColumn)), safeWidth),
        continuation,
      );
      startBoundaryIndex = separatorBoundaryIndex >= 0 ? separatorBoundaryIndex + 1 : endBoundaryIndex;
      while (startBoundaryIndex + 1 < boundaries.length) {
        const start = boundaries[startBoundaryIndex]!;
        if (boundaries[startBoundaryIndex + 1]! - start !== 1 || line.charCodeAt(start) !== 0x20) break;
        startBoundaryIndex += 1;
      }
      continuation = true;
    }
  }

  if (written === 0) writeVisualLine(0, 0, 0, "", false);
  visual.length = written;
  return visual;
}

/** Public helper for text Box Visual Cursor. */
export function textBoxVisualCursor(
  lines: readonly string[],
  cursor: CursorPosition,
  width: number,
  options: { wordWrap?: boolean } = {},
): TextBoxVisualCursor {
  const visualLines = wrapTextBoxLines(lines, width, options);
  return textBoxVisualCursorFromLines(visualLines, cursor, width);
}

function textBoxVisualCursorFromLines(
  visualLines: readonly TextBoxVisualLine[],
  cursor: CursorPosition,
  width: number,
): TextBoxVisualCursor {
  let fallbackRow = 0;
  for (const [row, line] of visualLines.entries()) {
    if (line.lineIndex !== cursor.y) continue;
    fallbackRow = row;
    if (cursor.x >= line.startColumn && cursor.x <= line.endColumn) {
      return {
        row,
        column: clamp(
          textWidth(line.text.slice(0, Math.max(0, cursor.x - line.startColumn))),
          0,
          Math.max(0, width - 1),
        ),
        line,
      };
    }
  }
  const line = visualLines[fallbackRow] ?? visualLines[0]!;
  return {
    row: fallbackRow,
    column: clamp(
      textWidth(line.text.slice(0, Math.max(0, cursor.x - line.startColumn))),
      0,
      Math.max(0, width - 1),
    ),
    line,
  };
}

/**
 * Component for creating interactive mutliline text input
 *
 * If you need singleline input use `Input` component.
 *
 * @example
 * ```ts
 * new TextBox({
 *  parent: tui,
 *  lineNumbering: true,
 *  lineHighlighting: true,
 *  theme: {
 *    base: crayon.bgGreen,
 *    focused: crayon.bgLightGreen,
 *    active: crayon.bgYellow,
 *  },
 *  rectangle: {
 *    column: 1,
 *    row: 1,
 *    width: 10,
 *    height: 5,
 *  },
 *  zIndex: 0,
 * });
 * ```
 *
 * It supports validating input, e.g. number input would look like this:
 * @example
 * ```ts
 * new TextBox({
 *  ...,
 *  validator: /\d+/,
 * });
 * ```
 *
 * If you need to use emojis or other multi codepoint characters set `multiCodePointSupport` property to true.
 * @example
 * ```ts
 * new TextBox({
 *  ...,
 *  placeholder: "🧡",
 *  multiCodePointCharacter: true,
 * });
 * ```
 */
export class TextBox extends Box {
  declare drawnObjects: {
    box: BoxObject;
    lines: TextObject[];
    lineNumbers: TextObject[];
    selections: TextObject[];
    cursor: TextObject;
  };
  declare theme: TextBoxTheme;

  #textLines: Computed<readonly string[]>;
  #visualLines: Computed<TextBoxVisualLine[]>;
  #visualCursor: Computed<TextBoxVisualCursor>;

  text: Signal<string>;
  validator: Signal<RegExp | undefined>;
  lineNumbering: Signal<boolean>;
  lineHighlighting: Signal<boolean>;
  wordWrap: Signal<boolean>;
  cursorPosition: Signal<CursorPosition>;
  selection: Signal<TextBoxSelection | undefined>;
  multiCodePointSupport: Signal<boolean>;
  readonly controller: TextBoxController;

  constructor(options: TextBoxOptions) {
    super(options);

    this.theme.value ??= this.theme;
    this.theme.lineNumbers ??= this.theme;
    this.theme.highlightedLine ??= this.theme;
    this.theme.selection ??= this.theme;

    const ownsController = !options.controller;
    const controller = options.controller ??
      new TextBoxController({
        text: options.text,
        maxLength: options.maxLength,
        cursorPosition: options.cursorPosition,
        selection: options.selection,
        validator: options.validator,
        lineNumbering: options.lineNumbering,
        lineHighlighting: options.lineHighlighting,
        wordWrap: options.wordWrap,
        multiCodePointSupport: options.multiCodePointSupport,
        onChange: options.onChange,
      });
    this.controller = controller;
    this.text = controller.text;
    this.validator = controller.validator;
    this.lineNumbering = controller.lineNumbering;
    this.lineHighlighting = controller.lineHighlighting;
    this.wordWrap = controller.wordWrap;
    this.cursorPosition = controller.cursorPosition;
    this.selection = controller.selection;
    this.multiCodePointSupport = controller.multiCodePointSupport;
    this.#textLines = controller.lines;
    this.#visualLines = new Computed(() =>
      wrapTextBoxLines(this.#textLines.value, this.#textColumnWidth(), { wordWrap: this.wordWrap.value })
    );
    this.#visualCursor = new Computed(() =>
      textBoxVisualCursorFromLines(this.#visualLines.value, this.cursorPosition.value, this.#textColumnWidth())
    );

    new Effect(() => {
      this.#updateLineDrawObjects();
    });

    this.on(
      "keyPress",
      options.keyboardHandler ?? ((event) => {
        this.controller.handleKeyPress(event);
      }),
    );
    this.on("destroy", () => {
      disposeTextBoxComputed(this.#visualCursor);
      disposeTextBoxComputed(this.#visualLines);
    });
    if (ownsController) this.on("destroy", () => this.controller.dispose());
  }

  override draw(): void {
    super.draw();

    const { canvas } = this.tui;
    const { drawnObjects } = this;

    drawnObjects.lineNumbers = [];
    drawnObjects.lines = [];
    drawnObjects.selections = [];

    this.#updateLineDrawObjects();

    const cursorRectangle: TextRectangle = { column: 0, row: 0, width: 1 };
    const cursor = new TextObject({
      canvas,
      view: this.view,
      zIndex: this.zIndex,
      multiCodePointSupport: this.multiCodePointSupport,
      value: new Computed(() => {
        this.#visualCursor.value;
        const cursorPosition = this.cursorPosition.value;
        const line = this.#textLines.value[cursorPosition.y] ?? "";
        const end = nextGraphemeBoundary(line, cursorPosition.x);
        return cropToWidth(line.slice(cursorPosition.x, end).replaceAll("\t", " "), 1) || " ";
      }),
      style: new Computed(() => this.theme.cursor[this.state.value]),
      rectangle: new Computed(() => {
        const { row, column, width, height } = this.rectangle.value;
        const visualCursor = this.#visualCursor.value;
        const offsetY = Math.max(visualCursor.row - height + 1, 0);

        cursorRectangle.row = row + Math.min(Math.max(0, visualCursor.row - offsetY), height - 1);

        if (this.lineNumbering.value) {
          const lineNumbersWidth = this.#lineNumbersWidth();
          cursorRectangle.column = column + lineNumbersWidth +
            Math.min(visualCursor.column, width - lineNumbersWidth - 1);
        } else {
          cursorRectangle.column = column + Math.min(visualCursor.column, width - 1);
        }

        return cursorRectangle;
      }),
    });

    drawnObjects.cursor = cursor;
    cursor.draw();
  }

  override interact(method: "keyboard" | "mouse"): void {
    this.state.value = "focused";
    super.interact(method);
  }

  #updateLineDrawObjects(): void {
    const { lineNumbers, lines, selections } = this.drawnObjects;

    const { height } = this.rectangle.value;
    const lineNumbering = this.lineNumbering.value;

    if (!lines || !selections) return;
    const { canvas } = this.tui;
    const elements = Math.max(lines.length, selections.length);

    for (let offset = 0; offset < Math.max(height, elements); ++offset) {
      const lineNumber = lineNumbers[offset];
      if (!lineNumber && lineNumbering) {
        const lineNumberRectangle: TextRectangle = { column: 0, row: 0, width: 0 };
        const lineNumber = new TextObject({
          canvas,
          view: this.view,
          zIndex: this.zIndex,
          multiCodePointSupport: this.multiCodePointSupport,
          style: new Computed(() => this.theme.lineNumbers[this.state.value]),
          value: new Computed(() => {
            const { height } = this.rectangle.value;
            const visualCursor = this.#visualCursor.value;

            const offsetY = Math.max(visualCursor.row - height + 1, 0);
            const visualLine = this.#visualLines.value[offset + offsetY];
            const maxLineNumber = this.#textLines.value.length;

            return visualLine && !visualLine.continuation
              ? `${visualLine.lineIndex + 1}`.padEnd(`${maxLineNumber}`.length, " ")
              : " ".repeat(`${maxLineNumber}`.length);
          }),
          rectangle: new Computed(() => {
            const { row, column } = this.rectangle.value;
            lineNumberRectangle.column = column;
            lineNumberRectangle.row = row + offset;
            lineNumberRectangle.width = this.#lineNumbersWidth();
            return lineNumberRectangle;
          }),
        });

        lineNumbers[offset] = lineNumber;
        lineNumber.draw();
      } else if (lineNumber && !lineNumbering) {
        lineNumber.erase();
        delete lineNumbers[offset];
      }

      const line = lines[offset];
      if (!line) {
        const lineRectangle: TextRectangle = { column: 0, row: 0, width: 0 };
        const line = new TextObject({
          canvas,
          view: this.view,
          zIndex: this.zIndex,
          multiCodePointSupport: this.multiCodePointSupport,
          style: new Computed(() => {
            // associate computed with this.text
            this.text.value;

            const state = this.state.value;
            const highlightLine = this.lineHighlighting.value;
            const visualCursor = this.#visualCursor.value;

            const offsetY = Math.max(visualCursor.row - this.rectangle.value.height + 1, 0);
            const currentLine = offsetY + offset;

            if (highlightLine && visualCursor.row === currentLine) {
              return this.theme.highlightedLine[state];
            } else return this.theme.value[state];
          }),
          value: new Computed(() => {
            const cursorPosition = this.cursorPosition.value;

            let { width, height } = this.rectangle.value;
            if (this.lineNumbering.value) {
              const lineNumbersWidth = this.#lineNumbersWidth();
              width -= lineNumbersWidth;
            }

            if (this.wordWrap.value) {
              const visualCursor = this.#visualCursor.value;
              const offsetY = Math.max(visualCursor.row - height + 1, 0);
              const value = this.#visualLines.value[offset + offsetY]?.text ?? "";
              return padTextBoxCells(value, width);
            }

            const offsetY = Math.max(cursorPosition.y - height + 1, 0);
            const value = this.#textLines.value[offset + offsetY]?.replaceAll("\t", " ") ?? "";
            const startColumn = this.#unwrappedStartColumn(value, cursorPosition.x, width);

            return padTextBoxCells(value.slice(startColumn), width);
          }),
          rectangle: new Computed(() => {
            // associate computed with this.lineNumbering and this.#textLines
            this.lineNumbering.value;
            this.#textLines.value;

            const { row, column } = this.rectangle.value;
            lineRectangle.column = column;
            lineRectangle.row = row + offset;

            if (this.lineNumbering.value) {
              const lineNumbersWidth = this.#lineNumbersWidth();
              lineRectangle.column += lineNumbersWidth;
            }

            return lineRectangle;
          }),
        });

        lines[offset] = line;
        line.draw();
      } else if (offset >= height) {
        line.erase();
        delete lines[offset];
      }

      const selection = selections[offset];
      if (!selection && offset < height) {
        const selectionRectangle: TextRectangle = { column: 0, row: 0 };
        const selection = new TextObject({
          canvas,
          view: this.view,
          zIndex: this.zIndex,
          multiCodePointSupport: this.multiCodePointSupport,
          style: new Computed(() => this.theme.selection![this.state.value]),
          value: new Computed(() => this.#selectionVisualSegment(offset).text),
          rectangle: new Computed(() => {
            const segment = this.#selectionVisualSegment(offset);
            const { column, row } = this.rectangle.value;
            selectionRectangle.column = column + this.#lineNumbersWidth() + segment.column;
            selectionRectangle.row = row + offset;
            return selectionRectangle;
          }),
        });
        selections[offset] = selection;
        selection.draw();
      } else if (selection && offset >= height) {
        selection.erase();
        delete selections[offset];
      }
    }
  }

  #selectionVisualSegment(offset: number): { text: string; column: number } {
    // Associate retained selection objects with all state that affects their projection.
    this.selection.value;
    const range = this.controller.selectionRange();
    if (!range) return { text: "", column: 0 };

    const { height } = this.rectangle.value;
    const width = this.#textColumnWidth();
    const visualCursor = this.#visualCursor.value;
    const offsetY = Math.max(visualCursor.row - height + 1, 0);
    const visualLine = this.#visualLines.value[offset + offsetY];
    if (!visualLine) return { text: "", column: 0 };

    const lineIndex = visualLine.lineIndex;
    if (lineIndex < range.start.y || lineIndex > range.end.y) return { text: "", column: 0 };
    const line = this.#textLines.value[lineIndex] ?? "";
    let viewportStart = visualLine.startColumn;
    let viewportEnd = visualLine.endColumn;
    if (!this.wordWrap.value) {
      viewportStart = this.#unwrappedStartColumn(line, this.cursorPosition.value.x, width);
      viewportEnd = line.length;
    }

    const lineSelectionStart = lineIndex === range.start.y ? range.start.x : 0;
    const lineSelectionEnd = lineIndex === range.end.y ? range.end.x : line.length;
    const start = Math.max(viewportStart, lineSelectionStart);
    const end = Math.min(viewportEnd, lineSelectionEnd);
    const prefix = line.slice(viewportStart, start).replaceAll("\t", " ");
    const column = textWidth(prefix);
    if (column >= width) return { text: "", column: 0 };
    if (end > start) {
      return {
        text: cropToWidth(line.slice(start, end).replaceAll("\t", " "), width - column),
        column,
      };
    }

    const selectsNewline = range.end.y > lineIndex && lineSelectionStart <= line.length;
    const lastVisualLine = visualLine.endColumn === line.length;
    if (selectsNewline && lastVisualLine && column < width) return { text: " ", column };
    return { text: "", column: 0 };
  }

  #unwrappedStartColumn(line: string, cursorColumn: number, width: number): number {
    const cursor = canonicalTextBoxOffset(line, cursorColumn);
    const boundaries = graphemeBoundaries(line);
    let boundaryIndex = graphemeBoundaryIndexAtOrBefore(boundaries, cursor);
    let start = boundaries[boundaryIndex] ?? 0;
    let usedWidth = 0;
    const availableWidth = Math.max(0, width - 1);
    while (boundaryIndex > 0) {
      const previous = boundaries[boundaryIndex - 1]!;
      const grapheme = line.slice(previous, start);
      const graphemeWidth = textWidth(grapheme === "\t" ? " " : grapheme);
      if (usedWidth + graphemeWidth > availableWidth) break;
      usedWidth += graphemeWidth;
      start = previous;
      boundaryIndex -= 1;
    }
    return start;
  }

  #lineNumbersWidth(): number {
    return this.lineNumbering.value ? `${Math.max(1, this.#textLines.value.length)}`.length : 0;
  }

  #textColumnWidth(): number {
    return Math.max(1, this.rectangle.value.width - this.#lineNumbersWidth());
  }
}

function disposeTextBoxComputed(computed: { dispose(): void }): void {
  try {
    computed.dispose();
  } catch {
    // Computed dependency tracking is asynchronous in short-lived component tests.
  }
}
