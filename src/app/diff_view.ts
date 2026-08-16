// Copyright 2023 Im-Beast. MIT license.

// 036 V1: line-number/sign gutters and diff views BUILT ON the code
// view. The diff is an LCS line alignment producing same/add/del ops;
// the unified view feeds one CodeViewController and pairs every visible
// row with a gutter cell (before/after numbers plus +/-/space marker);
// the split view feeds two controllers with ALIGNED texts (filler rows
// keep both sides the same height) and scrolls them in lockstep — one
// offset drives both panes, which is what synchronized scrolling means
// here. Gutter formatting is shared with plain code views: right-
// aligned line numbers and ranked diagnostic sign glyphs.

import { CodeViewController } from "./code_view.ts";

/** One diff operation over whole lines. */
export interface DiffOp {
  readonly kind: "same" | "add" | "del";
  /** 0-based line in the BEFORE text (same/del). */
  readonly beforeLine?: number;
  /** 0-based line in the AFTER text (same/add). */
  readonly afterLine?: number;
  readonly text: string;
}

/** One gutter cell. */
export interface GutterCell {
  /** Right-aligned 1-based before-line number, or blanks. */
  readonly before: string;
  /** Right-aligned 1-based after-line number, or blanks. */
  readonly after: string;
  readonly marker: "+" | "-" | " ";
}

/** Right-aligns a 1-based line number into a fixed-width gutter. */
export function formatLineNumber(line: number | undefined, width: number): string {
  const text = line === undefined ? "" : String(line + 1);
  return text.padStart(Math.max(width, text.length), " ");
}

/** The sign glyph for a diagnostic severity. */
export function signGlyph(severity: "error" | "warning" | "info" | undefined): string {
  if (severity === "error") return "●";
  if (severity === "warning") return "▲";
  if (severity === "info") return "·";
  return " ";
}

/** LCS line diff: same/add/del ops covering both texts in order. */
export function diffLines(before: readonly string[], after: readonly string[]): readonly DiffOp[] {
  const rows = before.length;
  const columns = after.length;
  const lcs: number[][] = Array.from({ length: rows + 1 }, () => Array.from({ length: columns + 1 }, () => 0));
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      lcs[row]![column] = before[row] === after[column]
        ? lcs[row + 1]![column + 1]! + 1
        : Math.max(lcs[row + 1]![column]!, lcs[row]![column + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (before[row] === after[column]) {
      ops.push({ kind: "same", beforeLine: row, afterLine: column, text: before[row]! });
      row += 1;
      column += 1;
    } else if (lcs[row + 1]![column]! >= lcs[row]![column + 1]!) {
      ops.push({ kind: "del", beforeLine: row, text: before[row]! });
      row += 1;
    } else {
      ops.push({ kind: "add", afterLine: column, text: after[column]! });
      column += 1;
    }
  }
  while (row < rows) {
    ops.push({ kind: "del", beforeLine: row, text: before[row]! });
    row += 1;
  }
  while (column < columns) {
    ops.push({ kind: "add", afterLine: column, text: after[column]! });
    column += 1;
  }
  return ops;
}

/** The unified diff view: ONE code view plus an aligned gutter. */
export class UnifiedDiffController {
  readonly view: CodeViewController;
  readonly #gutter: readonly GutterCell[];

  constructor(
    beforeText: string,
    afterText: string,
    options: { readonly viewportWidth: number; readonly viewportHeight: number; readonly gutterWidth?: number },
  ) {
    const ops = diffLines(beforeText.split("\n"), afterText.split("\n"));
    const width = Math.max(1, options.gutterWidth ?? 4);
    this.#gutter = ops.map((op) => ({
      before: formatLineNumber(op.beforeLine, width),
      after: formatLineNumber(op.afterLine, width),
      marker: op.kind === "add" ? "+" as const : op.kind === "del" ? "-" as const : " " as const,
    }));
    this.view = new CodeViewController(options);
    this.view.setText(ops.map((op) => op.text).join("\n"));
  }

  scrollTo(topLine: number, leftColumn: number): void {
    this.view.scrollTo(topLine, leftColumn);
  }

  visibleRows(): readonly {
    readonly gutter: GutterCell;
    readonly segments: readonly { readonly text: string; readonly scope?: string }[];
  }[] {
    return this.view.visibleLines().map((row) => ({
      gutter: this.#gutter[row.line]!,
      segments: row.segments,
    }));
  }
}

/** The split diff view: two code views scrolled in LOCKSTEP. */
export class SplitDiffController {
  readonly left: CodeViewController;
  readonly right: CodeViewController;
  readonly #leftGutter: readonly GutterCell[];
  readonly #rightGutter: readonly GutterCell[];

  constructor(
    beforeText: string,
    afterText: string,
    options: { readonly viewportWidth: number; readonly viewportHeight: number; readonly gutterWidth?: number },
  ) {
    const ops = diffLines(beforeText.split("\n"), afterText.split("\n"));
    const width = Math.max(1, options.gutterWidth ?? 4);
    // Alignment: same rows pair up; a del occupies the left with a
    // filler right; an add occupies the right with a filler left.
    const leftLines: string[] = [];
    const rightLines: string[] = [];
    const leftGutter: GutterCell[] = [];
    const rightGutter: GutterCell[] = [];
    const filler: GutterCell = { before: " ".repeat(width), after: " ".repeat(width), marker: " " };
    for (const op of ops) {
      if (op.kind === "same") {
        leftLines.push(op.text);
        rightLines.push(op.text);
        leftGutter.push({ before: formatLineNumber(op.beforeLine, width), after: " ".repeat(width), marker: " " });
        rightGutter.push({ before: " ".repeat(width), after: formatLineNumber(op.afterLine, width), marker: " " });
      } else if (op.kind === "del") {
        leftLines.push(op.text);
        rightLines.push("");
        leftGutter.push({ before: formatLineNumber(op.beforeLine, width), after: " ".repeat(width), marker: "-" });
        rightGutter.push(filler);
      } else {
        leftLines.push("");
        rightLines.push(op.text);
        leftGutter.push(filler);
        rightGutter.push({ before: " ".repeat(width), after: formatLineNumber(op.afterLine, width), marker: "+" });
      }
    }
    this.left = new CodeViewController(options);
    this.right = new CodeViewController(options);
    this.left.setText(leftLines.join("\n"));
    this.right.setText(rightLines.join("\n"));
    this.#leftGutter = leftGutter;
    this.#rightGutter = rightGutter;
  }

  /** One offset drives BOTH panes. */
  scrollTo(topLine: number, leftColumn: number): void {
    this.left.scrollTo(topLine, leftColumn);
    this.right.scrollTo(topLine, leftColumn);
  }

  scrollBy(lines: number, columns: number): void {
    this.left.scrollBy(lines, columns);
    this.right.scrollBy(lines, columns);
  }

  visibleRows(): readonly {
    readonly left: {
      readonly gutter: GutterCell;
      readonly segments: readonly { readonly text: string; readonly scope?: string }[];
    };
    readonly right: {
      readonly gutter: GutterCell;
      readonly segments: readonly { readonly text: string; readonly scope?: string }[];
    };
  }[] {
    const leftRows = this.left.visibleLines();
    const rightRows = this.right.visibleLines();
    return leftRows.map((leftRow, index) => ({
      left: { gutter: this.#leftGutter[leftRow.line]!, segments: leftRow.segments },
      right: { gutter: this.#rightGutter[rightRows[index]!.line]!, segments: rightRows[index]!.segments },
    }));
  }
}
