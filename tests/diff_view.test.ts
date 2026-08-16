// Copyright 2023 Im-Beast. MIT license.

// 036 V1: gutters and unified/split diff views with synchronized
// scrolling on the code-view core.

import { assert, assertEquals } from "./deps.ts";
import { diffLines, formatLineNumber, signGlyph, SplitDiffController, UnifiedDiffController } from "../mod.ts";

const BEFORE = ["alpha", "beta", "gamma", "delta"].join("\n");
const AFTER = ["alpha", "BETA", "gamma", "delta", "epsilon"].join("\n");

Deno.test("LCS diff covers both texts with same/add/del ops in order", () => {
  const ops = diffLines(BEFORE.split("\n"), AFTER.split("\n"));
  assertEquals(ops.map((op) => `${op.kind}:${op.text}`), [
    "same:alpha",
    "del:beta",
    "add:BETA",
    "same:gamma",
    "same:delta",
    "add:epsilon",
  ]);
});

Deno.test("gutter formatting right-aligns numbers; signs rank by glyph", () => {
  assertEquals(formatLineNumber(11, 4), "  12"); // 1-based, padded
  assertEquals(formatLineNumber(undefined, 4), "    ");
  assertEquals(signGlyph("error"), "●");
  assertEquals(signGlyph(undefined), " ");
});

Deno.test("unified view pairs every visible row with the right gutter cell", () => {
  const unified = new UnifiedDiffController(BEFORE, AFTER, { viewportWidth: 20, viewportHeight: 3, gutterWidth: 3 });
  const rows = unified.visibleRows();
  assertEquals(rows.length, 3);
  assertEquals(rows[0]!.gutter, { before: "  1", after: "  1", marker: " " });
  assertEquals(rows[1]!.gutter.marker, "-");
  assertEquals(rows[1]!.segments[0]!.text, "beta");
  assertEquals(rows[2]!.gutter.marker, "+");
  assertEquals(rows[2]!.gutter.before, "   "); // adds have no before number
  unified.scrollTo(3, 0);
  assertEquals(unified.visibleRows()[0]!.segments[0]!.text, "gamma");
});

Deno.test("split view aligns sides with fillers and scrolls in lockstep", () => {
  const split = new SplitDiffController(BEFORE, AFTER, { viewportWidth: 20, viewportHeight: 6, gutterWidth: 3 });
  const rows = split.visibleRows();
  assertEquals(rows.length, 6); // 4 same/changed + fillers keep heights equal
  // The del row: text on the left, filler on the right.
  assertEquals(rows[1]!.left.segments[0]!.text, "beta");
  assertEquals(rows[1]!.left.gutter.marker, "-");
  assertEquals(rows[1]!.right.segments, []);
  // The paired add row: filler left, text right.
  assertEquals(rows[2]!.left.segments, []);
  assertEquals(rows[2]!.right.segments[0]!.text, "BETA");
  assertEquals(rows[2]!.right.gutter.marker, "+");

  split.scrollBy(4, 0);
  const scrolled = split.visibleRows();
  assertEquals(split.left.offset(), split.right.offset()); // lockstep
  assertEquals(scrolled[0]!.left.segments[0]!.text, "delta");
  assertEquals(scrolled[0]!.right.segments[0]!.text, "delta");
  assert(scrolled.some((row) => row.right.segments[0]?.text === "epsilon"));
});

Deno.test("code-view features flow through: highlights apply inside a diff pane", () => {
  const split = new SplitDiffController("const a", "const b", { viewportWidth: 20, viewportHeight: 4 });
  const version = split.right.version();
  assert(split.right.applyHighlights(version, [{ line: 1, start: 0, end: 5, scope: "keyword" }]));
  const rightRow = split.visibleRows().find((row) => row.right.segments.some((segment) => segment.scope === "keyword"));
  assert(rightRow !== undefined);
});
