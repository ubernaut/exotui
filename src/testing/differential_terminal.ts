// Copyright 2023 Im-Beast. MIT license.

// QAL-009: protocol fixtures run through TWO independently written
// headless cores and every divergence is preserved, normalized, and
// judged against a ledger. Core A applies the TERM-003 operation events;
// core B is a deliberately separate naive interpreter over raw parser
// tokens — two implementations that can catch each other. A divergence
// (normalized screen mismatch) is a FRAMEWORK REGRESSION unless the
// ledger documents it by fixture id with an explanation; CI therefore
// distinguishes "we broke something" from "these cores are known to
// disagree here", and additional emulator cores can plug into the same
// harness later.

import { createTerminalOperationDecoder } from "../runtime/terminal_operations.ts";
import { createIncrementalTerminalParser } from "../runtime/terminal_parser.ts";

/** One divergence record. */
export interface TerminalDivergence {
  readonly fixtureId: string;
  readonly ours: readonly string[];
  readonly reference: readonly string[];
}

/** One documented (accepted) divergence. */
export interface DocumentedDivergence {
  readonly fixtureId: string;
  readonly explanation: string;
}

/** The differential report. */
export interface DifferentialReport {
  readonly fixtures: number;
  readonly agreements: number;
  readonly divergences: readonly TerminalDivergence[];
  /** Divergences the ledger does NOT document — framework regressions. */
  readonly regressions: readonly TerminalDivergence[];
  /** Ledger entries that no longer diverge — stale documentation. */
  readonly staleDocumentation: readonly string[];
}

interface Screen {
  readonly cells: string[][];
  cursorRow: number;
  cursorColumn: number;
}

function makeScreen(columns: number, rows: number): Screen {
  return {
    cells: Array.from({ length: rows }, () => Array.from({ length: columns }, () => " ")),
    cursorRow: 0,
    cursorColumn: 0,
  };
}

function normalize(screen: Screen): string[] {
  return screen.cells.map((row) => row.join("").replace(/ +$/, ""));
}

function putChar(screen: Screen, char: string): void {
  const columns = screen.cells[0]!.length;
  if (screen.cursorColumn >= columns) {
    screen.cursorColumn = 0;
    screen.cursorRow = Math.min(screen.cells.length - 1, screen.cursorRow + 1);
  }
  if (screen.cursorRow < screen.cells.length) {
    screen.cells[screen.cursorRow]![screen.cursorColumn] = char;
  }
  screen.cursorColumn += 1;
}

/** Core A: driven by the TERM-003 operation events. */
export function runOperationCore(input: string, columns: number, rows: number): string[] {
  const screen = makeScreen(columns, rows);
  const decoder = createTerminalOperationDecoder();
  for (const event of [...decoder.write(input), ...decoder.flush()]) {
    if (event.classification !== "parsed") continue;
    switch (event.operation) {
      case "print":
        for (const char of event.raw) putChar(screen, char);
        break;
      case "cursor-position":
        screen.cursorRow = Math.max(0, (event.params?.[0] ?? 1) - 1);
        screen.cursorColumn = Math.max(0, (event.params?.[1] ?? 1) - 1);
        break;
      case "cursor-up":
        screen.cursorRow = Math.max(0, screen.cursorRow - (event.params?.[0] ?? 1));
        break;
      case "cursor-down":
        screen.cursorRow = Math.min(rows - 1, screen.cursorRow + (event.params?.[0] ?? 1));
        break;
      case "cursor-forward":
        screen.cursorColumn += event.params?.[0] ?? 1;
        break;
      case "cursor-back":
        screen.cursorColumn = Math.max(0, screen.cursorColumn - (event.params?.[0] ?? 1));
        break;
      case "carriage-return":
        screen.cursorColumn = 0;
        break;
      case "line-feed":
        screen.cursorRow = Math.min(rows - 1, screen.cursorRow + 1);
        break;
      case "erase-display":
        if ((event.params?.[0] ?? 0) === 2) {
          for (const row of screen.cells) row.fill(" ");
        }
        break;
      case "erase-line": {
        const from = (event.params?.[0] ?? 0) === 0 ? screen.cursorColumn : 0;
        const row = screen.cells[screen.cursorRow];
        if (row) { for (let column = from; column < row.length; column += 1) row[column] = " "; }
        break;
      }
    }
  }
  return normalize(screen);
}

/** Core B: an independent naive interpreter over raw tokens. */
export function runReferenceCore(input: string, columns: number, rows: number): string[] {
  const screen = makeScreen(columns, rows);
  const parser = createIncrementalTerminalParser();
  for (const token of [...parser.write(input), ...parser.flush()]) {
    if (token.kind === "text") {
      for (const char of token.text) putChar(screen, char);
    } else if (token.kind === "control") {
      if (token.code === 0x0d) screen.cursorColumn = 0;
      if (token.code === 0x0a) screen.cursorRow = Math.min(rows - 1, screen.cursorRow + 1);
    } else if (token.kind === "csi" && token.prefix === "") {
      const params = token.params.split(";").map((part) => Number.parseInt(part, 10) || 1);
      if (token.final === "H" || token.final === "f") {
        screen.cursorRow = Math.max(0, (params[0] ?? 1) - 1);
        screen.cursorColumn = Math.max(0, (params[1] ?? 1) - 1);
      } else if (token.final === "A") screen.cursorRow = Math.max(0, screen.cursorRow - (params[0] ?? 1));
      else if (token.final === "B") screen.cursorRow = Math.min(rows - 1, screen.cursorRow + (params[0] ?? 1));
      else if (token.final === "C") screen.cursorColumn += params[0] ?? 1;
      else if (token.final === "D") screen.cursorColumn = Math.max(0, screen.cursorColumn - (params[0] ?? 1));
      else if (token.final === "J" && token.params === "2") {
        for (const row of screen.cells) row.fill(" ");
      } else if (token.final === "K" && (token.params === "" || token.params === "0")) {
        const row = screen.cells[screen.cursorRow];
        if (row) { for (let column = screen.cursorColumn; column < row.length; column += 1) row[column] = " "; }
      }
    }
  }
  return normalize(screen);
}

/** Runs every fixture through both cores and judges the ledger. */
export function runDifferential(
  fixtures: readonly { readonly id: string; readonly input: string }[],
  ledger: readonly DocumentedDivergence[],
  options: { readonly columns?: number; readonly rows?: number } = {},
): DifferentialReport {
  const columns = options.columns ?? 20;
  const rows = options.rows ?? 6;
  const divergences: TerminalDivergence[] = [];
  for (const fixture of fixtures) {
    const ours = runOperationCore(fixture.input, columns, rows);
    const reference = runReferenceCore(fixture.input, columns, rows);
    if (JSON.stringify(ours) !== JSON.stringify(reference)) {
      divergences.push({ fixtureId: fixture.id, ours, reference });
    }
  }
  const documented = new Set(ledger.map((entry) => entry.fixtureId));
  const diverged = new Set(divergences.map((entry) => entry.fixtureId));
  return {
    fixtures: fixtures.length,
    agreements: fixtures.length - divergences.length,
    divergences,
    regressions: divergences.filter((entry) => !documented.has(entry.fixtureId)),
    staleDocumentation: ledger
      .filter((entry) => !diverged.has(entry.fixtureId))
      .map((entry) => entry.fixtureId),
  };
}
