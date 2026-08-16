// Copyright 2023 Im-Beast. MIT license.

// WID-006: expansion, column operations, focus, and selection preserve
// row IDs over data refresh.

import { assert, assertEquals } from "./deps.ts";
import { createTreeGridController, type TreeGridNode } from "../mod.ts";

const COLUMNS = [
  { id: "name", title: "Name", width: 24 },
  { id: "size", title: "Size", width: 8 },
  { id: "kind", title: "Kind", width: 10, sortable: false },
];

function nodes(): TreeGridNode[] {
  return [
    { id: "src", cells: { name: "src", size: 0, kind: "dir" } },
    { id: "src/b.ts", parentId: "src", cells: { name: "b.ts", size: 20, kind: "file" } },
    { id: "src/a.ts", parentId: "src", cells: { name: "a.ts", size: 30, kind: "file" } },
    { id: "docs", cells: { name: "docs", size: 0, kind: "dir" } },
    { id: "docs/x.md", parentId: "docs", cells: { name: "x.md", size: 5, kind: "file" } },
  ];
}

function grid() {
  return createTreeGridController({ columns: COLUMNS, hierarchyColumnId: "name", nodes: nodes() });
}

Deno.test("hierarchy flattens only expanded branches; hierarchy column stays pinned", () => {
  const tree = grid();
  assertEquals(tree.visibleRows().map((row) => row.id), ["src", "docs"]); // collapsed
  tree.expand("src");
  assertEquals(tree.visibleRows().map((row) => `${row.depth}:${row.id}`), [
    "0:src",
    "1:src/b.ts",
    "1:src/a.ts",
    "0:docs",
  ]);
  // The hierarchy column is pinned first regardless of declaration games.
  assertEquals(tree.columns()[0]!.id, "name");
  assert(tree.resizeColumn("size", 12));
  assertEquals(tree.columns().find((column) => column.id === "size")!.width, 12);
  assertEquals(tree.columns()[0]!.id, "name"); // still pinned
});

Deno.test("sorting orders siblings within their parent, never across", () => {
  const tree = grid();
  tree.expand("src");
  assert(tree.sortBy("size", "desc"));
  assertEquals(tree.visibleRows().map((row) => row.id), [
    "src", // roots sorted among themselves (size 0 vs 0, stable-ish)
    "src/a.ts", // 30 before 20 inside src
    "src/b.ts",
    "docs",
  ]);
  assert(!tree.sortBy("kind", "asc")); // sortable: false refuses
});

Deno.test("refresh preserves expansion, focus, and selection by row ID", () => {
  const tree = grid();
  tree.expand("src");
  tree.focusRow("src/a.ts");
  tree.toggleSelect("src/a.ts");
  tree.toggleSelect("docs/x.md");

  // The data refreshes: new objects, new order, one id gone, one new.
  const refreshed: TreeGridNode[] = [
    { id: "docs", cells: { name: "docs", size: 0, kind: "dir" } },
    { id: "src", cells: { name: "src", size: 0, kind: "dir" } },
    { id: "src/a.ts", parentId: "src", cells: { name: "a.ts", size: 31, kind: "file" } },
    { id: "src/new.ts", parentId: "src", cells: { name: "new.ts", size: 1, kind: "file" } },
    // docs/x.md vanished; src/b.ts vanished.
  ];
  tree.refresh(refreshed);

  const state = tree.inspect();
  assertEquals(state.expanded, ["src"]); // expansion survived by id
  assertEquals(state.focused, "src/a.ts"); // focus survived
  assertEquals(state.selected, ["src/a.ts"]); // vanished id dropped exactly
  const rows = tree.visibleRows();
  assert(rows.some((row) => row.id === "src/new.ts")); // new data visible
  assertEquals(rows.find((row) => row.id === "src/a.ts")!.cells["size"], 31); // fresh cells
  assertEquals(rows.find((row) => row.id === "src/a.ts")!.focused, true);
});

Deno.test("virtualization windows the flattened rows", () => {
  const tree = grid();
  tree.expand("src");
  tree.expand("docs");
  const window = tree.visibleRows(1, 2);
  assertEquals(window.map((row) => row.id), ["src/b.ts", "src/a.ts"]);
});
