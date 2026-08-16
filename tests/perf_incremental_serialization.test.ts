// Copyright 2023 Im-Beast. MIT license.

// PER-008: unchanged subtrees reuse prior bytes/hashes and full decode
// matches canonical serialization.

import { assert, assertEquals } from "./deps.ts";
import { decodeSerialized, serializeIncremental, serializeSnapshot } from "../mod.ts";

const WORKSPACE = {
  panels: [{ id: "left", width: 30 }, { id: "right", width: 50 }],
  theme: "night",
  nested: { deep: { anchor: [1, 2, 3] } },
};

Deno.test("full decode always equals the canonical serialization", () => {
  const tree = serializeIncremental(WORKSPACE);
  assertEquals(decodeSerialized(tree), JSON.parse(tree.bytes));
  assertEquals(decodeSerialized(tree), WORKSPACE);
  // Canonical: key order in the source cannot change the bytes.
  const reordered = serializeIncremental({
    nested: { deep: { anchor: [1, 2, 3] } },
    theme: "night",
    panels: [{ width: 30, id: "left" }, { width: 50, id: "right" }],
  });
  assertEquals(reordered.bytes, tree.bytes);
  assertEquals(reordered.hash, tree.hash);
});

Deno.test("unchanged subtrees are reference-identical to the prior tree", () => {
  const first = serializeIncremental(WORKSPACE);
  const changed = { ...WORKSPACE, theme: "day" };
  const second = serializeIncremental(changed, first);

  assert(second !== first); // the root changed
  // Untouched subtrees are the SAME node objects — bytes reused, not rebuilt.
  assert(second.children!["panels"] === first.children!["panels"]);
  assert(second.children!["nested"] === first.children!["nested"]);
  assert(second.children!["theme"] !== first.children!["theme"]);

  // A deep partial change rebuilds only its spine.
  const deepChange = {
    ...WORKSPACE,
    nested: { deep: { anchor: [1, 2, 99] } },
  };
  const third = serializeIncremental(deepChange, first);
  assert(third.children!["panels"] === first.children!["panels"]); // sibling reused
  const thirdAnchor = third.children!["nested"]!.children!["deep"]!.children!["anchor"]!;
  const firstAnchor = first.children!["nested"]!.children!["deep"]!.children!["anchor"]!;
  assert(thirdAnchor !== firstAnchor);
  // Inside the changed array, the untouched elements are still reused.
  assert(thirdAnchor.children!["0"] === firstAnchor.children!["0"]);
  assert(thirdAnchor.children!["2"] !== firstAnchor.children!["2"]);
});

Deno.test("schema-aware snapshots reuse whole unchanged sections", () => {
  const sections = {
    workspace: WORKSPACE,
    journal: [{ op: "edit", at: 1 }],
    frame: { columns: 80, rows: 24 },
    caches: { glyphs: 512 },
  };
  const first = serializeSnapshot(sections);
  const second = serializeSnapshot({ ...sections, journal: [{ op: "edit", at: 1 }, { op: "undo", at: 2 }] }, first);
  assert(second.workspace === first.workspace); // whole sections reused
  assert(second.frame === first.frame);
  assert(second.caches === first.caches);
  assert(second.journal !== first.journal);
  assertEquals(decodeSerialized(second.journal), [{ op: "edit", at: 1 }, { op: "undo", at: 2 }]);
});
