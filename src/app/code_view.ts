// Copyright 2023 Im-Beast. MIT license.

// 036 V1: the reusable code view. It consumes STREAMED highlight spans
// (per-version, applied incrementally as batches arrive), owns
// selection as an anchor/focus pair, applies concealment rules with an
// honest source→display column map so spans and selection land on the
// right display cells, carries per-line diagnostics as gutter signs,
// and scrolls both axes. Rendering is pull-based: visibleLines() maps
// only the vertical window (viewport culling), slicing each display
// line horizontally.

import type { HighlightSpan } from "./syntax_service.ts";

/** One concealment rule: matched source text renders as `display`. */
export interface ConcealRule {
  readonly pattern: RegExp;
  readonly display: string;
}

/** One diagnostic. */
export interface CodeDiagnostic {
  readonly line: number;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
}

/** One rendered segment of a display line. */
export interface CodeSegment {
  readonly text: string;
  readonly scope?: string;
}

/** One visible row. */
export interface CodeViewRow {
  readonly line: number;
  readonly segments: readonly CodeSegment[];
  readonly sign?: "error" | "warning" | "info";
  /** Selection range in display columns, clipped to the window. */
  readonly selection?: readonly [number, number];
}

interface DisplayLine {
  readonly text: string;
  /** display column for each source column (concealed → span start). */
  readonly map: readonly number[];
}

const SIGN_RANK: Readonly<Record<string, number>> = { error: 3, warning: 2, info: 1 };

/** The code view controller. */
export class CodeViewController {
  #lines: string[] = [];
  #version = 0;
  #spans = new Map<number, HighlightSpan[]>();
  #conceal: ConcealRule[] = [];
  #diagnostics: CodeDiagnostic[] = [];
  #anchor?: { line: number; column: number };
  #focus?: { line: number; column: number };
  #topLine = 0;
  #leftColumn = 0;
  readonly #viewportWidth: number;
  readonly #viewportHeight: number;

  constructor(options: { readonly viewportWidth: number; readonly viewportHeight: number }) {
    this.#viewportWidth = Math.max(1, options.viewportWidth);
    this.#viewportHeight = Math.max(1, options.viewportHeight);
  }

  /** Replaces the text; bumps the version and clears stale spans. */
  setText(text: string): number {
    this.#lines = text.split("\n");
    this.#version += 1;
    this.#spans.clear();
    return this.#version;
  }

  version(): number {
    return this.#version;
  }

  lineCount(): number {
    return this.#lines.length;
  }

