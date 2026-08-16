// Copyright 2023 Im-Beast. MIT license.

// WID-004: windowed panes, search, bulk selection, move previews — and
// moving filtered items preserves source order and stable IDs.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createTransferListController } from "../mod.ts";

const ITEMS = [
  { id: "a", label: "alpha" },
  { id: "b", label: "beta" },
  { id: "c", label: "carbon" },
  { id: "d", label: "delta" },
  { id: "e", label: "epsilon" },
  { id: "f", label: "fabric" },
];

Deno.test("panes virtualize with search filters and window scrolling", () => {
  const list = createTransferListController({ source: ITEMS, windowSize: 2 });
  const all = list.view("source");
  assertEquals(all.total, 6);
  assertEquals(all.window.map((item) => item.id), ["a", "b"]);
  list.scrollTo("source", 4);
  assertEquals(list.view("source").window.map((item) => item.id), ["e", "f"]);
  list.scrollTo("source", 99); // clamps
  assertEquals(list.view("source").offset, 4);

  list.search("source", "b"); // beta, carbon, fabric
  const filtered = list.view("source");
  assertEquals(filtered.matching, 3);
  assertEquals(filtered.offset, 0); // search resets the window
  assertEquals(filtered.window.map((item) => item.id), ["b", "c"]);

  assertThrows(() => createTransferListController({ source: ITEMS, target: [{ id: "a", label: "dup" }] }));
});

Deno.test("bulk selection: toggle, filtered range, all-filtered", () => {
  const list = createTransferListController({ source: ITEMS });
  assert(list.toggle("a"));
  assert(list.toggle("a")); // untoggle
  assertEquals(list.view("source").window.filter((item) => item.selected).length, 0);

  list.search("source", "b");
  assertEquals(list.selectRange("source", "b", "f"), 3); // beta..fabric over the FILTERED order
  const selected = list.view("source").window.filter((item) => item.selected).map((item) => item.id);
  assertEquals(selected, ["b", "c", "f"]);

  list.clearSelection();
  assertEquals(list.selectAllFiltered("source"), 3);
});

Deno.test("moves preview first and land in source order with stable IDs", () => {
  const list = createTransferListController({ source: ITEMS });
  // Select in scrambled order while a filter hides everything else.
  list.search("source", "b");
  list.toggle("f");
  list.toggle("b");
  list.toggle("c");

  const preview = list.preview("source");
  assertEquals(preview.items.map((item) => item.id), ["b", "c", "f"]); // source order, not click order
  assertEquals(preview.insertAt, 0);
  // Preview mutates nothing.
  assertEquals(list.items("source").length, 6);

  const moved = list.move("source");
  assertEquals(moved.items.map((item) => item.id), ["b", "c", "f"]);
  assertEquals(list.items("source").map((item) => item.id), ["a", "d", "e"]); // holes close, order kept
  assertEquals(list.items("target").map((item) => item.id), ["b", "c", "f"]);

  // Move back joins at the end, IDs untouched.
  list.toggle("c");
  list.move("target");
  assertEquals(list.items("source").map((item) => item.id), ["a", "d", "e", "c"]);
});

Deno.test("reorder works only on unfiltered panes", () => {
  const list = createTransferListController({ source: ITEMS });
  assert(list.reorder("source", "f", 0));
  assertEquals(list.items("source")[0]!.id, "f");
  list.search("source", "a");
  assertEquals(list.reorder("source", "f", 3), false); // blind reorder refused
  list.search("source", "");
  assert(list.reorder("source", "f", 2));
  assertEquals(list.items("source").map((item) => item.id), ["a", "b", "f", "c", "d", "e"]);
});
