// Copyright 2023 Im-Beast. MIT license.

// 036 V1: TextBox as a full text-area — wrap modes, selection-edge
// auto-scroll, editing aliases, optional highlighting.

import { assert, assertEquals } from "./deps.ts";
import { TextAreaController } from "../mod.ts";

const LONG = "the quick brown fox jumps over the lazy dog";

Deno.test("soft wrap breaks at words, character wrap at width, none keeps lines", () => {
  const areaSoft = new TextAreaController({ text: LONG, viewportWidth: 10, viewportHeight: 10, wrapMode: "soft" });
  const soft = areaSoft.visibleRows();
  assert(soft.length > 1);
  assert(soft.every((row) => row.text.length <= 10));
  assert(soft.some((row) => row.text.startsWith("quick") || row.text.includes("quick"))); // word kept whole
  areaSoft.dispose();

  const areaChar = new TextAreaController({ text: LONG, viewportWidth: 10, viewportHeight: 10, wrapMode: "character" });
  const chars = areaChar.visibleRows();
  assertEquals(chars[0]!.text, "the quick "); // hard break mid-word allowed
  assertEquals(chars[1]!.text, "brown fox ");
  assert(chars[1]!.continuation);
  areaChar.dispose();

  const areaNone = new TextAreaController({ text: LONG, viewportWidth: 10, viewportHeight: 10, wrapMode: "none" });
  assertEquals(areaNone.visibleRows().length, 1); // one logical line
  assertEquals(areaNone.visibleRows()[0]!.text, "the quick "); // h-window
  areaNone.dispose();
});

Deno.test("extending the selection past the edge auto-scrolls minimally", () => {
  const lines = Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n");
  const area = new TextAreaController({ text: lines, viewportWidth: 12, viewportHeight: 4, wrapMode: "soft" });
  area.textBox.setCursorPosition({ x: 0, y: 0 });
  area.extendSelectionTo({ x: 3, y: 9 }); // beyond the 4-row window
  assertEquals(area.offset().topRow, 6); // 9 - 4 + 1 → minimal scroll
  assertEquals(area.textBox.selectionRange()!.end.y, 9);
  area.extendSelectionTo({ x: 3, y: 2 }); // back above the window
  assertEquals(area.offset().topRow, 2);
  area.dispose();
});

Deno.test("no-wrap mode also follows the selection edge horizontally", () => {
  const area = new TextAreaController({ text: LONG, viewportWidth: 10, viewportHeight: 2, wrapMode: "none" });
  area.textBox.setCursorPosition({ x: 0, y: 0 });
  area.extendSelectionTo({ x: 25, y: 0 });
  assertEquals(area.offset().leftColumn, 16); // 25 - 10 + 1
  area.extendSelectionTo({ x: 4, y: 0 });
  assertEquals(area.offset().leftColumn, 4);
  area.dispose();
});

Deno.test("editing aliases bind host verbs to canonical actions; unknown verbs refuse", () => {
  const area = new TextAreaController({
    text: "abc",
    viewportWidth: 10,
    viewportHeight: 2,
    aliases: { "C-a": "select-all", "kill": "clear" },
  });
  assert(area.invoke("C-a"));
  assertEquals(area.textBox.inspect().selectedText, "abc");
  assert(!area.invoke("M-x")); // unbound
  area.bindAlias("M-x", "clear-selection");
  assert(area.invoke("M-x"));
  assertEquals(area.textBox.inspect().selectedText, undefined);
  assert(area.invoke("kill"));
  assertEquals(area.textBox.text.peek(), "");
  area.dispose();
});

Deno.test("optional highlighting segments rows; stale versions and edits drop spans", () => {
  const area = new TextAreaController({ text: "const a\nreturn a", viewportWidth: 20, viewportHeight: 4 });
  const version = area.highlightVersion();
  assert(!area.applyHighlights(version + 1, [{ line: 0, start: 0, end: 5, scope: "keyword" }]));
  assert(area.applyHighlights(version, [{ line: 0, start: 0, end: 5, scope: "keyword" }]));
  assertEquals(area.visibleRows()[0]!.segments, [{ text: "const", scope: "keyword" }, { text: " a" }]);

  const next = area.invalidateHighlights(); // an edit happened
  assert(next > version);
  assertEquals(area.visibleRows()[0]!.segments, [{ text: "const a" }]); // spans gone until re-streamed
  area.dispose();
});
