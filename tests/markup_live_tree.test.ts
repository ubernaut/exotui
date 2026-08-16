// Copyright 2023 Im-Beast. MIT license.

// D1 first slice: live markup tree — mount, remove, move, attribute/class
// mutation, selector query/filter, and bounded recompose with a revisioned
// mutation journal. Mutations apply fully or reject without touching the tree.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createLiveMarkupTree, parseTuiMarkup } from "../mod.ts";

const DOCUMENT = `
<div id="app">
  <div id="sidebar" class="pane">
    <span id="label">files</span>
  </div>
  <div id="content" class="pane active"></div>
</div>`;

Deno.test("live tree mounts fragments, removes, and moves with cycle rejection", () => {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  const baseline = tree.nodeCount;

  const mounted = tree.mount("content", `<span id="hello">hi</span><span id="bye">bye</span>`);
  assertEquals(mounted.map((node) => node.id), ["hello", "bye"]);
  assertEquals(tree.nodeCount, baseline + 2);
  assertEquals(tree.parentOf("hello")?.id, "content");

  // Move "hello" into the sidebar at position 0, ahead of the label.
  assert(tree.move("hello", "sidebar", 0));
  assertEquals(tree.node("sidebar")?.children.map((node) => node.id), ["hello", "label"]);

  // A node cannot move into its own subtree, and the root cannot be removed.
  assertEquals(tree.move("sidebar", "hello"), false);
  assertEquals(tree.remove("app"), false);

  assert(tree.remove("bye"));
  assertEquals(tree.node("bye"), undefined);
  assertEquals(tree.nodeCount, baseline + 1);

  const kinds = tree.mutations().entries.map((entry) => entry.kind);
  assertEquals(kinds, ["mount", "move", "remove"]);
  assertEquals(tree.revision, 3);
});

Deno.test("live tree rewrites colliding ids deterministically on mount", () => {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  const [duplicate] = tree.mount("content", `<span id="label">shadow</span>`);
  assertEquals(duplicate!.id, "label~1");
  assertEquals(duplicate!.attributes["id"], "label~1");
  // The original keeps its identity.
  assertEquals(tree.parentOf("label")?.id, "sidebar");
});

Deno.test("live tree attribute, class, and text mutations are revisioned and idempotent", () => {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  assert(tree.setAttribute("content", "role", "main"));
  assertEquals(tree.setAttribute("content", "role", "main"), false); // no-op change
  assertEquals(tree.setAttribute("content", "id", "hijack"), false); // id is index-owned
  assert(tree.addClass("sidebar", "collapsed", "pane")); // "pane" already present
  assertEquals(tree.node("sidebar")?.classes, ["pane", "collapsed"]);
  assert(tree.removeClass("content", "active"));
  assertEquals(tree.removeClass("content", "active"), false);
  assert(tree.setText("label", "documents"));
  assertEquals(tree.node("label")?.text, "documents");
  assertEquals(tree.revision, 4);
});

Deno.test("live tree queries by selector with exclude and predicate filters", () => {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  assertEquals(tree.query(".pane").map((node) => node.id), ["sidebar", "content"]);
  assertEquals(tree.query(".pane", { exclude: ".active" }).map((node) => node.id), ["sidebar"]);
  assertEquals(tree.query("#sidebar span").map((node) => node.id), ["label"]);
  assertEquals(
    tree.query("div", { filter: (node) => node.children.length === 0 }).map((node) => node.id),
    ["content"],
  );
  assertEquals(tree.first("span")?.id, "label");
  // Queries do not mutate: the revision is untouched.
  assertEquals(tree.revision, 0);
});

Deno.test("live tree recompose is bounded and atomic; disposal is terminal", () => {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root, { maxNodes: 8 });
  assert(tree.recompose("sidebar", `<span id="a"></span><span id="b"></span>`));
  assertEquals(tree.node("label"), undefined);
  assertEquals(tree.node("sidebar")?.children.map((node) => node.id), ["a", "b"]);

  // Over the cap: rejected whole, tree untouched.
  const before = tree.nodeCount;
  assertEquals(tree.recompose("content", `<div><i></i><i></i><i></i><i></i><i></i></div>`), false);
  assertEquals(tree.nodeCount, before);
  assertEquals(tree.mount("content", `<div><i></i><i></i><i></i><i></i><i></i></div>`), []);

  tree.acknowledge(tree.revision);
  assertEquals(tree.mutations().entries, []);
  tree.dispose();
  assertThrows(() => tree.setText("content", "x"));
});
