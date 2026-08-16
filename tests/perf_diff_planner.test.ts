// Copyright 2023 Im-Beast. MIT license.

// PER-003: the planner never emits more bytes than the span strategy
// (tolerance zero — span is always a candidate) and its output applies
// back to the exact next frame.

import { assert, assertEquals } from "./deps.ts";
import { createIncrementalTerminalParser, planFrameDiff } from "../mod.ts";

/** Applies planner output to a virtual screen via the real parser. */
function apply(previous: readonly string[], output: string, columns: number, rows: number): string[] {
  const screen = Array.from({ length: rows }, (_, row) => {
    const line = (previous[row] ?? "").padEnd(columns, " ").split("");
    return line;
  });
  let cursorRow = 0;
  let cursorColumn = 0;
  const parser = createIncrementalTerminalParser();
  for (const token of [...parser.write(output), ...parser.flush()]) {
    if (token.kind === "csi" && token.final === "H") {
      const [row = 1, column = 1] = token.params.split(";").map((part) => Number(part) || 1);
      cursorRow = row - 1;
      cursorColumn = column - 1;
    } else if (token.kind === "csi" && token.final === "J") {
      for (const line of screen) line.fill(" ");
    } else if (token.kind === "csi" && token.final === "K") {
      const line = screen[cursorRow];
      if (line) { for (let index = cursorColumn; index < columns; index += 1) line[index] = " "; }
    } else if (token.kind === "text") {
      for (const char of token.text) {
        if (screen[cursorRow] && cursorColumn < columns) screen[cursorRow]![cursorColumn] = char;
        cursorColumn += 1;
      }
    }
  }
  return screen.map((line) => line.join("").replace(/ +$/, ""));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFrame(random: () => number, columns: number, rows: number, density: number): string[] {
  return Array.from(
    { length: rows },
    () =>
      Array.from(
        { length: columns },
        () => random() < density ? String.fromCharCode(33 + Math.floor(random() * 90)) : " ",
      )
        .join("").replace(/ +$/, ""),
  );
}

Deno.test("small changes choose cheap strategies; wholesale goes full-frame", () => {
  const previous = ["hello world", "second line", "third line"];
  const oneChar = ["hello worlp", "second line", "third line"];
  const small = planFrameDiff(previous, oneChar);
  assertEquals(small.kind, "rows");
  assertEquals(small.rows.length, 1);
  assert(small.rows[0]!.strategy === "cells" || small.rows[0]!.strategy === "span");
  assert(small.bytes < 20);

  const rewritten = ["zzzzzzzzzzz", "yyyyyyyyyyy", "xxxxxxxxxxx"];
  const wholesale = planFrameDiff(previous, rewritten);
  assert(wholesale.bytes <= wholesale.spanOnlyBytes);
});

Deno.test("seeded fixtures: never worse than span-only, and exact application", () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const random = mulberry32(seed * 7919);
    const columns = 24;
    const rows = 6;
    const previous = randomFrame(random, columns, rows, 0.5);
    // Derive next: mutate a random subset of cells.
    const next = previous.map((line) => {
      const cells = line.padEnd(columns, " ").split("");
      for (let index = 0; index < columns; index += 1) {
        if (random() < 0.15) cells[index] = random() < 0.3 ? " " : String.fromCharCode(33 + Math.floor(random() * 90));
      }
      return cells.join("").replace(/ +$/, "");
    });
    const plan = planFrameDiff(previous, next);
    // Acceptance: never more bytes than the span-only strategy.
    assert(plan.bytes <= plan.spanOnlyBytes, `seed ${seed}: ${plan.bytes} > span ${plan.spanOnlyBytes}`);
    // Correctness: applying the emitted output reproduces next exactly.
    assertEquals(apply(previous, plan.output, columns, rows), next, `seed ${seed} misapplied`);
    // The reported bytes are the real output length — measured, not modeled.
    assertEquals(plan.output.length, plan.bytes);
  }
});
