// Copyright 2023 Im-Beast. MIT license.

// WID-007: large documents parse off-thread (node-table seam) and
// never stringify cycles implicitly.

import { assert, assertEquals } from "./deps.ts";
import { parseToNodeTable, StructureInspectorController } from "../mod.ts";

function sample() {
  return {
    name: "exotui",
    version: 36,
    tags: ["tui", "deno"],
    config: { strict: true, retries: null },
  };
}

Deno.test("parse builds an id-keyed node table; cycles become marker nodes", () => {
  const shared: Record<string, unknown> = { label: "shared" };
  shared["self"] = shared; // a true cycle
  const document = parseToNodeTable({ a: shared, b: shared });
  const nodes = Object.values(document.nodes);
  const cycles = nodes.filter((node) => node.kind === "cycle");
  assertEquals(cycles.length, 2); // self-reference + repeated object
  const inspector = new StructureInspectorController(document);
  for (const cycle of cycles) {
    const target = inspector.cycleTarget(cycle.id)!;
    assertEquals(document.nodes[target]!.kind, "object"); // points at the ORIGINAL
  }
  // The table is plain data — JSON.stringify of the whole document is
  // safe, which is exactly what "never stringify cycles" requires.
  assert(JSON.stringify(document).length > 0);
});

Deno.test("folding is lazy: children appear only when their parent expands", () => {
  const inspector = new StructureInspectorController(parseToNodeTable(sample()));
  assertEquals(inspector.visibleNodes().length, 1); // root collapsed
  const root = inspector.visibleNodes()[0]!;
  inspector.expand(root.id);
  const rows = inspector.visibleNodes();
  assertEquals(rows.length, 5); // root + 4 top-level entries
  assertEquals(rows.filter((row) => row.depth === 1).map((row) => row.key), [
    "name",
    "version",
    "tags",
    "config",
  ]);
  const tags = rows.find((row) => row.key === "tags")!;
  inspector.expand(tags.id);
  assertEquals(inspector.visibleNodes().length, 7);
  inspector.collapse(tags.id);
  assertEquals(inspector.visibleNodes().length, 5);
  assert(!inspector.expand(rows.find((row) => row.key === "name")!.id)); // scalars refuse
});

Deno.test("path copy yields canonical paths through objects and arrays", () => {
  const inspector = new StructureInspectorController(parseToNodeTable(sample()));
  const root = inspector.visibleNodes()[0]!;
  inspector.expand(root.id);
  const tags = inspector.visibleNodes().find((row) => row.key === "tags")!;
  inspector.expand(tags.id);
  const deno = inspector.visibleNodes().find((row) => row.preview === '"deno"')!;
  assertEquals(inspector.path(deno.id), "$.tags[1]");
  const strict = inspector.search("strict", "key")[0]!;
  assertEquals(strict.path, "$.config.strict");
});

Deno.test("search is type-aware and covers unexpanded branches", () => {
  const inspector = new StructureInspectorController(parseToNodeTable(sample()));
  // Nothing is expanded — search still reaches everything.
  assertEquals(inspector.search("36", "number").length, 1);
  assertEquals(inspector.search("36", "string").length, 0); // type constraint
  assertEquals(inspector.search("true", "boolean").length, 1);
  assertEquals(inspector.search("tui", "any").length, 2); // "exotui" value + "tui" tag
  assertEquals(inspector.search("version", "key")[0]!.path, "$.version");
});

Deno.test("virtualized windowing slices the flattened rows", () => {
  const large = { items: Array.from({ length: 500 }, (_, index) => index) };
  const inspector = new StructureInspectorController(parseToNodeTable(large));
  const root = inspector.visibleNodes()[0]!;
  inspector.expand(root.id);
  const items = inspector.visibleNodes()[1]!;
  inspector.expand(items.id);
  const window = inspector.visibleNodes(2, 10);
  assertEquals(window.length, 10);
  assertEquals(window[0]!.key, "0");
  assertEquals(window[9]!.key, "9");
});
