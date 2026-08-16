// Copyright 2023 Im-Beast. MIT license.

// REM-004: decoding a delta plus its base yields the exact styled cell
// frame or requests resync.

import { assert, assertEquals } from "./deps.ts";
import {
  applyCellFrameDelta,
  type CellFrame,
  decodeCellFrame,
  encodeCellFrame,
  encodeCellFrameDelta,
  frameChecksum,
} from "../mod.remote.ts";

function makeFrame(columns: number, rows: number, fill: (index: number) => { char: string; style: string }): CellFrame {
  return { columns, rows, cells: Array.from({ length: columns * rows }, (_, index) => fill(index)) };
}

const BASE = makeFrame(10, 4, (index) => ({
  char: String.fromCharCode(97 + (index % 26)),
  style: index % 3 === 0 ? "red" : "plain",
}));

Deno.test("full frames round-trip exactly with a deduplicated palette", () => {
  const encoded = encodeCellFrame(BASE);
  assertEquals(encoded.palette.length, 2); // red + plain, deduplicated
  const decoded = decodeCellFrame(encoded);
  assert(decoded.ok);
  assertEquals(decoded.frame, BASE); // exact styled cells

  // Tampered payloads request resync instead of rendering wrong.
  const tampered = { ...encoded, checksum: encoded.checksum ^ 1 };
  const bad = decodeCellFrame(tampered);
  assert(!bad.ok && bad.resync.includes("checksum"));
  const badVersion = { ...encoded, version: 9 as 1 };
  assert(!decodeCellFrame(badVersion).ok);
});

Deno.test("deltas carry only changed spans and reconstruct exactly", () => {
  const next = {
    ...BASE,
    cells: BASE.cells.map((cell, index) => index >= 12 && index < 15 ? { char: "X", style: "alert" } : cell),
  };
  const delta = encodeCellFrameDelta(BASE, next);
  assert(delta.kind === "delta");
  assertEquals(delta.spans.length, 1);
  assertEquals(delta.spans[0]!.row, 1);
  assertEquals(delta.spans[0]!.column, 2);
  assertEquals(delta.palette, ["alert"]); // only the styles the delta needs

  const applied = applyCellFrameDelta(BASE, delta);
  assert(applied.ok);
  assertEquals(applied.frame, next);
  assertEquals(frameChecksum(applied.frame), delta.checksum);

  // An identical frame produces an empty delta that still verifies.
  const identical = encodeCellFrameDelta(BASE, BASE);
  assert(identical.kind === "delta" && identical.spans.length === 0);
  const unchanged = applyCellFrameDelta(BASE, identical);
  assert(unchanged.ok);
  assertEquals(unchanged.frame, BASE);
});

Deno.test("a stale base fails the checksum and requests resync", () => {
  const next = { ...BASE, cells: BASE.cells.map((cell, index) => (index === 5 ? { char: "!", style: "red" } : cell)) };
  const delta = encodeCellFrameDelta(BASE, next);
  assert(delta.kind === "delta");

  const staleBase = {
    ...BASE,
    cells: BASE.cells.map((cell, index) => (index === 30 ? { char: "?", style: "plain" } : cell)),
  };
  const applied = applyCellFrameDelta(staleBase, delta);
  assert(!applied.ok && applied.resync.includes("stale"));

  const wrongSize = makeFrame(8, 4, () => ({ char: " ", style: "plain" }));
  const mismatched = applyCellFrameDelta(wrongSize, delta);
  assert(!mismatched.ok && mismatched.resync.includes("dimensions"));
});

Deno.test("wholesale changes and resizes fall back to full frames", () => {
  const rewritten = makeFrame(10, 4, (index) => ({ char: "Z", style: `s${index % 7}` }));
  assertEquals(encodeCellFrameDelta(BASE, rewritten).kind, "full");
  const resized = makeFrame(12, 5, () => ({ char: ".", style: "plain" }));
  assertEquals(encodeCellFrameDelta(BASE, resized).kind, "full");
});
