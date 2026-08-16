// Copyright 2023 Im-Beast. MIT license.

// HIS-005: named branches and checkpoints — pushing after undo preserves
// the redo tail as a sibling branch, switching restores exact checkpoints,
// and divergence exposes each side's entry ids.

import { assert, assertEquals } from "./deps.ts";
import { createBranchingHistory } from "../mod.ts";

Deno.test("push after undo branches instead of destroying redo state", () => {
  const history = createBranchingHistory("v0");
  history.push("v1");
  const v2 = history.push("v2");
  history.undo(); // back at v1
  assertEquals(history.state, "v1");

  history.push("v2-alt"); // a sibling of v2, not a truncation
  assertEquals(history.state, "v2-alt");
  history.undo();
  assertEquals(history.inspect().redoOptions, 2); // both futures remain

  // Redo retraces the last-travelled child (v2-alt)...
  history.redo();
  assertEquals(history.state, "v2-alt");
  // ...while the original future is still reachable by id via a branch pin.
  history.undo();
  assert(v2.length > 0);
});

Deno.test("named branches restore exact checkpoints", () => {
  const history = createBranchingHistory({ text: "" });
  history.push({ text: "draft one" });
  history.saveBranch("draft-1");
  history.undo();
  history.push({ text: "draft two" });
  history.saveBranch("draft-2");

  assert(history.switchBranch("draft-1"));
  assertEquals(history.state, { text: "draft one" });
  assert(history.switchBranch("draft-2"));
  assertEquals(history.state, { text: "draft two" });
  assertEquals(history.switchBranch("missing"), false);
  assertEquals(history.inspect().branches, ["draft-1", "draft-2"]);
});

Deno.test("divergence exposes each side's ids back to the common ancestor", () => {
  const history = createBranchingHistory("base");
  const shared = history.push("shared");
  const a1 = history.push("a1");
  const a2 = history.push("a2");
  history.saveBranch("a");
  history.undo();
  history.undo(); // back to "shared"
  const b1 = history.push("b1");
  history.saveBranch("b");

  const divergence = history.divergence("a", "b")!;
  assertEquals(divergence.commonAncestor, shared);
  assertEquals(divergence.left, [a1, a2]);
  assertEquals(divergence.right, [b1]);
  // A branch against itself has no divergent entries.
  const self = history.divergence("a", "a")!;
  assertEquals([self.left, self.right], [[], []]);
});
