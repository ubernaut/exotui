// Copyright 2023 Im-Beast. MIT license.
import { Canvas } from "../canvas/canvas.ts";
import type { ConsoleSize, Stdout } from "../types.ts";
import { stripAnsi as stripAnsiText } from "../utils/ansi_text.ts";

/** Public interface describing a test Stdout. */
export interface TestStdout {
  readonly chunks: Uint8Array[];
  readonly text: string;
  write(data: Uint8Array): Promise<number>;
  writeSync(data: Uint8Array): number;
  clear(): void;
}

/** Options for configuring test Canvas. */
export interface TestCanvasOptions {
  size?: ConsoleSize;
  stdout?: TestStdout;
}

/** Public helper for strip Ansi. */
export function stripAnsi(value: string): string {
  return stripAnsiText(value);
}

/** Public helper for normalize Terminal Snapshot. */
export function normalizeTerminalSnapshot(value: string): string {
  return stripAnsi(value).replace(/[ \t]+$/gm, "").trimEnd();
}

/** Public helper for frame Buffer To Snapshot. */
export function frameBufferToSnapshot(frameBuffer: readonly (readonly (string | Uint8Array | undefined)[])[]): string {
  const decoder = new TextDecoder();
  return normalizeTerminalSnapshot(
    frameBuffer
      .map((row) =>
        Array.from({ length: row.length }, (_, index) => {
          const cell = row[index];
          if (cell === undefined) return " ";
          return typeof cell === "string" ? cell : decoder.decode(cell);
        }).join("")
      )
      .join("\n"),
  );
}

/** Creates an test Stdout. */
export function createTestStdout(): TestStdout {
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  return {
    chunks,
    write(data: Uint8Array) {
      chunks.push(data.slice());
      return Promise.resolve(data.byteLength);
    },
    writeSync(data: Uint8Array) {
      chunks.push(data.slice());
      return data.byteLength;
    },
    get text() {
      return chunks.map((chunk) => decoder.decode(chunk)).join("");
    },
    clear() {
      chunks.length = 0;
    },
  };
}

/** Creates an test Canvas. */
export function createTestCanvas(options: TestCanvasOptions = {}): Canvas {
  return new Canvas({
    stdout: (options.stdout ?? createTestStdout()) as unknown as Stdout,
    size: options.size ?? { columns: 80, rows: 24 },
  });
}

/** Public helper for canvas Snapshot. */
export function canvasSnapshot(canvas: Canvas): string {
  return frameBufferToSnapshot(canvas.frameBuffer);
}

/** Public helper for canvas Row Text. Styling is stripped: the row as plain text. */
export function canvasRowText(canvas: Canvas, row: number, width: number = canvas.size.peek().columns): string {
  return stripAnsi(
    Array.from({ length: Math.max(0, width) }, (_, column) => String(canvas.frameBuffer[row]?.[column] ?? " "))
      .join(""),
  );
}

/** Public interface describing a terminal Snapshot Mismatch. */
export interface TerminalSnapshotMismatch {
  line: number;
  column: number;
  expected: string;
  actual: string;
}

/** Public interface describing a terminal Snapshot Comparison. */
export interface TerminalSnapshotComparison {
  pass: boolean;
  expected: string;
  actual: string;
  mismatches: TerminalSnapshotMismatch[];
}

/** Options for configuring terminal Snapshot Diff. */
export interface TerminalSnapshotDiffOptions {
  maxMismatches?: number;
}

/** Public helper for compare Terminal Snapshot. */
export function compareTerminalSnapshot(
  actual: string,
  expected: string,
  options: TerminalSnapshotDiffOptions = {},
): TerminalSnapshotComparison {
  const normalizedActual = normalizeTerminalSnapshot(actual);
  const normalizedExpected = normalizeTerminalSnapshot(expected);
  const actualLines = normalizedActual.split("\n");
  const expectedLines = normalizedExpected.split("\n");
  const lineCount = Math.max(actualLines.length, expectedLines.length);
  const maxMismatches = Math.max(1, Math.floor(options.maxMismatches ?? 8));
  const mismatches: TerminalSnapshotMismatch[] = [];

  for (let index = 0; index < lineCount && mismatches.length < maxMismatches; index += 1) {
    const actualLine = actualLines[index] ?? "";
    const expectedLine = expectedLines[index] ?? "";
    if (actualLine === expectedLine) continue;

    mismatches.push({
      line: index + 1,
      column: firstDifferenceColumn(actualLine, expectedLine),
      expected: expectedLine,
      actual: actualLine,
    });
  }

  return {
    pass: normalizedActual === normalizedExpected,
    expected: normalizedExpected,
    actual: normalizedActual,
    mismatches,
  };
}

/** Formats terminal Snapshot Diff for display or diagnostics. */
export function formatTerminalSnapshotDiff(
  comparison: TerminalSnapshotComparison,
): string {
  if (comparison.pass) return "Terminal snapshots match.";
  const lines = ["Terminal snapshot mismatch:"];
  for (const mismatch of comparison.mismatches) {
    lines.push(
      `line ${mismatch.line}, column ${mismatch.column}`,
      `  expected: ${JSON.stringify(mismatch.expected)}`,
      `  actual:   ${JSON.stringify(mismatch.actual)}`,
    );
  }
  return lines.join("\n");
}

/** Public helper for assert Terminal Snapshot. */
export function assertTerminalSnapshot(
  actual: string,
  expected: string,
  options: TerminalSnapshotDiffOptions = {},
): void {
  const comparison = compareTerminalSnapshot(actual, expected, options);
  if (!comparison.pass) {
    throw new Error(formatTerminalSnapshotDiff(comparison));
  }
}

function firstDifferenceColumn(left: string, right: string): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index + 1;
  }
  return 1;
}