  /** Applies one streamed batch; stale versions are refused. */
  applyHighlights(version: number, spans: readonly HighlightSpan[]): boolean {
    if (version !== this.#version) return false;
    for (const span of spans) {
      const bucket = this.#spans.get(span.line) ?? [];
      bucket.push(span);
      this.#spans.set(span.line, bucket);
    }
    return true;
  }

  setConcealRules(rules: readonly ConcealRule[]): void {
    this.#conceal = [...rules];
  }

  setDiagnostics(diagnostics: readonly CodeDiagnostic[]): void {
    this.#diagnostics = [...diagnostics];
  }

  diagnosticsForLine(line: number): readonly CodeDiagnostic[] {
    return this.#diagnostics.filter((diagnostic) => diagnostic.line === line);
  }

  select(anchor: { line: number; column: number }, focus?: { line: number; column: number }): void {
    this.#anchor = anchor;
    this.#focus = focus ?? anchor;
  }

  clearSelection(): void {
    this.#anchor = undefined;
    this.#focus = undefined;
  }

  scrollTo(topLine: number, leftColumn: number): void {
    this.#topLine = Math.max(0, Math.min(topLine, Math.max(0, this.#lines.length - 1)));
    this.#leftColumn = Math.max(0, leftColumn);
  }

  scrollBy(lines: number, columns: number): void {
    this.scrollTo(this.#topLine + lines, this.#leftColumn + columns);
  }

  offset(): { readonly topLine: number; readonly leftColumn: number } {
    return { topLine: this.#topLine, leftColumn: this.#leftColumn };
  }

  /** Only the vertical window is materialized (viewport culling). */
  visibleLines(): readonly CodeViewRow[] {
    const rows: CodeViewRow[] = [];
    const bottom = Math.min(this.#lines.length, this.#topLine + this.#viewportHeight);
    for (let line = this.#topLine; line < bottom; line += 1) {
      rows.push(this.#renderLine(line));
    }
    return rows;
  }

  #renderLine(line: number): CodeViewRow {
    const display = this.#displayLine(line);
    const windowed = display.text.slice(this.#leftColumn, this.#leftColumn + this.#viewportWidth);
    const segments = this.#segment(line, display, windowed);
    const sign = this.#diagnostics
      .filter((diagnostic) => diagnostic.line === line)
      .sort((a, b) => SIGN_RANK[b.severity]! - SIGN_RANK[a.severity]!)[0]?.severity;
    const selection = this.#selectionInLine(line, display);
    return {
      line,
      segments,
      ...(sign !== undefined ? { sign } : {}),
      ...(selection !== undefined ? { selection } : {}),
    };
  }

  /** Applies concealments, building the source→display column map. */
  #displayLine(line: number): DisplayLine {
    const source = this.#lines[line] ?? "";
    if (this.#conceal.length === 0) {
      return { text: source, map: Array.from({ length: source.length + 1 }, (_, index) => index) };
    }
    const replacements: { start: number; end: number; display: string }[] = [];
    for (const rule of this.#conceal) {
      const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g";
      for (const match of source.matchAll(new RegExp(rule.pattern.source, flags))) {
        if (match[0] === "") break;
        const overlaps = replacements.some((existing) =>
          match.index < existing.end && match.index + match[0].length > existing.start
        );
        if (!overlaps) {
          replacements.push({ start: match.index, end: match.index + match[0].length, display: rule.display });
        }
      }
    }
    replacements.sort((a, b) => a.start - b.start);
    let text = "";
    const map: number[] = [];
    let cursor = 0;
    for (const replacement of replacements) {
      while (cursor < replacement.start) {
        map[cursor] = text.length;
        text += source[cursor]!;
        cursor += 1;
      }
      const displayStart = text.length;
      text += replacement.display;
      while (cursor < replacement.end) {
        map[cursor] = displayStart;
        cursor += 1;
      }
    }
    while (cursor < source.length) {
      map[cursor] = text.length;
      text += source[cursor]!;
      cursor += 1;
    }
    map[source.length] = text.length;
    return { text, map };
  }

  /** Splits the windowed text into scope segments via mapped spans. */
  #segment(line: number, display: DisplayLine, windowed: string): readonly CodeSegment[] {
    const spans = this.#spans.get(line) ?? [];
    if (spans.length === 0) return windowed === "" ? [] : [{ text: windowed }];
    const boundaries = new Map<number, string>();
    const scopeAt: (string | undefined)[] = Array.from({ length: windowed.length }, () => undefined);
    for (const span of spans) {
      const from = Math.max(0, (display.map[span.start] ?? display.text.length) - this.#leftColumn);
      const to = Math.max(0, (display.map[span.end] ?? display.text.length) - this.#leftColumn);
      for (let column = from; column < Math.min(to, windowed.length); column += 1) scopeAt[column] = span.scope;
    }
    boundaries.clear();
    const segments: CodeSegment[] = [];
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

  #selectionInLine(line: number, display: DisplayLine): readonly [number, number] | undefined {
    if (!this.#anchor || !this.#focus) return undefined;
    let [start, end] = [this.#anchor, this.#focus];
    if (start.line > end.line || (start.line === end.line && start.column > end.column)) {
      [start, end] = [end, start];
    }
    if (line < start.line || line > end.line) return undefined;
    const sourceFrom = line === start.line ? start.column : 0;
    const sourceTo = line === end.line ? end.column : (this.#lines[line] ?? "").length;
    const from = Math.max(0, (display.map[sourceFrom] ?? display.text.length) - this.#leftColumn);
    const to = Math.min(this.#viewportWidth, (display.map[sourceTo] ?? display.text.length) - this.#leftColumn);
    if (to <= 0 || to <= from) return undefined;
    return [from, to];
  }
}
