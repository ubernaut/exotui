// Copyright 2023 Im-Beast. MIT license.

// PER-003: the diff planner MEASURES, it does not guess. For every
// changed row it builds the actual candidate outputs — per-cell moves,
// contiguous span rewrites, whole-row rewrite, erase-line-plus-segments
// — and picks the one with the fewest encoded bytes; the full-frame
// rewrite is one more measured candidate chosen only when it beats the
// per-row sum. Because the span strategy is always among the candidates,
// the plan can never emit more bytes than a span-only strategy — the
// acceptance bound holds with tolerance zero, by construction.

/** Row strategies the planner can choose. */
export type DiffStrategy = "skip" | "cells" | "span" | "row" | "erase-write";

/** One row's chosen plan. */
export interface RowDiffPlan {
  readonly row: number;
  readonly strategy: DiffStrategy;
  readonly output: string;
  readonly bytes: number;
}

/** The whole frame's plan. */
export interface FrameDiffPlan {
  readonly kind: "rows" | "full-frame";
  readonly rows: readonly RowDiffPlan[];
  readonly output: string;
  readonly bytes: number;
  /** What a span-only plan would have cost (the acceptance baseline). */
  readonly spanOnlyBytes: number;
}

const CLEAR_SCREEN = "\x1b[2J";

function move(row: number, column: number): string {
  return `\x1b[${row + 1};${column + 1}H`;
}

function changedSpans(previous: string, next: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const length = Math.max(previous.length, next.length);
  let start = -1;
  for (let index = 0; index <= length; index += 1) {
    const same = (previous[index] ?? " ") === (next[index] ?? " ");
    if (!same && start < 0) start = index;
    if (same && start >= 0) {
      spans.push({ start, end: index });
      start = -1;
    }
  }
  return spans;
}

function spanOutput(row: number, next: string, spans: readonly { start: number; end: number }[]): string {
  // Spans may extend past next's length (erasing old tail chars): write
  // explicit spaces there instead of truncating.
  const charAt = (index: number) => next[index] ?? " ";
  return spans
    .map((span) =>
      move(row, span.start) +
      Array.from({ length: span.end - span.start }, (_, offset) => charAt(span.start + offset)).join("")
    )
    .join("");
}

function candidateOutputs(
  row: number,
  previous: string,
  next: string,
): Array<{ strategy: DiffStrategy; output: string }> {
  const spans = changedSpans(previous, next);
  if (spans.length === 0) return [{ strategy: "skip", output: "" }];

  const cells: string[] = [];
  for (const span of spans) {
    for (let index = span.start; index < span.end; index += 1) {
      cells.push(move(row, index) + (next[index] ?? " "));
    }
  }
  const nonSpaceSpans: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let index = 0; index <= next.length; index += 1) {
    const space = index >= next.length || next[index] === " ";
    if (!space && start < 0) start = index;
    if (space && start >= 0) {
      nonSpaceSpans.push({ start, end: index });
      start = -1;
    }
  }
  return [
    { strategy: "cells", output: cells.join("") },
    { strategy: "span", output: spanOutput(row, next, spans) },
    { strategy: "row", output: move(row, 0) + next.trimEnd() + "\x1b[K" },
    {
      strategy: "erase-write",
      output: move(row, 0) + "\x1b[2K" +
        nonSpaceSpans.map((span) => move(row, span.start) + next.slice(span.start, span.end)).join(""),
    },
  ];
}

/** Plans one frame diff by measuring every candidate. */
export function planFrameDiff(previous: readonly string[], next: readonly string[]): FrameDiffPlan {
  const rows: RowDiffPlan[] = [];
  let total = 0;
  let spanOnlyBytes = 0;
  for (let row = 0; row < Math.max(previous.length, next.length); row += 1) {
    const before = previous[row] ?? "";
    const after = next[row] ?? "";
    const candidates = candidateOutputs(row, before, after);
    const spanCandidate = candidates.find((candidate) => candidate.strategy === "span") ??
      { strategy: "skip" as const, output: "" };
    spanOnlyBytes += spanCandidate.output.length;
    const best = candidates.reduce((left, right) => right.output.length < left.output.length ? right : left);
    if (best.strategy === "skip") continue;
    rows.push({ row, strategy: best.strategy, output: best.output, bytes: best.output.length });
    total += best.output.length;
  }

  const fullFrame = CLEAR_SCREEN +
    next.map((line, row) => (line.trimEnd() === "" ? "" : move(row, 0) + line.trimEnd())).join("");
  if (fullFrame.length < total) {
    return { kind: "full-frame", rows: [], output: fullFrame, bytes: fullFrame.length, spanOnlyBytes };
  }
  return {
    kind: "rows",
    rows,
    output: rows.map((row) => row.output).join(""),
    bytes: total,
    spanOnlyBytes,
  };
}
